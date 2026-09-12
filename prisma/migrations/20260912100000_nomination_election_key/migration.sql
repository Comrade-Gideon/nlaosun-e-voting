-- Email identifies a nomination within one election rather than globally, so a
-- past candidate can stand again in a later election. electionId is derived from
-- the position the nomination was filed against.
ALTER TABLE "NominationInvite" ADD COLUMN "electionId" TEXT;

UPDATE "NominationInvite" AS n
   SET "electionId" = p."electionId"
  FROM "Position" AS p
 WHERE p."id" = n."positionId";

ALTER TABLE "NominationInvite" ALTER COLUMN "electionId" SET NOT NULL;
ALTER TABLE "NominationInvite" ADD CONSTRAINT "NominationInvite_electionId_fkey"
    FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "NominationInvite_email_key";
DROP INDEX "NominationInvite_email_status_idx";
CREATE UNIQUE INDEX "NominationInvite_electionId_email_key" ON "NominationInvite"("electionId", "email");
CREATE INDEX "NominationInvite_electionId_email_status_idx" ON "NominationInvite"("electionId", "email", "status");
