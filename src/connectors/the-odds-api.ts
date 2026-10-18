import { createHash } from "node:crypto";
import type { Pick, PickIdentitySnapshot } from "../domain/types";
import type { OddsCandidate, OddsQuota, OddsSport } from "./types";

const API_ORIGIN = "https://api.the-odds-api.com";
/** Local PRISME safety policy, not a provider refresh/expiry guarantee. */
export const PRISME_QUOTE_MAX_AGE_SECONDS = 15 * 60;
export const RESPONSE_CACHE_TTL_MS = 60_000;
type MarketKey = "h2h" | "spreads" | "totals";

export interface ProviderOutcome {
  name: string;
  price: number;
  point?: number;
}
export interface ProviderMarket {
  key: MarketKey;
  last_update: string;
  outcomes: ProviderOutcome[];
}
export interface ProviderBookmaker {
  key: "winamax_fr";
  title: string;
  markets: ProviderMarket[];
}
export interface ProviderEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: ProviderBookmaker[];
}
export interface ProviderResult<T> {
  data: T;
  collectedAt: string;
  cached: boolean;
  quota: OddsQuota;
  retryAt: null;
}

export class OddsApiError extends Error {
  constructor(
    message: string,
    readonly status: "error" | "rate_limited" = "error",
    readonly quota: OddsQuota | null = null,
    readonly retryAt: string | null = null,
  ) {
    super(message);
    this.name = "OddsApiError";
  }
}

interface ClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  cacheTtlMs?: number;
  maxRetries?: number;
}

function numericHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function quotaFrom(headers: Headers): OddsQuota {
  return {
    remaining: numericHeader(headers, "x-requests-remaining"),
    used: numericHeader(headers, "x-requests-used"),
    last: numericHeader(headers, "x-requests-last"),
  };
}

