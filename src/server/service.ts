import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { getPool } from "../db";
import * as schema from "../db/schema";
import { DEFAULT_SETTINGS } from "../domain/types";
import type {
  AppState,
  AuditEntry,
  ImportBatch,
  LedgerEntry,
  Pick,
  ProbabilitySource,
  Quote,
  ReconciliationSnapshot,
  Settings,
  Simulation,
  Strategy,
  Ticket,
  Tipster,
  Workspace,
} from "../domain/types";
import { decision, matchesSegment } from "../domain/calculations";
import {
  compareStakes,
  type AllocationCandidate,
  type StakingComparison,
} from "../domain/staking";
import { reconcileCash } from "../domain/finance";
import {
  boolean,
  buildPick,
  buildTicket,
  date,
  enumValue,
  integer,
  number,
  object,
  text,
  validatePick,
  validateSettings,
  validateTicket,
} from "./validation";
import {
  importHash,
  importInput,
  previewImport,
  type ImportInput,
} from "./imports";
import { enrichAnalysisDemo } from "./demo-analysis";
import { prepareOddsSync } from "../connectors/odds-sync";
import { pickIdentity } from "../connectors/the-odds-api";
import { assertCashHistory } from "./cash-history";
import { planReturnPayments } from "./ticket-payments";

