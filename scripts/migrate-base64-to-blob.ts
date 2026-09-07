import { put } from "@vercel/blob";
import { PrismaClient } from "@prisma/client";
import {
  decodeDataUrl,
  isDataUrl,
  safeFilename,
} from "../src/lib/blob-storage";

const db = new PrismaClient();

function blobAuth(access: "private" | "public") {
  const prefix = access === "private" ? "PRIVATE" : "PUBLIC";
  const token = process.env[`${prefix}_READ_WRITE_TOKEN`];
  if (token) return { token };

  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  const storeId = process.env[`${prefix}_STORE_ID`];
  if (oidcToken && storeId) return { oidcToken, storeId };

  throw new Error(
    `${prefix} Blob authentication is not configured. Set ${prefix}_READ_WRITE_TOKEN, or use VERCEL_OIDC_TOKEN together with ${prefix}_STORE_ID.`,
  );
}

function extension(contentType: string) {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

async function uploadDataUrl(
  value: string,
  pathname: string,
  access: "private" | "public",
) {
  const { body, contentType } = decodeDataUrl(value);
  const result = await put(`${pathname}.${extension(contentType)}`, body, {
    access,
    ...blobAuth(access),
    contentType,
    allowOverwrite: true,
    cacheControlMaxAge: 60 * 60 * 24 * 30,
  });
  return result.url;
}

async function migrateNominations() {
  const invitations = await db.nominationInvite.findMany({
    select: {
      id: true,
      passportData: true,
      passportName: true,
      studentIdData: true,
      studentIdName: true,
      transcriptData: true,
      transcriptName: true,
      signatureData: true,
      signatureName: true,
    },
  });
  let migrated = 0;
  const files = [
    ["passportData", "passportName", "passport"],
    ["studentIdData", "studentIdName", "studentId"],
    ["transcriptData", "transcriptName", "transcript"],
    ["signatureData", "signatureName", "signature"],
  ] as const;

  for (const invitation of invitations) {
    for (const [dataKey, nameKey, field] of files) {
      const value = invitation[dataKey];
      if (!value || !isDataUrl(value)) continue;
      const filename = safeFilename(invitation[nameKey], field);
      const url = await uploadDataUrl(
        value,
        `nominations/${invitation.id}/${field}/${filename}`,
        "private",
      );
      await db.nominationInvite.update({
        where: { id: invitation.id },
        data: { [dataKey]: url },
      });
      migrated += 1;
      console.log(`Migrated nomination ${invitation.id}: ${field}`);
    }
  }
  return migrated;
}

async function migrateCandidatePhotos() {
  const candidates = await db.candidate.findMany({
    select: { id: true, photoUrl: true },
  });
  let migrated = 0;
  for (const candidate of candidates) {
    if (!candidate.photoUrl || !isDataUrl(candidate.photoUrl)) continue;
    const url = await uploadDataUrl(
      candidate.photoUrl,
      `candidates/${candidate.id}/passport`,
      "public",
    );
    await db.candidate.update({
      where: { id: candidate.id },
      data: { photoUrl: url },
    });
    migrated += 1;
    console.log(`Migrated candidate photo ${candidate.id}`);
  }
  return migrated;
}

async function migrateAnnouncementImages() {
  const announcements = await db.announcement.findMany({
    select: { id: true, featuredImage: true },
  });
  let migrated = 0;
  for (const announcement of announcements) {
    if (!announcement.featuredImage || !isDataUrl(announcement.featuredImage))
      continue;
    const url = await uploadDataUrl(
      announcement.featuredImage,
      `announcements/${announcement.id}/featured-image`,
      "public",
    );
    await db.announcement.update({
      where: { id: announcement.id },
      data: { featuredImage: url },
    });
    migrated += 1;
    console.log(`Migrated announcement image ${announcement.id}`);
  }
  return migrated;
}

async function main() {
  blobAuth("private");
  blobAuth("public");
  console.log("Starting resumable Base64-to-Blob migration…");
  const nominationFiles = await migrateNominations();
  const candidatePhotos = await migrateCandidatePhotos();
  const announcementImages = await migrateAnnouncementImages();
  const [remainingNominations, remainingCandidates, remainingAnnouncements] =
    await Promise.all([
      db.nominationInvite.count({
        where: {
          OR: [
            { passportData: { startsWith: "data:" } },
            { studentIdData: { startsWith: "data:" } },
            { transcriptData: { startsWith: "data:" } },
            { signatureData: { startsWith: "data:" } },
          ],
        },
      }),
      db.candidate.count({ where: { photoUrl: { startsWith: "data:" } } }),
      db.announcement.count({
        where: { featuredImage: { startsWith: "data:" } },
      }),
    ]);
  console.log(
    `Migration complete: ${nominationFiles} private nomination files, ${candidatePhotos} candidate photos, ${announcementImages} announcement images.`,
  );
  console.log(
    `Remaining Base64 rows: ${remainingNominations} nominations, ${remainingCandidates} candidates, ${remainingAnnouncements} announcements.`,
  );
  if (remainingNominations || remainingCandidates || remainingAnnouncements)
    process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
