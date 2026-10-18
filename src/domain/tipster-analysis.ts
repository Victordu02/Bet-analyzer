import Decimal from "decimal.js";
import { identity, matchesSegment, normalizedProfit } from "./calculations";
import type {
  AppState,
  Pick,
  Result,
  SegmentFilter,
  Strategy,
  Ticket,
  Tipster,
} from "./types";

export type ProofLevel = "declared" | "observed" | "simulated" | "executed";
export type SegmentAxis =
  | "sport"
  | "competition"
  | "market"
  | "odds"
  | "kind"
  | "timing"
  | "delay";

export interface AnalysisQuery {
  level: ProofLevel;
  filter?: SegmentFilter;
  from?: string;
  to?: string;
  strategyId?: string;
  phase?: "all" | "discovery" | "validation";
  simulationId?: string;
}

export interface AnalysisMetrics {
  count: number;
  settled: number;
  events: number;
  profitUnits: number | null;
  declaredProfitUnits: number | null;
  yield: number | null;
  winRate: number | null;
  averageOdds: number | null;
  maxDrawdownUnits: number | null;
  drawdownPct: null;
  dispersion: number | null;
  biggestWinShare: number | null;
  roiInterval: [number, number] | null;
  periodFrom: string | null;
  periodTo: string | null;
  durationDays: number | null;
  series: { at: string; value: number; pickId: string }[];
  references: string[];
  pickIds: string[];
  simulationIds: string[];
  excluded: number;
  missingProof: number;
  status: "insufficient" | "descriptive";
  message: string;
  categories: {
    single: number;
    accumulator: number;
    partial: number;
    cashout: number;
    promotion: number;
  };
  cashProfitCents: number | null;
  stakeCents: number | null;
}

export interface TipsterAnalysis {
  tipster: Tipster;
  metrics: AnalysisMetrics;
  proofCounts: Record<ProofLevel, number>;
  quality: {
    completeness: string;
    issues: string[];
    missingSource: number;
    missingSettlement: number;
    postEvent: number;
    corrected: number;
  };
  sports: string[];
  competitions: string[];
  markets: string[];
  observationFrom: string | null;
  observationTo: string | null;
  observationDays: number | null;
}

export interface SegmentDefinition {
  axis: SegmentAxis;
  key: string;
  label: string;
  filter: SegmentFilter;
}

export interface AnalysisBand {
  key: string;
  label: string;
  min: number;
  max?: number;
}

export const ODDS_BANDS: readonly AnalysisBand[] = [
  { key: "odds-1-1.5", label: "Cote [1 ; 1,5[", min: 1, max: 1.5 },
  { key: "odds-1.5-2", label: "Cote [1,5 ; 2[", min: 1.5, max: 2 },
  { key: "odds-2-3", label: "Cote [2 ; 3[", min: 2, max: 3 },
  { key: "odds-3-5", label: "Cote [3 ; 5[", min: 3, max: 5 },
  { key: "odds-5-plus", label: "Cote ≥ 5", min: 5 },
];

export const DELAY_BANDS: readonly AnalysisBand[] = [
  {
    key: "delay-negative",
    label: "Publication après début (< 0 min)",
    min: Number.NEGATIVE_INFINITY,
    max: 0,
  },
  { key: "delay-0-60", label: "Délai [0 ; 60 min[", min: 0, max: 60 },
  { key: "delay-60-360", label: "Délai [1 h ; 6 h[", min: 60, max: 360 },
  { key: "delay-360-1440", label: "Délai [6 h ; 24 h[", min: 360, max: 1440 },
  { key: "delay-1440-plus", label: "Délai ≥ 24 h", min: 1440 },
];

interface Observation {
  pick: Pick;
  original: Pick;
  level: ProofLevel;
  reference: string;
  references: string[];
  at: string;
  knownAt: string;
  result: Result;
  settledAt: string | null;
  odds: number;
  declaredStake: number | null;
  stakeCents: number | null;
  cashProfitCents: number | null;
  unitProfit: number | null;
  simulationId: string | null;
  promotion: boolean;
  partialCashout: boolean;
  proofIssue: string | null;
  excludedReason: string | null;
  ticket: Ticket | null;
}

const millisecondsPerDay = 86_400_000;
const timestamp = (value: string | null): number =>
  value == null ? Number.NaN : Date.parse(value);
const validOdds = (value: number): boolean =>
  Number.isFinite(value) && value > 1;
const canonicalText = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/\s+/g, " ");
const distinct = (values: string[]): string[] =>
  [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "fr"),
  );
const validMoney = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;
const settledStandard = (result: Result): boolean =>
  ["won", "lost", "void"].includes(result);
const eventKey = (pick: Pick): string =>
  canonicalText(pick.eventKey || `${pick.event}|${pick.startsAt}`);

