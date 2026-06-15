import type { InsightGenerationProvider, InsightDraft } from "@dawn/ai";
import type {
  Actor,
  BusinessInsight,
  BusinessReport,
  Category,
  CsvTransactionColumnMapping,
  Customer,
  CustomerContact,
  InvoiceEvent,
  InvoiceDraft,
  InvoiceDraftInput,
  InvoiceLineDraft,
  InvoicePayment,
  RecurringInvoiceFrequency,
  RecurringInvoiceSchedule,
  LedgerAccount,
  LedgerTransactionDraft,
  Money,
  Permission,
  ReportTotals,
  Team,
  TeamMatchAlias,
  TeamInvite,
  TeamMember,
  TeamMembership,
  TeamRole,
  Transaction,
  Product,
  ProductType,
  Project,
  ProjectInput,
  ProjectMember,
  TimeEntry,
  TimeEntryInput,
  TimeEntryReport,
  ReportSourceRef,
  InboxMatchConfidence,
  InboxMatchSuggestion,
} from "@dawn/domain";
import type {
  BankingProvider,
  BankingProviderAccount,
  BankingProviderConnection,
  BankingProviderName,
  BankingProviderTransaction,
  InvoiceEmailDeliveryProvider,
} from "@dawn/integrations";
import type { DawnQueueMessage, OutboxEventForJob } from "@dawn/jobs";
import type { TransactionSyncResponse } from "@dawn/sync";
import {
  applyTransactionReview,
  assertCanEditInvoiceDraft,
  assertCanSendInvoice,
  assertInvoiceDraftInput,
  assertLedgerTransactionDraft,
  assertProjectInput,
  assertTimeEntryInput,
  createReportTotals,
  csvRowToLedgerDraft,
  invoiceStatusAfterPayment,
  ledgerDuplicateKey,
  markInvoiceSent,
  nextRecurringInvoiceRun,
  parseCsvTransactionRows,
  permissionsForRole,
  roleHasPermission,
  summarizeTimeEntries,
  suggestInboxTransactionMatches,
  timeEntryToInvoiceLine,
} from "@dawn/domain";
import { providerTransactionToLedgerDraft } from "@dawn/integrations";
import { dawnQueueNames, nextOutboxRetryAt, outboxEventToQueueMessages } from "@dawn/jobs";
import { buildTransactionSyncResponse } from "@dawn/sync";

export type AppErrorCode = "FORBIDDEN" | "NOT_FOUND" | "CONFLICT";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type TransactionReviewContext = {
  actor: Actor;
  requestId: string;
  teamId?: string;
};

export type ActorTeam = Team & {
  role: TeamRole;
};

export type ReviewWorkspace = {
  teamId: string;
  teamName: string;
  role: TeamRole;
  permissions: readonly Permission[];
  categories: Category[];
  transactions: Transaction[];
  sync: {
    collection: "transactions";
    cursor: string | null;
    conflictPolicy: "server_wins_for_financial_state";
  };
};

export type ReviewWorkspaceData = Omit<ReviewWorkspace, "role" | "permissions">;

export type ListTransactionSyncCommand = {
  teamId?: string;
  cursor?: string | null;
};

export type ReviewTransactionCommand = {
  teamId: string;
  transactionId: string;
  categoryId: string;
  idempotencyKey: string;
};

export type ReviewTransactionResult = {
  transaction: Transaction;
  replayed: boolean;
};

export type InviteTeamMemberCommand = {
  teamId: string;
  email: string;
  role: TeamRole;
  idempotencyKey: string;
};

export type InviteTeamMemberResult = {
  invite: TeamInvite;
  replayed: boolean;
};

export type AcceptTeamInviteCommand = {
  inviteId: string;
  idempotencyKey: string;
};

export type AcceptTeamInviteResult = {
  membership: TeamMembership;
  invite: TeamInvite;
  replayed: boolean;
};

export type UpdateTeamMemberRoleCommand = {
  teamId: string;
  userId: string;
  role: TeamRole;
  idempotencyKey: string;
};

export type UpdateTeamMemberRoleResult = {
  membership: TeamMember;
  replayed: boolean;
};

export type CreateLedgerTransactionCommand = LedgerTransactionDraft & {
  idempotencyKey: string;
};

export type CreateLedgerTransactionResult = {
  transaction: Transaction;
  replayed: boolean;
};

export type LedgerSummary = {
  teamId: string;
  accounts: LedgerAccount[];
  totals: ReportTotals;
  transactionCount: number;
};

export type CsvTransactionImportMapping = CsvTransactionColumnMapping & {
  categoryId?: string | null;
};

export type PreviewCsvTransactionImportCommand = {
  teamId: string;
  accountId: string;
  csvText: string;
  mapping: CsvTransactionImportMapping;
};

export type CommitCsvTransactionImportCommand = PreviewCsvTransactionImportCommand & {
  fileName?: string | null;
  idempotencyKey: string;
};

export type CsvTransactionImportPreviewRow = {
  rowNumber: number;
  values: Record<string, string>;
  status: "ready" | "duplicate" | "invalid";
  errors: string[];
  duplicateKey: string | null;
  draft: LedgerTransactionDraft | null;
};

export type CsvTransactionImportPreview = {
  teamId: string;
  accountId: string;
  rows: CsvTransactionImportPreviewRow[];
  totalRows: number;
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
};

export type TransactionImportSession = {
  id: string;
  teamId: string;
  accountId: string;
  source: "csv";
  fileName: string | null;
  status: "committed";
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
};

export type BankConnectionStatus = "connected" | "disconnected" | "error";

