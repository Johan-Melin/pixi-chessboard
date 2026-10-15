import { createChessboard, type Position, type PieceKind, type Square } from '../src';
import assetUrl from '../assets/retro-chess-assets.png?url';
import pawn from '../assets/pawn-original.svg?url';
import './style.css';

function startingPosition(): Position {
  const pieces = [];
  const back: PieceKind[] = ['r','n','b','q','k','b','n','r'];
  for (let col=0; col<8; col++) {
    for (const [side,kind,row] of [
      ['b',back[col],0], ['b','p',1], ['w','p',6], ['w',back[col],7],
    ] as const) {
      pieces.push({id:`${side}-${kind}-${col}-${row}`,side,kind,square:`${'abcdefgh'[col]}${8-row}` as Square});
    }
  }
  return pieces;
}

async function main() {
  const host = document.querySelector<HTMLDivElement>('#board')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  // The controller owns the position and decides how a move changes it.
  let position = startingPosition();
  const board = await createChessboard(host, {
    assetUrl,
    pieceAssets:{wp:pawn,bp:pawn},
    pieceStyles:{
      wp:{color:'#f4dfb0',outline:true,outlineColor:'#12161c',outlineWidth:2,scale:1},
      bp:{color:'#4399ad',outline:true,outlineColor:'#12161c',outlineWidth:2,scale:1},
    },
    position,
    onMoveRequest(request) {
      const moving = position.find(piece=>piece.id===request.pieceId);
      if (!moving || moving.square!==request.from) return null;
      const captured = position.some(piece=>piece.id!==moving.id && piece.square===request.to);
      // Playground rule only: any piece can move anywhere and replace its occupant.
      position = position
        .filter(piece=>piece.id===moving.id || piece.square!==request.to)
        .map(piece=>piece.id===moving.id ? {...piece,square:request.to} : piece);
      status.textContent = `${captured?'Captured':'Placed'} on ${request.to}`;
      return position;
    },
    onError(error) { console.error(error);status.textContent='Move could not be applied.'; },
  });
  const reset = document.querySelector<HTMLButtonElement>('#reset')!;
  const restore = () => {
    position = startingPosition();
    board.setPosition(position, {animate:false});
    status.textContent='Starting position restored';
  };
  reset.addEventListener('click',restore);
  host.dataset.ready='true';
  if(import.meta.env.DEV) {
    // Development-only access to the same public API used by applications.
    Object.assign(window,{playground:{board,createChessboard,assetUrl,startingPosition}});
  }
  import.meta.hot?.dispose(()=>{reset.removeEventListener('click',restore);board.destroy();});
}

main().catch(error=>{
  console.error(error);
  const message=document.querySelector<HTMLParagraphElement>('#error')!;
  message.hidden=false;message.textContent='The board could not load. Please refresh and try again.';
});