const materialFields: (keyof Pick)[] = [
  "tipsterId",
  "event",
  "eventKey",
  "sport",
  "competition",
  "market",
  "selection",
  "line",
  "rules",
  "odds",
  "kind",
  "timing",
  "publishedAt",
  "observedAt",
  "startsAt",
  "evidence",
];

/** Reconstruct only persisted prior values. An incomplete content revision is not prospective evidence. */
function snapshotAt(
  pick: Pick,
  cutoff: number,
): { pick: Pick; reconstructible: boolean } {
  let snapshot = { ...pick };
  let reconstructible = Number.isFinite(cutoff);
  const revisions = pick.revisions
    .map((revision, index) => ({ ...revision, index }))
    .sort(
      (left, right) =>
        timestamp(right.at) - timestamp(left.at) || right.index - left.index,
    );
  for (const revision of revisions) {
    if (!Number.isFinite(timestamp(revision.at))) {
      reconstructible = false;
      continue;
    }
    if (timestamp(revision.at) <= cutoff) continue;
    const previous = revision.previous;
    const containsContent = materialFields.some((field) =>
      Object.hasOwn(previous, field),
    );
    if (
      containsContent &&
      !materialFields.every((field) => Object.hasOwn(previous, field))
    )
      reconstructible = false;
    if (!Object.keys(previous).length) reconstructible = false;
    snapshot = { ...snapshot, ...previous, revisions: pick.revisions } as Pick;
  }
  return { pick: snapshot, reconstructible };
}

function firstObservation(pick: Pick): { pick: Pick; valid: boolean } {
  const reconstructed = snapshotAt(pick, timestamp(pick.observedAt));
  const original = reconstructed.pick;
  const valid =
    reconstructed.reconstructible &&
    original.evidence === "observed" &&
    Number.isFinite(timestamp(original.publishedAt)) &&
    Number.isFinite(timestamp(original.observedAt)) &&
    Number.isFinite(timestamp(original.startsAt)) &&
    timestamp(original.publishedAt) <= timestamp(original.observedAt) &&
    timestamp(original.observedAt) < timestamp(original.startsAt);
  return { pick: original, valid };
}

function sourceObservation(
  pick: Pick,
  original: Pick,
  level: "declared" | "observed",
): Observation {
  const result = original.result;
  const hasSettlement =
    result === "open" ||
    (Number.isFinite(timestamp(original.settledAt)) &&
      Boolean(original.settlementSource.trim()));
  const supported = settledStandard(result) && validOdds(pick.odds);
  return {
    pick,
    original,
    level,
    reference: `pick:${original.id}`,
    references: [`pick:${original.id}`],
    at: level === "observed" ? pick.observedAt : pick.publishedAt,
    knownAt: pick.observedAt,
    result,
    settledAt: original.settledAt,
    odds: pick.odds,
    declaredStake:
      Number.isFinite(pick.stakeUnits) && pick.stakeUnits > 0
        ? pick.stakeUnits
        : null,
    stakeCents: null,
    cashProfitCents: null,
    unitProfit:
      supported && hasSettlement ? normalizedProfit({ ...pick, result }) : null,
    simulationId: null,
    promotion: false,
    partialCashout: false,
    proofIssue: hasSettlement
      ? null
      : "Règlement sans date ou provenance documentée.",
    excludedReason:
      result !== "open" && !supported
        ? "Règlement partiel, cashout ou cote non normalisable."
        : null,
    ticket: null,
  };
}

function materialIdentityUnchanged(before: Pick, after: Pick): boolean {
  const settlementIdentity: (keyof Pick)[] = [
    "event",
    "eventKey",
    "market",
    "selection",
    "line",
    "rules",
    "kind",
    "startsAt",
  ];
  return settlementIdentity.every((field) => before[field] === after[field]);
}

