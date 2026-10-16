export type PieceKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceSide = 'w' | 'b';
export type PieceKey = `${PieceSide}${PieceKind}`;
export interface PieceStyle {
  /** Tints the artwork while preserving darker shading. Omit to preserve source colors. */
  color?: string;
  outline?: boolean;
  outlineColor?: string;
  /** Thickness in board-coordinate pixels at rest, before viewport resizing. Default: 2. */
  outlineWidth?: number;
  /** Multiplier of the standard piece height. Default: 1. */
  scale?: number;
}
export type Square = `${'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'}${1|2|3|4|5|6|7|8}`;

/** Stable IDs let the renderer follow pieces between supplied positions. */
export interface BoardPiece {
  readonly id: string;
  readonly square: Square;
  readonly kind: PieceKind;
  readonly side: PieceSide;
}
export type Position = readonly BoardPiece[];

export interface MoveRequest {
  readonly pieceId: string;
  readonly from: Square;
  readonly to: Square;
}

export interface BoardOptions {
  /** URL to the supplied retro asset sheet (or a replacement with the same layout). */
  assetUrl: string;
  /** Optional image URLs keyed by side+kind, e.g. wp/bp. Transparent margins are trimmed. */
  pieceAssets?: Partial<Record<PieceKey, string>>;
  pieceStyles?: Partial<Record<PieceKey, PieceStyle>>;
  /** Square colors as CSS colors. Defaults to warm cream and muted red. */
  boardColors?: { light?: string; dark?: string };
  /** Subtle horizontal overlay across the board and pieces. Default: true. */
  scanlines?: boolean;
  position?: Position;
  /** Host-supplied destination hints; null prevents selecting that piece. No rules are inferred. */
  getMoveTargets?: (piece: BoardPiece) => readonly Square[] | null;
  /** Return the entire next position to accept; null to reject. No handler means read-only. */
  onMoveRequest?: (request: MoveRequest) => Position | null | Promise<Position | null>;
  /** Callback errors and invalid returned positions reject the move and are reported here. */
  onError?: (error: unknown) => void;
}

export interface Chessboard {
  readonly canvas: HTMLCanvasElement;
  /** Returns a copy. The board never mutates positions owned by the application. */
  getPosition(): Position;
  /** Replaces the position and supersedes pending requests. animate:false also clears effects. */
  setPosition(position: Position, options?: { animate?: boolean }): void;
  /** Idempotent; removes the canvas, listeners, effects, textures, observer, and render loop. */
  destroy(): void;
}
