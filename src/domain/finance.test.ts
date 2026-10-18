import { describe, expect, it } from "vitest";
import { bankroll, allocate, identity } from "./calculations";
import { portfolioOverview, reconcileCash, ticketPosition } from "./finance";
import { compareStakes } from "./staking";
import { economicStateAt, riskBudget, sumCents } from "./accounting";
import {
  DEFAULT_SETTINGS,
  type AppState,
  type LedgerEntry,
  type Pick,
  type Quote,
  type Ticket,
} from "./types";

const now = new Date("2026-10-18T12:00:00.000Z");
const pick = (overrides: Partial<Pick> = {}): Pick => ({
  id: "p1",
  tipsterId: "tipster",
  sourceId: "source-1",
  sourceUrl: "https://example.com/1",
  publishedAt: "2026-10-18T11:45:00.000Z",
  observedAt: "2026-10-18T11:46:00.000Z",
  startsAt: "2026-10-18T18:00:00.000Z",
  event: "Paris – Lyon",
  eventKey: "event-1",
  sport: "Football",
  competition: "Ligue 1",
  market: "1X2",
  selection: "Paris",
  line: "",
  rules: "90 minutes",
  odds: 2,
  minOdds: null,
  stakeUnits: 1,
  result: "open",
  settlementSource: "",
  settledAt: null,
  kind: "single",
  timing: "prematch",
  evidence: "observed",
  initialContent: "Paris 2.00",
  argument: "",
  notes: "",
  revisions: [],
  manuallyCorrected: false,
  ...overrides,
});
const quote = (overrides: Partial<Quote> = {}): Quote => ({
  id: "q1",
  pickId: "p1",
  bookmaker: "Winamax FR",
  odds: 2,
  observedAt: "2026-10-18T11:55:00.000Z",
  recordedAt: "2026-10-18T11:56:00.000Z",
  source: "manual",
  sourceUrl: "",
  available: true,
  matchConfirmed: true,
  closing: false,
  referenceProbability: null,
  notes: "",
  ...overrides,
});
const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: "ticket",
  sourceId: "",
  pickId: null,
  bookmaker: "Winamax FR",
  event: "Paris – Lyon",
  eventKey: "event-1",
  selection: "Lyon",
  market: "1X2",
  line: "",
  rules: "90 minutes",
  kind: "single",
  odds: 2.5,
  stakeCents: 2000,
  funding: "cash",
  placedAt: "2026-10-16T12:00:00.000Z",
  settledAt: "2026-10-17T12:00:00.000Z",
  result: "won",
  returnCents: 5000,
  feeCents: 0,
  remainingStakeCents: null,
  partialCashout: false,
  strategyId: null,
  source: "manual",
  notes: "",
  manuallyCorrected: false,
  revisions: [],
  ...overrides,
});
const ledger = (
  kind: LedgerEntry["kind"],
  amountCents: number,
  at = "2026-10-15T12:00:00.000Z",
  ticketId: string | null = null,
): LedgerEntry => ({
  id: `${kind}:${at}:${ticketId}`,
  kind,
  amountCents,
  at,
  ticketId,
  description: "test",
  revision: 1,
});
function state(): AppState {
  return {
    workspace: "personal",
    picks: [pick()],
    quotes: [quote()],
    tickets: [],
    ledger: [ledger("initial", 100_000)],
    tipsters: [
      {
        id: "tipster",
        name: "Test",
        source: "manual",
        sourceUrl: "",
        discoveredAt: "2026-10-01T00:00:00.000Z",
        active: true,
        notes: "",
        accessNotes: "",
        monthlyCostCents: 0,
        completeness: "unknown",
        bankrolls: [],
      },
    ],
    strategies: [
      {
        id: "strategy",
        name: "Football",
        filter: { sport: "Football" },
        createdAt: "2026-10-01T00:00:00.000Z",
        discoveryEnd: "2026-10-02T00:00:00.000Z",
        frozenAt: "2026-10-03T00:00:00.000Z",
        validationStart: "2026-10-04T00:00:00.000Z",
        active: true,
        notes: "",
      },
    ],
    simulations: [],
    imports: [],
    audit: [],
    settings: {
      ...DEFAULT_SETTINGS,
      maxBetPercent: 0.01,
      maxEventPercent: 0.02,
      maxExposurePercent: 0.05,
      dailyLossLimitCents: 10_000,
      monthlyLossLimitCents: 30_000,
    },
  };
}
function withTickets(...tickets: Ticket[]): AppState {
  const data = state();
  data.tickets = tickets;
  for (const item of tickets) {
    if (item.funding === "cash")
      data.ledger.push(
        ledger("ticket_stake", -item.stakeCents, item.placedAt, item.id),
      );
    if (item.returnPayments)
      for (const payment of item.returnPayments)
        data.ledger.push({
          ...ledger("ticket_return", payment.amountCents, payment.at, item.id),
          id: payment.id,
        });
    else if (item.returnCents)
      data.ledger.push(
        ledger("ticket_return", item.returnCents, item.settledAt!, item.id),
      );
    if (item.feeCents)
      data.ledger.push(
        ledger("ticket_fee", -item.feeCents, item.placedAt, item.id),
      );
  }
  return data;
}
const candidate = (pickId = "p1", probability: number | null = 0.55) => ({
  pickId,
  probability,
  probabilitySource: probability == null ? null : ("manual" as const),
  basis: "Hypothèse personnelle de sensibilité",
});

