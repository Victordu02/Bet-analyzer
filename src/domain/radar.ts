import Decimal from "decimal.js";
import {
  allocate,
  bankroll,
  decision,
  expectedValue,
  identity,
  matchesSegment,
  noVig,
} from "./calculations";
import { assessQuote } from "./quote-assessment";
import type {
  AppState,
  Pick,
  ProbabilitySource,
  Quote,
  Strategy,
} from "./types";

interface ProbabilityBasis {
  probability: number;
  recordedAt: string;
  basis: string;
  validUntil?: string;
  targetIdentity?: string;
}

export interface CompleteMarketInput {
  outcomes: { label: string; odds: number }[];
  complete: boolean;
  source: string;
  sourceUrl: string;
  observedAt: string;
  coverage: string;
}

export type ProbabilityEstimate =
  | (ProbabilityBasis & { source: "manual" })
  | (ProbabilityBasis & {
      source: "market";
      market: CompleteMarketInput & { selection: string };
    })
  | (ProbabilityBasis & {
      source: "model";
      model: {
        name: string;
        version: string;
        documentationUrl: string;
        predictedAt: string;
        trainedUntil: string;
        evaluation: {
          sourceUrl: string;
          from: string;
          to: string;
          sampleSize: number;
          brier: number | null;
          logLoss: number | null;
        };
      };
    });

export interface ProbabilityValidation {
  valid: boolean;
  probability: number | null;
  source: ProbabilitySource | null;
  errors: string[];
  warnings: string[];
  label: string;
}

export interface EvaluateExpectedValueResult {
  status: "known" | "unknown" | "invalid" | "unsupported";
  breakEven: number | null;
  roi: number | null;
  expectedCents: number | null;
  kelly: number | null;
  errors: string[];
  warnings: string[];
  probability: ProbabilityValidation;
}

export interface DecisionAnalysisOptions {
  now?: Date;
  estimate?: ProbabilityEstimate | null;
  stakeCents?: number;
}

export interface DecisionAnalysis {
  status: string;
  reason: string;
  eligible: boolean;
  quote: Quote | null;
  pick: Pick;
  quoteHistory: Quote[];
  firstQuote: Quote | null;
  latestQuote: Quote | null;
  announcedOdds: number;
  currentOdds: number | null;
  thresholdOdds: number | null;
  publicationDelayMinutes: number | null;
  firstDelayMinutes: number | null;
  currentDelayMinutes: number | null;
  quoteAgeMinutes: number | null;
  providerAgeMinutes: number | null;
  quoteFresh: boolean;
  matching: { status: "confirmed" | "ambiguous" | "missing"; issues: string[] };
  matchingStrategies: Strategy[];
  duplicates: { pickId: string; tipsterId: string }[];
  exposure: {
    cashCents: number;
    capitalCents: number;
    openStakeCents: number;
    eventStakeCents: number;
    identicalOpenTickets: number;
    suggestedStakeCents: number | null;
    eligible: boolean;
    reason: string;
    uncertain: boolean;
  };
  expectation: EvaluateExpectedValueResult;
  sourceRefs: string[];
}

const time = (value: string): number => Date.parse(value);
const validProbability = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= 1;
const validMoney = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;
const validOdds = (value: number): boolean =>
  Number.isFinite(value) && value > 1;
const normal = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/\s+/g, " ");
const validUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};
const safeFloor = (value: Decimal): number | null => {
  const amount = value.floor().toNumber();
  return Number.isSafeInteger(amount) ? amount : null;
};

