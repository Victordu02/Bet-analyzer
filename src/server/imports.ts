import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import type { AppState } from "../domain/types";
import {
  buildPick,
  buildTicket,
  cents,
  integer,
  object,
  text,
  boolean,
} from "./validation";

export interface ImportInput {
  kind: "picks" | "tickets";
  csv: string;
  fileName: string;
  mapping: Record<string, string>;
  allowPartial: boolean;
  allowProbableDuplicates: boolean;
  rightsConfirmed: boolean;
}
export interface PreviewRow {
  row: number;
  data: Record<string, unknown> | null;
  errors: string[];
  warnings: string[];
  skipped?: boolean;
}
export interface ImportPreview {
  headers: string[];
  rows: PreviewRow[];
  total: number;
}
export function importInput(payload: unknown): ImportInput {
  const p = object(payload);
  if (p.kind !== "picks" && p.kind !== "tickets")
    throw new Error("Type d’import inconnu.");
  text(p.csv, "CSV", true, 5000000);
  if (typeof p.csv !== "string")
    throw new Error("Contenu CSV textuel attendu.");
  const csv = p.csv;
  const mapping = p.mapping == null ? {} : object(p.mapping);
  if (Object.values(mapping).some((v) => typeof v !== "string"))
    throw new Error("Correspondance des colonnes invalide.");
  const allowedColumns = new Set(
    Object.keys(p.kind === "picks" ? pickColumns : ticketColumns),
  );
  if (p.kind === "tickets")
    for (const column of ["stake", "return", "fee", "remaining_stake"]) {
      allowedColumns.add(column);
      allowedColumns.add(`${column}_cents`);
    }
  for (const canonical of Object.keys(mapping))
    if (!allowedColumns.has(canonical))
      throw new Error(`Champ de correspondance inconnu : ${canonical}.`);
  return {
    kind: p.kind,
    csv,
    fileName: text(p.fileName, "Nom de fichier", true, 255),
    mapping: mapping as Record<string, string>,
    allowPartial: boolean(p.allowPartial),
    allowProbableDuplicates: boolean(p.allowProbableDuplicates),
    rightsConfirmed: boolean(p.rightsConfirmed),
  };
}
export function importHash(input: ImportInput): string {
  const mapping = Object.entries(input.mapping)
    .filter(([canonical, column]) => canonical !== column)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const hash = createHash("sha256").update(input.kind + "\0" + input.csv);
  // Preserve existing default-mapping hashes, while distinguishing a corrected
  // column mapping from a retry of the same interpretation of the file.
  if (mapping.length) hash.update("\0mapping:" + JSON.stringify(mapping));
  return hash.digest("hex");
}
const pickColumns: Record<string, string> = {
  source_id: "sourceId",
  tipster: "tipsterId",
  event: "event",
  event_key: "eventKey",
  sport: "sport",
  competition: "competition",
  market: "market",
  selection: "selection",
  line: "line",
  rules: "rules",
  odds: "odds",
  min_odds: "minOdds",
  stake_units: "stakeUnits",
  published_at: "publishedAt",
  starts_at: "startsAt",
  result: "result",
  settled_at: "settledAt",
  settlement_source: "settlementSource",
  source_url: "sourceUrl",
  argument: "argument",
  notes: "notes",
  kind: "kind",
  timing: "timing",
};
const ticketColumns: Record<string, string> = {
  source_id: "sourceId",
  pick_id: "pickId",
  event: "event",
  event_key: "eventKey",
  market: "market",
  selection: "selection",
  line: "line",
  rules: "rules",
  kind: "kind",
  bookmaker: "bookmaker",
  odds: "odds",
  funding: "funding",
  placed_at: "placedAt",
  result: "result",
  settled_at: "settledAt",
  partial_cashout: "partialCashout",
  source: "source",
  notes: "notes",
  settlement_mode: "settlementMode",
  correction_payment_id: "correctionPaymentId",
  correction_payment_at: "correctionPaymentAt",
};
function comparable(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function parseCsv(input: ImportInput): {
  headers: string[];
  records: string[][];
} {
  let records: string[][];
  const first = input.csv.split(/\r?\n/, 1)[0];
  // Quoted separators are handled by the CSV parser; choose the most likely outer delimiter.
  const unquoted = first.replace(/"(?:[^"]|"")*"/g, "");
  const delimiter = [";", ",", "\t"].sort(
    (a, b) => unquoted.split(b).length - unquoted.split(a).length,
  )[0];
  try {
    records = parse(input.csv, {
      bom: true,
      skip_empty_lines: true,
      delimiter,
      relax_column_count: false,
      trim: true,
      max_record_size: 200000,
    });
  } catch (error) {
    throw new Error(`CSV invalide : ${(error as Error).message}`);
  }
  const headers = records.shift() ?? [];
  if (!headers.length || new Set(headers).size !== headers.length)
    throw new Error("En-têtes CSV manquants ou dupliqués.");
  if (records.length > 10000)
    throw new Error("Import limité à 10 000 lignes par fichier.");
  return { headers, records };
}

