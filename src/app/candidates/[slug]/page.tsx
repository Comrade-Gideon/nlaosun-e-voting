import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  ListChecks,
  ShieldCheck,
  Target,
  UserRound,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CandidatePhoto } from "@/components/candidate-photo";
import { db } from "@/lib/db";

// Cached and revalidated on a timer so public traffic costs a fixed number of
// database reads per hour instead of one per visitor. Candidate edits, nomination
// approvals and results publication all call revalidatePath already, so those
// changes still appear immediately; only untouched data can be up to 5 min stale.
export const revalidate = 300;

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const candidate = await db.candidate.findUnique({
    where: { slug },
    include: { position: true },
  });
  if (!candidate) notFound();
  const priorities = JSON.parse(candidate.priorities) as string[];
  return (
    <>
      <SiteHeader />
      <main className="page">
        <Link href="/candidates">← Back to Candidate Directory</Link>
        <div className="profile">
          <aside>
            <CandidatePhoto
              name={candidate.name}
              src={candidate.photoUrl}
              className="portrait"
            />
            <h1>{candidate.name}</h1>
            {candidate.pka && (
            <p className="candidate-pka">
              Politically Known As: <strong>{candidate.pka}</strong>
            </p>
            )}
            <span className="pill">{candidate.position.title}</span>
            <p>
              {candidate.department} · {candidate.level}
            </p>
            <div className="verified">
              <b>
                <ShieldCheck />
                Verified Candidate
              </b>
              <em>“{candidate.tagline}”</em>
            </div>
          </aside>
          <article>
            {[
              [UserRound, "Biography", candidate.biography],
              [ListChecks, "Manifesto", candidate.manifesto],
              [Eye, "Vision", candidate.vision],
              [Target, "Mission", candidate.mission],
            ].map(([Icon, title, text]) => {
              const I = Icon as typeof Eye;
              return (
                <section key={title as string}>
                  <h2>
                    <I />
                    {title as string}
                  </h2>
                  <p>{text as string}</p>
                </section>
              );
            })}
            <section>
              <h2>
                <ListChecks />
                Key Priorities
              </h2>
              {priorities.map((item) => (
                <p className="priority" key={item}>
                  <CheckCircle2 />
                  {item}
                </p>
              ))}
            </section>
            <Link className="button wide" href="/login">
              Vote in this election
            </Link>
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