const entityNames = [
  "tipsters",
  "picks",
  "quotes",
  "strategies",
  "tickets",
  "ledger",
  "simulations",
  "imports",
  "audit",
] as const;
const appendOnly = new Set<string>([
  "ledger",
  "imports",
  "audit",
  "simulations",
  "quotes",
]);
function checkWorkspace(workspace: Workspace) {
  if (workspace !== "personal" && workspace !== "demo")
    throw new Error("Espace inconnu.");
}
export function emptyState(workspace: Workspace): AppState {
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
async function loadState(
  workspace: Workspace,
  client: PoolClient,
): Promise<AppState> {
  const db = drizzle(client);
  const state = emptyState(workspace);
  for (const name of entityNames) {
    const rows = await db
      .select({ document: schema[name].document })
      .from(schema[name])
      .where(eq(schema[name].workspace, workspace));
    (state[name] as unknown[]) = rows.map((r) => r.document);
  }
  const settings = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.workspace, workspace));
  if (settings[0])
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...settings[0].document,
    } as Settings;
  state.audit.sort((a, b) => b.at.localeCompare(a.at));
  state.imports.sort((a, b) => b.at.localeCompare(a.at));
  return state;
}
export async function readState(workspace: Workspace): Promise<AppState> {
  checkWorkspace(workspace);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const state = await loadState(workspace, client);
    await client.query("COMMIT");
    return state;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function persist(before: AppState, after: AppState, client: PoolClient) {
  for (const name of entityNames) {
    const originals = new Map(
      (before[name] as { id: string }[]).map((entity) => [
        entity.id,
        JSON.stringify(entity),
      ]),
    );
    for (const entity of after[name] as { id: string }[]) {
      const serialized = JSON.stringify(entity);
      if (originals.get(entity.id) === serialized) continue;
      if (appendOnly.has(name) && originals.has(entity.id))
        throw new Error(`L’historique ${name} est immuable.`);
      await client.query(
        `INSERT INTO ${name}(workspace,id,document) VALUES ($1,$2,$3::jsonb) ON CONFLICT(workspace,id) DO UPDATE SET document=EXCLUDED.document`,
        [after.workspace, entity.id, serialized],
      );
    }
  }
  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings))
    await client.query(
      "INSERT INTO settings(workspace,id,document) VALUES($1,$2,$3::jsonb) ON CONFLICT(workspace,id) DO UPDATE SET document=EXCLUDED.document",
      [after.workspace, "settings", JSON.stringify(after.settings)],
    );
}
async function transaction<T>(
  workspace: Workspace,
  run: (state: AppState) => Promise<T> | T,
): Promise<T> {
  checkWorkspace(workspace);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(191233,$1)", [
      workspace === "personal" ? 1 : 2,
    ]);
    const state = await loadState(workspace, client),
      before = structuredClone(state);
    const output = await run(state);
    await persist(before, state, client);
    await client.query("COMMIT");
    return output;
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505")
      throw new Error("Cet identifiant source existe déjà dans cet espace.");
    throw error;
  } finally {
    client.release();
  }
}
function audit(
  state: AppState,
  action: string,
  entityId: string,
  detail: string,
) {
  state.audit.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    action,
    entityId,
    detail,
  });
}
function requireRef<T extends { id: string }>(
  items: T[],
  id: string,
  label: string,
): T {
  const entity = items.find((i) => i.id === id);
  if (!entity) throw new Error(`${label} introuvable dans cet espace.`);
  return entity;
}
function currentCash(state: AppState) {
  return state.ledger.reduce((sum, e) => {
    const next = sum + e.amountCents;
    if (!Number.isSafeInteger(next))
      throw new Error(
        "Le cumul du journal dépasse la précision des centimes autorisée.",
      );
    return next;
  }, 0);
}
function ledgerEntry(
  state: AppState,
  kind: LedgerEntry["kind"],
  amountCents: number,
  at: string,
  description: string,
  ticketId: string | null = null,
  revision = 0,
) {
  integer(amountCents, "Montant du journal", -Number.MAX_SAFE_INTEGER);
  if (amountCents === 0) return;
  state.ledger.push({
    id: randomUUID(),
    kind,
    amountCents,
    at,
    description,
    ticketId,
    revision,
  });
}
function saveTipster(state: AppState, data: Record<string, unknown>): Tipster {
  const previous = data.id
    ? requireRef(state.tipsters, text(data.id, "ID"), "Tipster")
    : undefined;
  const t: Tipster = {
    id: previous?.id ?? randomUUID(),
    name: "",
    source: "",
    sourceUrl: "",
    discoveredAt: new Date().toISOString(),
    active: true,
    notes: "",
    accessNotes: "",
    monthlyCostCents: 0,
    completeness: "unknown",
    bankrolls: [],
    ...previous,
  };
  for (const key of [
    "name",
    "source",
    "sourceUrl",
    "notes",
    "accessNotes",
  ] as const)
    if (data[key] !== undefined) t[key] = text(data[key], key);
  text(t.name, "Nom", true, 200);
  if (
    state.tipsters.some(
      (x) => x.id !== t.id && x.name.toLowerCase() === t.name.toLowerCase(),
    )
  )
    throw new Error("Un tipster porte déjà ce nom.");
  if (data.discoveredAt !== undefined)
    t.discoveredAt = date(data.discoveredAt, "Découverte", false);
  if (data.active !== undefined) t.active = boolean(data.active);
  if (data.monthlyCostCents !== undefined)
    t.monthlyCostCents = integer(data.monthlyCostCents, "Coût mensuel");
  if (data.completeness !== undefined)
    t.completeness = enumValue(
      data.completeness,
      ["unknown", "provided_complete"],
      "Complétude",
      "unknown",
    );
  if (data.bankrolls !== undefined) {
    if (!Array.isArray(data.bankrolls))
      throw new Error("Liste de bankrolls attendue.");
    t.bankrolls = data.bankrolls.map((v) => text(v, "Bankroll", true, 200));
  }
  if (previous) state.tipsters[state.tipsters.indexOf(previous)] = t;
  else state.tipsters.push(t);
  audit(
    state,
    "tipster.save",
    t.id,
    previous ? "Fiche modifiée" : "Fiche créée",
  );
  return t;
}
function savePick(
  state: AppState,
  data: Record<string, unknown>,
  imported = false,
): { entity: Pick; status: "created" | "updated" | "skipped" } {
  const previous = data.id
    ? state.picks.find((p) => p.id === data.id)
    : data.sourceId
      ? state.picks.find(
          (p) => p.sourceId === data.sourceId && p.tipsterId === data.tipsterId,
        )
      : undefined;
  if (data.id && !previous && !imported)
    throw new Error("Pronostic introuvable dans cet espace.");
  if (imported && previous?.manuallyCorrected)
    return { entity: previous, status: "skipped" };
  const p = buildPick(data, previous, imported);
  requireRef(state.tipsters, p.tipsterId, "Tipster");
  if (
    state.picks.some(
      (other) =>
        other.id !== p.id &&
        p.sourceId &&
        other.sourceId === p.sourceId &&
        other.tipsterId === p.tipsterId,
    )
  )
    throw new Error("Identifiant source déjà associé à ce tipster.");
  if (previous) {
    if (isDeepStrictEqual(p, previous))
      return { entity: previous, status: "skipped" };
    p.revisions = [
      ...previous.revisions,
      {
        at: new Date().toISOString(),
        description: imported ? "Mise à jour CSV" : "Correction manuelle",
        previous: { ...previous, revisions: undefined },
      },
    ];
    p.manuallyCorrected = !imported || previous.manuallyCorrected;
    state.picks[state.picks.indexOf(previous)] = p;
    if (
      [
        "eventKey",
        "event",
        "sport",
        "competition",
        "startsAt",
        "market",
        "selection",
        "line",
        "rules",
        "kind",
        "timing",
      ].some((key) => p[key as keyof Pick] !== previous[key as keyof Pick]) &&
      state.quotes.some((q) => q.pickId === p.id)
    ) {
      state.quotes.push({
        id: randomUUID(),
        pickId: p.id,
        bookmaker: "Winamax FR",
        odds: null,
        observedAt: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        source: "Correspondance à vérifier après révision du pronostic",
        sourceUrl: "",
        available: false,
        matchConfirmed: false,
        closing: false,
        referenceProbability: null,
        notes:
          "Les anciens relevés restent archivés ; vérifier à nouveau le marché exact.",
      });
    }
  } else state.picks.push(p);
  audit(
    state,
    imported ? "pick.import" : "pick.save",
    p.id,
    previous ? "Révision conservée" : "Publication initiale conservée",
  );
  return { entity: p, status: previous ? "updated" : "created" };
}
function saveTicket(
  state: AppState,
  data: Record<string, unknown>,
  imported = false,
): { entity: Ticket; status: "created" | "updated" | "skipped" } {
  const previous = data.id
    ? state.tickets.find((t) => t.id === data.id)
    : data.sourceId
      ? state.tickets.find(
          (t) =>
            t.sourceId === data.sourceId &&
            t.bookmaker === (data.bookmaker ?? "Winamax FR"),
        )
      : undefined;
  if (data.id && !previous && !imported)
    throw new Error("Ticket introuvable dans cet espace.");
  if (imported && previous?.manuallyCorrected)
    return { entity: previous, status: "skipped" };
  const t = buildTicket(
    data,
    previous ? { ...previous, returnPayments: undefined } : undefined,
  );
  t.returnPayments = planReturnPayments(t, previous, data);
  validateTicket(t);
  if (t.pickId) {
    const linked = requireRef(state.picks, t.pickId, "Pronostic");
    if (!data.eventKey && !previous) t.eventKey = linked.eventKey;
    const normalize = (value: unknown) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
    const labels = {
      eventKey: "Identifiant de l’événement",
      market: "Marché",
      selection: "Sélection",
      line: "Ligne",
      rules: "Règles",
      kind: "Type",
    };
    for (const key of [
      "eventKey",
      "market",
      "selection",
      "line",
      "rules",
      "kind",
    ] as const)
      if (normalize(t[key]) !== normalize(linked[key]))
        throw new Error(
          `${labels[key]} : le ticket ne correspond pas au pronostic associé. Corrigez le lien ou vérifiez le marché exact.`,
        );
  }
  if (t.strategyId) requireRef(state.strategies, t.strategyId, "Stratégie");
  if (
    state.tickets.some(
      (other) =>
        other.id !== t.id &&
        t.sourceId &&
        other.sourceId === t.sourceId &&
        other.bookmaker === t.bookmaker,
    )
  )
    throw new Error("Identifiant du ticket déjà utilisé.");
  if (previous && isDeepStrictEqual(t, previous))
    return { entity: previous, status: "skipped" };
  const cashStake = t.funding === "cash" ? t.stakeCents : 0,
    oldCashStake = previous?.funding === "cash" ? previous.stakeCents : 0;
  const stakeDelta = oldCashStake - cashStake,
    feeDelta = (previous?.feeCents ?? 0) - t.feeCents,
    returnDelta = t.returnCents - (previous?.returnCents ?? 0);
  const revision = previous ? previous.revisions.length + 1 : 0,
    now = new Date().toISOString();
  // Financial dates are effective dates. The audit/revision records capture when
  // a correction was received. Reverse earlier dated amounts and add the current
  // truth, preserving every entry without creating artificial delayed cash flows.
  for (const [kind, payments, label] of [
    [
      "ticket_stake",
      [{ amountCents: -cashStake, at: t.placedAt }],
      "Mise réelle",
    ],
    ["ticket_return", t.returnPayments, "Retour réel"],
    [
      "ticket_fee",
      [{ amountCents: -t.feeCents, at: t.placedAt }],
      "Frais réels",
    ],
  ] as const) {
    const desiredByDate = new Map<string, number>();
    for (const payment of payments)
      desiredByDate.set(
        payment.at,
        (desiredByDate.get(payment.at) ?? 0) + payment.amountCents,
      );
    const existingByDate = new Map<string, number>();
    for (const e of state.ledger.filter(
      (e) => e.ticketId === t.id && e.kind === kind,
    ))
      existingByDate.set(e.at, (existingByDate.get(e.at) ?? 0) + e.amountCents);
    const dates = new Set([...existingByDate.keys(), ...desiredByDate.keys()]);
    for (const effectiveAt of dates) {
      const delta =
        (desiredByDate.get(effectiveAt) ?? 0) -
        (existingByDate.get(effectiveAt) ?? 0);
      ledgerEntry(
        state,
        kind,
        delta,
        effectiveAt,
        `${previous ? "Correction · " : ""}${label} : ${t.event}`,
        t.id,
        revision,
      );
    }
  }
  assertCashHistory(state.ledger, [
    ...state.tickets.filter((ticket) => ticket.id !== t.id),
    t,
  ]);
  if (previous) {
    t.revisions = [
      ...previous.revisions,
      {
        at: now,
        description: imported ? "Mise à jour CSV" : "Correction manuelle",
        previous: { ...previous, revisions: undefined },
      },
    ];
    t.manuallyCorrected = !imported || previous.manuallyCorrected;
    state.tickets[state.tickets.indexOf(previous)] = t;
  } else state.tickets.push(t);
  audit(
    state,
    imported ? "ticket.import" : "ticket.save",
    t.id,
    `Mouvement net : ${stakeDelta + feeDelta + returnDelta} centimes`,
  );
  return { entity: t, status: previous ? "updated" : "created" };
}
function saveQuote(state: AppState, data: Record<string, unknown>): Quote {
  const now = new Date().toISOString();
  const pickId = text(data.pickId, "Pronostic", true);
  const pick = requireRef(state.picks, pickId, "Pronostic");
  const available = boolean(data.available, true),
    matchConfirmed = boolean(data.matchConfirmed);
  if (available && !matchConfirmed)
    throw new Error(
      "Confirmez manuellement le marché, la sélection, la ligne et les règles Winamax FR.",
    );
  const observedAt = date(data.observedAt ?? now, "Observation", false);
  if (observedAt > now) throw new Error("L’observation ne peut être future.");
  const q: Quote = {
    id: randomUUID(),
    pickId,
    bookmaker: "Winamax FR",
    odds: available ? number(data.odds, "Cote", 1.000001, 100000) : null,
    observedAt,
    recordedAt: now,
    source: text(data.source, "Source de la cote", true),
    sourceUrl: text(data.sourceUrl, "URL"),
    available,
    matchConfirmed,
    closing: boolean(data.closing),
    referenceProbability:
      data.referenceProbability == null || data.referenceProbability === ""
        ? null
        : number(
            data.referenceProbability,
            "Probabilité de référence",
            0.000001,
            0.999999,
          ),
    notes: text(data.notes, "Notes"),
    collectionMode: "manual",
    mappingStatus: matchConfirmed ? "confirmed" : "unconfirmed",
    identitySnapshot: pickIdentity(pick),
  };
  if (q.closing && q.observedAt > pick.startsAt)
    throw new Error(
      "Une cote de clôture doit avoir été observée au plus tard au début de l’événement.",
    );
  if (q.referenceProbability !== null && !q.notes)
    throw new Error(
      "Documentez dans les notes le marché complet, la méthode de retrait de marge, la source et sa date pour cette probabilité de référence.",
    );
  state.quotes.push(q);
  audit(state, "quote.save", q.id, "Observation manuelle ; aucun ticket créé");
  return q;
}
function addLedger(
  state: AppState,
  data: Record<string, unknown>,
): LedgerEntry {
  const kind = enumValue(
    data.kind,
    [
      "initial",
      "deposit",
      "withdrawal",
      "adjustment",
      "poker",
      "fee",
      "promotion",
    ],
    "Mouvement",
    "adjustment",
  );
  const amountCents = integer(
    data.amountCents,
    "Montant signé",
    -Number.MAX_SAFE_INTEGER,
  );
  if (amountCents === 0) throw new Error("Un mouvement doit être non nul.");
  if (["initial", "deposit", "promotion"].includes(kind) && amountCents < 0)
    throw new Error("Le montant de ce crédit doit être positif.");
  if (["withdrawal", "fee"].includes(kind) && amountCents > 0)
    throw new Error("Le montant de ce débit doit être négatif.");
  if (kind === "initial" && state.ledger.some((l) => l.kind === "initial"))
    throw new Error(
      "Le solde initial est déjà enregistré. Utilisez un ajustement documenté.",
    );
  if (currentCash(state) + amountCents < 0)
    throw new Error("Ce mouvement produirait un solde cash négatif.");
  const description = text(data.description, "Description", true),
    at = date(data.at ?? new Date().toISOString(), "Date du mouvement", false);
  if (at > new Date().toISOString())
    throw new Error("Un mouvement comptabilisé ne peut être futur.");
  ledgerEntry(state, kind, amountCents, at, description);
  assertCashHistory(state.ledger, state.tickets);
  const entry = state.ledger.at(-1)!;
  audit(state, "ledger.add", entry.id, description);
  return entry;
}
function saveStrategy(
  state: AppState,
  data: Record<string, unknown>,
  fictionalHistorical = false,
): Strategy {
  const previous = data.id
    ? requireRef(state.strategies, text(data.id, "ID"), "Stratégie")
    : undefined;
  const filter = { ...object(data.filter ?? previous?.filter ?? {}) };
  const allowed = new Set([
    "tipsterId",
    "sport",
    "competition",
    "market",
    "oddsMin",
    "oddsMax",
    "kind",
    "timing",
    "delayMinMinutes",
    "delayMaxMinutes",
  ]);
  for (const [key, value] of Object.entries(filter)) {
    if (!allowed.has(key)) throw new Error(`Filtre inconnu : ${key}`);
    if (key === "delayMinMinutes" || key === "delayMaxMinutes")
      filter[key] = number(value, key);
    else if (key === "oddsMin") filter[key] = number(value, key, 1);
    else if (key === "oddsMax") filter[key] = number(value, key, 1.000001);
    else filter[key] = text(value, key, true);
  }
  if (filter.tipsterId)
    requireRef(state.tipsters, String(filter.tipsterId), "Tipster");
  if (
    filter.oddsMin != null &&
    filter.oddsMax != null &&
    Number(filter.oddsMin) >= Number(filter.oddsMax)
  )
    throw new Error(
      "La borne haute des cotes doit dépasser strictement la borne basse.",
    );
  if (
    filter.delayMinMinutes != null &&
    filter.delayMaxMinutes != null &&
    Number(filter.delayMinMinutes) >= Number(filter.delayMaxMinutes)
  )
    throw new Error(
      "La borne haute des délais doit dépasser strictement la borne basse.",
    );
  if (filter.kind)
    enumValue(filter.kind, ["single", "accumulator"], "Type", "single");
  if (filter.timing)
    enumValue(filter.timing, ["prematch", "live"], "Moment", "prematch");
  const now = new Date().toISOString(),
    discoveryEnd = date(
      data.discoveryEnd ?? previous?.discoveryEnd,
      "Fin de découverte",
      false,
    ),
    validationStart = date(
      data.validationStart ?? previous?.validationStart,
      "Début de validation",
      false,
    );
  if (discoveryEnd >= validationStart)
    throw new Error(
      "La validation doit commencer strictement après la période de découverte.",
    );
  if (!fictionalHistorical && validationStart < now)
    throw new Error(
      "La validation prospective doit commencer après le gel actuel des règles. Choisissez une date future.",
    );
  if (!fictionalHistorical && discoveryEnd > now)
    throw new Error(
      "La période de découverte doit être terminée au moment du gel.",
    );
  if (fictionalHistorical && state.workspace !== "demo")
    throw new Error("Les dates fictives sont réservées à la démonstration.");
  const strategy: Strategy = {
    id: randomUUID(),
    name: text(data.name ?? previous?.name, "Nom", true, 200),
    filter,
    createdAt: now,
    frozenAt: now,
    discoveryEnd,
    validationStart,
    active: boolean(data.active, true),
    notes: text(data.notes ?? previous?.notes, "Notes"),
  };
  if (previous) previous.active = false;
  state.strategies.push(strategy);
  audit(
    state,
    "strategy.save",
    strategy.id,
    previous
      ? `Nouvelle version ; précédente ${previous.id} conservée`
      : "Règles figées avant validation",
  );
  return strategy;
}
function saveReconciliation(
  state: AppState,
  data: Record<string, unknown>,
): AuditEntry {
  const recordedAt = new Date().toISOString();
  const at = date(data.at, "Date du relevé", false);
  if (at > recordedAt)
    throw new Error("Le rapprochement ne peut porter sur un solde futur.");
  const balanceCents = integer(data.balanceCents, "Solde cash relevé");
  const reconciliation = reconcileCash(state, balanceCents, at);
  if (
    reconciliation.calculatedCashCents == null ||
    reconciliation.differenceCents == null
  )
    throw new Error(reconciliation.message);
  const calculatedCashCents = reconciliation.calculatedCashCents;
  const differenceCents = reconciliation.differenceCents;
  const ledgerEntryIds = reconciliation.entryIds;
  const snapshot: ReconciliationSnapshot = {
    schemaVersion: 1,
    balanceCents,
    calculatedCashCents,
    differenceCents,
    at,
    recordedAt,
    source: text(data.source, "Source du relevé", true, 1000),
    notes: text(data.notes, "Notes"),
    ledgerEntryIds,
    hasLedgerHistory: reconciliation.hasLedgerHistory,
    uncertain: reconciliation.uncertain,
    issues: reconciliation.issues,
  };
  const entry: AuditEntry = {
    id: randomUUID(),
    at: recordedAt,
    action: "reconciliation.save",
    entityId: "reconciliation",
    detail: JSON.stringify(snapshot),
  };
  state.audit.push(entry);
  if (!state.settings.reconciledAt || at >= state.settings.reconciledAt) {
    state.settings.reconciledAt = at;
    state.settings.reconciliationBalanceCents = balanceCents;
  }
  return entry;
}
function compareSimulation(
  state: AppState,
  data: Record<string, unknown>,
): StakingComparison & { strategyId: string | null; assumptions: string } {
  const strategyId = text(data.strategyId, "Stratégie") || null;
  const strategy = strategyId
    ? requireRef(state.strategies, strategyId, "Stratégie")
    : null;
  let raw = data.candidates;
  if (!raw && Array.isArray(data.pickIds)) {
    const probabilities = data.probabilities ? object(data.probabilities) : {};
    raw = data.pickIds.map((pickId) => {
      const probability = probabilities[String(pickId)]
        ? object(probabilities[String(pickId)])
        : {};
      return {
        pickId,
        probability: probability.probability ?? null,
        probabilitySource: probability.source ?? null,
        basis: probability.basis,
      };
    });
  }
  if (!Array.isArray(raw) || raw.length > 1000)
    throw new Error("Liste des candidats attendue (1 000 maximum).");
  const candidates: AllocationCandidate[] = raw.map((value) => {
    const candidate = object(value);
    const pickId = text(candidate.pickId, "Pronostic", true);
    const pick = requireRef(state.picks, pickId, "Pronostic");
    if (strategy && !matchesSegment(pick, strategy.filter))
      throw new Error("Un candidat ne correspond pas à la stratégie figée.");
    const probability =
      candidate.probability == null || candidate.probability === ""
        ? null
        : number(candidate.probability, "Probabilité", 0, 1);
    const probabilitySource: ProbabilitySource | null =
      probability === null
        ? null
        : enumValue<ProbabilitySource>(
            candidate.probabilitySource,
            ["manual", "market", "model"],
            "Source de probabilité",
            "manual",
          );
    if (probabilitySource !== null && probabilitySource !== "manual")
      throw new Error(
        "Les probabilités de marché/modèle nécessitent une provenance évaluée non disponible dans cette version ; saisissez une hypothèse manuelle.",
      );
    return {
      pickId,
      probability,
      probabilitySource,
      basis: text(candidate.basis, "Justification de l’hypothèse", false, 5000),
    };
  });
  const scenario = strategy ? { ...state, strategies: [strategy] } : state;
  const comparison = compareStakes(scenario, candidates, new Date());
  return {
    ...comparison,
    strategyId,
    assumptions:
      text(data.assumptions, "Hypothèses") ||
      "Simulation non exécutée. Cotes observées, limites et solde de cet instant. Les probabilités manuelles sont des hypothèses sans avantage démontré ; aucune garantie de rendement ou de disponibilité future.",
  };
}

