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
import { ScrollArea } from "@dawn/ui/components/scroll-area";
import { toastManager } from "@dawn/ui/components/toast";
import { formatMoney } from "@dawn/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  FileTextIcon,
  InboxIcon,
  ListFilterIcon,
  MailIcon,
  MoreVerticalIcon,
  RefreshCwIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type Ref,
  type SetStateAction,
} from "react";

import { useTransactionSync } from "@/sync/transactions";
import { authClient } from "@/lib/auth-client";
import {
  clearGoogleInboxConnectIntent,
  consumeGoogleInboxConnectIntent,
  gmailReadonlyScope,
  googleInboxAuthScopes,
  googleInboxCallbackUrl,
  rememberGoogleInboxConnectIntent,
} from "@/lib/google-inbox-auth";
import { client, orpc } from "@/utils/orpc";

import { ensureCurrentTeam, optionalStringSearchParam } from "../-team-routing";
import { requireParkedSurfaceFlag } from "./-parked-surface";

type InboxTab = "invoices" | "all";

type InboxSearch = {
  code?: string;
  connectGoogleLogin?: "1";
  emailInboxProvider?: "gmail" | "mock-email-inbox";
  itemId?: string;
  q?: string;
  state?: string;
  tab?: InboxTab;
};

export const Route = createFileRoute("/_auth/inbox")({
  component: InboxRoute,
  validateSearch: (search: Record<string, unknown>): InboxSearch => ({
    code: optionalStringSearchParam(search.code),
    connectGoogleLogin: search.connectGoogleLogin === "1" ? "1" : undefined,
    emailInboxProvider:
      search.emailInboxProvider === "gmail" || search.emailInboxProvider === "mock-email-inbox"
        ? search.emailInboxProvider
        : undefined,
    itemId: optionalStringSearchParam(search.itemId),
    q: optionalStringSearchParam(search.q),
    state: optionalStringSearchParam(search.state),
    tab: search.tab === "all" ? "all" : undefined,
  }),
  loaderDeps: ({ search }) => ({ teamId: search.teamId }),
  loader: async ({ context, deps }) => {
    requireParkedSurfaceFlag(deps.teamId);
    const { currentTeamId } = await ensureCurrentTeam(context, deps.teamId);

    if (!currentTeamId) {
      return { currentTeamId };
    }

    await Promise.all([
      context.queryClient.ensureQueryData(
        context.orpc.documents.list.queryOptions({ input: { teamId: currentTeamId } }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.inbox.list.queryOptions({ input: { teamId: currentTeamId } }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.emailInbox.list.queryOptions({ input: { teamId: currentTeamId } }),
      ),
    ]);

    return { currentTeamId };
  },
  head: () => ({
    meta: [{ title: "Inbox | Dawn" }],
  }),
});

type ExtractionCorrectionState = {
  documentType: string;
  merchantName: string;
  customerName: string;
  issuedAt: string;
  dueAt: string;
  invoiceNumber: string;
  totalAmount: string;
  currency: string;
};

type ExtractionCorrectionField = keyof ExtractionCorrectionState;

type InboxListItem = NonNullable<
  Awaited<ReturnType<typeof client.inbox.list>>["inboxItems"][number]
>;

type ExtractionConfidenceField =
  | "documentType"
  | "merchantName"
  | "customerName"
  | "issuedAt"
  | "dueAt"
  | "invoiceNumber"
  | "totalAmountMinor"
  | "currency";

const correctionDocumentTypes = [
  "receipt",
  "invoice_received",
  "invoice_sent",
  "bank_statement",
  "contract",
  "tax_document",
  "other",
] as const;

type CorrectionDocumentType = (typeof correctionDocumentTypes)[number];

function InboxRoute() {
  const { currentTeamId } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reviewToolsRef = useRef<HTMLDetailsElement | null>(null);
  const extractionReviewFirstInputRef = useRef<HTMLInputElement | null>(null);
  const googleLoginAutoConnectAttemptedRef = useRef(false);
  const query = search.q ?? "";
  const tab = search.tab ?? "invoices";
  const selectedInboxItemId = search.itemId ?? null;
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [googleLoginLinkPending, setGoogleLoginLinkPending] = useState(false);
  const [queuedEmailInboxSync, setQueuedEmailInboxSync] = useState<{
    connectionId: string;
    requestedAt: number;
  } | null>(null);
  const [hiddenInboxItemIds, setHiddenInboxItemIds] = useState<Set<string>>(() => new Set());
  const [extractionCorrections, setExtractionCorrections] = useState<
    Record<string, ExtractionCorrectionState>
  >({});

  const transactionSync = useTransactionSync(currentTeamId);
  const documents = useQuery({
    ...orpc.documents.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const inbox = useQuery({
    ...orpc.inbox.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const emailInbox = useQuery({
    ...orpc.emailInbox.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });

  function updateSearch(next: InboxSearch) {
    void navigate({
      replace: true,
      search: (previous) => ({
        ...previous,
        ...next,
      }),
    });
  }

  function clearGoogleLoginConnectSearch() {
    return navigate({
      replace: true,
      search: (previous) => ({
        ...previous,
        connectGoogleLogin: undefined,
      }),
    });
  }

  async function linkGoogleLoginForInbox() {
    if (!currentTeamId) {
      return;
    }

    setGoogleLoginLinkPending(true);
    rememberGoogleInboxConnectIntent(currentTeamId);
    await authClient.linkSocial(
      {
        provider: "google",
        callbackURL: googleInboxCallbackUrl(currentTeamId),
        scopes: googleInboxAuthScopes(),
      },
      {
        onError: (error) => {
          setGoogleLoginLinkPending(false);
          clearGoogleInboxConnectIntent();
          toastManager.add({
            title: error.error.message || error.error.statusText,
            type: "error",
          });
        },
      },
    );
  }

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
  const retryExtractionMutation = useMutation(
    orpc.inbox.retryExtraction.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.inbox.list.queryKey() });
      },
    }),
  );
  const dismissInboxItemMutation = useMutation(
    orpc.inbox.dismissItem.mutationOptions({
      onError: (_error, input) => {
        setHiddenInboxItemIds((hiddenIds) => {
          const next = new Set(hiddenIds);
          next.delete(input.inboxItemId);
          return next;
        });
      },
      onMutate: (input) => {
        setHiddenInboxItemIds((hiddenIds) => {
          const next = new Set(hiddenIds);
          next.add(input.inboxItemId);
          return next;
        });
      },
      onSuccess: async () => {
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
  const connectEmailInboxMutation = useMutation({
    mutationFn: async (input: { teamId: string; provider: "gmail" | "mock-email-inbox" }) => {
      return client.emailInbox.createAuthorizationUrl({
        teamId: input.teamId,
        provider: input.provider,
        redirectUrl: emailInboxRedirectUrl(input.teamId, input.provider),
      });
    },
    onSuccess: (result) => {
      window.location.assign(result.authorizationUrl);
    },
  });
  const completeEmailInboxOAuthMutation = useMutation(
    orpc.emailInbox.completeOAuth.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.emailInbox.list.queryKey() });
        await navigate({
          replace: true,
          search: (previous) => ({
            ...previous,
            code: undefined,
            emailInboxProvider: undefined,
            state: undefined,
          }),
        });
      },
    }),
  );
  const requestEmailInboxSyncMutation = useMutation(
    orpc.emailInbox.requestSync.mutationOptions({
      onError: () => {
        setQueuedEmailInboxSync(null);
      },
      onMutate: (input) => {
        setQueuedEmailInboxSync({ connectionId: input.connectionId, requestedAt: Date.now() });
      },
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.emailInbox.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.inbox.list.queryKey() });
      },
    }),
  );
  const connectGoogleLoginMutation = useMutation(
    orpc.emailInbox.connectGoogleLogin.mutationOptions({
      onError: async () => {
        clearGoogleInboxConnectIntent();
        await clearGoogleLoginConnectSearch();
      },
      onSuccess: async (data) => {
        await queryClient.invalidateQueries({ queryKey: orpc.emailInbox.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.inbox.list.queryKey() });
        if (data.syncRequest.connection.id) {
          setQueuedEmailInboxSync({
            connectionId: data.syncRequest.connection.id,
            requestedAt: Date.now(),
          });
        }
        clearGoogleInboxConnectIntent();
        await clearGoogleLoginConnectSearch();
      },
    }),
  );
  const updateEmailInboxSettingsMutation = useMutation(
    orpc.emailInbox.updateSettings.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.emailInbox.list.queryKey() });
      },
    }),
  );

  useEffect(() => {
    if (
      !currentTeamId ||
      !search.code ||
      !search.state ||
      !search.emailInboxProvider ||
      completeEmailInboxOAuthMutation.isPending ||
      completeEmailInboxOAuthMutation.isSuccess
    ) {
      return;
    }

    completeEmailInboxOAuthMutation.mutate({
      teamId: currentTeamId,
      provider: search.emailInboxProvider,
      code: search.code,
      redirectUrl: emailInboxRedirectUrl(currentTeamId, search.emailInboxProvider),
      state: search.state,
      idempotencyKey: `email-inbox-oauth:${search.emailInboxProvider}:${search.code}`,
    });
  }, [currentTeamId, search.code, search.emailInboxProvider, search.state]);

  useEffect(() => {
    const hasCallbackIntent = search.connectGoogleLogin === "1";

    if (!hasCallbackIntent && !currentTeamId) {
      return;
    }

    if (
      googleLoginAutoConnectAttemptedRef.current ||
      connectGoogleLoginMutation.isPending ||
      connectGoogleLoginMutation.isSuccess
    ) {
      return;
    }

    const hasStoredIntent = consumeGoogleInboxConnectIntent(currentTeamId);

    if (!hasCallbackIntent && !hasStoredIntent) {
      googleLoginAutoConnectAttemptedRef.current = false;
      return;
    }

    if (!currentTeamId) {
      return;
    }

    googleLoginAutoConnectAttemptedRef.current = true;
    connectGoogleLoginMutation.mutate({
      teamId: currentTeamId,
      idempotencyKey: crypto.randomUUID(),
    });
  }, [currentTeamId, search.connectGoogleLogin]);

  const inboxItems = (inbox.data?.inboxItems ?? []).filter((item) => item.status !== "dismissed");
  const filteredInboxItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const matchingItems = inboxItems.filter((item) => {
      if (hiddenInboxItemIds.has(item.id)) {
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
        fields?.documentType,
        fields?.merchantName,
        fields?.customerName,
        fields?.invoiceNumber,
        fields?.currency,
        item.latestExtraction?.rawText,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    });

    if (tab === "all") {
      return matchingItems;
    }

    const invoiceItems = matchingItems.filter(isInvoiceReviewItem);

    return invoiceItems;
  }, [hiddenInboxItemIds, inboxItems, query, tab]);

  useEffect(() => {
    if (selectedInboxItemId && filteredInboxItems.some((item) => item.id === selectedInboxItemId)) {
      return;
    }

    const nextItemId = filteredInboxItems[0]?.id;

    if ((selectedInboxItemId ?? undefined) === nextItemId) {
      return;
    }

    updateSearch({ itemId: nextItemId });
  }, [filteredInboxItems, selectedInboxItemId]);

  const selectedItem =
    filteredInboxItems.find((item) => item.id === selectedInboxItemId) ??
    filteredInboxItems[0] ??
    null;
  const missingEmailInboxOAuthState = Boolean(
    search.code && search.emailInboxProvider && !search.state,
  );

  useEffect(() => {
    if (!queuedEmailInboxSync) {
      return;
    }

    const connection = emailInbox.data?.connections.find(
      (candidate) => candidate.connection.id === queuedEmailInboxSync.connectionId,
    );
    const syncRunTime = connection?.latestSyncRun?.startedAt
      ? new Date(connection.latestSyncRun.startedAt).getTime()
      : null;

    if (syncRunTime && syncRunTime >= queuedEmailInboxSync.requestedAt - 5_000) {
      setQueuedEmailInboxSync(null);
    }
  }, [emailInbox.data?.connections, queuedEmailInboxSync]);
  const selectedCorrection = selectedItem
    ? (extractionCorrections[selectedItem.id] ??
      extractionFieldsToCorrectionState(selectedItem.latestExtraction?.fields))
    : null;
  const selectedActionableSuggestion = selectedItem ? bestActionableSuggestion(selectedItem) : null;
  const invoiceCount = inboxItems.filter(
    (item) => !hiddenInboxItemIds.has(item.id) && isInvoiceReviewItem(item),
  ).length;

  useEffect(() => {
    if (!selectedItem || !reviewToolsRef.current) {
      return;
    }

    reviewToolsRef.current.open = extractionNeedsFieldReview(selectedItem);
  }, [selectedItem?.id, selectedItem?.extractionStatus, selectedItem?.latestExtraction?.id]);

  function openExtractionReview() {
    if (reviewToolsRef.current) {
      reviewToolsRef.current.open = true;
      reviewToolsRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    window.setTimeout(() => extractionReviewFirstInputRef.current?.focus(), 0);
  }

  return (
    <div className="mx-auto box-border flex h-full min-h-0 w-full max-w-[1728px] flex-col gap-5 overflow-hidden py-4 md:py-6">
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

      <EmailInboxConnectorStrip
        connections={emailInbox.data?.connections ?? []}
        googleLoginConnectPending={googleLoginLinkPending || connectGoogleLoginMutation.isPending}
        connectPending={connectEmailInboxMutation.isPending}
        currentTeamId={currentTeamId}
        oauthPending={completeEmailInboxOAuthMutation.isPending}
        onConnect={(provider) => {
          if (!currentTeamId) {
            return;
          }

          connectEmailInboxMutation.mutate({ teamId: currentTeamId, provider });
        }}
        onConnectGoogleLogin={() => {
          void linkGoogleLoginForInbox();
        }}
        onSaveSettings={(connectionId, settings) => {
          if (!currentTeamId) {
            return;
          }

          updateEmailInboxSettingsMutation.mutate({
            teamId: currentTeamId,
            connectionId,
            settings,
            idempotencyKey: crypto.randomUUID(),
          });
        }}
        onSync={(connectionId) => {
          if (!currentTeamId) {
            return;
          }

          requestEmailInboxSyncMutation.mutate({
            teamId: currentTeamId,
            connectionId,
            idempotencyKey: crypto.randomUUID(),
          });
        }}
        providers={emailInbox.data?.providers ?? []}
        queuedSyncConnectionId={queuedEmailInboxSync?.connectionId ?? null}
        settingsPending={updateEmailInboxSettingsMutation.isPending}
        syncPending={requestEmailInboxSyncMutation.isPending}
      />

      <section className="grid min-h-0 flex-1 gap-6 overflow-hidden lg:grid-cols-[minmax(360px,0.95fr)_minmax(520px,1.35fr)]">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-6">
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search inbox</span>
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80"
              />
              <Input
                className="h-10 border-border bg-transparent pl-11 pr-11 text-sm"
                onChange={(event) =>
                  updateSearch({ q: optionalStringSearchParam(event.target.value) })
                }
                placeholder="Search"
                type="search"
                value={query}
              />
            </label>
            <Button
              aria-label={tab === "invoices" ? "Show all documents" : "Show invoice review queue"}
              className="border-border"
              onClick={() => updateSearch({ tab: tab === "invoices" ? "all" : undefined })}
              size="icon-lg"
              title={
                tab === "invoices"
                  ? `Showing ${invoiceCount} invoice-like items`
                  : "Showing all documents"
              }
              variant={tab === "invoices" ? "secondary" : "outline"}
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
          </div>

          <div className="min-h-0 border border-border bg-background">
            <ScrollArea
              className="h-full overflow-visible"
              fill
              thumbClassName="bg-gray-500/70"
              verticalScrollbarStyle={{ insetInlineEnd: "-16px" }}
            >
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
                    className="grid min-h-[106px] w-full gap-3 border-b border-border p-4 text-left transition-[background-color,border-color,transform] duration-150 ease-out last:border-b-0 hover:bg-muted/20 active:scale-[0.995] data-[selected=true]:bg-card"
                    data-desktop-record-id={item.id}
                    data-desktop-record-type="inbox_item"
                    data-selected={selectedItem?.id === item.id}
                    key={item.id}
                    onClick={() => updateSearch({ itemId: item.id })}
                    type="button"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {displayInboxTitle(item)}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {displayInboxSubtitle(item)}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {relativeDueLabel(item.latestExtraction?.fields?.dueAt, item.createdAt)}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                        {formatExtractionAmount(item.latestExtraction?.fields)}
                      </span>
                      <InboxStatusBadge item={item} />
                    </div>
                  </button>
                ))
              )}
            </ScrollArea>
          </div>
        </div>

        <div className="min-h-0 overflow-hidden border border-border bg-background">
          {selectedItem && selectedCorrection ? (
            <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
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
                <div className="hidden shrink-0 md:block">
                  <InboxStatusBadge item={selectedItem} />
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
                    <DropdownMenuItem
                      disabled={!currentTeamId || dismissInboxItemMutation.isPending}
                      onClick={() => {
                        if (!currentTeamId) {
                          return;
                        }

                        dismissInboxItemMutation.mutate({
                          teamId: currentTeamId,
                          inboxItemId: selectedItem.id,
                          idempotencyKey: crypto.randomUUID(),
                        });
                      }}
                      variant="destructive"
                    >
                      <Trash2Icon aria-hidden="true" className="size-4" />
                      Remove from view
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="min-h-0 overflow-y-auto">
                <InvoiceReviewPreview item={selectedItem} correction={selectedCorrection} />

                <details className="group border-t border-border" ref={reviewToolsRef}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 marker:hidden">
                    <span className="text-sm font-medium">Review tools</span>
                    <span className="truncate text-xs text-muted-foreground">
                      Extraction and matching controls
                    </span>
                  </summary>
                  <div className="grid gap-5 px-5 pb-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">Extracted fields</p>
                          <ExtractionReadinessBadge item={selectedItem} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {extractionReviewSummary(selectedItem)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {selectedItem.extractionStatus === "failed" ? (
                          <Button
                            disabled={retryExtractionMutation.isPending || !currentTeamId}
                            onClick={() =>
                              currentTeamId
                                ? retryExtractionMutation.mutate({
                                    teamId: currentTeamId,
                                    inboxItemId: selectedItem.id,
                                    idempotencyKey: crypto.randomUUID(),
                                  })
                                : undefined
                            }
                            size="sm"
                            variant="outline"
                          >
                            <RefreshCwIcon aria-hidden="true" className="size-3.5" />
                            Retry OCR
                          </Button>
                        ) : null}
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
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                      <CorrectionInput
                        confidence={fieldConfidence(selectedItem, "documentType")}
                        field="documentType"
                        initial={selectedCorrection}
                        inputRef={extractionReviewFirstInputRef}
                        itemId={selectedItem.id}
                        label="Type"
                        onChange={setExtractionCorrections}
                        value={selectedCorrection.documentType}
                      />
                      <CorrectionInput
                        confidence={fieldConfidence(selectedItem, "merchantName")}
                        field="merchantName"
                        initial={selectedCorrection}
                        itemId={selectedItem.id}
                        label="Merchant"
                        onChange={setExtractionCorrections}
                        value={selectedCorrection.merchantName}
                      />
                      <CorrectionInput
                        confidence={fieldConfidence(selectedItem, "customerName")}
                        field="customerName"
                        initial={selectedCorrection}
                        itemId={selectedItem.id}
                        label="Customer"
                        onChange={setExtractionCorrections}
                        value={selectedCorrection.customerName}
                      />
                      <CorrectionInput
                        confidence={fieldConfidence(selectedItem, "invoiceNumber")}
                        field="invoiceNumber"
                        initial={selectedCorrection}
                        itemId={selectedItem.id}
                        label="Invoice #"
                        onChange={setExtractionCorrections}
                        value={selectedCorrection.invoiceNumber}
                      />
                      <CorrectionInput
                        confidence={fieldConfidence(selectedItem, "issuedAt")}
                        field="issuedAt"
                        initial={selectedCorrection}
                        itemId={selectedItem.id}
                        label="Issue date"
                        onChange={setExtractionCorrections}
                        value={selectedCorrection.issuedAt}
                      />
                      <CorrectionInput
                        confidence={fieldConfidence(selectedItem, "dueAt")}
                        field="dueAt"
                        initial={selectedCorrection}
                        itemId={selectedItem.id}
                        label="Due date"
                        onChange={setExtractionCorrections}
                        value={selectedCorrection.dueAt}
                      />
                      <CorrectionInput
                        confidence={fieldConfidence(selectedItem, "totalAmountMinor")}
                        field="totalAmount"
                        initial={selectedCorrection}
                        itemId={selectedItem.id}
                        label="Amount"
                        onChange={setExtractionCorrections}
                        value={selectedCorrection.totalAmount}
                      />
                      <CorrectionInput
                        confidence={fieldConfidence(selectedItem, "currency")}
                        field="currency"
                        initial={selectedCorrection}
                        itemId={selectedItem.id}
                        label="Currency"
                        onChange={setExtractionCorrections}
                        value={selectedCorrection.currency}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 border-t border-border px-5 pb-5 pt-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">Match suggestions</p>
                          <MatchReadinessBadge item={selectedItem} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {matchReadinessSummary(selectedItem)}
                        </p>
                      </div>
                      <Button
                        disabled={
                          suggestInboxMatchesMutation.isPending ||
                          !currentTeamId ||
                          !itemReadyToMatch(selectedItem)
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
                                <Badge variant="secondary">
                                  {formatMatchScore(suggestion.score)}
                                </Badge>
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
                        {emptyMatchSuggestionMessage(selectedItem)}
                      </div>
                    )}
                  </div>
                </details>
              </div>

              <div className="flex flex-col gap-3 border-t border-border bg-background/95 p-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {displayReviewBarSummary(selectedItem)}
                </span>
                <div className="flex items-center justify-end gap-2">
                  {selectedActionableSuggestion ? (
                    <>
                      <Button
                        disabled={rejectInboxMatchMutation.isPending || !currentTeamId}
                        onClick={() => {
                          if (!currentTeamId) {
                            return;
                          }

                          rejectInboxMatchMutation.mutate({
                            teamId: currentTeamId,
                            suggestionId: selectedActionableSuggestion.id,
                            idempotencyKey: crypto.randomUUID(),
                          });
                        }}
                        variant="outline"
                      >
                        Decline
                        <XIcon aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        disabled={acceptInboxMatchMutation.isPending || !currentTeamId}
                        onClick={() => {
                          if (!currentTeamId) {
                            return;
                          }

                          acceptInboxMatchMutation.mutate({
                            teamId: currentTeamId,
                            suggestionId: selectedActionableSuggestion.id,
                            idempotencyKey: crypto.randomUUID(),
                          });
                        }}
                      >
                        Confirm
                        <CheckIcon aria-hidden="true" className="size-4" />
                      </Button>
                    </>
                  ) : itemReadyToMatch(selectedItem) ? (
                    <Button
                      disabled={suggestInboxMatchesMutation.isPending || !currentTeamId}
                      onClick={() =>
                        currentTeamId
                          ? suggestInboxMatchesMutation.mutate({
                              teamId: currentTeamId,
                              inboxItemId: selectedItem.id,
                            })
                          : undefined
                      }
                    >
                      <SparklesIcon aria-hidden="true" className="size-4" />
                      Find matches
                    </Button>
                  ) : (
                    <Button onClick={openExtractionReview} variant="outline">
                      Review extraction
                    </Button>
                  )}
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
        {retryExtractionMutation.error ? <p>{retryExtractionMutation.error.message}</p> : null}
        {dismissInboxItemMutation.error ? <p>{dismissInboxItemMutation.error.message}</p> : null}
        {suggestInboxMatchesMutation.error ? (
          <p>{suggestInboxMatchesMutation.error.message}</p>
        ) : null}
        {acceptInboxMatchMutation.error ? <p>{acceptInboxMatchMutation.error.message}</p> : null}
        {rejectInboxMatchMutation.error ? <p>{rejectInboxMatchMutation.error.message}</p> : null}
        {connectEmailInboxMutation.error ? <p>{connectEmailInboxMutation.error.message}</p> : null}
        {completeEmailInboxOAuthMutation.error ? (
          <p>{completeEmailInboxOAuthMutation.error.message}</p>
        ) : null}
        {missingEmailInboxOAuthState ? (
          <p>Email inbox OAuth callback is missing state. Restart the connection from Inbox.</p>
        ) : null}
        {connectGoogleLoginMutation.error ? (
          <p>{connectGoogleLoginMutation.error.message}</p>
        ) : null}
        {requestEmailInboxSyncMutation.error ? (
          <p>{requestEmailInboxSyncMutation.error.message}</p>
        ) : null}
        {updateEmailInboxSettingsMutation.error ? (
          <p>{updateEmailInboxSettingsMutation.error.message}</p>
        ) : null}
        {documents.error ? <p>{documents.error.message}</p> : null}
        {inbox.error ? <p>{inbox.error.message}</p> : null}
        {emailInbox.error ? <p>{emailInbox.error.message}</p> : null}
      </div>
    </div>
  );
}