function observations(state: AppState, level: ProofLevel): Observation[] {
  const rows: Observation[] = [];
  if (level === "declared" || level === "observed") {
    for (const current of state.picks) {
      const first = firstObservation(current);
      if (level === "observed" && first.valid) {
        const row = sourceObservation(first.pick, current, "observed");
        if (!materialIdentityUnchanged(first.pick, current))
          row.proofIssue =
            "La sélection corrigée ne permet pas d’attribuer son règlement à l’observation initiale.";
        rows.push(row);
      }
      if (
        level === "declared" &&
        (current.evidence === "declared" || !first.valid)
      )
        rows.push(sourceObservation(current, current, "declared"));
    }
    return rows;
  }

  if (level === "simulated") {
    for (const simulation of state.simulations) {
      const allocatedIdentities = new Set<string>();
      for (const allocation of simulation.allocations) {
        const current = state.picks.find(
          (pick) => pick.id === allocation.pickId,
        );
        if (!current) continue;
        const asKnown = snapshotAt(current, timestamp(simulation.createdAt));
        const pick = asKnown.pick;
        const latestQuote = state.quotes
          .filter(
            (quote) =>
              quote.pickId === pick.id &&
              !quote.closing &&
              timestamp(quote.observedAt) >= timestamp(pick.publishedAt) &&
              timestamp(quote.observedAt) <= timestamp(quote.recordedAt) &&
              timestamp(quote.recordedAt) <= timestamp(simulation.createdAt),
          )
          .sort(
            (left, right) =>
              timestamp(right.observedAt) - timestamp(left.observedAt) ||
              timestamp(right.recordedAt) - timestamp(left.recordedAt) ||
              left.id.localeCompare(right.id),
          )[0];
        const quotes =
          latestQuote &&
          latestQuote.odds === allocation.odds &&
          latestQuote.available &&
          latestQuote.matchConfirmed &&
          latestQuote.source.trim() &&
          timestamp(simulation.createdAt) - timestamp(latestQuote.observedAt) <=
            simulation.settingsSnapshot.quoteMaxAgeMinutes * 60_000
            ? [latestQuote]
            : [];
        const duplicate = allocatedIdentities.has(allocation.identity);
        if (allocation.stakeCents > 0)
          allocatedIdentities.add(allocation.identity);
        let proofIssue: string | null = null;
        if (
          !asKnown.reconstructible ||
          timestamp(pick.observedAt) > timestamp(simulation.createdAt) ||
          timestamp(pick.startsAt) <= timestamp(simulation.createdAt) ||
          timestamp(pick.publishedAt) > timestamp(simulation.createdAt)
        )
          proofIssue =
            "Chronologie ou contenu du scénario non vérifiable avant événement.";
        else if (
          identity(pick) !== allocation.identity ||
          !validOdds(allocation.odds) ||
          !validMoney(allocation.stakeCents)
        )
          proofIssue =
            "Allocation incompatible avec l’identité ou les montants du scénario.";
        else if (!quotes.length)
          proofIssue =
            "Aucune cote Winamax comparable, récente et connue à la date du scénario.";
        else if (duplicate)
          proofIssue =
            "Même sélection répétée dans le scénario ; doublon non agrégé.";
        const row = sourceObservation(
          { ...pick, odds: allocation.odds },
          current,
          "declared",
        );
        row.level = "simulated";
        row.reference = `simulation:${simulation.id}`;
        row.references = [
          `simulation:${simulation.id}`,
          `pick:${pick.id}`,
          ...(latestQuote ? [`quote:${latestQuote.id}`] : []),
        ];
        row.at = simulation.createdAt;
        row.knownAt = simulation.createdAt;
        row.simulationId = simulation.id;
        row.declaredStake = null;
        row.stakeCents = allocation.stakeCents;
        row.proofIssue = proofIssue ?? row.proofIssue;
        if (!allocation.stakeCents)
          row.excludedReason = "Abstention conservée : aucune mise simulée.";
        if (!materialIdentityUnchanged(pick, current))
          row.proofIssue =
            "Le contenu corrigé après simulation ne permet pas d’attribuer son règlement à la sélection initiale.";
        if (
          row.unitProfit != null &&
          !row.proofIssue &&
          !row.excludedReason &&
          allocation.stakeCents > 0
        ) {
          const returnCents =
            current.result === "won"
              ? new Decimal(allocation.stakeCents)
                  .times(allocation.odds)
                  .floor()
              : current.result === "void"
                ? new Decimal(allocation.stakeCents)
                : new Decimal(0);
          row.cashProfitCents = returnCents
            .minus(allocation.stakeCents)
            .toNumber();
          if (!Number.isSafeInteger(row.cashProfitCents))
            row.proofIssue = "Résultat simulé hors limites monétaires.";
        }
        rows.push(row);
      }
    }
    return rows;
  }

  for (const ticket of state.tickets) {
    const current = state.picks.find((pick) => pick.id === ticket.pickId);
    if (!current) continue; // Unlinked tickets cannot be attributed to a tipster.
    const asKnown = snapshotAt(current, timestamp(ticket.placedAt));
    const pick = {
      ...asKnown.pick,
      event: ticket.event,
      eventKey: ticket.eventKey,
      market: ticket.market,
      selection: ticket.selection,
      line: ticket.line,
      rules: ticket.rules,
      kind: ticket.kind,
      odds: ticket.odds,
    };
    const row = sourceObservation(pick, current, "declared");
    row.level = "executed";
    row.ticket = ticket;
    row.reference = `ticket:${ticket.id}`;
    row.references = [`ticket:${ticket.id}`, `pick:${current.id}`];
    row.at = ticket.placedAt;
    row.knownAt = ticket.placedAt;
    row.result = ticket.result;
    row.settledAt = ticket.settledAt;
    row.declaredStake = null;
    row.stakeCents = ticket.stakeCents;
    row.promotion = ticket.funding === "freebet";
    row.partialCashout = ticket.partialCashout;
    row.proofIssue = !asKnown.reconstructible
      ? "Attribution du ticket à un segment historique non reconstructible."
      : !ticket.source.trim() || !ticket.id.trim()
        ? "Ticket sans identifiant interne ou provenance d’exécution."
        : null;
    if (
      ![ticket.stakeCents, ticket.returnCents, ticket.feeCents].every(
        validMoney,
      ) ||
      ticket.stakeCents <= 0
    )
      row.proofIssue = "Montants du ticket incomplets ou invalides.";
    if (
      ticket.result !== "open" &&
      !Number.isFinite(timestamp(ticket.settledAt))
    )
      row.proofIssue = "Date de règlement du ticket manquante.";
    row.excludedReason =
      ticket.funding === "freebet"
        ? "Promotion séparée des résultats cash standard."
        : ticket.partialCashout ||
            (!settledStandard(ticket.result) && ticket.result !== "open")
          ? "Cashout ou règlement partiel séparé des résultats standard."
          : null;
    row.unitProfit = null;
    row.cashProfitCents = null;
    if (
      ticket.result !== "open" &&
      !ticket.partialCashout &&
      ticket.funding === "cash" &&
      !row.proofIssue
    ) {
      row.cashProfitCents = new Decimal(ticket.returnCents)
        .minus(ticket.stakeCents)
        .minus(ticket.feeCents)
        .toNumber();
      if (!row.excludedReason)
        row.unitProfit = normalizedProfit({ ...pick, result: ticket.result });
    }
    rows.push(row);
  }
  return rows;
}

