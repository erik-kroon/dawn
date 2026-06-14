# Cloudflare Runtime Environments

Dawn uses Alchemy to define Cloudflare resources. Postgres remains the
authoritative store; Cloudflare state is runtime, storage, coordination, queueing,
or cache state.

## Stages

| Stage        | Purpose                         | Resource prefix     | Protected data deletion |
| ------------ | ------------------------------- | ------------------- | ----------------------- |
| `preview`    | Pull request and local previews | `dawn-preview-*`    | Allowed                 |
| `staging`    | Production-like validation      | `dawn-staging-*`    | Disabled                |
| `production` | Customer traffic                | `dawn-production-*` | Disabled                |

Use `--stage preview`, `--stage staging`, or `--stage production` with Alchemy.

## Resources

The baseline graph in `packages/infra/alchemy.run.ts` defines:

| Binding                   | Cloudflare resource | Current purpose                                       |
| ------------------------- | ------------------- | ----------------------------------------------------- |
| `DAWN_DOCUMENTS`          | R2 bucket           | Documents, exports, generated PDFs, and attachments.  |
| `DAWN_JOBS`               | Queue               | Outbox and background job dispatch input.             |
| `DAWN_JOBS_DLQ`           | Queue               | Dead-letter queue for failed job messages.            |
| `DAWN_CACHE`              | KV namespace        | Low-risk config, feature flags, and cache metadata.   |
| `DAWN_TENANT_COORDINATOR` | Durable Object      | Per-team realtime and coordination placeholder.       |
| `DAWN_HYPERDRIVE`         | Hyperdrive          | Optional Postgres connection binding when configured. |

The Worker also receives typed string bindings for `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `POLAR_ACCESS_TOKEN`,
`POLAR_SUCCESS_URL`, `CORS_ORIGIN`, `NODE_ENV`, and `ENVIRONMENT`.

## Secrets

Do not commit real secrets. Keep local `.env` files ignored and set production
values through Cloudflare/Alchemy environment configuration.

Required deploy-time secrets:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `POLAR_ACCESS_TOKEN`

Required deploy-time public/runtime values:

- `BETTER_AUTH_URL`
- `POLAR_SUCCESS_URL`
- `CORS_ORIGIN`
- `VITE_SERVER_URL` when the web app should target a custom API route instead of
  the generated API Worker URL.

## Commands

Run an offline infrastructure contract check:

```bash
bun test packages/infra/src/environments.test.ts
bun run --filter @dawn/infra check-types
```

Run a non-mutating Alchemy evaluation after Cloudflare auth is configured:

```bash
bun run --filter @dawn/infra plan -- --stage preview
```

Deploy after Cloudflare auth and environment values are configured:

```bash
bun run deploy -- --stage staging
bun run deploy -- --stage production
```

Destroy only disposable environments:

```bash
bun run destroy -- --stage preview
```

`staging` and `production` resources set protected data resources to
`delete: false`; manual Cloudflare cleanup is required for buckets, queues, and
KV namespaces in those stages.
