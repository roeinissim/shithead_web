// Hand-derived readability tests (approach (b)). The golden vectors are the authoritative
// parity backbone; if these ever disagree with a golden vector, the golden vector wins.

import { describe, it, expect } from 'vitest';
import { createRules } from '../rules';
import type { Card, Rank, Suit } from '../cards';

const rules = createRules();
const card = (rank: Rank, suit: Suit = 'HEARTS'): Card => ({ code: `${rank}_${suit}`, suit, rank });
const pile = (...ranks: Rank[]): Card[] => ranks.map((r) => card(r, 'CLUBS'));

describe('rank ordering (4 lowest, Ace highest among normals)', () => {
  it('orders normal ranks by power', () => {
    expect(rules.getPower('FOUR')).toBe(4);
    expect(rules.getPower('ACE')).toBe(14);
    expect(rules.getPower('FOUR')).toBeLessThan(rules.getPower('ACE'));
  });
  it('ranks specials above normals: 3 < 2 < 10 < joker', () => {
    expect(rules.getPower('THREE')).toBe(28);
    expect(rules.getPower('TWO')).toBe(29);
    expect(rules.getPower('TEN')).toBe(30);
    expect(rules.getPower('JOKER')).toBe(99);
  });
});

describe('canPlay special rules', () => {
  it('empty pile accepts anything', () => {
    expect(rules.canPlay(card('FOUR'), [])).toBe(true);
  });
  it('2 and 3 and joker play on anything', () => {
    const p = pile('KING');
    expect(rules.canPlay(card('TWO'), p)).toBe(true);
    expect(rules.canPlay(card('THREE'), p)).toBe(true);
    expect(rules.canPlay(card('JOKER', 'NONE'), p)).toBe(true);
  });
  it('3 is transparent: must beat the card beneath', () => {
    const p = pile('NINE'); p.push(card('THREE', 'SPADES'));
    expect(rules.canPlay(card('EIGHT'), p)).toBe(false);
    expect(rules.canPlay(card('NINE'), p)).toBe(true);
    expect(rules.canPlay(card('KING'), p)).toBe(true);
  });
  it('7-and-under: next card must be <= 7, and 10 is blocked under a 7', () => {
    const p = pile('SEVEN');
    expect(rules.canPlay(card('SIX'), p)).toBe(true);
    expect(rules.canPlay(card('EIGHT'), p)).toBe(false);
    expect(rules.canPlay(card('TEN'), p)).toBe(false);
  });
  it('a 2 on top resets — anything plays', () => {
    const p = pile('KING'); p.push(card('TWO', 'SPADES'));
    expect(rules.canPlay(card('FOUR'), p)).toBe(true);
  });
  it('10 burns/plays on anything that is not a 7 regime', () => {
    expect(rules.canPlay(card('TEN'), pile('KING'))).toBe(true);
  });
  it('normal play: equal or higher power', () => {
    expect(rules.canPlay(card('NINE'), pile('NINE'))).toBe(true);
    expect(rules.canPlay(card('EIGHT'), pile('NINE'))).toBe(false);
    expect(rules.canPlay(card('JACK'), pile('NINE'))).toBe(true);
  });
});
