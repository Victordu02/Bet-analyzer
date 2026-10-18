import Decimal from "decimal.js";
import type { Allocation, AppState, Pick, ProbabilitySource, Quote, SegmentFilter, Ticket } from "./types";

const D = (value: Decimal.Value) => new Decimal(value);
const validOdds = (value: number): boolean => Number.isFinite(value) && value > 1;
const validProbability = (value: number | null | undefined): value is number => value != null && Number.isFinite(value) && value >= 0 && value <= 1;
const timestamp = (value: string): number => Date.parse(value);
const normalize = (value: string): string => value.normalize("NFKC").trim().toLocaleLowerCase("fr-FR").replace(/\s+/g, " ");
const safeMoney = (value: number): number => {
  if (!Number.isSafeInteger(value)) throw new RangeError("Un montant doit être un entier sûr en centimes.");
  return value;
};
const floorMoney = (value: Decimal): number => safeMoney(value.floor().toNumber());
const sumMoney = (values: number[]): number => safeMoney(values.reduce((sum, value) => safeMoney(sum + safeMoney(value)), 0));
const eventIdentity = (pick: Pick): string => normalize(pick.eventKey || `${pick.event}|${pick.startsAt}`);
const cashCost = (ticket: Ticket): number => ticket.funding === "cash" ? safeMoney(ticket.stakeCents) : 0;
const isOpen = (ticket: Ticket): boolean => ticket.result === "open" || ticket.partialCashout;
const openCost = (ticket: Ticket): number => isOpen(ticket) && ticket.funding === "cash" ? safeMoney(ticket.remainingStakeCents ?? ticket.stakeCents) : 0;

/** One unit per simple ticket. Half settlements have an explicit convention; cashouts and accumulators need separate analysis. */
export function normalizedProfit(pick: Pick): number | null {
  if (pick.kind !== "single" || !validOdds(pick.odds)) return null;
  switch (pick.result) {
    case "won": return D(pick.odds).minus(1).toNumber();
    case "lost": return -1;
    case "void": return 0;
    case "half_won": return D(pick.odds).minus(1).div(2).toNumber();
    case "half_lost": return -0.5;
    default: return null;
  }
}

