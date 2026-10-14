import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createIcons, Box, Move3d, Scan, Minus, Plus, Orbit, Maximize, Shuffle, ArrowUpRight, Sparkles, Undo2, Redo2, RotateCw, RotateCcw, Asterisk, MessageCircle } from 'lucide';
import { GameState, FACES, FACE_ORDER, faceletIndex, createScramble } from './cube-state.js';

createIcons({ icons: { Box, Move3d, Scan, Minus, Plus, Orbit, Maximize, Shuffle, ArrowUpRight, Sparkles, Undo2, Redo2, RotateCw, RotateCcw, Asterisk, MessageCircle } });

const element = (id) => document.getElementById(id);
const game = new GameState();
const container = element('canvas-container');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
} catch {
  element('loading').textContent = 'No se pudo iniciar la vista 3D. Activa WebGL o prueba con otro navegador.';
  document.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  throw new Error('WebGL no disponible');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'Cubo Rubik 3D');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
const initialCamera = new THREE.Vector3(6.8, 5.6, 8.1);
camera.position.copy(initialCamera);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = .08;
orbit.enablePan = false;
orbit.minDistance = 7;
orbit.maxDistance = 19;
orbit.minPolarAngle = .02;
orbit.maxPolarAngle = Math.PI - .02;
orbit.autoRotateSpeed = 1.1;
orbit.target.set(0, 0, 0);
orbit.update();

scene.add(new THREE.HemisphereLight(0xffffff, 0x68715c, 3));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(-3, 7, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -5;
keyLight.shadow.camera.right = 5;
keyLight.shadow.camera.top = 5;
keyLight.shadow.camera.bottom = -5;
keyLight.shadow.normalBias = .04;
keyLight.shadow.radius = 4;
scene.add(keyLight);
const fill = new THREE.DirectionalLight(0xffffff, 1.1);
fill.position.set(5, 2, -4);
scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .13 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.1;
floor.receiveShadow = true;
scene.add(floor);

const root = new THREE.Group();
scene.add(root);
const bodyGeometry = new RoundedBoxGeometry(.96, .96, .96, 3, .075);
const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#222522', roughness: .42, metalness: .05 });
const stickerShape = new THREE.Shape();
const half = .41;
const radius = .055;
stickerShape.moveTo(-half + radius, -half);
stickerShape.lineTo(half - radius, -half);
stickerShape.quadraticCurveTo(half, -half, half, -half + radius);
stickerShape.lineTo(half, half - radius);
stickerShape.quadraticCurveTo(half, half, half - radius, half);
stickerShape.lineTo(-half + radius, half);
stickerShape.quadraticCurveTo(-half, half, -half, half - radius);
stickerShape.lineTo(-half, -half + radius);
stickerShape.quadraticCurveTo(-half, -half, -half + radius, -half);
const stickerGeometry = new THREE.ShapeGeometry(stickerShape, 10);
const stickerMaterials = Object.fromEntries(FACE_ORDER.map((face) => [face, new THREE.MeshStandardMaterial({ color: FACES[face].color, roughness: .32, metalness: .02 })]));
const cubies = [];
const stickers = [];

function buildCube() {
  root.clear();
  cubies.length = 0;
  stickers.length = 0;
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        if (x === 0 && y === 0 && z === 0) continue;
        const cubie = new THREE.Group();
        cubie.position.set(x, y, z);
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        body.receiveShadow = true;
        cubie.add(body);
        for (const face of FACE_ORDER) {
          const config = FACES[face];
          if (cubie.position[config.axis] !== config.layer) continue;
          const sticker = new THREE.Mesh(stickerGeometry, stickerMaterials[face]);
          sticker.position.fromArray(config.normal).multiplyScalar(.487);
          sticker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...config.normal));
          sticker.userData = { face, normal: new THREE.Vector3(...config.normal), cubie };
          cubie.add(sticker);
          stickers.push(sticker);
        }
        root.add(cubie);
        cubies.push(cubie);
      }
    }
  }
}
buildCube();

let currentTurn = null;
let busy = false;
let direction = 1;
let generation = 0;
let startTime = null;
let elapsed = 0;
let solverWorker = null;
let toastTimeout;

