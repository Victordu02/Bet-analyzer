import { describe, expect, it } from "vitest";
import { allocate, bankroll, calibration, clv, decision, expectedValue, identity, matchesSegment, noVig, normalizedProfit, pickStats, report } from "./calculations";
import { DEFAULT_SETTINGS, type AppState, type LedgerEntry, type Pick, type Quote, type Ticket } from "./types";

const now = new Date("2026-10-18T12:00:00.000Z");
const pick = (overrides: Partial<Pick> = {}): Pick => ({
  id: "p1", tipsterId: "t1", sourceId: "source-1", sourceUrl: "https://example.com/p1",
  publishedAt: "2026-10-18T11:45:00.000Z", observedAt: "2026-10-18T11:46:00.000Z", startsAt: "2026-10-18T18:00:00.000Z",
  event: "Paris – Lyon", eventKey: "event-1", sport: "Football", competition: "Ligue 1", market: "1X2", selection: "Paris", line: "",
  rules: "90 minutes", odds: 2, minOdds: null, stakeUnits: 1, result: "open", settlementSource: "", settledAt: null,
  kind: "single", timing: "prematch", evidence: "declared", initialContent: "Paris à 2,00", argument: "", notes: "", revisions: [], manuallyCorrected: false,
  ...overrides,
});
const quote = (overrides: Partial<Quote> = {}): Quote => ({ id: "q1", pickId: "p1", bookmaker: "Winamax FR", odds: 2, observedAt: "2026-10-18T11:55:00.000Z", recordedAt: "2026-10-18T11:56:00.000Z", source: "manual", sourceUrl: "", available: true, matchConfirmed: true, closing: false, referenceProbability: null, notes: "", ...overrides });
const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({ id: "ticket-1", sourceId: "ticket-source-1", pickId: null, bookmaker: "Winamax FR", event: "Paris – Lyon", eventKey: "event-1", selection: "Paris", market: "1X2", line: "", rules: "90 minutes", kind: "single", odds: 2.5, stakeCents: 2000, funding: "cash", placedAt: "2026-10-16T12:00:00.000Z", settledAt: "2026-10-17T12:00:00.000Z", result: "won", returnCents: 5000, feeCents: 0, remainingStakeCents: null, partialCashout: false, strategyId: null, source: "manual", notes: "", manuallyCorrected: false, revisions: [], ...overrides });
const ledger = (kind: LedgerEntry["kind"], amountCents: number, at = "2026-10-15T12:00:00.000Z", ticketId: string | null = null): LedgerEntry => ({ id: `${kind}-${at}-${ticketId}`, kind, amountCents, at, ticketId, description: "test", revision: 1 });
const state = (): AppState => ({
  workspace: "personal", tipsters: [{ id: "t1", name: "Test", source: "manual", sourceUrl: "", discoveredAt: "2026-10-01T12:00:00.000Z", active: true, notes: "", accessNotes: "", monthlyCostCents: 0, completeness: "unknown", bankrolls: [] }],
  picks: [pick()], quotes: [quote()], tickets: [], ledger: [ledger("initial", 100_000)],
  strategies: [{ id: "s1", name: "Football suivi", filter: { sport: "Football" }, createdAt: "2026-10-01T00:00:00.000Z", discoveryEnd: "2026-10-02T00:00:00.000Z", frozenAt: "2026-10-03T00:00:00.000Z", validationStart: "2026-10-04T00:00:00.000Z", active: true, notes: "" }],
  simulations: [], imports: [], audit: [], settings: { ...DEFAULT_SETTINGS, maxBetPercent: 0.01, maxEventPercent: 0.02, maxExposurePercent: 0.05, dailyLossLimitCents: 10_000, monthlyLossLimitCents: 30_000 },
});
const withTicket = (value: Ticket): AppState => {
  const data = state();
  data.tickets = [value];
  if (value.funding === "cash") data.ledger.push(ledger("ticket_stake", -value.stakeCents, value.placedAt, value.id));
  if (value.returnCents) data.ledger.push(ledger("ticket_return", value.returnCents, value.settledAt ?? value.placedAt, value.id));
  if (value.feeCents) data.ledger.push(ledger("ticket_fee", -value.feeCents, value.settledAt ?? value.placedAt, value.id));
  return data;
};
const candidate = (pickId = "p1", probability: number | null = 0.55) => ({ pickId, probability, probabilitySource: probability == null ? null : "manual" as const });

