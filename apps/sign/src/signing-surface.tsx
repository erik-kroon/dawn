import { Badge } from "@dawn/ui/components/badge";
import { Button } from "@dawn/ui/components/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@dawn/ui/components/card";
import { Skeleton } from "@dawn/ui/components/skeleton";
import { Spinner } from "@dawn/ui/components/spinner";
import { formatMoney } from "@dawn/domain";
import type { AppRouterClient } from "@dawn/api/routers/index";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Clock3Icon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react";
import type React from "react";

export type RecipientSigningSurface = Awaited<
  ReturnType<AppRouterClient["commercialDocuments"]["recipientSigningRead"]>
>;

export type StartSigningResult = Awaited<
  ReturnType<AppRouterClient["commercialDocuments"]["recipientSigningStart"]>
>;

type SigningState = RecipientSigningSurface["state"];
type PdfPayload = NonNullable<RecipientSigningSurface["pdf"]>;

export function RecipientSigningPage({
  errorMessage,
  isLoading,
  isPolling,
  onDownloadReceipt,
  onRefresh,
  onStartSigning,
  pdfUrl,
  startErrorMessage,
  startResult,
  startSigningLabel = "Start BankID signing",
  startSigningPending = false,
  surface,
}: {
  errorMessage?: string | null;
  isLoading?: boolean;
  isPolling?: boolean;
  onDownloadReceipt?: () => void;
  onRefresh?: () => void;
  onStartSigning?: () => void;
  pdfUrl?: string | null;
  startErrorMessage?: string | null;
  startResult?: StartSigningResult | null;
  startSigningLabel?: string;
  startSigningPending?: boolean;
  surface?: RecipientSigningSurface | null;
}) {
  if (isLoading) {
    return (
      <PublicShell>
        <SigningSkeleton />
      </PublicShell>
    );
  }

  if (!surface) {
    return (
      <PublicShell>
        <UnavailablePanel message={errorMessage ?? "The signing link could not be loaded."} />
      </PublicShell>
    );
  }

  const pdf = surface.pdf;

  return (
    <PublicShell>
      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <div className="grid gap-4">
          <DocumentSummary surface={surface} />
          <SigningStateCard
            isPolling={isPolling}
            onRefresh={onRefresh}
            onStartSigning={onStartSigning}
            startErrorMessage={startErrorMessage}
            startResult={startResult}
            startSigningLabel={startSigningLabel}
            startSigningPending={startSigningPending}
            surface={surface}
          />
          {surface.receipt ? (
            <ReceiptCard
              onDownloadReceipt={onDownloadReceipt}
              pdf={pdf}
              pdfUrl={pdfUrl}
              receipt={surface.receipt}
            />
          ) : null}
        </div>

        <PdfPanel pdf={pdf} pdfUrl={pdfUrl} />
      </section>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-3 sm:px-5 sm:py-5 lg:px-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg border bg-card">
              <ShieldCheckIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Dawn signing</p>
              <p className="truncate text-xs text-muted-foreground">TIC BankID</p>
            </div>
          </div>
          <Badge variant="outline">Recipient link</Badge>
        </header>
        {children}
      </div>
    </main>
  );
}

function DocumentSummary({ surface }: { surface: RecipientSigningSurface }) {
  const documentLabel = documentTypeLabel(surface.document.documentType);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="leading-tight">{surface.document.title}</CardTitle>
        <CardDescription>
          {documentLabel} v{surface.document.versionNumber} · {surface.document.currency}
        </CardDescription>
        <CardAction>
          <StateBadge state={surface.state} />
        </CardAction>
      </CardHeader>
      <CardPanel className="grid gap-5">
        <div className="grid grid-cols-2 gap-3">
          <Fact label="Sender" value={partyLabel(surface.sender)} />
          <Fact label="Customer" value={partyLabel(surface.customer)} />
          <Fact label="Total" value={formatMoney(surface.document.total, { locale: "sv-SE" })} />
          <Fact label="PDF hash" value={shortHash(surface.document.pdfSha256)} />
        </div>

        <div className="grid gap-2 border-t pt-4">
          <FactRow label="Validity" value={formatDate(surface.document.validUntil)} />
          <FactRow label="Payment terms" value={surface.document.paymentTerms ?? "Not specified"} />
          <FactRow label="Terms version" value={surface.document.termsVersion} />
          <FactRow label="Recipient" value={surface.document.recipientEmail ?? "Not specified"} />
          <FactRow label="Link expires" value={formatDateTime(surface.access.tokenExpiresAt)} />
        </div>

        <div className="rounded-lg border bg-muted/24 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Signing intent</p>
          <p className="mt-2 text-sm leading-6">{surface.document.signingIntent}</p>
        </div>
      </CardPanel>
    </Card>
  );
}

