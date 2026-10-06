import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, List, Section } from "@/components/leadlogr/legal-page";
import { COMPANY } from "@/lib/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Leadlogr" },
      {
        name: "description",
        content: "The terms under which Leadlogr may be used, and what each side is responsible for.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms govern use of Leadlogr. They describe what the service does, what you are responsible for, and what we are."
    >
      <Section heading="Who you are contracting with">
        <p>
          Leadlogr is provided by <strong>{COMPANY.legalName}</strong>, registered in{" "}
          {COMPANY.country} under {COMPANY.registrationNumber}, at {COMPANY.address}. "We" and "us"
          mean that company; "you" means the organisation whose workspace is in use.
        </p>
      </Section>

      <Section heading="What the service does">
        <p>
          Leadlogr records leads submitted through your website, keeps the advertising click they
          arrived from attached to them, lets you move them through a pipeline, and reports the
          outcome back to advertising platforms you have connected.
        </p>
        <p>
          It is not a campaign management tool. It does not create, edit or control advertising
          campaigns, budgets or bids.
        </p>
      </Section>

      <Section heading="Accounts and workspaces">
        <p>
          A workspace belongs to the organisation that owns it. You are responsible for who you
          invite and what they can do, and for keeping sign-in credentials secure.
        </p>
        <p>
          Where an agency manages a workspace on your behalf, the workspace remains yours. You
          choose how much of it the agency can see, and you may remove their access at any time.
          An agency may build a workspace before handing it over; once you accept, you own it.
        </p>
      </Section>

      <Section heading="What you are responsible for">
        <p>
          You decide what data your forms collect and why, which makes you the controller of it.
          In particular:
        </p>
        <List
          items={[
            <>
              You must have a lawful basis for collecting the data you send us, and must tell the
              people it concerns, in your own privacy notice.
            </>,
            <>
              You must operate a working consent mechanism on any site using our tracking script
              where the law requires one. Our script reads the consent state it finds; it is not a
              substitute for obtaining consent.
            </>,
            <>
              You must not use Leadlogr to collect special categories of personal data — health,
              biometric, political, religious or similar — or data about children.
            </>,
            <>
              You must comply with the terms of any advertising platform you connect, including
              their policies on what customer data may be uploaded.
            </>,
          ]}
        />
      </Section>

      <Section heading="What we will not do">
        <p>
          We do not sell your data or your leads' data, we do not share it with other customers,
          and we do not use it to train machine learning models. Workspaces are separated at the
          database level, not only in the interface.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>
          Do not use Leadlogr to send unsolicited messages, to disguise where data came from, to
          attempt access to another customer's workspace, to probe or overload the service, or for
          anything unlawful. We may suspend a workspace that does, and will tell the owner why.
        </p>
      </Section>

      <Section heading="Availability">
        <p>
          We work to keep Leadlogr available and will give notice of planned maintenance where we
          can, but we do not currently offer a service level agreement, and the service is provided
          as it stands. Third-party platforms we connect to can change or restrict their interfaces
          without notice, which may interrupt the features that depend on them.
        </p>
        <p>
          Advertising platforms accept conversions only within their own time limits — Google Ads
          generally will not accept one older than about ninety days. Leadlogr shows you how long a
          lead has left, but cannot report an outcome after the platform stops accepting it.
        </p>
      </Section>

      <Section heading="Fees">
        <p>
          Paid plans are not yet in operation. When charging begins we will give at least thirty
          days' notice to existing account holders before any fee applies to them, and these terms
          will be updated to set out the billing arrangements.
        </p>
      </Section>

      <Section heading="Your data, and leaving">
        <p>
          Your data remains yours. You can export your leads to CSV at any time while your
          workspace is active, and we would encourage you to do so before closing it.
        </p>
        <p>
          You may stop using Leadlogr whenever you like. Deleting a workspace deletes its leads,
          activity history, settings and connections. That cannot be undone.
        </p>
      </Section>

      <Section heading="Liability">
        <p>
          Nothing here limits liability that cannot lawfully be limited, including for death or
          personal injury caused by negligence, or for fraud.
        </p>
        <p>
          Otherwise, and so far as the law allows, we are not liable for lost profits, lost revenue
          or lost business opportunity, nor for advertising spend or bidding decisions made on the
          basis of data shown in Leadlogr. Attribution is an estimate, not an audited account.
        </p>
        <p>
          Our total liability in any twelve month period is limited to the fees you paid us in that
          period.
        </p>
      </Section>

      <Section heading="Changes to these terms">
        <p>
          We may update these terms. Where a change materially affects you we will give notice by
          email before it takes effect. Continuing to use Leadlogr after that date means the updated
          terms apply.
        </p>
      </Section>

      <Section heading="Governing law">
        <p>
          These terms are governed by the law of {COMPANY.country}, and the courts of{" "}
          {COMPANY.country} have exclusive jurisdiction, without affecting any mandatory consumer
          protection you may have where you live.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          {COMPANY.legalName}, {COMPANY.address}, {COMPANY.country}. {COMPANY.contactEmail}.
        </p>
      </Section>
    </LegalPage>
  );
}
