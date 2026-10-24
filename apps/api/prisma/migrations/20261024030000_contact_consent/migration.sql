-- Contactos: bajas (opt-out) y consentimiento. Las secuencias y automatizaciones
-- no escriben a un contacto dado de baja.
ALTER TABLE "Contact" ADD COLUMN "optOutAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "optOutSource" TEXT;
ALTER TABLE "Contact" ADD COLUMN "consentAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "consentSource" TEXT;
