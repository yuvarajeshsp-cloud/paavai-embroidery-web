// 3D blouse viewer: a half dress form wearing a blouse, built in code, with
// the four uploaded embroidery designs (front, back, two sleeves) drawn onto
// their panels. Drag to turn, pinch/scroll to zoom. Loaded on demand (three.js
// is ~150 KB gzipped), by the design page and /admin.
//
// Units are metres. y is up, the mannequin faces +z, so the wearer's right
// side is at -x. Each blouse panel has UVs in real distances along the
// surface (u across, v up from the hem), so a design keeps its proportions.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Blouse3D, NeckBack, NeckFront, PartKey, Sleeve } from '../lib/blouse3d';

// ---------------------------------------------------------------- body shape

// Cross-sections from the hip cut (y = 0) to the top of the neck:
// y, half width, front depth, back depth, bust fullness.
const KEYS: [number, number, number, number, number][] = [
  [0.0, 0.165, 0.108, 0.122, 0],
  [0.1, 0.17, 0.104, 0.126, 0],
  [0.24, 0.126, 0.084, 0.09, 0],
  [0.34, 0.134, 0.09, 0.09, 0.01],
  [0.42, 0.148, 0.098, 0.092, 0.042],
  [0.5, 0.154, 0.094, 0.094, 0.016],
  [0.565, 0.156, 0.084, 0.09, 0],
  [0.6, 0.148, 0.07, 0.076, 0],
  [0.632, 0.106, 0.06, 0.063, 0],
  [0.655, 0.062, 0.052, 0.054, 0],
  [0.7, 0.051, 0.047, 0.05, 0],
  [0.78, 0.049, 0.045, 0.048, 0],
];
const SUB = 14; // rows per key segment
const COLS = 160; // around the body
const BLOUSE_GAP = 0.0055;
const HEM_Y = 0.322;
const NECK_S = 9; // KEYS index of the neck base: top row of the blouse

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Interpolated cross-section at profile parameter s (0 … KEYS.length - 1). */
function section(s: number) {
  const n = KEYS.length - 1;
  const i = Math.min(n - 1, Math.max(0, Math.floor(s)));
  const t = s - i;
  const k = (j: number) => KEYS[Math.min(n, Math.max(0, j))];
  const v = (c: number) => catmull(k(i - 1)[c], k(i)[c], k(i + 1)[c], k(i + 2)[c], t);
  return { y: v(0), a: v(1), bf: v(2), bb: v(3), bust: Math.max(0, v(4)) };
}

