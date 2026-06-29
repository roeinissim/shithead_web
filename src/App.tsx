import { useEffect, useReducer, useRef, useState } from 'react';
import { isGameOver } from './engine/engine';
import { validateMove, type Move } from './engine/moves';
import type { GameState } from './engine/state';
import { reducer, initialState } from './game/reducer';
import { rules, ACTIONS, REVEAL_MS, BOT_ACTION_DELAY_MS, EFFECT_RESOLVE_DELAY_MS, DEFAULT_TIME_BUDGET_MS } from './game/gameConfig';
import { BotClient } from './game/workerClient';
import { Board } from './ui/Board';
import { StatusBar, ActionBar, RevealOverlay, GameOverOverlay, ConfirmDialog, TimingHud } from './ui/Overlays';
import { T } from './ui/strings';

// #2: does this play also trigger a pile effect (10/4-of-a-kind burn, joker transfer)? If so, return
// the pile WITH the played card on it, so the UI can show it land before the effect resolves. Uses
// public rules only — applyMove stays atomic; this is pure presentation detection.
function effectPile(engine: GameState, move: Move): GameState['discardPile'] | null {
  if (move.kind !== 'PLAY' || move.cards.length === 0) return null;
  const card = move.cards[0]!;
  const newPile = [...engine.discardPile, ...move.cards];
  const jokerTransfer = rules.isJoker(card.rank) && engine.discardPile.length > 0;
  const tenBurn = rules.getCardAction(card.rank) === 'BURN';
  let four = false;
  if (newPile.length >= 4) {
    const r = newPile[newPile.length - 1]!.rank;
    four = true;
    for (let k = 1; k <= 4; k++) if (newPile[newPile.length - k]!.rank !== r) four = false;
  }
  return jokerTransfer || tenBurn || four ? newPile : null;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [bot] = useState(() => new BotClient());
  const [timeBudget] = useState(DEFAULT_TIME_BUDGET_MS);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busyRef = useRef(false);
  const { engine, ui } = state;

  useEffect(() => () => bot.dispose(), [bot]);

  // Commit a move: if it triggers a pile effect, show the card land, pause, THEN apply (engine is
  // atomic, so the pause is purely visual). Otherwise apply immediately. Clears the bot gate on apply.
  const commitMove = (move: Move) => {
    const preview = effectPile(engine, move);
    if (preview) {
      dispatch({ type: 'BEGIN_EFFECT', pile: preview });
      setTimeout(() => { busyRef.current = false; dispatch({ type: 'APPLY', move }); }, EFFECT_RESOLVE_DELAY_MS);
    } else {
      busyRef.current = false;
      dispatch({ type: 'APPLY', move });
    }
  };

  // Face-down reveal beat (both seats).
  useEffect(() => {
    if (!ui.reveal) return;
    const index = ui.reveal.index;
    const id = setTimeout(() => { busyRef.current = false; dispatch({ type: 'APPLY', move: { kind: 'PLAY_FACE_DOWN', index } }); }, REVEAL_MS);
    return () => clearTimeout(id);
  }, [ui.reveal]);

  // Turn loop: bot decides off-thread, then pacing delay between visible bot actions, then commit.
  useEffect(() => {
    if (engine.phase !== 'PLAYING' || engine.playerTurn || isGameOver(engine)) return;
    if (ui.thinking || ui.reveal || ui.effectPreview || busyRef.current) return;
    busyRef.current = true;
    dispatch({ type: 'SET_THINKING', value: true });
    bot.decide(engine, ACTIONS, timeBudget).then((d) => {
      dispatch({ type: 'RECORD_MS', ms: d.elapsedMs });
      dispatch({ type: 'SET_THINKING', value: false });
      if (d.move.kind === 'PLAY_FACE_DOWN') {
        dispatch({ type: 'BEGIN_REVEAL', seat: 'ai', index: d.move.index });
      } else {
        setTimeout(() => commitMove(d.move), BOT_ACTION_DELAY_MS); // pace, then land (+effect beat)
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, ui.thinking, ui.reveal, ui.effectPreview, timeBudget, bot]);

  const gameOver = isGameOver(engine);
  const busy = ui.thinking || ui.reveal != null || ui.effectPreview != null;
  const selectedCards = [...engine.player.hand, ...engine.player.faceUp].filter((c) => ui.selected.includes(c.code));
  const myTurn = engine.phase === 'PLAYING' && engine.playerTurn && !busy;
  const canPlay = myTurn && selectedCards.length > 0 && validateMove(rules, engine, selectedCards);
  const canTake = myTurn && engine.discardPile.length > 0;
  const canConfirm = engine.phase === 'SETUP_CHOOSE_FACEUP' && ui.selected.length === 3;
  const faceDownActive = myTurn && engine.player.hand.length === 0 && engine.player.faceUp.length === 0
    && engine.player.faceDown.length > 0;

  const doNewGame = () => { bot.cancelAll(); busyRef.current = false; setConfirmOpen(false); dispatch({ type: 'NEW_GAME' }); };

  return (
    <div className="app">
      <header className="topbar"><span className="brand">{T.appTitle}</span><TimingHud samples={ui.decisionMs} /></header>
      <Board
        state={state}
        selected={new Set(ui.selected)}
        faceDownActive={faceDownActive}
        onSelect={(code) => dispatch({ type: 'TOGGLE_SELECT', code })}
        onFaceDown={(index) => dispatch({ type: 'BEGIN_REVEAL', seat: 'player', index })}
      />
      <StatusBar thinking={ui.thinking} playerTurn={engine.playerTurn} phase={engine.phase} lastAction={ui.lastAction} />
      <ActionBar
        phase={engine.phase} canPlay={canPlay} canTake={canTake} canConfirm={canConfirm} busy={busy}
        onPlay={() => commitMove({ kind: 'PLAY', cards: selectedCards })}
        onTake={() => commitMove({ kind: 'TAKE_PILE' })}
        onConfirm={() => dispatch({ type: 'CONFIRM_SETUP' })}
        onNewGame={() => setConfirmOpen(true)}
      />
      {ui.reveal && <RevealOverlay reveal={ui.reveal} />}
      {confirmOpen && <ConfirmDialog onConfirm={doNewGame} onCancel={() => setConfirmOpen(false)} />}
      {gameOver && <GameOverOverlay winner={engine.winner} onPlayAgain={doNewGame} />}
    </div>
  );
}
