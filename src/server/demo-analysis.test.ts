import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../domain/types";
import type { AppState } from "../domain/types";
import { identity } from "../domain/calculations";
import { ANALYSIS_DEMO_VERSION, enrichAnalysisDemo } from "./demo-analysis";

function state(workspace: AppState["workspace"] = "demo"): AppState {
  return {
    workspace,
    tipsters: [],
    picks: [],
    quotes: [],
    tickets: [],
    ledger: [],
    strategies: [],
    simulations: [],
    imports: [],
    audit: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

describe("scénarios d’analyse de démonstration", () => {
  it("reste strictement isolé et ajoute la version une seule fois sans modifier les préférences", () => {
    const personal = state("personal");
    expect(() => enrichAnalysisDemo(personal)).toThrow("démonstration");
    expect(personal.picks).toHaveLength(0);

    const demo = state();
    demo.settings.paused = true;
    expect(enrichAnalysisDemo(demo)).toBe(true);
    const first = structuredClone(demo);
    expect(enrichAnalysisDemo(demo, new Date(Date.now() + 86400000))).toBe(
      false,
    );
    expect(demo).toEqual(first);
    expect(demo.settings.paused).toBe(true);
    expect(
      demo.audit.filter((entry) => entry.action === ANALYSIS_DEMO_VERSION),
    ).toHaveLength(1);
  });

  it("illustre les sept axes et conserve les profils perdants, inactifs et dépendant d’un gros combiné", () => {
    const demo = state();
    enrichAnalysisDemo(demo);
    expect(demo.tipsters).toHaveLength(4);
    expect(demo.picks).toHaveLength(156);
    expect(demo.tipsters.some((profile) => !profile.active)).toBe(true);
    expect(new Set(demo.picks.map((pick) => pick.sport)).size).toBe(3);
    expect(
      new Set(demo.picks.map((pick) => pick.competition)).size,
    ).toBeGreaterThan(3);
    expect(new Set(demo.picks.map((pick) => pick.market)).size).toBeGreaterThan(
      3,
    );
    expect(new Set(demo.picks.map((pick) => pick.odds)).size).toBeGreaterThan(
      4,
    );
    expect(new Set(demo.picks.map((pick) => pick.kind)).size).toBe(2);
    expect(new Set(demo.picks.map((pick) => pick.timing)).size).toBe(2);
    expect(
      new Set(
        demo.picks.map(
          (pick) =>
            (Date.parse(pick.startsAt) - Date.parse(pick.publishedAt)) / 60000,
        ),
      ).size,
    ).toBe(6);

    const accumulators = demo.picks.filter(
      (pick) => pick.kind === "accumulator",
    );
    expect(accumulators.filter((pick) => pick.result === "won")).toHaveLength(
      1,
    );
    expect(accumulators.find((pick) => pick.result === "won")!.odds).toBe(70);
    const losing = demo.picks.filter((pick) =>
      pick.tipsterId.endsWith("losing"),
    );
    expect(
      losing.filter((pick) => pick.result === "lost").length,
    ).toBeGreaterThan(losing.length / 2);
    expect(
      demo.picks
        .filter((pick) => pick.timing === "live")
        .every((pick) => pick.evidence === "declared"),
    ).toBe(true);
  });

  it("conserve découverte et observation prospective cohérentes sans promouvoir les simulations en tickets", () => {
    const demo = state();
    enrichAnalysisDemo(demo);
    for (const pick of demo.picks.filter(
      (item) => item.evidence === "observed",
    )) {
      const strategy = demo.strategies.find(
        (item) => item.filter.tipsterId === pick.tipsterId,
      )!;
      expect(strategy.discoveryEnd < strategy.frozenAt).toBe(true);
      expect(strategy.frozenAt < strategy.validationStart).toBe(true);
      expect(
        pick.observedAt <= strategy.discoveryEnd ||
          strategy.validationStart <= pick.observedAt,
      ).toBe(true);
      if (pick.observedAt <= strategy.discoveryEnd)
        expect(pick.settledAt! <= strategy.discoveryEnd).toBe(true);
      expect(
        pick.publishedAt <= pick.observedAt && pick.observedAt < pick.startsAt,
      ).toBe(true);
      expect(JSON.parse(pick.initialContent).result).toBe("open");
      expect(pick.revisions[0].at).toBe(pick.settledAt);
    }
    for (const strategy of demo.strategies) {
      const observations = demo.picks.filter(
        (pick) =>
          pick.tipsterId === strategy.filter.tipsterId &&
          pick.evidence === "observed",
      );
      expect(
        observations.some((pick) => pick.observedAt < strategy.discoveryEnd),
      ).toBe(true);
      expect(
        observations.some(
          (pick) => pick.observedAt >= strategy.validationStart,
        ),
      ).toBe(true);
      const declaredDiscovery = demo.picks.filter(
        (pick) =>
          pick.tipsterId === strategy.filter.tipsterId &&
          pick.evidence === "declared" &&
          pick.startsAt < strategy.discoveryEnd,
      );
      expect(
        declaredDiscovery.every(
          (pick) =>
            pick.settledAt! < pick.observedAt &&
            pick.observedAt < strategy.discoveryEnd,
        ),
      ).toBe(true);
    }
    expect(demo.simulations.length).toBeGreaterThan(0);
    const simulatedIds = new Set<string>();
    for (const simulation of demo.simulations) {
      for (const allocation of simulation.allocations) {
        simulatedIds.add(allocation.pickId);
        const pick = demo.picks.find((item) => item.id === allocation.pickId)!;
        const quote = demo.quotes.find((item) => item.pickId === pick.id)!;
        expect(
          simulation.createdAt < pick.startsAt &&
            simulation.createdAt < pick.settledAt!,
        ).toBe(true);
        expect(
          quote.observedAt >= pick.publishedAt &&
            quote.recordedAt <= simulation.createdAt,
        ).toBe(true);
        expect(quote.available && quote.matchConfirmed && !quote.closing).toBe(
          true,
        );
        expect(allocation.odds).toBe(quote.odds);
        expect(allocation.identity).toBe(identity(pick));
        expect(allocation.probability).toBeNull();
        expect("returnCents" in allocation).toBe(false);
      }
    }
    expect(demo.tickets).toHaveLength(4);
    expect(
      demo.tickets.every((ticket) => !simulatedIds.has(ticket.pickId!)),
    ).toBe(true);
    for (const ticket of demo.tickets) {
      const entries = demo.ledger.filter(
        (entry) => entry.ticketId === ticket.id,
      );
      expect(entries.reduce((sum, entry) => sum + entry.amountCents, 0)).toBe(
        ticket.returnCents - ticket.stakeCents,
      );
    }
  });

  it("refuse une collision de fixture sans écraser une donnée existante", () => {
    const demo = state();
    demo.audit.push({
      id: "demo-analysis-v2-installed",
      at: new Date().toISOString(),
      action: "user.note",
      entityId: "user",
      detail: "À conserver",
    });
    const before = structuredClone(demo);
    expect(() => enrichAnalysisDemo(demo)).toThrow("sans écrasement");
    expect(demo).toEqual(before);
  });
});
