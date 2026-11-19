import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { COMPANY } from "@/lib/legal";
import { LandingIconSprite, Ic } from "@/components/landing/icon-sprite";
import { LivePipelineDemo } from "@/components/landing/live-pipeline-demo";
import { HowTabs } from "@/components/landing/how-tabs";
import { AgencyCalculator } from "@/components/landing/agency-calculator";
import "@/styles/landing.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Leadlogr: lead tracking for marketers and agencies" },
      {
        name: "description",
        content:
          "Track every form lead from the click to the closed deal and send each sale back to Google Ads and Meta with its value.",
      },
      { name: "theme-color", content: "#f7f8fa" },
      { property: "og:title", content: "Leadlogr: lead tracking for marketers and agencies" },
      {
        property: "og:description",
        content:
          "Track every form lead from the click to the closed deal and send each sale back to Google Ads and Meta with its value.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap",
      },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  { icon: "i-click", title: "Click capture", body: "Stores the click ID, UTM tags and landing page with every lead." },
  { icon: "i-board", title: "Pipeline", body: "Drag leads from New to Won. Each column shows count and value." },
  { icon: "i-send", title: "Ad signals", body: "Qualified and won leads go to Google Ads and Meta automatically." },
  { icon: "i-euro", title: "Deal values", body: "Add what a deal is worth, and your ads bid on value." },
  { icon: "i-file", title: "Signal log", body: "See every signal that went out, and retry the ones that failed." },
  { icon: "i-chart", title: "Revenue by campaign", body: "Spend next to revenue, with cost per qualified lead." },
  { icon: "i-sync", title: "CRM sync", body: "Keep working in HubSpot or Salesforce; stages sync in." },
  { icon: "i-clock", title: "Idle alerts", body: "Leads nobody followed up on are flagged after a few days." },
  { icon: "i-spark", title: "Ask Leadlogr", body: "Ask which campaign brings the cheapest customer, in plain words." },
] as const;

const WHY = [
  { icon: "i-euro", title: "Fixed monthly price", body: "Priced by leads, never by users." },
  { icon: "i-gift", title: "14 days free", body: "No card needed, stops by itself." },
  { icon: "i-code", title: "No developer needed", body: "One snippet or a GTM tag." },
  { icon: "i-undo", title: "Undo window", body: "Signals wait 60 seconds before sending." },
  { icon: "i-lock", title: "Hashed contact data", body: "Emails and phones are hashed first." },
  { icon: "i-shield", title: "Consent aware", body: "No ad consent, no signal." },
  { icon: "i-sync", title: "Keep your CRM", body: "HubSpot and Salesforce stay in charge." },
  { icon: "i-users", title: "Built for agencies", body: "All clients behind one login." },
] as const;

const FAQ = [
  {
    q: "How is this different from the Meta pixel?",
    a: "The pixel sees the form. Leadlogr sees what happened after it, the call and the signed deal, and sends that from our server.",
  },
  {
    q: "Do I need a developer?",
    a: "No. Paste one snippet or add the Leadlogr tag in Google Tag Manager. Connecting Google Ads and Meta takes two sign-ins.",
  },
  {
    q: "Can we keep working in HubSpot?",
    a: "Yes. Leadlogr reads the stage changes from your CRM and sends the signals. The pipeline is for teams without one.",
  },
  {
    q: "What if someone marks a lead won by mistake?",
    a: "Signals wait 60 seconds, so the move can be undone. Later corrections send an adjustment to Google Ads.",
  },
  {
    q: "When is agency commission paid?",
    a: "On the first of each month, for every client invoice paid in the month before.",
  },
] as const;

function Brand({ src, label }: { src: string; label: string }) {
  return (
    <span className="brand">
      <img src={src} alt="" />
      {label}
    </span>
  );
}

