/** Safe shared contracts. This module contains no environment access or transport. */
export type OddsSyncStatus =
  | "unconfigured"
  | "demo"
  | "ready"
  | "needs_sport"
  | "needs_mapping"
  | "updated"
  | "unchanged"
  | "unavailable"
  | "rate_limited"
  | "error";

export interface OddsQuota {
  remaining: number | null;
  used: number | null;
  last: number | null;
}

export interface OddsSport {
  key: string;
  title: string;
  group: string;
  active: boolean;
}

export interface OddsCandidate {
  id: string;
  sportKey: string;
  eventId: string;
  event: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  bookmaker: "winamax_fr";
  marketKey: "h2h" | "spreads" | "totals";
  outcomeName: string;
  line: string;
  odds: number;
  providerUpdatedAt: string;
  collectedAt: string;
  rules: string;
  requestedRules: string;
  canConfirm: boolean;
  exact: {
    event: boolean;
    startsAt: boolean;
    market: boolean;
    selection: boolean;
    line: boolean;
  };
  warnings: string[];
}

export interface OddsSyncResult {
  status: OddsSyncStatus;
  message: string;
  pickId: string;
  sportKey: string | null;
  collectedAt: string | null;
  cached: boolean;
  quota: OddsQuota | null;
  retryAt: string | null;
  sports: OddsSport[];
  candidates: OddsCandidate[];
  quoteId: string | null;
}

export interface OddsConnectorStatus {
  configured: boolean;
  enabled: boolean;
  status: OddsSyncStatus;
  message: string;
  quota: OddsQuota | null;
  retryAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
}

export interface OddsSyncInput {
  pickId: string;
  sportKey?: string;
  candidateId?: string;
  confirmMatch?: boolean;
}
