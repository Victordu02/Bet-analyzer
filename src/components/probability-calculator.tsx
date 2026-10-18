"use client";

import {
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  evaluateExpectedValue,
  evaluateOutcomeStates,
  normalizeCompleteMarket,
  sensitivityGrid,
  type ProbabilityEstimate,
} from "@/domain/radar";
import { clv } from "@/domain/calculations";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
} from "./analysis-ui";

export interface ProbabilityCalculatorProps {
  initialOdds?: number;
  initialStakeCents?: number;
  /** Embedded binary calculator. The complete market, states and CLV tools remain in the full view. */
  compact?: boolean;
}

type EstimateSource = "manual" | "market" | "model";
type ExpectedResult = ReturnType<typeof evaluateExpectedValue>;
type MarketResult = ReturnType<typeof normalizeCompleteMarket>;
type StateResult = ReturnType<typeof evaluateOutcomeStates>;
type MarketInput = Parameters<typeof normalizeCompleteMarket>[0];
type MarketRow = { id: number; label: string; odds: string };
type OutcomeRow = {
  id: number;
  label: string;
  probability: string;
  grossReturn: string;
  fee: string;
};
type Calculation = {
  result: ExpectedResult;
  stakeCents: number;
  odds: number;
  estimate: ProbabilityEstimate | null;
  at: string;
};
type NormalizedMarket = { input: MarketInput; result: MarketResult };

function Field({
  label,
  hint,
  children,
  full = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`field${full ? " field-full" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

function Messages({
  errors = [],
  warnings = [],
}: {
  errors?: string[];
  warnings?: string[];
}) {
  return (
    <>
      {errors.length > 0 && (
        <div className="notice notice-warning" role="alert">
          <ul>
            {errors.map((error, index) => (
              <li key={`error-${index}`}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="notice">
          <ul>
            {warnings.map((warning, index) => (
              <li key={`warning-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function parseNumber(value: string, label: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) throw new Error(`${label} doit être renseigné.`);
  const number = Number(normalized);
  if (!Number.isFinite(number))
    throw new Error(`${label} doit être un nombre fini.`);
  return number;
}

/** Convert typed euros without a floating-point multiplication of an accounting amount. */
function eurosToCents(value: string, label: string): number {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized))
    throw new Error(
      `${label} doit être un montant positif ou nul, avec deux décimales maximum.`,
    );
  const [whole, fraction = ""] = normalized.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error(
      `${label} dépasse les limites monétaires de l’application.`,
    );
  return Number(cents);
}

function parisInput(value: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

function parisToISO(value: string, label: string): string {
  const local = value.length === 16 ? `${value}:00` : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(local))
    throw new Error(`${label} doit être une date et une heure valides.`);
  const target = Date.parse(`${local}Z`);
  if (!Number.isFinite(target)) throw new Error(`${label} est invalide.`);
  let candidate = target;
  for (let iteration = 0; iteration < 3; iteration += 1)
    candidate +=
      target - Date.parse(`${parisInput(new Date(candidate).toISOString())}Z`);
  if (parisInput(new Date(candidate).toISOString()) !== local)
    throw new Error(
      `${label} : cette heure n’existe pas à Paris lors du changement d’heure.`,
    );
  if (
    [candidate - 3_600_000, candidate + 3_600_000].some(
      (alternative) =>
        parisInput(new Date(alternative).toISOString()) === local,
    )
  ) {
    throw new Error(
      `${label} : cette heure est ambiguë lors du changement d’heure ; choisissez une heure située hors de la plage répétée.`,
    );
  }
  return new Date(candidate).toISOString();
}

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Le calcul n’a pas pu être effectué.";
}

function initialMoney(cents: number | undefined): string {
  return cents !== undefined && Number.isSafeInteger(cents) && cents >= 0
    ? `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`
    : "";
}