export function normalizeCompleteMarket(
  input: CompleteMarketInput,
  now: Date = new Date(),
): {
  valid: boolean;
  probabilities: { label: string; probability: number }[];
  overround: number | null;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings = [
    "La normalisation proportionnelle est une convention de marché. Retirer la marge des seules cotes Winamax ne prouve pas un avantage contre Winamax.",
  ];
  if (!input.complete)
    errors.push(
      "Confirmez que les issues forment le marché complet, mutuellement exclusif et soumis aux mêmes règles.",
    );
  if (!input.source.trim() || !validUrl(input.sourceUrl))
    errors.push("Une source explicite et son URL HTTP(S) sont requises.");
  if (!input.coverage.trim())
    errors.push(
      "Le marché, sa couverture et ses règles doivent être documentés.",
    );
  if (
    !Number.isFinite(time(input.observedAt)) ||
    time(input.observedAt) > now.getTime()
  )
    errors.push("Horodatage de marché invalide ou futur.");
  if (input.outcomes.length < 2 || input.outcomes.length > 100)
    errors.push(
      "Un marché complet doit contenir entre 2 et 100 issues documentées.",
    );
  if (
    input.outcomes.some(
      (outcome) => !outcome.label.trim() || !validOdds(outcome.odds),
    )
  )
    errors.push(
      "Chaque issue exige un libellé et une cote décimale finie supérieure à 1.",
    );
  if (
    new Set(input.outcomes.map((outcome) => normal(outcome.label))).size !==
    input.outcomes.length
  )
    errors.push("Deux issues portent le même libellé ; marché ambigu.");
  if (errors.length)
    return {
      valid: false,
      probabilities: [],
      overround: null,
      errors,
      warnings,
    };
  const probabilities = noVig(input.outcomes.map((outcome) => outcome.odds));
  const overround = input.outcomes
    .reduce(
      (sum, outcome) => sum.plus(new Decimal(1).div(outcome.odds)),
      new Decimal(0),
    )
    .minus(1)
    .toNumber();
  return {
    valid: true,
    probabilities: input.outcomes.map((outcome, index) => ({
      label: outcome.label,
      probability: probabilities[index],
    })),
    overround,
    errors,
    warnings,
  };
}

