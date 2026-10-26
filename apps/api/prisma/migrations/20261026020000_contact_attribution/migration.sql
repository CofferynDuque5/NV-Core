-- Origen del lead (primer contacto) capturado por formularios y embudos públicos.
ALTER TABLE "Contact" ADD COLUMN "attribution" JSONB;