function toast(message) {
  clearTimeout(toastTimeout);
  element('toast').textContent = message;
  element('toast').classList.add('visible');
  toastTimeout = setTimeout(() => element('toast').classList.remove('visible'), 3300);
}

function updateUI() {
  const solved = game.cube.isSolved();
  element('move-count').replaceChildren(document.createTextNode(String(game.moves)));
  const unit = document.createElement('span');
  unit.className = 'stat-unit';
  unit.textContent = ' giros';
  element('move-count').appendChild(unit);
  element('status').replaceChildren(document.createElement('span'), document.createTextNode(busy ? 'En movimiento' : solved ? 'Resuelto' : 'En juego'));
  element('status').classList.toggle('unsolved', !solved);
  element('session-label').textContent = busy ? 'Cada giro cuenta.' : solved ? 'Todo en su lugar.' : 'Un giro más cerca.';
  element('undo').disabled = busy || !game.undoMove;
  element('redo').disabled = busy || !game.redoMove;
  element('scramble').disabled = busy;
  element('solve').disabled = busy || solved;
  document.querySelectorAll('.face-button').forEach((button) => { button.disabled = busy; });
  const history = element('history');
  history.replaceChildren();
  if (game.history.length) {
    for (const move of game.history.slice(-7)) {
      const token = document.createElement('span');
      token.className = 'move-token';
      token.textContent = move.replace("'", '′');
      history.appendChild(token);
    }
  } else {
    const empty = document.createElement('span');
    empty.className = 'empty-history';
    empty.textContent = 'Sin movimientos todavía';
    history.appendChild(empty);
  }
}