/** Descriptive, deterministic event-cluster bootstrap; never a test of a discovered strategy's significance. */
function clusterInterval(picks: Pick[]): [number, number] | null {
  const clusters = new Map<string, number[]>();
  for (const pick of picks) {
    const key = eventIdentity(pick);
    clusters.set(key, [...(clusters.get(key) ?? []), normalizedProfit(pick)!]);
  }
  const ordered = [...clusters.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (ordered.length < 2) return null;
  let seed = 2166136261;
  for (const char of JSON.stringify(ordered)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const samples: number[] = [];
  for (let iteration = 0; iteration < 1000; iteration++) {
    let total = 0;
    let count = 0;
    for (let i = 0; i < ordered.length; i++) {
      const values = ordered[Math.floor(random() * ordered.length)][1];
      total += values.reduce((sum, value) => sum + value, 0);
      count += values.length;
    }
    samples.push(total / count);
  }
  samples.sort((a, b) => a - b);
  return [samples[24], samples[974]];
}

export function pickStats(picks: Pick[]): {
  count: number; settled: number; events: number; profitUnits: number; yield: number | null;
  winRate: number | null; averageOdds: number | null; maxDrawdownUnits: number;
  biggestWinShare: number | null; roiInterval: [number, number] | null;
  series: { at: string; value: number }[]; excluded: number;
} {
  const standard = picks.filter(p => p.kind === "single" && validOdds(p.odds) && ["won", "lost", "void"].includes(p.result));
  standard.sort((a, b) => timestamp(a.settledAt ?? a.startsAt) - timestamp(b.settledAt ?? b.startsAt) || a.id.localeCompare(b.id));
  let profit = D(0);
  let peak = 0;
  let drawdown = 0;
  const positive: number[] = [];
  const series = standard.map(pick => {
    const value = normalizedProfit(pick)!;
    if (value > 0) positive.push(value);
    profit = profit.plus(value);
    peak = Math.max(peak, profit.toNumber());
    drawdown = Math.max(drawdown, D(peak).minus(profit).toNumber());
    return { at: pick.settledAt ?? pick.startsAt, value: profit.toNumber() };
  });
  const wins = standard.filter(p => p.result === "won").length;
  const decisive = standard.filter(p => p.result !== "void").length;
  const positiveTotal = positive.reduce((sum, value) => sum + value, 0);
  return {
    count: picks.length, settled: standard.length, events: new Set(picks.map(eventIdentity)).size,
    profitUnits: profit.toNumber(), yield: standard.length ? profit.div(standard.length).toNumber() : null,
    winRate: decisive ? wins / decisive : null,
    averageOdds: standard.length ? standard.reduce((sum, pick) => sum + pick.odds, 0) / standard.length : null,
    maxDrawdownUnits: drawdown, biggestWinShare: positiveTotal ? Math.max(...positive) / positiveTotal : null,
    roiInterval: clusterInterval(standard), series,
    excluded: picks.filter(p => p.kind !== "single" || !validOdds(p.odds) || ["cashout", "half_won", "half_lost"].includes(p.result)).length,
  };
}

export function matchesSegment(pick: Pick, filter: SegmentFilter): boolean {
  for (const field of ["tipsterId", "sport", "competition", "market", "kind", "timing"] as const) {
    if (filter[field] != null && normalize(filter[field]!) !== normalize(pick[field])) return false;
  }
  if (filter.oddsMin != null && pick.odds < filter.oddsMin) return false;
  if (filter.oddsMax != null && pick.odds >= filter.oddsMax) return false;
  const delay = (timestamp(pick.startsAt) - timestamp(pick.publishedAt)) / 60_000;
  if ((filter.delayMinMinutes != null || filter.delayMaxMinutes != null) && !Number.isFinite(delay)) return false;
  if (filter.delayMinMinutes != null && delay < filter.delayMinMinutes) return false;
  if (filter.delayMaxMinutes != null && delay >= filter.delayMaxMinutes) return false;
  return true;
}

export function bankroll(state: AppState): {
  cashCents: number; openStakeCents: number; capitalCents: number; profitCashCents: number;
  promotionCents: number; feesCents: number; netProfitCents: number; drawdownPct: number;
  recoveryDays: number | null; series: { at: string; value: number }[]; uncertainOpenCost: boolean;
} {
  const cashCents = sumMoney(state.ledger.map(entry => entry.amountCents));
  const openStakeCents = sumMoney(state.tickets.map(openCost));
  const uncertainOpenCost = state.tickets.some(ticket => isOpen(ticket) && ticket.funding === "cash" && ticket.partialCashout && ticket.remainingStakeCents == null);
  let profitCashCents = 0;
  let promotionCents = sumMoney(state.ledger.filter(entry => entry.kind === "promotion").map(entry => entry.amountCents));
  for (const ticket of state.tickets) {
    safeMoney(ticket.returnCents);
    safeMoney(ticket.feeCents);
    if (ticket.funding === "freebet") promotionCents = sumMoney([promotionCents, ticket.returnCents]);
    else if (!isOpen(ticket)) profitCashCents = sumMoney([profitCashCents, ticket.returnCents, -cashCost(ticket)]);
    else if (ticket.partialCashout && ticket.remainingStakeCents != null) {
      profitCashCents = sumMoney([profitCashCents, ticket.returnCents, -cashCost(ticket), openCost(ticket)]);
    }
  }
  const feesCents = -sumMoney(state.ledger.filter(entry => entry.kind === "fee" || entry.kind === "ticket_fee").map(entry => entry.amountCents));
  const movements = new Map<string, { cash: number; position: number; external: number }>();
  const addMovement = (at: string, cash: number, position: number, external: number) => {
    if (!Number.isFinite(timestamp(at))) throw new RangeError("Horodatage financier invalide.");
    const key = new Date(at).toISOString();
    const before = movements.get(key) ?? { cash: 0, position: 0, external: 0 };
    movements.set(key, { cash: sumMoney([before.cash, cash]), position: sumMoney([before.position, position]), external: sumMoney([before.external, external]) });
  };
  for (const entry of state.ledger) {
    // Current cash follows the immutable journal; performance restates the latest ticket terms
    // at their economic timestamps, not the later timestamp of an import/correction delta.
    if (["ticket_stake", "ticket_return", "ticket_fee"].includes(entry.kind)) continue;
    // Poker and justified adjustments reconcile cash but are external to sports betting performance.
    const external = ["initial", "deposit", "withdrawal", "poker", "adjustment"].includes(entry.kind) ? entry.amountCents : 0;
    addMovement(entry.at, entry.amountCents, 0, external);
  }
  for (const ticket of state.tickets) {
    const cost = cashCost(ticket);
    addMovement(ticket.placedAt, -cost, cost, 0);
    const settlementAt = ticket.settledAt ?? ticket.placedAt;
    if (ticket.feeCents) addMovement(ticket.placedAt, -ticket.feeCents, 0, 0);
    if (ticket.returnCents) addMovement(settlementAt, ticket.returnCents, 0, 0);
    if (!isOpen(ticket)) addMovement(ticket.settledAt ?? ticket.placedAt, 0, -cost, 0);
    else if (ticket.partialCashout && ticket.remainingStakeCents != null && ticket.remainingStakeCents !== cost) {
      addMovement(settlementAt, 0, openCost(ticket) - cost, 0);
    }
  }
  let assets = D(0);
  let units = D(0);
  let nav = D(1);
  let exhausted = false;
  let peak = 1;
  let peakAt: string | null = null;
  let drawdownPct = 0;
  let worstPeakAt: string | null = null;
  let worstPeak = 1;
  let worstAt: string | null = null;
  const series: { at: string; value: number }[] = [];
  for (const [at, movement] of [...movements.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (movement.external && nav.gt(0)) units = units.plus(D(movement.external).div(nav));
    assets = assets.plus(movement.cash).plus(movement.position);
    if (units.gt(0) && assets.lte(0)) exhausted = true;
    if (units.gt(0)) nav = exhausted ? D(0) : Decimal.max(0, assets.div(units));
    if (units.lte(0) && assets.eq(0)) continue;
    const value = nav.toNumber();
    if (!peakAt || value >= peak) { peak = value; peakAt = at; }
    const drawdown = peak > 0 ? Math.max(0, (peak - value) / peak) : 0;
    if (drawdown > drawdownPct + 1e-12) { drawdownPct = drawdown; worstPeakAt = peakAt; worstPeak = peak; worstAt = at; }
    series.push({ at, value: nav.times(100).toNumber() });
  }
  const recovery = worstAt ? series.find(point => timestamp(point.at) > timestamp(worstAt!) && point.value + 1e-9 >= worstPeak * 100) : null;
  const recoveryDays = !worstAt ? 0 : recovery && worstPeakAt ? (timestamp(recovery.at) - timestamp(worstPeakAt)) / 86_400_000 : null;
  return { cashCents, openStakeCents, capitalCents: sumMoney([cashCents, openStakeCents]), profitCashCents, promotionCents, feesCents,
    netProfitCents: sumMoney([profitCashCents, promotionCents, -feesCents]), drawdownPct, recoveryDays, series, uncertainOpenCost };
}

export function expectedValue(stakeCents: number, odds: number, p: number | null): { breakEven: number; roi: number | null; expectedCents: number | null; kelly: number | null } {
  safeMoney(stakeCents);
  if (stakeCents < 0 || !validOdds(odds)) throw new RangeError("Mise positive ou nulle et cote décimale supérieure à 1 requises.");
  const breakEven = D(1).div(odds).toNumber();
  if (!validProbability(p)) return { breakEven, roi: null, expectedCents: null, kelly: null };
  const roi = D(p).times(odds).minus(1);
  return { breakEven, roi: roi.toNumber(), expectedCents: floorMoney(roi.times(stakeCents)), kelly: Decimal.max(0, roi.div(D(odds).minus(1))).toNumber() };
}

export function noVig(odds: number[]): number[] {
  if (odds.length < 2 || odds.some(odd => !validOdds(odd))) return [];
  const inverse = odds.map(odd => D(1).div(odd));
  const total = inverse.reduce((sum, value) => sum.plus(value), D(0));
  return inverse.map(value => value.div(total).toNumber());
}

export function clv(odds: number, closingOdds: number | null, referenceP?: number | null): { raw: number | null; fair: number | null } {
  if (!validOdds(odds)) return { raw: null, fair: null };
  return {
    raw: closingOdds != null && validOdds(closingOdds) ? D(odds).div(closingOdds).minus(1).toNumber() : null,
    fair: validProbability(referenceP) ? D(odds).times(referenceP).minus(1).toNumber() : null,
  };
}

export function identity(pick: Pick): string {
  return JSON.stringify([eventIdentity(pick), pick.market, pick.selection, pick.line, pick.rules, pick.kind].map(normalize));
}

export function decision(pick: Pick, state: AppState, now: Date = new Date()): { status: string; reason: string; quote: Quote | null; eligible: boolean } {
  const nowMs = now.getTime();
  const quotes = state.quotes.filter(quote => quote.pickId === pick.id && !quote.closing && timestamp(quote.observedAt) <= nowMs && timestamp(quote.recordedAt) <= nowMs && timestamp(quote.observedAt) >= timestamp(pick.publishedAt))
    .sort((a, b) => timestamp(b.observedAt) - timestamp(a.observedAt) || timestamp(b.recordedAt) - timestamp(a.recordedAt) || a.id.localeCompare(b.id));
  const quote = quotes[0] ?? null;
  const reject = (status: string, reason: string) => ({ status, reason, quote, eligible: false });
  if (pick.result !== "open") return reject("Expiré", "Pronostic déjà réglé ; conservé dans l’historique.");
  if (!Number.isFinite(timestamp(pick.startsAt)) || !Number.isFinite(timestamp(pick.publishedAt)) || !Number.isFinite(timestamp(pick.observedAt)) || timestamp(pick.publishedAt) > nowMs || timestamp(pick.observedAt) > nowMs) return reject("Données insuffisantes", "Chronologie de publication ou d’observation invalide.");
  if (pick.timing !== "prematch") return reject("En observation", "Le moteur de décision v1 ne modélise pas la durée ni les états des paris live.");
  if (timestamp(pick.startsAt) <= nowMs) return reject("Expiré", "L’événement a commencé ; aucune décision pré-match possible.");
  if (pick.kind !== "single") return reject("Données insuffisantes", "Le moteur de décision binaire nécessite un pari simple ; combinés à analyser séparément.");
  if (!pick.eventKey || !pick.market || !pick.selection || !pick.rules) return reject("Données insuffisantes", "Identité, marché, sélection et règles doivent être renseignés.");
  if (!state.tipsters.some(tipster => tipster.id === pick.tipsterId && tipster.active)) return reject("En observation", "Le profil n’est pas suivi activement.");
  const strategies = state.strategies.filter(strategy => strategy.active && matchesSegment(pick, strategy.filter));
  if (!strategies.some(strategy => timestamp(strategy.frozenAt) <= timestamp(strategy.validationStart) && timestamp(strategy.discoveryEnd) <= timestamp(strategy.frozenAt) && timestamp(strategy.validationStart) <= timestamp(pick.observedAt) && timestamp(strategy.createdAt) <= timestamp(strategy.frozenAt))) return reject("En observation", "Aucun segment actif figé après découverte et avant sa période de validation ne correspond à ce pronostic.");
  if (!quote) return reject("Données insuffisantes", "Aucune cote Winamax horodatée, hors clôture, disponible à cette date après publication.");
  if (!quote.available) return reject("Marché indisponible", "Le dernier relevé signale ce marché indisponible.");
  if (!quote.matchConfirmed) return reject("Données insuffisantes", "La correspondance exacte de l’événement, du marché, de la ligne et des règles reste à confirmer.");
  if (quote.odds == null || !validOdds(quote.odds)) return reject("Données insuffisantes", "Cote décimale exploitable absente.");
  if (nowMs - timestamp(quote.observedAt) > state.settings.quoteMaxAgeMinutes * 60_000) return reject("En observation", "La cote est ancienne : un nouveau relevé est nécessaire.");
  if (pick.minOdds != null && quote.odds < pick.minOdds) return reject("Cote insuffisante selon le seuil défini", "La cote est inférieure au seuil déclaré par le tipster ; ce seuil ne prouve pas la rentabilité.");
  return { status: "À analyser", reason: "Segment suivi et cote récente confirmée. Disponibilité et acceptation de la mise restent à vérifier manuellement ; espérance inconnue sans probabilité documentée.", quote, eligible: true };
}

const localDate = (date: string | Date): string => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));

export function allocate(state: AppState, candidates: { pickId: string; probability: number | null; probabilitySource: ProbabilitySource | null }[], method: "fixed" | "percent" | "kelly", now: Date = new Date()): Allocation[] {
  const account = bankroll(state);
  const settings = state.settings;
  const limits = [settings.maxBetPercent, settings.maxEventPercent, settings.maxExposurePercent, settings.dailyLossLimitCents, settings.monthlyLossLimitCents];
  const limitsValid = limits.every(limit => limit != null && Number.isFinite(limit) && limit > 0) && [settings.maxBetPercent, settings.maxEventPercent, settings.maxExposurePercent].every(limit => limit! <= 1);
  let reason = settings.paused ? "Suggestions en pause." : !limitsValid ? "Renseignez les plafonds par pari, événement, exposition et les limites de pertes personnelles." : account.uncertainOpenCost ? "Coût restant d’un cashout partiel inconnu : exposition à rapprocher avant toute simulation." : account.capitalCents <= 0 || account.cashCents <= 0 ? "Capital et cash disponibles insuffisants." : "";
  if (!reason && (settings.fixedStakeCents < 0 || !Number.isSafeInteger(settings.fixedStakeCents) || !Number.isFinite(settings.stakePercent) || settings.stakePercent < 0 || settings.stakePercent > 1 || !Number.isFinite(settings.kellyFraction) || settings.kellyFraction <= 0 || settings.kellyFraction > 1)) reason = "Paramètres de mise invalides.";
  const day = localDate(now);
  const month = day.slice(0, 7);
  const realized = (period: string) => sumMoney([
    ...state.tickets.filter(ticket => ticket.funding === "cash" && ticket.settledAt && localDate(ticket.settledAt).startsWith(period) && (!isOpen(ticket) || (ticket.partialCashout && ticket.remainingStakeCents != null))).map(ticket => sumMoney([ticket.returnCents, -ticket.stakeCents, openCost(ticket)])),
    ...state.ledger.filter(entry => (entry.kind === "fee" || entry.kind === "ticket_fee") && localDate(entry.at).startsWith(period)).map(entry => entry.amountCents),
  ]);
  const dayRemaining = settings.dailyLossLimitCents == null ? 0 : Math.max(0, sumMoney([settings.dailyLossLimitCents, Math.min(0, realized(day))]));
  const monthRemaining = settings.monthlyLossLimitCents == null ? 0 : Math.max(0, sumMoney([settings.monthlyLossLimitCents, Math.min(0, realized(month))]));
  let exposure = account.openStakeCents;
  let availableCash = account.cashCents;
  const events = new Map<string, number>();
  const taken = new Set<string>();
  for (const ticket of state.tickets.filter(isOpen)) {
    const event = normalize(ticket.eventKey || ticket.event);
    events.set(event, sumMoney([events.get(event) ?? 0, openCost(ticket)]));
    taken.add(JSON.stringify([event, ticket.market, ticket.selection, ticket.line, ticket.rules, ticket.kind].map(normalize)));
  }
  return candidates.map(candidate => {
    const pick = state.picks.find(item => item.id === candidate.pickId);
    const probability = validProbability(candidate.probability) && ["manual", "market", "model"].includes(candidate.probabilitySource ?? "") ? candidate.probability : null;
    const entry: Allocation = { pickId: candidate.pickId, eventKey: pick ? eventIdentity(pick) : "", identity: pick ? identity(pick) : candidate.pickId, stakeCents: 0, odds: pick?.odds ?? 0, probability, probabilitySource: probability == null ? null : candidate.probabilitySource, expectedCents: null, reason: "" };
    if (!pick) return { ...entry, reason: "Pronostic introuvable." };
    const choice = decision(pick, state, now);
    entry.odds = choice.quote?.odds ?? pick.odds;
    if (reason) return { ...entry, reason };
    if (!choice.eligible) return { ...entry, reason: choice.reason };
    if (taken.has(entry.identity)) return { ...entry, reason: "Sélection identique déjà ouverte ou retenue dans ce panier ; sources regroupées, mise non multipliée." };
    const expectation = expectedValue(0, entry.odds, probability);
    if (method === "kelly" && expectation.kelly == null) return { ...entry, reason: "Espérance inconnue : Kelly exige une probabilité exploitable avec sa provenance." };
    const desired = method === "fixed" ? D(settings.fixedStakeCents) : method === "percent" ? D(account.capitalCents).times(settings.stakePercent) : D(account.capitalCents).times(expectation.kelly!).times(settings.kellyFraction);
    const betLimit = floorMoney(D(account.capitalCents).times(settings.maxBetPercent!));
    const eventLimit = floorMoney(D(account.capitalCents).times(settings.maxEventPercent!));
    const globalLimit = floorMoney(D(account.capitalCents).times(settings.maxExposurePercent!));
    const allowance = Math.max(0, Math.min(availableCash, betLimit, eventLimit - (events.get(entry.eventKey) ?? 0), globalLimit - exposure, dayRemaining - exposure, monthRemaining - exposure));
    const stakeCents = Math.max(0, floorMoney(Decimal.min(desired, allowance)));
    if (!stakeCents) return { ...entry, reason: desired.lte(0) ? "Aucune fraction de mise positive avec ces hypothèses." : "Budget de risque, limite de pertes ou cash disponible épuisé." };
    availableCash -= stakeCents;
    exposure += stakeCents;
    events.set(entry.eventKey, sumMoney([events.get(entry.eventKey) ?? 0, stakeCents]));
    taken.add(entry.identity);
    return { ...entry, stakeCents, expectedCents: expectedValue(stakeCents, entry.odds, probability).expectedCents,
      reason: `Simulation ${method === "kelly" ? "Kelly fractionné" : method === "percent" ? "à pourcentage fixe" : "à mise fixe"} sous tous les plafonds.${probability == null ? " Espérance inconnue." : probability != null && candidate.probabilitySource === "manual" ? " Probabilité manuelle hypothétique ; aucun avantage démontré." : " Probabilité fournie ; provenance à vérifier."} Acceptation manuelle requise.` };
  });
}

export function report(state: AppState): { title: string; summary: string; sections: { title: string; text: string; refs: string[] }[] } {
  const money = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
  const ratio = (value: number | null) => value == null ? "non applicable" : `${(value * 100).toFixed(2)} %`;
  const observed = state.picks.filter(pick => pick.evidence === "observed" && timestamp(pick.observedAt) < timestamp(pick.startsAt) && timestamp(pick.publishedAt) <= timestamp(pick.observedAt));
  const observedIds = new Set(observed.map(pick => pick.id));
  const declared = state.picks.filter(pick => !observedIds.has(pick.id));
  const sections: { title: string; text: string; refs: string[] }[] = [declared, observed].map((picks, index) => {
    const stats = pickStats(picks);
    return { title: index ? "Observé avant événement" : "Historique déclaré", text: `${stats.count} pronostics, ${stats.events} événements distincts. ${stats.settled} simples standard réglés : ${stats.profitUnits.toFixed(2)} unités ; rendement ${ratio(stats.yield)} ; drawdown ${stats.maxDrawdownUnits.toFixed(2)} unités. ${stats.excluded} cas hors périmètre standard. ${stats.roiInterval ? `Intervalle descriptif bootstrap par événement : ${ratio(stats.roiInterval[0])} à ${ratio(stats.roiInterval[1])}.` : "Données insuffisantes pour un intervalle par événement."} Aucun avantage prédictif démontré.`, refs: picks.map(pick => `pick:${pick.id}`) };
  });
  const account = bankroll(state);
  sections.push({ title: "Simulations conservées", text: `${state.simulations.length} simulations sauvegardées. Leurs allocations et hypothèses restent distinctes des tickets réellement exécutés ; aucun débit cash. Les méthodes de mise partagent les plafonds du panier.`, refs: state.simulations.map(simulation => `simulation:${simulation.id}`) });
  sections.push({ title: "Paris exécutés et résultat comptable", text: `${state.tickets.length} tickets réels documentés. Résultat cash avant frais : ${money(account.profitCashCents)} ; promotions : ${money(account.promotionCents)} ; frais comptabilisés : ${money(account.feesCents)} ; résultat net : ${money(account.netProfitCents)}. Cash : ${money(account.cashCents)} ; positions ouvertes au coût : ${money(account.openStakeCents)}. Drawdown neutralisé des flux : ${ratio(account.drawdownPct)}.${account.uncertainOpenCost ? " Coût restant inconnu sur un cashout partiel : capital et performance provisoires, simulations bloquées." : ""}`, refs: [...state.tickets.map(ticket => `ticket:${ticket.id}`), ...state.ledger.map(entry => `ledger:${entry.id}`)] });
  sections.push({ title: "Couverture, attribution et limites", text: `${state.tipsters.filter(tipster => tipster.completeness === "unknown").length} profils : exhaustivité non vérifiable. ${state.picks.filter(pick => !pick.argument.trim()).length} pronostics sans raisonnement fourni par leur auteur. ${state.quotes.length} observations de cote, qui ne prouvent aucune exécution. Les coûts indicatifs des fiches tipsters ne sont déduits que lorsqu’un mouvement de frais les comptabilise. Les résultats passés et les simulations ne constituent pas une espérance individuelle.`, refs: [...state.tipsters.map(tipster => `tipster:${tipster.id}`), ...state.picks.map(pick => `pick:${pick.id}`), ...state.quotes.map(quote => `quote:${quote.id}`)] });
  return { title: `Bilan sourcé · ${state.workspace === "demo" ? "Démonstration fictive" : "Données personnelles"}`, summary: `${state.picks.length} pronostics, ${state.tickets.length} tickets et ${state.simulations.length} simulations. Les quatre niveaux de preuve sont présentés séparément.`, sections };
}

export function calibration(rows: { probability: number; outcome: 0 | 1 }[]): { brier: number | null; logLoss: number | null } {
  if (!rows.length) return { brier: null, logLoss: null };
  if (rows.some(row => !validProbability(row.probability) || ![0, 1].includes(row.outcome))) throw new RangeError("Une prévision valide entre 0 et 1 et un résultat binaire sont requis.");
  let brier = D(0);
  let logLoss = 0;
  for (const row of rows) {
    brier = brier.plus(D(row.probability).minus(row.outcome).pow(2));
    const probability = Math.min(1 - 1e-15, Math.max(1e-15, row.probability));
    logLoss -= row.outcome ? Math.log(probability) : Math.log(1 - probability);
  }
  return { brier: brier.div(rows.length).toNumber(), logLoss: logLoss / rows.length };
}
