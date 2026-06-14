import { describe, expect, test } from "bun:test";

import { cloudflareBindingNames } from "./cloudflare";
import {
  cloudflareResourceName,
  cloudflareStageConfig,
  cloudflareStages,
  resolveCloudflareStage,
} from "./environments";

describe("Cloudflare infrastructure environment plan", () => {
  test("defines preview, staging, and production stages", () => {
    expect(cloudflareStages).toEqual(["preview", "staging", "production"]);
    expect(cloudflareStageConfig.preview.deleteProtectedData).toBe(true);
    expect(cloudflareStageConfig.staging.deleteProtectedData).toBe(false);
    expect(cloudflareStageConfig.production.deleteProtectedData).toBe(false);
  });

  test("names resources by stage", () => {
    expect(cloudflareResourceName("preview", "documents")).toBe("dawn-preview-documents");
    expect(cloudflareResourceName("staging", "jobs")).toBe("dawn-staging-jobs");
    expect(cloudflareResourceName("production", "api")).toBe("dawn-production-api");
  });

  test("rejects unsupported stages", () => {
    expect(resolveCloudflareStage("preview")).toBe("preview");
    expect(() => resolveCloudflareStage("local")).toThrow("Unsupported Cloudflare stage: local");
  });

  test("declares runtime bindings for storage, jobs, coordination, and database access", () => {
    expect(Object.values(cloudflareBindingNames)).toEqual([
      "ENVIRONMENT",
      "DAWN_DOCUMENTS",
      "DAWN_JOBS",
      "DAWN_JOBS_DLQ",
      "DAWN_CACHE",
      "DAWN_TENANT_COORDINATOR",
      "DAWN_HYPERDRIVE",
    ]);
  });
});
