import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../domain/types";
import {
  buildTicket,
  cents,
  date,
  integer,
  number,
  validateSettings,
  validateTicket,
} from "./validation";

const ticketData = (overrides: Record<string, unknown> = {}) => ({
  event: "Fixture A — B",
  market: "Vainqueur",
  selection: "A",
  source: "Justificatif fictif de test",
  odds: 2,
  stakeCents: 1000,
  placedAt: "2025-01-01T12:00:00.000Z",
  ...overrides,
});
const settledAt = "2025-01-01T15:00:00.000Z";

describe("montants exacts à la frontière de saisie", () => {
  it("convertit les euros français au centime et conserve la borne entière sûre", () => {
    expect(cents("1\u202f234,56 €", "Montant")).toBe(123456);
    expect(cents("0.29", "Montant")).toBe(29);
    expect(cents("1.2300", "Montant")).toBe(123);
    expect(cents("90071992547409.91", "Montant")).toBe(Number.MAX_SAFE_INTEGER);
    expect(
      integer("-9007199254740991", "Mouvement", -Number.MAX_SAFE_INTEGER),
    ).toBe(-Number.MAX_SAFE_INTEGER);
  });

  it("refuse toute fraction de centime avant une conversion Number susceptible de l’arrondir", () => {
    for (const value of ["1.005", "1.000000000000000000000001"]) {
      expect(() => cents(value, "Montant")).toThrow("deux décimales");
    }
    for (const value of ["1.0000000000000001", "9007199254740990.9"]) {
      expect(() => integer(value, "Montant")).toThrow("entier");
    }
    expect(() => cents("90071992547409.92", "Montant")).toThrow("sûrs");
    expect(() => cents("1e1000000", "Montant")).toThrow("sûrs");
  });

  it("refuse les structures et nombres non finis comme montants", () => {
    for (const value of [[], {}, true, "NaN", "Infinity"]) {
      expect(() => number(value, "Montant")).toThrow();
    }
  });

  it("ne contourne pas la validation exacte des centimes lors de la construction d’un ticket", () => {
    expect(() =>
      buildTicket(ticketData({ stakeCents: "1000.00000000000000001" })),
    ).toThrow("entier");
    expect(() =>
      buildTicket(ticketData({ feeCents: "0.000000000000000001" })),
    ).toThrow("entier");
    expect(buildTicket(ticketData({ stakeCents: "1001" })).stakeCents).toBe(
      1001,
    );
  });
});

describe("retours réels et transitions de règlement", () => {
  it("exige un retour explicite à la création réglée, même pour zéro, et lors d’un changement de résultat", () => {
    expect(() =>
      buildTicket(ticketData({ result: "lost", settledAt })),
    ).toThrow("explicitement");
    const won = buildTicket(
      ticketData({ result: "won", settledAt, returnCents: 2000 }),
    );
    expect(() => buildTicket({ result: "void" }, won)).toThrow("explicitement");
    expect(
      buildTicket({ result: "void", returnCents: 1000 }, won).returnCents,
    ).toBe(1000);
    expect(() => buildTicket({ result: "open", settledAt: null }, won)).toThrow(
      "explicitement",
    );
    expect(
      buildTicket({ result: "open", settledAt: null, returnCents: 0 }, won)
        .result,
    ).toBe("open");
  });

  it("sépare remboursement cash, restitution promotionnelle et frais", () => {
    expect(
      buildTicket(
        ticketData({
          result: "void",
          settledAt,
          returnCents: 1000,
          feeCents: 20,
        }),
      ),
    ).toMatchObject({ returnCents: 1000, feeCents: 20 });
    expect(() =>
      buildTicket(
        ticketData({
          result: "void",
          settledAt,
          returnCents: 980,
          feeCents: 20,
        }),
      ),
    ).toThrow("mise entière");
    expect(
      buildTicket(
        ticketData({
          funding: "freebet",
          result: "void",
          settledAt,
          returnCents: 0,
        }),
      ).returnCents,
    ).toBe(0);
    expect(() =>
      buildTicket(
        ticketData({
          funding: "freebet",
          result: "void",
          settledAt,
          returnCents: 1000,
        }),
      ),
    ).toThrow("retour cash");
  });

  it("conserve un retour documenté sans le remplacer par mise fois cote", () => {
    expect(
      buildTicket(
        ticketData({
          result: "won",
          settledAt,
          returnCents: 1888,
          notes: "Retour figurant au justificatif",
        }),
      ).returnCents,
    ).toBe(1888);
    expect(
      buildTicket(
        ticketData({ result: "half_lost", settledAt, returnCents: 501 }),
      ).returnCents,
    ).toBe(501);
    expect(() =>
      buildTicket(
        ticketData({ result: "half_lost", settledAt, returnCents: 1001 }),
      ),
    ).toThrow("dépasser");
    expect(() =>
      buildTicket(ticketData({ result: "lost", settledAt, returnCents: 1 })),
    ).toThrow("retour nul");
  });

  it("réserve le coût restant aux cashouts partiels et conserve l’inconnu explicitement", () => {
    expect(() => buildTicket(ticketData({ remainingStakeCents: 500 }))).toThrow(
      "cashout partiel",
    );
    expect(() => buildTicket(ticketData({ remainingStakeCents: 0 }))).toThrow(
      "mise initiale",
    );
    const partial = buildTicket(
      ticketData({
        result: "cashout",
        settledAt,
        returnCents: 400,
        partialCashout: true,
      }),
    );
    expect(partial.remainingStakeCents).toBeNull();
    expect(
      buildTicket({ remainingStakeCents: 500 }, partial).remainingStakeCents,
    ).toBe(500);
    expect(() => buildTicket({ remainingStakeCents: 0 }, partial)).toThrow(
      "positive ou inconnue",
    );
    expect(() => buildTicket({ partialCashout: false }, partial)).toThrow(
      "explicitement",
    );
    expect(
      buildTicket(
        { partialCashout: false, remainingStakeCents: 0, returnCents: 900 },
        partial,
      ),
    ).toMatchObject({
      partialCashout: false,
      remainingStakeCents: 0,
      returnCents: 900,
    });
  });

  it("réconcilie les encaissements datés au retour cumulé sans accepter leur injection par la saisie", () => {
    const returnPayments = [
      {
        id: "payment-1",
        at: "2025-01-01T13:00:00.000Z",
        amountCents: 400,
        remainingStakeCents: 600,
      },
      {
        id: "payment-2",
        at: settledAt,
        amountCents: 501,
        remainingStakeCents: 0,
      },
    ];
    const settled = buildTicket(
      ticketData({
        result: "cashout",
        settledAt,
        returnCents: 901,
        returnPayments,
      }),
    );
    expect(settled.returnPayments).toBeUndefined();
    expect(
      validateTicket({ ...settled, returnPayments }).returnPayments,
    ).toEqual(returnPayments);
    expect(() =>
      validateTicket({
        ...settled,
        returnPayments: returnPayments.slice(0, 1),
      }),
    ).toThrow("total");
    expect(() =>
      validateTicket({
        ...settled,
        returnPayments: returnPayments.map((payment) => ({
          ...payment,
          id: "same",
        })),
      }),
    ).toThrow("répété");
    expect(() =>
      validateTicket({
        ...settled,
        returnPayments: returnPayments.map((payment) => ({
          ...payment,
          remainingStakeCents: 1001,
        })),
      }),
    ).toThrow("dépasse");
    expect(() =>
      validateTicket({ ...settled, funding: "freebet", returnPayments }),
    ).toThrow("coût cash");
    const historical = returnPayments.map((payment) => ({
      ...payment,
      historicalAggregate: true,
    }));
    expect(
      validateTicket({
        ...settled,
        returnPayments: historical,
      }).returnPayments?.every((payment) => payment.historicalAggregate),
    ).toBe(true);
  });

  it("refuse les encaissements hors période et tout encaissement d’un ticket encore ouvert", () => {
    const settled = buildTicket(
      ticketData({ result: "cashout", settledAt, returnCents: 400 }),
    );
    for (const at of ["2024-12-31T12:00:00Z", "2025-01-01T16:00:00Z"]) {
      expect(() =>
        validateTicket({
          ...settled,
          returnPayments: [{ id: "payment", at, amountCents: 400 }],
        }),
      ).toThrow("date d’encaissement");
    }
    expect(() =>
      validateTicket({
        ...buildTicket(ticketData()),
        returnPayments: [{ id: "payment", at: settledAt, amountCents: 0 }],
      }),
    ).toThrow("aucun encaissement");
  });
});

