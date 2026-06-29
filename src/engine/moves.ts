// Move type + legal-move generation and validation.
//
// validateMove  — the ground-truth predicate (port of GameEngine.validateMove);
//                 accepts an arbitrary same-rank set across the legal zones.
// getLegalMoves — the canonical generator (mirrors the production
//                 MonteCarloAi.getLegalMoves: per playable rank, a single card and
//                 the all-copies set from the current zone; blind face-down moves
//                 when hand+faceUp are empty). Does NOT include voluntary TAKE_PILE
//                 or cross-zone combos (matching the Java generator exactly).

import type { Card, Rank } from './cards';
import type { Rules } from './rules';
import type { GameState } from './state';
import { currentActor, containsCode } from './state';

export type Move =
  | { kind: 'PLAY'; cards: Card[] }
  | { kind: 'PLAY_FACE_DOWN'; index: number }
  | { kind: 'TAKE_PILE' };

// Port of GameEngine.validateMove, generalized to the seat to move.
export function validateMove(rules: Rules, state: GameState, cards: readonly Card[]): boolean {
  if (cards.length === 0) return false;
  const rank: Rank = cards[0]!.rank;
  for (const c of cards) if (c.rank !== rank) return false;
  if (!rules.canPlay(cards[0]!, state.discardPile)) return false;

  const p = currentActor(state);
  let fromHand = false;
  let fromFaceUp = false;
  for (const c of cards) {
    if (containsCode(p.hand, c.code)) fromHand = true;
    else if (containsCode(p.faceUp, c.code)) fromFaceUp = true;
    else return false;
  }

  if (fromHand && fromFaceUp) {
    if (state.stockDeck.length > 0) return false;
    for (const h of p.hand) if (h.rank !== rank) return false;
  } else if (fromFaceUp) {
    if (p.hand.length > 0) return false;
  }
  return true;
}

// Mirrors MonteCarloAi.getLegalMoves for the seat to move.
export function getLegalMoves(rules: Rules, state: GameState): Move[] {
  const p = currentActor(state);
  const moves: Move[] = [];
  const source: Card[] = p.hand.length > 0 ? p.hand : p.faceUp;

  if (source.length === 0) {
    if (p.faceDown.length > 0) {
      for (let i = 0; i < p.faceDown.length; i++) moves.push({ kind: 'PLAY_FACE_DOWN', index: i });
    }
    return moves; // empty source & no face-down => forced pickup (no generated moves)
  }

  const seen = new Set<Rank>();
  for (const c of source) {
    if (seen.has(c.rank)) continue;
    if (rules.canPlay(c, state.discardPile)) {
      moves.push({ kind: 'PLAY', cards: [c] });
      const copies = source.filter((x) => x.rank === c.rank);
      if (copies.length > 1) moves.push({ kind: 'PLAY', cards: copies });
      seen.add(c.rank);
    }
  }
  return moves;
}
