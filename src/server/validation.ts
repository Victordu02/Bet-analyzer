import Decimal from "decimal.js";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import type { Pick, Result, Settings, Ticket } from "../domain/types";
import { randomUUID } from "node:crypto";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Objet de données attendu.");
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  label: string,
  required = false,
  max = 20000,
): string {
  const output = value == null ? "" : String(value).trim();
  if (required && !output) throw new Error(`${label} est obligatoire.`);
  if (output.length > max)
    throw new Error(`${label} dépasse ${max} caractères.`);
  return output;
}
function decimal(value: unknown, label: string): Decimal {
  if (value === "" || value == null || typeof value === "boolean")
    throw new Error(`${label} doit être un nombre.`);
  if (typeof value !== "string" && typeof value !== "number")
    throw new Error(`${label} doit être un nombre.`);
  let parsed: Decimal;
  try {
    parsed = new Decimal(
      String(value)
        .replace(/[\s\u00a0\u202f€]/g, "")
        .replace(",", "."),
    );
  } catch {
    throw new Error(`${label} doit être un nombre valide.`);
  }
  if (!parsed.isFinite()) throw new Error(`${label} doit être un nombre fini.`);
  return parsed;
}

export function number(
  value: unknown,
  label: string,
  minimum = -Number.MAX_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = decimal(value, label);
  if (parsed.lessThan(minimum) || parsed.greaterThan(maximum))
    throw new Error(
      `${label} doit être compris entre ${minimum} et ${maximum}.`,
    );
  return parsed.toNumber();
}

export function integer(value: unknown, label: string, minimum = 0): number {
  const parsed = decimal(value, label);
  // Check the original decimal before conversion: Number("1.0000000000000001")
  // would otherwise hide a fractional cent, and large values can round upward.
  if (!parsed.isInteger())
    throw new Error(`${label} doit être un entier en centimes.`);
  if (parsed.lessThan(minimum) || parsed.greaterThan(Number.MAX_SAFE_INTEGER))
    throw new Error(
      `${label} doit être compris entre ${minimum} et ${Number.MAX_SAFE_INTEGER}.`,
    );
  return parsed.toNumber();
}

