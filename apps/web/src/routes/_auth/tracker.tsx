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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dawn/ui/components/table";
import { formatMoney, type Money } from "@dawn/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ListFilterIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  TimerIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useProjectSync } from "@/sync/projects";
import { orpc } from "@/utils/orpc";

import { ensureCurrentTeam, optionalStringSearchParam } from "../-team-routing";

type CalendarView = "week" | "month";

type TrackerSearch = {
  date?: string;
  month?: string;
  q?: string;
  view?: CalendarView;
};

export const Route = createFileRoute("/_auth/tracker")({
  component: TrackerRoute,
  validateSearch: (search: Record<string, unknown>): TrackerSearch => ({
    date: dateSearchParam(search.date),
    month: monthSearchParam(search.month),
    q: optionalStringSearchParam(search.q),
    view: search.view === "week" ? "week" : undefined,
  }),
  loaderDeps: ({ search }) => ({ teamId: search.teamId }),
  loader: async ({ context, deps }) => {
    const { currentTeamId } = await ensureCurrentTeam(context, deps.teamId);

    if (!currentTeamId) {
      return { currentTeamId };
    }

    await context.queryClient.ensureQueryData(
      context.orpc.projects.list.queryOptions({ input: { teamId: currentTeamId } }),
    );

    return { currentTeamId };
  },
  head: () => ({
    meta: [{ title: "Tracker | Dawn" }],
  }),
});

