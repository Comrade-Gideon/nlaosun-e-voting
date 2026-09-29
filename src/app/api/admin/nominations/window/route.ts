import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { db, withDatabaseRetry } from "@/lib/db";

/**
 * The Election Committee no longer issues a link per candidate. Everyone uses the
 * same `/nominate` link, and the only control here is the window that link accepts
 * entries in. Clearing the window closes nominations immediately.
 */
const windowSchema = z.union([
  z.object({ action: z.literal("CLOSE") }),
  z
    .object({
      action: z.literal("SET"),
      opensAt: z.coerce.date(),
      closesAt: z.coerce.date(),
    })
    .refine((data) => data.closesAt > data.opensAt, {
      message: "The closing time must come after the opening time.",
    }),
]);

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated()))
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const parsed = windowSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Choose a valid nomination opening and closing time." },
      { status: 400 },
    );

  const election = await withDatabaseRetry(() => db.election.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { opensAt: "desc" },
    select: { id: true },
  }));
  if (!election)
    return NextResponse.json({ message: "Publish an election before opening nominations." }, { status: 409 });

  const settings = parsed.data;
  const updated = await withDatabaseRetry(() => db.election.update({
    where: { id: election.id },
    data: settings.action === "CLOSE"
      ? { nominationsOpenAt: null, nominationsCloseAt: null }
      : { nominationsOpenAt: settings.opensAt, nominationsCloseAt: settings.closesAt },
    select: { nominationsOpenAt: true, nominationsCloseAt: true },
  }));

  // Nominations follow the window. SUBMITTED is included because guarantor links
  // are valid until their nomination's expiry: extending the window used to leave
  // submitted nominations on the old date, locking their guarantors out.
  if (settings.action === "SET")
    await withDatabaseRetry(() => db.nominationInvite.updateMany({
      where: { status: { in: ["DRAFT", "REJECTED", "SUBMITTED"] } },
      data: { expiresAt: settings.closesAt },
    }));

  revalidatePath("/nominate");
  return NextResponse.json(updated);
}
