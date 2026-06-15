import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import type { SyncCollectionId, SyncInvalidationEvent, SyncSubscription } from "@dawn/sync";
import {
  createSyncSubscriptionAck,
  isSyncInvalidationEvent,
  parseSyncSubscription,
  syncCollectionContracts,
} from "@dawn/sync";

type RealtimeSocket = {
  send(message: string): void;
};

type TenantSubscription = {
  teamId: string;
  collections: Set<SyncCollectionId>;
};

export class TenantRealtimeHub {
  private readonly subscriptions = new Map<RealtimeSocket, TenantSubscription>();

  subscribe(socket: RealtimeSocket, subscription: SyncSubscription) {
    this.subscriptions.set(socket, {
      teamId: subscription.teamId,
      collections: new Set([subscription.collection]),
    });
    socket.send(
      JSON.stringify(
        createSyncSubscriptionAck({
          teamId: subscription.teamId,
          collection: subscription.collection,
        }),
      ),
    );
  }

  unsubscribe(socket: RealtimeSocket) {
    this.subscriptions.delete(socket);
  }

  fanout(event: SyncInvalidationEvent) {
    let delivered = 0;

    for (const [socket, subscription] of this.subscriptions) {
      if (subscription.teamId !== event.teamId || !subscription.collections.has(event.collection)) {
        continue;
      }

      socket.send(JSON.stringify(event));
      delivered += 1;
    }

    return {
      delivered,
      subscribers: this.subscriptions.size,
    };
  }

  snapshot() {
    return {
      subscribers: this.subscriptions.size,
    };
  }
}

export class TenantCoordinator {
  private readonly hub = new TenantRealtimeHub();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: DawnCloudflareBindings,
  ) {}

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (isSyncCoordinatorPath(url.pathname, "subscription")) {
      return this.subscribe(request, url);
    }

    if (isSyncCoordinatorPath(url.pathname, "fanout")) {
      return this.invalidate(request);
    }

    return Response.json({
      ok: true,
      environment: this.env.ENVIRONMENT,
      id: this.state.id.toString(),
      ...this.hub.snapshot(),
    });
  }

  private subscribe(request: Request, url: URL) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    let subscription: SyncSubscription;

    try {
      subscription = parseSyncSubscription({
        teamId: url.searchParams.get("teamId"),
        collection: url.searchParams.get("collection"),
      });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Invalid subscription" },
        { status: 400 },
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    server.accept();
    this.hub.subscribe(server, subscription);
    server.addEventListener("close", () => this.hub.unsubscribe(server));
    server.addEventListener("error", () => this.hub.unsubscribe(server));

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async invalidate(request: Request) {
    const input: unknown = await request.json();

    if (!isSyncInvalidationEvent(input)) {
      return Response.json({ error: "Invalid sync invalidation" }, { status: 400 });
    }

    return Response.json(this.hub.fanout(input));
  }
}

function isSyncCoordinatorPath(pathname: string, pathType: "subscription" | "fanout") {
  return syncCollectionContracts.some((contract) => {
    const contractPath =
      pathType === "subscription"
        ? contract.subscription.coordinatorPath
        : contract.fanout.coordinatorInvalidationPath;

    return pathname.endsWith(contractPath);
  });
}