function saveSimulation(
  state: AppState,
  data: Record<string, unknown>,
): Simulation {
  const comparison = compareSimulation(state, data);
  const method = enumValue(
    data.method,
    ["fixed", "percent", "kelly"],
    "Méthode",
    "fixed",
  );
  const selected = comparison.methods.find(
    (result) => result.method === method,
  )!;
  const quoteSnapshots = comparison.candidates.flatMap((candidate) => {
    const pick = requireRef(state.picks, candidate.pickId, "Pronostic");
    const quote = decision(pick, state, new Date(comparison.createdAt)).quote;
    return quote ? [structuredClone(quote)] : [];
  });
  const simulation: Simulation = {
    id: randomUUID(),
    name: text(data.name, "Nom", true, 200),
    createdAt: comparison.createdAt,
    strategyId: comparison.strategyId,
    method,
    allocations: structuredClone(selected.allocations),
    assumptions: comparison.assumptions,
    settingsSnapshot: structuredClone(comparison.settingsSnapshot),
    candidatesSnapshot: structuredClone(comparison.candidates),
    bankrollSnapshot: structuredClone(comparison.bankrollSnapshot),
    comparisonSnapshot: structuredClone(comparison),
    quoteSnapshots,
  };
  state.simulations.push(simulation);
  audit(
    state,
    "simulation.save",
    simulation.id,
    "Trois méthodes recalculées sur le serveur ; hypothèses et sources figées ; aucun mouvement financier.",
  );
  return simulation;
}