describe("cash accounting and performance neutralization", () => {
  it("20 € cash won at 2.50 returns 50 € and realizes +30 €, without subtracting the stake twice", () => {
    const result = bankroll(withTicket(ticket()));
    expect(result).toMatchObject({ cashCents: 103_000, openStakeCents: 0, capitalCents: 103_000, profitCashCents: 3000, netProfitCents: 3000 });
  });
  it("20 € closed by 12 € cashout realizes −8 €", () => {
    expect(bankroll(withTicket(ticket({ result: "cashout", returnCents: 1200 })))).toMatchObject({ cashCents: 99_200, profitCashCents: -800, netProfitCents: -800 });
  });
  it("10 € freebet at 3.00 creates no cash debit and separates its 20 € return", () => {
    const data = withTicket(ticket({ funding: "freebet", stakeCents: 1000, odds: 3, returnCents: 2000 }));
    expect(data.ledger.some(entry => entry.kind === "ticket_stake")).toBe(false);
    expect(bankroll(data)).toMatchObject({ cashCents: 102_000, profitCashCents: 0, promotionCents: 2000, netProfitCents: 2000 });
  });
  it("an open stake transfers cash to a position valued at cost without a loss", () => {
    const result = bankroll(withTicket(ticket({ result: "open", settledAt: null, returnCents: 0 })));
    expect(result).toMatchObject({ cashCents: 98_000, openStakeCents: 2000, capitalCents: 100_000, netProfitCents: 0, drawdownPct: 0 });
    expect(result.series.every(point => point.value === 100)).toBe(true);
  });
  it("a 100 € loss on 1000 € remains a 10% drawdown after a 900 € deposit", () => {
    const data = withTicket(ticket({ stakeCents: 10_000, result: "lost", returnCents: 0 }));
    data.ledger.push(ledger("deposit", 90_000, "2026-10-18T10:00:00.000Z"));
    expect(bankroll(data)).toMatchObject({ cashCents: 180_000, profitCashCents: -10_000, netProfitCents: -10_000, recoveryDays: null });
    expect(bankroll(data).drawdownPct).toBeCloseTo(0.1, 12);
    expect(bankroll(data).series.at(-1)?.value).toBeCloseTo(90, 10);
    data.ledger.push(ledger("withdrawal", -45_000, "2026-10-18T11:00:00.000Z"));
    expect(bankroll(data).profitCashCents).toBe(-10_000);
    expect(bankroll(data).series.at(-1)?.value).toBeCloseTo(90, 10);
  });
  it("charges each recorded fee once and leaves indicative subscription costs out of the ledger", () => {
    const data = withTicket(ticket({ feeCents: 100 }));
    data.tipsters[0].monthlyCostCents = 5000;
    data.ledger.push(ledger("fee", -2000));
    expect(bankroll(data)).toMatchObject({ profitCashCents: 3000, feesCents: 2100, netProfitCents: 900 });
  });
  it("restates a late imported winning receipt at settlement without creating an artificial drawdown", () => {
    const data = withTicket(ticket());
    data.ledger.find(entry => entry.kind === "ticket_return")!.at = "2026-10-18T11:00:00.000Z";
    expect(bankroll(data)).toMatchObject({ cashCents: 103_000, drawdownPct: 0, profitCashCents: 3000 });
    expect(bankroll(data).series.at(-1)?.value).toBe(103);
  });
  it("does not erase complete capital exhaustion by a later deposit", () => {
    const data = withTicket(ticket({ stakeCents: 100_000, result: "lost", returnCents: 0 }));
    data.ledger.push(ledger("deposit", 200_000, "2026-10-18T10:00:00.000Z"));
    expect(bankroll(data)).toMatchObject({ cashCents: 200_000, drawdownPct: 1, recoveryDays: null });
    expect(bankroll(data).series.at(-1)?.value).toBe(0);
  });
  it("uses a documented remaining partial cashout cost and blocks unknown cost allocations", () => {
    const known = withTicket(ticket({ result: "cashout", partialCashout: true, remainingStakeCents: 1200, returnCents: 600 }));
    expect(bankroll(known)).toMatchObject({ cashCents: 98_600, openStakeCents: 1200, capitalCents: 99_800, profitCashCents: -200, uncertainOpenCost: false });
    known.tickets[0].remainingStakeCents = null;
    expect(bankroll(known).uncertainOpenCost).toBe(true);
    expect(allocate(known, [candidate()], "fixed", now)[0]).toMatchObject({ stakeCents: 0 });
    expect(allocate(known, [candidate()], "fixed", now)[0].reason).toContain("cashout partiel");
  });
  it("rejects unsafe integer monetary amounts", () => {
    const data = state();
    data.ledger[0].amountCents = Number.MAX_SAFE_INTEGER + 1;
    expect(() => bankroll(data)).toThrow("entier sûr");
  });
});

