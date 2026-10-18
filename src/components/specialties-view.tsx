"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  analyzeSegment,
  predefinedSegments,
  strategyAnalysis,
  type AnalysisMetrics,
  type AnalysisQuery,
  type ProofLevel,
  type SegmentAxis,
  type SegmentDefinition,
} from "@/domain/tipster-analysis";
import type { AppState, AuditEntry, SegmentFilter } from "@/domain/types";
import {
  AnalysisChart,
  AnalysisConventions,
  AnalysisMetricsGrid,
  ProofSelector,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatUnits,
} from "./analysis-ui";

export interface SpecialtiesViewProps {
  state: AppState;
  initialFilter?: SegmentFilter;
  initialStrategyId?: string;
  initialProof?: ProofLevel;
  initialPhase?: Phase;
  onOpenPick: (id: string) => void;
  onCreateStrategy: (filter: SegmentFilter) => void;
  onOpenReference?: (reference: string) => void;
  onSaveExploration?: (payload: Record<string, unknown>) => Promise<unknown>;
}

type Phase = "all" | "discovery" | "validation";
type SortKey =
  | "count"
  | "events"
  | "profitUnits"
  | "declaredProfitUnits"
  | "yield"
  | "averageOdds"
  | "maxDrawdownUnits"
  | "dispersion"
  | "biggestWinShare";
type SegmentRow = {
  definition: SegmentDefinition;
  filter: SegmentFilter;
  metrics: AnalysisMetrics;
};
type Exploration = {
  audit: AuditEntry;
  name: string;
  filter: SegmentFilter;
  proof: ProofLevel;
  axis: SegmentAxis;
  phase: Phase;
  strategyId: string | null;
  simulationId: string | null;
  start: string | null;
  end: string | null;
  discoveryEnd: string | null;
};

const PROOF_LABELS: Record<ProofLevel, string> = {
  declared: "Déclaré",
  observed: "Observé avant événement",
  simulated: "Simulé sur Winamax",
  executed: "Exécuté",
};
const PERIOD_FIELDS: Record<ProofLevel, string> = {
  declared: "la date de publication déclarée",
  observed: "la première observation par l’application",
  simulated: "la création du scénario de simulation",
  executed: "la date de placement du ticket réellement accepté",
};
const AXIS_LABELS: Record<SegmentAxis, string> = {
  sport: "Sport",
  competition: "Compétition",
  market: "Marché",
  odds: "Plage de cote",
  kind: "Simple ou combiné",
  timing: "Avant-match ou live",
  delay: "Délai publication → événement",
};
const FILTER_LABELS: Record<keyof SegmentFilter, string> = {
  tipsterId: "Tipster",
  sport: "Sport",
  competition: "Compétition",
  market: "Marché",
  oddsMin: "Cote ≥",
  oddsMax: "Cote <",
  kind: "Type",
  timing: "Moment",
  delayMinMinutes: "Délai ≥ (min)",
  delayMaxMinutes: "Délai < (min)",
};

function filterLabel(filter: SegmentFilter, state: AppState): string {
  const labels = Object.entries(filter)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      let display = String(value);
      if (key === "tipsterId")
        display =
          state.tipsters.find((tipster) => tipster.id === value)?.name ??
          display;
      if (key === "kind") display = value === "single" ? "Simple" : "Combiné";
      if (key === "timing")
        display = value === "prematch" ? "Avant-match" : "Live";
      return `${FILTER_LABELS[key as keyof SegmentFilter]} : ${display}`;
    });
  return labels.join(" · ") || "Tous les profils et toutes les catégories";
}

function intersectFilter(
  base: SegmentFilter,
  extra: SegmentFilter,
): SegmentFilter | null {
  const combined: SegmentFilter = { ...base };
  for (const key of [
    "tipsterId",
    "sport",
    "competition",
    "market",
    "kind",
    "timing",
  ] as const) {
    const value = extra[key];
    if (value === undefined) continue;
    const normalize = (text: string) =>
      text
        .normalize("NFKC")
        .trim()
        .toLocaleLowerCase("fr-FR")
        .replace(/\s+/g, " ");
    if (
      base[key] !== undefined &&
      normalize(String(base[key])) !== normalize(String(value))
    )
      return null;
    Object.assign(combined, { [key]: value });
  }
  for (const [minimum, maximum] of [
    ["oddsMin", "oddsMax"],
    ["delayMinMinutes", "delayMaxMinutes"],
  ] as const) {
    const lower = Math.max(
      base[minimum] ?? -Infinity,
      extra[minimum] ?? -Infinity,
    );
    const upper = Math.min(
      base[maximum] ?? Infinity,
      extra[maximum] ?? Infinity,
    );
    if (lower >= upper) return null;
    if (Number.isFinite(lower)) combined[minimum] = lower;
    if (Number.isFinite(upper)) combined[maximum] = upper;
  }
  return combined;
}

