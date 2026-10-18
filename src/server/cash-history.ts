import type { LedgerEntry, Ticket } from "../domain/types";

function addCents(left: number, right: number): number {
  const total = left + right;
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    !Number.isSafeInteger(total)
  ) {
    throw new Error(
      "Le cumul du journal dépasse la précision des centimes autorisée.",
    );
  }
  return total;
}

/** Effective dates are restated by append-only corrections; capture dates remain in audit. */
export function assertCashHistory(
  ledger: LedgerEntry[],
  tickets: Ticket[],
): void {
  const timestamp = (value: string): string => {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()))
      throw new Error("Horodatage du journal financier invalide.");
    return parsed.toISOString();
  };
  const placementDates = new Map(
    tickets.map((ticket) => [ticket.id, timestamp(ticket.placedAt)]),
  );
  const movements = new Map<
    string,
    { available: number; ownInstantReturns: number }
  >();
  for (const entry of ledger) {
    const at = timestamp(entry.at);
    const current = movements.get(at) ?? { available: 0, ownInstantReturns: 0 };
    // A ticket settled at the same instant as its placement still requires funds
    // before its own return. Other same-timestamp movements are grouped.
    const ownInstantReturn =
      entry.kind === "ticket_return" &&
      entry.ticketId != null &&
      placementDates.get(entry.ticketId) === at;
    if (ownInstantReturn)
      current.ownInstantReturns = addCents(
        current.ownInstantReturns,
        entry.amountCents,
      );
    else current.available = addCents(current.available, entry.amountCents);
    movements.set(at, current);
  }

  let cash = 0;
  for (const [at, movement] of [...movements.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    cash = addCents(cash, movement.available);
    if (cash < 0) {
      throw new Error(
        `Solde cash insuffisant à la date ${at}. Enregistrez les fonds disponibles avant la mise ou le débit ; un retour ultérieur ne peut financer sa propre mise.`,
      );
    }
    cash = addCents(cash, movement.ownInstantReturns);
    if (cash < 0)
      throw new Error(
        `Cette correction produirait un solde cash négatif à la date ${at}. Vérifiez les mouvements historiques.`,
      );
  }
}

export function cashAt(ledger: LedgerEntry[], at: string): number {
  return ledger
    .filter((entry) => Date.parse(entry.at) <= Date.parse(at))
    .reduce((cash, entry) => addCents(cash, entry.amountCents), 0);
}
