-- Nominations moved from per-candidate admin-generated links to a single shared
-- link. These two columns bound the window that link accepts entries in; either
-- being NULL means nominations are closed.
ALTER TABLE "Election" ADD COLUMN "nominationsOpenAt" TIMESTAMP(3);
ALTER TABLE "Election" ADD COLUMN "nominationsCloseAt" TIMESTAMP(3);
