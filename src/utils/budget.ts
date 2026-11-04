import type { CostRate, UsageEntry } from '../types';

/** What happens when a paid generation would take the project past its limit. */
export type BudgetMode = 'warn' | 'block';

export type ProjectBudget = {
  /** Limit in US dollars, which is what the usage rates are in. null means no budget. */
  limitUsd: number | null;
  mode: BudgetMode;
  /** Percent of the limit at which the meter turns to a warning. */
  warnAtPercent: number;
};

export const DEFAULT_BUDGET: ProjectBudget = { limitUsd: null, mode: 'warn', warnAtPercent: 80 };

export const normalizeBudget = (value: unknown): ProjectBudget => {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<ProjectBudget>;
  const limit = Number(raw.limitUsd);
  const warn = Number(raw.warnAtPercent);
  return {
    limitUsd: raw.limitUsd !== null && raw.limitUsd !== undefined && Number.isFinite(limit) && limit > 0 ? Math.round(limit * 100) / 100 : null,
    mode: raw.mode === 'block' ? 'block' : 'warn',
    warnAtPercent: Number.isFinite(warn) ? Math.min(99, Math.max(1, Math.round(warn))) : DEFAULT_BUDGET.warnAtPercent,
  };
};

/**
 * Adds up what the project has used, at the rates in the cost settings. A rate for the exact model wins, otherwise the
 * provider's rate for that kind of work is used. Uses with no rate count as nothing, as they do on the costs screen.
 */
export const spendFromLedger = (entries: UsageEntry[], rates: CostRate[]): number => {
  const byModel = new Map<string, CostRate>();
  const byProvider = new Map<string, CostRate>();
  for (const rate of rates) {
    if (rate.model) byModel.set(`${rate.provider}:${rate.model}:${rate.kind}`, rate);
    else byProvider.set(`${rate.provider}:${rate.kind}`, rate);
  }
  let total = 0;
  for (const entry of entries) {
    const rate = (entry.model && byModel.get(`${entry.provider}:${entry.model}:${entry.kind}`)) || byProvider.get(`${entry.provider}:${entry.kind}`);
    const units = Number(entry.units);
    if (rate && Number.isFinite(units) && Number.isFinite(rate.unitCost)) total += units * rate.unitCost;
  }
  return total;
};

export type BudgetState = 'none' | 'ok' | 'warn' | 'over';

export type BudgetCheck = {
  state: BudgetState;
  limitUsd: number | null;
  spentUsd: number;
  /** The cost of the generation being considered. */
  pendingUsd: number;
  remainingUsd: number | null;
  /** Share of the limit already spent, 0 to 100 and beyond. */
  percentUsed: number;
  /** Spent plus this generation would pass the limit. */
  wouldExceed: boolean;
  /** Same, and the budget is set to block. */
  blocked: boolean;
};

export const checkBudget = (budget: ProjectBudget, spentUsd: number, pendingUsd = 0): BudgetCheck => {
  const spent = Number.isFinite(spentUsd) && spentUsd > 0 ? spentUsd : 0;
  const pending = Number.isFinite(pendingUsd) && pendingUsd > 0 ? pendingUsd : 0;
  const limit = budget.limitUsd;
  if (limit === null || !(limit > 0)) {
    return { state: 'none', limitUsd: null, spentUsd: spent, pendingUsd: pending, remainingUsd: null, percentUsed: 0, wouldExceed: false, blocked: false };
  }
  const percentUsed = (spent / limit) * 100;
  const wouldExceed = pending > 0 && spent + pending > limit + 1e-9;
  const state: BudgetState = spent >= limit - 1e-9 ? 'over' : percentUsed >= budget.warnAtPercent ? 'warn' : 'ok';
  return {
    state,
    limitUsd: limit,
    spentUsd: spent,
    pendingUsd: pending,
    remainingUsd: limit - spent,
    percentUsed,
    wouldExceed,
    blocked: wouldExceed && budget.mode === 'block',
  };
};

/** One plain sentence for the person about where the budget stands, with money written by `money`. */
export const describeBudget = (check: BudgetCheck, mode: BudgetMode, money: (usd: number) => string): string => {
  if (check.state === 'none' || check.limitUsd === null) return '';
  const left = Math.max(0, check.limitUsd - check.spentUsd);
  if (check.wouldExceed) {
    const over = check.spentUsd + check.pendingUsd - check.limitUsd;
    return mode === 'block'
      ? `Over budget: this would pass the ${money(check.limitUsd)} limit by ${money(over)}.`
      : `This would pass your ${money(check.limitUsd)} budget by ${money(over)}.`;
  }
  if (check.state === 'over') return `You have reached the ${money(check.limitUsd)} budget.`;
  if (check.state === 'warn') return `${Math.round(check.percentUsed)}% of the budget is used. ${money(left)} left of ${money(check.limitUsd)}.`;
  return `${money(left)} left of ${money(check.limitUsd)}.`;
};

export type GenerationBudget = {
  check: BudgetCheck;
  /** Sentence for the generation panel; empty when there is no budget. */
  line: string;
  tone: 'ok' | 'warn' | 'over';
  /** The Generate button should be off. */
  blocked: boolean;
};

/** Where the budget stands if this generation, priced by `estimate`, goes ahead. */
export const budgetForGeneration = (opts: {
  budget?: ProjectBudget | null;
  spentUsd?: number;
  estimate?: { hostedUsd: number; providerUsd: number } | null;
  billingMode: 'hosted' | 'byok';
  money: (usd: number) => string;
}): GenerationBudget => {
  const budget = normalizeBudget(opts.budget);
  const pendingUsd = opts.estimate ? (opts.billingMode === 'byok' ? opts.estimate.providerUsd : opts.estimate.hostedUsd) : 0;
  const check = checkBudget(budget, opts.spentUsd ?? 0, pendingUsd);
  return {
    check,
    line: describeBudget(check, budget.mode, opts.money),
    tone: check.wouldExceed || check.state === 'over' ? 'over' : check.state === 'warn' ? 'warn' : 'ok',
    blocked: check.blocked,
  };
};
