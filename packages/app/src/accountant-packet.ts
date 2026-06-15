import { createHash } from "node:crypto";

import type {
  LedgerAccount,
  Money,
  Transaction,
  TransactionAccountantStatus,
  TransactionTag,
  Counterparty,
  Category,
} from "@dawn/domain";
import { isTransactionReadyForAccountantExport } from "@dawn/domain";

import {
  AppError,
  resolveTeamAccess,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";
import type { DocumentUrlSigner } from "./documents-inbox";

export type AccountantPacketAttachment = {
  transactionId: string;
  documentId: string;
  inboxItemId?: string | null;
  versionId: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  title?: string | null;
};

export type AccountantPacketTransactionRow = {
  transaction: Transaction;
  account: Pick<LedgerAccount, "id" | "name" | "currency"> | null;
  category: Pick<Category, "id" | "name"> | null;
  counterparty: Pick<Counterparty, "id" | "name"> | null;
  tags: Pick<TransactionTag, "id" | "name">[];
  attachments: AccountantPacketAttachment[];
};

export type AccountantPacketFormat = "csv" | "xlsx";
export type AccountantPacketCsvDelimiter = "," | ";" | "\t";

export type ExportAccountantPacketCommand = {
  teamId: string;
  from: string;
  to: string;
  transactionIds?: readonly string[];
  formats?: readonly AccountantPacketFormat[];
  csvDelimiter?: AccountantPacketCsvDelimiter;
  idempotencyKey: string;
};

export type AccountantPacketAttachmentResolver = {
  readAttachment(
    attachment: AccountantPacketAttachment,
  ): Promise<{ body: ArrayBuffer | Uint8Array; contentType?: string | null } | null>;
};

export type AccountantPacketManifestFile = {
  path: string;
  kind: "transactions_csv" | "transactions_xlsx" | "manifest_json" | "attachment";
  contentType: string;
  byteSize: number;
  sha256: string;
  sourceDocumentId?: string;
  sourceVersionId?: string;
  transactionId?: string;
};

export type AccountantPacketManifest = {
  packetId: string;
  teamId: string;
  actorId: string;
  generatedAt: string;
  filters: {
    from: string;
    to: string;
    transactionIds: string[];
  };
  settings: {
    formats: AccountantPacketFormat[];
    csvDelimiter: AccountantPacketCsvDelimiter;
  };
  transactionCount: number;
  attachmentCount: number;
  skippedAttachmentCount: number;
  currencyTotals: Record<string, Money>;
  files: AccountantPacketManifestFile[];
};

export type ExportAccountantPacketResult = {
  packetId: string;
  fileName: string;
  contentType: "application/zip";
  bodyBase64: string;
  byteSize: number;
  manifest: AccountantPacketManifest;
  replayed: boolean;
};

export type RequestAccountantPacketExportResult = {
  teamId: string;
  workflow: {
    type: "accountant_packet_export";
    status: "queued";
    description: string;
    nextStep: string;
  };
  requestedAt: string;
  replayed?: boolean;
};

export type CompleteStoredAccountantPacketExportCommand = ExportAccountantPacketCommand & {
  actorId: string;
  sourceOutboxEventId: string;
  generatedAt?: string;
};

export type StoredAccountantPacketExportResult = Omit<
  ExportAccountantPacketResult,
  "bodyBase64" | "replayed"
> & {
  objectKey: string;
  replayed?: boolean;
};

export type AccountantPacketExportRecord = Omit<StoredAccountantPacketExportResult, "replayed"> & {
  teamId: string;
  actorId: string;
  createdAt: string;
};

export type CreateAccountantPacketDownloadCommand = {
  teamId: string;
  packetId: string;
};

export type CreateAccountantPacketDownloadResult = {
  packet: AccountantPacketExportRecord;
  downloadUrl: string;
  downloadExpiresAt: string;
};

export type AccountantPacketArchiveStorage = {
  put(input: {
    objectKey: string;
    body: ArrayBuffer;
    contentType: "application/zip";
  }): Promise<void>;
};

export interface AccountantPacketRepository extends TransactionReviewRepository {
  listAccountantPacketTransactionRows(input: {
    teamId: string;
    from: string;
    to: string;
    transactionIds?: readonly string[];
  }): Promise<AccountantPacketTransactionRow[]>;
  updateTransactionAccountantStatusForTeam(input: {
    teamId: string;
    transactionId: string;
    accountantStatus: TransactionAccountantStatus;
    reason?: string | null;
  }): Promise<Transaction>;
  createAccountantPacketExportRecord(
    input: AccountantPacketExportRecord,
  ): Promise<AccountantPacketExportRecord>;
  getAccountantPacketExportForTeam(
    teamId: string,
    packetId: string,
  ): Promise<AccountantPacketExportRecord | null>;
  listAccountantPacketExports(
    teamId: string,
    limit: number,
  ): Promise<AccountantPacketExportRecord[]>;
}

type PacketFile = {
  path: string;
  contentType: string;
  bytes: Uint8Array;
  kind: AccountantPacketManifestFile["kind"];
  sourceDocumentId?: string;
  sourceVersionId?: string;
  transactionId?: string;
};

const exportAccountantPacketOperation = "accountant_packet.export";
const requestAccountantPacketExportOperation = "accountant_packet.export.request";
const completeStoredAccountantPacketExportOperation = "accountant_packet.export.complete";
const accountantPacketExportSystemActorId = "system:accountant-packet-export";

export async function exportAccountantPacket(
  repository: AccountantPacketRepository,
  context: TransactionReviewContext,
  command: ExportAccountantPacketCommand,
  attachmentResolver?: AccountantPacketAttachmentResolver,
): Promise<ExportAccountantPacketResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const packetRepository = transactionRepository as AccountantPacketRepository;

    assertExportCommand(command);

    await resolveTeamAccess(
      packetRepository,
      { ...context, teamId: command.teamId },
      "transactions.export",
      "You cannot export accountant packets for this team",
    );

    const fingerprint = exportAccountantPacketFingerprint(command);
    const replayed = await packetRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      exportAccountantPacketOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different accountant packet export",
        );
      }

      return { ...(replayed.result as ExportAccountantPacketResult), replayed: true };
    }

    const result = await buildExportableAccountantPacket({
      repository: packetRepository,
      actorId: context.actor.id,
      command,
      attachmentResolver,
    });
    await recordSuccessfulAccountantPacketExport(packetRepository, {
      actorId: context.actor.id,
      requestId: context.requestId,
      result,
    });

    await packetRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: exportAccountantPacketOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function requestAccountantPacketExport(
  repository: AccountantPacketRepository,
  context: TransactionReviewContext,
  command: ExportAccountantPacketCommand,
): Promise<RequestAccountantPacketExportResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const packetRepository = transactionRepository as AccountantPacketRepository;

    assertExportCommand(command);

    await resolveTeamAccess(
      packetRepository,
      { ...context, teamId: command.teamId },
      "transactions.export",
      "You cannot export accountant packets for this team",
    );

    const fingerprint = exportAccountantPacketFingerprint(command);
    const replayed = await packetRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      requestAccountantPacketExportOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different accountant packet export request",
        );
      }

      return { ...(replayed.result as RequestAccountantPacketExportResult), replayed: true };
    }

    const exportableRows = await listExportableAccountantPacketRows(packetRepository, command);

    if (exportableRows.length === 0) {
      throw new AppError("CONFLICT", "No ready-to-export transactions are available for export");
    }

    const settings = normalizeExportSettings(command);
    const transactionIds = exportableRows.map((row) => row.transaction.id).sort();
    const requestedAt = new Date().toISOString();
    const result: RequestAccountantPacketExportResult = {
      teamId: command.teamId,
      workflow: {
        type: "accountant_packet_export",
        status: "queued",
        description:
          "Accountant packet export will generate a ZIP archive, store it, and mark included transactions exported only after storage succeeds.",
        nextStep: `Export request queued ${requestedAt}. Worker delivery will write the packet archive to object storage.`,
      },
      requestedAt,
      replayed: false,
    };

    await packetRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "accountant_packet.export_requested",
      entityType: "accountant_packet",
      entityId: command.idempotencyKey,
      metadata: {
        from: normalizeDate(command.from, "from").toISOString(),
        to: normalizeDate(command.to, "to").toISOString(),
        transactionIds,
        formats: settings.formats,
        csvDelimiter: settings.csvDelimiter,
        transactionCount: transactionIds.length,
        requestedAt,
      },
    });
    await packetRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "accountant_packet.export_requested",
      version: 1,
      payload: {
        actorId: context.actor.id,
        from: normalizeDate(command.from, "from").toISOString(),
        to: normalizeDate(command.to, "to").toISOString(),
        transactionIds,
        formats: settings.formats,
        csvDelimiter: settings.csvDelimiter,
        transactionCount: transactionIds.length,
        requestedAt,
      },
    });
    await packetRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: requestAccountantPacketExportOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function completeStoredAccountantPacketExport(
  repository: AccountantPacketRepository,
  storage: AccountantPacketArchiveStorage,
  command: CompleteStoredAccountantPacketExportCommand,
  attachmentResolver?: AccountantPacketAttachmentResolver,
): Promise<StoredAccountantPacketExportResult> {
  assertExportCommand(command);

  if (!command.actorId.trim()) {
    throw new AppError("CONFLICT", "Accountant packet export actor is required");
  }

  if (!command.sourceOutboxEventId.trim()) {
    throw new AppError("CONFLICT", "Accountant packet export source event is required");
  }

  const fingerprint = storedAccountantPacketExportFingerprint(command);
  const replayed = await repository.getIdempotencyResult(
    command.teamId,
    accountantPacketExportSystemActorId,
    completeStoredAccountantPacketExportOperation,
    command.idempotencyKey,
  );

  if (replayed) {
    if (replayed.fingerprint !== fingerprint) {
      throw new AppError(
        "CONFLICT",
        "Idempotency key was already used for a different stored accountant packet export",
      );
    }

    return { ...(replayed.result as StoredAccountantPacketExportResult), replayed: true };
  }

  const packet = await buildExportableAccountantPacket({
    repository,
    actorId: command.actorId,
    command,
    attachmentResolver,
    generatedAt: command.generatedAt,
  });
  const objectKey = accountantPacketObjectKey(command.teamId, packet.packetId);
  const body = arrayBufferFromBase64(packet.bodyBase64);

  await storage.put({
    objectKey,
    body,
    contentType: packet.contentType,
  });

  const result: StoredAccountantPacketExportResult = {
    packetId: packet.packetId,
    fileName: packet.fileName,
    objectKey,
    contentType: packet.contentType,
    byteSize: packet.byteSize,
    manifest: packet.manifest,
    replayed: false,
  };

  await repository.withTransaction(async (transactionRepository) => {
    const packetRepository = transactionRepository as AccountantPacketRepository;

    await packetRepository.createAccountantPacketExportRecord({
      packetId: result.packetId,
      teamId: command.teamId,
      actorId: command.actorId,
      objectKey: result.objectKey,
      fileName: result.fileName,
      contentType: result.contentType,
      byteSize: result.byteSize,
      manifest: result.manifest,
      createdAt: result.manifest.generatedAt,
    });
    await recordSuccessfulAccountantPacketExport(packetRepository, {
      actorId: command.actorId,
      requestId: command.idempotencyKey,
      result: packet,
      objectKey,
    });
    await packetRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: accountantPacketExportSystemActorId,
      operation: completeStoredAccountantPacketExportOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });
  });

  return result;
}

