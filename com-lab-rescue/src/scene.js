import * as THREE from '../vendor/three.module.js';

/**
 * Original, procedural COM LAB RESCUE artwork. No downloaded models or textures.
 * Game progress is supplied by setState; meshes are presentation only.
 */
const COLORS = {
  ink: 0x171717,
  paper: 0xfffdf5,
  yellow: 0xfbe34a,
  cyan: 0x51d6e4,
  pink: 0xff91bb,
  lime: 0xc8f36a,
  concrete: 0xe1ded2,
  grey: 0x8a938f,
};
const STATION_COLORS = [COLORS.yellow, COLORS.cyan, COLORS.pink];
const STATION_NAMES = ['I / O', 'CORE', 'SAFE'];
const STATION_LABELS = ['ต่ออุปกรณ์', 'ซ่อมเครื่องหลัก', 'เปิดห้องอย่างปลอดภัย'];
const STATION_X = [-3.9, 0, 3.9];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const defer = (fn) => typeof queueMicrotask === 'function' ? queueMicrotask(fn) : Promise.resolve().then(fn);

function normalizeState(current, next = {}) {
  return {
    stage: Number.isFinite(next.stage) ? clamp(Math.floor(next.stage), 0, 2) : current.stage,
    completed: Array.isArray(next.completed)
      ? [0, 1, 2].map((i) => clamp(Number(next.completed[i]) || 0, 0, 4))
      : current.completed,
    active: typeof next.active === 'boolean' ? next.active : current.active,
    mode: ['home', 'play', 'results'].includes(next.mode) ? next.mode : current.mode,
    color: typeof next.color === 'string' && /^#[0-9a-f]{6}$/i.test(next.color)
      ? next.color : current.color,
  };
}