export function cents(value: unknown, label: string): number {
  const euros = decimal(value, label);
  if (euros.decimalPlaces() > 2)
    throw new Error(`${label} ne doit pas dépasser deux décimales.`);
  if (euros.lessThan(0) || euros.greaterThan("90071992547409.91"))
    throw new Error(
      `${label} doit représenter un montant positif ou nul en centimes entiers sûrs.`,
    );
  // Decimal's multiplication uses a configurable precision. Scaling the exact
  // representation avoids any rounding before the safe integer boundary check.
  const centimes = new Decimal(euros.toFixed(2).replace(".", ""));
  return integer(centimes.toString(), label);
}
export function boolean(value: unknown, fallback = false): boolean {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (["true", "1", "oui", "yes"].includes(String(value).toLowerCase()))
    return true;
  if (["false", "0", "non", "no"].includes(String(value).toLowerCase()))
    return false;
  throw new Error("Valeur booléenne attendue (oui/non).");
}
export function date(value: unknown, label: string, nullable: false): string;
export function date(
  value: unknown,
  label: string,
  nullable: true,
): string | null;
export function date(
  value: unknown,
  label: string,
  nullable = false,
): string | null {
  const raw = text(value, label, !nullable);
  if (!raw && nullable) return null;
  const french = raw.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  const local = french
    ? `${french[3]}-${french[2]}-${french[1]}T${french[4] ?? "00"}:${french[5] ?? "00"}:${french[6] ?? "00"}`
    : raw;
  const parts = local.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-](\d{2}):?(\d{2}))?)?$/i,
  );
  if (!parts)
    throw new Error(`${label} : date ISO ou JJ/MM/AAAA HH:mm attendue.`);
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysPerMonth[month - 1] ||
    Number(parts[4] ?? 0) > 23 ||
    Number(parts[5] ?? 0) > 59 ||
    Number(parts[6] ?? 0) > 59 ||
    Number(parts[9] ?? 0) > 23 ||
    Number(parts[10] ?? 0) > 59
  ) {
    throw new Error(`${label} : date ou heure invalide.`);
  }
  if (parts[7] && /[1-9]/.test(parts[7].slice(3))) {
    throw new Error(
      `${label} : la précision maximale prise en charge est la milliseconde.`,
    );
  }
  const hasOffset = Boolean(parts[8]);
  const parsed = hasOffset
    ? new Date(local)
    : fromZonedTime(local, "Europe/Paris");
  if (!Number.isFinite(parsed.getTime()))
    throw new Error(`${label} : date invalide.`);
  if (!hasOffset) {
    const expected = `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4] ?? "00"}:${parts[5] ?? "00"}:${parts[6] ?? "00"}`;
    const parisWallTime = (instant: number) =>
      formatInTimeZone(
        new Date(instant),
        "Europe/Paris",
        "yyyy-MM-dd'T'HH:mm:ss",
      );
    const instant = parsed.getTime();
    if (parisWallTime(instant) !== expected)
      throw new Error(`${label} : date inexistante dans Europe/Paris.`);
    // Test the offsets on each side of a clock change. If another UTC instant
    // produces the same local clock time, choosing one would invent chronology.
    const offsetAt = (time: number) =>
      Date.parse(`${parisWallTime(time)}Z`) - Math.floor(time / 1000) * 1000;
    const currentOffset = offsetAt(instant);
    for (const adjacentDay of [instant - 86400000, instant + 86400000]) {
      const alternative = instant + currentOffset - offsetAt(adjacentDay);
      if (alternative !== instant && parisWallTime(alternative) === expected) {
        throw new Error(
          `${label} : heure ambiguë dans Europe/Paris ; fournissez une date ISO avec un décalage explicite (+02:00 ou +01:00).`,
        );
      }
    }
  }
  return parsed.toISOString();
}
const results: Record<string, Result> = {
  open: "open",
  ouvert: "open",
  won: "won",
  gagne: "won",
  gagné: "won",
  lost: "lost",
  perdu: "lost",
  void: "void",
  annule: "void",
  annulé: "void",
  half_won: "half_won",
  "demi-gagné": "half_won",
  half_lost: "half_lost",
  "demi-perdu": "half_lost",
  cashout: "cashout",
};
export function result(value: unknown): Result {
  const parsed = results[String(value || "open").toLowerCase()];
  if (!parsed) throw new Error("Résultat inconnu.");
  return parsed;
}
export function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
  fallback: T,
): T {
  const parsed = value == null || value === "" ? fallback : String(value);
  if (!allowed.includes(parsed as T))
    throw new Error(`${label} : valeur inconnue.`);
  return parsed as T;
}
export function eventKey(event: string, startsAt: string): string {
  return `${event
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}:${startsAt.slice(0, 10)}`;
}

