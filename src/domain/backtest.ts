import Decimal from "decimal.js";
import { allocate, bankroll, matchesSegment, normalizedProfit } from "./calculations";
import type { Allocation, AppState, Pick, Ticket } from "./types";

export interface BacktestOptions {
  strategyId: string;
  start: string;
  end: string;
  delayMinutes: number;
  method: "fixed" | "percent" | "kelly";
  initialCapitalCents: number;
}
export interface BacktestRow {
  pickId: string;
  eventKey: string;
  at: string | null;
  status: "abstained" | "open" | "settled" | "unresolved";
  reason: string;
  allocation: Allocation | null;
  profitCents: number | null;
  benchmarkUnits: number | null;
}
export interface BacktestResult {
  status: "evaluated" | "insufficient";
  reason: string;
  candidateCount: number;
  allocatedCount: number;
  settledCount: number;
  abstentionCount: number;
  coverage: number | null;
  profitCents: number;
  endingCapitalCents: number;
  benchmark1u: number | null;
  roi: number | null;
  drawdownPct: number;
  rows: BacktestRow[];
  assumptions: string[];
  calibration: { brier: null; logLoss: null };
}

/** A replay of explicit observations, not a fitted model or evidence of a profitable strategy. */
export function backtest(state: AppState, options: BacktestOptions): BacktestResult {
  const start = Date.parse(options.start);
  const end = Date.parse(options.end);
  const strategy = state.strategies.find(item => item.id === options.strategyId);
  const assumptions = [
    "Période de début d’événement [début, fin[. Règles figées avant la validation et avant le test. Aucun réglage ni recherche de meilleur segment dans ce rejeu.",
    "Pronostics observés avant événement uniquement. Premier relevé après publication + délai ; disponibilité évaluée à l’instant où observation ET enregistrement sont connus. Aucune cote de clôture.",
    "Premier relevé indisponible, ambigu ou ancien : abstention conservée. Aucun remplacement opportuniste par une cote ultérieure plus favorable.",
    "Paramètres de risque actuels et capital initial du scénario ; ce ne sont pas des paramètres historiques prouvés. Tous les profils du segment restent inclus, même devenus inactifs.",
    "Les tickets simulés se règlent chronologiquement aux résultats documentés. Cotes annoncées et clôtures ne remplacent pas une cote Winamax observée. Frais et coûts d’abonnement non simulés.",
    "Doublons et événements communs partagent les plafonds ; les mises ouvertes et allocations déjà prises diminuent le budget. Aucune hypothèse d’indépendance des sélections d’un même événement.",
    "Référence 1 unité : mêmes sélections simulées et réglées, à leur cote Winamax disponible. Elle compare la méthode de mise, pas les sélections manquées.",
    "Aucune prévision probabiliste historique immuable disponible : espérance, calibration et Kelly indisponibles. Pas de modèle validé ni de test final hors échantillon déclaré.",
    "Les corrections de pronostics empêchant de reconstituer leur contenu connu au moment de la décision sont exclues. Résultats révisés après la fin du test : non évalués.",
  ];
  const empty = (reason: string): BacktestResult => ({ status: "insufficient", reason, candidateCount: 0, allocatedCount: 0, settledCount: 0, abstentionCount: 0, coverage: null, profitCents: 0, endingCapitalCents: options.initialCapitalCents, benchmark1u: null, roi: null, drawdownPct: 0, rows: [], assumptions, calibration: { brier: null, logLoss: null } });
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return empty("Période de test invalide.");
  if (!Number.isSafeInteger(options.initialCapitalCents) || options.initialCapitalCents <= 0 || !Number.isFinite(options.delayMinutes) || options.delayMinutes < 0) return empty("Capital positif en centimes et délai positif ou nul requis.");
  if (!strategy) return empty("Stratégie introuvable.");
  if (!(Date.parse(strategy.createdAt) <= Date.parse(strategy.frozenAt) && Date.parse(strategy.discoveryEnd) <= Date.parse(strategy.frozenAt) && Date.parse(strategy.frozenAt) <= Date.parse(strategy.validationStart) && Date.parse(strategy.validationStart) <= start)) return empty("Les règles doivent être figées après découverte et avant validation ; le test doit commencer après le début de validation.");

  const candidates = state.picks.filter(pick => matchesSegment(pick, strategy.filter) && Date.parse(pick.startsAt) >= start && Date.parse(pick.startsAt) < end);
  const working: AppState = {
    ...structuredClone(state),
    tipsters: state.tipsters.map(tipster => ({ ...tipster, active: true })),
    picks: state.picks.map(pick => ({ ...pick, result: "open", settledAt: null })),
    strategies: [{ ...structuredClone(strategy), active: true }],
    tickets: [],
    ledger: [{ id: "backtest-initial", kind: "initial", amountCents: options.initialCapitalCents, at: new Date(start).toISOString(), description: "Capital du scénario, aucun mouvement réel", ticketId: null, revision: 1 }],
    simulations: [],
  };
  const rows: BacktestRow[] = [];
  const scheduled: { pick: Pick; at: number; row: BacktestRow }[] = [];
  const pending = new Map<string, { pick: Pick; row: BacktestRow }>();
  for (const pick of candidates) {
    const row: BacktestRow = { pickId: pick.id, eventKey: pick.eventKey, at: null, status: "abstained", reason: "", allocation: null, profitCents: null, benchmarkUnits: null };
    rows.push(row);
    if (pick.evidence !== "observed" || !(Date.parse(pick.observedAt) < Date.parse(pick.startsAt)) || !(Date.parse(pick.publishedAt) <= Date.parse(pick.observedAt))) { row.reason = "Historique déclaré ou observation postérieure à l’événement : aucune preuve prospective."; continue; }
    if (pick.revisions.length || pick.manuallyCorrected) { row.reason = "Pronostic révisé : contenu connu à la date de décision non reconstructible sans ambiguïté."; continue; }
    const earliest = Math.max(start, Date.parse(pick.observedAt), Date.parse(pick.publishedAt) + options.delayMinutes * 60_000);
    const observations = state.quotes.filter(quote => quote.pickId === pick.id && !quote.closing && Date.parse(quote.observedAt) >= earliest && Date.parse(quote.recordedAt) >= Date.parse(quote.observedAt))
      .map(quote => ({ quote, knownAt: Math.max(Date.parse(quote.observedAt), Date.parse(quote.recordedAt)) }))
      .filter(item => item.knownAt < end && item.knownAt < Date.parse(pick.startsAt))
      .sort((a, b) => a.knownAt - b.knownAt || Date.parse(a.quote.observedAt) - Date.parse(b.quote.observedAt) || a.quote.id.localeCompare(b.quote.id));
    if (!observations.length) { row.reason = "Pari manqué : aucun relevé Winamax hors clôture connu après le délai et avant l’événement."; continue; }
    scheduled.push({ pick, at: observations[0].knownAt, row });
  }
  scheduled.sort((a, b) => a.at - b.at || a.pick.id.localeCompare(b.pick.id));

  const settleUntil = (at: number) => {
    const due = [...pending.entries()].filter(([, item]) => item.pick.settledAt && Date.parse(item.pick.settledAt) <= at).sort(([, a], [, b]) => Date.parse(a.pick.settledAt!) - Date.parse(b.pick.settledAt!) || a.pick.id.localeCompare(b.pick.id));
    for (const [ticketId, item] of due) {
      const simulated = working.tickets.find(ticket => ticket.id === ticketId)!;
      const { pick, row } = item;
      if (Date.parse(pick.settledAt!) < Date.parse(simulated.placedAt) || !["won", "lost", "void"].includes(pick.result) || !pick.settlementSource.trim()) {
        row.status = "unresolved";
        row.reason += " Résultat standard, chronologie ou provenance du règlement insuffisants ; résultat non simulé.";
        pending.delete(ticketId);
        continue;
      }
      simulated.result = pick.result;
      simulated.settledAt = pick.settledAt;
      simulated.returnCents = pick.result === "won" ? new Decimal(simulated.stakeCents).times(simulated.odds).floor().toNumber() : pick.result === "void" ? simulated.stakeCents : 0;
      if (!Number.isSafeInteger(simulated.returnCents)) throw new RangeError("Retour simulé hors limites monétaires.");
      working.ledger.push({ id: `return-${ticketId}`, kind: "ticket_return", amountCents: simulated.returnCents, at: simulated.settledAt!, description: "Règlement fictif du scénario", ticketId, revision: 1 });
      row.status = "settled";
      row.profitCents = simulated.returnCents - simulated.stakeCents;
      row.benchmarkUnits = normalizedProfit({ ...pick, odds: simulated.odds });
      pending.delete(ticketId);
    }
  };

  for (const item of scheduled) {
    settleUntil(item.at);
    item.row.at = new Date(item.at).toISOString();
    working.quotes = state.quotes.filter(quote => Date.parse(quote.observedAt) <= item.at && Date.parse(quote.recordedAt) <= item.at);
    const allocation = allocate(working, [{ pickId: item.pick.id, probability: null, probabilitySource: null }], options.method, new Date(item.at))[0];
    item.row.allocation = allocation;
    item.row.reason = allocation.reason;
    if (!allocation.stakeCents) continue;
    const ticketId = `backtest-${item.pick.id}`;
    const simulated: Ticket = {
      id: ticketId, sourceId: ticketId, pickId: item.pick.id, bookmaker: "Winamax FR", event: item.pick.event, eventKey: item.pick.eventKey,
      selection: item.pick.selection, market: item.pick.market, line: item.pick.line, rules: item.pick.rules, kind: "single", odds: allocation.odds,
      stakeCents: allocation.stakeCents, funding: "cash", placedAt: item.row.at, settledAt: null, result: "open", returnCents: 0, feeCents: 0,
      remainingStakeCents: null, partialCashout: false, strategyId: strategy.id, source: "backtest", notes: "Scénario, jamais exécuté", manuallyCorrected: false, revisions: [],
    };
    working.tickets.push(simulated);
    working.ledger.push({ id: `stake-${ticketId}`, kind: "ticket_stake", amountCents: -simulated.stakeCents, at: simulated.placedAt, description: "Mise fictive du scénario", ticketId, revision: 1 });
    item.row.status = "open";
    pending.set(ticketId, { pick: item.pick, row: item.row });
  }
  settleUntil(end - 1);
  const account = bankroll(working);
  const allocated = rows.filter(row => row.allocation && row.allocation.stakeCents > 0);
  const settled = rows.filter(row => row.status === "settled");
  const settledStakes = settled.reduce((sum, row) => sum + row.allocation!.stakeCents, 0);
  return {
    status: candidates.length ? "evaluated" : "insufficient",
    reason: candidates.length ? "Rejeu descriptif des données disponibles ; aucune validation statistique ou rentabilité future démontrée." : "Aucun événement du segment dans la période.",
    candidateCount: candidates.length, allocatedCount: allocated.length, settledCount: settled.length,
    abstentionCount: rows.filter(row => row.status === "abstained").length,
    coverage: candidates.length ? allocated.length / candidates.length : null,
    profitCents: account.profitCashCents, endingCapitalCents: account.capitalCents,
    benchmark1u: settled.length ? settled.reduce((sum, row) => sum + row.benchmarkUnits!, 0) : null,
    roi: settledStakes ? account.profitCashCents / settledStakes : null,
    drawdownPct: account.drawdownPct, rows, assumptions, calibration: { brier: null, logLoss: null },
  };
}
