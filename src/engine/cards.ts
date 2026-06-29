// Card model — faithful port of Card.java.
// NOTE: Rank order here mirrors the Java enum's declaration order (used only as a
// stable ordinal index, NOT as card value). Card value/power lives in rules.ts.

export type Suit = 'HEARTS' | 'SPADES' | 'DIAMONDS' | 'CLUBS' | 'NONE';

export type Rank =
  | 'FOUR' | 'FIVE' | 'SIX' | 'SEVEN' | 'EIGHT' | 'NINE' | 'TEN'
  | 'JACK' | 'QUEEN' | 'KING' | 'ACE' | 'TWO' | 'THREE' | 'JOKER';

// Declaration order of Card.Rank in Java (ordinal index for dedup scratch only).
export const RANK_ORDER: readonly Rank[] = [
  'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
  'JACK', 'QUEEN', 'KING', 'ACE', 'TWO', 'THREE', 'JOKER',
];

// Cards are immutable (Java's fields are final) — safe to share references on clone.
export interface Card {
  readonly code: string;
  readonly suit: Suit;
  readonly rank: Rank;
}

// Mirrors AiStrengthTest.buildDeck(): 52 ranked cards + 2 jokers, codes "RANK_SUIT".
export function buildDeck(): Card[] {
  const suits: Suit[] = ['HEARTS', 'SPADES', 'DIAMONDS', 'CLUBS'];
  const deck: Card[] = [];
  for (const r of RANK_ORDER) {
    if (r === 'JOKER') continue;
    for (const s of suits) deck.push({ code: `${r}_${s}`, suit: s, rank: r });
  }
  deck.push({ code: 'JOKER_A', suit: 'NONE', rank: 'JOKER' });
  deck.push({ code: 'JOKER_B', suit: 'NONE', rank: 'JOKER' });
  return deck;
}
