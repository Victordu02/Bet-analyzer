import { randomUUID } from "node:crypto";
import type { Ticket, TicketReturnPayment } from "../domain/types";
import { date, enumValue, integer, text } from "./validation";

function remainingCost(ticket: Ticket): number | null {
  return ticket.funding === "freebet" || !ticket.partialCashout
    ? 0
    : ticket.remainingStakeCents;
}

/** Cumulative reported returns are distinct from the individual dated cash receipts. */
export function planReturnPayments(
  ticket: Ticket,
  previous: Ticket | undefined,
  data: Record<string, unknown>,
): TicketReturnPayment[] {
  const existing = previous?.returnPayments
    ? structuredClone(previous.returnPayments)
    : previous?.returnCents && previous.settledAt
      ? [
          {
            id: `${previous.id}:legacy-return`,
            at: previous.settledAt,
            amountCents: previous.returnCents,
            remainingStakeCents: remainingCost(previous),
            historicalAggregate:
              previous.partialCashout ||
              previous.revisions.some(
                (revision) => revision.previous.partialCashout === true,
              ),
          },
        ]
      : [];
  const suppliedMode = text(data.settlementMode, "Nature du règlement");
  const mode = enumValue(
    suppliedMode,
    ["payment", "correction"],
    "Nature du règlement",
    "correction",
  );
  const correctionId = text(data.correctionPaymentId, "Versement à corriger");
  if (mode === "payment" && (correctionId || data.correctionPaymentAt))
    throw new Error(
      "Un nouveau versement ne peut simultanément corriger un ancien versement.",
    );
  if (correctionId && !existing.some((payment) => payment.id === correctionId))
    throw new Error("Le versement à corriger est introuvable sur ce ticket.");
  if (!previous)
    return ticket.returnCents > 0
      ? [
          {
            id: randomUUID(),
            at: ticket.settledAt!,
            amountCents: ticket.returnCents,
            remainingStakeCents: remainingCost(ticket),
          },
        ]
      : [];
  const delta = integer(
    ticket.returnCents - previous.returnCents,
    "Variation des retours",
    -Number.MAX_SAFE_INTEGER,
  );

  if (mode === "payment") {
    if (
      delta === 0 &&
      ticket.settledAt === previous.settledAt &&
      ticket.result === previous.result &&
      ticket.partialCashout === previous.partialCashout &&
      ticket.remainingStakeCents === previous.remainingStakeCents
    )
      return existing;
    if (delta <= 0)
      throw new Error(
        "Un nouveau versement exige un retour cumulé supérieur au précédent. Utilisez une correction pour modifier un versement existant.",
      );
    const at = date(data.settledAt, "Date du nouveau versement", false);
    if (existing.some((payment) => payment.at > at))
      throw new Error(
        "Le nouveau versement ne peut précéder les versements déjà documentés.",
      );
    return [
      ...existing,
      {
        id: randomUUID(),
        at,
        amountCents: delta,
        remainingStakeCents: remainingCost(ticket),
      },
    ];
  }
  if (previous.partialCashout && delta > 0 && !suppliedMode) {
    throw new Error(
      "Après un cashout partiel, précisez nouveau versement ou correction de règlement pour préserver les dates des retours.",
    );
  }
  if (ticket.result === "open") return [];
  if (existing.length === 0)
    return ticket.returnCents > 0
      ? [
          {
            id: randomUUID(),
            at: ticket.settledAt!,
            amountCents: ticket.returnCents,
            remainingStakeCents: remainingCost(ticket),
          },
        ]
      : [];

  if (existing.length > 1) {
    if (delta !== 0 || data.correctionPaymentAt != null || correctionId) {
      if (!correctionId)
        throw new Error(
          "Plusieurs versements sont documentés : choisissez le versement à corriger.",
        );
      const target = existing.find((payment) => payment.id === correctionId);
      if (!target)
        throw new Error(
          "Le versement à corriger est introuvable sur ce ticket.",
        );
      target.amountCents = integer(
        target.amountCents + delta,
        "Retour du versement corrigé",
      );
      if (data.correctionPaymentAt != null)
        target.at = date(
          data.correctionPaymentAt,
          "Date du versement corrigé",
          false,
        );
    }
    // A changed final settlement date does not move earlier actual receipts.
    const latest = [...existing].sort((left, right) =>
      right.at.localeCompare(left.at),
    )[0];
    if (latest.at === ticket.settledAt)
      latest.remainingStakeCents = remainingCost(ticket);
    return existing;
  }

  const payment = existing[0];
  payment.amountCents = ticket.returnCents;
  // Closing a partially cashed-out position with no new receipt preserves the
  // earlier cash receipt. An explicit correction can separately correct its date.
  const closingWithoutReceipt =
    previous.partialCashout && !ticket.partialCashout && delta === 0;
  if (!closingWithoutReceipt || data.correctionPaymentAt != null) {
    payment.at =
      data.correctionPaymentAt != null
        ? date(data.correctionPaymentAt, "Date du versement corrigé", false)
        : ticket.settledAt!;
  }
  if (payment.at === ticket.settledAt)
    payment.remainingStakeCents = remainingCost(ticket);
  return existing;
}