export type BankConnection = {
  id: string;
  teamId: string;
  provider: BankingProviderName;
  providerConnectionId: string;
  institutionName: string;
  status: BankConnectionStatus;
  lastSyncAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BankAccount = {
  id: string;
  teamId: string;
  connectionId: string;
  ledgerAccountId: string;
  providerAccountId: string;
  name: string;
  currency: string;
  type: LedgerAccount["type"];
  currentBalance: Money;
  status: "active" | "inactive";
};

export type ProviderSyncRunStatus = "running" | "completed" | "failed";

export type ProviderSyncRun = {
  id: string;
  teamId: string;
  connectionId: string;
  status: ProviderSyncRunStatus;
  startedAt: string;
  completedAt?: string | null;
  accountsSynced: number;
  transactionsImported: number;
  duplicateCount: number;
  error?: string | null;
};

export type BankConnectionSummary = {
  connection: BankConnection;
  accounts: BankAccount[];
  latestSyncRun?: ProviderSyncRun | null;
};

export type BusinessDocumentStatus = "uploading" | "uploaded";

export type BusinessDocumentVersionStatus = "pending_upload" | "uploaded";

export type BusinessDocumentVersion = {
  id: string;
  documentId: string;
  teamId: string;
  versionNumber: number;
  objectKey: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  checksumSha256?: string | null;
  status: BusinessDocumentVersionStatus;
  uploadedAt?: string | null;
  createdAt: string;
};

export type BusinessDocument = {
  id: string;
  teamId: string;
  title: string;
  status: BusinessDocumentStatus;
  currentVersionId?: string | null;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
  currentVersion?: BusinessDocumentVersion | null;
};

export type InboxSourceType = "document_upload" | "email_forward";

export type InboxSource = {
  id: string;
  teamId: string;
  type: InboxSourceType;
  name: string;
  createdAt: string;
};

export type InboxItemStatus = "pending_extraction" | "needs_review" | "resolved";

export type InboxItem = {
  id: string;
  teamId: string;
  sourceId: string;
  sourceType: InboxSourceType;
  documentId: string;
  documentVersionId: string;
  status: InboxItemStatus;
  extractionStatus: "pending" | "completed" | "failed";
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
  source?: InboxSource | null;
  document?: BusinessDocument | null;
  latestExtraction?: DocumentExtraction | null;
  matchSuggestions?: InboxTransactionMatchSuggestion[];
};

export type InboxTransactionMatchStatus = "suggested" | "accepted" | "rejected";

export type InboxTransactionMatchSuggestion = {
  id: string;
  teamId: string;
  inboxItemId: string;
  transactionId: string;
  score: number;
  confidence: InboxMatchConfidence;
  explanation: string[];
  status: InboxTransactionMatchStatus;
  createdAt: string;
  updatedAt: string;
  transaction?: Transaction | null;
};

export type TeamAlias = TeamMatchAlias & {
  id: string;
  teamId: string;
  createdAt: string;
};

export type HardNegativeTransactionMatch = {
  id: string;
  teamId: string;
  inboxItemId: string;
  transactionId: string;
  reason?: string | null;
  createdAt: string;
};

export type DocumentType =
  | "receipt"
  | "invoice_received"
  | "invoice_sent"
  | "bank_statement"
  | "contract"
  | "tax_document"
  | "other";

export type DocumentExtractionFields = {
  documentType?: DocumentType | null;
  merchantName?: string | null;
  customerName?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  invoiceNumber?: string | null;
  totalAmountMinor?: number | null;
  currency?: string | null;
  taxAmountMinor?: number | null;
};

export type DocumentExtractionConfidence = Partial<Record<keyof DocumentExtractionFields, number>>;

export type DocumentExtractionStatus = "completed" | "failed";

export type DocumentExtractionSource = "local_deterministic" | "user_correction";

export type DocumentExtraction = {
  id: string;
  teamId: string;
  inboxItemId: string;
  documentId: string;
  documentVersionId: string;
  extractionVersion: number;
  source: DocumentExtractionSource;
  status: DocumentExtractionStatus;
  fields: DocumentExtractionFields;
  confidence: DocumentExtractionConfidence;
  rawText?: string | null;
  error?: string | null;
  createdByActorId: string;
  createdAt: string;
};

export type RunDocumentExtractionCommand = {
  teamId: string;
  inboxItemId: string;
  documentId: string;
  versionId: string;
  rawText: string;
  idempotencyKey: string;
};

export type RunDocumentExtractionResult = {
  inboxItem: InboxItem;
  extraction: DocumentExtraction;
  replayed: boolean;
};

export type CorrectDocumentExtractionCommand = {
  teamId: string;
  inboxItemId: string;
  fields: DocumentExtractionFields;
  idempotencyKey: string;
};

export type CorrectDocumentExtractionResult = {
  inboxItem: InboxItem;
  extraction: DocumentExtraction;
  replayed: boolean;
};

export type GenerateInboxMatchSuggestionsCommand = {
  teamId: string;
  inboxItemId: string;
};

export type GenerateInboxMatchSuggestionsResult = {
  inboxItemId: string;
  suggestions: InboxTransactionMatchSuggestion[];
};

export type AcceptInboxMatchCommand = {
  teamId: string;
  suggestionId: string;
  idempotencyKey: string;
};

export type AcceptInboxMatchResult = {
  suggestion: InboxTransactionMatchSuggestion;
  inboxItem: InboxItem;
  replayed: boolean;
};

export type RejectInboxMatchCommand = {
  teamId: string;
  suggestionId: string;
  reason?: string | null;
  idempotencyKey: string;
};

export type RejectInboxMatchResult = {
  suggestion: InboxTransactionMatchSuggestion;
  replayed: boolean;
};

export type DocumentExtractionProvider = {
  source: Exclude<DocumentExtractionSource, "user_correction">;
  extract(input: { fileName: string; contentType: string; rawText: string }): Promise<{
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    rawText?: string | null;
  }>;
};

export type ConnectMockBankConnectionCommand = {
  teamId: string;
  idempotencyKey: string;
};

export type ConnectMockBankConnectionResult = {
  connection: BankConnection;
  replayed: boolean;
};

export type SyncBankConnectionCommand = {
  teamId: string;
  connectionId: string;
  idempotencyKey: string;
};

export type SyncBankConnectionResult = {
  connection: BankConnection;
  accounts: BankAccount[];
  syncRun: ProviderSyncRun;
  transactions: Transaction[];
  duplicateCount: number;
  replayed: boolean;
};

export type BillingWorkspace = {
  teamId: string;
  customers: Customer[];
  contacts: CustomerContact[];
  products: Product[];
  invoices: InvoiceDraft[];
  draftInvoices: InvoiceDraft[];
  payments: InvoicePayment[];
  recurringSchedules: RecurringInvoiceSchedule[];
};

export type CreateCustomerCommand = {
  teamId: string;
  name: string;
  email?: string | null;
  billingAddress?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactRole?: string | null;
  idempotencyKey: string;
};

export type CreateCustomerResult = {
  customer: Customer;
  contact?: CustomerContact | null;
  replayed: boolean;
};

export type CreateProductCommand = {
  teamId: string;
  name: string;
  type: ProductType;
  description?: string | null;
  unitPrice: Money;
  defaultTaxRateBasisPoints?: number | null;
  idempotencyKey: string;
};

export type CreateProductResult = {
  product: Product;
  replayed: boolean;
};

export type CreateDraftInvoiceCommand = InvoiceDraftInput & {
  idempotencyKey: string;
};

export type CreateDraftInvoiceResult = {
  invoice: InvoiceDraft;
  replayed: boolean;
};

export type UpdateDraftInvoiceCommand = InvoiceDraftInput & {
  invoiceId: string;
  idempotencyKey: string;
};

export type UpdateDraftInvoiceResult = {
  invoice: InvoiceDraft;
  replayed: boolean;
};

export type InvoicePdfDocument = {
  fileName: string;
  contentType: "application/pdf";
  bodyBase64: string;
  byteSize: number;
};

export type InvoicePdfRenderer = {
  render(input: {
    invoice: InvoiceDraft;
    customer: Customer;
    contact?: CustomerContact | null;
  }): Promise<InvoicePdfDocument>;
};

export type PreviewInvoicePdfCommand = {
  teamId: string;
  invoiceId: string;
};

export type PreviewInvoicePdfResult = {
  invoice: InvoiceDraft;
  pdf: InvoicePdfDocument;
};

export type SendInvoiceCommand = {
  teamId: string;
  invoiceId: string;
  toEmail?: string | null;
  subject?: string | null;
  message?: string | null;
  confirm: boolean;
  idempotencyKey: string;
};

export type SendInvoiceResult = {
  invoice: InvoiceDraft;
  providerMessageId: string;
  replayed: boolean;
};

export type RecordInvoicePaymentCommand = {
  teamId: string;
  invoiceId: string;
  amount: Money;
  paidAt: string;
  method?: string | null;
  note?: string | null;
  idempotencyKey: string;
};

export type RecordInvoicePaymentResult = {
  invoice: InvoiceDraft;
  payment: InvoicePayment;
  replayed: boolean;
};

export type CreateRecurringInvoiceScheduleCommand = {
  teamId: string;
  sourceInvoiceId: string;
  frequency: RecurringInvoiceFrequency;
  nextRunAt: string;
  idempotencyKey: string;
};

export type CreateRecurringInvoiceScheduleResult = {
  schedule: RecurringInvoiceSchedule;
  replayed: boolean;
};

export type GenerateRecurringInvoiceCommand = {
  teamId: string;
  scheduleId: string;
  runAt: string;
  idempotencyKey: string;
};

export type GenerateRecurringInvoiceResult = {
  invoice: InvoiceDraft;
  schedule: RecurringInvoiceSchedule;
  replayed: boolean;
};

export type ProjectWorkspace = {
  teamId: string;
  customers: Customer[];
  projects: Project[];
  projectMembers: ProjectMember[];
  timeEntries: TimeEntry[];
  report: TimeEntryReport;
};

export type CreateProjectCommand = ProjectInput & {
  idempotencyKey: string;
};

export type CreateProjectResult = {
  project: Project;
  member: ProjectMember;
  replayed: boolean;
};

export type CreateTimeEntryCommand = Omit<TimeEntryInput, "actorId"> & {
  actorId?: string | null;
  idempotencyKey: string;
};

export type CreateTimeEntryResult = {
  timeEntry: TimeEntry;
  replayed: boolean;
};

export type CreateInvoiceFromTimeEntriesCommand = {
  teamId: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string | null;
  timeEntryIds: string[];
  idempotencyKey: string;
};

export type CreateInvoiceFromTimeEntriesResult = {
  invoice: InvoiceDraft;
  timeEntries: TimeEntry[];
  replayed: boolean;
};

export type BusinessReportWorkspace = {
  teamId: string;
  report: BusinessReport;
  insights: BusinessInsight[];
};

export type ListBusinessReportCommand = {
  teamId?: string;
  from?: string | null;
  to?: string | null;
};

export type GenerateWeeklyInsightsCommand = {
  teamId: string;
  periodStart: string;
  periodEnd: string;
  idempotencyKey: string;
};

export type GenerateWeeklyInsightsResult = {
  insights: BusinessInsight[];
  replayed: boolean;
};

type NormalizedInvoiceDraftInput = Omit<InvoiceDraftInput, "discountBasisPoints" | "lines"> & {
  discountBasisPoints: number;
  lines: InvoiceLineDraft[];
};

export type CreateDocumentUploadCommand = {
  teamId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  checksumSha256?: string | null;
  idempotencyKey: string;
};

export type CreateDocumentUploadResult = {
  document: BusinessDocument;
  version: BusinessDocumentVersion;
  uploadUrl: string;
  uploadExpiresAt: string;
  replayed: boolean;
};

export type CompleteDocumentUploadCommand = {
  teamId: string;
  documentId: string;
  versionId: string;
  byteSize: number;
  checksumSha256?: string | null;
};

export type CompleteDocumentUploadResult = {
  document: BusinessDocument;
  version: BusinessDocumentVersion;
  inboxItem: InboxItem;
};

export type CreateDocumentDownloadCommand = {
  teamId: string;
  documentId: string;
};

export type CreateDocumentDownloadResult = {
  document: BusinessDocument;
  version: BusinessDocumentVersion;
  downloadUrl: string;
  downloadExpiresAt: string;
};

export type DocumentUrlSigner = {
  createUploadUrl(input: {
    teamId: string;
    documentId: string;
    versionId: string;
    objectKey: string;
    fileName: string;
    contentType: string;
    byteSize: number;
    actorId: string;
    requestId: string;
  }): Promise<{ url: string; expiresAt: string }>;
  createDownloadUrl(input: {
    teamId: string;
    documentId: string;
    versionId: string;
    objectKey: string;
    fileName: string;
    contentType: string;
  }): Promise<{ url: string; expiresAt: string }>;
};

export type OutboxEventStatus = "pending" | "dispatching" | "dispatched" | "failed";

export type OutboxEvent = OutboxEventForJob & {
  status: OutboxEventStatus;
  occurredAt: string;
  processedAt?: string | null;
  lastError?: string | null;
  nextAttemptAt?: string | null;
};

export type JobRunStatus = "queued" | "failed";

export type JobRun = {
  id: string;
  teamId: string;
  outboxEventId: string;
  jobType: DawnQueueMessage["type"];
  queueName: string;
  status: JobRunStatus;
  attempt: number;
  idempotencyKey: string;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DispatchOutboxCommand = {
  limit?: number;
  now?: Date;
};

export type DispatchOutboxResult = {
  scanned: number;
  dispatched: number;
  failed: number;
  skipped: number;
  queuedMessages: number;
};

export type OutboxQueuePublisher = {
  publish(message: DawnQueueMessage): Promise<void>;
};

export type CommitCsvTransactionImportResult = {
  importSession: TransactionImportSession;
  transactions: Transaction[];
  preview: CsvTransactionImportPreview;
  replayed: boolean;
};

export type BankingRepository = {
  listBankConnectionSummaries(teamId: string): Promise<BankConnectionSummary[]>;
  getBankConnectionForTeam(teamId: string, connectionId: string): Promise<BankConnection | null>;
  upsertBankConnection(input: {
    teamId: string;
    providerConnection: BankingProviderConnection;
  }): Promise<BankConnection>;
  upsertBankAccount(input: {
    teamId: string;
    connectionId: string;
    providerAccount: BankingProviderAccount;
  }): Promise<BankAccount>;
  getTransactionByProviderTransactionId(
    teamId: string,
    providerTransactionId: string,
  ): Promise<Transaction | null>;
  createProviderSyncRun(input: { teamId: string; connectionId: string }): Promise<ProviderSyncRun>;
  finishProviderSyncRun(input: {
    syncRunId: string;
    status: Exclude<ProviderSyncRunStatus, "running">;
    accountsSynced: number;
    transactionsImported: number;
    duplicateCount: number;
    error?: string | null;
  }): Promise<ProviderSyncRun>;
  markBankConnectionSynced(input: {
    connectionId: string;
    syncedAt: Date;
    status: BankConnectionStatus;
  }): Promise<BankConnection>;
  upsertProviderObject(input: {
    teamId: string;
    provider: BankingProviderName;
    providerObjectType: "connection" | "account" | "transaction";
    providerObjectId: string;
    connectionId?: string | null;
    bankAccountId?: string | null;
    internalEntityType?: string | null;
    internalEntityId?: string | null;
    rawPayload: Record<string, unknown>;
  }): Promise<void>;
};

export type BankingUseCaseRepository = TransactionReviewRepository & BankingRepository;

export type DocumentRepository = {
  listDocuments(teamId: string): Promise<BusinessDocument[]>;
  createDocumentUploadRecord(input: {
    documentId: string;
    versionId: string;
    teamId: string;
    title: string;
    objectKey: string;
    fileName: string;
    contentType: string;
    byteSize: number;
    checksumSha256?: string | null;
    createdByActorId: string;
  }): Promise<{ document: BusinessDocument; version: BusinessDocumentVersion }>;
  getDocumentForTeam(teamId: string, documentId: string): Promise<BusinessDocument | null>;
  getDocumentVersionForTeam(
    teamId: string,
    versionId: string,
  ): Promise<BusinessDocumentVersion | null>;
  completeDocumentVersionUpload(input: {
    teamId: string;
    documentId: string;
    versionId: string;
    byteSize: number;
    checksumSha256?: string | null;
    uploadedAt: Date;
  }): Promise<{ document: BusinessDocument; version: BusinessDocumentVersion }>;
};

export type InboxRepository = {
  listInboxItems(teamId: string): Promise<InboxItem[]>;
  createInboxItemForDocumentUpload(input: {
    inboxItemId: string;
    sourceId: string;
    teamId: string;
    documentId: string;
    documentVersionId: string;
    createdByActorId: string;
  }): Promise<InboxItem>;
  ensureInboxSource(input: {
    sourceId: string;
    teamId: string;
    type: InboxSourceType;
    name: string;
  }): Promise<InboxSource>;
  getInboxItemForTeam(teamId: string, inboxItemId: string): Promise<InboxItem | null>;
  createDocumentExtraction(input: {
    extractionId: string;
    teamId: string;
    inboxItemId: string;
    documentId: string;
    documentVersionId: string;
    source: Exclude<DocumentExtractionSource, "user_correction">;
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    rawText?: string | null;
    createdByActorId: string;
  }): Promise<{ inboxItem: InboxItem; extraction: DocumentExtraction }>;
  createCorrectedDocumentExtraction(input: {
    extractionId: string;
    teamId: string;
    inboxItemId: string;
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    createdByActorId: string;
  }): Promise<{ inboxItem: InboxItem; extraction: DocumentExtraction }>;
  markDocumentExtractionFailed(input: {
    teamId: string;
    inboxItemId: string;
    error: string;
    failedAt: Date;
  }): Promise<InboxItem>;
  listTeamAliases(teamId: string): Promise<TeamAlias[]>;
  listHardNegativeMatches(
    teamId: string,
    inboxItemId: string,
  ): Promise<HardNegativeTransactionMatch[]>;
  upsertInboxMatchSuggestions(input: {
    teamId: string;
    inboxItemId: string;
    suggestions: InboxMatchSuggestion[];
  }): Promise<InboxTransactionMatchSuggestion[]>;
  getInboxMatchSuggestionForTeam(
    teamId: string,
    suggestionId: string,
  ): Promise<InboxTransactionMatchSuggestion | null>;
  acceptInboxMatchSuggestion(input: {
    teamId: string;
    suggestionId: string;
    actorId: string;
  }): Promise<{ suggestion: InboxTransactionMatchSuggestion; inboxItem: InboxItem }>;
  rejectInboxMatchSuggestion(input: {
    teamId: string;
    suggestionId: string;
    reason?: string | null;
    actorId: string;
  }): Promise<InboxTransactionMatchSuggestion>;
};

export type BillingRepository = {
  listCustomers(teamId: string): Promise<Customer[]>;
  listCustomerContacts(teamId: string): Promise<CustomerContact[]>;
  listProducts(teamId: string): Promise<Product[]>;
  listInvoices(teamId: string): Promise<InvoiceDraft[]>;
  listDraftInvoices(teamId: string): Promise<InvoiceDraft[]>;
  listInvoicePayments(teamId: string): Promise<InvoicePayment[]>;
  listRecurringInvoiceSchedules(teamId: string): Promise<RecurringInvoiceSchedule[]>;
  getCustomerForTeam(teamId: string, customerId: string): Promise<Customer | null>;
  getCustomerContactForCustomer(
    teamId: string,
    customerId: string,
  ): Promise<CustomerContact | null>;
  getProductForTeam(teamId: string, productId: string): Promise<Product | null>;
  getInvoiceForTeam(teamId: string, invoiceId: string): Promise<InvoiceDraft | null>;
  getRecurringInvoiceScheduleForTeam(
    teamId: string,
    scheduleId: string,
  ): Promise<RecurringInvoiceSchedule | null>;
  createCustomer(input: {
    customerId: string;
    contactId?: string | null;
    teamId: string;
    name: string;
    email?: string | null;
    billingAddress?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactRole?: string | null;
    createdByActorId: string;
  }): Promise<{ customer: Customer; contact?: CustomerContact | null }>;
  createProduct(input: {
    productId: string;
    teamId: string;
    name: string;
    type: ProductType;
    description?: string | null;
    unitPrice: Money;
    defaultTaxRateBasisPoints: number;
    createdByActorId: string;
  }): Promise<Product>;
  createDraftInvoice(input: {
    invoiceId: string;
    teamId: string;
    customerId: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate?: string | null;
    currency: string;
    discountBasisPoints: number;
    notes?: string | null;
    lines: InvoiceLineDraft[];
    createdByActorId: string;
  }): Promise<InvoiceDraft>;
  updateDraftInvoice(input: {
    teamId: string;
    invoiceId: string;
    customerId: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate?: string | null;
    currency: string;
    discountBasisPoints: number;
    notes?: string | null;
    lines: InvoiceLineDraft[];
  }): Promise<InvoiceDraft>;
  markInvoiceSent(input: {
    teamId: string;
    invoiceId: string;
    sentAt: string;
    toEmail: string;
    providerMessageId: string;
  }): Promise<InvoiceDraft>;
  recordInvoicePayment(input: {
    paymentId: string;
    teamId: string;
    invoiceId: string;
    amount: Money;
    paidAt: string;
    method?: string | null;
    note?: string | null;
    createdByActorId: string;
    nextInvoiceStatus: InvoiceDraft["status"];
    nextAmountPaid: Money;
    invoicePaidAt?: string | null;
  }): Promise<{ invoice: InvoiceDraft; payment: InvoicePayment }>;
  createInvoiceEvent(input: {
    eventId: string;
    teamId: string;
    invoiceId: string;
    type: InvoiceEvent["type"];
    occurredAt: string;
    actorId?: string | null;
    metadata: Record<string, unknown>;
  }): Promise<InvoiceEvent>;
  createRecurringInvoiceSchedule(input: {
    scheduleId: string;
    teamId: string;
    sourceInvoiceId: string;
    customerId: string;
    frequency: RecurringInvoiceFrequency;
    nextRunAt: string;
    createdByActorId: string;
  }): Promise<RecurringInvoiceSchedule>;
  generateRecurringInvoice(input: {
    invoiceId: string;
    teamId: string;
    scheduleId: string;
    sourceInvoice: InvoiceDraft;
    runAt: string;
    nextRunAt: string;
    createdByActorId: string;
  }): Promise<{ invoice: InvoiceDraft; schedule: RecurringInvoiceSchedule }>;
};

export type DawnRepository = BankingUseCaseRepository &
  DocumentRepository &
  InboxRepository &
  BillingRepository &
  ProjectRepository &
  ReportingRepository;

export type ProjectRepository = {
  listProjects(teamId: string): Promise<Project[]>;
  listProjectMembers(teamId: string): Promise<ProjectMember[]>;
  listTimeEntries(teamId: string): Promise<TimeEntry[]>;
  getProjectForTeam(teamId: string, projectId: string): Promise<Project | null>;
  getTimeEntriesForTeam(teamId: string, timeEntryIds: string[]): Promise<TimeEntry[]>;
  createProject(input: {
    projectId: string;
    memberId: string;
    teamId: string;
    customerId: string;
    name: string;
    description?: string | null;
    billableRate: Money;
    createdByActorId: string;
  }): Promise<{ project: Project; member: ProjectMember }>;
  createTimeEntry(input: {
    timeEntryId: string;
    teamId: string;
    projectId: string;
    actorId: string;
    description: string;
    occurredOn: string;
    durationMinutes: number;
    billableStatus: TimeEntry["billableStatus"];
    billableRate?: Money | null;
  }): Promise<TimeEntry>;
  markTimeEntriesInvoiced(input: {
    teamId: string;
    timeEntryIds: string[];
    invoiceId: string;
  }): Promise<TimeEntry[]>;
};

export type ReportingRepository = {
  listBusinessInsights(input: {
    teamId: string;
    from?: string | null;
    to?: string | null;
  }): Promise<BusinessInsight[]>;
  createBusinessInsights(input: {
    teamId: string;
    periodStart: string;
    periodEnd: string;
    insights: Array<
      InsightDraft & {
        insightId: string;
        createdAt: string;
      }
    >;
  }): Promise<BusinessInsight[]>;
};

export type OutboxDispatchRepository = {
  withTransaction<T>(callback: (repository: OutboxDispatchRepository) => Promise<T>): Promise<T>;
  listDispatchableOutboxEvents(input: { limit: number; now: Date }): Promise<OutboxEvent[]>;
  claimOutboxEventForDispatch(input: {
    outboxEventId: string;
    now: Date;
  }): Promise<OutboxEvent | null>;
  createJobRun(input: {
    teamId: string;
    outboxEventId: string;
    jobType: DawnQueueMessage["type"];
    queueName: string;
    status: JobRunStatus;
    attempt: number;
    idempotencyKey: string;
    error?: string | null;
  }): Promise<JobRun>;
  markOutboxEventDispatched(input: { outboxEventId: string; now: Date }): Promise<void>;
  markOutboxEventDispatchFailed(input: {
    outboxEventId: string;
    error: string;
    nextAttemptAt: Date;
  }): Promise<void>;
};

export type IdempotencyResult<T> = {
  fingerprint: string;
  result: T;
};

export type ResolvedTeamAccess = {
  teamId: string;
  role: TeamRole;
  permissions: readonly Permission[];
};

export type TeamDirectory = {
  teamId: string;
  members: TeamMember[];
  pendingInvites: TeamInvite[];
};

export type TransactionReviewRepository = {
  withTransaction<T>(callback: (repository: TransactionReviewRepository) => Promise<T>): Promise<T>;
  ensureDefaultWorkspace(actor: Actor): Promise<{ teamId: string }>;
  listActorTeams(actor: Actor): Promise<ActorTeam[]>;
  createTeam(input: { actor: Actor; name: string }): Promise<ActorTeam>;
  listWorkspace(actor: Actor, teamId: string): Promise<ReviewWorkspaceData>;
  getMembership(actor: Actor, teamId: string): Promise<{ role: TeamRole } | null>;
  getTransactionForTeam(teamId: string, transactionId: string): Promise<Transaction | null>;
  getCategoryForTeam(teamId: string, categoryId: string): Promise<Category | null>;
  listLedgerAccounts(teamId: string): Promise<LedgerAccount[]>;
  getLedgerAccountForTeam(teamId: string, accountId: string): Promise<LedgerAccount | null>;
  getTransactionByDuplicateKey(teamId: string, duplicateKey: string): Promise<Transaction | null>;
  listTransactionsForReport(input: {
    teamId: string;
    accountId?: string;
    from?: string;
    to?: string;
  }): Promise<Transaction[]>;
  listTransactionsForSync(input: {
    teamId: string;
    cursor?: string | null;
  }): Promise<Transaction[]>;
  createLedgerTransactionForTeam(input: {
    draft: LedgerTransactionDraft;
    duplicateKey: string;
  }): Promise<Transaction>;
  createTransactionImportSession(input: {
    teamId: string;
    accountId: string;
    actorId: string;
    fileName?: string | null;
    mapping: CsvTransactionImportMapping;
    rowCount: number;
    importedCount: number;
    duplicateCount: number;
    invalidCount: number;
  }): Promise<TransactionImportSession>;
  getIdempotencyResult(
    teamId: string,
    actorId: string,
    operation: string,
    key: string,
  ): Promise<IdempotencyResult<unknown> | null>;
  updateTransactionReviewForTeam(input: {
    teamId: string;
    transactionId: string;
    categoryId: string;
    reviewState: Transaction["reviewState"];
  }): Promise<Transaction>;
  appendAuditEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  appendOutboxEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    type: string;
    version: number;
    payload: Record<string, unknown>;
  }): Promise<void>;
  saveIdempotencyResult(input: {
    teamId: string;
    actorId: string;
    operation: string;
    key: string;
    fingerprint: string;
    result: unknown;
  }): Promise<void>;
  createTeamInvite(input: {
    teamId: string;
    email: string;
    role: TeamRole;
    invitedByActorId: string;
    expiresAt: Date;
  }): Promise<TeamInvite>;
  listTeamMembers(teamId: string): Promise<TeamMember[]>;
  listPendingTeamInvites(teamId: string): Promise<TeamInvite[]>;
  getTeamInvite(inviteId: string): Promise<TeamInvite | null>;
  addTeamMembership(input: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }): Promise<TeamMembership>;
  markTeamInviteAccepted(input: { inviteId: string; acceptedAt: Date }): Promise<TeamInvite>;
  getTeamMemberByUserId(teamId: string, userId: string): Promise<TeamMember | null>;
  updateTeamMemberRole(input: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }): Promise<TeamMember>;
};

