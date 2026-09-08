"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleSlash2, Clock3, Radio, Search, Users, Vote } from "lucide-react";
import { ResultsControl } from "@/components/results-control";

// Each refresh re-runs the whole server route: session lookup, election, every
// ballot and every candidate. On metered database egress a tab left open overnight
// is the single largest recurring cost, so this polls a minute apart and starts off.
const REFRESH_MS = 60_000;

type Activity = { label: string; count: number };
type CandidateResult = { id: string; name: string; pka: string; votes: number; initials: string };
type Position = { id: string; title: string; validVotes: number; voidVotes: number; candidates: CandidateResult[] };
type Props = {
  title: string;
  eligible: number;
  ballots: number;
  turnout: number;
  remaining: number;
  voidSelections: number;
  closesAt: string;
  status: string;
  timeRemaining: string;
  lastVote: string;
  activity: Activity[];
  positions: Position[];
  published: boolean;
  canPublish: boolean;
};

export function VoteMonitorDashboard(props: Props) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, router]);
  const visible = useMemo(
    () => props.positions.filter(item =>
      (!position || item.id === position) &&
      `${item.title} ${item.candidates.map(candidate => candidate.name).join(" ")}`.toLowerCase().includes(query.toLowerCase()),
    ),
    [props.positions, position, query],
  );
  const maxActivity = Math.max(1, ...props.activity.map(item => item.count));

  return <div className="admin-content monitor-page">
    <div className="monitor-heading">
      <div><small><Radio /> LIVE ELECTION OPERATIONS</small><h1>Vote Monitor &amp; Results</h1><p>Track voter activity and review complete election results in real time.</p></div>
      <span><i />Live monitoring active</span>
    </div>
    <div className="monitor-stats">
      <article><span>Total Votes Cast</span><div className="stat-icon red"><Vote /></div><b>{props.ballots}</b><small>Secure ballots submitted</small></article>
      <article><span>Participation Rate</span><div className="stat-icon green"><Users /></div><b>{props.turnout}%</b><small>{props.eligible} registered electorates</small></article>
      <article><span>Remaining Voters</span><div className="stat-icon amber"><Clock3 /></div><b>{props.remaining}</b><small>{Math.max(0, 100 - props.turnout)}% yet to vote</small></article>
      <article><span>Void Votes</span><div className="stat-icon blue"><CircleSlash2 /></div><b>{props.voidSelections}</b><small>Unselected positions across all ballots</small></article>
    </div>
    <div className="monitor-toolbar">
      <strong>Overview By Position Live Activity</strong>
      <label><i />Auto-refresh <button type="button" className={autoRefresh ? "switch on" : "switch"} onClick={() => setAutoRefresh(!autoRefresh)} aria-pressed={autoRefresh}><span /></button></label>
      <span>Updates every 15 sec</span>
    </div>
    <div className="monitor-overview">
      <section className="admin-card activity-card"><h2>Voting Activity</h2><p>Votes submitted across the election period</p><strong>{props.ballots} total ballots</strong><div className="activity-chart">{props.activity.map(item => <div key={item.label}><i style={{ height: `${Math.max(8, item.count / maxActivity * 100)}%` }} title={`${item.count} ballots`} /><small>{item.label}</small></div>)}</div><div className="activity-foot"><span>{props.ballots} ballots submitted</span><b>Live WAT activity</b></div></section>
      <section className="admin-card election-status-card"><h2>Election Status</h2><p>Current voting progress</p><div className="status-panel"><Radio /><div><b>Voting is {props.status}</b><small>Closes {props.closesAt}</small></div><span>{props.status}</span></div><div className="participation-label"><span>Overall participation</span><b>{props.turnout}%</b></div><div className="participation-track"><i style={{ width: `${props.turnout}%` }} /></div><div className="status-mini"><div><span>Time remaining</span><b>{props.timeRemaining}</b></div><div><span>Last vote</span><b>{props.lastVote}</b></div></div></section>
    </div>
    <section className="admin-card monitor-results">
      <div><h2>Results by Position</h2><p>Live vote tally for every candidate and each void selection</p></div>
      <div className="monitor-filters"><label><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search position or candidate..." /></label><select value={position} onChange={event => setPosition(event.target.value)}><option value="">All positions</option>{props.positions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
      <div className="monitor-position-list">
        {visible.map(item => <article className="monitor-position-result" key={item.id}>
          <header><h3>{item.title}</h3><span>{item.validVotes} valid {item.validVotes === 1 ? "vote" : "votes"} cast</span></header>
          {item.candidates.map((candidate, index) => {
            const percentage = props.ballots ? Number((candidate.votes / props.ballots * 100).toFixed(1)) : 0;
            return <div className="monitor-candidate-result" key={candidate.id}>
              <span className={`leader-avatar result-avatar-${index % 4}`}>{candidate.initials}</span>
              <div><span><b>{candidate.name}</b>{index === 0 && candidate.votes > 0 && <small className="leading-badge">Leading</small>}</span>{candidate.pka && <small>PKA: {candidate.pka}</small>}<i><span style={{ width: `${percentage}%` }} /></i></div>
              <strong>{candidate.votes}<small>{percentage}%</small></strong>
            </div>;
          })}
          <div className="monitor-candidate-result void-result">
            <span className="leader-avatar"><CircleSlash2 /></span>
            <div><span><b>Void / no selection</b></span><i><span style={{ width: `${props.ballots ? item.voidVotes / props.ballots * 100 : 0}%` }} /></i></div>
            <strong>{item.voidVotes}<small>{props.ballots ? Number((item.voidVotes / props.ballots * 100).toFixed(1)) : 0}%</small></strong>
          </div>
        </article>)}
      </div>
    </section>
    <ResultsControl published={props.published} canPublish={props.canPublish} />
  </div>;
}
