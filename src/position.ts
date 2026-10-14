import type { BoardPiece, Position } from './types.js';

/** Validate display data only. No turn, check, movement, or capture rules. */
export function copyPosition(position: Position): BoardPiece[] {
  if (!Array.isArray(position)) throw new TypeError('Position must be an array.');
  const ids = new Set<string>(), squares = new Set<string>();
  return position.map(piece => {
    if (!piece || typeof piece.id !== 'string' || !piece.id.trim()) throw new TypeError('Each piece needs a non-empty ID.');
    if (ids.has(piece.id)) throw new TypeError(`Duplicate piece ID: ${piece.id}`);
    if (!/^[a-h][1-8]$/.test(piece.square)) throw new TypeError(`Invalid square: ${piece.square}`);
    if (squares.has(piece.square)) throw new TypeError(`Two pieces occupy ${piece.square}`);
    if (!['p','n','b','r','q','k'].includes(piece.kind) || !['w','b'].includes(piece.side)) throw new TypeError(`Unsupported piece appearance: ${piece.id}`);
    ids.add(piece.id); squares.add(piece.square);
    return {id:piece.id, square:piece.square, kind:piece.kind, side:piece.side};
  });
}