export async function createAccountantPacketDownload(
  repository: AccountantPacketRepository,
  signer: DocumentUrlSigner,
  context: TransactionReviewContext,
  command: CreateAccountantPacketDownloadCommand,
): Promise<CreateAccountantPacketDownloadResult> {
  await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "transactions.export",
    "You cannot download accountant packets for this team",
  );

  const packet = await repository.getAccountantPacketExportForTeam(
    command.teamId,
    command.packetId,
  );

  if (!packet) {
    throw new AppError("NOT_FOUND", "Accountant packet export not found");
  }

  const download = await signer.createDownloadUrl({
    teamId: command.teamId,
    documentId: packet.packetId,
    versionId: packet.packetId,
    objectKey: packet.objectKey,
    fileName: packet.fileName,
    contentType: packet.contentType,
  });

  await repository.appendAuditEvent({
    teamId: command.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    action: "accountant_packet.download_link_created",
    entityType: "accountant_packet",
    entityId: packet.packetId,
    metadata: {
      objectKey: packet.objectKey,
      expiresAt: download.expiresAt,
    },
  });

  return {
    packet,
    downloadUrl: download.url,
    downloadExpiresAt: download.expiresAt,
  };
}

export function exportAccountantPacketFingerprint(command: ExportAccountantPacketCommand) {
  return JSON.stringify({
    teamId: command.teamId,
    from: normalizeDate(command.from, "from").toISOString(),
    to: normalizeDate(command.to, "to").toISOString(),
    transactionIds: normalizedTransactionIds(command.transactionIds),
    settings: normalizeExportSettings(command),
  });
}

