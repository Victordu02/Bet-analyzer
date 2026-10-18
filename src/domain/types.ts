export type Workspace = "personal" | "demo";
export type Result = "open" | "won" | "lost" | "void" | "half_won" | "half_lost" | "cashout";
export type Evidence = "declared" | "observed";
export type ProbabilitySource = "manual" | "market" | "model";
export interface Tipster {
  id: string; name: string; source: string; sourceUrl: string; discoveredAt: string;
  active: boolean; notes: string; accessNotes: string; monthlyCostCents: number;
  completeness: "unknown" | "provided_complete"; bankrolls: string[];
}
export interface Pick {
  id: string; tipsterId: string; sourceId: string; sourceUrl: string;
  publishedAt: string; observedAt: string; startsAt: string; event: string; eventKey: string;
  sport: string; competition: string; market: string; selection: string; line: string;
  rules: string; odds: number; minOdds: number | null; stakeUnits: number;
  result: Result; settlementSource: string; settledAt: string | null;
  kind: "single" | "accumulator"; timing: "prematch" | "live";
  evidence: Evidence; initialContent: string; argument: string; notes: string;
  revisions: {at: string; description: string; previous: Record<string, unknown>}[];
  manuallyCorrected: boolean;
}
export interface Quote {
  id: string; pickId: string; bookmaker: "Winamax FR"; odds: number | null;
  observedAt: string; recordedAt: string; source: string; sourceUrl: string;
  available: boolean; matchConfirmed: boolean; closing: boolean;
  referenceProbability: number | null; notes: string;
  collectionMode?: "manual" | "provider";
  mappingStatus?: "unconfirmed" | "confirmed" | "ambiguous";
  providerLastUpdatedAt?: string | null;
  providerTtlSeconds?: number | null;
  identitySnapshot?: PickIdentitySnapshot;
  provider?: {
    id: "the-odds-api"; bookmakerKey: "winamax_fr"; sportKey: string; eventId: string;
    marketKey: "h2h" | "spreads" | "totals"; outcomeName: string; line: string;
    homeTeam: string; awayTeam: string;
  };
}
export type PickIdentitySnapshot = { [Key in "eventKey" | "event" | "startsAt" | "market" | "selection" | "line" | "rules" | "kind" | "timing"]: Pick[Key] };
export interface Ticket {
  id: string; sourceId: string; pickId: string | null; bookmaker: string;
  event: string; eventKey: string; selection: string; market: string; line: string;
  rules: string; kind: "single" | "accumulator"; odds: number; stakeCents: number;
  funding: "cash" | "freebet"; placedAt: string; settledAt: string | null;
  result: Result; returnCents: number; feeCents: number;
  remainingStakeCents: number | null; partialCashout: boolean;
  strategyId: string | null; source: string; notes: string; manuallyCorrected: boolean;
  revisions: {at:string; description:string; previous:Record<string,unknown>}[];
}
export type LedgerKind = "initial" | "deposit" | "withdrawal" | "adjustment" | "poker" | "fee" | "promotion" | "ticket_stake" | "ticket_return" | "ticket_fee";
export interface LedgerEntry {
  id:string; kind:LedgerKind; amountCents:number; at:string; description:string;
  ticketId:string|null; revision:number;
}
export interface SegmentFilter {
  tipsterId?:string; sport?:string; competition?:string; market?:string;
  oddsMin?:number; oddsMax?:number; kind?:"single"|"accumulator"; timing?:"prematch"|"live";
  delayMinMinutes?:number; delayMaxMinutes?:number;
}
export interface Strategy {
  id:string; name:string; filter:SegmentFilter; createdAt:string; discoveryEnd:string;
  validationStart:string; frozenAt:string; active:boolean; notes:string;
}
export interface Allocation {
  pickId:string; eventKey:string; identity:string; stakeCents:number; odds:number;
  probability:number|null; probabilitySource:ProbabilitySource|null; expectedCents:number|null;
  reason:string;
}
export interface Simulation {
  id:string; name:string; createdAt:string; strategyId:string|null;
  method:"fixed"|"percent"|"kelly"; allocations:Allocation[]; assumptions:string;
  settingsSnapshot:Settings;
}
export interface Settings {
  currency:"EUR"; timezone:"Europe/Paris";
  fixedStakeCents:number; stakePercent:number; kellyFraction:number;
  maxBetPercent:number|null; maxEventPercent:number|null; maxExposurePercent:number|null;
  dailyLossLimitCents:number|null; monthlyLossLimitCents:number|null;
  paused:boolean; quoteMaxAgeMinutes:number; reconciliationBalanceCents:number|null;
  reconciledAt:string|null; reportFrequency:"daily"|"weekly"|"monthly"; reportHour:string;
}
export interface ImportBatch {
  id:string; kind:"picks"|"tickets"; fileName:string; hash:string; at:string;
  created:number; updated:number; skipped:number; errors:{row:number; message:string}[];
}
export interface AuditEntry {id:string; at:string; action:string; entityId:string; detail:string}
export interface AppState {
  workspace:Workspace; tipsters:Tipster[]; picks:Pick[]; quotes:Quote[];
  tickets:Ticket[]; ledger:LedgerEntry[]; strategies:Strategy[]; simulations:Simulation[];
  imports:ImportBatch[]; audit:AuditEntry[]; settings:Settings;
}
export const DEFAULT_SETTINGS:Settings = {
  currency:"EUR",timezone:"Europe/Paris",fixedStakeCents:1000,stakePercent:0.01,kellyFraction:0.25,
  maxBetPercent:null,maxEventPercent:null,maxExposurePercent:null,
  dailyLossLimitCents:null,monthlyLossLimitCents:null,paused:false,quoteMaxAgeMinutes:15,
  reconciliationBalanceCents:null,reconciledAt:null,reportFrequency:"weekly",reportHour:"09:00"
};
export const RESULT_LABELS:Record<Result,string> = {open:"Ouvert",won:"Gagné",lost:"Perdu",void:"Annulé",half_won:"Demi-gagné",half_lost:"Demi-perdu",cashout:"Cashout"};
export const EVIDENCE_LABELS = {declared:"Déclaré",observed:"Observé avant événement",simulated:"Simulé sur Winamax",executed:"Exécuté"};
