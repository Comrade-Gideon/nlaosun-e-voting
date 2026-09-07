import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { hashToken, issueToken, normalizeMatric } from "@/lib/security";
import { getPublicOrigin } from "@/lib/site-url";
import { publishCandidatePhoto } from "@/lib/blob-storage";

const createSchema = z.object({
  candidateName: z.string().trim().min(3).max(120),
  matriculationNumber: z.string().trim().min(4).max(50),
  positionId: z.string().min(1),
  validDays: z.enum(["7", "14", "30", "CUSTOM"]).default("14"),
  customExpiresAt: z.string().trim().optional(),
});
const reviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("APPROVE") }),
  z.object({
    action: z.literal("REJECT"),
    note: z.string().trim().min(5).max(1000),
  }),
]);
const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function watDate(value: string | undefined) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Date.UTC(+year, +month - 1, +day, +hour - 1, +minute));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated()))
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id)
    return NextResponse.json(
      { message: "Missing nomination id." },
      { status: 400 },
    );
  const invite = await db.nominationInvite.findUnique({
    where: { id },
    include: { position: true },
  });
  if (!invite)
    return NextResponse.json(
      { message: "Nomination not found." },
      { status: 404 },
    );
  return NextResponse.json({
    ...invite,
    position: invite.position.title,
    priorities: JSON.parse(invite.priorities),
    passportData: invite.passportData
      ? `/api/admin/nominations/file?id=${encodeURIComponent(invite.id)}&field=passport`
      : null,
    studentIdData: invite.studentIdData
      ? `/api/admin/nominations/file?id=${encodeURIComponent(invite.id)}&field=studentId`
      : null,
    transcriptData: invite.transcriptData
      ? `/api/admin/nominations/file?id=${encodeURIComponent(invite.id)}&field=transcript`
      : null,
    signatureData: invite.signatureData
      ? `/api/admin/nominations/file?id=${encodeURIComponent(invite.id)}&field=signature`
      : null,
    tokenHash: undefined,
  });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated()))
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      {
        message:
          "Enter the candidate name, matriculation number, position and validity period.",
      },
      { status: 400 },
    );
  const matriculationNumber = normalizeMatric(parsed.data.matriculationNumber);
  const [position, candidate, activeInvite] = await Promise.all([
    db.position.findUnique({ where: { id: parsed.data.positionId } }),
    db.candidate.findFirst({ where: { matriculationNumber } }),
    db.nominationInvite.findFirst({
      where: {
        matriculationNumber,
        status: { in: ["DRAFT", "REJECTED", "SUBMITTED"] },
      },
    }),
  ]);
  if (!position)
    return NextResponse.json(
      { message: "Position not found." },
      { status: 404 },
    );
  if (candidate)
    return NextResponse.json(
      { message: "A candidate already exists with this matriculation number." },
      { status: 409 },
    );
  if (activeInvite)
    return NextResponse.json(
      {
        message:
          "An active nomination link already exists for this matriculation number.",
      },
      { status: 409 },
    );
  const token = issueToken();
  const customExpiry = watDate(parsed.data.customExpiresAt);
  if (parsed.data.validDays === "CUSTOM" && (!customExpiry || customExpiry <= new Date()))
    return NextResponse.json(
      { message: "Choose a future expiry date and time in WAT." },
      { status: 400 },
    );
  const expiresAt = parsed.data.validDays === "CUSTOM"
    ? customExpiry!
    : new Date(Date.now() + Number(parsed.data.validDays) * 86400000);
  const invite = await db.nominationInvite.create({
    data: {
      tokenHash: hashToken(token),
      candidateName: parsed.data.candidateName,
      matriculationNumber,
      positionId: position.id,
      expiresAt,
      showCountdown: true,
    },
  });
  return NextResponse.json(
    {
      id: invite.id,
      link: `${getPublicOrigin(request)}/nominate/${token}`,
      expiresAt: invite.expiresAt,
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated()))
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id)
    return NextResponse.json(
      { message: "Missing nomination id." },
      { status: 400 },
    );
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: "Choose approve or provide a clear rejection reason." },
      { status: 400 },
    );
  const invite = await db.nominationInvite.findUnique({
    where: { id },
    include: { position: true },
  });
  if (!invite)
    return NextResponse.json(
      { message: "Nomination not found." },
      { status: 404 },
    );
  if (invite.status !== "SUBMITTED")
    return NextResponse.json(
      { message: "Only a submitted nomination can be reviewed." },
      { status: 409 },
    );
  if (parsed.data.action === "REJECT") {
    const minimumExpiry = new Date(Date.now() + 14 * 86400000);
    await db.nominationInvite.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewNote: parsed.data.note,
        reviewedAt: new Date(),
        expiresAt:
          invite.expiresAt > minimumExpiry ? invite.expiresAt : minimumExpiry,
      },
    });
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }
  if (!invite.passportData)
    return NextResponse.json(
      { message: "The candidate must upload a passport before approval." },
      { status: 409 },
    );
  let publicPhotoUrl: string;
  try {
    publicPhotoUrl = await publishCandidatePhoto(invite.passportData, invite.id);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "The passport could not be published to image storage.",
      },
      { status: 503 },
    );
  }
  const candidate = await db.$transaction(
    async (tx) => {
      const current = await tx.nominationInvite.findUnique({ where: { id } });
      if (!current || current.status !== "SUBMITTED")
        throw new Error("ALREADY_REVIEWED");
      const matriculationNumber = normalizeMatric(current.matriculationNumber);
      const candidateData = {
        positionId: current.positionId,
        name: current.candidateName,
        pka: current.pka,
        matriculationNumber,
        department: "Library & Information Science",
        level: current.level,
        photoUrl: publicPhotoUrl,
        tagline: current.tagline,
        biography: current.biography,
        manifesto: current.manifesto,
        vision: current.vision,
        mission: current.mission,
        priorities: current.priorities,
        verified: true,
      };
      let existing = current.candidateId
        ? await tx.candidate.findUnique({ where: { id: current.candidateId } })
        : await tx.candidate.findFirst({ where: { matriculationNumber } });
      if (existing)
        existing = await tx.candidate.update({
          where: { id: existing.id },
          data: candidateData,
        });
      else {
        let slug = slugify(current.candidateName);
        if (await tx.candidate.findUnique({ where: { slug } }))
          slug = `${slug}-${Date.now().toString(36)}`;
        existing = await tx.candidate.create({
          data: { ...candidateData, slug },
        });
      }
      await tx.nominationInvite.update({
        where: { id },
        data: {
          status: "APPROVED",
          candidateId: existing.id,
          reviewNote: "Approved by the Electoral Commission.",
          reviewedAt: new Date(),
        },
      });
      return existing;
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
  revalidatePath("/candidates");
  revalidatePath("/election");
  revalidatePath("/");
  return NextResponse.json({
    ok: true,
    status: "APPROVED",
    candidateId: candidate.id,
  });
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated()))
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const deleteCandidate = url.searchParams.get("action") === "deleteCandidate";
  if (!id)
    return NextResponse.json(
      { message: "Missing invitation id." },
      { status: 400 },
    );
  const invite = await db.nominationInvite.findUnique({ where: { id } });
  if (!invite)
    return NextResponse.json(
      { message: "Invitation not found." },
      { status: 404 },
    );
  if (deleteCandidate) {
    if (invite.status === "REJECTED") {
      await db.nominationInvite.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }
    if (invite.status !== "APPROVED" || !invite.candidateId)
      return NextResponse.json(
        { message: "Only an approved or rejected candidate can be deleted." },
        { status: 409 },
      );
    const referencedVote = await db.vote.findFirst({
      where: { candidateId: invite.candidateId },
      select: { id: true },
    });
    if (referencedVote)
      return NextResponse.json(
        { message: "This candidate cannot be deleted because a submitted ballot references them." },
        { status: 409 },
      );
    await db.$transaction([
      db.nominationInvite.update({ where: { id }, data: { status: "REVOKED", candidateId: null } }),
      db.candidate.delete({ where: { id: invite.candidateId } }),
    ]);
    revalidatePath("/candidates");
    revalidatePath("/election");
    revalidatePath("/");
    return NextResponse.json({ ok: true });
  }
  if (["SUBMITTED", "APPROVED"].includes(invite.status))
    return NextResponse.json(
      { message: "A submitted or approved nomination cannot be revoked." },
      { status: 409 },
    );
  await db.nominationInvite.update({
    where: { id },
    data: { status: "REVOKED" },
  });
  return NextResponse.json({ ok: true });
}
