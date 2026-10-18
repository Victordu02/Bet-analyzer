import { describe, expect, it } from "vitest";
import { identity, matchesSegment, normalizedProfit } from "./calculations";
import {
  analyzeSegment,
  analyzeTipsters,
  predefinedSegments,
  strategyAnalysis,
} from "./tipster-analysis";
import {
  DEFAULT_SETTINGS,
  type AppState,
  type Pick,
  type Quote,
  type Simulation,
  type Ticket,
} from "./types";

function pick(overrides: Partial<Pick> = {}): Pick {
  return {
    id: "p1",
    tipsterId: "t1",
    sourceId: "source-p1",
    sourceUrl: "https://example.com/p1",
    publishedAt: "2026-01-01T09:00:00.000Z",
    observedAt: "2026-01-01T09:05:00.000Z",
    startsAt: "2026-01-02T12:00:00.000Z",
    event: "Paris–Lyon",
    eventKey: "event-1",
    sport: "Football",
    competition: "Ligue 1",
    market: "1X2",
    selection: "Paris",
    line: "",
    rules: "90 minutes",
    odds: 2.5,
    minOdds: null,
    stakeUnits: 10,
    result: "won",
    settlementSource: "Résultat documenté",
    settledAt: "2026-01-02T14:00:00.000Z",
    kind: "single",
    timing: "prematch",
    evidence: "declared",
    initialContent: "Paris",
    argument: "",
    notes: "",
    revisions: [],
    manuallyCorrected: false,
    ...overrides,
  };
}

function state(picks: Pick[] = [pick()]): AppState {
  return {
    workspace: "demo",
    picks,
    tickets: [],
    quotes: [],
    ledger: [],
    simulations: [],
    imports: [],
    audit: [],
    settings: { ...DEFAULT_SETTINGS },
    tipsters: [
      {
        id: "t1",
        name: "Profil fictif inactif",
        source: "Fichier",
        sourceUrl: "https://example.com",
        discoveredAt: "2026-01-01T09:00:00.000Z",
        active: false,
        notes: "",
        accessNotes: "Import autorisé",
        monthlyCostCents: 1000,
        completeness: "unknown",
        bankrolls: ["Bankroll source"],
      },
      {
        id: "t2",
        name: "Profil sans données",
        source: "Manuel",
        sourceUrl: "",
        discoveredAt: "2026-01-01T09:00:00.000Z",
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
        name: "Football simple figé",
        filter: { sport: "Football" },
        createdAt: "2025-12-01T00:00:00.000Z",
        discoveryEnd: "2026-01-05T23:59:59.000Z",
        frozenAt: "2026-01-06T00:00:00.000Z",
        validationStart: "2026-01-07T00:00:00.000Z",
        active: true,
        notes: "",
      },
    ],
  };
}

function observed(overrides: Partial<Pick> = {}): Pick {
  const original = pick({
    evidence: "observed",
    publishedAt: "2026-01-08T09:00:00.000Z",
    observedAt: "2026-01-08T09:05:00.000Z",
    startsAt: "2026-01-08T12:00:00.000Z",
    result: "open",
    settledAt: null,
    settlementSource: "",
    ...overrides,
  });
  return {
    ...original,
    result: "won",
    settledAt: "2026-01-08T14:00:00.000Z",
    settlementSource: "Résultat documenté",
    revisions: [
      {
        at: "2026-01-08T14:01:00.000Z",
        description: "Règlement",
        previous: { ...original },
      },
    ],
  };
}

function quote(pickId = "p1", overrides: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    pickId,
    bookmaker: "Winamax FR",
    odds: 2,
    observedAt: "2026-01-08T09:07:00.000Z",
    recordedAt: "2026-01-08T09:08:00.000Z",
    source: "Relevé manuel",
    sourceUrl: "https://example.com/quote",
    available: true,
    matchConfirmed: true,
    closing: false,
    referenceProbability: null,
    notes: "",
    ...overrides,
  };
}

