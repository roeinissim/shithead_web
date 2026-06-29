// Engine Card -> card PNG path, using the authoritative manifest_all.json scheme
// ({rank}{suit}.png for ranks; joker_color/joker_bw for jokers). PNGs live in web/public/cards/
// (copied from app/src/main/assets/cards). Largest asset is 160x220 (KH.png).
import type { Card, Rank, Suit } from '../engine/cards';

const AR: Record<Rank, string> = {
  TWO: '2', THREE: '3', FOUR: '4', FIVE: '5', SIX: '6', SEVEN: '7', EIGHT: '8',
  NINE: '9', TEN: '10', JACK: 'J', QUEEN: 'Q', KING: 'K', ACE: 'A', JOKER: 'X',
};
const AS: Record<Suit, string> = { HEARTS: 'H', SPADES: 'S', DIAMONDS: 'D', CLUBS: 'C', NONE: 'X' };
const BASE = import.meta.env.BASE_URL; // honours vite base './'

export function cardImage(card: Card): string {
  if (card.rank === 'JOKER') return `${BASE}cards/${card.code === 'JOKER_B' ? 'joker_bw' : 'joker_color'}.png`;
  return `${BASE}cards/${AR[card.rank]}${AS[card.suit]}.png`;
}
