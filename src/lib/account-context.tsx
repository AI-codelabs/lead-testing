import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { authClient, signOut as authSignOut, clearAuthToken } from "@/auth/client";
import { resolveActiveOrganization, forgetOrganization } from "@/auth/session";
import { listAgencyClients } from "@/lib/agency-clients.functions";

export type AccountType = "standard" | "agency";
export type AccessLevel = "full" | "names_only" | "metrics_only";

export type ClientWorkspace = {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  monthlyReferralFee: number;
  currency: "EUR" | "USD" | "GBP";
  leadsCount: number;
  conversionRate: number; // 0-1
  /** Permission the workspace owner granted to the agency. null = no agency access. */
  agencyAccess: AccessLevel | null;
};

type OwnWorkspace = {
  key: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  invitedAgencyEmail: string | null;
  grantedAccess: AccessLevel;
};

type AccountState = {
  accountType: AccountType;
  setAccountType: (t: AccountType) => void;
  createAccount: (data: {
    accountType: AccountType;
    workspaceName: string;
    ownerName: string;
    ownerEmail: string;
  }) => void;

  // Standard-account workspace (self).
  ownWorkspace: OwnWorkspace;
  setInvitedAgencyEmail: (email: string | null) => void;
  setGrantedAccess: (lvl: AccessLevel) => void;

  // Agency-only state.
  clientWorkspaces: ClientWorkspace[];
  addClientWorkspace: (w: Omit<ClientWorkspace, "id" | "leadsCount" | "conversionRate">) => void;
  /** When non-null, the agency is "inside" this client workspace. */
  viewingClientId: string | null;
  enterClient: (id: string) => void;
  exitClient: () => void;

  /**
   * The workspace the UI is currently rendering for. This is the ONLY workspace
   * identifier data-bound pages (dashboard, crm, pipeline, tracking,
   * integrations) should read — it switches automatically when an agency
   * enters/exits a client so each client sees their own leads, not the agency's.
   */
  activeWorkspace: { key: string; name: string };

  /** Effective access level for the currently rendered workspace. Standard owners always get "full". */
  effectiveAccess: AccessLevel;
  /** True when the current view is an agency looking at a client (read-mostly). */
  isAgencyViewing: boolean;

  /** Sign out the current user (clears session and resets workspace state). */
  signOut: () => Promise<void>;
  /** True once the auth session has been checked. */
  authReady: boolean;
  /** True once the active organization has been resolved (or found absent). */
  workspaceReady: boolean;
  /**
   * The organization every server call should be scoped to. Pass this
   * explicitly — the activeOrganizationId JWT claim is never minted by Neon's
   * hosted Better Auth, so there is no server-side fallback.
   */
  activeOrganizationId: string;
  /** True when a Supabase session is active. */
  isAuthenticated: boolean;
};

// We only persist the lightweight "which client am I viewing?" UX state.
// Workspace identity and the client list always come from the database so
// nothing is hardcoded and switching workspaces never leaks stale data.
const STORAGE_KEY = "leadlogr.account.view.v1";

function generateWorkspaceKey(name: string): string {
  const slug = (name || "workspace").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "workspace";
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 8)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 8);
  return `ws_${slug}_${random}`;
}

// Empty placeholder used before the authenticated profile has loaded.
// Pages that render workspace-bound data check `authReady && isAuthenticated`
// AND validate the workspace key shape (see app.tracking.tsx) so this empty
// shell is never shown to a real user.
const EMPTY_OWN_WORKSPACE: OwnWorkspace = {
  key: "",
  name: "",
  ownerName: "",
  ownerEmail: "",
  invitedAgencyEmail: null,
  grantedAccess: "full",
};

const AccountContext = createContext<AccountState | null>(null);

