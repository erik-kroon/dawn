import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import type {
  TransactionSyncCollectionId,
  TransactionSyncInvalidationEvent,
  TransactionSyncSubscription,
} from "@dawn/sync";
import {
  createTransactionSyncSubscriptionAck,
  isTransactionSyncInvalidationEvent,
  parseTransactionSyncSubscription,
} from "@dawn/sync";

type RealtimeSocket = {
  send(message: string): void;
};

type TenantSubscription = {
  teamId: string;
  collections: Set<TransactionSyncCollectionId>;
};

export class TenantRealtimeHub {
  private readonly subscriptions = new Map<RealtimeSocket, TenantSubscription>();

  subscribe(socket: RealtimeSocket, subscription: TransactionSyncSubscription) {
    this.subscriptions.set(socket, {
      teamId: subscription.teamId,
      collections: new Set([subscription.collection]),
    });
    socket.send(
      JSON.stringify(createTransactionSyncSubscriptionAck({ teamId: subscription.teamId })),
    );
  }

  unsubscribe(socket: RealtimeSocket) {
    this.subscriptions.delete(socket);
  }

  fanout(event: TransactionSyncInvalidationEvent) {
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

    if (url.pathname.endsWith("/subscribe")) {
      return this.subscribe(request, url);
    }

    if (url.pathname.endsWith("/invalidate")) {
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

    let subscription: TransactionSyncSubscription;

    try {
      subscription = parseTransactionSyncSubscription({
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

    if (!isTransactionSyncInvalidationEvent(input)) {
      return Response.json({ error: "Invalid transaction sync invalidation" }, { status: 400 });
    }

    return Response.json(this.hub.fanout(input));
  }
}