function updateTimer() {
  const total = Math.floor((elapsed + (startTime === null ? 0 : performance.now() - startTime)) / 1000);
  element('timer').textContent = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function animateMove(move, quick = false) {
  return new Promise((resolve) => {
    const config = FACES[move[0]];
    const group = new THREE.Group();
    root.add(group);
    const selected = cubies.filter((cubie) => Math.round(cubie.position[config.axis]) === config.layer);
    selected.forEach((cubie) => group.attach(cubie));
    const multiplier = move.endsWith('2') ? 2 : move.endsWith("'") ? -1 : 1;
    const speed = Number(element('speed').value);
    currentTurn = { group, selected, axis: config.axis, angle: config.angle * multiplier, start: performance.now(), duration: reducedMotion ? 1 : quick ? 105 : [0, 480, 260, 130][speed], resolve };
  });
}

async function executeMoves(moves, mode = 'normal', ownGeneration = generation) {
  if (busy && mode !== 'solution') return;
  busy = true;
  if (mode === 'scramble') { game.beginScramble(); startTime = null; elapsed = 0; }
  else if (startTime === null && !game.cube.isSolved()) startTime = performance.now();
  updateUI();
  for (const move of moves) {
    if (ownGeneration !== generation) return;
    const completed = await animateMove(move, mode === 'scramble');
    if (!completed || ownGeneration !== generation) return;
    game.apply(move, mode);
    if (mode !== 'scramble' && startTime === null && !game.cube.isSolved()) startTime = performance.now();
    updateUI();
  }
  if (mode === 'scramble') {
    game.history = [];
    game.future = [];
    startTime = performance.now();
  }
  if (game.cube.isSolved() && startTime !== null) {
    elapsed += performance.now() - startTime;
    startTime = null;
    if (mode !== 'undo') toast('¡Cubo resuelto! Todas las caras en su lugar.');
  }
  busy = false;
  updateUI();
  updateTimer();
}

function moveFace(face) {
  if (busy) return;
  void executeMoves([face + (direction === -1 ? "'" : '')]);
}

document.querySelectorAll('[data-face]').forEach((button) => button.addEventListener('click', () => moveFace(button.dataset.face)));
document.querySelectorAll('[data-direction]').forEach((button) => button.addEventListener('click', () => {
  direction = Number(button.dataset.direction);
  document.querySelectorAll('[data-direction]').forEach((item) => {
    const active = Number(item.dataset.direction) === direction;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
}));
element('scramble').addEventListener('click', () => { void executeMoves(createScramble(), 'scramble'); });
element('undo').addEventListener('click', () => { if (!busy && game.undoMove) void executeMoves([game.undoMove], 'undo'); });
element('redo').addEventListener('click', () => { if (!busy && game.redoMove) void executeMoves([game.redoMove], 'redo'); });
element('speed').addEventListener('input', () => { element('speed-label').textContent = ['Lenta', 'Normal', 'Rápida'][Number(element('speed').value) - 1]; });

element('solve').addEventListener('click', async () => {
  if (busy || game.cube.isSolved()) return;
  busy = true;
  const ownGeneration = generation;
  updateUI();
  element('session-label').textContent = 'Calculando solución...';
  toast('Buscando el camino de vuelta...');
  try {
    solverWorker ??= new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' });
    const solution = await new Promise((resolve, reject) => {
      solverWorker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.solution);
      solverWorker.onerror = () => reject(new Error('No se pudo iniciar el solucionador'));
      solverWorker.postMessage(game.cube.asString());
    });
    if (ownGeneration !== generation) return;
    await executeMoves(solution.split(/\s+/).filter(Boolean), 'solution', ownGeneration);
  } catch {
    if (ownGeneration !== generation) return;
    busy = false;
    solverWorker?.terminate();
    solverWorker = null;
    updateUI();
    toast('No se pudo calcular la solución. Inténtalo de nuevo.');
  }
});

element('reset').addEventListener('click', () => {
  generation += 1;
  currentTurn?.resolve(false);
  currentTurn = null;
  solverWorker?.terminate();
  solverWorker = null;
  busy = false;
  game.reset();
  buildCube();
  startTime = null;
  elapsed = 0;
  updateTimer();
  updateUI();
  toast('Una nueva partida.');
});

element('view-reset').addEventListener('click', () => {
  orbit.reset();
  camera.position.copy(initialCamera);
  orbit.target.set(0, 0, 0);
  orbit.update();
});
function zoom(factor) {
  const offset = camera.position.clone().sub(orbit.target);
  offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, orbit.minDistance, orbit.maxDistance));
  camera.position.copy(orbit.target).add(offset);
  orbit.update();
}
element('zoom-in').addEventListener('click', () => zoom(.87));
element('zoom-out').addEventListener('click', () => zoom(1.15));
element('auto-rotate').addEventListener('click', () => {
  orbit.autoRotate = !orbit.autoRotate;
  element('auto-rotate').classList.toggle('active', orbit.autoRotate);
  element('auto-rotate').setAttribute('aria-pressed', String(orbit.autoRotate));
});
element('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector('.stage').requestFullscreen();
  } catch { toast('La pantalla completa no está disponible en este navegador.'); }
});
function applyBotpressStyles() {
  const root = document.querySelector('#fab-root')?.shadowRoot;
  if (!root) return false;
  if (!root.querySelector('style[data-cubo-botpress]')) {
    const style = document.createElement('style');
    style.dataset.cuboBotpress = '';
    style.textContent = `
      .bpFab { display: none !important; }
      .bpWebchat { left: 20px !important; right: auto !important; bottom: 20px !important; transform-origin: bottom left !important; }
      @media (max-width: 700px) {
        .bpWebchat { left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100% !important; height: 100dvh !important; max-height: none !important; border-radius: 0 !important; }
      }
    `;
    root.appendChild(style);
  }
  return true;
}

if (!applyBotpressStyles()) {
  const botpressStylePoll = window.setInterval(() => {
    if (applyBotpressStyles()) window.clearInterval(botpressStylePoll);
  }, 100);
  window.setTimeout(() => window.clearInterval(botpressStylePoll), 30000);
}

element('ai-toggle').addEventListener('click', () => {
  if (typeof window.botpress?.open !== 'function') {
    toast('El asistente de IA no está disponible en este momento.');
    return;
  }
  window.botpress.open();
});

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement || event.ctrlKey || event.metaKey || event.altKey || event.repeat || busy) return;
  const face = event.key.toUpperCase();
  if (FACES[face]) {
    event.preventDefault();
    void executeMoves([face + (event.shiftKey ? "'" : direction === -1 ? "'" : '')]);
  }
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let gesture = null;
const pointers = new Set();
function raycast(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(stickers, false)[0];
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointers.add(event.pointerId);
  if (pointers.size > 1) { gesture = null; orbit.enabled = true; return; }
  if (event.button !== 0 || event.altKey || busy) return;
  const hit = raycast(event);
  if (!hit) return;
  gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, hit };
  renderer.domElement.setPointerCapture(event.pointerId);
}, { capture: true });