export function validateProbabilityEstimate(
  estimate: ProbabilityEstimate | null | undefined,
  now: Date = new Date(),
): ProbabilityValidation {
  if (!estimate)
    return {
      valid: false,
      probability: null,
      source: null,
      errors: [],
      warnings: [
        "Espérance inconnue : aucune estimation de probabilité fournie.",
      ],
      label: "Probabilité absente",
    };
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!validProbability(estimate.probability))
    errors.push(
      "La probabilité doit être finie et comprise entre 0 et 1, bornes comprises.",
    );
  if (!estimate.basis.trim())
    errors.push(
      "L’origine et les hypothèses de la probabilité doivent être explicites.",
    );
  if (
    !Number.isFinite(time(estimate.recordedAt)) ||
    time(estimate.recordedAt) > now.getTime()
  )
    errors.push("Date d’enregistrement de la probabilité invalide ou future.");
  if (
    estimate.validUntil != null &&
    !(
      time(estimate.recordedAt) <= time(estimate.validUntil) &&
      now.getTime() <= time(estimate.validUntil)
    )
  )
    errors.push("Validité de l’estimation expirée ou incohérente.");
  let label = "Provenance inconnue";
  if (estimate.source === "manual") {
    label = "Hypothèse manuelle";
    warnings.push(
      "Une hypothèse manuelle permet une simulation ; elle ne démontre aucun avantage.",
    );
  } else if (estimate.source === "market") {
    label = "Référence de marché documentée";
    const normalized = normalizeCompleteMarket(estimate.market, now);
    errors.push(...normalized.errors);
    warnings.push(...normalized.warnings);
    if (time(estimate.market.observedAt) > time(estimate.recordedAt))
      errors.push(
        "L’observation du marché doit précéder l’enregistrement de l’estimation.",
      );
    const selected = normalized.probabilities.find(
      (outcome) => normal(outcome.label) === normal(estimate.market.selection),
    );
    if (!selected)
      errors.push("La sélection n’appartient pas au marché complet fourni.");
    else if (
      validProbability(estimate.probability) &&
      new Decimal(selected.probability)
        .minus(estimate.probability)
        .abs()
        .gt("0.000000000001")
    )
      errors.push(
        "La probabilité ne correspond pas à la normalisation du marché documenté.",
      );
  } else if (estimate.source === "model") {
    label = "Estimation de modèle documenté";
    const model = estimate.model;
    const evaluation = model.evaluation;
    if (
      !model.name.trim() ||
      !model.version.trim() ||
      !validUrl(model.documentationUrl) ||
      !validUrl(evaluation.sourceUrl)
    )
      errors.push(
        "Nom, version, documentation et source d’évaluation du modèle sont requis.",
      );
    if (
      !(
        time(model.trainedUntil) <= time(model.predictedAt) &&
        time(model.predictedAt) <= time(estimate.recordedAt)
      )
    )
      errors.push(
        "La fin d’entraînement doit précéder la prévision et son enregistrement.",
      );
    if (
      !(
        time(evaluation.from) <= time(evaluation.to) &&
        time(evaluation.to) <= time(model.predictedAt)
      )
    )
      errors.push(
        "La période d’évaluation doit être connue avant la prévision.",
      );
    if (
      !Number.isSafeInteger(evaluation.sampleSize) ||
      evaluation.sampleSize <= 0
    )
      errors.push("Un effectif d’évaluation positif et documenté est requis.");
    if (evaluation.brier == null && evaluation.logLoss == null)
      errors.push(
        "Renseignez au moins un Brier score ou une log loss d’évaluation.",
      );
    if (
      evaluation.brier != null &&
      (!Number.isFinite(evaluation.brier) ||
        evaluation.brier < 0 ||
        evaluation.brier > 1)
    )
      errors.push("Le Brier score doit être compris entre 0 et 1.");
    if (
      evaluation.logLoss != null &&
      (!Number.isFinite(evaluation.logLoss) || evaluation.logLoss < 0)
    )
      errors.push("La log loss doit être finie et positive ou nulle.");
    warnings.push(
      "La provenance est documentée par la saisie ; la qualité du modèle et son évaluation ne sont pas vérifiées automatiquement.",
    );
  } else {
    errors.push("Provenance de probabilité non prise en charge.");
  }
  return {
    valid: errors.length === 0,
    probability: errors.length ? null : estimate.probability,
    source: errors.length ? null : estimate.source,
    errors,
    warnings,
    label,
  };
}

export function evaluateExpectedValue(
  input: {
    stakeCents: number;
    odds: number;
    estimate: ProbabilityEstimate | null;
  },
  now: Date = new Date(),
): EvaluateExpectedValueResult {
  const probability = validateProbabilityEstimate(input.estimate, now);
  const errors = [...probability.errors];
  if (!validMoney(input.stakeCents))
    errors.push("La mise doit être un entier sûr positif ou nul en centimes.");
  if (!validOdds(input.odds))
    errors.push("La cote doit être finie et strictement supérieure à 1.");
  const base: EvaluateExpectedValueResult = {
    status: errors.length ? "invalid" : "unknown",
    breakEven: validOdds(input.odds)
      ? new Decimal(1).div(input.odds).toNumber()
      : null,
    roi: null,
    expectedCents: null,
    kelly: null,
    errors,
    warnings: probability.warnings,
    probability,
  };
  if (errors.length || !probability.valid) return base;
  try {
    const result = expectedValue(
      input.stakeCents,
      input.odds,
      probability.probability,
    );
    return { ...base, ...result, status: "known" };
  } catch {
    return {
      ...base,
      status: "invalid",
      errors: [
        ...errors,
        "Le résultat monétaire dépasse la précision sûre en centimes.",
      ],
    };
  }
}

