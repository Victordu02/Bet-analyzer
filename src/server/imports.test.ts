import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  type AppState,
  type ImportBatch,
} from "../domain/types";
import {
  completedImportRows,
  importHash,
  importInput,
  previewImport,
  type ImportInput,
} from "./imports";
import { buildTicket } from "./validation";

function state(): AppState {
  return {
    workspace: "personal",
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
const csv =
  "source_id;event;selection;market;odds;stake;placed_at\na;Fixture A;A;Vainqueur;2;10;2025-01-01T12:00:00Z\nb;Fixture B;B;Vainqueur;2;20;2025-01-01T12:00:00Z";
const input = (overrides: Partial<ImportInput> = {}): ImportInput => ({
  kind: "tickets",
  csv,
  fileName: "fixture.csv",
  mapping: {},
  allowPartial: true,
  allowProbableDuplicates: false,
  rightsConfirmed: true,
  ...overrides,
});
const batch = (
  source: ImportInput,
  overrides: Partial<ImportBatch> = {},
): ImportBatch => ({
  id: "batch-1",
  kind: source.kind,
  fileName: source.fileName,
  hash: importHash(source),
  at: "2025-01-02T12:00:00.000Z",
  created: 1,
  updated: 0,
  skipped: 0,
  errors: [{ row: 3, message: "Solde insuffisant" }],
  ...overrides,
});

describe("interprétation exacte des imports", () => {
  it("distingue une nouvelle correspondance tout en préservant les empreintes historiques par défaut", () => {
    const source = input();
    const legacy = createHash("sha256")
      .update("tickets\0" + csv)
      .digest("hex");
    expect(importHash(source)).toBe(legacy);
    expect(
      importHash(input({ mapping: { stake: "stake", event: "event" } })),
    ).toBe(legacy);
    expect(importHash(input({ fileName: "renommé.csv" }))).toBe(legacy);
    expect(
      importHash(input({ mapping: { stake: "Montant", event: "Match" } })),
    ).toBe(
      importHash(input({ mapping: { event: "Match", stake: "Montant" } })),
    );
    expect(importHash(input({ mapping: { stake: "Montant" } }))).not.toBe(
      legacy,
    );
    expect(importHash(input({ mapping: { stake: "" } }))).not.toBe(legacy);
  });

  it("refuse un nom de champ de correspondance inconnu", () => {
    expect(() => importInput(input({ mapping: { staek: "stake" } }))).toThrow(
      "inconnu",
    );
  });

  it("refuse une mise fournie simultanément en euros et en centimes", () => {
    const source = input({
      csv: csv
        .replace("stake;", "stake;stake_cents;")
        .replace(";10;", ";10;1000;")
        .replace(";20;", ";20;2000;"),
    });
    const preview = previewImport(state(), source);
    expect(
      preview.rows.every((row) =>
        row.errors.some((error) => error.includes("jamais les deux")),
      ),
    ).toBe(true);
    expect(preview.rows.every((row) => row.data === null)).toBe(true);
  });

  it("refuse les décimales supplémentaires au lieu de les arrondir dans une ligne CSV", () => {
    const source = input({ csv: csv.replace(";10;", ";10.0000000000000001;") });
    const preview = previewImport(state(), source);
    expect(preview.rows[0].errors.join()).toContain("deux décimales");
    expect(preview.rows[1].data?.stakeCents).toBe(2000);
  });

  it("exige le retour déclaré pour une ligne déjà réglée", () => {
    const source = input({
      csv: "event;selection;market;odds;stake;placed_at;result;settled_at\nFixture A;A;Vainqueur;2;10;2025-01-01T12:00:00Z;lost;2025-01-01T15:00:00Z",
    });
    expect(previewImport(state(), source).rows[0].errors.join()).toContain(
      "explicitement",
    );
  });

  it("préserve une correction manuelle sans revalider les valeurs du fichier qui seront ignorées", () => {
    const current = state();
    const ticket = buildTicket({
      sourceId: "a",
      event: "Fixture A",
      market: "Vainqueur",
      selection: "A",
      odds: 2,
      stakeCents: 1000,
      placedAt: "2025-01-01T12:00:00Z",
      source: "Justificatif fictif",
    });
    current.tickets.push({ ...ticket, manuallyCorrected: true });
    const preview = previewImport(
      current,
      input({ csv: csv.replace(";2;10;", ";0;10.001;") }),
    );
    expect(preview.rows[0].errors).toEqual([]);
    expect(preview.rows[0].warnings.join()).toContain(
      "Correction manuelle conservée",
    );
    expect(preview.rows[0].data?.stakeCents).toBe(1000);
  });

  it("transmet les instructions explicites de correction au service sans les stocker dans le ticket", () => {
    const source = input({
      csv: "event;selection;market;odds;stake;placed_at;result;settled_at;return;settlement_mode;correction_payment_id;correction_payment_at\nFixture A;A;Vainqueur;2;10;2025-01-01T12:00:00Z;cashout;2025-01-01T15:00:00Z;5;correction;payment-1;2025-01-01T14:00:00Z",
    });
    const preview = previewImport(state(), importInput(source));
    expect(preview.rows[0].errors).toEqual([]);
    expect(preview.rows[0].data).toMatchObject({
      settlementMode: "correction",
      correctionPaymentId: "payment-1",
      correctionPaymentAt: "2025-01-01T14:00:00Z",
    });
    expect(buildTicket(preview.rows[0].data!)).not.toHaveProperty(
      "settlementMode",
    );
  });
});

describe("reprise des lignes précédemment rejetées", () => {
  it("ignore les lignes réussies d’un ancien lot et garde ses erreurs réessayables", () => {
    const current = state();
    current.imports.push(batch(input()));
    const preview = previewImport(current, input());
    expect([...completedImportRows(current, input())]).toEqual([2]);
    expect(preview.rows[0]).toMatchObject({
      skipped: true,
      errors: [],
      data: null,
    });
    expect(preview.rows[0].warnings.join()).toContain(
      "aucune nouvelle écriture",
    );
    expect(preview.rows[1].skipped).toBeUndefined();
    expect(preview.rows[1].data?.sourceId).toBe("b");
  });

  it("combine les réussites de plusieurs tentatives sans transformer une liste vide en réussite", () => {
    const current = state();
    current.imports.push(batch(input(), { completedRows: [] }));
    expect(completedImportRows(current, input()).size).toBe(0);
    current.imports.push(
      batch(input(), {
        id: "batch-2",
        completedRows: [2],
        errors: [{ row: 3, message: "Toujours insuffisant" }],
      }),
    );
    current.imports.push(
      batch(input(), {
        id: "batch-3",
        completedRows: [3],
        errors: [],
        retryOf: "batch-2",
      }),
    );
    expect([...completedImportRows(current, input())]).toEqual([2, 3]);
    expect(
      previewImport(current, input()).rows.every((row) => row.skipped),
    ).toBe(true);
  });

  it("ne réessaie pas les anciens succès après une modification de l’état courant", () => {
    const source = input({
      csv: csv
        .replace("odds;stake;", "odds;stake;pick_id;")
        .replace(";10;", ";10;pick-deleted;")
        .replace(";20;", ";20;;"),
    });
    const current = state();
    current.imports.push(batch(source, { completedRows: [2] }));
    const preview = previewImport(current, source);
    expect(preview.rows[0]).toMatchObject({ skipped: true, errors: [] });
    expect(preview.rows[1].errors).toEqual([]);
  });

  it("ne laisse pas une reprise contourner un identifiant source répété dans le fichier", () => {
    const source = input({ csv: csv.replace("\nb;", "\na;") });
    const current = state();
    current.imports.push(batch(source, { completedRows: [2] }));
    const preview = previewImport(current, source);
    expect(preview.rows[0].skipped).toBe(true);
    expect(preview.rows[1].errors.join()).toContain(
      "Identifiant source répété",
    );
  });
});
