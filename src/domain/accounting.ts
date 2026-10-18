import Decimal from "decimal.js";
import type { AppState, Ticket } from "./types";

export function safeCents(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Un montant doit être un entier sûr en centimes.");
  }
  return value;
}

export function sumCents(values: number[]): number {
  const total = values.reduce(
    (sum, value) => sum + BigInt(safeCents(value)),
    0n,
  );
  return safeCents(Number(total));
}

export function floorCents(value: Decimal): number {
  return safeCents(value.floor().toNumber());
}

function nonnegativeCents(value: number): number {
  safeCents(value);
  if (value < 0)
    throw new RangeError("Un montant de ticket ne peut pas être négatif.");
  return value;
}

type EconomicTicket = Ticket & { economicHistoryIncomplete?: boolean };

export function historicalCashoutUnknownAt(ticket: Ticket, at: Date): boolean {
  const cutoff = at.getTime();
  if (Date.parse(ticket.placedAt) > cutoff) return false;
  if (ticket.returnPayments) {
    return ticket.returnPayments.some(
      (payment) =>
        payment.historicalAggregate && cutoff < Date.parse(payment.at),
    );
  }
  return (
    cutoff < Date.parse(ticket.settledAt ?? "") &&
    (ticket.partialCashout ||
      ticket.revisions.some(
        (revision) => revision.previous.partialCashout === true,
      ))
  );
}

export interface TicketPosition {
  ticketId: string;
  open: boolean;
  cashStakeCents: number;
  openCostCents: number | null;
  provisionalOpenCostCents: number;
  grossReturnCents: number;
  releasedCostCents: number | null;
  cashProfitCents: number | null;
  promotionProfitCents: number;
  feeCents: number;
  netProfitCents: number | null;
  issues: string[];
}

/** Returns are recorded gross amounts, never inferred from a result label or odds. */
export function ticketPosition(ticket: Ticket): TicketPosition {
  nonnegativeCents(ticket.stakeCents);
  nonnegativeCents(ticket.returnCents);
  nonnegativeCents(ticket.feeCents);
  if (ticket.remainingStakeCents != null) {
    nonnegativeCents(ticket.remainingStakeCents);
    if (ticket.remainingStakeCents > ticket.stakeCents) {
      throw new RangeError(
        "Le coût restant dépasse la mise initiale du ticket.",
      );
    }
  }
  if (ticket.returnPayments) {
    for (const payment of ticket.returnPayments) {
      nonnegativeCents(payment.amountCents);
      if (!Number.isFinite(Date.parse(payment.at)))
        throw new RangeError("Date de versement invalide.");
      if (payment.remainingStakeCents != null) {
        nonnegativeCents(payment.remainingStakeCents);
        if (payment.remainingStakeCents > ticket.stakeCents)
          throw new RangeError(
            "Coût restant d’un versement supérieur à la mise.",
          );
      }
    }
    if (
      sumCents(ticket.returnPayments.map((payment) => payment.amountCents)) !==
      ticket.returnCents
    ) {
      throw new RangeError(
        "Les versements détaillés ne correspondent pas au retour cumulé du ticket.",
      );
    }
  }
  const open = ticket.result === "open" || ticket.partialCashout;
  const cashStakeCents = ticket.funding === "cash" ? ticket.stakeCents : 0;
  const unknownHistory =
    (ticket as EconomicTicket).economicHistoryIncomplete === true;
  const unknownCost =
    ticket.funding === "cash" &&
    (unknownHistory ||
      (open && ticket.partialCashout && ticket.remainingStakeCents == null));
  const openCostCents = unknownCost
    ? null
    : !open
      ? 0
      : ticket.funding === "freebet"
        ? 0
        : ticket.partialCashout
          ? ticket.remainingStakeCents!
          : cashStakeCents;
  const provisionalOpenCostCents = openCostCents ?? cashStakeCents;
  const releasedCostCents =
    openCostCents == null ? null : sumCents([cashStakeCents, -openCostCents]);
  const cashProfitCents =
    ticket.funding === "freebet"
      ? 0
      : releasedCostCents == null
        ? null
        : sumCents([ticket.returnCents, -releasedCostCents]);
  const promotionProfitCents =
    ticket.funding === "freebet" ? ticket.returnCents : 0;
  const issues: string[] = [];
  if (unknownCost)
    issues.push(
      "Coût restant du cashout partiel inconnu : résultat réalisé et capital provisoires.",
    );
  if (unknownHistory)
    issues.push(
      "La date se situe avant un cumul historique de cashout non détaillé : encaissements et coûts intermédiaires inconnus.",
    );
  if (
    (ticket.partialCashout && !ticket.returnPayments) ||
    ticket.returnPayments?.some((payment) => payment.historicalAggregate)
  )
    issues.push(
      "Retours historiques cumulés ; les cessions intermédiaires ne sont pas reconstituées.",
    );
  if (!ticket.partialCashout && ticket.remainingStakeCents != null)
    issues.push("Coût restant fourni hors cashout partiel : non utilisé.");
  return {
    ticketId: ticket.id,
    open,
    cashStakeCents,
    openCostCents,
    provisionalOpenCostCents,
    grossReturnCents: ticket.returnCents,
    releasedCostCents,
    cashProfitCents,
    promotionProfitCents,
    feeCents: ticket.feeCents,
    netProfitCents:
      cashProfitCents == null
        ? null
        : sumCents([cashProfitCents, promotionProfitCents, -ticket.feeCents]),
    issues,
  };
}

