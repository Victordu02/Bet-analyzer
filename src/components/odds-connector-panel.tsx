"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CloudDownload,
  Database,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { AppState } from "@/domain/types";
import type {
  OddsCandidate,
  OddsConnectorStatus,
  OddsSyncResult,
} from "@/connectors/types";
import { formatDateTime, formatNumber } from "@/components/analysis-ui";

export interface OddsConnectorPanelProps {
  state: AppState;
  mutate: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  pickId?: string;
  compact?: boolean;
  onOpenManual: (pickId?: string) => void;
}

const STATUS_LABELS: Record<OddsConnectorStatus["status"], string> = {
  unconfigured: "Non configuré",
  demo: "Démonstration isolée",
  ready: "Accès configuré",
  needs_sport: "Compétition à choisir",
  needs_mapping: "Correspondance à valider",
  updated: "Observation enregistrée",
  unchanged: "Observation déjà conservée",
  unavailable: "Marché non disponible",
  rate_limited: "Quota ou délai fournisseur",
  error: "Dernier appel en erreur",
};

function SyncCandidate({
  candidate,
  desired,
}: {
  candidate: OddsCandidate;
  desired: {
    event: string;
    startsAt: string;
    market: string;
    selection: string;
    line: string;
    rules: string;
  };
}) {
  const comparisons = [
    {
      label: "Événement",
      desired: desired.event,
      actual: candidate.event,
      exact: candidate.exact.event,
    },
    {
      label: "Début à Paris",
      desired: formatDateTime(desired.startsAt),
      actual: formatDateTime(candidate.startsAt),
      exact: candidate.exact.startsAt,
    },
    {
      label: "Marché",
      desired: desired.market,
      actual: candidate.marketKey,
      exact: candidate.exact.market,
    },
    {
      label: "Sélection",
      desired: desired.selection,
      actual: candidate.outcomeName,
      exact: candidate.exact.selection,
    },
    {
      label: "Ligne / handicap",
      desired: desired.line || "Sans ligne",
      actual: candidate.line || "Sans ligne",
      exact: candidate.exact.line,
    },
    {
      label: "Règles",
      desired: desired.rules || "Non précisées",
      actual: candidate.rules,
      exact: null,
    },
  ];

  return (
    <div className="odds-candidate-review">
      <div className="section-heading">
        <h3>Comparer avant de confirmer</h3>
        <span className="badge badge-muted">Winamax France</span>
      </div>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Comparaison du pronostic et du marché fournisseur"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Champ</th>
              <th scope="col">Pronostic suivi</th>
              <th scope="col">Marché retourné</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{row.desired}</td>
                <td>
                  {row.actual || "Non renseigné"}
                  {row.exact !== null && (
                    <small>
                      {row.exact
                        ? "Correspondance textuelle exacte"
                        : "Vérification humaine nécessaire"}
                    </small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="detail-list">
        <div className="detail-line">
          <dt>Cote retournée</dt>
          <dd>{formatNumber(candidate.odds)}</dd>
        </div>
        <div className="detail-line">
          <dt>Mise à jour fournisseur</dt>
          <dd>{formatDateTime(candidate.providerUpdatedAt)}</dd>
        </div>
        <div className="detail-line">
          <dt>Collectée par l’application</dt>
          <dd>{formatDateTime(candidate.collectedAt)}</dd>
        </div>
        <div className="detail-line">
          <dt>Événement fournisseur</dt>
          <dd>
            <code className="reference-code">{candidate.eventId}</code>
          </dd>
        </div>
      </dl>
      {candidate.warnings.length > 0 && (
        <div className="notice notice-warning">
          {candidate.warnings.map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
        </div>
      )}
      {!candidate.canConfirm && (
        <p className="notice notice-warning">
          Cette proposition ne permet pas une confirmation exploitable.
          Conservez le dossier et effectuez un relevé manuel vérifié.
        </p>
      )}
    </div>
  );
}

export function OddsConnectorPanel({
  state,
  mutate,
  pickId,
  compact = false,
  onOpenManual,
}: OddsConnectorPanelProps) {
  const [connector, setConnector] = useState<OddsConnectorStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusRefresh, setStatusRefresh] = useState(0);
  const [selectedPickId, setSelectedPickId] = useState(pickId ?? "");
  const [sportKey, setSportKey] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<OddsSyncResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const demo = state.workspace === "demo";
  const selectedPick = state.picks.find((pick) => pick.id === selectedPickId);
  const selectedCandidate = result?.candidates.find(
    (candidate) => candidate.id === candidateId,
  );

  useEffect(() => {
    generation.current += 1;
    setSelectedPickId(pickId ?? "");
    setSportKey("");
    setCandidateId("");
    setConfirmed(false);
    setResult(null);
    setError("");
    setBusy(false);
    return () => {
      generation.current += 1;
    };
  }, [state.workspace, pickId]);

  useEffect(() => {
    if (demo) {
      setConnector(null);
      setStatusLoading(false);
      return;
    }
    const controller = new AbortController();
    setStatusLoading(true);
    fetch(`/api/connectors?workspace=${state.workspace}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error ?? "L’état du connecteur est indisponible.",
          );
        if (!body.oddsApi || typeof body.oddsApi.configured !== "boolean")
          throw new Error("L’état du connecteur reçu est incomplet.");
        setConnector(body.oddsApi as OddsConnectorStatus);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Impossible de lire l’état du connecteur.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setStatusLoading(false);
      });
    return () => controller.abort();
  }, [demo, state.workspace, state.audit.length, statusRefresh]);

  function choosePick(id: string) {
    generation.current += 1;
    setSelectedPickId(id);
    setSportKey("");
    setCandidateId("");
    setConfirmed(false);
    setResult(null);
    setError("");
  }

  async function synchronize(confirmMatch = false) {
    if (!selectedPick || demo || busy) return;
    const currentGeneration = generation.current;
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, unknown> = { pickId: selectedPick.id };
      if (sportKey) payload.sportKey = sportKey;
      if (confirmMatch) {
        if (!selectedCandidate?.canConfirm || !confirmed)
          throw new Error(
            "Vérifiez la correspondance exacte avant de la confirmer.",
          );
        payload.candidateId = selectedCandidate.id;
        payload.sportKey = selectedCandidate.sportKey;
        payload.confirmMatch = true;
      }
      const response = (await mutate("odds.sync", payload)) as OddsSyncResult;
      if (currentGeneration !== generation.current) return;
      setResult(response);
      if (response.sportKey) setSportKey(response.sportKey);
      setCandidateId("");
      setConfirmed(false);
      setStatusRefresh((value) => value + 1);
    } catch (cause) {
      if (currentGeneration === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "L’appel fournisseur n’a pas abouti. Le relevé manuel reste disponible.",
        );
    } finally {
      if (currentGeneration === generation.current) setBusy(false);
    }
  }

  const quota = result?.quota ?? connector?.quota;
  const currentStatus = demo ? "demo" : (result?.status ?? connector?.status);
  const syncAllowed =
    !demo &&
    connector?.configured &&
    connector.enabled &&
    selectedPick &&
    !busy;

  return (
    <section
      className={`panel panel-pad odds-connector ${compact ? "odds-connector-compact" : ""}`}
      aria-label="Source de cotes The Odds API"
    >
      <div className="section-heading">
        <div>
          <div className="eyebrow">COTES · FOURNISSEUR EXTERNE</div>
          <h2>The Odds API</h2>
        </div>
        <CloudDownload size={21} color="var(--teal)" aria-hidden="true" />
      </div>
      <div className="odds-connector-status">
        <span
          className={`badge ${currentStatus === "updated" || currentStatus === "unchanged" || currentStatus === "ready" ? "badge-teal" : "badge-amber"}`}
        >
          {statusLoading && !connector
            ? "Lecture de l’état…"
            : currentStatus
              ? STATUS_LABELS[currentStatus]
              : "État non disponible"}
        </span>
        {!demo && (
          <button
            className="icon-button"
            aria-label="Actualiser l’état du connecteur"
            disabled={statusLoading || busy}
            onClick={() => {
              setError("");
              setStatusRefresh((value) => value + 1);
            }}
          >
            <RefreshCw size={13} />
          </button>
        )}
      </div>
      <p className="muted">
        {demo
          ? "Aucun appel externe dans cet espace. Les observations fictives restent isolées ; la saisie manuelle de démonstration est disponible."
          : (result?.message ??
            connector?.message ??
            "Vérification de la configuration locale, sans collecte automatique de cotes.")}
      </p>
      {!demo && connector && (
        <dl className="odds-status-details">
          <div>
            <dt>Clé serveur</dt>
            <dd>{connector.configured ? "Présente" : "Non configurée"}</dd>
          </div>
          <div>
            <dt>Dernière tentative</dt>
            <dd>{formatDateTime(connector.lastAttemptAt)}</dd>
          </div>
          <div>
            <dt>Dernière réussite</dt>
            <dd>{formatDateTime(connector.lastSuccessAt)}</dd>
          </div>
          <div>
            <dt>Quota restant</dt>
            <dd>
              {quota?.remaining == null
                ? "Non communiqué"
                : formatNumber(quota.remaining, 0)}
            </dd>
          </div>
          {quota?.used != null && (
            <div>
              <dt>Quota utilisé</dt>
              <dd>{formatNumber(quota.used, 0)}</dd>
            </div>
          )}
          {quota?.last != null && (
            <div>
              <dt>Coût du dernier appel</dt>
              <dd>{formatNumber(quota.last, 0)}</dd>
            </div>
          )}
          {(result?.retryAt || connector.retryAt) && (
            <div>
              <dt>Nouvel essai possible</dt>
              <dd>{formatDateTime(result?.retryAt ?? connector.retryAt)}</dd>
            </div>
          )}
        </dl>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {!pickId && (
        <label className="field">
          Pronostic à rapprocher
          <select
            value={selectedPickId}
            disabled={busy}
            onChange={(event) => choosePick(event.target.value)}
          >
            <option value="">Choisir un dossier</option>
            {[...state.picks]
              .sort((first, second) =>
                second.publishedAt.localeCompare(first.publishedAt),
              )
              .map((pick) => (
                <option key={pick.id} value={pick.id}>
                  {pick.event} · {pick.selection}
                </option>
              ))}
          </select>
        </label>
      )}
      {result?.sports.length ? (
        <label className="field">
          Compétition du fournisseur
          <select
            value={sportKey}
            disabled={busy}
            onChange={(event) => {
              setSportKey(event.target.value);
              setCandidateId("");
              setConfirmed(false);
            }}
          >
            <option value="">Choisir la compétition exacte</option>
            {result.sports.map((sport) => (
              <option key={sport.key} value={sport.key}>
                {sport.group} · {sport.title}
              </option>
            ))}
          </select>
          <small>
            La liste provient du fournisseur. Le nom du sport seul ne confirme
            pas un événement.
          </small>
        </label>
      ) : null}
      {!demo && (
        <button
          className="button button-primary"
          disabled={
            !syncAllowed || (result?.status === "needs_sport" && !sportKey)
          }
          onClick={() => {
            void synchronize();
          }}
        >
          {busy ? (
            <Loader2 className="spin" size={14} />
          ) : (
            <CloudDownload size={14} />
          )}
          {busy ? "Appel en cours…" : "Rechercher les cotes Winamax"}
        </button>
      )}
      {result?.cached && (
        <p className="muted">
          Réponse mise en cache. Son horodatage fournisseur reste inchangé.
        </p>
      )}
      {result?.candidates.length && selectedPick ? (
        <div className="odds-mapping">
          <label className="field">
            Proposition de correspondance
            <select
              value={candidateId}
              disabled={busy}
              onChange={(event) => {
                setCandidateId(event.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">Choisir puis vérifier une proposition</option>
              {result.candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.event} · {candidate.outcomeName} ·{" "}
                  {candidate.marketKey}
                  {candidate.line ? ` ${candidate.line}` : ""} ·{" "}
                  {formatNumber(candidate.odds)}
                </option>
              ))}
            </select>
          </label>
          {selectedCandidate && (
            <>
              <SyncCandidate
                candidate={selectedCandidate}
                desired={selectedPick}
              />
              <label className="import-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy || !selectedCandidate.canConfirm}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  J’ai vérifié sur Winamax l’événement, l’horaire, le marché, la
                  sélection, la ligne et les règles. Je confirme leur
                  correspondance exacte.
                </span>
              </label>
              <button
                className="button button-primary"
                disabled={busy || !selectedCandidate.canConfirm || !confirmed}
                onClick={() => {
                  void synchronize(true);
                }}
              >
                <CheckCircle2 size={14} />
                Confirmer et conserver l’observation
              </button>
            </>
          )}
        </div>
      ) : null}
      {(result?.status === "updated" || result?.status === "unchanged") && (
        <p className="notice" role="status">
          <CheckCircle2 size={14} />
          Observation conservée avec ses identifiants et horodatages. Aucun
          ticket exécuté n’a été créé.
        </p>
      )}
      <button
        className="text-link"
        onClick={() => onOpenManual(selectedPickId || pickId)}
      >
        <Database size={12} />
        Saisir une observation manuelle
        <ArrowRight size={12} />
      </button>
      <p className="odds-footnote">
        <Info size={11} />
        Chaque collecte est demandée explicitement. Les droits, marchés et
        quotas du fournisseur s’appliquent. Aucune collecte du compte joueur ni
        mise automatique.
      </p>
    </section>
  );
}
