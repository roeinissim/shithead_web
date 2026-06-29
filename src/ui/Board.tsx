import type { Card } from '../engine/cards';
import type { GameUiState } from '../game/reducer';
import { CardFace, CardBack, CardSlot } from './CardView';
import { T } from './strings';

interface BoardProps {
  state: GameUiState;
  selected: Set<string>;
  faceDownActive: boolean;
  onSelect: (code: string) => void;
  onFaceDown: (index: number) => void;
}

// A1 + #3: face-up cards rest ON their face-down slot AND stay PINNED to a fixed slot for the whole
// game (no hole-filling). `slots` = the frozen face-up code per slot; absence => empty slot, others
// don't move. Face-down (blind backs) stays array-indexed so the tap maps to the engine index.
function TableSet(props: {
  faceUp: Card[]; faceDown: Card[]; slots?: string[] | undefined; selected?: Set<string>;
  faceDownActive?: boolean; onSelect?: (code: string) => void; onFaceDown?: (i: number) => void;
}) {
  const { faceUp, faceDown, slots, selected, faceDownActive, onSelect, onFaceDown } = props;
  const n = slots ? slots.length : Math.max(faceUp.length, faceDown.length);
  return (
    <div className="tableset">
      {Array.from({ length: n }).map((_, i) => {
        const fd = faceDown[i];
        const fu = slots ? faceUp.find((c) => c.code === slots[i]) : faceUp[i];
        return (
          <div className="tslot" key={i}>
            {fd && <span className="tslot-back"><CardBack small /></span>}
            {fu && (
              <span className="tslot-up">
                <CardFace card={fu} small selected={selected?.has(fu.code)}
                  disabled={!onSelect} onClick={onSelect ? () => onSelect(fu.code) : undefined} />
              </span>
            )}
            {fd && !fu && faceDownActive && onFaceDown && (
              <button className="fd-tap" type="button" aria-label="flip" onClick={() => onFaceDown(i)} />
            )}
            {!fd && !fu && <span className="tslot-empty" aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}

function Hand(props: { cards: Card[]; selected: Set<string>; onSelect: (code: string) => void }) {
  const { cards, selected, onSelect } = props;
  const cw = 64;
  const avail = Math.min((typeof window !== 'undefined' ? window.innerWidth : 390) - 20, 760);
  const step = cards.length <= 1 ? cw : Math.min(cw * 0.72, (avail - cw) / (cards.length - 1));
  const overlap = Math.round(step - cw);
  return (
    <div className="hand-fan" role="group" aria-label={T.you}>
      {cards.map((c, i) => (
        <div className="fan-card" key={c.code} style={{ marginInlineStart: i === 0 ? 0 : overlap, zIndex: i }}>
          <CardFace card={c} selected={selected.has(c.code)} onClick={() => onSelect(c.code)} />
        </div>
      ))}
    </div>
  );
}

export function Board({ state, selected, faceDownActive, onSelect, onFaceDown }: BoardProps) {
  const { player, ai, discardPile, stockDeck } = state.engine;
  const slots = state.ui.faceUpSlots;
  // #2: while an effect is resolving, show the played card resting on the pile.
  const pile = state.ui.effectPreview ?? discardPile;
  const top = pile.slice(-4);

  return (
    <div className="board">
      <section className="zone opp" aria-label={T.opponent}>
        <div className="zone-tag">{T.opponent}</div>
        <div className="hand-fan backs" aria-hidden>
          {ai.hand.map((_, i) => (
            <div className="fan-card" key={i} style={{ marginInlineStart: i === 0 ? 0 : -30, zIndex: i }}>
              <CardBack small />
            </div>
          ))}
        </div>
        <TableSet faceUp={ai.faceUp} faceDown={ai.faceDown} slots={slots?.ai} />
      </section>

      <section className="zone center">
        <div className="deck-col">
          <div className="deck-stack">
            {stockDeck.length > 0 ? <CardBack /> : <CardSlot><span className="empty-tag">{T.deck}</span></CardSlot>}
            {stockDeck.length > 0 && <span className="counter on-deck">{T.deck} {stockDeck.length}</span>}
          </div>
        </div>
        <div className="pile-col">
          <div className="cascade" aria-label={T.discard}>
            {top.length === 0 && <CardSlot><span className="empty-tag">{T.discard}</span></CardSlot>}
            {top.map((c, i) => {
              const fromTop = top.length - 1 - i;
              return (
                <div key={c.code} className="cascade-card"
                  style={{ transform: `translate(${fromTop * -10}px, ${fromTop * -12}px)`, zIndex: i }}>
                  <CardFace card={c} />
                </div>
              );
            })}
          </div>
          {pile.length > 0 && <span className="counter">{T.discard} {pile.length}</span>}
        </div>
      </section>

      <section className="zone me" aria-label={T.you}>
        <TableSet faceUp={player.faceUp} faceDown={player.faceDown} slots={slots?.player} selected={selected}
          faceDownActive={faceDownActive} onSelect={onSelect} onFaceDown={onFaceDown} />
        <Hand cards={player.hand} selected={selected} onSelect={onSelect} />
        <div className="zone-tag">{T.you}</div>
      </section>
    </div>
  );
}
