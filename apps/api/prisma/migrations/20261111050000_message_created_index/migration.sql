-- Inbox pulse: newest incoming messages without reading the whole table.
CREATE INDEX IF NOT EXISTS "Message_createdAt_idx" ON "Message"("createdAt");
