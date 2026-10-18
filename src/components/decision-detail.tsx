"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, FlaskConical, Plus, Settings2 } from "lucide-react";
import type { AppState, Pick } from "../domain/types";
import { RESULT_LABELS } from "../domain/types";
import { decisionAnalysis } from "../domain/radar";
import { clv, identity } from "../domain/calculations";
import { assessQuote } from "../domain/quote-assessment";
import { analyzeSegment, type ProofLevel } from "../domain/tipster-analysis";
import type { FormKind } from "./entity-forms";
import {
  AnalysisConventions,
  AnalysisMetricsGrid,
  ProofSelector,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
} from "./analysis-ui";
import { OddsConnectorPanel } from "./odds-connector-panel";
import { ProbabilityCalculator } from "./probability-calculator";

type DecisionDetailProps = {
  pick: Pick;
  state: AppState;
  onOpenForm: (kind: FormKind, initial?: Record<string, unknown>) => void;
  onOpenTipster: (id: string) => void;
  onOpenReference?: (id: string) => void;
  mutate?: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
};

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="detail-line">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function SourceLink({
  url,
  children = "Consulter la source",
}: {
  url: string;
  children?: ReactNode;
}) {
  let safeUrl: string | null = null;
  try {
    const parsed = new URL(url);
    if (["https:", "http:"].includes(parsed.protocol)) safeUrl = parsed.href;
  } catch {
    safeUrl = null;
  }

  return safeUrl ? (
    <a className="text-link" href={safeUrl} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={12} />
    </a>
  ) : (
    <span className="muted">Lien non fourni ou inexploitable</span>
  );
}

function minutes(value: number | null): string {
  return value === null ? "Non documenté" : `${formatNumber(value, 1)} min`;
}

function configuredPercent(value: number | null): string {
  return value === null ? "Non configuré" : formatPercent(value);
}