describe("normalized analysis and uncertainty", () => {
  it("does not change normalized performance when declared stakes are multiplied", () => {
    const a = pick({ result: "won", odds: 2.5, stakeUnits: 1 });
    const b = { ...a, stakeUnits: 100 };
    expect(normalizedProfit(a)).toBe(1.5);
    expect(pickStats([a])).toEqual(pickStats([b]));
  });
  it("keeps zero denominators unknown and excludes unsupported settlement categories", () => {
    expect(pickStats([])).toMatchObject({ yield: null, winRate: null, averageOdds: null, roiInterval: null, biggestWinShare: null });
    expect(pickStats([pick({ result: "void" })])).toMatchObject({ settled: 1, profitUnits: 0, yield: 0, winRate: null });
    expect(pickStats([pick({ result: "cashout" }), pick({ result: "won", kind: "accumulator" }), pick({ result: "half_won" })])).toMatchObject({ settled: 0, excluded: 3, yield: null });
    expect(normalizedProfit(pick({ result: "half_won", odds: 2.5 }))).toBe(0.75);
  });
  it("clusters correlated picks by event and is reproducible irrespective of input order", () => {
    const same = [pick({ id: "a", result: "won" }), pick({ id: "b", result: "lost" })];
    expect(pickStats(same).roiInterval).toBeNull();
    const rows = [...same, pick({ id: "c", eventKey: "other", result: "won", odds: 5 })];
    expect(pickStats(rows).roiInterval).toEqual(pickStats([...rows].reverse()).roiInterval);
    expect(pickStats(rows).biggestWinShare).toBe(0.8);
  });
  it("uses fixed half-open boundaries for odds and delay segments", () => {
    expect(matchesSegment(pick(), { sport: " football ", oddsMin: 2, oddsMax: 3 })).toBe(true);
    expect(matchesSegment(pick(), { oddsMax: 2 })).toBe(false);
    expect(matchesSegment(pick(), { delayMinMinutes: 375, delayMaxMinutes: 376 })).toBe(true);
  });
});

