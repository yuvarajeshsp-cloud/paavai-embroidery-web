// The Blouse Studio 3D scene as a reusable engine: mannequin, blouse cut from
// the shell with adjustable necklines, sample zari borders, four embroidery
// panels (PNG or DST, fitted along the blouse edge or placed freely), size
// adjustments, neckline drag handles and an orbit camera.
//
// Ported from Paavai Blouse Studio (dist/app.js). The scene logic is the
// studio's; the page controls moved out so /studio, the design page's
// "View in 3D" and /admin can each drive it.
import * as THREE from 'three';
import { loadMannequin } from './model.js';
import { PaavaiShape } from './garment.js';
import { PaavaiFeatures } from './features.js';
import { PaavaiEdgeFit } from './edgefit.js';

/** Panel order used throughout the engine. */
export const PART_KEYS = ['front', 'sleeve_right', 'sleeve_left', 'back'];
export const DEFAULT_SIZE = { width: 100, length: 100, sleeve: 100, sleeveWidth: 100, frontHeight: 100, frontWidth: 100, backHeight: 100, backWidth: 100 };
export const SIZE_LIMITS = {
  width: [85, 120],
  length: [85, 120],
  sleeve: [75, 135],
  sleeveWidth: [80, 125],
  frontHeight: [60, 140],
  frontWidth: [80, 125],
  backHeight: [60, 140],
  backWidth: [80, 125],
};
export const SIZE_PRESETS = { compact: { width: 90, length: 95, sleeve: 90 }, regular: { width: 100, length: 100, sleeve: 100 }, full: { width: 112, length: 105, sleeve: 108 } };
export const VIEWS = { front: 0, back: Math.PI, right: -Math.PI / 2, left: Math.PI / 2 };
/** Camera angle that shows each panel best. */
export const PANEL_VIEW = [-0.35, -1.57, 1.57, Math.PI];
export const DST_PALETTE = ['#c8a65f', '#c27e99', '#81a186', '#ecd7a2', '#956dba', '#ab6c52'];
export const PLACEMENT_DEFAULTS = { mode: 'edge', layout: 'auto', width: 100, height: 100, x: 0, y: 0, angle: 0 };

export const blankPanel = () => ({ ...PLACEMENT_DEFAULTS, border: true, image: null, edgeImage: null, dst: null, colors: [], name: '' });

/** Draws a DST's stitches onto a canvas with the given thread colours. */
export function rasterDST(dst, colors) {
  const w = Math.max(1, dst.maxX - dst.minX);
  const h = Math.max(1, dst.maxY - dst.minY);
  const scale = 950 / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale) + 24;
  c.height = Math.ceil(h * scale) + 24;
  const ctx = c.getContext('2d');
  ctx.lineWidth = 1.35;
  ctx.lineCap = 'round';
  for (const [x, y, nx, ny, g] of dst.lines) {
    ctx.strokeStyle = colors[g];
    ctx.beginPath();
    ctx.moveTo(12 + (x - dst.minX) * scale, 12 + (y - dst.minY) * scale);
    ctx.lineTo(12 + (nx - dst.minX) * scale, 12 + (ny - dst.minY) * scale);
    ctx.stroke();
  }
  return c;
}

/**
 * Creates the scene inside `container` (which should be position: relative).
 * Options: fabric, size, sampleBorder, autoRotate, onStatus(text, error),
 * onView(name), onAutoRotate(on), onNeckEdit(side|null), onSize(size).
 */
