import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { publishCandidatePhoto } from "@/lib/blob-storage";

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
    identificationData: invite.identificationData
      ? `/api/admin/nominations/file?id=${encodeURIComponent(invite.id)}&field=identification`
      : null,
    signatureData: invite.signatureData
      ? `/api/admin/nominations/file?id=${encodeURIComponent(invite.id)}&field=signature`
      : null,
    tokenHash: undefined,
  });
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
      const candidateData = {
        positionId: current.positionId,
        name: current.candidateName,
        pka: current.pka,
        email: current.email,
        lrcnNumber: current.lrcnNumber,
        currentPosition: current.currentPosition,
        department: current.currentPosition,
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
        : await tx.candidate.findFirst({ where: { email: current.email } });
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
          reviewNote: "Approved by the Election Committee.",
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