function simulation(
  source: Pick,
  overrides: Partial<Simulation> = {},
): Simulation {
  return {
    id: "simulation-1",
    name: "Scénario fictif",
    createdAt: "2026-01-08T09:10:00.000Z",
    strategyId: "strategy",
    method: "fixed",
    assumptions: "Cote manuelle",
    settingsSnapshot: { ...DEFAULT_SETTINGS },
    allocations: [
      {
        pickId: source.id,
        eventKey: source.eventKey,
        identity: identity(source),
        stakeCents: 1000,
        odds: 2,
        probability: null,
        probabilitySource: null,
        expectedCents: null,
        reason: "Simulation explicite",
      },
    ],
    ...overrides,
  };
}

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "ticket-1",
    sourceId: "",
    pickId: "p1",
    bookmaker: "Winamax FR",
    event: "Paris–Lyon",
    eventKey: "event-1",
    selection: "Paris",
    market: "1X2",
    line: "",
    rules: "90 minutes",
    kind: "single",
    odds: 3,
    stakeCents: 2000,
    funding: "cash",
    placedAt: "2026-01-08T09:15:00.000Z",
    settledAt: "2026-01-08T14:00:00.000Z",
    result: "won",
    returnCents: 6000,
    feeCents: 100,
    remainingStakeCents: null,
    partialCashout: false,
    strategyId: "strategy",
    source: "Ticket saisi manuellement",
    notes: "",
    manuallyCorrected: false,
    revisions: [],
    ...overrides,
  };
}

describe("comparable tipster results", () => {
  it("separates declared stake-weighted P&L from a constant unit, with voids in the stake denominator", () => {
    const rows = [
      pick(),
      pick({ id: "lost", eventKey: "event-2", result: "lost", stakeUnits: 1 }),
      pick({ id: "void", eventKey: "event-3", result: "void", stakeUnits: 1 }),
    ];
    const first = analyzeSegment(state(rows), { level: "declared" });
    const multiplied = analyzeSegment(
      state(rows.map((row) => ({ ...row, stakeUnits: row.stakeUnits * 100 }))),
      { level: "declared" },
    );
    expect(first).toMatchObject({
      count: 3,
      settled: 3,
      events: 3,
      profitUnits: 0.5,
      declaredProfitUnits: 14,
      winRate: 0.5,
    });
    expect(first.yield).toBeCloseTo(1 / 6);
    expect(multiplied.profitUnits).toBe(first.profitUnits);
    expect(multiplied.yield).toBe(first.yield);
    expect(multiplied.declaredProfitUnits).toBe(1400);
  });

  it("counts an accumulator once at its ticket odds and reports unsupported categories separately", () => {
    const accumulator = pick({
      kind: "accumulator",
      odds: 6,
      stakeUnits: 5,
      selection: "A + B + C",
    });
    expect(normalizedProfit(accumulator)).toBe(5);
    expect(normalizedProfit({ ...accumulator, result: "half_won" })).toBeNull();
    const result = analyzeSegment(
      state([
        accumulator,
        pick({ id: "partial", result: "half_won" }),
        pick({ id: "cashout", result: "cashout" }),
      ]),
      { level: "declared" },
    );
    expect(result).toMatchObject({
      count: 3,
      settled: 1,
      profitUnits: 5,
      declaredProfitUnits: 25,
      excluded: 2,
    });
    expect(result.categories).toMatchObject({
      accumulator: 1,
      partial: 1,
      cashout: 1,
    });
    expect(result.message).toContain("Combinés comptés une fois");
  });

  it("does not invent a bankroll, denominator or confidence for empty or single-event data", () => {
    expect(analyzeSegment(state([]), { level: "declared" })).toMatchObject({
      count: 0,
      profitUnits: null,
      yield: null,
      winRate: null,
      drawdownPct: null,
      dispersion: null,
      roiInterval: null,
      status: "insufficient",
    });
    const single = analyzeSegment(state(), { level: "declared" });
    expect(single).toMatchObject({
      profitUnits: 1.5,
      drawdownPct: null,
      roiInterval: null,
      status: "insufficient",
    });
    expect(single.message).toContain("Données insuffisantes pour conclure");
    expect(
      analyzeSegment(state([pick({ result: "void" })]), { level: "declared" }),
    ).toMatchObject({ profitUnits: 0, yield: 0, winRate: null });
  });

  it("shows concentrated gains and sample dispersion without a synthetic score", () => {
    const data = state([
      pick({ odds: 10 }),
      pick({ id: "p2", odds: 2, eventKey: "e2" }),
      pick({ id: "p3", result: "lost", eventKey: "e3" }),
    ]);
    const result = analyzeSegment(data, { level: "declared" });
    expect(result.biggestWinShare).toBe(0.9);
    expect(result.dispersion).toBeCloseTo(Math.sqrt(28));
    expect(result).not.toHaveProperty("score");
  });

  it("groups simultaneous settlements before drawdown and bootstraps whole events reproducibly", () => {
    const rows = [
      pick({ id: "a-loss", result: "lost" }),
      pick({ id: "b-loss", result: "lost" }),
      pick({ id: "c-win", odds: 3 }),
    ];
    const correlated = analyzeSegment(state(rows), { level: "declared" });
    expect(correlated.maxDrawdownUnits).toBe(0);
    expect(correlated.series).toHaveLength(1);
    expect(correlated.roiInterval).toBeNull();
    rows.push(
      pick({
        id: "d",
        eventKey: "other",
        result: "lost",
        settledAt: "2026-01-03T14:00:00.000Z",
      }),
    );
    const result = analyzeSegment(state(rows), { level: "declared" });
    expect(result.maxDrawdownUnits).toBe(1);
    expect(result.roiInterval).toEqual(
      analyzeSegment(state([...rows].reverse()), { level: "declared" })
        .roiInterval,
    );
  });

  it("preserves inactive and losing profiles, unknown coverage and observation duration", () => {
    const data = state([observed(), pick({ id: "declared", result: "lost" })]);
    const result = analyzeTipsters(
      data,
      { level: "observed" },
      new Date("2026-01-10T00:00:00.000Z"),
    );
    expect(result).toHaveLength(2);
    expect(result[0].tipster.active).toBe(false);
    expect(result[0].proofCounts).toEqual({
      declared: 1,
      observed: 1,
      simulated: 0,
      executed: 0,
    });
    expect(result[0].quality.completeness).toBe("Exhaustivité non vérifiable");
    expect(result[0].observationFrom).toBe("2026-01-08T09:05:00.000Z");
    expect(result[1].metrics.profitUnits).toBeNull();
  });
});

