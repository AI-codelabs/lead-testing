import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/leadlogr/page-header";
import { Check } from "lucide-react";

export const Route = createFileRoute("/app/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Leadlogr" }] }),
  component: IntegrationsPage,
});

type Integration = {
  name: string;
  category: string;
  description: string;
  status: "Connected" | "Available";
};

const integrations: Integration[] = [
  { name: "Google Ads", category: "Ad platform", description: "Send offline conversions back to Google Ads via the Conversions API.", status: "Connected" },
  { name: "Meta Ads", category: "Ad platform", description: "Sync Closed-Won events to Meta's Conversions API for ROAS optimization.", status: "Connected" },
  { name: "TikTok Business", category: "Ad platform", description: "Forward conversion events to TikTok's Events API.", status: "Available" },
  { name: "HubSpot", category: "CRM", description: "Two-way sync contacts, deals, and lifecycle stages with HubSpot.", status: "Available" },
  { name: "Salesforce", category: "CRM", description: "Map Leadlogr stages to Salesforce opportunities.", status: "Available" },
  { name: "Webhook", category: "Custom", description: "Receive a POST whenever a lead changes stage in Leadlogr.", status: "Connected" },
];

function IntegrationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Connections"
        title="Integrations"
        description="Connect Leadlogr to ad platforms, your CRM, and the rest of your marketing stack."
      />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {integrations.map((i) => (
          <div key={i.name} className="bg-card ring-1 ring-border rounded-lg p-5 flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="size-10 rounded-md bg-muted ring-1 ring-border grid place-items-center">
                <span className="text-xs font-semibold">{i.name.slice(0, 2).toUpperCase()}</span>
              </div>
              {i.status === "Connected" ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-success">
                  <Check className="size-3" /> Connected
                </span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Available
                </span>
              )}
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {i.category}
              </div>
              <h3 className="text-base font-semibold mt-1">{i.name}</h3>
              <p className="text-sm text-muted-foreground mt-1.5">{i.description}</p>
            </div>
            <button
              className={`mt-5 text-sm font-medium px-3 py-2 rounded-md transition-colors ${
                i.status === "Connected"
                  ? "ring-1 ring-border bg-card hover:bg-muted"
                  : "bg-primary text-primary-foreground ring-1 ring-primary hover:opacity-90"
              }`}
            >
              {i.status === "Connected" ? "Configure" : "Connect"}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
