import type { DawnCloudflareStage } from "./cloudflare";

export const cloudflareStages = ["preview", "staging", "production"] as const;

export type CloudflareStageConfig = {
  stage: DawnCloudflareStage;
  resourcePrefix: string;
  deleteProtectedData: boolean;
  workerUrl: boolean;
};

export const cloudflareStageConfig: Record<DawnCloudflareStage, CloudflareStageConfig> = {
  preview: {
    stage: "preview",
    resourcePrefix: "dawn-preview",
    deleteProtectedData: true,
    workerUrl: true,
  },
  staging: {
    stage: "staging",
    resourcePrefix: "dawn-staging",
    deleteProtectedData: false,
    workerUrl: true,
  },
  production: {
    stage: "production",
    resourcePrefix: "dawn-production",
    deleteProtectedData: false,
    workerUrl: true,
  },
};

export function resolveCloudflareStage(input?: string | null): DawnCloudflareStage {
  const stage = input ?? "preview";

  if (isCloudflareStage(stage)) {
    return stage;
  }

  throw new Error(`Unsupported Cloudflare stage: ${stage}`);
}

export function cloudflareResourceName(stage: DawnCloudflareStage, resource: string) {
  return `${cloudflareStageConfig[stage].resourcePrefix}-${resource}`;
}

function isCloudflareStage(stage: string): stage is DawnCloudflareStage {
  return cloudflareStages.includes(stage as DawnCloudflareStage);
}