function SigningStateCard({
  isPolling,
  onRefresh,
  onStartSigning,
  startErrorMessage,
  startResult,
  startSigningLabel,
  startSigningPending,
  surface,
}: {
  isPolling?: boolean;
  onRefresh?: () => void;
  onStartSigning?: () => void;
  startErrorMessage?: string | null;
  startResult?: StartSigningResult | null;
  startSigningLabel: string;
  startSigningPending?: boolean;
  surface: RecipientSigningSurface;
}) {
  const copy = stateCopy(surface.state);
  const signingUrl = startResult?.signingUrl ?? surface.signature.signingUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <copy.Icon className="size-4" />
          {copy.title}
        </CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardPanel className="grid gap-3">
        {surface.signature.status ? (
          <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
            <FactRow
              label="Provider state"
              value={signatureStatusLabel(surface.signature.status)}
            />
            <FactRow label="Session expires" value={formatDateTime(surface.signature.expiresAt)} />
            <FactRow label="Completed" value={formatDateTime(surface.signature.completedAt)} />
          </div>
        ) : null}

        {startErrorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive-foreground">
            {startErrorMessage}
          </div>
        ) : null}
      </CardPanel>
      <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {surface.state === "ready" || surface.state === "failed" ? (
          <Button
            className="w-full sm:w-auto"
            loading={startSigningPending}
            onClick={onStartSigning}
            type="button"
          >
            <ShieldCheckIcon aria-hidden="true" />
            {startSigningLabel}
          </Button>
        ) : null}
        {surface.state === "pending" && signingUrl ? (
          <Button className="w-full sm:w-auto" render={<a href={signingUrl} rel="noreferrer" />}>
            <ExternalLinkIcon aria-hidden="true" />
            Continue to BankID
          </Button>
        ) : null}
        {surface.state === "pending" ? (
          <Button
            className="w-full sm:w-auto"
            loading={isPolling}
            onClick={onRefresh}
            type="button"
            variant="outline"
          >
            <RefreshCwIcon aria-hidden="true" />
            Check status
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function ReceiptCard({
  onDownloadReceipt,
  pdf,
  pdfUrl,
  receipt,
}: {
  onDownloadReceipt?: () => void;
  pdf: PdfPayload | null;
  pdfUrl?: string | null;
  receipt: NonNullable<RecipientSigningSurface["receipt"]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Signed receipt</CardTitle>
        <CardDescription>{formatDateTime(receipt.signedAt)}</CardDescription>
      </CardHeader>
      <CardPanel className="grid gap-3">
        {receipt.evidence.map((item) => (
          <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm" key={item.signedAt}>
            <FactRow label="Signer" value={item.signerName} />
            <FactRow label="Email" value={item.signerEmail ?? "Not provided"} />
            <FactRow label="Personal number" value={item.signerPersonalNumberMasked ?? "Masked"} />
            <FactRow label="Verification" value={verificationLabel(item.verificationStatus)} />
            <FactRow label="Signed PDF hash" value={shortHash(item.documentPdfSha256)} />
          </div>
        ))}
      </CardPanel>
      <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row">
        {receipt.downloads.map((download) =>
          download.kind === "signed_pdf" ? (
            <Button
              disabled={!pdfUrl}
              key={download.kind}
              render={pdfUrl ? <a download={download.fileName} href={pdfUrl} /> : undefined}
              variant="outline"
            >
              <DownloadIcon aria-hidden="true" />
              Signed PDF
            </Button>
          ) : (
            <Button key={download.kind} onClick={onDownloadReceipt} type="button" variant="outline">
              <DownloadIcon aria-hidden="true" />
              Evidence receipt
            </Button>
          ),
        )}
        {pdf ? null : (
          <p className="text-xs text-muted-foreground">Signed PDF download is pending.</p>
        )}
      </CardFooter>
    </Card>
  );
}

function PdfPanel({ pdf, pdfUrl }: { pdf: PdfPayload | null; pdfUrl?: string | null }) {
  return (
    <Card className="min-h-[70svh] lg:sticky lg:top-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileTextIcon aria-hidden="true" className="size-4" />
          Immutable PDF
        </CardTitle>
        <CardDescription>
          {pdf ? `${pdf.fileName} · ${formatBytes(pdf.byteSize)}` : "Unavailable for this state"}
        </CardDescription>
        {pdfUrl && pdf ? (
          <CardAction>
            <Button
              aria-label="Download PDF"
              render={<a download={pdf.fileName} href={pdfUrl} />}
              size="icon-sm"
              variant="outline"
            >
              <DownloadIcon aria-hidden="true" />
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardPanel className="min-h-[62svh] p-0">
        {pdfUrl && pdf ? (
          <iframe className="h-[72svh] w-full rounded-b-2xl" src={pdfUrl} title={pdf.fileName} />
        ) : (
          <div className="grid h-[62svh] place-items-center px-6 text-center">
            <div className="max-w-sm">
              <FileTextIcon aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">PDF is not available</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The document can only be shown while the recipient token is valid and the API
                returns the immutable file.
              </p>
            </div>
          </div>
        )}
      </CardPanel>
    </Card>
  );
}

function UnavailablePanel({ message }: { message: string }) {
  const expired = /expired|gått ut/i.test(message);

  return (
    <Card className="mx-auto mt-16 w-full max-w-lg">
      <CardHeader>
        <CardTitle>{expired ? "Signing link expired" : "Signing link unavailable"}</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardPanel>
        <div className="rounded-lg border bg-muted/24 p-3 text-sm leading-6 text-muted-foreground">
          Contact the sender if you need a new signing link or a new document version.
        </div>
      </CardPanel>
    </Card>
  );
}

function SigningSkeleton() {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </CardHeader>
          <CardPanel className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton className="h-14" key={index} />
              ))}
            </div>
            <Skeleton className="h-28" />
          </CardPanel>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </CardHeader>
          <CardFooter>
            <Spinner aria-label="Loading signing state" />
          </CardFooter>
        </Card>
      </div>
      <Card className="min-h-[70svh]">
        <CardHeader>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardPanel>
          <Skeleton className="h-[62svh]" />
        </CardPanel>
      </Card>
    </section>
  );
}

