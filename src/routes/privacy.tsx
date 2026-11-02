import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, List, Section } from "@/components/leadlogr/legal-page";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Leadlogr" },
      {
        name: "description",
        content: "What Leadlogr collects, why, who it is shared with, and how long it is kept.",
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
        <p>There are two different relationships, and they matter for your rights:</p>
        <List
          items={[
            <>
              <strong>For our customers' account data</strong> — the people who sign in to Leadlogr
              — we are the controller. We decide what we hold and why.
            </>,
            <>
              <strong>For lead data</strong> — the people who filled in a form on our customer's
              website — we are a processor. Our customer decides what is collected and why; we hold
              it on their instructions. If you submitted a form and want your data removed, contact
              the business whose site you used, or write to us and we will route it.
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
            <>
              Name, email address, telephone number and company name, where the form asks for them
            </>,
            <>
              The message or enquiry text, and any other fields the form contains, stored as
              submitted
            </>,
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
          <strong>We do not store IP addresses.</strong> No field in our database holds one, and our
          collection endpoint does not record one.
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
          A form submission is recorded in full. Someone who fills in a contact form is giving that
          business their details in order to be contacted, and the record we keep is that enquiry —
          the same information the business would hold if the form had arrived as an email.
          Recording it does not depend on a cookie banner, and the absence of one does not reduce
          what the business receives.
        </p>
        <p>
          Passing those details to an advertising platform is a different matter, and consent
          governs it. Our tracking script detects the consent management platform on the page and
          records what it found at the moment of submission. Where nothing can be found, we treat
          that as permission not given.
        </p>
        <p>
          <strong>
            Personal identifiers are only sent to an advertising platform when consent was given.
          </strong>{" "}
          When it was not, the conversion is still reported, but the email address and telephone
          number are not included in anything we send onward.
        </p>
        <p>
          Where personal identifiers are sent, they are hashed before transmission, and a lead is
          only reported to the advertising network the visit originated from. A visitor who did not
          arrive from a Google advertisement is not reported to Google.
        </p>
      </Section>

      <Section heading="Data from the Google account you connect">
        <p>
          A workspace can connect its Google Ads account so that outcomes are reported back to it.
          Connecting uses Google's own sign-in, so we never see or hold a Google password. This
          section describes what that permission gives us, because Google requires it to be stated
          plainly and because it is narrower than the permission screen suggests.
        </p>
        <p>
          <strong>What we access.</strong> Only what is needed to send conversions to the right
          place:
        </p>
        <List
          items={[
            <>
              The <strong>email address</strong> of the Google account used to connect. We ask
              Google for the basic profile that comes with signing in, but keep only the email
              address, and only so the person configuring the integration can see which account is
              connected.
            </>,
            <>
              The <strong>Google Ads accounts that account can reach</strong> — their names,
              numbers, currency, and which of them manage others. An agency's login reaches many
              client accounts, and without the structure we cannot show a usable list.
            </>,
            <>
              The <strong>conversion actions</strong> configured in the account you select, so you
              can choose which one each pipeline stage reports to.
            </>,
            <>
              The <strong>daily advertising cost total</strong> for the account you select, so spend
              can be shown beside the leads it produced.
            </>,
          ]}
        />
        <p>
          <strong>What we do not do.</strong> We do not read your campaigns, keywords, audiences,
          creatives or billing details. We do not create, edit, pause or budget anything. We do not
          read conversion data belonging to other tools. Nothing from your Google account is used to
          build profiles, to target advertising, to train machine learning models, or for any
          purpose other than the four above. It is never sold, and never shared with another
          customer or with any third party, including our other providers.
        </p>
        <p>
          <strong>What we send back.</strong> Only the conversions you have configured: the click
          identifier the visit arrived with, the stage reached, the value you recorded, and — where
          consent was given — the email address and telephone number, hashed before they leave us.
          We keep a record of each upload and Google's response so a failure can be explained.
        </p>
        <p>
          <strong>How it is stored.</strong> The authorization itself is held in a separate table
          that the database role behind the application has no permission to read at all, so a flaw
          in the interface cannot expose it. The connected email address, the account and conversion
          actions you selected, and the daily cost totals sit in your workspace's own records,
          separated from every other workspace at the database level. All of it is in the European
          Union, encrypted in transit and at rest.
        </p>
        <p>
          <strong>Who looks at it.</strong> Nobody, in the ordinary course. No member of our staff
          reads a workspace's Google data as a matter of routine; it is accessed only where you ask
          us to investigate something, and only for as long as that takes.
        </p>
        <p>
          Leadlogr's use of information received from Google APIs follows the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer noopener"
          >
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements.
        </p>
        <p>
          <strong>Taking it back.</strong> Disconnecting Google Ads in your settings deletes the
          stored authorization and tells Google to revoke it, so the permission ends rather than
          merely being forgotten. You can also remove it yourself at any time from{" "}
          <a
            href="https://myaccount.google.com/permissions"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer noopener"
          >
            your Google account's third-party access page
          </a>
          . Either way, conversion reporting stops immediately; leads already recorded are
          unaffected, because they are yours and were never Google's.
        </p>
      </Section>

      <Section heading="The same, for other platforms">
        <p>
          Meta, and any other advertising platform a workspace connects, works the same way: we take
          the minimum needed to identify the account and report conversions to it, we store the
          authorization with the same separation, and disconnecting removes it. Where a platform's
          own terms differ from this policy, we apply whichever is stricter.
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
              <strong>To run accounts</strong> — signing people in, sending invitations, and keeping
              workspaces separate. This is necessary to perform our contract with the customer.
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
          conversion data in the United States, and only where a workspace has connected them. Those
          transfers rely on the European Commission's adequacy decision for the EU–US Data Privacy
          Framework where the recipient is certified under it, and on the Commission's Standard
          Contractual Clauses otherwise. You can ask us for a copy of the clauses that apply to you.
        </p>
        <p>
          We do not sell personal data, we do not use lead data to train anything, and we make no
          decisions about anyone by automated means.
        </p>
      </Section>

      <Section heading="How it is kept safe">
        <p>
          Separation is enforced by the database rather than by the interface. Every workspace's
          rows carry its identity and the database refuses to return another workspace's, so a
          mistake in the application cannot cross that line. The roles the application uses are
          deliberately narrow: the one that accepts form submissions can insert a lead and is not
          permitted to read one back, and the one serving the interface cannot read a stored
          advertising authorization at all.
        </p>
        <p>
          Data is encrypted in transit and at rest. Access to production is limited to those who
          need it, and we do not take copies of customer data onto personal machines. No system is
          beyond failure, so if a breach ever affects personal data we will tell the affected
          customers and the Autoriteit Persoonsgegevens within the time the law allows.
        </p>
      </Section>

      <Section heading="This website itself">
        <p>
          leadlogr.com carries no advertising or analytics trackers. We do not set a cookie to
          follow you across sites, and there is nothing here to consent to, which is why you are not
          asked.
        </p>
        <p>
          Two things are stored in your browser. Whether you chose light or dark is remembered
          locally and never sent to us. If you sign in, a session cookie keeps you signed in; it is
          set by our authentication provider, is required for the service to work at all, and
          disappears when you sign out.
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
          portable copy, or object to processing. You can also complain to a supervisory authority —
          in the Netherlands, the Autoriteit Persoonsgegevens.
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
          {COMPANY.legalName}, {COMPANY.address}, {COMPANY.country}. For anything in this policy,
          including a request about your own data, write to {COMPANY.privacyEmail}.
        </p>
      </Section>
    </LegalPage>
  );
}
