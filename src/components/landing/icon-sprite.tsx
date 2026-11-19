/** Inline SVG symbols used by the marketing homepage. */
export function LandingIconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="i-check" viewBox="0 0 24 24">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </symbol>
      <symbol id="i-click" viewBox="0 0 24 24">
        <path d="M9 9l11 4-5 2-2 5z" />
        <path d="M5 3v3M3 5h3M8.5 4.5l1.5 1.5M4.5 8.5L6 10" />
      </symbol>
      <symbol id="i-board" viewBox="0 0 24 24">
        <rect x="3.5" y="4" width="5" height="16" rx="1.5" />
        <rect x="10" y="4" width="5" height="10" rx="1.5" />
        <rect x="16.5" y="4" width="4" height="13" rx="1.5" />
      </symbol>
      <symbol id="i-send" viewBox="0 0 24 24">
        <path d="M4 12l16-8-6 16-3-6.5z" />
        <path d="M11 13.5L20 4" />
      </symbol>
      <symbol id="i-euro" viewBox="0 0 24 24">
        <path d="M17 6.5A6.5 6.5 0 1 0 17 17.5" />
        <path d="M4.5 10.5h9M4.5 13.5h9" />
      </symbol>
      <symbol id="i-clock" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </symbol>
      <symbol id="i-chart" viewBox="0 0 24 24">
        <path d="M4 20V4M4 20h16" />
        <path d="M8 16v-4M12 16V8M16 16v-6" />
      </symbol>
      <symbol id="i-sync" viewBox="0 0 24 24">
        <path d="M19.5 9A7.5 7.5 0 0 0 6 6.5L4.5 8" />
        <path d="M4.5 4v4h4" />
        <path d="M4.5 15A7.5 7.5 0 0 0 18 17.5l1.5-1.5" />
        <path d="M19.5 20v-4h-4" />
      </symbol>
      <symbol id="i-spark" viewBox="0 0 24 24">
        <path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z" />
      </symbol>
      <symbol id="i-file" viewBox="0 0 24 24">
        <path d="M7 3.5h7l4.5 4.5V20a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" />
        <path d="M14 3.5V8h4.5M9.5 13h5M9.5 16.5h5" />
      </symbol>
      <symbol id="i-shield" viewBox="0 0 24 24">
        <path d="M12 3.5l7.5 3v5.5c0 4.5-3.2 7.6-7.5 8.5-4.3-.9-7.5-4-7.5-8.5V6.5z" />
        <path d="M9 12l2.2 2.2L15.5 10" />
      </symbol>
      <symbol id="i-gift" viewBox="0 0 24 24">
        <rect x="4" y="9" width="16" height="11" rx="1.5" />
        <path d="M3 9h18M12 9v11M12 9C10 5 6 5.5 7.5 8 8.3 9 12 9 12 9zM12 9c2-4 6-3.5 4.5-1-.8 1-4.5 1-4.5 1z" />
      </symbol>
      <symbol id="i-undo" viewBox="0 0 24 24">
        <path d="M9 14L4.5 9.5 9 5" />
        <path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3" />
      </symbol>
      <symbol id="i-code" viewBox="0 0 24 24">
        <path d="M8.5 8l-4 4 4 4M15.5 8l4 4-4 4" />
      </symbol>
      <symbol id="i-lock" viewBox="0 0 24 24">
        <rect x="5" y="10.5" width="14" height="10" rx="2" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      </symbol>
      <symbol id="i-users" viewBox="0 0 24 24">
        <circle cx="9" cy="8.5" r="3.5" />
        <path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
        <path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.8c1.8.7 3 2.3 3.5 4.7" />
      </symbol>
    </svg>
  );
}

export function Ic({ id }: { id: string }) {
  return (
    <svg className="ic">
      <use href={`#${id}`} />
    </svg>
  );
}
