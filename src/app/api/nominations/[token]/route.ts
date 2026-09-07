import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isExpectedNominationBlob, storedImageDataUrl } from "@/lib/blob-storage";
import { hashToken, normalizeMatric, receiptCode } from "@/lib/security";

const dataFile = z.string().max(6_000_000).nullable().optional();
const cgpa = z.string().trim().regex(/^(?:[0-4](?:\.\d{1,2})?|5(?:\.0{1,2})?)$/, "CGPA must be between 0.00 and 5.00.");
const draftSchema = z.object({ phone: z.string().trim().max(30).optional(), level: z.enum(["Part 1", "Part 2", "Part 3"]).or(z.literal("")).optional(), cgpa: z.string().trim().max(4).optional(), permanentAddress: z.string().trim().max(500).optional(), pka: z.string().trim().max(100).optional(), tagline: z.string().trim().max(180).optional(), biography: z.string().trim().max(1500).optional(), manifesto: z.string().trim().max(1000).optional(), mission: z.string().trim().max(1000).optional(), vision: z.string().trim().max(1000).optional(), priorities: z.array(z.string().trim().max(240)).max(3).optional(), passportData: dataFile, passportName: z.string().max(180).nullable().optional(), studentIdData: dataFile, studentIdName: z.string().max(180).nullable().optional(), transcriptData: dataFile, transcriptName: z.string().max(180).nullable().optional(), signatureData: dataFile, signatureName: z.string().max(180).nullable().optional(), declarationsAccepted: z.boolean().optional() });
const finalSchema = draftSchema.extend({ phone: z.string().trim().min(7).max(30), level: z.enum(["Part 1", "Part 2", "Part 3"]), cgpa, permanentAddress: z.string().trim().min(10).max(500), pka: z.string().trim().min(2).max(100), tagline: z.string().trim().min(2).max(180), biography: z.string().trim().min(50).max(1500), manifesto: z.string().trim().min(400).max(1000), mission: z.string().trim().min(400).max(1000), vision: z.string().trim().min(400).max(1000), priorities: z.array(z.string().trim().min(2).max(240)).length(3), passportData: z.string().min(20).max(2_500_000), passportName: z.string().min(1).max(180), studentIdData: z.string().min(20).max(6_000_000), studentIdName: z.string().min(1).max(180), transcriptData: z.string().min(20).max(6_000_000), transcriptName: z.string().min(1).max(180), signatureData: z.string().min(20).max(2_500_000), signatureName: z.string().min(1).max(180), declarationsAccepted: z.literal(true) });
async function activeInvite(token: string) { return db.nominationInvite.findUnique({ where: { tokenHash: hashToken(token) }, include: { position: true } }); }
function editable(invite: Awaited<ReturnType<typeof activeInvite>>) { return !!invite && ["DRAFT", "REJECTED"].includes(invite.status) && invite.expiresAt > new Date(); }
function isTransientDatabaseError(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && ["P1001", "P2024", "P2028"].includes(error.code); }
async function retryDatabase<T>(operation: () => Promise<T>) {
  try { return await operation(); }
  catch (error) {
    if (!isTransientDatabaseError(error)) throw error;
    await new Promise(resolve => setTimeout(resolve, 400));
    return operation();
  }
}
function unavailable() { return NextResponse.json({ code: "DATABASE_UNAVAILABLE", message: "The nomination database is temporarily unavailable. Your information is still on this device; please wait a moment and try again." }, { status: 503, headers: { "Retry-After": "3" } }); }

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const invite = await retryDatabase(() =>
      db.nominationInvite.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { position: true },
      })
    );
    if (!invite) return NextResponse.json({ code: "INVALID", message: "This nomination link is invalid." }, { status: 410 });
    if (invite.status === "SUBMITTED") return NextResponse.json({ code: "SUBMITTED", message: "This nomination form has already been submitted and is awaiting Electoral Commission review." }, { status: 410 });
    if (invite.status === "APPROVED") return NextResponse.json({ code: "APPROVED", message: "This nomination has been approved and published on the candidate page." }, { status: 410 });
    if (invite.status === "REVOKED") return NextResponse.json({ code: "REVOKED", message: "This nomination link has been revoked by the Electoral Commission." }, { status: 410 });
    if (invite.expiresAt <= new Date()) return NextResponse.json({ code: "EXPIRED", message: "This nomination link has expired." }, { status: 410 });
    if (!["DRAFT", "REJECTED"].includes(invite.status) || invite.expiresAt <= new Date()) return NextResponse.json({ message: "This nomination link is no longer valid." }, { status: 410 });
    return NextResponse.json({
      candidateName: invite.candidateName,
      matriculationNumber: invite.matriculationNumber,
      position: { id: invite.position.id, title: invite.position.title },
      uploadId: invite.id,
      expiresAt: invite.expiresAt,
      showExpiryCountdown: true,
      reviewNote: invite.status === "REJECTED" ? invite.reviewNote : "",
      draft: {
        phone: invite.phone,
        level: invite.level,
        cgpa: invite.cgpa,
        permanentAddress: invite.permanentAddress,
        pka: invite.pka,
        tagline: invite.tagline,
        biography: invite.biography,
        manifesto: invite.manifesto,
        mission: invite.mission,
        vision: invite.vision,
        priorities: JSON.parse(invite.priorities),
        passportData: invite.passportData,
        passportName: invite.passportName,
        studentIdData: invite.studentIdData,
        studentIdName: invite.studentIdName,
        transcriptData: invite.transcriptData,
        transcriptName: invite.transcriptName,
        signatureData: invite.signatureData,
        signatureName: invite.signatureName,
        declarationsAccepted: invite.declarationsAccepted,
      },
    });
  } catch (error) {
    if (isTransientDatabaseError(error)) return unavailable();
    throw error;
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params; const invite = await retryDatabase(() => activeInvite(token));
    if (!editable(invite)) return NextResponse.json({ message: "This nomination link is no longer valid." }, { status: 410 });
    const parsed = draftSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: "Some draft fields are invalid or files are too large." }, { status: 400 });
    const { priorities, ...data } = parsed.data;
    const files = [
      ["passport", data.passportData],
      ["studentId", data.studentIdData],
      ["transcript", data.transcriptData],
      ["signature", data.signatureData],
    ] as const;
    if (files.some(([field, value]) => value && !isExpectedNominationBlob(value, invite!.id, field)))
      return NextResponse.json({ message: "One or more uploaded file references are invalid." }, { status: 400 });
    await retryDatabase(() => db.nominationInvite.update({ where: { id: invite!.id }, data: { ...data, ...(priorities ? { priorities: JSON.stringify(priorities) } : {}) } }));
    return NextResponse.json({ ok: true });
  } catch (error) { if (isTransientDatabaseError(error)) return unavailable(); throw error; }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const body = await request.json().catch(() => null); const parsed = finalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Complete every required field, including permanent home address and PKA. Manifesto, mission and vision must each contain 400–1000 characters.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const current = await activeInvite(token);
    if (!editable(current))
      return NextResponse.json({ message: "This nomination link is invalid or has already been used." }, { status: 410 });
    const files = [
      ["passport", parsed.data.passportData],
      ["studentId", parsed.data.studentIdData],
      ["transcript", parsed.data.transcriptData],
      ["signature", parsed.data.signatureData],
    ] as const;
    if (files.some(([field, value]) => !isExpectedNominationBlob(value, current!.id, field)))
      return NextResponse.json({ message: "One or more uploaded file references are invalid." }, { status: 400 });
    const passportForPrint = await storedImageDataUrl(parsed.data.passportData);
    const result = await db.$transaction(async tx => {
      const invite = await tx.nominationInvite.findUnique({ where: { tokenHash: hashToken(token) }, include: { position: true } });
      if (!invite || !["DRAFT", "REJECTED"].includes(invite.status) || invite.expiresAt <= new Date()) throw new Error("INVALID_LINK");
      const matriculationNumber = normalizeMatric(invite.matriculationNumber);
      if (await tx.candidate.findFirst({ where: { matriculationNumber } })) throw new Error("DUPLICATE_CANDIDATE");
      const receipt = receiptCode();
      await tx.nominationInvite.update({ where: { id: invite.id }, data: { ...parsed.data, priorities: JSON.stringify(parsed.data.priorities), status: "SUBMITTED", reviewNote: "", reviewedAt: null, receipt, submittedAt: new Date() } });
      return { receipt, candidateName: invite.candidateName, matriculationNumber, position: invite.position.title, level: parsed.data.level, cgpa: parsed.data.cgpa, phone: parsed.data.phone, permanentAddress: parsed.data.permanentAddress, pka: parsed.data.pka, tagline: parsed.data.tagline, biography: parsed.data.biography, manifesto: parsed.data.manifesto, mission: parsed.data.mission, vision: parsed.data.vision, priorities: parsed.data.priorities, submittedAt: new Date().toISOString() };
    }, { maxWait: 30_000, timeout: 120_000 });
    revalidatePath("/candidates"); revalidatePath("/election"); revalidatePath("/");
    return NextResponse.json({ ...result, passportData: passportForPrint }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_LINK") return NextResponse.json({ message: "This nomination link is invalid or has already been used." }, { status: 410 });
    if (error instanceof Error && error.message === "DUPLICATE_CANDIDATE") return NextResponse.json({ message: "A candidate already exists with this matriculation number." }, { status: 409 });
    if (isTransientDatabaseError(error)) return unavailable();
    throw error;
  }
}