export function economicStateAt(state: AppState, at: Date): AppState {
  const cutoff = at.getTime();
  if (!Number.isFinite(cutoff))
    throw new RangeError("Date financière invalide.");
  const before = (value: string): boolean => {
    const date = Date.parse(value);
    if (!Number.isFinite(date))
      throw new RangeError("Horodatage financier invalide.");
    return date <= cutoff;
  };
  return {
    ...state,
    ledger: state.ledger.filter((entry) => before(entry.at)),
    tickets: state.tickets
      .filter((ticket) => before(ticket.placedAt))
      .map((ticket) => {
        if (!ticket.settledAt || before(ticket.settledAt)) return ticket;
        const economicHistoryIncomplete = historicalCashoutUnknownAt(
          ticket,
          at,
        );
        const payments = ticket.returnPayments?.filter((payment) =>
          before(payment.at),
        );
        if (payments?.length) {
          const last = [...payments]
            .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
            .at(-1)!;
          const remaining =
            ticket.funding === "freebet"
              ? 0
              : (last.remainingStakeCents ?? null);
          return {
            ...ticket,
            result: "cashout",
            settledAt: last.at,
            returnCents: sumCents(
              payments.map((payment) => payment.amountCents),
            ),
            returnPayments: payments,
            remainingStakeCents: remaining,
            partialCashout: true,
            economicHistoryIncomplete,
          };
        }
        return {
          ...ticket,
          result: "open",
          settledAt: null,
          returnCents: 0,
          returnPayments: ticket.returnPayments ? [] : undefined,
          remainingStakeCents: null,
          partialCashout: false,
          economicHistoryIncomplete,
        };
      }),
  };
}

export interface RiskBudget {
  at: string;
  day: string;
  month: string;
  realizedDayCents: number;
  realizedMonthCents: number;
  dailyRemainingCents: number | null;
  monthlyRemainingCents: number | null;
  betLimitCents: number | null;
  eventLimitCents: number | null;
  exposureLimitCents: number | null;
  availableForNewStakesCents: number;
  blockedReasons: string[];
}

interface RiskAccount {
  cashCents: number;
  capitalCents: number;
  openStakeCents: number;
  uncertainOpenCost: boolean;
}

const parisDate = (value: string | Date): string =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

