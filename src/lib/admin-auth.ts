import { cookies } from "next/headers";
import { db, isTransientDatabaseError } from "@/lib/db";
import { hashesEqual, hashToken, issueToken } from "@/lib/security";

export const ADMIN_COOKIE = "naliss_admin_session";
export const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;
export function validAdminPassword(value: string) {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured || configured.length < 12)
    throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  return hashesEqual(hashToken(value), hashToken(configured));
}
export async function createAdminSession() {
  const token = issueToken();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MS);
  await db.adminSession.create({
    data: { tokenHash: hashToken(token), expiresAt },
  });
  return { token, expiresAt };
}
export async function isAdminAuthenticated() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  try {
    const session = await db.adminSession.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    return Boolean(session && session.expiresAt > new Date());
  } catch (error) {
    console.error(
      isTransientDatabaseError(error)
        ? "Administrator session lookup failed because the database was unreachable."
        : "Administrator session lookup failed.",
      error,
    );
    return false;
  }
}
