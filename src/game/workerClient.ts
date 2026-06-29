// Main-thread client for the bot Worker. One in-flight request at a time; responses matched by
// id so a stale decision (e.g. user started a new game mid-think) is dropped.
import type { GameState } from '../engine/state';
import type { Move } from '../engine/moves';
import type { SpecialActionMap } from '../engine/rules';
import { toStateJson, toActionsJson, parseMove } from '../engine/serialize';
import { randomSeed } from './botRng';
import type { DecideRequest, DecideResponse } from './protocol';

export interface Decision { move: Move; elapsedMs: number; }

export class BotClient {
  private readonly worker: Worker;
  private nextId = 1;
  private pending = new Map<number, (d: Decision) => void>();

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<DecideResponse>) => {
      const res = e.data;
      const resolve = this.pending.get(res.id);
      if (!resolve) return; // stale / cancelled
      this.pending.delete(res.id);
      resolve({ move: parseMove(res.move), elapsedMs: res.elapsedMs });
    };
  }

  decide(state: GameState, actions: SpecialActionMap, timeBudgetMs: number): Promise<Decision> {
    const id = this.nextId++;
    const req: DecideRequest = {
      type: 'decide', id, state: toStateJson(state), actions: toActionsJson(actions),
      timeBudgetMs, seed: randomSeed(),
    };
    return new Promise<Decision>((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage(req);
    });
  }

  cancelAll(): void { this.pending.clear(); }   // drop any in-flight decision (new game)
  dispose(): void { this.worker.terminate(); }
}
