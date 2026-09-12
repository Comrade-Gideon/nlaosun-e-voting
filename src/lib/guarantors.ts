import { db, withDatabaseRetry } from "@/lib/db";
import { hashToken, issueToken } from "@/lib/security";
import { guarantorInviteMessage, mailerConfigured, sendMail } from "@/lib/mailer";

/** Every nomination needs exactly this many completed guarantor sections. */
export const REQUIRED_GUARANTORS = 2;

export const RECOMMENDATION_MIN = 500;
export const RECOMMENDATION_MAX = 1500;

export async function guarantorByToken(token: string) {
  return withDatabaseRetry(() => db.guarantor.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { nomination: { include: { position: true } } },
  }));
}

/**
 * Replaces the nomination's guarantors with the pair the candidate named, mints a
 * link for each, and emails it. Called once on submission: the tokens are only
 * ever returned here and to an administrator, never to the candidate, so a
 * candidate cannot open a guarantor's form and write their own recommendation.
 */
export async function inviteGuarantors(
  nominationId: string,
  people: { name: string; email: string }[],
  origin: string,
  closesAt: Date,
) {
  const nomination = await withDatabaseRetry(() => db.nominationInvite.findUnique({
    where: { id: nominationId },
    include: { position: true },
  }));
  if (!nomination) throw new Error("NOMINATION_NOT_FOUND");

  await withDatabaseRetry(() => db.guarantor.deleteMany({ where: { nominationId } }));

  const results: { name: string; email: string; link: string; sent: boolean; error?: string }[] = [];
  for (const person of people) {
    const token = issueToken();
    const link = `${origin}/guarantor/${token}`;
    const created = await withDatabaseRetry(() => db.guarantor.create({
      data: {
        nominationId,
        tokenHash: hashToken(token),
        name: person.name,
        email: person.email,
      },
    }));

    const message = guarantorInviteMessage({
      guarantorName: person.name,
      candidateName: nomination.candidateName,
      position: nomination.position.title,
      link,
      closesAt,
    });
    const delivery = mailerConfigured()
      ? await sendMail({ to: person.email, ...message })
      : { sent: false, error: "Email is not configured; send this link manually." };
    if (delivery.sent)
      await withDatabaseRetry(() => db.guarantor.update({
        where: { id: created.id },
        data: { invitedAt: new Date() },
      }));

    results.push({ name: person.name, email: person.email, link, ...delivery });
  }
  return results;
}
