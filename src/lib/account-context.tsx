import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

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

const STORAGE_KEY = "leadlogr.account.v2";

function generateWorkspaceKey(name: string): string {
  const slug = (name || "workspace").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "workspace";
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 8)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 8);
  return `ws_${slug}_${random}`;
}

const DEFAULT_OWN_WORKSPACE: OwnWorkspace = {
  key: "ws_acmemedia",
  name: "Acme Media",
  ownerName: "Jane Doe",
  ownerEmail: "jane@acmemedia.com",
  invitedAgencyEmail: null,
  grantedAccess: "full",
};

const DEFAULT_CLIENTS: ClientWorkspace[] = [
  {
    id: "ws_acme",
    name: "Acme Media",
    ownerName: "Jane Doe",
    ownerEmail: "jane@acmemedia.com",
    monthlyReferralFee: 480,
    currency: "EUR",
    leadsCount: 428,
    conversionRate: 0.38,
    agencyAccess: "full",
  },
  {
    id: "ws_northwind",
    name: "Northwind Group",
    ownerName: "Mark Lin",
    ownerEmail: "mark@northwind.io",
    monthlyReferralFee: 320,
    currency: "EUR",
    leadsCount: 214,
    conversionRate: 0.29,
    agencyAccess: "names_only",
  },
  {
    id: "ws_bluefin",
    name: "Bluefin Studio",
    ownerName: "Sara Park",
    ownerEmail: "sara@bluefin.studio",
    monthlyReferralFee: 250,
    currency: "EUR",
    leadsCount: 96,
    conversionRate: 0.41,
    agencyAccess: "metrics_only",
  },
];

const AccountContext = createContext<AccountState | null>(null);

function loadFromStorage(): Partial<AccountState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [accountType, _setAccountType] = useState<AccountType>("standard");
  const [ownWorkspace, setOwnWorkspace] = useState<OwnWorkspace>(DEFAULT_OWN_WORKSPACE);
  const [clientWorkspaces, setClientWorkspaces] = useState<ClientWorkspace[]>(DEFAULT_CLIENTS);
  const [viewingClientId, setViewingClientId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) {
      if (saved.accountType) _setAccountType(saved.accountType as AccountType);
      const own = (saved as any).ownWorkspace;
      if (own) {
        const name = typeof own.name === "string" && own.name.trim() ? own.name : DEFAULT_OWN_WORKSPACE.name;
        setOwnWorkspace({
          key: typeof own.key === "string" && own.key ? own.key : generateWorkspaceKey(name),
          name,
          ownerName: typeof own.ownerName === "string" && own.ownerName.trim() ? own.ownerName : DEFAULT_OWN_WORKSPACE.ownerName,
          ownerEmail: typeof own.ownerEmail === "string" && own.ownerEmail.trim() ? own.ownerEmail : DEFAULT_OWN_WORKSPACE.ownerEmail,
          invitedAgencyEmail: own.invitedAgencyEmail ?? null,
          grantedAccess: own.grantedAccess ?? "full",
        });
      }
      if (Array.isArray((saved as any).clientWorkspaces)) {
        setClientWorkspaces((saved as any).clientWorkspaces);
      }
      if ((saved as any).viewingClientId) setViewingClientId((saved as any).viewingClientId);
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
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setIsAuthenticated(!!data.session);
      setAuthReady(true);
      if (data.session?.user) hydrateFromProfile(data.session.user.id, data.session.user.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setIsAuthenticated(!!session);
      if (session?.user) hydrateFromProfile(session.user.id, session.user.email ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setOwnWorkspace(DEFAULT_OWN_WORKSPACE);
    setClientWorkspaces(DEFAULT_CLIENTS);
    _setAccountType("standard");
    setViewingClientId(null);
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  }, []);


  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accountType,
        ownWorkspace,
        clientWorkspaces,
        viewingClientId,
      }),
    );
  }, [hydrated, accountType, ownWorkspace, clientWorkspaces, viewingClientId]);

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