function InvoiceReviewPreview({
  correction,
  item,
}: {
  correction: ExtractionCorrectionState;
  item: InboxListItem;
}) {
  const fields = item.latestExtraction?.fields;
  const fileName = item.document?.currentVersion?.fileName ?? "Document";
  const amount = correctionStateToExtractionFields(correction).totalAmountMinor;
  const currency = correction.currency.trim().toUpperCase() || fields?.currency || "USD";
  const suggestion = bestVisibleSuggestion(item);
  const amountLabel =
    amount == null
      ? formatExtractionAmount(fields)
      : formatMoney({ amountMinor: amount, currency });
  const dueLabel = correction.dueAt ? formatDate(correction.dueAt) : "on receipt";

  return (
    <div className="bg-card/40 p-6 md:p-10">
      <div className="mx-auto min-h-[560px] max-w-[780px] border border-border bg-background p-8 shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-2xl font-medium">Invoice</p>
              <div className="mt-6 grid gap-1 text-xs text-muted-foreground">
                <span>Invoice number {correction.invoiceNumber || "Pending"}</span>
                <span>Date of issue {correction.issuedAt || "Pending"}</span>
                <span>Date due {correction.dueAt || "Pending"}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div className="grid gap-1 text-xs text-muted-foreground">
              <span className="text-sm text-foreground">
                {correction.merchantName || item.source?.name || "Sender pending"}
              </span>
              <span>{item.source?.name ?? item.sourceType.replace("_", " ")}</span>
              <span>{fileName}</span>
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground md:text-right">
              <span className="text-sm text-foreground">Bill to</span>
              <span>{correction.customerName || "Dawn workspace"}</span>
              <span>{item.document?.title ?? item.documentId}</span>
            </div>
          </div>

          <div>
            <p className="text-lg font-medium">
              {amountLabel} due {dueLabel}
            </p>
            {suggestion?.transaction ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Suggested transaction: {suggestion.transaction.description} ·{" "}
                {formatMoney(suggestion.transaction.money)} ·{" "}
                {formatDate(suggestion.transaction.postedAt)}
              </p>
            ) : null}
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
              <span className="text-right">{amountLabel}</span>
            </div>
          </div>

          {item.latestExtraction?.rawText ? (
            <details className="mt-6 border-t border-border pt-4">
              <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground marker:hidden">
                Extraction text
              </summary>
              <p className="mt-3 line-clamp-8 whitespace-pre-wrap text-xs text-muted-foreground">
                {item.latestExtraction.rawText}
              </p>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type EmailInboxProviderOption = {
  provider: "gmail" | "mock-email-inbox";
  displayName: string;
  capabilities: readonly string[];
  defaultScopes: readonly string[];
};

type EmailInboxConnectionOption = {
  accountEmail: string | null;
  grantedScopes: readonly string[];
  reauthorizationRequired: boolean;
  settings: {
    senderBlocklist: string[];
    domainBlocklist: string[];
    senderAllowlist?: string[];
    searchQuery?: string | null;
    maxAttachmentBytes: number;
  };
  latestSyncRun?: {
    status: string;
    startedAt?: string | null;
    completedAt?: string | null;
    recordsSynced: number;
    error?: string | null;
    rawPayload?: Record<string, unknown> | null;
  } | null;
  connection: {
    id: string;
    provider: string;
    status: string;
    lastSyncAt?: string | null;
    lastError?: string | null;
  };
};

function EmailInboxConnectorStrip({
  connections,
  connectPending,
  currentTeamId,
  googleLoginConnectPending,
  oauthPending,
  onConnect,
  onConnectGoogleLogin,
  onSaveSettings,
  onSync,
  providers,
  queuedSyncConnectionId,
  settingsPending,
  syncPending,
}: {
  connections: EmailInboxConnectionOption[];
  connectPending: boolean;
  currentTeamId?: string;
  googleLoginConnectPending: boolean;
  oauthPending: boolean;
  onConnect: (provider: "gmail" | "mock-email-inbox") => void;
  onConnectGoogleLogin: () => void;
  onSaveSettings: (
    connectionId: string,
    settings: {
      senderBlocklist: string[];
      domainBlocklist: string[];
      senderAllowlist: string[];
      searchQuery: string | null;
      maxAttachmentBytes: number;
    },
  ) => void;
  onSync: (connectionId: string) => void;
  providers: EmailInboxProviderOption[];
  queuedSyncConnectionId?: string | null;
  settingsPending: boolean;
  syncPending: boolean;
}) {
  const primaryProvider =
    providers.find((provider) => provider.provider === "gmail") ?? providers[0] ?? null;
  const primaryConnection =
    connections.find((connection) => connection.connection.provider === "gmail") ??
    connections[0] ??
    null;
  const scopeSummary = primaryConnection
    ? emailInboxGrantedScopeSummary(primaryConnection)
    : (primaryProvider?.defaultScopes.join(" ") ?? "gmail.readonly");
  const primarySyncQueued =
    Boolean(primaryConnection) && primaryConnection?.connection.id === queuedSyncConnectionId;
  const primarySyncRunning = primaryConnection?.latestSyncRun?.status === "running";
  const syncDisabled =
    syncPending ||
    primarySyncQueued ||
    primarySyncRunning ||
    !currentTeamId ||
    primaryConnection?.connection.status === "disabled";
  const syncLabel = primarySyncRunning ? "Syncing" : primarySyncQueued ? "Queued" : "Sync";
  const [blockedSenders, setBlockedSenders] = useState(
    primaryConnection?.settings.senderBlocklist.join(", ") ?? "",
  );
  const [blockedDomains, setBlockedDomains] = useState(
    primaryConnection?.settings.domainBlocklist.join(", ") ?? "",
  );

  useEffect(() => {
    setBlockedSenders(primaryConnection?.settings.senderBlocklist.join(", ") ?? "");
    setBlockedDomains(primaryConnection?.settings.domainBlocklist.join(", ") ?? "");
  }, [primaryConnection?.connection.id]);

  if (primaryConnection) {
    return (
      <section className="border border-border bg-background">
        <div className="grid gap-3 p-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card">
              <MailIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">
                  {primaryConnection.accountEmail ?? primaryProvider?.displayName ?? "Email inbox"}
                </p>
                <EmailInboxConnectionBadge
                  connection={primaryConnection}
                  oauthPending={oauthPending}
                />
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {primaryConnection.connection.provider} ·{" "}
                {formatEmailInboxSyncStatus(primaryConnection, primarySyncQueued)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
            <Button
              disabled={syncDisabled}
              onClick={(event) => {
                event.preventDefault();
                onSync(primaryConnection.connection.id);
              }}
              size="sm"
            >
              <RefreshCwIcon
                aria-hidden="true"
                className={primarySyncRunning || syncPending ? "size-3.5 animate-spin" : "size-3.5"}
              />
              {syncLabel}
            </Button>
          </div>
        </div>
        <details className="border-t border-border">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs text-muted-foreground marker:hidden">
            Filter settings
          </summary>
          <div className="grid gap-3 px-3 pb-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="grid gap-2 sm:grid-cols-2">
              <Label className="grid gap-1 text-xs text-muted-foreground">
                Block senders
                <Input
                  className="h-9 border-border text-foreground"
                  onChange={(event) => setBlockedSenders(event.target.value)}
                  placeholder="billing@example.com"
                  value={blockedSenders}
                />
              </Label>
              <Label className="grid gap-1 text-xs text-muted-foreground">
                Block domains
                <Input
                  className="h-9 border-border text-foreground"
                  onChange={(event) => setBlockedDomains(event.target.value)}
                  placeholder="example.com"
                  value={blockedDomains}
                />
              </Label>
            </div>
            <Button
              disabled={settingsPending || !currentTeamId}
              onClick={() =>
                onSaveSettings(primaryConnection.connection.id, {
                  senderBlocklist: commaList(blockedSenders),
                  domainBlocklist: commaList(blockedDomains),
                  senderAllowlist: primaryConnection.settings.senderAllowlist ?? [],
                  searchQuery: primaryConnection.settings.searchQuery ?? null,
                  maxAttachmentBytes: primaryConnection.settings.maxAttachmentBytes,
                })
              }
              size="sm"
              variant="outline"
            >
              <Settings2Icon aria-hidden="true" className="size-3.5" />
              Save filters
            </Button>
          </div>
        </details>
      </section>
    );
  }

  return (
    <section className="grid gap-3 border border-border bg-background p-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(360px,1fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card">
          <MailIcon aria-hidden="true" className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">
              {primaryProvider?.displayName ?? "Email inbox"}
            </p>
            <EmailInboxConnectionBadge connection={null} oauthPending={oauthPending} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            Connect Gmail to import receipt attachments and email-body receipts.
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{scopeSummary}</p>
        </div>
      </div>

      <div className="grid gap-1 text-xs text-muted-foreground">
        <span>Scopes</span>
        <span className="truncate font-mono">{scopeSummary}</span>
      </div>

      <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
        <Button
          disabled={connectPending || !currentTeamId || primaryProvider?.provider !== "gmail"}
          loading={googleLoginConnectPending}
          onClick={onConnectGoogleLogin}
          size="sm"
        >
          <MailIcon aria-hidden="true" className="size-3.5" />
          Use Google login
        </Button>
        <Button
          disabled={
            connectPending || googleLoginConnectPending || !currentTeamId || !primaryProvider
          }
          onClick={() => (primaryProvider ? onConnect(primaryProvider.provider) : undefined)}
          size="sm"
          variant="outline"
        >
          Connect {primaryProvider?.displayName ?? "Gmail"}
        </Button>
      </div>
    </section>
  );
}

function EmailInboxConnectionBadge({
  connection,
  oauthPending,
}: {
  connection: EmailInboxConnectionOption | null;
  oauthPending: boolean;
}) {
  if (oauthPending) {
    return <Badge variant="warning">Connecting</Badge>;
  }

  if (!connection) {
    return <Badge variant="outline">Not connected</Badge>;
  }

  if (connection.reauthorizationRequired || connection.connection.status === "error") {
    return <Badge variant="destructive">Reauth required</Badge>;
  }

  return <Badge variant="success">Connected</Badge>;
}

function CorrectionInput({
  confidence,
  field,
  initial,
  inputRef,
  itemId,
  label,
  onChange,
  value,
}: {
  confidence?: number | null;
  field: ExtractionCorrectionField;
  initial: ExtractionCorrectionState;
  inputRef?: Ref<HTMLInputElement>;
  itemId: string;
  label: string;
  onChange: Dispatch<SetStateAction<Record<string, ExtractionCorrectionState>>>;
  value: string;
}) {
  return (
    <Label className="grid gap-1 text-xs text-muted-foreground">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <FieldConfidenceBadge confidence={confidence} />
      </span>
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
        ref={inputRef}
        value={value}
      />
    </Label>
  );
}

function InboxStatusBadge({ item }: { item: InboxListItem }) {
  const matchStatus = bestSuggestionStatus(item.matchSuggestions);

  if (matchStatus === "accepted" || item.status === "resolved") {
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

  if (item.extractionStatus === "completed" && !isInvoiceReviewItem(item)) {
    return <Badge variant="secondary">Document review</Badge>;
  }

  return <ExtractionReadinessBadge item={item} />;
}

function isInvoiceReviewItem(item: InboxListItem) {
  const fields = item.latestExtraction?.fields;
  const documentType = fields?.documentType;
  const title = `${item.document?.title ?? ""} ${item.document?.currentVersion?.fileName ?? ""}`;
  const normalizedTitle = title.toLowerCase();

  if (
    documentType === "invoice_received" ||
    documentType === "invoice_sent" ||
    documentType === "receipt"
  ) {
    return true;
  }

  if (item.matchSuggestions?.some((suggestion) => suggestion.status !== "expired")) {
    return true;
  }

  if (
    /\b(payment warning|payment reminder|final payment warning|services blocked)\b/i.test(title)
  ) {
    return false;
  }

  return (
    /\b(invoice|receipt)\b/i.test(title) ||
    (/\bbill\b/i.test(title) && !/\bpayment\b/i.test(normalizedTitle)) ||
    Boolean(fields?.merchantName && fields.currency && typeof fields.totalAmountMinor === "number")
  );
}

function displayInboxSubtitle(item: InboxListItem) {
  const fields = item.latestExtraction?.fields;
  const documentType = fields?.documentType?.replace("_", " ");
  const source = item.source?.name ?? item.sourceType.replace("_", " ");
  const fileName = item.document?.currentVersion?.fileName;

  return [documentType, fileName ?? source].filter(Boolean).join(" · ");
}

function bestVisibleSuggestion(item: InboxListItem) {
  return (
    item.matchSuggestions?.find((suggestion) => suggestion.status === "accepted") ??
    bestActionableSuggestion(item) ??
    item.matchSuggestions?.find((suggestion) => suggestion.status === "rejected") ??
    null
  );
}

function bestActionableSuggestion(item: InboxListItem) {
  return item.matchSuggestions?.find((suggestion) => suggestion.status === "suggested") ?? null;
}

function displayReviewBarSummary(item: InboxListItem) {
  const suggestion = bestVisibleSuggestion(item);
  const amount = formatExtractionAmount(item.latestExtraction?.fields);
  const parts = [displayInboxTitle(item), amount];

  if (suggestion?.transaction) {
    parts.push(suggestion.transaction.description);
  }

  return parts.join(" · ");
}

function ExtractionReadinessBadge({ item }: { item: InboxListItem }) {
  const state = extractionReviewState(item);

  return <Badge variant={state.variant}>{state.label}</Badge>;
}

function MatchReadinessBadge({ item }: { item: InboxListItem }) {
  const state = matchReadinessState(item);

  return <Badge variant={state.variant}>{state.label}</Badge>;
}

function FieldConfidenceBadge({ confidence }: { confidence?: number | null }) {
  if (typeof confidence !== "number") {
    return <span className="text-[11px] text-muted-foreground">Not scored</span>;
  }

  const low = confidence < 0.75;

  return (
    <Badge size="sm" variant={low ? "warning" : "success"}>
      {low ? "Low" : "OK"} {Math.round(confidence * 100)}%
    </Badge>
  );
}

function extractionReviewState(item: InboxListItem): {
  label: string;
  summary: string;
  variant: "destructive" | "outline" | "secondary" | "success" | "warning";
} {
  if (item.extractionStatus === "pending") {
    return {
      label: "Extracting",
      summary: "Extraction is queued or running.",
      variant: "secondary",
    };
  }

  if (item.extractionStatus === "failed") {
    return {
      label: "Needs extraction review",
      summary: "OCR failed. Retry extraction or save corrected fields manually.",
      variant: "destructive",
    };
  }

  if (!item.latestExtraction) {
    return {
      label: "Needs extraction review",
      summary: "No extraction has been saved for this item.",
      variant: "warning",
    };
  }

  if (extractionNeedsFieldReview(item)) {
    return {
      label: "Needs extraction review",
      summary: extractionReviewReason(item),
      variant: "warning",
    };
  }

  return {
    label: "Ready to match",
    summary: "Extraction has the required fields for matching.",
    variant: "success",
  };
}

function matchReadinessState(item: InboxListItem): {
  label: string;
  summary: string;
  variant: "outline" | "secondary" | "success" | "warning";
} {
  const matchStatus = bestSuggestionStatus(item.matchSuggestions);

  if (matchStatus === "accepted" || item.status === "resolved") {
    return {
      label: "Matched",
      summary: "This document is already linked to a transaction.",
      variant: "success",
    };
  }

  if (matchStatus === "suggested") {
    return {
      label: "Match suggested",
      summary: "Review the suggested transaction separately from extraction corrections.",
      variant: "warning",
    };
  }

  if (!itemReadyToMatch(item)) {
    return {
      label: "Not ready to match",
      summary: "Finish extraction review before generating transaction matches.",
      variant: "secondary",
    };
  }

  return {
    label: "Ready to match",
    summary: "Generate transaction suggestions when the extracted fields look right.",
    variant: "outline",
  };
}

function extractionReviewSummary(item: InboxListItem) {
  const state = extractionReviewState(item);

  return state.summary;
}

function matchReadinessSummary(item: InboxListItem) {
  return matchReadinessState(item).summary;
}

function emptyMatchSuggestionMessage(item: InboxListItem) {
  if (!itemReadyToMatch(item)) {
    return "Extraction review must be resolved before matching.";
  }

  return "No suggestions generated for this item.";
}

function itemReadyToMatch(item: InboxListItem) {
  const fields = item.latestExtraction?.fields;

  return (
    item.extractionStatus === "completed" &&
    Boolean(fields?.merchantName) &&
    Boolean(fields?.currency) &&
    typeof fields?.totalAmountMinor === "number"
  );
}

function extractionNeedsFieldReview(item: InboxListItem) {
  const extraction = item.latestExtraction;

  if (!extraction) {
    return true;
  }

  const missingFields = missingExtractionFieldLabels(item);
  const overall = extraction.confidence.overall;

  return (
    missingFields.length > 0 ||
    (typeof overall === "number" && overall < 0.45) ||
    (["merchantName", "totalAmountMinor", "currency"] as const).some((field) => {
      const confidence = extraction.confidence[field];
      return typeof confidence === "number" && confidence < 0.45;
    })
  );
}

function extractionReviewReason(item: InboxListItem) {
  const missingFields = missingExtractionFieldLabels(item);

  if (missingFields.length) {
    return `Missing ${formatHumanList(missingFields)}. Fill the fields below and save corrections.`;
  }

  const lowConfidenceFields = lowConfidenceExtractionFieldLabels(item);

  if (lowConfidenceFields.length) {
    return `Low confidence for ${formatHumanList(
      lowConfidenceFields,
    )}. Confirm or correct the fields below.`;
  }

  return "Review extracted fields before matching.";
}

function missingExtractionFieldLabels(item: InboxListItem) {
  const fields = item.latestExtraction?.fields;

  if (!fields) {
    return ["merchant", "amount", "currency"];
  }

  return [
    fields.merchantName ? null : "merchant",
    typeof fields.totalAmountMinor === "number" ? null : "amount",
    fields.currency ? null : "currency",
  ].filter(Boolean) as string[];
}

function lowConfidenceExtractionFieldLabels(item: InboxListItem) {
  const confidence = item.latestExtraction?.confidence;

  if (!confidence) {
    return [];
  }

  return [
    typeof confidence.merchantName === "number" && confidence.merchantName < 0.45
      ? "merchant"
      : null,
    typeof confidence.totalAmountMinor === "number" && confidence.totalAmountMinor < 0.45
      ? "amount"
      : null,
    typeof confidence.currency === "number" && confidence.currency < 0.45 ? "currency" : null,
  ].filter(Boolean) as string[];
}

function formatHumanList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function fieldConfidence(item: InboxListItem, field: ExtractionConfidenceField) {
  const value = item.latestExtraction?.confidence[field];

  return typeof value === "number" ? value : null;
}

function extractionFieldsToCorrectionState(
  fields?: {
    documentType?: string | null;
    merchantName?: string | null;
    customerName?: string | null;
    issuedAt?: string | null;
    dueAt?: string | null;
    invoiceNumber?: string | null;
    totalAmountMinor?: number | null;
    currency?: string | null;
  } | null,
): ExtractionCorrectionState {
  return {
    documentType: fields?.documentType ?? "",
    merchantName: fields?.merchantName ?? "",
    customerName: fields?.customerName ?? "",
    issuedAt: fields?.issuedAt ?? "",
    dueAt: fields?.dueAt ?? "",
    invoiceNumber: fields?.invoiceNumber ?? "",
    totalAmount:
      typeof fields?.totalAmountMinor === "number"
        ? (fields.totalAmountMinor / 100).toFixed(2)
        : "",
    currency: fields?.currency ?? "",
  };
}

function correctionStateToExtractionFields(state: ExtractionCorrectionState) {
  return {
    documentType: normalizeDocumentTypeInput(state.documentType),
    merchantName: state.merchantName.trim() || null,
    customerName: state.customerName.trim() || null,
    issuedAt: state.issuedAt.trim() || null,
    dueAt: state.dueAt.trim() || null,
    invoiceNumber: state.invoiceNumber.trim() || null,
    totalAmountMinor: decimalInputToMinor(state.totalAmount),
    currency: state.currency.trim().toUpperCase() || null,
  };
}

function normalizeDocumentTypeInput(value: string): CorrectionDocumentType | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const aliases: Record<string, CorrectionDocumentType> = {
    bill: "invoice_received",
    invoice: "invoice_received",
    received_invoice: "invoice_received",
    sent_invoice: "invoice_sent",
    statement: "bank_statement",
    tax: "tax_document",
  };
  const documentType = aliases[normalized] ?? normalized;

  return correctionDocumentTypes.includes(documentType as CorrectionDocumentType)
    ? (documentType as CorrectionDocumentType)
    : null;
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
    return "Missing amount";
  }

  return formatMoney({ amountMinor: fields.totalAmountMinor, currency: fields.currency });
}

function formatMatchScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

function formatEmailInboxSyncStatus(
  connection: EmailInboxConnectionOption,
  syncQueued: boolean = false,
) {
  const latestSyncRun = connection.latestSyncRun;

  if (syncQueued && latestSyncRun?.status !== "running") {
    return "Sync queued";
  }

  if (latestSyncRun?.status === "running") {
    return `Sync running since ${formatSyncDate(latestSyncRun.startedAt)}`;
  }

  if (latestSyncRun?.status === "failed") {
    return `${latestSyncRun.error ?? "Last sync failed"} · ${formatSyncDate(
      latestSyncRun.completedAt ?? latestSyncRun.startedAt,
    )}`;
  }

  if (latestSyncRun?.status === "completed") {
    const counts = emailInboxSyncRunCounts(latestSyncRun);
    const resultSummary =
      counts.imported === 0 && counts.skipped === 0
        ? "0 matching receipt emails found"
        : `${counts.imported} imported · ${counts.skipped} skipped${formatSkipReasons(
            counts.skipReasons,
          )}`;

    return `Last synced ${formatSyncDate(
      latestSyncRun.completedAt ?? connection.connection.lastSyncAt,
    )} · ${resultSummary}`;
  }

  if (connection.connection.lastSyncAt) {
    return `Last synced ${formatDate(connection.connection.lastSyncAt)}`;
  }

  return "Ready to sync";
}

function formatSyncDate(value?: string | null) {
  return value ? formatDate(value) : "unknown time";
}

function emailInboxSyncRunCounts(
  syncRun: NonNullable<EmailInboxConnectionOption["latestSyncRun"]>,
) {
  const rawPayload = syncRun.rawPayload ?? {};

  return {
    imported: numberPayloadValue(rawPayload.imported) ?? syncRun.recordsSynced,
    skipped: numberPayloadValue(rawPayload.skipped) ?? 0,
    skipReasons: recordPayloadValue(rawPayload.skipReasons),
  };
}

function numberPayloadValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordPayloadValue(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function formatSkipReasons(reasons: Record<string, unknown>) {
  const summary = Object.entries(reasons)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .map(([reason, count]) => `${String(count)} ${reason.replace(/_/g, " ")}`)
    .join(", ");

  return summary ? ` (${summary})` : "";
}

function emailInboxGrantedScopeSummary(connection: EmailInboxConnectionOption) {
  const scopes = connection.grantedScopes;

  if (!scopes.length) {
    return "Granted scopes unavailable";
  }

  const hasGmailReadOnly = scopes.includes(gmailReadonlyScope);
  const prefix =
    connection.connection.provider === "gmail"
      ? hasGmailReadOnly
        ? "Gmail read-only granted"
        : "Gmail read-only missing"
      : "Granted scopes";

  return `${prefix} · ${scopes.join(" ")}`;
}

function emailInboxRedirectUrl(teamId: string, provider: "gmail" | "mock-email-inbox") {
  const url = new URL(window.location.origin);
  url.pathname = "/inbox";
  url.searchParams.set("teamId", teamId);
  url.searchParams.set("emailInboxProvider", provider);
  return url.toString();
}

function commaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
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

function relativeDueLabel(dueAt?: string | null, fallback?: string) {
  const dateValue = dueAt;

  if (!dateValue) {
    return fallback ? "Due pending" : "Pending";
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
