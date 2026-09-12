"use client";

import { useMemo, useState } from "react";
import { BarChart3, CheckCircle2, CircleSlash2, Search, Users, Vote } from "lucide-react";
import { CandidatePhoto } from "@/components/candidate-photo";

type CandidateResult = {
  id: string;
  name: string;
  pka: string;
  photoUrl: string | null;
  votes: number;
};
type PositionResult = {
  id: string;
  title: string;
  validVotes: number;
  voidVotes: number;
  candidates: CandidateResult[];
};
type Props = {
  title: string;
  description: string;
  registered: number;
  ballots: number;
  totalValidSelections: number;
  totalVoidSelections: number;
  turnout: number;
  publishedAt: string;
  opensAt: string;
  closesAt: string;
  positions: PositionResult[];
};

const percent = (value: number, total: number) => total
  ? Number(((value / total) * 100).toFixed(1))
  : 0;

export function PublicResultsDashboard(props: Props) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [showAll, setShowAll] = useState(false);
  const filtered = useMemo(() => props.positions.filter(item => {
    const matchesPosition = !position || item.id === position;
    const terms = `${item.title} ${item.candidates.map(candidate => `${candidate.name} ${candidate.pka}`).join(" ")}`.toLowerCase();
    return matchesPosition && terms.includes(query.trim().toLowerCase());
  }), [position, props.positions, query]);
  const visible = showAll || query || position ? filtered : filtered.slice(0, 2);

  return <main className="page results-public-page">
    <header className="official-results-heading">
      <span><i />Official Results</span>
      <h1>{props.title} Results</h1>
      <p>{props.description}</p>
      <small>Last updated: {props.publishedAt}</small>
    </header>

    <section className="public-results-stats" aria-label="Election summary">
      <article><Users /><b>{props.registered}</b><span>Total registered voters</span><small>Eligible voters registered for this election.</small></article>
      <article><Vote /><b>{props.ballots}</b><span>Total ballots cast</span><small>Verified ballots successfully submitted.</small></article>
      <article><BarChart3 /><b>{props.turnout}%</b><span>Total voter turnout</span><small>Percentage of registered voters who participated.</small></article>
      <article><CircleSlash2 /><b>{props.totalVoidSelections}</b><span>Total void selections</span><small>Positions submitted without a candidate selection.</small></article>
    </section>

    <section className="turnout-card">
      <div><h2>Voter Turnout</h2><strong>{props.turnout}%</strong></div>
      <i><span style={{ width: `${Math.min(100, props.turnout)}%` }} /></i>
      <p>{props.ballots} of {props.registered} registered voters voted.</p>
      <dl>
        <div><dt>Registered voters</dt><dd>{props.registered}</dd></div>
        <div><dt>Votes cast</dt><dd>{props.ballots}</dd></div>
        <div><dt>Did not vote</dt><dd>{Math.max(0, props.registered - props.ballots)}</dd></div>
        <div><dt>Turnout</dt><dd>{props.turnout}%</dd></div>
      </dl>
    </section>

    <div className="public-results-filters">
      <label><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search candidate or position..." /></label>
      <select value={position} onChange={event => setPosition(event.target.value)} aria-label="Filter by position">
        <option value="">All Positions</option>
        {props.positions.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}
      </select>
    </div>

    <section className="official-position-results">
      <div><h2>Election Results</h2><p>Official results by contested position.</p></div>
      {visible.map(item => {
        const top = item.candidates[0];
        const uniqueWinner = Boolean(top && top.votes > 0 && (item.candidates[1]?.votes ?? -1) < top.votes);
        return <article className="official-position-card" key={item.id}>
          <header><div><h3>{item.title}</h3><small>Position contested</small></div><dl><div><dt>Total ballots</dt><dd>{props.ballots}</dd></div><div><dt>Valid votes</dt><dd>{item.validVotes}</dd></div><div><dt>Void votes</dt><dd>{item.voidVotes}</dd></div></dl></header>
          {uniqueWinner && top && <div className="result-winner"><CandidatePhoto name={top.name} src={top.photoUrl} /><div><b>{top.name}</b>{top.pka && <small>Politically Known As: {top.pka}</small>}</div><span>Winner</span><strong>{top.votes} votes<small>{percent(top.votes, props.ballots)}% of ballots</small></strong></div>}
          <div className="official-candidate-list">
            {item.candidates.map((candidate, index) => {
              const share = percent(candidate.votes, props.ballots);
              return <div className="official-candidate-row" key={candidate.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <CandidatePhoto name={candidate.name} src={candidate.photoUrl} />
                <div><b>{candidate.name}</b>{candidate.pka && <small>PKA: {candidate.pka}</small>}<i><span style={{ width: `${share}%` }} /></i></div>
                <strong>{candidate.votes} {candidate.votes === 1 ? "vote" : "votes"}<small>{share}%</small></strong>
              </div>;
            })}
          </div>
          <footer><span><CircleSlash2 />Void votes: <b>{item.voidVotes}</b> · {percent(item.voidVotes, props.ballots)}%</span><small>Valid votes: {item.validVotes} · Total ballots: {props.ballots}</small></footer>
        </article>;
      })}
      {!visible.length && <div className="results-empty"><Search /><h3>No matching result</h3><p>Try another candidate name or position.</p></div>}
      {!showAll && !query && !position && filtered.length > 2 && <button className="load-results" onClick={() => setShowAll(true)}>Load more positions</button>}
    </section>

    <section className="public-results-overview">
      <h2>Election Overview</h2>
      <div><span>Registered voters<strong>{props.registered}</strong></span><span>Total ballots cast<strong>{props.ballots}</strong></span><span>Valid candidate selections<strong>{props.totalValidSelections}</strong></span><span>Void selections<strong>{props.totalVoidSelections}</strong></span><span>Voter turnout<strong>{props.turnout}%</strong></span><span>Positions contested<strong>{props.positions.length}</strong></span></div>
      <p>Election opening: {props.opensAt}<br />Election closing: {props.closesAt}</p>
    </section>

    <section className="about-public-results">
      <CheckCircle2 />
      <div><h2>About These Results</h2><p>These results represent verified ballots recorded by the NLA Osun State Chapter E-Voting Platform. Candidate totals and void selections are presented per position and were officially released by the Election Committee.</p><small>Results status: Official · Published {props.publishedAt}</small></div>
    </section>
  </main>;
}
