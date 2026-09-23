import { authClient } from "./client";
import { listMyOrganizations, initializeOrganization } from "@/lib/organization.functions";

const ACTIVE_ORG_KEY = "leadlogr.activeOrganizationId";

export type ActiveContext = {
  organizationId: string;
  name: string;
  accountType: "standard" | "agency";
  role: string;
};

/**
 * Picks the organization a freshly signed-in user should land in.
 *
 * Prefers whichever they last used, falling back to their first. Returns null
 * when they belong to none, which is the state a half-finished signup leaves
 * behind — the caller sends them somewhere to create one.
 */
export async function resolveActiveOrganization(): Promise<ActiveContext | null> {
  const orgs = await listMyOrganizations();
  if (orgs.length === 0) return null;

  const remembered =
    typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_ORG_KEY) : null;

  const chosen = orgs.find((o) => o.organizationId === remembered) ?? orgs[0];

  // Mirror the choice into the Better Auth session so the JWT carries
  // activeOrganizationId on subsequent requests.
  await authClient.organization
    .setActive({ organizationId: chosen.organizationId })
    .catch(() => {});

  rememberOrganization(chosen.organizationId);

  return {
    organizationId: chosen.organizationId,
    name: chosen.name,
    accountType: chosen.accountType,
    role: chosen.role,
  };
}

export function rememberOrganization(organizationId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_ORG_KEY, organizationId);
  } catch {
    // Private browsing or blocked storage: the fallback is simply the first org.
  }
}

export function forgetOrganization(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_ORG_KEY);
  } catch {
    /* nothing to clean up */
  }
}

/**
 * Creates an organization for a user who has none, and seeds its settings.
 * Used by signup, where Better Auth has created the user but nothing else.
 */
export async function createOrganization(
  name: string,
  accountType: "standard" | "agency",
): Promise<ActiveContext> {
  const slug = `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "workspace"
  }-${Math.random().toString(36).slice(2, 8)}`;

  const { data, error } = await authClient.organization.create({ name, slug });
  if (error || !data?.id) {
    throw new Error(error?.message ?? "Could not create workspace");
  }

  await initializeOrganization({ data: { organizationId: data.id, accountType } });
  await authClient.organization.setActive({ organizationId: data.id }).catch(() => {});
  rememberOrganization(data.id);

  return { organizationId: data.id, name, accountType, role: "owner" };
}

/**
 * Makes another of the user's organizations the active one.
 *
 * Does a full document navigation rather than a client-side route change:
 * the account context, every cached query and the agency/standard layout
 * choice are all derived from the active organization, so reloading is both
 * simpler and less error-prone than invalidating each of them by hand.
 *
 * The destination depends on the account type, because the two layouts guard
 * against each other — landing an agency on /app would immediately bounce.
 */
export async function switchOrganization(organizationId: string): Promise<void> {
  const orgs = await listMyOrganizations();
  const target = orgs.find((o) => o.organizationId === organizationId);
  if (!target) throw new Error("You are not a member of that workspace");

  rememberOrganization(organizationId);
  await authClient.organization.setActive({ organizationId }).catch(() => {});

  // The cached view state holds the PREVIOUS workspace's account type, which
  // the context restores synchronously on mount — before hydration corrects
  // it. Left in place, the first render after switching queries the wrong
  // organization and settles on an empty result.
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem("leadlogr.account.view.v1");
    } catch {
      /* storage blocked: hydration still corrects it, just a beat later */
    }
  }

  if (typeof window !== "undefined") {
    window.location.assign(target.accountType === "agency" ? "/agency" : "/app/dashboard");
  }
}
