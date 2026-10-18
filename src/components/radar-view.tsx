"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Database,
  FlaskConical,
  Layers3,
  Loader2,
  Radio,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import type { AppState, SegmentFilter } from "@/domain/types";
import { RESULT_LABELS } from "@/domain/types";
import { bankroll } from "@/domain/calculations";
import { radarCandidates } from "@/domain/radar";
import type { FormKind } from "@/components/entity-forms";
import { TipstersPreview } from "@/components/tipsters-view";
import { OddsConnectorPanel } from "@/components/odds-connector-panel";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/components/analysis-ui";

type RadarDestination =
  | "tipsters"
  | "specialties"
  | "sources"
  | "settings"
  | "simulations";
type RadarCase = ReturnType<typeof radarCandidates>[number];

type RadarViewProps = {
  state: AppState;
  search?: string;
  demoLoading: boolean;
  onOpenDemo: () => void;
  onOpenPick: (id: string) => void;
  onOpenTipster: (id: string) => void;
  onOpenForm: (kind: FormKind, initial?: Record<string, unknown>) => void;
  onNavigate: (view: RadarDestination) => void;
  onExploreStrategy: (id: string, filter: SegmentFilter) => void;
  mutate: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  portfolioChart?: ReactNode;
};

const STATUSES = [
  "À analyser",
  "En observation",
  "Expiré",
  "Marché indisponible",
  "Cote insuffisante selon le seuil défini",
  "Données insuffisantes",
] as const;

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((first, second) =>
    first.localeCompare(second, "fr"),
  );
}

function ageLabel(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes))
    return "Horodatage non disponible";
  if (minutes < 1) return "Moins d’une minute";
  if (minutes < 60) return `${formatNumber(minutes, 0)} min`;
  if (minutes < 1440) return `${formatNumber(minutes / 60, 1)} h`;
  return `${formatNumber(minutes / 1440, 1)} j`;
}

function hasRecentOdds(dossier: RadarCase): boolean {
  const quote = dossier.latestQuote;
  return Boolean(
    quote?.available &&
      quote.odds !== null &&
      quote.odds > 1 &&
      dossier.quoteFresh,
  );
}

