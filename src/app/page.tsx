import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, Eye, Fingerprint, LockKeyhole, ShieldCheck, UserCheck, Vote } from "lucide-react";
import { Countdown } from "@/components/countdown";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { electionState, formatWat, getPublishedElectionSummary } from "@/lib/elections";

// Cached and revalidated on a timer so public traffic costs a fixed number of
// database reads per hour instead of one per visitor. Candidate edits, nomination
// approvals and results publication all call revalidatePath already, so those
// changes still appear immediately; only untouched data can be up to 5 min stale.
export const revalidate = 300;

export default async function HomePage() {
  const election = await getPublishedElectionSummary();
  return <><SiteHeader/><main><section className="hero"><div><span className="eyebrow"><ShieldCheck/> Secure &amp; Verified Voting Platform</span><h1>Your Vote. Your Voice.<br/><em>Our Future.</em></h1><p>Participate in the NALISS departmental election through a secure, transparent and convenient digital voting platform.</p><div className="actions"><Link className="button" href="/login"><Vote/>Vote Now</Link><Link className="button ghost" href="/candidates">View Candidates</Link></div><div className="trust"><span><CheckCircle2/>One Person, One Vote</span><span><LockKeyhole/>Identity Protected</span></div></div><div className="hero-art hero-image"><Image src="/naliss-evoting-hero.png" alt="Secure NALISS electronic voting on a laptop with identity verification and a ballot box" fill sizes="(max-width: 900px) 100vw, 46vw" preload/></div></section>{election && <section className="election-banner"><h2>{election.title} <span className={`status ${electionState(election.opensAt, election.closesAt)}`}>{electionState(election.opensAt, election.closesAt)}</span></h2><p>{election.description}</p><div className="banner-grid"><span><small>OPENING DATE · WAT</small><b>{formatWat(election.opensAt)}</b></span><span><small>CLOSING DATE · WAT</small><b>{formatWat(election.closesAt)}</b></span><Countdown target={election.closesAt.toISOString()}/></div></section>}<section className="security"><h2>Built on Trust &amp; Security</h2><p>Every safeguard protects the integrity of your vote and the transparency of the election.</p><div>{[[UserCheck,"Verified Electorates"],[Fingerprint,"Secure Authentication"],[CheckCircle2,"One Person, One Vote"],[Eye,"Transparent Process"]].map(([Icon,title]) => { const I=Icon as typeof Eye; return <article key={title as string}><I/><h3>{title as string}</h3><p>Purpose-built safeguards keep participation accountable and private.</p></article>})}</div></section></main><SiteFooter/></>;
}
