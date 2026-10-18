"use client";

import { useId, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight, ChartNoAxesCombined, Info } from "lucide-react";
import type { AnalysisMetrics, ProofLevel } from "@/domain/tipster-analysis";

export const PROOF_OPTIONS: {
  value: ProofLevel;
  label: string;
  description: string;
}[] = [
  {
    value: "declared",
    label: "Déclaré",
    description: "Historique fourni par une source",
  },
  {
    value: "observed",
    label: "Observé avant événement",
    description: "Observation prospective horodatée",
  },
  {
    value: "simulated",
    label: "Simulé sur Winamax",
    description: "Scénario et cote Winamax documentés",
  },
  {
    value: "executed",
    label: "Exécuté",
    description: "Ticket réellement accepté et sourcé",
  },
];

export function formatNumber(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "Non applicable";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(
  value: number | null | undefined,
  signed = false,
): string {
  if (value == null || !Number.isFinite(value)) return "Non applicable";
  return `${signed && value > 0 ? "+" : ""}${formatNumber(value * 100, 1)} %`;
}

export function formatUnits(
  value: number | null | undefined,
  signed = true,
): string {
  if (value == null || !Number.isFinite(value)) return "Non applicable";
  return `${signed && value > 0 ? "+" : ""}${formatNumber(value)} u`;
}

export function formatMoney(
  cents: number | null | undefined,
  signed = false,
): string {
  if (cents == null || !Number.isFinite(cents)) return "Non applicable";
  const amount = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
  return `${signed && cents > 0 ? "+" : ""}${amount}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ProofSelector({
  value,
  onChange,
  counts,
  label = "Niveau de preuve analysé",
}: {
  value: ProofLevel;
  onChange: (value: ProofLevel) => void;
  counts?: Partial<Record<ProofLevel, number>>;
  label?: string;
}) {
  const groupId = useId();

  return (
    <fieldset className="proof-selector">
      <legend>{label}</legend>
      <div className="proof-options">
        {PROOF_OPTIONS.map((option, index) => (
          <label
            key={option.value}
            className={`proof-option ${value === option.value ? "selected" : ""}`}
          >
            <input
              className="sr-only"
              type="radio"
              name={groupId}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              value={option.value}
            />
            <span className="proof-option-top">
              <span className="proof-option-number">0{index + 1}</span>
              {counts?.[option.value] !== undefined && (
                <span className="count-chip">{counts[option.value]}</span>
              )}
            </span>
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </label>
        ))}
      </div>
      {counts && (
        <p className="muted proof-selector-note">
          Volumes globaux conservés, avant filtres. Ils incluent les
          enregistrements à vérifier et les abstentions ; les résultats
          dépendent de la couverture documentée.
        </p>
      )}
      <p className="muted proof-selector-note">
        Une seule population à la fois. Aucune simulation ni cote observée ne
        devient un ticket exécuté.
      </p>
    </fieldset>
  );
}

function AnalysisMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note: ReactNode;
}) {
  return (
    <div className="metric analysis-metric">
      <div className="metric-top">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}

export function AnalysisMetricsGrid({ metrics }: { metrics: AnalysisMetrics }) {
  return (
    <div className="metric-grid analysis-metrics">
      <AnalysisMetric
        label="P&L à mise constante"
        value={formatUnits(metrics.profitUnits)}
        note={`${metrics.settled} tickets standards réglés · 1 u chacun`}
      />
      <AnalysisMetric
        label="Rendement à mise constante"
        value={formatPercent(metrics.yield, true)}
        note="Profit / mises standardisées, annulations incluses"
      />
      <AnalysisMetric
        label="Paris / événements distincts"
        value={`${metrics.count} / ${metrics.events}`}
        note={`${metrics.excluded} cas hors convention standard`}
      />
      <AnalysisMetric
        label="Cote moyenne réglée"
        value={formatNumber(metrics.averageOdds)}
        note="Simples et combinés standards, une cote par ticket"
      />
      <AnalysisMetric
        label="Drawdown maximal"
        value={formatUnits(metrics.maxDrawdownUnits, false)}
        note="Baisse depuis un sommet du P&L cumulé, en unités"
      />
      <AnalysisMetric
        label="Dispersion des résultats"
        value={formatUnits(metrics.dispersion, false)}
        note="Écart-type des résultats standardisés"
      />
      <AnalysisMetric
        label="Concentration des gains"
        value={formatPercent(metrics.biggestWinShare)}
        note="Plus gros profit positif / somme des profits positifs"
      />
      <AnalysisMetric
        label="Période de la population"
        value={
          metrics.periodFrom ? formatDate(metrics.periodFrom) : "Non applicable"
        }
        note={
          metrics.periodTo
            ? `Au ${formatDate(metrics.periodTo)} · ${formatNumber(metrics.durationDays, 1)} jours`
            : "Aucune observation dans ce périmètre"
        }
      />
    </div>
  );
}

export function AnalysisConventions({
  metrics,
  level,
}: {
  metrics: AnalysisMetrics;
  level: ProofLevel;
}) {
  const evidenceLabel = PROOF_OPTIONS.find(
    (option) => option.value === level,
  )?.label;

  return (
    <div className="analysis-conventions">
      <div className="notice notice-warning" role="status">
        <Info aria-hidden="true" />
        <strong>
          {metrics.status === "insufficient"
            ? "Données insuffisantes. "
            : "Résultats descriptifs, à observer. "}
        </strong>
        {metrics.message}
      </div>
      <dl className="analysis-definition-grid">
        <div>
          <dt>Population analysée</dt>
          <dd>
            {evidenceLabel} uniquement · {metrics.count} enregistrements,{" "}
            {metrics.missingProof} preuve(s) manquante(s) ou incohérente(s).
          </dd>
        </div>
        <div>
          <dt>Incertitude du rendement</dt>
          <dd>
            {metrics.roiInterval
              ? `${formatPercent(metrics.roiInterval[0])} à ${formatPercent(metrics.roiInterval[1])} · intervalle descriptif par événement.`
              : "Non applicable : les observations ne permettent pas de construire l’intervalle."}
          </dd>
        </div>
        <div>
          <dt>Catégories conservées dans les volumes</dt>
          <dd>
            {metrics.categories.single} simples ·{" "}
            {metrics.categories.accumulator} combinés ·{" "}
            {metrics.categories.partial} règlements partiels ·{" "}
            {metrics.categories.cashout} cashouts ·{" "}
            {metrics.categories.promotion} promotions.
          </dd>
        </div>
        <div>
          <dt>Drawdown en pourcentage</dt>
          <dd>
            Non applicable pour ce profil ou segment : son capital et ses flux
            propres ne sont pas documentés. Aucun capital initial artificiel
            n’est supposé.
          </dd>
        </div>
      </dl>
      <details>
        <summary>Conventions et limites de lecture</summary>
        <p>
          Mise constante de 1 unité par ticket simple ou combiné gagné, perdu ou
          annulé. La mise d’un combiné est comptée une seule fois. Les paris
          ouverts, règlements partiels, cashouts et promotions ne sont pas
          mélangés au rendement standard. Les volumes par catégorie et les
          exclusions restent visibles ; les événements constitutifs d’un combiné
          ne sont pas nécessairement documentés. Un dénominateur nul donne « non
          applicable ».
        </p>
        <p>
          La courbe et le drawdown suivent l’ordre des règlements disponibles.
          Un horodatage absent limite l’interprétation de la trajectoire. Le
          plus gros gain est rapporté aux gains positifs, sans neutralisation
          par les pertes. L’intervalle par événement ne corrige pas la recherche
          rétrospective des meilleurs segments, ni les lacunes des sources.
          Aucun effectif universel ne démontre un avantage.
        </p>
        <p>
          Le P&L aux mises déclarées est recalculé depuis les mises et résultats
          fournis. Il ne reproduit pas un classement officiel de plateforme. Le
          taux de réussite historique ne devient jamais une probabilité de gain
          pour le prochain pari.
        </p>
      </details>
    </div>
  );
}

export function AnalysisChart({
  title = "Performance à mise constante",
  points,
  unit = "u",
  onOpenPick,
  emptyText = "Aucun résultat standardisé disponible pour cette population.",
}: {
  title?: string;
  points: { at: string; value: number; pickId?: string }[];
  unit?: string;
  onOpenPick?: (id: string) => void;
  emptyText?: string;
}) {
  const gradientId = `analysis-gradient-${useId().replace(/:/g, "")}`;

  return (
    <section className="analysis-chart" aria-label={title}>
      <div className="section-heading">
        <div>
          <h3>{title}</h3>
          <p>P&L cumulé en {unit}, sans capital de départ implicite.</p>
        </div>
        <ChartNoAxesCombined size={20} aria-hidden="true" />
      </div>
      {points.length === 0 ? (
        <div className="empty-state">
          <p>{emptyText}</p>
        </div>
      ) : (
        <>
          <div
            className="analysis-chart-canvas"
            role="img"
            aria-label={`${points.length} points. Dernier P&L cumulé : ${formatNumber(points.at(-1)?.value)} ${unit}. Données détaillées disponibles sous le graphique.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={points}
                margin={{ top: 12, right: 14, left: 0, bottom: 5 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#15967c" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#15967c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 4"
                  vertical={false}
                  stroke="var(--line)"
                />
                <XAxis
                  dataKey="at"
                  tickFormatter={formatDate}
                  minTickGap={45}
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  axisLine={false}
                  tickLine={false}
                  domain={["auto", "auto"]}
                  width={48}
                />
                <Tooltip
                  labelFormatter={(value) => formatDateTime(String(value))}
                  formatter={(value) => [
                    `${formatNumber(Number(value))} ${unit}`,
                    "P&L standardisé",
                  ]}
                  contentStyle={{
                    background: "var(--panel)",
                    color: "var(--ink)",
                    border: "1px solid var(--line)",
                    borderRadius: 7,
                    fontSize: 11,
                  }}
                />
                <ReferenceLine
                  y={0}
                  stroke="var(--muted)"
                  strokeDasharray="3 4"
                />
                <Area
                  type="linear"
                  dataKey="value"
                  stroke="#15967c"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                />
                {points.length > 16 && (
                  <Brush
                    dataKey="at"
                    height={22}
                    tickFormatter={formatDate}
                    stroke="#15967c"
                    fill="var(--panel)"
                    travellerWidth={8}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <details className="chart-data-details">
            <summary>
              Consulter les données du graphique ({points.length} points)
            </summary>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Date de la mesure</th>
                    <th scope="col">P&L cumulé</th>
                    <th scope="col">Pronostic source</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point, index) => (
                    <tr key={`${point.pickId ?? point.at}-${index}`}>
                      <td>{formatDateTime(point.at)}</td>
                      <td>
                        {formatNumber(point.value)} {unit}
                      </td>
                      <td>
                        {point.pickId && onOpenPick ? (
                          <button
                            className="text-link"
                            onClick={() => onOpenPick(point.pickId!)}
                          >
                            Voir le pronostic <ArrowUpRight size={12} />
                          </button>
                        ) : (
                          "Référence non disponible"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