function StateBadge({ state }: { state: SigningState }) {
  const variants: Record<SigningState, React.ComponentProps<typeof Badge>["variant"]> = {
    declined: "error",
    expired: "warning",
    failed: "error",
    pending: "info",
    ready: "outline",
    signed: "success",
  };

  return <Badge variant={variants[state]}>{stateLabel(state)}</Badge>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(7rem,0.38fr)_minmax(0,1fr)] gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
    </div>
  );
}

export function stateLabel(state: SigningState) {
  const labels: Record<SigningState, string> = {
    declined: "Declined",
    expired: "Expired",
    failed: "Failed",
    pending: "Pending",
    ready: "Ready",
    signed: "Signed",
  };

  return labels[state];
}

function stateCopy(state: SigningState) {
  const copy = {
    declined: {
      Icon: XCircleIcon,
      title: "Document declined",
      description: "This document has been declined and cannot be signed from this link.",
    },
    expired: {
      Icon: Clock3Icon,
      title: "Link expired",
      description: "This recipient link is no longer valid.",
    },
    failed: {
      Icon: AlertCircleIcon,
      title: "Signing failed",
      description: "The previous signing attempt failed. You can start a new BankID session.",
    },
    pending: {
      Icon: Clock3Icon,
      title: "Signing pending",
      description: "A TIC BankID session has been started. Return here after signing.",
    },
    ready: {
      Icon: ShieldCheckIcon,
      title: "Ready to sign",
      description: "Review the final PDF before starting TIC BankID signing.",
    },
    signed: {
      Icon: CheckCircle2Icon,
      title: "Signed",
      description: "The signature has been completed and evidence is available below.",
    },
  } satisfies Record<
    SigningState,
    { Icon: React.ComponentType<{ className?: string }>; title: string; description: string }
  >;

  return copy[state];
}

type SignatureStatus = NonNullable<RecipientSigningSurface["signature"]["status"]>;
type VerificationStatus = NonNullable<
  RecipientSigningSurface["receipt"]
>["evidence"][number]["verificationStatus"];

function signatureStatusLabel(status: SignatureStatus) {
  const labels = {
    cancelled: "Cancelled",
    completed: "Completed",
    failed: "Failed",
    requested: "Requested",
    signing: "Signing",
  } satisfies Record<SignatureStatus, string>;

  return labels[status];
}

function verificationLabel(status: VerificationStatus) {
  const labels = {
    hash_mismatch: "Hash mismatch",
    unverified: "Unverified",
    verified: "Verified",
  } satisfies Record<VerificationStatus, string>;

  return labels[status];
}

function documentTypeLabel(type: RecipientSigningSurface["document"]["documentType"]) {
  return type === "contract" ? "Contract" : "Quote";
}

function partyLabel(party: { legalName: string | null; organizationNumber: string | null }) {
  return [party.legalName, party.organizationNumber].filter(Boolean).join(" · ") || "Not specified";
}

function shortHash(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not specified";
  }

  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not specified";
  }

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    style: "unit",
    unit: "byte",
    unitDisplay: "short",
  }).format(value);
}
