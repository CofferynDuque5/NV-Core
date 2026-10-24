-- Publicaciones programadas: marca de inicio de publicación para detectar
-- publicaciones interrumpidas por un reinicio, e índice para el barrido.
ALTER TABLE "Post" ADD COLUMN "publishStartedAt" TIMESTAMP(3);

CREATE INDEX "Post_status_scheduledAt_idx" ON "Post"("status", "scheduledAt");
