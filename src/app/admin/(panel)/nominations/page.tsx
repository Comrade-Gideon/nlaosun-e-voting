import { NominationAdmin } from "@/components/nomination-admin";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getConfiguredSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

async function shareOrigin() {
  const configured = getConfiguredSiteUrl();
  if (configured) return configured.origin;
  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host") ?? "localhost:3000";
  const protocol = store.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export default async function AdminNominations() {
  const election = await db.election.findFirst({
    where: { status: "PUBLISHED" },
    include: { positions: { orderBy: { sortOrder: "asc" } } },
  });
  const invitations = await db.nominationInvite.findMany({
    select: {
      id: true, candidateName: true, email: true, lrcnCertified: true, lrcnNumber: true,
      status: true, expiresAt: true, submittedAt: true, reviewNote: true,
      position: { select: { title: true } },
      guarantors: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, invitedAt: true, submittedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return <div className="admin-content nomination-admin-page">
    <div className="admin-heading"><div><small>CANDIDATE NOMINATION</small><h1>Nominations</h1><p>Open or close the shared nomination link, then review submissions and publish approved candidates.</p></div></div>
    <NominationAdmin
      positions={election?.positions ?? []}
      nominationWindow={{
        opensAt: election?.nominationsOpenAt?.toISOString() ?? null,
        closesAt: election?.nominationsCloseAt?.toISOString() ?? null,
      }}
      shareLink={`${await shareOrigin()}/nominate`}
      invitations={invitations.map(item => ({ id: item.id, candidateName: item.candidateName, email: item.email, lrcnNumber: item.lrcnCertified ? item.lrcnNumber : null, position: item.position.title, status: item.status, expiresAt: item.expiresAt.toISOString(), submittedAt: item.submittedAt?.toISOString() ?? null, reviewNote: item.reviewNote, guarantors: item.guarantors.map(g => ({ id: g.id, name: g.name, email: g.email, invited: Boolean(g.invitedAt), completed: Boolean(g.submittedAt) })) }))}
    />
  </div>;
}