function TrackerRoute() {
  const { currentTeamId } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const currentMonth = parseMonthSearchParam(search.month) ?? startOfMonth(new Date());
  const calendarView = search.view ?? "month";
  const selectedDate = search.date ?? dateKey(new Date());
  const projectQuery = search.q ?? "";
  const [projectDraft, setProjectDraft] = useState({
    customerId: "",
    name: "",
    billableRate: "",
    currency: "USD",
  });
  const [timeDraft, setTimeDraft] = useState({
    projectId: "",
    description: "",
    durationMinutes: "",
    billableStatus: "billable" as "billable" | "non_billable",
  });

  const projects = useQuery({
    ...orpc.projects.list.queryOptions({ input: { teamId: currentTeamId } }),
    enabled: Boolean(currentTeamId),
  });
  const projectSync = useProjectSync(currentTeamId);

  function updateSearch(next: TrackerSearch) {
    void navigate({
      replace: true,
      search: (previous) => ({
        ...previous,
        ...next,
      }),
    });
  }

  const syncedProjects = useMemo(
    () =>
      [...projectSync.projects].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() ||
          left.name.localeCompare(right.name),
      ),
    [projectSync.projects],
  );
  const visibleProjects =
    syncedProjects.length > 0 || projectSync.isReady
      ? syncedProjects
      : (projects.data?.projects ?? []);
  const timeEntries = projects.data?.timeEntries ?? [];
  const customers = projects.data?.customers ?? [];
  const report = projects.data?.report;
  const selectedDateEntries = timeEntries.filter(
    (entry) => dateKey(new Date(entry.occurredOn)) === selectedDate,
  );

  const createProjectMutation = useMutation(
    orpc.projects.createProject.mutationOptions({
      onSuccess: async () => {
        setProjectDraft({ customerId: "", name: "", billableRate: "", currency: "USD" });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.projects.list.queryKey() }),
          projectSync.refetch(),
        ]);
      },
    }),
  );
  const createTimeEntryMutation = useMutation(
    orpc.projects.createTimeEntry.mutationOptions({
      onSuccess: async () => {
        setTimeDraft({
          projectId: "",
          description: "",
          durationMinutes: "",
          billableStatus: "billable",
        });
        await queryClient.invalidateQueries({ queryKey: orpc.projects.list.queryKey() });
      },
    }),
  );

  const filteredProjects = useMemo(() => {
    const normalizedQuery = projectQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return visibleProjects;
    }

    return visibleProjects.filter((project) => {
      const customer = customers.find((item) => item.id === project.customerId);
      return [project.name, project.description, project.status, customer?.name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    });
  }, [customers, projectQuery, visibleProjects]);

  const calendarDays = useMemo(() => calendarMonthDays(currentMonth), [currentMonth]);
  const monthTimeByDate = useMemo(() => {
    const grouped = new Map<string, typeof timeEntries>();

    for (const entry of timeEntries) {
      const key = dateKey(new Date(entry.occurredOn));
      const group = grouped.get(key) ?? [];
      group.push(entry);
      grouped.set(key, group);
    }

    return grouped;
  }, [timeEntries]);
  const selectedProject = visibleProjects.find((project) => project.id === timeDraft.projectId);
  const totalHours = minutesToHours(report?.totalMinutes ?? 0);
  const billableAmount = report?.billableValue ?? { amountMinor: 0, currency: "USD" };

  return (
    <div className="mx-auto flex w-full max-w-[1728px] flex-col gap-10 py-8">
      <section className="grid gap-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-serif text-5xl font-normal tracking-normal text-foreground md:text-6xl">
              {totalHours}h
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatMoney(billableAmount)} this month
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center border border-border">
              <Button
                aria-label="Previous month"
                className="border-0"
                onClick={() => updateSearch({ month: monthKey(addMonths(currentMonth, -1)) })}
                size="icon-sm"
                variant="ghost"
              >
                <ChevronLeftIcon aria-hidden="true" className="size-4" />
              </Button>
              <span className="min-w-36 px-3 text-center text-sm">{formatMonth(currentMonth)}</span>
              <Button
                aria-label="Next month"
                className="border-0"
                onClick={() => updateSearch({ month: monthKey(addMonths(currentMonth, 1)) })}
                size="icon-sm"
                variant="ghost"
              >
                <ChevronRightIcon aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <div className="hidden h-10 border border-border sm:flex">
              <button
                className="min-w-20 border-r border-border px-4 text-sm text-muted-foreground transition-colors hover:bg-muted/30 data-[active=true]:bg-card data-[active=true]:text-foreground"
                data-active={calendarView === "week"}
                onClick={() => updateSearch({ view: "week" })}
                type="button"
              >
                Week
              </button>
              <button
                className="min-w-24 px-4 text-sm text-muted-foreground transition-colors hover:bg-muted/30 data-[active=true]:bg-card data-[active=true]:text-foreground"
                data-active={calendarView === "month"}
                onClick={() => updateSearch({ view: undefined })}
                type="button"
              >
                Month
              </button>
            </div>
          </div>
        </div>

        <div
          className="grid border border-border bg-border"
          style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
        >
          {weekdays.map((day) => (
            <div
              className="bg-background px-3 py-4 text-xs font-medium text-muted-foreground"
              key={day}
            >
              {day}
            </div>
          ))}
          {calendarDays.map((day) => {
            const key = dateKey(day);
            const dayEntries = monthTimeByDate.get(key) ?? [];
            const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
            const isSelected = key === selectedDate;

            return (
              <button
                className="relative min-h-[92px] border-t border-border bg-background p-3 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-muted/20 active:scale-[0.995] data-[muted=true]:bg-[repeating-linear-gradient(135deg,transparent_0,transparent_3px,hsl(var(--border))_3px,hsl(var(--border))_4px)] data-[selected=true]:bg-card md:min-h-28"
                data-muted={!isCurrentMonth}
                data-selected={isSelected}
                key={key}
                onClick={() => updateSearch({ date: key, month: monthKey(day) })}
                type="button"
              >
                <span
                  className={
                    isCurrentMonth
                      ? "text-2xl text-foreground"
                      : "text-2xl text-muted-foreground/50"
                  }
                >
                  {day.getDate()}
                </span>
                <div className="mt-6 grid gap-1">
                  {dayEntries.slice(0, 2).map((entry) => {
                    const project = visibleProjects.find((item) => item.id === entry.projectId);

                    return (
                      <span
                        className="block truncate bg-card px-2 py-1 text-xs text-muted-foreground"
                        key={entry.id}
                      >
                        {project?.name ?? "Project"} ({minutesToCompact(entry.durationMinutes)})
                      </span>
                    );
                  })}
                  {dayEntries.length > 2 ? (
                    <span className="text-xs text-muted-foreground">
                      +{dayEntries.length - 2} more
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6">
        <div className="grid min-w-0 gap-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-medium">Projects</h2>
            <div className="flex min-w-0 items-center gap-2">
              <label className="relative min-w-0 flex-1 md:w-[360px]">
                <span className="sr-only">Search projects</span>
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="h-10 border-border pl-10 pr-10"
                  onChange={(event) =>
                    updateSearch({ q: optionalStringSearchParam(event.target.value) })
                  }
                  placeholder="Search or type filter"
                  type="search"
                  value={projectQuery}
                />
                <ListFilterIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
              </label>
              <Button
                aria-label="Create project"
                className="border-border"
                size="icon-lg"
                variant="outline"
              >
                <PlusIcon aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden border border-border">
            <Table className="table-fixed" style={{ minWidth: 1120 }}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[34%] text-foreground">Project name</TableHead>
                  <TableHead className="w-[26%] text-foreground">Description</TableHead>
                  <TableHead className="w-32 text-foreground">Total time</TableHead>
                  <TableHead className="w-40 text-foreground">Total amount</TableHead>
                  <TableHead className="w-36 text-foreground">Status</TableHead>
                  <TableHead className="w-24 text-center text-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.isLoading || projectSync.isLoading ? (
                  <TableRow>
                    <TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>
                      Loading projects...
                    </TableCell>
                  </TableRow>
                ) : filteredProjects.length === 0 ? (
                  <TableRow>
                    <TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>
                      No projects match this view.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProjects.map((project) => {
                    const totals = projectTotals(project.id, timeEntries, project.billableRate);

                    return (
                      <TableRow key={project.id}>
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="size-2 shrink-0 border border-muted-foreground/50" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {project.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {customers.find((item) => item.id === project.customerId)?.name ??
                                  "Customer"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="truncate text-sm text-muted-foreground">
                          {project.description ?? "Product Design"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {minutesToHours(totals.minutes)}h
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatMoney(totals.value)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={project.status === "active" ? "outline" : "muted"}>
                            {project.status === "active" ? "In progress" : "Completed"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  aria-label={`Actions for ${project.name}`}
                                  className="mx-auto border-transparent"
                                  size="icon-sm"
                                  variant="ghost"
                                />
                              }
                            >
                              <MoreHorizontalIcon aria-hidden="true" className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 border border-border">
                              <DropdownMenuItem
                                onClick={() =>
                                  setTimeDraft((draft) => ({
                                    ...draft,
                                    projectId: project.id,
                                    description: draft.description || "Design review",
                                  }))
                                }
                              >
                                Track time
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>View project</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <aside className="grid content-start gap-4 lg:grid-cols-3">
          <div className="grid gap-3 border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <TimerIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium">{formatDateLong(selectedDate)}</p>
            </div>
            {selectedDateEntries.length ? (
              <div className="grid gap-2">
                {selectedDateEntries.map((entry) => {
                  const project = visibleProjects.find((item) => item.id === entry.projectId);

                  return (
                    <div className="border border-border p-3" key={entry.id}>
                      <p className="truncate text-sm font-medium">{project?.name ?? "Project"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.description} · {minutesToCompact(entry.durationMinutes)} ·{" "}
                        {entry.billableStatus.replace("_", " ")}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No time tracked for this day.</p>
            )}
          </div>

          <div className="grid gap-3 border border-border bg-card p-4">
            <p className="text-sm font-medium">Track time</p>
            <select
              className="h-9 rounded-none border border-border bg-background px-2 text-sm"
              onChange={(event) =>
                setTimeDraft((draft) => ({ ...draft, projectId: event.target.value }))
              }
              value={timeDraft.projectId}
            >
              <option value="">Select project</option>
              {visibleProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <Input
              onChange={(event) =>
                setTimeDraft((draft) => ({ ...draft, description: event.target.value }))
              }
              placeholder="Work description"
              value={timeDraft.description}
            />
            <div className="grid grid-cols-[1fr_132px] gap-2">
              <Input
                onChange={(event) =>
                  setTimeDraft((draft) => ({ ...draft, durationMinutes: event.target.value }))
                }
                placeholder="Minutes"
                value={timeDraft.durationMinutes}
              />
              <select
                className="h-8 rounded-none border border-border bg-background px-2 text-xs"
                onChange={(event) =>
                  setTimeDraft((draft) => ({
                    ...draft,
                    billableStatus: event.target.value as typeof draft.billableStatus,
                  }))
                }
                value={timeDraft.billableStatus}
              >
                <option value="billable">Billable</option>
                <option value="non_billable">Non-billable</option>
              </select>
            </div>
            <Button
              disabled={
                createTimeEntryMutation.isPending ||
                !currentTeamId ||
                !timeDraft.projectId ||
                !timeDraft.description.trim() ||
                !timeDraft.durationMinutes.trim()
              }
              onClick={() =>
                createTimeEntryMutation.mutate({
                  teamId: currentTeamId!,
                  projectId: timeDraft.projectId,
                  description: timeDraft.description,
                  occurredOn: selectedDateToIso(selectedDate),
                  durationMinutes: Number.parseInt(timeDraft.durationMinutes, 10),
                  billableStatus: timeDraft.billableStatus,
                  idempotencyKey: crypto.randomUUID(),
                })
              }
            >
              Track time
            </Button>
            {selectedProject ? (
              <p className="text-xs text-muted-foreground">
                Rate: {formatMoney(selectedProject.billableRate)} per hour
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 border border-border bg-card p-4">
            <p className="text-sm font-medium">Create project</p>
            <select
              className="h-9 rounded-none border border-border bg-background px-2 text-sm"
              onChange={(event) =>
                setProjectDraft((draft) => ({ ...draft, customerId: event.target.value }))
              }
              value={projectDraft.customerId}
            >
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <Input
              onChange={(event) =>
                setProjectDraft((draft) => ({ ...draft, name: event.target.value }))
              }
              placeholder="Project name"
              value={projectDraft.name}
            />
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <Input
                onChange={(event) =>
                  setProjectDraft((draft) => ({ ...draft, billableRate: event.target.value }))
                }
                placeholder="Hourly rate"
                value={projectDraft.billableRate}
              />
              <Input
                onChange={(event) =>
                  setProjectDraft((draft) => ({
                    ...draft,
                    currency: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="USD"
                value={projectDraft.currency}
              />
            </div>
            <Button
              disabled={
                createProjectMutation.isPending ||
                !currentTeamId ||
                !projectDraft.customerId ||
                !projectDraft.name.trim() ||
                !projectDraft.billableRate.trim()
              }
              onClick={() =>
                createProjectMutation.mutate({
                  teamId: currentTeamId!,
                  customerId: projectDraft.customerId,
                  name: projectDraft.name,
                  billableRate: {
                    amountMinor: parseMoneyInputToMinor(projectDraft.billableRate),
                    currency: projectDraft.currency.trim().toUpperCase(),
                  },
                  idempotencyKey: crypto.randomUUID(),
                })
              }
              variant="outline"
            >
              Create project
            </Button>
            {customers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Create a customer before adding a billable project.
              </p>
            ) : null}
          </div>
        </aside>
      </section>

      <div className="grid gap-1 text-xs text-destructive">
        {projects.error ? <p>{projects.error.message}</p> : null}
        {createProjectMutation.error ? <p>{createProjectMutation.error.message}</p> : null}
        {createTimeEntryMutation.error ? <p>{createTimeEntryMutation.error.message}</p> : null}
      </div>
    </div>
  );
}

const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

function calendarMonthDays(month: Date) {
  const start = startOfWeekMonday(startOfMonth(month));
  const end = endOfWeekMonday(endOfMonth(month));
  const days: Date[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeekMonday(date: Date) {
  const result = new Date(date);
  const day = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - day);
  return result;
}

function endOfWeekMonday(date: Date) {
  const result = startOfWeekMonday(date);
  result.setDate(result.getDate() + 6);
  return result;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function dateSearchParam(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : value;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function monthKey(date: Date) {
  return dateKey(date).slice(0, 7);
}

function monthSearchParam(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) {
    return undefined;
  }

  return parseMonthSearchParam(value) ? value : undefined;
}

function parseMonthSearchParam(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const [year, month] = value.split("-").map(Number);

  if (!year || !month || month < 1 || month > 12) {
    return undefined;
  }

  return new Date(year, month - 1, 1);
}

function selectedDateToIso(value: string) {
  return new Date(`${value}T12:00:00.000Z`).toISOString();
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateLong(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function minutesToHours(minutes: number) {
  return Math.round((minutes / 60) * 10) / 10;
}

function minutesToCompact(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function projectTotals(
  projectId: string,
  entries: {
    projectId: string;
    durationMinutes: number;
    billableStatus: "billable" | "non_billable" | "invoiced";
    billableRate?: Money | null;
  }[],
  fallbackRate: Money,
) {
  const projectEntries = entries.filter((entry) => entry.projectId === projectId);
  const minutes = projectEntries.reduce((total, entry) => total + entry.durationMinutes, 0);
  const valueMinor = projectEntries.reduce((total, entry) => {
    if (entry.billableStatus === "non_billable") {
      return total;
    }

    const rate = entry.billableRate ?? fallbackRate;
    return total + Math.round((rate.amountMinor * entry.durationMinutes) / 60);
  }, 0);

  return {
    minutes,
    value: { amountMinor: valueMinor, currency: fallbackRate.currency },
  };
}

function parseMoneyInputToMinor(value: string) {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(normalized);

  if (!match) {
    throw new Error("Money amount is invalid");
  }

  return (
    Number.parseInt(match[1] ?? "0", 10) * 100 +
    Number.parseInt((match[2] ?? "").padEnd(2, "0"), 10)
  );
}
