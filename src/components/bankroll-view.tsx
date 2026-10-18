"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Clock3,
  FileText,
  Plus,
  ShieldCheck,
  TrendingDown,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AppState, LedgerEntry, LedgerKind, Ticket } from "@/domain/types";
import { RESULT_LABELS } from "@/domain/types";
import { portfolioOverview, ticketPosition } from "@/domain/finance";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
} from "./analysis-ui";
import type { FormKind } from "./entity-forms";
import { ReconciliationForm } from "./reconciliation-form";

export const LEDGER_LABELS: Record<LedgerKind, string> = {
  initial: "Capital initial",
  deposit: "Dépôt",
  withdrawal: "Retrait",
  adjustment: "Ajustement justifié",
  poker: "Poker / autre activité",
  fee: "Frais externes",
  promotion: "Promotion créditée",
  ticket_stake: "Mise cash du ticket",
  ticket_return: "Retour brut du ticket",
  ticket_fee: "Frais du ticket",
};

type Props = {
  state: AppState;
  search?: string;
  mutate: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  onOpenForm: (kind: FormKind, initial?: Record<string, unknown>) => void;
  onOpenReference: (id: string) => void;
};

function Metric({
  label,
  value,
  note,
  icon: Icon = Wallet,
}: {
  label: string;
  value: ReactNode;
  note: string;
  icon?: typeof Wallet;
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
      <p className="metric-note">{note}</p>
    </div>
  );
}

function Breakdown({
  label,
  cents,
  signed = false,
}: {
  label: string;
  cents: number;
  signed?: boolean;
}) {
  return (
    <div className="amount-breakdown">
      <span>{label}</span>
      <strong>{formatMoney(cents, signed)}</strong>
    </div>
  );
}

