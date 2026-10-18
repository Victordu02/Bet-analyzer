/** Convert a user-entered decimal EUR amount without binary floating-point rounding. */
export function parseEuroCents(value: string, label = "Montant"): number {
  const normalized = value
    .trim()
    .replace(/[\u00a0\u202f ]/g, "")
    .replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(
      `${label} : saisissez un montant en euros avec au maximum deux décimales.`,
    );
  }
  const negative = normalized.startsWith("-");
  const unsigned = normalized.replace(/^[+-]/, "");
  const [whole, decimals = ""] = unsigned.split(".");
  const absolute = BigInt(whole) * 100n + BigInt(decimals.padEnd(2, "0"));
  const cents = negative ? -absolute : absolute;
  if (
    cents > BigInt(Number.MAX_SAFE_INTEGER) ||
    cents < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error(`${label} : ce montant dépasse la précision autorisée.`);
  }
  return Number(cents);
}

export function centsInput(value: number | null | undefined): string {
  if (value == null || !Number.isSafeInteger(value)) return "";
  const absolute = Math.abs(value);
  return `${value < 0 ? "-" : ""}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, "0")}`;
}

export function parisInput(value: string, includeSeconds = false): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" as const } : {}),
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}${includeSeconds ? `:${part("second")}` : ""}`;
}

export function parseParisDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))
    throw new Error("La date et l’heure de Paris sont invalides.");
  const includeSeconds = value.length === 19;
  const toUtcText = (local: string) =>
    `${local}${includeSeconds ? "" : ":00"}Z`;
  const target = Date.parse(toUtcText(value));
  if (!Number.isFinite(target)) throw new Error("La date est invalide.");
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    candidate +=
      target -
      Date.parse(
        toUtcText(
          parisInput(new Date(candidate).toISOString(), includeSeconds),
        ),
      );
  }
  if (parisInput(new Date(candidate).toISOString(), includeSeconds) !== value) {
    throw new Error(
      "Cette heure n’existe pas à Paris lors du changement d’heure.",
    );
  }
  if (
    [candidate - 3_600_000, candidate + 3_600_000].some(
      (alternate) =>
        parisInput(new Date(alternate).toISOString(), includeSeconds) === value,
    )
  ) {
    throw new Error(
      "Cette heure de Paris est ambiguë lors du changement d’heure. Choisissez une heure hors de la plage répétée.",
    );
  }
  return new Date(candidate).toISOString();
}
