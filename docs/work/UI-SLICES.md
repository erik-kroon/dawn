**Outcome**

Dawn should visually match the Midday dark product UI from the reference screenshots: fixed left icon rail, 70px top search/header, hairline borders, dense black workspace, Midday-style overview, transactions, inbox/review, and tracker screens. Implementation should use Dawn’s data/oRPC boundaries and coss primitives, not Midday’s Next/TRPC architecture.

**Slice Strategy**

Use one tracer slice to establish the shell, tokens, and route pattern, then move one real product surface at a time out of the current all-in-one `apps/web/src/routes/_auth/dashboard.tsx`. Avoid “design system only” or “backend only” work unless it directly ships a visible screen.

**Ordered Slices**

## Slice 1: Midday Shell Tracer

Goal: Replace the starter top nav with a Midday-style authenticated app shell.

Scope: `apps/web/src/routes/__root.tsx`, `apps/web/src/components/header.tsx`, new shell/sidebar components in `apps/web/src/components` or reusable pieces in `packages/ui`.

Acceptance Criteria:

- `/dashboard` renders inside a fixed left icon rail and 70px top header matching Midday spacing, border weight, black background, search entry, avatar/user menu, and icon-only nav.
- Current dashboard content still works inside the new shell.
- coss `Sidebar`, `Button`, `Tooltip`, `Avatar`, `Command`/search primitives are used where applicable.

Verification: `bun run check-types`, `bun run check`, browser screenshot at desktop and mobile.

Dependencies: none.

## Slice 2: Dawn UI Tokens + coss Primitive Migration Base

Goal: Make coss the base visual language for Dawn’s app surfaces.

Scope: `packages/ui/src/styles/globals.css`, shared primitives under `packages/ui/src/components`.

Acceptance Criteria:

- Dark tokens match Midday’s near-black surfaces, muted text, border colors, radius discipline, and dense control heights.
- Existing starter shadcn-like `Button`, `Input`, `Card`, `Checkbox`, menu/select usage is migrated or wrapped to coss-compatible primitives where needed.
- No broad visual regressions on login/auth pages.

Verification: typecheck, visual compare `/dashboard`, inspect coss docs for every primitive used.

Dependencies: Slice 1 can start before this, but should converge with it.

## Slice 3: Midday Overview Dashboard

Goal: Replace Dawn’s current dashboard overview cards with the Midday “Morning Viktor” style home.

Scope: overview content currently in `apps/web/src/routes/_auth/dashboard.tsx`; Midday references `ref/midday/apps/dashboard/src/components/widgets/*`.

Acceptance Criteria:

- `/dashboard` shows greeting, summary text, compact quick actions, widget grid, and assistant prompt bar in the Midday layout.
- Existing Dawn queries remain wired: reports, assistant, billing, projects, inbox, operations.
- Team/plan controls are moved into shell/menu/settings-style affordances instead of dominating the dashboard.

Verification: typecheck, exercise assistant ask mutation, screenshot compare to Image #6.

Dependencies: Slice 1.

## Slice 4: Transactions Screen

Goal: Ship a dedicated Midday-style transactions route.

Scope: add TanStack Router route such as `/transactions`; use current `transactionReview`, `ledger`, CSV/import/review mutation paths from `dashboard.tsx`; reference `ref/midday/.../transactions/page.tsx` and `components/tables/transactions`.

Acceptance Criteria:

- Route has Midday toolbar: search/filter input, month chip, column/filter button, add button, All/In review tabs.
- Dense coss `Table` with checkbox selection, date, description, amount, tax amount, category, status, action menu.
- Existing review/category behavior remains functional where current Dawn APIs support it.

Verification: typecheck, row selection/action menu smoke test, screenshot compare to Image #3.

Dependencies: Slices 1-2.

## Slice 5: Inbox Review Screen

Goal: Ship a Midday-style inbox route with split list/detail review.

Scope: add `/inbox`; reuse current documents/inbox upload, correction, suggest/accept/reject match mutations; reference `ref/midday/apps/dashboard/src/components/inbox/*`.

Acceptance Criteria:

- Left side renders invoice/document list with due dates, amounts, suggested/matched/pending states.
- Right side renders selected document/invoice preview and match action footer like Midday.
- coss `Sheet`/`Dialog`, `Menu`, `Badge`, `ScrollArea`, `Button` used for actions and details.

Verification: upload/list/match smoke test, screenshot compare to Image #4.

Dependencies: Slices 1-2.

## Slice 6: Tracker Screen

Goal: Ship Midday-style tracker calendar and projects table.