function loadViewState(): { accountType?: AccountType; viewingClientId?: string | null } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const listClientsFn = useServerFn(listAgencyClients);
  const [accountType, _setAccountType] = useState<AccountType>("standard");
  const [ownWorkspace, setOwnWorkspace] = useState<OwnWorkspace>(EMPTY_OWN_WORKSPACE);
  const [clientWorkspaces, setClientWorkspaces] = useState<ClientWorkspace[]>([]);
  const [viewingClientId, setViewingClientId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const saved = loadViewState();
    if (saved) {
      if (saved.accountType === "agency" || saved.accountType === "standard") {
        _setAccountType(saved.accountType);
      }
      if (saved.viewingClientId) setViewingClientId(saved.viewingClientId);
    }
    setHydrated(true);
  }, []);


  // Hydrate workspace state from the authenticated user's profile row.
  useEffect(() => {
    let cancelled = false;
    async function hydrateFromOrganization(userEmail: string | null) {
      const active = await resolveActiveOrganization().catch(() => null);
      if (cancelled) return;
      // Mark the workspace resolved either way. Guards that redirect on
      // account type must not fire while this is still in flight, or a fresh
      // login bounces out of /agency before the type is known.
      setWorkspaceReady(true);
      if (!active) return;
      _setAccountType(active.accountType);
      setOwnWorkspace({
        key: active.organizationId,
        name: active.name,
        ownerName: userEmail || "Workspace owner",
        ownerEmail: userEmail || "",
        invitedAgencyEmail: null,
        grantedAccess: "full",
      });
      if (active.accountType === "agency") setClientWorkspaces([]);
    }

    async function consumePendingInvite() {
      if (typeof window === "undefined") return;
      const agencyToken = window.localStorage.getItem("leadlogr.pending_invite_token");
      const clientToken = window.localStorage.getItem("leadlogr.pending_client_invite_token");
      const memberToken = window.localStorage.getItem("leadlogr.pending_member_invite_token");
      const token = agencyToken || clientToken || memberToken;
      if (!token) return;
      try {
        const { acceptInvite } = await import("@/lib/invitations.functions");
        await acceptInvite({ data: { token } });
      } catch (err) {
        console.error("Failed to auto-accept pending invite", err);
      } finally {
        window.localStorage.removeItem("leadlogr.pending_invite_token");
        window.localStorage.removeItem("leadlogr.pending_client_invite_token");
        window.localStorage.removeItem("leadlogr.pending_member_invite_token");
      }
    }
    // Better Auth holds the session on the Neon auth origin; ask it directly
    // rather than subscribing to a client-side auth event stream.
    authClient
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        const user = data?.user ?? null;
        setIsAuthenticated(!!user);
        setAuthReady(true);
        if (!user) {
          setWorkspaceReady(true);
          return;
        }
        void hydrateFromOrganization(user.email ?? null);
        void consumePendingInvite().then(() => hydrateFromOrganization(user.email ?? null));
      })
      .catch(() => {
        if (cancelled) return;
        setIsAuthenticated(false);
        setAuthReady(true);
        setWorkspaceReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The organization is passed explicitly rather than relying on the
  // activeOrganizationId claim in the JWT: Better Auth's setActive does not
  // reliably reach the minted token, so the server-side fallback resolves to
  // null and the request fails with "No organization selected".
  const activeOrganizationId = ownWorkspace.key;

  const { data: agencyClientsData } = useQuery({
    queryKey: ["agency-clients", activeOrganizationId],
    queryFn: () => listClientsFn({ data: { organizationId: activeOrganizationId } }),
    enabled:
      authReady && isAuthenticated && accountType === "agency" && !!activeOrganizationId,
  });

  useEffect(() => {
    if (accountType === "agency" && agencyClientsData?.clients) {
      setClientWorkspaces(agencyClientsData.clients as ClientWorkspace[]);
    }
  }, [accountType, agencyClientsData, workspaceReady]);

  const signOut = useCallback(async () => {
    await authSignOut();
    clearAuthToken();
    forgetOrganization();
    // Must be cleared: the layout guards redirect a signed-out user to /login
    // by watching this. Leaving it true meant they instead saw the account
    // type reset to "standard" and bounced into the authenticated app shell.
    setIsAuthenticated(false);
    setOwnWorkspace(EMPTY_OWN_WORKSPACE);
    setClientWorkspaces([]);
    _setAccountType("standard");
    setViewingClientId(null);
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  }, []);


  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    // Only persist lightweight UX state — never workspace data itself.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accountType, viewingClientId }),
    );
  }, [hydrated, accountType, viewingClientId]);


  const setAccountType = useCallback((t: AccountType) => {
    _setAccountType(t);
    setViewingClientId(null);
  }, []);

  const createAccount = useCallback((data: {
    accountType: AccountType;
    workspaceName: string;
    ownerName: string;
    ownerEmail: string;
  }) => {
    const workspaceName = data.workspaceName.trim() || "My workspace";
    setOwnWorkspace({
      key: generateWorkspaceKey(workspaceName),
      name: workspaceName,
      ownerName: data.ownerName.trim() || data.ownerEmail.trim() || "Workspace owner",
      ownerEmail: data.ownerEmail.trim(),
      invitedAgencyEmail: null,
      grantedAccess: "full",
    });
    _setAccountType(data.accountType);
    setViewingClientId(null);
    if (data.accountType === "agency") setClientWorkspaces([]);
  }, []);

  const addClientWorkspace = useCallback(
    (w: Omit<ClientWorkspace, "id" | "leadsCount" | "conversionRate">) => {
      setClientWorkspaces((prev) => [
        ...prev,
        { ...w, id: `ws_${Math.random().toString(36).slice(2, 8)}`, leadsCount: 0, conversionRate: 0 },
      ]);
    },
    [],
  );

  const enterClient = useCallback((id: string) => setViewingClientId(id), []);
  const exitClient = useCallback(() => setViewingClientId(null), []);

  const setInvitedAgencyEmail = useCallback((email: string | null) => {
    setOwnWorkspace((prev) => ({ ...prev, invitedAgencyEmail: email }));
  }, []);

  const setGrantedAccess = useCallback((lvl: AccessLevel) => {
    setOwnWorkspace((prev) => ({ ...prev, grantedAccess: lvl }));
  }, []);

  const value = useMemo<AccountState>(() => {
    const isAgencyViewing = accountType === "agency" && viewingClientId !== null;
    let effectiveAccess: AccessLevel = "full";
    let activeWorkspace = { key: ownWorkspace.key, name: ownWorkspace.name };
    if (isAgencyViewing) {
      const ws = clientWorkspaces.find((c) => c.id === viewingClientId);
      effectiveAccess = ws?.agencyAccess ?? "metrics_only";
      if (ws) {
        // Client workspace IDs are already in `ws_*` form and ARE the workspace
        // key — so each client owns a distinct set of leads, billing, settings.
        activeWorkspace = { key: ws.id, name: ws.name };
      }
    }
    return {
      accountType,
      setAccountType,
      createAccount,
      ownWorkspace,
      setInvitedAgencyEmail,
      setGrantedAccess,
      clientWorkspaces,
      addClientWorkspace,
      viewingClientId,
      enterClient,
      exitClient,
      activeWorkspace,
      effectiveAccess,
      isAgencyViewing,
      signOut,
      authReady,
      workspaceReady,
      activeOrganizationId,
      isAuthenticated,
    };
  }, [
    accountType,
    setAccountType,
    createAccount,
    ownWorkspace,
    setInvitedAgencyEmail,
    setGrantedAccess,
    clientWorkspaces,
    viewingClientId,
    addClientWorkspace,
    enterClient,
    exitClient,
    signOut,
    authReady,
    isAuthenticated,
  ]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside AccountProvider");
  return ctx;
}

export function useAccess() {
  const { effectiveAccess, isAgencyViewing } = useAccount();
  return {
    level: effectiveAccess,
    isAgencyViewing,
    canSeeDetails: effectiveAccess === "full",
    canSeeNames: effectiveAccess === "full" || effectiveAccess === "names_only",
    metricsOnly: effectiveAccess === "metrics_only",
  };
}

export const ACCESS_LEVEL_META: Record<AccessLevel, { label: string; hint: string }> = {
  full: { label: "Full access", hint: "Agency sees everything in the workspace." },
  names_only: { label: "Limited (names only)", hint: "Structural info only — no contact details, values, or notes." },
  metrics_only: { label: "Read-only metrics", hint: "Aggregate numbers and charts only — no individual leads." },
};
