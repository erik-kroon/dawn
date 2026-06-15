import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection, useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useState } from "react";

import type { ProjectSyncRecord } from "@dawn/sync";
import {
  createProjectSyncSubscriptionUrl,
  isProjectSyncInvalidationEvent,
  projectSyncCollection,
  projectSyncRecordsFromChanges,
} from "@dawn/sync";
import { env } from "@dawn/env/web";

import { orpc, queryClient } from "@/utils/orpc";

type RealtimeStatus = "idle" | "connecting" | "connected" | "reconnecting";

export function useProjectSync(teamId?: string) {
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("idle");
  const collection = useMemo(() => {
    if (!teamId) {
      return null;
    }

    const projectsCollection = createCollection<ProjectSyncRecord, string>(
      queryCollectionOptions({
        id: `${projectSyncCollection.id}:${teamId}`,
        queryKey: ["sync", projectSyncCollection.id, teamId],
        queryClient,
        queryFn: async () => {
          const response = await queryClient.fetchQuery(
            orpc.sync.projects.queryOptions({
              input: { teamId, cursor: null },
            }),
          );

          return projectSyncRecordsFromChanges(response.changes);
        },
        getKey: (project) => project.id,
      }),
    );

    return projectsCollection;
  }, [teamId]);

  const liveQuery = useLiveQuery(() => collection, [collection]);

  useEffect(() => {
    if (!teamId || !collection) {
      setRealtimeStatus("idle");
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      setRealtimeStatus((status) => (status === "idle" ? "connecting" : "reconnecting"));
      socket = new WebSocket(
        createProjectSyncSubscriptionUrl({
          baseUrl: env.VITE_SERVER_URL,
          teamId,
        }),
      );

      socket.addEventListener("open", () => {
        setRealtimeStatus("connected");
        void collection.utils.refetch({ throwOnError: false });
      });
      socket.addEventListener("message", (event) => {
        const message = parseRealtimeMessage(event.data);

        if (
          isProjectSyncInvalidationEvent(message) &&
          message.teamId === teamId &&
          message.collection === projectSyncCollection.id
        ) {
          void collection.utils.refetch({ throwOnError: false });
        }
      });
      socket.addEventListener("close", () => {
        if (stopped) {
          return;
        }

        setRealtimeStatus("reconnecting");
        reconnectTimer = setTimeout(connect, 1_000);
      });
      socket.addEventListener("error", () => {
        socket?.close();
      });
    };

    connect();

    return () => {
      stopped = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      socket?.close();
    };
  }, [collection, teamId]);

  return {
    collection,
    projects: liveQuery.data ?? [],
    isLoading: liveQuery.isLoading,
    isReady: liveQuery.isReady,
    realtimeStatus,
    status: collection?.status ?? "idle",
    refetch: async () => {
      await collection?.utils.refetch({ throwOnError: false });
    },
  };
}

function parseRealtimeMessage(data: string) {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
}
