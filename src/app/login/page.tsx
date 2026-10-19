import Link from "next/link";
import { CalendarClock, ShieldCheck, Vote } from "lucide-react";
import { PublicPageShell } from "@/components/public-page-shell";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/components/login-form";
import { formatWat, getPublishedElectionSummary, votingClosedNotice } from "@/lib/elections";

// Whether the form shows depends on the clock, so this page cannot be cached.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // If the database is briefly unreachable, fall back to the form: the sign-in
  // API enforces the voting window regardless.
  const election = await getPublishedElectionSummary().catch(() => undefined);
  const closed = election === undefined ? null : votingClosedNotice(election);

  return <PublicPageShell className="public-pages public-login"><main className="auth-page">
    <aside className="login-identity">
      <Logo />
      <div className="login-seal" aria-hidden="true"><ShieldCheck /><Vote /></div>
    </aside>
    {closed
      ? <section className="login-form voting-closed" role="status">
          <CalendarClock size={40} aria-hidden />
          <h1>{closed.title}</h1>
          <p>{closed.message}</p>
          {election && <dl>
            <div><dt>Election</dt><dd>{election.title}</dd></div>
            <div><dt>Voting opens</dt><dd>{formatWat(election.opensAt)}</dd></div>
            <div><dt>Voting closes</dt><dd>{formatWat(election.closesAt)}</dd></div>
          </dl>}
          <Link className="button" href="/">Back to Home</Link>
          {closed.state === "closed" && <Link className="voting-closed-link" href="/results">View results page</Link>}
        </section>
      : <LoginForm />}
    <p>Nigerian Library Association, Osun State Chapter<br />© 2026 Election Committee.</p>
  </main></PublicPageShell>;
}
