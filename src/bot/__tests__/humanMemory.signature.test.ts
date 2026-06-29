// E5 signature check (behavioral, not statistical): a very-lossy L4 memory must NOT be able to
// EXACT-recall an old mid-priority card, whereas the faithful L0 still pins it. Mirrors the
// Java assertion. Uses crafted single-card pickups on distinct turns (deterministic classify).
import { describe, it, expect } from 'vitest';
import { createRules } from '../../engine/rules';
import type { Card, Rank, Suit } from '../../engine/cards';
import { HumanMemory } from '../humanMemory';

const rules = createRules();
const card = (r: Rank, s: Suit): Card => ({ code: `${r}_${s}`, suit: s, rank: r });
const scoop = (m: HumanMemory, c: Card) => m.observeOpponentMove({ kind: 'TAKE_PILE' }, [c], 2, 0);

describe('E5 signature: L4 forgets an old mid card that L0 keeps EXACT', () => {
  const OLD_MID = card('EIGHT', 'HEARTS');
  const later: Card[] = [card('FIVE', 'SPADES'), card('SIX', 'DIAMONDS'), card('SEVEN', 'CLUBS'), card('KING', 'HEARTS')];

  function build(memorySpan: number, sharpSpan: number, load: number): HumanMemory {
    const m = new HumanMemory(rules);
    m.memorySpan = memorySpan; m.sharpSpan = sharpSpan; m.loadSensitivity = load; m.edgePreservation = true;
    scoop(m, OLD_MID);
    for (const c of later) scoop(m, c);
    return m;
  }

  it('L0 faithful keeps the old mid card EXACT', () => {
    expect(build(999, 999, 0.0).exactCodes().has(OLD_MID.code)).toBe(true);
  });
  it('L4 very-lossy CANNOT exact-recall the old mid card', () => {
    expect(build(2, 0, 1.0).exactCodes().has(OLD_MID.code)).toBe(false);
  });
});
