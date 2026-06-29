// Determinized Monte-Carlo searcher — port of GameEngine.MonteCarloAi.decideMove.
// Reuses the Phase-1 engine's getLegalMoves (candidate source) and applyMove (transition);
// it does NOT fork engine rules. All randomness via the injected RNG; the wall-clock budget
// uses the injected clock. The bot plays the `ai` seat (state.playerTurn === false on its turn).

import type { Rules } from '../engine/rules';
import type { GameState, Winner } from '../engine/state';
import { cloneState } from '../engine/state';
import { getLegalMoves, type Move } from '../engine/moves';
import { applyMove, isGameOver } from '../engine/engine';
import type { RNG } from '../engine/rng';
import { type BotConfig, type Clock, systemClock } from './config';
import { determinize } from './determinize';

const randInt = (rng: RNG, n: number): number => Math.floor(rng.next() * n);

// Diagnostic instrumentation (zero cost in normal use). Tracks the longest rollout seen so a
// test can assert no rollout exceeds ROLLOUT_DEPTH (hard-cap sanity).
export const __botStats = { maxRolloutLen: 0, reset(): void { this.maxRolloutLen = 0; } };

export function decideMove(
  rules: Rules, state: GameState, config: BotConfig, rng: RNG, clock: Clock = systemClock,
): Move {
  const legal = getLegalMoves(rules, state);
  if (legal.length === 0) return { kind: 'TAKE_PILE' }; // forced pickup, no choice

  const hasRealPlay = legal.some((m) => m.kind === 'PLAY');
  const candidates: Move[] = [...legal];
  if (config.enableVoluntaryPickup && hasRealPlay && state.discardPile.length > 0) {
    candidates.push({ kind: 'TAKE_PILE' }); // GAP-2 root pickup (appended last => loses ties)
  }
  if (candidates.length === 1) return candidates[0]!;

  const mySeat: Winner = state.playerTurn ? 'PLAYER' : 'AI'; // count wins for the DECIDING seat
  const n = candidates.length;
  const wins = new Array<number>(n).fill(0);
  const deadline = clock.now() + config.timeBudgetMs;
  for (let r = 0; r < config.simulationCount; r++) {
    for (let mi = 0; mi < n; mi++) {
      const clone = cloneState(state);
      determinize(rules, clone, config, rng);
      const afterMove = applyMove(rules, clone, candidates[mi]!);
      if (simulateRandomGame(rules, afterMove, config, rng) === mySeat) wins[mi]!++;
    }
    if (clock.now() >= deadline) break;
  }

  let best = 0;
  for (let mi = 1; mi < n; mi++) if (wins[mi]! > wins[best]!) best = mi; // strict > favors earlier
  return candidates[best]!;
}

function simulateRandomGame(rules: Rules, start: GameState, config: BotConfig, rng: RNG): Winner {
  let state = start;
  let steps = 0;
  while (!isGameOver(state) && steps < config.rolloutDepth) {
    steps++;
    const moves = getLegalMoves(rules, state);
    state = moves.length === 0
      ? applyMove(rules, state, { kind: 'TAKE_PILE' })
      : applyMove(rules, state, chooseRolloutMove(rules, state, moves, config, rng));
  }
  if (steps > __botStats.maxRolloutLen) __botStats.maxRolloutLen = steps;
  // Hard-cap sanity: a rollout can never exceed ROLLOUT_DEPTH plies.
  if (steps > config.rolloutDepth) throw new Error(`rollout exceeded depth ${config.rolloutDepth}: ${steps}`);
  return state.winner;
}

// Heuristic rollout policy: cheapest legal rank (prefer playing all copies), epsilon random.
function chooseRolloutMove(rules: Rules, _state: GameState, moves: Move[], config: BotConfig, rng: RNG): Move {
  if (moves.length === 1 || randInt(rng, 100) < config.epsilonPercent) {
    return moves[randInt(rng, moves.length)]!;
  }
  let best: Move | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const m of moves) {
    if (m.kind !== 'PLAY' || m.cards.length === 0) return moves[randInt(rng, moves.length)]!; // face-down: random
    const score = rules.getPower(m.cards[0]!.rank) * 8 - m.cards.length;
    if (score < bestScore) { bestScore = score; best = m; }
  }
  return best!;
}