const reviewTransactionOperation = "transaction.review";
const createLedgerTransactionOperation = "ledger.transaction.create";
const commitCsvTransactionImportOperation = "csv_transaction_import.commit";
const connectMockBankConnectionOperation = "banking.connection.mock.connect";
const syncBankConnectionOperation = "banking.connection.sync";
const createDocumentUploadOperation = "document.upload.create";
const runDocumentExtractionOperation = "document.extraction.run";
const correctDocumentExtractionOperation = "document.extraction.correct";
const acceptInboxMatchOperation = "inbox.match.accept";
const rejectInboxMatchOperation = "inbox.match.reject";
const createCustomerOperation = "customer.create";
const createProductOperation = "product.create";
const createDraftInvoiceOperation = "invoice.draft.create";
const updateDraftInvoiceOperation = "invoice.draft.update";
const sendInvoiceOperation = "invoice.send";
const recordInvoicePaymentOperation = "invoice.payment.record";
const createRecurringInvoiceScheduleOperation = "invoice.recurring.create";
const generateRecurringInvoiceOperation = "invoice.recurring.generate";
const createProjectOperation = "project.create";
const createTimeEntryOperation = "time_entry.create";
const createInvoiceFromTimeEntriesOperation = "time_entry.invoice.create";
const generateWeeklyInsightsOperation = "insights.weekly.generate";
const inviteTeamMemberOperation = "team.invite";
const acceptTeamInviteOperation = "team.invite.accept";
const updateTeamMemberRoleOperation = "team.member.role.update";

export async function dispatchOutboxEvents(
  repository: OutboxDispatchRepository,
  publisher: OutboxQueuePublisher,
  command: DispatchOutboxCommand = {},
): Promise<DispatchOutboxResult> {
  const now = command.now ?? new Date();
  const events = await repository.listDispatchableOutboxEvents({
    limit: command.limit ?? 25,
    now,
  });
  const result: DispatchOutboxResult = {
    scanned: events.length,
    dispatched: 0,
    failed: 0,
    skipped: 0,
    queuedMessages: 0,
  };

  for (const event of events) {
    const claimed = await repository.claimOutboxEventForDispatch({
      outboxEventId: event.id,
      now,
    });

    if (!claimed) {
      result.skipped += 1;
      continue;
    }

    try {
      const messages = outboxEventToQueueMessages(event);

      for (const message of messages) {
        await publisher.publish(message);
        await repository.createJobRun({
          teamId: event.teamId,
          outboxEventId: event.id,
          jobType: message.type,
          queueName: dawnQueueNames.jobs,
          status: "queued",
          attempt: event.dispatchAttempts + 1,
          idempotencyKey: message.idempotencyKey,
          error: null,
        });
        result.queuedMessages += 1;
      }

      await repository.markOutboxEventDispatched({ outboxEventId: event.id, now });
      result.dispatched += 1;
    } catch (error) {
      const message = errorMessage(error);
      const attempt = event.dispatchAttempts + 1;
      const nextAttemptAt = nextOutboxRetryAt({ attempt, now });

      await repository.createJobRun({
        teamId: event.teamId,
        outboxEventId: event.id,
        jobType: "outbox.dispatch",
        queueName: dawnQueueNames.jobs,
        status: "failed",
        attempt,
        idempotencyKey: `outbox:${event.id}:failed:${attempt}`,
        error: message,
      });
      await repository.markOutboxEventDispatchFailed({
        outboxEventId: event.id,
        error: message,
        nextAttemptAt,
      });
      result.failed += 1;
    }
  }

  return result;
}

export async function listTeams(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
): Promise<{ teams: ActorTeam[]; currentTeamId: string; currentRole: TeamRole }> {
  const { teamId } = await repository.ensureDefaultWorkspace(context.actor);
  const teams = await repository.listActorTeams(context.actor);
  const requestedTeamId = context.teamId ?? teamId;
  const currentTeam = teams.find((team) => team.id === requestedTeamId) ?? teams[0];

  if (!currentTeam) {
    throw new AppError("FORBIDDEN", "You do not belong to any team");
  }

  return { teams, currentTeamId: currentTeam.id, currentRole: currentTeam.role };
}

export async function createTeam(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: { name: string },
): Promise<ActorTeam> {
  const name = command.name.trim();

  if (!name) {
    throw new AppError("CONFLICT", "Team name is required");
  }

  return repository.createTeam({ actor: context.actor, name });
}

export async function listTransactionReviewWorkspace(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
): Promise<ReviewWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    context,
    "transactions.read",
    "You cannot read transactions for this team",
  );
  const workspace = await repository.listWorkspace(context.actor, access.teamId);

  return {
    ...workspace,
    role: access.role,
    permissions: access.permissions,
  };
}

export async function listTransactionSyncCollection(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: ListTransactionSyncCommand = {},
): Promise<TransactionSyncResponse> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId ?? context.teamId },
    "transactions.read",
    "You cannot sync transactions for this team",
  );
  const transactions = await repository.listTransactionsForSync({
    teamId: access.teamId,
    cursor: command.cursor ?? null,
  });

  return buildTransactionSyncResponse({
    teamId: access.teamId,
    transactions,
  });
}

export async function reviewTransaction(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: ReviewTransactionCommand,
): Promise<ReviewTransactionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    assertCommandTeamMatchesContext(context, command.teamId, "Transaction not found");

    await resolveTeamAccess(
      transactionRepository,
      { ...context, teamId: command.teamId },
      "transactions.categorize",
      "You cannot review transactions for this team",
    );

    const fingerprint = transactionReviewFingerprint(command);

    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      reviewTransactionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different review");
      }

      return { ...(replayed.result as ReviewTransactionResult), replayed: true };
    }

    const transaction = await transactionRepository.getTransactionForTeam(
      command.teamId,
      command.transactionId,
    );

    if (!transaction) {
      throw new AppError("NOT_FOUND", "Transaction not found");
    }

    const category = await transactionRepository.getCategoryForTeam(
      command.teamId,
      command.categoryId,
    );

    if (!category) {
      throw new AppError("NOT_FOUND", "Category not found");
    }

    const reviewChange = applyTransactionReview(transaction, category);

    const updatedTransaction = await transactionRepository.updateTransactionReviewForTeam({
      teamId: command.teamId,
      transactionId: transaction.id,
      categoryId: reviewChange.transaction.categoryId ?? category.id,
      reviewState: reviewChange.transaction.reviewState,
    });

    await transactionRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "transaction.reviewed",
      entityType: "transaction",
      entityId: transaction.id,
      metadata: reviewChange.auditMetadata,
    });

    await transactionRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "transaction.reviewed",
      version: 1,
      payload: reviewChange.outboxPayload,
    });

    const result = { transaction: updatedTransaction, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: reviewTransactionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export function transactionReviewFingerprint(command: ReviewTransactionCommand) {
  return JSON.stringify({
    teamId: command.teamId,
    transactionId: command.transactionId,
    categoryId: command.categoryId,
  });
}

export async function listLedgerSummary(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  input: { teamId?: string; accountId?: string; from?: string; to?: string } = {},
): Promise<LedgerSummary> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "transactions.read",
    "You cannot read ledger data for this team",
  );
  const [accounts, transactions] = await Promise.all([
    repository.listLedgerAccounts(access.teamId),
    repository.listTransactionsForReport({
      teamId: access.teamId,
      accountId: input.accountId,
      from: input.from,
      to: input.to,
    }),
  ]);
  const currency =
    accounts.find((account) => account.id === input.accountId)?.currency ??
    accounts[0]?.currency ??
    transactions[0]?.money.currency ??
    "USD";

  return {
    teamId: access.teamId,
    accounts,
    totals: createReportTotals(transactions, currency),
    transactionCount: transactions.length,
  };
}

export async function createLedgerTransaction(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: CreateLedgerTransactionCommand,
): Promise<CreateLedgerTransactionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    assertCommandTeamMatchesContext(context, command.teamId, "Ledger transaction not found");

    await resolveTeamAccess(
      transactionRepository,
      { ...context, teamId: command.teamId },
      "transactions.write",
      "You cannot create ledger transactions for this team",
    );

    const draft = normalizeLedgerTransactionDraft(command);
    const fingerprint = createLedgerTransactionFingerprint(command);
    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createLedgerTransactionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different ledger transaction",
        );
      }

      return { ...(replayed.result as CreateLedgerTransactionResult), replayed: true };
    }

    const account = await transactionRepository.getLedgerAccountForTeam(
      draft.teamId,
      draft.accountId,
    );

    if (!account) {
      throw new AppError("NOT_FOUND", "Ledger account not found");
    }

    if (account.currency !== draft.money.currency) {
      throw new AppError("CONFLICT", "Ledger transaction currency must match the account");
    }

    if (draft.categoryId) {
      const category = await transactionRepository.getCategoryForTeam(
        draft.teamId,
        draft.categoryId,
      );

      if (!category) {
        throw new AppError("NOT_FOUND", "Category not found");
      }
    }

    const duplicateKey = ledgerDuplicateKey(draft);
    const duplicate = await transactionRepository.getTransactionByDuplicateKey(
      draft.teamId,
      duplicateKey,
    );

    if (duplicate) {
      throw new AppError("CONFLICT", "Ledger transaction duplicate key already exists");
    }

    const transaction = await transactionRepository.createLedgerTransactionForTeam({
      draft,
      duplicateKey,
    });

    await transactionRepository.appendAuditEvent({
      teamId: draft.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "transaction.created",
      entityType: "transaction",
      entityId: transaction.id,
      metadata: {
        accountId: draft.accountId,
        duplicateKey,
        source: draft.source,
        type: draft.type,
      },
    });

    await transactionRepository.appendOutboxEvent({
      teamId: draft.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "transaction.created",
      version: 1,
      payload: {
        transactionId: transaction.id,
        accountId: draft.accountId,
        duplicateKey,
      },
    });

    const result = { transaction, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: draft.teamId,
      actorId: context.actor.id,
      operation: createLedgerTransactionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export function createLedgerTransactionFingerprint(command: CreateLedgerTransactionCommand) {
  const draft = normalizeLedgerTransactionDraft(command);

  return JSON.stringify({
    teamId: draft.teamId,
    accountId: draft.accountId,
    description: draft.description,
    postedAt: draft.postedAt,
    money: draft.money,
    type: draft.type,
    source: draft.source,
    categoryId: draft.categoryId ?? null,
    counterpartyId: draft.counterpartyId ?? null,
    providerTransactionId: draft.providerTransactionId ?? null,
    splits: draft.splits ?? [],
    tagIds: draft.tagIds ?? [],
  });
}

export async function listBankConnections(
  repository: BankingUseCaseRepository,
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<{ teamId: string; connections: BankConnectionSummary[] }> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "transactions.read",
    "You cannot read bank connections for this team",
  );

  return {
    teamId: access.teamId,
    connections: await repository.listBankConnectionSummaries(access.teamId),
  };
}

