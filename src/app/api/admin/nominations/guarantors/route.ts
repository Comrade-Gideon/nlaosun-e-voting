import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { db, withDatabaseRetry } from "@/lib/db";
import { guarantorInviteMessage, mailerConfigured, sendMail } from "@/lib/mailer";
import { hashGuarantorToken, issueGuarantorToken } from "@/lib/security";
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
  const token = issueGuarantorToken();
  const link = `${getPublicOrigin(request)}/guarantor/${token}`;

  // Persist before sending: an email must never contain a token we failed to save.
  const tokenHash = hashGuarantorToken(token);
  await withDatabaseRetry(() => db.guarantor.update({
    where: { id: guarantor.id },
    data: { tokenHash, email, invitedAt: null },
  }));

  const delivery = mailerConfigured()
    ? await sendMail({
        to: email,
        ...guarantorInviteMessage({
          guarantorName: guarantor.name,
          candidateName: guarantor.nomination.candidateName,
          position: guarantor.nomination.position.title,
          link,
          closesAt: guarantor.nomination.expiresAt,
          origin: getPublicOrigin(request),
          reissuedAt: new Date(),
        }),
      })
    : { sent: false, error: "Email is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN). Send this link manually." };

  if (delivery.sent) await withDatabaseRetry(() => db.guarantor.updateMany({
    where: { id: guarantor.id, tokenHash },
    data: { invitedAt: new Date() },
  }));

  // The raw link is returned once, so an administrator can pass it on by hand
  // when delivery is unavailable. It is not stored anywhere in readable form.
  return NextResponse.json({ ok: true, sent: delivery.sent, error: delivery.error, link });
}