/** Losses and fees consume a conservative loss budget; past gains do not enlarge it. */
export function riskBudget(
  state: AppState,
  account: RiskAccount,
  now: Date = new Date(),
): RiskBudget {
  const day = parisDate(now);
  const month = day.slice(0, 7);
  const nowTime = now.getTime();
  const unknownPeriods = new Set<string>();
  const realized = (period: string): number => {
    const profits: number[] = [];
    for (const ticket of state.tickets.filter(
      (item) => item.funding === "cash",
    )) {
      const position = ticketPosition(ticket);
      const movements: {
        at: string;
        amountCents: number;
        remaining: number | null;
      }[] = ticket.returnPayments
        ? ticket.returnPayments.map((payment) => ({
            at: payment.at,
            amountCents: payment.amountCents,
            remaining: payment.remainingStakeCents ?? null,
          }))
        : [];
      if (ticket.settledAt)
        movements.push({
          at: ticket.settledAt,
          amountCents: ticket.returnPayments ? 0 : ticket.returnCents,
          remaining: position.openCostCents,
        });
      movements.sort(
        (left, right) => Date.parse(left.at) - Date.parse(right.at),
      );
      let beforeCost: number | null = ticket.stakeCents;
      let afterCost: number | null = ticket.stakeCents;
      const returns: number[] = [];
      let active = false;
      for (const movement of movements.filter(
        (item) => Date.parse(item.at) <= nowTime,
      )) {
        const date = parisDate(movement.at);
        if (date.slice(0, period.length) < period)
          beforeCost = movement.remaining;
        if (date.startsWith(period)) {
          active = true;
          returns.push(movement.amountCents);
        }
        afterCost = movement.remaining;
      }
      if (!active) continue;
      if (
        ticket.returnPayments?.some(
          (payment) =>
            payment.historicalAggregate &&
            parisDate(payment.at).startsWith(period) &&
            parisDate(ticket.placedAt).slice(0, period.length) < period,
        )
      ) {
        unknownPeriods.add(period);
      }
      if (beforeCost == null || afterCost == null) unknownPeriods.add(period);
      else profits.push(sumCents([...returns, -beforeCost, afterCost]));
    }
    return sumCents([
      ...profits,
      ...state.ledger
        .filter(
          (entry) =>
            ["fee", "ticket_fee"].includes(entry.kind) &&
            Date.parse(entry.at) <= nowTime &&
            parisDate(entry.at).startsWith(period),
        )
        .map((entry) => entry.amountCents),
    ]);
  };
  const realizedDayCents = realized(day);
  const realizedMonthCents = realized(month);
  const settings = state.settings;
  const ratioLimit = (ratio: number | null): number | null =>
    ratio != null && Number.isFinite(ratio) && ratio >= 0 && ratio <= 1
      ? floorCents(new Decimal(Math.max(0, account.capitalCents)).times(ratio))
      : null;
  const lossRemaining = (
    limit: number | null,
    profit: number,
  ): number | null =>
    limit != null && Number.isSafeInteger(limit) && limit >= 0
      ? Math.max(0, sumCents([limit, Math.min(0, profit)]))
      : null;
  const dailyRemainingCents = lossRemaining(
    settings.dailyLossLimitCents,
    realizedDayCents,
  );
  const monthlyRemainingCents = lossRemaining(
    settings.monthlyLossLimitCents,
    realizedMonthCents,
  );
  const betLimitCents = ratioLimit(settings.maxBetPercent);
  const eventLimitCents = ratioLimit(settings.maxEventPercent);
  const exposureLimitCents = ratioLimit(settings.maxExposurePercent);
  const blockedReasons: string[] = [];
  if (settings.paused) blockedReasons.push("Suggestions en pause.");
  if (
    [
      dailyRemainingCents,
      monthlyRemainingCents,
      betLimitCents,
      eventLimitCents,
      exposureLimitCents,
    ].some((value) => value == null)
  ) {
    blockedReasons.push(
      "Renseignez des plafonds par pari, événement, exposition et des limites de pertes personnelles valides, en centimes entiers.",
    );
  }
  if (account.uncertainOpenCost)
    blockedReasons.push(
      "Coût restant d’un cashout partiel inconnu : exposition à rapprocher avant toute simulation.",
    );
  if (unknownPeriods.size)
    blockedReasons.push(
      "Coût cédé d’un cashout partiel inconnu à une borne du budget de pertes : historique à compléter avant toute simulation.",
    );
  if (account.capitalCents <= 0 || account.cashCents <= 0)
    blockedReasons.push("Capital et cash disponibles insuffisants.");
  const availableForNewStakesCents = blockedReasons.length
    ? 0
    : Math.max(
        0,
        Math.min(
          account.cashCents,
          exposureLimitCents! - account.openStakeCents,
          dailyRemainingCents! - account.openStakeCents,
          monthlyRemainingCents! - account.openStakeCents,
        ),
      );
  return {
    at: now.toISOString(),
    day,
    month,
    realizedDayCents,
    realizedMonthCents,
    dailyRemainingCents,
    monthlyRemainingCents,
    betLimitCents,
    eventLimitCents,
    exposureLimitCents,
    availableForNewStakesCents,
    blockedReasons,
  };
}
