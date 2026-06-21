import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import ReactDOM from "react-dom/client";
import { useEffect, useMemo } from "react";

import { client } from "./public-orpc";
import {
  RecipientSigningPage,
  type RecipientSigningSurface,
  type StartSigningResult,
} from "./signing-surface";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RecipientSigningApp />
    </QueryClientProvider>
  );
}

function RecipientSigningApp() {
  const accessToken = useMemo(() => readAccessToken(window.location), []);
  const startKey = useMemo(() => `recipient_sign_${crypto.randomUUID()}`, []);

  const readQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => client.commercialDocuments.recipientSigningRead({ accessToken: accessToken! }),
    queryKey: ["recipientSigningRead", accessToken],
  });

  const startMutation = useMutation({
    mutationFn: () =>
      client.commercialDocuments.recipientSigningStart({
        accessToken: accessToken!,
        idempotencyKey: startKey,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recipientSigningStatus", accessToken] });
    },
  });

  const statusQuery = useQuery({
    enabled: Boolean(
      accessToken && [readQuery.data, startMutation.data?.surface].some(shouldPollStatus),
    ),
    queryFn: () => client.commercialDocuments.recipientSigningStatus({ accessToken: accessToken! }),
    queryKey: ["recipientSigningStatus", accessToken],
    refetchInterval: (query) => (query.state.data?.state === "pending" ? 5_000 : false),
  });

  const signed = [readQuery.data, startMutation.data?.surface, statusQuery.data].some(
    (surface) => surface?.state === "signed",
  );
  const receiptQuery = useQuery({
    enabled: Boolean(accessToken && signed),
    queryFn: () =>
      client.commercialDocuments.recipientSigningReceipt({ accessToken: accessToken! }),
    queryKey: ["recipientSigningReceipt", accessToken],
  });

  const latestSurface = mergeSurface({
    read: readQuery.data,
    receipt: receiptQuery.data,
    start: startMutation.data,
    status: statusQuery.data,
  });
  const pdfUrl = usePdfObjectUrl(latestSurface?.pdf ?? null);

  function handleReceiptDownload() {
    if (!latestSurface?.receipt) {
      return;
    }

    downloadJson(
      `${latestSurface.document.documentType}-${latestSurface.document.versionNumber}-receipt.json`,
      latestSurface.receipt,
    );
  }

  if (!accessToken) {
    return <RecipientSigningPage errorMessage="The signing token is missing from this link." />;
  }

  return (
    <RecipientSigningPage
      errorMessage={readQuery.error ? errorMessage(readQuery.error) : null}
      isLoading={readQuery.isLoading}
      isPolling={statusQuery.isFetching}
      onDownloadReceipt={handleReceiptDownload}
      onRefresh={() => {
        void statusQuery.refetch();
      }}
      onStartSigning={() => startMutation.mutate()}
      pdfUrl={pdfUrl}
      startErrorMessage={startMutation.error ? errorMessage(startMutation.error) : null}
      startResult={startMutation.data}
      startSigningPending={startMutation.isPending}
      surface={latestSurface}
    />
  );
}

export function readAccessToken(location: Pick<Location, "hash" | "pathname" | "search">) {
  const params = new URLSearchParams(location.search);
  const fromSearch = params.get("token") ?? params.get("accessToken");

  if (fromSearch?.trim()) {
    return fromSearch.trim();
  }

  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
  const fromHash = hashParams.get("token") ?? hashParams.get("accessToken");

  if (fromHash?.trim()) {
    return fromHash.trim();
  }

  const pathToken = location.pathname.split("/").filter(Boolean).at(-1);
  return pathToken && pathToken !== "sign" ? decodeURIComponent(pathToken) : null;
}

function shouldPollStatus(surface: RecipientSigningSurface | undefined) {
  return surface?.state === "pending";
}

function mergeSurface(input: {
  read?: RecipientSigningSurface;
  receipt?: RecipientSigningSurface;
  start?: StartSigningResult;
  status?: RecipientSigningSurface;
}) {
  const current = input.receipt ?? input.status ?? input.start?.surface ?? input.read;
  const pdf = input.receipt?.pdf ?? input.read?.pdf ?? current?.pdf ?? null;

  return current ? { ...current, pdf } : null;
}

function usePdfObjectUrl(pdf: RecipientSigningSurface["pdf"] | null) {
  const signature = pdf ? `${pdf.sha256}:${pdf.byteSize}` : null;
  const bodyBase64 = pdf?.bodyBase64 ?? null;
  const contentType = pdf?.contentType ?? "application/pdf";
  const url = useMemo(() => {
    if (!bodyBase64) {
      return null;
    }

    const bytes = base64ToBytes(bodyBase64);
    return URL.createObjectURL(new Blob([bytes], { type: contentType }));
  }, [bodyBase64, contentType, signature]);

  useEffect(() => {
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [url]);

  return url;
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function downloadJson(fileName: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The signing request failed.";
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(rootElement).render(<App />);