function recordExploration(
  state: AppState,
  data: Record<string, unknown>,
): AuditEntry {
  const rawFilter = object(data.filter ?? {});
  const filter: Record<string, string | number> = {};
  const stringFields = new Set(["tipsterId", "sport", "competition", "market"]);
  const numberFields = new Set([
    "oddsMin",
    "oddsMax",
    "delayMinMinutes",
    "delayMaxMinutes",
  ]);

  for (const [key, value] of Object.entries(rawFilter)) {
    if (stringFields.has(key)) {
      if (typeof value !== "string")
        throw new Error(`Le filtre ${key} doit être textuel.`);
      filter[key] = text(value, `Filtre ${key}`, true, 300);
    } else if (numberFields.has(key)) {
      if (typeof value !== "number")
        throw new Error(`Le filtre ${key} doit être numérique.`);
      filter[key] = number(
        value,
        `Filtre ${key}`,
        key === "oddsMin"
          ? 1
          : key === "oddsMax"
            ? 1.000001
            : -Number.MAX_SAFE_INTEGER,
      );
    } else if (key === "kind") {
      if (typeof value !== "string")
        throw new Error("Le type de pari doit être textuel.");
      filter.kind = enumValue(
        value,
        ["single", "accumulator"],
        "Type de pari",
        "single",
      );
    } else if (key === "timing") {
      if (typeof value !== "string")
        throw new Error("Le moment du pari doit être textuel.");
      filter.timing = enumValue(
        value,
        ["prematch", "live"],
        "Avant-match ou live",
        "prematch",
      );
    } else {
      throw new Error(`Filtre inconnu : ${key}.`);
    }
  }

  if (filter.tipsterId)
    requireRef(state.tipsters, String(filter.tipsterId), "Tipster");
  if (
    filter.oddsMin != null &&
    filter.oddsMax != null &&
    Number(filter.oddsMin) >= Number(filter.oddsMax)
  ) {
    throw new Error(
      "La plage de cotes doit avoir une borne haute strictement supérieure à sa borne basse.",
    );
  }
  if (
    filter.delayMinMinutes != null &&
    filter.delayMaxMinutes != null &&
    Number(filter.delayMinMinutes) >= Number(filter.delayMaxMinutes)
  ) {
    throw new Error(
      "La plage de délais doit avoir une borne haute strictement supérieure à sa borne basse.",
    );
  }

  if (
    typeof data.proof !== "string" ||
    !["declared", "observed", "simulated", "executed"].includes(data.proof)
  ) {
    throw new Error(
      "Niveau de preuve inconnu : choisissez explicitement déclaré, observé, simulé ou exécuté.",
    );
  }
  if (data.phase != null && typeof data.phase !== "string")
    throw new Error("La phase analysée doit être textuelle.");
  if (data.axis != null && typeof data.axis !== "string")
    throw new Error("L’axe analysé doit être textuel.");
  const proof = enumValue(
    data.proof,
    ["declared", "observed", "simulated", "executed"],
    "Niveau de preuve",
    "declared",
  );
  const phase = enumValue(
    data.phase,
    ["all", "discovery", "validation"],
    "Période analysée",
    "all",
  );
  const axis =
    data.axis == null
      ? null
      : enumValue(
          data.axis,
          ["sport", "competition", "market", "odds", "kind", "timing", "delay"],
          "Axe analysé",
          "sport",
        );
  const start = date(data.start, "Début de période", true);
  const end = date(data.end, "Fin de période", true);
  const discoveryEnd = date(data.discoveryEnd, "Fin de découverte", true);
  if (start && end && start >= end)
    throw new Error("La fin de période doit suivre strictement son début.");
  const strategyId = text(data.strategyId, "Stratégie") || null;
  const simulationId = text(data.simulationId, "Simulation") || null;
  if (strategyId) requireRef(state.strategies, strategyId, "Stratégie");
  if (simulationId) requireRef(state.simulations, simulationId, "Simulation");

  const id = randomUUID();
  const entry: AuditEntry = {
    id,
    at: new Date().toISOString(),
    action: "analysis.explore",
    entityId: id,
    detail: JSON.stringify({
      schemaVersion: 1,
      name: text(data.name, "Nom de variante", false, 200),
      filter,
      proof,
      discoveryEnd,
      start,
      end,
      axis,
      phase,
      strategyId,
      simulationId,
    }),
  };
  state.audit.push(entry);
  return entry;
}
function applyImportRow(
  state: AppState,
  kind: "picks" | "tickets",
  fileName: string,
  rowData: Record<string, unknown>,
): "created" | "updated" | "skipped" {
  const data = { ...rowData };
  if (kind === "picks") {
    if (!state.tipsters.some((t) => t.id === data.tipsterId)) {
      const existing = state.tipsters.find(
        (t) => t.name.toLowerCase() === String(data.tipsterName).toLowerCase(),
      );
      data.tipsterId =
        existing?.id ??
        saveTipster(state, {
          name: data.tipsterName,
          source: `CSV ${fileName}`,
        }).id;
    }
    const found = state.picks.find(
      (p) =>
        data.sourceId &&
        p.sourceId === data.sourceId &&
        p.tipsterId === data.tipsterId,
    );
    if (found) data.id = found.id;
    else delete data.id;
    return savePick(state, data, true).status;
  }
  const found = state.tickets.find(
    (t) =>
      data.sourceId &&
      t.sourceId === data.sourceId &&
      t.bookmaker === data.bookmaker,
  );
  if (found) data.id = found.id;
  else delete data.id;
  return saveTicket(state, data, true).status;
}
function prepareImport(state: AppState, input: ImportInput) {
  const preview = previewImport(state, input);
  // Exercise the same mutations against an isolated copy so financial and relational
  // errors are visible before commit. No write or side effect leaves this copy.
  let probe = structuredClone(state);
  for (const row of preview.rows) {
    if (row.errors.length || !row.data) continue;
    const before = structuredClone(probe);
    try {
      applyImportRow(probe, input.kind, input.fileName, row.data);
    } catch (error) {
      row.errors.push((error as Error).message);
      probe = before;
    }
  }
  return preview;
}
async function commitImport(
  state: AppState,
  payload: unknown,
): Promise<ImportBatch> {
  const input = importInput(payload),
    hash = importHash(input),
    previous = state.imports.find(
      (i) => i.kind === input.kind && i.hash === hash,
    );
  if (!input.rightsConfirmed)
    throw new Error(
      "Confirmez votre droit d’utiliser ces données avant l’import.",
    );
  const preview = prepareImport(state, input),
    invalid = preview.rows.filter((r) => r.errors.length),
    probable = preview.rows.some((r) =>
      r.warnings.some((w) => w.includes("Doublon probable")),
    );
  if (previous && preview.rows.every((row) => row.skipped))
    return {
      ...previous,
      created: 0,
      updated: 0,
      skipped: preview.total,
      errors: [],
    };
  if (invalid.length && !input.allowPartial)
    throw new Error(
      `${invalid.length} ligne(s) invalide(s). Corrigez le fichier ou confirmez explicitement un import partiel.`,
    );
  if (probable && !input.allowProbableDuplicates)
    throw new Error(
      "Des doublons probables sans identifiant source nécessitent une confirmation explicite.",
    );
  const batch: ImportBatch = {
    id: randomUUID(),
    kind: input.kind,
    fileName: input.fileName,
    hash,
    at: new Date().toISOString(),
    created: 0,
    updated: 0,
    skipped: 0,
    errors: invalid.flatMap((r) =>
      r.errors.map((message) => ({ row: r.row, message })),
    ),
    completedRows: [],
    ...(previous ? { retryOf: previous.id } : {}),
  };
  for (const row of preview.rows) {
    if (row.skipped) {
      batch.skipped++;
      batch.completedRows!.push(row.row);
      continue;
    }
    if (row.errors.length || !row.data) continue;
    const beforeRow = structuredClone(state);
    try {
      const status = applyImportRow(
        state,
        input.kind,
        input.fileName,
        row.data,
      );
      batch[status]++;
      batch.completedRows!.push(row.row);
    } catch (error) {
      if (!input.allowPartial)
        throw new Error(`Ligne ${row.row} : ${(error as Error).message}`);
      Object.assign(state, beforeRow);
      batch.errors.push({ row: row.row, message: (error as Error).message });
    }
  }
  state.imports.push(batch);
  audit(
    state,
    "import.commit",
    batch.id,
    `${batch.created} créations, ${batch.updated} mises à jour, ${batch.skipped} ignorées, ${batch.errors.length} erreurs`,
  );
  return batch;
}