export function ProbabilityCalculator({
  initialOdds,
  initialStakeCents,
  compact = false,
}: ProbabilityCalculatorProps) {
  const componentId = useId();
  const [stake, setStake] = useState(() => initialMoney(initialStakeCents));
  const [odds, setOdds] = useState(
    initialOdds !== undefined && initialOdds > 1 ? String(initialOdds) : "",
  );
  const [source, setSource] = useState<EstimateSource>("manual");
  const [probability, setProbability] = useState("");
  const [basis, setBasis] = useState("");
  const [calculation, setCalculation] = useState<Calculation | null>(null);
  const [binaryError, setBinaryError] = useState("");
  const [probabilityStep, setProbabilityStep] = useState("2");
  const [oddsStep, setOddsStep] = useState("0.10");

  const [modelName, setModelName] = useState("");
  const [modelVersion, setModelVersion] = useState("");
  const [modelDocumentation, setModelDocumentation] = useState("");
  const [modelPredictedAt, setModelPredictedAt] = useState("");
  const [modelTrainedUntil, setModelTrainedUntil] = useState("");
  const [evaluationSource, setEvaluationSource] = useState("");
  const [evaluationFrom, setEvaluationFrom] = useState("");
  const [evaluationTo, setEvaluationTo] = useState("");
  const [evaluationSize, setEvaluationSize] = useState("");
  const [evaluationBrier, setEvaluationBrier] = useState("");
  const [evaluationLogLoss, setEvaluationLogLoss] = useState("");

  const [marketRows, setMarketRows] = useState<MarketRow[]>([
    { id: 1, label: "Issue 1", odds: "" },
    { id: 2, label: "Issue 2", odds: "" },
  ]);
  const [marketSource, setMarketSource] = useState("");
  const [marketSourceURL, setMarketSourceURL] = useState("");
  const [marketCoverage, setMarketCoverage] = useState("");
  const [marketObservedAt, setMarketObservedAt] = useState(() =>
    parisInput(new Date().toISOString()),
  );
  const [marketComplete, setMarketComplete] = useState(false);
  const [normalizedMarket, setNormalizedMarket] =
    useState<NormalizedMarket | null>(null);
  const [marketErrors, setMarketErrors] = useState<string[]>([]);
  const [marketSelection, setMarketSelection] = useState("");

  const [stateStake, setStateStake] = useState(() =>
    initialMoney(initialStakeCents),
  );
  const [funding, setFunding] = useState<"cash" | "freebet">("cash");
  const [outcomeRows, setOutcomeRows] = useState<OutcomeRow[]>([
    { id: 1, label: "Gain", probability: "", grossReturn: "", fee: "0" },
    { id: 2, label: "Perte", probability: "", grossReturn: "0", fee: "0" },
    {
      id: 3,
      label: "Remboursement",
      probability: "",
      grossReturn: "",
      fee: "0",
    },
  ]);
  const [statesBasis, setStatesBasis] = useState("");
  const [statesComplete, setStatesComplete] = useState(false);
  const [statesResult, setStatesResult] = useState<StateResult | null>(null);
  const [statesError, setStatesError] = useState("");

  const [takenOdds, setTakenOdds] = useState("");
  const [closingOdds, setClosingOdds] = useState("");
  const [takenAt, setTakenAt] = useState("");
  const [closingAt, setClosingAt] = useState("");
  const [closingSource, setClosingSource] = useState("");
  const [closingComparable, setClosingComparable] = useState(false);
  const [closingProbability, setClosingProbability] = useState("");
  const [closingProbabilityBasis, setClosingProbabilityBasis] = useState("");
  const [clvResult, setClvResult] = useState<ReturnType<typeof clv> | null>(
    null,
  );
  const [clvError, setClvError] = useState("");

  const selectedMarketProbability = normalizedMarket?.result.valid
    ? (normalizedMarket.result.probabilities.find(
        (outcome) => outcome.label === marketSelection,
      )?.probability ?? null)
    : null;
  const threshold = useMemo(() => {
    const value = Number(odds.replace(",", "."));
    if (!odds.trim() || !Number.isFinite(value) || value <= 1) return null;
    return evaluateExpectedValue({ stakeCents: 0, odds: value, estimate: null })
      .breakEven;
  }, [odds]);
  const sensitivity = useMemo(() => {
    const baseProbability = calculation?.result.probability.probability;
    if (
      !calculation ||
      calculation.result.status !== "known" ||
      baseProbability == null
    )
      return null;
    const probabilityDelta = Number(probabilityStep.replace(",", "."));
    const oddsDelta = Number(oddsStep.replace(",", "."));
    if (
      !probabilityStep.trim() ||
      !oddsStep.trim() ||
      !Number.isFinite(probabilityDelta) ||
      !Number.isFinite(oddsDelta) ||
      probabilityDelta < 0 ||
      oddsDelta < 0
    )
      return null;
    const probabilities = [-1, 0, 1].map((offset) =>
      Number((baseProbability + (offset * probabilityDelta) / 100).toFixed(12)),
    );
    const values = [-1, 0, 1].map((offset) =>
      Number((calculation.odds + offset * oddsDelta).toFixed(12)),
    );
    return sensitivityGrid(calculation.stakeCents, values, probabilities);
  }, [calculation, probabilityStep, oddsStep]);

  function invalidateBinary() {
    setCalculation(null);
    setBinaryError("");
  }

  function invalidateMarket() {
    setNormalizedMarket(null);
    setMarketErrors([]);
    setMarketSelection("");
    if (source === "market") invalidateBinary();
  }

  function createEstimate(now: string): ProbabilityEstimate | null {
    if (source === "market") {
      if (
        !normalizedMarket?.result.valid ||
        selectedMarketProbability === null ||
        !marketSelection
      )
        return null;
      return {
        source: "market",
        probability: selectedMarketProbability,
        recordedAt: now,
        basis: basis.trim(),
        market: { ...normalizedMarket.input, selection: marketSelection },
      };
    }
    if (!probability.trim()) return null;
    const value = parseNumber(probability, "La probabilité") / 100;
    const common = { probability: value, recordedAt: now, basis: basis.trim() };
    if (source === "manual" || compact) return { ...common, source: "manual" };
    return {
      ...common,
      source: "model",
      model: {
        name: modelName.trim(),
        version: modelVersion.trim(),
        documentationUrl: modelDocumentation.trim(),
        predictedAt: parisToISO(modelPredictedAt, "L’horodatage de prédiction"),
        trainedUntil: parisToISO(modelTrainedUntil, "La fin de l’entraînement"),
        evaluation: {
          sourceUrl: evaluationSource.trim(),
          from: parisToISO(evaluationFrom, "Le début d’évaluation"),
          to: parisToISO(evaluationTo, "La fin d’évaluation"),
          sampleSize: parseNumber(evaluationSize, "L’effectif d’évaluation"),
          brier: evaluationBrier.trim()
            ? parseNumber(evaluationBrier, "Le Brier")
            : null,
          logLoss: evaluationLogLoss.trim()
            ? parseNumber(evaluationLogLoss, "La log loss")
            : null,
        },
      },
    };
  }

  function calculateBinary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    invalidateBinary();
    try {
      const stakeCents = eurosToCents(stake, "La mise hypothétique");
      const decimalOdds = parseNumber(odds, "La cote");
      const at = new Date().toISOString();
      const estimate = createEstimate(at);
      const result = evaluateExpectedValue({
        stakeCents,
        odds: decimalOdds,
        estimate,
      });
      setCalculation({ result, stakeCents, odds: decimalOdds, estimate, at });
    } catch (error) {
      setBinaryError(message(error));
    }
  }

  function normalizeMarket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    invalidateMarket();
    try {
      const input: MarketInput = {
        outcomes: marketRows.map((row) => ({
          label: row.label.trim(),
          odds: parseNumber(row.odds, `La cote de ${row.label || "l’issue"}`),
        })),
        complete: marketComplete,
        source: marketSource.trim(),
        sourceUrl: marketSourceURL.trim(),
        observedAt: parisToISO(marketObservedAt, "La date du relevé de marché"),
        coverage: marketCoverage.trim(),
      };
      const result = normalizeCompleteMarket(input);
      setNormalizedMarket({ input, result });
      setMarketErrors(result.errors);
    } catch (error) {
      setMarketErrors([message(error)]);
    }
  }

  function useMarketProbability(label: string) {
    setMarketSelection(label);
    setSource("market");
    setBasis(
      `Normalisation proportionnelle du marché ${marketCoverage.trim()} — ${marketSource.trim()} — issue ${label}.`,
    );
    invalidateBinary();
    document
      .getElementById(`${componentId}-binary`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function invalidateStates() {
    setStatesResult(null);
    setStatesError("");
  }

  function outcomeNet(row: OutcomeRow): number | null {
    try {
      const cashStake =
        funding === "cash" ? eurosToCents(stateStake, "La mise") : 0;
      const net =
        eurosToCents(row.grossReturn, "Le retour") -
        cashStake -
        eurosToCents(row.fee, "Les frais");
      return Number.isSafeInteger(net) ? net : null;
    } catch {
      return null;
    }
  }

  function calculateStates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    invalidateStates();
    try {
      if (!statesComplete)
        throw new Error(
          "Confirmez que les états sont exhaustifs et mutuellement exclusifs avant le calcul.",
        );
      if (!statesBasis.trim())
        throw new Error("Documentez le fondement des probabilités des états.");
      const at = new Date().toISOString();
      const states = outcomeRows.map((row) => ({
        label: row.label.trim(),
        estimate: row.probability.trim()
          ? {
              source: "manual" as const,
              probability:
                parseNumber(row.probability, `La probabilité de ${row.label}`) /
                100,
              recordedAt: at,
              basis: `${statesBasis.trim()} — état : ${row.label.trim()}`,
            }
          : null,
        grossReturnCents: eurosToCents(
          row.grossReturn,
          `Le retour de ${row.label}`,
        ),
        feeCents: eurosToCents(row.fee, `Les frais de ${row.label}`),
      }));
      setStatesResult(
        evaluateOutcomeStates({
          stakeCents: eurosToCents(stateStake, "La mise du scénario"),
          funding,
          states,
        }),
      );
    } catch (error) {
      setStatesError(message(error));
    }
  }

  function calculateCLV(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClvError("");
    setClvResult(null);
    try {
      if (!closingComparable || !closingSource.trim())
        throw new Error(
          "Confirmez la comparabilité du marché et renseignez la source de clôture.",
        );
      const taken = parseNumber(takenOdds, "La cote prise");
      const closing = parseNumber(closingOdds, "La cote de clôture");
      if (taken <= 1 || closing <= 1)
        throw new Error("Les deux cotes doivent être supérieures à 1.");
      const takenISO = parisToISO(takenAt, "La date de prise");
      const closingISO = parisToISO(closingAt, "La date de clôture");
      if (
        Date.parse(takenISO) > Date.parse(closingISO) ||
        Date.parse(closingISO) > Date.now()
      )
        throw new Error(
          "La clôture doit suivre la prise et ne peut pas être dans le futur.",
        );
      const reference = closingProbability.trim()
        ? parseNumber(closingProbability, "La probabilité de référence") / 100
        : null;
      if (
        reference !== null &&
        (reference < 0 || reference > 1 || !closingProbabilityBasis.trim())
      )
        throw new Error(
          "La référence sans marge doit être comprise entre 0 et 100 % et accompagnée de sa source et méthode.",
        );
      setClvResult(clv(taken, closing, reference));
    } catch (error) {
      setClvError(message(error));
    }
  }

  return (
    <div className={`stack${compact ? " probability-calculator-compact" : ""}`}>
      <section
        className="panel"
        id={`${componentId}-binary`}
        aria-labelledby={`${componentId}-title`}
      >
        <div className="panel-head">
          <div>
            <p className="eyebrow">ESTIMATION EXPLICITE</p>
            <h2 id={`${componentId}-title`}>Espérance & sensibilité</h2>
            <p className="muted">
              Pari simple cash binaire, gagné ou perdu, sans remboursement ni
              frais.
            </p>
          </div>
        </div>
        <div className="panel-pad">
          <p className="notice">
            Sans estimation exploitable, l’espérance reste inconnue. Une
            hypothèse manuelle et un taux de réussite passé ne démontrent pas un
            avantage.
          </p>
          <form onSubmit={calculateBinary} onChange={invalidateBinary}>
            <div className="form-grid">
              <Field label="Mise hypothétique (€)">
                <input
                  inputMode="decimal"
                  type="text"
                  value={stake}
                  onChange={(event) => setStake(event.target.value)}
                  placeholder="Ex. 10,00"
                  required
                />
              </Field>
              <Field label="Cote décimale étudiée">
                <input
                  inputMode="decimal"
                  type="text"
                  value={odds}
                  onChange={(event) => setOdds(event.target.value)}
                  placeholder="Ex. 2,00"
                  required
                />
              </Field>
              {!compact && (
                <Field label="Provenance de la probabilité">
                  <select
                    value={source}
                    onChange={(event) =>
                      setSource(event.target.value as EstimateSource)
                    }
                  >
                    <option value="manual">Hypothèse manuelle</option>
                    <option value="market">
                      Référence de marché documentée
                    </option>
                    <option value="model">
                      Modèle externe documenté et évalué
                    </option>
                  </select>
                </Field>
              )}
              {source !== "market" && (
                <Field
                  label={
                    source === "model"
                      ? "Probabilité fournie par le modèle (%)"
                      : "Probabilité hypothétique manuelle (%)"
                  }
                  hint="Laisser vide si inconnue. Aucun taux historique n’est injecté dans ce champ."
                >
                  <input
                    inputMode="decimal"
                    type="text"
                    value={probability}
                    onChange={(event) => setProbability(event.target.value)}
                    placeholder="Inconnue"
                  />
                </Field>
              )}
              {source === "market" && (
                <Field label="Issue du marché normalisé">
                  <select
                    value={marketSelection}
                    onChange={(event) => setMarketSelection(event.target.value)}
                  >
                    <option value="">
                      Choisir une issue après normalisation
                    </option>
                    {normalizedMarket?.result.valid &&
                      normalizedMarket.result.probabilities.map((outcome) => (
                        <option key={outcome.label} value={outcome.label}>
                          {outcome.label} · {formatPercent(outcome.probability)}
                        </option>
                      ))}
                  </select>
                  <small className="muted">
                    {selectedMarketProbability === null
                      ? "Normalisez un marché complet dans le panneau ci-dessous."
                      : `Référence : ${formatPercent(selectedMarketProbability)}. La marge retirée ne démontre pas un avantage contre ce marché.`}
                  </small>
                </Field>
              )}
              <Field
                label="Fondement / source de l’estimation"
                hint={
                  compact || source === "manual"
                    ? "Expliquez votre hypothèse personnelle. Ce texte ne la transforme pas en probabilité mesurée."
                    : "Décrivez l’origine, le périmètre et les limites de l’estimation."
                }
                full
              >
                <textarea
                  rows={3}
                  value={basis}
                  onChange={(event) => setBasis(event.target.value)}
                  placeholder="Source, méthode ou raisonnement de l’hypothèse"
                  required={
                    source === "market"
                      ? selectedMarketProbability !== null
                      : Boolean(probability.trim())
                  }
                />
              </Field>
            </div>
            {compact && (
              <p className="muted">
                Source : hypothèse manuelle. Ce calcul temporaire ne modifie ni
                la fiche, ni les tickets, ni la bankroll.
              </p>
            )}
            {!compact && source === "model" && (
              <fieldset className="panel-pad">
                <legend>Provenance et évaluation du modèle externe</legend>
                <p className="muted">
                  Renseigner ces champs documente le modèle fourni.
                  L’application n’atteste pas sa qualité prédictive et ne
                  dispose d’aucun modèle validé intégré.
                </p>
                <div className="form-grid">
                  <Field label="Nom du modèle">
                    <input
                      value={modelName}
                      onChange={(event) => setModelName(event.target.value)}
                      required={Boolean(probability.trim())}
                    />
                  </Field>
                  <Field label="Version du modèle">
                    <input
                      value={modelVersion}
                      onChange={(event) => setModelVersion(event.target.value)}
                      required={Boolean(probability.trim())}
                    />
                  </Field>
                  <Field label="URL de documentation">
                    <input
                      type="url"
                      value={modelDocumentation}
                      onChange={(event) =>
                        setModelDocumentation(event.target.value)
                      }
                      placeholder="https://…"
                      required={Boolean(probability.trim())}
                    />
                  </Field>
                  <Field label="Prédiction produite le (Paris)">
                    <input
                      type="datetime-local"
                      step="1"
                      value={modelPredictedAt}
                      onChange={(event) =>
                        setModelPredictedAt(event.target.value)
                      }
                      required={Boolean(probability.trim())}
                    />
                  </Field>
                  <Field label="Fin des données d’entraînement (Paris)">
                    <input
                      type="datetime-local"
                      step="1"
                      value={modelTrainedUntil}
                      onChange={(event) =>
                        setModelTrainedUntil(event.target.value)
                      }
                      required={Boolean(probability.trim())}
                    />
                  </Field>
                  <Field label="URL du rapport d’évaluation">
                    <input
                      type="url"
                      value={evaluationSource}
                      onChange={(event) =>
                        setEvaluationSource(event.target.value)
                      }
                      placeholder="https://…"
                      required={Boolean(probability.trim())}
                    />
                  </Field>
                  <Field label="Début de l’évaluation (Paris)">
                    <input
                      type="datetime-local"
                      step="1"
                      value={evaluationFrom}
                      onChange={(event) =>
                        setEvaluationFrom(event.target.value)
                      }
                      required={Boolean(probability.trim())}
                    />
                  </Field>
                  <Field label="Fin de l’évaluation (Paris)">
                    <input
                      type="datetime-local"
                      step="1"
                      value={evaluationTo}
                      onChange={(event) => setEvaluationTo(event.target.value)}
                      required={Boolean(probability.trim())}
                    />
                  </Field>
                  <Field label="Nombre de prédictions évaluées">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={evaluationSize}
                      onChange={(event) =>
                        setEvaluationSize(event.target.value)
                      }
                      required={Boolean(probability.trim())}
                    />
                  </Field>
                  <Field
                    label="Brier de l’évaluation"
                    hint="Au moins le Brier ou la log loss doit être renseigné."
                  >
                    <input
                      inputMode="decimal"
                      value={evaluationBrier}
                      onChange={(event) =>
                        setEvaluationBrier(event.target.value)
                      }
                      placeholder="Non fourni"
                    />
                  </Field>
                  <Field label="Log loss de l’évaluation">
                    <input
                      inputMode="decimal"
                      value={evaluationLogLoss}
                      onChange={(event) =>
                        setEvaluationLogLoss(event.target.value)
                      }
                      placeholder="Non fournie"
                    />
                  </Field>
                </div>
              </fieldset>
            )}
            <div className="form-actions">
              <button type="submit" className="button button-primary">
                Calculer l’espérance
              </button>
            </div>
          </form>
          <Messages
            errors={binaryError ? [binaryError] : calculation?.result.errors}
            warnings={calculation?.result.warnings}
          />
          <div className="comparison-grid" aria-live="polite">
            <div className="calculation-output">
              <small>Probabilité d’équilibre · 1 / cote</small>
              <strong>{formatPercent(threshold)}</strong>
            </div>
            <div className="calculation-output">
              <small>Rendement espéré · p × cote − 1</small>
              <strong>
                {calculation?.result.roi == null
                  ? "Inconnu"
                  : formatPercent(calculation.result.roi, true)}
              </strong>
            </div>
            <div className="calculation-output">
              <small>Espérance hypothétique</small>
              <strong>
                {calculation?.result.expectedCents == null
                  ? "Espérance inconnue"
                  : formatMoney(calculation.result.expectedCents, true)}
              </strong>
            </div>
          </div>
          {calculation && (
            <p className="muted">
              {calculation.result.probability.label} · calcul du{" "}
              {formatDateTime(calculation.at)}.{" "}
              {calculation.result.kelly === null
                ? "Kelly indisponible sans estimation exploitable."
                : `Kelly complet théorique : ${formatPercent(calculation.result.kelly)} avant fractionnement et plafonds. Ce calcul ne propose aucune mise réelle.`}
            </p>
          )}
          {calculation?.result.status === "known" && (
            <section aria-labelledby={`${componentId}-sensitivity`}>
              <h3 id={`${componentId}-sensitivity`}>
                Sensibilité aux hypothèses
              </h3>
              <p className="muted">
                Chaque case donne l’espérance en euros et le rendement pour la
                mise saisie. Les variations sont des scénarios hypothétiques,
                pas un intervalle de confiance.
              </p>
              <div className="form-grid">
                <Field
                  label="Variation de probabilité (points de %)"
                  hint="Ex. 2 points autour d’une hypothèse de 50 % : 48 %, 50 %, 52 %."
                >
                  <input
                    inputMode="decimal"
                    value={probabilityStep}
                    onChange={(event) => setProbabilityStep(event.target.value)}
                  />
                </Field>
                <Field label="Variation de cote">
                  <input
                    inputMode="decimal"
                    value={oddsStep}
                    onChange={(event) => setOddsStep(event.target.value)}
                  />
                </Field>
              </div>
              {sensitivity ? (
                <>
                  <Messages errors={sensitivity.errors} />
                  <div className="table-wrap">
                    <table className="data-table">
                      <caption className="sr-only">
                        Espérance selon la probabilité en ligne et la cote en
                        colonne
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Probabilité / cote</th>
                          {sensitivity.odds.map((value, index) => (
                            <th scope="col" key={index}>
                              {formatNumber(value, 3)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sensitivity.probabilities.map((value, rowIndex) => (
                          <tr key={rowIndex}>
                            <th scope="row">{formatPercent(value)}</th>
                            {sensitivity.odds.map((odd, columnIndex) => {
                              const cell = sensitivity.cells.find(
                                (entry) =>
                                  entry.probability === value &&
                                  entry.odds === odd,
                              );
                              return (
                                <td key={columnIndex}>
                                  <strong
                                    className={
                                      cell?.expectedCents == null
                                        ? "muted"
                                        : cell.expectedCents > 0
                                          ? "positive"
                                          : cell.expectedCents < 0
                                            ? "negative"
                                            : ""
                                    }
                                  >
                                    {cell?.expectedCents == null
                                      ? "Non applicable"
                                      : formatMoney(cell.expectedCents, true)}
                                  </strong>
                                  <div className="muted">
                                    {formatPercent(cell?.roi, true)}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="notice notice-warning">
                  Renseignez des variations finies, positives ou nulles, pour
                  afficher les scénarios.
                </p>
              )}
            </section>
          )}
        </div>
      </section>

      {!compact && (
        <>
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">RÉFÉRENCE DE MARCHÉ</p>
                <h2>Normaliser un marché complet sans marge</h2>
                <p className="muted">
                  Normalisation proportionnelle des inverses des cotes, avec
                  source et périmètre explicites.
                </p>
              </div>
            </div>
            <div className="panel-pad">
              <form
                onSubmit={normalizeMarket}
                onChange={(event) => {
                  invalidateMarket();
                  const target = event.nativeEvent.target;
                  if (
                    !(target instanceof HTMLInputElement) ||
                    target.type !== "checkbox"
                  )
                    setMarketComplete(false);
                }}
              >
                <div className="form-grid">
                  <Field label="Source des cotes">
                    <input
                      value={marketSource}
                      onChange={(event) => setMarketSource(event.target.value)}
                      placeholder="Nom du fournisseur ou relevé manuel documenté"
                      required
                    />
                  </Field>
                  <Field label="URL source du marché">
                    <input
                      type="url"
                      value={marketSourceURL}
                      onChange={(event) =>
                        setMarketSourceURL(event.target.value)
                      }
                      placeholder="https://…"
                      required
                    />
                  </Field>
                  <Field label="Date et heure du relevé (Paris)">
                    <input
                      type="datetime-local"
                      step="1"
                      value={marketObservedAt}
                      onChange={(event) =>
                        setMarketObservedAt(event.target.value)
                      }
                      required
                    />
                  </Field>
                  <Field label="Événement, marché, ligne et règles">
                    <input
                      value={marketCoverage}
                      onChange={(event) =>
                        setMarketCoverage(event.target.value)
                      }
                      placeholder="Périmètre exact, prolongations incluses ou exclues…"
                      required
                    />
                  </Field>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Issue</th>
                        <th scope="col">Cote décimale</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketRows.map((row, index) => (
                        <tr key={row.id}>
                          <td>
                            <Field label={`Libellé de l’issue ${index + 1}`}>
                              <input
                                value={row.label}
                                onChange={(event) =>
                                  setMarketRows((current) =>
                                    current.map((entry) =>
                                      entry.id === row.id
                                        ? {
                                            ...entry,
                                            label: event.target.value,
                                          }
                                        : entry,
                                    ),
                                  )
                                }
                                required
                              />
                            </Field>
                          </td>
                          <td>
                            <Field label={`Cote de l’issue ${index + 1}`}>
                              <input
                                inputMode="decimal"
                                value={row.odds}
                                onChange={(event) =>
                                  setMarketRows((current) =>
                                    current.map((entry) =>
                                      entry.id === row.id
                                        ? { ...entry, odds: event.target.value }
                                        : entry,
                                    ),
                                  )
                                }
                                placeholder="Supérieure à 1"
                                required
                              />
                            </Field>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="button button-secondary"
                              aria-label={`Retirer l’issue ${index + 1}`}
                              disabled={marketRows.length <= 2}
                              onClick={() => {
                                setMarketRows((current) =>
                                  current.filter(
                                    (entry) => entry.id !== row.id,
                                  ),
                                );
                                setMarketComplete(false);
                                invalidateMarket();
                              }}
                            >
                              Retirer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={marketRows.length >= 30}
                  onClick={() => {
                    setMarketRows((current) => [
                      ...current,
                      {
                        id: Math.max(...current.map((row) => row.id)) + 1,
                        label: `Issue ${current.length + 1}`,
                        odds: "",
                      },
                    ]);
                    setMarketComplete(false);
                    invalidateMarket();
                  }}
                >
                  Ajouter une issue
                </button>
                <label className="import-check">
                  <input
                    type="checkbox"
                    checked={marketComplete}
                    onChange={(event) =>
                      setMarketComplete(event.target.checked)
                    }
                  />
                  <span>
                    Je confirme avoir saisi toutes les issues du même marché,
                    mutuellement exclusives, avec les mêmes règles et le même
                    relevé.
                  </span>
                </label>
                <div className="form-actions">
                  <button type="submit" className="button button-primary">
                    Calculer la référence sans marge
                  </button>
                </div>
              </form>
              <Messages
                errors={marketErrors}
                warnings={normalizedMarket?.result.warnings}
              />
              {normalizedMarket?.result.valid && (
                <div>
                  <p>
                    Surcote implicite du marché :{" "}
                    <strong>
                      {formatPercent(normalizedMarket.result.overround)}
                    </strong>
                    .
                  </p>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">Issue</th>
                          <th scope="col">Probabilité normalisée</th>
                          <th scope="col">Utilisation explicite</th>
                        </tr>
                      </thead>
                      <tbody>
                        {normalizedMarket.result.probabilities.map(
                          (outcome) => (
                            <tr key={outcome.label}>
                              <td>{outcome.label}</td>
                              <td>{formatPercent(outcome.probability)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="text-link"
                                  onClick={() =>
                                    useMarketProbability(outcome.label)
                                  }
                                >
                                  Étudier cette référence dans l’EV
                                </button>
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <p className="notice notice-warning">
                La confirmation décrit votre relevé ; elle ne remplace pas sa
                vérification. Une seule cote invalide empêche le calcul complet.
                Retirer la marge des cotes Winamax ne suffit pas à identifier un
                avantage contre Winamax.
              </p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">ÉTATS DE RÈGLEMENT</p>
                <h2>Remboursements, résultats partiels & frais</h2>
                <p className="muted">
                  Espérance = somme des probabilités × résultat net de chaque
                  état.
                </p>
              </div>
            </div>
            <div className="panel-pad">
              <form
                onSubmit={calculateStates}
                onChange={(event) => {
                  invalidateStates();
                  const target = event.nativeEvent.target;
                  if (
                    !(target instanceof HTMLInputElement) ||
                    target.type !== "checkbox"
                  )
                    setStatesComplete(false);
                }}
              >
                <div className="form-grid">
                  <Field label="Mise du scénario (€)">
                    <input
                      inputMode="decimal"
                      value={stateStake}
                      onChange={(event) => setStateStake(event.target.value)}
                      placeholder="Ex. 10,00"
                      required
                    />
                  </Field>
                  <Field label="Financement de la mise">
                    <select
                      value={funding}
                      onChange={(event) =>
                        setFunding(event.target.value as "cash" | "freebet")
                      }
                    >
                      <option value="cash">Argent réel</option>
                      <option value="freebet">
                        Freebet sans débit cash de sa valeur faciale
                      </option>
                    </select>
                  </Field>
                  <Field
                    label="Fondement des probabilités de chaque état"
                    full
                    hint="Hypothèses manuelles explicites. N’utilisez pas automatiquement le taux de réussite historique d’un tipster."
                  >
                    <textarea
                      rows={3}
                      value={statesBasis}
                      onChange={(event) => setStatesBasis(event.target.value)}
                      required
                    />
                  </Field>
                </div>
                <p className="muted">
                  Le retour brut est le total crédité dans cet état, mise
                  remboursée comprise le cas échéant. Pour une freebet,
                  saisissez uniquement le cash crédité selon ses règles. Les
                  frais sont déduits séparément.
                </p>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">État</th>
                        <th scope="col">Probabilité (%)</th>
                        <th scope="col">Retour brut (€)</th>
                        <th scope="col">Frais (€)</th>
                        <th scope="col">Résultat net</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outcomeRows.map((row, index) => (
                        <tr key={row.id}>
                          <td>
                            <Field label={`Libellé de l’état ${index + 1}`}>
                              <input
                                value={row.label}
                                onChange={(event) =>
                                  setOutcomeRows((current) =>
                                    current.map((entry) =>
                                      entry.id === row.id
                                        ? {
                                            ...entry,
                                            label: event.target.value,
                                          }
                                        : entry,
                                    ),
                                  )
                                }
                                required
                              />
                            </Field>
                          </td>
                          <td>
                            <Field
                              label={`Probabilité de l’état ${index + 1} (%)`}
                            >
                              <input
                                inputMode="decimal"
                                value={row.probability}
                                onChange={(event) =>
                                  setOutcomeRows((current) =>
                                    current.map((entry) =>
                                      entry.id === row.id
                                        ? {
                                            ...entry,
                                            probability: event.target.value,
                                          }
                                        : entry,
                                    ),
                                  )
                                }
                                placeholder="Inconnue"
                              />
                            </Field>
                          </td>
                          <td>
                            <Field
                              label={`Retour brut de l’état ${index + 1} (€)`}
                            >
                              <input
                                inputMode="decimal"
                                value={row.grossReturn}
                                onChange={(event) =>
                                  setOutcomeRows((current) =>
                                    current.map((entry) =>
                                      entry.id === row.id
                                        ? {
                                            ...entry,
                                            grossReturn: event.target.value,
                                          }
                                        : entry,
                                    ),
                                  )
                                }
                                required
                              />
                            </Field>
                          </td>
                          <td>
                            <Field label={`Frais de l’état ${index + 1} (€)`}>
                              <input
                                inputMode="decimal"
                                value={row.fee}
                                onChange={(event) =>
                                  setOutcomeRows((current) =>
                                    current.map((entry) =>
                                      entry.id === row.id
                                        ? { ...entry, fee: event.target.value }
                                        : entry,
                                    ),
                                  )
                                }
                                required
                              />
                            </Field>
                          </td>
                          <td>{formatMoney(outcomeNet(row), true)}</td>
                          <td>
                            <button
                              type="button"
                              className="button button-secondary"
                              aria-label={`Retirer l’état ${index + 1}`}
                              disabled={outcomeRows.length <= 2}
                              onClick={() => {
                                setOutcomeRows((current) =>
                                  current.filter(
                                    (entry) => entry.id !== row.id,
                                  ),
                                );
                                setStatesComplete(false);
                                invalidateStates();
                              }}
                            >
                              Retirer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={outcomeRows.length >= 30}
                  onClick={() => {
                    setOutcomeRows((current) => [
                      ...current,
                      {
                        id: Math.max(...current.map((row) => row.id)) + 1,
                        label: `État ${current.length + 1}`,
                        probability: "",
                        grossReturn: "",
                        fee: "0",
                      },
                    ]);
                    setStatesComplete(false);
                    invalidateStates();
                  }}
                >
                  Ajouter un état
                </button>
                <label className="import-check">
                  <input
                    type="checkbox"
                    checked={statesComplete}
                    onChange={(event) =>
                      setStatesComplete(event.target.checked)
                    }
                  />
                  <span>
                    Ces états couvrent toutes les possibilités de règlement et
                    ne se recouvrent pas.
                  </span>
                </label>
                <div className="form-actions">
                  <button type="submit" className="button button-primary">
                    Calculer l’espérance par états
                  </button>
                </div>
              </form>
              <Messages
                errors={statesError ? [statesError] : statesResult?.errors}
                warnings={statesResult?.warnings}
              />
              <div className="comparison-grid" aria-live="polite">
                <div className="calculation-output">
                  <small>Somme des probabilités</small>
                  <strong>
                    {formatPercent(statesResult?.probabilityTotal)}
                  </strong>
                </div>
                <div className="calculation-output">
                  <small>Espérance nette, frais inclus</small>
                  <strong>
                    {statesResult?.expectedCents == null
                      ? "Espérance inconnue"
                      : formatMoney(statesResult.expectedCents, true)}
                  </strong>
                </div>
                <div className="calculation-output">
                  <small>Rendement sur mise cash</small>
                  <strong>{formatPercent(statesResult?.roi, true)}</strong>
                </div>
              </div>
              <p className="muted">
                La somme des probabilités doit être égale à 100 %. Aucune
                probabilité manquante n’est complétée automatiquement. Une
                freebet n’a pas de rendement sur mise cash si son coût cash est
                nul.
              </p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">COMPARAISON À LA CLÔTURE</p>
                <h2>Comparer une cote prise à une clôture</h2>
                <p className="muted">
                  Comparaison rétrospective uniquement, sur le même marché et
                  les mêmes règles.
                </p>
              </div>
            </div>
            <div className="panel-pad">
              <form
                onSubmit={calculateCLV}
                onChange={(event) => {
                  setClvResult(null);
                  setClvError("");
                  const target = event.nativeEvent.target;
                  if (
                    !(target instanceof HTMLInputElement) ||
                    target.type !== "checkbox"
                  )
                    setClosingComparable(false);
                }}
              >
                <div className="form-grid">
                  <Field label="Cote réellement prise">
                    <input
                      inputMode="decimal"
                      value={takenOdds}
                      onChange={(event) => setTakenOdds(event.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Cote de clôture">
                    <input
                      inputMode="decimal"
                      value={closingOdds}
                      onChange={(event) => setClosingOdds(event.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Date et heure de prise (Paris)">
                    <input
                      type="datetime-local"
                      step="1"
                      value={takenAt}
                      onChange={(event) => setTakenAt(event.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Date et heure de clôture (Paris)">
                    <input
                      type="datetime-local"
                      step="1"
                      value={closingAt}
                      onChange={(event) => setClosingAt(event.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Source et référence du relevé de clôture" full>
                    <input
                      value={closingSource}
                      onChange={(event) => setClosingSource(event.target.value)}
                      required
                    />
                  </Field>
                  <Field
                    label="Référence sans marge de clôture (%)"
                    hint="Facultative, issue d’un marché complet documenté."
                  >
                    <input
                      inputMode="decimal"
                      value={closingProbability}
                      onChange={(event) =>
                        setClosingProbability(event.target.value)
                      }
                      placeholder="Inconnue"
                    />
                  </Field>
                  <Field label="Source et méthode de cette référence">
                    <input
                      value={closingProbabilityBasis}
                      onChange={(event) =>
                        setClosingProbabilityBasis(event.target.value)
                      }
                      required={Boolean(closingProbability.trim())}
                    />
                  </Field>
                </div>
                <label className="import-check">
                  <input
                    type="checkbox"
                    checked={closingComparable}
                    onChange={(event) =>
                      setClosingComparable(event.target.checked)
                    }
                  />
                  <span>
                    Les deux cotes portent sur les mêmes événement, sélection,
                    marché, ligne et règles.
                  </span>
                </label>
                <div className="form-actions">
                  <button type="submit" className="button button-primary">
                    Calculer la CLV
                  </button>
                </div>
              </form>
              <Messages errors={clvError ? [clvError] : []} />
              <div className="comparison-grid" aria-live="polite">
                <div className="calculation-output">
                  <small>CLV brute · cote prise / clôture − 1</small>
                  <strong>{formatPercent(clvResult?.raw, true)}</strong>
                </div>
                <div className="calculation-output">
                  <small>Face à la référence sans marge</small>
                  <strong>{formatPercent(clvResult?.fair, true)}</strong>
                </div>
              </div>
              <p className="notice notice-warning">
                La CLV mesure un écart au marché de clôture. Elle ne prouve pas
                la rentabilité future. Une cote de clôture ne sert pas à
                justifier une décision antérieure.
              </p>
            </div>
          </section>
          <p className="muted">
            Ces calculs restent locaux à cette vue. Ils ne placent aucun pari,
            ne créent aucun ticket et n’enregistrent aucune estimation dans les
            dossiers.
          </p>
        </>
      )}
    </div>
  );
}
