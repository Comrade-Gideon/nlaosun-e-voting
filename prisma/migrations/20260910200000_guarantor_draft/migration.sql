-- Guarantor names/emails autosave with the rest of the draft. Real Guarantor
-- rows carry invitation tokens and are only created on submission.
ALTER TABLE "NominationInvite" ADD COLUMN "guarantorsDraft" TEXT NOT NULL DEFAULT '[]';
