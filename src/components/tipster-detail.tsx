"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Plus, Settings2 } from "lucide-react";
import type { AppState, Tipster } from "../domain/types";
import { analyzeTipsters, type ProofLevel } from "../domain/tipster-analysis";
import {
  AnalysisChart,
  AnalysisConventions,
  AnalysisMetricsGrid,
  ProofSelector,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatUnits,
} from "./analysis-ui";

type TipsterProfileProps = {
  tipster: Tipster;
  state: AppState;
  initialProof?: ProofLevel;
  initialSimulationId?: string;
  onEdit: () => void;
  onAddPick: () => void;
  onOpenPick: (id: string) => void;
  onOpenReference: (id: string) => void;
};

const PROOF_DESCRIPTION: Record<ProofLevel, string> = {
  declared:
    "Historique déclaré par la source. Une date de publication fournie après l’événement ne constitue pas une observation prospective.",
  observed:
    "Pronostics enregistrés avant l’événement avec des horodatages cohérents. Le résultat décrit uniquement cette population observée.",
  simulated:
    "Allocations d’un scénario Winamax sauvegardé. Les cotes observées et les montants simulés ne prouvent aucune exécution réelle.",
  executed:
    "Tickets réellement acceptés et rattachés à ce profil. Les mises, frais et retours proviennent des tickets conservés.",
};

