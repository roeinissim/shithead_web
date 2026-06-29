// Core engine — faithful port of GameEngine's rule application.
//
// applyMove() implements the *fully-resolved* transition used by the working
// full-game driver (GameEngine.applySimulationDecision): turn-aware, auto-resolves
// a pending burn at entry and exit, and resolves an invalid face-down flip to an
// immediate pickup. Every returned state is fully resolved (isPendingBurn === false).
// The UI-deferred two-phase flags are a Step-3 concern (see PORT_NOTES section 4.3).

import type { Card } from './cards';
import type { Rules } from './rules';
import type { RNG } from './rng';
import { shuffleInPlace } from './rng';
import type { GameState, PlayerState } from './state';
import {
  cloneState, emptyPlayer, isFinished, sortHand, removeByCode,
} from './state';
import type { Move } from './moves';

function freshFlags() {
  return {
    lastMoveWasSkip: false,
    lastMoveWasJoker: false,
    jokerTookCards: false,
    isPendingBurn: false,
    aiLockedInPickup: false,
    playerLockedInPickup: false,
  };
}

// GameEngine.newGame — shuffle (via injected RNG) then deal. Use dealFromDeck for a
// deterministic, explicit-order deal (parity / reproducible games).
export function newGame(rules: Rules, fullDeck: readonly Card[], rng: RNG): GameState {
  const deck = [...fullDeck];
  shuffleInPlace(deck, rng);
  return dealFromDeck(rules, deck);
}

// Deterministic deal from an explicit deck order (no shuffle). Mirrors GameEngine.newGame's
// deal + setupAiFaceUp exactly: 3 face-down each, 6 hand each, sort player hand, AI sets
// aside its 3 highest-power cards face-up. Result is the SETUP_CHOOSE_FACEUP state.
export function dealFromDeck(rules: Rules, fullDeck: readonly Card[]): GameState {
  const deck = [...fullDeck];
  const player = emptyPlayer();
  const ai = emptyPlayer();
  for (let i = 0; i < 3; i++) player.faceDown.push(deck.shift()!);
  for (let i = 0; i < 3; i++) ai.faceDown.push(deck.shift()!);
  for (let i = 0; i < 6; i++) player.hand.push(deck.shift()!);
  for (let i = 0; i < 6; i++) ai.hand.push(deck.shift()!);

  sortHand(rules, player.hand);

  // setupAiFaceUp: sort ascending, move the 3 highest-power cards to faceUp.
  ai.hand.sort((a, b) => rules.getPower(a.rank) - rules.getPower(b.rank));
  for (let i = 0; i < 3; i++) {
    if (ai.hand.length > 0) ai.faceUp.push(ai.hand.pop()!);
  }

  return {
    phase: 'SETUP_CHOOSE_FACEUP',
    winner: 'NONE',
    playerTurn: true,
    stockDeck: deck,
    discardPile: [],
    player,
    ai,
    ...freshFlags(),
  };
}

// GameEngine.confirmSetup — human picks 3 face-up from (hand + any dealt face-up).
export function confirmSetup(rules: Rules, state: GameState, chosen: readonly Card[]): GameState {
  const s = cloneState(state);
  if (chosen.length !== 3) return s;
  s.player.hand.push(...s.player.faceUp);
  s.player.faceUp = [];
  for (const c of chosen) {
    const found = s.player.hand.find((h) => h.code === c.code);
    if (found) {
      removeByCode(s.player.hand, found.code);
      s.player.faceUp.push(found);
    }
  }
  sortHand(rules, s.player.hand);
  s.phase = 'PLAYING';
  return s;
}

// ---- internal mutators (operate in place on the working clone) ----

function opponentOf(s: GameState, actor: PlayerState): PlayerState {
  return actor === s.player ? s.ai : s.player;
}

function endTurn(s: GameState): void {
  s.playerTurn = !s.playerTurn;
}

function refillHand(rules: Rules, s: GameState, p: PlayerState): void {
  let added = false;
  while (p.hand.length < 3 && s.stockDeck.length > 0) {
    p.hand.push(s.stockDeck.shift()!);
    added = true;
  }
  if (added) sortHand(rules, p.hand);
}

function takePile(rules: Rules, s: GameState, p: PlayerState): void {
  p.hand.push(...s.discardPile);
  s.discardPile = [];
  s.lastMoveWasJoker = false;
  sortHand(rules, p.hand);
}

