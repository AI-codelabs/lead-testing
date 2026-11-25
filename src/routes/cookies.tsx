import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, List, Section } from "@/components/leadlogr/legal-page";
import { COMPANY } from "@/lib/legal";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — Leadlogr" },
      {
        name: "description",
        content:
          "Cookies and similar technologies used on leadlogr.com and in the Leadlogr application.",
      },
    ],
  }),
  component: CookiePolicyPage,
});

function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      intro="This explains the cookies and similar technologies used on Leadlogr’s own website and application, and how they differ from the tracking tools customers may install on their sites."
    >
      <Section heading="Who this covers">
        <p>
          Leadlogr is operated by <strong>{COMPANY.legalName}</strong>, registered in{" "}
          {COMPANY.country} under {COMPANY.registrationNumber}, at {COMPANY.address}. This policy
          covers leadlogr.com and the signed-in Leadlogr product. It should be read with our{" "}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
        <p>
          Cookies are small files stored on a device. Similar technologies include local or session
          storage and scripts that store or read information on a device. Cookie rules can apply to
          those technologies even where no conventional cookie file is created.
        </p>
      </Section>

      <Section heading="What we use on leadlogr.com">
        <p>
          leadlogr.com carries no advertising or analytics trackers. We do not set a cookie to
          follow you across sites, and there is currently nothing optional to consent to — which is
          why you are not shown a cookie banner.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-medium text-foreground">Name</th>
                <th className="py-2 pr-3 font-medium text-foreground">Provider</th>
                <th className="py-2 pr-3 font-medium text-foreground">Purpose</th>
                <th className="py-2 pr-3 font-medium text-foreground">Category</th>
                <th className="py-2 pr-3 font-medium text-foreground">Duration</th>
                <th className="py-2 font-medium text-foreground">Consent</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60 align-top">
                <td className="py-2 pr-3 text-foreground">Session authentication cookie</td>
                <td className="py-2 pr-3">Leadlogr / Neon Auth (Better Auth)</td>
                <td className="py-2 pr-3">
                  Keeps you signed in after login. Scoped to leadlogr.com via our auth proxy.
                </td>
                <td className="py-2 pr-3">Strictly necessary</td>
                <td className="py-2 pr-3">Session / until sign-out</td>
                <td className="py-2">No</td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="py-2 pr-3 text-foreground">
                  <code className="text-xs">leadlogr.theme</code>
                </td>
                <td className="py-2 pr-3">Leadlogr (localStorage)</td>
                <td className="py-2 pr-3">
                  Remembers light, dark or system appearance on this device. Never sent to our
                  servers.
                </td>
                <td className="py-2 pr-3">Preference (device-only)</td>
                <td className="py-2 pr-3">Until cleared</td>
                <td className="py-2">No</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          If we introduce optional analytics or marketing technologies later, they will appear in
          this inventory and will not run before a clear accept / reject choice where the law
          requires one.
        </p>
      </Section>

      <Section heading="Your choices">
        <List
          items={[
            <>
              Browser settings can delete or block cookies. Blocking the session cookie will prevent
              sign-in.
            </>,
            <>
              Clear site data or local storage to remove the theme preference; the site will fall
              back to the default appearance.
            </>,
            <>
              There is no cookie-preferences control today because we do not load non-essential
              tracking on our own properties.
            </>,
          ]}
        />
      </Section>

      <Section heading="Tools customers install on their websites">
        <p>
          Leadlogr provides a tracking script and related tools that customers may place on their
          own sites to record form submissions and attribution. The customer decides whether and
          where to install them, and must provide its own privacy and cookie notices and obtain any
          required consent before non-essential collection.
        </p>
        <p>
          A visitor to a customer site should read that business’s policies. Our site cookie banner
          (or the absence of one) does not grant consent for tracking on another company’s website.
          Processing of lead data on a customer’s behalf is governed by our{" "}
          <Link to="/dpa" className="underline underline-offset-2 hover:text-foreground">
            Data Processing Agreement
          </Link>
          .
        </p>
      </Section>

      <Section heading="Advertising integrations">
        <p>
          Customers may connect Google Ads, Meta or other platforms so conversions can be reported.
          Those API connections are not the same as browser cookies on leadlogr.com. Platform rules
          and the customer’s own consent duties still apply to anything sent onward.
        </p>
      </Section>

      <Section heading="Contact and updates">
        <p>
          Questions about cookies on Leadlogr’s own site: {COMPANY.privacyEmail}. Questions about
          tracking on another business’s site that uses Leadlogr: contact that business first; we
          will assist them under the DPA where required.
        </p>
        <p>
          We may update this policy when technologies or legal requirements change. The date at the
          top shows the latest revision.
        </p>
      </Section>
    </LegalPage>
  );
}
