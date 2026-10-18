import Decimal from "decimal.js";
import { bankroll } from "./calculations";
import {
  economicStateAt,
  historicalCashoutUnknownAt,
  safeCents,
  sumCents,
  ticketPosition,
} from "./accounting";
import type { AppState, LedgerEntry } from "./types";

export { ticketPosition } from "./accounting";
export type { TicketPosition, RiskBudget } from "./accounting";

export interface CashReconciliation {
  status: "missing" | "matched" | "difference" | "invalid";
  at: string | null;
  observedCents: number | null;
  ledgerCashCents: number | null;
  differenceCents: number | null;
  entryIds: string[];
  message: string;
  balanceCents: number | null;
  calculatedCashCents: number | null;
  hasLedgerHistory: boolean;
  uncertain: boolean;
  issues: string[];
}

/** Effective-date journal after corrections: this is not the historical knowledge snapshot. */
export function reconcileCash(
  state: AppState,
  observedCents: number | null = state.settings.reconciliationBalanceCents,
  at: string | null = state.settings.reconciledAt,
): CashReconciliation {
  const result: CashReconciliation = {
    status: "missing",
    at,
    observedCents,
    ledgerCashCents: null,
    differenceCents: null,
    entryIds: [],
    message: "Renseignez un solde cash et la date exacte de son relevé.",
    balanceCents: observedCents,
    calculatedCashCents: null,
    hasLedgerHistory: false,
    uncertain: false,
    issues: [],
  };
  if (observedCents == null || !at) return result;
  if (
    !Number.isSafeInteger(observedCents) ||
    observedCents < 0 ||
    !Number.isFinite(Date.parse(at))
  ) {
    return {
      ...result,
      status: "invalid",
      message:
        "Le solde doit être un entier positif ou nul en centimes, avec une date valide.",
    };
  }
  try {
    const entries = state.ledger.filter((entry) => {
      if (!Number.isFinite(Date.parse(entry.at)))
        throw new RangeError("Horodatage du journal invalide.");
      return Date.parse(entry.at) <= Date.parse(at);
    });
    const ledgerCashCents = sumCents(entries.map((entry) => entry.amountCents));
    const differenceCents = sumCents([observedCents, -ledgerCashCents]);
    const hasLedgerHistory = entries.length > 0;
    const uncertain = state.tickets.some((ticket) =>
      historicalCashoutUnknownAt(ticket, new Date(at)),
    );
    const issues = uncertain
      ? [
          "Un cashout partiel ancien ne détaille pas ses versements : le journal historique peut regrouper les retours à la dernière date connue.",
        ]
      : [];
    return {
      ...result,
      at: new Date(at).toISOString(),
      ledgerCashCents,
      calculatedCashCents: ledgerCashCents,
      differenceCents,
      entryIds: entries.map((entry) => entry.id).sort(),
      hasLedgerHistory,
      uncertain,
      issues,
      status: !hasLedgerHistory
        ? "missing"
        : differenceCents === 0
          ? "matched"
          : "difference",
      message: uncertain
        ? "Rapprochement provisoire : versements historiques d’un cashout partiel non détaillés."
        : !hasLedgerHistory
          ? "Aucune écriture à cette date : solde initial ou historique à documenter."
          : differenceCents === 0
            ? "Le solde relevé concorde au centime avec le journal à cette date."
            : "Écart entre le solde relevé et le journal à cette date ; documentez les mouvements manquants ou les corrections.",
    };
  } catch (error) {
    return {
      ...result,
      status: "invalid",
      message:
        error instanceof Error ? error.message : "Journal financier invalide.",
    };
  }
}

export function portfolioOverview(state: AppState, at: Date = new Date()) {
  const snapshot = economicStateAt(state, at);
  const account = bankroll(snapshot);
  const positions = snapshot.tickets.map(ticketPosition);
  const sumKind = (kind: LedgerEntry["kind"]): number =>
    sumCents(
      snapshot.ledger
        .filter((entry) => entry.kind === kind)
        .map((entry) => entry.amountCents),
    );
  const closedCash = positions.filter(
    (position) =>
      !position.open &&
      snapshot.tickets.find((ticket) => ticket.id === position.ticketId)
        ?.funding === "cash",
  );
  const closedCashStakeCents = sumCents(
    closedCash.map((position) => position.cashStakeCents),
  );
  const closedCashProfitCents = sumCents(
    closedCash.map((position) => position.netProfitCents!),
  );
  const totals = {
    initialCents: sumKind("initial"),
    depositsCents: sumKind("deposit"),
    withdrawalsCents: sumKind("withdrawal"),
    adjustmentsCents: sumKind("adjustment"),
    pokerCents: sumKind("poker"),
    grossCashReturnsCents: sumCents(
      snapshot.tickets
        .filter((ticket) => ticket.funding === "cash")
        .map((ticket) => ticket.returnCents),
    ),
    freebetReturnsCents: sumCents(
      positions.map((position) => position.promotionProfitCents),
    ),
    promotionCreditsCents: sumKind("promotion"),
    cashStakeCents: sumCents(
      positions.map((position) => position.cashStakeCents),
    ),
    closedCashStakeCents,
    closedCashProfitCents,
    closedCashRoi:
      closedCashStakeCents > 0
        ? new Decimal(closedCashProfitCents)
            .div(closedCashStakeCents)
            .toNumber()
        : null,
  };
  const issues = positions.flatMap((position) =>
    position.issues.map((issue) => `${position.ticketId} : ${issue}`),
  );
  for (const kind of ["ticket_stake", "ticket_return", "ticket_fee"] as const) {
    const expected = sumCents(
      positions.map((position) =>
        kind === "ticket_stake"
          ? -position.cashStakeCents
          : kind === "ticket_return"
            ? position.grossReturnCents
            : -position.feeCents,
      ),
    );
    if (sumKind(kind) !== expected)
      issues.push(
        `Les écritures ${kind} ne concordent pas avec les tickets à cette date ; le journal reste l’autorité pour le cash.`,
      );
  }
  const performanceAvailable =
    account.series.length > 0 &&
    snapshot.ledger.some(
      (entry) =>
        ["initial", "deposit", "poker", "adjustment"].includes(entry.kind) &&
        safeCents(entry.amountCents) > 0,
    ) &&
    !account.uncertainPerformance;
  if (!performanceAvailable)
    issues.push(
      "Indice de performance indisponible ou provisoire : capital initial documenté et coûts ouverts connus nécessaires.",
    );
  return {
    at: at.toISOString(),
    account,
    positions,
    totals,
    reconciliation: reconcileCash(state),
    performanceAvailable,
    issues,
    temporalBasis:
      "État économique retraité aux dates des écritures, des versements détaillés et des coûts restants documentés, après corrections. Ce n’est pas la connaissance historique à cette date. Les anciens retours cumulés sans détail ne permettent pas de reconstituer les cessions intermédiaires d’un cashout partiel.",
  };
}
