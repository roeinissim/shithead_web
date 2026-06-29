// Belief golden-vector parity — the DETERMINISTIC layer. Replays the Java-exported event
// sequences through the TS BeliefState / HumanMemory and asserts every snapshot is identical.
// (web/test/golden-belief/*.json; regenerate via BeliefVectorExportTest — see README.)

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createRules } from '../../engine/rules';
import { buildDeck, type Rank } from '../../engine/cards';
import { parseCard, parseMove, type CardJson, type MoveJson } from '../../engine/serialize';
import { BeliefState } from '../beliefState';
import { HumanMemory } from '../humanMemory';

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), '../../../test/golden-belief');
const UNIVERSE = buildDeck();

interface EventJson {
  move: MoveJson; pileBefore: CardJson[]; oppHandSizeBefore: number; deckSizeBefore: number; isMyMove: boolean;
}
interface BeliefSnap { pinned: string[]; voidContradicts: string[]; fair: boolean; }
interface HumanSnap { exact: string[]; buckets: string[]; fair: boolean; leak: boolean; }
interface Vector {
  id: string; kind: 'belief' | 'human'; description: string;
  config: Record<string, unknown>; events: EventJson[]; snapshots: (BeliefSnap | HumanSnap)[];
}

function load(): Vector[] {
  return readdirSync(goldenDir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(readFileSync(join(goldenDir, f), 'utf8')) as Vector);
}

const rules = createRules();

function beliefSnap(b: BeliefState): BeliefSnap {
  const pinned: string[] = [];
  const voidContradicts: string[] = [];
  for (const card of UNIVERSE) {
    if (b.isPinned(card.code)) pinned.push(card.code);
    if (b.contradictsVoid(card)) voidContradicts.push(card.code);
  }
  return { pinned: pinned.sort(), voidContradicts: voidContradicts.sort(), fair: b.isFair() };
}

function humanSnap(m: HumanMemory): HumanSnap {
  return { exact: [...m.exactCodes()].sort(), buckets: m.bucketDemands(), fair: m.isFair(), leak: m.leakDetected };
}

describe('belief golden-vector parity (Java -> TS)', () => {
  const vectors = load();
  it('loads belief vectors', () => expect(vectors.length).toBeGreaterThan(0));

  for (const v of vectors) {
    it(`${v.id} — ${v.description}`, () => {
      if (v.kind === 'belief') {
        const b = new BeliefState(rules);
        b.voidEnabled = v.config['voidEnabled'] as boolean;
        const filt = v.config['knownRankFilter'] as string[] | null;
        b.knownRankFilter = filt ? new Set(filt as Rank[]) : null;
        v.events.forEach((e, i) => {
          const move = parseMove(e.move);
          const pile = e.pileBefore.map(parseCard);
          if (e.isMyMove) b.observeMyMove(move, pile);
          else b.observeOpponentMove(move, pile, e.oppHandSizeBefore, e.deckSizeBefore);
          expect(beliefSnap(b), `${v.id} snapshot ${i}`).toEqual(v.snapshots[i]);
        });
      } else {
        const m = new HumanMemory(rules);
        m.memorySpan = v.config['memorySpan'] as number;
        m.sharpSpan = v.config['sharpSpan'] as number;
        m.loadSensitivity = v.config['loadSensitivity'] as number;
        m.edgePreservation = v.config['edgePreservation'] as boolean;
        v.events.forEach((e, i) => {
          const move = parseMove(e.move);
          const pile = e.pileBefore.map(parseCard);
          m.observeOpponentMove(move, pile, e.oppHandSizeBefore, e.deckSizeBefore);
          expect(humanSnap(m), `${v.id} snapshot ${i}`).toEqual(v.snapshots[i]);
        });
      }
    });
  }
});
