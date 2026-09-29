"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  LockKeyhole,
  Save,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { uploadViaPresignedUrl } from "@/lib/upload-client";

type Draft = {
  phone: string;
  currentPosition: string;
  permanentAddress: string;
  pka: string;
  tagline: string;
  biography: string;
  manifesto: string;
  mission: string;
  vision: string;
  priorities: string[];
  guarantors: { name: string; email: string }[];
  passportData: string | null;
  passportName: string | null;
  studentIdData: string | null;
  studentIdName: string | null;
  identificationData: string | null;
  identificationName: string | null;
  signatureData: string | null;
  signatureName: string | null;
  declarationsAccepted: boolean;
};
type Invite = {
  candidateName: string;
  email: string;
  lrcnCertified: boolean;
  lrcnNumber: string;
  position: { id: string; title: string };
  uploadId: string;
  expiresAt: string;
  showExpiryCountdown: boolean;
  reviewNote: string;
  draft: Draft;
};
type Receipt = {
  receipt: string;
  candidateName: string;
  email: string;
  lrcnCertified: boolean;
  lrcnNumber: string;
  position: string;
  currentPosition: string;
  permanentAddress: string;
  phone: string;
  pka: string;
  passportData: string | null;
  tagline: string;
  biography: string;
  manifesto: string;
  mission: string;
  vision: string;
  priorities: string[];
  candidateEmail?: { sent: boolean };
  guarantors?: { name: string; email: string; sent: boolean }[];
  submittedAt: string;
};
type LinkState = { title: string; message: string; redirect: boolean };
const blank: Draft = {
  phone: "",
  currentPosition: "",
  permanentAddress: "",
  pka: "",
  tagline: "",
  biography: "",
  manifesto: "",
  mission: "",
  vision: "",
  priorities: ["", "", ""],
  guarantors: [
    { name: "", email: "" },
    { name: "", email: "" },
  ],
  passportData: null,
  passportName: null,
  studentIdData: null,
  studentIdName: null,
  identificationData: null,
  identificationName: null,
  signatureData: null,
  signatureName: null,
  declarationsAccepted: false,
};
const declarations = [
  "The information and documents provided are true, accurate and complete.",
  "I freely consent to being nominated for the position assigned to this form.",
  "I agree to comply with the Constitution, Electoral Guidelines and Code of Conduct.",
  "I consent to verification of the academic and administrative information required to determine eligibility.",
  "I will conduct my campaign peacefully, responsibly and without intimidation, bribery or discrimination.",
  "I consent to publication of my name, photograph, position, biography, manifesto, mission, vision and priorities for election purposes.",
];

function listOf(items: string[]) {
  return items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function missingMessage(items: string[]) {
  return `Please complete the ${items.length === 1 ? "following" : `following ${items.length} items`}: ${listOf(items)}.`;
}

function validateFile(file: File, max: number, types: string[]) {
  if (file.size > max)
    throw new Error(
      `File must be ${Math.round(max / 1_000_000)}MB or smaller.`,
    );
  if (!types.includes(file.type)) throw new Error("Unsupported file format.");
  return file;
}
function safeUploadName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "file";
}
const RETRY_DELAYS_MS = [1_000, 2_500];

/**
 * For idempotent requests only (loading and saving the draft). A brief network
 * drop or a 5xx while the database resumes is retried before the candidate
 * ever sees it. Submission is never retried automatically.
 */
async function fetchWithRetry(input: string, init?: RequestInit) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.status < 500 || attempt >= RETRY_DELAYS_MS.length) return response;
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length || (error instanceof Error && error.name === "AbortError")) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
}

async function responseBody(response: Response) {
  const text = await response.text();
  if (!text)
    return {
      message: response.ok
        ? ""
        : "We could not complete that just now. Your answers are safe on this page; please try again in a moment.",
    };
  try {
    return JSON.parse(text);
  } catch {
    return {
      message: "The server returned an invalid response. Please try again.",
    };
  }
}

type StartPosition = { id: string; title: string };

