import { isDeepStrictEqual } from "node:util";
import type {
  AppState,
  Pick,
  PickIdentitySnapshot,
  Quote,
} from "../domain/types";
import type { OddsSyncInput, OddsSyncResult } from "./types";
import {
  candidatesForPick,
  createOddsApiClient,
  OddsApiError,
  pickIdentity,
  PRISME_QUOTE_MAX_AGE_SECONDS,
  sportsForPick,
  sportMatchesPick,
} from "./the-odds-api";

type OddsClient = ReturnType<typeof createOddsApiClient>;
export interface OddsSyncPreparation {
  result: OddsSyncResult;
  identitySnapshot: PickIdentitySnapshot;
  quote: Omit<Quote, "id"> | null;
}

let sharedClient: { key: string; client: OddsClient } | null = null;
function configuredClient(): OddsClient | null {
  const key = process.env.ODDS_API_KEY?.trim();
  if (!key) return null;
  if (!sharedClient || sharedClient.key !== key)
    sharedClient = { key, client: createOddsApiClient({ apiKey: key }) };
  return sharedClient.client;
}

function previousMapping(state: AppState, pick: Pick): Quote | undefined {
  return state.quotes
    .filter(
      (quote) =>
        quote.pickId === pick.id &&
        quote.provider?.id === "the-odds-api" &&
        quote.mappingStatus === "confirmed" &&
        isDeepStrictEqual(quote.identitySnapshot, pickIdentity(pick)),
    )
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0];
}