describe("rapprochement daté", () => {
  it("exige le solde et sa date ensemble et refuse les dates futures", () => {
    expect(() =>
      validateSettings({
        ...DEFAULT_SETTINGS,
        reconciliationBalanceCents: 1000,
      }),
    ).toThrow("à la fois");
    expect(() =>
      validateSettings({ ...DEFAULT_SETTINGS, reconciledAt: settledAt }),
    ).toThrow("à la fois");
    expect(() =>
      validateSettings({
        ...DEFAULT_SETTINGS,
        reconciliationBalanceCents: 1000,
        reconciledAt: new Date(Date.now() + 60000).toISOString(),
      }),
    ).toThrow("future");
    expect(
      validateSettings({
        ...DEFAULT_SETTINGS,
        reconciliationBalanceCents: 0,
        reconciledAt: settledAt,
      }).reconciliationBalanceCents,
    ).toBe(0);
    expect(validateSettings({ ...DEFAULT_SETTINGS }).reconciledAt).toBeNull();
  });
});

describe("horodatages comptables sans normalisation silencieuse", () => {
  it("refuse les jours inexistants même avec un décalage ISO explicite", () => {
    for (const value of [
      "2026-02-30T12:00:00Z",
      "2026-02-30T12:00:00+02:00",
      "2025-02-29T12:00:00Z",
      "2026-04-31T12:00:00Z",
      "2026-01-01T24:00:00Z",
    ]) {
      expect(() => date(value, "Date", false)).toThrow("invalide");
    }
    expect(date("2024-02-29T12:00:00+01:00", "Date", false)).toBe(
      "2024-02-29T11:00:00.000Z",
    );
  });

  it("refuse l’heure locale inexistante ou ambiguë et accepte les deux offsets explicites", () => {
    expect(() => date("29/03/2026 02:30", "Date", false)).toThrow(
      "inexistante",
    );
    expect(() => date("25/10/2026 02:30", "Date", false)).toThrow("ambiguë");
    expect(() => date("2026-10-25T02:30:00", "Date", false)).toThrow(
      "décalage explicite",
    );
    expect(date("2026-10-25T02:30:00+02:00", "Date", false)).toBe(
      "2026-10-25T00:30:00.000Z",
    );
    expect(date("2026-10-25T02:30:00+01:00", "Date", false)).toBe(
      "2026-10-25T01:30:00.000Z",
    );
    expect(date("25/10/2026 03:30", "Date", false)).toBe(
      "2026-10-25T02:30:00.000Z",
    );
  });

  it("refuse de tronquer des fractions inférieures à la milliseconde", () => {
    expect(() => date("2026-01-01T12:00:00.1234Z", "Date", false)).toThrow(
      "milliseconde",
    );
    expect(date("2026-01-01T12:00:00.123000Z", "Date", false)).toBe(
      "2026-01-01T12:00:00.123Z",
    );
  });
});