Scope: add `/tracker`; reuse current projects/time-entry/invoice-from-time mutations; reference `ref/midday/.../tracker/page.tsx` and `components/tracker/*`.

Acceptance Criteria:

- Month calendar matches Midday grid density, typography, muted outside-month treatment, and event bars.
- Projects table below calendar uses coss `Table`, search/filter input, add button, status/actions.
- Creating a project/time entry still updates the route.

Verification: create project/time entry smoke test, screenshot compare to Image #5.

Dependencies: Slices 1-2.

## Slice 7: Settings/Operations Consolidation

Goal: Move non-primary dashboard forms out of the home screen into Midday-style settings/operations surfaces.

Scope: team context, automations, operations, bank connections, integrations, ledger controls, CSV import currently in `dashboard.tsx`.

Acceptance Criteria:

- Dashboard no longer contains long admin/debug form stacks.
- Each moved surface has a clear route or sheet entry from sidebar/settings.
- Existing mutations remain reachable and coss form primitives are used.

Verification: smoke test create team/invite, bank mock connect, CSV preview/commit.

Dependencies: Slices 1-3.

## Slice 8: Visual Parity Hardening

Goal: Close the gap between “similar” and “copied.”

Scope: all new screens.

Acceptance Criteria:

- Desktop screenshots match Midday target proportions: rail width, header height, page margins, border tone, row height, font scale, icon sizing.
- Mobile has a coherent collapsed shell and no overlapping text.
- Old starter cards/forms are removed from primary routes.

Verification: Playwright/browser screenshots for `/dashboard`, `/transactions`, `/inbox`, `/tracker`; `bun run check-types`; `bun run check`.

Dependencies: Slices 3-7.

**Dependencies**

The only hard dependency is the shell/token base before feature screens. Transactions, inbox, and tracker can then proceed in parallel because each can reuse Dawn’s existing API calls and copy only Midday’s visual/product composition.

**Suggested First Slice**

Start with Slice 1. It gives immediate visible proof that Dawn is becoming the Midday-shaped app, while keeping the current dashboard functional for the later route-by-route migration.

**Progress**

- Completed Slice 1 shell tracer: fixed Midday-style rail/header, active route state, dark token pass, and authenticated shell wrapping.
- Completed first pass of Slice 3 overview: `/dashboard` now opens with the Midday-style greeting, dense widget grid, quick actions, and assistant prompt before legacy workspace controls.
- Completed first pass of Slice 4 transactions: `/transactions` now has a Midday-style toolbar, All/In review tabs, coss table primitive, row selection, category selection, action menu, and existing Dawn transaction review/sync behavior.
- Completed first pass of Slice 5 inbox: `/inbox` now has a Midday-style search/upload header, split inbox list/detail review, document preview, extraction corrections, and existing Dawn match suggestion/accept/reject behavior.
- Completed first pass of Slice 6 tracker: `/tracker` now has a Midday-style month calendar, project search/table, selected-day time review, and project/time-entry creation forms wired to existing Dawn project mutations. Verified with `bun run --filter web check-types`, `bun run --filter @dawn/ui check-types`, and browser desktop/mobile layout checks.
- Completed first pass of Slice 7 operations consolidation: `/operations` now carries team access, automations, operational telemetry, bank connections, integrations, ledger controls, and CSV import while `/dashboard` no longer exposes the long workspace-control stack. Verified with `bun run --filter web check-types`, `bun run --filter @dawn/ui check-types`, and browser desktop/mobile layout checks.
- Completed Slice 8 cleanup pass: `/dashboard` was reduced from the old multi-thousand-line all-in-one route to a focused Midday-style home surface, removing the hidden legacy admin/debug forms from the primary route. Verified `bun run --filter web check-types`, `bun run --filter @dawn/ui check-types`, `bun run check`, and browser desktop/mobile sweeps across `/dashboard`, `/transactions`, `/inbox`, `/tracker`, and `/operations`.
- Completed dashboard parity pass: `/dashboard` now follows the reference widget-board composition with weekly summary, profit bars, burnrate/runway, files, expenses, invoices, inbox, software, centered action pills, and assistant prompt. Verified desktop and mobile browser screenshots with no page-level overflow.
- Completed route parity pass for `/transactions`, `/inbox`, `/tracker`, and `/operations`: transactions now keeps the full-height Midday table workspace and selected-row export bar; inbox now uses the reference split where the left search/actions sit above the list and the right document panel starts at the top; tracker now brings the Projects table into the first desktop viewport with the calendar/table rhythm from the reference; operations was verified against the shared shell/border/density system without additional churn. Verified desktop and mobile browser sweeps with no page-level overflow. Local browser logs still show the existing transaction sync internal-server error from the dev backend.
