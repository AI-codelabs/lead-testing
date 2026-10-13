import { ShieldCheck } from "lucide-react";

/**
 * Sets expectations about consent before the customer installs the tracker.
 *
 * It used to warn that leads would arrive stripped of name and email when no
 * consent platform was found. That is no longer what happens: a form
 * submission is the visitor handing over their details to be contacted, so the
 * enquiry is recorded in full the same way it would be if it had gone to the
 * inbox. Consent now decides one thing only — whether those details may be
 * passed on to Google and Meta — so that is what this explains.
 */
export function ConsentNotice() {
  return (
    <div className="rounded-lg p-3 ring-1 ring-inset bg-stage-green-soft text-stage-green-ink ring-stage-green-line">
      <div className="flex gap-2.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-semibold">Every submission is recorded in full</p>
          <p className="text-xs leading-relaxed opacity-90">
            Name, email, phone, message and form answers are captured whether or not a
            consent platform is present. Someone filling in your form is giving you their
            details to be contacted, and this is a record of that enquiry.
          </p>
          <p className="text-xs leading-relaxed opacity-80">
            Consent still governs <strong>what leaves Leadlogr</strong>. Where it was not
            granted, conversions are still reported to your ad platforms, but the email
            address and phone number are not included in them.
          </p>
        </div>
      </div>
    </div>
  );
}
