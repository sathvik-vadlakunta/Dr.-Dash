-- Section 5.3. The extension must exist before the trigram index that uses it.
-- It is pinned to `public` and referenced schema-qualified so the index also
-- builds inside the per-file schemas the integration suite creates, where
-- `public` is not on the search path.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE INDEX IF NOT EXISTS observation_series_date_desc
  ON "Observation" ("seriesId", "date" DESC);

CREATE INDEX IF NOT EXISTS series_title_trgm
  ON "Series" USING gin (lower("title") public.gin_trgm_ops);