describe("probabilities and allocation constraints", () => {
  it("10 € at 2.00 with hypothetical 55% has +1 € expectation, 10% ROI and 10% full Kelly", () => {
    expect(expectedValue(1000, 2, 0.55)).toEqual({ breakEven: 0.5, roi: 0.1, expectedCents: 100, kelly: 0.1 });
    const data = state();
    data.settings.maxBetPercent = 1;
    data.settings.maxEventPercent = 1;
    expect(allocate(data, [candidate()], "kelly", now)[0].stakeCents).toBe(2500);
    data.settings.maxBetPercent = 0.01;
    expect(allocate(data, [candidate()], "kelly", now)[0].stakeCents).toBe(1000);
  });
  it("does not invent probabilities and allows only explicit fixed simulations when unknown", () => {
    expect(expectedValue(1000, 2, null)).toEqual({ breakEven: 0.5, roi: null, expectedCents: null, kelly: null });
    expect(allocate(state(), [candidate("p1", null)], "kelly", now)[0]).toMatchObject({ stakeCents: 0, expectedCents: null });
    expect(allocate(state(), [candidate("p1", null)], "fixed", now)[0]).toMatchObject({ stakeCents: 1000, expectedCents: null });
    expect(allocate(state(), [{ pickId: "p1", probability: 0.6, probabilitySource: null }], "kelly", now)[0].stakeCents).toBe(0);
  });
  it("requires explicit personal risk limits and respects pause", () => {
    const data = state();
    data.settings = { ...DEFAULT_SETTINGS };
    expect(allocate(data, [candidate()], "fixed", now)[0].stakeCents).toBe(0);
    data.settings = { ...state().settings, paused: true };
    expect(allocate(data, [candidate()], "fixed", now)[0].reason).toContain("pause");
  });
  it("floors fractional-cent stakes and does not reuse basket cash", () => {
    const data = state();
    data.ledger[0].amountCents = 99_999;
    expect(allocate(data, [candidate()], "kelly", now)[0].stakeCents).toBe(999);
    data.picks.push(pick({ id: "p2", selection: "Nul" }), pick({ id: "p3", selection: "Lyon" }));
    data.quotes.push(quote({ id: "q2", pickId: "p2" }), quote({ id: "q3", pickId: "p3" }));
    const rows = allocate(data, [candidate(), candidate("p2"), candidate("p3")], "fixed", now);
    expect(rows.map(row => row.stakeCents)).toEqual([999, 999, 1]);
    expect(rows.reduce((sum, row) => sum + row.stakeCents, 0)).toBe(1999);
  });
  it("does not multiply exposure for identical picks from distinct tipsters", () => {
    const data = state();
    data.picks.push(pick({ id: "p2", sourceId: "other-source" }));
    data.quotes.push(quote({ id: "q2", pickId: "p2" }));
    expect(identity(data.picks[0])).toBe(identity(data.picks[1]));
    expect(allocate(data, [candidate(), candidate("p2")], "fixed", now).map(row => row.stakeCents)).toEqual([1000, 0]);
  });
  it("accumulates open tickets and basket allocations against event and loss limits", () => {
    const data = withTicket(ticket({ result: "open", returnCents: 0, settledAt: null, stakeCents: 1500, selection: "Nul" }));
    expect(allocate(data, [candidate()], "fixed", now)[0].stakeCents).toBe(500);
    data.settings.dailyLossLimitCents = 1600;
    expect(allocate(data, [candidate()], "fixed", now)[0].stakeCents).toBe(100);
    data.tickets[0].selection = "Paris";
    expect(allocate(data, [candidate()], "fixed", now)[0].stakeCents).toBe(0);
  });
  it("charges fees already debited for open tickets against the daily loss budget", () => {
    const data = withTicket(ticket({ result: "open", returnCents: 0, settledAt: null, stakeCents: 1500, feeCents: 50, selection: "Nul", placedAt: "2026-10-18T10:00:00.000Z" }));
    data.settings.dailyLossLimitCents = 1600;
    expect(allocate(data, [candidate()], "fixed", now)[0].stakeCents).toBe(50);
  });
  it("normalizes the complete odds market, separates raw CLV and fair reference", () => {
    expect(noVig([2, 2])).toEqual([0.5, 0.5]);
    expect(noVig([2])).toEqual([]);
    expect(clv(2.2, 2, 0.52)).toEqual({ raw: 0.1, fair: 0.144 });
    expect(clv(2.2, null)).toEqual({ raw: null, fair: null });
  });
  it("computes documented calibration metrics without claiming a predictive model", () => {
    expect(calibration([])).toEqual({ brier: null, logLoss: null });
    expect(calibration([{ probability: 0.5, outcome: 1 }, { probability: 0.5, outcome: 0 }]).brier).toBe(0.25);
    expect(calibration([{ probability: 0.5, outcome: 1 }]).logLoss).toBeCloseTo(Math.log(2));
    expect(Number.isFinite(calibration([{ probability: 0, outcome: 1 }]).logLoss)).toBe(true);
  });
});

describe("temporal eligibility and proof levels", () => {
  it("only accepts a confirmed fresh observation and never uses closing or future quotes", () => {
    const data = state();
    expect(decision(data.picks[0], data, now).eligible).toBe(true);
    data.quotes[0].observedAt = "2026-10-18T11:00:00.000Z";
    expect(decision(data.picks[0], data, now).eligible).toBe(false);
    data.quotes = [quote({ closing: true }), quote({ id: "future", observedAt: "2026-10-18T12:01:00.000Z" })];
    expect(decision(data.picks[0], data, now).quote).toBeNull();
    data.quotes = [quote({ matchConfirmed: false })];
    expect(decision(data.picks[0], data, now).eligible).toBe(false);
  });
  it("does not fall back to an older available quote after an unavailable observation", () => {
    const data = state();
    data.quotes.push(quote({ id: "latest", observedAt: "2026-10-18T11:59:00.000Z", available: false, matchConfirmed: false, odds: null }));
    expect(decision(data.picks[0], data, now).status).toBe("Marché indisponible");
  });
  it("does not label retrospectively selected strategy rules as prospective", () => {
    const data = state();
    data.strategies[0].frozenAt = "2026-10-18T11:59:00.000Z";
    expect(decision(data.picks[0], data, now).eligible).toBe(false);
  });
  it("does not upgrade post-event or declared histories into observed evidence", () => {
    const data = state();
    data.picks[0] = pick({ evidence: "observed", observedAt: "2026-10-19T00:00:00.000Z", result: "won" });
    const generated = report(data);
    expect(generated.sections[0].refs).toContain("pick:p1");
    expect(generated.sections[1].refs).toHaveLength(0);
    expect(generated.sections.every(section => section.refs.every(ref => /^(pick|ticket|ledger|quote|tipster|simulation):/.test(ref)))).toBe(true);
    expect(data.tickets).toHaveLength(0);
    expect(data.picks[0].evidence).toBe("observed"); // Reports do not mutate source history.
  });
});
