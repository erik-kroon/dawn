import { Button } from "@dawn/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dawn/ui/components/card";
import { toastManager } from "@dawn/ui/components/toast";
import { publicApiScopeLabels } from "@dawn/domain";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLinkIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import { useMemo } from "react";

import {
  oauthConsentIdempotencyKey,
  oauthConsentInputFromSearch,
  oauthDeniedRedirectUrl,
  oauthGrantRedirectUrl,
  searchParam,
  type OAuthAuthorizeSearch,
} from "./-authorize-helpers";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/oauth/authorize")({
  validateSearch: (search: Record<string, unknown>): OAuthAuthorizeSearch => ({
    teamId: searchParam(search.teamId),
    appId: searchParam(search.appId),
    redirectUri: searchParam(search.redirectUri),
    scope: searchParam(search.scope),
    scopes: searchParam(search.scopes),
    state: searchParam(search.state),
  }),
  component: OAuthAuthorizeRoute,
});

function OAuthAuthorizeRoute() {
  const search = Route.useSearch();
  const input = useMemo(() => oauthConsentInputFromSearch(search), [search]);
  const preview = useQuery({
    ...orpc.developers.previewOAuthConsent.queryOptions({
      input: input ?? {
        teamId: "",
        appId: "",
        redirectUri: "https://invalid.example.com/callback",
        scopes: ["transactions.read"],
      },
    }),
    enabled: Boolean(input),
    retry: false,
  });
  const grant = useMutation(
    orpc.developers.grantOAuthConsent.mutationOptions({
      onSuccess: (result) => {
        window.location.assign(
          oauthGrantRedirectUrl({
            redirectUri: result.redirectUri,
            grantId: result.grant.id,
            teamId: result.teamId,
            appId: result.app.id,
            state: search.state,
          }),
        );
      },
      onError: (error) => {
        toastManager.add({ title: error.message, type: "error" });
      },
    }),
  );
  const denyUrl =
    preview.data && search.state
      ? oauthDeniedRedirectUrl({ redirectUri: preview.data.redirectUri, state: search.state })
      : preview.data
        ? oauthDeniedRedirectUrl({ redirectUri: preview.data.redirectUri })
        : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center border bg-muted">
              <ShieldCheckIcon className="size-4" aria-hidden="true" />
            </div>
            <div className="grid gap-1">
              <CardTitle>Authorize OAuth access</CardTitle>
              <CardDescription>
                {preview.data
                  ? `${preview.data.app.name} is requesting access to this Dawn workspace.`
                  : "Review the application request before granting access."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          {!input ? (
            <StatusPanel
              title="Invalid authorization request"
              description="Missing team, app, redirect URI, or requested scopes."
            />
          ) : preview.isLoading ? (
            <StatusPanel title="Loading request" description="Checking the registered OAuth app." />
          ) : preview.error ? (
            <StatusPanel title="Request denied" description={preview.error.message} />
          ) : preview.data ? (
            <>
              <div className="grid gap-3 text-sm">
                <DetailRow label="Application" value={preview.data.app.name} />
                <DetailRow label="Team" value={preview.data.teamId} />
                <DetailRow label="Redirect URI" value={preview.data.redirectUri} />
              </div>

              <div className="grid gap-2">
                <h2 className="text-sm font-medium">Requested scopes</h2>
                <div className="flex flex-wrap gap-2">
                  {preview.data.scopes.map((scope) => (
                    <span className="border bg-muted px-2 py-1 text-xs" key={scope}>
                      {publicApiScopeLabels[scope]}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                {denyUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.location.assign(denyUrl)}
                  >
                    <XIcon data-icon="inline-start" aria-hidden="true" />
                    Deny
                  </Button>
                ) : null}
                <Button
                  type="button"
                  disabled={grant.isPending}
                  onClick={() => {
                    grant.mutate({
                      ...input,
                      idempotencyKey: oauthConsentIdempotencyKey(input, search.state),
                    });
                  }}
                >
                  <ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
                  {grant.isPending ? "Granting" : "Grant access"}
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

function StatusPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid gap-1 border bg-muted/40 p-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="break-all text-sm">{value}</span>
    </div>
  );
}