export async function executeAction(
  workspace: Workspace,
  action: string,
  payload: unknown,
): Promise<unknown> {
  if (action === "simulation.compare" || action === "simulation.preview") {
    const data = object(payload),
      comparison = compareSimulation(await readState(workspace), data);
    if (action === "simulation.compare") return comparison;
    const selectedMethod = enumValue(
      data.method,
      ["fixed", "percent", "kelly"],
      "Méthode",
      "fixed",
    );
    return {
      ...comparison,
      selectedMethod,
      allocations: comparison.methods.find(
        (result) => result.method === selectedMethod,
      )!.allocations,
    };
  }
  if (action === "odds.sync") {
    const data = object(payload);
    const input = {
      pickId: text(data.pickId, "Pronostic", true),
      sportKey: text(data.sportKey, "Compétition fournisseur") || undefined,
      candidateId:
        text(data.candidateId, "Proposition fournisseur") || undefined,
      confirmMatch: data.confirmMatch === true,
    };
    const beforeCollection = await readState(workspace);
    const expectedPick = requireRef(
      beforeCollection.picks,
      input.pickId,
      "Pronostic",
    );
    const prepared = await prepareOddsSync(beforeCollection, input);
    return transaction(workspace, (state) => {
      const pick = requireRef(state.picks, input.pickId, "Pronostic");
      if (
        !isDeepStrictEqual(pickIdentity(pick), prepared.identitySnapshot) ||
        pick.sport !== expectedPick.sport ||
        pick.competition !== expectedPick.competition
      )
        throw new Error(
          "Le pronostic a changé pendant la collecte. Vérifiez à nouveau sa correspondance.",
        );
      const result = { ...prepared.result };
      if (prepared.quote) {
        const draft = prepared.quote;
        const duplicate = state.quotes.find(
          (quote) =>
            quote.pickId === draft.pickId &&
            quote.odds === draft.odds &&
            quote.available === draft.available &&
            quote.providerLastUpdatedAt === draft.providerLastUpdatedAt &&
            isDeepStrictEqual(quote.provider, draft.provider) &&
            isDeepStrictEqual(quote.identitySnapshot, draft.identitySnapshot) &&
            quote.observedAt === draft.observedAt,
        );
        if (duplicate) {
          result.quoteId = duplicate.id;
          if (result.status === "updated") result.status = "unchanged";
        } else {
          const quote: Quote = {
            ...draft,
            id: randomUUID(),
            recordedAt: new Date().toISOString(),
          };
          state.quotes.push(quote);
          result.quoteId = quote.id;
        }
      }
      audit(
        state,
        "odds.sync",
        input.pickId,
        JSON.stringify({ ...result, candidates: [], sports: [] }),
      );
      return result;
    });
  }
  if (action === "import.preview")
    return prepareImport(await readState(workspace), importInput(payload));
  if (action === "demo.seed") {
    if (workspace !== "demo")
      throw new Error(
        "La démonstration est strictement isolée de l’espace personnel.",
      );
    return seedDemo();
  }
  return transaction(workspace, async (state) => {
    const data = object(payload);
    switch (action) {
      case "tipster.save":
        return saveTipster(state, data);
      case "pick.save":
        return savePick(state, data).entity;
      case "quote.save":
        return saveQuote(state, data);
      case "ticket.save":
        return saveTicket(state, data).entity;
      case "ledger.add":
        return addLedger(state, data);
      case "strategy.save":
        return saveStrategy(state, data);
      case "simulation.save":
        return saveSimulation(state, data);
      case "reconciliation.save":
        return saveReconciliation(state, data);
      case "analysis.explore":
        return recordExploration(state, data);
      case "settings.save": {
        const settings = validateSettings({
          ...state.settings,
          ...data,
        } as Settings);
        if (
          settings.reconciliationBalanceCents !==
            state.settings.reconciliationBalanceCents ||
          settings.reconciledAt !== state.settings.reconciledAt
        ) {
          if (
            settings.reconciliationBalanceCents == null &&
            settings.reconciledAt == null
          ) {
            audit(
              state,
              "reconciliation.clear",
              "reconciliation",
              "Référence courante effacée via les réglages ; tous les relevés audités sont conservés.",
            );
          } else {
            saveReconciliation(state, {
              balanceCents: settings.reconciliationBalanceCents,
              at: settings.reconciledAt,
              source: "Relevé manuel via réglages (API historique)",
              notes:
                "Rapprochement conservé comme snapshot du journal retraité connu lors de la saisie.",
            });
            settings.reconciliationBalanceCents =
              state.settings.reconciliationBalanceCents;
            settings.reconciledAt = state.settings.reconciledAt;
          }
        }
        state.settings = settings;
        audit(
          state,
          "settings.save",
          "settings",
          "Préférences et limites enregistrées",
        );
        return state.settings;
      }
      case "import.commit":
        return commitImport(state, data);
      default:
        throw new Error("Action inconnue.");
    }
  });
}

