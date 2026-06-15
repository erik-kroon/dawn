import { Badge } from "@dawn/ui/components/badge";
import { Button } from "@dawn/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dawn/ui/components/dropdown-menu";
import { Input } from "@dawn/ui/components/input";
import { Label } from "@dawn/ui/components/label";
import { formatMoney } from "@dawn/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckIcon,
  FileTextIcon,
  InboxIcon,
  ListFilterIcon,
  MoreVerticalIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { useTransactionSync } from "@/sync/transactions";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/inbox")({
  component: InboxRoute,
});

type InboxTab = "all" | "review";

type ExtractionCorrectionState = {
  merchantName: string;
  issuedAt: string;
  totalAmount: string;
  currency: string;
};

type ExtractionCorrectionField = keyof ExtractionCorrectionState;

function InboxRoute() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(
    () => localStorage.getItem("dawn:selected-team-id") ?? undefined,
  );
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<InboxTab>("all");
  const [selectedInboxItemId, setSelectedInboxItemId] = useState<string | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [extractionCorrections, setExtractionCorrections] = useState<
    Record<string, ExtractionCorrectionState>
  >({});

  const teams = useQuery(orpc.teams.list.queryOptions({ input: { teamId: selectedTeamId } }));
  const currentTeamId = selectedTeamId ?? teams.data?.currentTeamId;
  const transactionSync = useTransactionSync(currentTeamId);
  const documents = useQuery({
    ...orpc.documents.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const inbox = useQuery({
    ...orpc.inbox.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });

  useEffect(() => {
    const teamId = new URLSearchParams(window.location.search).get("teamId");

    if (teamId && teamId !== selectedTeamId) {
      setSelectedTeamId(teamId);
      localStorage.setItem("dawn:selected-team-id", teamId);
    }
  }, [selectedTeamId]);

  const documentUploadMutation = useMutation({
    mutationFn: async (input: { teamId: string; file: File }) => {
      const prepared = await client.documents.createUpload({
        teamId: input.teamId,
        fileName: input.file.name,
        contentType: input.file.type || "application/octet-stream",
        byteSize: input.file.size,
        idempotencyKey: crypto.randomUUID(),
      });
      const upload = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: {
          "content-type": input.file.type || "application/octet-stream",
        },
        body: await input.file.arrayBuffer(),
      });

      if (!upload.ok) {
        throw new Error(await upload.text());
      }

      return prepared;
    },
    onSuccess: async () => {
      setDocumentFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await queryClient.invalidateQueries({ queryKey: orpc.documents.list.queryKey() });
      await queryClient.invalidateQueries({ queryKey: orpc.inbox.list.queryKey() });
    },
  });
  const documentDownloadMutation = useMutation({
    mutationFn: async (input: { teamId: string; documentId: string }) => {
      return client.documents.download(input);
    },
    onSuccess: (result) => {
      window.location.assign(result.downloadUrl);
    },
  });
  const extractionCorrectionMutation = useMutation(
    orpc.inbox.correctExtraction.mutationOptions({
      onSuccess: async (result) => {
        setExtractionCorrections((corrections) => {
          const next = { ...corrections };
          delete next[result.inboxItem.id];
          return next;
        });
        await queryClient.invalidateQueries({ queryKey: orpc.inbox.list.queryKey() });
      },
    }),
  );
  const suggestInboxMatchesMutation = useMutation(
    orpc.inbox.suggestMatches.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.inbox.list.queryKey() });
      },
    }),
  );
  const acceptInboxMatchMutation = useMutation(
    orpc.inbox.acceptMatch.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.inbox.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.transactionReview.list.queryKey() });
        await transactionSync.refetch();
      },
    }),
  );
  const rejectInboxMatchMutation = useMutation(
    orpc.inbox.rejectMatch.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.inbox.list.queryKey() });
      },
    }),
  );

  const inboxItems = inbox.data?.inboxItems ?? [];
  const filteredInboxItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return inboxItems.filter((item) => {
      if (tab === "review" && item.status === "resolved") {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const fields = item.latestExtraction?.fields;
      return [
        item.document?.title,
        item.document?.currentVersion?.fileName,
        item.source?.name,
        item.sourceType,
        item.status,
        item.extractionStatus,
        fields?.merchantName,
        fields?.customerName,
        fields?.invoiceNumber,
        fields?.currency,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    });
  }, [inboxItems, query, tab]);

  useEffect(() => {
    if (selectedInboxItemId && filteredInboxItems.some((item) => item.id === selectedInboxItemId)) {
      return;
    }

    setSelectedInboxItemId(filteredInboxItems[0]?.id ?? null);
  }, [filteredInboxItems, selectedInboxItemId]);

  const selectedItem =
    filteredInboxItems.find((item) => item.id === selectedInboxItemId) ??
    filteredInboxItems[0] ??
    null;
  const selectedCorrection = selectedItem
    ? (extractionCorrections[selectedItem.id] ??
      extractionFieldsToCorrectionState(selectedItem.latestExtraction?.fields))
    : null;
  const reviewCount = inboxItems.filter((item) => item.status !== "resolved").length;

  return (
    <div className="mx-auto flex w-full max-w-[1728px] flex-col gap-5 py-8 md:py-10">
      <input
        className="sr-only"
        onChange={(event) => setDocumentFile(event.currentTarget.files?.[0] ?? null)}
        ref={fileInputRef}
        type="file"
      />
      {documentFile ? (
        <div className="flex items-center justify-between gap-3 border border-border bg-card px-4 py-3 text-sm">
          <span className="min-w-0 truncate text-muted-foreground">
            Ready to upload <span className="text-foreground">{documentFile.name}</span> ·{" "}
            {formatBytes(documentFile.size)}
          </span>
          <Button
            disabled={documentUploadMutation.isPending || !currentTeamId}
            onClick={() => {
              if (!documentFile || !currentTeamId) {
                return;
              }

              documentUploadMutation.mutate({ teamId: currentTeamId, file: documentFile });
            }}
            size="sm"
          >
            Upload
          </Button>
        </div>
      ) : null}

      <section className="grid min-h-[calc(100svh-150px)] gap-6 lg:grid-cols-[minmax(360px,0.95fr)_minmax(520px,1.35fr)]">
        <div className="grid min-h-0 grid-rows-[auto_1fr] gap-6">
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search inbox</span>
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80"
              />
              <Input
                className="h-10 border-border bg-transparent pl-11 pr-11 text-sm"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                type="search"
                value={query}
              />
            </label>
            <Button
              aria-label={
                tab === "all" ? `Show ${reviewCount} inbox items in review` : "Show all inbox items"
              }
              className="border-border"
              onClick={() => setTab((current) => (current === "all" ? "review" : "all"))}
              size="icon-lg"
              variant={tab === "review" ? "secondary" : "outline"}
            >
              <ListFilterIcon aria-hidden="true" className="size-4" />
            </Button>
            <Button
              aria-label="Choose inbox file"
              className="border-border"
              onClick={() => fileInputRef.current?.click()}
              size="icon-lg"
              variant="outline"
            >
              <UploadIcon aria-hidden="true" className="size-4" />
            </Button>
            <Button
              aria-label="Add inbox item"
              className="border-border"
              onClick={() => fileInputRef.current?.click()}
              size="icon-lg"
              variant="outline"
            >
              <PlusIcon aria-hidden="true" className="size-4" />
            </Button>
          </div>

          <div className="min-h-0 border border-border bg-background">
            <div className="h-full overflow-y-auto">
              {inbox.isLoading ? (
                <div className="grid min-h-full place-items-center p-6 text-sm text-muted-foreground">
                  Loading inbox...
                </div>
              ) : filteredInboxItems.length === 0 ? (
                <div className="grid min-h-full place-items-center p-6 text-center">
                  <div className="grid gap-2">
                    <FileTextIcon
                      aria-hidden="true"
                      className="mx-auto size-5 text-muted-foreground"
                    />
                    <p className="text-sm font-medium">No inbox items</p>
                    <p className="max-w-72 text-xs text-muted-foreground">
                      Uploaded documents will appear here when Dawn creates review items.
                    </p>
                  </div>
                </div>
              ) : (
                filteredInboxItems.map((item) => (
                  <button
                    className="grid h-[106px] w-full gap-3 border-b border-border p-4 text-left transition-[background-color,border-color,transform] duration-150 ease-out hover:bg-muted/20 active:scale-[0.995] data-[selected=true]:bg-card"
                    data-desktop-record-id={item.id}
                    data-desktop-record-type="inbox_item"
                    data-selected={selectedItem?.id === item.id}
                    key={item.id}
                    onClick={() => setSelectedInboxItemId(item.id)}
                    type="button"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {displayInboxTitle(item)}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {item.document?.currentVersion?.fileName ??
                            item.sourceType.replace("_", " ")}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {relativeDueLabel(item.latestExtraction?.fields?.dueAt, item.createdAt)}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatExtractionAmount(item.latestExtraction?.fields)}
                      </span>
                      <InboxStatusBadge
                        extractionStatus={item.extractionStatus}
                        matchStatus={bestSuggestionStatus(item.matchSuggestions)}
                        status={item.status}
                      />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 border border-border bg-background">
          {selectedItem && selectedCorrection ? (
            <div className="grid min-h-full grid-rows-[auto_1fr_auto]">
              <div className="flex h-16 items-center justify-between border-b border-border px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card">
                    <FileTextIcon aria-hidden="true" className="size-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {displayInboxTitle(selectedItem)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedItem.document?.currentVersion?.fileName ?? selectedItem.documentId}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        aria-label="Inbox item actions"
                        className="border-transparent"
                        size="icon-sm"
                        variant="ghost"
                      />
                    }
                  >
                    <MoreVerticalIcon aria-hidden="true" className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 border border-border">
                    <DropdownMenuItem
                      disabled={
                        !currentTeamId ||
                        !selectedItem.document ||
                        selectedItem.document.status !== "uploaded"
                      }
                      onClick={() => {
                        if (!currentTeamId || !selectedItem.document) {
                          return;
                        }

                        documentDownloadMutation.mutate({
                          teamId: currentTeamId,
                          documentId: selectedItem.document.id,
                        });
                      }}
                    >
                      Download file
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive">
                      <Trash2Icon aria-hidden="true" className="size-4" />
                      Remove from view
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="min-h-0 overflow-y-auto">
                <DocumentPreview item={selectedItem} correction={selectedCorrection} />

                <div className="grid gap-5 border-t border-border p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Extracted fields</p>
                      <p className="text-xs text-muted-foreground">
                        Confidence:{" "}
                        {selectedItem.latestExtraction
                          ? formatExtractionConfidence(selectedItem.latestExtraction.confidence)
                          : "pending"}
                      </p>
                    </div>
                    <Button
                      disabled={
                        extractionCorrectionMutation.isPending ||
                        !currentTeamId ||
                        selectedItem.extractionStatus === "pending"
                      }
                      onClick={() =>
                        currentTeamId
                          ? extractionCorrectionMutation.mutate({
                              teamId: currentTeamId,
                              inboxItemId: selectedItem.id,
                              fields: correctionStateToExtractionFields(selectedCorrection),
                              idempotencyKey: crypto.randomUUID(),
                            })
                          : undefined
                      }
                      size="sm"
                      variant="outline"
                    >
                      Save corrections
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <CorrectionInput
                      field="merchantName"
                      initial={selectedCorrection}
                      itemId={selectedItem.id}
                      label="Merchant"
                      onChange={setExtractionCorrections}
                      value={selectedCorrection.merchantName}
                    />
                    <CorrectionInput
                      field="issuedAt"
                      initial={selectedCorrection}
                      itemId={selectedItem.id}
                      label="Issue date"
                      onChange={setExtractionCorrections}
                      value={selectedCorrection.issuedAt}
                    />
                    <CorrectionInput
                      field="totalAmount"
                      initial={selectedCorrection}
                      itemId={selectedItem.id}
                      label="Amount"
                      onChange={setExtractionCorrections}
                      value={selectedCorrection.totalAmount}
                    />
                    <CorrectionInput
                      field="currency"
                      initial={selectedCorrection}
                      itemId={selectedItem.id}
                      label="Currency"
                      onChange={setExtractionCorrections}
                      value={selectedCorrection.currency}
                    />
                  </div>
                </div>

                <div className="grid gap-4 border-t border-border p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Match suggestions</p>
                      <p className="text-xs text-muted-foreground">
                        Confirm or decline the transaction match for this document.
                      </p>
                    </div>
                    <Button
                      disabled={
                        suggestInboxMatchesMutation.isPending ||
                        !currentTeamId ||
                        selectedItem.extractionStatus !== "completed"
                      }
                      onClick={() =>
                        currentTeamId
                          ? suggestInboxMatchesMutation.mutate({
                              teamId: currentTeamId,
                              inboxItemId: selectedItem.id,
                            })
                          : undefined
                      }
                      size="sm"
                      variant="outline"
                    >
                      <SparklesIcon aria-hidden="true" className="size-3.5" />
                      Find matches
                    </Button>
                  </div>

                  {selectedItem.matchSuggestions?.length ? (
                    <div className="grid gap-2">
                      {selectedItem.matchSuggestions.map((suggestion) => (
                        <div
                          className="grid gap-3 border border-border bg-card/30 p-3 md:grid-cols-[1fr_auto]"
                          key={suggestion.id}
                        >
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium">
                                {suggestion.transaction?.description ?? suggestion.transactionId}
                              </p>
                              <Badge
                                variant={suggestion.status === "accepted" ? "success" : "outline"}
                              >
                                {suggestion.status.replace("_", " ")}
                              </Badge>
                              <Badge variant="muted">{formatMatchScore(suggestion.score)}</Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {suggestion.transaction
                                ? `${formatMoney(suggestion.transaction.money)} · ${formatDate(suggestion.transaction.postedAt)}`
                                : suggestion.confidence}
                            </p>
                            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                              {suggestion.explanation.join(" · ")}
                            </p>
                          </div>
                          <div className="flex items-start justify-end gap-2">
                            <Button
                              disabled={
                                acceptInboxMatchMutation.isPending ||
                                !currentTeamId ||
                                suggestion.status !== "suggested"
                              }
                              onClick={() =>
                                currentTeamId
                                  ? acceptInboxMatchMutation.mutate({
                                      teamId: currentTeamId,
                                      suggestionId: suggestion.id,
                                      idempotencyKey: crypto.randomUUID(),
                                    })
                                  : undefined
                              }
                              size="sm"
                            >
                              Confirm
                              <CheckIcon aria-hidden="true" className="size-3.5" />
                            </Button>
                            <Button
                              disabled={
                                rejectInboxMatchMutation.isPending ||
                                !currentTeamId ||
                                suggestion.status !== "suggested"
                              }
                              onClick={() =>
                                currentTeamId
                                  ? rejectInboxMatchMutation.mutate({
                                      teamId: currentTeamId,
                                      suggestionId: suggestion.id,
                                      idempotencyKey: crypto.randomUUID(),
                                    })
                                  : undefined
                              }
                              size="sm"
                              variant="outline"
                            >
                              Decline
                              <XIcon aria-hidden="true" className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border border-border p-4 text-sm text-muted-foreground">
                      No suggestions generated for this item.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-border bg-background/95 p-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="truncate text-sm text-muted-foreground">
                  {displayInboxTitle(selectedItem)} ·{" "}
                  {formatExtractionAmount(selectedItem.latestExtraction?.fields)}
                </span>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline">Decline</Button>
                  <Button
                    disabled={
                      !selectedItem.matchSuggestions?.some(
                        (suggestion) => suggestion.status === "suggested",
                      )
                    }
                    onClick={() => {
                      const suggestion = selectedItem.matchSuggestions?.find(
                        (candidate) => candidate.status === "suggested",
                      );

                      if (!suggestion || !currentTeamId) {
                        return;
                      }

                      acceptInboxMatchMutation.mutate({
                        teamId: currentTeamId,
                        suggestionId: suggestion.id,
                        idempotencyKey: crypto.randomUUID(),
                      });
                    }}
                  >
                    Confirm
                    <CheckIcon aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid min-h-[420px] place-items-center p-8 text-center">
              <div className="grid gap-2">
                <InboxIcon aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
                <p className="text-sm font-medium">Select an inbox item</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Choose a document from the list to review extracted fields and transaction
                  matches.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-1 text-xs text-destructive">
        {documentUploadMutation.error ? <p>{documentUploadMutation.error.message}</p> : null}
        {documentDownloadMutation.error ? <p>{documentDownloadMutation.error.message}</p> : null}
        {extractionCorrectionMutation.error ? (
          <p>{extractionCorrectionMutation.error.message}</p>
        ) : null}
        {suggestInboxMatchesMutation.error ? (
          <p>{suggestInboxMatchesMutation.error.message}</p>
        ) : null}
        {acceptInboxMatchMutation.error ? <p>{acceptInboxMatchMutation.error.message}</p> : null}
        {rejectInboxMatchMutation.error ? <p>{rejectInboxMatchMutation.error.message}</p> : null}
        {documents.error ? <p>{documents.error.message}</p> : null}
        {inbox.error ? <p>{inbox.error.message}</p> : null}
      </div>
    </div>
  );
}

function DocumentPreview({
  correction,
  item,
}: {
  correction: ExtractionCorrectionState;
  item: NonNullable<Awaited<ReturnType<typeof client.inbox.list>>["inboxItems"][number]>;
}) {
  const fields = item.latestExtraction?.fields;
  const fileName = item.document?.currentVersion?.fileName ?? "Document";
  const amount = correctionStateToExtractionFields(correction).totalAmountMinor;
  const currency = correction.currency.trim().toUpperCase() || fields?.currency || "USD";

  return (
    <div className="bg-card/40 p-6 md:p-10">
      <div className="mx-auto min-h-[560px] max-w-[780px] border border-border bg-background p-8 shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-2xl font-medium">Invoice</p>
              <div className="mt-6 grid gap-1 text-xs text-muted-foreground">
                <span>Invoice number {fields?.invoiceNumber ?? "Pending"}</span>
                <span>Date of issue {correction.issuedAt || "Pending"}</span>
                <span>Date due {fields?.dueAt ?? "Pending"}</span>
              </div>
            </div>
            <Badge variant={statusBadgeVariant(item.status)}>{item.status.replace("_", " ")}</Badge>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div className="grid gap-1 text-xs text-muted-foreground">
              <span className="text-sm text-foreground">{correction.merchantName || "Sender"}</span>
              <span>{item.source?.name ?? item.sourceType.replace("_", " ")}</span>
              <span>{fileName}</span>
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground md:text-right">
              <span className="text-sm text-foreground">Bill to</span>
              <span>{fields?.customerName ?? "Dawn workspace"}</span>
              <span>{item.document?.title ?? item.documentId}</span>
            </div>
          </div>

          <div>
            <p className="text-lg font-medium">
              {amount == null
                ? `${correction.totalAmount || "0.00"} ${currency}`
                : `${formatMoney({ amountMinor: amount, currency })}`}{" "}
              due {fields?.dueAt ?? "on receipt"}
            </p>
          </div>

          <div className="grid gap-2 text-xs">
            <div className="grid grid-cols-[1fr_80px_100px] border-b border-border pb-2 text-muted-foreground">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Amount</span>
            </div>
            <div className="grid grid-cols-[1fr_80px_100px] border-b border-border py-3">
              <span>{correction.merchantName || item.document?.title || "Extracted document"}</span>
              <span className="text-right text-muted-foreground">1</span>
              <span className="text-right">
                {amount == null
                  ? correction.totalAmount || "-"
                  : formatMoney({ amountMinor: amount, currency })}
              </span>
            </div>
          </div>

          {item.latestExtraction?.rawText ? (
            <div className="mt-6 border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Extraction text</p>
              <p className="line-clamp-6 whitespace-pre-wrap text-xs text-muted-foreground">
                {item.latestExtraction.rawText}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CorrectionInput({
  field,
  initial,
  itemId,
  label,
  onChange,
  value,
}: {
  field: ExtractionCorrectionField;
  initial: ExtractionCorrectionState;
  itemId: string;
  label: string;
  onChange: Dispatch<SetStateAction<Record<string, ExtractionCorrectionState>>>;
  value: string;
}) {
  return (
    <Label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        className="h-9 border-border text-foreground"
        onChange={(event) =>
          onChange((corrections) => ({
            ...corrections,
            [itemId]: {
              ...initial,
              ...corrections[itemId],
              [field]: event.target.value,
            },
          }))
        }
        value={value}
      />
    </Label>
  );
}

function InboxStatusBadge({
  extractionStatus,
  matchStatus,
  status,
}: {
  extractionStatus: string;
  matchStatus?: string | null;
  status: string;
}) {
  if (matchStatus === "accepted" || status === "resolved") {
    return (
      <Badge variant="success">
        <CheckIcon aria-hidden="true" className="size-3" />
        Matched
      </Badge>
    );
  }

  if (matchStatus === "suggested") {
    return <Badge variant="warning">Suggested match</Badge>;
  }

  if (extractionStatus === "pending") {
    return <Badge variant="muted">Pending</Badge>;
  }

  return <Badge variant="outline">{status.replace("_", " ")}</Badge>;
}

function extractionFieldsToCorrectionState(
  fields?: {
    merchantName?: string | null;
    issuedAt?: string | null;
    totalAmountMinor?: number | null;
    currency?: string | null;
  } | null,
): ExtractionCorrectionState {
  return {
    merchantName: fields?.merchantName ?? "",
    issuedAt: fields?.issuedAt ?? "",
    totalAmount:
      typeof fields?.totalAmountMinor === "number"
        ? (fields.totalAmountMinor / 100).toFixed(2)
        : "",
    currency: fields?.currency ?? "",
  };
}

function correctionStateToExtractionFields(state: ExtractionCorrectionState) {
  return {
    merchantName: state.merchantName.trim() || null,
    issuedAt: state.issuedAt.trim() || null,
    totalAmountMinor: decimalInputToMinor(state.totalAmount),
    currency: state.currency.trim().toUpperCase() || null,
  };
}

function decimalInputToMinor(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const [major = "0", minor = ""] = trimmed.replace(",", ".").split(".");
  const sign = major.startsWith("-") ? -1 : 1;
  const majorDigits = major.replace(/[^0-9]/g, "");
  const minorDigits = minor
    .replace(/[^0-9]/g, "")
    .padEnd(2, "0")
    .slice(0, 2);

  return sign * (Number(majorDigits || "0") * 100 + Number(minorDigits || "0"));
}

function displayInboxTitle(item: {
  document?: { title: string } | null;
  latestExtraction?: { fields: { merchantName?: string | null } } | null;
  documentId: string;
}) {
  return item.latestExtraction?.fields.merchantName ?? item.document?.title ?? item.documentId;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatBytes(byteSize: number) {
  if (byteSize < 1024) {
    return `${byteSize} B`;
  }

  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }

  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

function formatExtractionAmount(
  fields?: {
    totalAmountMinor?: number | null;
    currency?: string | null;
  } | null,
) {
  if (typeof fields?.totalAmountMinor !== "number" || !fields.currency) {
    return "$0.00";
  }

  return formatMoney({ amountMinor: fields.totalAmountMinor, currency: fields.currency });
}

function formatExtractionConfidence(confidence: Record<string, number | undefined>) {
  const entries = Object.entries(confidence).filter(([, value]) => typeof value === "number");

  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([key, value]) => `${key}: ${Math.round((value ?? 0) * 100)}%`).join(" · ");
}

function formatMatchScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

function bestSuggestionStatus(suggestions?: { status: string }[]) {
  if (!suggestions?.length) {
    return null;
  }

  return (
    suggestions.find((suggestion) => suggestion.status === "accepted")?.status ??
    suggestions.find((suggestion) => suggestion.status === "suggested")?.status ??
    suggestions[0]?.status ??
    null
  );
}

function statusBadgeVariant(status: string) {
  if (status === "resolved") {
    return "success";
  }

  if (status === "needs_review") {
    return "warning";
  }

  return "muted";
}

function relativeDueLabel(dueAt?: string | null, fallback?: string) {
  const dateValue = dueAt ?? fallback;

  if (!dateValue) {
    return "Pending";
  }

  const date = new Date(dateValue);
  const today = new Date();
  const diffDays = Math.ceil(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) /
      86_400_000,
  );

  if (Number.isNaN(diffDays)) {
    return "Pending";
  }

  if (diffDays === 0) {
    return "Due today";
  }

  if (diffDays > 0) {
    return `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }

  return `${Math.abs(diffDays)} day${diffDays === -1 ? "" : "s"} overdue`;
}
