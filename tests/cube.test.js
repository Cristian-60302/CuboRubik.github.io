import test from 'node:test';
import assert from 'node:assert/strict';
import Cube from 'cubejs';
import * as THREE from 'three';
import { GameState, FACES, FACE_ORDER, faceletIndex, createScramble } from '../src/cube-state.js';

function createStickers() {
  const stickers = [];
  for (const face of FACE_ORDER) {
    const config = FACES[face];
    for (let first = -1; first <= 1; first += 1) {
      for (let second = -1; second <= 1; second += 1) {
        const position = new THREE.Vector3();
        const otherAxes = ['x', 'y', 'z'].filter((axis) => axis !== config.axis);
        position[config.axis] = config.layer;
        position[otherAxes[0]] = first;
        position[otherAxes[1]] = second;
        stickers.push({ position, normal: new THREE.Vector3(...config.normal), color: face });
      }
    }
  }
  return stickers;
}

function visualString(stickers) {
  const colors = Array(54);
  for (const sticker of stickers) {
    const face = FACE_ORDER.find((key) => new THREE.Vector3(...FACES[key].normal).equals(sticker.normal));
    colors[faceletIndex(face, sticker.position)] = sticker.color;
  }
  return colors.join('');
}

test('Cada giro visual coincide con el estado de cubejs', () => {
  const stickers = createStickers();
  const cube = new Cube();
  const algorithm = [...FACE_ORDER, ...FACE_ORDER.map((face) => `${face}'`), ...FACE_ORDER.map((face) => `${face}2`), ...createScramble(60)];
  for (const move of algorithm) {
    const config = FACES[move[0]];
    const angle = config.angle * (move.endsWith('2') ? 2 : move.endsWith("'") ? -1 : 1);
    const axis = new THREE.Vector3();
    axis[config.axis] = 1;
    for (const sticker of stickers.filter((item) => item.position[config.axis] === config.layer)) {
      sticker.position.applyAxisAngle(axis, angle).round();
      sticker.normal.applyAxisAngle(axis, angle).round();
    }
    cube.move(move);
    assert.equal(visualString(stickers), cube.asString(), move);
  }
});

test('Los giros y sus inversos restauran el cubo', () => {
  for (const face of FACE_ORDER) {
    const game = new GameState();
    game.apply(face);
    assert.equal(game.cube.isSolved(), false);
    game.apply(`${face}'`);
    assert.equal(game.cube.isSolved(), true);
    game.apply(`${face} ${face} ${face} ${face}`);
    assert.equal(game.cube.isSolved(), true);
  }
});

test('Deshacer, rehacer y reiniciar conservan el historial', () => {
  const game = new GameState();
  game.apply('R');
  game.apply('U');
  const expected = game.cube.asString();
  game.apply(game.undoMove, 'undo');
  assert.equal(game.moves, 1);
  assert.equal(game.redoMove, 'U');
  game.apply(game.redoMove, 'redo');
  assert.equal(game.cube.asString(), expected);
  game.apply(game.undoMove, 'undo');
  game.apply('F');
  assert.equal(game.redoMove, null);
  game.reset();
  assert.equal(game.cube.isSolved(), true);
  assert.equal(game.moves, 0);
  assert.deepEqual(game.history, []);
});

test('Las mezclas son válidas y su inversa las resuelve', () => {
  const game = new GameState();
  const scramble = createScramble();
  for (const move of scramble) game.apply(move, 'scramble');
  assert.equal(scramble.length, 20);
  assert.equal(game.moves, 0);
  assert.equal(game.cube.isSolved(), false);
  game.cube.move(Cube.inverse(scramble.join(' ')));
  assert.equal(game.cube.isSolved(), true);
});

test('Volver a mezclar limpia las estadísticas sin cambiar el estado inicial', () => {
  const game = new GameState();
  game.apply('R');
  game.apply('U');
  game.apply(game.undoMove, 'undo');
  const previousState = game.cube.asString();
  game.beginScramble();
  assert.equal(game.moves, 0);
  assert.equal(game.undoMove, null);
  assert.equal(game.redoMove, null);
  assert.equal(game.cube.asString(), previousState);
  for (const move of createScramble()) game.apply(move, 'scramble');
  assert.equal(game.moves, 0);
});