export async function connectMockBankConnection(
  repository: BankingUseCaseRepository,
  provider: BankingProvider,
  context: TransactionReviewContext,
  command: ConnectMockBankConnectionCommand,
): Promise<ConnectMockBankConnectionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const bankingRepository = transactionRepository as BankingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Bank connection not found");

    await resolveTeamAccess(
      bankingRepository,
      { ...context, teamId: command.teamId },
      "bank_connections.manage",
      "You cannot connect bank providers for this team",
    );

    const fingerprint = connectMockBankConnectionFingerprint(command, provider.provider);
    const replayed = await bankingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      connectMockBankConnectionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different bank connection",
        );
      }

      return { ...(replayed.result as ConnectMockBankConnectionResult), replayed: true };
    }

    const providerConnection = await provider.createConnection({
      teamId: command.teamId,
      actorId: context.actor.id,
    });
    const connection = await bankingRepository.upsertBankConnection({
      teamId: command.teamId,
      providerConnection,
    });

    await bankingRepository.upsertProviderObject({
      teamId: command.teamId,
      provider: provider.provider,
      providerObjectType: "connection",
      providerObjectId: providerConnection.providerConnectionId,
      connectionId: connection.id,
      internalEntityType: "bank_connection",
      internalEntityId: connection.id,
      rawPayload: providerConnection.rawPayload,
    });

    await bankingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "bank_connection.connected",
      entityType: "bank_connection",
      entityId: connection.id,
      metadata: {
        provider: provider.provider,
        providerConnectionId: providerConnection.providerConnectionId,
      },
    });

    await bankingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "bank_connection.connected",
      version: 1,
      payload: {
        connectionId: connection.id,
        provider: provider.provider,
      },
    });

    const result = { connection, replayed: false };

    await bankingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: connectMockBankConnectionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function syncBankConnection(
  repository: BankingUseCaseRepository,
  provider: BankingProvider,
  context: TransactionReviewContext,
  command: SyncBankConnectionCommand,
): Promise<SyncBankConnectionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const bankingRepository = transactionRepository as BankingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Bank connection not found");

    await resolveTeamAccess(
      bankingRepository,
      { ...context, teamId: command.teamId },
      "bank_connections.manage",
      "You cannot sync bank providers for this team",
    );

    const fingerprint = syncBankConnectionFingerprint(command, provider.provider);
    const replayed = await bankingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      syncBankConnectionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different bank sync",
        );
      }

      return { ...(replayed.result as SyncBankConnectionResult), replayed: true };
    }

    const connection = await bankingRepository.getBankConnectionForTeam(
      command.teamId,
      command.connectionId,
    );

    if (!connection || connection.provider !== provider.provider) {
      throw new AppError("NOT_FOUND", "Bank connection not found");
    }

    const providerConnection = persistedProviderConnection(connection);
    const providerAccounts = await provider.listAccounts(providerConnection);
    const syncRun = await bankingRepository.createProviderSyncRun({
      teamId: command.teamId,
      connectionId: connection.id,
    });
    const accounts: BankAccount[] = [];
    const transactions: Transaction[] = [];
    let duplicateCount = 0;

    for (const providerAccount of providerAccounts) {
      const account = await bankingRepository.upsertBankAccount({
        teamId: command.teamId,
        connectionId: connection.id,
        providerAccount,
      });
      accounts.push(account);

      await bankingRepository.upsertProviderObject({
        teamId: command.teamId,
        provider: provider.provider,
        providerObjectType: "account",
        providerObjectId: providerAccount.providerAccountId,
        connectionId: connection.id,
        bankAccountId: account.id,
        internalEntityType: "bank_account",
        internalEntityId: account.id,
        rawPayload: providerAccount.rawPayload,
      });

      const providerTransactions = await provider.syncAccount({
        connection: providerConnection,
        account: providerAccount,
      });

      for (const providerTransaction of providerTransactions) {
        const transaction = await importProviderTransaction({
          repository: bankingRepository,
          provider,
          connection,
          bankAccount: account,
          providerTransaction,
        });

        if (transaction) {
          transactions.push(transaction);
        } else {
          duplicateCount += 1;
        }
      }
    }

    const completedSyncRun = await bankingRepository.finishProviderSyncRun({
      syncRunId: syncRun.id,
      status: "completed",
      accountsSynced: accounts.length,
      transactionsImported: transactions.length,
      duplicateCount,
      error: null,
    });
    const syncedConnection = await bankingRepository.markBankConnectionSynced({
      connectionId: connection.id,
      syncedAt: new Date(completedSyncRun.completedAt ?? completedSyncRun.startedAt),
      status: "connected",
    });

    await bankingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "bank_connection.synced",
      entityType: "bank_connection",
      entityId: connection.id,
      metadata: {
        provider: provider.provider,
        accountsSynced: accounts.length,
        transactionsImported: transactions.length,
        duplicateCount,
      },
    });

    await bankingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "bank_connection.synced",
      version: 1,
      payload: {
        connectionId: connection.id,
        transactionIds: transactions.map((transaction) => transaction.id),
      },
    });

    const result = {
      connection: syncedConnection,
      accounts,
      syncRun: completedSyncRun,
      transactions,
      duplicateCount,
      replayed: false,
    };

    await bankingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: syncBankConnectionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function listDocuments(
  repository: DawnRepository,
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<{ teamId: string; documents: BusinessDocument[] }> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "documents.read",
    "You cannot read documents for this team",
  );

  return {
    teamId: access.teamId,
    documents: await repository.listDocuments(access.teamId),
  };
}

export async function createDocumentUpload(
  repository: DawnRepository,
  signer: DocumentUrlSigner,
  context: TransactionReviewContext,
  command: CreateDocumentUploadCommand,
): Promise<CreateDocumentUploadResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const documentRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Document not found");

    await resolveTeamAccess(
      documentRepository,
      { ...context, teamId: command.teamId },
      "documents.write",
      "You cannot upload documents for this team",
    );

    const normalized = normalizeDocumentUploadCommand(command);
    const fingerprint = createDocumentUploadFingerprint(normalized);
    const replayed = await documentRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createDocumentUploadOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different document upload",
        );
      }

      return { ...(replayed.result as CreateDocumentUploadResult), replayed: true };
    }

    const documentId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const objectKey = documentObjectKey(command.teamId, documentId, versionId, normalized.fileName);
    const { document, version } = await documentRepository.createDocumentUploadRecord({
      documentId,
      versionId,
      teamId: command.teamId,
      title: titleFromFileName(normalized.fileName),
      objectKey,
      fileName: normalized.fileName,
      contentType: normalized.contentType,
      byteSize: normalized.byteSize,
      checksumSha256: normalized.checksumSha256,
      createdByActorId: context.actor.id,
    });
    const upload = await signer.createUploadUrl({
      teamId: command.teamId,
      documentId,
      versionId,
      objectKey,
      fileName: normalized.fileName,
      contentType: normalized.contentType,
      byteSize: normalized.byteSize,
      actorId: context.actor.id,
      requestId: context.requestId,
    });
    const result = {
      document,
      version,
      uploadUrl: upload.url,
      uploadExpiresAt: upload.expiresAt,
      replayed: false,
    };

    await documentRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createDocumentUploadOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function completeDocumentUpload(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: CompleteDocumentUploadCommand,
): Promise<CompleteDocumentUploadResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const documentRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Document not found");

    const version = await documentRepository.getDocumentVersionForTeam(
      command.teamId,
      command.versionId,
    );

    if (!version || version.documentId !== command.documentId) {
      throw new AppError("NOT_FOUND", "Document upload not found");
    }

    const result = await documentRepository.completeDocumentVersionUpload({
      teamId: command.teamId,
      documentId: command.documentId,
      versionId: command.versionId,
      byteSize: command.byteSize,
      checksumSha256: command.checksumSha256 ?? version.checksumSha256 ?? null,
      uploadedAt: new Date(),
    });
    const source = await documentRepository.ensureInboxSource({
      sourceId: crypto.randomUUID(),
      teamId: command.teamId,
      type: "document_upload",
      name: "Document uploads",
    });
    const inboxItem = await documentRepository.createInboxItemForDocumentUpload({
      inboxItemId: crypto.randomUUID(),
      sourceId: source.id,
      teamId: command.teamId,
      documentId: command.documentId,
      documentVersionId: command.versionId,
      createdByActorId: context.actor.id,
    });

    await documentRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "document.uploaded",
      entityType: "document",
      entityId: command.documentId,
      metadata: {
        versionId: command.versionId,
        fileName: result.version.fileName,
        contentType: result.version.contentType,
        byteSize: command.byteSize,
      },
    });

    await documentRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "document.uploaded",
      version: 1,
      payload: {
        documentId: command.documentId,
        versionId: command.versionId,
        inboxItemId: inboxItem.id,
        actorId: context.actor.id,
      },
    });

    return { ...result, inboxItem };
  });
}

export async function createDocumentDownload(
  repository: DawnRepository,
  signer: DocumentUrlSigner,
  context: TransactionReviewContext,
  command: CreateDocumentDownloadCommand,
): Promise<CreateDocumentDownloadResult> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "documents.read",
    "You cannot download documents for this team",
  );
  const document = await repository.getDocumentForTeam(access.teamId, command.documentId);

  if (!document?.currentVersion || document.status !== "uploaded") {
    throw new AppError("NOT_FOUND", "Document not found");
  }

  const download = await signer.createDownloadUrl({
    teamId: access.teamId,
    documentId: document.id,
    versionId: document.currentVersion.id,
    objectKey: document.currentVersion.objectKey,
    fileName: document.currentVersion.fileName,
    contentType: document.currentVersion.contentType,
  });

  return {
    document,
    version: document.currentVersion,
    downloadUrl: download.url,
    downloadExpiresAt: download.expiresAt,
  };
}

export async function listInboxItems(
  repository: DawnRepository,
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<{ teamId: string; inboxItems: InboxItem[] }> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "documents.read",
    "You cannot read inbox items for this team",
  );

  return {
    teamId: access.teamId,
    inboxItems: await repository.listInboxItems(access.teamId),
  };
}

export async function runDocumentExtraction(
  repository: DawnRepository,
  extractor: DocumentExtractionProvider,
  context: TransactionReviewContext,
  command: RunDocumentExtractionCommand,
): Promise<RunDocumentExtractionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Inbox item not found");

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      inboxItemId: command.inboxItemId,
      documentId: command.documentId,
      versionId: command.versionId,
      extractor: extractor.source,
    });
    const replayed = await inboxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      runDocumentExtractionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different document extraction",
        );
      }

      return { ...(replayed.result as RunDocumentExtractionResult), replayed: true };
    }

    const [inboxItem, document, version] = await Promise.all([
      inboxRepository.getInboxItemForTeam(command.teamId, command.inboxItemId),
      inboxRepository.getDocumentForTeam(command.teamId, command.documentId),
      inboxRepository.getDocumentVersionForTeam(command.teamId, command.versionId),
    ]);

    if (
      !inboxItem ||
      inboxItem.documentId !== command.documentId ||
      inboxItem.documentVersionId !== command.versionId ||
      !document ||
      !version ||
      version.documentId !== command.documentId
    ) {
      throw new AppError("NOT_FOUND", "Inbox item not found");
    }

    try {
      const extracted = await extractor.extract({
        fileName: version.fileName,
        contentType: version.contentType,
        rawText: command.rawText,
      });
      const result = await inboxRepository.createDocumentExtraction({
        extractionId: crypto.randomUUID(),
        teamId: command.teamId,
        inboxItemId: inboxItem.id,
        documentId: command.documentId,
        documentVersionId: command.versionId,
        source: extractor.source,
        fields: normalizeDocumentExtractionFields(extracted.fields),
        confidence: normalizeDocumentExtractionConfidence(extracted.confidence),
        rawText: extracted.rawText ?? command.rawText,
        createdByActorId: context.actor.id,
      });

      await inboxRepository.appendAuditEvent({
        teamId: command.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        action: "document.extracted",
        entityType: "inbox_item",
        entityId: inboxItem.id,
        metadata: {
          documentId: command.documentId,
          versionId: command.versionId,
          extractionId: result.extraction.id,
          provider: extractor.source,
        },
      });

      await inboxRepository.appendOutboxEvent({
        teamId: command.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        type: "document.extracted",
        version: 1,
        payload: {
          inboxItemId: inboxItem.id,
          documentId: command.documentId,
          versionId: command.versionId,
          extractionId: result.extraction.id,
        },
      });

      const finalResult = { ...result, replayed: false };

      await inboxRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: runDocumentExtractionOperation,
        key: command.idempotencyKey,
        fingerprint,
        result: finalResult,
      });

      return finalResult;
    } catch (error) {
      await inboxRepository.markDocumentExtractionFailed({
        teamId: command.teamId,
        inboxItemId: inboxItem.id,
        error: errorMessage(error),
        failedAt: new Date(),
      });
      throw error;
    }
  });
}

export async function correctDocumentExtraction(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: CorrectDocumentExtractionCommand,
): Promise<CorrectDocumentExtractionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Inbox item not found");

    await resolveTeamAccess(
      inboxRepository,
      { ...context, teamId: command.teamId },
      "documents.write",
      "You cannot correct extraction results for this team",
    );

    const normalizedFields = normalizeDocumentExtractionFields(command.fields);
    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      inboxItemId: command.inboxItemId,
      fields: normalizedFields,
    });
    const replayed = await inboxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      correctDocumentExtractionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different extraction correction",
        );
      }

      return { ...(replayed.result as CorrectDocumentExtractionResult), replayed: true };
    }

    const inboxItem = await inboxRepository.getInboxItemForTeam(
      command.teamId,
      command.inboxItemId,
    );

    if (!inboxItem) {
      throw new AppError("NOT_FOUND", "Inbox item not found");
    }

    const result = await inboxRepository.createCorrectedDocumentExtraction({
      extractionId: crypto.randomUUID(),
      teamId: command.teamId,
      inboxItemId: command.inboxItemId,
      fields: normalizedFields,
      confidence: correctionConfidence(normalizedFields),
      createdByActorId: context.actor.id,
    });

    await inboxRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "document_extraction.corrected",
      entityType: "inbox_item",
      entityId: command.inboxItemId,
      metadata: {
        extractionId: result.extraction.id,
        fields: Object.keys(normalizedFields),
      },
    });

    await inboxRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "document_extraction.corrected",
      version: 1,
      payload: {
        inboxItemId: command.inboxItemId,
        extractionId: result.extraction.id,
      },
    });

    const finalResult = { ...result, replayed: false };

    await inboxRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: correctDocumentExtractionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result: finalResult,
    });

    return finalResult;
  });
}

export async function generateInboxMatchSuggestions(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: GenerateInboxMatchSuggestionsCommand,
): Promise<GenerateInboxMatchSuggestionsResult> {
  assertCommandTeamMatchesContext(context, command.teamId, "Inbox item not found");

  await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "documents.read",
    "You cannot read inbox items for this team",
  );
  await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "transactions.read",
    "You cannot read transactions for this team",
  );

  const [inboxItem, transactions, aliases, hardNegatives] = await Promise.all([
    repository.getInboxItemForTeam(command.teamId, command.inboxItemId),
    repository.listTransactionsForReport({ teamId: command.teamId }),
    repository.listTeamAliases(command.teamId),
    repository.listHardNegativeMatches(command.teamId, command.inboxItemId),
  ]);

  if (!inboxItem || !inboxItem.latestExtraction) {
    throw new AppError("NOT_FOUND", "Inbox item not found");
  }

  const suggestions = suggestInboxTransactionMatches(
    {
      inboxItemId: inboxItem.id,
      documentId: inboxItem.documentId,
      sender: inboxItem.source?.name,
      documentText: inboxItem.latestExtraction.rawText,
      fields: inboxItem.latestExtraction.fields,
    },
    transactions.map((transaction) => ({
      transaction,
      providerReference: transaction.providerTransactionId,
    })),
    {
      aliases,
      hardNegatives,
    },
  )
    .filter((suggestion) => suggestion.score >= 0.35)
    .slice(0, 5);

  return {
    inboxItemId: inboxItem.id,
    suggestions: await repository.upsertInboxMatchSuggestions({
      teamId: command.teamId,
      inboxItemId: inboxItem.id,
      suggestions,
    }),
  };
}

export async function acceptInboxMatch(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: AcceptInboxMatchCommand,
): Promise<AcceptInboxMatchResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Inbox match not found");

    await resolveTeamAccess(
      inboxRepository,
      { ...context, teamId: command.teamId },
      "transactions.write",
      "You cannot accept inbox matches for this team",
    );

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      suggestionId: command.suggestionId,
    });
    const replayed = await inboxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      acceptInboxMatchOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different inbox match",
        );
      }

      return { ...(replayed.result as AcceptInboxMatchResult), replayed: true };
    }

    const existing = await inboxRepository.getInboxMatchSuggestionForTeam(
      command.teamId,
      command.suggestionId,
    );

    if (!existing) {
      throw new AppError("NOT_FOUND", "Inbox match not found");
    }

    if (existing.status === "rejected") {
      throw new AppError("CONFLICT", "Rejected inbox matches cannot be accepted");
    }

    const accepted = await inboxRepository.acceptInboxMatchSuggestion({
      teamId: command.teamId,
      suggestionId: command.suggestionId,
      actorId: context.actor.id,
    });

    await inboxRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "inbox_match.accepted",
      entityType: "inbox_item",
      entityId: accepted.inboxItem.id,
      metadata: {
        suggestionId: accepted.suggestion.id,
        transactionId: accepted.suggestion.transactionId,
        documentId: accepted.inboxItem.documentId,
        score: accepted.suggestion.score,
      },
    });

    await inboxRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "inbox_match.accepted",
      version: 1,
      payload: {
        inboxItemId: accepted.inboxItem.id,
        suggestionId: accepted.suggestion.id,
        transactionId: accepted.suggestion.transactionId,
        documentId: accepted.inboxItem.documentId,
      },
    });

    const finalResult = { ...accepted, replayed: false };

    await inboxRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: acceptInboxMatchOperation,
      key: command.idempotencyKey,
      fingerprint,
      result: finalResult,
    });

    return finalResult;
  });
}

