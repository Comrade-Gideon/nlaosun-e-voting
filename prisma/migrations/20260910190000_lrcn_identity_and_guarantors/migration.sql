-- Nominations move from student identity (matric number, part, CGPA) to
-- professional identity: a required unique email plus optional LRCN
-- certification. Two guarantors per nomination complete their own sections
-- through links of their own.

-- Guarantors -----------------------------------------------------------------
CREATE TABLE "Guarantor" (
    "id" TEXT NOT NULL,
    "nominationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "institution" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "recommendation" TEXT NOT NULL DEFAULT '',
    "signatureData" TEXT,
    "signatureName" TEXT,
    "invitedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guarantor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Guarantor_tokenHash_key" ON "Guarantor"("tokenHash");
CREATE INDEX "Guarantor_nominationId_idx" ON "Guarantor"("nominationId");
ALTER TABLE "Guarantor" ADD CONSTRAINT "Guarantor_nominationId_fkey"
    FOREIGN KEY ("nominationId") REFERENCES "NominationInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NominationInvite -----------------------------------------------------------
ALTER TABLE "NominationInvite" ADD COLUMN "email" TEXT;
-- Existing rows predate email collection; derive a placeholder from the matric
-- number so each row stays traceable. The row id is appended because the same
-- matric number appears on more than one historic nomination.
UPDATE "NominationInvite"
   SET "email" = lower(regexp_replace("matriculationNumber", '[^A-Za-z0-9]+', '-', 'g'))
              || '.' || "id" || '@placeholder.invalid'
 WHERE "email" IS NULL;
ALTER TABLE "NominationInvite" ALTER COLUMN "email" SET NOT NULL;
CREATE UNIQUE INDEX "NominationInvite_email_key" ON "NominationInvite"("email");

ALTER TABLE "NominationInvite" ADD COLUMN "lrcnCertified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "NominationInvite" ADD COLUMN "lrcnNumber" TEXT;
ALTER TABLE "NominationInvite" ADD COLUMN "currentPosition" TEXT NOT NULL DEFAULT '';

ALTER TABLE "NominationInvite" RENAME COLUMN "transcriptData" TO "identificationData";
ALTER TABLE "NominationInvite" RENAME COLUMN "transcriptName" TO "identificationName";

DROP INDEX "NominationInvite_matriculationNumber_status_idx";
CREATE INDEX "NominationInvite_email_status_idx" ON "NominationInvite"("email", "status");
ALTER TABLE "NominationInvite" DROP COLUMN "matriculationNumber";
ALTER TABLE "NominationInvite" DROP COLUMN "level";
ALTER TABLE "NominationInvite" DROP COLUMN "cgpa";

-- Candidate ------------------------------------------------------------------
ALTER TABLE "Candidate" ADD COLUMN "email" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "lrcnNumber" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "currentPosition" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Candidate" ALTER COLUMN "level" SET DEFAULT '';