export async function seedDemo(
  workspace: Workspace = "demo",
): Promise<AppState> {
  if (workspace !== "demo")
    throw new Error(
      "Les exemples ne peuvent être créés que dans la démonstration.",
    );
  await transaction("demo", (state) => {
    if (state.audit.some((a) => a.action === "demo.seed")) {
      enrichAnalysisDemo(state);
      return;
    }
    const now = Date.now(),
      iso = (days: number, hours = 0) =>
        new Date(now + days * 86400000 + hours * 3600000).toISOString();
    const names = [
      "Atlas Football · fictif",
      "Horizon Tennis · fictif",
      "Ligne Claire · fictif",
      "Tribune Sport · fictif",
    ];
    const tipsters = names.map((name, i) =>
      saveTipster(state, {
        name,
        source: "Jeu de démonstration fictif",
        sourceUrl: "",
        discoveredAt: iso(-120),
        notes:
          "Données entièrement fictives pour découvrir les écrans ; aucune performance réelle.",
        monthlyCostCents: i === 0 ? 2900 : 0,
        completeness: i === 0 ? "provided_complete" : "unknown",
      }),
    );
    addLedger(state, {
      kind: "initial",
      amountCents: 100000,
      at: iso(-100),
      description: "Capital fictif de démonstration",
    });
    for (let i = 0; i < 80; i++) {
      const day = -90 + i,
        odds = [1.8, 2.1, 1.95, 2.4, 1.7][i % 5],
        won = (i * 7) % 13 < 7;
      savePick(
        state,
        {
          tipsterId: tipsters[i % 4].id,
          sourceId: `demo-pick-${i}`,
          publishedAt: iso(day, -4),
          startsAt: iso(day),
          event: `Club ${i + 1} — Club ${i + 101}`,
          sport: i % 4 === 1 ? "Tennis" : "Football",
          competition:
            i % 4 === 1 ? "Circuit fictif" : "Ligue de démonstration",
          market: "Vainqueur",
          selection: `Club ${i + 1}`,
          rules: "Temps réglementaire",
          odds,
          stakeUnits: 1,
          result: won ? "won" : "lost",
          settledAt: iso(day, 3),
          settlementSource: "Résultat fictif",
          notes: "Historique fictif déclaré ; aucune preuve rétrospective.",
        },
        true,
      );
    }
    for (let i = 0; i < 5; i++) {
      const p = savePick(state, {
        tipsterId: tipsters[i % 4].id,
        sourceId: `demo-upcoming-${i}`,
        publishedAt: iso(0, -1),
        startsAt: iso(1, i),
        event: `Équipe Démo ${i + 1} — Équipe Exemple ${i + 1}`,
        sport: "Football",
        competition: "Ligue fictive",
        market: "Vainqueur",
        selection: `Équipe Démo ${i + 1}`,
        odds: 1.8 + i * 0.15,
        rules: "Temps réglementaire",
        notes: "Exemple fictif créé dans le futur proche.",
      }).entity;
      saveQuote(state, {
        pickId: p.id,
        odds: 1.78 + i * 0.15,
        available: i !== 4,
        matchConfirmed: i !== 4,
        observedAt: iso(0),
        source: "Observation fictive de démonstration",
        notes: "Aucune cote réelle Winamax.",
      });
    }
    for (let i = 0; i < 8; i++) {
      const p = state.picks[i],
        won = i % 3 !== 0;
      saveTicket(state, {
        sourceId: `demo-ticket-${i}`,
        pickId: p.id,
        event: p.event,
        eventKey: p.eventKey,
        market: p.market,
        selection: p.selection,
        rules: p.rules,
        odds: p.odds,
        stakeCents: 1000,
        funding: i === 7 ? "freebet" : "cash",
        placedAt: p.publishedAt,
        result: won ? "won" : "lost",
        returnCents: won ? Math.round(1000 * (p.odds - (i === 7 ? 1 : 0))) : 0,
        settledAt: p.settledAt,
        source: "Ticket fictif de démonstration",
      });
    }
    const next = state.picks.at(-2)!;
    saveTicket(state, {
      sourceId: "demo-open",
      pickId: next.id,
      event: next.event,
      eventKey: next.eventKey,
      market: next.market,
      selection: next.selection,
      rules: next.rules,
      odds: next.odds,
      stakeCents: 1000,
      placedAt: iso(0, -0.5),
      source: "Ticket ouvert fictif",
    });
    addLedger(state, {
      kind: "fee",
      amountCents: -2900,
      at: iso(-1),
      description: "Abonnement fictif pour illustrer les frais",
    });
    state.settings = {
      ...state.settings,
      maxBetPercent: 0.01,
      maxEventPercent: 0.02,
      maxExposurePercent: 0.05,
      dailyLossLimitCents: 10000,
      monthlyLossLimitCents: 25000,
    };
    const strategy = saveStrategy(
      state,
      {
        name: "Football simple · exemple figé",
        filter: { sport: "Football", kind: "single" },
        discoveryEnd: iso(-45),
        validationStart: iso(-44),
        notes:
          "Dates et données entièrement fictives. Exemple de règles figées avant la période de validation ; résultats historiques déclarés.",
      },
      true,
    );
    strategy.createdAt = iso(-44.5);
    strategy.frozenAt = iso(-44.5);
    audit(
      state,
      "demo.seed",
      "demo",
      "Données fictives exclusivement dans la démonstration",
    );
    enrichAnalysisDemo(state);
  });
  return readState("demo");
}

