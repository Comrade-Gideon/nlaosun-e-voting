"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Mail, Send, Users } from "lucide-react";

type Person = { id: string; name: string; email: string; position: string; status?: string };

type SendResult = {
  sent: number;
  failed: { email: string; error?: string }[];
  skipped: string[];
} | null;

export function AdminEmailComposer({
  configured,
  candidates,
  nominations,
}: {
  configured: boolean;
  candidates: Person[];
  nominations: Person[];
}) {
  // A person can appear in both groups (an approved candidate still has their
  // nomination row), so selection is keyed on the address, not the row id.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SendResult>(null);

  const groups = useMemo(
    () => [
      { key: "candidates", title: "Published candidates", icon: Users, people: candidates },
      { key: "nominations", title: "Nominations", icon: Mail, people: nominations },
    ],
    [candidates, nominations],
  );

  function toggle(email: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
    setResult(null);
  }

  function toggleGroup(people: Person[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const person of people) {
        if (on) next.add(person.email);
        else next.delete(person.email);
      }
      return next;
    });
    setResult(null);
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.size) return setError("Choose at least one recipient.");
    setBusy(true);
    setError("");
    setResult(null);
    const response = await fetch("/api/admin/emails", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, body, recipients: [...selected] }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.message ?? "The message could not be sent.");
    else {
      setResult({ sent: payload.sent, failed: payload.failed ?? [], skipped: payload.skipped ?? [] });
      if (!payload.failed?.length) {
        setSubject("");
        setBody("");
        setSelected(new Set());
      }
    }
    setBusy(false);
  }

  return (
    <form className="email-composer" onSubmit={send}>
      {!configured && (
        <p className="warning">
          <AlertCircle /> Email is not configured yet. Add <code>GOOGLE_CLIENT_ID</code>,{" "}
          <code>GOOGLE_CLIENT_SECRET</code> and <code>GOOGLE_REFRESH_TOKEN</code> to the deployment&apos;s runtime
          variables before sending.
        </p>
      )}

      <section className="admin-card email-recipients">
        <h2>Recipients</h2>
        <p>{selected.size} selected. Each person receives their own message — addresses are never shared between recipients.</p>
        {groups.map(({ key, title, icon: Icon, people }) => {
          const allOn = people.length > 0 && people.every((person) => selected.has(person.email));
          return (
            <div className="email-group" key={key}>
              <header>
                <span><Icon />{title} ({people.length})</span>
                {people.length > 0 && (
                  <button type="button" onClick={() => toggleGroup(people, !allOn)}>
                    {allOn ? "Clear all" : "Select all"}
                  </button>
                )}
              </header>
              {people.length === 0 ? (
                <p className="email-empty">
                  {key === "candidates"
                    ? "No published candidates yet. Approve a nomination and it will appear here."
                    : "No nominations started yet."}
                </p>
              ) : (
                <ul>
                  {people.map((person) => (
                    <li key={person.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selected.has(person.email)}
                          onChange={() => toggle(person.email)}
                        />
                        <span>
                          <strong>{person.name}</strong>
                          <small>{person.email} · {person.position}{person.status ? ` · ${person.status}` : ""}</small>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <section className="admin-card admin-form email-message">
        <h2>Message</h2>
        <p>Sent with the chapter emblem, colours and typeface. Write plain text; blank lines become paragraphs.</p>
        <label>
          Subject
          <input
            value={subject}
            onChange={(event) => { setSubject(event.target.value); setResult(null); }}
            placeholder="e.g. Nomination deadline reminder"
            maxLength={200}
            required
          />
        </label>
        <label>
          Message
          <textarea
            value={body}
            onChange={(event) => { setBody(event.target.value); setResult(null); }}
            placeholder={"Dear candidate,\n\nNominations close on…"}
            rows={12}
            maxLength={10000}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}
        {result && (
          <div className="email-results">
            <p className={result.failed.length ? "warning" : "notice"}>
              {result.failed.length ? <AlertCircle /> : <CheckCircle2 />}
              Sent to {result.sent} recipient{result.sent === 1 ? "" : "s"}
              {result.failed.length ? `, ${result.failed.length} failed` : ""}.
            </p>
            {result.failed.map((failure) => (
              <small key={failure.email}>{failure.email}: {failure.error ?? "delivery failed"}</small>
            ))}
            {result.skipped.length > 0 && (
              <small>Skipped (not a known candidate or nomination): {result.skipped.join(", ")}</small>
            )}
          </div>
        )}

        <button className="button wide" disabled={busy || !configured || selected.size === 0}>
          <Send />
          {busy ? "Sending…" : `Send to ${selected.size || "…"} recipient${selected.size === 1 ? "" : "s"}`}
        </button>
      </section>
    </form>
  );
}