function storedAccountantPacketExportFingerprint(
  command: CompleteStoredAccountantPacketExportCommand,
) {
  return JSON.stringify({
    actorId: command.actorId,
    sourceOutboxEventId: command.sourceOutboxEventId,
    export: JSON.parse(exportAccountantPacketFingerprint(command)) as unknown,
  });
}

async function listExportableAccountantPacketRows(
  repository: AccountantPacketRepository,
  command: ExportAccountantPacketCommand,
) {
  const rows = await repository.listAccountantPacketTransactionRows({
    teamId: command.teamId,
    from: command.from,
    to: command.to,
    transactionIds: normalizedTransactionIds(command.transactionIds),
  });

  return rows.filter((row) => isTransactionReadyForAccountantExport(row.transaction));
}

async function buildExportableAccountantPacket(input: {
  repository: AccountantPacketRepository;
  actorId: string;
  command: ExportAccountantPacketCommand;
  attachmentResolver?: AccountantPacketAttachmentResolver;
  generatedAt?: string;
}): Promise<ExportAccountantPacketResult> {
  const exportableRows = await listExportableAccountantPacketRows(input.repository, input.command);

  if (exportableRows.length === 0) {
    throw new AppError("CONFLICT", "No ready-to-export transactions are available for export");
  }

  return buildAccountantPacket({
    teamId: input.command.teamId,
    actorId: input.actorId,
    from: input.command.from,
    to: input.command.to,
    transactionIds: exportableRows.map((row) => row.transaction.id).sort(),
    settings: normalizeExportSettings(input.command),
    rows: exportableRows,
    attachmentResolver: input.attachmentResolver,
    generatedAt: input.generatedAt,
  });
}

