/**
 * Inbound status sync from the customer's own CRM. Server-only.
 *
 * All six providers do the same job — tell Leadlogr that a deal moved — and
 * all six can send an outbound webhook that the customer configures in their
 * own tool. So none of this needs an OAuth app, a developer registration or a
 * review queue: the customer pastes our URL into their CRM and that is the
 * whole connection. Six OAuth integrations would have been six approval
 * queues, each gating the others.
 *
 * What differs per provider is only the shape of the JSON they post, which is
 * what the adapters below normalise.
 */

export const CRM_PROVIDERS = [
  "pipedrive",
  "zoho",
  "odoo",
  "monday",
  "clickup",
  "teamleader",
] as const;

export type CrmProvider = (typeof CRM_PROVIDERS)[number];

export const CRM_PROVIDER_NAMES: Record<CrmProvider, string> = {
  pipedrive: "Pipedrive",
  zoho: "Zoho CRM",
  odoo: "Odoo CRM",
  monday: "Monday.com",
  clickup: "ClickUp",
  teamleader: "Teamleader",
};

export function isCrmProvider(v: string): v is CrmProvider {
  return (CRM_PROVIDERS as readonly string[]).includes(v);
}

/** What every provider boils down to. */
export type CrmUpdate = {
  /** Their label for the stage the record moved to. Mapped by the connection. */
  stage: string | null;
  /** How we find the lead. Email is the only identifier all six can carry. */
  email: string | null;
  /** Deal value, where the provider sends one. Used when the stage maps to won. */
  value: number | null;
  currency: string | null;
};

type Json = Record<string, unknown>;

const str = (v: unknown): string | null => {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** First non-empty email found anywhere in the payload, depth-limited. */
function findEmail(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;
  if (typeof value === "string") {
    const m = value.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    return m ? m[0].toLowerCase() : null;
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findEmail(v, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    // Prefer keys that are obviously an email before scanning everything, so a
    // body containing both a contact and an "owner" picks the contact.
    const obj = value as Json;
    for (const k of Object.keys(obj)) {
      if (/mail/i.test(k)) {
        const found = findEmail(obj[k], depth + 1);
        if (found) return found;
      }
    }
    for (const k of Object.keys(obj)) {
      const found = findEmail(obj[k], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Per-provider normalisation.
 *
 * Each reads the fields that provider documents, then falls back to a scan for
 * anything email-shaped. The fallback matters more than it looks: several of
 * these let the customer choose which fields the webhook carries, so the
 * documented shape is a default rather than a guarantee.
 */
const ADAPTERS: Record<CrmProvider, (body: Json) => CrmUpdate> = {
  // current.stage_id is numeric; customers map the number. A "Deal updated"
  // webhook sends the whole deal under `current`.
  pipedrive: (b) => {
    const cur = (b.current ?? b.data ?? b) as Json;
    const person = (cur.person_id ?? {}) as Json;
    return {
      stage: str(cur.stage_id) ?? str(cur.status) ?? null,
      email: findEmail(person) ?? findEmail(cur),
      value: num(cur.value),
      currency: str(cur.currency),
    };
  },

  zoho: (b) => {
    // Zoho posts {module, ids, data:[{...}]} for workflow webhooks.
    const d = (Array.isArray(b.data) ? b.data[0] : (b.data ?? b)) as Json;
    return {
      stage: str(d.Stage) ?? str(d.Deal_Stage) ?? str(d.Lead_Status),
      email: str(d.Email) ?? findEmail(d),
      value: num(d.Amount),
      currency: str(d.Currency),
    };
  },

  // Odoo has no fixed webhook body — it is whatever the automation action
  // builds — so this reads the conventional names and otherwise scans.
  odoo: (b) => {
    const d = (b.record ?? b.data ?? b) as Json;
    return {
      stage: str(d.stage_id) ?? str(d.stage) ?? str(d.stage_name),
      email: str(d.email_from) ?? str(d.partner_email) ?? findEmail(d),
      value: num(d.expected_revenue) ?? num(d.planned_revenue),
      currency: str(d.currency_id),
    };
  },

  monday: (b) => {
    // Monday wraps everything in `event`; a status change carries the new
    // label under value.label.text.
    const e = (b.event ?? b) as Json;
    const val = (e.value ?? {}) as Json;
    const label = (val.label ?? {}) as Json;
    return {
      stage: str(label.text) ?? str(val.text) ?? str(e.columnTitle),
      email: findEmail(e),
      value: null,
      currency: null,
    };
  },

  clickup: (b) => {
    // ClickUp sends history_items for taskStatusUpdated.
    const items = Array.isArray(b.history_items) ? (b.history_items as Json[]) : [];
    const statusItem = items.find((i) => (i.field as string) === "status");
    const after = (statusItem?.after ?? {}) as Json;
    return {
      stage: str(after.status) ?? str((b.task_status as Json)?.status) ?? null,
      email: findEmail(b),
      value: null,
      currency: null,
    };
  },

  teamleader: (b) => {
    // Teamleader posts {type, subject:{type,id}, ...}; the phase comes through
    // on deal.phase_changed.
    const d = (b.deal ?? b.subject ?? b) as Json;
    const phase = (b.current_phase ?? d.current_phase ?? {}) as Json;
    return {
      stage: str(phase.name) ?? str(b.phase) ?? str(d.status),
      email: findEmail(d) ?? findEmail(b),
      value: num((d.estimated_value as Json)?.amount) ?? num(d.estimated_value),
      currency: str((d.estimated_value as Json)?.currency),
    };
  },
};

export function parseCrmWebhook(provider: CrmProvider, body: unknown): CrmUpdate {
  if (!body || typeof body !== "object") {
    return { stage: null, email: null, value: null, currency: null };
  }
  try {
    return ADAPTERS[provider](body as Json);
  } catch {
    // A provider changing its payload shape must not 500 the webhook, or they
    // will retry it forever. Record it unmatched instead.
    return { stage: null, email: null, value: null, currency: null };
  }
}

/** Our six stages, as a webhook may name them. */
export const MAPPABLE_STAGES = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
  "disqualified",
] as const;

/**
 * Resolves their stage label to ours.
 *
 * Case-insensitive, because a customer typing "Won" into the mapping and their
 * CRM sending "won" is not a configuration error worth failing on.
 */
export function mapStage(stageMap: Record<string, string>, external: string | null): string | null {
  if (!external) return null;
  const key = external.trim().toLowerCase();
  const hit = stageMap[key];
  if (hit && (MAPPABLE_STAGES as readonly string[]).includes(hit)) return hit;
  // An exact match on one of our own names needs no mapping at all.
  if ((MAPPABLE_STAGES as readonly string[]).includes(key)) return key;
  return null;
}