function RadarMetric({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  note: ReactNode;
  icon: typeof Radio;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon />
        </span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}

function DossierRow({
  dossier,
  state,
  onOpen,
}: {
  dossier: RadarCase;
  state: AppState;
  onOpen: (id: string) => void;
}) {
  const pick = dossier.pick;
  const tipster = state.tipsters.find((item) => item.id === pick.tipsterId);
  const quote = dossier.latestQuote;
  const statusTone =
    dossier.status === "À analyser"
      ? "teal"
      : dossier.status === "Expiré"
        ? "muted"
        : "amber";
  const executed = state.tickets.filter((ticket) => ticket.pickId === pick.id);

  return (
    <article className="radar-dossier">
      <div className="radar-dossier-main">
        <div className="radar-dossier-kicker">
          <span>{pick.sport || "Sport non renseigné"}</span>
          <span aria-hidden="true">·</span>
          <span>{pick.competition || "Compétition non renseignée"}</span>
        </div>
        <button
          className="pick-title radar-dossier-title"
          onClick={() => onOpen(pick.id)}
        >
          {pick.event}
        </button>
        <p className="radar-selection">
          {pick.selection} · {pick.market}
          {pick.line ? ` · Ligne ${pick.line}` : ""}
        </p>
        <p className="radar-date">
          <Clock3 size={11} aria-hidden="true" />
          {formatDateTime(pick.startsAt)} · Paris
        </p>
        <div className="pick-foot">
          <span className={`badge badge-${statusTone}`}>{dossier.status}</span>
          <span className="badge badge-outline">
            {pick.evidence === "observed"
              ? "Observation prospective"
              : "Historique déclaré"}
          </span>
          {pick.result !== "open" && (
            <span className="badge badge-muted">
              Règlement : {RESULT_LABELS[pick.result]}
            </span>
          )}
        </div>
        <p className="radar-reason">{dossier.reason}</p>
        <div className="radar-source-line">
          <span>{tipster?.name ?? "Profil non retrouvé"}</span>
          <span>Publication {formatDateTime(pick.publishedAt)}</span>
          {dossier.duplicates.length > 0 && (
            <span>
              {dossier.duplicates.length + 1} publications identiques · sources
              non indépendantes
            </span>
          )}
        </div>
      </div>
      <div className="radar-dossier-quotes">
        <dl className="radar-quote-comparison">
          <div>
            <dt>Publiée</dt>
            <dd>{formatNumber(dossier.announcedOdds)}</dd>
          </div>
          <div>
            <dt>Winamax observée</dt>
            <dd>
              {dossier.currentOdds === null
                ? "—"
                : formatNumber(dossier.currentOdds)}
            </dd>
          </div>
        </dl>
        <span
          className={`badge ${hasRecentOdds(dossier) ? "badge-teal" : "badge-amber"}`}
        >
          {quote
            ? quote.available
              ? dossier.quoteFresh
                ? "Relevé récent"
                : "Fraîcheur non valide"
              : "Indisponible au dernier relevé"
            : "Cote non observée"}
        </span>
        <p className="muted">
          {quote
            ? `${ageLabel(dossier.quoteAgeMinutes)} · ${quote.source}`
            : "Espérance inconnue"}
        </p>
        <p className="muted">
          {dossier.thresholdOdds === null
            ? "Aucun seuil fourni par le tipster"
            : `Seuil du tipster : ${formatNumber(dossier.thresholdOdds)}`}
        </p>
        <p className="muted">
          {executed.length
            ? `${executed.length} ticket(s) lié(s) · cotes acceptées dans la fiche`
            : "Aucun ticket accepté lié"}
        </p>
        <button
          className="button button-secondary"
          onClick={() => onOpen(pick.id)}
          aria-label={`Analyser le dossier ${pick.event}`}
        >
          Ouvrir le dossier <ArrowUpRight size={12} />
        </button>
      </div>
    </article>
  );
}

export function RadarView({
  state,
  search = "",
  demoLoading,
  onOpenDemo,
  onOpenPick,
  onOpenTipster,
  onOpenForm,
  onNavigate,
  onExploreStrategy,
  mutate,
  portfolioChart,
}: RadarViewProps) {
  const [snapshotTime, setSnapshotTime] = useState(() => new Date());
  const [status, setStatus] = useState("");
  const [sport, setSport] = useState("");
  const [tipsterId, setTipsterId] = useState("");
  const [freshness, setFreshness] = useState("");
  const [scope, setScope] = useState("all");
  const [sort, setSort] = useState("publication");
  const [page, setPage] = useState(0);
  const pageSize = 12;

  useEffect(() => {
    const interval = window.setInterval(
      () => setSnapshotTime(new Date()),
      30_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  const dossiers = useMemo(
    () => radarCandidates(state, { now: snapshotTime }),
    [state, snapshotTime],
  );
  const account = useMemo(() => bankroll(state), [state]);
  const activeTipsters = state.tipsters.filter((tipster) => tipster.active);
  const activeStrategies = state.strategies.filter(
    (strategy) => strategy.active,
  );
  const eligible = dossiers.filter((dossier) => dossier.eligible);
  const activeCases = dossiers.filter(
    (dossier) => dossier.pick.result === "open",
  );
  const quotesMissing = dossiers.filter(
    (dossier) => !dossier.latestQuote,
  ).length;
  const quotesFresh = dossiers.filter(hasRecentOdds).length;
  const quotesAmbiguous = dossiers.filter(
    (dossier) => dossier.matching.status === "ambiguous",
  ).length;
  const unavailable = dossiers.filter(
    (dossier) => dossier.latestQuote && !dossier.latestQuote.available,
  ).length;
  const configured = [
    state.settings.maxBetPercent,
    state.settings.maxEventPercent,
    state.settings.maxExposurePercent,
    state.settings.dailyLossLimitCents,
    state.settings.monthlyLossLimitCents,
  ].every((limit) => limit !== null && limit > 0);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr-FR");
    return dossiers
      .filter((dossier) => {
        const pick = dossier.pick;
        const tipster = state.tipsters.find(
          (item) => item.id === pick.tipsterId,
        );
        const searchable =
          `${pick.event} ${pick.selection} ${pick.market} ${pick.sport} ${tipster?.name ?? ""}`.toLocaleLowerCase(
            "fr-FR",
          );
        if (needle && !searchable.includes(needle)) return false;
        if (status && dossier.status !== status) return false;
        if (sport && pick.sport !== sport) return false;
        if (tipsterId && pick.tipsterId !== tipsterId) return false;
        if (
          scope === "followed" &&
          (!tipster?.active || !dossier.matchingStrategies.length)
        )
          return false;
        if (scope === "open" && pick.result !== "open") return false;
        if (
          scope === "missed" &&
          !(
            dossier.status === "Expiré" &&
            !state.tickets.some((ticket) => ticket.pickId === pick.id)
          )
        )
          return false;
        if (freshness === "fresh" && !hasRecentOdds(dossier)) return false;
        if (
          freshness === "stale" &&
          (!dossier.latestQuote || dossier.quoteFresh)
        )
          return false;
        if (freshness === "missing" && dossier.latestQuote) return false;
        if (
          freshness === "unavailable" &&
          (!dossier.latestQuote || dossier.latestQuote.available)
        )
          return false;
        return true;
      })
      .sort((first, second) => {
        if (sort === "event")
          return (
            Date.parse(first.pick.startsAt) - Date.parse(second.pick.startsAt)
          );
        if (sort === "freshness")
          return (
            (first.quoteAgeMinutes ?? Infinity) -
            (second.quoteAgeMinutes ?? Infinity)
          );
        return (
          Date.parse(second.pick.publishedAt) -
          Date.parse(first.pick.publishedAt)
        );
      });
  }, [
    dossiers,
    search,
    status,
    sport,
    tipsterId,
    scope,
    freshness,
    sort,
    state.tipsters,
    state.tickets,
  ]);

  useEffect(
    () => setPage(0),
    [search, status, sport, tipsterId, freshness, scope, sort, state.workspace],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );

  function resetFilters() {
    setStatus("");
    setSport("");
    setTipsterId("");
    setFreshness("");
    setScope("all");
    setSort("publication");
    setPage(0);
  }

  return (
    <div className="radar-view">
      <section className="welcome-card">
        <div>
          <div className="eyebrow">VOTRE POINT DE VUE, AVEC SES SOURCES</div>
          <h2>
            {dossiers.length
              ? `${activeCases.length} dossier${activeCases.length > 1 ? "s" : ""} ouvert${activeCases.length > 1 ? "s" : ""}. Observez avant de décider.`
              : "Moins d’intuition. Plus de perspective."}
          </h2>
          <p>
            {dossiers.length
              ? `${eligible.length} dossier(s) à analyser selon les cotes et les règles de suivi. Les limites de risque et l’espérance sont vérifiées séparément, sans prise de pari automatique.`
              : "Rassemblez vos pronostics, documentez les cotes Winamax accessibles et construisez une fiche de décision vérifiable."}
          </p>
        </div>
        <div className="welcome-actions">
          {state.workspace === "personal" ? (
            <button
              className="button button-light"
              onClick={onOpenDemo}
              disabled={demoLoading}
            >
              {demoLoading ? <Loader2 className="spin" /> : <FlaskConical />}
              Explorer la démonstration
              <ArrowRight />
            </button>
          ) : (
            <button
              className="button button-light"
              onClick={() => onNavigate("specialties")}
            >
              Explorer les spécialités
              <ArrowRight />
            </button>
          )}
        </div>
      </section>

      <div className="metric-grid">
        <RadarMetric
          label="Dossiers à analyser"
          value={eligible.length}
          note={`${activeCases.length} pronostics ouverts, historiques conservés`}
          icon={Radio}
        />
        <RadarMetric
          label="Profils suivis"
          value={activeTipsters.length}
          note={`${activeStrategies.length} segments suivis`}
          icon={Users}
        />
        <RadarMetric
          label="Exposition cash ouverte"
          value={formatMoney(account.openStakeCents)}
          note={
            account.capitalCents > 0
              ? `${formatPercent(account.openStakeCents / account.capitalCents)} du capital comptable`
              : "Capital personnel non renseigné"
          }
          icon={Wallet}
        />
        <RadarMetric
          label="Résultat net réel"
          value={formatMoney(account.netProfitCents, true)}
          note="Tickets documentés, promotions et frais comptabilisés"
          icon={TrendingUp}
        />
      </div>

      <div className="dashboard-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>
                  Les dossiers du radar{" "}
                  <span className="count-chip">{filtered.length}</span>
                </h2>
                <p>
                  Les paris expirés, indisponibles et manqués restent
                  consultables.
                </p>
              </div>
              <Radio size={18} color="var(--teal)" />
            </div>
            <div className="radar-filter-grid">
              <label className="field">
                Statut du dossier
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">Les six statuts</option>
                  {STATUSES.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Périmètre
                <select
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                >
                  <option value="all">Tous, historiques compris</option>
                  <option value="followed">Profils et segments suivis</option>
                  <option value="open">Pronostics encore ouverts</option>
                  <option value="missed">Expirés sans ticket lié</option>
                </select>
              </label>
              <label className="field">
                Sport
                <select
                  value={sport}
                  onChange={(event) => setSport(event.target.value)}
                >
                  <option value="">Tous les sports</option>
                  {unique(state.picks.map((pick) => pick.sport)).map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                Tipster
                <select
                  value={tipsterId}
                  onChange={(event) => setTipsterId(event.target.value)}
                >
                  <option value="">Tous les profils</option>
                  {state.tipsters.map((tipster) => (
                    <option key={tipster.id} value={tipster.id}>
                      {tipster.name}
                      {tipster.active ? "" : " · inactif"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                État des cotes
                <select
                  value={freshness}
                  onChange={(event) => setFreshness(event.target.value)}
                >
                  <option value="">Tous les relevés</option>
                  <option value="fresh">Cotes récentes</option>
                  <option value="stale">Fraîcheur non valide</option>
                  <option value="missing">Aucune observation</option>
                  <option value="unavailable">Marché indisponible</option>
                </select>
              </label>
              <label className="field">
                Ordre d’affichage
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="publication">
                    Publication la plus récente
                  </option>
                  <option value="event">Début d’événement</option>
                  <option value="freshness">Observation la plus récente</option>
                </select>
              </label>
            </div>
            <div className="radar-filter-caption">
              <span>
                Statuts recalculés le{" "}
                {formatDateTime(snapshotTime.toISOString())}
              </span>
              <button className="text-link" onClick={resetFilters}>
                Réinitialiser
              </button>
            </div>
            {visible.length ? (
              visible.map((dossier) => (
                <DossierRow
                  key={dossier.pick.id}
                  dossier={dossier}
                  state={state}
                  onOpen={onOpenPick}
                />
              ))
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  <Radio size={24} />
                </div>
                <h3>
                  {dossiers.length
                    ? "Aucun dossier dans ce périmètre"
                    : "Votre premier dossier vous attend"}
                </h3>
                <p>
                  {dossiers.length
                    ? "Changez les filtres pour consulter les autres observations. Aucun dossier n’a été supprimé pour améliorer le bilan."
                    : "Ajoutez un tipster et ses pronostics, ou importez votre historique pour construire vos analyses."}
                </p>
                {!dossiers.length && (
                  <button
                    className="button button-primary"
                    onClick={() => onNavigate("sources")}
                  >
                    <ArrowDownToLine size={14} />
                    Importer mes premiers pronostics
                  </button>
                )}
              </div>
            )}
            <div className="panel-footer radar-pagination">
              <span>
                {filtered.length} dossiers · seuil de fraîcheur{" "}
                {state.settings.quoteMaxAgeMinutes} min
              </span>
              {pageCount > 1 && (
                <div>
                  <button
                    className="button button-secondary button-small"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Précédent
                  </button>
                  <span>
                    Page {currentPage + 1} / {pageCount}
                  </span>
                  <button
                    className="button button-secondary button-small"
                    disabled={currentPage + 1 >= pageCount}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Suivant
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Les profils sous votre radar</h2>
                <p>
                  Historique déclaré uniquement · 1 unité par ticket standard
                  documenté.
                </p>
              </div>
              <button
                className="text-link"
                onClick={() => onNavigate("tipsters")}
              >
                Tous les tipsters
                <ArrowUpRight size={12} />
              </button>
            </div>
            <TipstersPreview
              state={state}
              search={search}
              onOpenTipster={onOpenTipster}
              onCreateTipster={() => onOpenForm("tipster")}
            />
            <div className="panel-footer">
              <span>
                Les performances passées ne sont pas des probabilités
                individuelles.
              </span>
            </div>
          </section>
          {portfolioChart && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Votre performance réalisée</h2>
                  <p>
                    Valeur de part · base 100, neutralisée des dépôts et
                    retraits.
                  </p>
                </div>
                <span className="chart-legend">
                  <i />
                  Portefeuille personnel
                </span>
              </div>
              {portfolioChart}
              <p className="chart-caption">
                Positions ouvertes suivies au coût. Les mouvements de capital ne
                deviennent pas des bénéfices.
              </p>
            </section>
          )}
        </div>

        <aside className="stack dashboard-aside">
          <OddsConnectorPanel
            state={state}
            mutate={mutate}
            compact
            onOpenManual={(pickId) =>
              onOpenForm("quote", pickId ? { pickId } : undefined)
            }
          />
          <section className="attention-card">
            <div className="attention-top">
              <ShieldCheck />
              {configured ? "Votre cadre de risque" : "Définissez votre cadre"}
            </div>
            <p>
              {state.settings.paused
                ? "Les suggestions sont en pause. Les observations et tickets existants restent visibles."
                : configured
                  ? "Une cote exploitable ne suffit pas : chaque simulation vérifie le cash, l’exposition commune et les limites personnelles."
                  : "Renseignez capital, plafonds d’exposition et limites de pertes avant d’allouer une mise simulée."}
            </p>
            <button
              className="text-link"
              onClick={() => onNavigate("settings")}
            >
              Voir mes limites
              <ArrowRight size={12} />
            </button>
          </section>
          <section className="panel panel-pad">
            <div className="section-heading">
              <h3>Couverture des cotes</h3>
              <Database size={16} color="var(--teal)" />
            </div>
            <div className="check-row">
              <CheckCircle2 />
              <span>Dossiers avec cote récente</span>
              <span>{quotesFresh}</span>
            </div>
            <div className="check-row">
              <Clock3 />
              <span>Sans observation</span>
              <span>{quotesMissing}</span>
            </div>
            <div className="check-row">
              <Layers3 />
              <span>Correspondance ambiguë</span>
              <span>{quotesAmbiguous}</span>
            </div>
            <div className="check-row">
              <Database />
              <span>Dernier marché indisponible</span>
              <span>{unavailable}</span>
            </div>
            <p className="muted" style={{ marginTop: 14, fontSize: 10 }}>
              La fraîcheur repose sur l’heure de la source et celle du relevé.
              Une nouvelle saisie ne rajeunit pas une ancienne cote fournisseur.
            </p>
          </section>
          <section className="panel panel-pad">
            <div className="section-heading">
              <h3>Vos segments suivis</h3>
              <Layers3 size={16} color="var(--teal)" />
            </div>
            {activeStrategies.length ? (
              activeStrategies.slice(0, 4).map((strategy) => (
                <div className="radar-strategy" key={strategy.id}>
                  <button
                    className="table-button"
                    onClick={() =>
                      onExploreStrategy(strategy.id, strategy.filter)
                    }
                  >
                    {strategy.name}
                  </button>
                  <p className="muted">
                    {Object.values(strategy.filter).join(" · ") ||
                      "Tous les pronostics"}
                  </p>
                  <span className="badge badge-amber">Hypothèse à valider</span>
                </div>
              ))
            ) : (
              <p className="muted">
                Figez les critères de suivi d’un profil ou d’un marché avant les
                nouvelles observations.
              </p>
            )}
            <button
              className="text-link"
              style={{ marginTop: 16 }}
              onClick={() => onNavigate("specialties")}
            >
              Explorer les spécialités
              <ArrowRight size={12} />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
