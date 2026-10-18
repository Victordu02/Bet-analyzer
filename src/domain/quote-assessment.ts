import type { AppState, Pick, Quote } from "./types";

export interface QuoteAssessment {
  quote: Quote | null;
  history: Quote[];
  firstQuote: Quote | null;
  fresh: boolean;
  ageMinutes: number | null;
  providerAgeMinutes: number | null;
  matching: { status: "confirmed" | "ambiguous" | "missing"; issues: string[] };
  errors: string[];
}

const time = (value: string | null | undefined): number =>
  value ? Date.parse(value) : Number.NaN;
const sameText = (left: string, right: string): boolean =>
  left.normalize("NFKC").trim() === right.normalize("NFKC").trim();

function matchingIssuesFor(pick: Pick, quote: Quote): string[] {
  const issues: string[] = [];
  if (quote.mappingStatus === "ambiguous")
    issues.push("Correspondance ambiguë : validation humaine nécessaire.");
  if (!quote.matchConfirmed || quote.mappingStatus === "unconfirmed")
    issues.push(
      "Correspondance exacte de l’événement, du marché, de la ligne et des règles non confirmée.",
    );
  if (quote.identitySnapshot) {
    const fields = [
      "eventKey",
      "event",
      "market",
      "selection",
      "line",
      "rules",
      "kind",
      "timing",
    ] as const;
    for (const field of fields) {
      if (!sameText(quote.identitySnapshot[field], pick[field]))
        issues.push(`Le champ « ${field} » du relevé diffère du pronostic.`);
    }
    if (
      !Number.isFinite(time(quote.identitySnapshot.startsAt)) ||
      time(quote.identitySnapshot.startsAt) !== time(pick.startsAt)
    )
      issues.push("L’horaire de l’événement du relevé diffère du pronostic.");
  } else if (quote.collectionMode === "provider") {
    issues.push(
      "Identité du marché fournisseur non conservée : correspondance non vérifiable.",
    );
  }
  return issues;
}

/** A cached collection never changes the time when a bookmaker price was actually observed. */
export function assessQuote(
  pick: Pick,
  quotes: Quote[],
  maxAgeMinutes: number,
  now: Date = new Date(),
): QuoteAssessment {
  const nowTime = now.getTime();
  const history = quotes
    .filter((quote) => quote.pickId === pick.id)
    .sort(
      (left, right) =>
        (time(left.observedAt) || 0) - (time(right.observedAt) || 0) ||
        (time(left.recordedAt) || 0) - (time(right.recordedAt) || 0) ||
        right.id.localeCompare(left.id),
    );
  const known = history.filter(
    (quote) =>
      !quote.closing &&
      Number.isFinite(time(quote.observedAt)) &&
      Number.isFinite(time(quote.recordedAt)) &&
      time(quote.observedAt) >= time(pick.publishedAt) &&
      time(quote.observedAt) <= time(quote.recordedAt) &&
      time(quote.recordedAt) <= nowTime,
  );
  const quote = known.at(-1) ?? null;
  const firstQuote =
    known.find(
      (item) =>
        item.odds != null &&
        Number.isFinite(item.odds) &&
        item.odds > 1 &&
        item.available &&
        item.source.trim() &&
        matchingIssuesFor(pick, item).length === 0,
    ) ?? null;
  const errors: string[] = [];
  if (!quote) {
    return {
      quote: null,
      history,
      firstQuote,
      fresh: false,
      ageMinutes: null,
      providerAgeMinutes: null,
      matching: {
        status: "missing",
        issues: [
          "Aucun relevé hors clôture connu après publication à cette date.",
        ],
      },
      errors: ["Aucune cote avec chronologie exploitable."],
    };
  }
  const matchingIssues = matchingIssuesFor(pick, quote);
  if (!quote.source.trim())
    errors.push("La provenance du relevé doit être renseignée.");

  const ageMinutes = (nowTime - time(quote.observedAt)) / 60_000;
  let maximumAgeMs = maxAgeMinutes * 60_000;
  if (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes <= 0)
    errors.push("Validité maximale des cotes invalide.");
  let providerAgeMinutes: number | null = null;
  if (quote.collectionMode === "provider") {
    const providerTime = time(quote.providerLastUpdatedAt);
    if (!Number.isFinite(providerTime) || providerTime > time(quote.observedAt))
      errors.push("Horodatage du fournisseur absent ou postérieur au relevé.");
    else providerAgeMinutes = (nowTime - providerTime) / 60_000;
    if (
      quote.providerTtlSeconds == null ||
      !Number.isFinite(quote.providerTtlSeconds) ||
      quote.providerTtlSeconds <= 0
    )
      errors.push("Politique de validité PRISME du relevé fournisseur absente ou invalide.");
    else maximumAgeMs = Math.min(maximumAgeMs, quote.providerTtlSeconds * 1000);
  }
  const oldestAgeMs = Math.max(
    ageMinutes * 60_000,
    (providerAgeMinutes ?? ageMinutes) * 60_000,
  );
  const fresh =
    errors.length === 0 && oldestAgeMs >= 0 && oldestAgeMs <= maximumAgeMs;
  return {
    quote,
    history,
    firstQuote,
    fresh,
    ageMinutes,
    providerAgeMinutes,
    matching: {
      status: matchingIssues.length
        ? quote.mappingStatus === "ambiguous" ||
          matchingIssues.some((issue) => issue.includes("diffère"))
          ? "ambiguous"
          : "missing"
        : "confirmed",
      issues: matchingIssues,
    },
    errors,
  };
}

/** Preserve source keys; require reconciliation rather than treating one provider event as independent risk. */
export function conflictingOpenEventAliases(
  pick: Pick,
  state: AppState,
  now: Date = new Date(),
): string[] {
  const knownMappings = state.quotes.filter(
    (quote) =>
      quote.provider &&
      quote.matchConfirmed &&
      quote.mappingStatus === "confirmed" &&
      quote.identitySnapshot &&
      Number.isFinite(time(quote.recordedAt)) &&
      time(quote.recordedAt) <= now.getTime() &&
      time(quote.observedAt) <= time(quote.recordedAt),
  );
  const providerIdentity = (quote: Quote): string =>
    JSON.stringify([
      quote.provider!.id,
      quote.provider!.sportKey,
      quote.provider!.eventId,
    ]);
  const providerEvents = new Set(
    knownMappings
      .filter(
        (quote) =>
          quote.pickId === pick.id &&
          matchingIssuesFor(pick, quote).length === 0,
      )
      .map(providerIdentity),
  );
  if (!providerEvents.size) return [];
  const comparableKey = (value: string): string =>
    value.normalize("NFKC").trim().toLocaleLowerCase("fr-FR");
  const aliases = new Set(
    knownMappings
      .filter((quote) => providerEvents.has(providerIdentity(quote)))
      .map((quote) => comparableKey(quote.identitySnapshot!.eventKey)),
  );
  const currentKey = comparableKey(pick.eventKey);
  return state.tickets
    .filter(
      (ticket) =>
        (ticket.result === "open" || ticket.partialCashout) &&
        comparableKey(ticket.eventKey) !== currentKey &&
        (aliases.has(comparableKey(ticket.eventKey)) ||
          knownMappings.some(
            (quote) =>
              quote.pickId === ticket.pickId &&
              providerEvents.has(providerIdentity(quote)),
          )),
    )
    .map((ticket) => ticket.id);
}
