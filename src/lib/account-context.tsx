import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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

type AccountState = {
  accountType: AccountType;
  setAccountType: (t: AccountType) => void;

  // Standard-account workspace (self).
  ownWorkspace: {
    name: string;
    invitedAgencyEmail: string | null;
    grantedAccess: AccessLevel;
  };
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
};

const STORAGE_KEY = "leadlogr.account.v1";

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
  const [invitedAgencyEmail, _setInvitedAgencyEmail] = useState<string | null>(null);
  const [grantedAccess, _setGrantedAccess] = useState<AccessLevel>("full");
  const [clientWorkspaces, setClientWorkspaces] = useState<ClientWorkspace[]>(DEFAULT_CLIENTS);
  const [viewingClientId, setViewingClientId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) {
      if (saved.accountType) _setAccountType(saved.accountType as AccountType);
      const own = (saved as any).ownWorkspace;
      if (own) {
        _setInvitedAgencyEmail(own.invitedAgencyEmail ?? null);
        _setGrantedAccess(own.grantedAccess ?? "full");
      }
      if (Array.isArray((saved as any).clientWorkspaces)) {
        setClientWorkspaces((saved as any).clientWorkspaces);
      }
      if ((saved as any).viewingClientId) setViewingClientId((saved as any).viewingClientId);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accountType,
        ownWorkspace: { invitedAgencyEmail, grantedAccess },
        clientWorkspaces,
        viewingClientId,
      }),
    );
  }, [hydrated, accountType, invitedAgencyEmail, grantedAccess, clientWorkspaces, viewingClientId]);

  const setAccountType = useCallback((t: AccountType) => {
    _setAccountType(t);
    setViewingClientId(null);
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

  const value = useMemo<AccountState>(() => {
    const isAgencyViewing = accountType === "agency" && viewingClientId !== null;
    const ownName = "Acme Media";
    let effectiveAccess: AccessLevel = "full";
    let activeWorkspace = { key: deriveWorkspaceKey(ownName), name: ownName };
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
      ownWorkspace: {
        name: ownName,
        invitedAgencyEmail,
        grantedAccess,
      },
      setInvitedAgencyEmail: _setInvitedAgencyEmail,
      setGrantedAccess: _setGrantedAccess,
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
    invitedAgencyEmail,
    grantedAccess,
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