export async function rejectInboxMatch(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: RejectInboxMatchCommand,
): Promise<RejectInboxMatchResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Inbox match not found");

    await resolveTeamAccess(
      inboxRepository,
      { ...context, teamId: command.teamId },
      "transactions.write",
      "You cannot reject inbox matches for this team",
    );

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      suggestionId: command.suggestionId,
      reason: command.reason ?? null,
    });
    const replayed = await inboxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      rejectInboxMatchOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different inbox match rejection",
        );
      }

      return { ...(replayed.result as RejectInboxMatchResult), replayed: true };
    }

    const existing = await inboxRepository.getInboxMatchSuggestionForTeam(
      command.teamId,
      command.suggestionId,
    );

    if (!existing) {
      throw new AppError("NOT_FOUND", "Inbox match not found");
    }

    if (existing.status === "accepted") {
      throw new AppError("CONFLICT", "Accepted inbox matches cannot be rejected");
    }

    const suggestion = await inboxRepository.rejectInboxMatchSuggestion({
      teamId: command.teamId,
      suggestionId: command.suggestionId,
      reason: command.reason,
      actorId: context.actor.id,
    });

    await inboxRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "inbox_match.rejected",
      entityType: "inbox_item",
      entityId: suggestion.inboxItemId,
      metadata: {
        suggestionId: suggestion.id,
        transactionId: suggestion.transactionId,
        reason: command.reason ?? null,
      },
    });

    await inboxRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "inbox_match.rejected",
      version: 1,
      payload: {
        inboxItemId: suggestion.inboxItemId,
        suggestionId: suggestion.id,
        transactionId: suggestion.transactionId,
      },
    });

    const finalResult = { suggestion, replayed: false };

    await inboxRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: rejectInboxMatchOperation,
      key: command.idempotencyKey,
      fingerprint,
      result: finalResult,
    });

    return finalResult;
  });
}

export async function listBillingWorkspace(
  repository: DawnRepository,
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<BillingWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "invoices.read",
    "You cannot read billing data for this team",
  );
  const [customers, contacts, products, invoices, payments, recurringSchedules] = await Promise.all(
    [
      repository.listCustomers(access.teamId),
      repository.listCustomerContacts(access.teamId),
      repository.listProducts(access.teamId),
      repository.listInvoices(access.teamId),
      repository.listInvoicePayments(access.teamId),
      repository.listRecurringInvoiceSchedules(access.teamId),
    ],
  );
  const draftInvoices = invoices.filter((invoice) => invoice.status === "draft");

  return {
    teamId: access.teamId,
    customers,
    contacts,
    products,
    invoices,
    draftInvoices,
    payments,
    recurringSchedules,
  };
}

export async function createCustomer(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: CreateCustomerCommand,
): Promise<CreateCustomerResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Customer not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.write",
      "You cannot create customers for this team",
    );

    const normalized = normalizeCreateCustomerCommand(command);
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createCustomerOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different customer");
      }

      return { ...(replayed.result as CreateCustomerResult), replayed: true };
    }

    const result = await billingRepository.createCustomer({
      customerId: crypto.randomUUID(),
      contactId: normalized.contactEmail ? crypto.randomUUID() : null,
      ...normalized,
      createdByActorId: context.actor.id,
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "customer.created",
      entityType: "customer",
      entityId: result.customer.id,
      metadata: {
        contactId: result.contact?.id ?? null,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "customer.created",
      version: 1,
      payload: {
        customerId: result.customer.id,
        contactId: result.contact?.id ?? null,
      },
    });

    const finalResult = { ...result, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createCustomerOperation,
      key: command.idempotencyKey,
      fingerprint,
      result: finalResult,
    });

    return finalResult;
  });
}

export async function createProduct(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: CreateProductCommand,
): Promise<CreateProductResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Product not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.write",
      "You cannot create products for this team",
    );

    const normalized = normalizeCreateProductCommand(command);
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createProductOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different product");
      }

      return { ...(replayed.result as CreateProductResult), replayed: true };
    }

    const product = await billingRepository.createProduct({
      productId: crypto.randomUUID(),
      ...normalized,
      createdByActorId: context.actor.id,
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "product.created",
      entityType: "product",
      entityId: product.id,
      metadata: {
        type: product.type,
        unitPrice: product.unitPrice,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "product.created",
      version: 1,
      payload: {
        productId: product.id,
      },
    });

    const result = { product, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createProductOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createDraftInvoice(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: CreateDraftInvoiceCommand,
): Promise<CreateDraftInvoiceResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Invoice not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.write",
      "You cannot create invoice drafts for this team",
    );

    const normalized = normalizeInvoiceDraftInput(command);
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createDraftInvoiceOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different invoice draft",
        );
      }

      return { ...(replayed.result as CreateDraftInvoiceResult), replayed: true };
    }

    await assertInvoiceReferencesExist(billingRepository, normalized);
    assertInvoiceDraftInput(normalized);

    const invoice = await billingRepository.createDraftInvoice({
      invoiceId: crypto.randomUUID(),
      ...normalized,
      createdByActorId: context.actor.id,
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "invoice_draft.created",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        customerId: invoice.customerId,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.totals.total,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "invoice_draft.created",
      version: 1,
      payload: {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        total: invoice.totals.total,
      },
    });

    const result = { invoice, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createDraftInvoiceOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function updateDraftInvoice(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: UpdateDraftInvoiceCommand,
): Promise<UpdateDraftInvoiceResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Invoice not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.write",
      "You cannot edit invoice drafts for this team",
    );

    const normalized = normalizeInvoiceDraftInput(command);
    const fingerprint = JSON.stringify({
      invoiceId: command.invoiceId,
      ...normalized,
    });
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updateDraftInvoiceOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different invoice draft update",
        );
      }

      return { ...(replayed.result as UpdateDraftInvoiceResult), replayed: true };
    }

    const existing = await billingRepository.getInvoiceForTeam(command.teamId, command.invoiceId);

    if (!existing) {
      throw new AppError("NOT_FOUND", "Invoice not found");
    }

    try {
      assertCanEditInvoiceDraft(existing);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    await assertInvoiceReferencesExist(billingRepository, normalized);
    assertInvoiceDraftInput(normalized);

    const invoice = await billingRepository.updateDraftInvoice({
      invoiceId: command.invoiceId,
      ...normalized,
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "invoice_draft.updated",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        customerId: invoice.customerId,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.totals.total,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "invoice_draft.updated",
      version: 1,
      payload: {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        total: invoice.totals.total,
      },
    });

    const result = { invoice, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updateDraftInvoiceOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function previewInvoicePdf(
  repository: DawnRepository,
  renderer: InvoicePdfRenderer,
  context: TransactionReviewContext,
  command: PreviewInvoicePdfCommand,
): Promise<PreviewInvoicePdfResult> {
  assertCommandTeamMatchesContext(context, command.teamId, "Invoice not found");

  await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "invoices.read",
    "You cannot preview invoices for this team",
  );

  const invoice = await repository.getInvoiceForTeam(command.teamId, command.invoiceId);

  if (!invoice) {
    throw new AppError("NOT_FOUND", "Invoice not found");
  }

  const customer = await repository.getCustomerForTeam(command.teamId, invoice.customerId);

  if (!customer) {
    throw new AppError("NOT_FOUND", "Customer not found");
  }

  const contact = await repository.getCustomerContactForCustomer(command.teamId, customer.id);
  const pdf = await renderer.render({ invoice, customer, contact });

  return { invoice, pdf };
}

export async function sendInvoice(
  repository: DawnRepository,
  renderer: InvoicePdfRenderer,
  emailProvider: InvoiceEmailDeliveryProvider,
  context: TransactionReviewContext,
  command: SendInvoiceCommand,
): Promise<SendInvoiceResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Invoice not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.send",
      "You cannot send invoices for this team",
    );

    if (!command.confirm) {
      throw new AppError("CONFLICT", "Invoice send requires explicit confirmation");
    }

    const normalized = {
      teamId: command.teamId,
      invoiceId: command.invoiceId,
      toEmail: normalizeOptionalEmail(command.toEmail),
      subject: command.subject?.trim() || null,
      message: command.message?.trim() || null,
      confirm: command.confirm,
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      sendInvoiceOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different send");
      }

      return { ...(replayed.result as SendInvoiceResult), replayed: true };
    }

    const invoice = await billingRepository.getInvoiceForTeam(command.teamId, command.invoiceId);

    if (!invoice) {
      throw new AppError("NOT_FOUND", "Invoice not found");
    }

    try {
      assertCanSendInvoice(invoice);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const customer = await billingRepository.getCustomerForTeam(command.teamId, invoice.customerId);

    if (!customer) {
      throw new AppError("NOT_FOUND", "Customer not found");
    }

    const contact = await billingRepository.getCustomerContactForCustomer(
      command.teamId,
      customer.id,
    );
    const toEmail = normalized.toEmail ?? contact?.email ?? customer.email;

    if (!toEmail) {
      throw new AppError("CONFLICT", "Invoice send requires a recipient email");
    }

    const pdf = await renderer.render({ invoice, customer, contact });
    const subject = normalized.subject ?? `Invoice ${invoice.invoiceNumber}`;
    const delivery = await emailProvider.sendInvoice({
      teamId: command.teamId,
      invoiceId: invoice.id,
      to: toEmail,
      subject,
      text: normalized.message ?? `Attached invoice ${invoice.invoiceNumber}`,
      attachment: {
        fileName: pdf.fileName,
        contentType: pdf.contentType,
        bodyBase64: pdf.bodyBase64,
      },
    });
    const sent = markInvoiceSent(invoice, delivery.acceptedAt);
    const stored = await billingRepository.markInvoiceSent({
      teamId: command.teamId,
      invoiceId: invoice.id,
      sentAt: sent.sentAt,
      toEmail,
      providerMessageId: delivery.providerMessageId,
    });

    await billingRepository.createInvoiceEvent({
      eventId: crypto.randomUUID(),
      teamId: command.teamId,
      invoiceId: invoice.id,
      type: "invoice.sent",
      occurredAt: delivery.acceptedAt,
      actorId: context.actor.id,
      metadata: {
        toEmail,
        provider: emailProvider.provider,
        providerMessageId: delivery.providerMessageId,
      },
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "invoice.sent",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        toEmail,
        providerMessageId: delivery.providerMessageId,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "invoice.sent",
      version: 1,
      payload: {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        toEmail,
        providerMessageId: delivery.providerMessageId,
      },
    });

    const result = {
      invoice: stored,
      providerMessageId: delivery.providerMessageId,
      replayed: false,
    };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: sendInvoiceOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function recordInvoicePayment(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: RecordInvoicePaymentCommand,
): Promise<RecordInvoicePaymentResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Invoice not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.write",
      "You cannot record invoice payments for this team",
    );

    const normalized = {
      teamId: command.teamId,
      invoiceId: command.invoiceId,
      amount: { ...command.amount, currency: command.amount.currency.toUpperCase() },
      paidAt: command.paidAt,
      method: command.method?.trim() || null,
      note: command.note?.trim() || null,
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      recordInvoicePaymentOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different payment");
      }

      return { ...(replayed.result as RecordInvoicePaymentResult), replayed: true };
    }

    const invoice = await billingRepository.getInvoiceForTeam(command.teamId, command.invoiceId);

    if (!invoice) {
      throw new AppError("NOT_FOUND", "Invoice not found");
    }

    let nextPaymentState: ReturnType<typeof invoiceStatusAfterPayment>;

    try {
      nextPaymentState = invoiceStatusAfterPayment({
        invoice,
        payment: normalized.amount,
        paidAt: normalized.paidAt,
      });
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const paymentResult = await billingRepository.recordInvoicePayment({
      paymentId: crypto.randomUUID(),
      teamId: command.teamId,
      invoiceId: invoice.id,
      amount: normalized.amount,
      paidAt: normalized.paidAt,
      method: normalized.method,
      note: normalized.note,
      createdByActorId: context.actor.id,
      nextInvoiceStatus: nextPaymentState.status,
      nextAmountPaid: nextPaymentState.amountPaid,
      invoicePaidAt: nextPaymentState.paidAt,
    });

    await billingRepository.createInvoiceEvent({
      eventId: crypto.randomUUID(),
      teamId: command.teamId,
      invoiceId: invoice.id,
      type: "invoice.payment_recorded",
      occurredAt: normalized.paidAt,
      actorId: context.actor.id,
      metadata: {
        paymentId: paymentResult.payment.id,
        amount: normalized.amount,
        nextStatus: paymentResult.invoice.status,
      },
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "invoice_payment.recorded",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        paymentId: paymentResult.payment.id,
        amount: normalized.amount,
        nextStatus: paymentResult.invoice.status,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "invoice.payment_recorded",
      version: 1,
      payload: {
        invoiceId: invoice.id,
        paymentId: paymentResult.payment.id,
        amount: normalized.amount,
        nextStatus: paymentResult.invoice.status,
      },
    });

    const result = { ...paymentResult, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: recordInvoicePaymentOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createRecurringInvoiceSchedule(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: CreateRecurringInvoiceScheduleCommand,
): Promise<CreateRecurringInvoiceScheduleResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Invoice not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.write",
      "You cannot create recurring invoice schedules for this team",
    );

    const normalized = {
      teamId: command.teamId,
      sourceInvoiceId: command.sourceInvoiceId,
      frequency: command.frequency,
      nextRunAt: new Date(command.nextRunAt).toISOString(),
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createRecurringInvoiceScheduleOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different recurring schedule",
        );
      }

      return { ...(replayed.result as CreateRecurringInvoiceScheduleResult), replayed: true };
    }

    const sourceInvoice = await billingRepository.getInvoiceForTeam(
      command.teamId,
      command.sourceInvoiceId,
    );

    if (!sourceInvoice) {
      throw new AppError("NOT_FOUND", "Invoice not found");
    }

    const schedule = await billingRepository.createRecurringInvoiceSchedule({
      scheduleId: crypto.randomUUID(),
      teamId: command.teamId,
      sourceInvoiceId: sourceInvoice.id,
      customerId: sourceInvoice.customerId,
      frequency: normalized.frequency,
      nextRunAt: normalized.nextRunAt,
      createdByActorId: context.actor.id,
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "recurring_invoice.created",
      entityType: "recurring_invoice",
      entityId: schedule.id,
      metadata: {
        sourceInvoiceId: sourceInvoice.id,
        frequency: schedule.frequency,
        nextRunAt: schedule.nextRunAt,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "recurring_invoice.schedule_created",
      version: 1,
      payload: {
        scheduleId: schedule.id,
        sourceInvoiceId: sourceInvoice.id,
        nextRunAt: schedule.nextRunAt,
      },
    });

    const result = { schedule, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createRecurringInvoiceScheduleOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function generateRecurringInvoice(
  repository: DawnRepository,
  command: GenerateRecurringInvoiceCommand,
): Promise<GenerateRecurringInvoiceResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as DawnRepository;
    const actorId = "system:recurring-invoices";
    const normalized = {
      teamId: command.teamId,
      scheduleId: command.scheduleId,
      runAt: new Date(command.runAt).toISOString(),
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      actorId,
      generateRecurringInvoiceOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different recurring invoice generation",
        );
      }

      return { ...(replayed.result as GenerateRecurringInvoiceResult), replayed: true };
    }

    const schedule = await billingRepository.getRecurringInvoiceScheduleForTeam(
      command.teamId,
      command.scheduleId,
    );

    if (!schedule || schedule.status !== "active") {
      throw new AppError("NOT_FOUND", "Recurring invoice schedule not found");
    }

    const sourceInvoice = await billingRepository.getInvoiceForTeam(
      command.teamId,
      schedule.sourceInvoiceId,
    );

    if (!sourceInvoice) {
      throw new AppError("NOT_FOUND", "Invoice not found");
    }

    const generated = await billingRepository.generateRecurringInvoice({
      invoiceId: crypto.randomUUID(),
      teamId: command.teamId,
      scheduleId: schedule.id,
      sourceInvoice,
      runAt: normalized.runAt,
      nextRunAt: nextRecurringInvoiceRun({
        frequency: schedule.frequency,
        from: normalized.runAt,
      }),
      createdByActorId: actorId,
    });

    await billingRepository.createInvoiceEvent({
      eventId: crypto.randomUUID(),
      teamId: command.teamId,
      invoiceId: generated.invoice.id,
      type: "recurring_invoice.generated",
      occurredAt: normalized.runAt,
      actorId,
      metadata: {
        scheduleId: schedule.id,
        sourceInvoiceId: sourceInvoice.id,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId,
      requestId: command.idempotencyKey,
      type: "recurring_invoice.generated",
      version: 1,
      payload: {
        scheduleId: schedule.id,
        sourceInvoiceId: sourceInvoice.id,
        invoiceId: generated.invoice.id,
      },
    });

    const result = { ...generated, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId,
      operation: generateRecurringInvoiceOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export function createDeterministicInvoicePdfRenderer(): InvoicePdfRenderer {
  return {
    async render(input) {
      const lines = input.invoice.lines
        .map(
          (line) =>
            `${line.description} ${line.quantityMilli / 1_000} ${line.totals.total.amountMinor}`,
        )
        .join("\\n");
      const pdfText = [
        "%PDF-1.4",
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj",
        `4 0 obj << /Length 120 >> stream\\nBT /F1 12 Tf 72 720 Td (${escapePdfText(
          `Invoice ${input.invoice.invoiceNumber} for ${input.customer.name}`,
        )}) Tj 0 -18 Td (${escapePdfText(`Total ${input.invoice.totals.total.amountMinor} ${input.invoice.currency}`)}) Tj 0 -18 Td (${escapePdfText(lines)}) Tj ET\\nendstream endobj`,
        "trailer << /Root 1 0 R >>",
        "%%EOF",
      ].join("\n");
      const bodyBase64 = Buffer.from(pdfText).toString("base64");

      return {
        fileName: `${input.invoice.invoiceNumber}.pdf`,
        contentType: "application/pdf",
        bodyBase64,
        byteSize: Buffer.byteLength(pdfText),
      };
    },
  };
}

function escapePdfText(value: string) {
  return value.replace(/[\\()]/g, (character) => `\\${character}`).replace(/\r?\n/g, " ");
}

export async function listProjectWorkspace(
  repository: DawnRepository,
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<ProjectWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "projects.read",
    "You cannot read projects for this team",
  );
  const [customers, projects, projectMembers, timeEntries] = await Promise.all([
    repository.listCustomers(access.teamId),
    repository.listProjects(access.teamId),
    repository.listProjectMembers(access.teamId),
    repository.listTimeEntries(access.teamId),
  ]);
  const currency = projects[0]?.billableRate.currency ?? "USD";

  return {
    teamId: access.teamId,
    customers,
    projects,
    projectMembers,
    timeEntries,
    report: summarizeTimeEntries(timeEntries, currency),
  };
}

export async function createProject(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: CreateProjectCommand,
): Promise<CreateProjectResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const projectRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Project not found");

    await resolveTeamAccess(
      projectRepository,
      { ...context, teamId: command.teamId },
      "projects.write",
      "You cannot create projects for this team",
    );

    const normalized = {
      teamId: command.teamId,
      customerId: command.customerId,
      name: command.name.trim(),
      description: command.description?.trim() || null,
      billableRate: {
        amountMinor: command.billableRate.amountMinor,
        currency: command.billableRate.currency.toUpperCase(),
      },
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await projectRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createProjectOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different project");
      }

      return { ...(replayed.result as CreateProjectResult), replayed: true };
    }

    const customer = await projectRepository.getCustomerForTeam(command.teamId, command.customerId);

    if (!customer) {
      throw new AppError("NOT_FOUND", "Customer not found");
    }

    try {
      assertProjectInput(normalized);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const created = await projectRepository.createProject({
      projectId: crypto.randomUUID(),
      memberId: crypto.randomUUID(),
      ...normalized,
      createdByActorId: context.actor.id,
    });

    await projectRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "project.created",
      entityType: "project",
      entityId: created.project.id,
      metadata: {
        customerId: created.project.customerId,
        billableRate: created.project.billableRate,
      },
    });

    await projectRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "project.created",
      version: 1,
      payload: {
        projectId: created.project.id,
        customerId: created.project.customerId,
      },
    });

    const result = { ...created, replayed: false };

    await projectRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createProjectOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createTimeEntry(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: CreateTimeEntryCommand,
): Promise<CreateTimeEntryResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const projectRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Project not found");

    await resolveTeamAccess(
      projectRepository,
      { ...context, teamId: command.teamId },
      "projects.write",
      "You cannot track time for this team",
    );

    const project = await projectRepository.getProjectForTeam(command.teamId, command.projectId);

    if (!project) {
      throw new AppError("NOT_FOUND", "Project not found");
    }

    const normalized = {
      teamId: command.teamId,
      projectId: command.projectId,
      actorId: command.actorId?.trim() || context.actor.id,
      description: command.description.trim(),
      occurredOn: new Date(command.occurredOn).toISOString(),
      durationMinutes: command.durationMinutes,
      billableStatus: command.billableStatus,
      billableRate:
        command.billableStatus === "billable"
          ? {
              amountMinor: command.billableRate?.amountMinor ?? project.billableRate.amountMinor,
              currency: (
                command.billableRate?.currency ?? project.billableRate.currency
              ).toUpperCase(),
            }
          : null,
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await projectRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createTimeEntryOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different time entry",
        );
      }

      return { ...(replayed.result as CreateTimeEntryResult), replayed: true };
    }

    try {
      assertTimeEntryInput(normalized);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const timeEntry = await projectRepository.createTimeEntry({
      timeEntryId: crypto.randomUUID(),
      ...normalized,
    });

    await projectRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "time_entry.created",
      entityType: "time_entry",
      entityId: timeEntry.id,
      metadata: {
        projectId: timeEntry.projectId,
        durationMinutes: timeEntry.durationMinutes,
        billableStatus: timeEntry.billableStatus,
      },
    });

    await projectRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "time_entry.created",
      version: 1,
      payload: {
        timeEntryId: timeEntry.id,
        projectId: timeEntry.projectId,
      },
    });

    const result = { timeEntry, replayed: false };

    await projectRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createTimeEntryOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createInvoiceFromTimeEntries(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: CreateInvoiceFromTimeEntriesCommand,
): Promise<CreateInvoiceFromTimeEntriesResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const projectRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Project not found");

    await resolveTeamAccess(
      projectRepository,
      { ...context, teamId: command.teamId },
      "projects.write",
      "You cannot invoice time for this team",
    );

    const normalized = {
      teamId: command.teamId,
      customerId: command.customerId,
      invoiceNumber: command.invoiceNumber.trim(),
      issueDate: new Date(command.issueDate).toISOString(),
      dueDate: command.dueDate ? new Date(command.dueDate).toISOString() : null,
      timeEntryIds: [...new Set(command.timeEntryIds)].sort(),
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await projectRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createInvoiceFromTimeEntriesOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different time invoice",
        );
      }

      return { ...(replayed.result as CreateInvoiceFromTimeEntriesResult), replayed: true };
    }

    if (normalized.timeEntryIds.length === 0) {
      throw new AppError("CONFLICT", "At least one time entry is required");
    }

    const customer = await projectRepository.getCustomerForTeam(command.teamId, command.customerId);

    if (!customer) {
      throw new AppError("NOT_FOUND", "Customer not found");
    }

    const [timeEntries, projects] = await Promise.all([
      projectRepository.getTimeEntriesForTeam(command.teamId, normalized.timeEntryIds),
      projectRepository.listProjects(command.teamId),
    ]);

    if (timeEntries.length !== normalized.timeEntryIds.length) {
      throw new AppError("NOT_FOUND", "Time entry not found");
    }

    const projectById = new Map(projects.map((project) => [project.id, project]));
    const lines = timeEntries.map((timeEntry) => {
      const project = projectById.get(timeEntry.projectId);

      if (!project || project.customerId !== normalized.customerId) {
        throw new AppError("CONFLICT", "Time entries must belong to the invoice customer");
      }

      try {
        return timeEntryToInvoiceLine({ project, entry: timeEntry });
      } catch (error) {
        throw new AppError("CONFLICT", errorMessage(error));
      }
    });
    const currency = lines[0]?.unitPrice.currency ?? "USD";
    const invoiceInput = {
      teamId: command.teamId,
      customerId: normalized.customerId,
      invoiceNumber: normalized.invoiceNumber,
      issueDate: normalized.issueDate,
      dueDate: normalized.dueDate,
      currency,
      discountBasisPoints: 0,
      lines,
    };

    assertInvoiceDraftInput(invoiceInput);

    const invoice = await projectRepository.createDraftInvoice({
      invoiceId: crypto.randomUUID(),
      ...invoiceInput,
      createdByActorId: context.actor.id,
    });
    const invoicedEntries = await projectRepository.markTimeEntriesInvoiced({
      teamId: command.teamId,
      timeEntryIds: normalized.timeEntryIds,
      invoiceId: invoice.id,
    });

    await projectRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "time_entries.invoiced",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        timeEntryIds: normalized.timeEntryIds,
        total: invoice.totals.total,
      },
    });

    await projectRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "time_entries.invoiced",
      version: 1,
      payload: {
        invoiceId: invoice.id,
        timeEntryIds: normalized.timeEntryIds,
      },
    });

    const result = { invoice, timeEntries: invoicedEntries, replayed: false };

    await projectRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createInvoiceFromTimeEntriesOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function listBusinessReport(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: ListBusinessReportCommand = {},
): Promise<BusinessReportWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId ?? context.teamId },
    "transactions.read",
    "You cannot read reports for this team",
  );
  const range = normalizeReportRange(command);

  return {
    teamId: access.teamId,
    report: await loadBusinessReport(repository, access.teamId, range),
    insights: await repository.listBusinessInsights({
      teamId: access.teamId,
      from: range.from,
      to: range.to,
    }),
  };
}

