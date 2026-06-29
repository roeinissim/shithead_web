// Bot configuration — every experimental lever from GameEngine.MonteCarloAi, defaults =
// production. All randomness flows through the injected RNG; the clock is injectable so the
// time-budget loop is deterministic in tests.

import type { RNG } from '../engine/rng';
import type { BeliefState } from './beliefState';
import type { HumanMemory } from './humanMemory';

export interface Clock { now(): number; }
export const systemClock: Clock = { now: () => Date.now() };

export interface BotConfig {
  simulationCount: number;   // SIMULATION_COUNT = 150
  rolloutDepth: number;      // ROLLOUT_DEPTH = 300
  epsilonPercent: number;    // EPSILON_PERCENT = 10
  timeBudgetMs: number;      // timeBudgetMs = 2000
  enableVoluntaryPickup: boolean;  // false (GAP-2, gated)
  enableDeductiveBelief: boolean;  // false (gates belief/human sampler)
  belief: BeliefState | null;      // E3 deductive belief (harness-fed)
  humanMemory: HumanMemory | null; // E5 lossy memory (precedence over belief)
}

// Production config — reproduces the ~75% baseline. Overrides for experiments/CI tiers.
export function productionConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    simulationCount: 150,
    rolloutDepth: 300,
    epsilonPercent: 10,
    timeBudgetMs: 2000,
    enableVoluntaryPickup: false,
    enableDeductiveBelief: false,
    belief: null,
    humanMemory: null,
    ...overrides,
  };
}
