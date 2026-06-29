// Web Worker entry — runs the bot off the main thread. Stateless: rebuilds everything from the
// message each call. Rules come from request.actions (shared source), NOT a hardcoded default.
import { parseState, parseActions, toMoveJson } from '../engine/serialize';
import { createRules } from '../engine/rules';
import { mulberry32 } from '../engine/rng';
import { productionConfig } from '../bot/config';
import { decideMove } from '../bot/montecarlo';
import type { DecideRequest, DecideResponse } from './protocol';

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<DecideRequest>) => {
  const req = e.data;
  if (req.type !== 'decide') return;
  const rules = createRules(parseActions(req.actions));
  const state = parseState(req.state);
  const config = productionConfig({ timeBudgetMs: req.timeBudgetMs }); // all levers OFF
  const rng = mulberry32(req.seed);
  const t0 = performance.now();
  const move = decideMove(rules, state, config, rng);
  const elapsedMs = performance.now() - t0;
  const res: DecideResponse = { type: 'decision', id: req.id, move: toMoveJson(move), elapsedMs };
  ctx.postMessage(res);
};