describe("four independent evidence populations", () => {
  it("does not upgrade an imported or impossible prospective timestamp", () => {
    const data = state([
      pick({ evidence: "observed", observedAt: "2026-01-03T00:00:00.000Z" }),
      pick({ id: "invalid", evidence: "observed", observedAt: "not-a-date" }),
    ]);
    expect(analyzeSegment(data, { level: "observed" }).count).toBe(0);
    expect(analyzeSegment(data, { level: "declared" }).count).toBe(2);
    expect(analyzeSegment(data, { level: "executed" }).count).toBe(0);
  });

  it("retains an observed result after normal settlement but prevents a post-event change of selection from gaining retroactively", () => {
    const valid = observed();
    expect(analyzeSegment(state([valid]), { level: "observed" })).toMatchObject(
      { count: 1, settled: 1, profitUnits: 1.5 },
    );
    const changed = {
      ...valid,
      evidence: "declared" as const,
      selection: "Lyon",
      result: "won" as const,
      revisions: [
        ...valid.revisions,
        {
          at: "2026-01-09T00:00:00.000Z",
          description: "Sélection corrigée",
          previous: { ...valid },
        },
      ],
    };
    const result = analyzeSegment(state([changed]), { level: "observed" });
    expect(result).toMatchObject({
      count: 1,
      settled: 0,
      profitUnits: null,
      missingProof: 1,
    });
  });

  it("does not move a historically observed gain into a category corrected after its result", () => {
    const original = observed();
    const revised = {
      ...original,
      sport: "Tennis",
      competition: "ATP",
      evidence: "declared" as const,
      revisions: [
        ...original.revisions,
        {
          at: "2026-01-09T00:00:00.000Z",
          description: "Classification corrigée",
          previous: { ...original },
        },
      ],
    };
    const data = state([revised]);
    expect(
      analyzeSegment(data, {
        level: "observed",
        filter: { sport: "Football" },
      }),
    ).toMatchObject({ settled: 1, profitUnits: 1.5 });
    expect(
      analyzeSegment(data, { level: "observed", filter: { sport: "Tennis" } })
        .count,
    ).toBe(0);
    expect(
      analyzeSegment(data, { level: "declared", filter: { sport: "Tennis" } })
        .count,
    ).toBe(1);
    expect(
      predefinedSegments(data.picks)
        .filter((segment) => segment.axis === "sport")
        .map((segment) => segment.label),
    ).toEqual(["Football", "Tennis"]);
  });

  it("uses the Winamax snapshot, actual ticket return and ticket odds in separate proof populations", () => {
    const source = observed();
    const data = state([source]);
    data.quotes = [quote()];
    data.simulations = [simulation(source)];
    data.tickets = [ticket()];
    expect(analyzeSegment(data, { level: "observed" }).profitUnits).toBe(1.5);
    expect(analyzeSegment(data, { level: "simulated" })).toMatchObject({
      settled: 1,
      profitUnits: 1,
      cashProfitCents: 1000,
    });
    expect(analyzeSegment(data, { level: "executed" })).toMatchObject({
      settled: 1,
      profitUnits: 2,
      cashProfitCents: 3900,
      stakeCents: 2000,
    });
    expect(
      analyzeSegment(data, { level: "executed", filter: { oddsMin: 3 } }).count,
    ).toBe(1);
    data.tickets[0] = ticket({ result: "void", returnCents: 2000 });
    expect(analyzeSegment(data, { level: "executed" })).toMatchObject({
      profitUnits: 0,
      cashProfitCents: -100,
      yield: 0,
    });
    data.tickets[0] = ticket({ funding: "freebet", returnCents: 4000 });
    expect(analyzeSegment(data, { level: "executed" })).toMatchObject({
      settled: 0,
      cashProfitCents: null,
      excluded: 1,
    });
  });

  it("does not pool scenarios or turn zero-stake/unknown-price allocations into proven simulated bets", () => {
    const source = observed();
    const data = state([source]);
    data.quotes = [quote()];
    data.simulations = [
      simulation(source),
      simulation(source, { id: "scenario-2" }),
    ];
    expect(analyzeSegment(data, { level: "simulated" })).toMatchObject({
      count: 2,
      settled: 0,
      profitUnits: null,
    });
    expect(
      analyzeSegment(data, { level: "simulated", simulationId: "scenario-2" })
        .profitUnits,
    ).toBe(1);
    expect(
      analyzeTipsters(data, { level: "simulated" })[0].proofCounts.simulated,
    ).toBe(1);
    data.simulations[0].allocations[0].stakeCents = 0;
    data.simulations.pop();
    expect(analyzeSegment(data, { level: "simulated" }).settled).toBe(0);
    expect(
      analyzeTipsters(data, { level: "simulated" })[0].proofCounts.simulated,
    ).toBe(0);
  });

  it("requires the latest quote known before simulation, with publication, recording and closing guards", () => {
    const source = observed();
    const data = state([source]);
    data.quotes = [quote()];
    data.simulations = [simulation(source)];
    data.quotes.push(
      quote("p1", {
        id: "unavailable",
        observedAt: "2026-01-08T09:09:00.000Z",
        recordedAt: "2026-01-08T09:09:00.000Z",
        available: false,
      }),
    );
    expect(analyzeSegment(data, { level: "simulated" })).toMatchObject({
      settled: 0,
      missingProof: 1,
    });
    data.quotes = [quote("p1", { recordedAt: "2026-01-08T13:00:00.000Z" })];
    expect(analyzeSegment(data, { level: "simulated" }).settled).toBe(0);
    data.quotes = [quote("p1", { closing: true })];
    expect(analyzeSegment(data, { level: "simulated" }).settled).toBe(0);
  });
});

