// The SINGLE rule source for the whole app (UI + Worker both derive from this).
import { DEFAULT_SPECIAL_ACTIONS, createRules } from '../engine/rules';

export const ACTIONS = DEFAULT_SPECIAL_ACTIONS;
export const rules = createRules(ACTIONS);

// ONE uniform pace for EVERY visible beat: between-actions, effect-resolve, face-down reveal,
// and the pre-game-over hold. Change this single number to tune the whole feel.
export const ACTION_DELAY_MS = 1280;

// Bot COMPUTE budget (decideMove wall-clock cap) — NOT a pacing delay; kept separate/high for the
// on-device timing pass.
export const DEFAULT_TIME_BUDGET_MS = 5000;
