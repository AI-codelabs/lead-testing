import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingNav } from "@/components/leadlogr/marketing-nav";
import { MarketingFooter } from "@/components/leadlogr/marketing-footer";
import { PipelinePreview } from "@/components/leadlogr/pipeline-preview";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Leadlogr — The infrastructure for agency attribution" },
      {
        name: "description",
        content:
          "Capture every lead, track every status change, and feed conversion data back to Google and Meta automatically. Built for performance marketing agencies.",
      },
      { property: "og:title", content: "Leadlogr — The infrastructure for agency attribution" },
      {
        property: "og:description",
        content: "Bridge ad spend and closed revenue with a closed-loop CRM and CAPI sync.",
      },
    ],
  }),
  component: LandingPage,
});

const integrations = ["Google Ads", "Meta Ads", "HubSpot", "Salesforce", "TikTok Business"];

const valueProps = [
  { title: "Lead Governance", body: "Centralize disparate lead sources into a single verifiable system of record for every client account." },
  { title: "CAPI Synchronization", body: "Send offline conversion signals back to Meta and Google without writing a line of API code." },
  { title: "Agency Reporting", body: "Prove marketing ROI with data pulled directly from the client's real sales pipeline." },
];

const steps = [
  { n: "01", title: "Lead Captured", body: "Leadlogr captures gclid, fbclid, and UTM parameters automatically on form submission." },
  { n: "02", title: "Sales Outcome", body: "Mark leads as Qualified or Closed-Won inside the pipeline, or sync from your existing CRM." },
  { n: "03", title: "Auto-Feedback", body: "Conversion value is sent back to ad platforms so their algorithms optimize on real revenue.", highlight: true },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNav />

      <section id="product" className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col items-center text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted ring-1 ring-black/5 mb-8">
              <div className="size-1.5 rounded-full bg-brand-accent animate-pulse" />
              <span className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground">
                Now integrated with Google CAPI
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.05] text-balance max-w-[18ch] mb-6">
              The infrastructure for agency attribution
            </h1>
            <p className="text-muted-foreground text-base md:text-lg text-pretty max-w-[56ch] mb-10">
              Bridge the gap between advertising spend and closed revenue. Leadlogr captures every lead, tracks every status change, and feeds conversion data back to ad platforms automatically.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
              <Link to="/signup" className="bg-primary text-primary-foreground text-sm font-medium px-5 py-2.5 rounded-md ring-1 ring-primary shadow-sm hover:opacity-90 transition-opacity">
                Start free
              </Link>
              <a href="#loop" className="text-sm font-medium px-5 py-2.5 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors">
                See how it works
              </a>
            </div>

            <div className="w-full max-w-5xl">
              <PipelinePreview />
            </div>
          </div>
        </div>
      </section>

      <section id="integrations" className="py-12 border-y border-border/60 bg-background">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-40">
            {integrations.map((name) => (
              <span key={name} className="text-sm font-semibold tracking-widest uppercase">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-12">
            {valueProps.map((p) => (
              <div key={p.title} className="flex flex-col gap-4">
                <div className="size-8 bg-muted rounded-lg ring-1 ring-black/5 flex items-center justify-center">
                  <div className="size-3 bg-foreground/50" />
                </div>
                <h3 className="text-xl font-semibold tracking-tight">{p.title}</h3>
                <p className="text-muted-foreground text-pretty max-w-[48ch]">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="loop" className="py-24 bg-muted/40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-card ring-1 ring-border rounded-2xl p-8 md:p-16">
            <div className="max-w-2xl mb-16">
              <h2 className="text-3xl font-semibold tracking-tight leading-tight mb-4 text-balance">
                The conversion feedback loop
              </h2>
              <p className="text-muted-foreground text-pretty max-w-[56ch]">
                Most agencies lose data the moment a lead moves from a form to a sales call. Leadlogr bridges that gap end-to-end.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {steps.map((s) => (
                <div key={s.n} className={`p-6 rounded-xl bg-background ring-1 ring-border ${s.highlight ? "border-l-2 border-brand-accent" : ""}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-widest mb-4 block ${s.highlight ? "text-brand-accent" : "text-muted-foreground"}`}>
                    Step {s.n}
                  </span>
                  <h4 className={`font-medium mb-2 ${s.highlight ? "text-brand-accent" : "text-foreground"}`}>
                    {s.title}
                  </h4>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-[52ch] mx-auto text-center">
            <p className="text-lg font-medium italic text-foreground text-pretty mb-6">
              "Leadlogr changed how we report to our high-ticket service clients. We finally have a closed-loop system that proves our ads generate revenue, not just clicks."
            </p>
            <div className="flex flex-col items-center">
              <div className="size-10 bg-muted ring-1 ring-border rounded-full mb-3" />
              <span className="text-sm font-semibold">Marcus Chen</span>
              <span className="text-xs text-muted-foreground">Director of Growth, Altria Media</span>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-primary text-primary-foreground rounded-3xl p-12 md:p-24 text-center overflow-hidden relative">
            <h2 className="text-3xl md:text-5xl font-medium tracking-tight leading-tight mb-8 text-balance max-w-[20ch] mx-auto">
              Start tracking high-intent conversions today
            </h2>
            <Link to="/signup" className="inline-block bg-background text-foreground text-sm font-medium px-8 py-3 rounded-md ring-1 ring-background hover:opacity-90 transition-all active:scale-95">
              Scale your agency
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
