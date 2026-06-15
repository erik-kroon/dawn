import {
  completeTeamDataExport,
  type CompleteTeamDataExportResult,
  type DawnRepository,
} from "@dawn/app";
import type { TeamDataExportJob } from "@dawn/jobs";

import type { DocumentObjectStorage } from "./document-storage";

export type ProcessTeamDataExportJobInput = {
  repository: DawnRepository;
  storage: DocumentObjectStorage;
  message: TeamDataExportJob;
  generatedAt?: string;
};

export type ProcessTeamDataExportJobResult = CompleteTeamDataExportResult;

export async function processTeamDataExportJob(
  input: ProcessTeamDataExportJobInput,
): Promise<ProcessTeamDataExportJobResult> {
  return completeTeamDataExport(input.repository, input.storage, {
    teamId: input.message.teamId,
    format: input.message.format,
    sourceOutboxEventId: input.message.sourceOutboxEventId,
    idempotencyKey: input.message.idempotencyKey,
    generatedAt: input.generatedAt,
  });
}