export function DecisionDetail({
  pick,
  state,
  onOpenForm,
  onOpenTipster,
  onOpenReference,
  mutate,
}: DecisionDetailProps) {
  const [now, setNow] = useState(() => new Date());
  const [historyLevel, setHistoryLevel] = useState<ProofLevel>(pick.evidence);
  const [historySimulationId, setHistorySimulationId] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const analysis = useMemo(
    () => decisionAnalysis(state, pick, { now }),
    [state, pick, now],
  );

  const contextMetrics = useMemo(
    () =>
      analyzeSegment(state, {
        level: historyLevel,
        filter: {
          tipsterId: pick.tipsterId,
          sport: pick.sport,
          ...(pick.competition ? { competition: pick.competition } : {}),
          market: pick.market,
          kind: pick.kind,
          timing: pick.timing,
        },
        ...(historyLevel === "simulated" && historySimulationId
          ? { simulationId: historySimulationId }
          : {}),
      }),
    [state, historyLevel, historySimulationId, pick],
  );

  const tipster = state.tipsters.find((item) => item.id === pick.tipsterId);
  const executedTickets = state.tickets.filter(
    (ticket) => ticket.pickId === pick.id,
  );
  const savedScenarios = state.simulations.flatMap((simulation) =>
    simulation.allocations
      .filter((allocation) => allocation.pickId === pick.id)
      .map((allocation) => ({ simulation, allocation })),
  );
  const binaryCalculationSupported =
    pick.kind === "single" &&
    pick.timing === "prematch" &&
    !["cashout", "half_won", "half_lost", "void"].includes(pick.result);
  const currentQuote = analysis.latestQuote;
  const exposure = analysis.exposure;
  const closingComparisons = executedTickets.map((ticket) => {
    const comparableTicket =
      identity({ ...pick, ...ticket }) === identity(pick);
    const closingQuote = [...analysis.quoteHistory].reverse().find((quote) => {
      if (
        !comparableTicket ||
        !quote.closing ||
        !quote.available ||
        quote.odds === null
      )
        return false;
      const observedAt = Date.parse(quote.observedAt);
      if (
        !(
          Date.parse(ticket.placedAt) <= observedAt &&
          observedAt < Date.parse(pick.startsAt)
        )
      )
        return false;
      const assessment = assessQuote(
        pick,
        [{ ...quote, closing: false }],
        state.settings.quoteMaxAgeMinutes,
        now,
      );
      return (
        assessment.quote !== null &&
        assessment.matching.status === "confirmed" &&
        assessment.errors.length === 0
      );
    });
    return {
      ticket,
      closingQuote,
      comparison: closingQuote
        ? clv(ticket.odds, closingQuote.odds, closingQuote.referenceProbability)
        : null,
    };
  });

  const missingInformation = [
    !tipster ? "Le profil source n’est plus disponible." : "",
    tipster?.completeness === "unknown"
      ? "Exhaustivité non vérifiable pour l’historique de ce tipster."
      : "",
    !pick.sourceId.trim()
      ? "L’identifiant original de la publication manque."
      : "",
    !pick.sourceUrl.trim()
      ? "Aucun lien vers la publication source n’est renseigné."
      : "",
    !pick.rules.trim() ? "Les règles de règlement doivent être précisées." : "",
    !pick.argument.trim() ? "Raisonnement du tipster non fourni." : "",
    !analysis.firstQuote
      ? "Aucun relevé Winamax exploitable après publication n’est documenté."
      : "",
    !analysis.quoteFresh
      ? "Aucune cote actuelle suffisamment récente n’est confirmée."
      : "",
    analysis.matching.status !== "confirmed"
      ? "La correspondance exacte du marché doit être validée."
      : "",
    exposure.uncertain
      ? "Le coût restant d’une position ouverte est inconnu : exposition à rapprocher."
      : "",
  ].filter(Boolean);

  function openManualQuote() {
    onOpenForm("quote", { pickId: pick.id });
  }

  return (
    <div className="stack decision-detail">
      <header>
        <div className="eyebrow">
          {pick.sport || "Sport non renseigné"} ·{" "}
          {pick.competition || "Compétition non renseignée"}
        </div>
        <h2>{pick.event}</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          {formatDateTime(pick.startsAt)} · Heure de Paris
        </p>
        <div className="pick-foot">
          <span
            className={`badge ${analysis.eligible ? "badge-teal" : "badge-amber"}`}
          >
            {analysis.status}
          </span>
          <span className="badge badge-outline">
            {pick.evidence === "observed"
              ? "Observé avant événement"
              : "Déclaré par la source"}
          </span>
          <span className="badge badge-outline">
            {pick.kind === "single" ? "Simple" : "Combiné"} ·{" "}
            {pick.timing === "prematch" ? "Avant-match" : "Live"}
          </span>
          {pick.result !== "open" && (
            <span className="badge badge-muted">
              {RESULT_LABELS[pick.result]}
            </span>
          )}
        </div>
      </header>

      <div
        className={`notice ${analysis.eligible ? "" : "notice-warning"}`}
        role="status"
      >
        {analysis.reason}
      </div>

      <div className="view-grid">
        <section className="panel panel-pad">
          <h3>Identité exacte de la sélection</h3>
          <dl className="detail-list">
            <DetailRow label="Événement">{pick.event}</DetailRow>
            <DetailRow label="Identifiant d’événement">
              <code className="reference-code">
                {pick.eventKey || "Non renseigné"}
              </code>
            </DetailRow>
            <DetailRow label="Marché">
              {pick.market || "Non renseigné"}
            </DetailRow>
            <DetailRow label="Sélection">
              <strong>{pick.selection || "Non renseignée"}</strong>
            </DetailRow>
            <DetailRow label="Ligne / handicap">
              {pick.line ||
                "Sans ligne renseignée — à vérifier pour un total ou handicap"}
            </DetailRow>
            <DetailRow label="Règles de règlement">
              {pick.rules || "Non précisées"}
            </DetailRow>
          </dl>
        </section>

        <section className="panel panel-pad">
          <h3>De la publication au dernier relevé</h3>
          <dl className="detail-list">
            <DetailRow label="Cote annoncée">
              {formatNumber(analysis.announcedOdds)}
            </DetailRow>
            <DetailRow label="Seuil fourni par le tipster">
              {analysis.thresholdOdds === null
                ? "Non fourni"
                : formatNumber(analysis.thresholdOdds)}
            </DetailRow>
            <DetailRow label="Première cote Winamax observée">
              {analysis.firstQuote?.odds == null
                ? "Non observée"
                : formatNumber(analysis.firstQuote.odds)}
            </DetailRow>
            <DetailRow label="Premier relevé après publication">
              {minutes(analysis.firstDelayMinutes)}
            </DetailRow>
            <DetailRow label="Temps écoulé depuis publication">
              {minutes(analysis.publicationDelayMinutes)}
            </DetailRow>
            <DetailRow label="Dernière cote Winamax observée">
              {analysis.currentOdds === null
                ? "Non disponible"
                : formatNumber(analysis.currentOdds)}
            </DetailRow>
            <DetailRow label="Délai du dernier relevé">
              {minutes(analysis.currentDelayMinutes)}
            </DetailRow>
            <DetailRow label="Âge du dernier relevé">
              {minutes(analysis.quoteAgeMinutes)}
            </DetailRow>
            {analysis.providerAgeMinutes !== null && (
              <DetailRow label="Âge de la cote du fournisseur">
                {minutes(analysis.providerAgeMinutes)}
              </DetailRow>
            )}
            <DetailRow label="Fraîcheur requise">
              {state.settings.quoteMaxAgeMinutes} min maximum ·{" "}
              {analysis.quoteFresh
                ? "relevé récent"
                : "nouveau relevé nécessaire"}
            </DetailRow>
          </dl>
          <p className="muted">
            Le seuil appartient au tipster. Il ne démontre pas qu’une cote est
            rentable.
          </p>
        </section>
      </div>

      <section className="panel panel-pad">
        <h3>Correspondance et disponibilité Winamax</h3>
        <p
          className={`notice ${analysis.matching.status === "confirmed" ? "" : "notice-warning"}`}
        >
          {analysis.matching.status === "confirmed"
            ? "Correspondance exacte documentée pour ce relevé."
            : analysis.matching.status === "ambiguous"
              ? "Correspondance ambiguë : validation humaine nécessaire avant utilisation."
              : "Correspondance non documentée : événement, marché, sélection, ligne et règles à vérifier."}
        </p>
        {analysis.matching.issues.length > 0 && (
          <ul className="analysis-limitations">
            {analysis.matching.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        {currentQuote && (
          <dl className="detail-list">
            <DetailRow label="Disponibilité au dernier relevé">
              {currentQuote.available
                ? "Marché disponible lors de l’observation"
                : "Marché indisponible lors de l’observation"}
            </DetailRow>
            <DetailRow label="Cote observée le">
              {formatDateTime(currentQuote.observedAt)}
            </DetailRow>
            <DetailRow label="Observation enregistrée le">
              {formatDateTime(currentQuote.recordedAt)}
            </DetailRow>
            {currentQuote.collectionMode === "provider" && (
              <>
                <DetailRow label="Dernière mise à jour fournisseur">
                  {formatDateTime(currentQuote.providerLastUpdatedAt)}
                </DetailRow>
                <DetailRow label="Politique de fraîcheur du connecteur">
                  {currentQuote.providerTtlSeconds == null
                    ? "Non documentée"
                    : `${formatNumber(currentQuote.providerTtlSeconds, 0)} secondes · limite conservatrice PRISME`}
                </DetailRow>
                <DetailRow label="Origine de la collecte">
                  The Odds API · bookmaker Winamax France
                </DetailRow>
              </>
            )}
            <DetailRow label="Source du relevé">
              {currentQuote.source}
            </DetailRow>
            <DetailRow label="Justificatif">
              <SourceLink url={currentQuote.sourceUrl} />
            </DetailRow>
          </dl>
        )}
        {currentQuote?.identitySnapshot && (
          <details>
            <summary>Identité du marché conservée avec le relevé</summary>
            <dl className="detail-list">
              <DetailRow label="Événement du relevé">
                {currentQuote.identitySnapshot.event}
              </DetailRow>
              <DetailRow label="Horaire du relevé">
                {formatDateTime(currentQuote.identitySnapshot.startsAt)}
              </DetailRow>
              <DetailRow label="Marché du relevé">
                {currentQuote.identitySnapshot.market}
              </DetailRow>
              <DetailRow label="Sélection du relevé">
                {currentQuote.identitySnapshot.selection}
              </DetailRow>
              <DetailRow label="Ligne du relevé">
                {currentQuote.identitySnapshot.line || "Sans ligne"}
              </DetailRow>
              <DetailRow label="Règles du relevé">
                {currentQuote.identitySnapshot.rules || "Non précisées"}
              </DetailRow>
            </dl>
          </details>
        )}
        <p className="muted">
          Une cote observée ne prouve ni son maintien ni l’acceptation de la
          mise souhaitée. Le dernier constat d’indisponibilité reste conservé.
        </p>
        {mutate && (
          <OddsConnectorPanel
            state={state}
            mutate={mutate}
            pickId={pick.id}
            compact
            onOpenManual={openManualQuote}
          />
        )}
      </section>

      <section className="panel panel-pad">
        <h3>Exposition et limites personnelles</h3>
        <p className={`notice ${exposure.eligible ? "" : "notice-warning"}`}>
          {exposure.reason}
        </p>
        <dl className="detail-list">
          <DetailRow label="Cash disponible">
            {formatMoney(exposure.cashCents)}
          </DetailRow>
          <DetailRow label="Capital comptable">
            {formatMoney(exposure.capitalCents)}
          </DetailRow>
          <DetailRow label="Exposition sur cet événement">
            {formatMoney(exposure.eventStakeCents)}
          </DetailRow>
          <DetailRow label="Exposition ouverte totale">
            {formatMoney(exposure.openStakeCents)}
          </DetailRow>
          <DetailRow label="Tickets ouverts sur cette même sélection">
            {formatNumber(exposure.identicalOpenTickets, 0)}
          </DetailRow>
          <DetailRow label="Mise indicative sous la règle fixe">
            {exposure.suggestedStakeCents === null
              ? "Abstention · conditions non réunies"
              : formatMoney(exposure.suggestedStakeCents)}
          </DetailRow>
          <DetailRow label="Plafond par pari">
            {configuredPercent(state.settings.maxBetPercent)}
          </DetailRow>
          <DetailRow label="Plafond par événement">
            {configuredPercent(state.settings.maxEventPercent)}
          </DetailRow>
          <DetailRow label="Plafond d’exposition totale">
            {configuredPercent(state.settings.maxExposurePercent)}
          </DetailRow>
          <DetailRow label="Limite de pertes quotidienne">
            {state.settings.dailyLossLimitCents === null
              ? "Non configurée"
              : formatMoney(state.settings.dailyLossLimitCents)}
          </DetailRow>
          <DetailRow label="Limite de pertes mensuelle">
            {state.settings.monthlyLossLimitCents === null
              ? "Non configurée"
              : formatMoney(state.settings.monthlyLossLimitCents)}
          </DetailRow>
          <DetailRow label="Nouvelles allocations">
            {state.settings.paused
              ? "En pause"
              : "Soumises aux contrôles du panier"}
          </DetailRow>
        </dl>
        <p className="muted">
          Le capital comprend le cash disponible et les positions ouvertes
          suivies au coût. Les sélections du même événement partagent leur
          plafond ; les paris corrélés ne sont pas des confirmations
          indépendantes.
        </p>
        <p className="muted">
          La mise indicative applique la règle fixe configurée à ce dossier et
          aux positions déjà ouvertes. Un panier de plusieurs sélections peut
          encore la réduire ; elle ne dépend d’aucune probabilité supposée.
        </p>
        {analysis.duplicates.length > 0 && (
          <div className="notice notice-warning">
            <p>
              {analysis.duplicates.length} autre(s) publication(s) désignent
              cette même sélection. Les sources sont conservées et leur
              répétition ne multiplie pas la mise.
            </p>
            <div className="stack" style={{ gap: 8, marginTop: 10 }}>
              {analysis.duplicates.map((duplicate) => {
                const name =
                  state.tipsters.find((item) => item.id === duplicate.tipsterId)
                    ?.name || "Source conservée";
                return onOpenReference ? (
                  <button
                    key={duplicate.pickId}
                    className="text-link"
                    type="button"
                    onClick={() => onOpenReference(`pick:${duplicate.pickId}`)}
                  >
                    {name}
                    <ArrowUpRight size={12} />
                  </button>
                ) : (
                  <span key={duplicate.pickId}>{name}</span>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="panel panel-pad">
        <div className="section-heading">
          <h3>Pourquoi ce profil et ce segment ?</h3>
          {tipster && (
            <button
              className="text-link"
              type="button"
              onClick={() => onOpenTipster(tipster.id)}
            >
              {tipster.name}
              <ArrowUpRight size={12} />
            </button>
          )}
        </div>
        <p className="muted">
          {analysis.matchingStrategies.length > 0
            ? "Ce pronostic correspond aux règles enregistrées ci-dessous. La correspondance ne démontre pas un avantage prédictif."
            : "Aucune stratégie suivie ne justifie automatiquement la sélection de ce dossier. L’analyse reste manuelle."}
        </p>
        {analysis.matchingStrategies.length > 0 && (
          <ul className="analysis-limitations">
            {analysis.matchingStrategies.map((strategy) => (
              <li key={strategy.id}>
                {onOpenReference ? (
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => onOpenReference(`strategy:${strategy.id}`)}
                  >
                    {strategy.name}
                  </button>
                ) : (
                  strategy.name
                )}{" "}
                · règles figées le {formatDateTime(strategy.frozenAt)} ·
                validation dès {formatDateTime(strategy.validationStart)}.
              </li>
            ))}
          </ul>
        )}
        <p className="muted">
          Historique pertinent : même profil, sport, compétition lorsqu’elle est
          renseignée, marché, type de ticket et moment de prise. Choisissez un
          seul niveau de preuve.
        </p>
        <ProofSelector
          value={historyLevel}
          onChange={setHistoryLevel}
          label="Preuve de l’historique pertinent"
        />
        {historyLevel === "simulated" && (
          <label className="field" style={{ marginBottom: 16 }}>
            <span>Scénario de l’historique simulé</span>
            <select
              value={historySimulationId}
              onChange={(event) => setHistorySimulationId(event.target.value)}
            >
              <option value="">Choisir un scénario</option>
              {state.simulations.map((simulation) => (
                <option key={simulation.id} value={simulation.id}>
                  {simulation.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <AnalysisMetricsGrid metrics={contextMetrics} />
        <AnalysisConventions metrics={contextMetrics} level={historyLevel} />
      </section>

      <section className="panel panel-pad">
        <h3>Arguments publiés par le tipster</h3>
        {pick.argument.trim() ? (
          <blockquote
            style={{
              whiteSpace: "pre-wrap",
              margin: "14px 0",
              lineHeight: 1.8,
            }}
          >
            {pick.argument}
          </blockquote>
        ) : (
          <p className="notice">
            Raisonnement du tipster non fourni. Aucune explication n’est
            reconstruite à sa place.
          </p>
        )}
        <p className="muted">
          Contenu attribué à la source de ce pronostic. Toute information
          extérieure doit disposer de sa propre source et de sa date.
        </p>
      </section>

      <section className="panel panel-pad">
        <h3>Espérance et hypothèses</h3>
        <p className="notice">
          Espérance inconnue sans estimation exploitable propre à ce pari. Le
          taux de réussite du tipster ne fournit pas sa probabilité de gain.
        </p>
        <dl className="detail-list">
          <DetailRow label="Probabilité d’équilibre à la cote retenue">
            {formatPercent(analysis.expectation.breakEven)}
          </DetailRow>
          <DetailRow label="Rendement espéré actuel">
            {analysis.expectation.roi === null
              ? "Espérance inconnue"
              : formatPercent(analysis.expectation.roi, true)}
          </DetailRow>
          <DetailRow label="Espérance actuelle en euros">
            {analysis.expectation.expectedCents === null
              ? "Espérance inconnue"
              : formatMoney(analysis.expectation.expectedCents, true)}
          </DetailRow>
        </dl>
        {analysis.expectation.errors.length > 0 && (
          <ul className="analysis-limitations">
            {analysis.expectation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        {analysis.expectation.warnings.length > 0 && (
          <ul className="analysis-limitations">
            {analysis.expectation.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
        {binaryCalculationSupported ? (
          <details>
            <summary>Explorer une hypothèse manuelle et sa sensibilité</summary>
            <p className="muted">
              Calcul illustratif pour un simple cash binaire, sans frais ni
              remboursement. La cote préremplie est un relevé ou la cote
              annoncée ; sa disponibilité doit être revérifiée. L’hypothèse
              n’est ni une prévision validée ni un ordre de pari.
            </p>
            <ProbabilityCalculator
              key={`${pick.id}:${currentQuote?.id ?? "announced"}`}
              initialOdds={analysis.currentOdds ?? pick.odds}
              initialStakeCents={state.settings.fixedStakeCents}
              compact
            />
          </details>
        ) : (
          <p className="notice notice-warning">
            Le moteur binaire ne convient pas à ce type de pari. Une espérance
            nécessite les probabilités et retours nets de tous les états
            possibles, à renseigner dans les calculatrices de Simulations.
          </p>
        )}
      </section>

      {savedScenarios.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Scénarios conservés pour cette sélection</h3>
              <p>
                Chaque ligne reste une hypothèse distincte, datée. Les
                conditions actuelles peuvent différer.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Scénario</th>
                  <th scope="col">Cote simulée</th>
                  <th scope="col">Probabilité</th>
                  <th scope="col">Mise simulée</th>
                  <th scope="col">Décision conservée</th>
                </tr>
              </thead>
              <tbody>
                {savedScenarios.map(({ simulation, allocation }, index) => (
                  <tr key={`${simulation.id}:${index}`}>
                    <td>
                      {onOpenReference ? (
                        <button
                          className="table-button"
                          type="button"
                          onClick={() =>
                            onOpenReference(`simulation:${simulation.id}`)
                          }
                        >
                          {simulation.name}
                        </button>
                      ) : (
                        simulation.name
                      )}
                      <small>{formatDateTime(simulation.createdAt)}</small>
                    </td>
                    <td>{formatNumber(allocation.odds)}</td>
                    <td>
                      {allocation.probability === null
                        ? "Non renseignée"
                        : formatPercent(allocation.probability)}
                      <small>
                        {allocation.probabilitySource === "manual"
                          ? "Hypothèse manuelle"
                          : allocation.probabilitySource
                            ? `Provenance ${allocation.probabilitySource} à vérifier`
                            : "Sans provenance"}
                      </small>
                    </td>
                    <td>{formatMoney(allocation.stakeCents)}</td>
                    <td style={{ whiteSpace: "normal" }}>
                      {allocation.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Historique complet des relevés Winamax</h3>
            <p>
              Cotes anciennes, indisponibilités et clôtures restent visibles.
              Une clôture ne sert pas à une décision antérieure.
            </p>
          </div>
        </div>
        {analysis.quoteHistory.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Observation et collecte</th>
                  <th scope="col">Cote</th>
                  <th scope="col">Disponibilité constatée</th>
                  <th scope="col">Correspondance déclarée</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {analysis.quoteHistory.map((quote) => (
                  <tr key={quote.id}>
                    <td>
                      {formatDateTime(quote.observedAt)}
                      <small>
                        Collectée {formatDateTime(quote.recordedAt)}
                      </small>
                      {quote.collectionMode === "provider" && (
                        <small>
                          Fournisseur{" "}
                          {formatDateTime(quote.providerLastUpdatedAt)}
                        </small>
                      )}
                      <small>
                        {quote.closing ? "Clôture" : "Observation hors clôture"}
                      </small>
                    </td>
                    <td>
                      {quote.odds === null
                        ? "Non disponible"
                        : formatNumber(quote.odds)}
                    </td>
                    <td>
                      {quote.available
                        ? "Disponible à cette date"
                        : "Marché indisponible"}
                    </td>
                    <td>
                      {quote.mappingStatus === "ambiguous"
                        ? "Ambiguë"
                        : quote.matchConfirmed &&
                            quote.mappingStatus !== "unconfirmed"
                          ? "Confirmée dans ce relevé"
                          : "À valider humainement"}
                    </td>
                    <td>
                      {onOpenReference ? (
                        <button
                          className="table-button"
                          type="button"
                          onClick={() => onOpenReference(`quote:${quote.id}`)}
                        >
                          {quote.source}
                        </button>
                      ) : (
                        quote.source
                      )}
                      <small>
                        <SourceLink url={quote.sourceUrl}>
                          Justificatif
                        </SourceLink>
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mini-empty">
            Aucun relevé Winamax enregistré. Le pronostic et sa cote annoncée
            restent conservés.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Tickets réellement acceptés</h3>
            <p>
              Leur cote acceptée est distincte des cotes annoncées, observées ou
              simulées.
            </p>
          </div>
        </div>
        {executedTickets.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Accepté le</th>
                  <th scope="col">Cote acceptée</th>
                  <th scope="col">Mise</th>
                  <th scope="col">Résultat</th>
                </tr>
              </thead>
              <tbody>
                {executedTickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <button
                        className="table-button"
                        type="button"
                        onClick={() =>
                          onOpenReference
                            ? onOpenReference(`ticket:${ticket.id}`)
                            : onOpenForm("ticket", { ...ticket })
                        }
                      >
                        {ticket.sourceId || ticket.id}
                      </button>
                      <small>
                        {ticket.bookmaker} · {ticket.source}
                      </small>
                    </td>
                    <td>{formatDateTime(ticket.placedAt)}</td>
                    <td>{formatNumber(ticket.odds)}</td>
                    <td>
                      {formatMoney(ticket.stakeCents)}
                      <small>
                        {ticket.funding === "freebet" ? "Freebet" : "Cash"}
                      </small>
                    </td>
                    <td>
                      {RESULT_LABELS[ticket.result]}
                      {ticket.partialCashout ? " · cashout partiel" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mini-empty">
            Aucun ticket réel rattaché. Une simulation ou une observation de
            cote ne prouve pas une exécution.
          </p>
        )}
      </section>

      {closingComparisons.length > 0 &&
        analysis.quoteHistory.some((quote) => quote.closing) && (
          <section className="panel panel-pad">
            <h3>Comparaison descriptive à la clôture</h3>
            <p className="muted">
              Comparaison avec une clôture disponible, horodatée après la prise
              du ticket et avant l’événement, sur la même identité de marché.
              Elle n’établit pas une rentabilité future.
            </p>
            {closingComparisons.map(({ ticket, closingQuote, comparison }) => (
              <dl className="detail-list" key={ticket.id}>
                <DetailRow label={`Ticket ${ticket.sourceId || ticket.id}`}>
                  Cote acceptée {formatNumber(ticket.odds)}
                </DetailRow>
                <DetailRow label="Clôture comparable">
                  {closingQuote
                    ? `${formatNumber(closingQuote.odds)} · ${formatDateTime(closingQuote.observedAt)}`
                    : "Non documentée"}
                </DetailRow>
                <DetailRow label="CLV brute">
                  {formatPercent(comparison?.raw, true)}
                </DetailRow>
                <DetailRow label="Valeur face à la référence sans marge">
                  {formatPercent(comparison?.fair, true)}
                </DetailRow>
              </dl>
            ))}
          </section>
        )}

      <div className="view-grid">
        <section className="panel panel-pad">
          <h3>Provenance et temporalité</h3>
          <dl className="detail-list">
            <DetailRow label="Identifiant source">
              {pick.sourceId || "Non fourni"}
            </DetailRow>
            <DetailRow label="Publication originale">
              <SourceLink url={pick.sourceUrl} />
            </DetailRow>
            <DetailRow label="Publication annoncée">
              {formatDateTime(pick.publishedAt)}
            </DetailRow>
            <DetailRow label="Première observation enregistrée">
              {formatDateTime(pick.observedAt)}
            </DetailRow>
            <DetailRow label="Début de l’événement">
              {formatDateTime(pick.startsAt)}
            </DetailRow>
            <DetailRow label="Règlement">
              {formatDateTime(pick.settledAt)}
            </DetailRow>
            <DetailRow label="Source du règlement">
              {pick.settlementSource || "Non renseignée"}
            </DetailRow>
            <DetailRow label="Référence interne">
              <code className="reference-code">{pick.id}</code>
            </DetailRow>
          </dl>
        </section>

        <section className="panel panel-pad">
          <h3>Limites et informations manquantes</h3>
          {missingInformation.length > 0 ? (
            <ul className="analysis-limitations">
              {missingInformation.map((information) => (
                <li key={information}>{information}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Les champs nécessaires sont présents. Leur présence ne constitue
              pas une preuve de rentabilité.
            </p>
          )}
          <p className="muted">
            Les états expirés et indisponibles restent dans l’historique de
            reproductibilité. Les résultats passés n’établissent aucune
            probabilité prédictive pour ce pari.
          </p>
        </section>
      </div>

      <details className="panel panel-pad">
        <summary>
          Contenu initial archivé et modifications ({pick.revisions.length})
        </summary>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            fontSize: 11,
            marginTop: 14,
          }}
        >
          {pick.initialContent || "Contenu initial non fourni."}
        </pre>
        {pick.revisions.map((revision, index) => (
          <details key={`${revision.at}:${index}`} style={{ marginTop: 12 }}>
            <summary>
              {formatDateTime(revision.at)} · {revision.description}
            </summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontSize: 10,
              }}
            >
              {JSON.stringify(revision.previous, null, 2)}
            </pre>
          </details>
        ))}
      </details>

      {pick.notes && <p className="notice">Note personnelle : {pick.notes}</p>}

      <div className="form-actions" style={{ marginTop: 0 }}>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => onOpenForm("pick", { ...pick })}
        >
          <Settings2 size={14} />
          Modifier / régler
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={openManualQuote}
        >
          <Plus size={14} />
          Observer une cote
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={() =>
            onOpenForm("simulation", {
              pickIds: [pick.id],
              ...(analysis.matchingStrategies[0]
                ? { strategyId: analysis.matchingStrategies[0].id }
                : {}),
            })
          }
        >
          <FlaskConical size={14} />
          Simuler
        </button>
        <button
          className="button button-primary"
          type="button"
          onClick={() =>
            onOpenForm("ticket", {
              pickId: pick.id,
              event: pick.event,
              eventKey: pick.eventKey,
              market: pick.market,
              selection: pick.selection,
              line: pick.line,
              rules: pick.rules,
              kind: pick.kind,
            })
          }
        >
          <Plus size={14} />
          Saisir un ticket accepté
        </button>
      </div>
    </div>
  );
}
