// Shared game driver for the statistical harness. Bot plays the `ai` seat. All randomness
// (deal shuffle + bot) flows through seeded mulberry32 streams so games are reproducible.

import type { Rules } from '../../engine/rules';
import { createRules } from '../../engine/rules';
import { buildDeck } from '../../engine/cards';
import { mulberry32, shuffleInPlace } from '../../engine/rng';
import type { GameState, Winner } from '../../engine/state';
import { dealFromDeck, confirmSetup, applyMove, isGameOver } from '../../engine/engine';
import { getLegalMoves, type Move } from '../../engine/moves';
import { decideMove } from '../montecarlo';
import type { BotConfig } from '../config';
import { BeliefState } from '../beliefState';
import { HumanMemory } from '../humanMemory';

export const rules: Rules = createRules();
const PLY_LIMIT = 2000;

// Greedy opponent: play all copies of the lowest legal rank; blind face-down index 0; else pickup.
export function greedyMove(state: GameState): Move {
  const actor = state.playerTurn ? state.player : state.ai;
  if (actor.hand.length === 0 && actor.faceUp.length === 0) {
    return actor.faceDown.length > 0 ? { kind: 'PLAY_FACE_DOWN', index: 0 } : { kind: 'TAKE_PILE' };
  }
  const active = actor.hand.length > 0 ? actor.hand : actor.faceUp;
  let best = null;
  for (const c of active) {
    if (!rules.canPlay(c, state.discardPile)) continue;
    if (best === null || rules.getPower(c.rank) < rules.getPower(best.rank)) best = c;
  }
  if (best === null) return { kind: 'TAKE_PILE' };
  return { kind: 'PLAY', cards: active.filter((c) => c.rank === best!.rank) };
}

function dealSeeded(seed: number): GameState {
  const deck = buildDeck();
  shuffleInPlace(deck, mulberry32(seed));
  let state = dealFromDeck(rules, deck);
  const chosen = [...state.player.hand].sort((a, b) => rules.getPower(b.rank) - rules.getPower(a.rank)).slice(0, 3);
  return confirmSetup(rules, state, chosen);
}

// Bot (ai) vs greedy (player). Returns the winner.
export function playBotVsGreedy(config: BotConfig, seed: number): Winner {
  const botRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  let state = dealSeeded(seed);
  let plies = 0;
  while (!isGameOver(state) && plies++ < PLY_LIMIT) {
    const move = state.playerTurn ? greedyMove(state) : decideMove(rules, state, config, botRng);
    state = applyMove(rules, state, move);
  }
  return state.winner;
}

// Seat-controlled MC mirror (E3): both seats are MC bots. The ai seat optionally owns a belief,
// fed live from public events (exactly like AiStrengthTest.beliefMirror). Returns the winner.
export function playMirror(aiConfig: BotConfig, playerConfig: BotConfig, seed: number,
                           makeBelief: (() => BeliefState) | null): Winner {
  const aiRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const pRng = mulberry32((seed ^ 0x85ebca6b) >>> 0);
  let state = dealSeeded(seed);
  const belief = makeBelief ? makeBelief() : null;
  const cfg: BotConfig = belief ? { ...aiConfig, enableDeductiveBelief: true, belief } : aiConfig;
  let plies = 0;
  while (!isGameOver(state) && plies++ < PLY_LIMIT) {
    const pileBefore = [...state.discardPile];
    const oppHand = state.player.hand.length;
    const deckSize = state.stockDeck.length;
    const opp = state.playerTurn;
    const move = opp ? decideMove(rules, state, playerConfig, pRng) : decideMove(rules, state, cfg, aiRng);
    state = applyMove(rules, state, move);
    if (belief) {
      if (opp) belief.observeOpponentMove(move, pileBefore, oppHand, deckSize);
      else belief.observeMyMove(move, pileBefore);
      if (!belief.isFair()) throw new Error('BELIEF LEAK: known not subset of public pile history');
    }
  }
  return state.winner;
}

export interface Tally { ai: number; player: number; draws: number; n: number; aiPct: number; }

export function tally(games: Winner[]): Tally {
  let ai = 0, player = 0, draws = 0;
  for (const w of games) { if (w === 'AI') ai++; else if (w === 'PLAYER') player++; else draws++; }
  const n = games.length;
  return { ai, player, draws, n, aiPct: (100 * ai) / n };
}

// SE of a difference of two win-rate proportions (independent), in percentage points.
export function seDiff(a: number, na: number, b: number, nb: number): number {
  const pa = a / na, pb = b / nb;
  return 100 * Math.sqrt((pa * (1 - pa)) / na + (pb * (1 - pb)) / nb);
}

// E5 mirror: the ai seat owns a Phase-2 lossy HumanMemory fed live from public events (exactly
// like AiStrengthTest.humanMemoryMirror). Asserts the no-peek + no-Joker/10 leak invariant each ply.
export function playHumanMirror(aiConfig: BotConfig, playerConfig: BotConfig, seed: number,
                                makeMemory: () => HumanMemory): Winner {
  const aiRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const pRng = mulberry32((seed ^ 0x85ebca6b) >>> 0);
  let state = dealSeeded(seed);
  const mem = makeMemory();
  const cfg: BotConfig = { ...aiConfig, enableDeductiveBelief: true, humanMemory: mem };
  let plies = 0;
  while (!isGameOver(state) && plies++ < PLY_LIMIT) {
    const pileBefore = [...state.discardPile];
    const oppHand = state.player.hand.length;
    const deckSize = state.stockDeck.length;
    const opp = state.playerTurn;
    const move = opp ? decideMove(rules, state, playerConfig, pRng) : decideMove(rules, state, cfg, aiRng);
    state = applyMove(rules, state, move);
    if (opp) mem.observeOpponentMove(move, pileBefore, oppHand, deckSize);
    else mem.observeMyMove(move, pileBefore);
    if (!mem.isFair() || mem.leakDetected) throw new Error('MEMORY LEAK: unseen/Joker/10 remembered');
  }
  return state.winner;
}
