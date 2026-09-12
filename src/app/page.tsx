import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, Award, BadgeCheck, CalendarDays, CheckCircle2, ChevronDown, Clock, Download,
  Eye, FileText, Fingerprint, Flag, Globe, IdCard, Landmark, LifeBuoy, ListChecks, LockKeyhole,
  Mail, Phone, Scale, ShieldCheck, TriangleAlert, UserCheck, Users, Vote,
} from "lucide-react";
import { Countdown } from "@/components/countdown";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { electionState, formatWatDate, formatWatTime, getPublishedElectionLanding } from "@/lib/elections";

// Cached and revalidated on a timer so public traffic costs a fixed number of
// database reads per hour instead of one per visitor. Candidate edits, nomination
// approvals and results publication all call revalidatePath already, so those
// changes still appear immediately; only untouched data can be up to 5 min stale.
export const revalidate = 300;

const CHAPTER = "Nigerian Library Association, Osun State Chapter";

const PILLARS = [
  [Eye, "Transparent Process", "Every step, every ballot, verified."],
  [Users, "Member Participation", "Every eligible voice counts."],
  [LockKeyhole, "Secure Voting", "Your ballot, protected and private."],
  [Award, "Professional Leadership", "Shaping the future of our profession."],
] as const;

const ELIGIBILITY = [
  "Active member of the Nigerian Library Association",
  "Member of the Osun State Chapter",
  "Meets official election eligibility requirements",
  "Valid membership information on record",
  "Complies with Election Committee guidelines",
] as const;

const FAQS = [
  ["Who is eligible to vote in this election?",
    "Voting is open to registered members of the Nigerian Library Association, Osun State Chapter whose membership records are current and who meet the eligibility requirements set out by the Election Committee."],
  ["How do I access the ballot?",
    "Select Vote Now and sign in with the membership details on record with the chapter. Once your eligibility is confirmed, the ballot for every contested office is presented to you in turn."],
  ["Is my ballot private?",
    "Yes. The platform records that you voted separately from the choices you made, so your individual selections cannot be traced back to you by the Election Committee or anyone else."],
  ["Can I change my vote after submitting?",
    "No. Ballots are final once submitted, so review your selections carefully on the confirmation screen before you complete the process."],
  ["What if I cannot vote during the voting window?",
    "Voting is only possible between the announced opening and closing times. If you experience a technical problem within that window, report it to the Election Committee immediately using the support details below."],
  ["When are results announced?",
    "Results are published on this platform once the Election Committee has verified and officially released them."],
] as const;

