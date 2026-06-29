// Rules engine — faithful port of RuleConfig.java.
// The Android version reads special-card actions from SharedPreferences behind a
// 2s cache; here the action map is an injectable plain object (defaults below).

import type { Card, Rank } from './cards';

export type SpecialAction =
  | 'RESET' | 'TRANSPARENT' | 'LOWER' | 'SKIP' | 'BURN' | 'JOKER' | 'NONE';

// Maps a rank to its special action. Omitted ranks => NONE (jokers => JOKER always).
export type SpecialActionMap = Partial<Record<Rank, SpecialAction>>;

// The shipped variant (identical to AiStrengthTest.TestRuleConfig defaults).
export const DEFAULT_SPECIAL_ACTIONS: SpecialActionMap = {
  TWO: 'RESET',
  THREE: 'TRANSPARENT',
  SEVEN: 'LOWER',
  EIGHT: 'SKIP',
  TEN: 'BURN',
};

// RuleConfig.getNormalValue — manual name mapping (NOT ordinal).
const NORMAL_VALUE: Record<Rank, number> = {
  FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10,
  JACK: 11, QUEEN: 12, KING: 13, ACE: 14, TWO: 2, THREE: 3, JOKER: 15,
};

export interface Rules {
  readonly actions: SpecialActionMap;
  isJoker(rank: Rank): boolean;
  getNormalValue(rank: Rank): number;
  getCardAction(rank: Rank): SpecialAction;
  getPower(rank: Rank): number;
  canPlay(card: Card, pile: readonly Card[]): boolean;
  getRankName(rank: Rank): string;
}

export function createRules(actions: SpecialActionMap = DEFAULT_SPECIAL_ACTIONS): Rules {
  const isJoker = (rank: Rank): boolean => rank.includes('JOKER');
  const getNormalValue = (rank: Rank): number => NORMAL_VALUE[rank] ?? 0;

  const getCardAction = (rank: Rank): SpecialAction => {
    if (isJoker(rank)) return 'JOKER';
    return actions[rank] ?? 'NONE';
  };

  const getPower = (rank: Rank): number => {
    if (isJoker(rank)) return 99;
    const act = getCardAction(rank);
    if (act === 'BURN') return 30;        // 10
    if (act === 'RESET') return 29;       // 2
    if (act === 'TRANSPARENT') return 28; // 3
    return getNormalValue(rank);
  };

  // RuleConfig.getEffectiveTopCard — last card whose action != TRANSPARENT (3 is see-through).
  const effectiveTopCard = (pile: readonly Card[]): Card | null => {
    for (let i = pile.length - 1; i >= 0; i--) {
      const c = pile[i]!;
      if (getCardAction(c.rank) !== 'TRANSPARENT') return c;
    }
    return null;
  };

  // RuleConfig.canPlay — order of checks is significant (see PORT_NOTES §4.2).
  const canPlay = (card: Card, pile: readonly Card[]): boolean => {
    if (pile.length === 0) return true;
    if (isJoker(card.rank)) return true;
    const myAct = getCardAction(card.rank);
    if (myAct === 'RESET') return true;        // 2 plays on anything
    if (myAct === 'TRANSPARENT') return true;  // 3 plays on anything
    const top = effectiveTopCard(pile);
    if (top === null) return true;             // pile was all 3s
    const topAct = getCardAction(top.rank);
    if (topAct === 'RESET') return true;       // a 2 on top resets
    if (topAct === 'LOWER') return getNormalValue(card.rank) <= 7; // 7-and-under (10 fails)
    if (myAct === 'BURN') return true;         // 10 plays on anything (no 7 beneath)
    return getPower(card.rank) >= getPower(top.rank);
  };

  const getRankName = (rank: Rank): string => {
    if (isJoker(rank)) return 'JOKER';
    const v = getNormalValue(rank);
    if (v <= 10) return String(v);
    if (v === 11) return 'J';
    if (v === 12) return 'Q';
    if (v === 13) return 'K';
    if (v === 14) return 'A';
    return '?';
  };

  return { actions, isJoker, getNormalValue, getCardAction, getPower, canPlay, getRankName };
}