export function validatePick(p: Pick): Pick {
  text(p.tipsterId, "Tipster", true);
  text(p.event, "Événement", true);
  text(p.market, "Marché", true);
  text(p.selection, "Sélection", true);
  p.odds = number(p.odds, "Cote", 1.000001, 100000);
  p.stakeUnits = number(p.stakeUnits, "Mise en unités", 0, 100000);
  if (p.minOdds !== null)
    p.minOdds = number(p.minOdds, "Cote minimum", 1.000001, 100000);
  p.publishedAt = date(p.publishedAt, "Publication", false);
  p.startsAt = date(p.startsAt, "Début", false);
  p.settledAt = date(p.settledAt, "Règlement", true);
  p.result = result(p.result);
  p.kind = enumValue(p.kind, ["single", "accumulator"], "Type", "single");
  p.timing = enumValue(p.timing, ["prematch", "live"], "Moment", "prematch");
  if (p.timing === "prematch" && p.publishedAt > p.startsAt)
    throw new Error("Un pari avant-match doit être publié avant son début.");
  if (p.result !== "open" && !p.settlementSource)
    throw new Error(
      "La source de règlement est obligatoire pour un résultat clôturé.",
    );
  if (p.result !== "open" && !p.settledAt)
    throw new Error(
      "La date de règlement est obligatoire pour un résultat clôturé.",
    );
  if (p.settledAt && p.settledAt < p.publishedAt)
    throw new Error("Le règlement ne peut précéder la publication.");
  if (p.result === "open" && p.settledAt)
    throw new Error("Un pronostic ouvert ne possède pas de date de règlement.");
  if (p.settledAt && p.settledAt > new Date().toISOString())
    throw new Error("Le règlement ne peut être futur.");
  if (p.settledAt && p.settledAt < p.startsAt && p.result !== "cashout")
    throw new Error(
      "Le règlement ne peut précéder le début de l’événement (hors cashout documenté).",
    );
  return p;
}
export function validateTicket(t: Ticket): Ticket {
  text(t.event, "Événement", true);
  text(t.market, "Marché", true);
  text(t.selection, "Sélection", true);
  text(t.source, "Source du ticket réel", true);
  t.odds = number(t.odds, "Cote", 1.000001, 100000);
  t.stakeCents = integer(t.stakeCents, "Mise", 1);
  t.returnCents = integer(t.returnCents, "Retour");
  t.feeCents = integer(t.feeCents, "Frais");
  t.placedAt = date(t.placedAt, "Prise du ticket", false);
  t.settledAt = date(t.settledAt, "Règlement", true);
  t.result = result(t.result);
  t.kind = enumValue(t.kind, ["single", "accumulator"], "Type", "single");
  t.funding = enumValue(t.funding, ["cash", "freebet"], "Financement", "cash");
  if (t.placedAt > new Date().toISOString())
    throw new Error("Un ticket réel ne peut être pris dans le futur.");
  if (t.result === "open" && (t.returnCents !== 0 || t.settledAt !== null))
    throw new Error(
      "Un ticket ouvert ne possède ni retour ni date de règlement.",
    );
  if (t.result !== "open" && !t.settledAt)
    throw new Error("La date de règlement est obligatoire.");
  if (
    t.settledAt &&
    (t.settledAt < t.placedAt || t.settledAt > new Date().toISOString())
  )
    throw new Error("La date de règlement est incohérente.");
  if (t.returnPayments !== undefined) {
    if (!Array.isArray(t.returnPayments))
      throw new Error("La liste des encaissements du ticket est invalide.");
    if (t.result === "open" && t.returnPayments.length)
      throw new Error(
        "Un ticket ouvert sans cashout ne possède aucun encaissement.",
      );
    const paymentIds = new Set<string>();
    let totalCents = 0n;
    const now = new Date().toISOString();
    t.returnPayments = t.returnPayments.map((payment) => {
      if (!payment || typeof payment !== "object")
        throw new Error("Encaissement de ticket invalide.");
      const id = text(payment.id, "Identifiant d’encaissement", true, 200);
      if (paymentIds.has(id))
        throw new Error("Identifiant d’encaissement répété.");
      paymentIds.add(id);
      const amountCents = integer(payment.amountCents, "Encaissement");
      const at = date(payment.at, "Date d’encaissement", false);
      if (at < t.placedAt || at > now || !t.settledAt || at > t.settledAt)
        throw new Error(
          "La date d’encaissement doit être comprise entre la prise du ticket et son dernier règlement.",
        );
      let remainingStakeCents = payment.remainingStakeCents;
      if (remainingStakeCents !== undefined && remainingStakeCents !== null) {
        remainingStakeCents = integer(
          remainingStakeCents,
          "Coût restant à l’encaissement",
        );
        if (remainingStakeCents > t.stakeCents)
          throw new Error(
            "Le coût restant à l’encaissement dépasse la mise initiale.",
          );
        if (t.funding === "freebet" && remainingStakeCents !== 0)
          throw new Error("Une freebet ne possède pas de coût cash restant.");
      }
      totalCents += BigInt(amountCents);
      return {
        id,
        at,
        amountCents,
        ...(remainingStakeCents !== undefined ? { remainingStakeCents } : {}),
        ...(payment.historicalAggregate !== undefined
          ? { historicalAggregate: boolean(payment.historicalAggregate) }
          : {}),
      };
    });
    if (totalCents !== BigInt(t.returnCents))
      throw new Error(
        "Le total des encaissements ne correspond pas au retour réel cumulé.",
      );
  }
  if (t.result === "lost" && t.returnCents !== 0)
    throw new Error("Un ticket perdu doit avoir un retour nul.");
  if (["won", "half_won"].includes(t.result) && t.returnCents === 0)
    throw new Error("Un ticket gagnant doit préciser son retour réel.");
  if (
    t.result === "void" &&
    t.funding === "cash" &&
    t.returnCents !== t.stakeCents
  ) {
    throw new Error(
      "Un ticket cash annulé doit restituer la mise entière ; les frais sont saisis séparément.",
    );
  }
  if (t.result === "void" && t.funding === "freebet" && t.returnCents !== 0) {
    throw new Error(
      "Une freebet annulée ne crée pas de retour cash ; un éventuel crédit promotionnel se comptabilise séparément.",
    );
  }
  if (
    t.result === "half_lost" &&
    t.funding === "cash" &&
    t.returnCents > t.stakeCents
  ) {
    throw new Error(
      "Le retour d’un ticket cash demi-perdu ne peut dépasser sa mise.",
    );
  }
  t.partialCashout = boolean(t.partialCashout);
  if (t.partialCashout && t.result !== "cashout")
    throw new Error("Le cashout partiel requiert le résultat cashout.");
  if (t.remainingStakeCents !== null) {
    t.remainingStakeCents = integer(t.remainingStakeCents, "Mise restante");
    if (t.remainingStakeCents > t.stakeCents)
      throw new Error("La mise restante dépasse la mise initiale.");
  }
  if (
    !t.partialCashout &&
    t.remainingStakeCents !== null &&
    t.remainingStakeCents !== 0
  ) {
    throw new Error(
      "Une mise restante positive exige un cashout partiel documenté.",
    );
  }
  if (t.result === "open" && t.remainingStakeCents !== null) {
    throw new Error(
      "Un ticket ouvert sans cashout conserve sa mise initiale : laissez la mise restante vide.",
    );
  }
  if (t.partialCashout && t.remainingStakeCents === 0)
    throw new Error(
      "Un cashout partiel doit conserver une mise ouverte positive ou inconnue.",
    );
  return t;
}
export function validateSettings(s: Settings): Settings {
  s.currency = "EUR";
  s.timezone = "Europe/Paris";
  s.fixedStakeCents = integer(s.fixedStakeCents, "Mise fixe");
  s.stakePercent = number(s.stakePercent, "Fraction de mise", 0, 1);
  s.kellyFraction = number(s.kellyFraction, "Fraction Kelly", 0, 1);
  for (const key of [
    "maxBetPercent",
    "maxEventPercent",
    "maxExposurePercent",
  ] as const)
    if (s[key] !== null) s[key] = number(s[key], key, 0, 1);
  for (const key of [
    "dailyLossLimitCents",
    "monthlyLossLimitCents",
    "reconciliationBalanceCents",
  ] as const)
    if (s[key] !== null) s[key] = integer(s[key], key);
  s.quoteMaxAgeMinutes = integer(s.quoteMaxAgeMinutes, "Validité des cotes", 1);
  if (s.quoteMaxAgeMinutes > 1440)
    throw new Error("Validité des cotes limitée à 24 heures.");
  s.paused = boolean(s.paused);
  s.reconciledAt = date(s.reconciledAt, "Rapprochement", true);
  s.reportFrequency = enumValue(
    s.reportFrequency,
    ["daily", "weekly", "monthly"],
    "Fréquence",
    "weekly",
  );
  if ((s.reconciliationBalanceCents === null) !== (s.reconciledAt === null)) {
    throw new Error(
      "Le rapprochement exige à la fois un solde et sa date, ou aucun des deux.",
    );
  }
  if (s.reconciledAt && s.reconciledAt > new Date().toISOString()) {
    throw new Error("La date de rapprochement ne peut être future.");
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.reportHour))
    throw new Error("Heure du rapport invalide.");
  return s;
}