function executePendingBurn(rules: Rules, s: GameState): void {
  s.discardPile = [];
  s.isPendingBurn = false;
  const p = s.playerTurn ? s.player : s.ai;
  refillHand(rules, s, p);
}

function checkWinCondition(s: GameState): void {
  if (s.aiLockedInPickup) return;
  if (s.stockDeck.length === 0 && isFinished(s.player)) {
    s.winner = 'PLAYER';
    s.phase = 'GAME_OVER';
  } else if (s.stockDeck.length === 0 && isFinished(s.ai)) {
    s.winner = 'AI';
    s.phase = 'GAME_OVER';
  }
}

// GameEngine.performMove
function performMove(rules: Rules, s: GameState, actor: PlayerState, cards: Card[]): void {
  for (const c of cards) {
    removeByCode(actor.hand, c.code);
    removeByCode(actor.faceUp, c.code);
  }

  let act = rules.getCardAction(cards[0]!.rank);
  if (rules.isJoker(cards[0]!.rank)) act = 'JOKER';

  s.lastMoveWasJoker = act === 'JOKER';
  s.jokerTookCards = false;

  // JOKER — transfer the pile to the opponent's hand; the joker itself leaves the game.
  if (act === 'JOKER') {
    if (s.discardPile.length > 0) {
      const opp = opponentOf(s, actor);
      opp.hand.push(...s.discardPile);
      sortHand(rules, opp.hand);
      s.jokerTookCards = true;
    } else {
      s.jokerTookCards = false;
    }
    s.discardPile = [];
    refillHand(rules, s, actor);
    return; // turn does NOT switch
  }

  // Normal play
  s.discardPile.push(...cards);

  let burnedByFour = false;
  if (s.discardPile.length >= 4) {
    const lastRank = s.discardPile[s.discardPile.length - 1]!.rank;
    let fourSame = true;
    for (let i = 1; i <= 4; i++) {
      if (s.discardPile[s.discardPile.length - i]!.rank !== lastRank) fourSame = false;
    }
    if (fourSame) burnedByFour = true;
  }
  const burnedByTen = act === 'BURN';

  if (burnedByFour || burnedByTen) {
    refillHand(rules, s, actor); // GameEngine.burnPile refills the mover
    s.isPendingBurn = true;
    return; // turn does NOT switch; pile cleared later by executePendingBurn
  }

  refillHand(rules, s, actor);

  if (act === 'SKIP') {
    s.lastMoveWasSkip = true;
    return; // turn does NOT switch (opponent skipped)
  }
  s.lastMoveWasSkip = false;
  endTurn(s);
}

// GameEngine.applyDecision (simulation path: invalid face-down resolves to immediate pickup).
function applyDecision(rules: Rules, s: GameState, actor: PlayerState, move: Move): void {
  if (s.phase !== 'PLAYING') return;

  if (move.kind === 'PLAY') {
    if (move.cards.length > 0) performMove(rules, s, actor, move.cards);
  } else if (move.kind === 'PLAY_FACE_DOWN') {
    const idx = move.index;
    if (idx >= 0 && idx < actor.faceDown.length) {
      const c = actor.faceDown[idx]!;
      if (rules.canPlay(c, s.discardPile)) {
        actor.faceDown.splice(idx, 1);
        performMove(rules, s, actor, [c]);
      } else {
        actor.faceDown.splice(idx, 1);
        s.discardPile.push(c);
        takePile(rules, s, actor); // simulation path
        endTurn(s);
      }
    }
  } else {
    // TAKE_PILE
    takePile(rules, s, actor);
    s.aiLockedInPickup = false;
    endTurn(s);
  }

  checkWinCondition(s);
}

// GameEngine.applySimulationDecision — the canonical Step-1 transition. Pure: clones input.
export function applyMove(rules: Rules, state: GameState, move: Move): GameState {
  const s = cloneState(state);
  if (s.isPendingBurn) executePendingBurn(rules, s);
  const actor = s.playerTurn ? s.player : s.ai;
  applyDecision(rules, s, actor, move);
  if (s.isPendingBurn) executePendingBurn(rules, s);
  return s;
}

export function isGameOver(s: GameState): boolean {
  return s.phase === 'GAME_OVER';
}
