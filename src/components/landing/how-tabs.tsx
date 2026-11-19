import { useEffect, useState } from "react";

const TABS = [
  {
    id: "t1",
    panel: "p1",
    title: "1. Capture the click",
    body: "One snippet or a GTM tag finds your forms and keeps the click with each lead.",
  },
  {
    id: "t2",
    panel: "p2",
    title: "2. Send the signal",
    body: "Every conversion is logged. A rejected one tells you why and can be sent again.",
  },
  {
    id: "t3",
    panel: "p3",
    title: "3. Report the revenue",
    body: "Spend from your ad accounts next to revenue from your pipeline.",
  },
] as const;

export function HowTabs() {
  const [active, setActive] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="how">
      <div>
        <h2 id="how-h">From the click to the invoice, in one record</h2>
        <div className="tabs" role="tablist" aria-label="How Leadlogr works">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              className="tab"
              role="tab"
              id={t.id}
              aria-selected={active === i}
              aria-controls={t.panel}
              tabIndex={active === i ? 0 : -1}
              type="button"
              onClick={() => setActive(i)}
              onKeyDown={(e) => {
                const d =
                  e.key === "ArrowDown" || e.key === "ArrowRight"
                    ? 1
                    : e.key === "ArrowUp" || e.key === "ArrowLeft"
                      ? -1
                      : 0;
                if (!d) return;
                e.preventDefault();
                setActive((prev) => (prev + d + TABS.length) % TABS.length);
              }}
            >
              <b>{t.title}</b>
              {t.body}
            </button>
          ))}
        </div>
      </div>
      <div className="screen">
        <div role="tabpanel" id="p1" aria-labelledby="t1" hidden={active !== 0}>
          <video
            src="/concept/media/capture.mp4"
            muted
            playsInline
            loop
            autoPlay={!reduceMotion}
            controls={reduceMotion}
            preload="metadata"
            aria-label="A trial form is sent and Leadlogr stores the source, campaign, gclid, landing page, first touch and consent"
          />
        </div>
        <div role="tabpanel" id="p2" aria-labelledby="t2" hidden={active !== 1}>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Lead</th>
                  <th>Platform</th>
                  <th>Event</th>
                  <th className="r">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>14:02</td>
                  <td>Jasper de Vries</td>
                  <td>Google Ads</td>
                  <td>Closed deal €1,188</td>
                  <td className="r ok">Delivered</td>
                </tr>
                <tr>
                  <td>14:02</td>
                  <td>Jasper de Vries</td>
                  <td>Meta</td>
                  <td>Purchase €1,188</td>
                  <td className="r ok">Delivered</td>
                </tr>
                <tr>
                  <td>11:47</td>
                  <td>Sanne Bakker</td>
                  <td>Google Ads</td>
                  <td>Qualified lead</td>
                  <td className="r bad">Click too old</td>
                </tr>
                <tr>
                  <td>11:48</td>
                  <td>Sanne Bakker</td>
                  <td>Google Ads</td>
                  <td>Qualified lead</td>
                  <td className="r ok">Delivered, hashed email</td>
                </tr>
                <tr>
                  <td>10:15</td>
                  <td>Thijs Hendriks</td>
                  <td>Meta</td>
                  <td>Lead · qualified</td>
                  <td className="r ok">Delivered</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div role="tabpanel" id="p3" aria-labelledby="t3" hidden={active !== 2}>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th className="r">Spend</th>
                  <th className="r">Qualified</th>
                  <th className="r">Revenue</th>
                  <th className="r">Return</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Search · BJJ Utrecht</td>
                  <td className="r">€1,240</td>
                  <td className="r">14</td>
                  <td className="r">€5,940</td>
                  <td className="r ok">4.8×</td>
                </tr>
                <tr>
                  <td>Meta · Kids classes</td>
                  <td className="r">€980</td>
                  <td className="r">9</td>
                  <td className="r">€3,168</td>
                  <td className="r">3.2×</td>
                </tr>
                <tr>
                  <td>PMax · Brand</td>
                  <td className="r">€620</td>
                  <td className="r">5</td>
                  <td className="r">€2,376</td>
                  <td className="r">3.8×</td>
                </tr>
                <tr>
                  <td>Meta · Self-defence</td>
                  <td className="r">€540</td>
                  <td className="r">2</td>
                  <td className="r">€0</td>
                  <td className="r bad">0.0×</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