function LandingPage() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="ll-home">
      <LandingIconSprite />

      <header className="nav">
        <div className="wrap">
          <a className="logo" href="#top" aria-label="Leadlogr home">
            <b>Lead</b>logr
          </a>
          <nav aria-label="Main">
            <a href="#features">Product</a>
            <a href="#how">How it works</a>
            <a href="#agencies">Agencies</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <Link className="login" to="/login">
            Log in
          </Link>
          <Link className="btn btn-green btn-s" to="/signup">
            Try 14 days free
          </Link>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-h">
          <span className="shape s1" aria-hidden="true" />
          <span className="shape s2" aria-hidden="true" />
          <div className="wrap">
            <div>
              <span className="pill">
                <i aria-hidden="true" />
                For marketers and agencies
              </span>
              <h1 id="hero-h">
                Lead tracking that tells your ads <span>which leads paid</span>
              </h1>
              <p className="lede">
                Leadlogr keeps the click with every form lead. Mark a lead as won and Google Ads and
                Meta learn about the sale and its value, so your budget goes to people who buy.
              </p>
              <ul className="checks">
                <li>
                  <span className="tick">
                    <Ic id="i-check" />
                  </span>
                  <span>
                    <b>Every click ID</b> – gclid, gbraid, fbclid and UTM on each lead
                  </span>
                </li>
                <li>
                  <span className="tick">
                    <Ic id="i-check" />
                  </span>
                  <span>
                    <b>Simple pipeline</b> – qualify a lead in two clicks
                  </span>
                </li>
                <li>
                  <span className="tick">
                    <Ic id="i-check" />
                  </span>
                  <span>
                    <b>Signals with value</b> – sent to Google Ads and Meta
                  </span>
                </li>
                <li>
                  <span className="tick">
                    <Ic id="i-check" />
                  </span>
                  <span>
                    <b>Agency program</b> – up to 30% recurring commission
                  </span>
                </li>
              </ul>
              <div className="ctas">
                <Link className="btn btn-green" to="/signup">
                  Try 14 days free
                </Link>
                <a className="btn btn-white" href="#how">
                  <span className="play" aria-hidden="true">
                    <svg viewBox="0 0 12 12">
                      <path d="M2 1l9 5-9 5z" />
                    </svg>
                  </span>
                  See how it works · 15 sec
                </a>
              </div>
              <div className="assure">
                <span>
                  <Ic id="i-check" />
                  No credit card needed
                </span>
                <span>
                  <Ic id="i-check" />
                  Trial stops by itself
                </span>
              </div>
              <div className="facts">
                <div>
                  <strong>From €49</strong>
                  <span>
                    a month, <span className="g">no seat prices</span>
                  </span>
                </div>
                <div>
                  <strong>About 15 minutes</strong>
                  <span>to install with GTM</span>
                </div>
              </div>
            </div>
            <div className="shot">
              <video
                src="/concept/media/hero.mp4"
                poster="/concept/media/hero.jpg"
                muted
                playsInline
                loop
                autoPlay={!reduceMotion}
                controls={reduceMotion}
                preload="auto"
                aria-label="A lead moves from New to Qualified to Won; four signals go to Google Ads and Meta and the campaign's return rises from 4.2 to 4.6"
              />
              <div className="float">
                <span className="fi">
                  <Ic id="i-send" />
                </span>
                <div>
                  <b>Closed deal sent</b>
                  <span>€1,188 to Google Ads</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="strip" aria-label="Integrations">
          <div className="wrap">
            <span className="lbl">Sends signals to</span>
            <Brand src="/concept/icons/google-ads.svg" label="Google Ads" />
            <Brand src="/concept/icons/meta.svg" label="Meta" />
            <Brand src="/concept/icons/linkedin.svg" label="LinkedIn" />
            <Brand src="/concept/icons/tiktok.svg" label="TikTok" />
            <span className="lbl">· works with</span>
            <Brand src="/concept/icons/hubspot.svg" label="HubSpot" />
            <Brand src="/concept/icons/salesforce.svg" label="Salesforce" />
            <Brand src="/concept/icons/wordpress.svg" label="WordPress" />
            <Brand src="/concept/icons/zapier.svg" label="Zapier" />
          </div>
        </div>

        <section className="band white" id="features" aria-labelledby="feat-h">
          <div className="wrap">
            <div className="head">
              <h2 id="feat-h">Lead tracking and ad signals, made simple</h2>
              <p>Everything between the click and the invoice</p>
            </div>
            <div className="feat">
              {FEATURES.map((f) => (
                <div className="fcard" key={f.title}>
                  <span className="fi">
                    <Ic id={f.icon} />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
            <div className="more">
              <a className="btn btn-outline" href="#live">
                Try the live pipeline
              </a>
            </div>
          </div>
        </section>

        <section className="band" id="live" aria-labelledby="live-h">
          <div className="wrap">
            <div className="head">
              <h2 id="live-h">Move a lead and watch the signal go out</h2>
              <p>
                Pick a lead, click a stage. Qualified and Won send a conversion after a short undo
                window.
              </p>
            </div>
            <LivePipelineDemo />
          </div>
        </section>

        <section className="band white" id="how" aria-labelledby="how-h">
          <div className="wrap">
            <HowTabs />
          </div>
        </section>

        <section className="band" aria-labelledby="why-h">
          <div className="wrap">
            <div className="head">
              <h2 id="why-h">Why marketers choose Leadlogr</h2>
            </div>
            <div className="why">
              {WHY.map((w) => (
                <div className="wcard" key={w.title}>
                  <span className="fi">
                    <Ic id={w.icon} />
                  </span>
                  <h3>{w.title}</h3>
                  <p>{w.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="band white" id="agencies" aria-labelledby="ag-h">
          <div className="wrap ag">
            <div>
              <span className="pill">
                <i aria-hidden="true" />
                Partner program
              </span>
              <h2 id="ag-h" style={{ marginTop: 18 }}>
                Run every client from one login, and earn on each one
              </h2>
              <p className="lede">
                Invite a client, open their workspace in one click and spot broken tags before they
                do. When the client pays Leadlogr, you get a share every month.
              </p>
              <AgencyCalculator />
              <p style={{ marginTop: 18 }}>
                <Link className="btn btn-outline btn-s" to="/signup">
                  Start as an agency
                </Link>
              </p>
            </div>
            <video
              src="/concept/media/agency.mp4"
              muted
              playsInline
              loop
              autoPlay={!reduceMotion}
              controls={reduceMotion}
              preload="metadata"
              aria-label="Agency dashboard: a new client accepts the invite and the monthly commission rises from €185.75 to €210.50"
            />
          </div>
        </section>

        <section className="band" id="pricing" aria-labelledby="pr-h">
          <div className="wrap">
            <div className="head">
              <h2 id="pr-h">Simple pricing, 14 days free</h2>
              <p>Priced by leads a month. Cancel any time.</p>
            </div>
            <div className="plans">
              <div className="plan">
                <h3>Starter</h3>
                <p className="for">One location on Google Ads and Meta</p>
                <p className="amt">
                  €49<small> /month</small>
                </p>
                <ul>
                  <li>
                    <span className="tick">
                      <Ic id="i-check" />
                    </span>
                    300 leads a month
                  </li>
                  <li>
                    <span className="tick">
                      <Ic id="i-check" />
                    </span>
                    Pipeline and signal log
                  </li>
                  <li>
                    <span className="tick">
                      <Ic id="i-check" />
                    </span>
                    Google Ads and Meta
                  </li>
                  <li>
                    <span className="tick">
                      <Ic id="i-check" />
                    </span>
                    2 users
                  </li>
                </ul>
                <Link className="btn btn-white" to="/signup">
                  Try Starter
                </Link>
              </div>
              <div className="plan pick">
                <span className="tag">Most teams pick this</span>
                <h3>Growth</h3>
                <p className="for">Teams with a CRM or a sales desk</p>
                <p className="amt">
                  €99<small> /month</small>
                </p>
                <ul>
                  <li>
                    <span className="tick">
                      <Ic id="i-check" />
                    </span>
                    1,500 leads a month
                  </li>
                  <li>
                    <span className="tick">
                      <Ic id="i-check" />
                    </span>
                    Every ad platform
                  </li>
                  <li>
                    <span className="tick">
                      <Ic id="i-check" />
                    </span>
                    HubSpot, Salesforce and Zapier
                  </li>
                  <li>
                    <span className="tick">
                      <Ic id="i-check" />
                    </span>
                    Revenue by campaign
                  </li>
                  <li>
                    <span className="tick">
                      <Ic id="i-check" />
                    </span>
                    Unlimited users
                  </li>
                </ul>
                <Link className="btn btn-green" to="/signup">
                  Try 14 days free
                </Link>
              </div>
              <div className="plan">
                <h3>Scale</h3>
                <p className="for">Several locations or brands</p>
                <p className="amt">
                  €199<small> /month</small>
                </p>
                <ul>
                  <li>
                    <span className="tick">
                      <Ic id="i-check" />
                    </span>
                    5,000 leads a month
                  </li>
                  <li>
                    <span className="tick">
                      <Ic id="i-check" />
                    </span>
                    Locations and brands apart
                  </li>
                  <li>
                    <span className="tick">
                      <Ic id="i-check" />
                    </span>
                    BigQuery export and API
                  </li>
                  <li>
                    <span className="tick">
                      <Ic id="i-check" />
                    </span>
                    Setup done with you
                  </li>
                </ul>
                <Link className="btn btn-white" to="/signup">
                  Try Scale
                </Link>
              </div>
            </div>
            <p className="fine">Prices excluding VAT. Pay yearly and get two months free.</p>
          </div>
        </section>

        <section className="band white" id="faq" aria-labelledby="faq-h">
          <div className="wrap">
            <div className="head">
              <h2 id="faq-h">Frequently asked questions</h2>
            </div>
            <div className="faq">
              {FAQ.map((item, i) => (
                <details key={item.q} open={i === 0}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="close" aria-labelledby="close-h">
          <span className="shape s1" aria-hidden="true" />
          <span className="shape s2" aria-hidden="true" />
          <div className="wrap" style={{ position: "relative" }}>
            <h2 id="close-h">Start today and send your ads the leads that paid</h2>
            <p>Live in about 15 minutes · no credit card needed</p>
            <Link className="btn btn-green" to="/signup">
              Try 14 days free
            </Link>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div>
            <a className="logo" href="#top">
              <b>Lead</b>logr
            </a>
            <p style={{ marginTop: 12, maxWidth: "28ch" }}>
              Ad signals from real sales, for marketers and agencies.
            </p>
          </div>
          <div>
            <h3>Product</h3>
            <ul>
              <li>
                <a href="#features">Features</a>
              </li>
              <li>
                <a href="#live">Live pipeline</a>
              </li>
              <li>
                <a href="#pricing">Pricing</a>
              </li>
            </ul>
          </div>
          <div>
            <h3>Agencies</h3>
            <ul>
              <li>
                <a href="#agencies">Partner program</a>
              </li>
              <li>
                <Link to="/signup">Create agency account</Link>
              </li>
            </ul>
          </div>
          <div>
            <h3>Help</h3>
            <ul>
              <li>
                <a href="#faq">FAQ</a>
              </li>
              <li>
                <a href="#how">How it works</a>
              </li>
              <li>
                <Link to="/privacy">Privacy</Link>
              </li>
              <li>
                <Link to="/terms">Terms</Link>
              </li>
            </ul>
          </div>
          <div className="legal">
            <span>
              © {new Date().getFullYear()} {COMPANY.legalName}
            </span>
            <span>
              {COMPANY.address} · {COMPANY.registrationNumber}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
