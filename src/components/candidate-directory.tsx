"use client";
import Link from "next/link";
import { Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { CandidatePhoto } from "@/components/candidate-photo";

type Candidate = {
  id: string;
  slug: string;
  name: string;
  pka: string;
  photoUrl: string | null;
  tagline: string;
  biography: string;
  level: string;
  position: { title: string; slug: string; sortOrder: number };
};
export function CandidateDirectory({
  candidates,
}: {
  candidates: Candidate[];
}) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const positions = [
    ...new Map(candidates.map((c) => [c.position.slug, c.position])).values(),
  ];
  const visible = useMemo(
    () =>
      candidates.filter(
        (c) =>
          (!position || c.position.slug === position) &&
          `${c.name} ${c.pka}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [candidates, query, position],
  );
  return (
    <>
      <div className="filters">
        <label>
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidates by name or PKA..."
            aria-label="Search candidates by name or PKA"
          />
        </label>
        <select aria-label="Filter candidates by position" value={position} onChange={(e) => setPosition(e.target.value)}>
          <option value="">All Positions</option>
          {positions.map((p) => (
            <option value={p.slug} key={p.slug}>
              {p.title}
            </option>
          ))}
        </select>
      </div>
      <div className="candidate-grid">
        {visible.map((c, i) => (
          <article className="candidate-card" key={c.id}>
            <CandidatePhoto
              name={c.name}
              src={c.photoUrl}
              className={`avatar avatar-${i % 5}`}
            />
            <Star className="star" />
            <h2>{c.name}</h2>
            {c.pka && (
              <p className="candidate-pka">
                Politically Known As: <strong>{c.pka}</strong>
              </p>
            )}
            <span className="pill">{c.position.title}</span>
            <p>Library &amp; Information Science · {c.level}</p>
            <em>“{c.tagline}”</em>
            <p className="candidate-bio-preview">
              {c.biography.length > 125
                ? `${c.biography.slice(0, 125).trimEnd()}…`
                : c.biography}
            </p>
            <div>
              <Link href={`/candidates/${c.slug}`}>Manifesto</Link>
              <Link className="button" href={`/candidates/${c.slug}`}>
                View Profile →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
