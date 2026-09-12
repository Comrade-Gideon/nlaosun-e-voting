import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE,
  createAdminSession,
  validAdminPassword,
} from "@/lib/admin-auth";
const schema = z.object({ password: z.string().min(1).max(200) });
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !validAdminPassword(parsed.data.password))
      return NextResponse.json(
        { message: "Invalid administrator credentials." },
        { status: 401 },
      );
    const session = await createAdminSession();
    (await cookies()).set(ADMIN_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      expires: session.expiresAt,
      path: "/",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Administrator login failed.", error);
    const message = error instanceof Error ? error.message : "";
    // Both secrets are read before any database call, so a missing one used to be
    // misreported as a database outage.
    const missingSecret = ["ADMIN_PASSWORD", "SESSION_SECRET"].find((name) => message.startsWith(name));
    return NextResponse.json(
      {
        message: missingSecret
          ? `Administrator login is not configured: ${message}. Add ${missingSecret} to the deployment's runtime variables.`
          : "Administrator login is temporarily unavailable. Check the Neon database variables and apply the Prisma schema.",
      },
      { status: 503 },
    );
  }
}