function parisDay(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parisBoundary(
  value: string,
  followingDay = false,
): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("La date de période est invalide.");
  const calendar = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== value
  )
    throw new Error("La date de période est invalide.");
  if (followingDay) calendar.setUTCDate(calendar.getUTCDate() + 1);
  const targetDay = calendar.toISOString().slice(0, 10);
  const target = calendar.getTime();
  let candidate = target;
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = formatter.formatToParts(new Date(candidate));
    const part = (type: string) =>
      parts.find((entry) => entry.type === type)?.value ?? "";
    const localAsUTC = Date.parse(
      `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}Z`,
    );
    candidate += target - localAsUTC;
  }
  const result = new Date(candidate).toISOString();
  if (parisDay(result) !== targetDay)
    throw new Error(
      "La borne de période n’a pas pu être convertie en heure de Paris.",
    );
  return result;
}

function readExploration(audit: AuditEntry): Exploration | null {
  if (audit.action !== "analysis.explore") return null;
  try {
    const data = JSON.parse(audit.detail) as Record<string, unknown>;
    if (
      !data ||
      typeof data !== "object" ||
      !data.filter ||
      typeof data.filter !== "object" ||
      Array.isArray(data.filter)
    )
      return null;
    if (
      typeof data.proof !== "string" ||
      !Object.hasOwn(PROOF_LABELS, data.proof)
    )
      return null;
    const validDate = (value: unknown) =>
      typeof value === "string" && Number.isFinite(Date.parse(value))
        ? value
        : null;
    return {
      audit,
      name: typeof data.name === "string" ? data.name : "Variante explorée",
      filter: data.filter as SegmentFilter,
      proof: data.proof as ProofLevel,
      axis:
        typeof data.axis === "string" && Object.hasOwn(AXIS_LABELS, data.axis)
          ? (data.axis as SegmentAxis)
          : "sport",
      phase:
        data.phase === "discovery" || data.phase === "validation"
          ? data.phase
          : "all",
      strategyId: typeof data.strategyId === "string" ? data.strategyId : null,
      simulationId:
        typeof data.simulationId === "string" ? data.simulationId : null,
      start: validDate(data.start),
      end: validDate(data.end),
      discoveryEnd: validDate(data.discoveryEnd),
    };
  } catch {
    return null;
  }
}

function periodLabel(metrics: AnalysisMetrics) {
  if (!metrics.periodFrom || !metrics.periodTo) return "Période indisponible";
  return `${formatDate(metrics.periodFrom)} → ${formatDate(metrics.periodTo)}`;
}

function PeriodSummary({
  title,
  metrics,
}: {
  title: string;
  metrics: AnalysisMetrics;
}) {
  return (
    <section className="panel panel-pad">
      <h3>{title}</h3>
      <p className="muted">{periodLabel(metrics)}</p>
      <dl className="detail-list">
        <div className="detail-line">
          <dt>Volume / événements</dt>
          <dd>
            {metrics.count} / {metrics.events}
          </dd>
        </div>
        <div className="detail-line">
          <dt>Paris standards réglés</dt>
          <dd>{metrics.settled}</dd>
        </div>
        <div className="detail-line">
          <dt>P&L à 1 unité</dt>
          <dd>{formatUnits(metrics.profitUnits)}</dd>
        </div>
        <div className="detail-line">
          <dt>Rendement sur mises</dt>
          <dd>{formatPercent(metrics.yield)}</dd>
        </div>
        <div className="detail-line">
          <dt>Dispersion des résultats</dt>
          <dd>{formatUnits(metrics.dispersion)}</dd>
        </div>
        <div className="detail-line">
          <dt>Plus gros gain / gains positifs</dt>
          <dd>{formatPercent(metrics.biggestWinShare)}</dd>
        </div>
      </dl>
      <p className="notice">{metrics.message}</p>
    </section>
  );
}

