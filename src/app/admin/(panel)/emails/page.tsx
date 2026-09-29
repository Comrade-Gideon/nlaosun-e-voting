import Link from "next/link";
import { DatabaseZap, RefreshCw } from "lucide-react";
import { AdminEmailComposer } from "@/components/admin-email-composer";
import { db, withDatabaseRetry } from "@/lib/db";
import { mailerConfigured } from "@/lib/mailer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminEmails() {
  const loaded = await withDatabaseRetry(() => Promise.all([
    db.candidate.findMany({
      where: { email: { not: null } },
      select: { id: true, name: true, email: true, position: { select: { title: true } } },
      orderBy: { name: "asc" },
    }),
    db.nominationInvite.findMany({
      select: { id: true, candidateName: true, email: true, status: true, position: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ])).catch(() => null);

  if (!loaded) return <div className="admin-content">
    <div className="admin-heading"><div><small>COMMUNICATION</small><h1>Email Candidates</h1></div></div>
    <section className="admin-card admin-database-unavailable">
      <DatabaseZap />
      <h2>Recipient list temporarily unavailable</h2>
      <p>Neon could not be reached, so no recipients could be loaded. Nothing was sent. Wait a moment and try again.</p>
      <Link className="button" href="/admin/emails"><RefreshCw />Try Again</Link>
    </section>
  </div>;

  const [candidates, nominations] = loaded;
  return <div className="admin-content">
    <div className="admin-heading"><div>
      <small>COMMUNICATION</small>
      <h1>Email Candidates</h1>
      <p>Send a branded message to every candidate, or to selected people only.</p>
    </div></div>
    <AdminEmailComposer
      configured={mailerConfigured()}
      candidates={candidates.map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email!,
        position: item.position.title,
      }))}
      nominations={nominations.map((item) => ({
        id: item.id,
        name: item.candidateName,
        email: item.email,
        position: item.position.title,
        status: item.status,
      }))}
    />
  </div>;
}