function validFreeze(strategy: Strategy): boolean {
  return (
    timestamp(strategy.createdAt) <= timestamp(strategy.frozenAt) &&
    timestamp(strategy.discoveryEnd) <= timestamp(strategy.frozenAt) &&
    timestamp(strategy.frozenAt) <= timestamp(strategy.validationStart)
  );
}

function queryRows(
  state: AppState,
  query: AnalysisQuery,
): { rows: Observation[]; issues: string[]; invalid: boolean } {
  const strategy = query.strategyId
    ? state.strategies.find((item) => item.id === query.strategyId)
    : undefined;
  const phase = query.phase ?? "all";
  const issues: string[] = [];
  let invalid = false;
  if (query.strategyId && !strategy) {
    issues.push("Stratégie introuvable.");
    invalid = true;
  }
  if (phase !== "all" && (!strategy || !validFreeze(strategy))) {
    issues.push(
      "Règles non figées après découverte et avant validation : comparaison prospective indisponible.",
    );
    invalid = true;
  }
  if (
    (query.from && !Number.isFinite(timestamp(query.from))) ||
    (query.to && !Number.isFinite(timestamp(query.to))) ||
    (query.from && query.to && timestamp(query.from) >= timestamp(query.to))
  ) {
    issues.push("Période d’analyse invalide.");
    invalid = true;
  }

  let rows = observations(state, query.level).filter(
    (row) => !query.simulationId || row.simulationId === query.simulationId,
  );
  if (phase === "discovery" && strategy && !invalid) {
    issues.push(
      "Découverte limitée aux enregistrements et règlements connus avant sa fin ; un historique importé plus tard n’est pas antidaté.",
    );
    rows = rows
      .map((row) => {
        const asKnown = snapshotAt(
          row.original,
          timestamp(strategy.discoveryEnd),
        );
        const snapshot = query.level === "declared" ? asKnown.pick : row.pick;
        let updated = { ...row, pick: snapshot };
        if (query.level === "declared" || query.level === "observed") {
          updated = sourceObservation(snapshot, asKnown.pick, query.level);
          if (
            query.level === "observed" &&
            !materialIdentityUnchanged(snapshot, asKnown.pick)
          )
            updated.proofIssue =
              "Le règlement de découverte concerne une sélection corrigée, pas l’observation initiale.";
        } else if (query.level === "simulated") {
          updated.result = asKnown.pick.result;
          updated.settledAt = asKnown.pick.settledAt;
          updated.unitProfit =
            settledStandard(updated.result) &&
            Boolean(asKnown.pick.settlementSource.trim())
              ? normalizedProfit({
                  ...row.pick,
                  odds: row.odds,
                  result: updated.result,
                })
              : null;
          updated.cashProfitCents =
            updated.unitProfit == null
              ? null
              : new Decimal(row.stakeCents!)
                  .times(new Decimal(updated.unitProfit).plus(1))
                  .floor()
                  .minus(row.stakeCents!)
                  .toNumber();
        } else if (row.ticket) {
          let historicalTicket = { ...row.ticket };
          const ticketRevisions = row.ticket.revisions
            .map((revision, index) => ({ ...revision, index }))
            .sort(
              (left, right) =>
                timestamp(right.at) - timestamp(left.at) ||
                right.index - left.index,
            );
          for (const revision of ticketRevisions) {
            if (timestamp(revision.at) > timestamp(strategy.discoveryEnd))
              historicalTicket = {
                ...historicalTicket,
                ...revision.previous,
              } as Ticket;
          }
          updated.result = historicalTicket.result;
          updated.pick = {
            ...row.pick,
            event: historicalTicket.event,
            eventKey: historicalTicket.eventKey,
            market: historicalTicket.market,
            selection: historicalTicket.selection,
            line: historicalTicket.line,
            rules: historicalTicket.rules,
            kind: historicalTicket.kind,
            odds: historicalTicket.odds,
          };
          updated.settledAt = historicalTicket.settledAt;
          updated.odds = historicalTicket.odds;
          updated.stakeCents = historicalTicket.stakeCents;
          updated.at = historicalTicket.placedAt;
          updated.knownAt = historicalTicket.placedAt;
          updated.promotion = historicalTicket.funding === "freebet";
          updated.partialCashout = historicalTicket.partialCashout;
          updated.excludedReason =
            historicalTicket.funding === "freebet"
              ? "Promotion séparée des résultats cash standard."
              : historicalTicket.partialCashout ||
                  (!settledStandard(historicalTicket.result) &&
                    historicalTicket.result !== "open")
                ? "Cashout ou règlement partiel séparé des résultats standard."
                : null;
          updated.unitProfit =
            !updated.proofIssue &&
            !updated.excludedReason &&
            settledStandard(updated.result)
              ? normalizedProfit({
                  ...row.pick,
                  odds: updated.odds,
                  result: updated.result,
                })
              : null;
          updated.cashProfitCents =
            historicalTicket.result !== "open" &&
            !historicalTicket.partialCashout &&
            historicalTicket.funding === "cash"
              ? new Decimal(historicalTicket.returnCents)
                  .minus(historicalTicket.stakeCents)
                  .minus(historicalTicket.feeCents)
                  .toNumber()
              : null;
        }
        if (!asKnown.reconstructible)
          updated.proofIssue =
            "Historique connu à la fin de découverte non reconstructible.";
        if (
          timestamp(updated.settledAt) > timestamp(strategy.discoveryEnd) ||
          !Number.isFinite(timestamp(updated.settledAt))
        ) {
          updated.result = "open";
          updated.unitProfit = null;
          updated.cashProfitCents = null;
        }
        return updated;
      })
      .filter(
        (row) =>
          timestamp(row.knownAt) <= timestamp(strategy.discoveryEnd) &&
          timestamp(row.pick.startsAt) <= timestamp(strategy.discoveryEnd),
      );
  }
  if (phase === "validation" && strategy && !invalid) {
    if (query.level === "declared") {
      issues.push(
        "L’historique déclaré ne constitue pas une validation prospective.",
      );
      rows = [];
    } else
      rows = rows.filter((row) => {
        const first = firstObservation(row.original);
        return (
          first.valid &&
          timestamp(first.pick.observedAt) >=
            timestamp(strategy.validationStart) &&
          timestamp(row.knownAt) >= timestamp(strategy.validationStart) &&
          timestamp(row.knownAt) >= timestamp(strategy.frozenAt) &&
          timestamp(row.knownAt) < timestamp(row.pick.startsAt)
        );
      });
  }
  rows = rows.filter(
    (row) =>
      (!query.filter || matchesSegment(row.pick, query.filter)) &&
      (!strategy || matchesSegment(row.pick, strategy.filter)) &&
      (!query.from || timestamp(row.at) >= timestamp(query.from)) &&
      (!query.to || timestamp(row.at) < timestamp(query.to)),
  );
  const scenarioIds = distinct(rows.map((row) => row.simulationId ?? ""));
  if (
    query.level === "simulated" &&
    scenarioIds.length > 1 &&
    !query.simulationId
  ) {
    issues.push(
      "Plusieurs scénarios : sélectionnez une simulation pour comparer ses résultats sans multiplier les pronostics.",
    );
    invalid = true;
  }
  return { rows, issues, invalid };
}

