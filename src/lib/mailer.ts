/**
 * Gmail delivery over the Gmail REST API.
 *
 * HTTPS rather than SMTP deliberately: Cloudflare Workers cannot open the raw
 * socket nodemailer needs, so the previous SMTP transport could not send from
 * production at all. The API works anywhere fetch does.
 *
 * Set up once in Google Cloud Console — enable the Gmail API, create an OAuth
 * client, consent, and keep the refresh token:
 *
 *   GOOGLE_CLIENT_ID=...
 *   GOOGLE_CLIENT_SECRET=...
 *   GOOGLE_REFRESH_TOKEN=...
 *   MAIL_FROM="NLA Osun Election Committee <elections@nlaosun.org.ng>"  (optional)
 *
 * Without them nothing is sent and `mailerConfigured()` is false, so callers can
 * fall back to handing a link over manually rather than failing a submission.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export function mailerConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN,
  );
}

export type MailResult = { sent: boolean; error?: string };

/** Base64url over UTF-8, without assuming Node's Buffer exists. */
function base64url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** RFC 2047 encoded word, so accented names and dashes survive in a Subject. */
function encodeHeader(value: string) {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${base64url(value).replace(/-/g, "+").replace(/_/g, "/")}?=`;
}

let cachedToken: { value: string; expiresAt: number } | undefined;

async function accessToken() {
  // Access tokens last an hour; reuse within a single isolate rather than
  // exchanging the refresh token on every recipient of a broadcast.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error_description?: string; error?: string }
    | null;
  if (!response.ok || !body?.access_token)
    throw new Error(
      body?.error === "invalid_grant"
        ? "Gmail authorization has expired or is invalid. Run npm run gmail:token, authorize the sender account, and update GOOGLE_REFRESH_TOKEN in the Worker secrets."
        : [body?.error, body?.error_description].filter(Boolean).join(": ") || `Google rejected the refresh token (${response.status}).`,
    );

  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<MailResult> {
  if (!mailerConfigured())
    return {
      sent: false,
      error: "Email is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN).",
    };
  try {
    const from = process.env.MAIL_FROM || "NLA Osun Election Committee";
    const boundary = `nla-${Math.random().toString(36).slice(2)}`;
    const raw = [
      `From: ${from}`,
      `To: ${message.to}`,
      `Subject: ${encodeHeader(message.subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      message.text,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "",
      message.html,
      "",
      `--${boundary}--`,
    ].join("\r\n");

    const response = await fetch(SEND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw: base64url(raw) }),
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { sent: false, error: detail?.error?.message || `Gmail rejected the message (${response.status}).` };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Email delivery failed." };
  }
}

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

/**
 * Shared chrome for every message the committee sends: emblem, green header and
 * the chapter's typeface.
 *
 * Raleway is requested for the clients that honour web fonts (Apple Mail,
 * Thunderbird); Gmail and Outlook strip @import, so the stack falls back to a
 * close humanist sans. Layout is table-based and inline-styled for the same
 * reason — mail clients discard external and much embedded CSS.
 */
