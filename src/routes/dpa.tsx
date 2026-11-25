import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, List, Section } from "@/components/leadlogr/legal-page";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal";

export const Route = createFileRoute("/dpa")({
  head: () => ({
    meta: [
      { title: "Data Processing Agreement — Leadlogr" },
      {
        name: "description",
        content:
          "Article 28 GDPR terms for personal data Leadlogr processes on behalf of its customers.",
      },
    ],
  }),
  component: DpaPage,
});

function DpaPage() {
  return (
    <LegalPage
      title="Data Processing Agreement"
      intro="This Data Processing Agreement (“DPA”) forms part of the agreement under which Leadlogr processes personal data on behalf of its business customers. Accepting the Terms of Service accepts this DPA; no separate signature is required unless you ask us for one."
    >
      <Section heading="1. Parties and roles">
        <p>
          Leadlogr is operated by <strong>{COMPANY.legalName}</strong>, established at{" "}
          {COMPANY.address}, {COMPANY.country}, registered under {COMPANY.registrationNumber}{" "}
          (“Leadlogr”, “we”, “us”). “Customer” means the organisation whose workspace uses the
          service.
        </p>
        <p>
          The Customer acts as <strong>controller</strong> where it determines the purposes and
          essential means of processing lead and related customer-controlled data. If the Customer
          is an agency acting for a separate controller, it represents that it has authority to
          appoint Leadlogr as a subprocessor and to give lawful instructions. Leadlogr acts as{" "}
          <strong>processor</strong> (or further processor) for that Customer Personal Data.
        </p>
        <p>
          Leadlogr remains an independent controller for its own account administration, support,
          security and legal-compliance activities, as described in the{" "}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>
          . Those activities are not converted into processor activities by this DPA.
        </p>
        <p>
          Where this DPA conflicts with the{" "}
          <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
            Terms of Service
          </Link>{" "}
          on the protection of Customer Personal Data, this DPA prevails. Mandatory law and any
          applicable Standard Contractual Clauses prevail where they conflict with this DPA.
        </p>
      </Section>

      <Section heading="2. Documented instructions">
        <p>
          We process Customer Personal Data only on the Customer’s documented instructions, unless
          Union or Member State law requires otherwise. The Terms, this DPA, the Customer’s service
          configuration, authorised connections and actions by authorised users constitute those
          instructions.
        </p>
        <p>
          We will inform the Customer if, in our opinion, an instruction infringes applicable data
          protection law, and may suspend the affected processing while the parties resolve it. We
          will not sell Customer Personal Data, use it to target unrelated customers, or use it to
          train unrelated general-purpose AI models. Google-sourced data remains subject to the
          Google API Services User Data Policy, including Limited Use where applicable.
        </p>
      </Section>

      <Section heading="3. Confidentiality and security">
        <p>
          Persons authorised to process Customer Personal Data are subject to confidentiality
          obligations. Access is limited to those with a legitimate operational need.
        </p>
        <p>
          Taking account of the state of the art, costs, nature and risks, we implement appropriate
          technical and organisational measures under Article 32 GDPR, including those in Schedule 2
          below. The Customer remains responsible for secure use of its account, user permissions,
          lawful configuration of tracking on its own sites, and the accuracy of data it submits.
        </p>
      </Section>

      <Section heading="4. Breaches and individual requests">
        <p>
          We will notify the Customer <strong>without undue delay</strong> after becoming aware of a
          personal data breach affecting Customer Personal Data, with the information reasonably
          available so the Customer can meet its own notification duties. Notification goes to the
          account contact email (or another contact the Customer designates).
        </p>
        <p>
          We will assist the Customer, insofar as possible, with requests from individuals to
          access, correct, erase, restrict, port or otherwise exercise their rights. If we receive a
          request directly about Customer Personal Data, we will refer it to the Customer where
          lawful and reasonably identifiable, rather than responding on the Customer’s behalf except
          as instructed or required by law.
        </p>
      </Section>

      <Section heading="5. Subprocessors">
        <p>
          The Customer gives general written authorisation to use the subprocessors listed in
          Schedule 3 (and in the Privacy Policy), solely as needed to provide or secure the service.
          We will give at least <strong>thirty days’ notice</strong> by email before adding or
          replacing a subprocessor, except for urgent security or legal replacements. The Customer
          may object on reasonable data-protection grounds; if we cannot resolve the objection, the
          Customer may end use of the service and export its data.
        </p>
        <p>
          We impose data-protection obligations on subprocessors no weaker than Article 28(3)
          requires, and remain responsible to the Customer for their performance. Advertising
          platforms the Customer chooses to connect (for example Google Ads or Meta) are
          customer-instructed recipients, not Leadlogr subprocessors for that purpose.
        </p>
      </Section>

      <Section heading="6. International transfers">
        <p>
          We will not transfer Customer Personal Data outside the EEA except on documented
          instructions or another lawful basis, with an adequacy decision, Standard Contractual
          Clauses, or another valid mechanism where required. Hosting of the application and
          database is in the European Union (Frankfurt). Transfers that leave the EEA under current
          configuration are described in Schedule 3 and the Privacy Policy.
        </p>
      </Section>

      <Section heading="7. Audits, return and deletion">
        <p>
          We will make available information reasonably necessary to demonstrate Article 28
          compliance and will contribute to audits under reasonable confidentiality and security
          arrangements. Independent reports or questionnaires will be considered first where they
          meet the Customer’s needs without exposing unrelated customer data.
        </p>
        <p>
          At the end of processing, following the Customer’s choice, we will return or delete
          Customer Personal Data and delete existing copies unless law requires storage. Practical
          timelines are in Schedule 4. Ending paid access alone does not erase data or remove
          scripts the Customer installed; the Customer must stop collection it no longer authorises.
        </p>
      </Section>

      <Section heading="8. Customer obligations">
        <List
          items={[
            <>
              Provide documented, lawful instructions; ensure collection and use of Customer Personal
              Data is lawful; give appropriate notices; and obtain any required cookie, tracking or
              advertising consent.
            </>,
            <>
              When connecting Google Ads or another platform, be authorised by the account owner and
              meet that platform’s rules for conversion or audience data.
            </>,
            <>
              Do not instruct Leadlogr to process special-category data, children’s data, or
              prohibited surveillance or enrichment, unless expressly agreed in writing with suitable
              safeguards.
            </>,
          ]}
        />
      </Section>

      <Section heading="9. Liability and governing law">
        <p>
          Liability under this DPA follows the liability provisions of the Terms of Service to the
          extent permitted by law. Nothing limits statutory rights of data subjects or supervisory
          authorities, or liabilities that cannot lawfully be restricted. This DPA is governed by
          the law of {COMPANY.country}, subject to mandatory data protection law and any governing-law
          rules of applicable Standard Contractual Clauses.
        </p>
        <p>
          For a separately signed copy, write to {COMPANY.contactEmail}. Privacy questions:{" "}
          {COMPANY.privacyEmail}.
        </p>
      </Section>

      <Section heading="Schedule 1 — Description of processing">
        <List
          items={[
            <>
              <strong>Subject matter.</strong> Providing Leadlogr: lead capture and organisation,
              attribution, reporting, and authorised advertising integrations including conversion
              uploads where configured.
            </>,
            <>
              <strong>Duration.</strong> For as long as the Customer’s workspace exists and any
              agreed export/deletion period in Schedule 4.
            </>,
            <>
              <strong>Nature.</strong> Collection, recording, organisation, hosting, storage,
              retrieval, matching, display, transmission to authorised recipients, export and
              erasure.
            </>,
            <>
              <strong>Purposes.</strong> Deliver customer-configured lead management, attribution,
              reporting and integrations, and to secure and support those functions. Leadlogr does
              not set an independent marketing purpose for customer-controlled lead data under this
              DPA.
            </>,
            <>
              <strong>Data subjects.</strong> Website visitors and people who submit forms;
              representatives of the Customer or its clients; other people whose information is
              lawfully submitted within the service.
            </>,
            <>
              <strong>Types of data.</strong> Contact and form fields as submitted; lead stage and
              notes; source/campaign attribution; UTM parameters; ad click identifiers; page and
              event metadata; consent signals; connected advertising-account identifiers, tokens and
              reporting totals where the Customer connects them. We do not store IP addresses.
            </>,
            <>
              <strong>Special-category data.</strong> Not required and not permitted unless expressly
              agreed in writing with safeguards.
            </>,
          ]}
        />
      </Section>

      <Section heading="Schedule 2 — Technical and organisational measures">
        <List
          items={[
            <>
              <strong>Hosting.</strong> Application and database in the European Union (Frankfurt);
              static assets may be cached worldwide.
            </>,
            <>
              <strong>Encryption.</strong> Data encrypted in transit and at rest.
            </>,
            <>
              <strong>Tenant separation.</strong> Enforced at the database level by workspace
              identity; the application cannot cross that boundary by interface mistake alone.
            </>,
            <>
              <strong>Least privilege.</strong> Narrow database roles — for example the collection
              endpoint can insert a lead but cannot read leads back; the interface role cannot read
              stored advertising authorisations.
            </>,
            <>
              <strong>OAuth tokens.</strong> Stored separately with access protections; disconnecting
              deletes the stored authorisation and revokes it with the provider where supported.
            </>,
            <>
              <strong>Access and incidents.</strong> Production access limited to those who need it;
              personal copies of customer data are not taken onto personal machines. Breaches
              affecting personal data are notified to affected customers and, where required, the
              Autoriteit Persoonsgegevens within legal timelines.
            </>,
          ]}
        />
      </Section>

      <Section heading="Schedule 3 — Approved subprocessors">
        <p>
          Register also published in the Privacy Policy. Change notice: email, at least 30 days in
          advance.
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
          Transfers outside the EEA for Resend, Google and Meta rely on the EU–US Data Privacy
          Framework where the recipient is certified, otherwise on the Commission’s Standard
          Contractual Clauses. Ask {COMPANY.privacyEmail} for the clauses that apply to you.
        </p>
      </Section>

      <Section heading="Schedule 4 — Retention, export and deletion">
        <List
          items={[
            <>
              <strong>Customer choices.</strong> Delete individual leads at any time (immediate).
              Delete the workspace to remove leads, activity history, settings and connections.
            </>,
            <>
              <strong>Standard retention.</strong> Lead and attribution records are kept while the
              workspace exists, because they are the Customer’s record of its own enquiries.
            </>,
            <>
              <strong>Google / ad reporting.</strong> Daily cost totals and selected account metadata
              remain while the connection and workspace exist; disconnecting removes the stored
              authorisation and stops further access.
            </>,
            <>
              <strong>Export.</strong> Leads can be exported to CSV while the workspace is active.
              Export before deletion; we cannot restore a deleted workspace.
            </>,
            <>
              <strong>Deletion requests.</strong> Via the product, or {COMPANY.privacyEmail}. Live
              system erasure follows the actions above. Provider backups expire on the provider’s
              normal schedule after live deletion.
            </>,
          ]}
        />
      </Section>
    </LegalPage>
  );
}
