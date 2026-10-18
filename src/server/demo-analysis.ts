import { identity } from "../domain/calculations";
import { DEFAULT_SETTINGS } from "../domain/types";
import type {
  AppState,
  AuditEntry,
  LedgerEntry,
  Pick,
  Quote,
  Settings,
  Simulation,
  Strategy,
  Ticket,
  Tipster,
} from "../domain/types";
import { validatePick, validateTicket } from "./validation";

export const ANALYSIS_DEMO_VERSION = "demo.seed.analysis.v2";
const PREFIX = "demo-analysis-v2";
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

interface ProfileScenario {
  key: string;
  name: string;
  count: number;
  active: boolean;
  description: string;
  discoveryEndDay: number;
  validationStartDay: number;
}

const PROFILES: ProfileScenario[] = [
  {
    key: "regular",
    name: "Alizé Régulier · fictif",
    count: 48,
    active: true,
    discoveryEndDay: -75,
    validationStartDay: -70,
    description:
      "Scénario fictif de gains répartis sur plusieurs simples ; aucune promesse de rendement. Mises déclarées variables pour comparer pondération et référence 1 unité.",
  },
  {
    key: "accumulator",
    name: "Orbite Combinés · fictif",
    count: 32,
    active: true,
    discoveryEndDay: -75,
    validationStartDay: -70,
    description:
      "Scénario fictif dont le résultat déclaré dépend d’un seul combiné gagnant à forte cote. Les simples et combinés doivent rester identifiables et séparables.",
  },
  {
    key: "inactive",
    name: "Archive Court · fictif",
    count: 36,
    active: false,
    discoveryEndDay: -95,
    validationStartDay: -80,
    description:
      "Profil fictif archivé après une période de suivi. Ses résultats restent visibles ; l’inactivité ne justifie pas de supprimer ses pertes ni ses observations.",
  },
  {
    key: "losing",
    name: "Contretemps Live · fictif",
    count: 40,
    active: true,
    discoveryEndDay: -75,
    validationStartDay: -70,
    description:
      "Scénario fictif durablement perdant, avec paris live et avant-match. Un pronostic live enregistré après le début ne devient pas une observation avant événement.",
  },
];

function atDay(anchor: number, day: number): string {
  return new Date(anchor + day * DAY_MS).toISOString();
}

function before(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) - minutes * MINUTE_MS).toISOString();
}

function fixtureTipster(profile: ProfileScenario, anchor: number): Tipster {
  return {
    id: `${PREFIX}-tipster-${profile.key}`,
    name: profile.name,
    source:
      "Jeu synthétique d’analyse v2 — aucune personne ni plateforme réelle",
    sourceUrl: "",
    discoveredAt: atDay(anchor, -130),
    active: profile.active,
    notes: profile.description,
    accessNotes:
      "Données fictives intégrées à la démonstration. Aucun accès externe ni abonnement réel.",
    monthlyCostCents: profile.key === "regular" ? 1900 : 0,
    completeness: profile.key === "regular" ? "provided_complete" : "unknown",
    bankrolls: [`Série fictive ${profile.name}`],
  };
}

function fixtureStrategy(profile: ProfileScenario, anchor: number): Strategy {
  const frozenAt = atDay(anchor, profile.discoveryEndDay + 1);
  return {
    id: `${PREFIX}-strategy-${profile.key}`,
    name: `${profile.name} · hypothèse figée`,
    filter: { tipsterId: `${PREFIX}-tipster-${profile.key}` },
    createdAt: frozenAt,
    frozenAt,
    discoveryEnd: atDay(anchor, profile.discoveryEndDay),
    validationStart: atDay(anchor, profile.validationStartDay),
    active: profile.active,
    notes:
      "Chronologie entièrement fictive : découverte terminée, règles figées, puis nouvelles observations. Cette illustration ne constitue pas une validation statistique.",
  };
}

