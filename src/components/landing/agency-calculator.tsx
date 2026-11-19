import { useMemo, useState } from "react";

const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const RATES = [0.2, 0.25, 0.3] as const;

export function AgencyCalculator() {
  const [clients, setClients] = useState(8);
  const [plan, setPlan] = useState(99);

  const tier = clients >= 15 ? 2 : clients >= 5 ? 1 : 0;
  const monthly = useMemo(() => clients * plan * RATES[tier], [clients, plan, tier]);
  const yearly = monthly * 12;

  return (
    <>
      <div className="tiers" aria-label="Commission tiers">
        {[
          { t: 0, rate: "20%", label: "1 to 4 clients" },
          { t: 1, rate: "25%", label: "5 to 14 clients" },
          { t: 2, rate: "30%", label: "15 or more" },
        ].map((row) => (
          <div key={row.t} className={`tier${tier === row.t ? " on" : ""}`} data-tier={row.t}>
            <b>{row.rate}</b>
            {row.label}
          </div>
        ))}
      </div>
      <div className="calc">
        <label htmlFor="c-n">
          <span>Paying clients</span>
          <output id="o-n" htmlFor="c-n">
            {clients}
          </output>
        </label>
        <input
          type="range"
          id="c-n"
          min={1}
          max={40}
          value={clients}
          onChange={(e) => setClients(Number(e.target.value))}
        />
        <div className="seg" role="group" aria-label="Average client plan">
          {[
            { value: 49, label: "Starter €49" },
            { value: 99, label: "Growth €99" },
            { value: 199, label: "Scale €199" },
          ].map((p) => (
            <button
              key={p.value}
              type="button"
              data-plan={p.value}
              aria-pressed={plan === p.value}
              onClick={() => setPlan(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="earn">
          <div>
            <strong id="o-m">{eur(monthly)}</strong>
            <span>per month</span>
          </div>
          <div>
            <strong id="o-y">{eur(yearly)}</strong>
            <span>per year, while they stay</span>
          </div>
        </div>
      </div>
    </>
  );
}