describe("financial positions and dated reconciliation", () => {
  it("separates recorded gross return, cash profit, fees and promotional return", () => {
    expect(ticketPosition(ticket({ feeCents: 100 }))).toMatchObject({
      cashStakeCents: 2000,
      openCostCents: 0,
      grossReturnCents: 5000,
      cashProfitCents: 3000,
      netProfitCents: 2900,
    });
    expect(
      ticketPosition(
        ticket({
          funding: "freebet",
          stakeCents: 1000,
          returnCents: 2000,
          feeCents: 50,
        }),
      ),
    ).toMatchObject({
      cashStakeCents: 0,
      cashProfitCents: 0,
      promotionProfitCents: 2000,
      netProfitCents: 1950,
    });
    expect(
      ticketPosition(
        ticket({ result: "void", returnCents: 2000, feeCents: 30 }),
      ),
    ).toMatchObject({ cashProfitCents: 0, netProfitCents: -30 });
    expect(
      ticketPosition(ticket({ result: "cashout", returnCents: 1200 })),
    ).toMatchObject({ cashProfitCents: -800 });
  });

  it("keeps a cashout partial open and never assigns an unknown cost", () => {
    const partial = ticket({
      result: "cashout",
      partialCashout: true,
      returnCents: 600,
      remainingStakeCents: 1200,
    });
    expect(ticketPosition(partial)).toMatchObject({
      open: true,
      openCostCents: 1200,
      releasedCostCents: 800,
      cashProfitCents: -200,
    });
    expect(
      ticketPosition({ ...partial, remainingStakeCents: null }),
    ).toMatchObject({
      open: true,
      openCostCents: null,
      provisionalOpenCostCents: 2000,
      releasedCostCents: null,
      cashProfitCents: null,
      netProfitCents: null,
    });
  });

  it("uses journal cash at the observation time and keeps later deposits separate", () => {
    const data = withTickets(ticket());
    data.ledger.push(ledger("deposit", 50_000, "2026-10-18T11:00:00.000Z"));
    expect(
      reconcileCash(data, 98_000, "2026-10-16T13:00:00.000Z"),
    ).toMatchObject({
      status: "matched",
      calculatedCashCents: 98_000,
      differenceCents: 0,
    });
    expect(
      reconcileCash(data, 102_999, "2026-10-17T12:00:00.000Z"),
    ).toMatchObject({ status: "difference", differenceCents: -1 });
    const historical = portfolioOverview(
      data,
      new Date("2026-10-16T13:00:00.000Z"),
    );
    expect(historical.account).toMatchObject({
      cashCents: 98_000,
      openStakeCents: 2000,
      capitalCents: 100_000,
      netProfitCents: 0,
    });
    expect(portfolioOverview(data, now).totals).toMatchObject({
      initialCents: 100_000,
      depositsCents: 50_000,
      grossCashReturnsCents: 5000,
      closedCashProfitCents: 3000,
    });
  });

  it("includes corrections at their economic dates without duplicate credit", () => {
    const data = withTickets(ticket());
    data.ledger.push(
      ledger("ticket_return", -5000, "2026-10-17T12:00:00.000Z", "ticket"),
      ledger("ticket_return", 4800, "2026-10-17T12:00:00.000Z", "ticket"),
    );
    data.tickets[0].returnCents = 4800;
    expect(
      reconcileCash(data, 102_800, "2026-10-17T12:00:00.000Z"),
    ).toMatchObject({ status: "matched", differenceCents: 0 });
    expect(portfolioOverview(data, now).account.netProfitCents).toBe(2800);
  });

  it("does not count strategy assignments twice or turn deposits and poker into profits", () => {
    const data = withTickets(
      ticket({ strategyId: "strategy", kind: "accumulator", feeCents: 100 }),
    );
    data.ledger.push(
      ledger("withdrawal", -1000),
      ledger("poker", 500),
      ledger("adjustment", 200),
    );
    const view = portfolioOverview(data, now);
    expect(view.totals).toMatchObject({
      cashStakeCents: 2000,
      closedCashStakeCents: 2000,
      closedCashProfitCents: 2900,
      closedCashRoi: 1.45,
      withdrawalsCents: -1000,
      pokerCents: 500,
      adjustmentsCents: 200,
    });
    expect(view.account.netProfitCents).toBe(2900);
    expect(portfolioOverview(state(), now).totals.closedCashRoi).toBeNull();
  });

  it("preserves dated cashout payments and their documented remaining costs", () => {
    const partial = ticket({
      result: "cashout",
      partialCashout: true,
      returnCents: 700,
      remainingStakeCents: 1000,
      settledAt: "2026-10-18T10:00:00.000Z",
      returnPayments: [
        {
          id: "payment1",
          at: "2026-10-17T10:00:00.000Z",
          amountCents: 400,
          remainingStakeCents: 1500,
        },
        {
          id: "payment2",
          at: "2026-10-18T10:00:00.000Z",
          amountCents: 300,
          remainingStakeCents: 1000,
        },
      ],
    });
    const data = withTickets(partial);
    const firstDay = portfolioOverview(
      data,
      new Date("2026-10-17T11:00:00.000Z"),
    );
    expect(firstDay.account).toMatchObject({
      cashCents: 98_400,
      openStakeCents: 1500,
      capitalCents: 99_900,
      profitCashCents: -100,
      uncertainOpenCost: false,
    });
    expect(
      reconcileCash(data, 98_400, "2026-10-17T11:00:00.000Z"),
    ).toMatchObject({ status: "matched", uncertain: false });
    expect(bankroll(data)).toMatchObject({
      cashCents: 98_700,
      openStakeCents: 1000,
      profitCashCents: -300,
      uncertainPerformance: false,
    });
    const budget = riskBudget(data, bankroll(data), now);
    expect(budget).toMatchObject({
      realizedDayCents: -200,
      realizedMonthCents: -300,
      dailyRemainingCents: 9800,
      monthlyRemainingCents: 29_700,
    });
    expect(
      bankroll(data).series.find(
        (point) => point.at === "2026-10-17T10:00:00.000Z",
      )?.value,
    ).toBe(99.9);
  });

  it("flags unknown intermediate costs and legacy cumulative cashouts explicitly", () => {
    const partial = ticket({
      result: "cashout",
      partialCashout: true,
      returnCents: 700,
      remainingStakeCents: 1000,
      settledAt: "2026-10-18T10:00:00.000Z",
      returnPayments: [
        { id: "first", at: "2026-10-17T10:00:00.000Z", amountCents: 400 },
        {
          id: "last",
          at: "2026-10-18T10:00:00.000Z",
          amountCents: 300,
          remainingStakeCents: 1000,
        },
      ],
    });
    const data = withTickets(partial);
    expect(
      portfolioOverview(data, new Date("2026-10-17T11:00:00.000Z")).account
        .uncertainOpenCost,
    ).toBe(true);
    expect(portfolioOverview(data, now).performanceAvailable).toBe(false);
    expect(
      portfolioOverview(data, new Date("2026-10-17T11:00:00.000Z")),
    ).toMatchObject({
      performanceAvailable: false,
      account: { uncertainOpenCost: true, uncertainPerformance: true },
    });
    expect(allocate(data, [candidate()], "fixed", now)[0].reason).toContain(
      "borne du budget",
    );
    delete data.tickets[0].returnPayments;
    expect(
      reconcileCash(data, 98_400, "2026-10-17T11:00:00.000Z").uncertain,
    ).toBe(true);
  });

  it("retains uncertainty when a legacy cumulative return is represented as an aggregate payment", () => {
    const data = withTickets(
      ticket({
        result: "cashout",
        partialCashout: true,
        returnCents: 700,
        remainingStakeCents: 1000,
        settledAt: "2026-10-18T10:00:00.000Z",
        returnPayments: [
          {
            id: "legacy",
            at: "2026-10-18T10:00:00.000Z",
            amountCents: 700,
            remainingStakeCents: 1000,
            historicalAggregate: true,
          },
        ],
      }),
    );
    expect(portfolioOverview(data, now).performanceAvailable).toBe(false);
    expect(
      portfolioOverview(data, new Date("2026-10-17T11:00:00.000Z")),
    ).toMatchObject({
      performanceAvailable: false,
      account: { uncertainOpenCost: true, uncertainPerformance: true },
    });
    expect(
      reconcileCash(data, 98_400, "2026-10-17T11:00:00.000Z").uncertain,
    ).toBe(true);
    expect(reconcileCash(data, 98_700, now.toISOString())).toMatchObject({
      status: "matched",
      uncertain: false,
    });
    expect(allocate(data, [candidate()], "fixed", now)[0].reason).toContain(
      "borne du budget",
    );
  });

  it("keeps a freebet with an intermediate return open until its actual closing date", () => {
    const data = withTickets(
      ticket({
        funding: "freebet",
        result: "cashout",
        returnCents: 700,
        settledAt: "2026-10-18T10:00:00.000Z",
        returnPayments: [
          {
            id: "payment1",
            at: "2026-10-17T10:00:00.000Z",
            amountCents: 400,
            remainingStakeCents: 0,
          },
          {
            id: "payment2",
            at: "2026-10-18T10:00:00.000Z",
            amountCents: 300,
            remainingStakeCents: 0,
          },
        ],
      }),
    );
    const snapshot = economicStateAt(
      data,
      new Date("2026-10-17T11:00:00.000Z"),
    );
    expect(ticketPosition(snapshot.tickets[0])).toMatchObject({
      open: true,
      cashStakeCents: 0,
      openCostCents: 0,
      grossReturnCents: 400,
      promotionProfitCents: 400,
    });
  });

  it("rejects fractional or unsafe cents and sums large signed journals exactly", () => {
    expect(() => ticketPosition(ticket({ returnCents: 0.5 }))).toThrow(
      "entier sûr",
    );
    expect(() =>
      ticketPosition(ticket({ stakeCents: Number.MAX_SAFE_INTEGER + 1 })),
    ).toThrow("entier sûr");
    expect(() => ticketPosition(ticket({ remainingStakeCents: 2001 }))).toThrow(
      "coût restant",
    );
    expect(sumCents([Number.MAX_SAFE_INTEGER, 1, -1])).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow("entier sûr");
    expect(reconcileCash(state(), 0.5, now.toISOString()).status).toBe(
      "invalid",
    );
  });
});

