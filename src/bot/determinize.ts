// Determinization of hidden cards from the perspective of the SIDE TO MOVE (seat-aware).
// Port of MonteCarloAi.randomizeHiddenCards / ...Biased / ...Human. Mutates the (already-cloned)
// sim state. In production the bot is the `ai` seat and decides on its own turn, so self === ai
// (identical to the Java production sampler); seat-awareness additionally lets a bot play the
// `player` seat (the E3 mirror). FAIRNESS INVARIANT: the opponent hand, deck, and BOTH players'
// face-downs go into the unknown pool — a bot never sees true face-down values (even its own).

import type { Rules } from '../engine/rules';
import type { Card } from '../engine/cards';
import type { GameState, PlayerState } from '../engine/state';
import type { RNG } from '../engine/rng';
import { shuffleInPlace } from '../engine/rng';
import type { BotConfig } from './config';

function seats(s: GameState): { self: PlayerState; opp: PlayerState } {
  return s.playerTurn ? { self: s.player, opp: s.ai } : { self: s.ai, opp: s.player };
}

export function determinize(rules: Rules, s: GameState, config: BotConfig, rng: RNG): void {
  if (config.enableDeductiveBelief && config.humanMemory) { human(rules, s, config, rng); return; }
  if (config.enableDeductiveBelief && config.belief) { biased(s, config, rng); return; }
  uniform(s, rng);
}

function uniform(s: GameState, rng: RNG): void {
  const { self, opp } = seats(s);
  const unknown = [...opp.hand, ...s.stockDeck, ...opp.faceDown, ...self.faceDown];
  shuffleInPlace(unknown, rng);
  const oppHand = opp.hand.length, oppFD = opp.faceDown.length, selfFD = self.faceDown.length;
  opp.hand = unknown.splice(0, oppHand);
  opp.faceDown = unknown.splice(0, oppFD);
  self.faceDown = unknown.splice(0, selfFD);
  s.stockDeck = unknown;
}

function biased(s: GameState, config: BotConfig, rng: RNG): void {
  const belief = config.belief!;
  const { self, opp } = seats(s);
  const pinned: Card[] = [];
  const hidden: Card[] = [];
  for (const c of opp.hand) (belief.isPinned(c.code) ? pinned : hidden).push(c);
  const unknown = [...hidden, ...s.stockDeck, ...opp.faceDown, ...self.faceDown];
  shuffleInPlace(unknown, rng);
  const oppSize = opp.hand.length, oppFD = opp.faceDown.length, selfFD = self.faceDown.length;
  opp.hand = [...pinned, ...belief.fillNonContradicting(unknown, oppSize - pinned.length)];
  opp.faceDown = unknown.splice(0, oppFD);
  self.faceDown = unknown.splice(0, selfFD);
  s.stockDeck = unknown;
}

function human(_rules: Rules, s: GameState, config: BotConfig, rng: RNG): void {
  const mem = config.humanMemory!;
  const { self, opp } = seats(s);
  const exact = mem.exactCodes();
  const demands = mem.bucketDemands();
  const pinned: Card[] = [];
  const hidden: Card[] = [];
  for (const c of opp.hand) (exact.has(c.code) ? pinned : hidden).push(c);
  const unknown = [...hidden, ...s.stockDeck, ...opp.faceDown, ...self.faceDown];
  shuffleInPlace(unknown, rng);
  const oppSize = opp.hand.length, oppFD = opp.faceDown.length, selfFD = self.faceDown.length;

  const newOpp: Card[] = [...pinned];
  for (const b of demands) {
    if (newOpp.length >= oppSize) break;
    const idx = unknown.findIndex((c) => mem.bucketOf(c) === b);
    if (idx >= 0) newOpp.push(unknown.splice(idx, 1)[0]!);
  }
  while (newOpp.length < oppSize && unknown.length > 0) newOpp.push(unknown.shift()!);
  opp.hand = newOpp;
  opp.faceDown = unknown.splice(0, oppFD);
  self.faceDown = unknown.splice(0, selfFD);
  s.stockDeck = unknown;
}