export async function createStudio(container, opts = {}) {
  const status = (t, error = false) => opts.onStatus?.(t, error);
  const geometries = await loadMannequin();

  const panels = PART_KEYS.map(() => ({ ...blankPanel(), border: opts.sampleBorder ?? true }));
  let fabric = opts.fabric ?? '#654577';
  let auto = opts.autoRotate ?? false;
  let azimuth = 0;
  let elevation = 0.12;
  let distance = 5.9;
  let disposed = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
  container.prepend(canvas);

  scene.add(new THREE.HemisphereLight(0xfffbf6, 0x8f819b, 1.8));
  const key = new THREE.DirectionalLight(0xfff4e9, 2.6);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe6dfff, 1.7);
  fill.position.set(3, 1, -3);
  scene.add(fill);

  const model = new THREE.Group();
  scene.add(model);
  const skin = new THREE.MeshPhysicalMaterial({ color: '#e6d9ca', roughness: 0.4, metalness: 0, clearcoat: 0.16, clearcoatRoughness: 0.48 });
  const metal = new THREE.MeshStandardMaterial({ color: '#bca581', metalness: 0.7, roughness: 0.3 });
  const resizable = [];
  const size = { ...DEFAULT_SIZE, ...opts.size };
  const mesh = (g, m, parent = model) => {
    const o = new THREE.Mesh(g, m);
    parent.add(o);
    return o;
  };

  resizable.push(mesh(geometries.skin.clone(), skin));
  const bolt = mesh(new THREE.SphereGeometry(0.08, 24, 16), metal);
  bolt.scale.y = 0.5;
  bolt.position.y = 1.32;
  const pole = mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.65, 32), metal);
  pole.position.y = -1.35;
  const baseProfile = [[0, -0.033], [0.57, -0.033], [0.595, -0.029], [0.61, -0.016], [0.613, 0], [0.606, 0.018], [0.59, 0.029], [0.57, 0.033], [0, 0.033]].map(([r, y]) => new THREE.Vector2(r, y));
  const baseMaterial = new THREE.MeshStandardMaterial({ color: '#cfc4d8', roughness: 0.35, metalness: 0.15 });
  const base = mesh(new THREE.LatheGeometry(baseProfile, 96), baseMaterial);
  base.position.y = -1.69;

  const canvasTexture = () => {
    const c = document.createElement('canvas');
    c.width = 2048;
    c.height = 1024;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return { c, t };
  };
  const textures = [canvasTexture(), canvasTexture(), canvasTexture()];
  const cloth = textures.map((t) => new THREE.MeshPhysicalMaterial({ map: t.t, roughness: 0.68, sheen: 0.25, sheenColor: new THREE.Color('#d2c4db'), sheenRoughness: 0.8, side: THREE.DoubleSide }));

  // The blouse is the full shell cut at the current necklines.
  const shellGeometry = geometries.shell;
  const first = PaavaiShape.build(THREE, shellGeometry, size);
  const blouseMesh = mesh(first.geometry, cloth);
  resizable.push(blouseMesh);
  let currentPaths = first.paths;
  let hems = [];
  let borders = [];
  let uploadedEdges = [];
  const hemMaterials = [];

  const borderTexture = PaavaiFeatures.makeBorderTexture(THREE);
  const borderMaterial = new THREE.MeshStandardMaterial({ map: borderTexture, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

  // Rolled fabric edges remove the infinitely thin cutout look.
  const makeHems = (paths) =>
    paths.map((path) => {
      const curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p)), true, 'centripetal');
      const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(fabric).lerp(new THREE.Color('#ffffff'), 0.035), roughness: 0.67 });
      return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(192, path.length * 2), 0.0065, 8, true), material);
    });
  const attachEdges = (cut) => {
    hems = makeHems(cut.paths);
    hemMaterials.splice(0, hemMaterials.length, ...hems.map((m) => m.material));
    borders = PaavaiFeatures.makeBorders(THREE, cut.geometry, cut.paths, borderMaterial);
    for (const m of [...hems, ...borders]) {
      model.add(m);
      resizable.push(m);
    }
  };
  attachEdges(first);

  function refreshUploads() {
    for (const old of uploadedEdges) {
      model.remove(old);
      old.geometry.dispose();
      old.material.dispose();
    }
    const oldSet = new Set(uploadedEdges);
    resizable.splice(0, resizable.length, ...resizable.filter((m) => !oldSet.has(m)));
    uploadedEdges = [];
    for (const p of panels)
      if (!p.image && p.edgeTexture) {
        p.edgeTexture.dispose();
        p.edgeTexture = null;
      }
    if (!panels.some((p) => p.image && p.mode === 'edge')) return;
    const g = blouseMesh.geometry;
    const restGeometry = new THREE.BufferGeometry();
    restGeometry.setAttribute('position', new THREE.BufferAttribute(g.userData.restPosition || g.attributes.position.array, 3));
    restGeometry.setAttribute('normal', new THREE.BufferAttribute(g.userData.restNormal || g.attributes.normal.array, 3));
    const materials = panels.map(
      (p) =>
        new THREE.MeshStandardMaterial({
          map: p.image && p.mode === 'edge' ? PaavaiEdgeFit.texture(THREE, p) : null,
          transparent: true,
          alphaTest: 0.08,
          side: THREE.DoubleSide,
          roughness: 0.65,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
    );
    const options = panels.map((p) => ({ bandWidth: (0.14 * p.height) / 100, inset: 0.012 + Math.max(0, p.y) * 0.001, width: p.width, shift: p.x }));
    uploadedEdges = PaavaiFeatures.makeBorders(THREE, restGeometry, currentPaths, materials, options);
    restGeometry.dispose();
    for (const m of uploadedEdges) {
      const p = panels[m.userData.panel];
      m.visible = !!p.image && p.mode === 'edge';
      model.add(m);
      resizable.push(m);
    }
    PaavaiFeatures.resizeMeshes(THREE, uploadedEdges, size);
  }

  const updateBorders = () => borders.forEach((m) => (m.visible = panels[m.userData.panel].border));

  function updateSize() {
    PaavaiFeatures.resizeMeshes(THREE, resizable, size);
    const bottom = 0.55 + ((-1.04 - 0.55) * size.length) / 100;
    const foot = -1.6575;
    pole.scale.y = (bottom - foot) / 0.65;
    pole.position.y = (bottom + foot) / 2;
    opts.onSize?.({ ...size });
  }

  let appliedNeck = { frontHeight: size.frontHeight, frontWidth: size.frontWidth, backHeight: size.backHeight, backWidth: size.backWidth };
  function rebuildNeck() {
    try {
      const cut = PaavaiShape.build(THREE, shellGeometry, size);
      const obsolete = new Set([...hems, ...borders]);
      for (const old of obsolete) {
        model.remove(old);
        old.geometry.dispose();
      }
      for (const old of hems) old.material.dispose();
      resizable.splice(0, resizable.length, ...resizable.filter((m) => !obsolete.has(m)));
      blouseMesh.geometry.dispose();
      blouseMesh.geometry = cut.geometry;
      currentPaths = cut.paths;
      attachEdges(cut);
      appliedNeck = { frontHeight: size.frontHeight, frontWidth: size.frontWidth, backHeight: size.backHeight, backWidth: size.backWidth };
      refreshUploads();
      updateSize();
      updateBorders();
      return true;
    } catch (error) {
      Object.assign(size, appliedNeck);
      opts.onSize?.({ ...size });
      status(error.message, true);
      return false;
    }
  }

  // Soft contact shadow anchors the dress form to its pedestal.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d');
  const gradient = sctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(64,42,79,0.20)');
  gradient.addColorStop(1, 'rgba(64,42,79,0)');
  sctx.fillStyle = gradient;
  sctx.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadow = mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.728;

  function drawDesign(ctx, p, rect) {
    if (!p.image || p.mode === 'edge') return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(...rect);
    ctx.clip();
    const [x, y, w, h] = rect;
    const factor = Math.min((w * 0.9) / p.image.width, (h * 0.9) / p.image.height);
    ctx.translate(x + w / 2 + (p.x * w) / 100, y + h / 2 + (p.y * h) / 100);
    ctx.rotate((p.angle * Math.PI) / 180);
    const dw = (p.image.width * factor * p.width) / 100;
    const dh = (p.image.height * factor * p.height) / 100;
    ctx.drawImage(p.image, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  function paint() {
    textures.forEach((o, i) => {
      const c = o.c;
      const ctx = c.getContext('2d');
      ctx.fillStyle = fabric;
      ctx.fillRect(0, 0, c.width, c.height);
      if (i === 0) {
        drawDesign(ctx, panels[0], [1536, 0, 512, 1024]);
        drawDesign(ctx, panels[3], [512, 0, 1024, 1024]);
      } else drawDesign(ctx, panels[i], [0, 0, 2048, 1024]);
      o.t.needsUpdate = true;
    });
    refreshUploads();
  }

  // ---------------------------------------------------------------- camera & input

  const views = Object.entries(VIEWS);
  const viewName = (a) => views.find(([, v]) => Math.abs(v - a) < 0.01)?.[0] ?? 'custom';
  let editSide = null;
  function setView(a) {
    if (editSide && Math.abs(a - (editSide === 'front' ? 0 : Math.PI)) > 0.01) stopEditing();
    azimuth = a;
    elevation = 0.1;
    setAuto(false);
    opts.onView?.(viewName(a));
  }
  function setAuto(on) {
    if (auto === on) return;
    auto = on;
    opts.onAutoRotate?.(on);
  }
  const zoom = (d) => (distance = Math.max(3.2, Math.min(7, d)));

  const touches = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (editSide) return;
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    canvas.setPointerCapture(e.pointerId);
    setAuto(false);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    const old = touches.get(e.pointerId);
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2) {
      const a = [...touches.values()];
      const len = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
      if (pinch) zoom((distance * pinch) / len);
      pinch = len;
    } else {
      azimuth -= (e.clientX - old[0]) * 0.009;
      elevation = Math.max(-0.35, Math.min(0.65, elevation + (e.clientY - old[1]) * 0.006));
    }
    opts.onView?.('custom');
  });
  const release = (e) => {
    touches.delete(e.pointerId);
    pinch = 0;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoom(distance + e.deltaY * 0.003);
    },
    { passive: false },
  );

  // ---------------------------------------------------------------- neckline handles

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  container.append(overlay);
  const handleElements = [];
  let draggedHandle = null;
  function stopEditing() {
    if (!editSide) return;
    editSide = null;
    draggedHandle = null;
    handleElements.forEach((h) => (h.element.hidden = true));
    opts.onNeckEdit?.(null);
  }
  function startEditing(side) {
    setView(side === 'front' ? 0 : Math.PI);
    editSide = side;
    setAuto(false);
    opts.onNeckEdit?.(side);
    positionHandles();
  }
  function neckAnchors() {
    const path = currentPaths.find((raw) => {
      const c = raw.reduce((a, p) => [a[0] + p[0] / raw.length, a[1] + p[1] / raw.length], [0, 0]);
      return Math.abs(c[0]) < 0.5 && c[1] > -0.4;
    });
    if (!path) return null;
    const points = path.filter((p) => (editSide === 'front' ? p[2] > 0.1 : p[2] < -0.1));
    if (!points.length) return null;
    const center = points.reduce((a, p) => (p[1] < a[1] ? p : a));
    const left = points.reduce((a, p) => (p[0] < a[0] ? p : a));
    const right = points.reduce((a, p) => (p[0] > a[0] ? p : a));
    return [left, center, right].map((p) => new THREE.Vector3((p[0] * size.width) / 100, p[1] + Math.min(0, p[1] - 0.55) * (size.length / 100 - 1), (p[2] * size.width) / 100));
  }
  function positionHandles() {
    if (!editSide) return;
    const anchors = neckAnchors();
    if (!anchors) return;
    handleElements.forEach((h, i) => {
      h.anchor = anchors[i];
      h.element.hidden = false;
      if (draggedHandle?.handle === h) return;
      const point = h.anchor.clone().project(camera);
      h.element.style.left = ((point.x + 1) * container.clientWidth) / 2 + 'px';
      h.element.style.top = ((1 - point.y) * container.clientHeight) / 2 + 'px';
    });
  }
  function pointerOnNeck(event, anchor) {
    const r = container.getBoundingClientRect();
    const v = new THREE.Vector3(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
    const ray = v.sub(camera.position).normalize();
    if (Math.abs(ray.z) < 0.01) return anchor.clone();
    return camera.position.clone().addScaledVector(ray, (anchor.z - camera.position.z) / ray.z);
  }
  const clampSize = (k, v) => Math.max(SIZE_LIMITS[k][0], Math.min(SIZE_LIMITS[k][1], Math.round(v)));
  for (let index = 0; index < 3; index++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'neck-handle';
    button.hidden = true;
    button.textContent = index === 1 ? '↕' : '↔';
    button.dataset.handle = index === 1 ? 'height' : 'width';
    button.setAttribute('aria-label', index === 1 ? 'Neckline depth: drag, or use the up and down arrow keys' : 'Neckline width: drag, or use the left and right arrow keys');
    const h = { element: button, index, anchor: null };
    handleElements.push(h);
    overlay.append(button);
    button.addEventListener('pointerdown', (e) => {
      if (!editSide || !h.anchor) return;
      e.preventDefault();
      e.stopPropagation();
      button.setPointerCapture(e.pointerId);
      draggedHandle = { handle: h, side: editSide, start: pointerOnNeck(e, h.anchor), anchor: h.anchor.clone(), height: size[editSide + 'Height'], width: size[editSide + 'Width'] };
    });
    button.addEventListener('pointermove', (e) => {
      const d = draggedHandle;
      if (!d || d.handle !== h) return;
      e.preventDefault();
      const world = pointerOnNeck(e, d.anchor);
      if (index === 1) {
        const factor = d.anchor.y < 0.55 ? size.length / 100 : 1;
        size[d.side + 'Height'] = clampSize(d.side + 'Height', d.height + (world.y - d.start.y) / (0.006 * factor));
      } else size[d.side + 'Width'] = clampSize(d.side + 'Width', (d.width * Math.abs(world.x)) / Math.max(0.01, Math.abs(d.start.x)));
      const r = container.getBoundingClientRect();
      button.style.left = e.clientX - r.left + 'px';
      button.style.top = e.clientY - r.top + 'px';
      opts.onSize?.({ ...size });
    });
    button.addEventListener('pointerup', (e) => {
      if (draggedHandle?.handle !== h) return;
      e.preventDefault();
      draggedHandle = null;
      status('Updating neckline…');
      setTimeout(() => rebuildNeck() && status('Neckline updated.'), 0);
    });
    button.addEventListener('pointercancel', () => {
      const d = draggedHandle;
      if (!d || d.handle !== h) return;
      size[d.side + 'Height'] = d.height;
      size[d.side + 'Width'] = d.width;
      draggedHandle = null;
      opts.onSize?.({ ...size });
    });
    button.addEventListener('keydown', (e) => {
      if (!editSide) return;
      const k = editSide + (index === 1 ? 'Height' : 'Width');
      const delta = index === 1 ? (e.key === 'ArrowUp' ? 2 : e.key === 'ArrowDown' ? -2 : 0) : e.key === 'ArrowRight' ? 2 : e.key === 'ArrowLeft' ? -2 : 0;
      if (!delta) return;
      e.preventDefault();
      size[k] = clampSize(k, size[k] + delta);
      rebuildNeck();
    });
  }

  // ---------------------------------------------------------------- loop

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Portrait screens: step back so the sleeves stay in view.
    camera.fov = w / h < 0.75 ? 44 : 34;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const setFabricColors = () => hemMaterials.forEach((m) => m.color.set(fabric).lerp(new THREE.Color('#ffffff'), 0.035));
  updateSize();
  updateBorders();
  paint();
  setFabricColors();

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    status('3D graphics paused. Reload this page to reconnect.', true);
  });
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    if (auto) azimuth += Math.min((now - last) / 1000, 0.05) * 0.35;
    last = now;
    camera.position.set(Math.sin(azimuth) * distance * Math.cos(elevation), distance * Math.sin(elevation) - 0.12, Math.cos(azimuth) * distance * Math.cos(elevation));
    camera.lookAt(0, -0.12, 0);
    camera.updateMatrixWorld();
    positionHandles();
    renderer.render(scene, camera);
  });

  // ---------------------------------------------------------------- API

  let neckTimer = 0;
  return {
    panels,
    getSize: () => ({ ...size }),
    getFabric: () => fabric,
    setFabric(color) {
      fabric = color;
      setFabricColors();
      paint();
    },
    /** Changes sizes; neckline keys re-cut the blouse (after `delay` ms, so sliders stay smooth). */
    setSize(patch, delay = 100) {
      const neck = Object.keys(patch).some((k) => /Height$|Width$/.test(k) && k !== 'sleeveWidth');
      for (const [k, v] of Object.entries(patch)) if (k in SIZE_LIMITS) size[k] = clampSize(k, v);
      if (!neck) return void updateSize();
      clearTimeout(neckTimer);
      if (delay <= 0) return void rebuildNeck();
      status('Updating neckline…');
      neckTimer = setTimeout(() => rebuildNeck() && status('Neckline updated.'), delay);
    },
    /** Merges `patch` into panel `i` (0 front, 1 right sleeve, 2 left sleeve, 3 back) and repaints. */
    updatePanel(i, patch) {
      const p = panels[i];
      if ('image' in patch && p.image !== patch.image) p.image?.close?.();
      Object.assign(p, patch);
      updateBorders();
      paint();
    },
    setSampleBorder(on) {
      panels.forEach((p, i) => (p.border = Array.isArray(on) ? on[i] : on));
      updateBorders();
    },
    view(name) {
      setView(typeof name === 'number' ? name : VIEWS[name] ?? 0);
    },
    setAutoRotate: (on) => {
      stopEditing();
      setAuto(on);
    },
    isAutoRotating: () => auto,
    zoomBy: (d) => zoom(distance + d),
    editNeck: (side) => (side ? startEditing(side) : stopEditing()),
    /** PNG data URL of the current view. */
    capture() {
      renderer.render(scene, camera);
      return canvas.toDataURL('image/png');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(neckTimer);
      renderer.setAnimationLoop(null);
      ro.disconnect();
      scene.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      textures.forEach((t) => t.t.dispose());
      panels.forEach((p) => p.edgeTexture?.dispose());
      borderTexture.dispose();
      shadowTexture.dispose();
      renderer.dispose();
      canvas.remove();
      overlay.remove();
    },
  };
}
