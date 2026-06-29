// Deductive belief about the opponent's hidden hand — faithful port of BeliefState.java.
// PUBLIC DATA ONLY: observe methods take the chosen Move, the pile snapshot BEFORE the move,
// and the opponent hand SIZE + deck SIZE (counts). Never the opponent's hand contents.
// isFair() asserts every "known" card was actually seen on the public pile.

import type { Card, Rank } from '../engine/cards';
import type { Rules, SpecialAction } from '../engine/rules';
import type { Move } from '../engine/moves';

const MAX_POWER = Number.MAX_SAFE_INTEGER;

export class BeliefState {
  private readonly knownInHand = new Set<string>();
  private readonly seenOnPile = new Set<string>();

  private voidCeilingPower = MAX_POWER;
  private lacksReset = false;
  private lacksTransparent = false;
  private lacksJoker = false;
  private lacksBurn = false;

  // Levers (defaults match Java): void inference on; no card-type filter.
  voidEnabled = true;
  knownRankFilter: Set<Rank> | null = null;

  constructor(private readonly rules: Rules) {}

  // ===== Observation (public data only) =====

  observeOpponentMove(move: Move, pileBefore: readonly Card[], oppHandSizeBefore: number, deckSizeBefore: number): void {
    this.markSeen(pileBefore);
    if (move.kind === 'TAKE_PILE') {
      for (const c of pileBefore) if (this.rankAllowed(c.rank)) this.knownInHand.add(c.code);
      if (this.voidEnabled && oppHandSizeBefore > 0) {
        const top = this.effectiveTop(pileBefore);
        if (top) {
          const a = this.rules.getCardAction(top.rank);
          if (a === 'RESET') {
            // forced pickup impossible on a 2 from a non-empty hand -> infer nothing
          } else if (a === 'LOWER') {
            // on a 7 a forced pickup means they lack LOW cards, not high -> only specials absent
            this.lacksReset = true; this.lacksTransparent = true; this.lacksJoker = true;
          } else {
            this.voidCeilingPower = this.rules.getPower(top.rank);
            this.lacksReset = true; this.lacksTransparent = true; this.lacksJoker = true; this.lacksBurn = true;
          }
        }
      }
    } else if (move.kind === 'PLAY') {
      for (const c of move.cards) this.knownInHand.delete(c.code);
      if (deckSizeBefore > 0) this.clearVoid();
      this.markSeen(move.cards);
    }
    // PLAY_FACE_DOWN (blind flip): cardsToPlay is null in Java -> no removal, no void clear.
  }

  observeMyMove(move: Move, pileBefore: readonly Card[]): void {
    this.markSeen(pileBefore);
    if (move.kind === 'PLAY' && move.cards.length > 0
        && this.rules.isJoker(move.cards[0]!.rank) && pileBefore.length > 0) {
      for (const c of pileBefore) if (this.rankAllowed(c.rank)) this.knownInHand.add(c.code);
    }
    if (move.kind === 'PLAY') this.markSeen(move.cards);
  }

  // ===== Sampler query API =====

  isPinned(code: string): boolean { return this.knownInHand.has(code); }

  contradictsVoid(c: Card): boolean {
    if (!this.voidEnabled) return false;
    if (this.rules.getPower(c.rank) >= this.voidCeilingPower) return true;
    const a: SpecialAction = this.rules.getCardAction(c.rank);
    if (this.lacksReset && a === 'RESET') return true;
    if (this.lacksTransparent && a === 'TRANSPARENT') return true;
    if (this.lacksJoker && this.rules.isJoker(c.rank)) return true;
    if (this.lacksBurn && a === 'BURN') return true;
    return false;
  }

  // Fill `count` opponent-hand slots from a shuffled pool, preferring non-contradicting cards;
  // falls back to any remaining card. Mutates pool (removes chosen).
  fillNonContradicting(pool: Card[], count: number): Card[] {
    const chosen: Card[] = [];
    for (let i = 0; i < pool.length && chosen.length < count; ) {
      if (!this.contradictsVoid(pool[i]!)) chosen.push(pool.splice(i, 1)[0]!);
      else i++;
    }
    while (pool.length > 0 && chosen.length < count) chosen.push(pool.shift()!);
    return chosen;
  }

  isFair(): boolean {
    for (const code of this.knownInHand) if (!this.seenOnPile.has(code)) return false;
    return true;
  }

  // For golden-vector snapshots: the set of pinned codes (test-only convenience).
  pinnedCodes(): string[] { return [...this.knownInHand].sort(); }

  private rankAllowed(r: Rank): boolean {
    return this.knownRankFilter === null || this.knownRankFilter.has(r);
  }

  private clearVoid(): void {
    this.voidCeilingPower = MAX_POWER;
    this.lacksReset = this.lacksTransparent = this.lacksJoker = this.lacksBurn = false;
  }

  private markSeen(cards: readonly Card[] | null): void {
    if (!cards) return;
    for (const c of cards) if (c) this.seenOnPile.add(c.code);
  }

  private effectiveTop(pile: readonly Card[]): Card | null {
    for (let i = pile.length - 1; i >= 0; i--) {
      const c = pile[i]!;
      if (this.rules.getCardAction(c.rank) !== 'TRANSPARENT') return c;
    }
    return null;
  }
}
