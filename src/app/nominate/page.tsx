import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { NominationPortal } from "@/components/nomination-portal";
import { getNominationElection, nominationWindowState } from "@/lib/nominations";
import { formatWat } from "@/lib/elections";

// The window is admin-controlled and changes rarely, but a candidate arriving the
// minute it opens must not be served a cached "closed" page.
export const dynamic = "force-dynamic";

function Closed({ title, message }: { title: string; message: string }) {
  return <div className="nomination-page"><main className="nomination-closed"><LockKeyhole /><h1>{title}</h1><p>{message}</p><Link className="button" href="/">Back to home</Link></main></div>;
}

export default async function NominationPage() {
  const election = await getNominationElection();
  if (!election)
    return <Closed title="Nominations unavailable" message="There is no published election accepting nominations at the moment." />;

  const state = nominationWindowState(election.nominationsOpenAt, election.nominationsCloseAt);
  if (state === "upcoming")
    return <Closed
      title="Nominations have not opened yet"
      message={`Nominations for the ${election.title} open on ${formatWat(election.nominationsOpenAt!)}. Please return then.`}
    />;
  if (state === "closed")
    return <Closed
      title="Nominations are closed"
      message={election.nominationsCloseAt
        ? `Nominations for the ${election.title} closed on ${formatWat(election.nominationsCloseAt)}. Contact the Election Committee if you believe this is an error.`
        : "The Election Committee has not opened nominations yet. Please check back later."}
    />;

  return <NominationPortal positions={election.positions} closesAt={election.nominationsCloseAt!.toISOString()} />;
}
