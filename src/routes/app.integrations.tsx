import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/leadlogr/page-header";
import { IntegrationLogo } from "@/components/leadlogr/integration-logo";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/app/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Leadlogr" }] }),
  component: IntegrationsPage,
});

type IntegrationItem = {
  id: string;
  name: string;
  description: string;
  comingSoon?: boolean;
};

const incoming: IntegrationItem[] = [
  {
    id: "gtm",
    name: "Google Tag Manager",
    initials: "GTM",
    description:
      "Manage and deploy marketing tags without modifying code. Track conversions, site analytics, and remarketing with ease.",
  },
  {
    id: "wordpress",
    name: "WordPress",
    initials: "WP",
    description:
      "Capture leads directly from your WordPress site by installing our official plugin for effortless data synchronization.",
  },
  {
    id: "api",
    name: "REST API",
    initials: "API",
    description:
      "Integrate Leadlogr directly into your custom application or backend using our flexible and powerful REST API.",
  },
  {
    id: "zapier",
    name: "Zapier",
    initials: "Z",
    description:
      "Create multi-step workflows to automatically sync, update, and route lead data between Leadlogr and 5,000+ other apps.",
  },
];

const outgoing: IntegrationItem[] = [
  {
    id: "google-ads",
    name: "Google Ads",
    initials: "G",
    description:
      "Send conversion data to Google Ads to optimize campaigns and improve ROI. Track leads, purchases, and custom conversion events.",
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    initials: "GA",
    description:
      "Send enhanced conversion data to Google Analytics 4 to improve attribution and measurement accuracy across your marketing channels.",
  },
  {
    id: "meta-ads",
    name: "Meta Ads",
    initials: "M",
    description:
      "Send conversion events to Meta (Facebook & Instagram) for better campaign optimization and audience targeting across Meta platforms.",
  },
  {
    id: "microsoft-ads",
    name: "Microsoft Ads",
    initials: "M",
    description:
      "Track conversions in Microsoft Advertising (Bing Ads) to optimize your search campaigns and improve performance on the Microsoft network.",
  },
  {
    id: "linkedin-ads",
    name: "LinkedIn Ads",
    initials: "Li",
    description:
      "Feed lead conversion data back to LinkedIn to build more effective B2B audiences and optimize your ad spend.",
  },
  {
    id: "bigquery",
    name: "Google BigQuery",
    initials: "BQ",
    description:
      "Securely warehouse your lead data in Google BigQuery for advanced analytics and custom reporting.",
  },
  {
    id: "gtm-server",
    name: "GTM Server Container",
    initials: "SS",
    description:
      "Leverage server-side tracking to securely route lead data from Leadlogr to all your connected marketing platforms via GTM.",
  },
  {
    id: "tiktok-ads",
    name: "TikTok Ads",
    initials: "TT",
    description:
      "Sync lead data directly to TikTok to optimize your short-form video advertising campaigns and lead generation performance.",
    comingSoon: true,
  },
  {
    id: "reddit-ads",
    name: "Reddit Ads",
    initials: "R",
    description:
      "Export lead conversions to Reddit to optimize your ad spend and build more effective community-driven audiences.",
    comingSoon: true,
  },
  {
    id: "x-ads",
    name: "X Ads",
    initials: "X",
    description:
      "Send lead conversion events to X (Twitter) to enhance your advertising performance and audience insights.",
    comingSoon: true,
  },
  {
    id: "snapchat-ads",
    name: "Snapchat Ads",
    initials: "Sn",
    description:
      "Automatically sync lead conversion data to Snapchat to improve targeting and ROI for your mobile campaigns.",
    comingSoon: true,
  },
];

const updating: IntegrationItem[] = [
  {
    id: "pipedrive",
    name: "Pipedrive",
    initials: "Pd",
    description:
      "Automatically track lead conversion success by importing deal updates and activity tags from your Pipedrive sales pipeline.",
  },
  {
    id: "zoho",
    name: "Zoho CRM",
    initials: "Zo",
    description:
      "Maintain accurate lead lifecycle data by updating Leadlogr statuses based on your Zoho CRM deal stages and pipeline movements.",
  },
  {
    id: "odoo",
    name: "Odoo CRM",
    initials: "Od",
    description:
      "Sync Odoo CRM opportunity stage changes back to Leadlogr using webhook-based stage ID mapping.",
  },
  {
    id: "monday",
    name: "Monday.com",
    initials: "Mo",
    description:
      "Bridge your project management and lead tracking by syncing board updates and column statuses from Monday.com back to Leadlogr.",
  },
  {
    id: "clickup",
    name: "ClickUp",
    initials: "CU",
    description:
      "Sync lead progression by mapping your ClickUp task statuses and tags to automatically update lead qualification in Leadlogr.",
  },
  {
    id: "teamleader",
    name: "Teamleader",
    initials: "Tl",
    description:
      "Ensure your marketing data stays current by syncing customer status changes and milestone updates directly from Teamleader.",
  },
  {
    id: "recruitee",
    name: "Recruitee",
    initials: "Rc",
    description:
      "Keep your lead statuses in sync by automatically importing hiring stages and candidate tags directly from Recruitee.",
  },
];

function IntegrationCard({ item }: { item: IntegrationItem }) {
  return (
    <div className="bg-card ring-1 ring-border rounded-lg p-5 flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="size-10 rounded-md bg-muted ring-1 ring-border grid place-items-center">
          <span className="text-xs font-semibold">{item.initials}</span>
        </div>
        {item.comingSoon && (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 py-0.5 rounded ring-1 ring-border bg-muted/40">
            Coming soon
          </span>
        )}
      </div>
      <div className="flex-1">
        <h3 className="text-base font-semibold">{item.name}</h3>
        <p className="text-sm text-muted-foreground mt-1.5">{item.description}</p>
      </div>
      <button
        disabled={item.comingSoon}
        className="mt-5 text-sm font-medium px-3 py-2 rounded-md transition-colors bg-primary text-primary-foreground ring-1 ring-primary hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {item.comingSoon ? "Notify me" : "Connect"}
      </button>
    </div>
  );
}

function Grid({ items }: { items: IntegrationItem[] }) {
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map((item) => (
        <IntegrationCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function IntegrationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Connections"
        title="Integrations"
        description="Connect Leadlogr to ad platforms, analytics tools, CRMs, and the rest of your marketing stack."
      />

      <Tabs defaultValue="outgoing" className="mt-6">
        <TabsList>
          <TabsTrigger value="incoming">Incoming</TabsTrigger>
          <TabsTrigger value="outgoing">Outgoing</TabsTrigger>
          <TabsTrigger value="updating">Updating</TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="mt-6">
          <Grid items={incoming} />
        </TabsContent>

        <TabsContent value="outgoing" className="mt-6">
          <Grid items={outgoing} />
        </TabsContent>

        <TabsContent value="updating" className="mt-6">
          <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
            Sync lead status changes back into Leadlogr from your CRM or project management tool, so lead lifecycle data stays accurate everywhere.
          </p>
          <Grid items={updating} />
        </TabsContent>
      </Tabs>
    </>
  );
}
