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

export type ExportAccountantPacketCommand = {
  teamId: string;
  from: string;
  to: string;
  transactionIds?: readonly string[];
  idempotencyKey: string;
};

export type AccountantPacketAttachmentResolver = {
  readAttachment(
    attachment: AccountantPacketAttachment,
  ): Promise<{ body: ArrayBuffer | Uint8Array; contentType?: string | null } | null>;
};

export type AccountantPacketManifestFile = {
  path: string;
  kind: "transactions_csv" | "manifest_json" | "attachment";
  contentType: string;
  byteSize: number;
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

    const rows = await packetRepository.listAccountantPacketTransactionRows({
      teamId: command.teamId,
      from: command.from,
      to: command.to,
      transactionIds: normalizedTransactionIds(command.transactionIds),
    });
    const exportableRows = rows.filter((row) =>
      isTransactionReadyForAccountantExport(row.transaction),
    );

    if (exportableRows.length === 0) {
      throw new AppError("CONFLICT", "No ready-to-export transactions are available for export");
    }

    const result = await buildAccountantPacket({
      teamId: command.teamId,
      actorId: context.actor.id,
      from: command.from,
      to: command.to,
      transactionIds: exportableRows.map((row) => row.transaction.id).sort(),
      rows: exportableRows,
      attachmentResolver,
    });
    await Promise.all(
      exportableRows.map((row) =>
        packetRepository.updateTransactionAccountantStatusForTeam({
          teamId: command.teamId,
          transactionId: row.transaction.id,
          accountantStatus: "exported",
          reason: `Accountant packet ${result.packetId}`,
        }),
      ),
    );

    await packetRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "accountant_packet.exported",
      entityType: "accountant_packet",
      entityId: result.packetId,
      metadata: {
        from: command.from,
        to: command.to,
        transactionCount: result.manifest.transactionCount,
        attachmentCount: result.manifest.attachmentCount,
        skippedAttachmentCount: result.manifest.skippedAttachmentCount,
        transactionIds: result.manifest.filters.transactionIds,
      },
    });

    await packetRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "accountant_packet.exported",
      version: 1,
      payload: {
        packetId: result.packetId,
        from: command.from,
        to: command.to,
        transactionIds: result.manifest.filters.transactionIds,
        transactionCount: result.manifest.transactionCount,
        attachmentCount: result.manifest.attachmentCount,
      },
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

export function exportAccountantPacketFingerprint(command: ExportAccountantPacketCommand) {
  return JSON.stringify({
    teamId: command.teamId,
    from: normalizeDate(command.from, "from").toISOString(),
    to: normalizeDate(command.to, "to").toISOString(),
    transactionIds: normalizedTransactionIds(command.transactionIds),
  });
}

async function buildAccountantPacket(input: {
  teamId: string;
  actorId: string;
  from: string;
  to: string;
  transactionIds: string[];
  rows: AccountantPacketTransactionRow[];
  attachmentResolver?: AccountantPacketAttachmentResolver;
}) {
  const generatedAt = new Date().toISOString();
  const packetId = packetIdForExport({
    teamId: input.teamId,
    actorId: input.actorId,
    generatedAt,
    from: input.from,
    to: input.to,
    transactionIds: input.transactionIds,
  });
  const csv = renderTransactionsCsv(input.rows);
  const files: PacketFile[] = [
    {
      path: "transactions.csv",
      contentType: "text/csv; charset=utf-8",
      bytes: textBytes(csv),
      kind: "transactions_csv",
    },
  ];
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

      files.push({
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
    transactionCount: input.rows.length,
    attachmentCount: files.filter((file) => file.kind === "attachment").length,
    skippedAttachmentCount,
    currencyTotals: currencyTotals(input.rows.map((row) => row.transaction.money)),
    files: [],
  };

  const manifestFile = {
    path: "manifest.json",
    contentType: "application/json; charset=utf-8",
    bytes: textBytes(JSON.stringify({ ...manifest, files: manifestFiles(files) }, null, 2)),
    kind: "manifest_json" as const,
  };
  const finalFiles = [files[0], manifestFile, ...files.slice(1)].filter(
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
}

function normalizedTransactionIds(transactionIds: readonly string[] | undefined) {
  return [...new Set((transactionIds ?? []).map((id) => id.trim()).filter(Boolean))].sort();
}

function renderTransactionsCsv(rows: AccountantPacketTransactionRow[]) {
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
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\n")
    .concat("\n");
}

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
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
    sourceDocumentId: file.sourceDocumentId,
    sourceVersionId: file.sourceVersionId,
    transactionId: file.transactionId,
  }));
}

function attachmentPath(transaction: Transaction, attachment: AccountantPacketAttachment) {
  return `attachments/${transaction.postedAt.slice(0, 10)}-${safePathSegment(transaction.id)}-${safePathSegment(attachment.fileName)}`;
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