function createFallback(container, callbacks, initialState) {
  let state = initialState;
  const root = document.createElement('div');
  root.className = 'lab-fallback';
  root.setAttribute('aria-label', 'ห้องคอมแบบภาพเบา');
  Object.assign(root.style, {
    width: '100%', height: '100%', minHeight: '0', boxSizing: 'border-box',
    padding: '8px 12px 10px', display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto',
    gap: '7px', color: '#171717',
  });

  // Original vector diorama, generated from the same room vocabulary as the 3D
  // scene. It needs no canvas, GPU, external image, font download or animation.
  const ink = '#171717', paper = '#FFFDF5', lime = '#C8F36A';
  const accents = ['#FBE34A', '#51D6E4', '#FF91BB'];
  const project = (x, y, z) => [380 + (x - z) * 28, 250 + (x + z) * 14 - y * 31];
  const points = (vertices) => vertices.map((v) => project(...v).map((n) => n.toFixed(1)).join(',')).join(' ');
  const polygon = (vertices, fill, attributes = '') =>
    '<polygon points="' + points(vertices) + '" fill="' + fill + '" stroke="' + ink + '" stroke-width="2.8" stroke-linejoin="round" ' + attributes + '/>';
  const line = (vertices, color = ink, width = 2, attributes = '') =>
    '<polyline points="' + points(vertices) + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linejoin="round" stroke-linecap="round" ' + attributes + '/>';
  const cube = (x, y, z, w, h, d, top, front = top, side = top, attributes = '') => {
    const a = x - w / 2, b = x + w / 2, c = z - d / 2, e = z + d / 2, t = y + h;
    return polygon([[a, y, e], [b, y, e], [b, t, e], [a, t, e]], front, attributes)
      + polygon([[b, y, c], [b, y, e], [b, t, e], [b, t, c]], side, attributes)
      + polygon([[a, t, c], [b, t, c], [b, t, e], [a, t, e]], top, attributes);
  };
  const circle = (x, y, z, radius, fill, attributes = '') => {
    const [sx, sy] = project(x, y, z);
    return '<circle cx="' + sx.toFixed(1) + '" cy="' + sy.toFixed(1) + '" r="' + radius
      + '" fill="' + fill + '" stroke="' + ink + '" stroke-width="2.2" ' + attributes + '/>';
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('viewBox', '0 0 760 440');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'ห้องคอมมุมเฉียง มีโต๊ะซ่อมสามสถานีและหุ่นยนต์ Bit');
  Object.assign(svg.style, { width: '100%', height: '100%', display: 'block', minHeight: '0', overflow: 'visible' });
  let art = '<title>COM LAB RESCUE — ห้องซ่อมคอมของ Bit</title>';
  // Hard print-like shadow, bright plinth, and paper floor.
  art += '<g transform="translate(7 9)">' + polygon([[-6.1, -.2, -4.4], [6.1, -.2, -4.4], [6.1, -.2, 4.4], [-6.1, -.2, 4.4]], ink) + '</g>';
  art += cube(0, -.25, 0, 12.2, .25, 8.8, paper, '#FBE34A', '#51D6E4');
  for (let x = -5; x <= 5; x += 1.4) art += line([[x, .01, -4.3], [x, .01, 4.3]], '#D3D2C5', .9);
  for (let z = -3.5; z < 4; z += 1.4) art += line([[-6, .01, z], [6, .01, z]], '#D3D2C5', .9);
  // Cutaway rear walls and their black upper rails.
  art += polygon([[-6.1, 0, 4.4], [-6.1, 0, -4.4], [-6.1, 2.9, -4.4], [-6.1, 2.9, 4.4]], '#F0EDE2');
  art += polygon([[-6.1, 0, -4.4], [6.1, 0, -4.4], [6.1, 2.9, -4.4], [-6.1, 2.9, -4.4]], paper);
  art += line([[-6.1, 2.9, 4.4], [-6.1, 2.9, -4.4], [6.1, 2.9, -4.4]], ink, 5);
  art += line([[-6.08, .18, 4.3], [-6.08, .18, -4.35], [6.05, .18, -4.35]], ink, 3);
  // Window, mullions, sill, and wall cabling.
  art += polygon([[-6.04, 1.05, .5], [-6.04, 1.05, -2.8], [-6.04, 2.35, -2.8], [-6.04, 2.35, .5]], '#51D6E4');
  art += line([[-6.02, 1.05, -1.15], [-6.02, 2.35, -1.15]], ink, 3);
  art += line([[-6.02, 1.7, .5], [-6.02, 1.7, -2.8]], ink, 3);
  art += cube(-5.9, .98, -1.15, .42, .12, 3.65, '#FBE34A', ink, ink);
  art += line([[-5.4, 2.05, -4.34], [5.5, 2.05, -4.34]], ink, 3);
  art += line([[-5.4, 1.97, -4.33], [5.5, 1.97, -4.33]], '#51D6E4', 2.5);
  const [titleX, titleY] = project(-.2, 2.52, -4.3);
  art += '<g transform="translate(' + titleX.toFixed(1) + ' ' + titleY.toFixed(1) + ') rotate(26.565)">'
    + '<rect x="-78" y="-16" width="156" height="32" fill="#FBE34A" stroke="' + ink + '" stroke-width="3"/>'
    + '<text x="0" y="6" text-anchor="middle" fill="' + ink + '" font-family="Arial Black,Arial,sans-serif" font-size="20" font-weight="900">COM LAB</text></g>';
  // Floor repair paths run to the safe aisle.
  for (let i = 0; i < 3; i++) {
    const x = STATION_X[i] - .55;
    art += line([[x, .03, 1.95], [x, .03, -.1]], ink, 7);
    art += line([[x, .04, 1.95], [x, .04, -.1]], accents[i], 4);
  }
  for (let i = 0; i < 3; i++) {
    const x = STATION_X[i], z = -1.7, accent = accents[i];
    art += '<g data-fallback-station="' + i + '">';
    // Legs, worktop and a miniature computer.
    for (const dx of [-1.18, 1.18]) for (const dz of [-.55, .55])
      art += cube(x + dx, 0, z + dz, .11, 1.05, .11, ink);
    art += cube(x, 1.04, z, 3.05, .16, 1.68, accent, paper, ink);
    art += cube(x - .05, 1.21, z - .32, .5, .055, .37, ink);
    art += cube(x - .05, 1.25, z - .45, .095, .29, .08, ink);
    art += cube(x - .05, 1.49, z - .43, 1.38, .93, .16, ink);
    art += polygon([[x - .62, 1.62, z - .335], [x + .52, 1.62, z - .335],
      [x + .52, 2.29, z - .335], [x - .62, 2.29, z - .335]], accent, 'data-fallback-screen="' + i + '"');
    const [screenX, screenY] = project(x - .05, 1.91, z - .31);
    art += '<text data-fallback-count="' + i + '" x="' + screenX.toFixed(1) + '" y="' + screenY.toFixed(1)
      + '" text-anchor="middle" fill="' + ink + '" font-family="Arial, sans-serif" font-size="13" font-weight="900" transform="rotate(26.565 '
      + screenX.toFixed(1) + ' ' + screenY.toFixed(1) + ')">0/4</text>';
    // Keyboard rows and mouse are flat marks on the worktop.
    art += cube(x - .12, 1.22, z + .45, .85, .035, .32, ink);
    for (let row = 0; row < 3; row++)
      art += line([[x - .46, 1.266, z + .34 + row * .09], [x + .22, 1.266, z + .34 + row * .09]], paper, 1.3);
    art += circle(x + .59, 1.25, z + .45, 4.2, ink);
    // Four visible progress lamps.
    for (let j = 0; j < 4; j++) art += circle(x - .45 + j * .3, 1.08, z + .87, 3, paper,
      'data-fallback-progress="' + i + '" data-step="' + j + '"');
    // Peripherals, chips, and shield make the three stations distinct.
    if (i === 0) {
      art += cube(x - 1.09, 1.2, z -.22, .31, .51, .3, ink);
      art += circle(x - 1.09, 1.49, z - .055, 4.4, '#51D6E4');
      art += line([[x + 1.05, 1.25, z + .3], [x + 1.05, 1.75, z + .3]], ink, 3.5);
      art += circle(x + 1.05, 1.77, z + .3, 5, ink);
      art += cube(x - 1.02, 0, z + .03, .55, .61, .6, paper, paper, '#E2DFD1');
    } else if (i === 1) {
      art += cube(x - 1.02, 1.22, z + .12, .62, .055, .69, lime, lime, ink);
      art += cube(x - 1.06, 1.285, z + .02, .28, .12, .28, paper, ink, ink);
      art += cube(x - .77, 1.28, z + .06, .06, .22, .45, lime, lime, ink);
      art += cube(x + 1.02, 1.22, z + .12, .44, .07, .58, '#FBE34A', paper, ink);
      art += cube(x + .86, 0, z -.1, .54, .82, .65, ink, paper, '#D2D5CB');
      art += circle(x + .86, .49, z + .24, 6.4, '#51D6E4');
    } else {
      art += cube(x - 1.01, 1.22, z + .05, .59, .2, .48, paper, paper, ink);
      for (const dx of [-.2, .2]) art += line([[x - 1.01 + dx, 1.43, z -.08], [x - 1.01 + dx, 1.82, z -.08]], ink, 2.4);
      const [shieldX, shieldY] = project(x + 1, 1.69, z + .02);
      art += '<g transform="translate(' + shieldX.toFixed(1) + ' ' + shieldY.toFixed(1) + ')">'
        + '<path d="M-11-15H11L10 5Q7 14 0 18Q-7 14-10 5Z" fill="' + lime + '" stroke="' + ink + '" stroke-width="2.8"/>'
        + '<path d="M-5 0L-1 5L6-5" fill="none" stroke="' + ink + '" stroke-width="3"/></g>';
    }
    // Number tab above each physical repair desk.
    const [markerX, markerY] = project(x - 1.25, 2.37, z + .04);
    art += '<g transform="translate(' + markerX.toFixed(1) + ' ' + markerY.toFixed(1) + ')">'
      + '<path d="M-11-16H11V11H4L0 16L-4 11H-11Z" fill="' + accent + '" stroke="' + ink + '" stroke-width="2.5"/>'
      + '<text x="0" y="4" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="17" font-weight="900" fill="' + ink + '">' + (i + 1) + '</text></g>';
    art += '</g>';
  }
  // A small rolling stool and a potted plant at the front of the classroom.
  art += cube(4.75, .55, .48, .68, .13, .65, '#FF91BB', ink, ink);
  art += line([[4.75, .55, .48], [4.75, .13, .48]], ink, 5);
  art += line([[4.45, .1, .2], [5.05, .1, .76]], ink, 4);
  art += line([[4.45, .1, .76], [5.05, .1, .2]], ink, 4);
  art += cube(-4.9, .03, 2.68, .6, .48, .6, ink, '#FF91BB', '#FF91BB');
  const [plantX, plantY] = project(-4.9, .56, 2.68);
  art += '<g transform="translate(' + plantX.toFixed(1) + ' ' + plantY.toFixed(1) + ')">'
    + '<path d="M0 2L-5-31M0 2L13-24M0 2L-17-16" stroke="' + ink + '" stroke-width="2.8" fill="none"/>'
    + '<ellipse cx="-9" cy="-26" rx="7" ry="15" transform="rotate(-30 -9 -26)" fill="' + lime + '" stroke="' + ink + '" stroke-width="2.1"/>'
    + '<ellipse cx="12" cy="-23" rx="7" ry="14" transform="rotate(31 12 -23)" fill="' + lime + '" stroke="' + ink + '" stroke-width="2.1"/>'
    + '<ellipse cx="-17" cy="-13" rx="7" ry="11" transform="rotate(-50 -17 -13)" fill="#51D6E4" stroke="' + ink + '" stroke-width="2.1"/></g>';
  // Bit's two-layer body, wheels, face and antenna are all original vector shapes.
  const rx = -.55, rz = 2.05;
  const [robotAnchorX, robotAnchorY] = project(rx, 0, rz);
  art += '<g transform="translate(' + robotAnchorX.toFixed(1) + ' ' + robotAnchorY.toFixed(1)
    + ') scale(1.22) translate(' + (-robotAnchorX).toFixed(1) + ' ' + (-robotAnchorY).toFixed(1) + ')">';
  for (const dx of [-.46, .46]) for (const dz of [-.24, .24]) art += circle(rx + dx, .17, rz + dz, 6.5, ink);
  art += cube(rx, .15, rz, .89, .2, .76, ink);
  art += cube(rx, .4, rz, .86, .69, .61, '#51D6E4', '#51D6E4', '#51D6E4', 'data-fallback-robot-color="true"');
  art += polygon([[rx -.34, .57, rz + .32], [rx + .34, .57, rz + .32],
    [rx + .34, .98, rz + .32], [rx -.34, .98, rz + .32]], ink);
  for (const dx of [-.16, .16]) {
    const [eyeX, eyeY] = project(rx + dx, .83, rz + .33);
    art += '<circle cx="' + eyeX.toFixed(1) + '" cy="' + eyeY.toFixed(1) + '" r="2.7" fill="' + paper + '"/>';
  }
  art += line([[rx -.07, .66, rz + .34], [rx + .07, .66, rz + .34]], lime, 2);
  art += line([[rx + .23, 1.1, rz -.06], [rx + .23, 1.41, rz -.06]], ink, 2.7);
  art += circle(rx + .23, 1.45, rz -.06, 4.3, '#FBE34A');
  for (const side of [-1, 1]) {
    art += line([[rx + side * .43, .88, rz], [rx + side * .64, .5, rz + .05]], ink, 3.2);
    art += circle(rx + side * .64, .5, rz + .05, 4.2, '#51D6E4', 'data-fallback-robot-color="true"');
  }
  art += '</g>';
  const [bitX, bitY] = project(rx, .02, rz + 1.05);
  art += '<g transform="translate(' + bitX.toFixed(1) + ' ' + bitY.toFixed(1) + ') rotate(-26.565)">'
    + '<rect x="-22" y="-11" width="44" height="22" fill="' + paper + '" stroke="' + ink + '" stroke-width="2"/>'
    + '<text x="0" y="5" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="14" font-weight="900" fill="' + ink + '">BIT</text></g>';
  svg.innerHTML = art;

  const controls = document.createElement('div');
  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    width: '100%', gap: '7px',
  });
  const buttons = STATION_LABELS.map((label, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    Object.assign(button.style, {
      background: accents[i], border: '2px solid #171717', color: ink,
      padding: '7px 4px', minHeight: '44px', minWidth: '0',
      fontFamily: 'inherit', fontWeight: '700', fontSize: 'clamp(10px, 1.2vw, 13px)',
      cursor: 'pointer', boxShadow: '3px 3px 0 #171717', lineHeight: '1.4',
    });
    button.addEventListener('click', () => {
      if (state.active && i === state.stage && state.completed[i] < 4) callbacks.onStation?.(i);
    });
    grid.append(button);
    return button;
  });
  const description = document.createElement('p');
  description.textContent = 'ภาพแบบเบา · เลือกสถานีเพื่อทำภารกิจ';
  Object.assign(description.style, { margin: '8px 0 0', fontSize: '10px', textAlign: 'center', lineHeight: '1.3' });
  controls.append(grid, description);
  root.append(svg, controls);
  container.append(root);
  function setState(next) {
    state = normalizeState(state, next);
    buttons.forEach((button, i) => {
      button.textContent = `${i + 1}. ${STATION_LABELS[i]} · ${state.completed[i]}/4`;
      button.disabled = !state.active || i !== state.stage || state.completed[i] >= 4;
      button.style.opacity = i > state.stage ? '.58' : '1';
      button.style.cursor = button.disabled ? 'default' : 'pointer';
      const screen = svg.querySelector('[data-fallback-screen="' + i + '"]');
      screen?.setAttribute('fill', state.completed[i] === 4 ? lime : accents[i]);
      const counter = svg.querySelector('[data-fallback-count="' + i + '"]');
      if (counter) counter.textContent = state.completed[i] === 4 ? 'OK!' : state.completed[i] + '/4';
    });
    svg.querySelectorAll('[data-fallback-progress]').forEach((lamp) => {
      const stage = Number(lamp.getAttribute('data-fallback-progress'));
      lamp.setAttribute('fill', Number(lamp.getAttribute('data-step')) < state.completed[stage] ? lime : paper);
    });
    svg.querySelectorAll('[data-fallback-robot-color]').forEach((part) => part.setAttribute('fill', state.color));
  }
  setState(state);
  return {
    setState,
    moveToStation: () => Promise.resolve(),
    celebrate: () => {}, setQuality: () => {}, resize: () => {},
    dispose: () => root.remove(),
  };
}

