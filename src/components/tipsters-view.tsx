"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Filter,
  Plus,
  Users,
} from "lucide-react";
import type { AppState } from "@/domain/types";
import {
  analyzeTipsters,
  type AnalysisQuery,
  type ProofLevel,
  type TipsterAnalysis,
} from "@/domain/tipster-analysis";
import {
  AnalysisChart,
  AnalysisConventions,
  PROOF_OPTIONS,
  ProofSelector,
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  formatUnits,
} from "@/components/analysis-ui";

interface TipstersViewProps {
  state: AppState;
  search?: string;
  onOpenTipster: (
    id: string,
    level?: ProofLevel,
    simulationId?: string,
  ) => void;
  onOpenPick: (id: string) => void;
  onCreateTipster: () => void;
  onExploreTipster: (id: string, level: ProofLevel) => void;
}

type SortKey =
  | "name"
  | "declared"
  | "profit"
  | "yield"
  | "volume"
  | "odds"
  | "drawdown"
  | "concentration";
type ProfileStatus = "all" | "active" | "inactive";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "profit", label: "P&L standardisé à 1 u" },
  { value: "declared", label: "P&L aux mises déclarées" },
  { value: "yield", label: "Rendement standardisé" },
  { value: "volume", label: "Nombre de paris" },
  { value: "odds", label: "Cote moyenne" },
  { value: "drawdown", label: "Drawdown en unités" },
  { value: "concentration", label: "Concentration des gains" },
  { value: "name", label: "Pseudonyme" },
];

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((first, second) =>
    first.localeCompare(second, "fr"),
  );
}

function initials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/** Date filters represent complete calendar days in Paris, including daylight-saving changes. */
function parisDayBoundary(value: string, nextDay = false): string | undefined {
  if (!value) return undefined;
  const requested = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(requested.getTime())) return undefined;
  if (nextDay) requested.setUTCDate(requested.getUTCDate() + 1);
  const target = requested.getTime();
  let candidate = target;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const part = (name: string) =>
      parts.find((item) => item.type === name)?.value ?? "";
    const represented = Date.parse(
      `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}Z`,
    );
    candidate += target - represented;
  }

  return new Date(candidate).toISOString();
}

function metricSortValue(
  row: TipsterAnalysis,
  key: Exclude<SortKey, "name">,
): number | null {
  switch (key) {
    case "declared":
      return row.metrics.declaredProfitUnits;
    case "profit":
      return row.metrics.profitUnits;
    case "yield":
      return row.metrics.yield;
    case "volume":
      return row.metrics.count;
    case "odds":
      return row.metrics.averageOdds;
    case "drawdown":
      return row.metrics.maxDrawdownUnits;
    case "concentration":
      return row.metrics.biggestWinShare;
  }
}