describe("frozen segments and chronology", () => {
  it("keeps pending and subsequently imported historical results out of discovery P&L", () => {
    const pendingAtCutoff = pick({
      id: "pending",
      result: "won",
      settledAt: "2026-01-08T14:00:00.000Z",
      revisions: [
        {
          at: "2026-01-08T14:01:00.000Z",
          description: "Règlement tardif",
          previous: {
            ...pick({
              id: "pending",
              result: "open",
              settledAt: null,
              settlementSource: "",
            }),
          },
        },
      ],
    });
    const lateImport = pick({
      id: "late",
      observedAt: "2026-01-18T00:00:00.000Z",
    });
    const data = state([pick(), pendingAtCutoff, lateImport]);
    const discovery = strategyAnalysis(data, "strategy", "declared").discovery;
    expect(discovery).toMatchObject({ count: 2, settled: 1, profitUnits: 1.5 });
    expect(discovery.message).toContain("n’est pas antidaté");
  });

  it("requires pre-frozen rules and genuine prospective observation rather than a merely later event", () => {
    const data = state([
      observed(),
      pick({
        id: "declared-after",
        observedAt: "2026-01-08T09:00:00.000Z",
        startsAt: "2026-01-08T12:00:00.000Z",
      }),
    ]);
    expect(
      strategyAnalysis(data, "strategy", "observed").validation.settled,
    ).toBe(1);
    expect(
      strategyAnalysis(data, "strategy", "declared").validation.settled,
    ).toBe(0);
    data.strategies[0].frozenAt = "2026-01-10T00:00:00.000Z";
    expect(strategyAnalysis(data, "strategy", "observed")).toMatchObject({
      validFreeze: false,
    });
    expect(
      strategyAnalysis(data, "strategy", "observed").validation.profitUnits,
    ).toBeNull();
  });

  it("reconstructs pre-cutoff settlements even when later revisions share a timestamp", () => {
    const initial = pick({ result: "won" });
    const intermediate = { ...initial, result: "lost" as const };
    const current = {
      ...initial,
      result: "void" as const,
      revisions: [
        {
          at: "2026-01-10T12:00:00.000Z",
          description: "Révision 1",
          previous: { ...initial },
        },
        {
          at: "2026-01-10T12:00:00.000Z",
          description: "Révision 2",
          previous: { ...intermediate },
        },
      ],
    };
    expect(
      strategyAnalysis(state([current]), "strategy", "declared").discovery
        .profitUnits,
    ).toBe(1.5);
  });

  it("restores pre-cutoff publication/event dates before applying period filters", () => {
    const original = pick();
    const current = {
      ...original,
      publishedAt: "2026-01-12T00:00:00.000Z",
      startsAt: "2026-01-13T00:00:00.000Z",
      revisions: [
        {
          at: "2026-01-15T00:00:00.000Z",
          description: "Dates corrigées",
          previous: { ...original },
        },
      ],
    };
    const result = analyzeSegment(state([current]), {
      level: "declared",
      strategyId: "strategy",
      phase: "discovery",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z",
    });
    expect(result).toMatchObject({
      count: 1,
      settled: 1,
      profitUnits: 1.5,
      periodFrom: original.publishedAt,
    });
  });

  it("keeps simulation and executed results known at discovery instead of subsequent settlement corrections", () => {
    const original = pick({
      publishedAt: "2026-01-01T09:00:00.000Z",
      observedAt: "2026-01-01T09:05:00.000Z",
    });
    const corrected = {
      ...original,
      result: "lost" as const,
      revisions: [
        {
          at: "2026-01-10T00:00:00.000Z",
          description: "Révision de résultat",
          previous: { ...original },
        },
      ],
    };
    const data = state([corrected]);
    data.quotes = [
      quote("p1", {
        observedAt: "2026-01-01T09:07:00.000Z",
        recordedAt: "2026-01-01T09:08:00.000Z",
      }),
    ];
    data.simulations = [
      simulation(original, { createdAt: "2026-01-01T09:10:00.000Z" }),
    ];
    const originalTicket = ticket({
      placedAt: "2026-01-01T09:15:00.000Z",
      settledAt: "2026-01-02T14:00:00.000Z",
    });
    data.tickets = [
      {
        ...originalTicket,
        result: "lost",
        returnCents: 0,
        revisions: [
          {
            at: "2026-01-10T00:00:00.000Z",
            description: "Révision ticket",
            previous: { ...originalTicket },
          },
        ],
      },
    ];
    expect(
      strategyAnalysis(data, "strategy", "simulated").discovery,
    ).toMatchObject({ profitUnits: 1, cashProfitCents: 1000 });
    expect(
      strategyAnalysis(data, "strategy", "executed").discovery,
    ).toMatchObject({ profitUnits: 2, cashProfitCents: 3900 });
  });

  it("predeclares all seven axes with half-open odds/delay boundaries and distinct frozen variants", () => {
    const boundary = pick({
      odds: 2,
      publishedAt: "2026-01-02T11:00:00.000Z",
      startsAt: "2026-01-02T12:00:00.000Z",
    });
    const definitions = predefinedSegments([boundary]);
    expect(new Set(definitions.map((item) => item.axis)).size).toBe(7);
    expect(
      definitions
        .filter(
          (item) =>
            item.axis === "odds" && matchesSegment(boundary, item.filter),
        )
        .map((item) => item.key),
    ).toEqual(["odds-2-3"]);
    expect(
      definitions
        .filter(
          (item) =>
            item.axis === "delay" && matchesSegment(boundary, item.filter),
        )
        .map((item) => item.key),
    ).toEqual(["delay-60-360"]);
    const data = state([observed()]);
    data.strategies.push({
      ...data.strategies[0],
      id: "variant",
      filter: { sport: "Tennis" },
    });
    expect(
      strategyAnalysis(data, "strategy", "observed").validation.count,
    ).toBe(1);
    expect(strategyAnalysis(data, "variant", "observed").validation.count).toBe(
      0,
    );
    expect(data.strategies).toHaveLength(2);
  });
});
