import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../domain/types";
import type { AppState, Pick, Quote } from "../domain/types";
import {
  candidatesForPick,
  createOddsApiClient,
  OddsApiError,
} from "./the-odds-api";
import { prepareOddsSync } from "./odds-sync";
import { readOddsConnectorStatus } from "./registry";

const NOW = Date.parse("2026-10-18T12:00:00.000Z");
const SPORT = "soccer_france_ligue_one";
const CATALOG = [
  { key: SPORT, title: "Ligue 1 - France", group: "Soccer", active: true },
];
function pick(overrides: Partial<Pick> = {}): Pick {
  return {
    id: "pick",
    tipsterId: "tipster",
    sourceId: "",
    sourceUrl: "",
    publishedAt: "2026-10-18T11:58:00.000Z",
    observedAt: "2026-10-18T11:59:00.000Z",
    startsAt: "2026-10-18T15:00:00.000Z",
    event: "Paris — Lyon",
    eventKey: "event",
    sport: "Football",
    competition: "Ligue 1",
    market: "Vainqueur",
    selection: "Paris",
    line: "",
    rules: "Temps réglementaire",
    odds: 2,
    minOdds: null,
    stakeUnits: 1,
    result: "open",
    settlementSource: "",
    settledAt: null,
    kind: "single",
    timing: "prematch",
    evidence: "observed",
    initialContent: "",
    argument: "",
    notes: "",
    revisions: [],
    manuallyCorrected: false,
    ...overrides,
  };
}
function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "provider-event",
    sport_key: SPORT,
    sport_title: "Ligue 1",
    commence_time: "2026-10-18T15:00:00Z",
    home_team: "Paris",
    away_team: "Lyon",
    bookmakers: [
      {
        key: "winamax_fr",
        title: "Winamax (FR)",
        last_update: "2026-10-18T11:59:59Z",
        markets: [
          {
            key: "h2h",
            last_update: "2026-10-18T11:55:00Z",
            outcomes: [
              { name: "Paris", price: 2.1 },
              { name: "Lyon", price: 3.5 },
              { name: "Draw", price: 3.1 },
            ],
          },
          {
            key: "totals",
            last_update: "2026-10-18T11:56:00Z",
            outcomes: [
              { name: "Over", price: 1.9, point: 2.5 },
              { name: "Under", price: 1.95, point: 2.5 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}
function response(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
function fixtureState(workspace: AppState["workspace"] = "personal"): AppState {
  return {
    workspace,
    picks: [pick()],
    quotes: [],
    tipsters: [],
    tickets: [],
    ledger: [],
    strategies: [],
    simulations: [],
    imports: [],
    audit: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
function transportFor(body: unknown[] = [event()]) {
  return vi.fn<typeof fetch>(async (url) =>
    String(url).includes("/odds/")
      ? response(body, 200, {
          "x-requests-remaining": "97",
          "x-requests-used": "3",
          "x-requests-last": "3",
        })
      : response(CATALOG),
  );
}

describe("The Odds API v4 : transport injecté sans réseau", () => {
  it("cible exclusivement winamax_fr et conserve les dates marché/collecte et quotas", async () => {
    const transport = transportFor();
    const client = createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transport,
      now: () => NOW,
    });
    const result = await client.getOdds(SPORT);
    const url = new URL(String(transport.mock.calls[0][0]));
    expect(url.origin).toBe("https://api.the-odds-api.com");
    expect(url.searchParams.get("bookmakers")).toBe("winamax_fr");
    expect(url.searchParams.get("regions")).toBe("fr");
    expect(url.searchParams.get("markets")).toBe("h2h,spreads,totals");
    expect(result.collectedAt).toBe(new Date(NOW).toISOString());
    expect(result.data[0].bookmakers[0].markets[0].last_update).toBe(
      "2026-10-18T11:55:00.000Z",
    );
    expect(result.quota).toEqual({ remaining: 97, used: 3, last: 3 });
  });

  it("ne remplace pas une date de prix manquante par bookmaker.last_update ou maintenant", async () => {
    const raw = event();
    delete (raw.bookmakers[0].markets[0] as { last_update?: string })
      .last_update;
    const transport = transportFor([raw]);
    const result = await createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transport,
      now: () => NOW,
    }).getOdds(SPORT);
    expect(
      result.data[0].bookmakers[0].markets.some(
        (market) => market.key === "h2h",
      ),
    ).toBe(false);
    expect(
      candidatesForPick(pick(), result).filter(
        (candidate) => candidate.marketKey === "h2h",
      ),
    ).toHaveLength(0);
  });

  it("ignore les autres bookmakers et les points manquants des totaux", async () => {
    const raw = event();
    const foreign = structuredClone(raw.bookmakers[0]);
    foreign.key = "other_bookmaker";
    raw.bookmakers.push(foreign);
    delete (raw.bookmakers[0].markets[1].outcomes[0] as { point?: number })
      .point;
    const result = await createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transportFor([raw]),
      now: () => NOW,
    }).getOdds(SPORT);
    expect(result.data[0].bookmakers).toHaveLength(1);
    expect(result.data[0].bookmakers[0].markets[1].outcomes).toHaveLength(1);
  });

  it("réutilise le cache sans rajeunir ni observation ni horodatage source", async () => {
    let clock = NOW;
    const transport = transportFor();
    const client = createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transport,
      now: () => clock,
      cacheTtlMs: 60000,
    });
    const first = await client.getOdds(SPORT);
    clock += 30000;
    const cached = await client.getOdds(SPORT);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(cached.cached).toBe(true);
    expect(cached.collectedAt).toBe(first.collectedAt);
    expect(cached.data).toEqual(first.data);
    clock += 30001;
    await client.getOdds(SPORT);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("respecte Retry-After long et ne reprend pas avant cette date", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      response({}, 429, { "Retry-After": "30", "x-requests-remaining": "10" }),
    );
    const sleep = vi.fn(async () => {});
    const client = createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transport,
      now: () => NOW,
      sleep,
    });
    await expect(client.getOdds(SPORT)).rejects.toMatchObject({
      status: "rate_limited",
      retryAt: "2026-10-18T12:00:30.000Z",
    });
    await expect(client.getOdds(SPORT)).rejects.toBeInstanceOf(OddsApiError);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("borne les reprises 429 et conserve les quotas absents comme inconnus", async () => {
    let clock = NOW;
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () =>
        response({}, 429, { "Retry-After": "1" }),
      )
      .mockImplementationOnce(async () => response([event()]));
    const sleep = vi.fn(async (milliseconds: number) => {
      clock += milliseconds;
    });
    const client = createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transport,
      now: () => clock,
      sleep,
    });
    const result = await client.getOdds(SPORT);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(result.quota).toEqual({ remaining: null, used: null, last: null });
  });

  it("bloque les appels payants quand le fournisseur annonce un quota nul", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      response(CATALOG, 200, { "x-requests-remaining": "0" }),
    );
    const client = createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transport,
      now: () => NOW,
    });
    await client.listSports();
    await expect(client.getOdds(SPORT)).rejects.toMatchObject({
      status: "rate_limited",
      retryAt: null,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("borne timeout et reprises sans exposer la clé ou une URL d’erreur", async () => {
    const transport = vi.fn<typeof fetch>(async () => {
      throw new Error(
        "failed https://api.the-odds-api.com/?apiKey=fixture-only",
      );
    });
    const client = createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transport,
      maxRetries: 1,
      sleep: async () => {},
    });
    try {
      await client.getOdds(SPORT);
    } catch (error) {
      expect((error as Error).message).not.toContain("fixture-only");
      expect((error as Error).message).not.toContain("apiKey");
    }
    expect(transport).toHaveBeenCalledTimes(2);
    const neverResponds = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const timeoutClient = createOddsApiClient({
      apiKey: "fixture-only",
      fetch: neverResponds,
      timeoutMs: 5,
      maxRetries: 0,
    });
    await expect(timeoutClient.getOdds(SPORT)).rejects.toThrow("Délai");
  });
});

