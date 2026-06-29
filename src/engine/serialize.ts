// Canonical JSON (de)serialization — the contract shared with the Java golden-vector
// exporter. Cards => {code,suit,rank}; GameState/Move as in PORT_NOTES section 7.

import type { Card, Suit, Rank } from './cards';
import type { GameState, PlayerState, Phase, Winner } from './state';
import type { Move } from './moves';
import type { SpecialAction, SpecialActionMap } from './rules';

export interface CardJson { code: string; suit: string; rank: string; }
export interface PlayerJson { hand: CardJson[]; faceUp: CardJson[]; faceDown: CardJson[]; }
export interface GameStateJson {
  phase: string;
  winner: string;
  playerTurn: boolean;
  stockDeck: CardJson[];
  discardPile: CardJson[];
  player: PlayerJson;
  ai: PlayerJson;
  lastMoveWasSkip: boolean;
  lastMoveWasJoker: boolean;
  jokerTookCards: boolean;
  isPendingBurn: boolean;
  aiLockedInPickup: boolean;
  playerLockedInPickup: boolean;
}
export type MoveJson =
  | { kind: 'PLAY'; cards: CardJson[] }
  | { kind: 'PLAY_FACE_DOWN'; index: number }
  | { kind: 'TAKE_PILE' };

export function parseCard(j: CardJson): Card {
  return { code: j.code, suit: j.suit as Suit, rank: j.rank as Rank };
}
function parseCards(arr: CardJson[]): Card[] { return arr.map(parseCard); }
function parsePlayer(j: PlayerJson): PlayerState {
  return { hand: parseCards(j.hand), faceUp: parseCards(j.faceUp), faceDown: parseCards(j.faceDown) };
}

export function parseState(j: GameStateJson): GameState {
  return {
    phase: j.phase as Phase,
    winner: j.winner as Winner,
    playerTurn: j.playerTurn,
    stockDeck: parseCards(j.stockDeck),
    discardPile: parseCards(j.discardPile),
    player: parsePlayer(j.player),
    ai: parsePlayer(j.ai),
    lastMoveWasSkip: j.lastMoveWasSkip,
    lastMoveWasJoker: j.lastMoveWasJoker,
    jokerTookCards: j.jokerTookCards,
    isPendingBurn: j.isPendingBurn,
    aiLockedInPickup: j.aiLockedInPickup,
    playerLockedInPickup: j.playerLockedInPickup,
  };
}

export function parseMove(j: MoveJson): Move {
  if (j.kind === 'PLAY') return { kind: 'PLAY', cards: parseCards(j.cards) };
  if (j.kind === 'PLAY_FACE_DOWN') return { kind: 'PLAY_FACE_DOWN', index: j.index };
  return { kind: 'TAKE_PILE' };
}

export function parseActions(j: Record<string, string>): SpecialActionMap {
  const map: SpecialActionMap = {};
  for (const [k, v] of Object.entries(j)) map[k as Rank] = v as SpecialAction;
  return map;
}

// ---- serializers (TS -> canonical JSON). Mirror of the parse* above; the parse* stay the
// parity-tested contract. Explicit (not structural-identity) so a future non-clone-friendly
// GameState field can't silently break the Worker round-trip.
export function toCardJson(c: Card): CardJson { return { code: c.code, suit: c.suit, rank: c.rank }; }
const cardsJson = (cs: readonly Card[]): CardJson[] => cs.map(toCardJson);
const playerJson = (p: PlayerState): PlayerJson => ({ hand: cardsJson(p.hand), faceUp: cardsJson(p.faceUp), faceDown: cardsJson(p.faceDown) });

export function toStateJson(s: GameState): GameStateJson {
  return {
    phase: s.phase, winner: s.winner, playerTurn: s.playerTurn,
    stockDeck: cardsJson(s.stockDeck), discardPile: cardsJson(s.discardPile),
    player: playerJson(s.player), ai: playerJson(s.ai),
    lastMoveWasSkip: s.lastMoveWasSkip, lastMoveWasJoker: s.lastMoveWasJoker,
    jokerTookCards: s.jokerTookCards, isPendingBurn: s.isPendingBurn,
    aiLockedInPickup: s.aiLockedInPickup, playerLockedInPickup: s.playerLockedInPickup,
  };
}
export function toMoveJson(m: Move): MoveJson {
  if (m.kind === 'PLAY') return { kind: 'PLAY', cards: cardsJson(m.cards) };
  if (m.kind === 'PLAY_FACE_DOWN') return { kind: 'PLAY_FACE_DOWN', index: m.index };
  return { kind: 'TAKE_PILE' };
}
export function toActionsJson(a: SpecialActionMap): Record<string, string> {
  const o: Record<string, string> = {};
  for (const k of Object.keys(a) as Rank[]) { const v = a[k]; if (v) o[k] = v; }
  return o;
}
