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
import { useEffect, useState } from "react";

type Draft = {
  phone: string;
  level: string;
  cgpa: string;
  permanentAddress: string;
  pka: string;
  tagline: string;
  biography: string;
  manifesto: string;
  mission: string;
  vision: string;
  priorities: string[];
  passportData: string | null;
  passportName: string | null;
  studentIdData: string | null;
  studentIdName: string | null;
  transcriptData: string | null;
  transcriptName: string | null;
  signatureData: string | null;
  signatureName: string | null;
  declarationsAccepted: boolean;
};
type Invite = {
  candidateName: string;
  matriculationNumber: string;
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
  matriculationNumber: string;
  position: string;
  level: string;
  cgpa: string;
  permanentAddress: string;
  phone: string;
  pka: string;
  passportData: string;
  tagline: string;
  biography: string;
  manifesto: string;
  mission: string;
  vision: string;
  priorities: string[];
  submittedAt: string;
};
type LinkState = { title: string; message: string; redirect: boolean };
const blank: Draft = {
  phone: "",
  level: "",
  cgpa: "",
  permanentAddress: "",
  pka: "",
  tagline: "",
  biography: "",
  manifesto: "",
  mission: "",
  vision: "",
  priorities: ["", "", ""],
  passportData: null,
  passportName: null,
  studentIdData: null,
  studentIdName: null,
  transcriptData: null,
  transcriptName: null,
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
async function responseBody(response: Response) {
  const text = await response.text();
  if (!text)
    return {
      message: response.ok
        ? ""
        : "The server did not return a response. Please try again.",
    };
  try {
    return JSON.parse(text);
  } catch {
    return {
      message: "The server returned an invalid response. Please try again.",
    };
  }
}

export function NominationPortal({ token }: { token: string }) {
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
        const response = await fetch(`/api/nominations/${token}`, {
          signal: controller.signal,
        });
        const body = await responseBody(response);
        if (cancelled) return;
        if (response.status === 503 && attempt < 4) {
          timers.push(window.setTimeout(() => load(attempt + 1), 3000));
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
        setData({
          ...blank,
          ...inviteBody.draft,
          priorities: [
            ...(inviteBody.draft.priorities ?? []),
            "",
            "",
            "",
          ].slice(0, 3),
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
  }, [router, token]);
  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setData((current) => ({ ...current, [key]: value }));
    setNotice("");
    setError("");
  }
  async function attach(
    key: "passport" | "studentId" | "transcript" | "signature",
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
      const pathname = `nominations/${invite.uploadId}/${key}/${Date.now()}-${safeUploadName(file.name)}`;
      const authorizationResponse = await fetch(
        `/api/nominations/${token}/upload`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pathname,
            field: key,
            contentType: file.type,
            size: file.size,
          }),
        },
      );
      const authorization = await responseBody(authorizationResponse);
      if (!authorizationResponse.ok || !authorization.presignedUrl)
        throw new Error(
          authorization.message || "Upload authorization failed.",
        );
      const uploadResponse = await fetch(authorization.presignedUrl, {
        method: "PUT",
        headers: {
          "x-vercel-blob-access": "private",
          "x-content-type": file.type,
        },
        body: file,
      });
      const blob = await responseBody(uploadResponse);
      if (!uploadResponse.ok || !blob.url)
        throw new Error(blob.message || "File upload failed.");
      if (key === "passport") {
        if (passportPreview) URL.revokeObjectURL(passportPreview);
        setPassportPreview(URL.createObjectURL(file));
      }
      setData((current) => ({
        ...current,
        [`${key}Data`]: blob.url,
        [`${key}Name`]: file.name,
      }));
      setNotice(`${file.name} uploaded securely.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "File upload failed.");
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft(silent = false) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...data,
        declarationsAccepted: accepted.every(Boolean),
      };
      const response = await fetch(`/api/nominations/${token}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(body.message || "Draft could not be saved. Please try again.");
        return false;
      }
      if (!silent) setNotice("Draft saved securely.");
      return true;
    } catch {
      setError(
        "Could not reach the nomination server. Check your connection and try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function next() {
    setError("");
    if (
      step === 1 &&
      (!data.phone ||
        !data.level ||
        !data.cgpa ||
        data.permanentAddress.trim().length < 10 ||
        Number(data.cgpa) < 0 ||
        Number(data.cgpa) > 5)
    ) {
      setError(
        "Enter your phone number, permanent home address, CGPA (0.00–5.00), and select Part 1, Part 2 or Part 3.",
      );
      return;
    }
    if (step === 2) {
      const lengths = [
        data.manifesto.length,
        data.mission.length,
        data.vision.length,
      ];
      if (
        !data.passportData ||
        !data.pka.trim() ||
        !data.tagline ||
        data.biography.length < 50 ||
        lengths.some((length) => length < 400 || length > 1000) ||
        data.priorities.some((value) => value.trim().length < 2)
      ) {
        setError(
          "Add a passport, PKA, biography, slogan, three priorities, and ensure manifesto, mission and vision are each 400–1000 characters.",
        );
        return;
      }
    }
    if (await saveDraft(true)) setStep((value) => Math.min(3, value + 1));
  }
  async function submit() {
    setError("");
    if (busy) return;
    if (
      !data.studentIdData ||
      !data.transcriptData ||
      !data.signatureData ||
      !accepted.every(Boolean)
    ) {
      setError(
        "Upload the student ID, academic transcript and signature, then accept every declaration.",
      );
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/nominations/${token}`, {
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
                Matriculation Number
                <input value={invite.matriculationNumber} readOnly />
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
                Private: visible only to you, the Electoral Commission, and on
                your nomination printout.
              </small>
            </label>
            <label>
              CGPA *
              <input
                value={data.cgpa}
                onChange={(e) => field("cgpa", e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 4.25"
                maxLength={4}
              />
              <small>
                Private: shown only on this form, its printout, and to the
                Electoral Commission.
              </small>
            </label>
            <fieldset className="level-options">
              <legend>Current Part of Study *</legend>
              {["Part 1", "Part 2", "Part 3"].map((level) => (
                <label key={level}>
                  <input
                    type="radio"
                    name="level"
                    checked={data.level === level}
                    onChange={() => field("level", level)}
                  />
                  {level}
                </label>
              ))}
            </fieldset>
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
                  ? `/api/nominations/${token}/file?field=passport`
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
              title="Student ID Card or Any Means of Studentship Identification *"
              note="PDF, JPG or PNG · Max 4MB"
              name={data.studentIdName}
              onFile={(file) => attach("studentId", file)}
            />
            <FileUpload
              title="Academic Transcript *"
              note="PDF, JPG or PNG · Max 4MB"
              name={data.transcriptName}
              onFile={(file) => attach("transcript", file)}
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
                  <dt>Matriculation No.</dt>
                  <dd>{invite.matriculationNumber}</dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd>{invite.position.title}</dd>
                </div>
                <div>
                  <dt>Part</dt>
                  <dd>{data.level}</dd>
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
          <button
            type="button"
            className="save-draft"
            onClick={() => saveDraft()}
            disabled={busy}
          >
            <Save />
            Save Draft
          </button>
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

function NominationShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="nomination-page">
      <header>
        <div className="nomination-logo">
          <Image
            src="/naliss-logo.png"
            width={64}
            height={64}
            alt="NALISS logo"
            priority
          />
          <span>
            <b>NALISS</b>
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
          src="/naliss-logo.png"
          width={32}
          height={32}
          alt="NALISS logo"
        />
        © 2026 NALISS · CEC Election{" "}
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
        <section>
          <header>
            <div>
              <Image
                className="receipt-naliss-logo"
                src="/naliss-logo.png"
                width={56}
                height={56}
                alt="NALISS logo"
              />
              <span>
                <b>NALISS</b>
                <small>Candidate Nomination Acknowledgement</small>
              </span>
            </div>
            <strong>PENDING REVIEW</strong>
          </header>
          <div className="receipt-profile">
            <Image
              unoptimized
              src={receipt.passportData}
              width={180}
              height={180}
              alt={`${receipt.candidateName} passport`}
            />
            <div>
              <small>CANDIDATE</small>
              <h1>{receipt.candidateName}</h1>
              <p>{receipt.position}</p>
              <b>{receipt.receipt}</b>
            </div>
          </div>
          <dl>
            <div>
              <dt>Matriculation Number</dt>
              <dd>{receipt.matriculationNumber}</dd>
            </div>
            <div>
              <dt>Part of Study</dt>
              <dd>{receipt.level}</dd>
            </div>
            <div>
              <dt>CGPA</dt>
              <dd>{receipt.cgpa}</dd>
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