/** Internal CLI only. Restore into an empty workspace to preserve existing audit history. */
export async function restoreState(snapshot: AppState): Promise<void> {
  checkWorkspace(snapshot.workspace);
  const parsed = object(snapshot);
  for (const name of entityNames)
    if (!Array.isArray(parsed[name]))
      throw new Error(`Sauvegarde invalide : ${name}.`);
  await transaction(snapshot.workspace, (state) => {
    if (entityNames.some((name) => state[name].length))
      throw new Error(
        "La restauration requiert un espace vide afin de préserver l’historique existant. Utilisez une nouvelle base PostgreSQL.",
      );
    for (const name of entityNames) {
      const ids = new Set<string>();
      for (const raw of snapshot[name]) {
        const item = object(raw),
          id = text(item.id, "Identifiant", true, 200);
        if (ids.has(id))
          throw new Error(
            `Sauvegarde invalide : identifiant dupliqué dans ${name}.`,
          );
        ids.add(id);
      }
    }
    for (const t of snapshot.tipsters) text(t.name, "Nom du tipster", true);
    for (const p of snapshot.picks) {
      validatePick(p);
      requireRef(snapshot.tipsters, p.tipsterId, "Tipster de la sauvegarde");
    }
    for (const t of snapshot.tickets) {
      validateTicket(t);
      if (t.pickId)
        requireRef(snapshot.picks, t.pickId, "Pronostic de la sauvegarde");
      if (t.strategyId)
        requireRef(
          snapshot.strategies,
          t.strategyId,
          "Stratégie de la sauvegarde",
        );
    }
    for (const q of snapshot.quotes) {
      requireRef(snapshot.picks, q.pickId, "Pronostic de la cote");
      date(q.observedAt, "Observation", false);
      date(q.recordedAt, "Enregistrement", false);
      if (q.available) number(q.odds, "Cote", 1.000001, 100000);
    }
    for (const entry of snapshot.ledger) {
      entry.amountCents = integer(
        entry.amountCents,
        "Montant du journal",
        -Number.MAX_SAFE_INTEGER,
      );
      entry.at = date(entry.at, "Date du journal", false);
      if (entry.at > new Date().toISOString())
        throw new Error("La sauvegarde contient un mouvement financier futur.");
      integer(entry.revision, "Révision du journal");
      enumValue(
        entry.kind,
        [
          "initial",
          "deposit",
          "withdrawal",
          "adjustment",
          "poker",
          "fee",
          "promotion",
          "ticket_stake",
          "ticket_return",
          "ticket_fee",
        ],
        "Type du journal",
        "adjustment",
      );
      if (entry.ticketId)
        requireRef(snapshot.tickets, entry.ticketId, "Ticket du journal");
      if (entry.kind.startsWith("ticket_") && !entry.ticketId)
        throw new Error("Une écriture de ticket doit référencer son ticket.");
      if (!entry.kind.startsWith("ticket_") && entry.ticketId)
        throw new Error("Un mouvement libre ne doit pas référencer un ticket.");
    }
    for (const ticket of snapshot.tickets) {
      const entries = snapshot.ledger.filter(
        (entry) => entry.ticketId === ticket.id,
      );
      for (const [kind, payments] of [
        [
          "ticket_stake",
          [
            {
              at: ticket.placedAt,
              amountCents: ticket.funding === "cash" ? -ticket.stakeCents : 0,
            },
          ],
        ],
        [
          "ticket_return",
          ticket.returnPayments ??
            (ticket.returnCents
              ? [{ at: ticket.settledAt!, amountCents: ticket.returnCents }]
              : []),
        ],
        [
          "ticket_fee",
          [{ at: ticket.placedAt, amountCents: -ticket.feeCents }],
        ],
      ] as const) {
        const expected = new Map<string, bigint>(),
          actual = new Map<string, bigint>();
        for (const payment of payments)
          expected.set(
            payment.at,
            (expected.get(payment.at) ?? 0n) + BigInt(payment.amountCents),
          );
        for (const entry of entries.filter((entry) => entry.kind === kind))
          actual.set(
            entry.at,
            (actual.get(entry.at) ?? 0n) + BigInt(entry.amountCents),
          );
        for (const at of new Set([...expected.keys(), ...actual.keys()]))
          if ((expected.get(at) ?? 0n) !== (actual.get(at) ?? 0n))
            throw new Error(
              `Sauvegarde incohérente : ${kind} ne correspond pas au ticket ${ticket.id} à la date ${at}.`,
            );
      }
    }
    for (const batch of snapshot.imports) {
      enumValue(batch.kind, ["picks", "tickets"], "Type du lot", "picks");
      text(batch.hash, "Empreinte du lot", true, 200);
      for (const key of ["created", "updated", "skipped"] as const)
        integer(batch[key], "Nombre de lignes du lot");
      if (!Array.isArray(batch.errors))
        throw new Error("Liste des erreurs du lot invalide.");
      for (const error of batch.errors)
        integer(error.row, "Ligne en erreur", 2);
      if (batch.completedRows !== undefined) {
        if (
          !Array.isArray(batch.completedRows) ||
          new Set(batch.completedRows).size !== batch.completedRows.length
        )
          throw new Error("Lignes terminées du lot invalides.");
        for (const row of batch.completedRows) {
          integer(row, "Ligne terminée", 2);
          if (batch.errors.some((error) => error.row === row))
            throw new Error(
              "Une ligne ne peut être terminée et en erreur dans le même lot.",
            );
        }
      }
      const visited = new Set([batch.id]);
      let retry = batch;
      while (retry.retryOf) {
        if (visited.has(retry.retryOf))
          throw new Error("Cycle invalide dans les reprises d’import.");
        visited.add(retry.retryOf);
        const parent = requireRef(
          snapshot.imports,
          retry.retryOf,
          "Lot initial de la reprise",
        );
        if (parent.kind !== batch.kind || parent.hash !== batch.hash)
          throw new Error(
            "Une reprise doit conserver le type et l’empreinte de son lot initial.",
          );
        retry = parent;
      }
    }
    validateSettings(snapshot.settings);
    if (currentCash(snapshot) < 0)
      throw new Error("Sauvegarde invalide : solde cash négatif.");
    assertCashHistory(snapshot.ledger, snapshot.tickets);
    Object.assign(state, structuredClone(snapshot));
    audit(
      state,
      "backup.restore",
      snapshot.workspace,
      "Restauration de sauvegarde dans un espace vide",
    );
  });
}
