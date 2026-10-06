import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, List, Section } from "@/components/leadlogr/legal-page";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Leadlogr" },
      {
        name: "description",
        content:
          "What Leadlogr collects, why, who it is shared with, and how long it is kept.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Leadlogr records the leads a website produces and reports their outcomes back to advertising platforms. That means we handle personal data belonging to people who contact our customers. This explains what we hold, why, and what happens to it."
    >
      <Section heading="Who is responsible">
        <p>
          Leadlogr is operated by <strong>{COMPANY.legalName}</strong>, registered in{" "}
          {COMPANY.country} under {COMPANY.registrationNumber}, at {COMPANY.address}.
        </p>
        <p>
          There are two different relationships, and they matter for your rights:
        </p>
        <List
          items={[
            <>
              <strong>For our customers' account data</strong> — the people who sign in to
              Leadlogr — we are the controller. We decide what we hold and why.
            </>,
            <>
              <strong>For lead data</strong> — the people who filled in a form on our customer's
              website — we are a processor. Our customer decides what is collected and why; we
              hold it on their instructions. If you submitted a form and want your data removed,
              contact the business whose site you used, or write to us and we will route it.
            </>,
          ]}
        />
      </Section>

      <Section heading="What we hold about leads">
        <p>
          When someone submits a form on a customer's website, our tracking script sends us the
          fields that form contained. Typically that is:
        </p>
        <List
          items={[
            <>Name, email address, telephone number and company name, where the form asks for them</>,
            <>The message or enquiry text, and any other fields the form contains, stored as submitted</>,
            <>
              The page the form was on, the landing page, the referring page, and the browser's
              user-agent string
            </>,
            <>
              Advertising identifiers that arrived with the visit — Google, Meta, Microsoft and
              LinkedIn click identifiers, campaign parameters, and analytics cookie identifiers
            </>,
            <>The consent state detected on the page at the moment of submission</>,
          ]}
        />
        <p>
          <strong>We do not store IP addresses.</strong> No field in our database holds one, and
          our collection endpoint does not record one.
        </p>
        <p>
          Because forms differ, anything a form contains that we do not recognise is kept verbatim
          alongside the recognised fields. Our customers control what their forms ask for, so they
          control what reaches us.
        </p>
      </Section>

      <Section heading="What we hold about customers">
        <p>
          For people with a Leadlogr account: name, email address, the workspace they belong to and
          their role in it, and a record of invitations sent and accepted. Passwords are stored only
          as a hash by our authentication provider and are never visible to us.
        </p>
      </Section>

      <Section heading="Consent, and what reaches advertising platforms">
        <p>
          Our tracking script detects the consent management platform on the page and records
          whether the visitor consented. Where no consent platform can be found at all, we treat
          that as consent not given.
        </p>
        <p>
          <strong>Personal identifiers are only sent to an advertising platform when consent was
          given.</strong> When it was not, a lead is still recorded for our customer, but the
          email address and telephone number are not included in anything we send onward.
        </p>
        <p>
          Where personal identifiers are sent, they are hashed before transmission, and a lead is
          only reported to the advertising network the visit originated from. A visitor who did not
          arrive from a Google advertisement is not reported to Google.
        </p>
      </Section>

      <Section heading="Why we hold it">
        <List
          items={[
            <>
              <strong>To provide the service</strong> — recording leads, showing them to our
              customer, and reporting outcomes back to advertising platforms, on our customer's
              instructions and under their lawful basis.
            </>,
            <>
              <strong>To run accounts</strong> — signing people in, sending invitations, and
              keeping workspaces separate. This is necessary to perform our contract with the
              customer.
            </>,
            <>
              <strong>To keep the service working and secure</strong> — diagnosing errors and
              preventing misuse, which is our legitimate interest in operating a reliable service.
            </>,
          ]}
        />
      </Section>

      <Section heading="Who else processes it">
        <p>
          We use the following providers. Each has access only to what their function requires, and
          each is bound by a data processing agreement.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-4 font-medium text-foreground">Provider</th>
                <th className="py-2 pr-4 font-medium text-foreground">Purpose</th>
                <th className="py-2 font-medium text-foreground">Region</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((p) => (
                <tr key={p.name} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-4 text-foreground">{p.name}</td>
                  <td className="py-2 pr-4">{p.purpose}</td>
                  <td className="py-2">{p.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Our database and application are hosted in the European Union. Google and Meta receive
          conversion data in the United States, and only where a workspace has connected them. We
          do not sell personal data, and we do not use lead data to train anything.
        </p>
      </Section>

      <Section heading="How long it is kept">
        <p>
          Lead data is kept for as long as the customer's workspace exists, because it is their
          record of their own enquiries. When a workspace is deleted, its leads, activity history
          and settings are deleted with it.
        </p>
        <p>
          Customers can delete individual leads at any time, and deletion is immediate rather than
          marked. Account records are removed when the account is closed.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          Under the GDPR you can ask for access to your data, correction, erasure, restriction, a
          portable copy, or object to processing. You can also complain to a supervisory authority
          — in the Netherlands, the Autoriteit Persoonsgegevens.
        </p>
        <p>
          If your data reached us through a form on someone else's website, that business decides
          what happens to it. Write to us at {COMPANY.privacyEmail} and we will pass the request on
          and tell you who it went to.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          When this policy changes materially we will tell account holders by email before the
          change takes effect. The date at the top shows when the wording last changed.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          {COMPANY.legalName}, {COMPANY.address}, {COMPANY.country}. Privacy enquiries:{" "}
          {COMPANY.privacyEmail}. General enquiries: {COMPANY.contactEmail}.
        </p>
      </Section>
    </LegalPage>
  );
}
