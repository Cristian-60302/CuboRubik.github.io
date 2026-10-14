import Cube from 'cubejs';

export const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
export const FACES = {
  U: { axis: 'y', layer: 1, angle: -Math.PI / 2, color: '#f7f8f1', normal: [0, 1, 0] },
  R: { axis: 'x', layer: 1, angle: -Math.PI / 2, color: '#ee4b45', normal: [1, 0, 0] },
  F: { axis: 'z', layer: 1, angle: -Math.PI / 2, color: '#18ab70', normal: [0, 0, 1] },
  D: { axis: 'y', layer: -1, angle: Math.PI / 2, color: '#ffd443', normal: [0, -1, 0] },
  L: { axis: 'x', layer: -1, angle: Math.PI / 2, color: '#ff9138', normal: [-1, 0, 0] },
  B: { axis: 'z', layer: -1, angle: Math.PI / 2, color: '#3778ec', normal: [0, 0, -1] },
};

export function faceletIndex(face, position) {
  const { x, y, z } = position;
  const coordinates = {
    U: [z + 1, x + 1], R: [1 - y, 1 - z], F: [1 - y, x + 1],
    D: [1 - z, x + 1], L: [1 - y, z + 1], B: [1 - y, 1 - x],
  };
  const [row, column] = coordinates[face];
  return FACE_ORDER.indexOf(face) * 9 + row * 3 + column;
}

export function createScramble(length = 20) {
  const moves = [];
  const suffixes = ['', "'", '2'];
  let previousAxis;
  for (let index = 0; index < length; index += 1) {
    const candidates = FACE_ORDER.filter((face) => FACES[face].axis !== previousAxis);
    const face = candidates[Math.floor(Math.random() * candidates.length)];
    moves.push(face + suffixes[Math.floor(Math.random() * suffixes.length)]);
    previousAxis = FACES[face].axis;
  }
  return moves;
}

export class GameState {
  constructor() {
    this.cube = new Cube();
    this.history = [];
    this.future = [];
    this.moves = 0;
  }

  apply(move, mode = 'normal') {
    this.cube.move(move);
    if (mode === 'undo') {
      this.future.push(this.history.pop());
      this.moves = Math.max(0, this.moves - 1);
    } else {
      this.history.push(move);
      if (mode === 'redo') this.future.pop();
      else this.future = [];
      if (mode !== 'scramble') this.moves += 1;
    }
  }

  beginScramble() {
    this.history = [];
    this.future = [];
    this.moves = 0;
  }

  reset() {
    this.cube.identity();
    this.beginScramble();
  }

  get undoMove() {
    return this.history.length ? Cube.inverse(this.history.at(-1)) : null;
  }

  get redoMove() {
    return this.future.at(-1) ?? null;
  }
}