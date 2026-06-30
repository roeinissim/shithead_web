// The SINGLE rule source for the whole app (UI + Worker both derive from this).
import { DEFAULT_SPECIAL_ACTIONS, createRules } from '../engine/rules';

export const ACTIONS = DEFAULT_SPECIAL_ACTIONS;
export const rules = createRules(ACTIONS);

// ONE uniform pace for EVERY visible beat: between-actions, effect-resolve, face-down reveal,
// and the pre-game-over hold. Change this single number to tune the whole feel.
export const ACTION_DELAY_MS = 1280;

// Bot COMPUTE budget — a SAFETY CEILING over the fixed 150-sim search (decideMove finishes on its
// own; the budget only ever truncates a pathological overrun, never real play). Set from the iPhone
// 17 timing pass: max observed decideMove = 291ms, so 700ms never truncates and stays well under one
// ACTION_DELAY_MS (1280ms) beat. NOT a pacing delay; not the old Android 2000ms.
export const DEFAULT_TIME_BUDGET_MS = 700;