function retryDate(headers: Headers, now: number): number {
  const value = headers.get("retry-after");
  if (value && /^\d+(?:\.\d+)?$/.test(value))
    return now + Math.max(0, Number(value) * 1000);
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? Math.max(now, date) : now + 2000;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function field(value: unknown): string | null {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 500
    ? value.trim()
    : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function parseSports(body: unknown): OddsSport[] {
  if (!Array.isArray(body))
    throw new OddsApiError(
      "Catalogue sportif fournisseur invalide. Aucune donnée fabriquée.",
    );
  return body.flatMap((value) => {
    const sport = record(value);
    if (
      !sport ||
      !field(sport.key) ||
      !field(sport.title) ||
      !field(sport.group) ||
      typeof sport.active !== "boolean"
    )
      return [];
    return [
      {
        key: String(sport.key),
        title: String(sport.title),
        group: String(sport.group),
        active: sport.active,
      },
    ];
  });
}

function parseEvents(body: unknown): ProviderEvent[] {
  if (!Array.isArray(body) || body.length > 2000)
    throw new OddsApiError(
      "Réponse de cotes invalide. Les observations précédentes restent historiques.",
    );
  const events: ProviderEvent[] = [];
  for (const value of body) {
    const event = record(value);
    if (
      !event ||
      !field(event.id) ||
      !field(event.sport_key) ||
      !field(event.home_team) ||
      !field(event.away_team) ||
      !timestamp(event.commence_time) ||
      !Array.isArray(event.bookmakers)
    ) {
      throw new OddsApiError(
        "Un événement fournisseur ne possède pas une identité et une chronologie valides.",
      );
    }
    const bookmakers: ProviderBookmaker[] = [];
    for (const rawBookmaker of event.bookmakers) {
      const bookmaker = record(rawBookmaker);
      if (
        !bookmaker ||
        bookmaker.key !== "winamax_fr" ||
        !Array.isArray(bookmaker.markets)
      )
        continue;
      const markets: ProviderMarket[] = [];
      for (const rawMarket of bookmaker.markets) {
        const market = record(rawMarket);
        if (
          !market ||
          !["h2h", "spreads", "totals"].includes(String(market.key)) ||
          !Array.isArray(market.outcomes)
        )
          continue;
        // Market timestamp is authoritative. Bookmaker.last_update is deprecated
        // and collection time must never become a substitute for a missing price timestamp.
        const lastUpdate = timestamp(market.last_update);
        if (!lastUpdate) continue;
        const outcomes: ProviderOutcome[] = [];
        for (const rawOutcome of market.outcomes) {
          const outcome = record(rawOutcome);
          if (
            !outcome ||
            !field(outcome.name) ||
            typeof outcome.price !== "number" ||
            !Number.isFinite(outcome.price) ||
            outcome.price <= 1 ||
            outcome.price > 100000
          )
            continue;
          if (
            market.key !== "h2h" &&
            (typeof outcome.point !== "number" ||
              !Number.isFinite(outcome.point))
          )
            continue;
          outcomes.push({
            name: String(outcome.name),
            price: outcome.price,
            ...(market.key === "h2h" ? {} : { point: outcome.point as number }),
          });
        }
        markets.push({
          key: market.key as MarketKey,
          last_update: lastUpdate,
          outcomes,
        });
      }
      bookmakers.push({ key: "winamax_fr", title: "Winamax (FR)", markets });
    }
    events.push({
      id: String(event.id),
      sport_key: String(event.sport_key),
      sport_title: field(event.sport_title) ?? String(event.sport_key),
      commence_time: timestamp(event.commence_time)!,
      home_team: String(event.home_team),
      away_team: String(event.away_team),
      bookmakers,
    });
  }
  return events;
}

/** Server-only transport: fixed HTTPS origin, no secret-bearing errors or logs. */
export function createOddsApiClient(options: ClientOptions) {
  if (!options.apiKey.trim())
    throw new OddsApiError("Clé The Odds API non configurée.");
  const transport = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 8000, 15000));
  const cacheTtlMs = Math.max(
    0,
    Math.min(options.cacheTtlMs ?? RESPONSE_CACHE_TTL_MS, 300000),
  );
  const maxRetries = Math.max(0, Math.min(options.maxRetries ?? 1, 2));
  const cache = new Map<
    string,
    { expiresAt: number; result: ProviderResult<unknown> }
  >();
  const pending = new Map<string, Promise<ProviderResult<unknown>>>();
  let blockedUntil = 0;
  let lastQuota: OddsQuota | null = null;

  async function request<T>(
    path: string,
    parameters: Record<string, string>,
    parser: (body: unknown) => T,
  ): Promise<ProviderResult<T>> {
    const cacheKey = path + "?" + new URLSearchParams(parameters).toString();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now())
      return {
        ...(structuredClone(cached.result) as ProviderResult<T>),
        cached: true,
      };
    const running = pending.get(cacheKey);
    if (running) return structuredClone(await running) as ProviderResult<T>;
    if (path.endsWith("/odds/") && lastQuota?.remaining === 0) {
      throw new OddsApiError(
        "Quota fournisseur épuisé. Aucun nouvel appel de cotes ; heure de réinitialisation inconnue.",
        "rate_limited",
        lastQuota,
        null,
      );
    }
    if (blockedUntil > now())
      throw new OddsApiError(
        "Limite fournisseur atteinte. Réessayez après le délai indiqué ; historique conservé.",
        "rate_limited",
        lastQuota,
        new Date(blockedUntil).toISOString(),
      );

    const operation = (async (): Promise<ProviderResult<T>> => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const url = new URL(path, API_ORIGIN);
          for (const [key, value] of Object.entries(parameters))
            url.searchParams.set(key, value);
          url.searchParams.set("apiKey", options.apiKey);
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(
                new OddsApiError(
                  "Délai fournisseur dépassé. Les cotes historiques ne sont pas rafraîchies.",
                ),
              );
            }, timeoutMs);
          });
          const response = await Promise.race([
            transport(url.toString(), {
              signal: controller.signal,
              cache: "no-store",
              redirect: "error",
              headers: { Accept: "application/json" },
            }),
            timeout,
          ]);
          lastQuota = quotaFrom(response.headers);
          if (response.status === 429) {
            blockedUntil = retryDate(response.headers, now());
            const wait = Math.max(0, blockedUntil - now());
            if (attempt < maxRetries && wait <= 2000) {
              clearTimeout(timer);
              await sleep(wait);
              continue;
            }
            throw new OddsApiError(
              "Limite de requêtes fournisseur atteinte. Respectez le délai indiqué ; aucune cote fraîche ajoutée.",
              "rate_limited",
              lastQuota,
              new Date(blockedUntil).toISOString(),
            );
          }
          if (response.status >= 500 && attempt < maxRetries) {
            clearTimeout(timer);
            await sleep(300 * (attempt + 1));
            continue;
          }
          if (!response.ok) {
            const message =
              response.status === 401 || response.status === 403
                ? "Accès fournisseur refusé : vérifiez la clé, les droits du forfait et le quota."
                : response.status === 422 || response.status === 400
                  ? "Sport ou marché refusé par le fournisseur ; couverture à vérifier."
                  : "Le fournisseur n’a pas répondu correctement. Les relevés historiques restent inchangés.";
            throw new OddsApiError(message, "error", lastQuota);
          }
          const raw = await Promise.race([response.text(), timeout]);
          if (raw.length > 2_000_000)
            throw new OddsApiError(
              "Réponse fournisseur trop volumineuse.",
              "error",
              lastQuota,
            );
          let body: unknown;
          try {
            body = JSON.parse(raw);
          } catch {
            throw new OddsApiError(
              "Réponse fournisseur illisible.",
              "error",
              lastQuota,
            );
          }
          // Defensive masking also covers a malformed upstream body that echoes a key.
          const sanitized = JSON.parse(
            JSON.stringify(body).split(options.apiKey).join("[masqué]"),
          ) as unknown;
          const result: ProviderResult<T> = {
            data: parser(sanitized),
            collectedAt: new Date(now()).toISOString(),
            cached: false,
            quota: lastQuota,
            retryAt: null,
          };
          cache.set(cacheKey, {
            expiresAt: now() + cacheTtlMs,
            result: structuredClone(result),
          });
          return result;
        } catch (error) {
          if (error instanceof OddsApiError)
            throw error.quota
              ? error
              : new OddsApiError(
                  error.message,
                  error.status,
                  lastQuota,
                  error.retryAt,
                );
          if (attempt < maxRetries) {
            await sleep(300 * (attempt + 1));
            continue;
          }
          // Fetch errors can embed the URL, including apiKey. Never forward them.
          throw new OddsApiError(
            "Connexion au fournisseur impossible. La saisie manuelle et l’historique restent disponibles.",
            "error",
            lastQuota,
          );
        } finally {
          clearTimeout(timer);
          controller.abort();
        }
      }
      throw new OddsApiError(
        "Collecte fournisseur interrompue.",
        "error",
        lastQuota,
      );
    })();
    pending.set(cacheKey, operation);
    try {
      return await operation;
    } finally {
      pending.delete(cacheKey);
    }
  }

  return {
    listSports: () => request("/v4/sports/", {}, parseSports),
    getOdds: (sportKey: string) => {
      if (!/^[a-z0-9_]{2,100}$/.test(sportKey))
        throw new OddsApiError("Identifiant de sport fournisseur invalide.");
      return request(
        `/v4/sports/${sportKey}/odds/`,
        {
          regions: "fr",
          bookmakers: "winamax_fr",
          markets: "h2h,spreads,totals",
          oddsFormat: "decimal",
          dateFormat: "iso",
        },
        parseEvents,
      );
    },
  };
}

