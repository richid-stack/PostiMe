import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('./budget.ts');
const rate = (provider: string, kind: string, unitCost: number, model?: string) => ({ id: `${provider}-${kind}-${model || ''}`, provider, kind, unitCost, unitLabel: 'image', model }) as any;
const use = (provider: string, kind: string, units: number, model?: string) => ({ id: Math.random().toString(), provider, kind, units, unitLabel: 'image', createdAt: '', model }) as any;

test('normalizeBudget keeps good values and repairs bad ones', async () => {
  const { normalizeBudget, DEFAULT_BUDGET } = await load();
  assert.deepEqual(normalizeBudget(undefined), DEFAULT_BUDGET);
  assert.deepEqual(normalizeBudget({ limitUsd: 25.456, mode: 'block', warnAtPercent: 70 }), { limitUsd: 25.46, mode: 'block', warnAtPercent: 70 });
  assert.equal(normalizeBudget({ limitUsd: -5 }).limitUsd, null);
  assert.equal(normalizeBudget({ limitUsd: 'abc' }).limitUsd, null);
  assert.equal(normalizeBudget({ limitUsd: null }).limitUsd, null);
  assert.equal(normalizeBudget({ mode: 'weird' }).mode, 'warn');
  assert.equal(normalizeBudget({ warnAtPercent: 500 }).warnAtPercent, 99);
  assert.equal(normalizeBudget({ warnAtPercent: 0 }).warnAtPercent, 1);
});

test('spendFromLedger prefers the model rate, falls back to the provider rate, ignores unpriced use', async () => {
  const { spendFromLedger } = await load();
  const rates = [rate('fal', 'image', 0.02), rate('fal', 'image', 0.05, 'flux-pro')];
  const entries = [use('fal', 'image', 10, 'flux-pro'), use('fal', 'image', 10, 'other'), use('fal', 'image', 5), use('runway', 'video', 4)];
  // 10 x 0.05 + 10 x 0.02 + 5 x 0.02 = 0.80, runway has no rate
  assert.ok(Math.abs(spendFromLedger(entries, rates) - 0.8) < 1e-9);
  assert.equal(spendFromLedger([], rates), 0);
  assert.equal(spendFromLedger(entries, []), 0);
});

test('checkBudget with no limit never warns or blocks', async () => {
  const { checkBudget, DEFAULT_BUDGET } = await load();
  const check = checkBudget(DEFAULT_BUDGET, 500, 500);
  assert.equal(check.state, 'none');
  assert.equal(check.wouldExceed, false);
  assert.equal(check.blocked, false);
});

test('checkBudget moves from ok to warn to over', async () => {
  const { checkBudget } = await load();
  const budget = { limitUsd: 100, mode: 'warn' as const, warnAtPercent: 80 };
  assert.equal(checkBudget(budget, 50).state, 'ok');
  assert.equal(checkBudget(budget, 79.99).state, 'ok');
  assert.equal(checkBudget(budget, 80).state, 'warn');
  assert.equal(checkBudget(budget, 99).state, 'warn');
  assert.equal(checkBudget(budget, 100).state, 'over');
  assert.equal(checkBudget(budget, 130).state, 'over');
  assert.equal(checkBudget(budget, 25).remainingUsd, 75);
});

test('a generation that lands exactly on the limit is allowed; one cent over is not', async () => {
  const { checkBudget } = await load();
  const warn = { limitUsd: 10, mode: 'warn' as const, warnAtPercent: 80 };
  const block = { limitUsd: 10, mode: 'block' as const, warnAtPercent: 80 };
  assert.equal(checkBudget(block, 9, 1).wouldExceed, false);
  const over = checkBudget(block, 9, 1.01);
  assert.equal(over.wouldExceed, true);
  assert.equal(over.blocked, true);
  const soft = checkBudget(warn, 9, 1.01);
  assert.equal(soft.wouldExceed, true);
  assert.equal(soft.blocked, false);
});

test('once over budget, any priced generation is blocked in block mode but a free one is not', async () => {
  const { checkBudget } = await load();
  const block = { limitUsd: 10, mode: 'block' as const, warnAtPercent: 80 };
  assert.equal(checkBudget(block, 12, 0.02).blocked, true);
  assert.equal(checkBudget(block, 12, 0).blocked, false);
});

test('describeBudget words each situation', async () => {
  const { checkBudget, describeBudget } = await load();
  const money = (usd: number) => `$${usd.toFixed(2)}`;
  const warnB = { limitUsd: 100, mode: 'warn' as const, warnAtPercent: 80 };
  const blockB = { ...warnB, mode: 'block' as const };
  assert.equal(describeBudget(checkBudget(warnB, 20), 'warn', money), '$80.00 left of $100.00.');
  assert.match(describeBudget(checkBudget(warnB, 85), 'warn', money), /85% of the budget is used\. \$15\.00 left/);
  assert.match(describeBudget(checkBudget(warnB, 100), 'warn', money), /reached the \$100\.00 budget/);
  assert.match(describeBudget(checkBudget(warnB, 95, 10), 'warn', money), /would pass your \$100\.00 budget by \$5\.00/);
  assert.match(describeBudget(checkBudget(blockB, 95, 10), 'block', money), /Over budget.*by \$5\.00/);
  assert.equal(describeBudget(checkBudget({ ...warnB, limitUsd: null }, 5), 'warn', money), '');
});

test('budgetForGeneration prices the pending generation by billing mode', async () => {
  const { budgetForGeneration } = await load();
  const money = (usd: number) => `$${usd.toFixed(2)}`;
  const estimate = { hostedUsd: 0.5, providerUsd: 0.49 };
  const budget = { limitUsd: 10, mode: 'block' as const, warnAtPercent: 80 };
  const near = budgetForGeneration({ budget, spentUsd: 9.6, estimate, billingMode: 'hosted', money });
  assert.equal(near.blocked, true);
  assert.equal(near.tone, 'over');
  // the cheaper provider price still fits: 9.6 + 0.49 = 10.09 > 10, so it does not
  assert.equal(budgetForGeneration({ budget, spentUsd: 9.5, estimate, billingMode: 'byok', money }).blocked, false);
  assert.equal(budgetForGeneration({ budget, spentUsd: 9.52, estimate, billingMode: 'byok', money }).blocked, true);
  const none = budgetForGeneration({ budget: null, spentUsd: 99, estimate, billingMode: 'hosted', money });
  assert.equal(none.line, '');
  assert.equal(none.blocked, false);
  const noEstimate = budgetForGeneration({ budget, spentUsd: 5, estimate: null, billingMode: 'hosted', money });
  assert.equal(noEstimate.blocked, false);
  assert.equal(noEstimate.tone, 'ok');
});
