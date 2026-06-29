// Game state types + small pure helpers — port of GameEngine's state fields
// and GameEngine.PlayerState. UI/bookkeeping fields (pileVersion, lastMoveCount,
// Stats) are intentionally excluded (not engine semantics — see PORT_NOTES §7).

import type { Card } from './cards';
import type { Rules } from './rules';

export type Phase = 'SETUP_CHOOSE_FACEUP' | 'PLAYING' | 'GAME_OVER';
export type Winner = 'NONE' | 'PLAYER' | 'AI';

export interface PlayerState {
  hand: Card[];
  faceUp: Card[];
  faceDown: Card[];
}

export interface GameState {
  phase: Phase;
  winner: Winner;
  playerTurn: boolean;
  stockDeck: Card[];   // קופה  — drawn from the FRONT
  discardPile: Card[]; // ערימה — top = last element
  player: PlayerState;
  ai: PlayerState;
  // Flags (the deferred-pickup/burn ones are surfaced for completeness but stay
  // false under the Step-1 auto-resolving transition; they are a Step-3 UI concern).
  lastMoveWasSkip: boolean;
  lastMoveWasJoker: boolean;
  jokerTookCards: boolean;
  isPendingBurn: boolean;
  aiLockedInPickup: boolean;
  playerLockedInPickup: boolean;
}

export function emptyPlayer(): PlayerState {
  return { hand: [], faceUp: [], faceDown: [] };
}

export function clonePlayer(p: PlayerState): PlayerState {
  return { hand: [...p.hand], faceUp: [...p.faceUp], faceDown: [...p.faceDown] };
}

export function cloneState(s: GameState): GameState {
  return {
    phase: s.phase,
    winner: s.winner,
    playerTurn: s.playerTurn,
    stockDeck: [...s.stockDeck],
    discardPile: [...s.discardPile],
    player: clonePlayer(s.player),
    ai: clonePlayer(s.ai),
    lastMoveWasSkip: s.lastMoveWasSkip,
    lastMoveWasJoker: s.lastMoveWasJoker,
    jokerTookCards: s.jokerTookCards,
    isPendingBurn: s.isPendingBurn,
    aiLockedInPickup: s.aiLockedInPickup,
    playerLockedInPickup: s.playerLockedInPickup,
  };
}

// GameEngine.PlayerState.isFinished
export function isFinished(p: PlayerState): boolean {
  return p.hand.length === 0 && p.faceUp.length === 0 && p.faceDown.length === 0;
}

// The seat whose turn it is (Java: playerTurn ? player : ai).
export function currentActor(s: GameState): PlayerState {
  return s.playerTurn ? s.player : s.ai;
}

// GameEngine.sortHand — by power ascending (stable). Mutates the array in place.
export function sortHand(rules: Rules, hand: Card[]): void {
  hand.sort((a, b) => rules.getPower(a.rank) - rules.getPower(b.rank));
}

export function removeByCode(list: Card[], code: string): void {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]!.code === code) list.splice(i, 1);
  }
}

export function containsCode(list: readonly Card[], code: string): boolean {
  return list.some((c) => c.code === code);
}
