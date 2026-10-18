"use client";

import { useEffect, useState, type FormEvent } from "react";
import { backtest } from "@/domain/backtest";
import type { AppState, Strategy } from "@/domain/types";

type BacktestOptions = Parameters<typeof backtest>[1];
type BacktestResult = ReturnType<typeof backtest>;
type Evaluation = {
  result: BacktestResult;
  options: BacktestOptions;
  generatedAt: string;
  workspace: AppState["workspace"];
  strategy: Strategy;
  settings: AppState["settings"];
  inputs: { picks: AppState["picks"]; quotes: AppState["quotes"]; tipsters: AppState["tipsters"] };
};

const money = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
const percentage = (value: number | null) => value === null ? "Non disponible" : new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 2 }).format(value);
const units = (value: number | null) => value === null ? "Non disponible" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(value)} u`;
const dateLabel = (value: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }).format(new Date(value));

function parisInput(value: string): string {
  if (!Number.isFinite(Date.parse(value))) return "";
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

function parisToISO(value: string): string {
  const local = value.length === 16 ? `${value}:00` : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(local)) throw new Error("Renseignez une date et une heure valides.");
  const target = Date.parse(`${local}Z`);
  if (!Number.isFinite(target)) throw new Error("La date saisie est invalide.");
  let candidate = target;
  for (let iteration = 0; iteration < 3; iteration += 1) candidate += target - Date.parse(`${parisInput(new Date(candidate).toISOString())}Z`);
  if (parisInput(new Date(candidate).toISOString()) !== local) throw new Error("Cette heure n’existe pas à Paris lors du changement d’heure.");
  const alternatives = [candidate - 3_600_000, candidate + 3_600_000];
  if (alternatives.some((alternative) => parisInput(new Date(alternative).toISOString()) === local)) {
    throw new Error("Cette heure est ambiguë lors du passage à l’heure d’hiver. Choisissez une borne avant 02:00 ou à partir de 03:00 pour cette journée.");
  }
  return new Date(candidate).toISOString();
}

export function BacktestView({ state, openPick }: { state: AppState; openPick: (id: string) => void }) {
  const [strategyId, setStrategyId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState(() => parisInput(new Date().toISOString()));
  const [capital, setCapital] = useState("");
  const [delay, setDelay] = useState("0");
  const [method, setMethod] = useState<"fixed" | "percent" | "kelly">("fixed");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [error, setError] = useState("");
  const [rowFilter, setRowFilter] = useState("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    setStrategyId(""); setStart(""); setEnd(parisInput(new Date().toISOString()));
    setCapital(""); setDelay("0"); setEvaluation(null); setError(""); setPage(0); setRowFilter("all");
  }, [state.workspace]);

  const strategies = state.strategies.filter((strategy) => Number.isFinite(Date.parse(strategy.frozenAt)));
  const selectedStrategy = strategies.find((strategy) => strategy.id === strategyId);
  const result = evaluation?.result;
  const rows = result?.rows
    .filter((row) => rowFilter === "all" || (rowFilter === "allocated" ? row.status !== "abstained" : row.status === "abstained"))
    .sort((a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity) || a.pickId.localeCompare(b.pickId)) ?? [];
  const pageCount = Math.max(1, Math.ceil(rows.length / 25));
  const visibleRows = rows.slice(page * 25, (page + 1) * 25);

  function chooseStrategy(id: string) {
    setStrategyId(id);
    const strategy = strategies.find((item) => item.id === id);
    if (strategy) {
      const firstAllowed = Math.max(Date.parse(strategy.validationStart), Date.parse(strategy.frozenAt));
      if (Number.isFinite(firstAllowed)) setStart(parisInput(new Date(Math.ceil(firstAllowed / 1000) * 1000).toISOString()));
    }
  }

  function evaluate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setEvaluation(null);
    try {
      if (!selectedStrategy) throw new Error("Sélectionnez une stratégie figée avant de lancer l’évaluation.");
      const initialCapitalCents = Math.round(Number(capital) * 100);
      if (!capital.trim() || !Number.isSafeInteger(initialCapitalCents) || initialCapitalCents <= 0) throw new Error("Indiquez un capital initial strictement positif en euros.");
      const delayMinutes = Number(delay);
      if (!delay.trim() || !Number.isFinite(delayMinutes) || delayMinutes < 0) throw new Error("Le délai d’exécution doit être un nombre positif ou nul.");
      const startISO = parisToISO(start);
      const endISO = parisToISO(end);
      if (Date.parse(startISO) >= Date.parse(endISO)) throw new Error("La fin doit être postérieure au début de l’évaluation.");
      if (Date.parse(endISO) > Date.now()) throw new Error("L’évaluation historique doit se terminer dans le passé ou à l’heure actuelle.");
      const options: BacktestOptions = { strategyId, start: startISO, end: endISO, delayMinutes, method, initialCapitalCents };
      const computed = backtest(state, options);
      setEvaluation({
        result: computed, options, generatedAt: new Date().toISOString(), workspace: state.workspace,
        strategy: structuredClone(selectedStrategy), settings: structuredClone(state.settings),
        inputs: structuredClone({ picks: state.picks, quotes: state.quotes, tipsters: state.tipsters }),
      });
      setRowFilter("all"); setPage(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L’évaluation n’a pas pu être calculée.");
    }
  }

  function exportEvaluation() {
    if (!evaluation) return;
    const contents = JSON.stringify({ schemaVersion: 1, kind: "chronological-backtest", ...evaluation }, null, 2);
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `evaluation-${evaluation.workspace}-${evaluation.generatedAt.slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="stack" aria-labelledby="backtest-title">
    <div className="panel">
      <div className="panel-head"><div><p className="eyebrow">VALIDATION CHRONOLOGIQUE</p><h2 id="backtest-title">Rejouer une stratégie figée</h2></div><span className="badge badge-muted">Simulation historique</span></div>
      <div className="panel-pad">
        <p className="muted">Évaluez une règle définie avant la période testée, avec les observations de cotes disponibles à chaque décision. Les refus et les données manquantes restent visibles.</p>
        {strategies.length === 0 && <div className="notice notice-warning">Aucune stratégie figée disponible. Créez une stratégie dans l’analyse des tipsters, avec une fin de découverte et un début de validation, avant de lancer cette évaluation.</div>}
        <form onSubmit={evaluate} onChange={() => { setEvaluation(null); setError(""); }}>
          <div className="form-grid">
            <label className="field field-full" htmlFor="backtest-strategy"><span>Stratégie figée</span><select id="backtest-strategy" required value={strategyId} onChange={(event) => chooseStrategy(event.target.value)}><option value="">Choisir une stratégie</option>{strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}</select></label>
            <label className="field" htmlFor="backtest-start"><span>Début de la période (heure de Paris)</span><input id="backtest-start" type="datetime-local" step="1" value={start} onChange={(event) => setStart(event.target.value)} required /></label>
            <label className="field" htmlFor="backtest-end"><span>Fin de la période (heure de Paris)</span><input id="backtest-end" type="datetime-local" step="1" value={end} onChange={(event) => setEnd(event.target.value)} required /></label>
            <label className="field" htmlFor="backtest-capital"><span>Capital initial simulé (€)</span><input id="backtest-capital" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="Ex. 1000,00" value={capital} onChange={(event) => setCapital(event.target.value)} required /><small className="muted">Montant explicite, indépendant du solde de votre compte.</small></label>
            <label className="field" htmlFor="backtest-delay"><span>Délai après publication (minutes)</span><input id="backtest-delay" type="number" min="0" step="any" value={delay} onChange={(event) => setDelay(event.target.value)} required /><small className="muted">Le moteur cherche une cote connue au moment de la décision.</small></label>
            <label className="field field-full" htmlFor="backtest-method"><span>Méthode de mise</span><select id="backtest-method" value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="fixed">Mise fixe — {money(state.settings.fixedStakeCents)}</option><option value="percent">Pourcentage du capital — {percentage(state.settings.stakePercent)}</option><option value="kelly">Kelly fractionné — {percentage(state.settings.kellyFraction)}</option></select></label>
          </div>
          {selectedStrategy && <p className="notice">Stratégie figée le {dateLabel(selectedStrategy.frozenAt)}. Fin de découverte : {dateLabel(selectedStrategy.discoveryEnd)}. Début de validation : {dateLabel(selectedStrategy.validationStart)}. Toute période antérieure à ces contraintes sera refusée.</p>}
          <p className="muted">La période porte sur le début des événements : borne de début incluse, borne de fin exclue. Les montants de mise, plafonds d’exposition, seuils de pertes et durée de validité des cotes proviennent des réglages actuels. Les prévisions probabilistes historiques ne sont pas disponibles : Kelly s’abstient dans ce rejeu.</p>
          <div className="form-actions"><button type="submit" className="button button-primary" disabled={!selectedStrategy}>Évaluer la période</button></div>
        </form>
        {error && <p className="notice notice-warning" role="alert">{error}</p>}
      </div>
    </div>

    {evaluation && result && <>
      <div className="notice" role="status"><strong>{result.status === "evaluated" ? "Évaluation calculée." : "Évaluation insuffisante."}</strong> {result.reason}</div>
      <div className="metric-grid">
        <div className="metric"><div className="metric-top">Profit réalisé simulé</div><div className="metric-value">{result.status === "evaluated" ? money(result.profitCents) : "—"}</div><div className="metric-note">{result.settledCount} allocations réglées</div></div>
        <div className="metric"><div className="metric-top">ROI sur mises réglées</div><div className="metric-value">{percentage(result.roi)}</div><div className="metric-note">Capital final : {money(result.endingCapitalCents)}, mises ouvertes au nominal</div></div>
        <div className="metric"><div className="metric-top">Couverture d’exécution</div><div className="metric-value">{percentage(result.coverage)}</div><div className="metric-note">{result.allocatedCount} allocations sur {result.candidateCount} candidats</div></div>
        <div className="metric"><div className="metric-top">Repli maximal</div><div className="metric-value">{result.status === "evaluated" ? percentage(result.drawdownPct) : "—"}</div><div className="metric-note">{result.abstentionCount} abstentions documentées</div></div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Références & hypothèses</h3><p className="muted">Période du {dateLabel(evaluation.options.start)} au {dateLabel(evaluation.options.end)}, heure de Paris.</p></div><button type="button" className="button button-secondary" onClick={exportEvaluation}>Exporter cette évaluation</button></div>
        <div className="panel-pad">
          <p>Référence à mise constante de 1 unité : <strong>{units(result.benchmark1u)}</strong>.</p>
          <p className="muted">Cette référence porte sur les mêmes sélections simulées et réglées, à leur cote Winamax observée. Elle compare la méthode de mise ; elle ne représente pas un gain exécuté sur votre compte.</p>
          <ul>{result.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul>
          <p className="notice">Calibration probabiliste : Brier et log-loss non disponibles. Une cote ou un rendement passé ne suffit pas à établir une probabilité de gain fiable.</p>
          <p className="muted">Calcul du {dateLabel(evaluation.generatedAt)}, conservé uniquement dans cette vue. L’export JSON inclut les paramètres, les réglages, les tipsters, les pronostics, les cotes et les résultats utilisés pour cette évaluation.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Décisions dans l’ordre chronologique</h3><p className="muted">Les profits correspondent aux résultats connus à la fin de la période. Les abstentions sans observation datée figurent en fin de tableau.</p></div></div>
        <div className="panel-pad"><label className="field" htmlFor="backtest-filter"><span>Afficher les décisions</span><select id="backtest-filter" value={rowFilter} onChange={(event) => { setRowFilter(event.target.value); setPage(0); }}><option value="all">Toutes les décisions</option><option value="allocated">Allocations</option><option value="abstained">Abstentions</option></select></label></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th scope="col">Décision (Paris)</th><th scope="col">Pronostic</th><th scope="col">Décision & motif</th><th scope="col">Mise simulée</th><th scope="col">Cote</th><th scope="col">Profit</th></tr></thead><tbody>
          {visibleRows.map((row, index) => {
            const pick = evaluation.inputs.picks.find((candidate) => candidate.id === row.pickId);
            const allocated = row.allocation !== null && row.allocation.stakeCents > 0;
            const statusLabels = { abstained: "Abstention", open: "Simulé · ouvert", settled: "Simulé · réglé", unresolved: "Règlement non évaluable" };
            return <tr key={`${row.pickId}-${row.at}-${index}`}><td>{row.at ? dateLabel(row.at) : "Sans observation datée"}</td><td><button type="button" className="text-link" onClick={() => openPick(row.pickId)}>{pick?.event ?? row.pickId}</button><div className="muted">{pick?.selection ?? ""}</div></td><td><span className={`badge ${allocated ? "badge-teal" : "badge-amber"}`}>{statusLabels[row.status]}</span><p className="muted">{row.reason}</p></td><td>{allocated ? money(row.allocation!.stakeCents) : "—"}</td><td>{allocated ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(row.allocation!.odds) : "—"}</td><td>{row.profitCents === null ? "Non réglé / non alloué" : money(row.profitCents)}</td></tr>;
          })}
          {visibleRows.length === 0 && <tr><td colSpan={6}><div className="empty-state">Aucune décision pour ce filtre.</div></td></tr>}
        </tbody></table></div>
        {pageCount > 1 && <div className="panel-pad form-actions"><button type="button" className="button button-secondary" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Précédent</button><span className="muted">Page {page + 1} sur {pageCount}</span><button type="button" className="button button-secondary" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Suivant</button></div>}
      </div>
    </>}
  </section>;
}