export function TipstersView({
  state,
  search = "",
  onOpenTipster,
  onOpenPick,
  onCreateTipster,
  onExploreTipster,
}: TipstersViewProps) {
  const [level, setLevel] = useState<ProofLevel>("declared");
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("all");
  const [localSearch, setLocalSearch] = useState("");
  const [sport, setSport] = useState("");
  const [market, setMarket] = useState("");
  const [ticketKind, setTicketKind] = useState<"" | "single" | "accumulator">(
    "",
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [simulationId, setSimulationId] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("profit");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [chartTipsterId, setChartTipsterId] = useState("");

  const invalidPeriod = from !== "" && to !== "" && to < from;
  const query = useMemo<AnalysisQuery>(
    () => ({
      level,
      filter: {
        sport: sport || undefined,
        market: market || undefined,
        kind: ticketKind || undefined,
      },
      from: parisDayBoundary(from),
      to: parisDayBoundary(to, true),
      simulationId:
        level === "simulated" && simulationId ? simulationId : undefined,
    }),
    [level, sport, market, ticketKind, from, to, simulationId],
  );

  const allRows = useMemo(() => analyzeTipsters(state, query), [state, query]);
  const rows = useMemo(() => {
    if (invalidPeriod) return [];
    const searchTerms = [search, localSearch]
      .map((term) => term.trim().toLocaleLowerCase("fr-FR"))
      .filter(Boolean);
    const filtered = allRows.filter((row) => {
      if (profileStatus === "active" && !row.tipster.active) return false;
      if (profileStatus === "inactive" && row.tipster.active) return false;
      const searchable =
        `${row.tipster.name} ${row.tipster.source} ${row.sports.join(" ")} ${row.markets.join(" ")}`.toLocaleLowerCase(
          "fr-FR",
        );
      return searchTerms.every((term) => searchable.includes(term));
    });

    return filtered.sort((first, second) => {
      if (sortKey === "name") {
        const comparison = first.tipster.name.localeCompare(
          second.tipster.name,
          "fr",
        );
        return sortDirection === "asc" ? comparison : -comparison;
      }
      const firstValue = metricSortValue(first, sortKey);
      const secondValue = metricSortValue(second, sortKey);
      if (firstValue === null && secondValue === null)
        return first.tipster.name.localeCompare(second.tipster.name, "fr");
      if (firstValue === null) return 1;
      if (secondValue === null) return -1;
      const comparison = firstValue - secondValue;
      return (
        (sortDirection === "asc" ? comparison : -comparison) ||
        first.tipster.name.localeCompare(second.tipster.name, "fr")
      );
    });
  }, [
    allRows,
    invalidPeriod,
    localSearch,
    search,
    profileStatus,
    sortKey,
    sortDirection,
  ]);

  const selectedRow =
    rows.find((row) => row.tipster.id === chartTipsterId) ?? rows[0];
  const proofCounts = allRows.reduce<Record<ProofLevel, number>>(
    (counts, row) => ({
      declared: counts.declared + row.proofCounts.declared,
      observed: counts.observed + row.proofCounts.observed,
      simulated: counts.simulated + row.proofCounts.simulated,
      executed: counts.executed + row.proofCounts.executed,
    }),
    { declared: 0, observed: 0, simulated: 0, executed: 0 },
  );
  const selectedProof = PROOF_OPTIONS.find((option) => option.value === level)!;
  const referenceTimestamp =
    level === "executed"
      ? "prise du ticket"
      : level === "simulated"
        ? "décision simulée"
        : level === "observed"
          ? "première observation"
          : "publication annoncée";

  function changeSort(nextKey: SortKey) {
    if (nextKey === sortKey)
      setSortDirection((direction) => (direction === "desc" ? "asc" : "desc"));
    else {
      setSortKey(nextKey);
      setSortDirection(nextKey === "name" ? "asc" : "desc");
    }
  }

  function sortableHeader(key: SortKey, label: string, title?: string) {
    const active = sortKey === key;
    return (
      <th
        scope="col"
        aria-sort={
          active
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        <button
          className="analysis-sort-button"
          onClick={() => changeSort(key)}
          title={title}
        >
          {label}
          {active &&
            (sortDirection === "asc" ? (
              <ArrowUp size={11} />
            ) : (
              <ArrowDown size={11} />
            ))}
        </button>
      </th>
    );
  }

  function resetFilters() {
    setProfileStatus("all");
    setLocalSearch("");
    setSport("");
    setMarket("");
    setTicketKind("");
    setFrom("");
    setTo("");
    setSimulationId("");
  }

  return (
    <div className="stack tipsters-analysis-view">
      <section className="panel panel-pad">
        <ProofSelector value={level} onChange={setLevel} counts={proofCounts} />
        {level === "simulated" && (
          <label className="field analysis-scenario-field">
            Scénario Winamax analysé
            <select
              value={simulationId}
              onChange={(event) => setSimulationId(event.target.value)}
            >
              <option value="">
                Sélection automatique si un seul scénario pertinent
              </option>
              {state.simulations.map((simulation) => (
                <option key={simulation.id} value={simulation.id}>
                  {simulation.name} · {formatDate(simulation.createdAt)}
                </option>
              ))}
            </select>
            <small>
              Les résultats de scénarios distincts ne sont jamais additionnés
              dans le classement.
            </small>
          </label>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Classement transparent</h2>
            <p>
              {selectedProof.label} uniquement. Profils inactifs et perdants
              conservés par défaut, sans score global.
            </p>
          </div>
          <span className="badge badge-muted">{rows.length} profils</span>
        </div>
        <div className="analysis-filter-grid">
          <label className="field">
            Rechercher un profil
            <input
              type="search"
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              placeholder="Pseudonyme, source, sport…"
            />
          </label>
          <label className="field">
            Statut du suivi
            <select
              value={profileStatus}
              onChange={(event) =>
                setProfileStatus(event.target.value as ProfileStatus)
              }
            >
              <option value="all">Tous, inactifs compris</option>
              <option value="active">Profils suivis actifs</option>
              <option value="inactive">Profils inactifs</option>
            </select>
          </label>
          <label className="field">
            Sport
            <select
              value={sport}
              onChange={(event) => setSport(event.target.value)}
            >
              <option value="">Tous les sports</option>
              {uniqueValues(allRows.flatMap((row) => row.sports)).map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          <label className="field">
            Marché
            <select
              value={market}
              onChange={(event) => setMarket(event.target.value)}
            >
              <option value="">Tous les marchés</option>
              {uniqueValues(allRows.flatMap((row) => row.markets)).map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          <label className="field">
            Catégorie de ticket
            <select
              value={ticketKind}
              onChange={(event) =>
                setTicketKind(event.target.value as typeof ticketKind)
              }
            >
              <option value="">Simples + combinés, une mise par ticket</option>
              <option value="single">Simples uniquement</option>
              <option value="accumulator">Combinés uniquement</option>
            </select>
          </label>
          <label className="field">
            Du jour (Paris)
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="field">
            Au jour inclus (Paris)
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label className="field">
            Trier par
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Ordre
            <select
              value={sortDirection}
              onChange={(event) =>
                setSortDirection(event.target.value as "asc" | "desc")
              }
            >
              <option value="desc">Décroissant</option>
              <option value="asc">Croissant</option>
            </select>
          </label>
        </div>
        <div className="analysis-filter-note">
          <p className="muted">
            Période filtrée par date de {referenceTimestamp}. Les jours saisis
            sont des jours calendaires Europe/Paris.
          </p>
          <button className="text-link" onClick={resetFilters}>
            <Filter size={12} />
            Réinitialiser les filtres
          </button>
        </div>
        {invalidPeriod && (
          <p
            className="notice notice-error analysis-inline-notice"
            role="alert"
          >
            La fin de période doit être postérieure ou égale au début.
          </p>
        )}
        {rows.length > 0 ? (
          <div
            className="table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Classement des tipsters, tableau défilant horizontalement"
          >
            <table className="data-table analysis-ranking-table">
              <thead>
                <tr>
                  {sortableHeader("name", "Tipster / qualité")}
                  {sortableHeader(
                    "declared",
                    "P&L aux mises déclarées",
                    "Recalculé depuis les mises et résultats fournis ; aucun classement officiel de plateforme n’est reproduit.",
                  )}
                  {sortableHeader("profit", "P&L · 1 u")}
                  {sortableHeader("yield", "Rendement · 1 u")}
                  {sortableHeader("volume", "Paris / événements")}
                  <th scope="col">Période / suivi</th>
                  {sortableHeader("odds", "Cote moyenne")}
                  {sortableHeader("drawdown", "Drawdown · u")}
                  <th scope="col">Dispersion · u</th>
                  {sortableHeader("concentration", "Plus gros gain")}
                  <th scope="col">Incertitude descriptive</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.tipster.id}>
                    <td>
                      <div className="table-name">
                        <span className="avatar">
                          {initials(row.tipster.name)}
                        </span>
                        <div>
                          <button
                            className="table-button"
                            onClick={() =>
                              onOpenTipster(
                                row.tipster.id,
                                level,
                                simulationId || undefined,
                              )
                            }
                          >
                            {row.tipster.name}
                          </button>
                          <small>
                            {row.tipster.source} ·{" "}
                            {row.tipster.active ? "Actif" : "Inactif, conservé"}
                          </small>
                        </div>
                      </div>
                      <small>{row.quality.completeness}</small>
                      <span
                        className={`badge ${row.metrics.status === "insufficient" ? "badge-amber" : "badge-muted"}`}
                      >
                        {row.metrics.status === "insufficient"
                          ? "Données insuffisantes"
                          : "À observer"}
                      </span>
                    </td>
                    <td className="number">
                      {formatUnits(row.metrics.declaredProfitUnits)}
                      {level === "simulated" || level === "executed" ? (
                        <small>
                          Résultat documenté :{" "}
                          {formatMoney(row.metrics.cashProfitCents, true)}
                        </small>
                      ) : (
                        <small>Mises de la source · u</small>
                      )}
                    </td>
                    <td
                      className={`number ${(row.metrics.profitUnits ?? 0) > 0 ? "positive" : (row.metrics.profitUnits ?? 0) < 0 ? "negative" : ""}`}
                    >
                      {formatUnits(row.metrics.profitUnits)}
                    </td>
                    <td className="number">
                      {formatPercent(row.metrics.yield, true)}
                      <small>
                        {row.metrics.settled} tickets standards réglés
                      </small>
                    </td>
                    <td className="number">
                      {row.metrics.count} / {row.metrics.events}
                      <small>
                        {row.metrics.excluded} cas exclus des résultats
                        standards
                      </small>
                    </td>
                    <td>
                      {row.metrics.periodFrom
                        ? `${formatDate(row.metrics.periodFrom)} →`
                        : "Période indisponible"}
                      <small>
                        {row.metrics.periodTo
                          ? formatDate(row.metrics.periodTo)
                          : "Aucune donnée"}
                      </small>
                      <small>
                        Durée du suivi :{" "}
                        {row.observationDays === null
                          ? "Non applicable"
                          : `${formatNumber(row.observationDays, 1)} j`}
                      </small>
                    </td>
                    <td className="number">
                      {formatNumber(row.metrics.averageOdds)}
                    </td>
                    <td className="number">
                      {formatUnits(row.metrics.maxDrawdownUnits, false)}
                      <small>% : non applicable sans capital propre</small>
                    </td>
                    <td className="number">
                      {formatUnits(row.metrics.dispersion, false)}
                    </td>
                    <td className="number">
                      {formatPercent(row.metrics.biggestWinShare)}
                      <small>Part des profits positifs</small>
                    </td>
                    <td>
                      {row.metrics.roiInterval
                        ? `${formatPercent(row.metrics.roiInterval[0])} à ${formatPercent(row.metrics.roiInterval[1])}`
                        : "Données insuffisantes"}
                      <small>Aucun avantage prédictif démontré</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Users size={24} />
            </div>
            <h3>
              {state.tipsters.length
                ? "Aucun profil dans ce périmètre"
                : "Votre référentiel commence ici"}
            </h3>
            <p>
              {state.tipsters.length
                ? "Modifiez les filtres pour retrouver les profils conservés. L’absence de résultat n’est pas assimilée à une performance nulle."
                : "Ajoutez un tipster ou importez un historique autorisé pour commencer une analyse traçable."}
            </p>
            {!state.tipsters.length && (
              <button
                className="button button-primary"
                onClick={onCreateTipster}
              >
                <Plus size={14} />
                Ajouter mon premier tipster
              </button>
            )}
          </div>
        )}
        <div className="panel-footer">
          <span>
            Les cellules non applicables sont placées après les valeurs
            calculables, quel que soit le sens du tri.
          </span>
        </div>
      </section>

      {selectedRow && (
        <section className="panel panel-pad">
          <div className="section-heading">
            <div>
              <div className="eyebrow">UN PROFIL, UN NIVEAU DE PREUVE</div>
              <h2>Lire la trajectoire</h2>
            </div>
            <label className="field analysis-chart-select">
              Profil de la courbe
              <select
                value={selectedRow.tipster.id}
                onChange={(event) => setChartTipsterId(event.target.value)}
              >
                {rows.map((row) => (
                  <option key={row.tipster.id} value={row.tipster.id}>
                    {row.tipster.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <AnalysisChart
            title={`${selectedRow.tipster.name} · ${selectedProof.label}`}
            points={selectedRow.metrics.series}
            onOpenPick={onOpenPick}
          />
          <AnalysisConventions metrics={selectedRow.metrics} level={level} />
          <div className="analysis-profile-actions">
            <button
              className="button button-secondary"
              onClick={() =>
                onOpenTipster(
                  selectedRow.tipster.id,
                  level,
                  simulationId || undefined,
                )
              }
            >
              Consulter la fiche et les sources <ArrowUpRight size={14} />
            </button>
            <button
              className="button button-primary"
              onClick={() => onExploreTipster(selectedRow.tipster.id, level)}
            >
              Explorer ses spécialités <ArrowUpRight size={14} />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/** Compact radar preview uses the declared population only, with no implicit proof mixing. */
export function TipstersPreview({
  state,
  search = "",
  onOpenTipster,
  onCreateTipster,
}: {
  state: AppState;
  search?: string;
  onOpenTipster: (id: string) => void;
  onCreateTipster: () => void;
}) {
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("fr-FR");
    return analyzeTipsters(state, { level: "declared" })
      .filter((row) =>
        `${row.tipster.name} ${row.tipster.source}`
          .toLocaleLowerCase("fr-FR")
          .includes(term),
      )
      .sort((first, second) => {
        if (
          first.metrics.profitUnits === null &&
          second.metrics.profitUnits === null
        )
          return first.tipster.name.localeCompare(second.tipster.name, "fr");
        if (first.metrics.profitUnits === null) return 1;
        if (second.metrics.profitUnits === null) return -1;
        return second.metrics.profitUnits - first.metrics.profitUnits;
      })
      .slice(0, 4);
  }, [state, search]);

  if (!rows.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <Users size={23} />
        </div>
        <h3>Des profils, pas encore de classement</h3>
        <p>
          Le classement décrit uniquement l’historique déclaré. Aucun résultat
          ni score de confiance n’est inventé.
        </p>
        <button className="button button-primary" onClick={onCreateTipster}>
          <Plus size={14} />
          Ajouter un tipster
        </button>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Tipster</th>
            <th scope="col">P&amp;L · 1 u</th>
            <th scope="col">Rendement</th>
            <th scope="col">Paris / événements</th>
            <th scope="col">Preuve</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tipster.id}>
              <td>
                <button
                  className="table-button"
                  onClick={() => onOpenTipster(row.tipster.id)}
                >
                  {row.tipster.name}
                </button>
                <small>
                  {row.tipster.source} ·{" "}
                  {row.tipster.active ? "Suivi" : "Inactif conservé"}
                </small>
              </td>
              <td>{formatUnits(row.metrics.profitUnits)}</td>
              <td>{formatPercent(row.metrics.yield, true)}</td>
              <td>
                {row.metrics.count} / {row.metrics.events}
              </td>
              <td>
                <span className="badge badge-muted">Déclaré uniquement</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