async function recordSuccessfulAccountantPacketExport(
  repository: AccountantPacketRepository,
  input: {
    actorId: string;
    requestId: string;
    result: ExportAccountantPacketResult;
    objectKey?: string;
  },
) {
  await Promise.all(
    input.result.manifest.filters.transactionIds.map((transactionId) =>
      repository.updateTransactionAccountantStatusForTeam({
        teamId: input.result.manifest.teamId,
        transactionId,
        accountantStatus: "exported",
        reason: `Accountant packet ${input.result.packetId}`,
      }),
    ),
  );

  const storageMetadata = input.objectKey
    ? { objectKey: input.objectKey, byteSize: input.result.byteSize }
    : {};
  const metadata = {
    from: input.result.manifest.filters.from,
    to: input.result.manifest.filters.to,
    transactionCount: input.result.manifest.transactionCount,
    attachmentCount: input.result.manifest.attachmentCount,
    skippedAttachmentCount: input.result.manifest.skippedAttachmentCount,
    transactionIds: input.result.manifest.filters.transactionIds,
    ...storageMetadata,
  };

  await repository.appendAuditEvent({
    teamId: input.result.manifest.teamId,
    actorId: input.actorId,
    requestId: input.requestId,
    action: "accountant_packet.exported",
    entityType: "accountant_packet",
    entityId: input.result.packetId,
    metadata,
  });

  await repository.appendOutboxEvent({
    teamId: input.result.manifest.teamId,
    actorId: input.actorId,
    requestId: input.requestId,
    type: "accountant_packet.exported",
    version: 1,
    payload: {
      packetId: input.result.packetId,
      from: input.result.manifest.filters.from,
      to: input.result.manifest.filters.to,
      transactionIds: input.result.manifest.filters.transactionIds,
      transactionCount: input.result.manifest.transactionCount,
      attachmentCount: input.result.manifest.attachmentCount,
      ...storageMetadata,
    },
  });
}

