import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { db, withDatabaseRetry } from "@/lib/db";
import { guarantorInviteMessage, mailerConfigured, sendMail } from "@/lib/mailer";
import { hashToken, issueToken } from "@/lib/security";
import { getPublicOrigin } from "@/lib/site-url";

const schema = z.object({
  guarantorId: z.string().min(1),
  email: z.string().trim().email().max(160).optional(),
});

/**
 * Re-issues a guarantor's link. Tokens are stored hashed and never recoverable,
 * so a bounced or mistyped invitation is recovered by minting a fresh one rather
 * than resending the original. Any link already sent stops working.
 */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated()))
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ message: "Choose a guarantor to resend to." }, { status: 400 });

  const guarantor = await withDatabaseRetry(() => db.guarantor.findUnique({
    where: { id: parsed.data.guarantorId },
    include: { nomination: { include: { position: true } } },
  }));
  if (!guarantor)
    return NextResponse.json({ message: "Guarantor not found." }, { status: 404 });
  if (guarantor.submittedAt)
    return NextResponse.json({ message: "This guarantor has already completed their section." }, { status: 409 });

  const email = parsed.data.email ?? guarantor.email;
  const token = issueToken();
  const link = `${getPublicOrigin(request)}/guarantor/${token}`;

  const delivery = mailerConfigured()
    ? await sendMail({
        to: email,
        ...guarantorInviteMessage({
          guarantorName: guarantor.name,
          candidateName: guarantor.nomination.candidateName,
          position: guarantor.nomination.position.title,
          link,
          closesAt: guarantor.nomination.expiresAt,
        }),
      })
    : { sent: false, error: "Email is not configured (GMAIL_USER / GMAIL_APP_PASSWORD). Send this link manually." };

  await withDatabaseRetry(() => db.guarantor.update({
    where: { id: guarantor.id },
    data: { tokenHash: hashToken(token), email, invitedAt: delivery.sent ? new Date() : null },
  }));

  // The raw link is returned once, so an administrator can pass it on by hand
  // when delivery is unavailable. It is not stored anywhere in readable form.
  return NextResponse.json({ ok: true, sent: delivery.sent, error: delivery.error, link });
}
