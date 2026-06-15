CREATE UNIQUE INDEX "integration_sync_run_running_connection_idx" ON "integration_sync_run" USING btree ("integration_connection_id") WHERE "status" = 'running';