/** No database writes here. The caller rechecks identity inside its transaction. */
export async function prepareOddsSync(
  state: AppState,
  input: OddsSyncInput,
  options: { client?: OddsClient | null; now?: () => number } = {},
): Promise<OddsSyncPreparation> {
  const pick = state.picks.find((item) => item.id === input.pickId);
  if (!pick) throw new Error("Pronostic introuvable dans cet espace.");
  const snapshot = pickIdentity(pick);
  const previous = previousMapping(state, pick);
  const result: OddsSyncResult = {
    status: "ready",
    message: "",
    pickId: pick.id,
    sportKey: input.sportKey || previous?.provider?.sportKey || null,
    collectedAt: null,
    cached: false,
    quota: null,
    retryAt: null,
    sports: [],
    candidates: [],
    quoteId: null,
  };
  const complete = (
    status: OddsSyncResult["status"],
    message: string,
    quote: Omit<Quote, "id"> | null = null,
  ): OddsSyncPreparation => {
    result.status = status;
    result.message = message;
    return { result, identitySnapshot: snapshot, quote };
  };
  if (state.workspace === "demo")
    return complete(
      "demo",
      "Démonstration fictive : aucun appel réseau. Les observations synthétiques restent séparées de vos données.",
    );
  const client =
    options.client === undefined ? configuredClient() : options.client;
  if (!client)
    return complete(
      "unconfigured",
      "The Odds API non configuré. Ajoutez ODDS_API_KEY côté serveur ; la saisie manuelle reste disponible.",
    );
  const now = options.now ?? Date.now;
  if (pick.result !== "open" || Date.parse(pick.startsAt) <= now())
    return complete(
      "unavailable",
      "Événement commencé ou pronostic réglé : aucune collecte pré-match. L’historique est conservé.",
    );
  if (pick.kind !== "single" || pick.timing !== "prematch")
    return complete(
      "unavailable",
      "Ce connecteur compare uniquement les simples avant-match. Conservez un relevé manuel pour les autres cas.",
    );

  try {
    const catalog = await client.listSports();
    result.sports = sportsForPick(pick, catalog.data);
    result.quota = catalog.quota;
    result.collectedAt = catalog.collectedAt;
    result.cached = catalog.cached;
    if (!result.sportKey) {
      return complete(
        result.sports.length ? "needs_sport" : "unavailable",
        result.sports.length
          ? "Choisissez explicitement la compétition du catalogue fournisseur ; sa présence ne garantit pas la couverture Winamax FR."
          : "Aucun sport actif correspondant à cette discipline dans le catalogue. Aucun rapprochement approximatif effectué.",
      );
    }
    if (
      !sportMatchesPick(pick, result.sportKey) ||
      !result.sports.some((sport) => sport.key === result.sportKey)
    ) {
      return complete(
        "unavailable",
        "Compétition absente du catalogue actif ou discipline différente. Aucune cote associée automatiquement.",
      );
    }

    const response = await client.getOdds(result.sportKey);
    result.quota = response.quota;
    result.collectedAt = response.collectedAt;
    result.cached = response.cached;
    result.candidates = candidatesForPick(pick, response);
    const confirmed = input.candidateId
      ? result.candidates.find(
          (candidate) => candidate.id === input.candidateId,
        )
      : previous?.provider
        ? result.candidates.find(
            (candidate) =>
              candidate.eventId === previous.provider!.eventId &&
              candidate.marketKey === previous.provider!.marketKey &&
              candidate.outcomeName === previous.provider!.outcomeName &&
              candidate.line === previous.provider!.line,
          )
        : undefined;

    if (input.candidateId && input.confirmMatch !== true)
      return complete(
        "needs_mapping",
        "Confirmez explicitement l’événement, la sélection, la ligne et les règles avant association.",
      );
    if (confirmed && !confirmed.canConfirm)
      return complete(
        "needs_mapping",
        "Cette correspondance n’est pas exploitable : vérifiez horaire, marché, ligne et fraîcheur. Les données antérieures ne sont pas rafraîchies.",
      );
    if (confirmed) {
      const ageNow = now() - Date.parse(confirmed.providerUpdatedAt);
      if (
        ageNow < 0 ||
        ageNow >
          Math.min(
            PRISME_QUOTE_MAX_AGE_SECONDS,
            state.settings.quoteMaxAgeMinutes * 60,
          ) *
            1000
      ) {
        return complete(
          "unavailable",
          "Cote fournisseur trop ancienne selon vos paramètres. Elle reste un relevé historique, jamais une cote fraîche.",
        );
      }
      const quote: Omit<Quote, "id"> = {
        pickId: pick.id,
        bookmaker: "Winamax FR",
        odds: confirmed.odds,
        observedAt: confirmed.collectedAt,
        recordedAt: confirmed.collectedAt,
        source:
          "The Odds API v4 · Winamax FR · correspondance confirmée manuellement",
        sourceUrl: "https://the-odds-api.com/liveapi/guides/v4/",
        available: true,
        matchConfirmed: true,
        closing: false,
        referenceProbability: null,
        notes:
          "Observation fournisseur ; aucune exécution. Les règles ont été vérifiées humainement. Validité maximale de 15 minutes fixée par PRISME, réduite par vos préférences.",
        collectionMode: "provider",
        mappingStatus: "confirmed",
        providerLastUpdatedAt: confirmed.providerUpdatedAt,
        providerTtlSeconds: PRISME_QUOTE_MAX_AGE_SECONDS,
        identitySnapshot: snapshot,
        provider: {
          id: "the-odds-api",
          bookmakerKey: "winamax_fr",
          sportKey: confirmed.sportKey,
          eventId: confirmed.eventId,
          marketKey: confirmed.marketKey,
          outcomeName: confirmed.outcomeName,
          line: confirmed.line,
          homeTeam: confirmed.homeTeam,
          awayTeam: confirmed.awayTeam,
        },
      };
      return complete(
        "updated",
        response.cached
          ? "Observation issue du cache serveur ; ses horodatages fournisseur et collecte restent inchangés."
          : "Nouvelle observation Winamax FR collectée et associée. Aucune mise exécutée.",
        quote,
      );
    }
    if (input.candidateId)
      return complete(
        "needs_mapping",
        "La proposition choisie n’est plus présente dans la dernière réponse. Vérifiez à nouveau la correspondance.",
      );
    if (previous?.provider) {
      // This records an observed absence, not a price update. No price timestamp
      // is invented; the explicit null and unavailable state prevent reuse.
      const missing: Omit<Quote, "id"> = {
        ...previous,
        pickId: pick.id,
        odds: null,
        observedAt: response.collectedAt,
        recordedAt: response.collectedAt,
        available: false,
        providerLastUpdatedAt: null,
        source: "The Odds API v4 · sélection absente de la réponse Winamax FR",
        notes:
          "Absence constatée lors de cette collecte, sans horodatage de prix. La couverture fournisseur ne prouve pas que le marché soit indisponible sur le site Winamax. Un relevé manuel reste possible.",
      };
      // Omit copied persistent identity: quote records are append-only.
      delete (missing as Partial<Quote>).id;
      return complete(
        "unavailable",
        "La sélection précédemment associée manque dans la réponse Winamax FR. Ancienne cote invalidée, historique conservé.",
        missing,
      );
    }
    return complete(
      result.candidates.length ? "needs_mapping" : "unavailable",
      result.candidates.length
        ? "Propositions fournisseur : vérifiez l’identité exacte et les règles. Aucun rapprochement automatique ni flou n’est accepté."
        : "Aucune cote Winamax FR comparable dans cette réponse. La couverture n’est pas garantie ; saisie manuelle disponible.",
    );
  } catch (error) {
    if (error instanceof OddsApiError) {
      result.quota = error.quota ?? result.quota;
      result.retryAt = error.retryAt;
      return complete(error.status, error.message);
    }
    return complete(
      "error",
      "Collecte impossible. Les observations précédentes restent historiques et la saisie manuelle reste disponible.",
    );
  }
}
