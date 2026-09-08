import Link from "next/link";
import { Check, ClipboardList, RefreshCw, ShieldCheck } from "lucide-react";
import { PublicResultsDashboard } from "@/components/public-results-dashboard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { db, withDatabaseRetry } from "@/lib/db";
import { formatWat, sortNalissOffices } from "@/lib/elections";

// Cached and revalidated on a timer so public traffic costs a fixed number of
// database reads per hour instead of one per visitor. Candidate edits, nomination
// approvals and results publication all call revalidatePath already, so those
// changes still appear immediately; only untouched data can be up to 5 min stale.
export const revalidate = 300;

export default async function ResultsPage(){
  const loaded = await withDatabaseRetry(() => Promise.all([
    db.election.findFirst({where:{status:"PUBLISHED"},include:{_count:{select:{ballots:true}},positions:{orderBy:{sortOrder:"asc"},include:{candidates:{select:{id:true,name:true,pka:true,photoUrl:true,_count:{select:{votes:true}}}}}}}}),
    db.voter.count({where:{eligible:true}}),
  ])).catch(() => null);
  const election = loaded?.[0] ?? null;
  const registered = loaded?.[1] ?? 0;

  if(!election?.resultsPublishedAt){
    const electionClosed = Boolean(election && election.closesAt <= new Date());
    return <><SiteHeader/><main className="page results-pending-page">
      <header><span><i/>Results Pending</span><div className="pending-results-icon"><ClipboardList/></div><h1>Election Results Not Yet Published</h1><p>The NALISS Electoral Commission has not yet officially published the results of this election.<br/>Please check back later for the official results.</p></header>
      <section className="pending-election-info"><h2>Election Information</h2><dl><div><dt>Election</dt><dd>{election?.title??"NALISS Election"}</dd></div><div><dt>Status</dt><dd><i/>Results Pending</dd></div><div><dt>Election Period</dt><dd>{election?`${formatWat(election.opensAt)} — ${formatWat(election.closesAt)}`:"Not available"}</dd></div><div><dt>Number of Positions</dt><dd>{election?.positions.length??0} Contested Offices</dd></div><div><dt>Results Publication</dt><dd>Not Yet Published</dd></div></dl></section>
      <nav className="pending-result-actions"><Link className="button" href="/election">View Election</Link><Link href="/candidates">View Candidates</Link><Link href="/">Return Home</Link></nav>
      <section className="pending-official-notice"><ShieldCheck/><div><h2>Official Notice</h2><p>The Electoral Commission is responsible for verifying and officially releasing the election results. Results will become available here once verification and publication are complete.</p></div></section>
      <section className="result-publication-steps"><div className={electionClosed?"complete":"current"}><b>{electionClosed?<Check/>:"1"}</b><strong>Election</strong><small>{electionClosed?"Voting completed":"Voting in progress"}</small></div><i/><div className={electionClosed?"current":"pending"}><b>2</b><strong>Verification</strong><small>Electoral Committee verification</small></div><i/><div className="pending"><b>3</b><strong>Publication</strong><small>Results will be published here</small></div></section>
      <section className="check-results-update"><h2>Waiting for publication?</h2><p>Results will appear here once they have been officially released.</p><a href="/results"><RefreshCw/>Check for Updates</a></section>
      <div className="results-matter"><strong>Your vote matters.</strong><p>For transparency and fairness, results are published only after the Electoral Commission completes the required verification process.</p></div>
    </main><SiteFooter/></>;
  }

  const ballots = election._count.ballots;
  const positions = sortNalissOffices(election.positions).map(position => {
    const candidates = [...position.candidates].sort((a,b)=>b._count.votes-a._count.votes||a.name.localeCompare(b.name)).map(candidate=>({id:candidate.id,name:candidate.name,pka:candidate.pka,photoUrl:candidate.photoUrl,votes:candidate._count.votes}));
    const validVotes = candidates.reduce((sum,candidate)=>sum+candidate.votes,0);
    return {id:position.id,title:position.title,validVotes,voidVotes:Math.max(0,ballots-validVotes),candidates};
  });
  const totalValidSelections = positions.reduce((sum,position)=>sum+position.validVotes,0);
  const totalVoidSelections = positions.reduce((sum,position)=>sum+position.voidVotes,0);
  const turnout = registered?Number((ballots/registered*100).toFixed(1)):0;
  return <><SiteHeader/><PublicResultsDashboard title={election.title} description="View the official results of the NALISS departmental election." registered={registered} ballots={ballots} totalValidSelections={totalValidSelections} totalVoidSelections={totalVoidSelections} turnout={turnout} publishedAt={formatWat(election.resultsPublishedAt)} opensAt={formatWat(election.opensAt)} closesAt={formatWat(election.closesAt)} positions={positions}/><SiteFooter/></>;
}