/** s for a given height (the profile is monotonic in y). */
function sAtY(y: number) {
  let lo = 0;
  let hi = KEYS.length - 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (section(mid).y < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const spow = (v: number, p: number) => Math.sign(v) * Math.abs(v) ** p;
const gauss = (x: number, s: number) => Math.exp(-(x * x) / (2 * s * s));

/** Point on the body (or `gap` outside it). theta = 0 is the front centre, +π/2 the wearer's left side (+x). */
function bodyPoint(s: number, theta: number, gap = 0) {
  const c = section(s);
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const x = spow(sin, 2 / 2.3) * (c.a + gap);
  let z = spow(cos, 2 / 2.3) * ((cos >= 0 ? c.bf : c.bb) + gap);
  if (cos > 0) z += c.bust * (gauss(x - 0.082, 0.042) + gauss(x + 0.082, 0.042)) * Math.min(1, cos * 2.5);
  return new THREE.Vector3(x, c.y, z);
}

// ---------------------------------------------------------------- necklines

type Neck = { w: number; bottom: number; p: number; heart?: boolean };
const FRONT_NECK: Record<NeckFront, Neck> = {
  round: { w: 0.074, bottom: 0.58, p: 2 },
  u: { w: 0.08, bottom: 0.535, p: 3.2 },
  sweetheart: { w: 0.088, bottom: 0.545, p: 2.6, heart: true },
  boat: { w: 0.118, bottom: 0.622, p: 2.4 },
};
const BACK_NECK: Record<NeckBack, Neck> = {
  deep_u: { w: 0.094, bottom: 0.43, p: 3.2 },
  square: { w: 0.09, bottom: 0.5, p: 9 },
  boat: { w: 0.118, bottom: 0.6, p: 2.4 },
  high: { w: 0.074, bottom: 0.628, p: 2 },
};
const NECK_TOP = 0.7;

/**
 * Signed distance (metres, approximately) from the neckline edge: > 0 keeps
 * fabric, < 0 is the opening. The opening is a superellipse hanging from
 * NECK_TOP; a smooth function interpolates well across the mesh, so the edge
 * stays clean.
 */
function neckDistance(n: Neck, x: number, y: number) {
  const g = (px: number, py: number) => {
    let yy = py;
    if (n.heart) yy -= 0.03 * gauss(Math.abs(px) - 0.048, 0.02) - 0.012 * Math.max(0, 1 - Math.abs(px) / 0.02);
    const dx = Math.abs(px) / n.w;
    const dy = Math.max(0, NECK_TOP - yy) / (NECK_TOP - n.bottom);
    return (dx ** n.p + dy ** n.p) ** (1 / n.p) - 1;
  };
  const e = 1e-4;
  const v = g(x, y);
  const gx = (g(x + e, y) - g(x - e, y)) / (2 * e);
  const gy = (g(x, y + e) - g(x, y - e)) / (2 * e);
  return v / Math.max(1e-6, Math.hypot(gx, gy));
}

/** Front and back necklines blend over the shoulder seam. */
function neckKeep(front: Neck, back: Neck, p: THREE.Vector3) {
  const f = neckDistance(front, p.x, p.y);
  const b = neckDistance(back, p.x, p.y);
  const t = THREE.MathUtils.smoothstep(p.z, -0.025, 0.025);
  return b + (f - b) * t;
}

// ---------------------------------------------------------------- sleeves

const SLEEVE_LEN: Record<Sleeve, number> = { short: 0.14, elbow: 0.27, three_quarter: 0.37 };
const ARM_LEN = 0.44;
const armRadius = (t: number) => {
  const pts: [number, number][] = [
    [0, 0.047],
    [0.1, 0.044],
    [0.28, 0.035],
    [0.44, 0.031],
  ];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, r0] = pts[i - 1];
      const [t1, r1] = pts[i];
      return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0);
    }
  }
  return pts.at(-1)![1];
};

/** Shoulder joint, arm direction and the outward/forward axes for one side (-1 = wearer's right). */
function armFrame(side: -1 | 1) {
  const joint = new THREE.Vector3(side * 0.136, 0.538, -0.004);
  const dir = new THREE.Vector3(side * Math.sin(0.24), -Math.cos(0.24), 0.05).normalize();
  const out = new THREE.Vector3(side, 0, 0).projectOnPlane(dir).normalize();
  // As seen from outside the arm, the viewer's right is the front for the right arm and the back for the left.
  const across = new THREE.Vector3().crossVectors(dir, out).normalize();
  if (across.z * -side < 0) across.negate();
  return { joint, dir, out, across };
}

// ---------------------------------------------------------------- geometry helpers

type Vert = { p: THREE.Vector3; u: number; v: number; keep?: number; hem?: number };

