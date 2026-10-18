"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  bankroll,
  decision,
  identity,
  matchesSegment,
} from "@/domain/calculations";
import type { StakingComparison } from "@/domain/staking";
import type { AppState, Pick, SegmentFilter, Simulation } from "@/domain/types";
import type { FormKind } from "./entity-forms";
import { BacktestView } from "./backtest-view";
import { ProbabilityCalculator } from "./probability-calculator";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
} from "./analysis-ui";

export interface SimulationsViewProps {
  state: AppState;
  mutate: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  onOpenPick: (id: string) => void;
  onOpenSimulation: (id: string) => void;
  onOpenForm: (kind: FormKind, initial?: Record<string, unknown>) => void;
  onOpenSettings: () => void;
  onExploreStrategy: (id: string, filter: SegmentFilter) => void;
}

type Method = "fixed" | "percent" | "kelly";
type Pane = "composer" | "saved" | "backtest" | "calculators";
type ManualHypothesis = { percent: string; basis: string };
type PickGroup = {
  key: string;
  picks: Pick[];
  candidates: Pick[];
  eventKey: string;
};
type ServerComparison = StakingComparison & {
  strategyId: string | null;
  assumptions: string;
};
type ComparisonInput = {
  candidates: StakingComparison["candidates"];
  strategyId: string | null;
  assumptions: string;
};
type ComparisonSnapshot = {
  result: ServerComparison;
  input: ComparisonInput;
  dataSignature: string;
};
type SavedSimulation = Simulation & {
  candidatesSnapshot?: StakingComparison["candidates"];
  bankrollSnapshot?: StakingComparison["bankrollSnapshot"];
  comparisonSnapshot?: StakingComparison;
};

const METHOD_LABELS: Record<Method, string> = {
  fixed: "Mise fixe",
  percent: "Pourcentage du capital",
  kelly: "Kelly fractionné",
};

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "L’opération n’a pas pu être effectuée.";
}

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/\s+/g, " ");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "fr"),
  );
}

function settingsDescription(method: Method, settings: AppState["settings"]) {
  if (method === "fixed")
    return `${formatMoney(settings.fixedStakeCents)} par sélection avant plafonds`;
  if (method === "percent")
    return `${formatPercent(settings.stakePercent)} du capital avant plafonds`;
  return `${formatPercent(settings.kellyFraction)} de Kelly théorique avant plafonds`;
}