export function completedImportRows(
  state: AppState,
  input: ImportInput,
  totalRows?: number,
): Set<number> {
  const hash = importHash(input);
  const previous = state.imports.filter(
    (batch) => batch.kind === input.kind && batch.hash === hash,
  );
  const completed = new Set<number>();
  if (!previous.length) return completed;
  const count = totalRows ?? parseCsv(input).records.length;
  for (const batch of previous) {
    if (batch.completedRows !== undefined) {
      for (const row of batch.completedRows)
        if (Number.isInteger(row) && row >= 2 && row < count + 2)
          completed.add(row);
    } else {
      // Earlier batches did not store per-row successes; every non-error row
      // was applied or deliberately preserved as a manual correction.
      const failed = new Set(batch.errors.map((error) => error.row));
      for (let row = 2; row < count + 2; row++)
        if (!failed.has(row)) completed.add(row);
    }
  }
  return completed;
}

export function previewImport(
  state: AppState,
  input: ImportInput,
): ImportPreview {
  const { headers, records } = parseCsv(input);
  for (const [canonical, column] of Object.entries(input.mapping))
    if (column && !headers.includes(column))
      throw new Error(`Colonne ${column} introuvable pour ${canonical}.`);
  const seen = new Set<string>();
  const seenSources = new Set<string>();
  const completed = completedImportRows(state, input, records.length);
  const rows: PreviewRow[] = records.map((values, index) => {
    const row: PreviewRow = {
      row: index + 2,
      data: null,
      errors: [],
      warnings: [],
    };
    const source = Object.fromEntries(
      headers.map((h, i) => [h, values[i] ?? ""]),
    );
    const get = (name: string) =>
      source[
        Object.prototype.hasOwnProperty.call(input.mapping, name)
          ? input.mapping[name]
          : name
      ];
    try {
      const data: Record<string, unknown> = {};
      for (const [column, key] of Object.entries(
        input.kind === "picks" ? pickColumns : ticketColumns,
      )) {
        const value = get(column);
        if (value !== undefined && value !== "") data[key] = value;
      }
      if (data.sourceId) {
        const tipster = state.tipsters.find(
          (item) =>
            item.id === data.tipsterId ||
            comparable(item.name) === comparable(data.tipsterId),
        );
        const namespace =
          input.kind === "picks"
            ? (tipster?.id ?? data.tipsterId)
            : (data.bookmaker ?? "Winamax FR");
        const identity = `${input.kind}:${namespace}:${data.sourceId}`;
        if (seenSources.has(identity))
          throw new Error("Identifiant source répété dans ce fichier.");
        seenSources.add(identity);
      }
      if (completed.has(row.row)) {
        row.skipped = true;
        row.warnings.push(
          "Ligne déjà traitée lors d’un import précédent : aucune nouvelle écriture.",
        );
        return row;
      }
      const corrected =
        input.kind === "picks"
          ? state.picks.find((pick) => {
              const tipster = state.tipsters.find(
                (item) =>
                  item.id === data.tipsterId ||
                  comparable(item.name) === comparable(data.tipsterId),
              );
              return (
                data.sourceId &&
                pick.sourceId === data.sourceId &&
                pick.tipsterId === (tipster?.id ?? data.tipsterId) &&
                pick.manuallyCorrected
              );
            })
          : state.tickets.find(
              (ticket) =>
                data.sourceId &&
                ticket.sourceId === data.sourceId &&
                ticket.bookmaker === (data.bookmaker ?? "Winamax FR") &&
                ticket.manuallyCorrected,
            );
      if (corrected) {
        row.data = { ...corrected };
        row.warnings.push(
          "Correction manuelle conservée : cette ligne sera ignorée.",
        );
        return row;
      }
      if (input.kind === "picks") {
        const tipster = text(data.tipsterId, "Tipster", true);
        const existingTipster = state.tipsters.find(
          (t) => t.id === tipster || comparable(t.name) === comparable(tipster),
        );
        data.tipsterId = existingTipster?.id ?? tipster;
        data.tipsterName = existingTipster?.name ?? tipster;
        if (
          !data.settlementSource &&
          data.result &&
          data.result !== "open" &&
          data.result !== "ouvert"
        )
          data.settlementSource = `CSV ${input.fileName}`;
        const previous = state.picks.find(
          (p) =>
            data.sourceId &&
            p.sourceId === data.sourceId &&
            p.tipsterId === data.tipsterId,
        );
        const parsed = buildPick(data, previous, true);
        Object.assign(data, parsed, { tipsterName: data.tipsterName });
        if (previous?.manuallyCorrected)
          row.warnings.push(
            "Correction manuelle conservée : cette ligne sera ignorée.",
          );
        const probable =
          !data.sourceId &&
          state.picks.some(
            (p) =>
              p.tipsterId === data.tipsterId &&
              comparable(p.event) === comparable(data.event) &&
              p.startsAt === data.startsAt &&
              comparable(p.market) === comparable(data.market) &&
              comparable(p.selection) === comparable(data.selection) &&
              p.line === data.line,
          );
        if (probable)
          row.warnings.push(
            "Doublon probable sans identifiant source : confirmation explicite requise.",
          );
      } else {
        for (const [column, key] of [
          ["stake", "stakeCents"],
          ["return", "returnCents"],
          ["fee", "feeCents"],
          ["remaining_stake", "remainingStakeCents"],
        ] as const) {
          const exact = get(`${column}_cents`),
            euro = get(column);
          if (
            exact !== undefined &&
            exact !== "" &&
            euro !== undefined &&
            euro !== ""
          )
            throw new Error(
              `${column} : renseignez soit les euros, soit les centimes, jamais les deux.`,
            );
          if (exact !== undefined && exact !== "")
            data[key] = integer(exact, column);
          else if (euro !== undefined && euro !== "")
            data[key] = cents(euro, column);
        }
        data.source = data.source || `CSV ${input.fileName}`;
        const previous = state.tickets.find(
          (t) =>
            data.sourceId &&
            t.sourceId === data.sourceId &&
            t.bookmaker === (data.bookmaker ?? "Winamax FR"),
        );
        // The service reconciles the existing dated payments after interpreting
        // the new cumulative return; do not validate the old sum against it here.
        const parsed = buildTicket(
          data,
          previous ? { ...previous, returnPayments: undefined } : undefined,
        );
        Object.assign(data, parsed);
        if (data.pickId && !state.picks.some((p) => p.id === data.pickId))
          throw new Error("Pronostic associé introuvable dans cet espace.");
        if (previous?.manuallyCorrected)
          row.warnings.push(
            "Correction manuelle conservée : cette ligne sera ignorée.",
          );
        const probable =
          !data.sourceId &&
          state.tickets.some(
            (t) =>
              comparable(t.event) === comparable(data.event) &&
              t.placedAt === data.placedAt &&
              t.stakeCents === data.stakeCents &&
              comparable(t.selection) === comparable(data.selection),
          );
        if (probable)
          row.warnings.push(
            "Doublon probable sans identifiant source : confirmation explicite requise.",
          );
      }
      const identity = data.sourceId
        ? `${input.kind}:${data.tipsterId ?? data.bookmaker}:${data.sourceId}`
        : `${input.kind}:no-id:${data.tipsterId ?? ""}:${data.event}:${data.startsAt ?? data.placedAt}:${data.market}:${data.selection}:${data.line}`;
      if (seen.has(identity) && !data.sourceId)
        row.warnings.push(
          "Doublon probable sans identifiant source dans ce fichier : confirmation explicite requise.",
        );
      seen.add(identity);
      row.data = data;
    } catch (error) {
      row.errors.push((error as Error).message);
    }
    return row;
  });
  return { headers, rows, total: rows.length };
}