/** Builds an indexed grid (rows × cols vertices), with optional cut attributes; flips winding so normals face away from `inside(p)`. */
function grid(rows: number, cols: number, at: (r: number, c: number) => Vert, inside: (p: THREE.Vector3) => THREE.Vector3, close = false) {
  const pos: number[] = [];
  const uv: number[] = [];
  const keep: number[] = [];
  const hem: number[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const v = at(r, c);
      pos.push(v.p.x, v.p.y, v.p.z);
      uv.push(v.u, v.v);
      keep.push(v.keep ?? 1);
      hem.push(v.hem ?? 1);
    }
  const idx: number[] = [];
  const cc = close ? cols : cols - 1;
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cc; c++) {
      const a = r * cols + c;
      const b = r * cols + ((c + 1) % cols);
      const d = (r + 1) * cols + c;
      const e = (r + 1) * cols + ((c + 1) % cols);
      idx.push(a, b, d, b, e, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aKeep', new THREE.Float32BufferAttribute(keep, 1));
  g.setAttribute('aHem', new THREE.Float32BufferAttribute(hem, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Orientation check on a middle vertex.
  const m = Math.floor(rows / 2) * cols + Math.floor(cols / 3);
  const p = new THREE.Vector3().fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, m);
  const n = new THREE.Vector3().fromBufferAttribute(g.attributes.normal as THREE.BufferAttribute, m);
  if (n.dot(p.clone().sub(inside(p))) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

const axisCentre = (p: THREE.Vector3) => new THREE.Vector3(0, p.y, 0);

/** Physical size (metres) of each panel's texture area. */
export const PANEL_SIZE: Record<PartKey, { w: number; h: number }> = {
  front: { w: 0.5, h: 0.42 },
  back: { w: 0.5, h: 0.42 },
  sleeve_right: { w: 0.34, h: 0.46 },
  sleeve_left: { w: 0.34, h: 0.46 },
};

/** Front or back blouse panel. */
function bodyPanel(which: 'front' | 'back', front: Neck, back: Neck) {
  const s0 = sAtY(HEM_Y);
  const rows = Math.ceil((NECK_S - s0) * SUB) + 1;
  const cols = COLS / 2 + 1;
  const { w, h } = PANEL_SIZE[which];
  // theta across the panel: front -π/2 … π/2 (centre 0), back π/2 … 3π/2 (centre π).
  const th = (c: number) => (which === 'front' ? -Math.PI / 2 : Math.PI / 2) + (Math.PI * c) / (cols - 1);
  const sRow = (r: number) => s0 + ((NECK_S - s0) * r) / (rows - 1);
  const pts: THREE.Vector3[][] = [];
  for (let r = 0; r < rows; r++) pts.push(Array.from({ length: cols }, (_, c) => bodyPoint(sRow(r), th(c), BLOUSE_GAP)));
  // Distances along each row from the panel centre, and up each column from the hem.
  const mid = (cols - 1) / 2;
  const across = pts.map((row) => {
    const d = new Array<number>(cols).fill(0);
    for (let c = mid + 1; c < cols; c++) d[c] = d[c - 1] + row[c].distanceTo(row[c - 1]);
    for (let c = mid - 1; c >= 0; c--) d[c] = d[c + 1] - row[c].distanceTo(row[c + 1]);
    return d;
  });
  const up: number[][] = [new Array<number>(cols).fill(0)];
  for (let r = 1; r < rows; r++) up.push(pts[r].map((p, c) => up[r - 1][c] + p.distanceTo(pts[r - 1][c])));
  // Front: u grows towards +x (viewer's right when facing the front). Back: towards -x.
  return grid(
    rows,
    cols,
    (r, c) => {
      const p = pts[r][c];
      return { p, u: 0.5 + across[r][c] / w, v: up[r][c] / h, keep: neckKeep(front, back, p), hem: p.y - HEM_Y + (r === 0 ? 0 : 0.0005) };
    },
    axisCentre,
  );
}

/** One sleeve: a dome over the shoulder ball and a tube down the arm. */
function sleeveGeometry(side: -1 | 1, sleeve: Sleeve, key: PartKey) {
  const { joint, dir, out, across } = armFrame(side);
  const len = SLEEVE_LEN[sleeve];
  const gap = 0.009;
  // Profile from the hem up: (distance along the arm, radius).
  const prof: [number, number][] = [];
  const tubeRows = Math.ceil(len / 0.006);
  for (let i = 0; i <= tubeRows; i++) {
    const t = len - (len * i) / tubeRows;
    const flare = 0.006 * Math.max(0, 1 - (len - t) / 0.05);
    prof.push([t, armRadius(t) + gap + flare]);
  }
  const R = armRadius(0) + gap + 0.002;
  for (let i = 1; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2) * 0.92;
    prof.push([-Math.sin(a) * R * 0.8, Math.cos(a) * R]);
  }
  const up = [0];
  for (let i = 1; i < prof.length; i++) up.push(up[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const cols = 97;
  const { w, h } = PANEL_SIZE[key];
  return grid(
    prof.length,
    cols,
    (r, c) => {
      const [t, rad] = prof[r];
      const phi = -Math.PI + (2 * Math.PI * c) / (cols - 1);
      const radial = out.clone().multiplyScalar(Math.cos(phi)).addScaledVector(across, Math.sin(phi));
      const p = joint.clone().addScaledVector(dir, t).addScaledVector(radial, rad);
      return { p, u: 0.5 + (phi * rad) / w, v: up[r] / h, hem: up[r] + (r === 0 ? 0 : 0.0005) };
    },
    (p) => joint.clone().addScaledVector(dir, p.clone().sub(joint).dot(dir)),
  );
}

// ---------------------------------------------------------------- mannequin

function mannequin(skin: THREE.Material, wood: THREE.Material, metal: THREE.Material) {
  const group = new THREE.Group();
  const rows = (KEYS.length - 1) * SUB + 1;
  const torso = grid(
    rows,
    COLS,
    (r, c) => ({ p: bodyPoint(r / SUB, (2 * Math.PI * c) / COLS), u: c / COLS, v: r / (rows - 1) }),
    axisCentre,
    true,
  );
  group.add(new THREE.Mesh(torso, skin));

  // Caps: hip plate and neck top, with a wooden knob.
  const ring = (s: number, grow = 0) => {
    const shape = new THREE.Shape();
    for (let c = 0; c <= COLS; c++) {
      const p = bodyPoint(s, (2 * Math.PI * c) / COLS, grow);
      if (c === 0) shape.moveTo(p.x, -p.z);
      else shape.lineTo(p.x, -p.z);
    }
    return shape;
  };
  const hip = new THREE.Mesh(new THREE.ExtrudeGeometry(ring(0, 0.004), { depth: 0.018, bevelEnabled: false, curveSegments: 1 }), wood);
  hip.rotation.x = Math.PI / 2;
  hip.position.y = 0.0;
  group.add(hip);
  const neck = new THREE.Mesh(new THREE.ExtrudeGeometry(ring(KEYS.length - 1, 0.002), { depth: 0.012, bevelEnabled: false, curveSegments: 1 }), wood);
  neck.rotation.x = -Math.PI / 2;
  neck.position.y = 0.78;
  group.add(neck);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 24, 12), wood);
  knob.position.y = 0.8;
  group.add(knob);

  // Arms.
  for (const side of [-1, 1] as const) {
    const { joint, dir } = armFrame(side);
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = (ARM_LEN * i) / 40;
      pts.push(new THREE.Vector2(armRadius(t), -t));
    }
    const r = armRadius(ARM_LEN);
    for (let i = 1; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * r, -ARM_LEN - Math.sin(a) * r * 0.6));
    }
    const arm = new THREE.Mesh(new THREE.LatheGeometry(pts.reverse(), 48), skin);
    arm.position.copy(joint);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    group.add(arm);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(armRadius(0), 40, 20), skin);
    ball.position.copy(joint);
    group.add(ball);
  }

  // Stand.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 20), metal);
  pole.position.y = -0.45;
  group.add(pole);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 24), metal);
  collar.position.y = -0.02;
  group.add(collar);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.025, 48), wood);
  base.position.y = -0.9;
  group.add(base);
  return group;
}

