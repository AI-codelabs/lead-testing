import { useEffect, useMemo, useRef, useState } from "react";

type Stage = "new" | "contacted" | "qualified" | "won";
type LogRow = [platform: string, event: string, sent: 0 | 1];

type DemoLead = {
  id: number;
  n: string;
  s: string;
  st: Stage;
  v: number;
  log: LogRow[];
};

const NAMES: Record<Stage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
};

const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");

const INITIAL: DemoLead[] = [
  { id: 1, n: "Jasper de Vries", s: "Free trial · Google Ads", st: "new", v: 0, log: [] },
  { id: 2, n: "Emma Peters", s: "Kids class · Meta", st: "contacted", v: 0, log: [] },
  {
    id: 3,
    n: "Sanne Bakker",
    s: "Membership · PMax",
    st: "qualified",
    v: 0,
    log: [
      ["Google Ads", "Qualified lead", 1],
      ["Meta", "Lead · qualified", 1],
    ],
  },
  { id: 4, n: "Lotte Mulder", s: "Free trial · Referral", st: "new", v: 0, log: [] },
  {
    id: 5,
    n: "Bram Willems",
    s: "Membership · Google Ads",
    st: "won",
    v: 1188,
    log: [
      ["Google Ads", "Closed deal · €1,188", 1],
      ["Meta", "Purchase · €1,188", 1],
    ],
  },
];

export function LivePipelineDemo() {
  const [leads, setLeads] = useState(() => INITIAL.map((l) => ({ ...l, log: l.log.map((r) => [...r] as LogRow) })));
  const [curId, setCurId] = useState(1);
  const [total, setTotal] = useState(14220);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [wonValue, setWonValue] = useState(1188);
  const timers = useRef<number[]>([]);

  const cur = useMemo(() => leads.find((l) => l.id === curId) ?? leads[0], [leads, curId]);

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  function move(to: Stage, value = 0) {
    if (!cur || to === cur.st) return;
    const leadId = cur.id;
    let evs: [string, string][] = [];
    if (to === "qualified") evs = [
      ["Google Ads", "Qualified lead"],
      ["Meta", "Lead · qualified"],
    ];
    if (to === "won")
      evs = [
        ["Google Ads", "Closed deal · " + eur(value)],
        ["Meta", "Purchase · " + eur(value)],
      ];

    const pending: LogRow[] = evs.map(([p, e]) => [p, e, 0]);

    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, st: to, v: to === "won" ? value : l.v, log: [...pending, ...l.log] }
          : l,
      ),
    );

    if (pending.length) {
      const t = window.setTimeout(() => {
        setLeads((prev) =>
          prev.map((l) => {
            if (l.id !== leadId) return l;
            const nextLog = l.log.map((row) => {
              const match = pending.find((p) => p[0] === row[0] && p[1] === row[1] && row[2] === 0);
              return match ? ([row[0], row[1], 1] as LogRow) : row;
            });
            return { ...l, log: nextLog };
          }),
        );
        if (to === "won") setTotal((n) => n + value);
      }, 2500);
      timers.current.push(t);
    }
  }

  function onStage(to: Stage) {
    if (to === "won" && cur?.st !== "won") {
      setWonValue(1188);
      setDlgOpen(true);
      return;
    }
    move(to);
  }

  return (
    <>
      <div className="app">
        <div className="app__bar">
          <i />
          <i />
          <i />
          <b>Pipeline</b>
          <span>· Renzo Gracie Holland</span>
        </div>
        <div className="pane">
          <div className="lp-head">
            <b>Leads this week</b>
            <span>{leads.length} leads</span>
          </div>
          <ul className="lp-list">
            {leads.map((l) => (
              <li key={l.id}>
                <button type="button" data-id={l.id} aria-pressed={l.id === cur?.id} onClick={() => setCurId(l.id)}>
                  <span className="n">{l.n}</span>
                  <span className="chip" data-s={l.st}>
                    {NAMES[l.st]}
                  </span>
                  <span className="s">{l.s}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="pane">
          <div className="lo">
            <div>
              <p className="lo-name">{cur?.n}</p>
              <p className="sub">
                {cur?.s}
                {cur?.v ? ` · ${eur(cur.v)}` : ""}
              </p>
            </div>
            <div className="stages" role="group" aria-label="Stage">
              {(["new", "contacted", "qualified", "won"] as Stage[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  data-to={st}
                  aria-pressed={cur?.st === st}
                  onClick={() => onStage(st)}
                >
                  {NAMES[st]}
                </button>
              ))}
            </div>
            <p className="sends">Qualified sends “Qualified lead”. Won sends “Closed deal” with the value.</p>
            <div className="log">
              <p className="lh">Signals for this lead</p>
              <ol aria-live="polite">
                {cur?.log.length ? (
                  cur.log.map(([p, e, ok], i) => (
                    <li key={`${p}-${e}-${i}`}>
                      <span className="p">{p}</span>
                      <span>{e}</span>
                      <span className={`st ${ok ? "ok" : ""}`}>{ok ? "✓ sent" : "undo window"}</span>
                    </li>
                  ))
                ) : (
                  <li className="empty">No signals yet. Move this lead to Qualified.</li>
                )}
              </ol>
            </div>
            <div className="tot">
              <span>Value sent back this month</span>
              <b className="num">{eur(total)}</b>
            </div>
          </div>
        </div>
      </div>

      {dlgOpen ? (
        <div
          className="ll-dlg-backdrop"
          role="presentation"
          onClick={() => setDlgOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(41,53,66,.45)",
            zIndex: 80,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <form
            className="ll-dlg"
            style={{
              background: "var(--white)",
              borderRadius: "var(--r-lg)",
              boxShadow: "var(--lift)",
              padding: 24,
              width: "min(380px, calc(100% - 32px))",
              color: "var(--text)",
            }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              setDlgOpen(false);
              move("won", Number(wonValue) || 0);
            }}
          >
            <h3 style={{ fontSize: 20, fontWeight: 800, color: "var(--ink)", margin: 0 }}>
              What is this deal worth?
            </h3>
            <p style={{ fontSize: 15, margin: "6px 0 12px" }}>
              Google Ads and Meta receive it with the conversion.
            </p>
            <label htmlFor="vd-in" style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
              Amount in euros
            </label>
            <input
              id="vd-in"
              type="number"
              inputMode="numeric"
              min={0}
              value={wonValue}
              required
              onChange={(e) => setWonValue(Number(e.target.value))}
              style={{
                width: "100%",
                height: 48,
                borderRadius: 10,
                border: "1px solid #d5dbe3",
                padding: "0 12px",
                marginTop: 6,
                color: "var(--ink)",
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="btn btn-white btn-s" onClick={() => setDlgOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-green btn-s">
                Mark as won
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
