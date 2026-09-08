import { VoteMonitorDashboard } from "@/components/vote-monitor-dashboard";
import { db, withDatabaseRetry } from "@/lib/db";
import { formatWat, sortNalissOffices } from "@/lib/elections";

export const dynamic="force-dynamic";

export default async function AdminResults() {
  const loaded = await withDatabaseRetry(() => Promise.all([
    db.election.findFirst({
      where: { status: "PUBLISHED" },
      include: {
        ballots: { select: { submittedAt: true }, orderBy: { submittedAt: "asc" } },
        positions: {
          orderBy: { sortOrder: "asc" },
          include: {
            candidates: {
              orderBy: { name: "asc" },
              // This page re-runs every time the monitor auto-refreshes, so it takes
              // only the four fields the dashboard renders. Pulling whole candidate
              // rows here cost ~3 KB each per refresh for text nobody displays.
              select: {
                id: true,
                name: true,
                pka: true,
                _count: { select: { votes: true } },
              },
            },
          },
        },
      },
    }),
    db.voter.count({ where: { eligible: true } }),
  ])).catch(() => null);
  if (!loaded) return <div className="admin-content"><h1>Vote monitor temporarily unavailable</h1><p>The election database could not be reached. Please wait a moment and refresh this page.</p></div>;
  const [election, eligible] = loaded;
  if (!election) return <div className="admin-content"><h1>No published election</h1></div>;

  const now = new Date();
  const ballots = election.ballots.length;
  const turnout = eligible ? Number(((ballots / eligible) * 100).toFixed(1)) : 0;
  const dayKey = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const activity = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (4 - index));
    return {
      key: dayKey(date),
      label: date.toLocaleDateString("en-NG", { month: "short", day: "numeric", timeZone: "Africa/Lagos" }),
      count: 0,
    };
  });
  for (const ballot of election.ballots) {
    const day = activity.find(item => item.key === dayKey(ballot.submittedAt));
    if (day) day.count += 1;
  }

  const remainingMs = Math.max(0, election.closesAt.getTime() - now.getTime());
  const days = Math.floor(remainingMs / 86400000);
  const hours = Math.floor(remainingMs / 3600000) % 24;
  const latest = election.ballots.at(-1)?.submittedAt;
  const lastVote = latest
    ? `${Math.max(0, Math.floor((now.getTime() - latest.getTime()) / 60000))} min ago`
    : "No votes yet";
  const positions = sortNalissOffices(election.positions).map(position => {
    const candidates = [...position.candidates]
      .sort((a, b) => b._count.votes - a._count.votes || a.name.localeCompare(b.name))
      .map(candidate => ({
        id: candidate.id,
        name: candidate.name,
        pka: candidate.pka,
        votes: candidate._count.votes,
        initials: candidate.name.split(" ").filter(Boolean).map(part => part[0]).join("").slice(0, 2),
      }));
    const validVotes = candidates.reduce((sum, candidate) => sum + candidate.votes, 0);
    return {
      id: position.id,
      title: position.title,
      validVotes,
      voidVotes: Math.max(0, ballots - validVotes),
      candidates,
    };
  });
  const voidSelections = positions.reduce((sum, position) => sum + position.voidVotes, 0);

  return <VoteMonitorDashboard
    title={election.title}
    eligible={eligible}
    ballots={ballots}
    turnout={turnout}
    remaining={Math.max(0, eligible - ballots)}
    voidSelections={voidSelections}
    closesAt={formatWat(election.closesAt)}
    status={now < election.opensAt ? "upcoming" : now <= election.closesAt ? "ongoing" : "closed"}
    timeRemaining={remainingMs ? `${days}d ${hours}h` : "Closed"}
    lastVote={lastVote}
    activity={activity.map(({ label, count }) => ({ label, count }))}
    positions={positions}
    published={Boolean(election.resultsPublishedAt)}
    canPublish={election.closesAt <= now}
  />;
}
