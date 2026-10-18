import { economicStateAt, riskBudget, sumCents } from "./accounting";
import { allocate, bankroll, identity } from "./calculations";
import type {
  Allocation,
  AppState,
  ProbabilitySource,
  Settings,
} from "./types";
import type { RiskBudget } from "./accounting";

export interface AllocationCandidate {
  pickId: string;
  probability: number | null;
  probabilitySource: ProbabilitySource | null;
  basis?: string;
}

export interface MethodComparison {
  method: "fixed" | "percent" | "kelly";
  allocations: Allocation[];
  totalStakeCents: number;
  totalExpectedCents: number | null;
  allocatedCount: number;
  abstainedCount: number;
  remainingCashCents: number;
  remainingExposureCents: number | null;
}

export interface StakingComparison {
  createdAt: string;
  candidates: AllocationCandidate[];
  settingsSnapshot: Settings;
  bankrollSnapshot: {
    cashCents: number;
    openStakeCents: number;
    capitalCents: number;
    uncertainOpenCost: boolean;
  };
  budget: RiskBudget;
  groups: {
    identity: string;
    pickIds: string[];
    tipsterIds: string[];
    sourceIds: string[];
  }[];
  methods: MethodComparison[];
}

/** Independent methods share one immutable starting state; each basket spends its own budget once. */
export function compareStakes(
  state: AppState,
  candidates: AllocationCandidate[],
  now: Date = new Date(),
): StakingComparison {
  const snapshot = economicStateAt(state, now);
  const account = bankroll(snapshot);
  const budget = riskBudget(snapshot, account, now);
  const groups = new Map<string, StakingComparison["groups"][number]>();
  for (const candidate of candidates) {
    const pick = state.picks.find((item) => item.id === candidate.pickId);
    const key = pick ? identity(pick) : candidate.pickId;
    const group = groups.get(key) ?? {
      identity: key,
      pickIds: [],
      tipsterIds: [],
      sourceIds: [],
    };
    if (!group.pickIds.includes(candidate.pickId))
      group.pickIds.push(candidate.pickId);
    if (pick && !group.tipsterIds.includes(pick.tipsterId))
      group.tipsterIds.push(pick.tipsterId);
    if (pick && !group.sourceIds.includes(pick.sourceId))
      group.sourceIds.push(pick.sourceId);
    groups.set(key, group);
  }
  const methods = (["fixed", "percent", "kelly"] as const).map((method) => {
    const allocations = allocate(snapshot, candidates, method, now);
    const retained = allocations.filter(
      (allocation) => allocation.stakeCents > 0,
    );
    const totalStakeCents = sumCents(
      retained.map((allocation) => allocation.stakeCents),
    );
    const totalExpectedCents =
      !retained.length ||
      retained.some((allocation) => allocation.expectedCents == null)
        ? null
        : sumCents(retained.map((allocation) => allocation.expectedCents!));
    return {
      method,
      allocations,
      totalStakeCents,
      totalExpectedCents,
      allocatedCount: retained.length,
      abstainedCount: allocations.length - retained.length,
      remainingCashCents: sumCents([account.cashCents, -totalStakeCents]),
      remainingExposureCents:
        budget.exposureLimitCents == null
          ? null
          : Math.max(
              0,
              sumCents([
                budget.exposureLimitCents,
                -account.openStakeCents,
                -totalStakeCents,
              ]),
            ),
    };
  });
  return {
    createdAt: now.toISOString(),
    candidates: candidates.map((candidate) => ({ ...candidate })),
    settingsSnapshot: { ...state.settings },
    bankrollSnapshot: {
      cashCents: account.cashCents,
      openStakeCents: account.openStakeCents,
      capitalCents: account.capitalCents,
      uncertainOpenCost: account.uncertainOpenCost,
    },
    budget,
    groups: [...groups.values()],
    methods,
  };
}