export function sensitivityGrid(
  stakeCents: number,
  oddsValues: number[],
  probabilityValues: number[],
): {
  odds: number[];
  probabilities: number[];
  cells: {
    odds: number;
    probability: number;
    roi: number | null;
    expectedCents: number | null;
  }[];
  errors: string[];
} {
  const errors: string[] = [];
  if (!validMoney(stakeCents))
    errors.push("Mise entière en centimes invalide.");
  if (
    !oddsValues.length ||
    !probabilityValues.length ||
    oddsValues.length > 25 ||
    probabilityValues.length > 25
  )
    errors.push("Chaque axe de sensibilité doit contenir de 1 à 25 valeurs.");
  if (oddsValues.some((odds) => !validOdds(odds)))
    errors.push("Toutes les cotes doivent être finies et supérieures à 1.");
  if (probabilityValues.some((probability) => !validProbability(probability)))
    errors.push(
      "Les hypothèses de probabilité doivent être comprises entre 0 et 1.",
    );
  if (errors.length)
    return {
      odds: [...oddsValues],
      probabilities: [...probabilityValues],
      cells: [],
      errors,
    };
  const cells = probabilityValues.flatMap((probability) =>
    oddsValues.map((odds) => {
      const roi = new Decimal(probability).times(odds).minus(1);
      const expectedCents = safeFloor(roi.times(stakeCents));
      if (
        expectedCents == null &&
        !errors.includes(
          "Certains résultats dépassent la précision sûre en centimes.",
        )
      )
        errors.push(
          "Certains résultats dépassent la précision sûre en centimes.",
        );
      return {
        odds,
        probability,
        roi: expectedCents == null ? null : roi.toNumber(),
        expectedCents,
      };
    }),
  );
  return {
    odds: [...oddsValues],
    probabilities: [...probabilityValues],
    cells,
    errors,
  };
}

export function evaluateOutcomeStates(
  input: {
    stakeCents: number;
    funding: "cash" | "freebet";
    states: {
      label: string;
      estimate: ProbabilityEstimate | null;
      grossReturnCents: number;
      feeCents: number;
    }[];
  },
  now: Date = new Date(),
): {
  status: "known" | "unknown" | "invalid";
  expectedCents: number | null;
  roi: number | null;
  probabilityTotal: number | null;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings = [
    "Les états doivent être exhaustifs et mutuellement exclusifs. Les retours bruts comprennent toute restitution de mise ; les frais sont déduits une seule fois.",
  ];
  if (!validMoney(input.stakeCents))
    errors.push("Mise entière en centimes invalide.");
  if (!input.states.length || input.states.length > 100)
    errors.push("Renseignez de 1 à 100 états possibles.");
  if (!["cash", "freebet"].includes(input.funding))
    errors.push("Financement du pari inconnu.");
  if (
    input.states.some(
      (state) =>
        !state.label.trim() ||
        !validMoney(state.grossReturnCents) ||
        !validMoney(state.feeCents),
    )
  )
    errors.push(
      "Chaque état exige un libellé et des retours/frais en centimes entiers positifs ou nuls.",
    );
  if (
    new Set(input.states.map((state) => normal(state.label))).size !==
    input.states.length
  )
    errors.push("Les libellés des états doivent être distincts.");
  const probabilities = input.states.map((state) =>
    validateProbabilityEstimate(state.estimate, now),
  );
  probabilities.forEach((probability) => {
    errors.push(...probability.errors);
    warnings.push(...probability.warnings);
  });
  const unknown = probabilities.some((probability) => !probability.valid);
  const total = unknown
    ? null
    : probabilities.reduce(
        (sum, probability) => sum.plus(probability.probability!),
        new Decimal(0),
      );
  if (total != null && total.minus(1).abs().gt("0.000000000001"))
    errors.push(
      "La somme des probabilités des états doit être égale à 1 ; aucune renormalisation automatique.",
    );
  const base = {
    status: errors.length ? ("invalid" as const) : ("unknown" as const),
    expectedCents: null,
    roi: null,
    probabilityTotal: total?.toNumber() ?? null,
    errors,
    warnings: [...new Set(warnings)],
  };
  if (errors.length || unknown) return base;
  const cashStake = input.funding === "cash" ? input.stakeCents : 0;
  if (
    input.states.some(
      (state) =>
        !Number.isSafeInteger(
          new Decimal(state.grossReturnCents)
            .minus(cashStake)
            .minus(state.feeCents)
            .toNumber(),
        ),
    )
  ) {
    return {
      ...base,
      status: "invalid",
      errors: [
        ...errors,
        "Le résultat net d’un état dépasse la précision sûre en centimes.",
      ],
    };
  }
  const expectation = input.states.reduce((sum, state, index) => {
    const net = new Decimal(state.grossReturnCents)
      .minus(cashStake)
      .minus(state.feeCents);
    return sum.plus(net.times(probabilities[index].probability!));
  }, new Decimal(0));
  const expectedCents = safeFloor(expectation);
  if (expectedCents == null)
    return {
      ...base,
      status: "invalid",
      errors: [...errors, "L’espérance dépasse la précision sûre en centimes."],
    };
  return {
    ...base,
    status: "known",
    expectedCents,
    roi: cashStake > 0 ? expectation.div(cashStake).toNumber() : null,
  };
}

