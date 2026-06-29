// Lossy "human" memory of the opponent's hand — faithful port of HumanMemory.java.
// Three fidelity tiers: EXACT (pin), BUCKET (category only), FORGOTTEN (uniform).
// At max-fidelity knobs (Infinity spans) every card is EXACT == SCOOP-ONLY pinning.
// PUBLIC DATA ONLY + no-Joker/10 leak guard (those burn the pile, never scooped).

import type { Card, Rank } from '../engine/cards';
import type { Rules } from '../engine/rules';
import type { Move } from '../engine/moves';

export type Bucket = 'LOW' | 'MID' | 'HIGH';

interface Mem { card: Card; scoopTurn: number; batch: number; }

export class HumanMemory {
  private readonly known = new Map<string, Mem>();
  private readonly seenOnPile = new Set<string>();
  private turn = 0;
  leakDetected = false;

  // Knobs (defaults = max fidelity). NOTE: HumanMemory has NO void inference, so max-fidelity
  // == scoop-ONLY (pin all scooped, no void) — NOT the full scoop+void BeliefState.
  memorySpan = Number.POSITIVE_INFINITY; // # non-edge cards retained at all
  sharpSpan = Number.POSITIVE_INFINITY;  // of those retained, # kept EXACT
  loadSensitivity = 0.0;                 // big single pickups fade faster
  edgePreservation = true;               // lowest/highest always EXACT

  private dirty = true;
  private exactCache = new Set<string>();
  private bucketCache: Bucket[] = [];

  constructor(private readonly rules: Rules) {}

  // ===== Observation (public data only) =====

  observeOpponentMove(move: Move, pileBefore: readonly Card[], _oppHandSizeBefore: number, _deckSizeBefore: number): void {
    this.turn++;
    this.markSeen(pileBefore);
    if (move.kind === 'TAKE_PILE') {
      const batch = pileBefore.length;
      for (const c of pileBefore) {
        if (this.isJokerOrTen(c)) { this.leakDetected = true; continue; }
        this.known.set(c.code, { card: c, scoopTurn: this.turn, batch });
      }
      this.dirty = true;
    } else if (move.kind === 'PLAY') {
      for (const c of move.cards) if (this.known.delete(c.code)) this.dirty = true;
    }
    if (move.kind === 'PLAY') this.markSeen(move.cards);
  }

  observeMyMove(move: Move, pileBefore: readonly Card[]): void {
    this.turn++;
    this.markSeen(pileBefore);
    if (move.kind === 'PLAY' && move.cards.length > 0
        && this.rules.isJoker(move.cards[0]!.rank) && pileBefore.length > 0) {
      for (const c of pileBefore) {
        if (this.isJokerOrTen(c)) { this.leakDetected = true; continue; }
        this.known.set(c.code, { card: c, scoopTurn: this.turn, batch: pileBefore.length });
      }
      this.dirty = true;
    }
    if (move.kind === 'PLAY') this.markSeen(move.cards);
  }

  // ===== Sampler query API =====

  exactCodes(): Set<string> { this.classify(); return this.exactCache; }
  bucketDemands(): Bucket[] { this.classify(); return this.bucketCache; }

  bucketOf(c: Card): Bucket {
    const v = this.rules.getPower(c.rank); // 4..9 normal, 11..14 J..A (10/joker excluded)
    if (v <= 7) return 'LOW';
    if (v <= 9) return 'MID';
    return 'HIGH';
  }

  isFair(): boolean {
    for (const code of this.known.keys()) if (!this.seenOnPile.has(code)) return false;
    return true;
  }

  // ===== internals =====

  private classify(): void {
    if (!this.dirty) return;
    const exact = new Set<string>();
    const normals: Mem[] = [];
    let lowest: Card | null = null;
    let highest: Card | null = null;
    for (const m of this.known.values()) {
      const a = this.rules.getCardAction(m.card.rank);
      if (a === 'RESET' || a === 'TRANSPARENT') { exact.add(m.card.code); continue; } // 2/3 sharp
      normals.push(m);
      const p = this.rules.getPower(m.card.rank);
      if (lowest === null || p < this.rules.getPower(lowest.rank)) lowest = m.card;
      if (highest === null || p > this.rules.getPower(highest.rank)) highest = m.card;
    }
    if (this.edgePreservation) {
      if (lowest !== null) exact.add(lowest.code);
      if (highest !== null) exact.add(highest.code);
    }
    const rest = normals.filter((m) => !exact.has(m.card.code));
    rest.sort((x, y) => this.priority(y) - this.priority(x)); // most-recent / lightest-load first
    const buckets: Bucket[] = [];
    for (let i = 0; i < rest.length && i < this.memorySpan; i++) {
      if (i < this.sharpSpan) exact.add(rest[i]!.card.code);
      else buckets.push(this.bucketOf(rest[i]!.card));
    }
    this.exactCache = exact;
    this.bucketCache = buckets;
    this.dirty = false;
  }

  private priority(m: Mem): number { return m.scoopTurn - this.loadSensitivity * m.batch; }

  private isJokerOrTen(c: Card): boolean {
    return this.rules.isJoker(c.rank) || this.rules.getCardAction(c.rank) === 'BURN';
  }

  private markSeen(cards: readonly Card[] | null): void {
    if (!cards) return;
    for (const c of cards) if (c) this.seenOnPile.add(c.code);
  }
}