function fixturePick(
  profile: ProfileScenario,
  index: number,
  anchor: number,
): Pick {
  const validation = index >= profile.count / 2;
  const localIndex = validation ? index - profile.count / 2 : index;
  const day =
    profile.key === "inactive"
      ? validation
        ? -78 + localIndex * 2
        : -125 + localIndex * 1.5
      : validation
        ? -68 + localIndex * 2.5
        : -125 + localIndex * 2;
  const startsAt = atDay(anchor, day);
  const live = profile.key === "losing" && index % 2 === 0;
  const delayMinutes = live ? -12 : [20, 90, 240, 1200, 2880][index % 5];
  const publishedAt = before(startsAt, delayMinutes);
  const evidence =
    !live && (validation || index % 3 === 1) ? "observed" : "declared";
  const settledAt = before(startsAt, -180);
  // Some older observations were available during discovery. Declared records
  // were received only after settlement, but before that period's cutoff.
  // These historical collection dates exist solely inside the synthetic demo.
  const observedAt =
    evidence === "observed"
      ? before(publishedAt, -2)
      : before(settledAt, -1440);
  const accumulator = profile.key === "accumulator" && index % 4 !== 0;
  const exceptionalWin =
    profile.key === "accumulator" && index === profile.count - 1;
  const won =
    profile.key === "regular"
      ? index % 4 !== 0
      : profile.key === "inactive"
        ? index % 2 === 0
        : profile.key === "losing"
          ? index % 5 === 1
          : exceptionalWin || (!accumulator && index % 8 === 0);
  const sport =
    profile.key === "inactive"
      ? "Tennis"
      : profile.key === "losing" && index % 3 === 0
        ? "Basketball"
        : "Football";
  const totalMarket = !accumulator && index % 3 === 1;
  const market = accumulator
    ? "Combiné de vainqueurs"
    : totalMarket
      ? sport === "Tennis"
        ? "Total jeux"
        : sport === "Basketball"
          ? "Total points"
          : "Total buts"
      : "Vainqueur";
  const line = totalMarket
    ? sport === "Tennis"
      ? "22.5"
      : sport === "Basketball"
        ? "164.5"
        : "2.5"
    : "";
  const odds = exceptionalWin
    ? 70
    : accumulator
      ? [4.5, 6, 8][index % 3]
      : [1.55, 1.85, 2.1, 2.6][index % 4];
  const pick: Pick = {
    id: `${PREFIX}-pick-${profile.key}-${index}`,
    tipsterId: `${PREFIX}-tipster-${profile.key}`,
    sourceId: `${PREFIX}-${profile.key}-${index}`,
    sourceUrl: "",
    publishedAt,
    observedAt,
    startsAt,
    event: `${profile.name.replace(" · fictif", "")} · rencontre fictive ${index + 1}`,
    eventKey: `${PREFIX}-event-${profile.key}-${index}`,
    sport,
    competition:
      sport === "Tennis"
        ? index % 2
          ? "Circuit Sud fictif"
          : "Circuit Nord fictif"
        : sport === "Basketball"
          ? "Ligue basket fictive"
          : index % 2
            ? "Coupe fictive"
            : "Championnat fictif",
    market,
    selection: accumulator
      ? "Sélections A + B + C fictives"
      : totalMarket
        ? `Plus de ${line}`
        : "Équipe A fictive",
    line,
    rules:
      sport === "Tennis"
        ? "Match entier, abandon exclu"
        : "Temps réglementaire uniquement",
    odds,
    minOdds: null,
    stakeUnits: exceptionalWin ? 5 : [0.5, 1, 2, 1][index % 4],
    result: won ? "won" : "lost",
    settledAt,
    settlementSource:
      "Résultat synthétique du scénario v2 ; aucune compétition réelle",
    kind: accumulator ? "accumulator" : "single",
    timing: live ? "live" : "prematch",
    evidence,
    initialContent: "",
    argument:
      index % 3 === 0
        ? "Argument fictif publié : comparaison des styles annoncés ; aucune information réelle sur une équipe."
        : "",
    notes: `${profile.description} ${evidence === "observed" ? "Observation avant événement synthétique pour illustrer la validation prospective ; elle n’a jamais été collectée sur un événement réel." : "Historique déclaré synthétique ; sa date de publication n’est pas une preuve de collecte prospective."}`,
    revisions: [],
    manuallyCorrected: false,
  };
  const initialView =
    evidence === "observed"
      ? {
          ...pick,
          result: "open",
          settledAt: null,
          settlementSource: "",
          revisions: undefined,
          initialContent: undefined,
        }
      : { ...pick, revisions: undefined, initialContent: undefined };
  pick.initialContent = JSON.stringify(initialView);
  if (evidence === "observed") {
    pick.revisions.push({
      at: pick.settledAt!,
      description:
        "Règlement fictif reçu après l’événement ; contenu initial inchangé",
      previous: initialView,
    });
  }
  return validatePick(pick);
}