export function NominationPortal({
  positions,
  closesAt,
}: {
  positions: StartPosition[];
  closesAt: string;
}) {
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [data, setData] = useState<Draft>(blank);
  const [step, setStep] = useState(1);
  const [accepted, setAccepted] = useState<boolean[]>(
    declarations.map(() => false),
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [passportPreview, setPassportPreview] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<LinkState | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [savedAt, setSavedAt] = useState<string>("");
  // No cookie yet: the shared link lands every candidate on the start form.
  const [needsStart, setNeedsStart] = useState(false);
  useEffect(
    () => () => {
      if (passportPreview) URL.revokeObjectURL(passportPreview);
    },
    [passportPreview],
  );
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timers: number[] = [];
    const redirectHome = () =>
      timers.push(window.setTimeout(() => router.push("/"), 4000));
    async function load(attempt = 0) {
      try {
        const response = await fetchWithRetry("/api/nominations/session", {
          signal: controller.signal,
        });
        const body = await responseBody(response);
        if (cancelled) return;
        if (response.status === 503 && attempt < 4) {
          timers.push(window.setTimeout(() => load(attempt + 1), 3000));
          return;
        }
        if (response.status === 404 && body.code === "NO_SESSION") {
          setNeedsStart(true);
          return;
        }
        if (!response.ok) {
          const submitted = ["SUBMITTED", "APPROVED"].includes(body.code);
          setInvalid({
            title:
              body.code === "APPROVED"
                ? "Nomination approved"
                : body.code === "SUBMITTED"
                  ? "Nomination already submitted"
                  : "Nomination link unavailable",
            message: submitted
              ? `${body.message} Redirecting to the home page…`
              : body.message,
            redirect: submitted,
          });
          if (submitted) redirectHome();
          return;
        }
        const inviteBody = body as Invite;
        setInvite(inviteBody);
        if (window.sessionStorage.getItem("nomination-resumed")) {
          window.sessionStorage.removeItem("nomination-resumed");
          setNotice("Welcome back — your saved answers have been restored.");
          setSaveState("saved");
        }
        setData({
          ...blank,
          ...inviteBody.draft,
          priorities: [
            ...(inviteBody.draft.priorities ?? []),
            "",
            "",
            "",
          ].slice(0, 3),
          guarantors: [
            ...(inviteBody.draft.guarantors ?? []),
            { name: "", email: "" },
            { name: "", email: "" },
          ].slice(0, 2),
        });
        if (inviteBody.draft.declarationsAccepted)
          setAccepted(declarations.map(() => true));
        if (inviteBody.reviewNote)
          setNotice(
            `Correction requested by the Electoral Commission: ${inviteBody.reviewNote}`,
          );
      } catch (error) {
        if (
          !cancelled &&
          error instanceof Error &&
          error.name !== "AbortError"
        ) {
          if (attempt < 4)
            timers.push(window.setTimeout(() => load(attempt + 1), 3000));
          else
            setInvalid({
              title: "Service temporarily unavailable",
              message:
                "We could not verify this link right now. Please refresh the page in a moment.",
              redirect: false,
            });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      controller.abort();
      timers.forEach(clearTimeout);
    };
  }, [router]);
  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setData((current) => ({ ...current, [key]: value }));
    setNotice("");
    setError("");
  }
  async function attach(
    key: "passport" | "studentId" | "identification" | "signature",
    file?: File,
  ) {
    if (!file) return;
    if (!invite) return;
    setBusy(true);
    setError("");
    try {
      const imageOnly = key === "passport";
      validateFile(
        file,
        imageOnly ? 1_500_000 : 4_000_000,
        imageOnly
          ? ["image/png", "image/jpeg"]
          : ["application/pdf", "image/png", "image/jpeg"],
      );
      const stored = await uploadViaPresignedUrl({
        endpoint: "/api/nominations/session/upload",
        key: `nominations/${invite.uploadId}/${key}/${Date.now()}-${safeUploadName(file.name)}`,
        field: key,
        file,
      });
      if (key === "passport") {
        if (passportPreview) URL.revokeObjectURL(passportPreview);
        setPassportPreview(URL.createObjectURL(file));
      }
      setData((current) => ({
        ...current,
        [`${key}Data`]: stored.key,
        [`${key}Name`]: file.name,
      }));
      setNotice(`${file.name} uploaded securely.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "File upload failed.");
    } finally {
      setBusy(false);
    }
  }
  // Autosave runs while the candidate types, so a save can already be in flight
  // when they press Next. Chaining on it (instead of the old `if (busy) return`,
  // which made Next silently do nothing) keeps saves in order.
  const saving = useRef<Promise<boolean>>(Promise.resolve(true));
  function saveDraft(background = false) {
    const run = saving.current.then(() => persistDraft(background));
    saving.current = run.catch(() => false);
    return run;
  }
  async function persistDraft(background: boolean) {
    if (!background) {
      setBusy(true);
      setError("");
    }
    try {
      const payload = {
        ...data,
        declarationsAccepted: accepted.every(Boolean),
      };
      const response = await fetchWithRetry("/api/nominations/session", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        // A background save that fails is shown only in the save indicator; the
        // next edit or the Next button tries again. Red errors are reserved for
        // something the candidate did.
        if (!background) setError(body.message || "Your draft could not be saved just now. Please try again.");
        setSaveState("failed");
        return false;
      }
      setSaveState("saved");
      setSavedAt(new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date()));
      return true;
    } catch {
      if (!background)
        setError("We could not reach the nomination server. Your answers are still on this page; please check your connection and try again.");
      setSaveState("failed");
      return false;
    } finally {
      if (!background) setBusy(false);
    }
  }
  const firstRender = useRef(true);
  useEffect(() => {
    if (!invite || receipt || invalid) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("saving");
    const timer = window.setTimeout(() => { void saveDraft(true); }, 1800);
    return () => window.clearTimeout(timer);
    // saveDraft reads the latest data through closure on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, accepted, invite, receipt, invalid]);

  async function next() {
    setError("");
    // Name only what is actually missing on this step, not every requirement.
    const missing: string[] = [];
    if (step === 1) {
      if (!data.phone.trim()) missing.push("phone number");
      if (data.permanentAddress.trim().length < 10)
        missing.push(data.permanentAddress.trim() ? "a complete permanent home address (at least 10 characters)" : "permanent home address");
      if (!data.currentPosition.trim()) missing.push("current position at your place of work");
    }
    if (step === 2) {
      if (!data.passportData) missing.push("passport photograph");
      if (!data.pka.trim()) missing.push("PKA (Politically Known As)");
      if (!data.tagline.trim()) missing.push("campaign slogan");
      if (data.biography.length < 50)
        missing.push(`short biography (${50 - data.biography.length} more characters)`);
      for (const [label, value] of [
        ["manifesto", data.manifesto],
        ["mission", data.mission],
        ["vision", data.vision],
      ] as const) {
        if (value.length < 400) missing.push(`${label} (${400 - value.length} more characters)`);
        else if (value.length > 1000) missing.push(`${label} (${value.length - 1000} characters over the limit)`);
      }
      const priorities = data.priorities
        .map((value, index) => (value.trim().length < 2 ? index + 1 : 0))
        .filter(Boolean);
      if (priorities.length)
        missing.push(`${priorities.length === 1 ? "priority" : "priorities"} ${listOf(priorities.map(String))}`);
    }
    if (missing.length) {
      setError(missingMessage(missing));
      return;
    }
    if (await saveDraft()) setStep((value) => Math.min(3, value + 1));
  }
  async function submit() {
    setError("");
    if (busy) return;
    const missing: string[] = [];
    if (!data.studentIdData) missing.push("membership evidence");
    if (!data.identificationData) missing.push("means of identification");
    const guarantors = data.guarantors.filter(
      (g) => g.name.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g.email.trim()),
    ).length;
    if (guarantors < 2)
      missing.push(guarantors === 1 ? "a second guarantor's name and valid email" : "two guarantors' names and valid emails");
    if (!accepted.every(Boolean)) missing.push("acceptance of every declaration");
    if (!data.signatureData) missing.push("signature");
    if (missing.length) {
      setError(missingMessage(missing));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/nominations/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, declarationsAccepted: true }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(
          body.message ||
            "Nomination could not be submitted. Please try again.",
        );
        return;
      }
      setReceipt(body);
    } catch {
      setError(
        "Could not reach the nomination server. Your form is still open; please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (invalid)
    return (
      <NominationShell>
        <section className="nomination-invalid">
          <LockKeyhole />
          <h1>{invalid.title}</h1>
          <p>{invalid.message}</p>
          {invalid.redirect && (
            <Link className="button" href="/">
              Go to home page now
            </Link>
          )}
        </section>
      </NominationShell>
    );
  if (needsStart)
    return (
      <NominationShell>
        <NominationStart
          positions={positions}
          closesAt={closesAt}
          onStarted={(resumed) => {
            if (resumed) window.sessionStorage.setItem("nomination-resumed", "1");
            setNeedsStart(false);
            router.refresh();
            window.location.reload();
          }}
        />
      </NominationShell>
    );
  if (!invite)
    return (
      <NominationShell>
        <section className="nomination-invalid">
          <span className="loading-dot" />
          <h1>Loading secure nomination…</h1>
        </section>
      </NominationShell>
    );
  if (receipt) return <NominationReceipt receipt={receipt} />;
  return (
    <NominationShell>
      <NominationSteps step={step} />
      <NominationDeadline
        expiresAt={invite.expiresAt}
        enabled={invite.showExpiryCountdown}
      />
      <main className="nomination-form-card">
        <div className="nomination-title">
          <small>STEP {step} OF 3</small>
          <h1>
            {step === 1
              ? "Position & Candidate Information"
              : step === 2
                ? "Candidate Profile"
                : "Documents, Declaration & Review"}
          </h1>
          <p>
            {step === 1
              ? "Confirm your prefilled identity and provide your contact information."
              : step === 2
                ? "Create the public profile eligible voters will see during the election."
                : "Upload private supporting documents, accept the declaration and review before submission."}
          </p>
        </div>
        {step === 1 && (
          <section className="nomination-section">
            <label>
              Position
              <input value={invite.position.title} readOnly />
            </label>
            <div className="nomination-two">
              <label>
                Full Name
                <input value={invite.candidateName} readOnly />
              </label>
              <label>
                Email Address
                <input value={invite.email} readOnly />
              </label>
            </div>
            <label>
              Phone Number *
              <input
                value={data.phone}
                onChange={(e) => field("phone", e.target.value)}
                placeholder="+234 800 000 0000"
              />
            </label>
            <label>
              Permanent Home Address *
              <textarea
                value={data.permanentAddress}
                onChange={(e) => field("permanentAddress", e.target.value)}
                placeholder="Enter your full permanent residential address"
                minLength={10}
                maxLength={500}
                rows={3}
              />
              <small>
                Private: visible only to you, the Election Committee, and on
                your nomination printout.
              </small>
            </label>
            <label>
              Current Position at Place of Work *
              <input
                value={data.currentPosition}
                onChange={(e) => field("currentPosition", e.target.value)}
                placeholder="e.g. Principal Librarian, Osun State Library Board"
                maxLength={160}
              />
            </label>
            <div className="nomination-lrcn">
              <span>LRCN Certification</span>
              <p>
                {invite.lrcnCertified
                  ? `You indicated that you are LRCN certified, registration number ${invite.lrcnNumber}.`
                  : "You indicated that you are not LRCN certified. This does not affect your nomination."}
              </p>
            </div>
          </section>
        )}
        {step === 2 && (
          <section className="nomination-section">
            <FileUpload
              title="Passport Photograph *"
              note="JPG or PNG · Max 1.5MB"
              name={data.passportName}
              onFile={(file) => attach("passport", file)}
              preview={
                passportPreview ||
                (data.passportData
                  ? "/api/nominations/session/file?field=passport"
                  : null)
              }
            />
            <div className="nomination-two">
              <label>
                PKA (Politically Known As) *
                <input
                  value={data.pka}
                  onChange={(e) => field("pka", e.target.value)}
                  placeholder="Enter the political name voters know you by"
                  required
                />
                <small>This is the political name voters know you by.</small>
              </label>
              <label>
                Campaign Slogan *
                <input
                  value={data.tagline}
                  onChange={(e) => field("tagline", e.target.value)}
                  maxLength={180}
                />
              </label>
            </div>
            <TextCount
              label="Short Biography *"
              value={data.biography}
              min={50}
              max={1500}
              onChange={(value) => field("biography", value)}
            />
            <TextCount
              label="Manifesto *"
              value={data.manifesto}
              min={400}
              max={1000}
              onChange={(value) => field("manifesto", value)}
            />
            <TextCount
              label="Mission *"
              value={data.mission}
              min={400}
              max={1000}
              onChange={(value) => field("mission", value)}
            />
            <TextCount
              label="Vision *"
              value={data.vision}
              min={400}
              max={1000}
              onChange={(value) => field("vision", value)}
            />
            <div className="priority-inputs">
              <strong>Top Three Priorities *</strong>
              {data.priorities.map((value, index) => (
                <label key={index}>
                  <b>0{index + 1}</b>
                  <input
                    value={value}
                    onChange={(e) => {
                      const priorities = [...data.priorities];
                      priorities[index] = e.target.value;
                      field("priorities", priorities);
                    }}
                    placeholder={`Enter priority ${index + 1}`}
                  />
                </label>
              ))}
            </div>
          </section>
        )}
        {step === 3 && (
          <section className="nomination-section">
            <div className="document-protection">
              <ShieldCheck />
              <p>
                <b>Your documents are protected</b>
                <br />
                Supporting files are used only for verification and will not
                appear on your public profile or printout.
              </p>
            </div>
            <FileUpload
              title="Membership Evidence *"
              note="Your NLA membership card or certificate · PDF, JPG or PNG · Max 4MB"
              name={data.studentIdName}
              onFile={(file) => attach("studentId", file)}
            />
            <FileUpload
              title="Any Means of Identification *"
              note="National ID, driver&apos;s licence, international passport or voter&apos;s card · PDF, JPG or PNG · Max 4MB"
              name={data.identificationName}
              onFile={(file) => attach("identification", file)}
            />
            <GuarantorFields
              guarantors={data.guarantors}
              onChange={(next) => field("guarantors", next)}
            />
            <div className="declaration-box">
              <h2>Declaration & Undertaking</h2>
              {declarations.map((text, index) => (
                <label key={text}>
                  <input
                    type="checkbox"
                    checked={accepted[index]}
                    onChange={(e) =>
                      setAccepted((values) =>
                        values.map((value, i) =>
                          i === index ? e.target.checked : value,
                        ),
                      )
                    }
                  />
                  {text}
                </label>
              ))}
            </div>
            <FileUpload
              title="Signature *"
              note="Sign on a blank sheet of paper, then take a clear photo or scan and upload it · PDF, JPG or PNG · Max 4MB"
              name={data.signatureName}
              onFile={(file) => attach("signature", file)}
            />
            <div className="nomination-review">
              <h2>Review Your Nomination</h2>
              <dl>
                <div>
                  <dt>Candidate</dt>
                  <dd>{invite.candidateName}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{invite.email}</dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd>{invite.position.title}</dd>
                </div>
                <div>
                  <dt>LRCN Certified</dt>
                  <dd>{invite.lrcnCertified ? `Yes — ${invite.lrcnNumber}` : "No"}</dd>
                </div>
                <div>
                  <dt>Current Position</dt>
                  <dd>{data.currentPosition}</dd>
                </div>
              </dl>
              <p>
                <CheckCircle2 />
                Passport and profile will become public after submission.
                Supporting documents remain private.
              </p>
            </div>
          </section>
        )}
        {error && <p className="nomination-error">{error}</p>}
        {notice && <p className="nomination-notice">{notice}</p>}
        <div className="nomination-actions">
          <span className={`autosave-state ${saveState}`} aria-live="polite">
            {saveState === "saving" && <><span className="loading-dot" />Saving…</>}
            {saveState === "saved" && <><CheckCircle2 />Saved{savedAt ? ` at ${savedAt}` : ""} — you can close this and come back</>}
            {saveState === "failed" && <><Save />Not saved — check your connection</>}
            {saveState === "idle" && <><Save />Your answers save automatically</>}
          </span>
          <div>
            {step > 1 && (
              <button
                type="button"
                className="back-button"
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft />
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                className="button"
                onClick={next}
                disabled={busy}
              >
                Next <ArrowRight />
              </button>
            ) : (
              <button
                type="button"
                className="button"
                onClick={submit}
                disabled={busy}
              >
                {busy ? "Submitting…" : "Submit Nomination"}
                <ArrowRight />
              </button>
            )}
          </div>
        </div>
      </main>
    </NominationShell>
  );
}

/**
 * Entry step for the shared nomination link. Every candidate opens the same URL,
 * so this is where they identify themselves; the server then binds the resulting
 * nomination to this browser with a session cookie.
 */
function NominationStart({
  positions,
  closesAt,
  onStarted,
}: {
  positions: StartPosition[];
  closesAt: string;
  onStarted: (resumed: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [certified, setCertified] = useState<"yes" | "no" | "">("");


  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/nominations/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidateName: form.get("candidateName"),
        email: form.get("email"),
        positionId: form.get("positionId"),
        lrcnCertified: certified === "yes",
        lrcnNumber: certified === "yes" ? form.get("lrcnNumber") : undefined,
      }),
    });
    const body = await responseBody(response);
    if (response.ok) return onStarted(Boolean(body.resumed));
    setError(body.message ?? "Your nomination could not be started.");
    setBusy(false);
  }

  return (
    <section className="nomination-start">
      <div className="nomination-card-title">
        <ShieldCheck />
        <div>
          <h1>Start Your Nomination</h1>
          <p>
            Nominations close on{" "}
            <strong>
              {new Intl.DateTimeFormat("en-NG", {
                dateStyle: "full",
                timeStyle: "short",
                timeZone: "Africa/Lagos",
              }).format(new Date(closesAt))}{" "}
              WAT
            </strong>
            . Enter your details to open the nomination form.
          </p>
        </div>
      </div>
      <form onSubmit={submit}>
        <label>
          Full Name
          <input name="candidateName" required minLength={3} maxLength={120} placeholder="e.g. Amaka Chukwu" />
        </label>
        <label>
          Email Address
          <input name="email" type="email" required maxLength={160} placeholder="you@example.com" />
          <small>Used to identify your nomination and to reach you about it.</small>
        </label>
        <fieldset className="nomination-lrcn-choice">
          <legend>Are you LRCN certified?</legend>
          <label>
            <input
              type="radio"
              name="lrcnCertified"
              value="yes"
              checked={certified === "yes"}
              onChange={() => setCertified("yes")}
              required
            />
            Yes
          </label>
          <label>
            <input
              type="radio"
              name="lrcnCertified"
              value="no"
              checked={certified === "no"}
              onChange={() => setCertified("no")}
            />
            No
          </label>
        </fieldset>
        {certified === "yes" && (
          <label>
            LRCN Registration Number
            <input name="lrcnNumber" required minLength={3} maxLength={60} placeholder="e.g. LRCN/2019/04471" />
          </label>
        )}
        <label>
          Position You Are Contesting
          <select name="positionId" required defaultValue="">
            <option value="" disabled>
              Select position
            </option>
            {positions.map((position) => (
              <option value={position.id} key={position.id}>
                {position.title}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="button wide" disabled={busy || !positions.length}>
          {busy ? "Starting…" : "Start Nomination"}
          <ArrowRight />
        </button>
        <small>
          Everything you type is saved automatically. If you have started this
          form before, entering the same email address brings all your saved
          answers straight back.
        </small>
      </form>

    </section>
  );
}


/**
 * Two guarantors are required. The candidate supplies only a name and an email
 * address for each; every other guarantor detail is filled in by the guarantor
 * themselves through a private link emailed on submission.
 */
function GuarantorFields({
  guarantors,
  onChange,
}: {
  guarantors: { name: string; email: string }[];
  onChange: (next: { name: string; email: string }[]) => void;
}) {
  function update(index: number, key: "name" | "email", value: string) {
    onChange(guarantors.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  }
  return (
    <div className="guarantor-fields">
      <h2>Guarantors</h2>
      <p>
        Provide two guarantors. When you submit this form, each one receives an
        email with a private link to supply their institution, phone number,
        letter of recommendation. You cannot complete their
        sections on their behalf.
      </p>
      {guarantors.map((item, index) => (
        <fieldset key={index}>
          <legend>Guarantor {index + 1} *</legend>
          <div className="nomination-two">
            <label>
              Full Name
              <input
                value={item.name}
                onChange={(event) => update(index, "name", event.target.value)}
                placeholder="e.g. Dr. Bola Adeyemi"
                maxLength={120}
              />
            </label>
            <label>
              Email Address
              <input
                type="email"
                value={item.email}
                onChange={(event) => update(index, "email", event.target.value)}
                placeholder="guarantor@example.com"
                maxLength={160}
              />
            </label>
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function NominationShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="nomination-page">
      <header>
        <div className="nomination-logo">
          <Image
            src="/nla-osun-logo.png"
            width={64}
            height={64}
            alt="Nigerian Library Association logo"
            priority
          />
          <span>
            <b>NLA Osun State Chapter</b>
            <small>CEC Election — Nomination Portal</small>
          </span>
        </div>
        <div>
          <span>
            <LockKeyhole />
            Secure Nomination
          </span>
          <span>
            <CheckCircle2 />
            Official electoral process
          </span>
        </div>
      </header>
      {children}
      <footer>
        <Image
          className="nomination-footer-logo"
          src="/nla-osun-logo.png"
          width={32}
          height={32}
          alt="Nigerian Library Association logo"
        />
        © 2026 NLA Osun State Chapter · Election Committee{" "}
        <span>
          <LockKeyhole />
          Your information is protected and handled confidentially.
        </span>
      </footer>
    </div>
  );
}
function NominationDeadline({
  expiresAt,
  enabled,
}: {
  expiresAt: string;
  enabled: boolean;
}) {
  const deadline = new Date(expiresAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  if (!enabled || !expiresAt) return null;
  const totalSeconds = Math.max(
    0,
    Math.floor((deadline.getTime() - now) / 1_000),
  );
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return (
    <aside className="nomination-deadline" aria-live="polite">
      <Clock3 />
      <div>
        <strong>Time remaining to complete this form</strong>
        <small>
          {deadline.toLocaleString("en-NG", {
            timeZone: "Africa/Lagos",
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })} WAT
        </small>
      </div>
      <div className="countdown-display">
        <div className="countdown-unit">
          <span className="countdown-number">{String(hours).padStart(2, "0")}</span>
          <span className="countdown-label">HRS</span>
        </div>
        <div className="countdown-unit">
          <span className="countdown-number">{String(minutes).padStart(2, "0")}</span>
          <span className="countdown-label">MIN</span>
        </div>
        <div className="countdown-unit">
          <span className="countdown-number">{String(seconds).padStart(2, "0")}</span>
          <span className="countdown-label">SEC</span>
        </div>
      </div>
    </aside>
  );
}
function NominationSteps({ step }: { step: number }) {
  return (
    <div className="nomination-steps">
      {["Candidate Information", "Candidate Profile", "Documents & Review"].map(
        (label, index) => (
          <div className={step >= index + 1 ? "active" : ""} key={label}>
            <b>{index + 1}</b>
            <span>{label}</span>
          </div>
        ),
      )}
    </div>
  );
}
function TextCount({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-count">
      {label}
      <textarea
        value={value}
        minLength={min}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${min}–${max} characters`}
      />
      <small className={value.length < min ? "short" : ""}>
        {value.length} / {max}{" "}
        {value.length < min && `· ${min - value.length} more required`}
      </small>
    </label>
  );
}
function FileUpload({
  title,
  note,
  name,
  onFile,
  preview,
}: {
  title: string;
  note: string;
  name: string | null;
  onFile: (file?: File) => void;
  preview?: string | null;
}) {
  return (
    <label className="nomination-upload">
      <strong>{title}</strong>
      <span>
        {name ? (
          <>
            <Check /> {name}
          </>
        ) : (
          <>
            <Upload />
            Drag and drop or click to browse
          </>
        )}
      </span>
      <small>{note}</small>
      <input
        type="file"
        accept=".pdf,image/png,image/jpeg"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {preview && (
        <Image
          unoptimized
          src={preview}
          width={90}
          height={90}
          alt="Passport preview"
        />
      )}
    </label>
  );
}
function NominationReceipt({ receipt }: { receipt: Receipt }) {
  return (
    <NominationShell>
      <main className="nomination-receipt">
        <div className="receipt-toolbar">
          <button onClick={() => window.print()}>
            <Download />
            Download / Print PDF
          </button>
        </div>
        <section aria-label="Email delivery status">
          <p>{receipt.candidateEmail?.sent
            ? "Your acknowledgement email has been sent."
            : "Your nomination is saved, but the acknowledgement email was not sent. Please keep this receipt."}</p>
          {receipt.guarantors?.map((person, index) => (
            <p key={index}>{person.name}: {person.sent
              ? "Guarantor invitation sent."
              : "Invitation could not be sent. Contact the Election Committee to resend it."}</p>
          ))}
        </section>
        <section>
          <header>
            <div>
              <Image
                className="receipt-brand-logo"
                src="/nla-osun-logo.png"
                width={56}
                height={56}
                alt="Nigerian Library Association logo"
              />
              <span>
                <b>NLA Osun State Chapter</b>
                <small>Candidate Nomination Acknowledgement</small>
              </span>
            </div>
            <strong>PENDING REVIEW</strong>
          </header>
          <div className="receipt-profile">
            {receipt.passportData && (
              <Image
                unoptimized
                src={receipt.passportData}
                width={180}
                height={180}
                alt={`${receipt.candidateName} passport`}
              />
            )}
            <div>
              <small>CANDIDATE</small>
              <h1>{receipt.candidateName}</h1>
              <p>{receipt.position}</p>
              <b>{receipt.receipt}</b>
            </div>
          </div>
          <dl>
            <div>
              <dt>Email</dt>
              <dd>{receipt.email}</dd>
            </div>
            <div>
              <dt>LRCN Certified</dt>
              <dd>{receipt.lrcnCertified ? `Yes — ${receipt.lrcnNumber}` : "No"}</dd>
            </div>
            <div>
              <dt>Current Position</dt>
              <dd>{receipt.currentPosition}</dd>
            </div>
            <div>
              <dt>Phone Number</dt>
              <dd>{receipt.phone}</dd>
            </div>
            <div>
              <dt>Permanent Home Address</dt>
              <dd>{receipt.permanentAddress}</dd>
            </div>
            <div>
              <dt>PKA</dt>
              <dd>{receipt.pka}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>
                {new Date(receipt.submittedAt).toLocaleString("en-NG", {
                  timeZone: "Africa/Lagos",
                })}{" "}
                WAT
              </dd>
            </div>
          </dl>
          <article>
            <h2>Campaign Slogan</h2>
            <p>{receipt.tagline}</p>
            <h2>Biography</h2>
            <p>{receipt.biography}</p>
            <h2>Manifesto</h2>
            <p>{receipt.manifesto}</p>
            <h2>Mission</h2>
            <p>{receipt.mission}</p>
            <h2>Vision</h2>
            <p>{receipt.vision}</p>
            <h2>Top Priorities</h2>
            <ol>
              {receipt.priorities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </article>
          <footer>
            <Check />
            Nomination submitted for Electoral Commission review. Approval will
            publish the candidate automatically. This acknowledgement excludes
            confidential supporting documents.
          </footer>
        </section>
      </main>
    </NominationShell>
  );
}
