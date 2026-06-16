import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listAgencyClients } from "@/lib/agency-invites.functions";

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
    async function hydrateFromProfile(userId: string, userEmail: string | null) {
      const { data, error } = await supabase
        .from("profiles")
        .select("account_type,workspace_key,workspace_name,owner_name,owner_email")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) return;
      _setAccountType((data.account_type === "agency" ? "agency" : "standard"));
      setOwnWorkspace({
        key: data.workspace_key,
        name: data.workspace_name,
        ownerName: data.owner_name || userEmail || "Workspace owner",
        ownerEmail: data.owner_email || userEmail || "",
        invitedAgencyEmail: null,
        grantedAccess: "full",
      });
      if (data.account_type === "agency") setClientWorkspaces([]);
    }
    async function consumePendingInvite() {
      if (typeof window === "undefined") return;
      const agencyToken = window.localStorage.getItem("leadlogr.pending_invite_token");
      const clientToken = window.localStorage.getItem("leadlogr.pending_client_invite_token");
      const memberToken = window.localStorage.getItem("leadlogr.pending_member_invite_token");
      const token = agencyToken || clientToken || memberToken;
      if (!token) return;
      try {
        const { acceptInvite } = await import("@/lib/agency-invites.functions");
        await acceptInvite({ data: { token } });
      } catch (err) {
        console.error("Failed to auto-accept pending invite", err);
      } finally {
        window.localStorage.removeItem("leadlogr.pending_invite_token");
        window.localStorage.removeItem("leadlogr.pending_client_invite_token");
        window.localStorage.removeItem("leadlogr.pending_member_invite_token");
      }
    }
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setIsAuthenticated(!!data.session);
      setAuthReady(true);
      if (data.session?.user) {
        hydrateFromProfile(data.session.user.id, data.session.user.email ?? null);
        consumePendingInvite().then(() =>
          hydrateFromProfile(data.session!.user.id, data.session!.user.email ?? null),
        );
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setIsAuthenticated(!!session);
      if (session?.user) {
        hydrateFromProfile(session.user.id, session.user.email ?? null);
        if (event === "SIGNED_IN") {
          consumePendingInvite().then(() =>
            hydrateFromProfile(session.user.id, session.user.email ?? null),
          );
        }
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const { data: agencyClientsData } = useQuery({
    queryKey: ["agency-clients"],
    queryFn: () => listClientsFn(),
    enabled: authReady && isAuthenticated && accountType === "agency",
  });

  useEffect(() => {
    if (accountType === "agency" && agencyClientsData?.clients) {
      setClientWorkspaces(agencyClientsData.clients as ClientWorkspace[]);
    }
  }, [accountType, agencyClientsData]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
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