// ---------------------------------------------------------------- materials

/** Adds the neckline cut (aKeep < 0 → discarded) and a darker piped edge along necklines and hems. */
function withCut<M extends THREE.Material>(m: M): M {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aKeep;\nattribute float aHem;\nvarying float vKeep;\nvarying float vHem;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKeep = aKeep;\nvHem = aHem;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vKeep;\nvarying float vHem;')
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\nfloat aa = max(fwidth(vKeep), 1e-5);\nfloat cover = smoothstep(-aa, aa, vKeep);\nif (cover <= 0.0) discard;\ndiffuseColor.a *= cover;\nfloat pipe = min(vKeep, vHem);\ndiffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0035, 0.006, pipe));',
      );
  };
  // Smooth (antialiased) neckline edge with MSAA.
  m.alphaToCoverage = true;
  return m;
}

// ---------------------------------------------------------------- textures

const PX_PER_M = 4000;
const MAX_TEX = 2048;

type Panel = { key: PartKey; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; image: HTMLImageElement | null; url: string };

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

// ---------------------------------------------------------------- viewer

export type View = 'front' | 'back' | 'right' | 'left';
export type ViewerOptions = {
  autoRotate?: boolean;
  /** Maps a stored image URL to the URL to load (e.g. a resized CDN version). */
  resolveUrl?: (url: string) => string;
};

