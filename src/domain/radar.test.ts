import { describe, expect, it } from "vitest";
import { decision, identity } from "./calculations";
import { assessQuote } from "./quote-assessment";
import {
  decisionAnalysis,
  evaluateExpectedValue,
  evaluateOutcomeStates,
  normalizeCompleteMarket,
  radarCandidates,
  sensitivityGrid,
  validateProbabilityEstimate,
  type CompleteMarketInput,
  type ProbabilityEstimate,
} from "./radar";
import {
  DEFAULT_SETTINGS,
  type AppState,
  type Pick,
  type PickIdentitySnapshot,
  type Quote,
  type Ticket,
} from "./types";

const now = new Date("2026-10-18T12:00:00.000Z");

function manual(probability: number): ProbabilityEstimate {
  return {
    source: "manual",
    probability,
    recordedAt: "2026-10-18T11:59:00.000Z",
    basis: "Hypothèse personnelle explicite, non validée",
  };
}

function pick(overrides: Partial<Pick> = {}): Pick {
  return {
    id: "p1",
    tipsterId: "t1",
    sourceId: "source-p1",
    sourceUrl: "https://example.com/p1",
    publishedAt: "2026-10-18T11:45:00.000Z",
    observedAt: "2026-10-18T11:46:00.000Z",
    startsAt: "2026-10-18T18:00:00.000Z",
    event: "Paris–Lyon",
    eventKey: "event-1",
    sport: "Football",
    competition: "Ligue 1",
    market: "1X2",
    selection: "Paris",
    line: "",
    rules: "90 minutes",
    odds: 2.2,
    minOdds: null,
    stakeUnits: 1,
    result: "open",
    settlementSource: "",
    settledAt: null,
    kind: "single",
    timing: "prematch",
    evidence: "observed",
    initialContent: "Paris",
    argument: "",
    notes: "",
    revisions: [],
    manuallyCorrected: false,
    ...overrides,
  };
}

function snapshot(source: Pick = pick()): PickIdentitySnapshot {
  return {
    eventKey: source.eventKey,
    event: source.event,
    startsAt: source.startsAt,
    market: source.market,
    selection: source.selection,
    line: source.line,
    rules: source.rules,
    kind: source.kind,
    timing: source.timing,
  };
}

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    pickId: "p1",
    bookmaker: "Winamax FR",
    odds: 2,
    observedAt: "2026-10-18T11:58:00.000Z",
    recordedAt: "2026-10-18T11:59:00.000Z",
    source: "Saisie manuelle",
    sourceUrl: "",
    available: true,
    matchConfirmed: true,
    closing: false,
    referenceProbability: null,
    notes: "",
    collectionMode: "manual",
    mappingStatus: "confirmed",
    identitySnapshot: snapshot(),
    ...overrides,
  };
}