function fixtureQuote(pick: Pick, index: number): Quote {
  const observedAt = before(pick.observedAt, -3);
  const available = index % 7 !== 0;
  return {
    id: `${PREFIX}-quote-${pick.id}`,
    pickId: pick.id,
    bookmaker: "Winamax FR",
    odds: available
      ? Math.max(1.1, Math.round((pick.odds - 0.08) * 100) / 100)
      : null,
    observedAt,
    recordedAt: before(observedAt, -0.1),
    source: "Relevé synthétique v2 ; aucune cote Winamax réelle",
    sourceUrl: "",
    available,
    matchConfirmed: available,
    closing: false,
    referenceProbability: null,
    notes: available
      ? "Correspondance exacte illustrée dans le scénario fictif."
      : "Marché fictivement indisponible : observation conservée, aucune allocation.",
  };
}

function fixtureSettings(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    maxBetPercent: 0.01,
    maxEventPercent: 0.02,
    maxExposurePercent: 0.05,
    dailyLossLimitCents: 10_000,
    monthlyLossLimitCents: 25_000,
  };
}

function fixtureSimulation(
  pick: Pick,
  quote: Quote,
  strategy: Strategy,
  sequence: number,
): Simulation {
  return {
    id: `${PREFIX}-simulation-${sequence}`,
    name: `Snapshot fictif ${sequence + 1} · ${pick.event}`,
    createdAt: before(quote.recordedAt, -1),
    strategyId: strategy.id,
    method: "fixed",
    allocations: [
      {
        pickId: pick.id,
        eventKey: pick.eventKey,
        identity: identity(pick),
        stakeCents: 1000,
        odds: quote.odds!,
        probability: null,
        probabilitySource: null,
        expectedCents: null,
        reason:
          "Mise fixe hypothétique de 10 € archivée avant l’événement fictif ; espérance inconnue.",
      },
    ],
    assumptions:
      "Snapshot entièrement fictif enregistré avant événement, à la cote synthétique connue à cet instant. Capital de scénario 1 000 €, plafond 1 % par pari. Aucun résultat ni retour encaissé n’est enregistré dans ce snapshot ; ce n’est pas un ticket exécuté.",
    settingsSnapshot: fixtureSettings(),
  };
}

function fixtureTicket(
  pick: Pick,
  strategy: Strategy,
  sequence: number,
): Ticket {
  const odds = Math.max(1.1, Math.round((pick.odds - 0.12) * 100) / 100);
  const ticket: Ticket = {
    id: `${PREFIX}-ticket-${sequence}`,
    sourceId: `${PREFIX}-accepted-${sequence}`,
    pickId: pick.id,
    bookmaker: "Winamax FR",
    event: pick.event,
    eventKey: pick.eventKey,
    selection: pick.selection,
    market: pick.market,
    line: pick.line,
    rules: pick.rules,
    kind: pick.kind,
    odds,
    stakeCents: 1000,
    funding: "cash",
    placedAt: before(pick.startsAt, 10),
    settledAt: pick.settledAt,
    result: pick.result,
    returnCents: pick.result === "won" ? Math.round(1000 * odds) : 0,
    feeCents: 0,
    remainingStakeCents: null,
    partialCashout: false,
    strategyId: strategy.id,
    source:
      "Ticket explicitement fictif du portefeuille de démonstration ; aucune exécution réelle",
    notes:
      "Exemple de justificatif accepté dans le scénario. Sélection distincte des snapshots de simulation ; cote prise différente de la cote publiée.",
    manuallyCorrected: false,
    revisions: [],
  };
  return validateTicket(ticket);
}