export function decisionAnalysis(
  state: AppState,
  pick: Pick,
  options: DecisionAnalysisOptions = {},
): DecisionAnalysis {
  const now = options.now ?? new Date();
  const choice = decision(pick, state, now);
  const assessment = assessQuote(
    pick,
    state.quotes,
    state.settings.quoteMaxAgeMinutes,
    now,
  );
  const account = bankroll(state);
  const openTickets = state.tickets.filter(
    (ticket) => ticket.result === "open" || ticket.partialCashout,
  );
  const eventStakeCents = openTickets
    .filter(
      (ticket) =>
        normal(ticket.eventKey || ticket.event) ===
          normal(pick.eventKey || pick.event) && ticket.funding === "cash",
    )
    .reduce(
      (sum, ticket) =>
        sum.plus(ticket.remainingStakeCents ?? ticket.stakeCents),
      new Decimal(0),
    )
    .toNumber();
  const identicalOpenTickets = openTickets.filter(
    (ticket) =>
      JSON.stringify(
        [
          normal(ticket.eventKey || ticket.event),
          ticket.market,
          ticket.selection,
          ticket.line,
          ticket.rules,
          ticket.kind,
        ].map(normal),
      ) === identity(pick),
  ).length;
  const probability = validateProbabilityEstimate(options.estimate, now);
  const estimate = options.estimate;
  if (
    estimate &&
    ((estimate.source !== "manual" &&
      estimate.targetIdentity !== identity(pick)) ||
      (estimate.targetIdentity != null &&
        estimate.targetIdentity !== identity(pick)) ||
      (estimate.source === "market" &&
        normal(estimate.market.selection) !== normal(pick.selection)))
  ) {
    probability.valid = false;
    probability.probability = null;
    probability.source = null;
    probability.errors.push(
      "Cette probabilité n’est pas explicitement associée à l’identité exacte de ce pari et de sa sélection.",
    );
  }
  const allocation = allocate(
    state,
    [
      {
        pickId: pick.id,
        probability: probability.probability,
        probabilitySource: probability.source,
      },
    ],
    "fixed",
    now,
  )[0];
  const latestQuote = assessment.quote;
  const stakeCents = options.stakeCents ?? allocation.stakeCents;
  const expectation = evaluateExpectedValue(
    {
      stakeCents,
      odds: latestQuote?.odds ?? pick.odds,
      estimate: options.estimate ?? null,
    },
    now,
  );
  if (probability.errors.length) {
    expectation.status = "invalid";
    expectation.probability = probability;
    expectation.errors = [
      ...new Set([...expectation.errors, ...probability.errors]),
    ];
    expectation.roi = null;
    expectation.expectedCents = null;
    expectation.kelly = null;
  }
  if (
    pick.kind !== "single" ||
    pick.timing !== "prematch" ||
    ["cashout", "half_won", "half_lost", "void"].includes(pick.result)
  ) {
    expectation.status = "unsupported";
    expectation.roi = null;
    expectation.expectedCents = null;
    expectation.kelly = null;
    expectation.errors.push(
      "Ce dossier sort du cas simple cash gagné/perdu sans frais ; renseignez les états et résultats nets dans la calculatrice dédiée.",
    );
  } else if (!choice.eligible || latestQuote?.odds == null) {
    expectation.roi = null;
    expectation.expectedCents = null;
    expectation.kelly = null;
    if (expectation.status === "known") expectation.status = "unknown";
    expectation.warnings.push(
      "Aucune espérance opérationnelle n’est affichée sans cote Winamax éligible ; la calculatrice reste un scénario distinct.",
    );
  }
  const minutes = (end: string | undefined, start: string): number | null =>
    end && Number.isFinite(time(end)) && Number.isFinite(time(start))
      ? (time(end) - time(start)) / 60_000
      : null;
  const matchingStrategies = state.strategies.filter(
    (strategy) => strategy.active && matchesSegment(pick, strategy.filter),
  );
  const duplicates = state.picks
    .filter(
      (candidate) =>
        candidate.id !== pick.id && identity(candidate) === identity(pick),
    )
    .map((candidate) => ({
      pickId: candidate.id,
      tipsterId: candidate.tipsterId,
    }));
  return {
    ...choice,
    pick,
    quoteHistory: assessment.history,
    firstQuote: assessment.firstQuote,
    latestQuote,
    announcedOdds: pick.odds,
    currentOdds: latestQuote?.odds ?? null,
    thresholdOdds: pick.minOdds,
    publicationDelayMinutes: minutes(now.toISOString(), pick.publishedAt),
    firstDelayMinutes: minutes(
      assessment.firstQuote?.observedAt,
      pick.publishedAt,
    ),
    currentDelayMinutes: minutes(latestQuote?.observedAt, pick.publishedAt),
    quoteAgeMinutes: assessment.ageMinutes,
    providerAgeMinutes: assessment.providerAgeMinutes,
    quoteFresh: assessment.fresh,
    matching: assessment.matching,
    matchingStrategies,
    duplicates,
    exposure: {
      cashCents: account.cashCents,
      capitalCents: account.capitalCents,
      openStakeCents: account.openStakeCents,
      eventStakeCents,
      identicalOpenTickets,
      suggestedStakeCents:
        allocation.stakeCents > 0 ? allocation.stakeCents : null,
      eligible: allocation.stakeCents > 0,
      reason: allocation.reason,
      uncertain: account.uncertainOpenCost,
    },
    expectation,
    sourceRefs: [
      `pick:${pick.id}`,
      `tipster:${pick.tipsterId}`,
      ...assessment.history.map((quote) => `quote:${quote.id}`),
      ...matchingStrategies.map((strategy) => `strategy:${strategy.id}`),
      ...openTickets
        .filter(
          (ticket) =>
            normal(ticket.eventKey || ticket.event) ===
            normal(pick.eventKey || pick.event),
        )
        .map((ticket) => `ticket:${ticket.id}`),
    ],
  };
}

/** Retain missed, expired and unavailable dossiers; rendering filters never mutate the source history. */
export function radarCandidates(
  state: AppState,
  options: DecisionAnalysisOptions = {},
): DecisionAnalysis[] {
  return state.picks.map((pick) =>
    decisionAnalysis(state, pick, {
      ...options,
      estimate:
        options.estimate?.targetIdentity === identity(pick)
          ? options.estimate
          : null,
    }),
  );
}