const normalized = (value: string): string =>
  value.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
const SPORT_PREFIXES: Record<string, string> = {
  football: "soccer_",
  soccer: "soccer_",
  basketball: "basketball_",
  basket: "basketball_",
  tennis: "tennis_",
  baseball: "baseball_",
  "hockey sur glace": "icehockey_",
  "football américain": "americanfootball_",
  rugby: "rugbyunion_",
  cricket: "cricket_",
  mma: "mma_",
};

export function sportsForPick(pick: Pick, sports: OddsSport[]): OddsSport[] {
  const prefix = SPORT_PREFIXES[normalized(pick.sport)];
  return prefix
    ? sports.filter((sport) => sport.active && sport.key.startsWith(prefix))
    : [];
}

export function sportMatchesPick(pick: Pick, sportKey: string): boolean {
  const prefix = SPORT_PREFIXES[normalized(pick.sport)];
  return Boolean(prefix && sportKey.startsWith(prefix));
}

export function pickIdentity(pick: Pick): PickIdentitySnapshot {
  return {
    eventKey: pick.eventKey,
    event: pick.event,
    startsAt: pick.startsAt,
    market: pick.market,
    selection: pick.selection,
    line: pick.line,
    rules: pick.rules,
    kind: pick.kind,
    timing: pick.timing,
  };
}

function marketForPick(pick: Pick): MarketKey | null {
  const mappings: Record<string, MarketKey> = {
    vainqueur: "h2h",
    "vainqueur du match": "h2h",
    "1x2": "h2h",
    h2h: "h2h",
    "total buts": "totals",
    "total points": "totals",
    "total jeux": "totals",
    totals: "totals",
    handicap: "spreads",
    spreads: "spreads",
  };
  return mappings[normalized(pick.market)] ?? null;
}

function sameLine(left: string, right: string): boolean {
  if (!left.trim() || !right.trim()) return left.trim() === right.trim();
  const parsedLeft = Number(left.replace(",", "."));
  const parsedRight = Number(right.replace(",", "."));
  return (
    Number.isFinite(parsedLeft) &&
    Number.isFinite(parsedRight) &&
    parsedLeft === parsedRight
  );
}

function sameSelection(pick: Pick, outcome: string): boolean {
  const selection = normalized(pick.selection);
  if (selection === normalized(outcome)) return true;
  if (["nul", "match nul"].includes(selection) && outcome === "Draw")
    return true;
  const total = selection.match(
    /^(plus de|moins de)\s+([+-]?\d+(?:[.,]\d+)?)$/,
  );
  if (total && sameLine(total[2], pick.line))
    return total[1] === "plus de" ? outcome === "Over" : outcome === "Under";
  return false;
}

