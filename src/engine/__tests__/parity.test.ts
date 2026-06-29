// Parity replay suite. Loads every Java-exported golden vector and asserts the TS engine
// reproduces it: deal, setup, legal-move generation, validateMove legality, and the full
// per-move state trajectory. The golden vectors (web/test/golden/*.json) are the source of
// truth; regenerate them with the GoldenVectorExportTest harness (see web/README.md).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createRules } from '../rules';
import type { GameState } from '../state';
import { applyMove, dealFromDeck, confirmSetup } from '../engine';
import { getLegalMoves, validateMove, type Move } from '../moves';
import {
  parseState, parseMove, parseActions, parseCard,
  type GameStateJson, type MoveJson, type CardJson,
} from '../serialize';

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), '../../../test/golden');

interface Vector {
  id: string;
  type: 'trajectory' | 'deal' | 'setup';
  description: string;
  specialActions: Record<string, string>;
  initialDeck?: CardJson[];
  initialState: GameStateJson;
  initialLegalMoves?: MoveJson[];
  legalMoves?: MoveJson[];
  validateProbes?: { cards: CardJson[]; legal: boolean }[];
  chosen?: CardJson[];
  expected?: GameStateJson;
  steps: { move: MoveJson; state: GameStateJson; legalMoves: MoveJson[] }[];
}

function loadVectors(): Vector[] {
  return readdirSync(goldenDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(goldenDir, f), 'utf8')) as Vector);
}

// --- comparison helpers ---
const codeSeq = (cs: { code: string }[]): string[] => cs.map((c) => c.code);
const codeMultiset = (cs: { code: string }[]): string[] => cs.map((c) => c.code).sort();
const FLAGS = [
  'lastMoveWasSkip', 'lastMoveWasJoker', 'jokerTookCards',
  'isPendingBurn', 'aiLockedInPickup', 'playerLockedInPickup',
] as const;

function expectStateEqual(actual: GameState, expected: GameState, ctx: string): void {
  expect(actual.phase, `${ctx}: phase`).toBe(expected.phase);
  expect(actual.winner, `${ctx}: winner`).toBe(expected.winner);
  expect(actual.playerTurn, `${ctx}: playerTurn`).toBe(expected.playerTurn);
  for (const f of FLAGS) expect(actual[f], `${ctx}: ${f}`).toBe(expected[f]);
  // Pile + deck are order-significant (effective top, draw order).
  expect(codeSeq(actual.discardPile), `${ctx}: discardPile`).toEqual(codeSeq(expected.discardPile));
  expect(codeSeq(actual.stockDeck), `${ctx}: stockDeck`).toEqual(codeSeq(expected.stockDeck));
  // Zones compared as multisets (content parity, independent of sort-tie order).
  for (const who of ['player', 'ai'] as const) {
    for (const z of ['hand', 'faceUp', 'faceDown'] as const) {
      expect(codeMultiset(actual[who][z]), `${ctx}: ${who}.${z}`).toEqual(codeMultiset(expected[who][z]));
    }
  }
}

function moveSig(m: Move): string {
  if (m.kind === 'PLAY') return 'P:' + m.cards.map((c) => c.code).sort().join(',');
  if (m.kind === 'PLAY_FACE_DOWN') return 'F:' + m.index;
  return 'T';
}
function legalSet(moves: Move[]): Set<string> {
  return new Set(moves.map(moveSig));
}

describe('golden-vector parity (Java -> TS)', () => {
  const vectors = loadVectors();

  it('loads the golden vectors', () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  for (const v of vectors) {
    describe(`${v.id} — ${v.description}`, () => {
      const rules = createRules(parseActions(v.specialActions));
      const initial = parseState(v.initialState);

      if (v.type === 'deal') {
        it('dealFromDeck reproduces the dealt SETUP state', () => {
          const deck = v.initialDeck!.map(parseCard);
          expectStateEqual(dealFromDeck(rules, deck), initial, 'deal');
        });
        return;
      }

      if (v.type === 'setup') {
        it('confirmSetup reproduces the PLAYING state', () => {
          const chosen = v.chosen!.map(parseCard);
          const expected = parseState(v.expected!);
          expectStateEqual(confirmSetup(rules, initial, chosen), expected, 'setup');
        });
        return;
      }

      if (v.initialLegalMoves) {
        it('getLegalMoves matches at the initial state', () => {
          const want = legalSet(v.initialLegalMoves!.map(parseMove));
          expect(legalSet(getLegalMoves(rules, initial))).toEqual(want);
        });
      }

      if (v.validateProbes) {
        it('validateMove matches every legality probe', () => {
          for (const p of v.validateProbes!) {
            const cards = p.cards.map(parseCard);
            expect(validateMove(rules, initial, cards), `probe ${cards.map((c) => c.code).join('+')}`)
              .toBe(p.legal);
          }
        });
      }

      if (v.steps.length > 0) {
        it('replays the move trajectory with matching snapshots', () => {
          let state = initial;
          v.steps.forEach((step, i) => {
            state = applyMove(rules, state, parseMove(step.move));
            expectStateEqual(state, parseState(step.state), `step ${i}`);
            expect(legalSet(getLegalMoves(rules, state)), `step ${i}: legalMoves`)
              .toEqual(legalSet(step.legalMoves.map(parseMove)));
          });
        });
      }
    });
  }
});