describe("correspondance et synchronisation sans promotion des preuves", () => {
  it("exige une confirmation humaine même pour une identité textuellement exacte", async () => {
    const state = fixtureState();
    const client = createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transportFor(),
      now: () => NOW,
    });
    const preview = await prepareOddsSync(
      state,
      { pickId: "pick", sportKey: SPORT },
      { client, now: () => NOW },
    );
    expect(preview.result.status).toBe("needs_mapping");
    expect(preview.quote).toBeNull();
    const candidate = preview.result.candidates.find(
      (item) => item.exact.event && item.exact.selection && item.exact.market,
    )!;
    const unconfirmed = await prepareOddsSync(
      state,
      { pickId: "pick", sportKey: SPORT, candidateId: candidate.id },
      { client, now: () => NOW },
    );
    expect(unconfirmed.quote).toBeNull();
    const confirmed = await prepareOddsSync(
      state,
      {
        pickId: "pick",
        sportKey: SPORT,
        candidateId: candidate.id,
        confirmMatch: true,
      },
      { client, now: () => NOW },
    );
    expect(confirmed.quote?.odds).toBe(2.1);
    expect(confirmed.quote?.observedAt).toBe("2026-10-18T12:00:00.000Z");
    expect(confirmed.quote?.providerLastUpdatedAt).toBe(
      "2026-10-18T11:55:00.000Z",
    );
    expect(
      confirmed.quote?.providerLastUpdatedAt! < state.picks[0].publishedAt,
    ).toBe(true);
    expect(state.tickets).toHaveLength(0);
    expect(state.ledger).toHaveLength(0);
  });

  it("bloque les horaires, lignes et sélections numériquement contradictoires", async () => {
    const response = await createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transportFor(),
      now: () => NOW,
    }).getOdds(SPORT);
    const wrongTime = candidatesForPick(
      pick({ startsAt: "2026-10-18T16:00:00Z" }),
      response,
    );
    expect(wrongTime.every((candidate) => !candidate.canConfirm)).toBe(true);
    const badTotal = candidatesForPick(
      pick({ market: "Total buts", selection: "Plus de 3,5", line: "2.5" }),
      response,
    ).find(
      (candidate) =>
        candidate.marketKey === "totals" && candidate.outcomeName === "Over",
    )!;
    expect(badTotal.exact.selection).toBe(false);
    expect(badTotal.canConfirm).toBe(false);
    const correctTotal = candidatesForPick(
      pick({ market: "Total buts", selection: "Plus de 2,5", line: "2.5" }),
      response,
    ).find(
      (candidate) =>
        candidate.marketKey === "totals" && candidate.outcomeName === "Over",
    )!;
    expect(correctTotal.exact.selection).toBe(true);
    expect(correctTotal.canConfirm).toBe(true);
  });

  it("ne donne jamais une fraîcheur exploitable à des prix vieux ou futurs", async () => {
    for (const updatedAt of ["2026-10-18T11:00:00Z", "2026-10-18T12:01:00Z"]) {
      const raw = event();
      raw.bookmakers[0].markets[0].last_update = updatedAt;
      const response = await createOddsApiClient({
        apiKey: "fixture-only",
        fetch: transportFor([raw]),
        now: () => NOW,
      }).getOdds(SPORT);
      expect(
        candidatesForPick(pick(), response)
          .filter((candidate) => candidate.marketKey === "h2h")
          .every((candidate) => !candidate.canConfirm),
      ).toBe(true);
    }
  });

  it("garde l’événement exact dans une réponse dépassant 200 propositions", async () => {
    const crowded = Array.from({ length: 100 }, (_, index) =>
      event({ id: `other-${index}`, home_team: `Autre ${index}` }),
    );
    crowded.push(event());
    const response = await createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transportFor(crowded),
      now: () => NOW,
    }).getOdds(SPORT);
    const candidates = candidatesForPick(pick(), response);
    expect(candidates).toHaveLength(200);
    expect(candidates[0].eventId).toBe("provider-event");
    expect(candidates[0].exact.selection).toBe(true);
    expect(candidates[0].warnings.join()).toContain("tronquées");
  });

  it("n’appelle aucun réseau en démonstration ou sans configuration", async () => {
    const transport = transportFor();
    const client = createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transport,
      now: () => NOW,
    });
    const demo = await prepareOddsSync(
      fixtureState("demo"),
      { pickId: "pick" },
      { client, now: () => NOW },
    );
    expect(demo.result.status).toBe("demo");
    const missing = await prepareOddsSync(
      fixtureState(),
      { pickId: "pick" },
      { client: null, now: () => NOW },
    );
    expect(missing.result.status).toBe("unconfigured");
    expect(transport).not.toHaveBeenCalled();
    expect(demo.quote).toBeNull();
  });

  it("signale l’absence d’un marché précédemment confirmé sans inventer un prix ou sa date", async () => {
    const state = fixtureState();
    const initialClient = createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transportFor(),
      now: () => NOW,
    });
    const preview = await prepareOddsSync(
      state,
      { pickId: "pick", sportKey: SPORT },
      { client: initialClient, now: () => NOW },
    );
    const accepted = await prepareOddsSync(
      state,
      {
        pickId: "pick",
        sportKey: SPORT,
        candidateId: preview.result.candidates[0].id,
        confirmMatch: true,
      },
      { client: initialClient, now: () => NOW },
    );
    state.quotes.push({ ...accepted.quote!, id: "previous" } as Quote);
    const missingClient = createOddsApiClient({
      apiKey: "fixture-only",
      fetch: transportFor([]),
      now: () => NOW + 60000,
    });
    const missing = await prepareOddsSync(
      state,
      { pickId: "pick" },
      { client: missingClient, now: () => NOW + 60000 },
    );
    expect(missing.result.status).toBe("unavailable");
    expect(missing.quote?.available).toBe(false);
    expect(missing.quote?.odds).toBeNull();
    expect(missing.quote?.providerLastUpdatedAt).toBeNull();
  });

  it("expose uniquement présence de configuration et audit expurgé au statut", () => {
    const state = fixtureState();
    state.audit.push({
      id: "attempt",
      at: new Date(NOW).toISOString(),
      action: "odds.sync",
      entityId: "pick",
      detail: JSON.stringify({
        status: "rate_limited",
        message: "Attendre",
        quota: { remaining: 0, used: 500, last: 3 },
        retryAt: null,
      }),
    });
    const status = readOddsConnectorStatus(state, { apiKeyConfigured: true });
    expect(status).toMatchObject({
      configured: true,
      enabled: true,
      status: "rate_limited",
      quota: { remaining: 0, used: 500, last: 3 },
    });
    expect(JSON.stringify(status)).not.toContain("apiKey");
  });
});
