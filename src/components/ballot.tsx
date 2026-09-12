"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CandidatePhoto } from "@/components/candidate-photo";

type Position = {
  id: string;
  title: string;
  candidates: {
    id: string;
    name: string;
    pka: string;
    photoUrl: string | null;
  }[];
};
export function Ballot({
  positions,
  voterName,
}: {
  positions: Position[];
  voterName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const position = positions[step];
  async function submit() {
    if (
      Object.keys(choices).length === 0 &&
      !window.confirm(
        "You have not selected any candidate. Submitting now will record a void vote for every position. Continue?",
      )
    ) return;
    setBusy(true);
    setError("");
    const selections = Object.entries(choices).map(
      ([positionId, candidateId]) => ({ positionId, candidateId }),
    );
    try {
      const response = await fetch("/api/ballots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selections }),
      });
      const text = await response.text();
      let body: { message?: string } = {};
      try { body = JSON.parse(text); } catch {}
      if (response.ok)
        router.push("/vote/success");
      else setError(body.message || "The ballot server returned an invalid response. Please try again.");
    } catch {
      setError("Could not reach the ballot server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="ballot-page">
      <header>
        <b>
          NLA Osun <small>Election Committee</small>
        </b>
        <div className="ballot-voter">
          <span>
            Welcome, <strong>{voterName}</strong>
          </span>
          <small>
            Step {step + 1} of {positions.length}
          </small>
        </div>
      </header>
      <div className="ballot-layout">
        <section>
          <p>Cast Your Vote</p>
          <h1>{position.title}</h1>
          <p>
            Select one candidate for this position. If you skip this position,
            it will be counted as a void vote.
          </p>
          <div className="ballot-candidates">
            {position.candidates.map((candidate, index) => (
              <button
                className={
                  choices[position.id] === candidate.id ? "selected" : ""
                }
                onClick={() =>
                  setChoices({ ...choices, [position.id]: candidate.id })
                }
                key={candidate.id}
              >
                <CandidatePhoto
                  name={candidate.name}
                  src={candidate.photoUrl}
                  className={`avatar avatar-${index}`}
                />
                <b>{candidate.name}</b>
                <small>
                  {candidate.pka
                    ? `Politically Known As: ${candidate.pka}`
                    : `For ${position.title}`}
                </small>
              </button>
            ))}
          </div>
          {choices[position.id] && (
            <button
              type="button"
              className="clear-ballot-choice"
              onClick={() => setChoices(current => {
                const next = { ...current };
                delete next[position.id];
                return next;
              })}
            >
              Clear selection and vote void for this position
            </button>
          )}
          <div className="ballot-nav">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              Back
            </button>
            {step < positions.length - 1 ? (
              <button className="button" onClick={() => setStep(step + 1)}>
                Next →
              </button>
            ) : (
              <span />
            )}
          </div>
        </section>
        <aside>
          <h2>Review Your Ballot</h2>
          <p>A summary of every position you have selected so far.</p>
          {positions.map((p) => {
            const selected = p.candidates.find((c) => c.id === choices[p.id]);
            return (
              <div className={`review ${selected ? "" : "void"}`} key={p.id}>
                <div>
                  <small>{p.title}</small>
                  <b>{selected?.name ?? "Void vote"}</b>
                  {selected?.pka ? (
                    <small>Politically Known As: {selected.pka}</small>
                  ) : !selected ? (
                    <small>No candidate selected</small>
                  ) : null}
                </div>
                {selected && (
                  <CandidatePhoto
                    name={selected.name}
                    src={selected.photoUrl}
                    className="review-photo"
                  />
                )}
              </div>
            );
          })}
          <p className="warning">
            Every position without a selected candidate will be recorded as a
            void vote. Review carefully: your ballot cannot be changed after
            submission.
          </p>
          {error && <p className="error">{error}</p>}
          <button
            className="button wide"
            disabled={busy}
            onClick={submit}
          >
            {busy ? "Submitting…" : "Submit My Ballot"}
          </button>
        </aside>
      </div>
    </main>
  );
}
