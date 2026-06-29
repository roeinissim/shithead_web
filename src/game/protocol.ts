// Worker message protocol — STATELESS full-state round-trip. The Worker holds nothing between
// calls. Rule actions travel WITH the request so the bot derives rules from the SAME source the
// UI does (no independent createRules(default) -> no UI/bot rule desync when settings arrive).
import type { GameStateJson, MoveJson } from '../engine/serialize';

export interface DecideRequest {
  type: 'decide';
  id: number;                         // request id; stale responses are ignored
  state: GameStateJson;               // full serialized engine state
  actions: Record<string, string>;    // rank -> SpecialAction (the game's single rule source)
  timeBudgetMs: number;               // wall-clock cap (measured on-device, not hardcoded)
  seed: number;                       // mulberry32 seed (crypto-random per request)
}
export interface DecideResponse {
  type: 'decision';
  id: number;
  move: MoveJson;
  elapsedMs: number;                  // actual decideMove wall-time (on-device timing)
}
