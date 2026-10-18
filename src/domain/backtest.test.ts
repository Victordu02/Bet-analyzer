import { describe, expect, it } from "vitest";
import { backtest, type BacktestOptions } from "./backtest";
import { DEFAULT_SETTINGS, type AppState, type Pick, type Quote } from "./types";

const pick = (overrides: Partial<Pick> = {}): Pick => ({ id: "p1", tipsterId: "t1", sourceId: "observed-source", sourceUrl: "", publishedAt: "2026-10-18T09:00:00.000Z", observedAt: "2026-10-18T09:01:00.000Z", startsAt: "2026-10-18T12:00:00.000Z", event: "Paris–Lyon", eventKey: "e1", sport: "Football", competition: "Ligue 1", market: "1X2", selection: "Paris", line: "", rules: "90 minutes", odds: 4, minOdds: null, stakeUnits: 1, result: "won", settlementSource: "manual-result", settledAt: "2026-10-18T14:00:00.000Z", kind: "single", timing: "prematch", evidence: "observed", initialContent: "Test fictif", argument: "", notes: "", revisions: [], manuallyCorrected: false, ...overrides });
const quote = (overrides: Partial<Quote> = {}): Quote => ({ id: "q1", pickId: "p1", bookmaker: "Winamax FR", odds: 2, observedAt: "2026-10-18T09:10:00.000Z", recordedAt: "2026-10-18T09:11:00.000Z", source: "manual", sourceUrl: "", available: true, matchConfirmed: true, closing: false, referenceProbability: null, notes: "", ...overrides });
const state = (): AppState => ({ workspace: "demo", picks: [pick()], quotes: [quote()], tickets: [], ledger: [], imports: [], simulations: [], audit: [], tipsters: [{ id: "t1", name: "Fictif", source: "manual", sourceUrl: "", discoveredAt: "2026-10-01T00:00:00.000Z", active: true, notes: "", accessNotes: "", monthlyCostCents: 0, completeness: "unknown", bankrolls: [] }], strategies: [{ id: "s1", name: "Football simple", filter: { sport: "Football", kind: "single" }, createdAt: "2026-10-01T00:00:00.000Z", discoveryEnd: "2026-10-02T00:00:00.000Z", frozenAt: "2026-10-03T00:00:00.000Z", validationStart: "2026-10-04T00:00:00.000Z", active: true, notes: "" }], settings: { ...DEFAULT_SETTINGS, maxBetPercent: 0.01, maxEventPercent: 0.02, maxExposurePercent: 0.05, dailyLossLimitCents: 10_000, monthlyLossLimitCents: 20_000 } });
const options: BacktestOptions = { strategyId: "s1", start: "2026-10-18T00:00:00.000Z", end: "2026-10-19T00:00:00.000Z", delayMinutes: 5, method: "fixed", initialCapitalCents: 100_000 };

