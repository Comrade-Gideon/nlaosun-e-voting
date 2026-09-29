import Link from "next/link";
import { DatabaseZap, RefreshCw } from "lucide-react";
import { ElectorateImport } from "@/components/electorate-import";
import { AdminElectorateList } from "@/components/admin-electorate-list";
import { db, withDatabaseRetry } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Electorates() {
  const loaded = await withDatabaseRetry(() => Promise.all([
    db.voter.findMany({
      select: { id: true, displayName: true, phoneNumber: true, eligible: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.voter.count({ where: { eligible: true } }),
  ])).catch(() => null);

  if (!loaded) return <div className="admin-content">
    <div className="admin-heading"><div><small>ELECTORATE MANAGEMENT</small><h1>Registered Electorates</h1></div></div>
    <section className="admin-card admin-database-unavailable">
      <DatabaseZap />
      <h2>Electorate database temporarily unavailable</h2>
      <p>Neon could not be reached. No electorate information was changed. Wait a moment and try again.</p>
      <Link className="button" href="/admin/electorates"><RefreshCw />Try Again</Link>
    </section>
  </div>;

  const [voters, count] = loaded;
  return <div className="admin-content">
    <div className="admin-heading"><div><small>ELECTORATE MANAGEMENT</small><h1>Registered Electorates</h1><p>{count} eligible voters currently registered.</p></div></div>
    <div className="electorate-admin-layout"><ElectorateImport /><AdminElectorateList voters={voters} /></div>
  </div>;
}