export function createLab(container, callbacks = {}) {
  let state = { stage: 0, completed: [0, 0, 0], active: false, mode: 'home', color: '#51D6E4' };
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (error) {
    const fallback = createFallback(container, callbacks, state);
    defer(() => { callbacks.onError?.(error); callbacks.onReady?.(); });
    return fallback;
  }

  let disposed = false;
  let fallback = null;
  let errorReported = false;
  let quality = 'high';
  let elapsed = 0;
  let lastFrame = performance.now();
  let hovered = -1;
  let movement = null;
  let movementResolve = null;
  let celebrationTime = 0;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = renderer.domElement;
  canvas.className = 'lab-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block', touchAction: 'pan-y' });
  container.append(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const room = new THREE.Group();
  scene.add(room);
  const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, .1, 120);
  camera.position.set(13.6, 13.5, 16.5);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa6a08c, 2.15));
  const sunlight = new THREE.DirectionalLight(0xffffff, 3.1);
  sunlight.position.set(-4, 13, 9);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1536, 1536);
  sunlight.shadow.camera.left = -11;
  sunlight.shadow.camera.right = 11;
  sunlight.shadow.camera.top = 10;
  sunlight.shadow.camera.bottom = -10;
  sunlight.shadow.camera.near = 1;
  sunlight.shadow.camera.far = 36;
  sunlight.shadow.normalBias = .045;
  sunlight.shadow.bias = -.00015;
  scene.add(sunlight);

  const materialCache = new Map();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
  const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: COLORS.ink });
  function material(color, emissive = false) {
    const key = `${color}:${emissive}`;
    if (!materialCache.has(key)) {
      materialCache.set(key, new THREE.MeshStandardMaterial({
        color, roughness: .92, metalness: 0,
        emissive: emissive ? color : 0x000000, emissiveIntensity: emissive ? .25 : 0,
      }));
    }
    return materialCache.get(key);
  }
  function addMesh(geometry, color, parent, position, scale, outline = false) {
    const mesh = new THREE.Mesh(geometry, color?.isMaterial ? color : material(color));
    if (position) mesh.position.set(...position);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (parent || room).add(mesh);
    if (outline) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28), edgeMaterial);
      mesh.add(edges);
    }
    return mesh;
  }
  function box(w, h, d, color, x = 0, y = 0, z = 0, parent = room, outline = false) {
    const mesh = addMesh(boxGeometry, color, parent, [x, y, z], [w, h, d], outline);
    // Tiny keycaps, printed stripes and indicator details do not need a shadow pass.
    mesh.castShadow = h > .07 && Math.max(w, d) > .09;
    return mesh;
  }
  function cylinder(radius, height, color, x, y, z, parent = room) {
    return addMesh(cylinderGeometry, color, parent, [x, y, z], [radius, height, radius]);
  }
  function ball(radius, color, x, y, z, parent = room) {
    return addMesh(sphereGeometry, color, parent, [x, y, z], [radius, radius, radius]);
  }
  function roundedGeometry(w, h, d, radius = .08) {
    const r = Math.min(radius, w / 2, d / 2), x = -w / 2, y = -d / 2;
    const shape = new THREE.Shape();
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + d - r); shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    shape.lineTo(x + r, y + d); shape.quadraticCurveTo(x, y + d, x, y + d - r);
    shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 3 });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -h / 2, 0);
    return geometry;
  }
  function rounded(w, h, d, color, x, y, z, parent = room, r = .08) {
    return addMesh(roundedGeometry(w, h, d, r), color, parent, [x, y, z]);
  }
  function textureCanvas(width, height) {
    const node = document.createElement('canvas');
    node.width = width; node.height = height;
    const ctx = node.getContext('2d');
    const texture = new THREE.CanvasTexture(node);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return { node, ctx, texture };
  }
  function paperSign(text, subtitle, width, height, color = '#FFFDF5') {
    const { ctx, texture } = textureCanvas(768, 256);
    ctx.fillStyle = '#171717'; ctx.fillRect(0, 0, 768, 256);
    ctx.fillStyle = color; ctx.fillRect(10, 10, 748, 236);
    ctx.fillStyle = '#171717'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 100px Arial, sans-serif'; ctx.fillText(text, 384, 111, 700);
    ctx.font = '700 26px monospace'; ctx.fillText(subtitle, 384, 205, 700);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    return mesh;
  }

  // A bold, open-front paper-coloured diorama on a black-edged plinth.
  rounded(13.2, .28, 8.8, COLORS.ink, 0, -.27, 0, room, .12);
  rounded(12.98, .15, 8.58, COLORS.yellow, 0, -.09, 0, room, .08);
  box(12.64, .045, 8.24, COLORS.paper, 0, .013, 0);
  for (let x = -5.6; x <= 5.61; x += 1.4) box(.014, .006, 8.12, 0xd5d4c9, x, .04, 0);
  for (let z = -3.5; z <= 3.51; z += 1.4) box(12.5, .006, .014, 0xd5d4c9, 0, .04, z);
  box(12.9, 3.4, .16, COLORS.paper, 0, 1.7, -4.14);
  box(.16, 3.4, 8.48, COLORS.paper, -6.4, 1.7, 0);
  box(13.0, .09, .21, COLORS.ink, 0, 3.41, -4.14);
  box(.21, .09, 8.53, COLORS.ink, -6.4, 3.41, 0);
  box(.09, 3.45, .22, COLORS.ink, 6.46, 1.7, -4.14);
  box(.22, 3.45, .09, COLORS.ink, -6.4, 1.7, 4.24);
  box(12.84, .14, .04, COLORS.ink, 0, .18, -4.035);
  box(.04, .14, 8.34, COLORS.ink, -6.295, .18, 0);
  // Black and yellow building trim and a visual cable bus along the rear wall.
  box(12.4, .035, .035, COLORS.ink, 0, 2.51, -4.025);
  box(12.4, .035, .035, COLORS.cyan, 0, 2.44, -4.025);
  for (let i = 0; i < 12; i++) box(.16, .13, .05, i % 2 ? COLORS.ink : COLORS.yellow, -5.9 + i * .18, .33, -4.02);
  const roomTitle = paperSign('COM LAB', 'LEARN. REPAIR. REBOOT.', 3.1, .86, '#FBE34A');
  roomTitle.position.set(-.05, 2.98, -4.035);
  room.add(roomTitle);
  const wallTag = paperSign('03', 'STATIONS / ONE MISSION', 1.15, .66, '#FF91BB');
  wallTag.position.set(4.72, 2.97, -4.03); wallTag.rotation.z = -.055; room.add(wallTag);
  const ioTag = paperSign('BIT', 'REPAIR CREW', 1.28, .66, '#C8F36A');
  ioTag.position.set(-4.82, 2.97, -4.03); ioTag.rotation.z = .055; room.add(ioTag);

  // Window: bold mullions, flat sky, and original geometric city silhouette.
  box(.1, 1.64, 2.62, COLORS.ink, -6.24, 2.08, -.8);
  box(.035, 1.45, 2.42, COLORS.cyan, -6.17, 2.08, -.8);
  box(.065, 1.49, .06, COLORS.ink, -6.12, 2.08, -.8);
  box(.065, .06, 2.45, COLORS.ink, -6.12, 2.08, -.8);
  for (let i = 0; i < 6; i++) {
    const height = [.42, .72, .35, .58, .46, .66][i];
    box(.035, height, .32, i % 2 ? 0xa8ebcf : 0xa3d5ed, -6.135, 1.36 + height / 2, -1.84 + i * .39);
  }
  box(.4, .1, 2.8, COLORS.ink, -6.1, 1.22, -.8);
  box(.4, .04, 2.8, COLORS.yellow, -6.1, 1.29, -.8);
  // Wall ventilation panel and top corner rivets.
  box(.055, .5, .75, COLORS.ink, -6.27, 2.81, 2.7);
  box(.04, .42, .65, COLORS.paper, -6.23, 2.81, 2.7);
  for (let i = 0; i < 4; i++) box(.045, .025, .49, COLORS.ink, -6.2, 2.68 + i * .085, 2.7);

  function makePlant(x, z, size = 1) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(size); room.add(group);
    cylinder(.29, .43, COLORS.ink, 0, .255, 0, group);
    cylinder(.25, .38, COLORS.pink, 0, .29, 0, group);
    cylinder(.27, .055, COLORS.ink, 0, .48, 0, group);
    cylinder(.21, .015, 0x605142, 0, .515, 0, group);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI * 2 / 6;
      const stem = cylinder(.018, .55 + (i % 2) * .2, COLORS.ink, Math.sin(angle) * .09, .77, Math.cos(angle) * .09, group);
      stem.rotation.z = Math.sin(angle) * -.24;
      const leaf = ball(.23, i % 2 ? COLORS.lime : 0x59b58b, Math.sin(angle) * .19, .96 + (i % 2) * .19, Math.cos(angle) * .19, group);
      leaf.scale.set(.23 * .65, .23 * 1.6, .23 * .6);
      leaf.rotation.z = Math.sin(angle) * -.5;
      leaf.rotation.x = Math.cos(angle) * .45;
    }
  }
  makePlant(5.55, 2.85, 1.12);
  makePlant(-5.56, -3.15, .83);
  // A shelving cart, books and a compact wall clock add a lived-in classroom feel.
  box(1.05, .08, .7, COLORS.ink, -5.55, .6, 2.42);
  box(1.05, .08, .7, COLORS.ink, -5.55, 1.26, 2.42);
  for (const x of [-5.98, -5.12]) for (const z of [2.15, 2.69]) box(.045, 1.28, .045, COLORS.ink, x, .65, z);
  box(.84, .1, .48, COLORS.pink, -5.55, .71, 2.42);
  box(.8, .08, .48, COLORS.cyan, -5.53, .81, 2.4);
  box(.77, .06, .46, COLORS.yellow, -5.57, .9, 2.43);
  for (let i = 0; i < 3; i++) box(.19, .38 + i * .03, .4, [COLORS.lime, COLORS.yellow, COLORS.paper][i], -5.8 + i * .22, 1.5, 2.41, room, true);
  const clock = new THREE.Group(); room.add(clock); clock.position.set(2.87, 2.96, -4.015);
  const clockFrame = cylinder(.24, .065, COLORS.ink, 0, 0, 0, clock); clockFrame.rotation.x = Math.PI / 2;
  const clockFace = cylinder(.205, .07, COLORS.paper, 0, 0, .01, clock); clockFace.rotation.x = Math.PI / 2;
  box(.026, .14, .02, COLORS.ink, 0, .055, .06, clock);
  box(.12, .026, .02, COLORS.ink, .045, 0, .06, clock);

  const stations = [];
  const pickables = [];
  function makeKeyboard(x, y, z, parent) {
    rounded(.75, .055, .3, COLORS.ink, x, y, z, parent, .03);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) {
      box(.065, .022, .058, row === 2 && col > 1 && col < 6 ? COLORS.cyan : COLORS.paper,
        x - .3 + col * .085, y + .037, z - .09 + row * .083, parent);
    }
  }
  function makeChair(x, z, color) {
    const chair = new THREE.Group(); chair.position.set(x, 0, z); chair.rotation.y = -.12; room.add(chair);
    cylinder(.075, .43, COLORS.ink, 0, .3, 0, chair);
    box(.66, .07, .1, COLORS.ink, 0, .1, 0, chair);
    box(.1, .07, .66, COLORS.ink, 0, .1, 0, chair);
    for (const [wx, wz] of [[-.3, 0], [.3, 0], [0, -.3], [0, .3]]) {
      const wheel = cylinder(.07, .075, COLORS.ink, wx, .07, wz, chair); wheel.rotation.z = Math.PI / 2;
    }
    rounded(.73, .12, .7, COLORS.ink, 0, .57, 0, chair, .07);
    rounded(.64, .08, .61, color, 0, .66, 0, chair, .055);
    box(.055, .66, .055, COLORS.ink, -.27, .92, .28, chair);
    box(.055, .66, .055, COLORS.ink, .27, .92, .28, chair);
    box(.72, .47, .095, COLORS.ink, 0, 1.17, .31, chair);
    box(.62, .36, .11, color, 0, 1.17, .315, chair);
  }
  const markerMaps = [];
  const screenMaps = [];
  for (let i = 0; i < 3; i++) {
    const x = STATION_X[i], color = STATION_COLORS[i];
    const group = new THREE.Group(); group.position.set(x, 0, -1.7); room.add(group);
    for (const lx of [-1.25, 1.25]) for (const lz of [-.6, .6]) {
      box(.11, 1.04, .11, COLORS.ink, lx, .54, lz, group);
      box(.16, .08, .16, COLORS.grey, lx, .08, lz, group);
    }
    box(2.7, .07, .07, COLORS.ink, 0, .45, -.6, group);
    rounded(3.15, .18, 1.78, COLORS.ink, 0, 1.1, 0, group, .09);
    rounded(3.01, .07, 1.64, color, 0, 1.225, 0, group, .055);
    const deskLabel = paperSign(`0${i + 1} / ${STATION_NAMES[i]}`, 'COM LAB / REPAIR BAY', 1.55, .33, '#FFFDF5');
    deskLabel.position.set(0, 1.08, .901); group.add(deskLabel);
    // Monitor with a strong black silhouette and a dynamic diagnostic display.
    box(.43, .06, .36, COLORS.ink, 0, 1.29, -.32, group);
    box(.09, .34, .08, COLORS.ink, 0, 1.47, -.44, group);
    box(1.45, .94, .16, COLORS.ink, 0, 1.96, -.47, group);
    box(1.34, .82, .17, COLORS.paper, 0, 1.96, -.46, group);
    const screenMap = textureCanvas(512, 288); screenMaps.push(screenMap);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.22, .685), new THREE.MeshBasicMaterial({ map: screenMap.texture }));
    screen.position.set(0, 1.99, -.366); group.add(screen);
    const powerLed = ball(.026, material(COLORS.grey, true), .55, 1.61, -.365, group);
    makeKeyboard(-.1, 1.3, .44, group);
    rounded(.18, .065, .25, COLORS.ink, .52, 1.31, .47, group, .065);
    box(.014, .016, .06, color, .52, 1.352, .43, group);
    // Four hardware lights are the visible repair progress for this station.
    const leds = [];
    for (let j = 0; j < 4; j++) {
      box(.18, .1, .08, COLORS.ink, -.45 + j * .3, .89, .91, group);
      leds.push(box(.12, .05, .02, COLORS.grey, -.45 + j * .3, .9, .958, group));
    }
    // Floor circuit path and the robot's work position.
    for (let j = 0; j < 5; j++) box(.18, .013, .21, i === 0 ? color : 0xd5d5c9, x - .55, .047, 1.92 - j * .32);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.38, .46, 24), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x - .55, .055, .52); room.add(ring);
    const markerMap = textureCanvas(192, 232); markerMaps.push(markerMap);
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerMap.texture, transparent: true, depthTest: true }));
    marker.position.set(x - 1.16, 2.54, -.94); marker.scale.set(.65, .785, 1); room.add(marker);
    marker.userData.station = i; pickables.push(marker);
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(3.18, 2.1, 1.85), new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.set(0, 1.35, 0); hitbox.userData.station = i; group.add(hitbox); pickables.push(hitbox);
    stations.push({ group, marker, ring, leds, powerLed, screen, color, lastDisplay: '', markerBaseY: 2.54 });
  }
  makeChair(STATION_X[0] + .99, .34, COLORS.yellow);
  makeChair(STATION_X[2] + .99, .34, COLORS.pink);

  // I/O bench: speaker stack, microphone, printer and paper tray.
  const io = stations[0].group;
  for (const lx of [-1.08, 1.05]) {
    box(.3, .56, .32, COLORS.ink, lx, 1.55, -.34, io);
    const speaker = cylinder(.103, .025, COLORS.cyan, lx, 1.57, -.164, io); speaker.rotation.x = Math.PI / 2;
    const tweeter = cylinder(.045, .03, COLORS.paper, lx, 1.75, -.16, io); tweeter.rotation.x = Math.PI / 2;
  }
  cylinder(.12, .045, COLORS.ink, -.99, 1.3, .47, io);
  const micStem = cylinder(.025, .26, COLORS.ink, -.99, 1.45, .47, io); micStem.rotation.z = -.12;
  const mic = ball(.095, COLORS.ink, -.97, 1.63, .47, io); mic.scale.set(.095, .095 * 1.45, .095);
  box(.025, .07, .16, COLORS.paper, -.97, 1.65, .47, io);
  const printer = new THREE.Group(); printer.position.set(-2.03, .0, -.4); io.add(printer);
  box(.63, .61, .65, COLORS.ink, 0, .37, 0, printer);
  box(.56, .5, .59, COLORS.paper, .0, .4, .0, printer);
  box(.4, .07, .36, COLORS.ink, 0, .7, -.03, printer);
  box(.34, .04, .42, COLORS.paper, 0, .76, -.11, printer);
  box(.4, .05, .17, COLORS.ink, 0, .48, .34, printer);
  box(.33, .018, .24, COLORS.paper, 0, .475, .45, printer);

  // Core bench: a motherboard, CPU fins, bright memory sticks, and SSD module.
  const core = stations[1].group;
  box(.75, .07, .79, COLORS.ink, -1.02, 1.3, .0, core);
  box(.65, .035, .69, 0x82ac6e, -1.02, 1.35, .0, core);
  box(.31, .09, .31, COLORS.ink, -1.02, 1.4, -.09, core);
  for (let f = 0; f < 5; f++) box(.23, .09, .025, COLORS.paper, -1.02, 1.49, -.2 + f * .055, core);
  for (let r = 0; r < 2; r++) {
    box(.045, .22, .45, COLORS.ink, -.77 + r * .1, 1.47, .035, core);
    box(.055, .14, .39, COLORS.lime, -.77 + r * .1, 1.48, .035, core);
  }
  box(.48, .07, .62, COLORS.ink, 1.04, 1.3, .04, core);
  box(.39, .015, .49, COLORS.paper, 1.04, 1.35, .04, core);
  const ssdLabel = paperSign('SSD', 'STORAGE', .29, .17, '#FBE34A');
  ssdLabel.rotation.x = -Math.PI / 2; ssdLabel.position.set(1.04, 1.365, .04); core.add(ssdLabel);
  for (let i = 0; i < 3; i++) box(.04, .025, .06, COLORS.yellow, .95 + i * .09, 1.35, .34, core);
  // Tower visible under the central desk with a cyan fan and slotted vent.
  box(.57, .85, .75, COLORS.ink, .9, .48, -.24, core);
  box(.46, .73, .04, COLORS.paper, .9, .5, .155, core);
  const fan = cylinder(.15, .025, COLORS.ink, .9, .55, .19, core); fan.rotation.x = Math.PI / 2;
  const fanCenter = cylinder(.09, .03, COLORS.cyan, .9, .55, .21, core); fanCenter.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) box(.23, .02, .03, COLORS.ink, .9, .3 + i * .05, .19, core);

  // Safe bench: a small network appliance, key, and shield-shaped status object.
  const safe = stations[2].group;
  box(.63, .2, .53, COLORS.ink, -1.02, 1.39, .07, safe);
  box(.54, .14, .45, COLORS.paper, -1.02, 1.43, .07, safe);
  for (const lx of [-1.2, -.84]) {
    const antenna = cylinder(.022, .37, COLORS.ink, lx, 1.66, -.05, safe); antenna.rotation.z = lx < -1 ? -.18 : .18;
  }
  for (let i = 0; i < 3; i++) box(.045, .035, .015, COLORS.lime, -1.17 + i * .13, 1.44, .302, safe);
  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(-.3, .35); shieldShape.lineTo(.3, .35); shieldShape.lineTo(.27, -.06);
  shieldShape.quadraticCurveTo(.2, -.3, 0, -.45); shieldShape.quadraticCurveTo(-.2, -.3, -.27, -.06); shieldShape.closePath();
  const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, { depth: .07, bevelEnabled: false });
  const shield = addMesh(shieldGeo, COLORS.ink, safe, [1.03, 1.7, -.05]);
  const shieldInner = addMesh(shieldGeo, COLORS.lime, safe, [1.03, 1.7, .03], [.83, .83, .35]);
  const tickA = box(.055, .19, .03, COLORS.ink, .94, 1.69, .07, safe); tickA.rotation.z = .7;
  const tickB = box(.055, .31, .03, COLORS.ink, 1.075, 1.73, .07, safe); tickB.rotation.z = -.6;
  box(.4, .035, .28, COLORS.ink, 1.03, 1.3, .0, safe);
  // Cable runs on the back wall terminate at each workstation.
  STATION_X.forEach((x, i) => {
    box(.035, .65, .035, COLORS.ink, x + 1.65, 2.1, -4.02);
    box(.37, .37, .12, COLORS.ink, x + 1.64, 1.63, -3.98);
    box(.27, .27, .13, STATION_COLORS[i], x + 1.64, 1.63, -3.97);
    box(.12, .025, .02, COLORS.ink, x + 1.64, 1.66, -3.89);
    box(.12, .025, .02, COLORS.ink, x + 1.64, 1.58, -3.89);
  });

  // Bit: original, colour-customisable toy robot on four chunky wheels.
  const robot = new THREE.Group(); robot.position.set(-.5, 0, 2.3); room.add(robot);
  const robotColor = new THREE.MeshStandardMaterial({ color: state.color, roughness: .84 });
  rounded(.88, .19, .72, COLORS.ink, 0, .25, 0, robot, .08);
  rounded(.72, .12, .59, robotColor, 0, .39, 0, robot, .07);
  const wheels = [];
  for (const wx of [-.45, .45]) for (const wz of [-.22, .22]) {
    const wheel = cylinder(.17, .13, COLORS.ink, wx, .2, wz, robot); wheel.rotation.z = Math.PI / 2; wheels.push(wheel);
    const hub = cylinder(.075, .14, COLORS.yellow, wx, .2, wz, robot); hub.rotation.z = Math.PI / 2;
  }
  const robotUpper = new THREE.Group(); robot.add(robotUpper);
  box(.13, .23, .13, COLORS.ink, 0, .52, 0, robotUpper);
  rounded(.91, .7, .63, COLORS.ink, 0, .91, 0, robotUpper, .09);
  rounded(.8, .59, .57, robotColor, 0, .93, .005, robotUpper, .07);
  box(.74, .41, .09, COLORS.ink, 0, .96, .308, robotUpper);
  const eyes = [];
  for (const ex of [-.185, .185]) {
    const eye = box(.115, .145, .02, material(COLORS.paper, true), ex, 1.0, .365, robotUpper);
    eyes.push(eye);
  }
  box(.15, .03, .02, COLORS.lime, 0, .83, .366, robotUpper);
  for (const side of [-1, 1]) {
    const shoulder = ball(.1, COLORS.ink, side * .49, .88, 0, robotUpper);
    const arm = cylinder(.046, .29, COLORS.ink, side * .55, .73, .02, robotUpper); arm.rotation.z = side * .25;
    ball(.105, robotColor, side * .58, .59, .04, robotUpper);
  }
  cylinder(.027, .25, COLORS.ink, .26, 1.39, -.04, robotUpper);
  const antennaBall = ball(.075, COLORS.yellow, .26, 1.55, -.04, robotUpper);
  box(.28, .12, .018, COLORS.paper, 0, .6, .3, robotUpper);
  box(.17, .025, .025, COLORS.ink, 0, .61, .316, robotUpper);
  // A floor label acts as a tiny graphic foreground detail.
  const floorLabel = paperSign('REPAIR ZONE', 'KEEP THE GOOD BITS', 2.05, .55, '#FBE34A');
  floorLabel.rotation.x = -Math.PI / 2; floorLabel.position.set(2.15, .055, 3.35); room.add(floorLabel);
  for (let i = 0; i < 4; i++) {
    const stripe = box(.12, .012, .58, COLORS.ink, 3.52 + i * .24, .055, 3.35); stripe.rotation.y = -.35;
  }

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(35, 28), new THREE.ShadowMaterial({ color: 0x171717, opacity: .13 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.42; shadow.receiveShadow = true; scene.add(shadow);
  const confetti = [];
  const confettiGroup = new THREE.Group(); scene.add(confettiGroup);
  const confettiGeometry = new THREE.BoxGeometry(.065, .025, .13);
  for (let i = 0; i < 34; i++) {
    const mesh = addMesh(confettiGeometry, [COLORS.yellow, COLORS.cyan, COLORS.pink, COLORS.lime, COLORS.ink][i % 5], confettiGroup);
    mesh.castShadow = false; mesh.visible = false;
    confetti.push({ mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3() });
  }

  function drawStation(index) {
    const station = stations[index];
    const done = state.completed[index];
    const locked = index > state.stage && done < 4;
    const signature = `${done}:${locked}:${state.stage === index}:${state.mode}`;
    if (station.lastDisplay === signature) return;
    station.lastDisplay = signature;
    const color = ['#FBE34A', '#51D6E4', '#FF91BB'][index];
    const { ctx, texture } = screenMaps[index];
    ctx.fillStyle = '#171717'; ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = done === 4 ? '#C8F36A' : locked ? '#8A938F' : color;
    ctx.font = '900 30px monospace'; ctx.textAlign = 'left'; ctx.fillText(`0${index + 1} / ${STATION_NAMES[index]}`, 25, 43);
    ctx.fillRect(25, 57, 462, 3);
    ctx.font = '900 55px monospace'; ctx.textAlign = 'center';
    ctx.fillText(done === 4 ? 'ONLINE!' : locked ? 'LOCKED' : 'REPAIR', 256, 137);
    ctx.font = '700 23px monospace';
    ctx.fillText(done === 4 ? 'ALL SYSTEMS GO' : `${done} / 4 CHECKS COMPLETE`, 256, 178);
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = j < done ? '#C8F36A' : '#3b413c';
      ctx.fillRect(45 + j * 108, 212, 92, 36);
      if (j < done) {
        ctx.fillStyle = '#171717'; ctx.font = '900 26px monospace'; ctx.fillText('+', 91 + j * 108, 239);
      }
    }
    texture.needsUpdate = true;
    const marker = markerMaps[index];
    marker.ctx.clearRect(0, 0, 192, 232);
    marker.ctx.fillStyle = '#171717'; marker.ctx.fillRect(9, 9, 174, 197);
    marker.ctx.beginPath(); marker.ctx.moveTo(70, 200); marker.ctx.lineTo(96, 230); marker.ctx.lineTo(122, 200); marker.ctx.fill();
    marker.ctx.fillStyle = done === 4 ? '#C8F36A' : locked ? '#D9D8CC' : color;
    marker.ctx.fillRect(18, 18, 156, 178);
    marker.ctx.textAlign = 'center'; marker.ctx.textBaseline = 'middle'; marker.ctx.fillStyle = '#171717';
    marker.ctx.font = '900 100px Arial, sans-serif'; marker.ctx.fillText(done === 4 ? '✓' : `${index + 1}`, 96, 94);
    marker.ctx.font = '900 25px monospace'; marker.ctx.fillText(locked ? 'WAIT' : `${done}/4`, 96, 165);
    marker.texture.needsUpdate = true;
    station.leds.forEach((led, j) => { led.material = material(j < done ? COLORS.lime : COLORS.grey, j < done); });
    station.powerLed.material = material(done === 4 ? COLORS.lime : locked ? COLORS.grey : station.color, true);
    station.ring.material.color.setHex(done === 4 ? COLORS.lime : locked ? COLORS.concrete : station.color);
  }
  function setState(next) {
    if (disposed) return;
    state = normalizeState(state, next);
    if (fallback) return fallback.setState(state);
    robotColor.color.set(state.color);
    stations.forEach((_, i) => drawStation(i));
    if (!state.active) { hovered = -1; canvas.style.cursor = 'default'; }
  }
  function canInteract(index) {
    return state.active && state.mode === 'play' && index === state.stage && state.completed[index] < 4 && !movement;
  }
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? hits[0].object.userData.station : -1;
  }
  let pointerStart = null;
  function onPointerDown(event) {
    if (event.button !== 0 || !state.active) return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }
  function onPointerUp(event) {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (distance > 10) return;
    const index = pick(event);
    if (index >= 0 && canInteract(index)) callbacks.onStation?.(index);
  }
  function onPointerMove(event) {
    if (!state.active) return;
    const index = pick(event);
    hovered = index >= 0 && canInteract(index) ? index : -1;
    canvas.style.cursor = hovered >= 0 ? 'pointer' : 'default';
  }
  function onPointerLeave() { hovered = -1; pointerStart = null; canvas.style.cursor = 'default'; }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointercancel', onPointerLeave);

  function moveToStation(index) {
    if (disposed || index < 0 || index > 2) return Promise.resolve();
    if (fallback) return fallback.moveToStation(index);
    movementResolve?.();
    const target = new THREE.Vector3(STATION_X[index] - .55, 0, .52);
    if (media.matches || robot.position.distanceTo(target) < .05) {
      robot.position.copy(target); robot.rotation.y = 0; movement = null; return Promise.resolve();
    }
    const path = [robot.position.clone()];
    if (robot.position.z < 1.8) path.push(new THREE.Vector3(robot.position.x, 0, 2.05));
    path.push(new THREE.Vector3(target.x, 0, 2.05)); path.push(target);
    const lengths = [], total = path.slice(1).reduce((sum, point, i) => {
      const length = point.distanceTo(path[i]); lengths.push(length); return sum + length;
    }, 0);
    movement = { path, lengths, total, time: 0, duration: clamp(total * .08, .5, .95) };
    return new Promise((resolve) => { movementResolve = resolve; });
  }
  function celebrate(index = state.stage) {
    if (disposed) return;
    if (fallback) return fallback.celebrate(index);
    if (media.matches) return;
    celebrationTime = 1.5;
    const center = new THREE.Vector3(STATION_X[clamp(index, 0, 2)], 2, -1.25);
    for (const item of confetti) {
      item.mesh.position.copy(center).add(new THREE.Vector3((Math.random() - .5) * .7, Math.random() * .35, (Math.random() - .5) * .5));
      item.velocity.set((Math.random() - .5) * 2.9, 2 + Math.random() * 2.5, (Math.random() - .5) * 2.3);
      item.spin.set(Math.random() * 6, Math.random() * 5, Math.random() * 8);
      item.mesh.visible = true;
    }
  }
  function updateMovement(dt) {
    if (!movement) return;
    movement.time += dt;
    const t = clamp(movement.time / movement.duration, 0, 1);
    const eased = t * t * (3 - 2 * t);
    let distance = eased * movement.total, segment = 0;
    while (segment < movement.lengths.length - 1 && distance > movement.lengths[segment]) {
      distance -= movement.lengths[segment]; segment++;
    }
    const from = movement.path[segment], to = movement.path[segment + 1];
    robot.position.lerpVectors(from, to, movement.lengths[segment] > 0 ? distance / movement.lengths[segment] : 1);
    const direction = Math.atan2(to.x - from.x, to.z - from.z);
    const deltaAngle = Math.atan2(Math.sin(direction - robot.rotation.y), Math.cos(direction - robot.rotation.y));
    robot.rotation.y += deltaAngle * Math.min(1, dt * 15);
    if (t === 1) {
      robot.position.copy(movement.path[movement.path.length - 1]); robot.rotation.y = 0; movement = null;
      const resolve = movementResolve; movementResolve = null; resolve?.();
    }
  }
  function fail(error) {
    if (disposed || fallback) return;
    renderer.setAnimationLoop(null);
    movement = null; movementResolve?.(); movementResolve = null;
    canvas.hidden = true;
    fallback = createFallback(container, callbacks, state);
    if (!errorReported) { errorReported = true; callbacks.onError?.(error); }
  }
  function onContextLost(event) { event.preventDefault(); fail(new Error('The 3D graphics context was lost.')); }
  canvas.addEventListener('webglcontextlost', onContextLost);
  function resize() {
    if (disposed || fallback) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const aspect = width / height;
    // Fit the actual diorama, not a generic camera distance; narrow screens stay intact.
    const bounds = new THREE.Box3(new THREE.Vector3(-6.62, -.46, -4.36), new THREE.Vector3(6.62, 3.62, 4.45));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const halfHeight = Math.max((maxY - minY) * .53, (maxX - minX) * .53 / aspect);
    const centerX = (maxX + minX) / 2, centerY = (maxY + minY) / 2;
    camera.left = centerX - halfHeight * aspect; camera.right = centerX + halfHeight * aspect;
    camera.top = centerY + halfHeight; camera.bottom = centerY - halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  function setQuality(value) {
    quality = value === 'low' ? 'low' : 'high';
    if (disposed || fallback) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 1.5));
    renderer.shadowMap.enabled = quality !== 'low';
    resize();
  }
  function onVisibility() { lastFrame = performance.now(); }
  document.addEventListener('visibilitychange', onVisibility);
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(container);
  window.addEventListener('resize', resize);
  setState(state); resize();
  try {
    renderer.render(scene, camera);
    renderer.setAnimationLoop(() => {
      if (disposed || fallback || document.hidden) { lastFrame = performance.now(); return; }
      const now = performance.now();
      const dt = clamp((now - lastFrame) / 1000, 0, .05); lastFrame = now; elapsed += dt;
      updateMovement(dt);
      if (!media.matches) {
        robotUpper.position.y = movement ? Math.sin(elapsed * 23) * .022 : Math.sin(elapsed * 2) * .009;
        const blink = Math.sin(elapsed * .69) > .997 ? .13 : 1;
        eyes.forEach((eye) => { eye.scale.y = .145 * blink; });
        stations.forEach((station, index) => {
          station.marker.position.y = station.markerBaseY + (index === state.stage && state.active ? Math.sin(elapsed * 2.4) * .045 : 0);
          const scale = index === hovered ? 1.1 : 1;
          station.marker.scale.set(.65 * scale, .785 * scale, 1);
        });
        if (celebrationTime > 0) {
          celebrationTime -= dt;
          for (const item of confetti) {
            item.velocity.y -= 5.5 * dt;
            item.mesh.position.addScaledVector(item.velocity, dt);
            item.mesh.rotation.x += item.spin.x * dt; item.mesh.rotation.y += item.spin.y * dt; item.mesh.rotation.z += item.spin.z * dt;
            if (item.mesh.position.y < .04 || celebrationTime <= 0) item.mesh.visible = false;
          }
        }
      }
      try { renderer.render(scene, camera); } catch (error) { fail(error); }
    });
  } catch (error) { fail(error); }
  defer(() => callbacks.onReady?.());

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    movementResolve?.(); movementResolve = null;
    observer?.disconnect();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('pointercancel', onPointerLeave);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const mat of list) materials.add(mat);
    });
    materialCache.forEach((mat) => materials.add(mat));
    materials.add(robotColor); materials.add(edgeMaterial);
    for (const mat of materials) for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
    geometries.forEach((geometry) => geometry.dispose());
    textures.forEach((texture) => texture.dispose());
    materials.forEach((mat) => mat.dispose());
    renderer.dispose(); canvas.remove(); fallback?.dispose();
  }
  return { setState, moveToStation, celebrate, setQuality, resize, dispose };
}
