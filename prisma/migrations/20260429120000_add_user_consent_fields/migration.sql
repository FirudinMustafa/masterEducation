-- KVKK / acik riza alanlari User modeline ekleniyor.
-- termsAcceptedAt: Uyelik Sozlesmesi + KVKK aydinlatma metnini kabul tarihi.
-- marketingConsent: Ticari elektronik ileti onayi (default false).
-- marketingConsentAt: marketingConsent en son ne zaman degisti.

ALTER TABLE "users"
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "marketingConsentAt" TIMESTAMP(3);