describe("chronological scenario evaluation", () => {
  it("does not revive an expired provider price with a later observation or persistence timestamp", () => {
    const data = state();
    const source = data.picks[0];
    data.quotes = [quote({ collectionMode: "provider", mappingStatus: "confirmed", providerLastUpdatedAt: "2026-10-18T09:00:00.000Z", providerTtlSeconds: 120, identitySnapshot: { eventKey: source.eventKey, event: source.event, startsAt: source.startsAt, market: source.market, selection: source.selection, line: source.line, rules: source.rules, kind: source.kind, timing: source.timing } })];
    const result = backtest(data, options);
    expect(result).toMatchObject({ candidateCount: 1, allocatedCount: 0, abstentionCount: 1 });
    expect(result.rows[0].reason).toContain("fournisseur");
  });

  it("replays observed Winamax odds rather than announced or closing odds without mutating data", () => {
    const data = state();
    data.quotes.push(quote({ id: "closing", odds: 5, closing: true, observedAt: "2026-10-18T11:59:00.000Z", recordedAt: "2026-10-18T11:59:00.000Z" }));
    const before = structuredClone(data);
    const result = backtest(data, options);
    expect(result).toMatchObject({ status: "evaluated", candidateCount: 1, allocatedCount: 1, settledCount: 1, profitCents: 1000, endingCapitalCents: 101_000, benchmark1u: 1, roi: 1, coverage: 1 });
    expect(result.rows[0].allocation?.odds).toBe(2);
    expect(data).toEqual(before);
    expect(backtest(data, options)).toEqual(result);
  });
  it("keeps unavailable, missing and retrospectively observed candidates as abstentions", () => {
    const data = state();
    data.quotes[0].available = false;
    data.quotes.push(quote({ id: "later-better", odds: 3, observedAt: "2026-10-18T09:15:00.000Z", recordedAt: "2026-10-18T09:15:00.000Z" }));
    data.picks.push(pick({ id: "missing", eventKey: "e2" }), pick({ id: "declared", eventKey: "e3", evidence: "declared" }));
    const result = backtest(data, options);
    expect(result).toMatchObject({ candidateCount: 3, allocatedCount: 0, abstentionCount: 3, coverage: 0, benchmark1u: null, roi: null });
    expect(result.rows.every(row => row.reason.length > 0)).toBe(true);
  });
  it("does not leak a quote entered after the event or a closing-only quote into the decision", () => {
    const data = state();
    data.quotes[0].recordedAt = "2026-10-18T14:30:00.000Z";
    data.quotes.push(quote({ id: "closing-only", closing: true }));
    expect(backtest(data, options).allocatedCount).toBe(0);
    data.quotes = [quote({ recordedAt: "2026-10-18T09:50:00.000Z" })];
    expect(backtest(data, options).allocatedCount).toBe(0); // Already stale when actually known.
  });
  it("rejects retrospective rule freezing and excludes ambiguous revised histories", () => {
    const data = state();
    data.strategies[0].frozenAt = "2026-10-18T10:00:00.000Z";
    expect(backtest(data, options).status).toBe("insufficient");
    data.strategies = state().strategies;
    data.picks[0].revisions.push({ at: "2026-10-19T12:00:00.000Z", description: "Correction", previous: { odds: 2 } });
    expect(backtest(data, options).allocatedCount).toBe(0);
  });
  it("keeps inactive historical profiles and does not invent historical probabilities for Kelly", () => {
    const data = state();
    data.tipsters[0].active = false;
    expect(backtest(data, options).allocatedCount).toBe(1);
    const result = backtest(data, { ...options, method: "kelly" });
    expect(result).toMatchObject({ allocatedCount: 0, abstentionCount: 1, calibration: { brier: null, logLoss: null } });
    expect(result.rows[0].reason).toContain("probabilité");
  });
  it("settles earlier picks before allocating later candidates and preserves unresolved exposure", () => {
    const data = state();
    data.picks.push(pick({ id: "p2", eventKey: "e2", publishedAt: "2026-10-18T14:00:00.000Z", observedAt: "2026-10-18T14:01:00.000Z", startsAt: "2026-10-18T18:00:00.000Z", settledAt: "2026-10-18T20:00:00.000Z", result: "lost" }));
    data.quotes.push(quote({ id: "q2", pickId: "p2", observedAt: "2026-10-18T14:10:00.000Z", recordedAt: "2026-10-18T14:11:00.000Z" }));
    const result = backtest(data, { ...options, method: "percent" });
    expect(result.rows.map(row => row.allocation?.stakeCents)).toEqual([1000, 1010]);
    expect(result).toMatchObject({ profitCents: -10, endingCapitalCents: 99_990, benchmark1u: 0 });
    data.picks[0].settlementSource = "";
    expect(backtest(data, options).rows[0].status).toBe("unresolved");
  });
  it("accumulates event exposure and suppresses duplicates in chronological allocations", () => {
    const data = state();
    data.picks.push(pick({ id: "p2", selection: "Nul" }), pick({ id: "p3", selection: "Lyon" }), pick({ id: "p4" }));
    data.quotes.push(...["p2", "p3", "p4"].map(id => quote({ id: `q-${id}`, pickId: id })));
    const result = backtest(data, options);
    expect(result.rows.map(row => row.allocation?.stakeCents)).toEqual([1000, 1000, 0, 0]);
    expect(result.allocatedCount).toBe(2);
  });
});