function eventBootstrap(rows: Observation[]): [number, number] | null {
  const grouped = new Map<string, { profit: number; count: number }>();
  for (const row of [...rows].sort(
    (left, right) =>
      left.reference.localeCompare(right.reference) ||
      left.pick.id.localeCompare(right.pick.id),
  )) {
    const key = eventKey(row.pick);
    const group = grouped.get(key) ?? { profit: 0, count: 0 };
    group.profit = new Decimal(group.profit).plus(row.unitProfit!).toNumber();
    group.count += 1;
    grouped.set(key, group);
  }
  const clusters = [...grouped.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (clusters.length < 2) return null;
  let seed = 2166136261;
  for (const character of JSON.stringify(clusters))
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const samples: number[] = [];
  for (let iteration = 0; iteration < 1000; iteration += 1) {
    let profit = 0;
    let count = 0;
    for (let index = 0; index < clusters.length; index += 1) {
      const cluster = clusters[Math.floor(random() * clusters.length)][1];
      profit += cluster.profit;
      count += cluster.count;
    }
    samples.push(profit / count);
  }
  samples.sort((left, right) => left - right);
  return [samples[24], samples[974]];
}

function metricsFor(
  rows: Observation[],
  level: ProofLevel,
  issues: string[] = [],
  invalid = false,
): AnalysisMetrics {
  const covered = invalid
    ? []
    : rows.filter(
        (row) =>
          !row.proofIssue &&
          !row.excludedReason &&
          row.unitProfit != null &&
          Number.isFinite(row.unitProfit),
      );
  const dates = rows
    .map((row) => row.at)
    .filter((value) => Number.isFinite(timestamp(value)))
    .sort((left, right) => timestamp(left) - timestamp(right));
  const chronological = [...covered].sort(
    (left, right) =>
      timestamp(left.settledAt) - timestamp(right.settledAt) ||
      left.pick.id.localeCompare(right.pick.id),
  );
  const profit = covered.reduce(
    (sum, row) => sum.plus(row.unitProfit!),
    new Decimal(0),
  );
  let accumulated = new Decimal(0);
  let peak = 0;
  let maxDrawdown = 0;
  const series: AnalysisMetrics["series"] = [];
  const settlementGroups = new Map<string, Observation[]>();
  for (const row of chronological) {
    const at = new Date(row.settledAt!).toISOString();
    settlementGroups.set(at, [...(settlementGroups.get(at) ?? []), row]);
  }
  for (const [at, group] of settlementGroups) {
    accumulated = group.reduce(
      (sum, row) => sum.plus(row.unitProfit!),
      accumulated,
    );
    peak = Math.max(peak, accumulated.toNumber());
    maxDrawdown = Math.max(
      maxDrawdown,
      new Decimal(peak).minus(accumulated).toNumber(),
    );
    series.push({
      at,
      value: accumulated.toNumber(),
      pickId: group[0].pick.id,
    });
  }
  const positive = covered
    .filter((row) => row.unitProfit! > 0)
    .map((row) => row.unitProfit!);
  const positiveTotal = positive.reduce((sum, value) => sum + value, 0);
  const mean = covered.length ? profit.div(covered.length) : null;
  const variance =
    covered.length > 1
      ? covered
          .reduce(
            (sum, row) =>
              sum.plus(new Decimal(row.unitProfit!).minus(mean!).pow(2)),
            new Decimal(0),
          )
          .div(covered.length - 1)
      : null;
  const decisive = covered.filter((row) => row.result !== "void");
  const declaredComplete = covered.every((row) => row.declaredStake != null);
  const cashCovered = invalid
    ? []
    : rows.filter(
        (row) =>
          !row.proofIssue && row.cashProfitCents != null && !row.promotion,
      );
  const monetaryProfit = cashCovered.length
    ? cashCovered
        .reduce((sum, row) => sum.plus(row.cashProfitCents!), new Decimal(0))
        .toNumber()
    : null;
  const monetaryStakes = cashCovered.length
    ? cashCovered
        .reduce((sum, row) => sum.plus(row.stakeCents ?? 0), new Decimal(0))
        .toNumber()
    : null;
  const roiInterval = eventBootstrap(covered);
  const message = [
    ...issues,
    !covered.length
      ? "Données insuffisantes pour conclure : aucun règlement standard documenté dans cette population."
      : !roiInterval
        ? "Données insuffisantes pour conclure : moins de deux groupes d’événements réglés, intervalle descriptif indisponible."
        : "Description de résultats passés ; aucune spécialité rentable ni significativité démontrée.",
    "Drawdown en unités disponible selon couverture ; drawdown en pourcentage et valeur de part non applicables sans capital ni flux propres au profil.",
    rows.some((row) => row.pick.kind === "accumulator")
      ? "Combinés comptés une fois par ticket ; événements constitutifs et dépendances entre combinés non documentés."
      : "",
    rows.some((row) => row.proofIssue)
      ? "Des données sans preuve suffisante restent visibles et sont exclues des résultats."
      : "",
    level === "executed"
      ? "Résultat cash net des frais associés aux tickets ; abonnements globaux non réaffectés au profil."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    count: rows.length,
    settled: covered.length,
    events: new Set(rows.map((row) => eventKey(row.pick))).size,
    profitUnits: covered.length ? profit.toNumber() : null,
    declaredProfitUnits:
      (level === "declared" || level === "observed") &&
      covered.length &&
      declaredComplete
        ? covered
            .reduce(
              (sum, row) =>
                sum.plus(
                  new Decimal(row.unitProfit!).times(row.declaredStake!),
                ),
              new Decimal(0),
            )
            .toNumber()
        : null,
    yield: mean?.toNumber() ?? null,
    winRate: decisive.length
      ? decisive.filter((row) => row.result === "won").length / decisive.length
      : null,
    averageOdds: covered.length
      ? covered
          .reduce((sum, row) => sum.plus(row.odds), new Decimal(0))
          .div(covered.length)
          .toNumber()
      : null,
    maxDrawdownUnits: covered.length ? maxDrawdown : null,
    drawdownPct: null,
    dispersion: variance?.sqrt().toNumber() ?? null,
    biggestWinShare: positiveTotal
      ? positive.reduce((largest, value) => Math.max(largest, value), 0) /
        positiveTotal
      : null,
    roiInterval,
    periodFrom: dates[0] ?? null,
    periodTo: dates.at(-1) ?? null,
    durationDays: dates.length
      ? (timestamp(dates.at(-1)!) - timestamp(dates[0])) / millisecondsPerDay
      : null,
    series,
    references: distinct(rows.flatMap((row) => row.references)),
    pickIds: distinct(rows.map((row) => row.pick.id)),
    simulationIds: distinct(rows.map((row) => row.simulationId ?? "")),
    excluded: rows.filter((row) => row.excludedReason != null).length,
    missingProof: rows.filter((row) => row.proofIssue != null).length,
    status: roiInterval ? "descriptive" : "insufficient",
    message,
    categories: {
      single: rows.filter((row) => row.pick.kind === "single").length,
      accumulator: rows.filter((row) => row.pick.kind === "accumulator").length,
      partial: rows.filter(
        (row) =>
          ["half_won", "half_lost"].includes(row.result) || row.partialCashout,
      ).length,
      cashout: rows.filter((row) => row.result === "cashout").length,
      promotion: rows.filter((row) => row.promotion).length,
    },
    cashProfitCents:
      monetaryProfit != null && Number.isSafeInteger(monetaryProfit)
        ? monetaryProfit
        : null,
    stakeCents:
      monetaryStakes != null && Number.isSafeInteger(monetaryStakes)
        ? monetaryStakes
        : null,
  };
}

export function analyzeSegment(
  state: AppState,
  query: AnalysisQuery,
): AnalysisMetrics {
  const selected = queryRows(state, query);
  return metricsFor(
    selected.rows,
    query.level,
    selected.issues,
    selected.invalid,
  );
}

export function analyzeTipsters(
  state: AppState,
  query: AnalysisQuery,
  now: Date = new Date(),
): TipsterAnalysis[] {
  const selected = queryRows(state, query);
  const populations = Object.fromEntries(
    (["declared", "observed", "simulated", "executed"] as const).map(
      (level) => [level, observations(state, level)],
    ),
  ) as Record<ProofLevel, Observation[]>;
  return state.tipsters.map((tipster) => {
    const rows = selected.rows.filter(
      (row) => row.pick.tipsterId === tipster.id,
    );
    const allRows = Object.values(populations)
      .flat()
      .filter((row) => row.pick.tipsterId === tipster.id);
    const picks = state.picks.filter((pick) => pick.tipsterId === tipster.id);
    const observed = populations.observed.filter(
      (row) => row.pick.tipsterId === tipster.id,
    );
    const observationDates = observed
      .map((row) => row.pick.observedAt)
      .filter((value) => Number.isFinite(timestamp(value)))
      .sort((left, right) => timestamp(left) - timestamp(right));
    const observationFrom = observationDates[0] ?? null;
    const observationTo = observationDates.at(-1) ?? null;
    const missingSource = picks.filter(
      (pick) => !pick.sourceId.trim() || !pick.sourceUrl.trim(),
    ).length;
    const missingSettlement = picks.filter(
      (pick) =>
        pick.result !== "open" &&
        (!pick.settlementSource.trim() ||
          !Number.isFinite(timestamp(pick.settledAt))),
    ).length;
    const postEvent = picks.filter(
      (pick) =>
        !Number.isFinite(timestamp(pick.observedAt)) ||
        timestamp(pick.observedAt) >= timestamp(pick.startsAt),
    ).length;
    const corrected = picks.filter(
      (pick) => pick.revisions.length || pick.manuallyCorrected,
    ).length;
    const issues = [
      tipster.completeness === "unknown"
        ? "Exhaustivité non vérifiable."
        : "Exhaustivité déclarée complète par la source, non auditée indépendamment.",
      missingSource
        ? `${missingSource} pronostic(s) avec identifiant ou URL de source manquants.`
        : "",
      missingSettlement
        ? `${missingSettlement} règlement(s) sans date ou provenance.`
        : "",
      postEvent
        ? `${postEvent} observation(s) postérieures à l’événement ou mal horodatées.`
        : "",
      corrected
        ? `${corrected} pronostic(s) révisés ; les observations initiales sont conservées lorsque reconstructibles.`
        : "",
    ].filter(Boolean);
    return {
      tipster,
      metrics: metricsFor(rows, query.level, selected.issues, selected.invalid),
      proofCounts: Object.fromEntries(
        Object.entries(populations).map(([level, items]) => {
          const profileRows = items.filter(
            (row) => row.pick.tipsterId === tipster.id,
          );
          if (level === "simulated")
            return [
              level,
              new Set(
                profileRows
                  .filter((row) => !row.proofIssue && (row.stakeCents ?? 0) > 0)
                  .map((row) => row.pick.id),
              ).size,
            ];
          if (level === "executed")
            return [level, profileRows.filter((row) => !row.proofIssue).length];
          return [level, profileRows.length];
        }),
      ) as Record<ProofLevel, number>,
      quality: {
        completeness:
          tipster.completeness === "unknown"
            ? "Exhaustivité non vérifiable"
            : "Exhaustivité déclarée complète",
        issues,
        missingSource,
        missingSettlement,
        postEvent,
        corrected,
      },
      sports: distinct(allRows.map((row) => row.pick.sport)),
      competitions: distinct(allRows.map((row) => row.pick.competition)),
      markets: distinct(allRows.map((row) => row.pick.market)),
      observationFrom,
      observationTo,
      observationDays: observationFrom
        ? Math.max(
            0,
            (Math.min(now.getTime(), timestamp(observationTo!)) -
              timestamp(observationFrom)) /
              millisecondsPerDay,
          )
        : null,
    };
  });
}

export function strategyAnalysis(
  state: AppState,
  strategyId: string,
  level: ProofLevel,
  simulationId?: string,
): {
  strategy: Strategy | null;
  validFreeze: boolean;
  discovery: AnalysisMetrics;
  validation: AnalysisMetrics;
  issues: string[];
} {
  const strategy =
    state.strategies.find((item) => item.id === strategyId) ?? null;
  const frozen = strategy != null && validFreeze(strategy);
  const issues = frozen
    ? [
        "Découverte et validation restent des descriptions séparées ; aucun seuil d’effectif ni résultat positif ne prouve un avantage.",
      ]
    : [
        "Chronologie de gel invalide : aucune validation prospective revendiquée.",
      ];
  return {
    strategy,
    validFreeze: frozen,
    discovery: analyzeSegment(state, {
      level,
      strategyId,
      simulationId,
      phase: "discovery",
    }),
    validation: analyzeSegment(state, {
      level,
      strategyId,
      simulationId,
      phase: "validation",
    }),
    issues,
  };
}

export function predefinedSegments(picks: Pick[]): SegmentDefinition[] {
  const definitions: SegmentDefinition[] = [];
  for (const axis of ["sport", "competition", "market"] as const) {
    const categories = new Map<string, string>();
    for (const pick of picks) {
      if (pick[axis].trim())
        categories.set(canonicalText(pick[axis]), pick[axis].trim());
      for (const revision of pick.revisions) {
        const previous = revision.previous[axis];
        if (typeof previous === "string" && previous.trim())
          categories.set(canonicalText(previous), previous.trim());
      }
    }
    for (const [key, label] of [...categories.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      definitions.push({
        axis,
        key: `${axis}:${key}`,
        label,
        filter: { [axis]: label },
      });
    }
  }
  for (const band of ODDS_BANDS)
    definitions.push({
      axis: "odds",
      key: band.key,
      label: band.label,
      filter: {
        oddsMin: band.min,
        ...(band.max == null ? {} : { oddsMax: band.max }),
      },
    });
  definitions.push(
    {
      axis: "kind",
      key: "kind:single",
      label: "Simple",
      filter: { kind: "single" },
    },
    {
      axis: "kind",
      key: "kind:accumulator",
      label: "Combiné · une mise par ticket",
      filter: { kind: "accumulator" },
    },
  );
  definitions.push(
    {
      axis: "timing",
      key: "timing:prematch",
      label: "Avant-match",
      filter: { timing: "prematch" },
    },
    {
      axis: "timing",
      key: "timing:live",
      label: "Live",
      filter: { timing: "live" },
    },
  );
  for (const band of DELAY_BANDS)
    definitions.push({
      axis: "delay",
      key: band.key,
      label: band.label,
      filter: {
        ...(Number.isFinite(band.min) ? { delayMinMinutes: band.min } : {}),
        ...(band.max == null ? {} : { delayMaxMinutes: band.max }),
      },
    });
  return definitions;
}
