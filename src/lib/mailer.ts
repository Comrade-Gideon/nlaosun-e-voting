import nodemailer from "nodemailer";

/**
 * Gmail delivery for guarantor invitations.
 *
 * Configure with a Google account and an App Password (Google account →
 * Security → 2-Step Verification → App passwords). A plain account password
 * will not work; Google rejects it for SMTP.
 *
 *   GMAIL_USER=elections@nlaosun.org.ng
 *   GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
 *   MAIL_FROM="NLA Osun Election Committee <elections@nlaosun.org.ng>"  (optional)
 *
 * When those are absent nothing is sent and `configured` comes back false, so
 * callers can fall back to handing the link to an administrator to send by hand
 * instead of failing a candidate's submission.
 */
export function mailerConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function transport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, ""),
    },
  });
}

export type MailResult = { sent: boolean; error?: string };

export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<MailResult> {
  if (!mailerConfigured())
    return { sent: false, error: "Email is not configured (GMAIL_USER / GMAIL_APP_PASSWORD)." };
  try {
    await transport().sendMail({
      from: process.env.MAIL_FROM || `NLA Osun Election Committee <${process.env.GMAIL_USER}>`,
      ...message,
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Email delivery failed." };
  }
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

export function guarantorInviteMessage(details: {
  guarantorName: string;
  candidateName: string;
  position: string;
  link: string;
  closesAt: Date;
}) {
  const deadline = new Intl.DateTimeFormat("en-NG", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(details.closesAt);

  const text = `Dear ${details.guarantorName},

${details.candidateName} has named you as a guarantor for their nomination as ${details.position} in the Nigerian Library Association, Osun State Chapter election.

Please complete your guarantor section using the link below. It is unique to you and should not be forwarded.

${details.link}

You will be asked for your institution, phone number, a letter of recommendation (500-1500 characters) and your signature.

Please complete it before ${deadline} WAT.

NLA Osun State Chapter Election Committee`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.6;max-width:560px">
  <p>Dear ${escape(details.guarantorName)},</p>
  <p><strong>${escape(details.candidateName)}</strong> has named you as a guarantor for their nomination as
     <strong>${escape(details.position)}</strong> in the Nigerian Library Association, Osun State Chapter election.</p>
  <p>Please complete your guarantor section using the link below. It is unique to you and should not be forwarded.</p>
  <p><a href="${escape(details.link)}" style="display:inline-block;padding:13px 22px;background:#0f7a3d;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:700">Complete Guarantor Form</a></p>
  <p style="font-size:13px;color:#6b7280">Or paste this into your browser:<br>${escape(details.link)}</p>
  <p>You will be asked for your institution, phone number, a letter of recommendation (500&ndash;1500 characters) and your signature.</p>
  <p>Please complete it before <strong>${escape(deadline)} WAT</strong>.</p>
  <p style="color:#6b7280;font-size:13px">NLA Osun State Chapter Election Committee</p>
</div>`;

  return {
    subject: `Guarantor request: ${details.candidateName} — ${details.position}`,
    text,
    html,
  };
}
