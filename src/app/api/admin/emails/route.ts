import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { db, withDatabaseRetry } from "@/lib/db";
import { brandedEmail, mailerConfigured, paragraphsToHtml, sendMail } from "@/lib/mailer";
import { getPublicOrigin } from "@/lib/site-url";

const schema = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(10_000),
  recipients: z.array(z.string().trim().email().max(160)).min(1).max(500),
});

/** Every address the committee is allowed to write to, from the database. */
async function allowedRecipients() {
  const [candidates, nominations] = await withDatabaseRetry(() => Promise.all([
    db.candidate.findMany({ where: { email: { not: null } }, select: { email: true } }),
    db.nominationInvite.findMany({ select: { email: true } }),
  ]));
  return new Set([
    ...candidates.map((item) => item.email!.toLowerCase()),
    ...nominations.map((item) => item.email.toLowerCase()),
  ]);
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated()))
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: "Enter a subject, a message, and choose at least one recipient." },
      { status: 400 },
    );

  if (!mailerConfigured())
    return NextResponse.json(
      {
        message:
          "Email is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN to the deployment's runtime variables.",
      },
      { status: 503 },
    );

  // Addresses are re-checked against the database rather than trusted from the
  // request, so this endpoint cannot be used to mail arbitrary people.
  const allowed = await allowedRecipients();
  const recipients = [...new Set(parsed.data.recipients.map((item) => item.toLowerCase()))].filter((item) =>
    allowed.has(item),
  );
  const rejected = parsed.data.recipients.filter((item) => !allowed.has(item.toLowerCase()));
  if (!recipients.length)
    return NextResponse.json(
      { message: "None of the selected addresses belong to a candidate or nomination." },
      { status: 400 },
    );

  const origin = getPublicOrigin(request);
  const html = brandedEmail({
    origin,
    heading: parsed.data.subject,
    preheader: parsed.data.body.slice(0, 140),
    bodyHtml: paragraphsToHtml(parsed.data.body),
  });

  // One message per recipient: a shared To/BCC would expose the list and makes a
  // single failure look like a whole-broadcast failure.
  const results: { email: string; sent: boolean; error?: string }[] = [];
  for (const email of recipients) {
    const delivery = await sendMail({ to: email, subject: parsed.data.subject, text: parsed.data.body, html });
    results.push({ email, ...delivery });
  }

  return NextResponse.json({
    ok: results.some((item) => item.sent),
    sent: results.filter((item) => item.sent).length,
    failed: results.filter((item) => !item.sent),
    skipped: rejected,
  });
}
