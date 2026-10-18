import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { db, withDatabaseRetry } from "@/lib/db";
import { hashVoterPassword, usernameSchema, passwordSchema } from "@/lib/voter-credentials";

const publicVoter = { id: true, displayName: true, username: true, eligible: true } as const;

const createSchema = z.object({
  displayName: z.string().trim().min(3).max(150),
  username: usernameSchema,
  password: passwordSchema,
  eligible: z.boolean().default(true),
});
const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
  password: passwordSchema.optional(),
});
const unavailable = () => NextResponse.json(
  { message: "The electorate database is temporarily unavailable. Please try again." },
  { status: 503 },
);

export async function POST(request: Request) {
  if (!await isAdminAuthenticated()) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Enter full name, username, and password." }, { status: 400 });
  try {
    const username = parsed.data.username;
    const duplicate = await withDatabaseRetry(() => db.voter.findUnique({ where: { username } }));
    if (duplicate) return NextResponse.json({ message: "An electorate already exists with this username." }, { status: 409 });
    const passwordHash = await hashVoterPassword(parsed.data.password);
    const voter = await withDatabaseRetry(() => db.voter.create({
      data: {
        username,
        displayName: parsed.data.displayName,
        passwordHash,
        eligible: parsed.data.eligible,
      },
      select: publicVoter,
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
    const username = parsed.data.username;
    if (username) {
      const duplicate = await withDatabaseRetry(() => db.voter.findFirst({ where: { username, id: { not: parsed.data.id } } }));
      if (duplicate) return NextResponse.json({ message: "Another electorate already uses this username." }, { status: 409 });
    }
    const passwordHash = parsed.data.password ? await hashVoterPassword(parsed.data.password) : undefined;
    const voter = await withDatabaseRetry(() => db.voter.update({
      where: { id: parsed.data.id },
      data: {
        displayName: parsed.data.displayName,
        username,
        eligible: parsed.data.eligible,
        passwordHash,
      },
      select: publicVoter,
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