export default async function HomePage() {
  const election = await getPublishedElectionLanding();
  const state = election ? electionState(election.opensAt, election.closesAt) : null;
  const countdownTarget = state === "upcoming" ? election?.opensAt : state === "open" ? election?.closesAt : null;

  return <>
    <SiteHeader />
    <main className="home">
      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="home-eyebrow"><Landmark />NIGERIAN LIBRARY ASSOCIATION · OSUN STATE CHAPTER</span>
          <h1>{election?.title ?? "2026 NLA Osun State Chapter Election"}</h1>
          <p className="home-hero-tagline">Your Voice. Your Vote. Your Future.</p>
          <p className="home-hero-lede">
            {election?.description ?? `Participate in shaping the next chapter of leadership for the ${CHAPTER}.`} Eligible
            members can review candidates, understand the election process, confirm important dates, and securely
            access the official voting platform.
          </p>
          <div className="home-hero-actions">
            <Link className="button home-button-light" href="/login"><Vote />Vote Now</Link>
            <Link className="button home-button-outline" href="/candidates"><Users />Meet the Candidates</Link>
          </div>
          <p className="home-hero-trust"><LockKeyhole />Secure · Transparent · Member-Only Voting</p>
        </div>
        <div className="home-hero-art">
          <Image
            src="/nla-osun-hero.png"
            alt="A member casting a verified ballot on the chapter e-voting platform"
            fill
            sizes="(max-width: 900px) 100vw, 44vw"
            priority
          />
        </div>
      </section>

      {election && <section className="home-facts">
        <dl>
          <div><CalendarDays /><dt>Election Date</dt><dd>{formatWatDate(election.opensAt)}</dd></div>
          <div><Clock /><dt>Voting Opens</dt><dd>{formatWatTime(election.opensAt)}</dd></div>
          <div><Clock /><dt>Voting Closes</dt><dd>{formatWatTime(election.closesAt)}</dd></div>
          <div><Globe /><dt>Voting Method</dt><dd>Online Voting</dd></div>
          <div><IdCard /><dt>Eligibility</dt><dd>Registered NLA Osun State Chapter Members</dd></div>
        </dl>
      </section>}

      {election?.showCountdown && countdownTarget && <section className="home-countdown">
        <h2>Election Countdown</h2>
        <p>{state === "upcoming" ? "Election begins in" : "Voting closes in"}</p>
        <Countdown
          target={countdownTarget.toISOString()}
          label={state === "upcoming" ? "ELECTION BEGINS IN" : "VOTING CLOSES IN"}
        />
      </section>}

      <section className="home-section home-about">
        <h2>About the Election</h2>
        <p className="home-section-lede">
          The {CHAPTER} Election provides eligible members with the opportunity to elect officers who will provide
          professional leadership and help advance librarianship, information services, knowledge management,
          advocacy, and professional development within the state.
        </p>
        <div className="home-pillars">
          {PILLARS.map(([Icon, title, blurb]) => (
            <article key={title}><Icon /><h3>{title}</h3><p>{blurb}</p></article>
          ))}
        </div>
      </section>

      <section className="home-section home-how">
        <h2>How to Vote</h2>
        <p className="home-notice">
          <TriangleAlert />
          Each eligible member may vote only according to the official election guidelines.
        </p>
      </section>

      <section className="home-section home-eligibility">
        <h2>Who Can Vote?</h2>
        <ul className="home-checklist">
          {ELIGIBILITY.map((item) => <li key={item}><CheckCircle2 />{item}</li>)}
        </ul>
        <Link className="button" href="/login"><UserCheck />Check Voting Eligibility</Link>
      </section>

      {election && <section className="home-section home-timeline">
        <h2>Election Timeline</h2>
        <ol>
          <li>
            <span className="home-step"><ListChecks /></span>
            <div><h3>Nominations &amp; Verification</h3><p>Candidate nominations screened and confirmed by the Election Committee.</p></div>
          </li>
          <li>
            <span className="home-step"><Vote /></span>
            <div><h3>Voting Opens</h3><p>{formatWatDate(election.opensAt)} · {formatWatTime(election.opensAt)} WAT</p></div>
          </li>
          <li>
            <span className="home-step"><Clock /></span>
            <div><h3>Voting Closes</h3><p>{formatWatDate(election.closesAt)} · {formatWatTime(election.closesAt)} WAT</p></div>
          </li>
          <li>
            <span className="home-step"><Flag /></span>
            <div>
              <h3>Results Published</h3>
              <p>{election.resultsPublishedAt ? formatWatDate(election.resultsPublishedAt) : "Announced once the Election Committee verifies and releases the results."}</p>
            </div>
          </li>
        </ol>
      </section>}

      <section className="home-section home-guidelines">
        <h2>Election Guidelines</h2>
        <p className="home-section-lede">
          Members are encouraged to read the official election rules and procedures before participating.
        </p>
        <div className="home-hero-actions">
          <Link className="button" href="/about"><FileText />View Election Guidelines</Link>
          <Link className="button home-button-outline-dark" href="/announcements"><Download />Download Election Guidelines</Link>
        </div>
      </section>

      <section className="home-section home-committee">
        <h2>Election Committee</h2>
        <p className="home-section-lede">
          The Election Committee is committed to conducting a transparent, credible, fair, and professional
          electoral process.
        </p>
        <div className="home-pillars">
          <article><Scale /><h3>Impartial Oversight</h3><p>Every stage of the ballot is administered without favour.</p></article>
          <article><BadgeCheck /><h3>Verified Nominations</h3><p>Only screened and confirmed candidates appear on the ballot.</p></article>
          <article><ShieldCheck /><h3>Accountable Conduct</h3><p>Committee decisions are documented and communicated to members.</p></article>
        </div>
        <Link className="home-inline-link" href="/about">Meet the Election Committee <ArrowRight /></Link>
      </section>

      <section className="home-section home-security">
        <h2>A Secure and Transparent Election</h2>
        <p className="home-section-lede">
          The Election Committee upholds strict standards of privacy and confidentiality throughout the voting
          process. Member identities and individual ballots are handled with care and are not disclosed.
        </p>
        <div className="home-pillars">
          <article><Fingerprint /><h3>Verified Identity</h3><p>Only confirmed members can reach the ballot.</p></article>
          <article><CheckCircle2 /><h3>One Member, One Vote</h3><p>The platform blocks any attempt to vote twice.</p></article>
          <article><LockKeyhole /><h3>Confidential Ballots</h3><p>Your selections are stored apart from your identity.</p></article>
        </div>
        <p className="home-notice">
          <TriangleAlert />
          <span><strong>Election Notice</strong>Voting will only take place during the officially announced election period.</span>
        </p>
      </section>

      <section className="home-section home-faq" id="faq">
        <h2>Frequently Asked Questions</h2>
        <div className="home-faq-list">
          {FAQS.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}<ChevronDown /></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="home-section home-support" id="support">
        <h2>Need Election Support?</h2>
        <p className="home-section-lede">{CHAPTER} Election Committee</p>
        <ul className="home-contact">
          <li><Mail /><a href="mailto:elections@nlaosun.org.ng">elections@nlaosun.org.ng</a></li>
          <li><Phone /><a href="tel:+2348030000000">+234 803 000 0000</a></li>
          <li><Clock />Monday–Friday, 9:00 AM–5:00 PM</li>
        </ul>
        <div className="home-hero-actions">
          <Link className="button" href="mailto:elections@nlaosun.org.ng"><LifeBuoy />Contact Election Committee</Link>
          <Link className="home-report-link" href="mailto:elections@nlaosun.org.ng?subject=Voting%20Issue">
            <TriangleAlert />Report Voting Issue
          </Link>
        </div>
      </section>

      <section className="home-cta">
        <h2>Your Voice Matters</h2>
        <p>Participate in building the future of the {CHAPTER}.</p>
        <div className="home-hero-actions">
          <Link className="button home-button-gold" href="/login"><Vote />Vote Now</Link>
          <Link className="button home-button-outline" href="/candidates"><Users />Review Candidates</Link>
        </div>
      </section>
    </main>
    <SiteFooter />
  </>;
}