function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function profileInitials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function TipsterProfile({
  tipster,
  state,
  initialProof = "declared",
  initialSimulationId = "",
  onEdit,
  onAddPick,
  onOpenPick,
  onOpenReference,
}: TipsterProfileProps) {
  const [level, setLevel] = useState<ProofLevel>(initialProof);
  const [simulationId, setSimulationId] = useState(initialSimulationId);

  const analysis = useMemo(() => {
    const rows = analyzeTipsters(state, {
      level,
      filter: { tipsterId: tipster.id },
      ...(level === "simulated" && simulationId ? { simulationId } : {}),
    });
    return rows.find((row) => row.tipster.id === tipster.id);
  }, [state, tipster.id, level, simulationId]);

  const picksById = useMemo(
    () => new Map(state.picks.map((pick) => [pick.id, pick])),
    [state.picks],
  );

  const availableSimulations = useMemo(
    () =>
      state.simulations.filter((simulation) =>
        simulation.allocations.some(
          (allocation) =>
            picksById.get(allocation.pickId)?.tipsterId === tipster.id,
        ),
      ),
    [state.simulations, picksById, tipster.id],
  );

  const sourceUrl = safeSourceUrl(tipster.sourceUrl);
  const metrics = analysis?.metrics;
  const selectedPicks =
    metrics?.pickIds.flatMap((id) => {
      const pick = picksById.get(id);
      return pick ? [pick] : [];
    }) ?? [];
  const supportingReferences =
    metrics?.references.filter((reference) => {
      const id = reference.replace(
        /^(pick|ticket|simulation|quote|strategy|ledger):/,
        "",
      );
      return !picksById.has(id);
    }) ?? [];

  function referenceLabel(reference: string): string {
    const id = reference.replace(
      /^(pick|ticket|simulation|quote|strategy|ledger):/,
      "",
    );
    const ticket = state.tickets.find((item) => item.id === id);
    if (ticket)
      return `Ticket ${ticket.sourceId || ticket.id} · ${ticket.event}`;

    const simulation = state.simulations.find((item) => item.id === id);
    if (simulation) return `Simulation · ${simulation.name}`;

    const quote = state.quotes.find((item) => item.id === id);
    if (quote) return `Relevé Winamax · ${formatDateTime(quote.observedAt)}`;

    const strategy = state.strategies.find((item) => item.id === id);
    if (strategy) return `Stratégie · ${strategy.name}`;

    return `Référence · ${id}`;
  }

  return (
    <div className="stack tipster-profile">
      <div className="tipster-hero">
        <span className="avatar" aria-hidden="true">
          {profileInitials(tipster.name)}
        </span>
        <div>
          <h2>{tipster.name}</h2>
          <p className="muted">
            {tipster.source || "Source non renseignée"} ·{" "}
            {tipster.active
              ? "Profil suivi"
              : "Profil inactif, historique conservé"}
          </p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={onEdit}
        >
          <Settings2 size={14} />
          Modifier
        </button>
      </div>

      <section className="panel panel-pad">
        <h3>Choisir la population analysée</h3>
        <ProofSelector
          value={level}
          onChange={setLevel}
          counts={analysis?.proofCounts}
          label="Niveau de preuve de la fiche"
        />
        <p className="muted">{PROOF_DESCRIPTION[level]}</p>

        {level === "simulated" && (
          <label className="field" style={{ marginTop: 16 }}>
            <span>Scénario Winamax</span>
            <select
              value={simulationId}
              onChange={(event) => setSimulationId(event.target.value)}
            >
              <option value="">Choisir un scénario</option>
              {availableSimulations.map((simulation) => (
                <option key={simulation.id} value={simulation.id}>
                  {simulation.name} · {formatDateTime(simulation.createdAt)}
                </option>
              ))}
            </select>
            <small>
              Chaque scénario possède son propre périmètre. Les résultats de
              plusieurs simulations ne sont jamais additionnés.
            </small>
          </label>
        )}
      </section>

      {metrics ? (
        <>
          <p className="notice" role="status">
            {metrics.message}
          </p>
          <AnalysisMetricsGrid metrics={metrics} />

          <section className="panel panel-pad">
            <h3>Mesures complémentaires de cette population</h3>
            <dl className="detail-list">
              <div className="detail-line">
                <dt>Taux de réussite</dt>
                <dd>{formatPercent(metrics.winRate)}</dd>
              </div>
              {(level === "declared" || level === "observed") && (
                <div className="detail-line">
                  <dt>P&amp;L aux mises déclarées</dt>
                  <dd>{formatUnits(metrics.declaredProfitUnits)}</dd>
                </div>
              )}
              {(level === "simulated" || level === "executed") && (
                <div className="detail-line">
                  <dt>
                    {level === "executed"
                      ? "Mises cash réglées couvertes"
                      : "Mises simulées réglées couvertes"}
                  </dt>
                  <dd>{formatMoney(metrics.stakeCents)}</dd>
                </div>
              )}
              {(level === "executed" || level === "simulated") && (
                <div className="detail-line">
                  <dt>
                    {level === "executed"
                      ? "Résultat cash net des frais de tickets"
                      : "Résultat simulé des allocations réglées"}
                  </dt>
                  <dd>{formatMoney(metrics.cashProfitCents, true)}</dd>
                </div>
              )}
            </dl>
            <p className="muted">
              Le taux de réussite porte sur les tickets standards gagnés ou
              perdus, hors annulations.
              {(level === "declared" || level === "observed") &&
                " Le P&L aux mises déclarées est recalculé depuis les mises fournies ; il ne reproduit pas un classement officiel de plateforme."}
            </p>
          </section>

          <section className="panel panel-pad">
            <h3>Trajectoire de la population sélectionnée</h3>
            <AnalysisChart
              points={metrics.series}
              unit="u"
              onOpenPick={onOpenPick}
              emptyText="Aucune trajectoire standardisée disponible pour cette population. Les données manquantes et les exclusions restent indiquées."
            />
            <AnalysisConventions metrics={metrics} level={level} />
          </section>
        </>
      ) : (
        <p className="notice" role="status">
          Aucune analyse disponible pour ce profil dans la population
          sélectionnée.
        </p>
      )}

      <section className="panel panel-pad">
        <h3>Source, accès et couverture documentée</h3>
        <p className="muted">
          Ces informations décrivent le dossier complet du profil. Les
          observations prospectives couvrent la période entre la première et la
          dernière collecte conservées.
        </p>
        <dl className="detail-list">
          <div className="detail-line">
            <dt>Pseudonyme</dt>
            <dd>{tipster.name}</dd>
          </div>
          <div className="detail-line">
            <dt>Source</dt>
            <dd>
              {tipster.source || "Non renseignée"}
              {sourceUrl && (
                <a
                  className="text-link"
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ marginLeft: 8 }}
                >
                  Consulter <ArrowUpRight size={12} />
                </a>
              )}
            </dd>
          </div>
          <div className="detail-line">
            <dt>Découverte du profil</dt>
            <dd>{formatDateTime(tipster.discoveredAt)}</dd>
          </div>
          <div className="detail-line">
            <dt>Première et dernière observations prospectives</dt>
            <dd>
              {analysis?.observationFrom && analysis.observationTo
                ? `${formatDate(analysis.observationFrom)} au ${formatDate(analysis.observationTo)}`
                : "Aucune période d’observation documentée"}
            </dd>
          </div>
          <div className="detail-line">
            <dt>Durée documentée</dt>
            <dd>
              {analysis?.observationDays == null
                ? "Non applicable"
                : `${formatNumber(analysis.observationDays, 1)} jours`}
            </dd>
          </div>
          <div className="detail-line">
            <dt>Sports couverts</dt>
            <dd>{analysis?.sports.join(", ") || "Non renseignés"}</dd>
          </div>
          <div className="detail-line">
            <dt>Compétitions couvertes</dt>
            <dd>{analysis?.competitions.join(", ") || "Non renseignées"}</dd>
          </div>
          <div className="detail-line">
            <dt>Marchés couverts</dt>
            <dd>{analysis?.markets.join(", ") || "Non renseignés"}</dd>
          </div>
          <div className="detail-line">
            <dt>Bankrolls publiques connues</dt>
            <dd>{tipster.bankrolls.join(", ") || "Non renseignées"}</dd>
          </div>
          <div className="detail-line">
            <dt>Conditions d’accès</dt>
            <dd>{tipster.accessNotes || "Non précisées"}</dd>
          </div>
          <div className="detail-line">
            <dt>Coût mensuel indicatif</dt>
            <dd>{formatMoney(tipster.monthlyCostCents)}</dd>
          </div>
        </dl>
        <p className="muted">
          Les bankrolls publiques appartiennent au profil. Le coût d’accès est
          informatif : seul un frais effectivement enregistré est déduit du
          portefeuille personnel, une seule fois.
        </p>
      </section>

      <section className="panel panel-pad">
        <h3>Qualité et limites des données</h3>
        <p className="muted">
          Lacunes du dossier source complet, indépendamment du niveau de preuve
          sélectionné pour les résultats.
        </p>
        <p className="notice notice-warning">
          {tipster.completeness === "unknown"
            ? "Exhaustivité non vérifiable."
            : "Historique déclaré complet par la source, sans vérification indépendante."}{" "}
          Les lacunes ne permettent pas de conclure à une fraude. Un classement
          ou une courbe ne prouve ni un statut professionnel ni un avantage
          prédictif.
        </p>
        {analysis && (
          <>
            <dl className="detail-list">
              <div className="detail-line">
                <dt>Provenance incomplète</dt>
                <dd>{formatNumber(analysis.quality.missingSource, 0)}</dd>
              </div>
              <div className="detail-line">
                <dt>Preuve de règlement manquante</dt>
                <dd>{formatNumber(analysis.quality.missingSettlement, 0)}</dd>
              </div>
              <div className="detail-line">
                <dt>Historique recueilli après événement</dt>
                <dd>{formatNumber(analysis.quality.postEvent, 0)}</dd>
              </div>
              <div className="detail-line">
                <dt>Pronostics corrigés</dt>
                <dd>{formatNumber(analysis.quality.corrected, 0)}</dd>
              </div>
            </dl>
            {analysis.quality.issues.length > 0 && (
              <ul className="analysis-limitations">
                {analysis.quality.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </>
        )}
        {tipster.notes && (
          <p className="notice">Notes du dossier : {tipster.notes}</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Pronostics du périmètre sélectionné</h3>
            <p>
              Ouvrez une fiche pour retrouver le contenu initial, les
              horodatages, la source du résultat et les révisions conservées.
            </p>
          </div>
          <button className="text-link" type="button" onClick={onAddPick}>
            <Plus size={14} /> Ajouter
          </button>
        </div>
        {selectedPicks.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Pronostic source</th>
                  <th scope="col">Publication annoncée</th>
                  <th scope="col">Observation enregistrée</th>
                  <th scope="col">Référence source</th>
                </tr>
              </thead>
              <tbody>
                {selectedPicks.map((pick) => (
                  <tr key={pick.id}>
                    <td>
                      <button
                        className="table-button"
                        type="button"
                        onClick={() => onOpenPick(pick.id)}
                      >
                        {pick.event}
                      </button>
                      <small>
                        {pick.market} · {pick.selection}
                        {pick.line ? ` · ${pick.line}` : ""}
                      </small>
                    </td>
                    <td>{formatDateTime(pick.publishedAt)}</td>
                    <td>{formatDateTime(pick.observedAt)}</td>
                    <td>{pick.sourceId || "Non fournie"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mini-empty">
            Aucun pronostic source dans cette population. Les autres niveaux de
            preuve restent consultables séparément.
          </p>
        )}
      </section>

      {supportingReferences.length > 0 && (
        <section className="panel panel-pad">
          <h3>Justificatifs de cette analyse</h3>
          <div className="stack" style={{ gap: 10, marginTop: 14 }}>
            {supportingReferences.map((id) => (
              <button
                key={id}
                className="text-link"
                type="button"
                onClick={() => onOpenReference(id)}
              >
                {referenceLabel(id)} <ArrowUpRight size={12} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
