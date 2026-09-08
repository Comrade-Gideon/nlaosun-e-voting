import { Users } from "lucide-react";
import { CandidateDirectory } from "@/components/candidate-directory";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { db } from "@/lib/db";
import { compareNalissOffices } from "@/lib/elections";

// Cached and revalidated on a timer so public traffic costs a fixed number of
// database reads per hour instead of one per visitor. Candidate edits, nomination
// approvals and results publication all call revalidatePath already, so those
// changes still appear immediately; only untouched data can be up to 5 min stale.
export const revalidate = 300;

export default async function CandidatesPage() {
  // The directory cards read only these fields; manifesto, vision, mission and
  // priorities are ~2.5 KB of every candidate row and are rendered on the profile
  // page instead, so fetching them here is pure database egress.
  const candidates = await db.candidate.findMany({
    where: { position: { election: { status: "PUBLISHED" } } },
    select: {
      id: true,
      name: true,
      pka: true,
      slug: true,
      level: true,
      photoUrl: true,
      tagline: true,
      biography: true,
      position: { select: { title: true, slug: true, sortOrder: true } },
    },
    orderBy: { name: "asc" },
  });
  candidates.sort((left, right) => compareNalissOffices(left.position, right.position) || left.name.localeCompare(right.name));
  return <><SiteHeader/><main className="page"><header className="page-title"><h1><Users/>Meet the Candidates</h1><p>Explore the students contesting in the NALISS 2026 departmental election. Review their manifestos and profiles before you cast your vote.</p></header><CandidateDirectory candidates={candidates}/></main><SiteFooter/></>;
}