export async function generateWeeklyInsights(
  repository: DawnRepository,
  provider: InsightGenerationProvider,
  command: GenerateWeeklyInsightsCommand,
): Promise<GenerateWeeklyInsightsResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const reportingRepository = transactionRepository as DawnRepository;
    const actorId = "system:weekly-insights";
    const normalized = {
      teamId: command.teamId,
      periodStart: new Date(command.periodStart).toISOString(),
      periodEnd: new Date(command.periodEnd).toISOString(),
      provider: provider.provider,
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await reportingRepository.getIdempotencyResult(
      command.teamId,
      actorId,
      generateWeeklyInsightsOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different weekly insight run",
        );
      }

      return { ...(replayed.result as GenerateWeeklyInsightsResult), replayed: true };
    }

    const report = await loadBusinessReport(reportingRepository, command.teamId, {
      from: normalized.periodStart,
      to: normalized.periodEnd,
    });
    const drafts = await provider.generateWeeklyInsights({
      teamId: command.teamId,
      periodStart: normalized.periodStart,
      periodEnd: normalized.periodEnd,
      report,
    });
    const createdAt = new Date().toISOString();
    const insights = await reportingRepository.createBusinessInsights({
      teamId: command.teamId,
      periodStart: normalized.periodStart,
      periodEnd: normalized.periodEnd,
      insights: drafts.map((draft) => ({
        ...draft,
        insightId: crypto.randomUUID(),
        createdAt,
      })),
    });

    await reportingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId,
      requestId: command.idempotencyKey,
      action: "insights.weekly.generated",
      entityType: "insight_run",
      entityId: normalized.periodEnd,
      metadata: {
        insightIds: insights.map((insight) => insight.id),
        periodStart: normalized.periodStart,
        periodEnd: normalized.periodEnd,
      },
    });

    await reportingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId,
      requestId: command.idempotencyKey,
      type: "insights.weekly.generated",
      version: 1,
      payload: {
        insightIds: insights.map((insight) => insight.id),
        periodStart: normalized.periodStart,
        periodEnd: normalized.periodEnd,
      },
    });

    const result = { insights, replayed: false };

    await reportingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId,
      operation: generateWeeklyInsightsOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

async function loadBusinessReport(
  repository: DawnRepository,
  teamId: string,
  range: BusinessReport["range"],
) {
  const [transactions, customers, invoices, timeEntries, inboxItems, projects] = await Promise.all([
    repository.listTransactionsForReport({
      teamId,
      from: range.from ?? undefined,
      to: range.to ?? undefined,
    }),
    repository.listCustomers(teamId),
    repository.listInvoices(teamId),
    repository.listTimeEntries(teamId),
    repository.listInboxItems(teamId),
    repository.listProjects(teamId),
  ]);
  const currency =
    transactions[0]?.money.currency ??
    invoices[0]?.currency ??
    projects[0]?.billableRate.currency ??
    "USD";

  return buildBusinessReport({
    teamId,
    currency,
    range,
    transactions,
    customers,
    invoices: filterInvoicesByIssueDate(invoices, range),
    timeEntries: filterTimeEntriesByDate(timeEntries, range),
    inboxItems,
  });
}

function buildBusinessReport(input: {
  teamId: string;
  currency: string;
  range: BusinessReport["range"];
  transactions: Transaction[];
  customers: Customer[];
  invoices: InvoiceDraft[];
  timeEntries: TimeEntry[];
  inboxItems: InboxItem[];
}): BusinessReport {
  const customerById = new Map(input.customers.map((customer) => [customer.id, customer]));
  const totals = createReportTotals(input.transactions, input.currency);

  return {
    teamId: input.teamId,
    currency: input.currency,
    range: input.range,
    totals,
    cashflow: totals.balance,
    revenueByCustomer: revenueByCustomer(input.invoices, customerById, input.currency),
    expensesByCategory: expensesByCategory(input.transactions, input.currency),
    unpaidInvoices: unpaidInvoices(input.invoices, customerById, input.currency),
    taxSummary: taxSummary(input.invoices, input.currency),
    timeUtilization: summarizeTimeEntries(input.timeEntries, input.currency),
    inboxBacklog: inboxBacklog(input.inboxItems),
  };
}

function normalizeReportRange(input: ListBusinessReportCommand): BusinessReport["range"] {
  return {
    from: input.from ? new Date(input.from).toISOString() : null,
    to: input.to ? new Date(input.to).toISOString() : null,
  };
}

function filterInvoicesByIssueDate(
  invoices: readonly InvoiceDraft[],
  range: BusinessReport["range"],
) {
  return invoices.filter((invoice) => isWithinRange(invoice.issueDate, range));
}