function state(): AppState {
  return {
    workspace: "personal",
    picks: [pick()],
    quotes: [quote()],
    tickets: [],
    ledger: [
      {
        id: "initial",
        kind: "initial",
        amountCents: 100_000,
        at: "2026-10-01T00:00:00.000Z",
        description: "Capital",
        ticketId: null,
        revision: 1,
      },
    ],
    tipsters: [
      {
        id: "t1",
        name: "Fictif",
        source: "Manuel",
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
        id: "s1",
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

function market(
  overrides: Partial<CompleteMarketInput> = {},
): CompleteMarketInput {
  return {
    outcomes: [
      { label: "Paris", odds: 1.9 },
      { label: "Lyon", odds: 1.9 },
    ],
    complete: true,
    source: "Marché fictif",
    sourceUrl: "https://example.com/market",
    observedAt: "2026-10-18T11:58:00.000Z",
    coverage: "Marché complet à deux issues, mêmes règles",
    ...overrides,
  };
}

describe("expected value with explicit provenance", () => {
  it("calculates the requested 10 € / 2.00 / 55% example and never infers a probability", () => {
    expect(
      evaluateExpectedValue(
        { stakeCents: 1000, odds: 2, estimate: manual(0.55) },
        now,
      ),
    ).toMatchObject({
      status: "known",
      breakEven: 0.5,
      roi: 0.1,
      expectedCents: 100,
      kelly: 0.1,
    });
    expect(
      evaluateExpectedValue({ stakeCents: 1000, odds: 2, estimate: null }, now),
    ).toMatchObject({
      status: "unknown",
      breakEven: 0.5,
      roi: null,
      expectedCents: null,
      kelly: null,
    });
    expect(
      evaluateExpectedValue({ stakeCents: 0, odds: 2, estimate: null }, now)
        .breakEven,
    ).toBe(0.5);
  });

  it("accepts probability endpoints, floors fractional cents and rejects unsafe amounts", () => {
    expect(
      evaluateExpectedValue(
        { stakeCents: 1000, odds: 2, estimate: manual(0) },
        now,
      ),
    ).toMatchObject({ roi: -1, expectedCents: -1000, kelly: 0 });
    expect(
      evaluateExpectedValue(
        { stakeCents: 1000, odds: 2, estimate: manual(1) },
        now,
      ),
    ).toMatchObject({ roi: 1, expectedCents: 1000, kelly: 1 });
    expect(
      evaluateExpectedValue(
        { stakeCents: 101, odds: 2, estimate: manual(0.333) },
        now,
      ).expectedCents,
    ).toBe(-34);
    expect(
      evaluateExpectedValue(
        {
          stakeCents: Number.MAX_SAFE_INTEGER + 1,
          odds: 2,
          estimate: manual(0.55),
        },
        now,
      ).status,
    ).toBe("invalid");
    expect(
      evaluateExpectedValue(
        { stakeCents: Number.MAX_SAFE_INTEGER, odds: 100, estimate: manual(1) },
        now,
      ).expectedCents,
    ).toBeNull();
    expect(
      evaluateExpectedValue(
        { stakeCents: 1000, odds: Number.NaN, estimate: manual(0.55) },
        now,
      ).status,
    ).toBe("invalid");
    expect(
      evaluateExpectedValue(
        { stakeCents: 1000, odds: 2, estimate: manual(1.01) },
        now,
      ).status,
    ).toBe("invalid");
  });

  it("requires a dated explicit hypothesis and rejects expired estimates", () => {
    expect(
      validateProbabilityEstimate({ ...manual(0.55), basis: "" }, now).valid,
    ).toBe(false);
    expect(
      validateProbabilityEstimate(
        { ...manual(0.55), recordedAt: "2026-10-18T13:00:00.000Z" },
        now,
      ).valid,
    ).toBe(false);
    expect(
      validateProbabilityEstimate(
        { ...manual(0.55), validUntil: "2026-10-18T11:59:30.000Z" },
        now,
      ).valid,
    ).toBe(false);
    expect(
      validateProbabilityEstimate(manual(0.55), now).warnings.join(" "),
    ).toContain("ne démontre aucun avantage");
  });

  it("only removes margin from a confirmed complete sourced market and does not create an edge against it", () => {
    expect(
      normalizeCompleteMarket(market({ complete: false }), now),
    ).toMatchObject({ valid: false, probabilities: [], overround: null });
    const result = normalizeCompleteMarket(market(), now);
    expect(result.probabilities.map((outcome) => outcome.probability)).toEqual([
      0.5, 0.5,
    ]);
    expect(result.overround).toBeCloseTo(2 / 1.9 - 1);
    const estimate: ProbabilityEstimate = {
      source: "market",
      probability: 0.5,
      recordedAt: "2026-10-18T11:59:00.000Z",
      basis: "Normalisation proportionnelle du marché complet",
      market: { ...market(), selection: "Paris" },
    };
    expect(
      evaluateExpectedValue({ stakeCents: 1000, odds: 1.9, estimate }, now),
    ).toMatchObject({ status: "known", roi: -0.05, expectedCents: -50 });
    expect(
      validateProbabilityEstimate({ ...estimate, probability: 0.6 }, now).valid,
    ).toBe(false);
    expect(
      normalizeCompleteMarket(market({ sourceUrl: "javascript:alert(1)" }), now)
        .valid,
    ).toBe(false);
    expect(
      normalizeCompleteMarket(
        market({
          outcomes: [
            { label: "Paris", odds: 2 },
            { label: " paris ", odds: 2 },
          ],
        }),
        now,
      ).valid,
    ).toBe(false);
  });

  it("requires documented model evaluation available before prediction rather than a confidence label", () => {
    const estimate: ProbabilityEstimate = {
      source: "model",
      probability: 0.55,
      recordedAt: "2026-10-18T11:59:00.000Z",
      basis: "Prévision externe conservée",
      model: {
        name: "Modèle test",
        version: "1",
        documentationUrl: "https://example.com/model",
        predictedAt: "2026-10-18T11:58:00.000Z",
        trainedUntil: "2026-10-01T00:00:00.000Z",
        evaluation: {
          sourceUrl: "https://example.com/evaluation",
          from: "2026-10-02T00:00:00.000Z",
          to: "2026-10-17T00:00:00.000Z",
          sampleSize: 100,
          brier: 0.24,
          logLoss: 0.68,
        },
      },
    };
    expect(validateProbabilityEstimate(estimate, now).valid).toBe(true);
    expect(
      validateProbabilityEstimate(estimate, now).warnings.join(" "),
    ).toContain("ne sont pas vérifiées automatiquement");
    estimate.model.evaluation.to = "2026-10-19T00:00:00.000Z";
    expect(validateProbabilityEstimate(estimate, now).valid).toBe(false);
  });

  it("evaluates an explicit hypothetical sensitivity grid including 0/1 without clipping invalid assumptions", () => {
    const grid = sensitivityGrid(1000, [1.8, 2, 2.2], [0, 0.55, 1]);
    expect(grid.cells).toHaveLength(9);
    expect(
      grid.cells.find((cell) => cell.odds === 2 && cell.probability === 0.55),
    ).toMatchObject({ roi: 0.1, expectedCents: 100 });
    expect(
      grid.cells.find((cell) => cell.odds === 2 && cell.probability === 0)
        ?.expectedCents,
    ).toBe(-1000);
    expect(
      grid.cells.find((cell) => cell.odds === 2 && cell.probability === 1)
        ?.expectedCents,
    ).toBe(1000);
    expect(sensitivityGrid(1000, [2], [-0.1, 1.1]).cells).toEqual([]);
  });

  it("evaluates refund/partial/fee states from gross returns without subtracting a cash stake twice", () => {
    const result = evaluateOutcomeStates(
      {
        stakeCents: 2000,
        funding: "cash",
        states: [
          {
            label: "Gagné",
            estimate: manual(0.5),
            grossReturnCents: 5000,
            feeCents: 100,
          },
          {
            label: "Annulé",
            estimate: manual(0.1),
            grossReturnCents: 2000,
            feeCents: 100,
          },
          {
            label: "Perdu",
            estimate: manual(0.4),
            grossReturnCents: 0,
            feeCents: 100,
          },
        ],
      },
      now,
    );
    expect(result).toMatchObject({
      status: "known",
      expectedCents: 600,
      roi: 0.3,
      probabilityTotal: 1,
    });
    expect(
      evaluateOutcomeStates(
        {
          stakeCents: 1000,
          funding: "freebet",
          states: [
            {
              label: "Gagné",
              estimate: manual(1),
              grossReturnCents: 2000,
              feeCents: 0,
            },
          ],
        },
        now,
      ),
    ).toMatchObject({ expectedCents: 2000, roi: null });
    expect(
      evaluateOutcomeStates(
        {
          stakeCents: 1000,
          funding: "cash",
          states: [
            {
              label: "Gagné",
              estimate: manual(0.9),
              grossReturnCents: 2000,
              feeCents: 0,
            },
          ],
        },
        now,
      ).status,
    ).toBe("invalid");
    expect(
      evaluateOutcomeStates(
        {
          stakeCents: 1000,
          funding: "cash",
          states: [
            {
              label: "Inconnu",
              estimate: null,
              grossReturnCents: 2000,
              feeCents: 0,
            },
          ],
        },
        now,
      ),
    ).toMatchObject({ status: "unknown", expectedCents: null });
  });
});

describe("radar chronology, exact matching and reproducibility", () => {
  it("implements all six statuses without removing expired, unavailable or unmatched dossiers", () => {
    const data = state();
    expect(decision(data.picks[0], data, now).status).toBe("À analyser");
    data.picks[0].minOdds = 2.1;
    expect(decision(data.picks[0], data, now).status).toBe(
      "Cote insuffisante selon le seuil défini",
    );
    data.picks[0].minOdds = null;
    data.quotes[0].available = false;
    expect(decision(data.picks[0], data, now).status).toBe(
      "Marché indisponible",
    );
    data.quotes[0].available = true;
    data.quotes[0].matchConfirmed = false;
    expect(decision(data.picks[0], data, now).status).toBe(
      "Données insuffisantes",
    );
    data.quotes[0].matchConfirmed = true;
    data.tipsters[0].active = false;
    expect(decision(data.picks[0], data, now).status).toBe("En observation");
    data.picks[0].result = "lost";
    expect(decision(data.picks[0], data, now).status).toBe("Expiré");
    const before = structuredClone(data);
    expect(radarCandidates(data, { now })).toHaveLength(1);
    expect(data).toEqual(before);
  });

  it("uses original provider freshness and the stricter TTL even after a later cache collection", () => {
    const data = state();
    data.quotes[0] = quote({
      collectionMode: "provider",
      providerLastUpdatedAt: "2026-10-18T11:58:00.000Z",
      providerTtlSeconds: 120,
    });
    expect(decision(data.picks[0], data, now).eligible).toBe(true);
    const afterExpiry = new Date("2026-10-18T12:00:00.001Z");
    data.quotes[0].recordedAt = "2026-10-18T12:00:00.000Z";
    expect(decision(data.picks[0], data, afterExpiry).status).toBe(
      "En observation",
    );
    expect(
      assessQuote(data.picks[0], data.quotes, 15, afterExpiry)
        .providerAgeMinutes,
    ).toBeGreaterThan(2);
  });

  it("enforces both observation/recording times and excludes future, prepublication and closing quotes", () => {
    const data = state();
    data.quotes = [
      quote({ recordedAt: "2026-10-18T11:57:00.000Z" }),
      quote({ id: "future", recordedAt: "2026-10-18T12:01:00.000Z" }),
      quote({ id: "closing", closing: true }),
      quote({ id: "old", observedAt: "2026-10-18T11:40:00.000Z" }),
    ];
    const result = decisionAnalysis(data, data.picks[0], { now });
    expect(result.quote).toBeNull();
    expect(result.quoteHistory).toHaveLength(4);
    expect(result.status).toBe("Données insuffisantes");
  });

  it("blocks ambiguous mapping, different handicap lines, rules and provider identities", () => {
    const data = state();
    data.quotes[0].mappingStatus = "ambiguous";
    expect(decision(data.picks[0], data, now).eligible).toBe(false);
    data.quotes[0].mappingStatus = "confirmed";
    data.quotes[0].identitySnapshot!.line = "-1.5";
    expect(
      decisionAnalysis(data, data.picks[0], { now }).matching.issues.join(" "),
    ).toContain("line");
    data.quotes[0].identitySnapshot = snapshot();
    data.quotes[0].identitySnapshot.rules = "Prolongation incluse";
    expect(decision(data.picks[0], data, now).eligible).toBe(false);
    data.quotes[0] = quote({
      collectionMode: "provider",
      identitySnapshot: undefined,
      providerLastUpdatedAt: "2026-10-18T11:58:00.000Z",
      providerTtlSeconds: 120,
    });
    expect(decision(data.picks[0], data, now).eligible).toBe(false);
  });

  it("lets a newer explicit manual observation serve as fallback but never reuses an older available quote after unavailability", () => {
    const data = state();
    data.quotes[0].available = false;
    data.quotes.push(
      quote({
        id: "manual-new",
        observedAt: "2026-10-18T11:59:00.000Z",
        recordedAt: "2026-10-18T11:59:30.000Z",
      }),
    );
    expect(decision(data.picks[0], data, now).quote?.id).toBe("manual-new");
    expect(decision(data.picks[0], data, now).eligible).toBe(true);
    data.quotes[1].available = false;
    data.quotes[0].available = true;
    expect(decision(data.picks[0], data, now).status).toBe(
      "Marché indisponible",
    );
  });

  it("keeps first/current price times and requires personal limits independently from market eligibility", () => {
    const data = state();
    data.quotes.unshift(
      quote({
        id: "first",
        odds: 2.1,
        observedAt: "2026-10-18T11:47:00.000Z",
        recordedAt: "2026-10-18T11:48:00.000Z",
      }),
    );
    data.settings = { ...DEFAULT_SETTINGS };
    const dossier = decisionAnalysis(data, data.picks[0], { now });
    expect(dossier).toMatchObject({
      eligible: true,
      firstDelayMinutes: 2,
      currentDelayMinutes: 13,
      publicationDelayMinutes: 15,
      quoteAgeMinutes: 2,
    });
    expect(dossier.exposure).toMatchObject({
      eligible: false,
      suggestedStakeCents: null,
    });
    expect(dossier.expectation.expectedCents).toBeNull();
    expect(dossier.sourceRefs).toContain("quote:first");
  });

  it("does not use an ambiguous or different-line observation as the first comparable Winamax price", () => {
    const data = state();
    data.quotes.unshift(
      quote({
        id: "wrong-first",
        odds: 5,
        observedAt: "2026-10-18T11:47:00.000Z",
        recordedAt: "2026-10-18T11:48:00.000Z",
        identitySnapshot: { ...snapshot(), line: "-1.5" },
      }),
    );
    expect(decisionAnalysis(data, data.picks[0], { now }).firstQuote?.id).toBe(
      "q1",
    );
    expect(
      decisionAnalysis(data, data.picks[0], { now }).quoteHistory,
    ).toHaveLength(2);
  });

  it("requires an exact target for market probabilities and never broadcasts one estimate to all radar picks", () => {
    const data = state();
    const estimate: ProbabilityEstimate = {
      source: "market",
      probability: 0.5,
      recordedAt: "2026-10-18T11:59:00.000Z",
      basis: "Référence de marché",
      market: { ...market(), selection: "Lyon" },
      targetIdentity: identity(data.picks[0]),
    };
    expect(
      decisionAnalysis(data, data.picks[0], { now, estimate, stakeCents: 1000 })
        .expectation,
    ).toMatchObject({ status: "invalid", expectedCents: null });
    estimate.market.selection = "Paris";
    delete estimate.targetIdentity;
    expect(
      decisionAnalysis(data, data.picks[0], { now, estimate, stakeCents: 1000 })
        .expectation.status,
    ).toBe("invalid");
    estimate.targetIdentity = identity(data.picks[0]);
    expect(
      decisionAnalysis(data, data.picks[0], { now, estimate, stakeCents: 1000 })
        .expectation.status,
    ).toBe("known");
    data.picks.push(pick({ id: "p2", eventKey: "other", selection: "Lyon" }));
    expect(
      radarCandidates(data, {
        now,
        estimate: manual(0.55),
        stakeCents: 1000,
      }).every((row) => row.expectation.expectedCents == null),
    ).toBe(true);
    const rows = radarCandidates(data, { now, estimate, stakeCents: 1000 });
    expect(rows[0].expectation.expectedCents).toBe(0);
    expect(rows[1].expectation.expectedCents).toBeNull();
  });

  it("shares exposure with correlated open tickets and keeps identical source picks visible without extra confirmation weight", () => {
    const data = state();
    const open: Ticket = {
      id: "ticket-1",
      sourceId: "",
      pickId: null,
      bookmaker: "Winamax FR",
      event: "Paris–Lyon",
      eventKey: "event-1",
      selection: "Nul",
      market: "1X2",
      line: "",
      rules: "90 minutes",
      kind: "single",
      odds: 3,
      stakeCents: 1500,
      funding: "cash",
      placedAt: "2026-10-18T11:00:00.000Z",
      settledAt: null,
      result: "open",
      returnCents: 0,
      feeCents: 0,
      remainingStakeCents: null,
      partialCashout: false,
      strategyId: null,
      source: "Ticket manuel",
      notes: "",
      manuallyCorrected: false,
      revisions: [],
    };
    data.tickets = [open];
    data.ledger.push({
      id: "stake",
      kind: "ticket_stake",
      amountCents: -1500,
      at: open.placedAt,
      description: "Mise",
      ticketId: open.id,
      revision: 1,
    });
    data.picks.push(pick({ id: "other-source", tipsterId: "other-tipster" }));
    const dossier = decisionAnalysis(data, data.picks[0], {
      now,
      estimate: manual(0.55),
    });
    expect(dossier.exposure).toMatchObject({
      eventStakeCents: 1500,
      suggestedStakeCents: 500,
    });
    expect(dossier.expectation.expectedCents).toBe(50);
    expect(dossier.duplicates).toEqual([
      { pickId: "other-source", tipsterId: "other-tipster" },
    ]);
    open.selection = "Paris";
    expect(
      decisionAnalysis(data, data.picks[0], { now }).exposure,
    ).toMatchObject({ identicalOpenTickets: 1, eligible: false });
  });

  it("blocks event aliases that a confirmed provider maps to an already open event without rewriting either source key", () => {
    const data = state();
    const other = pick({
      id: "alias-pick",
      eventKey: "other-source-event-key",
      selection: "Nul",
    });
    data.picks.push(other);
    const provider: NonNullable<Quote["provider"]> = {
      id: "the-odds-api",
      bookmakerKey: "winamax_fr",
      sportKey: "soccer_france_ligue_one",
      eventId: "provider-event",
      marketKey: "h2h",
      outcomeName: "Paris",
      line: "",
      homeTeam: "Paris",
      awayTeam: "Lyon",
    };
    data.quotes[0] = quote({
      collectionMode: "provider",
      provider,
      providerLastUpdatedAt: "2026-10-18T11:58:00.000Z",
      providerTtlSeconds: 180,
    });
    data.quotes.push(
      quote({
        id: "alias-quote",
        pickId: other.id,
        collectionMode: "provider",
        provider: { ...provider, outcomeName: "Draw" },
        identitySnapshot: snapshot(other),
        providerLastUpdatedAt: "2026-10-18T11:58:00.000Z",
        providerTtlSeconds: 180,
      }),
    );
    const open: Ticket = {
      id: "alias-ticket",
      sourceId: "",
      pickId: other.id,
      bookmaker: "Winamax FR",
      event: other.event,
      eventKey: other.eventKey,
      selection: other.selection,
      market: other.market,
      line: other.line,
      rules: other.rules,
      kind: "single",
      odds: 3,
      stakeCents: 2000,
      funding: "cash",
      placedAt: "2026-10-18T11:00:00.000Z",
      settledAt: null,
      result: "open",
      returnCents: 0,
      feeCents: 0,
      remainingStakeCents: null,
      partialCashout: false,
      strategyId: null,
      source: "Ticket manuel",
      notes: "",
      manuallyCorrected: false,
      revisions: [],
    };
    data.tickets = [open];
    data.ledger.push({
      id: "alias-stake",
      kind: "ticket_stake",
      amountCents: -2000,
      at: open.placedAt,
      description: "Mise",
      ticketId: open.id,
      revision: 1,
    });
    const result = decisionAnalysis(data, data.picks[0], { now });
    expect(result).toMatchObject({ status: "En observation", eligible: false });
    expect(result.reason).toContain("Rapprochez les identifiants");
    expect(result.exposure.suggestedStakeCents).toBeNull();
    expect(data.picks[1].eventKey).toBe("other-source-event-key");
    expect(data.tickets[0].eventKey).toBe("other-source-event-key");
  });

  it("does not apply the binary cash expectation to a live/accumulator/cashout dossier or to stale odds", () => {
    const data = state();
    for (const change of [
      { kind: "accumulator" as const },
      { timing: "live" as const },
      { result: "cashout" as const },
    ]) {
      expect(
        decisionAnalysis(
          data,
          { ...data.picks[0], ...change },
          { now, estimate: manual(0.55), stakeCents: 1000 },
        ).expectation,
      ).toMatchObject({
        status: "unsupported",
        expectedCents: null,
        roi: null,
      });
    }
    data.settings.quoteMaxAgeMinutes = 1;
    expect(
      decisionAnalysis(data, data.picks[0], {
        now,
        estimate: manual(0.55),
        stakeCents: 1000,
      }).expectation,
    ).toMatchObject({ status: "unknown", expectedCents: null });
  });
});
