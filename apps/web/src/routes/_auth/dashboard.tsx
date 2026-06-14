import { Button } from "@dawn/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dawn/ui/components/card";
import { formatMoney, type Money } from "@dawn/domain";
import { Input } from "@dawn/ui/components/input";
import { Label } from "@dawn/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const { session, customerState } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(
    () => localStorage.getItem("dawn:selected-team-id") ?? undefined,
  );
  const [newTeamName, setNewTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamInviteRole>("member");

  const teams = useQuery(orpc.teams.list.queryOptions({ input: { teamId: selectedTeamId } }));
  const currentTeamId = selectedTeamId ?? teams.data?.currentTeamId;
  const currentTeam = teams.data?.teams.find((team) => team.id === currentTeamId);
  const transactionReview = useQuery(
    orpc.transactionReview.list.queryOptions({ input: { teamId: currentTeamId } }),
  );
  const reviewMutation = useMutation(
    orpc.transactionReview.review.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.transactionReview.list.queryKey(),
        });
      },
    }),
  );
  const inviteTeamMemberMutation = useMutation(
    orpc.teams.invite.mutationOptions({
      onSuccess: () => {
        setInviteEmail("");
        setInviteRole("member");
      },
    }),
  );
  const createTeamMutation = useMutation(
    orpc.teams.create.mutationOptions({
      onSuccess: async (team) => {
        setSelectedTeamId(team.id);
        localStorage.setItem("dawn:selected-team-id", team.id);
        setNewTeamName("");
        await queryClient.invalidateQueries({ queryKey: orpc.teams.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.transactionReview.list.queryKey() });
      },
    }),
  );

  useEffect(() => {
    if (!teams.data || !selectedTeamId) {
      return;
    }

    const selectedTeamExists = teams.data.teams.some((team) => team.id === selectedTeamId);

    if (!selectedTeamExists) {
      setSelectedTeamId(teams.data.currentTeamId);
      localStorage.setItem("dawn:selected-team-id", teams.data.currentTeamId);
    }
  }, [selectedTeamId, teams.data]);

  const hasProSubscription = (customerState?.activeSubscriptions?.length ?? 0) > 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {session.data?.user.name ? `${session.data.user.name}'s workspace` : "Workspace"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Plan: {hasProSubscription ? "Pro" : "Free"}
          </p>
          {hasProSubscription ? (
            <Button onClick={async () => await authClient.customer.portal()}>
              Manage Subscription
            </Button>
          ) : (
            <Button onClick={async () => await authClient.checkout({ slug: "pro" })}>
              Upgrade to Pro
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team context</CardTitle>
          <CardDescription>
            Team memberships resolve the current actor role before application use cases run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Label className="flex flex-1 flex-col gap-1 text-sm">
              Current team
              <select
                className="h-9 rounded-none border bg-background px-2 text-sm"
                onChange={(event) => {
                  const teamId = event.target.value;
                  setSelectedTeamId(teamId);
                  localStorage.setItem("dawn:selected-team-id", teamId);
                }}
                value={currentTeamId ?? ""}
              >
                {teams.data?.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} · {team.role}
                  </option>
                ))}
              </select>
            </Label>
            <Label className="flex flex-1 flex-col gap-1 text-sm">
              New team
              <Input
                onChange={(event) => setNewTeamName(event.target.value)}
                placeholder="Team name"
                value={newTeamName}
              />
            </Label>
            <Button
              disabled={createTeamMutation.isPending || !newTeamName.trim()}
              onClick={() => createTeamMutation.mutate({ name: newTeamName })}
            >
              Create team
            </Button>
          </div>
          {createTeamMutation.error ? (
            <p className="mt-2 text-sm text-destructive">{createTeamMutation.error.message}</p>
          ) : null}
          {transactionReview.data ? (
            <div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-[1fr_1fr]">
              <div>
                <p className="text-sm font-medium">Resolved access</p>
                <p className="text-sm text-muted-foreground">
                  {currentTeam?.name ?? transactionReview.data.teamName} ·{" "}
                  {transactionReview.data.role}
                </p>
              </div>
              {transactionReview.data.permissions.includes("team.manage") ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <Input
                    aria-label="Invite email"
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="teammate@example.com"
                    value={inviteEmail}
                  />
                  <select
                    aria-label="Invite role"
                    className="h-9 rounded-none border bg-background px-2 text-sm"
                    onChange={(event) => setInviteRole(event.target.value as TeamInviteRole)}
                    value={inviteRole}
                  >
                    {teamInviteRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <Button
                    disabled={
                      inviteTeamMemberMutation.isPending ||
                      !inviteEmail.trim() ||
                      !transactionReview.data.teamId
                    }
                    onClick={() =>
                      inviteTeamMemberMutation.mutate({
                        teamId: transactionReview.data.teamId,
                        email: inviteEmail,
                        role: inviteRole,
                        idempotencyKey: crypto.randomUUID(),
                      })
                    }
                  >
                    Invite
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          {inviteTeamMemberMutation.error ? (
            <p className="mt-2 text-sm text-destructive">
              {inviteTeamMemberMutation.error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction review tracer</CardTitle>
          <CardDescription>
            Team-scoped transaction review powered by API → app use case → domain rule → Postgres
            persistence, audit, and outbox.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactionReview.isLoading ? <p>Loading transactions…</p> : null}
          {transactionReview.data ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{transactionReview.data.teamName}</span>
                <span className="text-muted-foreground">
                  Sync: {transactionReview.data.sync.collection} ·{" "}
                  {transactionReview.data.sync.conflictPolicy}
                </span>
              </div>
              <div className="overflow-hidden border">
                {transactionReview.data.transactions.map((transaction) => (
                  <TransactionReviewRow
                    key={transaction.id}
                    categories={transactionReview.data.categories}
                    disabled={reviewMutation.isPending}
                    onReview={(categoryId) => {
                      reviewMutation.mutate({
                        transactionId: transaction.id,
                        categoryId,
                        idempotencyKey: crypto.randomUUID(),
                        teamId: transactionReview.data.teamId,
                      });
                    }}
                    transaction={transaction}
                  />
                ))}
              </div>
              {reviewMutation.error ? (
                <p className="text-sm text-destructive">{reviewMutation.error.message}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

const teamInviteRoles = ["admin", "member", "accountant", "viewer"] as const;
type TeamInviteRole = (typeof teamInviteRoles)[number];

type TransactionReviewRowProps = {
  categories: { id: string; name: string }[];
  disabled: boolean;
  onReview: (categoryId: string) => void;
  transaction: {
    id: string;
    description: string;
    postedAt: string;
    money: Money;
    categoryId: string | null;
    reviewState: "needs_review" | "reviewed";
  };
};

function TransactionReviewRow({
  categories,
  disabled,
  onReview,
  transaction,
}: TransactionReviewRowProps) {
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? categories[0]?.id ?? "");
  const selectedCategory = categories.find((category) => category.id === transaction.categoryId);
  const canReview = transaction.reviewState !== "reviewed" && categoryId.length > 0;

  return (
    <div className="grid gap-3 border-b p-3 last:border-b-0 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
      <div>
        <p className="font-medium">{transaction.description}</p>
        <p className="text-muted-foreground">
          {new Date(transaction.postedAt).toLocaleDateString()} ·{" "}
          {selectedCategory?.name ?? "Uncategorized"}
        </p>
      </div>
      <p className="font-mono text-sm">{formatMoney(transaction.money)}</p>
      <span className="text-sm capitalize text-muted-foreground">
        {transaction.reviewState.replace("_", " ")}
      </span>
      <div className="flex gap-2">
        <select
          className="h-9 rounded-none border bg-background px-2 text-sm"
          disabled={disabled || transaction.reviewState === "reviewed"}
          onChange={(event) => setCategoryId(event.target.value)}
          value={categoryId}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <Button disabled={disabled || !canReview} onClick={() => onReview(categoryId)}>
          Review
        </Button>
      </div>
    </div>
  );
}