export function buildPick(
  data: Record<string, unknown>,
  previous?: Pick,
  imported = false,
): Pick {
  const now = new Date().toISOString();
  const p: Pick = {
    id: previous?.id ?? randomUUID(),
    tipsterId: "",
    sourceId: "",
    sourceUrl: "",
    publishedAt: "",
    observedAt: now,
    startsAt: "",
    event: "",
    eventKey: "",
    sport: "Football",
    competition: "",
    market: "",
    selection: "",
    line: "",
    rules: "",
    odds: 0,
    minOdds: null,
    stakeUnits: 1,
    result: "open",
    settlementSource: "",
    settledAt: null,
    kind: "single",
    timing: "prematch",
    evidence: "declared",
    initialContent: "",
    argument: "",
    notes: "",
    revisions: [],
    manuallyCorrected: false,
    ...previous,
  };
  const strings = [
    "tipsterId",
    "sourceId",
    "sourceUrl",
    "publishedAt",
    "startsAt",
    "event",
    "eventKey",
    "sport",
    "competition",
    "market",
    "selection",
    "line",
    "rules",
    "settlementSource",
    "argument",
    "notes",
  ] as const;
  for (const key of strings)
    if (data[key] !== undefined) p[key] = text(data[key], key);
  for (const key of ["odds", "stakeUnits"] as const)
    if (data[key] !== undefined) p[key] = number(data[key], key);
  if (data.minOdds !== undefined)
    p.minOdds =
      data.minOdds === null || data.minOdds === ""
        ? null
        : number(data.minOdds, "Cote minimum");
  if (data.settledAt !== undefined)
    p.settledAt = date(data.settledAt, "Règlement", true);
  if (data.result !== undefined) p.result = result(data.result);
  if (data.kind !== undefined)
    p.kind = enumValue(data.kind, ["single", "accumulator"], "Type", "single");
  if (data.timing !== undefined)
    p.timing = enumValue(
      data.timing,
      ["prematch", "live"],
      "Moment",
      "prematch",
    );
  validatePick(p);
  if (!p.eventKey) p.eventKey = eventKey(p.event, p.startsAt);
  const observed =
    !imported &&
    p.timing === "prematch" &&
    p.publishedAt <= now &&
    p.startsAt > now &&
    p.result === "open";
  if (!previous) {
    p.evidence = observed ? "observed" : "declared";
    p.initialContent = JSON.stringify({
      ...p,
      revisions: undefined,
      initialContent: undefined,
    });
  } else if (
    [
      "tipsterId",
      "event",
      "eventKey",
      "sport",
      "competition",
      "startsAt",
      "publishedAt",
      "market",
      "selection",
      "line",
      "rules",
      "odds",
      "minOdds",
      "stakeUnits",
      "kind",
      "timing",
    ].some(
      (key) =>
        JSON.stringify(p[key as keyof Pick]) !==
        JSON.stringify(previous[key as keyof Pick]),
    )
  )
    p.evidence = "declared";
  if (imported) p.evidence = "declared";
  return p;
}

