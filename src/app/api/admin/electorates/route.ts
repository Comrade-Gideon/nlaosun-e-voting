import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { db, withDatabaseRetry } from "@/lib/db";
import { hashSurname, normalizePhone } from "@/lib/security";

const createSchema = z.object({
  displayName: z.string().trim().min(3).max(150),
  phoneNumber: z.string().trim().min(7).max(30),
  surname: z.string().trim().min(2).max(80),
  eligible: z.boolean().default(true),
});
const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
  surname: z.string().trim().max(80).optional(),
});
const unavailable = () => NextResponse.json(
  { message: "The electorate database is temporarily unavailable. Please try again." },
  { status: 503 },
);

export async function POST(request: Request) {
  if (!await isAdminAuthenticated()) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Enter full name, phone number, and surname." }, { status: 400 });
  try {
    const phoneNumber = normalizePhone(parsed.data.phoneNumber);
    if (!phoneNumber) return NextResponse.json({ message: "Enter a valid phone number." }, { status: 400 });
    const duplicate = await withDatabaseRetry(() => db.voter.findUnique({ where: { phoneNumber } }));
    if (duplicate) return NextResponse.json({ message: "An electorate already exists with this phone number." }, { status: 409 });
    const voter = await withDatabaseRetry(() => db.voter.create({
      data: {
        phoneNumber,
        displayName: parsed.data.displayName,
        surnameNormalizedHash: hashSurname(parsed.data.surname),
        eligible: parsed.data.eligible,
      },
    }));
    return NextResponse.json(voter, { status: 201 });
  } catch {
    return unavailable();
  }
}

export async function PATCH(request: Request) {
  if (!await isAdminAuthenticated()) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "The electorate information is invalid." }, { status: 400 });
  try {
    const existing = await withDatabaseRetry(() => db.voter.findUnique({ where: { id: parsed.data.id } }));
    if (!existing) return NextResponse.json({ message: "Electorate not found." }, { status: 404 });
    const phoneNumber = parsed.data.phoneNumber ? normalizePhone(parsed.data.phoneNumber) : undefined;
    if (phoneNumber === "") return NextResponse.json({ message: "Enter a valid phone number." }, { status: 400 });
    if (phoneNumber) {
      const duplicate = await withDatabaseRetry(() => db.voter.findFirst({ where: { phoneNumber, id: { not: parsed.data.id } } }));
      if (duplicate) return NextResponse.json({ message: "Another electorate already uses this phone number." }, { status: 409 });
    }
    const voter = await withDatabaseRetry(() => db.voter.update({
      where: { id: parsed.data.id },
      data: {
        displayName: parsed.data.displayName,
        phoneNumber,
        eligible: parsed.data.eligible,
        ...(parsed.data.surname ? { surnameNormalizedHash: hashSurname(parsed.data.surname) } : {}),
      },
    }));
    return NextResponse.json(voter);
  } catch {
    return unavailable();
  }
}

export async function DELETE(request: Request) {
  if (!await isAdminAuthenticated()) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ message: "Missing electorate id." }, { status: 400 });
  try {
    const voter = await withDatabaseRetry(() => db.voter.findUnique({
      where: { id },
      select: { id: true, ballots: { select: { id: true }, take: 1 } },
    }));
    if (!voter) return NextResponse.json({ message: "Electorate not found." }, { status: 404 });
    if (voter.ballots.length) {
      await withDatabaseRetry(() => db.voter.update({ where: { id }, data: { eligible: false } }));
      return NextResponse.json({ ok: true, disabled: true, message: "This electorate has a submitted ballot, so the account was disabled while its ballot was preserved." });
    }
    await withDatabaseRetry(() => db.voter.delete({ where: { id } }));
    return NextResponse.json({ ok: true });
  } catch {
    return unavailable();
  }
}