function filterTimeEntriesByDate(entries: readonly TimeEntry[], range: BusinessReport["range"]) {
  return entries.filter((entry) => isWithinRange(entry.occurredOn, range));
}

function isWithinRange(value: string, range: BusinessReport["range"]) {
  const time = new Date(value).getTime();

  if (range.from && time < new Date(range.from).getTime()) {
    return false;
  }

  if (range.to && time > new Date(range.to).getTime()) {
    return false;
  }

  return true;
}

function revenueByCustomer(
  invoices: readonly InvoiceDraft[],
  customerById: Map<string, Customer>,
  currency: string,
) {
  const buckets = new Map<string, { amountMinor: number; sources: ReportSourceRef[] }>();

  for (const invoice of invoices) {
    if (invoice.status === "void" || invoice.currency !== currency) {
      continue;
    }

    const bucket = buckets.get(invoice.customerId) ?? { amountMinor: 0, sources: [] };
    bucket.amountMinor += invoice.totals.total.amountMinor;
    bucket.sources.push(invoiceSource(invoice));
    buckets.set(invoice.customerId, bucket);
  }

  return [...buckets.entries()]
    .map(([customerId, bucket]) => ({
      id: customerId,
      label: customerById.get(customerId)?.name ?? customerId,
      amount: { amountMinor: bucket.amountMinor, currency },
      sources: bucket.sources,
    }))
    .sort((left, right) => right.amount.amountMinor - left.amount.amountMinor);
}

function expensesByCategory(transactions: readonly Transaction[], currency: string) {
  const buckets = new Map<string, { amountMinor: number; sources: ReportSourceRef[] }>();

  for (const transaction of transactions) {
    if (transaction.money.currency !== currency || transaction.money.amountMinor >= 0) {
      continue;
    }

    const categoryId = transaction.categoryId ?? "uncategorized";
    const bucket = buckets.get(categoryId) ?? { amountMinor: 0, sources: [] };
    bucket.amountMinor += transaction.money.amountMinor;
    bucket.sources.push(transactionSource(transaction));
    buckets.set(categoryId, bucket);
  }

  return [...buckets.entries()]
    .map(([categoryId, bucket]) => ({
      id: categoryId,
      label: categoryId,
      amount: { amountMinor: bucket.amountMinor, currency },
      sources: bucket.sources,
    }))
    .sort((left, right) => left.amount.amountMinor - right.amount.amountMinor);
}

function unpaidInvoices(
  invoices: readonly InvoiceDraft[],
  customerById: Map<string, Customer>,
  currency: string,
) {
  return invoices
    .filter(
      (invoice) =>
        invoice.currency === currency &&
        invoice.status !== "paid" &&
        invoice.status !== "void" &&
        invoice.totals.total.amountMinor > invoice.amountPaid.amountMinor,
    )
    .map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: customerById.get(invoice.customerId)?.name ?? invoice.customerId,
      amountDue: {
        amountMinor: invoice.totals.total.amountMinor - invoice.amountPaid.amountMinor,
        currency,
      },
      dueDate: invoice.dueDate,
      sources: [invoiceSource(invoice)],
    }))
    .sort((left, right) => right.amountDue.amountMinor - left.amountDue.amountMinor);
}

function taxSummary(invoices: readonly InvoiceDraft[], currency: string) {
  const taxInvoices = invoices.filter(
    (invoice) => invoice.currency === currency && invoice.status !== "void",
  );

  return {
    invoiceTax: {
      amountMinor: taxInvoices.reduce(
        (total, invoice) => total + invoice.totals.tax.amountMinor,
        0,
      ),
      currency,
    },
    sources: taxInvoices.map(invoiceSource),
  };
}

function inboxBacklog(inboxItems: readonly InboxItem[]) {
  const pendingExtraction = inboxItems.filter((item) => item.extractionStatus === "pending").length;
  const needsReview = inboxItems.filter((item) => item.status === "needs_review").length;
  const suggestedMatches = inboxItems.reduce(
    (total, item) =>
      total +
      (item.matchSuggestions?.filter((suggestion) => suggestion.status === "suggested").length ??
        0),
    0,
  );

  return {
    pendingExtraction,
    needsReview,
    suggestedMatches,
    sources: inboxItems
      .filter((item) => item.status !== "resolved")
      .map((item) => ({
        type: "inbox_item" as const,
        id: item.id,
        label: item.document?.title ?? item.source?.name ?? item.id,
      })),
  };
}

function invoiceSource(invoice: InvoiceDraft): ReportSourceRef {
  return {
    type: "invoice",
    id: invoice.id,
    label: invoice.invoiceNumber,
  };
}

function transactionSource(transaction: Transaction): ReportSourceRef {
  return {
    type: "transaction",
    id: transaction.id,
    label: transaction.description,
  };
}

function normalizeCreateCustomerCommand(command: CreateCustomerCommand) {
  const name = command.name.trim();
  const email = normalizeOptionalEmail(command.email);
  const billingAddress = command.billingAddress?.trim() || null;
  const contactName = command.contactName?.trim() || null;
  const contactEmail = normalizeOptionalEmail(command.contactEmail);
  const contactRole = command.contactRole?.trim() || null;

  if (!name) {
    throw new AppError("CONFLICT", "Customer name is required");
  }

  if ((contactName && !contactEmail) || (contactEmail && !contactName)) {
    throw new AppError("CONFLICT", "Customer contact requires both name and email");
  }

  return {
    teamId: command.teamId,
    name,
    email,
    billingAddress,
    contactName,
    contactEmail,
    contactRole,
  };
}

function normalizeCreateProductCommand(command: CreateProductCommand) {
  const name = command.name.trim();
  const description = command.description?.trim() || null;
  const defaultTaxRateBasisPoints = command.defaultTaxRateBasisPoints ?? 0;
  const unitPrice = {
    amountMinor: command.unitPrice.amountMinor,
    currency: command.unitPrice.currency.trim().toUpperCase(),
  };

  if (!name) {
    throw new AppError("CONFLICT", "Product name is required");
  }

  if (!["product", "service"].includes(command.type)) {
    throw new AppError("CONFLICT", "Product type is invalid");
  }

  try {
    assertInvoiceDraftInput({
      teamId: command.teamId,
      customerId: "customer_validation",
      invoiceNumber: "validation",
      issueDate: new Date(0).toISOString(),
      currency: unitPrice.currency,
      lines: [
        {
          description: name,
          quantityMilli: 1_000,
          unitPrice,
          taxRateBasisPoints: defaultTaxRateBasisPoints,
        },
      ],
    });
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }

  return {
    teamId: command.teamId,
    name,
    type: command.type,
    description,
    unitPrice,
    defaultTaxRateBasisPoints,
  };
}

function normalizeInvoiceDraftInput(
  command: CreateDraftInvoiceCommand | UpdateDraftInvoiceCommand,
): NormalizedInvoiceDraftInput {
  const currency = command.currency.trim().toUpperCase();
  const lines = command.lines.map((line) => ({
    productId: line.productId?.trim() || null,
    description: line.description.trim(),
    quantityMilli: line.quantityMilli,
    unitPrice: {
      amountMinor: line.unitPrice.amountMinor,
      currency: line.unitPrice.currency.trim().toUpperCase(),
    },
    discountBasisPoints: line.discountBasisPoints ?? 0,
    taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
  }));
  const normalized = {
    teamId: command.teamId,
    customerId: command.customerId.trim(),
    invoiceNumber: command.invoiceNumber.trim(),
    issueDate: new Date(command.issueDate).toISOString(),
    dueDate: command.dueDate ? new Date(command.dueDate).toISOString() : null,
    currency,
    discountBasisPoints: command.discountBasisPoints ?? 0,
    notes: command.notes?.trim() || null,
    lines,
  };

  try {
    assertInvoiceDraftInput(normalized);
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }

  return normalized;
}

async function assertInvoiceReferencesExist(
  repository: DawnRepository,
  input: InvoiceDraftInput,
): Promise<void> {
  const customer = await repository.getCustomerForTeam(input.teamId, input.customerId);

  if (!customer) {
    throw new AppError("NOT_FOUND", "Customer not found");
  }

  for (const line of input.lines) {
    if (!line.productId) {
      continue;
    }

    const product = await repository.getProductForTeam(input.teamId, line.productId);

    if (!product) {
      throw new AppError("NOT_FOUND", "Product not found");
    }
  }
}

function normalizeOptionalEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase() || null;

  if (!normalized) {
    return null;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AppError("CONFLICT", "Email is invalid");
  }

  return normalized;
}

async function importProviderTransaction(input: {
  repository: BankingUseCaseRepository;
  provider: BankingProvider;
  connection: BankConnection;
  bankAccount: BankAccount;
  providerTransaction: BankingProviderTransaction;
}) {
  const draft = providerTransactionToLedgerDraft({
    teamId: input.connection.teamId,
    ledgerAccountId: input.bankAccount.ledgerAccountId,
    provider: input.provider.provider,
    providerConnectionId: input.connection.providerConnectionId,
    transaction: input.providerTransaction,
  });
  const providerTransactionId = draft.providerTransactionId;

  if (!providerTransactionId) {
    throw new AppError("CONFLICT", "Provider transaction id is required");
  }

  const providerDuplicate = await input.repository.getTransactionByProviderTransactionId(
    draft.teamId,
    providerTransactionId,
  );

  if (providerDuplicate) {
    await input.repository.upsertProviderObject({
      teamId: draft.teamId,
      provider: input.provider.provider,
      providerObjectType: "transaction",
      providerObjectId: providerTransactionId,
      connectionId: input.connection.id,
      bankAccountId: input.bankAccount.id,
      internalEntityType: "transaction",
      internalEntityId: providerDuplicate.id,
      rawPayload: input.providerTransaction.rawPayload,
    });
    return null;
  }

  const duplicateKey = ledgerDuplicateKey(draft);
  const duplicate = await input.repository.getTransactionByDuplicateKey(draft.teamId, duplicateKey);

  if (duplicate) {
    await input.repository.upsertProviderObject({
      teamId: draft.teamId,
      provider: input.provider.provider,
      providerObjectType: "transaction",
      providerObjectId: providerTransactionId,
      connectionId: input.connection.id,
      bankAccountId: input.bankAccount.id,
      internalEntityType: "transaction",
      internalEntityId: duplicate.id,
      rawPayload: input.providerTransaction.rawPayload,
    });
    return null;
  }

  const transaction = await input.repository.createLedgerTransactionForTeam({
    draft,
    duplicateKey,
  });

  await input.repository.upsertProviderObject({
    teamId: draft.teamId,
    provider: input.provider.provider,
    providerObjectType: "transaction",
    providerObjectId: providerTransactionId,
    connectionId: input.connection.id,
    bankAccountId: input.bankAccount.id,
    internalEntityType: "transaction",
    internalEntityId: transaction.id,
    rawPayload: input.providerTransaction.rawPayload,
  });

  return transaction;
}

function persistedProviderConnection(connection: BankConnection): BankingProviderConnection {
  if (connection.status !== "connected") {
    throw new AppError("CONFLICT", "Bank connection is not connected");
  }

  return {
    provider: connection.provider,
    providerConnectionId: connection.providerConnectionId,
    institutionName: connection.institutionName,
    status: "connected",
    rawPayload: {},
  };
}

export function connectMockBankConnectionFingerprint(
  command: ConnectMockBankConnectionCommand,
  provider: BankingProviderName,
) {
  return JSON.stringify({
    teamId: command.teamId,
    provider,
  });
}

export function syncBankConnectionFingerprint(
  command: SyncBankConnectionCommand,
  provider: BankingProviderName,
) {
  return JSON.stringify({
    teamId: command.teamId,
    connectionId: command.connectionId,
    provider,
  });
}

function normalizeDocumentUploadCommand(command: CreateDocumentUploadCommand) {
  const fileName = command.fileName.trim();
  const contentType = command.contentType.trim().toLowerCase();

  if (!fileName) {
    throw new AppError("CONFLICT", "Document file name is required");
  }

  if (!contentType) {
    throw new AppError("CONFLICT", "Document content type is required");
  }

  if (!Number.isSafeInteger(command.byteSize) || command.byteSize <= 0) {
    throw new AppError("CONFLICT", "Document byte size is invalid");
  }

  return {
    teamId: command.teamId,
    fileName,
    contentType,
    byteSize: command.byteSize,
    checksumSha256: command.checksumSha256?.trim() || null,
    idempotencyKey: command.idempotencyKey,
  };
}

export function createDocumentUploadFingerprint(command: CreateDocumentUploadCommand) {
  const normalized = normalizeDocumentUploadCommand(command);

  return JSON.stringify({
    teamId: normalized.teamId,
    fileName: normalized.fileName,
    contentType: normalized.contentType,
    byteSize: normalized.byteSize,
    checksumSha256: normalized.checksumSha256,
  });
}

export function createDeterministicDocumentExtractor(): DocumentExtractionProvider {
  return {
    source: "local_deterministic",
    async extract(input) {
      const rawText = input.rawText.trim();
      const text = rawText || input.fileName;
      const fields = inferDocumentExtractionFields(text, input.fileName);

      return {
        fields,
        confidence: confidenceForExtractedFields(fields, rawText.length > 0),
        rawText,
      };
    },
  };
}

function inferDocumentExtractionFields(text: string, fileName: string): DocumentExtractionFields {
  const currencyMatch = text.match(/\b(USD|EUR|GBP|SEK|NOK|DKK)\b/i);
  const amountMatch = text.match(/(?:total|amount|paid|due)[^\d-]*(-?\d+(?:[.,]\d{1,2})?)/i);
  const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const invoiceMatch = text.match(/\b(?:invoice|receipt|ref)[\s#:]*([A-Z0-9-]{3,})\b/i);
  const merchantName =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !/^(total|amount|date|invoice)\b/i.test(line)) ??
    titleFromFileName(fileName);

  return normalizeDocumentExtractionFields({
    documentType: /invoice/i.test(text)
      ? "invoice_received"
      : /statement/i.test(text)
        ? "bank_statement"
        : /receipt/i.test(text) || amountMatch
          ? "receipt"
          : "other",
    merchantName,
    issuedAt: dateMatch?.[1] ?? null,
    invoiceNumber: invoiceMatch?.[1] ?? null,
    totalAmountMinor: amountMatch ? decimalAmountToMinor(amountMatch[1] ?? "0") : null,
    currency: currencyMatch?.[1]?.toUpperCase() ?? null,
  });
}

function normalizeDocumentExtractionFields(
  fields: DocumentExtractionFields,
): DocumentExtractionFields {
  return {
    documentType: fields.documentType ?? null,
    merchantName: normalizedOptionalText(fields.merchantName),
    customerName: normalizedOptionalText(fields.customerName),
    issuedAt: normalizedOptionalText(fields.issuedAt),
    dueAt: normalizedOptionalText(fields.dueAt),
    invoiceNumber: normalizedOptionalText(fields.invoiceNumber),
    totalAmountMinor:
      typeof fields.totalAmountMinor === "number" && Number.isSafeInteger(fields.totalAmountMinor)
        ? fields.totalAmountMinor
        : null,
    currency: normalizedOptionalText(fields.currency)?.toUpperCase() ?? null,
    taxAmountMinor:
      typeof fields.taxAmountMinor === "number" && Number.isSafeInteger(fields.taxAmountMinor)
        ? fields.taxAmountMinor
        : null,
  };
}

function normalizeDocumentExtractionConfidence(
  confidence: DocumentExtractionConfidence,
): DocumentExtractionConfidence {
  return Object.fromEntries(
    Object.entries(confidence)
      .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
      .map(([key, value]) => [key, Math.max(0, Math.min(1, value ?? 0))]),
  ) as DocumentExtractionConfidence;
}

function confidenceForExtractedFields(
  fields: DocumentExtractionFields,
  hasRawText: boolean,
): DocumentExtractionConfidence {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key]) => [key, hasRawText ? 0.72 : 0.35]),
  ) as DocumentExtractionConfidence;
}

