import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/leadlogr/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/app/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Leadlogr" }] }),
  component: IntegrationsPage,
});

type IntegrationItem = {
  id: string;
  name: string;
  initials: string;
  description: string;
};

const incoming: IntegrationItem[] = [
  {
    id: "gtm",
    name: "Google Tag Manager",
    initials: "GTM",
    description:
      "Manage and deploy marketing tags without modifying code. Track conversions, site analytics, and remarketing with ease.",
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
];

function IntegrationCard({ item }: { item: IntegrationItem }) {
  return (
    <div className="bg-card ring-1 ring-border rounded-lg p-5 flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="size-10 rounded-md bg-muted ring-1 ring-border grid place-items-center">
          <span className="text-xs font-semibold">{item.initials}</span>
        </div>
      </div>
      <div className="flex-1">
        <h3 className="text-base font-semibold">{item.name}</h3>
        <p className="text-sm text-muted-foreground mt-1.5">{item.description}</p>
      </div>
      <button className="mt-5 text-sm font-medium px-3 py-2 rounded-md transition-colors bg-primary text-primary-foreground ring-1 ring-primary hover:opacity-90 cursor-pointer">
        Connect
      </button>
    </div>
  );
}

function IntegrationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Connections"
        title="Integrations"
        description="Connect Leadlogr to ad platforms, analytics tools, and the rest of your marketing stack."
      />

      <Tabs defaultValue="outgoing" className="mt-6">
        <TabsList>
          <TabsTrigger value="incoming">Incoming</TabsTrigger>
          <TabsTrigger value="outgoing">Outgoing</TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="mt-6">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {incoming.map((item) => (
              <IntegrationCard key={item.id} item={item} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="outgoing" className="mt-6">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {outgoing.map((item) => (
              <IntegrationCard key={item.id} item={item} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
