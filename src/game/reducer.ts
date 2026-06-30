// Pure UI reducer wrapping the engine. GameState is the source of truth; side effects (Worker,
// timers, effect-resolve sequencing) live in App, never here.
import type { Card } from '../engine/cards';
import { buildDeck } from '../engine/cards';
import { mulberry32, shuffleInPlace } from '../engine/rng';
import type { GameState } from '../engine/state';
import { dealFromDeck, confirmSetup, applyMove } from '../engine/engine';
import type { Move } from '../engine/moves';
import { rules } from './gameConfig';
import { randomSeed } from './botRng';
import { T } from '../ui/strings';

export interface Reveal { seat: 'player' | 'ai'; index: number; card: Card; willPlay: boolean; }
export interface FaceUpSlots { player: string[]; ai: string[]; } // fixed slot order (#3), frozen per game
export interface UiState {
  selected: string[];
  thinking: boolean;
  reveal: Reveal | null;
  effectPreview: GameState | null; // #2: Frame-1 synthetic state the engine produced (refilled hand, decremented deck, card on the pre-burn pile)
  faceUpSlots: FaceUpSlots | null; // #3: each face-up card pinned to its setup slot (no hole-filling)
  lastAction: string;
  decisionMs: number[];
}
export interface GameUiState { engine: GameState; ui: UiState; }

export type Action =
  | { type: 'NEW_GAME' }
  | { type: 'TOGGLE_SELECT'; code: string }
  | { type: 'CONFIRM_SETUP' }
  | { type: 'APPLY'; move: Move }
  | { type: 'BEGIN_REVEAL'; seat: 'player' | 'ai'; index: number }
  | { type: 'BEGIN_EFFECT'; frame1: GameState }
  | { type: 'RECORD_MS'; ms: number }
  | { type: 'SET_THINKING'; value: boolean };

function freshUi(lastAction: string, decisionMs: number[] = []): UiState {
  return { selected: [], thinking: false, reveal: null, effectPreview: null, faceUpSlots: null, lastAction, decisionMs };
}

function dealNew(): GameState {
  const deck = buildDeck();
  shuffleInPlace(deck, mulberry32(randomSeed()));
  return dealFromDeck(rules, deck);
}

function selectable(s: GameState): Card[] { return [...s.player.hand, ...s.player.faceUp]; }
function cardsByCodes(s: GameState, codes: string[]): Card[] {
  const pool = selectable(s);
  return codes.map((c) => pool.find((x) => x.code === c)).filter((x): x is Card => !!x);
}

function describe(move: Move, before: GameState): string {
  const mover = before.playerTurn ? T.you : T.opponent;
  if (move.kind === 'TAKE_PILE') return `${mover} לקח/ת את ה${T.discard}`;
  if (move.kind === 'PLAY_FACE_DOWN') return `${mover}: קלף נסתר`;
  const rank = rules.getRankName(move.cards[0]!.rank);
  return `${mover} שיחק/ה ${move.cards.length}× ${rank}`;
}

export function initialState(): GameUiState {
  return { engine: dealNew(), ui: freshUi(T.chooseFaceUp) };
}

export function reducer(state: GameUiState, action: Action): GameUiState {
  const { engine, ui } = state;
  switch (action.type) {
    case 'NEW_GAME':
      return { engine: dealNew(), ui: freshUi(T.chooseFaceUp) };

    case 'TOGGLE_SELECT': {
      const setup = engine.phase === 'SETUP_CHOOSE_FACEUP';
      const pool = setup ? engine.player.hand : selectable(engine);
      const card = pool.find((c) => c.code === action.code);
      if (!card) return state;
      let selected: string[];
      if (ui.selected.includes(action.code)) {
        selected = ui.selected.filter((c) => c !== action.code);
      } else if (setup) {
        selected = ui.selected.length >= 3 ? ui.selected : [...ui.selected, action.code];
      } else {
        const curRank = ui.selected.length ? pool.find((c) => c.code === ui.selected[0])?.rank : undefined;
        selected = curRank && curRank !== card.rank ? [action.code] : [...ui.selected, action.code];
      }
      return { engine, ui: { ...ui, selected } };
    }

    case 'CONFIRM_SETUP': {
      const chosen = cardsByCodes(engine, ui.selected);
      if (chosen.length !== 3) return state;
      const next = confirmSetup(rules, engine, chosen);
      const slots: FaceUpSlots = { player: chosen.map((c) => c.code), ai: next.ai.faceUp.map((c) => c.code) };
      return { engine: next, ui: { ...freshUi(T.yourTurn, ui.decisionMs), faceUpSlots: slots } };
    }

    case 'APPLY': {
      const next = applyMove(rules, engine, action.move);
      // Persist the human's selection across non-player phases (bot turn, burn/joker effect delays)
      // instead of blanket-clearing it. Reconcile by stable card CODE against the ACTUAL post-move
      // pool: drop any selected card no longer in hand/faceUp (just-played cards, or any that left).
      // Identity-based, so the atomic refill can never leave a selection pointing at a different card.
      const pool = new Set([...next.player.hand, ...next.player.faceUp].map((c) => c.code));
      const selected = ui.selected.filter((code) => pool.has(code));
      return {
        engine: next,
        ui: { ...ui, selected, reveal: null, effectPreview: null, lastAction: describe(action.move, engine) },
      };
    }

    case 'BEGIN_REVEAL': {
      const p = action.seat === 'player' ? engine.player : engine.ai;
      const card = p.faceDown[action.index];
      if (!card) return state;
      return { engine, ui: { ...ui, reveal: { seat: action.seat, index: action.index, card, willPlay: rules.canPlay(card, engine.discardPile) } } };
    }

    case 'BEGIN_EFFECT':
      return { engine, ui: { ...ui, effectPreview: action.frame1 } };

    case 'RECORD_MS':
      return { engine, ui: { ...ui, decisionMs: [...ui.decisionMs, action.ms] } };

    case 'SET_THINKING':
      return { engine, ui: { ...ui, thinking: action.value } };

    default:
      return state;
  }
}
