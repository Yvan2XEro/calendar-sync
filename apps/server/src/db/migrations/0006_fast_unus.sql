CREATE UNIQUE INDEX "event_provider_id_external_id_unique" ON "event" USING btree ("provider_id","external_id");