export function createViewer(container: HTMLElement, initial: Blouse3D, opts: ViewerOptions = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xfff4e8, 1.6);
  key.position.set(0.8, 1.6, 1.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe8eeff, 0.7);
  rim.position.set(-1.2, 1.0, -1.2);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  const target = new THREE.Vector3(0, 0.47, 0);
  camera.position.set(0, 0.56, 1.65);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 0.55;
  controls.maxDistance = 2.6;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.maxPolarAngle = Math.PI * 0.68;
  controls.autoRotate = opts.autoRotate ?? true;
  controls.autoRotateSpeed = 1.6;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    flight = null;
  });

  const skin = new THREE.MeshStandardMaterial({ color: 0xece3d6, roughness: 0.92 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.55 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.35, metalness: 0.7 });
  scene.add(mannequin(skin, wood, metal));

  // Soft contact shadow under the base.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.912;
  scene.add(shadow);

  const panels = new Map<PartKey, Panel>();
  const keys: PartKey[] = ['front', 'back', 'sleeve_right', 'sleeve_left'];
  for (const k of keys) {
    const { w, h } = PANEL_SIZE[k];
    const scale = Math.min(PX_PER_M, MAX_TEX / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    panels.set(k, { key: k, canvas, texture, image: null, url: '' });
  }

  const fabric = new Map<PartKey, THREE.MeshPhysicalMaterial>();
  const lining = withCut(new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9, side: THREE.BackSide }));
  for (const k of keys)
    fabric.set(
      k,
      withCut(
        new THREE.MeshPhysicalMaterial({
          map: panels.get(k)!.texture,
          roughness: 0.6,
          sheen: 0.5,
          sheenRoughness: 0.5,
          sheenColor: new THREE.Color(0xffffff).multiplyScalar(0.18),
          side: THREE.FrontSide,
        }),
      ),
    );

  const shoulder = new THREE.MeshPhysicalMaterial({ color: initial.color, roughness: 0.6, sheen: 0.5, sheenRoughness: 0.5 });
  const blouse = new THREE.Group();
  scene.add(blouse);
  let cfg: Blouse3D = initial;
  let shape = '';

  function buildBlouse() {
    const next = `${cfg.neck_front}|${cfg.neck_back}|${cfg.sleeve}`;
    if (next === shape) return;
    shape = next;
    for (const m of blouse.children as THREE.Mesh[]) m.geometry.dispose();
    blouse.clear();
    const fn = FRONT_NECK[cfg.neck_front];
    const bn = BACK_NECK[cfg.neck_back];
    const parts: [PartKey, THREE.BufferGeometry][] = [
      ['front', bodyPanel('front', fn, bn)],
      ['back', bodyPanel('back', fn, bn)],
      ['sleeve_right', sleeveGeometry(-1, cfg.sleeve, 'sleeve_right')],
      ['sleeve_left', sleeveGeometry(1, cfg.sleeve, 'sleeve_left')],
    ];
    for (const [k, g] of parts) {
      blouse.add(new THREE.Mesh(g, fabric.get(k)!));
      blouse.add(new THREE.Mesh(g, lining));
    }
    // Plain fabric over the shoulder joints, so no gap shows between sleeve and body.
    for (const side of [-1, 1] as const) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(armRadius(0) + 0.006, 40, 20), shoulder);
      ball.position.copy(armFrame(side).joint);
      blouse.add(ball);
    }
  }

  let color = cfg.color;
  function paint(p: Panel) {
    const ctx = p.canvas.getContext('2d')!;
    const W = p.canvas.width;
    const H = p.canvas.height;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    shoulder.color.set(color);
    const place = cfg.parts[p.key];
    if (p.image && place) {
      const w = place.size * W;
      const h = (w * p.image.naturalHeight) / p.image.naturalWidth;
      ctx.drawImage(p.image, place.x * W - w / 2, (1 - place.y) * H - h / 2, w, h);
    }
    p.texture.needsUpdate = true;
  }

  let version = 0;
  async function update(next: Blouse3D) {
    cfg = next;
    color = next.color;
    buildBlouse();
    const mine = ++version;
    await Promise.all(
      keys.map(async (k) => {
        const p = panels.get(k)!;
        const url = next.parts[k]?.url ?? '';
        if (url !== p.url) {
          p.url = url;
          p.image = null;
          paint(p);
          if (url) {
            try {
              const img = await loadImage(opts.resolveUrl ? opts.resolveUrl(url) : url);
              if (mine !== version && p.url !== url) return;
              p.image = img;
            } catch (err) {
              console.warn(err);
            }
          }
        }
        paint(p);
      }),
    );
  }

  function setColor(hex: string) {
    color = hex;
    for (const p of panels.values()) paint(p);
  }

  // Smooth camera moves to a named side.
  let flight: { from: number; to: number; start: number } | null = null;
  const AZ: Record<View, number> = { front: 0, back: Math.PI, right: -Math.PI / 2, left: Math.PI / 2 };
  function view(v: View) {
    controls.autoRotate = false;
    const off = camera.position.clone().sub(controls.target);
    const from = Math.atan2(off.x, off.z);
    let to = AZ[v];
    while (to - from > Math.PI) to -= 2 * Math.PI;
    while (to - from < -Math.PI) to += 2 * Math.PI;
    flight = { from, to, start: performance.now() };
  }

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole blouse in view on narrow (portrait) screens.
    camera.fov = w / h < 0.8 ? 38 : 30;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  renderer.setAnimationLoop((time) => {
    if (flight) {
      const k = Math.min(1, (time - flight.start) / 700);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const az = flight.from + (flight.to - flight.from) * e;
      const off = camera.position.clone().sub(controls.target);
      const flat = Math.hypot(off.x, off.z);
      camera.position.set(controls.target.x + Math.sin(az) * flat, camera.position.y, controls.target.z + Math.cos(az) * flat);
      if (k === 1) flight = null;
    }
    controls.update();
    renderer.render(scene, camera);
  });

  buildBlouse();
  for (const p of panels.values()) paint(p);
  const ready = update(initial);

  return {
    ready,
    update,
    setColor,
    view,
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls.dispose();
      for (const m of blouse.children as THREE.Mesh[]) m.geometry.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const p of panels.values()) p.texture.dispose();
      for (const m of fabric.values()) m.dispose();
      [lining, shoulder, skin, wood, metal].forEach((m) => m.dispose());
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export type Viewer = ReturnType<typeof createViewer>;