/** Append-only illustration. Synthetic timestamps are confined to this demo-only builder. */
export function enrichAnalysisDemo(state: AppState, now = new Date()): boolean {
  if (state.workspace !== "demo")
    throw new Error(
      "Les scénarios synthétiques sont réservés à la démonstration.",
    );
  if (state.audit.some((entry) => entry.action === ANALYSIS_DEMO_VERSION))
    return false;

  const anchor = now.getTime();
  const tipsters = PROFILES.map((profile) => fixtureTipster(profile, anchor));
  const strategies = PROFILES.map((profile) =>
    fixtureStrategy(profile, anchor),
  );
  const picks = PROFILES.flatMap((profile) =>
    Array.from({ length: profile.count }, (_, index) =>
      fixturePick(profile, index, anchor),
    ),
  );
  const observed = picks.filter((pick) => pick.evidence === "observed");
  const quotes = observed.map(fixtureQuote);
  const validationObserved = observed.filter((pick) => {
    const strategy = strategies.find(
      (item) => item.filter.tipsterId === pick.tipsterId,
    )!;
    return pick.observedAt >= strategy.validationStart;
  });
  const snapshotPicks = validationObserved
    .filter((pick, index) => pick.kind === "single" && index % 5 === 1)
    .slice(0, 8);
  const simulations = snapshotPicks.flatMap((pick, index) => {
    const quote = quotes.find((item) => item.pickId === pick.id)!;
    if (!quote.available) return [];
    const strategy = strategies.find(
      (item) => item.filter.tipsterId === pick.tipsterId,
    )!;
    return [fixtureSimulation(pick, quote, strategy, index)];
  });
  const simulatedIds = new Set(
    simulations.flatMap((simulation) =>
      simulation.allocations.map((allocation) => allocation.pickId),
    ),
  );
  const tickets = PROFILES.map((profile, index) => {
    const pick = validationObserved.find(
      (item) =>
        item.tipsterId === `${PREFIX}-tipster-${profile.key}` &&
        !simulatedIds.has(item.id),
    )!;
    return fixtureTicket(pick, strategies[index], index);
  });
  const ledger: LedgerEntry[] = tickets.flatMap((ticket) => [
    {
      id: `${ticket.id}-stake`,
      kind: "ticket_stake" as const,
      amountCents: -ticket.stakeCents,
      at: ticket.placedAt,
      description: `Mise du ticket fictif ${ticket.sourceId}`,
      ticketId: ticket.id,
      revision: 0,
    },
    ...(ticket.returnCents
      ? [
          {
            id: `${ticket.id}-return`,
            kind: "ticket_return" as const,
            amountCents: ticket.returnCents,
            at: ticket.settledAt!,
            description: `Retour du ticket fictif ${ticket.sourceId}`,
            ticketId: ticket.id,
            revision: 0,
          },
        ]
      : []),
  ]);

  // A user may already have exercised all demo cash. Add an explicit fictional
  // contribution only if necessary; existing balances/entries are never edited.
  const currentCash = state.ledger.reduce(
    (sum, entry) => sum + entry.amountCents,
    0,
  );
  const placementCost = tickets.reduce(
    (sum, ticket) => sum + ticket.stakeCents,
    0,
  );
  if (currentCash < placementCost) {
    ledger.unshift({
      id: `${PREFIX}-funding`,
      kind: "deposit",
      amountCents: placementCost - currentCash,
      at: atDay(anchor, -130),
      description: "Apport fictif pour les scénarios d’analyse v2",
      ticketId: null,
      revision: 0,
    });
  }
  const resultingCash = ledger.reduce(
    (sum, entry) => sum + entry.amountCents,
    currentCash,
  );
  if (!Number.isSafeInteger(resultingCash) || resultingCash < 0) {
    throw new Error(
      "Les mouvements fictifs dépasseraient les limites de précision du journal ; enrichissement annulé.",
    );
  }

  const audit: AuditEntry[] = [
    {
      id: `${PREFIX}-inactive`,
      at: atDay(anchor, -40),
      action: "demo.profile.archived",
      entityId: `${PREFIX}-tipster-inactive`,
      detail:
        "Archivage fictif après le dernier événement suivi ; historique conservé.",
    },
    {
      id: `${PREFIX}-installed`,
      at: now.toISOString(),
      action: ANALYSIS_DEMO_VERSION,
      entityId: "demo",
      detail:
        "Enrichissement v2 ajouté sans modifier les données existantes : 4 profils fictifs, découverte et validation synthétiques, 7 axes, observations, snapshots de simulation et tickets séparés.",
    },
  ];

  const additions = {
    tipsters,
    strategies,
    picks,
    quotes,
    simulations,
    tickets,
    ledger,
    audit,
  };
  for (const [name, records] of Object.entries(additions)) {
    const existingIds = new Set(
      (state[name as keyof typeof additions] as { id: string }[]).map(
        (record) => record.id,
      ),
    );
    if (records.some((record) => existingIds.has(record.id)))
      throw new Error(
        "Un identifiant réservé de démonstration existe déjà ; enrichissement annulé sans écrasement.",
      );
  }
  if (
    tipsters.some((tipster) =>
      state.tipsters.some((existing) => existing.name === tipster.name),
    )
  ) {
    throw new Error(
      "Un nom de profil de démonstration existe déjà ; enrichissement annulé sans écrasement.",
    );
  }

  state.tipsters.push(...tipsters);
  state.strategies.push(...strategies);
  state.picks.push(...picks);
  state.quotes.push(...quotes);
  state.simulations.push(...simulations);
  state.tickets.push(...tickets);
  state.ledger.push(...ledger);
  state.audit.push(...audit);
  return true;
}