function dayInParis(value: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (name: string) =>
    parts.find((entry) => entry.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function FinanceChart({ points }: { points: { at: string; value: number }[] }) {
  const chartId = useId().replace(/:/g, "");
  if (!points.length)
    return (
      <p className="mini-empty">
        Une courbe nécessite un capital documenté et des mouvements cohérents.
        Aucune base de capital n’est inventée.
      </p>
    );
  return (
    <>
      <div
        className="bankroll-chart"
        role="img"
        aria-label={`Valeur de part, base 100. ${points.length} dates, dernière valeur ${formatNumber(points.at(-1)?.value)}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={points}
            margin={{ top: 15, right: 18, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id={chartId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#199b80" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#199b80" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--line)"
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              dataKey="at"
              tickFormatter={formatDate}
              minTickGap={50}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: "var(--muted)" }}
            />
            <YAxis
              domain={["auto", "auto"]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: "var(--muted)" }}
            />
            <ReferenceLine
              y={100}
              stroke="var(--muted)"
              strokeDasharray="3 3"
            />
            <Tooltip
              labelFormatter={(value) => formatDateTime(String(value))}
              formatter={(value) => [
                formatNumber(Number(value)),
                "Valeur de part",
              ]}
              contentStyle={{
                background: "var(--panel)",
                border: "1px solid var(--line)",
                borderRadius: 7,
                fontSize: 11,
                color: "var(--ink)",
              }}
            />
            <Area
              dataKey="value"
              type="linear"
              stroke="#15967c"
              strokeWidth={2}
              fill={`url(#${chartId})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="bankroll-chart-data">
        <summary>Consulter les valeurs du graphique</summary>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Date à Paris</th>
                <th scope="col">Valeur de part · base 100</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={`${point.at}:${index}`}>
                  <td>{formatDateTime(point.at)}</td>
                  <td>{formatNumber(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function BankrollView({
  state,
  search = "",
  mutate,
  onOpenForm,
  onOpenReference,
}: Props) {
  const overview = useMemo(() => portfolioOverview(state), [state]);
  const account = overview.account;
  const [tab, setTab] = useState<"tickets" | "ledger">("tickets");
  const [status, setStatus] = useState("all");
  const [funding, setFunding] = useState("");
  const [bookmaker, setBookmaker] = useState("");
  const [strategy, setStrategy] = useState("");
  const [ledgerKind, setLedgerKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const hasRecords = state.ledger.length > 0 || state.tickets.length > 0;
  const positions = new Map(
    overview.positions.map((position) => [position.ticketId, position]),
  );
  const invalidPeriod = Boolean(from && to && from > to);

  function inPeriod(value: string) {
    const day = dayInParis(value);
    return !invalidPeriod && (!from || day >= from) && (!to || day <= to);
  }

  const needle = search.trim().toLocaleLowerCase("fr-FR");
  const tickets = state.tickets
    .filter((ticket) => {
      const position = positions.get(ticket.id) ?? ticketPosition(ticket);
      if (status === "open" && !position.open) return false;
      if (status === "settled" && position.open) return false;
      if (status === "partial" && !ticket.partialCashout) return false;
      if (funding && ticket.funding !== funding) return false;
      if (bookmaker && ticket.bookmaker !== bookmaker) return false;
      if (strategy && ticket.strategyId !== strategy) return false;
      if (!inPeriod(ticket.placedAt)) return false;
      return `${ticket.event} ${ticket.selection} ${ticket.market} ${ticket.sourceId} ${ticket.source}`
        .toLocaleLowerCase("fr-FR")
        .includes(needle);
    })
    .sort((first, second) =>
      sort === "stake"
        ? second.stakeCents - first.stakeCents
        : sort === "oldest"
          ? first.placedAt.localeCompare(second.placedAt)
          : second.placedAt.localeCompare(first.placedAt),
    );
  const ledger = state.ledger
    .filter(
      (entry) =>
        (!ledgerKind || entry.kind === ledgerKind) &&
        inPeriod(entry.at) &&
        `${entry.description} ${entry.id} ${entry.ticketId ?? ""} ${LEDGER_LABELS[entry.kind]}`
          .toLocaleLowerCase("fr-FR")
          .includes(needle),
    )
    .sort((first, second) =>
      sort === "oldest"
        ? first.at.localeCompare(second.at)
        : second.at.localeCompare(first.at),
    );
  const rows = tab === "tickets" ? tickets : ledger;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * pageSize;

  function changeFilter(update: () => void) {
    update();
    setPage(0);
  }
  function resetFilters() {
    setStatus("all");
    setFunding("");
    setBookmaker("");
    setStrategy("");
    setLedgerKind("");
    setFrom("");
    setTo("");
    setSort("recent");
    setPage(0);
  }

  return (
    <div className="stack bankroll-view">
      {!hasRecords && (
        <div className="notice">
          <Wallet size={15} />
          Votre registre est vide. Documentez votre capital réel et vos tickets
          acceptés pour reconstituer le portefeuille. Les bankrolls publiques et
          simulations ne créditent pas ce compte.
        </div>
      )}
      {account.uncertainOpenCost && (
        <div className="notice notice-warning" role="status">
          Coût restant inconnu sur une position partielle : le capital est
          provisoire et les nouvelles allocations sont bloquées. Complétez la
          donnée réelle sans inventer sa répartition.
        </div>
      )}
      <div className="metric-grid bankroll-metrics">
        <Metric
          label="Cash reconstitué"
          value={formatMoney(account.cashCents)}
          note="Somme signée du journal financier"
        />
        <Metric
          label="Mises cash ouvertes"
          value={formatMoney(account.openStakeCents)}
          note={
            account.uncertainOpenCost
              ? "Coût provisoire · à rapprocher"
              : "Positions valorisées au coût restant"
          }
          icon={Clock3}
        />
        <Metric
          label="Résultat net des paris"
          value={formatMoney(account.netProfitCents, true)}
          note="Résultat cash + promotions − frais"
          icon={ShieldCheck}
        />
        <Metric
          label="Drawdown maximal"
          value={
            overview.performanceAvailable
              ? formatPercent(account.drawdownPct)
              : "Non applicable"
          }
          note={
            overview.performanceAvailable
              ? account.recoveryDays === null
                ? "Sommet non encore retrouvé"
                : `Récupération : ${formatNumber(account.recoveryDays, 1)} jour(s)`
              : "Capital, coûts et trajectoire à documenter"
          }
          icon={TrendingDown}
        />
      </div>

      <div className="view-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Performance du portefeuille</h2>
              <p>Valeur de part · base 100 · flux externes neutralisés.</p>
            </div>
          </div>
          {overview.performanceAvailable ? (
            <FinanceChart points={account.series} />
          ) : (
            <p className="mini-empty">
              Performance non applicable : capital documenté, coûts restants et
              chronologie des cashouts nécessaires. Les montants comptables
              restent visibles séparément.
            </p>
          )}
          <p className="chart-caption">{overview.temporalBasis}</p>
        </section>
        <section className="panel panel-pad">
          <div className="section-heading">
            <div>
              <h2>Le résultat, expliqué</h2>
              <p>
                Situation globale, indépendante des filtres de consultation.
              </p>
            </div>
          </div>
          <Breakdown
            label="Capital comptable · cash + positions"
            cents={account.capitalCents}
          />
          <Breakdown
            label="Résultat cash hors promotions et frais"
            cents={account.profitCashCents}
            signed
          />
          <Breakdown
            label="Retours de freebets"
            cents={overview.totals.freebetReturnsCents}
            signed
          />
          <Breakdown
            label="Promotions réellement créditées"
            cents={overview.totals.promotionCreditsCents}
            signed
          />
          <Breakdown
            label="Frais comptabilisés une fois"
            cents={account.feesCents}
          />
          <Breakdown
            label="Résultat net des paris"
            cents={account.netProfitCents}
            signed
          />
          <div className="amount-breakdown">
            <span>Rendement des tickets cash clôturés · après leurs frais</span>
            <strong>
              {formatPercent(overview.totals.closedCashRoi, true)}
            </strong>
          </div>
          <p className="muted bankroll-note">
            Un retour brut inclut la mise lorsqu’elle est rendue. Les frais de
            ticket et d’abonnement ne sont déduits qu’une fois, via leurs
            écritures.
          </p>
        </section>
      </div>

      <section className="panel panel-pad">
        <div className="section-heading">
          <div>
            <h2>Les flux restent distincts</h2>
            <p>
              Un portefeuille cash partagé. Les affectations aux stratégies ne
              multiplient pas le capital.
            </p>
          </div>
          <FileText size={18} color="var(--teal)" />
        </div>
        <div className="bankroll-flow-grid">
          <div>
            <small>Capital initial</small>
            <strong>{formatMoney(overview.totals.initialCents)}</strong>
          </div>
          <div>
            <small>Dépôts</small>
            <strong>{formatMoney(overview.totals.depositsCents, true)}</strong>
          </div>
          <div>
            <small>Retraits</small>
            <strong>
              {formatMoney(overview.totals.withdrawalsCents, true)}
            </strong>
          </div>
          <div>
            <small>Poker / autres activités</small>
            <strong>{formatMoney(overview.totals.pokerCents, true)}</strong>
          </div>
          <div>
            <small>Ajustements justifiés</small>
            <strong>
              {formatMoney(overview.totals.adjustmentsCents, true)}
            </strong>
          </div>
          <div>
            <small>Retours bruts de tickets cash</small>
            <strong>
              {formatMoney(overview.totals.grossCashReturnsCents)}
            </strong>
          </div>
        </div>
        <p className="muted bankroll-note">
          Capital initial, dépôts, retraits, poker et ajustements sont exclus du
          bénéfice des paris. Les bonus non convertibles ne deviennent pas du
          cash disponible. Une mise de combiné appartient au ticket entier.
        </p>
        {overview.issues.length > 0 && (
          <details className="bankroll-issues">
            <summary>
              Consulter les {overview.issues.length} limites de reconstitution
            </summary>
            <ul className="analysis-limitations">
              {overview.issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <ReconciliationForm state={state} mutate={mutate} />

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Votre registre personnel</h2>
            <p>
              Les filtres consultent les lignes ; ils ne recalculent pas le
              capital global ci-dessus.
            </p>
          </div>
          <a
            className="text-link"
            href={`/api/export?workspace=${state.workspace}`}
            download
          >
            <ArrowDownToLine size={13} />
            Exporter
          </a>
        </div>
        <div className="tab-bar" role="tablist" aria-label="Registre financier">
          <button
            id="bankroll-tickets-tab"
            role="tab"
            aria-selected={tab === "tickets"}
            aria-controls="bankroll-register"
            className={`tab-button ${tab === "tickets" ? "active" : ""}`}
            onClick={() => changeFilter(() => setTab("tickets"))}
          >
            Mes tickets · {state.tickets.length}
          </button>
          <button
            id="bankroll-ledger-tab"
            role="tab"
            aria-selected={tab === "ledger"}
            aria-controls="bankroll-register"
            className={`tab-button ${tab === "ledger" ? "active" : ""}`}
            onClick={() => changeFilter(() => setTab("ledger"))}
          >
            Journal financier · {state.ledger.length}
          </button>
        </div>
        <div className="bankroll-filter-grid">
          {tab === "tickets" ? (
            <>
              <label className="field">
                État du ticket
                <select
                  value={status}
                  onChange={(event) =>
                    changeFilter(() => setStatus(event.target.value))
                  }
                >
                  <option value="all">Tous les tickets</option>
                  <option value="open">Positions ouvertes</option>
                  <option value="settled">Tickets clôturés</option>
                  <option value="partial">Cashouts partiels</option>
                </select>
              </label>
              <label className="field">
                Financement
                <select
                  value={funding}
                  onChange={(event) =>
                    changeFilter(() => setFunding(event.target.value))
                  }
                >
                  <option value="">Cash et freebets</option>
                  <option value="cash">Argent réel</option>
                  <option value="freebet">Freebet · sans débit cash</option>
                </select>
              </label>
              <label className="field">
                Bookmaker
                <select
                  value={bookmaker}
                  onChange={(event) =>
                    changeFilter(() => setBookmaker(event.target.value))
                  }
                >
                  <option value="">Tous les bookmakers</option>
                  {[...new Set(state.tickets.map((ticket) => ticket.bookmaker))]
                    .sort()
                    .map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                </select>
              </label>
              <label className="field">
                Affectation stratégique
                <select
                  value={strategy}
                  onChange={(event) =>
                    changeFilter(() => setStrategy(event.target.value))
                  }
                >
                  <option value="">Toutes les affectations</option>
                  {state.strategies.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="field">
              Nature du mouvement
              <select
                value={ledgerKind}
                onChange={(event) =>
                  changeFilter(() => setLedgerKind(event.target.value))
                }
              >
                <option value="">Tous les mouvements</option>
                {Object.entries(LEDGER_LABELS).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Du · inclus, Paris
            <input
              type="date"
              value={from}
              onChange={(event) =>
                changeFilter(() => setFrom(event.target.value))
              }
            />
          </label>
          <label className="field">
            Au · inclus, Paris
            <input
              type="date"
              value={to}
              onChange={(event) =>
                changeFilter(() => setTo(event.target.value))
              }
            />
          </label>
          <label className="field">
            Ordre d’affichage
            <select
              value={sort}
              onChange={(event) =>
                changeFilter(() => setSort(event.target.value))
              }
            >
              <option value="recent">Plus récent d’abord</option>
              <option value="oldest">Plus ancien d’abord</option>
              {tab === "tickets" && (
                <option value="stake">Mise décroissante</option>
              )}
            </select>
          </label>
        </div>
        <div className="bankroll-filter-caption">
          <span>
            {tab === "tickets"
              ? "Période sur la date d’acceptation, résultats actuels des tickets."
              : "Période sur la date de l’écriture, corrections conservées séparément."}
          </span>
          <button className="text-link" onClick={resetFilters}>
            Réinitialiser
          </button>
        </div>
        {invalidPeriod && (
          <p
            className="notice notice-warning bankroll-inline-notice"
            role="alert"
          >
            La date de début doit précéder la date de fin.
          </p>
        )}
        <div
          id="bankroll-register"
          role="tabpanel"
          aria-labelledby={
            tab === "tickets" ? "bankroll-tickets-tab" : "bankroll-ledger-tab"
          }
        >
          {tab === "tickets" ? (
            tickets.length ? (
              <div
                className="table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Tickets réels filtrés"
              >
                <table className="data-table bankroll-table">
                  <thead>
                    <tr>
                      <th scope="col">Ticket / provenance</th>
                      <th scope="col">Accepté le</th>
                      <th scope="col">Cote acceptée</th>
                      <th scope="col">Mise / financement</th>
                      <th scope="col">État</th>
                      <th scope="col">Retours bruts cumulés</th>
                      <th scope="col">Résultat net réalisé</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.slice(start, start + pageSize).map((ticket) => {
                      const position =
                        positions.get(ticket.id) ?? ticketPosition(ticket);
                      return (
                        <tr key={ticket.id}>
                          <td>
                            <button
                              className="table-button"
                              onClick={() =>
                                onOpenReference(`ticket:${ticket.id}`)
                              }
                            >
                              {ticket.event}
                            </button>
                            <small>
                              {ticket.selection} · {ticket.market} {ticket.line}
                            </small>
                            <small>
                              {ticket.sourceId || ticket.id} · {ticket.source}
                            </small>
                            {ticket.revisions.length > 0 && (
                              <small>
                                {ticket.revisions.length} révision(s)
                                conservée(s)
                              </small>
                            )}
                          </td>
                          <td>
                            {formatDateTime(ticket.placedAt)}
                            <small>{ticket.bookmaker}</small>
                          </td>
                          <td>{formatNumber(ticket.odds)}</td>
                          <td>
                            {formatMoney(ticket.stakeCents)}
                            <small>
                              {ticket.funding === "freebet"
                                ? "Valeur faciale · aucun débit cash"
                                : "Mise cash du ticket"}
                            </small>
                          </td>
                          <td>
                            <span
                              className={`badge ${position.open ? "badge-amber" : ticket.result === "won" ? "badge-teal" : "badge-muted"}`}
                            >
                              {ticket.partialCashout
                                ? "Cashout partiel · ouvert"
                                : RESULT_LABELS[ticket.result]}
                            </span>
                            {position.open && (
                              <small>
                                Coût restant :{" "}
                                {position.openCostCents === null
                                  ? "inconnu"
                                  : formatMoney(position.openCostCents)}
                              </small>
                            )}
                          </td>
                          <td>
                            {formatMoney(position.grossReturnCents)}
                            <small>
                              {ticket.settledAt
                                ? `Relevé ${formatDateTime(ticket.settledAt)}`
                                : "Aucun règlement daté"}
                            </small>
                          </td>
                          <td>
                            {position.netProfitCents === null
                              ? "Non déterminable"
                              : formatMoney(position.netProfitCents, true)}
                            <small>
                              {position.open
                                ? ticket.partialCashout
                                  ? "Portion cédée · position encore ouverte"
                                  : "Position au coût · frais séparés"
                                : "Après frais du ticket"}
                            </small>
                          </td>
                          <td>
                            <button
                              className="text-link"
                              onClick={() =>
                                onOpenForm("ticket", { ...ticket })
                              }
                            >
                              {position.open ? "Régler le ticket" : "Corriger"}
                              <ArrowUpRight size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <Wallet size={28} color="var(--muted)" />
                <h3>
                  {state.tickets.length
                    ? "Aucun ticket pour ces filtres"
                    : "Votre journal attend son premier ticket"}
                </h3>
                <p>
                  Conservez uniquement les paris réellement acceptés, avec leur
                  provenance et leurs montants réels.
                </p>
                <button
                  className="button button-primary"
                  onClick={() => onOpenForm("ticket")}
                >
                  <Plus size={14} />
                  Enregistrer un ticket
                </button>
              </div>
            )
          ) : ledger.length ? (
            <div
              className="table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Journal financier filtré"
            >
              <table className="data-table bankroll-table">
                <thead>
                  <tr>
                    <th scope="col">Date de l’écriture</th>
                    <th scope="col">Nature</th>
                    <th scope="col">Description / provenance</th>
                    <th scope="col">Montant cash signé</th>
                    <th scope="col">Révision</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(start, start + pageSize).map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(entry.at)}</td>
                      <td>
                        <span className="badge badge-outline">
                          {LEDGER_LABELS[entry.kind]}
                        </span>
                      </td>
                      <td>
                        <button
                          className="table-button"
                          onClick={() => onOpenReference(`ledger:${entry.id}`)}
                        >
                          {entry.description || "Consulter le mouvement"}
                        </button>
                        <small>{entry.id}</small>
                        {entry.ticketId && (
                          <small>
                            <button
                              className="text-link"
                              onClick={() =>
                                onOpenReference(`ticket:${entry.ticketId}`)
                              }
                            >
                              Voir le ticket source
                              <ArrowUpRight size={11} />
                            </button>
                          </small>
                        )}
                      </td>
                      <td
                        className={
                          entry.amountCents < 0 ? "negative" : "positive"
                        }
                      >
                        {formatMoney(entry.amountCents, true)}
                      </td>
                      <td>
                        {entry.revision}
                        <small>
                          {entry.revision > 0
                            ? "Écriture de correction conservée"
                            : "Écriture d’origine"}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <FileText size={28} color="var(--muted)" />
              <h3>
                {state.ledger.length
                  ? "Aucune écriture pour ces filtres"
                  : "Aucun mouvement enregistré"}
              </h3>
              <p>
                Documentez le capital réel et les autres mouvements du compte.
                Les tickets produisent leurs propres écritures.
              </p>
              <button
                className="button button-primary"
                onClick={() => onOpenForm("ledger")}
              >
                <Plus size={14} />
                Renseigner mon capital
              </button>
            </div>
          )}
        </div>
        <div className="panel-footer bankroll-pagination">
          <span>
            {rows.length} ligne(s) · EUR · montants conservés en centimes
            entiers
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
    </div>
  );
}

function DetailLine({
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

export function BankrollTicketDetail({
  ticket,
  state,
  onOpenForm,
  onOpenReference,
}: {
  ticket: Ticket;
  state: AppState;
  onOpenForm: Props["onOpenForm"];
  onOpenReference: Props["onOpenReference"];
}) {
  const position = ticketPosition(ticket);
  const entries = state.ledger
    .filter((entry) => entry.ticketId === ticket.id)
    .sort((first, second) => first.at.localeCompare(second.at));
  return (
    <div className="stack bankroll-ticket-detail">
      <header>
        <div className="eyebrow">TICKET RÉEL · {ticket.bookmaker}</div>
        <h2>{ticket.event}</h2>
        <p className="muted bankroll-note">
          {ticket.selection} · {ticket.market}
          {ticket.line ? ` · ${ticket.line}` : ""}
        </p>
        <span
          className={`badge ${position.open ? "badge-amber" : "badge-muted"}`}
        >
          {ticket.partialCashout
            ? "Cashout partiel · position ouverte"
            : RESULT_LABELS[ticket.result]}
        </span>
      </header>
      <div className="notice">
        Ce ticket est un enregistrement de votre exécution. Sa preuve
        d’acceptation, sa cote et ses montants restent distincts des pronostics,
        relevés et simulations.
      </div>
      <dl className="detail-list">
        <DetailLine label="Référence du ticket">
          {ticket.sourceId || "Non fournie"}
        </DetailLine>
        <DetailLine label="Preuve d’acceptation / source">
          {ticket.source}
        </DetailLine>
        <DetailLine label="Accepté le · Paris">
          {formatDateTime(ticket.placedAt)}
        </DetailLine>
        <DetailLine label="Dernier règlement / encaissement">
          {formatDateTime(ticket.settledAt)}
        </DetailLine>
        <DetailLine label="Cote réellement acceptée">
          {formatNumber(ticket.odds)}
        </DetailLine>
        <DetailLine label="Mise du ticket">
          {formatMoney(ticket.stakeCents)} ·{" "}
          {ticket.funding === "freebet"
            ? "Valeur faciale freebet, sans débit cash"
            : "Cash"}
        </DetailLine>
        <DetailLine label="Type">
          {ticket.kind === "accumulator"
            ? "Combiné · une seule mise pour le ticket"
            : "Simple"}
        </DetailLine>
        <DetailLine label="Retours bruts cumulés">
          {formatMoney(position.grossReturnCents)}
        </DetailLine>
        <DetailLine label="Coût cash cédé / clôturé">
          {position.releasedCostCents === null
            ? "Inconnu"
            : formatMoney(position.releasedCostCents)}
        </DetailLine>
        <DetailLine label="Coût restant exposé">
          {position.openCostCents === null
            ? "Inconnu · capital provisoire"
            : formatMoney(position.openCostCents)}
        </DetailLine>
        <DetailLine label="Résultat cash avant frais">
          {position.cashProfitCents === null
            ? "Non déterminable"
            : formatMoney(position.cashProfitCents, true)}
        </DetailLine>
        <DetailLine label="Résultat promotionnel">
          {formatMoney(position.promotionProfitCents, true)}
        </DetailLine>
        <DetailLine label="Frais du ticket">
          {formatMoney(position.feeCents)}
        </DetailLine>
        <DetailLine label="Résultat net reconnu">
          {position.netProfitCents === null
            ? "Non déterminable"
            : formatMoney(position.netProfitCents, true)}
        </DetailLine>
        <DetailLine label="Identité d’événement">{ticket.eventKey}</DetailLine>
        <DetailLine label="Règles de règlement">
          {ticket.rules || "Non renseignées"}
        </DetailLine>
        <DetailLine label="Affectation à une stratégie">
          {state.strategies.find(
            (strategy) => strategy.id === ticket.strategyId,
          )?.name ?? "Sans affectation"}
        </DetailLine>
        <DetailLine label="Référence interne">
          <code className="reference-code">{ticket.id}</code>
        </DetailLine>
      </dl>
      {position.issues.length > 0 && (
        <div className="notice notice-warning">
          {position.issues.map((issue, index) => (
            <p key={index}>{issue}</p>
          ))}
        </div>
      )}
      <p className="muted">
        Résultat cash clôturé = retours cumulés − mise cash − frais. Pour une
        portion cédée, seul son coût connu est reconnu. Les encaissements datés
        ci-dessous documentent les versements disponibles ; les coûts
        intermédiaires manquants restent inconnus.
      </p>
      {ticket.returnPayments && ticket.returnPayments.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Encaissements documentés</h3>
              <p>
                Le cumul des versements correspond au retour brut du ticket.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Versement</th>
                  <th scope="col">Date à Paris</th>
                  <th scope="col">Retour cash</th>
                  <th scope="col">Coût restant après versement</th>
                </tr>
              </thead>
              <tbody>
                {ticket.returnPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <code className="reference-code">{payment.id}</code>
                    </td>
                    <td>{formatDateTime(payment.at)}</td>
                    <td>{formatMoney(payment.amountCents)}</td>
                    <td>
                      {payment.remainingStakeCents == null
                        ? "Non documenté"
                        : formatMoney(payment.remainingStakeCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {ticket.notes && <p className="notice">Notes : {ticket.notes}</p>}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Écritures de ce ticket</h3>
            <p>
              Corrections et versions restent traçables, sans deuxième mise
              fictive.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Nature</th>
                <th scope="col">Montant cash</th>
                <th scope="col">Version</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <button
                      className="table-button"
                      onClick={() => onOpenReference(`ledger:${entry.id}`)}
                    >
                      {formatDateTime(entry.at)}
                    </button>
                  </td>
                  <td>{LEDGER_LABELS[entry.kind]}</td>
                  <td>{formatMoney(entry.amountCents, true)}</td>
                  <td>{entry.revision}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!entries.length && (
          <p className="mini-empty">
            Aucune écriture cash liée à ce ticket. Une freebet ouverte sans
            frais ne débite pas le compte.
          </p>
        )}
      </section>
      <section>
        <h3>Modifications conservées · {ticket.revisions.length}</h3>
        {ticket.revisions.length ? (
          ticket.revisions.map((revision, index) => (
            <details
              className="bankroll-revision"
              key={`${revision.at}:${index}`}
            >
              <summary>
                {formatDateTime(revision.at)} · {revision.description}
              </summary>
              <pre>{JSON.stringify(revision.previous, null, 2)}</pre>
            </details>
          ))
        ) : (
          <p className="muted bankroll-note">Aucune révision enregistrée.</p>
        )}
      </section>
      <div className="form-actions">
        {ticket.pickId && (
          <button
            className="button button-secondary"
            onClick={() => onOpenReference(`pick:${ticket.pickId}`)}
          >
            Voir le pronostic lié
          </button>
        )}
        <button
          className="button button-primary"
          onClick={() => onOpenForm("ticket", { ...ticket })}
        >
          Modifier / régler le ticket
        </button>
      </div>
    </div>
  );
}

export function BankrollLedgerDetail({
  entry,
  onOpenReference,
}: {
  entry: LedgerEntry;
  onOpenReference: Props["onOpenReference"];
}) {
  return (
    <div className="stack">
      <h2>Mouvement financier</h2>
      <dl className="detail-list">
        <DetailLine label="Nature">{LEDGER_LABELS[entry.kind]}</DetailLine>
        <DetailLine label="Description / justificatif">
          {entry.description}
        </DetailLine>
        <DetailLine label="Date de l’écriture · Paris">
          {formatDateTime(entry.at)}
        </DetailLine>
        <DetailLine label="Montant cash signé">
          {formatMoney(entry.amountCents, true)}
        </DetailLine>
        <DetailLine label="Révision">{entry.revision}</DetailLine>
        <DetailLine label="Référence interne">
          <code className="reference-code">{entry.id}</code>
        </DetailLine>
      </dl>
      <p className="notice">
        Une correction produit une écriture complémentaire. L’écriture
        précédente reste dans le journal.
      </p>
      {entry.ticketId && (
        <button
          className="button button-secondary"
          onClick={() => onOpenReference(`ticket:${entry.ticketId}`)}
        >
          Consulter le ticket source
        </button>
      )}
    </div>
  );
}