function BudgetDetails({ comparison }: { comparison: StakingComparison }) {
  const { budget, bankrollSnapshot: account } = comparison;
  return (
    <section
      className="panel panel-pad"
      aria-label="Budget commun aux trois méthodes"
    >
      <div className="section-heading">
        <div>
          <h3>Un même budget initial pour les trois méthodes</h3>
          <p className="muted">
            Calcul serveur du {formatDateTime(comparison.createdAt)}. Chaque
            méthode partage son budget entre toutes les lignes du panier.
          </p>
        </div>
      </div>
      <div className="metric-grid">
        <div className="metric">
          <div className="metric-top">Capital de référence</div>
          <div className="metric-value">
            {formatMoney(account.capitalCents)}
          </div>
          <div className="metric-note">
            Cash + coût des positions cash ouvertes
          </div>
        </div>
        <div className="metric">
          <div className="metric-top">Cash disponible</div>
          <div className="metric-value">{formatMoney(account.cashCents)}</div>
          <div className="metric-note">
            Le panier simulé ne débite pas ce cash
          </div>
        </div>
        <div className="metric">
          <div className="metric-top">Exposition déjà ouverte</div>
          <div className="metric-value">
            {formatMoney(account.openStakeCents)}
          </div>
          <div className="metric-note">Positions réelles au coût restant</div>
        </div>
        <div className="metric">
          <div className="metric-top">Budget de nouvelles mises</div>
          <div className="metric-value">
            {formatMoney(budget.availableForNewStakesCents)}
          </div>
          <div className="metric-note">
            Cash, exposition et pertes simultanément respectés
          </div>
        </div>
      </div>
      <dl className="analysis-definition-grid">
        <div>
          <dt>Plafond par pari</dt>
          <dd>{formatMoney(budget.betLimitCents)}</dd>
        </div>
        <div>
          <dt>Plafond par événement</dt>
          <dd>{formatMoney(budget.eventLimitCents)}</dd>
        </div>
        <div>
          <dt>Plafond global d’exposition</dt>
          <dd>{formatMoney(budget.exposureLimitCents)}</dd>
        </div>
        <div>
          <dt>Résultat déjà réalisé du jour</dt>
          <dd>{formatMoney(budget.realizedDayCents, true)}</dd>
        </div>
        <div>
          <dt>Résultat déjà réalisé du mois</dt>
          <dd>{formatMoney(budget.realizedMonthCents, true)}</dd>
        </div>
        <div>
          <dt>Budget de pertes du jour, avant positions ouvertes</dt>
          <dd>{formatMoney(budget.dailyRemainingCents)}</dd>
        </div>
        <div>
          <dt>Budget de pertes du mois, avant positions ouvertes</dt>
          <dd>{formatMoney(budget.monthlyRemainingCents)}</dd>
        </div>
      </dl>
      {budget.blockedReasons.length > 0 && (
        <div className="notice notice-warning">
          <strong>Allocations suspendues ou limitées</strong>
          <ul>
            {budget.blockedReasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted">
        Les limites de pertes utilisent les périodes de Paris : {budget.day} et{" "}
        {budget.month}. Les gains antérieurs n’augmentent pas ces budgets. Les
        positions ouvertes restent comptées comme perte maximale possible.
      </p>
    </section>
  );
}

export function SimulationsView({
  state,
  mutate,
  onOpenPick,
  onOpenSimulation,
  onOpenForm,
  onOpenSettings,
  onExploreStrategy,
}: SimulationsViewProps) {
  const [pane, setPane] = useState<Pane>("composer");
  const [search, setSearch] = useState("");
  const [tipsterId, setTipsterId] = useState("");
  const [sport, setSport] = useState("");
  const [market, setMarket] = useState("");
  const [status, setStatus] = useState("open");
  const [strategyId, setStrategyId] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [hypotheses, setHypotheses] = useState<
    Record<string, ManualHypothesis>
  >({});
  const [assumptions, setAssumptions] = useState("");
  const [scenarioName, setScenarioName] = useState("");
  const [comparison, setComparison] = useState<ComparisonSnapshot | null>(null);
  const [pending, setPending] = useState<"compare" | Method | null>(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<SavedSimulation | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [historySearch, setHistorySearch] = useState("");
  const requestVersion = useRef(0);

  useEffect(() => {
    requestVersion.current += 1;
    setPane("composer");
    setSearch("");
    setTipsterId("");
    setSport("");
    setMarket("");
    setStatus("open");
    setStrategyId("");
    setSelectedKeys([]);
    setHypotheses({});
    setAssumptions("");
    setScenarioName("");
    setComparison(null);
    setPending(null);
    setError("");
    setReceipt(null);
    setVisibleCount(20);
    setHistorySearch("");
  }, [state.workspace]);

  const strategy = state.strategies.find((entry) => entry.id === strategyId);
  const decisionState = useMemo(
    () => (strategy ? { ...state, strategies: [strategy] } : state),
    [state, strategy],
  );
  const account = useMemo(() => bankroll(state), [state]);
  const dataSignature = useMemo(
    () =>
      JSON.stringify({
        settings: state.settings,
        picks: state.picks,
        quotes: state.quotes,
        tickets: state.tickets,
        ledger: state.ledger,
        strategies: state.strategies,
        tipsters: state.tipsters,
      }),
    [state],
  );
  const groups = useMemo(() => {
    const grouped = new Map<string, Pick[]>();
    const ordered = [...state.picks].sort(
      (left, right) =>
        left.publishedAt.localeCompare(right.publishedAt) ||
        left.id.localeCompare(right.id),
    );
    for (const pick of ordered) {
      const key = identity(pick);
      grouped.set(key, [...(grouped.get(key) ?? []), pick]);
    }
    return [...grouped.entries()]
      .map(
        ([key, picks]): PickGroup => ({
          key,
          picks,
          candidates: strategy
            ? picks.filter((pick) => matchesSegment(pick, strategy.filter))
            : picks,
          eventKey: normalize(
            picks[0].eventKey || `${picks[0].event}|${picks[0].startsAt}`,
          ),
        }),
      )
      .sort(
        (left, right) =>
          left.picks[0].startsAt.localeCompare(right.picks[0].startsAt) ||
          left.key.localeCompare(right.key),
      );
  }, [state.picks, strategy]);
  const groupMap = useMemo(
    () => new Map(groups.map((group) => [group.key, group])),
    [groups],
  );
  const selectedGroups = selectedKeys
    .map((key) => groupMap.get(key))
    .filter((group): group is PickGroup => Boolean(group?.candidates.length));
  const missingSelectionCount = selectedKeys.length - selectedGroups.length;
  const candidateCount = selectedGroups.reduce(
    (count, group) => count + group.candidates.length,
    0,
  );
  const filteredGroups = useMemo(() => {
    const needle = normalize(search);
    return groups.filter(
      (group) =>
        group.candidates.length > 0 &&
        group.candidates.some((pick) => {
          if (status === "open" && pick.result !== "open") return false;
          if (tipsterId && pick.tipsterId !== tipsterId) return false;
          if (sport && pick.sport !== sport) return false;
          if (market && pick.market !== market) return false;
          const profile =
            state.tipsters.find((tipster) => tipster.id === pick.tipsterId)
              ?.name ?? "";
          return (
            !needle ||
            normalize(
              `${pick.event} ${pick.selection} ${pick.market} ${pick.sport} ${profile}`,
            ).includes(needle)
          );
        }),
    );
  }, [groups, search, status, tipsterId, sport, market, state.tipsters]);
  const visibleGroups = filteredGroups.slice(0, visibleCount);
  const eventGroups = useMemo(() => {
    const events = new Map<string, PickGroup[]>();
    for (const group of selectedGroups)
      events.set(group.eventKey, [
        ...(events.get(group.eventKey) ?? []),
        group,
      ]);
    return [...events.values()].filter((entries) => entries.length > 1);
  }, [selectedGroups]);
  const comparisonStale =
    comparison !== null && comparison.dataSignature !== dataSignature;
  const hasMissingLimits = [
    state.settings.maxBetPercent,
    state.settings.maxEventPercent,
    state.settings.maxExposurePercent,
    state.settings.dailyLossLimitCents,
    state.settings.monthlyLossLimitCents,
  ].some((value) => value === null);
  const history = [...state.simulations]
    .filter((simulation) =>
      normalize(simulation.name).includes(normalize(historySearch)),
    )
    .sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    ) as SavedSimulation[];

  function invalidateComparison() {
    requestVersion.current += 1;
    setComparison(null);
    setReceipt(null);
    setError("");
  }

  function toggleGroup(key: string) {
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key],
    );
    invalidateComparison();
  }

  function updateHypothesis(key: string, change: Partial<ManualHypothesis>) {
    setHypotheses((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { percent: "", basis: "" }), ...change },
    }));
    invalidateComparison();
  }

  function moveGroup(key: string, direction: -1 | 1) {
    setSelectedKeys((current) => {
      const index = current.indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[target]] = [
        reordered[target],
        reordered[index],
      ];
      return reordered;
    });
    invalidateComparison();
  }

  function buildInput(): ComparisonInput {
    if (missingSelectionCount)
      throw new Error(
        "Certains pronostics ont changé de périmètre. Retirez les sélections indisponibles avant de comparer.",
      );
    if (!selectedGroups.length)
      throw new Error("Ajoutez au moins une sélection au panier.");
    if (candidateCount > 1000)
      throw new Error(
        "Le panier est limité à 1 000 pronostics sources. Réduisez le nombre de sélections.",
      );
    const candidates: StakingComparison["candidates"] = [];
    for (const group of selectedGroups) {
      const hypothesis = hypotheses[group.key];
      const rawProbability = hypothesis?.percent.trim() ?? "";
      if (
        rawProbability &&
        !/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(rawProbability)
      )
        throw new Error(
          `Saisissez une probabilité décimale pour « ${group.picks[0].selection} » ou laissez-la inconnue.`,
        );
      const probability = rawProbability
        ? Number(rawProbability.replace(",", ".")) / 100
        : null;
      const basis = hypothesis?.basis.trim() ?? "";
      if (
        probability !== null &&
        (!Number.isFinite(probability) || probability < 0 || probability > 1)
      )
        throw new Error(
          `La probabilité de « ${group.picks[0].selection} » doit être comprise entre 0 et 100 %.`,
        );
      if (probability !== null && !basis)
        throw new Error(
          `Documentez le fondement de l’hypothèse pour « ${group.picks[0].selection} » ou laissez sa probabilité inconnue.`,
        );
      for (const pick of group.candidates)
        candidates.push({
          pickId: pick.id,
          probability,
          probabilitySource: probability === null ? null : "manual",
          basis: probability === null ? undefined : basis,
        });
    }
    return {
      candidates,
      strategyId: strategyId || null,
      assumptions: assumptions.trim(),
    };
  }

  async function compare() {
    setError("");
    setReceipt(null);
    let input: ComparisonInput;
    try {
      input = buildInput();
    } catch (cause) {
      setError(message(cause));
      return;
    }
    const version = requestVersion.current;
    setPending("compare");
    try {
      const response = await mutate("simulation.compare", input);
      if (version !== requestVersion.current) return;
      const result = response as ServerComparison | null;
      if (
        !result ||
        !Array.isArray(result.methods) ||
        !Array.isArray(result.groups) ||
        !result.budget ||
        !result.bankrollSnapshot
      )
        throw new Error(
          "La réponse de comparaison n’est pas exploitable. Relancez le calcul.",
        );
      setComparison({ result, input, dataSignature });
    } catch (cause) {
      if (version === requestVersion.current) setError(message(cause));
    } finally {
      if (version === requestVersion.current) setPending(null);
    }
  }

  async function save(method: Method) {
    if (!comparison || comparisonStale || pending) return;
    const name = scenarioName.trim();
    if (!name) {
      setError("Donnez un nom au scénario avant de l’enregistrer.");
      return;
    }
    const version = requestVersion.current;
    setPending(method);
    setError("");
    try {
      const response = await mutate("simulation.save", {
        ...comparison.input,
        method,
        name,
      });
      if (version !== requestVersion.current) return;
      const simulation = response as SavedSimulation | null;
      if (!simulation?.id || !Array.isArray(simulation.allocations))
        throw new Error(
          "La confirmation n’a pas pu être lue. Consultez les scénarios enregistrés avant de réessayer.",
        );
      setReceipt(simulation);
      setComparison(null);
    } catch (cause) {
      if (version === requestVersion.current) setError(message(cause));
    } finally {
      if (version === requestVersion.current) setPending(null);
    }
  }

  function sourceNames(picks: Pick[]) {
    return unique(
      picks.map(
        (pick) =>
          state.tipsters.find((tipster) => tipster.id === pick.tipsterId)
            ?.name ?? "Profil inconnu",
      ),
    ).join(" · ");
  }

  return (
    <div className="stack">
      <div className="panel">
        <nav className="tab-bar" aria-label="Outils de simulation">
          {(
            [
              ["composer", "Composer et comparer"],
              ["saved", `Scénarios enregistrés (${state.simulations.length})`],
              ["backtest", "Rejeu chronologique"],
              ["calculators", "Calculatrices"],
            ] as const
          ).map(([value, label]) => (
            <a
              key={value}
              href={`#simulation-${value}`}
              className={`tab-button ${pane === value ? "active" : ""}`}
              aria-current={pane === value ? "location" : undefined}
              onClick={() => setPane(value)}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      <section
        id="simulation-composer"
        className="stack"
        aria-label="Composer et comparer un panier"
      >
        {(hasMissingLimits ||
          state.settings.paused ||
          account.uncertainOpenCost) && (
          <div className="notice notice-warning">
            <div>
              <strong>
                {state.settings.paused
                  ? "Les suggestions sont en pause."
                  : account.uncertainOpenCost
                    ? "Un coût restant de cashout doit être rapproché."
                    : "Les limites personnelles sont incomplètes."}
              </strong>
              <p>
                La comparaison conserve les abstentions et leurs raisons. Aucune
                allocation ne contourne une limite absente, une pause ou une
                exposition incertaine.
              </p>
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={onOpenSettings}
            >
              Voir mes paramètres
            </button>
          </div>
        )}
        <section className="panel panel-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">PANIER NON EXÉCUTÉ</p>
              <h2>Comparer les mises avec un budget commun</h2>
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={onOpenSettings}
            >
              Régler les mises et plafonds
            </button>
          </div>
          <p className="muted">
            Capital actuel : {formatMoney(account.capitalCents)} ={" "}
            {formatMoney(account.cashCents)} de cash +{" "}
            {formatMoney(account.openStakeCents)} de positions cash ouvertes au
            coût. Les affectations aux stratégies utilisent ce même
            portefeuille.
          </p>
          <div className="three-grid">
            {(["fixed", "percent", "kelly"] as const).map((method) => (
              <div key={method} className="calculation-output">
                <small>{METHOD_LABELS[method]}</small>
                <strong>
                  {method === "fixed"
                    ? formatMoney(state.settings.fixedStakeCents)
                    : formatPercent(
                        method === "percent"
                          ? state.settings.stakePercent
                          : state.settings.kellyFraction,
                      )}
                </strong>
                <small>
                  {method === "kelly"
                    ? "Sans probabilité exploitable, Kelly s’abstient"
                    : "Montant théorique avant tous les plafonds"}
                </small>
              </div>
            ))}
          </div>
          <p className="notice">
            La simulation ne place aucun pari et ne réserve aucun fonds. Une
            source supplémentaire pour la même sélection n’ajoute ni mise ni
            confirmation statistique indépendante.
          </p>
        </section>

        <section className="panel" aria-labelledby="simulation-selection-title">
          <div className="panel-head">
            <div>
              <p className="eyebrow">1 · SÉLECTIONNER</p>
              <h3 id="simulation-selection-title">
                Pronostics regroupés par sélection exacte
              </h3>
              <p className="muted">
                {filteredGroups.length} groupes correspondent aux filtres.
                Événement, marché, sélection, ligne, règles et type définissent
                les doublons.
              </p>
            </div>
          </div>
          <fieldset className="panel-pad" disabled={Boolean(pending)}>
            <legend className="sr-only">Filtres et sélection du panier</legend>
            <div className="form-grid">
              <label className="field">
                <span>Rechercher un événement ou une sélection</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setVisibleCount(20);
                  }}
                />
              </label>
              <label className="field">
                <span>Stratégie associée au scénario</span>
                <select
                  value={strategyId}
                  onChange={(event) => {
                    setStrategyId(event.target.value);
                    setSelectedKeys([]);
                    invalidateComparison();
                  }}
                >
                  <option value="">
                    Sans affectation unique · segments suivis applicables
                  </option>
                  {state.strategies.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                      {entry.active ? "" : " · inactive"}
                    </option>
                  ))}
                </select>
                <small className="muted">
                  Changer cette affectation réinitialise le panier. Seules les
                  sources du segment choisi sont alors candidates.
                </small>
              </label>
              <label className="field">
                <span>Tipster présent dans le groupe</span>
                <select
                  value={tipsterId}
                  onChange={(event) => {
                    setTipsterId(event.target.value);
                    setVisibleCount(20);
                  }}
                >
                  <option value="">Tous les tipsters</option>
                  {state.tipsters.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                      {entry.active ? "" : " · inactif"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Sport</span>
                <select
                  value={sport}
                  onChange={(event) => {
                    setSport(event.target.value);
                    setVisibleCount(20);
                  }}
                >
                  <option value="">Tous les sports</option>
                  {unique(state.picks.map((pick) => pick.sport)).map(
                    (value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                <span>Marché</span>
                <select
                  value={market}
                  onChange={(event) => {
                    setMarket(event.target.value);
                    setVisibleCount(20);
                  }}
                >
                  <option value="">Tous les marchés</option>
                  {unique(state.picks.map((pick) => pick.market)).map(
                    (value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                <span>État des pronostics affichés</span>
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setVisibleCount(20);
                  }}
                >
                  <option value="open">Pronostics ouverts</option>
                  <option value="all">Tous, y compris réglés et expirés</option>
                </select>
              </label>
            </div>
            <p className="muted">
              Les filtres d’affichage ne retirent pas les éléments déjà ajoutés
              au panier. Les relevés et statuts sont indicatifs ; la comparaison
              les recontrôle sur le serveur.
            </p>
          </fieldset>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Panier</th>
                  <th scope="col">Événement / sélection</th>
                  <th scope="col">Sources conservées</th>
                  <th scope="col">État indicatif</th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((group) => {
                  const sourceDecisions = group.candidates.map((pick) => ({
                    pick,
                    choice: decision(pick, decisionState),
                  }));
                  const { pick, choice } =
                    sourceDecisions.find((entry) => entry.choice.eligible) ??
                    sourceDecisions[0];
                  const eligibleSources = sourceDecisions.filter(
                    (entry) => entry.choice.eligible,
                  ).length;
                  return (
                    <tr key={group.key}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Ajouter ${pick.event} — ${pick.selection} au panier`}
                          checked={selectedKeys.includes(group.key)}
                          disabled={Boolean(pending)}
                          onChange={() => toggleGroup(group.key)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-button"
                          onClick={() => onOpenPick(pick.id)}
                        >
                          {pick.event}
                        </button>
                        <div>
                          {pick.market} · {pick.selection}
                          {pick.line ? ` · ${pick.line}` : ""}
                        </div>
                        <div className="muted">
                          {formatDateTime(pick.startsAt)} ·{" "}
                          {pick.kind === "single" ? "Simple" : "Combiné"} ·{" "}
                          {pick.timing === "prematch" ? "Avant-match" : "Live"}
                        </div>
                      </td>
                      <td>
                        {sourceNames(group.picks)}
                        <div className="muted">
                          {group.candidates.length} pronostics dans le périmètre
                          · {group.picks.length} sources connues
                        </div>
                        <details>
                          <summary>Consulter toutes les sources</summary>
                          <ul>
                            {group.picks.map((sourcePick) => {
                              const sourceDecision = sourceDecisions.find(
                                (entry) => entry.pick.id === sourcePick.id,
                              )?.choice;
                              return (
                                <li key={sourcePick.id}>
                                  <button
                                    type="button"
                                    className="text-link"
                                    onClick={() => onOpenPick(sourcePick.id)}
                                  >
                                    {state.tipsters.find(
                                      (tipster) =>
                                        tipster.id === sourcePick.tipsterId,
                                    )?.name ?? "Profil inconnu"}{" "}
                                    · {sourcePick.sourceId || sourcePick.id}
                                  </button>
                                  <p className="muted">
                                    {sourceDecision
                                      ? `${sourceDecision.status} · ${sourceDecision.reason}`
                                      : "Hors stratégie sélectionnée"}
                                  </p>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      </td>
                      <td>
                        <span
                          className={`badge ${choice.eligible ? "badge-teal" : "badge-amber"}`}
                        >
                          {choice.status}
                        </span>
                        <div className="muted">
                          {eligibleSources} / {group.candidates.length} sources
                          éligibles à cet instant
                        </div>
                        <div className="muted">
                          {choice.quote?.odds == null
                            ? "Cote Winamax inconnue"
                            : `Cote observée : ${formatNumber(choice.quote.odds)}`}
                        </div>
                        <p className="muted">
                          Source affichée : {sourceNames([pick])}.{" "}
                          {choice.reason}
                        </p>
                        <button
                          type="button"
                          className="text-link"
                          onClick={() =>
                            onOpenForm("quote", { pickId: pick.id })
                          }
                        >
                          Ajouter un relevé manuel
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {visibleGroups.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">
                        <h4>Aucune sélection pour ces filtres</h4>
                        <p>
                          Ajoutez des pronostics ou élargissez le périmètre. Les
                          cas manqués restent consultables dans l’historique.
                        </p>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => onOpenForm("pick")}
                        >
                          Ajouter un pronostic
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredGroups.length > visibleCount && (
            <div className="panel-pad">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setVisibleCount((current) => current + 20)}
              >
                Afficher 20 groupes supplémentaires
              </button>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="simulation-basket-title">
          <div className="panel-head">
            <div>
              <p className="eyebrow">2 · DOCUMENTER ET ORDONNER</p>
              <h3 id="simulation-basket-title">Panier de comparaison</h3>
              <p className="muted">
                {selectedGroups.length} sélections distinctes · {candidateCount}{" "}
                pronostics sources. L’ordre est commun aux trois méthodes et
                conservé dans les scénarios.
              </p>
            </div>
            <button
              type="button"
              className="button button-secondary"
              disabled={Boolean(pending) || selectedKeys.length === 0}
              onClick={() => {
                setSelectedKeys([]);
                invalidateComparison();
              }}
            >
              Vider le panier
            </button>
          </div>
          <div className="panel-pad stack">
            {missingSelectionCount > 0 && (
              <div className="notice notice-warning">
                {missingSelectionCount} sélection(s) n’appartiennent plus au
                périmètre courant.{" "}
                <button
                  type="button"
                  className="text-link"
                  disabled={Boolean(pending)}
                  onClick={() => {
                    setSelectedKeys(selectedGroups.map((group) => group.key));
                    invalidateComparison();
                  }}
                >
                  Retirer les sélections indisponibles
                </button>
              </div>
            )}
            {selectedGroups.length === 0 && (
              <div className="empty-state">
                <h4>Votre panier est vide</h4>
                <p>
                  Cochez les sélections à comparer. Aucune probabilité n’est
                  préremplie.
                </p>
              </div>
            )}
            {selectedGroups.map((group, index) => {
              const pick = group.candidates[0];
              const hypothesis = hypotheses[group.key] ?? {
                percent: "",
                basis: "",
              };
              return (
                <article className="simulation-basket-item" key={group.key}>
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">SÉLECTION {index + 1}</p>
                      <h4>
                        {pick.event} · {pick.selection}
                      </h4>
                      <p className="muted">
                        {pick.market} · {pick.line || "Sans ligne"} ·{" "}
                        {pick.rules || "Règles à renseigner"}
                      </p>
                    </div>
                    <div className="simulation-basket-controls">
                      <button
                        type="button"
                        className="button button-secondary"
                        aria-label={`Monter ${pick.selection} dans le panier`}
                        disabled={Boolean(pending) || index === 0}
                        onClick={() => moveGroup(group.key, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        aria-label={`Descendre ${pick.selection} dans le panier`}
                        disabled={
                          Boolean(pending) ||
                          index === selectedGroups.length - 1
                        }
                        onClick={() => moveGroup(group.key, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={Boolean(pending)}
                        onClick={() => toggleGroup(group.key)}
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                  <p className="muted">
                    {sourceNames(group.candidates)} · {group.candidates.length}{" "}
                    source(s) conservée(s). Les doublons restent dans le
                    résultat avec une mise nulle et un motif.
                  </p>
                  <fieldset disabled={Boolean(pending)}>
                    <legend className="sr-only">
                      Hypothèse pour {pick.selection}
                    </legend>
                    <div className="form-grid">
                      <label className="field">
                        <span>
                          Probabilité manuelle pour {pick.selection} (%)
                        </span>
                        <input
                          inputMode="decimal"
                          value={hypothesis.percent}
                          onChange={(event) =>
                            updateHypothesis(group.key, {
                              percent: event.target.value,
                            })
                          }
                          placeholder="Inconnue"
                        />
                        <small className="muted">
                          Facultative. Une absence laisse l’espérance inconnue
                          et bloque Kelly.
                        </small>
                      </label>
                      <label className="field">
                        <span>
                          Fondement de l’hypothèse pour {pick.selection}
                        </span>
                        <textarea
                          rows={2}
                          value={hypothesis.basis}
                          onChange={(event) =>
                            updateHypothesis(group.key, {
                              basis: event.target.value,
                            })
                          }
                          placeholder="Source, raisonnement et limites de votre hypothèse personnelle"
                        />
                        <small className="muted">
                          Obligatoire si une probabilité est saisie. Aucun taux
                          historique n’est repris automatiquement.
                        </small>
                      </label>
                    </div>
                  </fieldset>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => onOpenPick(pick.id)}
                  >
                    Ouvrir le dossier et ses observations
                  </button>
                </article>
              );
            })}
            {eventGroups.length > 0 && (
              <div className="notice notice-warning">
                <strong>
                  Plusieurs sélections portent sur les mêmes événements.
                </strong>
                <ul>
                  {eventGroups.map((event) => (
                    <li key={event[0].eventKey}>
                      {event[0].picks[0].event} : {event.length} sélections
                      partagent le plafond par événement.
                    </li>
                  ))}
                </ul>
                <p>
                  Aucune indépendance n’est supposée entre ces sélections.
                  L’ordre du panier détermine l’utilisation du budget restant.
                </p>
              </div>
            )}
            <label className="field">
              <span>Hypothèses et notes du panier</span>
              <textarea
                rows={3}
                value={assumptions}
                disabled={Boolean(pending)}
                onChange={(event) => {
                  setAssumptions(event.target.value);
                  invalidateComparison();
                }}
                placeholder="Contexte, limites ou conditions à conserver avec le scénario"
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button button-primary"
                disabled={
                  Boolean(pending) ||
                  selectedGroups.length === 0 ||
                  missingSelectionCount > 0
                }
                onClick={() => {
                  void compare();
                }}
              >
                {pending === "compare"
                  ? "Comparaison sur le serveur…"
                  : "Comparer les trois méthodes"}
              </button>
              <span className="muted">
                Aucun mouvement financier. Chaque méthode repart du même budget,
                puis l’utilise une seule fois dans son panier.
              </span>
            </div>
          </div>
        </section>

        {error && (
          <div className="notice notice-warning" role="alert">
            {error}
          </div>
        )}
        {receipt && (
          <div className="notice" role="status">
            <div>
              <strong>Scénario « {receipt.name} » enregistré.</strong>
              <p>
                Allocations recalculées à la sauvegarde :{" "}
                {formatMoney(
                  receipt.allocations.reduce(
                    (total, allocation) => total + allocation.stakeCents,
                    0,
                  ),
                )}
                . Aucun ticket réel ni mouvement de cash créé.
              </p>
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => onOpenSimulation(receipt.id)}
            >
              Voir le scénario conservé
            </button>
          </div>
        )}

        {comparison && (
          <>
            {comparisonStale && (
              <div className="notice notice-warning">
                Les données ou réglages ont changé depuis la comparaison. Les
                montants ci-dessous décrivent l’ancien calcul ; relancez la
                comparaison avant de sauvegarder.
              </div>
            )}
            <BudgetDetails comparison={comparison.result} />
            <section className="panel panel-pad">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">3 · COMPARER ET CONSERVER</p>
                  <h3>Trois scénarios distincts, mêmes contraintes</h3>
                </div>
              </div>
              <label className="field">
                <span>Nom du scénario à enregistrer</span>
                <input
                  maxLength={200}
                  value={scenarioName}
                  disabled={Boolean(pending)}
                  onChange={(event) => setScenarioName(event.target.value)}
                  placeholder="Ex. Revue du soir — scénario prudent"
                />
              </label>
              <p className="muted">
                La sauvegarde recalcule toutes les allocations avec le solde,
                les limites et les cotes encore valides. Un changement depuis
                cette comparaison peut donc modifier les montants. Seules les
                entrées du panier sont transmises ; aucun montant calculé dans
                le navigateur n’est sauvegardé.
              </p>
              <div className="three-grid">
                {comparison.result.methods.map((result) => (
                  <article
                    key={result.method}
                    className="panel panel-pad simulation-method-card"
                  >
                    <span className="badge badge-muted">
                      SIMULÉ · NON EXÉCUTÉ
                    </span>
                    <h4>{METHOD_LABELS[result.method]}</h4>
                    <p className="muted">
                      {settingsDescription(
                        result.method,
                        comparison.result.settingsSnapshot,
                      )}
                    </p>
                    <div className="calculation-output">
                      <small>Total des mises simulées</small>
                      <strong>{formatMoney(result.totalStakeCents)}</strong>
                    </div>
                    <dl className="detail-list">
                      <div className="detail-line">
                        <dt>Allocations positives</dt>
                        <dd>{result.allocatedCount}</dd>
                      </div>
                      <div className="detail-line">
                        <dt>Lignes sans mise, doublons inclus</dt>
                        <dd>{result.abstainedCount}</dd>
                      </div>
                      <div className="detail-line">
                        <dt>Espérance du panier</dt>
                        <dd>
                          {result.totalExpectedCents === null
                            ? "Inconnue"
                            : formatMoney(result.totalExpectedCents, true)}
                        </dd>
                      </div>
                      <div className="detail-line">
                        <dt>Cash restant dans ce scénario</dt>
                        <dd>{formatMoney(result.remainingCashCents)}</dd>
                      </div>
                      <div className="detail-line">
                        <dt>Marge d’exposition globale restante</dt>
                        <dd>{formatMoney(result.remainingExposureCents)}</dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={
                        Boolean(pending) ||
                        comparisonStale ||
                        !scenarioName.trim()
                      }
                      onClick={() => {
                        void save(result.method);
                      }}
                    >
                      {pending === result.method
                        ? "Enregistrement…"
                        : `Enregistrer · ${METHOD_LABELS[result.method]}`}
                    </button>
                  </article>
                ))}
              </div>
              <p className="notice">
                Une espérance positive dépend des probabilités saisies. Elle ne
                démontre pas un avantage. Les plafonds, le cash et les limites
                de pertes priment sur la mise théorique ; les montants sont
                arrondis vers le bas au centime.
              </p>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Décisions et motifs, source par source</h3>
                  <p className="muted">
                    Toutes les abstentions et tous les doublons sont conservés.
                    Les trois méthodes sont des alternatives ; leurs mises ne
                    s’additionnent pas.
                  </p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Ordre / source</th>
                      {comparison.result.methods.map((result) => (
                        <th scope="col" key={result.method}>
                          {METHOD_LABELS[result.method]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.input.candidates.map((candidate, index) => {
                      const pick = state.picks.find(
                        (entry) => entry.id === candidate.pickId,
                      );
                      return (
                        <tr key={`${candidate.pickId}-${index}`}>
                          <td>
                            <span className="badge badge-muted">
                              {index + 1}
                            </span>
                            <button
                              type="button"
                              className="table-button"
                              onClick={() => onOpenPick(candidate.pickId)}
                            >
                              {pick?.event ?? candidate.pickId}
                            </button>
                            <div>{pick?.selection}</div>
                            <div className="muted">
                              {pick ? sourceNames([pick]) : "Source conservée"}
                            </div>
                            <div className="muted">
                              {candidate.probability === null
                                ? "Probabilité inconnue"
                                : `Hypothèse manuelle : ${formatPercent(candidate.probability)}`}
                            </div>
                            {candidate.basis && (
                              <details>
                                <summary>Fondement de l’hypothèse</summary>
                                <p>{candidate.basis}</p>
                              </details>
                            )}
                          </td>
                          {comparison.result.methods.map((result) => {
                            const allocation = result.allocations[index];
                            return (
                              <td key={result.method}>
                                {allocation ? (
                                  <>
                                    <strong>
                                      {formatMoney(allocation.stakeCents)}
                                    </strong>
                                    <div className="muted">
                                      Cote : {formatNumber(allocation.odds)} ·
                                      EV :{" "}
                                      {allocation.expectedCents === null
                                        ? "inconnue"
                                        : formatMoney(
                                            allocation.expectedCents,
                                            true,
                                          )}
                                    </div>
                                    <p>{allocation.reason}</p>
                                  </>
                                ) : (
                                  <span className="muted">
                                    Aucune réponse pour cette source
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
        <section className="panel panel-pad">
          <div className="section-heading">
            <div>
              <h3>Règles figées associables aux scénarios</h3>
              <p className="muted">
                Une règle suivie reste une hypothèse. Son budget utilise le
                portefeuille commun.
              </p>
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => onOpenForm("strategy")}
            >
              Ajouter une stratégie
            </button>
          </div>
          {state.strategies.length === 0 ? (
            <p className="muted">
              Aucune stratégie figée. Créez une règle avec ses périodes de
              découverte et validation avant de suivre de nouvelles
              observations.
            </p>
          ) : (
            <div className="simulation-source-list">
              {state.strategies.map((entry) => (
                <div key={entry.id}>
                  <strong>{entry.name}</strong>{" "}
                  <span
                    className={`badge ${entry.active ? "badge-teal" : "badge-muted"}`}
                  >
                    {entry.active ? "Suivie" : "Inactive, conservée"}
                  </span>
                  <p className="muted">
                    Gel : {formatDateTime(entry.frozenAt)} · Validation à partir
                    du {formatDateTime(entry.validationStart)}
                  </p>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => onExploreStrategy(entry.id, entry.filter)}
                  >
                    Voir la validation séparée
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>

      <section id="simulation-saved" className="panel">
        <div className="panel-head">
          <div>
            <h2>Scénarios enregistrés</h2>
            <p className="muted">
              Paramètres et allocations conservés à leur date de calcul. Chaque
              scénario est distinct des tickets réellement acceptés.
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onOpenForm("simulation")}
          >
            Simulation simple
          </button>
        </div>
        <div className="panel-pad">
          <label className="field">
            <span>Rechercher un scénario</span>
            <input
              type="search"
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
            />
          </label>
        </div>
        {history.length === 0 ? (
          <div className="empty-state">
            <h3>Aucun scénario pour ce périmètre</h3>
            <p>
              Comparez un panier puis enregistrez la méthode étudiée, y compris
              lorsqu’elle conduit à s’abstenir.
            </p>
            <a
              href="#simulation-composer"
              className="button button-primary"
              onClick={() => setPane("composer")}
            >
              Composer un panier
            </a>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Scénario</th>
                  <th scope="col">Méthode / montant</th>
                  <th scope="col">Conditions conservées</th>
                  <th scope="col">Références</th>
                </tr>
              </thead>
              <tbody>
                {history.map((simulation) => (
                  <tr key={simulation.id}>
                    <td>
                      <button
                        type="button"
                        className="table-button"
                        onClick={() => onOpenSimulation(simulation.id)}
                      >
                        {simulation.name}
                      </button>
                      <div className="muted">
                        {formatDateTime(simulation.createdAt)}
                      </div>
                      <span className="badge badge-muted">
                        Simulé sur Winamax
                      </span>
                    </td>
                    <td>
                      {METHOD_LABELS[simulation.method]}
                      <div>
                        <strong>
                          {formatMoney(
                            simulation.allocations.reduce(
                              (total, allocation) =>
                                total + allocation.stakeCents,
                              0,
                            ),
                          )}
                        </strong>
                      </div>
                      <div className="muted">
                        {
                          simulation.allocations.filter(
                            (allocation) => allocation.stakeCents > 0,
                          ).length
                        }{" "}
                        allocations ·{" "}
                        {
                          simulation.allocations.filter(
                            (allocation) => allocation.stakeCents === 0,
                          ).length
                        }{" "}
                        abstentions
                      </div>
                    </td>
                    <td>
                      <details>
                        <summary>Paramètres de ce scénario</summary>
                        <dl className="detail-list">
                          <div className="detail-line">
                            <dt>Mise fixe</dt>
                            <dd>
                              {formatMoney(
                                simulation.settingsSnapshot.fixedStakeCents,
                              )}
                            </dd>
                          </div>
                          <div className="detail-line">
                            <dt>Part de capital</dt>
                            <dd>
                              {formatPercent(
                                simulation.settingsSnapshot.stakePercent,
                              )}
                            </dd>
                          </div>
                          <div className="detail-line">
                            <dt>Fraction Kelly</dt>
                            <dd>
                              {formatPercent(
                                simulation.settingsSnapshot.kellyFraction,
                              )}
                            </dd>
                          </div>
                          <div className="detail-line">
                            <dt>Plafonds pari / événement / exposition</dt>
                            <dd>
                              {formatPercent(
                                simulation.settingsSnapshot.maxBetPercent,
                              )}{" "}
                              /{" "}
                              {formatPercent(
                                simulation.settingsSnapshot.maxEventPercent,
                              )}{" "}
                              /{" "}
                              {formatPercent(
                                simulation.settingsSnapshot.maxExposurePercent,
                              )}
                            </dd>
                          </div>
                          <div className="detail-line">
                            <dt>Pertes quotidiennes / mensuelles</dt>
                            <dd>
                              {formatMoney(
                                simulation.settingsSnapshot.dailyLossLimitCents,
                              )}{" "}
                              /{" "}
                              {formatMoney(
                                simulation.settingsSnapshot
                                  .monthlyLossLimitCents,
                              )}
                            </dd>
                          </div>
                          {simulation.bankrollSnapshot && (
                            <>
                              <div className="detail-line">
                                <dt>Capital au calcul</dt>
                                <dd>
                                  {formatMoney(
                                    simulation.bankrollSnapshot.capitalCents,
                                  )}
                                </dd>
                              </div>
                              <div className="detail-line">
                                <dt>Cash au calcul</dt>
                                <dd>
                                  {formatMoney(
                                    simulation.bankrollSnapshot.cashCents,
                                  )}
                                </dd>
                              </div>
                              <div className="detail-line">
                                <dt>Positions ouvertes au calcul</dt>
                                <dd>
                                  {formatMoney(
                                    simulation.bankrollSnapshot.openStakeCents,
                                  )}
                                </dd>
                              </div>
                            </>
                          )}
                        </dl>
                        <p>{simulation.assumptions}</p>
                        {!simulation.bankrollSnapshot && (
                          <p className="muted">
                            Scénario ancien : l’état initial du portefeuille n’a
                            pas été conservé dans ce format.
                          </p>
                        )}
                      </details>
                    </td>
                    <td>
                      <details>
                        <summary>
                          {simulation.allocations.length} pronostics sources
                        </summary>
                        <ul>
                          {simulation.allocations.map((allocation, index) => (
                            <li key={`${allocation.pickId}-${index}`}>
                              <button
                                type="button"
                                className="text-link"
                                onClick={() => onOpenPick(allocation.pickId)}
                              >
                                {state.picks.find(
                                  (pick) => pick.id === allocation.pickId,
                                )?.event ?? allocation.pickId}
                              </button>{" "}
                              · {formatMoney(allocation.stakeCents)}
                              <p className="muted">{allocation.reason}</p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section id="simulation-backtest" aria-label="Rejeu chronologique">
        <BacktestView state={state} openPick={onOpenPick} />
      </section>
      <section
        id="simulation-calculators"
        aria-label="Calculatrices probabilistes"
      >
        <ProbabilityCalculator />
      </section>
    </div>
  );
}
