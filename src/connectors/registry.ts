import type { AppState } from "../domain/types";
import type { OddsConnectorStatus, OddsSyncResult } from "./types";
export type { OddsConnectorStatus } from "./types";

/** Three independent source families. Static entries never claim a live connection. */
export type SourceFamily = "tipsters" | "odds" | "account";
export interface ConnectorStatus {
  id: string;
  family: SourceFamily;
  name: string;
  mode: "manual" | "disabled";
  reason: string;
  lastSynchronizedAt: null;
  requiredAccess: string[];
}
export const CONNECTORS: readonly ConnectorStatus[] = [
  {
    id: "generic-picks",
    family: "tipsters",
    name: "Fichier de pronostics autorisé",
    mode: "manual",
    reason:
      "CSV fourni par l’utilisateur, avec provenance et droits de traitement.",
    lastSynchronizedAt: null,
    requiredAccess: [],
  },
  {
    id: "bet-analytix",
    family: "tipsters",
    name: "Bet Analytix",
    mode: "disabled",
    reason: "Conditions et accès automatisé autorisé non vérifiés.",
    lastSynchronizedAt: null,
    requiredAccess: [
      "Conditions applicables vérifiées",
      "API ou flux expressément autorisé",
    ],
  },
  {
    id: "odds-api",
    family: "odds",
    name: "The Odds API",
    mode: "disabled",
    reason:
      "Adaptateur v4 disponible ; clé serveur nécessaire et couverture vérifiée dans chaque réponse Winamax FR.",
    lastSynchronizedAt: null,
    requiredAccess: [
      "Clé ODDS_API_KEY côté serveur",
      "Lecture autorisée ; aucune souscription automatique",
    ],
  },
  {
    id: "manual-odds",
    family: "odds",
    name: "Cotes saisies manuellement",
    mode: "manual",
    reason: "Relevé horodaté et correspondance explicite du marché.",
    lastSynchronizedAt: null,
    requiredAccess: [],
  },
  {
    id: "winamax-account",
    family: "account",
    name: "Compte Winamax",
    mode: "manual",
    reason:
      "Saisie ou CSV générique. Aucune API publique de compte ou export natif supposé.",
    lastSynchronizedAt: null,
    requiredAccess: [],
  },
];
export async function synchronizeConnector(id: string): Promise<never> {
  const adapter = CONNECTORS.find((item) => item.id === id);
  throw new Error(
    adapter ? `${adapter.name} : ${adapter.reason}` : "Connecteur inconnu.",
  );
}

export function readOddsConnectorStatus(
  state: AppState,
  options: { apiKeyConfigured: boolean },
): OddsConnectorStatus {
  const attempts = state.audit
    .filter((entry) => entry.action === "odds.sync")
    .sort((a, b) => b.at.localeCompare(a.at));
  const parse = (detail: string): OddsSyncResult | null => {
    try {
      return JSON.parse(detail) as OddsSyncResult;
    } catch {
      return null;
    }
  };
  const latest = attempts[0] ? parse(attempts[0].detail) : null;
  const lastSuccess = attempts.find((entry) =>
    ["updated", "unchanged"].includes(parse(entry.detail)?.status ?? ""),
  );
  const status =
    state.workspace === "demo"
      ? "demo"
      : !options.apiKeyConfigured
        ? "unconfigured"
        : (latest?.status ?? "ready");
  const message =
    status === "demo"
      ? "Démonstration fictive : aucun appel réseau au fournisseur."
      : status === "unconfigured"
        ? "The Odds API non configuré. Les relevés manuels restent disponibles."
        : (latest?.message ??
          "Clé serveur configurée. Une collecte se lance uniquement sur demande explicite ; couverture non encore vérifiée.");
  return {
    configured: options.apiKeyConfigured,
    enabled: state.workspace === "personal" && options.apiKeyConfigured,
    status,
    message,
    quota: latest?.quota ?? null,
    retryAt: latest?.retryAt ?? null,
    lastAttemptAt: attempts[0]?.at ?? null,
    lastSuccessAt: lastSuccess?.at ?? null,
  };
}
