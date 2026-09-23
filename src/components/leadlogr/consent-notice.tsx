import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

/**
 * Explains what the tracker will do about consent, before the customer
 * installs it.
 *
 * Without this the default behaviour reads as data loss: with no consent
 * platform on the site, the tracker treats visitors as having declined and
 * strips every personal field, so leads arrive with a page and a click id but
 * no name or email. That is correct under GDPR and deliberate — but a customer
 * discovering it from empty rows will file a bug, not a legal question.
 */

const CMPS = [
  "Google Consent Mode v2",
  "IAB TCF v2",
  "Cookiebot",
  "OneTrust",
  "CookieYes",
  "Complianz",
];

export function ConsentNotice({
  allowConsentFallback,
  strictNoCmp = true,
}: {
  allowConsentFallback: boolean;
  /** Treat "no consent platform detected" as a refusal. On by default. */
  strictNoCmp?: boolean;
}) {
  // Three genuinely different outcomes, so the copy has to change with them.
  const mode = !strictNoCmp
    ? "permissive"
    : allowConsentFallback
      ? "anonymised"
      : "dropped";

  const COPY = {
    anonymised: {
      icon: ShieldAlert,
      tone: "bg-stage-amber-soft text-stage-amber-ink ring-stage-amber-line",
      title: "Leads arrive anonymised until a consent platform grants permission",
      body: (
        <>
          No consent platform is assumed to be present, so visitors are treated as having
          declined. Attribution still works — source, campaign, click IDs and landing page
          are all recorded — but <strong>name, email, phone, company, message and form
          answers are stripped</strong> before sending.
        </>
      ),
    },
    dropped: {
      icon: ShieldX,
      tone: "bg-stage-red-soft text-stage-red-ink ring-stage-red-line",
      title: "Leads are discarded entirely without consent",
      body: (
        <>
          With <em>Allow consent fallback</em> off, a visitor who has not granted consent is
          not recorded at all — not even anonymously. Strictest option, and the one that
          loses the most data.
        </>
      ),
    },
    permissive: {
      icon: ShieldCheck,
      tone: "bg-stage-green-soft text-stage-green-ink ring-stage-green-line",
      title: "Full details captured even with no consent platform present",
      body: (
        <>
          Personal details are sent whether or not a consent platform is detected. Only use
          this where you have a documented lawful basis — under GDPR, an absent consent
          banner is not consent.
        </>
      ),
    },
  }[mode];

  const Icon = COPY.icon;

  return (
    <div className={`rounded-lg p-3 ring-1 ring-inset ${COPY.tone}`}>
      <div className="flex gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-semibold">{COPY.title}</p>
          <p className="text-xs leading-relaxed opacity-90">{COPY.body}</p>

          {mode !== "permissive" && (
            <p className="text-xs leading-relaxed opacity-80">
              Full details are captured as soon as one of these grants permission:{" "}
              {CMPS.join(", ")}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
