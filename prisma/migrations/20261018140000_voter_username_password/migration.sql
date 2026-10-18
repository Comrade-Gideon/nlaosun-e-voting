ALTER TABLE "Voter" ADD COLUMN "username" TEXT,
ADD COLUMN "passwordHash" TEXT,
ALTER COLUMN "matriculationNumber" DROP NOT NULL,
ALTER COLUMN "surnameNormalizedHash" SET DEFAULT '';
CREATE UNIQUE INDEX "Voter_username_key" ON "Voter"("username");
