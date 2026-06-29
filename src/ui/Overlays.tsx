import type { Winner } from '../engine/state';
import type { Reveal } from '../game/reducer';
import { CardFace } from './CardView';
import { T } from './strings';

export function StatusBar(props: { thinking: boolean; playerTurn: boolean; phase: string; lastAction: string }) {
  const { thinking, playerTurn, phase, lastAction } = props;
  const turn = phase === 'SETUP_CHOOSE_FACEUP' ? T.chooseFaceUp
    : thinking ? T.thinking : playerTurn ? T.yourTurn : T.oppTurn;
  return (
    <div className="statusbar" role="status" aria-live="polite">
      <span className={`turn ${thinking ? 'busy' : playerTurn ? 'mine' : 'opp'}`}>
        {thinking && <span className="spinner" aria-hidden />}{turn}
      </span>
      <span className="last">{lastAction}</span>
    </div>
  );
}

export function ActionBar(props: {
  phase: string; canPlay: boolean; canTake: boolean; canConfirm: boolean; busy: boolean;
  onPlay: () => void; onTake: () => void; onConfirm: () => void; onNewGame: () => void;
}) {
  const setup = props.phase === 'SETUP_CHOOSE_FACEUP';
  return (
    <div className="actionbar">
      {setup ? (
        <button className="btn primary" disabled={!props.canConfirm} onClick={props.onConfirm}>{T.confirm}</button>
      ) : (
        <>
          <button className="btn primary" disabled={!props.canPlay || props.busy} onClick={props.onPlay}>{T.play}</button>
          <button className="btn" disabled={!props.canTake || props.busy} onClick={props.onTake}>{T.takePile}</button>
        </>
      )}
      <button className="btn ghost" onClick={props.onNewGame}>{T.newGame}</button>
    </div>
  );
}

export function RevealOverlay({ reveal }: { reveal: Reveal }) {
  return (
    <div className="overlay reveal">
      <div className="reveal-card"><CardFace card={reveal.card} /></div>
      <div className={`reveal-msg ${reveal.willPlay ? 'ok' : 'bad'}`}>
        {reveal.willPlay ? T.willPlay : T.willPickup}
      </div>
    </div>
  );
}

export function GameOverOverlay({ winner, onPlayAgain }: { winner: Winner; onPlayAgain: () => void }) {
  return (
    <div className="overlay gameover">
      <div className="go-card">
        <h1>{winner === 'PLAYER' ? T.youWin : T.youLose}</h1>
        <button className="btn primary big" onClick={onPlayAgain}>{T.playAgain}</button>
      </div>
    </div>
  );
}

// On-device timing HUD — shows the decideMove wall-time DISTRIBUTION (incl. tail), not just a mean.
export function TimingHud({ samples }: { samples: number[] }) {
  if (samples.length === 0) return null;
  const s = [...samples].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
  const fmt = (n: number) => `${Math.round(n)}ms`;
  return (
    <div className="timing" aria-label="decide timing">
      n={s.length} · min {fmt(s[0]!)} · med {fmt(q(0.5))} · p90 {fmt(q(0.9))} · max {fmt(s[s.length - 1]!)}
    </div>
  );
}

export function ConfirmDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="overlay confirm" role="dialog" aria-modal="true">
      <div className="go-card">
        <h1>{T.confirmNewTitle}</h1>
        <p className="confirm-body">{T.confirmNewBody}</p>
        <div className="confirm-actions">
          <button className="btn primary" onClick={onConfirm}>{T.yes}</button>
          <button className="btn" onClick={onCancel}>{T.cancel}</button>
        </div>
      </div>
    </div>
  );
}