describe("independent basket method comparisons", () => {
  it("compares fixed, percent and quarter Kelly from the same unchanged account", () => {
    const data = state();
    data.settings.maxBetPercent = 0.5;
    data.settings.maxEventPercent = 0.5;
    data.settings.maxExposurePercent = 0.5;
    const before = structuredClone(data);
    const result = compareStakes(data, [candidate()], now);
    expect(result.methods.map((method) => method.totalStakeCents)).toEqual([
      1000, 1000, 2500,
    ]);
    expect(result.methods.map((method) => method.totalExpectedCents)).toEqual([
      100, 100, 250,
    ]);
    expect(data).toEqual(before);
    data.settings.fixedStakeCents = 9999;
    data.ledger[0].amountCents = 5;
    expect(result.settingsSnapshot.fixedStakeCents).toBe(1000);
    expect(result.bankrollSnapshot.capitalCents).toBe(100_000);
    expect(result.methods[0].totalStakeCents).toBe(1000);
  });

  it("does not invent an expectation and retains all Kelly abstentions", () => {
    const result = compareStakes(state(), [candidate("p1", null)], now);
    expect(result.methods.map((method) => method.totalStakeCents)).toEqual([
      1000, 1000, 0,
    ]);
    expect(
      result.methods.every((method) => method.totalExpectedCents === null),
    ).toBe(true);
    expect(result.methods[2]).toMatchObject({
      allocatedCount: 0,
      abstainedCount: 1,
    });
  });

  it("floors each cap and shares event risk across the ordered basket", () => {
    const data = state();
    data.ledger[0].amountCents = 99_999;
    data.picks.push(
      pick({ id: "p2", selection: "Nul" }),
      pick({ id: "p3", selection: "Lyon" }),
    );
    data.quotes.push(
      quote({ id: "q2", pickId: "p2" }),
      quote({ id: "q3", pickId: "p3" }),
    );
    const result = compareStakes(
      data,
      [candidate(), candidate("p2"), candidate("p3")],
      now,
    );
    expect(result.budget).toMatchObject({
      betLimitCents: 999,
      eventLimitCents: 1999,
      exposureLimitCents: 4999,
    });
    for (const method of result.methods) {
      expect(method.allocations.map((row) => row.stakeCents)).toEqual([
        999, 999, 1,
      ]);
      expect(method.totalStakeCents).toBe(1999);
      expect(method.remainingExposureCents).toBe(3000);
    }
  });

  it("groups numeric line variants and preserves every source without multiplying stake", () => {
    const data = state();
    data.picks[0].line = "2,5";
    data.picks.push(pick({ id: "p2", line: "+2.50", sourceId: "source-2" }));
    data.quotes.push(quote({ id: "q2", pickId: "p2" }));
    expect(identity(data.picks[0])).toBe(identity(data.picks[1]));
    const result = compareStakes(data, [candidate(), candidate("p2")], now);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].sourceIds).toEqual(["source-1", "source-2"]);
    expect(result.methods[0].allocations.map((row) => row.stakeCents)).toEqual([
      1000, 0,
    ]);
  });

  it("blocks a second event alias in the same basket even without open tickets", () => {
    const data = state();
    data.picks.push(
      pick({ id: "p2", eventKey: "alias-event", selection: "Lyon" }),
    );
    data.quotes = data.picks.map((item, index) =>
      quote({
        id: `q${index}`,
        pickId: item.id,
        mappingStatus: "confirmed",
        identitySnapshot: {
          eventKey: item.eventKey,
          event: item.event,
          startsAt: item.startsAt,
          market: item.market,
          selection: item.selection,
          line: item.line,
          rules: item.rules,
          kind: item.kind,
          timing: item.timing,
        },
        provider: {
          id: "the-odds-api",
          bookmakerKey: "winamax_fr",
          sportKey: "soccer_france_ligue_one",
          eventId: "provider-event",
          marketKey: "h2h",
          outcomeName: item.selection,
          line: "",
          homeTeam: "Paris",
          awayTeam: "Lyon",
        },
      }),
    );
    const rows = allocate(data, [candidate(), candidate("p2")], "fixed", now);
    expect(rows.map((row) => row.stakeCents)).toEqual([1000, 0]);
    expect(rows[1].reason).toContain("même événement fournisseur");
    // The relation also applies to a manually quoted source of the same local event.
    data.picks.push(
      pick({ id: "manual", eventKey: "event-1", selection: "Nul" }),
    );
    data.quotes.push(quote({ id: "manual-quote", pickId: "manual" }));
    expect(
      allocate(data, [candidate("manual"), candidate("p2")], "fixed", now).map(
        (row) => row.stakeCents,
      ),
    ).toEqual([1000, 0]);
    expect(
      allocate(data, [candidate("p2"), candidate("manual")], "fixed", now).map(
        (row) => row.stakeCents,
      ),
    ).toEqual([1000, 0]);
  });

  it("keeps zero Kelly specific to Kelly and accepts zero limits as prohibitions", () => {
    const data = state();
    data.settings.kellyFraction = 0;
    expect(
      compareStakes(data, [candidate()], now).methods.map(
        (method) => method.totalStakeCents,
      ),
    ).toEqual([1000, 1000, 0]);
    data.settings.maxBetPercent = 0;
    expect(
      compareStakes(data, [candidate()], now).methods.every(
        (method) => method.totalStakeCents === 0,
      ),
    ).toBe(true);
    data.settings = { ...state().settings, dailyLossLimitCents: 0 };
    expect(allocate(data, [candidate()], "fixed", now)[0].stakeCents).toBe(0);
    data.settings.dailyLossLimitCents = 0.5;
    expect(allocate(data, [candidate()], "fixed", now)[0].reason).toContain(
      "centimes entiers",
    );
  });

  it("resets losses at Paris midnight but preserves monthly losses", () => {
    const loss = ticket({
      result: "lost",
      returnCents: 0,
      stakeCents: 1200,
      placedAt: "2026-10-17T12:00:00.000Z",
      settledAt: "2026-10-17T21:59:00.000Z",
    });
    const data = withTickets(loss);
    const budget = riskBudget(
      data,
      bankroll(data),
      new Date("2026-10-17T22:01:00.000Z"),
    );
    expect(budget).toMatchObject({
      day: "2026-10-18",
      realizedDayCents: 0,
      realizedMonthCents: -1200,
      dailyRemainingCents: 10_000,
      monthlyRemainingCents: 28_800,
    });
    const nextMonth = riskBudget(
      data,
      bankroll(data),
      new Date("2026-10-31T23:01:00.000Z"),
    );
    expect(nextMonth).toMatchObject({
      day: "2026-11-01",
      realizedMonthCents: 0,
      monthlyRemainingCents: 30_000,
    });
  });

  it("never finances today's allocation with a future deposit or settlement", () => {
    const data = state();
    data.ledger[0].amountCents = 1000;
    data.ledger.push(ledger("deposit", 100_000, "2026-10-19T12:00:00.000Z"));
    expect(
      compareStakes(data, [candidate()], now).bankrollSnapshot.capitalCents,
    ).toBe(1000);
    expect(allocate(data, [candidate()], "fixed", now)[0].stakeCents).toBe(10);
    expect(economicStateAt(data, now).ledger).toHaveLength(1);
  });

  it("does not raise stakes to recoup a loss and pauses every method", () => {
    const data = withTickets(
      ticket({ result: "lost", returnCents: 0, stakeCents: 10_000 }),
    );
    expect(
      compareStakes(data, [candidate()], now).methods.map(
        (method) => method.totalStakeCents,
      ),
    ).toEqual([900, 900, 900]);
    data.settings.paused = true;
    const comparison = compareStakes(data, [candidate()], now);
    expect(
      comparison.methods.every((method) => method.totalStakeCents === 0),
    ).toBe(true);
    expect(comparison.budget.blockedReasons).toContain("Suggestions en pause.");
  });
});