export function buildTicket(
  data: Record<string, unknown>,
  previous?: Ticket,
): Ticket {
  const t: Ticket = {
    id: previous?.id ?? randomUUID(),
    sourceId: "",
    pickId: null,
    bookmaker: "Winamax FR",
    event: "",
    eventKey: "",
    selection: "",
    market: "",
    line: "",
    rules: "",
    kind: "single",
    odds: 0,
    stakeCents: 0,
    funding: "cash",
    placedAt: "",
    settledAt: null,
    result: "open",
    returnCents: 0,
    feeCents: 0,
    remainingStakeCents: null,
    partialCashout: false,
    strategyId: null,
    source: "",
    notes: "",
    manuallyCorrected: false,
    revisions: [],
    ...previous,
  };
  for (const key of [
    "sourceId",
    "bookmaker",
    "event",
    "eventKey",
    "selection",
    "market",
    "line",
    "rules",
    "placedAt",
    "source",
    "notes",
  ] as const)
    if (data[key] !== undefined) t[key] = text(data[key], key);
  for (const key of ["pickId", "strategyId"] as const)
    if (data[key] !== undefined) t[key] = text(data[key], key) || null;
  if (data.odds !== undefined) t.odds = number(data.odds, "Cote");
  for (const key of ["stakeCents", "returnCents", "feeCents"] as const)
    if (data[key] !== undefined) t[key] = integer(data[key], key);
  if (data.remainingStakeCents !== undefined)
    t.remainingStakeCents =
      data.remainingStakeCents === null || data.remainingStakeCents === ""
        ? null
        : integer(data.remainingStakeCents, "Mise restante");
  if (data.settledAt !== undefined)
    t.settledAt = date(data.settledAt, "Règlement", true);
  if (data.partialCashout !== undefined)
    t.partialCashout = boolean(data.partialCashout);
  if (data.result !== undefined) t.result = result(data.result);
  if (data.kind !== undefined)
    t.kind = enumValue(data.kind, ["single", "accumulator"], "Type", "single");
  if (data.funding !== undefined)
    t.funding = enumValue(
      data.funding,
      ["cash", "freebet"],
      "Financement",
      "cash",
    );
  const settlementChanged = previous
    ? t.result !== previous.result ||
      t.partialCashout !== previous.partialCashout
    : t.result !== "open";
  if (settlementChanged && data.returnCents === undefined) {
    throw new Error(
      "Saisissez explicitement le retour réel cumulé, y compris zéro, lors du règlement ou d’un changement de résultat.",
    );
  }
  validateTicket(t);
  if (!t.eventKey) t.eventKey = eventKey(t.event, t.placedAt);
  return t;
}