function correctionConfidence(fields: DocumentExtractionFields): DocumentExtractionConfidence {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key]) => [key, 1]),
  ) as DocumentExtractionConfidence;
}

function normalizedOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function decimalAmountToMinor(value: string) {
  const normalized = value.replace(",", ".");
  const [major = "0", minor = ""] = normalized.split(".");
  const sign = major.trim().startsWith("-") ? -1 : 1;
  const majorDigits = major.replace(/[^0-9]/g, "");
  const minorDigits = minor
    .replace(/[^0-9]/g, "")
    .padEnd(2, "0")
    .slice(0, 2);

  return sign * (Number(majorDigits || "0") * 100 + Number(minorDigits || "0"));
}

function documentObjectKey(
  teamId: string,
  documentId: string,
  versionId: string,
  fileName: string,
) {
  return `teams/${teamId}/documents/${documentId}/versions/${versionId}/${safeObjectFileName(fileName)}`;
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim() || fileName;
}

function safeObjectFileName(fileName: string) {
  return (
    fileName
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "document"
  );
}

export async function previewCsvTransactionImport(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: PreviewCsvTransactionImportCommand,
): Promise<CsvTransactionImportPreview> {
  assertCommandTeamMatchesContext(context, command.teamId, "CSV import not found");

  await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "transactions.write",
    "You cannot import transactions for this team",
  );

  const account = await repository.getLedgerAccountForTeam(command.teamId, command.accountId);

  if (!account) {
    throw new AppError("NOT_FOUND", "Ledger account not found");
  }

  if (command.mapping.categoryId) {
    const category = await repository.getCategoryForTeam(
      command.teamId,
      command.mapping.categoryId,
    );

    if (!category) {
      throw new AppError("NOT_FOUND", "Category not found");
    }
  }

  return buildCsvImportPreview(repository, command, account);
}

export async function commitCsvTransactionImport(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: CommitCsvTransactionImportCommand,
): Promise<CommitCsvTransactionImportResult> {
  return repository.withTransaction(async (transactionRepository) => {
    assertCommandTeamMatchesContext(context, command.teamId, "CSV import not found");

    await resolveTeamAccess(
      transactionRepository,
      { ...context, teamId: command.teamId },
      "transactions.write",
      "You cannot import transactions for this team",
    );

    const fingerprint = csvTransactionImportFingerprint(command);
    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      commitCsvTransactionImportOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different CSV import",
        );
      }

      return { ...(replayed.result as CommitCsvTransactionImportResult), replayed: true };
    }

    const account = await transactionRepository.getLedgerAccountForTeam(
      command.teamId,
      command.accountId,
    );

    if (!account) {
      throw new AppError("NOT_FOUND", "Ledger account not found");
    }

    if (command.mapping.categoryId) {
      const category = await transactionRepository.getCategoryForTeam(
        command.teamId,
        command.mapping.categoryId,
      );

      if (!category) {
        throw new AppError("NOT_FOUND", "Category not found");
      }
    }

    const preview = await buildCsvImportPreview(transactionRepository, command, account);
    const readyRows = preview.rows.filter((row) => row.status === "ready" && row.draft);

    if (readyRows.length === 0) {
      throw new AppError("CONFLICT", "CSV import has no rows ready to commit");
    }

    const transactions: Transaction[] = [];

    for (const row of readyRows) {
      if (!row.draft || !row.duplicateKey) {
        continue;
      }

      transactions.push(
        await transactionRepository.createLedgerTransactionForTeam({
          draft: row.draft,
          duplicateKey: row.duplicateKey,
        }),
      );
    }

    const importSession = await transactionRepository.createTransactionImportSession({
      teamId: command.teamId,
      accountId: command.accountId,
      actorId: context.actor.id,
      fileName: command.fileName ?? null,
      mapping: command.mapping,
      rowCount: preview.totalRows,
      importedCount: transactions.length,
      duplicateCount: preview.duplicateCount,
      invalidCount: preview.invalidCount,
    });

    await transactionRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "transaction_import.committed",
      entityType: "transaction_import",
      entityId: importSession.id,
      metadata: {
        accountId: command.accountId,
        importedCount: transactions.length,
        duplicateCount: preview.duplicateCount,
        invalidCount: preview.invalidCount,
      },
    });

    await transactionRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "transaction_import.committed",
      version: 1,
      payload: {
        importSessionId: importSession.id,
        transactionIds: transactions.map((transaction) => transaction.id),
        accountId: command.accountId,
      },
    });

    const result = { importSession, transactions, preview, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: commitCsvTransactionImportOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export function csvTransactionImportFingerprint(command: CommitCsvTransactionImportCommand) {
  return JSON.stringify({
    teamId: command.teamId,
    accountId: command.accountId,
    csvText: command.csvText,
    mapping: command.mapping,
    fileName: command.fileName ?? null,
  });
}

async function buildCsvImportPreview(
  repository: TransactionReviewRepository,
  command: PreviewCsvTransactionImportCommand,
  account: LedgerAccount,
): Promise<CsvTransactionImportPreview> {
  let rows;

  try {
    rows = parseCsvTransactionRows(command.csvText);
  } catch (error) {
    throw new AppError(
      "CONFLICT",
      error instanceof Error ? error.message : "CSV import file is invalid",
    );
  }

  const seenDuplicateKeys = new Set<string>();
  const previewRows: CsvTransactionImportPreviewRow[] = [];

  for (const row of rows) {
    try {
      const draft = csvRowToLedgerDraft({
        teamId: command.teamId,
        accountId: command.accountId,
        accountCurrency: account.currency,
        mapping: command.mapping,
        row,
        categoryId: command.mapping.categoryId ?? null,
      });
      const duplicateKey = ledgerDuplicateKey(draft);
      const duplicateInFile = seenDuplicateKeys.has(duplicateKey);
      const duplicateInLedger = duplicateInFile
        ? null
        : await repository.getTransactionByDuplicateKey(command.teamId, duplicateKey);

      seenDuplicateKeys.add(duplicateKey);

      previewRows.push({
        rowNumber: row.rowNumber,
        values: row.values,
        status: duplicateInFile || duplicateInLedger ? "duplicate" : "ready",
        errors: duplicateInFile
          ? ["Duplicate row in this file"]
          : duplicateInLedger
            ? ["Duplicate transaction already exists"]
            : [],
        duplicateKey,
        draft,
      });
    } catch (error) {
      previewRows.push({
        rowNumber: row.rowNumber,
        values: row.values,
        status: "invalid",
        errors: [error instanceof Error ? error.message : "CSV row is invalid"],
        duplicateKey: null,
        draft: null,
      });
    }
  }

  return {
    teamId: command.teamId,
    accountId: command.accountId,
    rows: previewRows,
    totalRows: previewRows.length,
    readyCount: previewRows.filter((row) => row.status === "ready").length,
    duplicateCount: previewRows.filter((row) => row.status === "duplicate").length,
    invalidCount: previewRows.filter((row) => row.status === "invalid").length,
  };
}

function normalizeLedgerTransactionDraft(
  command: CreateLedgerTransactionCommand,
): LedgerTransactionDraft {
  const draft = {
    teamId: command.teamId,
    accountId: command.accountId,
    description: command.description.trim(),
    postedAt: new Date(command.postedAt).toISOString(),
    money: command.money,
    type: command.type,
    source: command.source,
    categoryId: command.categoryId ?? null,
    counterpartyId: command.counterpartyId ?? null,
    providerTransactionId: command.providerTransactionId?.trim() || null,
    splits: command.splits ?? [],
    tagIds: command.tagIds ?? [],
  } satisfies LedgerTransactionDraft;

  assertLedgerTransactionDraft(draft);

  return draft;
}

export async function inviteTeamMember(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: InviteTeamMemberCommand,
): Promise<InviteTeamMemberResult> {
  return repository.withTransaction(async (transactionRepository) => {
    assertCommandTeamMatchesContext(context, command.teamId, "Team not found");

    await resolveTeamAccess(
      transactionRepository,
      { ...context, teamId: command.teamId },
      "team.manage",
      "You cannot invite members to this team",
    );

    const normalizedEmail = normalizeInviteEmail(command.email);
    assertInvitableRole(command.role);
    const fingerprint = inviteTeamMemberFingerprint({ ...command, email: normalizedEmail });

    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      inviteTeamMemberOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different invite");
      }

      return { ...(replayed.result as InviteTeamMemberResult), replayed: true };
    }

    const invite = await transactionRepository.createTeamInvite({
      teamId: command.teamId,
      email: normalizedEmail,
      role: command.role,
      invitedByActorId: context.actor.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    });

    await transactionRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "team.member_invited",
      entityType: "team_invite",
      entityId: invite.id,
      metadata: {
        email: invite.email,
        role: invite.role,
      },
    });

    await transactionRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "team.member_invited",
      version: 1,
      payload: {
        inviteId: invite.id,
        email: invite.email,
        role: invite.role,
      },
    });

    const result = { invite, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: inviteTeamMemberOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function listTeamDirectory(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
): Promise<TeamDirectory> {
  const access = await resolveTeamAccess(
    repository,
    context,
    "team.manage",
    "You cannot manage members for this team",
  );
  const [members, pendingInvites] = await Promise.all([
    repository.listTeamMembers(access.teamId),
    repository.listPendingTeamInvites(access.teamId),
  ]);

  return {
    teamId: access.teamId,
    members,
    pendingInvites,
  };
}

export async function acceptTeamInvite(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: AcceptTeamInviteCommand,
): Promise<AcceptTeamInviteResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const invite = await transactionRepository.getTeamInvite(command.inviteId);

    if (!invite) {
      throw new AppError("NOT_FOUND", "Team invite not found");
    }

    const fingerprint = acceptTeamInviteFingerprint(command);
    const replayed = await transactionRepository.getIdempotencyResult(
      invite.teamId,
      context.actor.id,
      acceptTeamInviteOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different invite acceptance",
        );
      }

      return { ...(replayed.result as AcceptTeamInviteResult), replayed: true };
    }

    assertActorCanAcceptInvite(context.actor, invite);

    const existingMembership = await transactionRepository.getMembership(
      context.actor,
      invite.teamId,
    );

    if (existingMembership) {
      throw new AppError("CONFLICT", "You already belong to this team");
    }

    const membership = await transactionRepository.addTeamMembership({
      teamId: invite.teamId,
      userId: context.actor.id,
      role: invite.role,
    });
    const acceptedInvite = await transactionRepository.markTeamInviteAccepted({
      inviteId: invite.id,
      acceptedAt: new Date(),
    });

    await transactionRepository.appendAuditEvent({
      teamId: invite.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "team.invite_accepted",
      entityType: "team_invite",
      entityId: invite.id,
      metadata: {
        email: invite.email,
        role: invite.role,
      },
    });

    await transactionRepository.appendOutboxEvent({
      teamId: invite.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "team.invite_accepted",
      version: 1,
      payload: {
        inviteId: invite.id,
        userId: context.actor.id,
        role: invite.role,
      },
    });

    const result = { membership, invite: acceptedInvite, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: invite.teamId,
      actorId: context.actor.id,
      operation: acceptTeamInviteOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function updateTeamMemberRole(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: UpdateTeamMemberRoleCommand,
): Promise<UpdateTeamMemberRoleResult> {
  return repository.withTransaction(async (transactionRepository) => {
    assertCommandTeamMatchesContext(context, command.teamId, "Team member not found");

    await resolveTeamAccess(
      transactionRepository,
      { ...context, teamId: command.teamId },
      "team.manage",
      "You cannot manage members for this team",
    );

    if (context.actor.id === command.userId) {
      throw new AppError("CONFLICT", "You cannot update your own role");
    }

    assertManagedRole(command.role);

    const fingerprint = updateTeamMemberRoleFingerprint(command);
    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updateTeamMemberRoleOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different role update",
        );
      }

      return { ...(replayed.result as UpdateTeamMemberRoleResult), replayed: true };
    }

    const existingMembership = await transactionRepository.getTeamMemberByUserId(
      command.teamId,
      command.userId,
    );

    if (!existingMembership) {
      throw new AppError("NOT_FOUND", "Team member not found");
    }

    assertManagedRole(existingMembership.role);

    const membership = await transactionRepository.updateTeamMemberRole({
      teamId: command.teamId,
      userId: command.userId,
      role: command.role,
    });

    await transactionRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "team.member_role_updated",
      entityType: "team_membership",
      entityId: membership.id,
      metadata: {
        userId: command.userId,
        previousRole: existingMembership.role,
        nextRole: membership.role,
      },
    });

    await transactionRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "team.member_role_updated",
      version: 1,
      payload: {
        membershipId: membership.id,
        userId: command.userId,
        previousRole: existingMembership.role,
        nextRole: membership.role,
      },
    });

    const result = { membership, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updateTeamMemberRoleOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function resolveTeamAccess(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  permission: Permission,
  forbiddenMessage = "You cannot access this team",
): Promise<ResolvedTeamAccess> {
  const defaultWorkspace = context.teamId
    ? null
    : await repository.ensureDefaultWorkspace(context.actor);
  const teamId = context.teamId ?? defaultWorkspace?.teamId;

  if (!teamId) {
    throw new AppError("FORBIDDEN", forbiddenMessage);
  }

  const membership = await repository.getMembership(context.actor, teamId);

  if (!membership || !roleHasPermission(membership.role, permission)) {
    throw new AppError("FORBIDDEN", forbiddenMessage);
  }

  return {
    teamId,
    role: membership.role,
    permissions: permissionsForRole(membership.role),
  };
}

function assertActorCanAcceptInvite(actor: Actor, invite: TeamInvite) {
  const actorEmail = actor.email ? normalizeInviteEmail(actor.email) : null;

  if (!actorEmail || actorEmail !== invite.email) {
    throw new AppError("FORBIDDEN", "You cannot accept this team invite");
  }

  if (invite.status !== "pending") {
    throw new AppError("CONFLICT", "Team invite is not pending");
  }

  if (new Date(invite.expiresAt).getTime() <= Date.now()) {
    throw new AppError("CONFLICT", "Team invite has expired");
  }
}

function normalizeInviteEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AppError("CONFLICT", "Invite email is invalid");
  }

  return normalizedEmail;
}

export function acceptTeamInviteFingerprint(command: AcceptTeamInviteCommand) {
  return JSON.stringify({
    inviteId: command.inviteId,
  });
}

export function inviteTeamMemberFingerprint(command: InviteTeamMemberCommand) {
  assertInvitableRole(command.role);

  return JSON.stringify({
    teamId: command.teamId,
    email: normalizeInviteEmail(command.email),
    role: command.role,
  });
}

export function updateTeamMemberRoleFingerprint(command: UpdateTeamMemberRoleCommand) {
  assertManagedRole(command.role);

  return JSON.stringify({
    teamId: command.teamId,
    userId: command.userId,
    role: command.role,
  });
}

function assertInvitableRole(role: TeamRole) {
  if (role === "owner") {
    throw new AppError("CONFLICT", "Owner role cannot be assigned by invite");
  }
}

function assertManagedRole(role: TeamRole) {
  if (role === "owner") {
    throw new AppError("CONFLICT", "Owner role changes require ownership transfer");
  }
}

function assertCommandTeamMatchesContext(
  context: TransactionReviewContext,
  teamId: string,
  message: string,
) {
  if (context.teamId && context.teamId !== teamId) {
    throw new AppError("NOT_FOUND", message);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Outbox dispatch failed";
}
