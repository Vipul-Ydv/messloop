// Shared shapes for MessLoop. Pure types — no runtime code, no AWS imports.

export type Unit = "kg" | "litre" | "count";
export type Label = "Measured" | "Calculated" | "Estimated" | "Simulated";
export type Period = "breakfast" | "lunch" | "snacks" | "dinner";
export type Strength = "insufficient" | "limited" | "moderate" | "strong";
export type ActionType = "replace" | "reduce_quantity" | "reduce_frequency" | "investigate";

export interface FoodItem {
  itemId: string;
  name: string;
  unit: Unit;
  category?: string;
  costPerUnit?: number;
  /** The name mess staff use, in Devanagari; also matched in voice answers. */
  hindi?: string;
  /** Meals it is usually served at, so forms can list those dishes first. */
  meals?: Period[];
  isSimulated: boolean;
}

/** The three numbers a waste measurement is made of. */
export interface QtyRecord {
  preparedQty: number;
  leftoverQty: number;
  servings: number;
}

export interface WasteRecord extends QtyRecord {
  recordId: string;
  date: string;
  period: Period;
  slotId: string;
  itemId: string;
  unit: Unit;
  wastePct: number;
  wastePer100: number;
  interventionId?: string;
  loggedBy: string;
  loggedAt: string;
  isSimulated: boolean;
}

export interface RatingAggregate {
  itemId: string;
  counts: [number, number, number, number, number]; // stars 1..5
  topReasons: string[];
}

export interface EvidenceCandidate {
  itemId: string;
  name: string;
  occurrences: number;
  avgWastePct: number | null;
  avgRating: number | null;
  votePct: number | null;
}

export interface EvidencePackage {
  targetItem: { itemId: string; name: string; unit: Unit };
  slotId: string;
  threshold: number;
  history: { date: string; prepared: number; leftover: number; servings: number; wastePct: number; per100: number }[];
  rule: { exceeded: number; of: number };
  pooledBaselinePer100: number;
  avgRating: number | null;
  ratingCount: number;
  topReasons: string[];
  candidates: EvidenceCandidate[];
  constraints: { cost: "unknown" | number; nutrition: "unknown" };
  evidenceStrength: Strength;
}

export interface AiRecommendationJson {
  problem: string;
  supportingEvidence: string[];
  suggestedAction: { type: ActionType; target: string; replacement: string | null };
  reasoning: string;
  alternatives: { item: string; pros: string[]; cons: string[] }[];
  constraintsAndCaveats: string[];
  evidenceStrengthNote: string;
  requiresHumanApproval: true;
}

export interface InterventionAction {
  type: "replace" | "reduce_quantity" | "reduce_frequency";
  fromItemId: string;
  toItemId?: string;
  newQuantity?: number;
}

export interface Baseline {
  pooledWastePer100: number;
  pooledWastePct: number;
  nRecords: number;
  dateFrom: string;
  dateTo: string;
  unit: Unit;
}

export type Direction = "decreased" | "similar" | "increased";
