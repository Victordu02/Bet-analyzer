"use client";

import type { ReactNode } from "react";
import type { Allocation, AppState, Quote, Simulation } from "@/domain/types";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
} from "./analysis-ui";

export interface SavedSimulationDetailProps {
  simulation: Simulation;
  state: AppState;
  onOpenPick: (id: string) => void;
}

const METHOD_LABELS: Record<Simulation["method"], string> = {
  fixed: "Mise fixe",
  percent: "Pourcentage du capital",
  kelly: "Kelly fractionné",
};

const PROBABILITY_LABELS = {
  manual: "Hypothèse manuelle",
  market: "Référence de marché archivée",
  model: "Estimation de modèle archivée",
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function canonicalIdentity(allocation: Allocation) {
  try {
    const values: unknown = JSON.parse(allocation.identity);
    if (
      !Array.isArray(values) ||
      values.length !== 6 ||
      !values.every((value) => typeof value === "string")
    )
      return null;
    const [eventKey, market, selection, line, rules, kind] = values as string[];
    return { eventKey, market, selection, line, rules, kind };
  } catch {
    return null;
  }
}

function sourceUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function ArchivedQuote({ quote }: { quote: Quote }) {
  const snapshot = quote.identitySnapshot;
  const href = sourceUrl(quote.sourceUrl);
  return (
    <details>
      <summary>Relevé conservé : {quote.id}</summary>
      <dl className="analysis-definition-grid">
        <Fact label="Bookmaker">{quote.bookmaker}</Fact>
        <Fact label="Cote relevée">{formatNumber(quote.odds)}</Fact>
        <Fact label="Source">{quote.source || "Non renseignée"}</Fact>
        <Fact label="Référence de la source">
          {href ? (
            <a
              className="text-link"
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              Consulter la référence
            </a>
          ) : (
            quote.sourceUrl || "Non renseignée"
          )}
        </Fact>
        <Fact label="Observation / collecte">
          {formatDateTime(quote.observedAt)}
        </Fact>
        <Fact label="Enregistrement">{formatDateTime(quote.recordedAt)}</Fact>
        <Fact label="Dernière mise à jour fournisseur">
          {formatDateTime(quote.providerLastUpdatedAt)}
        </Fact>
        <Fact label="Disponibilité déclarée dans ce relevé">
          {quote.available ? "Disponible" : "Indisponible"}
        </Fact>
        <Fact label="Correspondance confirmée">
          {quote.matchConfirmed ? "Oui" : "Non"}
        </Fact>
        <Fact label="Nature du relevé">
          {quote.closing ? "Cote de clôture" : "Observation avant décision"}
        </Fact>
      </dl>
      {snapshot ? (
        <>
          <h5>Identité archivée au relevé</h5>
          <dl className="analysis-definition-grid">
            <Fact label="Événement">{snapshot.event}</Fact>
            <Fact label="Clé d’événement">{snapshot.eventKey}</Fact>
            <Fact label="Début">{formatDateTime(snapshot.startsAt)}</Fact>
            <Fact label="Marché / sélection">
              {snapshot.market} · {snapshot.selection}
            </Fact>
            <Fact label="Ligne">{snapshot.line || "Sans ligne"}</Fact>
            <Fact label="Règles">{snapshot.rules || "Non renseignées"}</Fact>
            <Fact label="Type">
              {snapshot.kind === "single" ? "Simple" : "Combiné"}
            </Fact>
            <Fact label="Moment">
              {snapshot.timing === "prematch" ? "Avant-match" : "Live"}
            </Fact>
          </dl>
        </>
      ) : (
        <p className="muted">
          L’identité complète n’était pas archivée avec ce relevé. Les libellés
          actuels ne sont pas substitués aux données manquantes.
        </p>
      )}
      {quote.provider && (
        <p className="muted">
          Fournisseur : {quote.provider.id} · événement {quote.provider.eventId}{" "}
          · marché {quote.provider.marketKey} · sélection{" "}
          {quote.provider.outcomeName}.
        </p>
      )}
      {quote.notes && <p>{quote.notes}</p>}
      <p className="muted">
        Ce relevé documente les données conservées. La présence d’une cote ne
        prouve ni l’éligibilité de la ligne ni l’acceptation d’un ticket.
      </p>
    </details>
  );
}

export function SavedSimulationDetail({
  simulation,
  state,
  onOpenPick,
}: SavedSimulationDetailProps) {
  const comparison = simulation.comparisonSnapshot;
  const account = simulation.bankrollSnapshot ?? comparison?.bankrollSnapshot;
  const settings = simulation.settingsSnapshot;
  const budget = comparison?.budget;
  const positiveAllocations = simulation.allocations.filter(
    (allocation) => allocation.stakeCents > 0,
  );
  const totalStakeCents = simulation.allocations.reduce(
    (total, allocation) => total + allocation.stakeCents,
    0,
  );
  const expectedCents =
    positiveAllocations.length > 0 &&
    positiveAllocations.every((allocation) => allocation.expectedCents !== null)
      ? positiveAllocations.reduce(
          (total, allocation) => total + allocation.expectedCents!,
          0,
        )
      : null;

  function downloadSnapshot() {
    const file = new Blob([JSON.stringify(simulation, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `simulation-${simulation.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack">
      <section className="panel panel-pad">
        <div className="section-heading">
          <div>
            <span className="badge badge-muted">
              SIMULÉ SUR WINAMAX · NON EXÉCUTÉ
            </span>
            <h3>{simulation.name}</h3>
            <p className="muted">
              Conservé le {formatDateTime(simulation.createdAt)} ·{" "}
              {METHOD_LABELS[simulation.method]}
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={downloadSnapshot}
          >
            Exporter ce scénario
          </button>
        </div>
        <div className="three-grid">
          <div className="calculation-output">
            <small>Mises simulées conservées</small>
            <strong>{formatMoney(totalStakeCents)}</strong>
          </div>
          <div className="calculation-output">
            <small>Espérance des allocations positives</small>
            <strong>
              {expectedCents === null
                ? "Inconnue"
                : formatMoney(expectedCents, true)}
            </strong>
          </div>
          <div className="calculation-output">
            <small>Lignes positives / sans mise</small>
            <strong>
              {positiveAllocations.length} /{" "}
              {simulation.allocations.length - positiveAllocations.length}
            </strong>
          </div>
        </div>
        <p className="notice">
          Les montants et hypothèses ci-dessous sont ceux enregistrés avec le
          scénario. Cette consultation ne recalcule aucune allocation avec le
          portefeuille actuel et ne crée aucun mouvement financier.
        </p>
        <h4>Hypothèses conservées</h4>
        <p>
          {simulation.assumptions ||
            "Aucune note d’hypothèse conservée dans ce scénario."}
        </p>
        <p className="muted">
          Référence du scénario : {simulation.id}. Stratégie associée :{" "}
          {simulation.strategyId || "Aucune affectation unique"}. Les dates sont
          affichées à l’heure de Paris.
        </p>
      </section>

      <section className="panel panel-pad">
        <h4>Portefeuille et paramètres au calcul</h4>
        {account ? (
          <dl className="analysis-definition-grid">
            <Fact label="Capital de référence">
              {formatMoney(account.capitalCents)}
            </Fact>
            <Fact label="Cash disponible">
              {formatMoney(account.cashCents)}
            </Fact>
            <Fact label="Coût des positions cash ouvertes">
              {formatMoney(account.openStakeCents)}
            </Fact>
            <Fact label="Coût ouvert incertain">
              {account.uncertainOpenCost
                ? "Oui : une abstention doit être conservée"
                : "Non signalé"}
            </Fact>
          </dl>
        ) : (
          <p className="notice notice-warning">
            État initial du portefeuille non conservé dans cet ancien scénario :
            capital, cash et exposition au calcul sont non applicables. Le solde
            actuel n’est pas utilisé pour les reconstituer.
          </p>
        )}
        <dl className="analysis-definition-grid">
          <Fact label="Mise fixe configurée">
            {formatMoney(settings.fixedStakeCents)}
          </Fact>
          <Fact label="Pourcentage du capital">
            {formatPercent(settings.stakePercent)}
          </Fact>
          <Fact label="Fraction de Kelly">
            {formatPercent(settings.kellyFraction)}
          </Fact>
          <Fact label="Plafond par pari">
            {formatPercent(settings.maxBetPercent)}
          </Fact>
          <Fact label="Plafond par événement">
            {formatPercent(settings.maxEventPercent)}
          </Fact>
          <Fact label="Plafond global d’exposition">
            {formatPercent(settings.maxExposurePercent)}
          </Fact>
          <Fact label="Limite de pertes quotidienne">
            {formatMoney(settings.dailyLossLimitCents)}
          </Fact>
          <Fact label="Limite de pertes mensuelle">
            {formatMoney(settings.monthlyLossLimitCents)}
          </Fact>
          <Fact label="Suggestions en pause">
            {settings.paused ? "Oui" : "Non"}
          </Fact>
          <Fact label="Ancienneté maximale des cotes">
            {settings.quoteMaxAgeMinutes} minutes
          </Fact>
        </dl>
        <p className="muted">
          Le capital de référence est le cash plus le coût restant des positions
          cash ouvertes. Une fraction de Kelly et des plafonds configurés ne
          constituent pas une garantie de gain.
        </p>
      </section>

      <section className="panel panel-pad">
        <h4>Budget commun archivé</h4>
        {budget ? (
          <>
            <dl className="analysis-definition-grid">
              <Fact label="Budget disponible pour de nouvelles mises">
                {formatMoney(budget.availableForNewStakesCents)}
              </Fact>
              <Fact label="Plafond monétaire par pari">
                {formatMoney(budget.betLimitCents)}
              </Fact>
              <Fact label="Plafond monétaire par événement">
                {formatMoney(budget.eventLimitCents)}
              </Fact>
              <Fact label="Plafond monétaire d’exposition globale">
                {formatMoney(budget.exposureLimitCents)}
              </Fact>
              <Fact label="Résultat déjà réalisé du jour">
                {formatMoney(budget.realizedDayCents, true)}
              </Fact>
              <Fact label="Résultat déjà réalisé du mois">
                {formatMoney(budget.realizedMonthCents, true)}
              </Fact>
              <Fact label="Budget quotidien avant déduction des positions ouvertes">
                {formatMoney(budget.dailyRemainingCents)}
              </Fact>
              <Fact label="Budget mensuel avant déduction des positions ouvertes">
                {formatMoney(budget.monthlyRemainingCents)}
              </Fact>
            </dl>
            <p className="muted">
              Périodes de Paris : {budget.day} et {budget.month}. L’exposition
              déjà ouverte consomme aussi les budgets de pertes restants.
            </p>
            {budget.blockedReasons.length > 0 && (
              <div className="notice notice-warning">
                <strong>Blocages enregistrés</strong>
                <ul>
                  {budget.blockedReasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="muted">
            Budget détaillé non applicable : aucun instantané de risque n’a été
            conservé dans ce format.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h4>Comparaison des trois méthodes conservée</h4>
            <p className="muted">
              Ces méthodes partent du même portefeuille archivé. Elles sont des
              alternatives ; leurs mises ne s’additionnent pas.
            </p>
          </div>
        </div>
        {comparison ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Méthode</th>
                  <th scope="col">Mise totale</th>
                  <th scope="col">Espérance</th>
                  <th scope="col">Allocations / abstentions</th>
                  <th scope="col">Cash restant</th>
                  <th scope="col">Marge d’exposition</th>
                </tr>
              </thead>
              <tbody>
                {comparison.methods.map((method) => (
                  <tr key={method.method}>
                    <td>
                      {METHOD_LABELS[method.method]}
                      {method.method === simulation.method && (
                        <div>
                          <span className="badge badge-teal">
                            Méthode retenue
                          </span>
                        </div>
                      )}
                    </td>
                    <td>{formatMoney(method.totalStakeCents)}</td>
                    <td>
                      {method.totalExpectedCents === null
                        ? "Inconnue"
                        : formatMoney(method.totalExpectedCents, true)}
                    </td>
                    <td>
                      {method.allocatedCount} / {method.abstainedCount}
                    </td>
                    <td>{formatMoney(method.remainingCashCents)}</td>
                    <td>{formatMoney(method.remainingExposureCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-pad">
            <p className="muted">
              Comparaison non conservée dans cet ancien scénario. Seules les
              allocations de la méthode choisie sont consultables.
            </p>
          </div>
        )}
      </section>

      <section className="panel panel-pad">
        <h4>Allocations de la méthode retenue et sources archivées</h4>
        <p className="muted">
          Les lignes à zéro conservent les abstentions et doublons. Les liens
          vers les sources ouvrent leur dossier actuel ; les libellés
          historiques ci-dessous proviennent uniquement du scénario et de ses
          relevés archivés.
        </p>
        {simulation.allocations.length === 0 && (
          <p className="muted">Aucune allocation conservée.</p>
        )}
        <div className="stack">
          {simulation.allocations.map((allocation, index) => {
            const quotes = (simulation.quoteSnapshots ?? []).filter(
              (quote) => quote.pickId === allocation.pickId,
            );
            const archived = quotes.find(
              (quote) => quote.identitySnapshot,
            )?.identitySnapshot;
            const canonical = canonicalIdentity(allocation);
            const candidate =
              simulation.candidatesSnapshot?.[index]?.pickId ===
              allocation.pickId
                ? simulation.candidatesSnapshot[index]
                : simulation.candidatesSnapshot?.find(
                    (entry) => entry.pickId === allocation.pickId,
                  );
            const group = comparison?.groups.find(
              (entry) => entry.identity === allocation.identity,
            );
            const sourceExists = state.picks.some(
              (pick) => pick.id === allocation.pickId,
            );
            return (
              <article
                className="simulation-basket-item"
                key={`${allocation.pickId}-${index}`}
              >
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      SOURCE {index + 1} ·{" "}
                      {allocation.stakeCents > 0
                        ? "ALLOCATION SIMULÉE"
                        : "AUCUNE MISE"}
                    </p>
                    <h5>
                      {archived?.event ||
                        canonical?.eventKey ||
                        allocation.eventKey ||
                        allocation.pickId}
                    </h5>
                    <p>
                      {archived?.market ||
                        canonical?.market ||
                        "Marché non archivé"}{" "}
                      ·{" "}
                      {archived?.selection ||
                        canonical?.selection ||
                        "Sélection non archivée"}
                    </p>
                  </div>
                  {sourceExists && (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => onOpenPick(allocation.pickId)}
                    >
                      Ouvrir la source actuelle
                    </button>
                  )}
                </div>
                {!archived && (
                  <p className="muted">
                    Libellés issus de l’identité canonique conservée ; le nom
                    complet et la date d’événement ne sont pas archivés dans ce
                    format.
                  </p>
                )}
                <dl className="analysis-definition-grid">
                  <Fact label="Mise simulée">
                    {formatMoney(allocation.stakeCents)}
                  </Fact>
                  <Fact label="Cote de l’allocation">
                    {allocation.odds > 1
                      ? formatNumber(allocation.odds)
                      : "Non applicable"}
                  </Fact>
                  <Fact label="Espérance monétaire">
                    {allocation.expectedCents === null
                      ? "Inconnue"
                      : formatMoney(allocation.expectedCents, true)}
                  </Fact>
                  <Fact label="Probabilité conservée">
                    {allocation.probability === null
                      ? "Inconnue"
                      : formatPercent(allocation.probability)}
                  </Fact>
                  <Fact label="Provenance probabiliste">
                    {allocation.probabilitySource
                      ? PROBABILITY_LABELS[allocation.probabilitySource]
                      : "Non fournie"}
                  </Fact>
                  <Fact label="Ligne / règles">
                    {archived?.line || canonical?.line || "Sans ligne"} ·{" "}
                    {archived?.rules ||
                      canonical?.rules ||
                      "Règles non archivées"}
                  </Fact>
                </dl>
                <p>
                  <strong>Décision conservée :</strong>{" "}
                  {allocation.reason || "Aucun motif enregistré."}
                </p>
                <p>
                  <strong>Fondement probabiliste conservé :</strong>{" "}
                  {candidate?.basis ||
                    "Non renseigné dans ce scénario. Aucune estimation n’est reconstruite."}
                </p>
                {group && (
                  <details>
                    <summary>
                      {group.pickIds.length} sources regroupées pour cette
                      sélection
                    </summary>
                    <p className="muted">
                      La multiplicité des sources ne constitue pas une
                      confirmation statistique indépendante et n’augmente pas la
                      mise.
                    </p>
                    <dl className="analysis-definition-grid">
                      <Fact label="Pronostics">
                        {group.pickIds.join(" · ")}
                      </Fact>
                      <Fact label="Identifiants des tipsters">
                        {group.tipsterIds.join(" · ") || "Non conservés"}
                      </Fact>
                      <Fact label="Références sources">
                        {group.sourceIds.filter(Boolean).join(" · ") ||
                          "Non conservées"}
                      </Fact>
                    </dl>
                  </details>
                )}
                {quotes.length > 0 ? (
                  quotes.map((quote, quoteIndex) => (
                    <ArchivedQuote
                      key={`${quote.id}-${quoteIndex}`}
                      quote={quote}
                    />
                  ))
                ) : (
                  <p className="muted">
                    Aucun relevé archivé pour cette ligne. La cote et les
                    horodatages actuels ne sont pas utilisés pour compléter son
                    historique.
                  </p>
                )}
                <p className="muted">
                  Pronostic : {allocation.pickId} · événement :{" "}
                  {allocation.eventKey || "Non conservé"}.
                </p>
                <details>
                  <summary>Identité exacte conservée</summary>
                  <p className="muted">
                    {allocation.identity || "Non conservée"}
                  </p>
                </details>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
