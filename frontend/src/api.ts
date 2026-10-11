// Thin client for the MessLoop HTTP API. The server validates everything (R15);
// this file only carries requests and turns error bodies into readable messages.

export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "https://e6rcj1pacc.execute-api.us-east-1.amazonaws.com";

export type Role = "student" | "worker" | "manager";
export type LabelKind = "Measured" | "Calculated" | "Estimated" | "Simulated";

export interface Session {
  token: string;
  role: Role;
  expiresAt: number;
}

const KEY = "messloop.session";

export function loadSession(): Session | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Session | null;
    return s && s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the session simply lasts until the tab closes.
  }
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public field?: string) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = any>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const session = loadSession();
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(session ? { authorization: `Bearer ${session.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login") onUnauthorized();
    const e = json?.error ?? {};
    throw new ApiError(res.status, e.code ?? "HTTP_" + res.status, e.message ?? `Request failed (${res.status}).`, e.field);
  }
  return json as T;
}

// ------------------------------------------------------------------ shapes

export interface Item { itemId: string; name: string; unit: string; isSimulated: boolean }

export interface WasteRecord {
  recordId: string;
  date: string;
  period: string;
  slotId: string;
  itemId: string;
  preparedQty: number;
  leftoverQty: number;
  servings: number;
  unit: string;
  wastePct: number;
  wastePer100: number;
  interventionId?: string;
  isSimulated: boolean;
  labels: Record<string, LabelKind>;
}

export interface Summary {
  isSimulated: boolean;
  threshold: number;
  latestDate: string | null;
  latestWasteQty: number;
  latestWastePer100: number | null;
  latestIsSimulated?: boolean;
  topWastefulItems: ItemStat[];
  alerts: ItemStat[];
  trend: { date: string; itemId: string; name: string; slotId: string; wastePer100: number; wastePct: number; interventionId: string | null }[];
  pendingRecommendations: number;
  activeInterventions: Intervention[];
  recentOutcomes: Impact[];
}

export interface ItemStat {
  itemId: string; name: string; slotId: string; n: number;
  pooledWastePct: number; pooledWastePer100: number; exceeded: number; alert: boolean;
}

export interface Candidate {
  itemId: string; name: string; occurrences: number;
  avgWastePct: number | null; avgRating: number | null; votePct: number | null;
}

export interface Evidence {
  targetItem: { itemId: string; name: string; unit: string };
  slotId: string;
  threshold: number;
  history: { date: string; prepared: number; leftover: number; servings: number; wastePct: number; per100: number }[];
  rule: { exceeded: number; of: number };
  pooledBaselinePer100: number;
  avgRating: number | null;
  ratingCount: number;
  topReasons: string[];
  candidates: Candidate[];
  constraints: { cost: "unknown" | number; nutrition: "unknown" };
  evidenceStrength: "strong" | "moderate" | "limited" | "insufficient";
}

export interface Action { type: "replace" | "reduce_quantity" | "reduce_frequency"; fromItemId: string; toItemId?: string; newQuantity?: number }

export interface Recommendation {
  recId: string;
  targetItemId: string;
  slotId: string;
  evidence: Evidence;
  content: {
    problem: string;
    supportingEvidence: string[];
    suggestedAction: { type: string; target: string; replacement: string | null };
    reasoning: string;
    alternatives: { item: string; pros: string[]; cons: string[] }[];
    constraintsAndCaveats: string[];
    evidenceStrengthNote: string;
  };
  source: "ai" | "fallback_template";
  fallbackReason?: string;
  model?: string;
  aiMs?: number;
  aiStatus: "running" | "done";
  agent?: { trigger: "manual" | "meal_logged"; trace: AgentStep[]; toolsUsed?: string[] };
  agentExecutionArn?: string;
  agentWaitingSince?: string;
  evidenceStrength: Evidence["evidenceStrength"];
  suggestedAction: Action | null;
  status: "pending" | "approved" | "rejected" | "modified";
  decisionReason?: string;
  interventionId?: string;
  createdAt: string;
  isSimulated: boolean;
}

export interface Intervention {
  interventionId: string;
  recId: string;
  slotId: string;
  action: Action;
  startDate: string;
  baseline: { pooledWastePer100: number; pooledWastePct: number; nRecords: number; dateFrom: string | null; dateTo: string | null; unit: string; strength: string };
  status: string;
  decisionReason: string;
  isSimulated: boolean;
}

export interface AgentStep { step: "tool" | "write" | "note"; name?: string; ms: number; detail?: string }

export interface Impact {
  interventionId: string;
  baselineWastePer100: number;
  baselineRecordCount?: number;
  postWastePer100?: number;
  postRecordCount: number;
  absoluteChange?: number;
  reductionPct?: number | null;
  direction?: "decreased" | "increased" | "similar";
  estimatedFoodSavedQty?: number;
  platesSaved?: number | null;
  co2eKg?: number | null;
  unit?: string;
  label: "observed change";
  caveat?: string;
  message?: string;
  isSimulated?: boolean;
  agentSummary?: { text: string; source: "ai" | "fallback_template"; reason?: string; forPostRecordCount: number };
}
