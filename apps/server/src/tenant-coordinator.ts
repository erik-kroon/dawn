import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";

export class TenantCoordinator {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: DawnCloudflareBindings,
  ) {}

  fetch() {
    return Response.json({
      ok: true,
      environment: this.env.ENVIRONMENT,
      id: this.state.id.toString(),
    });
  }
}