export function SpecialtiesView({
  state,
  initialFilter,
  initialStrategyId,
  initialProof = "declared",
  initialPhase,
  onOpenPick,
  onCreateStrategy,
  onOpenReference,
  onSaveExploration,
}: SpecialtiesViewProps) {
  const [filter, setFilter] = useState<SegmentFilter>(initialFilter ?? {});
  const [level, setLevel] = useState<ProofLevel>(initialProof);
  const [axis, setAxis] = useState<SegmentAxis>("sport");
  const [strategyId, setStrategyId] = useState(initialStrategyId ?? "");
  const [phase, setPhase] = useState<Phase>(
    initialPhase ?? (initialStrategyId ? "validation" : "all"),
  );
  const [simulationId, setSimulationId] = useState("");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [query, setQuery] = useState<AnalysisQuery | null>(null);
  const [appliedAxis, setAppliedAxis] = useState<SegmentAxis>("sport");
  const [rowSearch, setRowSearch] = useState("");
  const [minimumCount, setMinimumCount] = useState("0");
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [ascending, setAscending] = useState(false);
  const [variantName, setVariantName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCurrent, setSavedCurrent] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const [sourceLimit, setSourceLimit] = useState(25);
  const operationVersion = useRef(0);
  const initialFilterSignature = JSON.stringify(initialFilter ?? {});

  useEffect(() => {
    operationVersion.current += 1;
    const strategy = state.strategies.find(
      (entry) => entry.id === initialStrategyId,
    );
    setFilter(
      strategy?.filter ?? (JSON.parse(initialFilterSignature) as SegmentFilter),
    );
    setStrategyId(strategy?.id ?? "");
    setPhase(strategy ? (initialPhase ?? "validation") : "all");
    setLevel(initialProof);
    setSimulationId("");
    setFromDay("");
    setToDay("");
    setQuery(null);
    setSavedCurrent(false);
    setFeedback(null);
    setSaving(false);
  }, [
    state.workspace,
    initialStrategyId,
    initialFilterSignature,
    initialProof,
    initialPhase,
  ]);

  const selectedStrategy = state.strategies.find(
    (entry) => entry.id === strategyId,
  );
  const definitions = useMemo(
    () => predefinedSegments(state.picks),
    [state.picks],
  );
  const metrics = useMemo(
    () => (query ? analyzeSegment(state, query) : null),
    [state, query],
  );
  const comparison = useMemo(() => {
    if (!query?.strategyId) return null;
    const report = strategyAnalysis(
      state,
      query.strategyId,
      query.level,
      query.simulationId,
    );
    return {
      ...report,
      discovery: analyzeSegment(state, { ...query, phase: "discovery" }),
      validation: analyzeSegment(state, { ...query, phase: "validation" }),
    };
  }, [state, query]);
  const segmentRows = useMemo(() => {
    if (!query) return [];
    const rows: SegmentRow[] = [];
    for (const definition of definitions.filter(
      (entry) => entry.axis === appliedAxis,
    )) {
      const combined = intersectFilter(query.filter ?? {}, definition.filter);
      if (!combined) continue;
      rows.push({
        definition,
        filter: combined,
        metrics: analyzeSegment(state, { ...query, filter: combined }),
      });
    }
    return rows;
  }, [definitions, state, query, appliedAxis]);
  const displayedRows = useMemo(() => {
    const needle = rowSearch.trim().toLocaleLowerCase("fr-FR");
    const minimum = Math.max(0, Number(minimumCount) || 0);
    return segmentRows
      .filter(
        (row) =>
          row.metrics.count >= minimum &&
          row.definition.label.toLocaleLowerCase("fr-FR").includes(needle),
      )
      .sort((left, right) => {
        const a = left.metrics[sortKey];
        const b = right.metrics[sortKey];
        if (a === null && b === null)
          return left.definition.label.localeCompare(
            right.definition.label,
            "fr",
          );
        if (a === null) return 1;
        if (b === null) return -1;
        return (
          (ascending ? a - b : b - a) ||
          left.definition.label.localeCompare(right.definition.label, "fr")
        );
      });
  }, [segmentRows, rowSearch, minimumCount, sortKey, ascending]);
  const explorations = useMemo(
    () =>
      state.audit
        .map(readExploration)
        .filter((entry): entry is Exploration => entry !== null)
        .sort((a, b) => b.audit.at.localeCompare(a.audit.at)),
    [state.audit],
  );
  const sourcePicks =
    metrics?.pickIds
      .map((id) => state.picks.find((pick) => pick.id === id))
      .filter((pick) => pick !== undefined) ?? [];

  function invalidate() {
    setQuery(null);
    setSavedCurrent(false);
    setFeedback(null);
    setSourceLimit(25);
  }

  function changeFilter<K extends keyof SegmentFilter>(
    key: K,
    value: SegmentFilter[K],
  ) {
    setFilter((current) => {
      const next = { ...current };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
    setStrategyId("");
    setPhase("all");
    invalidate();
  }

  function chooseStrategy(id: string) {
    const strategy = state.strategies.find((entry) => entry.id === id);
    setStrategyId(id);
    if (strategy) setFilter({ ...strategy.filter });
    setPhase(strategy ? "validation" : "all");
    invalidate();
  }

  function makeQuery(): AnalysisQuery {
    const from = parisBoundary(fromDay);
    const to = parisBoundary(toDay, true);
    if (from && to && Date.parse(from) >= Date.parse(to))
      throw new Error(
        "La fin de période doit être postérieure ou égale au jour de début.",
      );
    if (filter.oddsMin !== undefined && filter.oddsMin < 1)
      throw new Error(
        "La borne inférieure de cote doit être au moins égale à 1.",
      );
    if (filter.oddsMax !== undefined && filter.oddsMax <= 1)
      throw new Error("La borne supérieure de cote doit être supérieure à 1.");
    if (
      filter.oddsMin !== undefined &&
      filter.oddsMax !== undefined &&
      filter.oddsMin >= filter.oddsMax
    )
      throw new Error(
        "La borne supérieure de cote doit dépasser la borne inférieure.",
      );
    if (
      filter.delayMinMinutes !== undefined &&
      filter.delayMaxMinutes !== undefined &&
      filter.delayMinMinutes >= filter.delayMaxMinutes
    )
      throw new Error(
        "La borne supérieure de délai doit dépasser la borne inférieure.",
      );
    if (phase !== "all" && !selectedStrategy)
      throw new Error(
        "Sélectionnez une règle figée pour séparer découverte et validation.",
      );
    return {
      level,
      filter: { ...filter },
      from,
      to,
      strategyId: strategyId || undefined,
      phase,
      simulationId:
        level === "simulated" ? simulationId || undefined : undefined,
    };
  }

  function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const nextQuery = makeQuery();
      setQuery(nextQuery);
      setAppliedAxis(axis);
      setSavedCurrent(false);
      setFeedback(null);
      setSourceLimit(25);
    } catch (cause) {
      setFeedback({
        error: true,
        text:
          cause instanceof Error
            ? cause.message
            : "Le périmètre d’analyse est invalide.",
      });
    }
  }

  async function saveExploration() {
    if (!query || !onSaveExploration || saving) return;
    setSaving(true);
    setFeedback(null);
    const version = operationVersion.current;
    try {
      const strategy = state.strategies.find(
        (entry) => entry.id === query.strategyId,
      );
      await onSaveExploration({
        name:
          variantName.trim() ||
          `${AXIS_LABELS[appliedAxis]} · ${PROOF_LABELS[query.level]}`,
        filter: query.filter ?? {},
        proof: query.level,
        discoveryEnd: strategy?.discoveryEnd ?? null,
        start: query.from ?? null,
        end: query.to ?? null,
        axis: appliedAxis,
        strategyId: query.strategyId ?? null,
        phase: query.phase ?? "all",
        simulationId: query.simulationId ?? null,
      });
      if (version !== operationVersion.current) return;
      setSavedCurrent(true);
      setFeedback({
        error: false,
        text: "Variante ajoutée au journal des explorations. Ses règles et son niveau de preuve sont conservés.",
      });
    } catch (cause) {
      if (version !== operationVersion.current) return;
      setFeedback({
        error: true,
        text:
          cause instanceof Error
            ? cause.message
            : "La variante n’a pas pu être enregistrée.",
      });
    } finally {
      if (version === operationVersion.current) setSaving(false);
    }
  }

  function restoreExploration(exploration: Exploration) {
    const strategyExists =
      exploration.strategyId &&
      state.strategies.some(
        (strategy) => strategy.id === exploration.strategyId,
      );
    setFilter({ ...exploration.filter });
    setLevel(exploration.proof);
    setAxis(exploration.axis);
    setStrategyId(strategyExists ? exploration.strategyId! : "");
    setPhase(strategyExists ? exploration.phase : "all");
    setSimulationId(exploration.simulationId ?? "");
    setFromDay(parisDay(exploration.start));
    setToDay(
      exploration.end
        ? parisDay(new Date(Date.parse(exploration.end) - 1).toISOString())
        : "",
    );
    setVariantName(exploration.name);
    invalidate();
    setFeedback({
      error: false,
      text: "Périmètre restauré. Relancez l’analyse sur les données actuellement conservées ; le journal ne constitue pas une copie figée des résultats.",
    });
  }

  function drillInto(row: SegmentRow) {
    setFilter({ ...row.filter });
    setStrategyId("");
    setPhase("all");
    invalidate();
    setFeedback({
      error: false,
      text: "Sous-segment chargé comme nouvelle hypothèse exploratoire. Analysez-le puis conservez cette variante si vous l’étudiez.",
    });
  }

  function sortBy(key: SortKey) {
    if (sortKey === key) setAscending((current) => !current);
    else {
      setSortKey(key);
      setAscending(false);
    }
  }

  function sortableHeading(key: SortKey, label: string) {
    return (
      <th
        scope="col"
        aria-sort={
          sortKey === key ? (ascending ? "ascending" : "descending") : "none"
        }
      >
        <button
          type="button"
          className="table-button"
          onClick={() => sortBy(key)}
        >
          {label}
          {sortKey === key ? (ascending ? " ↑" : " ↓") : ""}
        </button>
      </th>
    );
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">HYPOTHÈSES & PÉRIMÈTRES</p>
            <h2>Explorer les spécialités</h2>
            <p className="muted">
              Sept axes explicites, un niveau de preuve à la fois. Les résultats
              décrivent les données conservées.
            </p>
          </div>
        </div>
        <form onSubmit={analyze}>
          <fieldset className="panel-pad" disabled={saving}>
            <legend className="sr-only">
              Périmètre de l’analyse des spécialités
            </legend>
            <ProofSelector
              value={level}
              onChange={(value) => {
                setLevel(value);
                invalidate();
              }}
              label="Niveau de preuve analysé"
            />
            <div className="form-grid">
              <label className="field" htmlFor="specialty-tipster">
                <span>Tipster</span>
                <select
                  id="specialty-tipster"
                  value={filter.tipsterId ?? ""}
                  onChange={(event) =>
                    changeFilter("tipsterId", event.target.value || undefined)
                  }
                >
                  <option value="">
                    Tous les tipsters, y compris inactifs
                  </option>
                  {state.tipsters.map((tipster) => (
                    <option key={tipster.id} value={tipster.id}>
                      {tipster.name}
                      {tipster.active ? "" : " · inactif"}
                    </option>
                  ))}
                </select>
              </label>
              {(["sport", "competition", "market"] as const).map((key) => (
                <label className="field" key={key} htmlFor={`specialty-${key}`}>
                  <span>{FILTER_LABELS[key]}</span>
                  <select
                    id={`specialty-${key}`}
                    value={filter[key] ?? ""}
                    onChange={(event) =>
                      changeFilter(key, event.target.value || undefined)
                    }
                  >
                    <option value="">Toutes les valeurs</option>
                    {definitions
                      .filter((definition) => definition.axis === key)
                      .map((definition) => (
                        <option
                          key={definition.key}
                          value={definition.filter[key]}
                        >
                          {definition.label}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
              <label className="field" htmlFor="specialty-kind">
                <span>Simple ou combiné</span>
                <select
                  id="specialty-kind"
                  value={filter.kind ?? ""}
                  onChange={(event) =>
                    changeFilter(
                      "kind",
                      event.target.value
                        ? (event.target.value as SegmentFilter["kind"])
                        : undefined,
                    )
                  }
                >
                  <option value="">
                    Toutes les catégories, conventions distinctes
                  </option>
                  <option value="single">Pari simple</option>
                  <option value="accumulator">Combiné</option>
                </select>
              </label>
              <label className="field" htmlFor="specialty-timing">
                <span>Avant-match ou live</span>
                <select
                  id="specialty-timing"
                  value={filter.timing ?? ""}
                  onChange={(event) =>
                    changeFilter(
                      "timing",
                      event.target.value
                        ? (event.target.value as SegmentFilter["timing"])
                        : undefined,
                    )
                  }
                >
                  <option value="">Avant-match et live</option>
                  <option value="prematch">Avant-match</option>
                  <option value="live">Live</option>
                </select>
              </label>
              {(
                [
                  "oddsMin",
                  "oddsMax",
                  "delayMinMinutes",
                  "delayMaxMinutes",
                ] as const
              ).map((key) => (
                <label className="field" key={key} htmlFor={`specialty-${key}`}>
                  <span>{FILTER_LABELS[key]}</span>
                  <input
                    id={`specialty-${key}`}
                    type="number"
                    step="any"
                    min={
                      key === "oddsMin"
                        ? "1"
                        : key === "oddsMax"
                          ? "1.000001"
                          : undefined
                    }
                    value={filter[key] ?? ""}
                    placeholder="Sans borne"
                    onChange={(event) =>
                      changeFilter(
                        key,
                        event.target.value === ""
                          ? undefined
                          : Number(event.target.value),
                      )
                    }
                  />
                </label>
              ))}
              <label className="field" htmlFor="specialty-from">
                <span>Du jour (Paris, inclus)</span>
                <input
                  id="specialty-from"
                  type="date"
                  value={fromDay}
                  onChange={(event) => {
                    setFromDay(event.target.value);
                    invalidate();
                  }}
                />
              </label>
              <label className="field" htmlFor="specialty-to">
                <span>Au jour (Paris, inclus)</span>
                <input
                  id="specialty-to"
                  type="date"
                  value={toDay}
                  onChange={(event) => {
                    setToDay(event.target.value);
                    invalidate();
                  }}
                />
              </label>
              <label className="field" htmlFor="specialty-strategy">
                <span>Règle figée enregistrée</span>
                <select
                  id="specialty-strategy"
                  value={strategyId}
                  onChange={(event) => chooseStrategy(event.target.value)}
                >
                  <option value="">Exploration libre</option>
                  {state.strategies.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>
                      {strategy.name}
                      {strategy.active ? "" : " · inactive"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor="specialty-phase">
                <span>Période d’étude</span>
                <select
                  id="specialty-phase"
                  value={phase}
                  disabled={!selectedStrategy}
                  onChange={(event) => {
                    setPhase(event.target.value as Phase);
                    invalidate();
                  }}
                >
                  <option value="all">Ensemble du périmètre</option>
                  <option value="discovery">Découverte rétrospective</option>
                  <option value="validation">
                    Validation après gel de la règle
                  </option>
                </select>
              </label>
              <label className="field" htmlFor="specialty-axis">
                <span>Comparer les segments par</span>
                <select
                  id="specialty-axis"
                  value={axis}
                  onChange={(event) => {
                    setAxis(event.target.value as SegmentAxis);
                    invalidate();
                  }}
                >
                  {Object.entries(AXIS_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {level === "simulated" && (
                <label className="field" htmlFor="specialty-simulation">
                  <span>Scénario Winamax</span>
                  <select
                    id="specialty-simulation"
                    value={simulationId}
                    onChange={(event) => {
                      setSimulationId(event.target.value);
                      invalidate();
                    }}
                  >
                    <option value="">
                      Choisir un scénario (requis si plusieurs)
                    </option>
                    {state.simulations.map((simulation) => (
                      <option key={simulation.id} value={simulation.id}>
                        {simulation.name} · {formatDate(simulation.createdAt)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <p className="muted">
              Le filtre de dates porte sur {PERIOD_FIELDS[level]}. Cotes et
              délais : borne basse incluse, borne haute exclue. Le délai mesure
              début d’événement moins publication ; une valeur négative
              correspond à une publication en direct. Modifier un filtre d’une
              règle figée ouvre une nouvelle exploration.
            </p>
            <details>
              <summary>Voir les découpages avant l’analyse</summary>
              <ul>
                {definitions
                  .filter((definition) => definition.axis === axis)
                  .map((definition) => (
                    <li key={definition.key}>{definition.label}</li>
                  ))}
              </ul>
              <p className="muted">
                Les plages numériques sont prédéfinies. Les sports, compétitions
                et marchés correspondent aux valeurs présentes dans les données.
                Aucun découpage n’est choisi en maximisant le rendement.
              </p>
            </details>
            <div className="form-actions">
              <button type="submit" className="button button-primary">
                Analyser ce périmètre
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setFilter({});
                  setStrategyId("");
                  setPhase("all");
                  setFromDay("");
                  setToDay("");
                  setSimulationId("");
                  invalidate();
                }}
              >
                Réinitialiser les filtres
              </button>
            </div>
          </fieldset>
        </form>
      </section>

      {feedback && (
        <p
          className={`notice ${feedback.error ? "notice-warning" : ""}`}
          role={feedback.error ? "alert" : "status"}
        >
          {feedback.text}
        </p>
      )}

      {query && metrics ? (
        <>
          <div className="notice">
            <strong>{PROOF_LABELS[query.level]} uniquement.</strong>{" "}
            {filterLabel(query.filter ?? {}, state)}.{" "}
            {savedCurrent
              ? "Variante consignée."
              : "Exploration affichée, pas encore consignée dans le journal."}
          </div>
          <AnalysisMetricsGrid metrics={metrics} />
          <div className="view-grid">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Évolution du périmètre sélectionné</h3>
                  <p className="muted">
                    {periodLabel(metrics)} ·{" "}
                    {metrics.durationDays === null
                      ? "Durée indisponible"
                      : `${formatNumber(metrics.durationDays)} jours`}
                  </p>
                </div>
              </div>
              <AnalysisChart
                title={`P&L à 1 unité · ${PROOF_LABELS[query.level]}`}
                points={metrics.series}
                unit="u"
                onOpenPick={onOpenPick}
                emptyText="Aucun résultat standard comparable pour cette population."
              />
            </section>
            <section className="panel panel-pad">
              <h3>Ce que permet cette analyse</h3>
              <p className="notice">{metrics.message}</p>
              <p className="muted">
                Une performance passée dans un segment constitue une hypothèse à
                confirmer. Aucun seuil universel de volume ne prouve un avantage
                et aucune significativité statistique n’est revendiquée.
              </p>
              <dl className="detail-list">
                <div className="detail-line">
                  <dt>Intervalle descriptif du rendement</dt>
                  <dd>
                    {metrics.roiInterval
                      ? `${formatPercent(metrics.roiInterval[0])} à ${formatPercent(metrics.roiInterval[1])}`
                      : "Données insuffisantes"}
                  </dd>
                </div>
                <div className="detail-line">
                  <dt>Dispersion des profits standardisés</dt>
                  <dd>{formatUnits(metrics.dispersion)}</dd>
                </div>
                <div className="detail-line">
                  <dt>Plus gros gain / gains positifs</dt>
                  <dd>{formatPercent(metrics.biggestWinShare)}</dd>
                </div>
                <div className="detail-line">
                  <dt>Catégories exclues du standard</dt>
                  <dd>{metrics.excluded}</dd>
                </div>
                <div className="detail-line">
                  <dt>Preuve manquante ou incohérente</dt>
                  <dd>{metrics.missingProof}</dd>
                </div>
              </dl>
              <p className="muted">
                L’intervalle est descriptif ; il ne corrige pas la sélection de
                la meilleure variante après plusieurs comparaisons. Les
                événements communs ne sont pas des observations indépendantes.
              </p>
            </section>
          </div>
          <AnalysisConventions metrics={metrics} level={query.level} />

          {comparison && (
            <section className="stack" aria-labelledby="specialty-phases-title">
              <div className="section-heading">
                <div>
                  <h3 id="specialty-phases-title">
                    Découverte et validation restent séparées
                  </h3>
                  <p className="muted">
                    Règle : {comparison.strategy?.name ?? "introuvable"}. La
                    même sélection de preuve est conservée dans les deux
                    périodes.
                  </p>
                </div>
              </div>
              {comparison.strategy && (
                <p className="notice">
                  Fin de découverte :{" "}
                  {formatDateTime(comparison.strategy.discoveryEnd)} · Gel :{" "}
                  {formatDateTime(comparison.strategy.frozenAt)} · Début de
                  validation :{" "}
                  {formatDateTime(comparison.strategy.validationStart)}.
                </p>
              )}
              {comparison.issues.length > 0 && (
                <div className="notice notice-warning">
                  <ul>
                    {comparison.issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="view-grid">
                <PeriodSummary
                  title="Découverte · hypothèse rétrospective"
                  metrics={comparison.discovery}
                />
                <PeriodSummary
                  title={
                    comparison.validFreeze
                      ? "Validation · observations après gel"
                      : "Validation non évaluable"
                  }
                  metrics={comparison.validation}
                />
              </div>
              <p className="muted">
                Les sous-segments inspectés après avoir vu leurs résultats
                restent exploratoires s’ils n’étaient pas prévus dans la règle
                figée. Une période de validation positive ne suffit pas à elle
                seule à établir un avantage durable.
              </p>
            </section>
          )}

          <section className="panel" aria-labelledby="specialty-table-title">
            <div className="panel-head">
              <div>
                <h3 id="specialty-table-title">
                  Segments par{" "}
                  {AXIS_LABELS[appliedAxis].toLocaleLowerCase("fr-FR")}
                </h3>
                <p className="muted">
                  {PROOF_LABELS[query.level]} · {displayedRows.length} lignes
                  affichées sur {segmentRows.length}. Cliquez sur un en-tête
                  pour changer le tri.
                </p>
              </div>
            </div>
            <div className="panel-pad form-grid">
              <label className="field" htmlFor="specialty-search">
                <span>Filtrer les libellés</span>
                <input
                  id="specialty-search"
                  type="search"
                  value={rowSearch}
                  onChange={(event) => setRowSearch(event.target.value)}
                  placeholder="Rechercher un segment"
                />
              </label>
              <label className="field" htmlFor="specialty-minimum">
                <span>Volume minimal affiché</span>
                <input
                  id="specialty-minimum"
                  type="number"
                  min="0"
                  step="1"
                  value={minimumCount}
                  onChange={(event) => setMinimumCount(event.target.value)}
                />
                <small className="muted">
                  Filtre d’affichage uniquement ; aucun seuil de preuve.
                </small>
              </label>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Segment / période</th>
                    {sortableHeading("count", "Volume")}
                    {sortableHeading("events", "Événements")}
                    {sortableHeading("profitUnits", "P&L à 1 u")}
                    {sortableHeading(
                      "declaredProfitUnits",
                      "P&L aux mises déclarées",
                    )}
                    {sortableHeading("yield", "Rendement")}
                    {sortableHeading("averageOdds", "Cote moyenne")}
                    {sortableHeading("maxDrawdownUnits", "Drawdown (u)")}
                    {sortableHeading("dispersion", "Dispersion (u)")}
                    {sortableHeading("biggestWinShare", "Concentration")}
                    <th scope="col">Incertitude / preuve</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row) => (
                    <tr key={row.definition.key}>
                      <td>
                        <strong>{row.definition.label}</strong>
                        <div className="muted">{periodLabel(row.metrics)}</div>
                        <div className="muted">
                          {row.metrics.durationDays === null
                            ? "Durée inconnue"
                            : `${formatNumber(row.metrics.durationDays)} jours`}
                        </div>
                      </td>
                      <td>
                        {row.metrics.count}
                        <div className="muted">
                          {row.metrics.settled} standards réglés
                        </div>
                      </td>
                      <td>{row.metrics.events}</td>
                      <td>{formatUnits(row.metrics.profitUnits)}</td>
                      <td>{formatUnits(row.metrics.declaredProfitUnits)}</td>
                      <td>{formatPercent(row.metrics.yield)}</td>
                      <td>{formatNumber(row.metrics.averageOdds)}</td>
                      <td>{formatUnits(row.metrics.maxDrawdownUnits)}</td>
                      <td>{formatUnits(row.metrics.dispersion)}</td>
                      <td>{formatPercent(row.metrics.biggestWinShare)}</td>
                      <td>
                        {row.metrics.roiInterval
                          ? `${formatPercent(row.metrics.roiInterval[0])} à ${formatPercent(row.metrics.roiInterval[1])}`
                          : "Intervalle indisponible"}
                        <div>
                          <span className="badge badge-muted">
                            {PROOF_LABELS[query.level]}
                          </span>
                        </div>
                        <div className="muted">
                          {row.metrics.status === "insufficient"
                            ? "Données insuffisantes"
                            : "Description, pas validation"}
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="text-link"
                          disabled={saving}
                          onClick={() => drillInto(row)}
                        >
                          Étudier ce segment
                        </button>
                      </td>
                    </tr>
                  ))}
                  {displayedRows.length === 0 && (
                    <tr>
                      <td colSpan={12}>
                        <div className="empty-state">
                          Aucun segment pour les filtres affichés. Les données
                          absentes ne produisent pas un rendement nul.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="panel-pad muted">
              Les P&L à 1 u et pondérés par les mises déclarées sont distincts.
              Les conventions et exclusions s’appliquent à chaque ligne. Aucun
              score global de confiance n’est calculé.
            </p>
          </section>

          <section
            className="panel panel-pad"
            aria-labelledby="specialty-save-title"
          >
            <h3 id="specialty-save-title">Conserver cette hypothèse</h3>
            <p className="muted">
              Le journal conserve les variantes favorables comme défavorables et
              les filtres utilisés. Il ne transforme pas une exploration en
              stratégie validée.
            </p>
            <label className="field" htmlFor="specialty-variant-name">
              <span>Nom de la variante (facultatif)</span>
              <input
                id="specialty-variant-name"
                maxLength={160}
                value={variantName}
                onChange={(event) => setVariantName(event.target.value)}
                placeholder={`${AXIS_LABELS[appliedAxis]} · ${PROOF_LABELS[query.level]}`}
                disabled={saving}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button button-primary"
                disabled={!onSaveExploration || saving || savedCurrent}
                onClick={() => {
                  void saveExploration();
                }}
              >
                {saving
                  ? "Enregistrement…"
                  : savedCurrent
                    ? "Variante consignée"
                    : "Enregistrer cette variante explorée"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={saving}
                onClick={() => onCreateStrategy({ ...query.filter })}
              >
                Figer une stratégie
              </button>
            </div>
            {!onSaveExploration && (
              <p className="notice notice-warning">
                L’enregistrement du journal des variantes n’est pas disponible
                dans cette vue. Cette analyse reste temporaire.
              </p>
            )}
          </section>

          <section className="panel" aria-labelledby="specialty-sources-title">
            <div className="panel-head">
              <div>
                <h3 id="specialty-sources-title">
                  Pronostics et références de cette analyse
                </h3>
                <p className="muted">
                  {metrics.pickIds.length} pronostics associés ·{" "}
                  {metrics.references.length} références sources. Leur
                  rattachement ne change pas leur niveau de preuve.
                </p>
              </div>
            </div>
            {sourcePicks.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Événement</th>
                      <th scope="col">Sélection</th>
                      <th scope="col">Tipster</th>
                      <th scope="col">Publication (Paris)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourcePicks.slice(0, sourceLimit).map((pick) => (
                      <tr key={pick.id}>
                        <td>
                          <button
                            type="button"
                            className="table-button"
                            onClick={() => onOpenPick(pick.id)}
                          >
                            {pick.event}
                          </button>
                        </td>
                        <td>
                          {pick.market} · {pick.selection}
                        </td>
                        <td>
                          {state.tipsters.find(
                            (tipster) => tipster.id === pick.tipsterId,
                          )?.name ?? "Profil inconnu"}
                        </td>
                        <td>{formatDateTime(pick.publishedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="panel-pad muted">
                Aucun pronostic associé dans cette population.
              </p>
            )}
            <div className="panel-pad">
              {sourcePicks.length > sourceLimit && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setSourceLimit((current) => current + 25)}
                >
                  Afficher 25 pronostics supplémentaires
                </button>
              )}
              <details>
                <summary>
                  Références exactes utilisées ({metrics.references.length})
                </summary>
                <ul>
                  {metrics.references.map((reference) => (
                    <li key={reference}>
                      {onOpenReference ? (
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => onOpenReference(reference)}
                        >
                          {reference}
                        </button>
                      ) : (
                        <code>{reference}</code>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </section>
        </>
      ) : (
        <section className="panel empty-state">
          <h3>Définissez un périmètre, puis lancez l’analyse</h3>
          <p className="muted">
            Les populations déclarées, observées, simulées et exécutées restent
            séparées. Un segment vide peut rester non évaluable.
          </p>
        </section>
      )}

      <section className="panel" aria-labelledby="specialty-history-title">
        <div className="panel-head">
          <div>
            <h3 id="specialty-history-title">
              Journal des variantes explorées
            </h3>
            <p className="muted">
              {explorations.length} variantes consignées ·{" "}
              {state.strategies.length} règles figées. Les profils inactifs et
              les variantes défavorables restent dans l’historique.
            </p>
          </div>
        </div>
        {explorations.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Variante / enregistrement</th>
                  <th scope="col">Périmètre</th>
                  <th scope="col">Preuve / période</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {explorations.map((exploration) => (
                  <tr key={exploration.audit.id}>
                    <td>
                      <strong>{exploration.name}</strong>
                      <div className="muted">
                        {formatDateTime(exploration.audit.at)}
                      </div>
                    </td>
                    <td>
                      {filterLabel(exploration.filter, state)}
                      <div className="muted">
                        Comparaison : {AXIS_LABELS[exploration.axis]}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-muted">
                        {PROOF_LABELS[exploration.proof]}
                      </span>
                      <div className="muted">
                        {exploration.start
                          ? formatDateTime(exploration.start)
                          : "Début non borné"}{" "}
                        →{" "}
                        {exploration.end
                          ? `${formatDateTime(exploration.end)} exclu`
                          : "Fin non bornée"}
                      </div>
                      <div className="muted">
                        {exploration.phase === "validation"
                          ? "Validation de la règle"
                          : exploration.phase === "discovery"
                            ? "Découverte"
                            : "Ensemble du périmètre"}
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => restoreExploration(exploration)}
                        disabled={saving}
                      >
                        Recharger les paramètres
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <h4>Aucune variante consignée</h4>
            <p className="muted">
              Après une analyse, enregistrez les variantes étudiées pour
              conserver la trace des comparaisons, y compris sans résultat
              favorable.
            </p>
          </div>
        )}
        {state.strategies.length > 0 && (
          <div className="panel-pad">
            <details>
              <summary>
                Règles figées disponibles ({state.strategies.length})
              </summary>
              <ul>
                {state.strategies.map((strategy) => (
                  <li key={strategy.id}>
                    <button
                      type="button"
                      className="text-link"
                      disabled={saving}
                      onClick={() => chooseStrategy(strategy.id)}
                    >
                      {strategy.name}
                    </button>{" "}
                    · gel le {formatDateTime(strategy.frozenAt)} ·{" "}
                    {strategy.active ? "suivie" : "inactive, conservée"}
                    <p className="muted">
                      {filterLabel(strategy.filter, state)}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}