renderer.domElement.addEventListener('pointerdown', () => {
  if (gesture && pointers.size === 1) orbit.enabled = false;
});

function endGesture(event) {
  pointers.delete(event.pointerId);
  if (!gesture || event.pointerId !== gesture.pointerId) { orbit.enabled = true; return; }
  const { x, y, hit } = gesture;
  gesture = null;
  orbit.enabled = true;
  if (event.type === 'pointercancel' || busy) return;
  const delta = new THREE.Vector2(event.clientX - x, event.clientY - y);
  if (delta.length() < 14) return;
  const normal = hit.object.userData.normal.clone().applyQuaternion(hit.object.userData.cubie.quaternion).round();
  const bounds = renderer.domElement.getBoundingClientRect();
  const origin = hit.point.clone().project(camera);
  let best = null;
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(normal[axis]) === 1) continue;
    const tangent = new THREE.Vector3();
    tangent[axis] = 1;
    const projected = hit.point.clone().add(tangent).project(camera);
    const screen = new THREE.Vector2((projected.x - origin.x) * bounds.width, -(projected.y - origin.y) * bounds.height).normalize();
    const score = delta.dot(screen);
    if (!best || Math.abs(score) > Math.abs(best.score)) best = { tangent, score };
  }
  const rotation = normal.clone().cross(best.tangent).multiplyScalar(Math.sign(best.score));
  const axis = ['x', 'y', 'z'].find((key) => Math.abs(rotation[key]) > .5);
  const layer = Math.round(hit.object.userData.cubie.position[axis]);
  if (layer === 0) {
    const face = FACE_ORDER.find((key) => FACES[key].normal.every((value, index) => value === normal.getComponent(index)));
    void executeMoves([face + (best.score < 0 ? "'" : '')]);
    return;
  }
  const face = FACE_ORDER.find((key) => FACES[key].axis === axis && FACES[key].layer === layer);
  const inverse = Math.sign(FACES[face].angle) !== Math.sign(rotation[axis]);
  void executeMoves([face + (inverse ? "'" : '')]);
}
renderer.domElement.addEventListener('pointerup', endGesture);
renderer.domElement.addEventListener('pointercancel', endGesture);

const resize = new ResizeObserver(() => {
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
resize.observe(container);

function render(now) {
  if (currentTurn) {
    const turn = currentTurn;
    const progress = Math.min(1, (now - turn.start) / turn.duration);
    const eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    turn.group.rotation[turn.axis] = turn.angle * eased;
    if (progress === 1) {
      turn.group.updateMatrixWorld(true);
      turn.selected.forEach((cubie) => {
        root.attach(cubie);
        cubie.position.round();
        const rotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(cubie.quaternion);
        rotationMatrix.elements = rotationMatrix.elements.map((value) => Math.round(value));
        cubie.quaternion.setFromRotationMatrix(rotationMatrix).normalize();
      });
      root.remove(turn.group);
      currentTurn = null;
      turn.resolve(true);
    }
  }
  orbit.update();
  updateTimer();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
updateUI();
element('loading').classList.add('hidden');
requestAnimationFrame(render);

function visualState() {
  const colors = Array(54);
  for (const sticker of stickers) {
    const normal = sticker.userData.normal.clone().applyQuaternion(sticker.userData.cubie.quaternion).round();
    const face = FACE_ORDER.find((key) => FACES[key].normal.every((value, index) => value === normal.getComponent(index)));
    colors[faceletIndex(face, sticker.userData.cubie.position)] = sticker.userData.face;
  }
  return colors.join('');
}

if (import.meta.env.DEV) {
  window.__cubeDebug = () => ({ busy, solved: game.cube.isSolved(), moves: game.moves, state: game.cube.asString(), visual: currentTurn ? null : visualState(), camera: camera.position.toArray(), stickers: stickers.length });
}