export function brandedEmail(options: {
  origin: string;
  heading: string;
  bodyHtml: string;
  preheader?: string;
}) {
  const font = "'Raleway','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>@import url('https://fonts.googleapis.com/css2?family=Raleway:wght@400;700;900&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:${font};color:#111827;">
${options.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e7e7ea;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="background:linear-gradient(135deg,#0a5429 0%,#0f7a3d 100%);padding:22px 26px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:12px;">
              <img src="${escapeHtml(options.origin)}/nla-osun-logo.png" width="46" height="46" alt="NLA Osun"
                   style="display:block;width:46px;height:46px;border:0;outline:none;">
            </td>
            <td style="font-family:${font};color:#ffffff;">
              <div style="font-size:17px;font-weight:900;line-height:1.2;">NLA Osun State Chapter</div>
              <div style="font-size:12px;opacity:.9;">Election Committee</div>
            </td>
          </tr></table>
        </td>
      </tr>
      <tr><td style="padding:30px 26px 6px;">
        <h1 style="margin:0 0 14px;font-family:${font};font-size:21px;line-height:1.3;color:#0a5429;">${escapeHtml(options.heading)}</h1>
      </td></tr>
      <tr><td style="padding:0 26px 28px;font-family:${font};font-size:15px;line-height:1.65;color:#111827;">
        ${options.bodyHtml}
      </td></tr>
      <tr><td style="padding:18px 26px;background:#e9f6ee;border-top:1px solid #bcdfca;font-family:${font};font-size:12px;color:#4b5563;">
        Nigerian Library Association, Osun State Chapter &middot; Election Committee<br>
        You received this because you are taking part in the chapter election.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Turns an admin's plain-text message into branded paragraphs. */
export function paragraphsToHtml(body: string) {
  return body
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("\n        ");
}

export function nominationSubmittedMessage(details: {
  candidateName: string;
  position: string;
  receipt: string;
  origin: string;
}) {
  const text = `Dear ${details.candidateName},

Your nomination for ${details.position} has been submitted to the NLA Osun State Chapter Election Committee.

Receipt: ${details.receipt}

Your nomination is pending review. Your two guarantors must complete their sections before the nomination deadline. Submission does not mean approval.

NLA Osun State Chapter Election Committee`;
  return {
    subject: `Nomination received — ${details.position}`,
    text,
    html: brandedEmail({
      origin: details.origin,
      heading: "Your nomination has been received",
      bodyHtml: `<p>Dear ${escapeHtml(details.candidateName)},</p>
        <p>Your nomination for <strong>${escapeHtml(details.position)}</strong> has been submitted to the Election Committee.</p>
        <p>Receipt: <strong>${escapeHtml(details.receipt)}</strong></p>
        <p>Your nomination is pending review. Your two guarantors must complete their sections before the nomination deadline. Submission does not mean approval.</p>`,
    }),
  };
}

export function nominationApprovedMessage(details: {
  candidateName: string;
  position: string;
  link: string;
  origin: string;
}) {
  const text = `Dear ${details.candidateName},

Your nomination for ${details.position} in the Nigerian Library Association, Osun State Chapter election has been approved by the Election Committee.

Your candidate profile is now published and visible to members here:

${details.link}

Please review it. If anything needs correcting, reply to this message and the Election Committee will assist.

NLA Osun State Chapter Election Committee`;

  const html = brandedEmail({
    origin: details.origin,
    heading: "Your nomination has been approved",
    preheader: `Your profile for ${details.position} is now published.`,
    bodyHtml: `
        <p style="margin:0 0 14px;">Dear ${escapeHtml(details.candidateName)},</p>
        <p style="margin:0 0 14px;">Your nomination for <strong>${escapeHtml(details.position)}</strong> has been approved by the Election Committee.</p>
        <p style="margin:0 0 20px;">Your candidate profile is now published and visible to members.</p>
        <p style="margin:0 0 20px;"><a href="${escapeHtml(details.link)}" style="display:inline-block;padding:13px 24px;background:#0f7a3d;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:700;">View Your Published Profile</a></p>
        <p style="margin:0 0 14px;font-size:13px;color:#6b7280;">Or paste this into your browser:<br>${escapeHtml(details.link)}</p>
        <p style="margin:0;">Please review it. If anything needs correcting, reply to this message and the Election Committee will assist.</p>`,
  });

  return { subject: `Nomination approved — ${details.position}`, text, html };
}

export function guarantorInviteMessage(details: {
  guarantorName: string;
  candidateName: string;
  position: string;
  link: string;
  closesAt: Date;
  origin: string;
  /** Set when an administrator resends: the email then says it replaces earlier links. */
  reissuedAt?: Date;
}) {
  const deadline = new Intl.DateTimeFormat("en-NG", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(details.closesAt);
  // Resent invitations used to be identical apart from the link, so Gmail threaded
  // them and collapsed each new body as quoted text: guarantors kept clicking the
  // first (already replaced) link. A distinct subject and opening line stop that.
  const issued = details.reissuedAt
    ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" }).format(details.reissuedAt)
    : "";
  const replaces = issued
    ? `This is a new link issued on ${issued} WAT. It replaces any guarantor link sent to you earlier, which no longer works.`
    : "";

  const text = `Dear ${details.guarantorName},
${replaces ? `\n${replaces}\n` : ""}
${details.candidateName} has named you as a guarantor for their nomination as ${details.position} in the Nigerian Library Association, Osun State Chapter election.

Please complete your guarantor section using the link below. It is unique to you and should not be forwarded.

${details.link}

You will be asked for your institution, phone number, a letter of recommendation (500-1500 characters).

Please complete it before ${deadline} WAT.

NLA Osun State Chapter Election Committee`;

  const html = brandedEmail({
    origin: details.origin,
    heading: issued ? `Your new guarantor link` : `You have been named a guarantor`,
    preheader: replaces || `${details.candidateName} has named you as a guarantor.`,
    bodyHtml: `
        <p style="margin:0 0 14px;">Dear ${escapeHtml(details.guarantorName)},</p>${replaces ? `
        <p style="margin:0 0 14px;padding:12px 14px;background:#fff7e0;border:1px solid #f0d58a;border-radius:8px;"><strong>${escapeHtml(replaces)}</strong></p>` : ""}
        <p style="margin:0 0 14px;"><strong>${escapeHtml(details.candidateName)}</strong> has named you as a guarantor for their nomination as <strong>${escapeHtml(details.position)}</strong>.</p>
        <p style="margin:0 0 20px;">Please complete your guarantor section using the button below. The link is unique to you and should not be forwarded.</p>
        <p style="margin:0 0 20px;"><a href="${escapeHtml(details.link)}" style="display:inline-block;padding:13px 24px;background:#0f7a3d;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:700;">Complete Guarantor Form</a></p>
        <p style="margin:0 0 14px;font-size:13px;color:#6b7280;">Or paste this into your browser:<br>${escapeHtml(details.link)}</p>
        <p style="margin:0 0 14px;">You will be asked for your institution, phone number, a letter of recommendation (500&ndash;1500 characters).</p>
        <p style="margin:0;">Please complete it before <strong>${escapeHtml(deadline)} WAT</strong>.</p>`,
  });

  return {
    subject: issued
      ? `New guarantor link (${issued}): ${details.candidateName} — ${details.position}`
      : `Guarantor request: ${details.candidateName} — ${details.position}`,
    text,
    html,
  };
}