async function buildAccountantPacket(input: {
  teamId: string;
  actorId: string;
  from: string;
  to: string;
  transactionIds: string[];
  settings: AccountantPacketManifest["settings"];
  rows: AccountantPacketTransactionRow[];
  attachmentResolver?: AccountantPacketAttachmentResolver;
  generatedAt?: string;
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const packetId = packetIdForExport({
    teamId: input.teamId,
    actorId: input.actorId,
    generatedAt,
    from: input.from,
    to: input.to,
    transactionIds: input.transactionIds,
  });
  const transactionFiles: PacketFile[] = [];
  const attachmentFiles: PacketFile[] = [];

  if (input.settings.formats.includes("csv")) {
    transactionFiles.push({
      path: "transactions.csv",
      contentType: "text/csv; charset=utf-8",
      bytes: textBytes(renderTransactionsCsv(input.rows, input.settings.csvDelimiter)),
      kind: "transactions_csv",
    });
  }

  if (input.settings.formats.includes("xlsx")) {
    transactionFiles.push({
      path: "transactions.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: renderTransactionsXlsx(input.rows),
      kind: "transactions_xlsx",
    });
  }

  let skippedAttachmentCount = 0;

  for (const row of input.rows) {
    for (const attachment of row.attachments) {
      const resolved = input.attachmentResolver
        ? await input.attachmentResolver.readAttachment(attachment)
        : null;

      if (!resolved) {
        skippedAttachmentCount += 1;
        continue;
      }

      attachmentFiles.push({
        path: attachmentPath(row.transaction, attachment),
        contentType: resolved.contentType ?? attachment.contentType,
        bytes: bytesFromBody(resolved.body),
        kind: "attachment",
        sourceDocumentId: attachment.documentId,
        sourceVersionId: attachment.versionId,
        transactionId: row.transaction.id,
      });
    }
  }

  const manifest: AccountantPacketManifest = {
    packetId,
    teamId: input.teamId,
    actorId: input.actorId,
    generatedAt,
    filters: {
      from: normalizeDate(input.from, "from").toISOString(),
      to: normalizeDate(input.to, "to").toISOString(),
      transactionIds: input.transactionIds,
    },
    settings: input.settings,
    transactionCount: input.rows.length,
    attachmentCount: attachmentFiles.length,
    skippedAttachmentCount,
    currencyTotals: currencyTotals(input.rows.map((row) => row.transaction.money)),
    files: [],
  };
  const filesBeforeManifest = [...transactionFiles, ...attachmentFiles];

  const manifestFile = {
    path: "manifest.json",
    contentType: "application/json; charset=utf-8",
    bytes: textBytes(
      JSON.stringify({ ...manifest, files: manifestFiles(filesBeforeManifest) }, null, 2),
    ),
    kind: "manifest_json" as const,
  };
  const finalFiles = [...transactionFiles, manifestFile, ...attachmentFiles].filter(
    (file): file is PacketFile => Boolean(file),
  );
  manifest.files = manifestFiles(finalFiles);

  const zipBytes = createStoredZip(finalFiles);

  return {
    packetId,
    fileName: `accountant-packet-${input.teamId}-${dateSlug(input.from)}-${dateSlug(input.to)}.zip`,
    contentType: "application/zip" as const,
    bodyBase64: Buffer.from(zipBytes).toString("base64"),
    byteSize: zipBytes.byteLength,
    manifest,
    replayed: false,
  } satisfies ExportAccountantPacketResult;
}

function assertExportCommand(command: ExportAccountantPacketCommand) {
  if (!command.teamId.trim()) {
    throw new AppError("NOT_FOUND", "Team not found");
  }

  const from = normalizeDate(command.from, "from");
  const to = normalizeDate(command.to, "to");

  if (from.getTime() > to.getTime()) {
    throw new AppError("CONFLICT", "Export start date must be before the end date");
  }

  if (!command.idempotencyKey.trim()) {
    throw new AppError("CONFLICT", "Export idempotency key is required");
  }

  normalizeExportSettings(command);
}

function normalizedTransactionIds(transactionIds: readonly string[] | undefined) {
  return [...new Set((transactionIds ?? []).map((id) => id.trim()).filter(Boolean))].sort();
}

function normalizeExportSettings(command: ExportAccountantPacketCommand) {
  const formats = normalizedFormats(command.formats);
  const csvDelimiter = normalizeCsvDelimiter(command.csvDelimiter);

  return {
    formats,
    csvDelimiter,
  };
}

function normalizedFormats(formats: readonly AccountantPacketFormat[] | undefined) {
  const normalized: AccountantPacketFormat[] = [
    ...new Set<AccountantPacketFormat>(formats ?? ["csv"]),
  ];

  if (normalized.length === 0) {
    throw new AppError("CONFLICT", "At least one export format is required");
  }

  for (const format of normalized) {
    if (format !== "csv" && format !== "xlsx") {
      throw new AppError("CONFLICT", "Export format must be csv or xlsx");
    }
  }

  return normalized;
}

function normalizeCsvDelimiter(delimiter: AccountantPacketCsvDelimiter | undefined) {
  if (!delimiter) {
    return ",";
  }

  if (delimiter !== "," && delimiter !== ";" && delimiter !== "\t") {
    throw new AppError("CONFLICT", "CSV delimiter must be comma, semicolon, or tab");
  }

  return delimiter;
}

function transactionExportTable(rows: AccountantPacketTransactionRow[]) {
  return [
    [
      "date",
      "description",
      "amount",
      "currency",
      "account",
      "category",
      "counterparty",
      "tags",
      "note",
      "review_state",
      "document_match_state",
      "attachment_names",
    ],
    ...rows.map((row) => [
      row.transaction.postedAt.slice(0, 10),
      row.transaction.description,
      moneyDecimal(row.transaction.money),
      row.transaction.money.currency,
      row.account?.name ?? "",
      row.category?.name ?? "",
      row.counterparty?.name ?? "",
      row.tags.map((tag) => tag.name).join("; "),
      "",
      row.transaction.reviewState,
      row.attachments.length > 0 ? "matched" : "missing",
      row.attachments.map((attachment) => attachment.fileName).join("; "),
    ]),
  ];
}

function renderTransactionsCsv(
  rows: AccountantPacketTransactionRow[],
  delimiter: AccountantPacketCsvDelimiter,
) {
  return transactionExportTable(rows)
    .map((row) => row.map((value) => csvCell(value, delimiter)).join(delimiter))
    .join("\n")
    .concat("\n");
}

function csvCell(value: string, delimiter: AccountantPacketCsvDelimiter) {
  return value.includes(delimiter) || /["\n\r]/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

function renderTransactionsXlsx(rows: AccountantPacketTransactionRow[]) {
  const table = transactionExportTable(rows);
  const sheetRows = table
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map(
            (value, columnIndex) =>
              `<c r="${xlsxCellRef(rowIndex, columnIndex)}" t="inlineStr"><is><t>${xmlText(
                value,
              )}</t></is></c>`,
          )
          .join("")}</row>`,
    )
    .join("");

  return createStoredZip([
    {
      path: "[Content_Types].xml",
      contentType: "application/xml",
      bytes: textBytes(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      ),
      kind: "transactions_xlsx",
    },
    {
      path: "_rels/.rels",
      contentType: "application/vnd.openxmlformats-package.relationships+xml",
      bytes: textBytes(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
      kind: "transactions_xlsx",
    },
    {
      path: "xl/workbook.xml",
      contentType: "application/xml",
      bytes: textBytes(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Transactions" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
      kind: "transactions_xlsx",
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      contentType: "application/vnd.openxmlformats-package.relationships+xml",
      bytes: textBytes(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      kind: "transactions_xlsx",
    },
    {
      path: "xl/worksheets/sheet1.xml",
      contentType: "application/xml",
      bytes: textBytes(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
      ),
      kind: "transactions_xlsx",
    },
  ]);
}

function xlsxCellRef(rowIndex: number, columnIndex: number) {
  let column = "";
  let next = columnIndex + 1;

  while (next > 0) {
    const remainder = (next - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    next = Math.floor((next - remainder) / 26);
  }

  return `${column}${rowIndex + 1}`;
}

function xmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function moneyDecimal(money: Money) {
  const sign = money.amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(money.amountMinor);
  const whole = Math.floor(absolute / 100);
  const fractional = String(absolute % 100).padStart(2, "0");

  return `${sign}${whole}.${fractional}`;
}

function currencyTotals(moneyValues: Money[]) {
  const totals: Record<string, Money> = {};

  for (const money of moneyValues) {
    totals[money.currency] = {
      currency: money.currency,
      amountMinor: (totals[money.currency]?.amountMinor ?? 0) + money.amountMinor,
    };
  }

  return totals;
}

function manifestFiles(files: PacketFile[]): AccountantPacketManifestFile[] {
  return files.map((file) => ({
    path: file.path,
    kind: file.kind,
    contentType: file.contentType,
    byteSize: file.bytes.byteLength,
    sha256: sha256Hex(file.bytes),
    sourceDocumentId: file.sourceDocumentId,
    sourceVersionId: file.sourceVersionId,
    transactionId: file.transactionId,
  }));
}

function attachmentPath(transaction: Transaction, attachment: AccountantPacketAttachment) {
  return `attachments/${transaction.postedAt.slice(0, 10)}-${safePathSegment(transaction.id)}-${safePathSegment(attachment.fileName)}`;
}

function accountantPacketObjectKey(teamId: string, packetId: string) {
  return `teams/${safePathSegment(teamId)}/accountant-packets/${safePathSegment(packetId)}.zip`;
}

function arrayBufferFromBase64(value: string) {
  const bytes = Buffer.from(value, "base64");

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function safePathSegment(value: string) {
  return (
    value
      .trim()
      .replaceAll("\\", "/")
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "file"
  );
}

function dateSlug(value: string) {
  return normalizeDate(value, "date").toISOString().slice(0, 10);
}

function normalizeDate(value: string, name: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("CONFLICT", `Export ${name} date is invalid`);
  }

  return date;
}

function packetIdForExport(input: {
  teamId: string;
  actorId: string;
  generatedAt: string;
  from: string;
  to: string;
  transactionIds: string[];
}) {
  const raw = [
    input.teamId,
    input.actorId,
    input.generatedAt,
    normalizeDate(input.from, "from").toISOString(),
    normalizeDate(input.to, "to").toISOString(),
    input.transactionIds.join(","),
  ].join(":");
  let hash = 0;

  for (let index = 0; index < raw.length; index += 1) {
    hash = (Math.imul(hash, 31) + raw.charCodeAt(index)) | 0;
  }

  return `acct_pkt_${Math.abs(hash).toString(36)}`;
}

function textBytes(value: string) {
  return new TextEncoder().encode(value);
}

function bytesFromBody(body: ArrayBuffer | Uint8Array) {
  return body instanceof Uint8Array ? body : new Uint8Array(body);
}

function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function createStoredZip(files: PacketFile[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = textBytes(file.path);
    const crc = crc32(file.bytes);
    const localHeader = new Uint8Array(30 + name.byteLength);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(10, dosTime(), true);
    localView.setUint16(12, dosDate(), true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, file.bytes.byteLength, true);
    localView.setUint32(22, file.bytes.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    localHeader.set(name, 30);
    localParts.push(localHeader, file.bytes);

    const centralHeader = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(centralHeader.buffer);

    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(12, dosTime(), true);
    centralView.setUint16(14, dosDate(), true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, file.bytes.byteLength, true);
    centralView.setUint32(24, file.bytes.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);

    offset += localHeader.byteLength + file.bytes.byteLength;
  }

  const centralDirectorySize = centralParts.reduce((size, part) => size + part.byteLength, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);

  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, offset, true);

  return concatBytes([...localParts, ...centralParts, end]);
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((size, part) => size + part.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }

  return bytes;
}

function dosTime() {
  return 0;
}

function dosDate() {
  return (1 << 5) | 1;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = (crc >>> 8) ^ (crcTable[(crc ^ byte) & 0xff] ?? 0);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