export function candidatesForPick(
  pick: Pick,
  result: ProviderResult<ProviderEvent[]>,
): OddsCandidate[] {
  const candidates: OddsCandidate[] = [];
  const marketKey = marketForPick(pick);
  const collectedAt = Date.parse(result.collectedAt);
  for (const event of result.data) {
    if (!sportMatchesPick(pick, event.sport_key)) continue;
    // Only exact dates or same-calendar-day alternatives are shown for human
    // comparison. Time mismatches can never be confirmed into a quote.
    if (event.commence_time.slice(0, 10) !== pick.startsAt.slice(0, 10))
      continue;
    for (const bookmaker of event.bookmakers) {
      for (const market of bookmaker.markets) {
        for (const outcome of market.outcomes) {
          const line = outcome.point === undefined ? "" : String(outcome.point);
          const exact = {
            event:
              normalized(pick.event) ===
              normalized(`${event.home_team} — ${event.away_team}`),
            startsAt:
              Date.parse(event.commence_time) === Date.parse(pick.startsAt),
            market: market.key === marketKey,
            selection: sameSelection(pick, outcome.name),
            line: sameLine(pick.line, line),
          };
          const age = collectedAt - Date.parse(market.last_update);
          const timestampValid =
            age >= 0 && age <= PRISME_QUOTE_MAX_AGE_SECONDS * 1000;
          const totalSelection = normalized(pick.selection).match(
            /^(?:plus de|moins de)\s+([+-]?\d+(?:[.,]\d+)?)$/,
          );
          const selectionLineConflict = Boolean(
            totalSelection && !sameLine(totalSelection[1], pick.line),
          );
          const warnings = [
            "Les règles de règlement ne sont pas fournies par cette réponse API : vérifiez-les sur Winamax avant confirmation.",
          ];
          if (!exact.event)
            warnings.push(
              "Noms d’événement différents : aucune correspondance automatique.",
            );
          if (!exact.selection)
            warnings.push(
              "Libellé de sélection différent : vérifier explicitement son identité.",
            );
          if (!exact.startsAt)
            warnings.push(
              "Horaire différent : corrigez le pronostic avant toute association.",
            );
          if (!exact.market)
            warnings.push(
              "Marché différent ou non reconnu : association refusée.",
            );
          if (!exact.line)
            warnings.push("Ligne ou handicap différent : association refusée.");
          if (selectionLineConflict)
            warnings.push(
              "Le seuil écrit dans la sélection contredit la ligne du pronostic : corrigez ces champs avant association.",
            );
          if (!timestampValid)
            warnings.push(
              age < 0
                ? "Horodatage fournisseur futur : observation refusée."
                : "Cote fournisseur trop ancienne : aucune fraîcheur inventée.",
            );
          const canConfirm =
            exact.startsAt &&
            exact.market &&
            exact.line &&
            !selectionLineConflict &&
            timestampValid &&
            Boolean(pick.rules.trim()) &&
            pick.kind === "single" &&
            pick.timing === "prematch" &&
            Date.parse(event.commence_time) > collectedAt;
          const identifier = JSON.stringify([
            event.sport_key,
            event.id,
            market.key,
            outcome.name,
            line,
          ]);
          candidates.push({
            id: createHash("sha256").update(identifier).digest("hex"),
            sportKey: event.sport_key,
            eventId: event.id,
            event: `${event.home_team} — ${event.away_team}`,
            homeTeam: event.home_team,
            awayTeam: event.away_team,
            startsAt: event.commence_time,
            bookmaker: "winamax_fr",
            marketKey: market.key,
            outcomeName: outcome.name,
            line,
            odds: outcome.price,
            providerUpdatedAt: market.last_update,
            collectedAt: result.collectedAt,
            rules: "Non fournies par la réponse fournisseur",
            requestedRules: pick.rules,
            canConfirm,
            exact,
            warnings,
          });
        }
      }
    }
  }
  // Transparent lexicographic matching order, not a confidence/profitability score.
  // The exact requested event/market remains visible even in a large daily slate.
  candidates.sort((left, right) => {
    for (const field of [
      "event",
      "startsAt",
      "market",
      "line",
      "selection",
    ] as const) {
      const difference = Number(right.exact[field]) - Number(left.exact[field]);
      if (difference) return difference;
    }
    return left.id.localeCompare(right.id);
  });
  if (candidates.length > 200)
    for (const candidate of candidates.slice(0, 200))
      candidate.warnings.push(
        "Autres propositions tronquées ; correspondances exactes affichées en premier.",
      );
  return candidates.slice(0, 200);
}
