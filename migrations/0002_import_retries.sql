-- A file has one immutable root batch. Retrying failed rows appends a linked
-- batch with the same content hash; completed row numbers prevent redelivery.
DROP INDEX IF EXISTS import_hash_identity;
CREATE UNIQUE INDEX import_hash_identity
  ON imports (workspace, (document->>'kind'), (document->>'hash'))
  WHERE document->>'retryOf' IS NULL;
