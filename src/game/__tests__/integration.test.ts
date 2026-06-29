// Phase-3a integration (no React/Worker): proves the serialize round-trip used by the Worker and
// the reducer-driven game loop work end-to-end with the real engine + bot.
import { describe, it, expect } from 'vitest';
import { toStateJson, parseState } from '../../engine/serialize';
import { isGameOver } from '../../engine/engine';
import { getLegalMoves } from '../../engine/moves';
import { mulberry32 } from '../../engine/rng';
import { productionConfig } from '../../bot/config';
import { decideMove } from '../../bot/montecarlo';
import { reducer, initialState, type GameUiState } from '../reducer';
import { rules } from '../gameConfig';

describe('Phase-3a integration', () => {
  it('serialize round-trip (toStateJson -> JSON -> parseState) preserves zones', () => {
    const s = initialState().engine;
    const back = parseState(JSON.parse(JSON.stringify(toStateJson(s))));
    const codes = (cs: { code: string }[]) => cs.map((c) => c.code).sort();
    expect(codes(back.player.hand)).toEqual(codes(s.player.hand));
    expect(codes(back.ai.faceUp)).toEqual(codes(s.ai.faceUp));
    expect(codes(back.stockDeck)).toEqual(codes(s.stockDeck));
    expect(back.phase).toBe(s.phase);
  });

  it('plays a full reducer-driven game to a win', () => {
    let s: GameUiState = initialState();
    // setup: choose 3 strongest face-up
    const chosen = [...s.engine.player.hand]
      .sort((a, b) => rules.getPower(b.rank) - rules.getPower(a.rank)).slice(0, 3);
    for (const c of chosen) s = reducer(s, { type: 'TOGGLE_SELECT', code: c.code });
    s = reducer(s, { type: 'CONFIRM_SETUP' });
    expect(s.engine.phase).toBe('PLAYING');

    const cfg = productionConfig({ simulationCount: 10, timeBudgetMs: 1_000_000 });
    let seed = 1, plies = 0;
    while (!isGameOver(s.engine) && plies++ < 4000) {
      const e = s.engine;
      if (e.playerTurn) {
        const moves = getLegalMoves(rules, e);
        if (moves.length > 0) s = reducer(s, { type: 'APPLY', move: moves[0]! });
        else if (e.player.hand.length === 0 && e.player.faceUp.length === 0 && e.player.faceDown.length > 0)
          s = reducer(s, { type: 'APPLY', move: { kind: 'PLAY_FACE_DOWN', index: 0 } });
        else s = reducer(s, { type: 'APPLY', move: { kind: 'TAKE_PILE' } });
      } else {
        const move = decideMove(rules, e, cfg, mulberry32(seed++));
        s = reducer(s, { type: 'APPLY', move });
      }
    }
    expect(isGameOver(s.engine)).toBe(true);
    expect(['PLAYER', 'AI']).toContain(s.engine.winner);
  });
});
