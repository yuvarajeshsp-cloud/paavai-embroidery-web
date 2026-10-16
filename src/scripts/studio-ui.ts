// Blouse Studio controls (colour, size, necklines, the four embroidery
// panels with PNG/DST upload and placement) for a running studio engine.
// Shared by the public /studio page and the 3D editor in /admin.
import { DST_PALETTE, PANEL_VIEW, PART_KEYS, PLACEMENT_DEFAULTS, SIZE_LIMITS, SIZE_PRESETS, rasterDST } from '../lib/studio/engine.js';
import { parseDST } from '../lib/studio/dst.js';
import type { Studio } from './blouse3d-viewer';
import type { Strings } from '../i18n/strings';

export type Labels = Strings['studio'];
type Dst = ReturnType<typeof parseDST>;

/** Where a panel's design came from: a new file (kept for saving) or a stored image. */
export type Source = {
  kind: 'png' | 'dst';
  name: string;
  file?: File;
  dst?: Dst;
  colors: string[];
  url?: string;
  edgeUrl?: string | null;
};

/** Engine callbacks the controls listen to; pass the same object to createStudio. */
export type Hooks = {
  onStatus?: (text: string, error?: boolean) => void;
  onSize?: (size: Record<string, number>) => void;
  onView?: (name: string) => void;
  onAutoRotate?: (on: boolean) => void;
  onNeckEdit?: (side: 'front' | 'back' | null) => void;
};

type Options = {
  labels: Labels;
  partNames: string[];
  swatches: { hex: string; label: string }[];
  hooks: Hooks;
  status: (text: string, error?: boolean) => void;
  sources?: (Source | null)[];
  /** Show the "sample border" toggle (public studio). */
  sampleToggle?: boolean;
  /** Called after anything changes (admin marks the form dirty). */
  onChange?: () => void;
  /** Element whose content shows the neck-editing state (hint, Done button). */
  neckBar?: HTMLElement;
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string | null | false | undefined)[]) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = String(v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('aria-') || k === 'role' || k === 'for') node.setAttribute(k, String(v));
    else (node as unknown as Record<string, unknown>)[k] = v;
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

let uid = 0;

/** Fills {name} placeholders in a label. */
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));

export function mountStudioControls(root: HTMLElement, studio: Studio, o: Options) {
  const L = o.labels;
  const id = (name: string) => `stu${uid}-${name}`;
  uid++;
  const sources: (Source | null)[] = o.sources ?? PART_KEYS.map(() => null);
  let selected = 0;
  const changed = () => o.onChange?.();

  // ------------------------------------------------------------ colour
  const swatchButtons = o.swatches.map((c) =>
    h('button', { type: 'button', class: 'stu-swatch', title: c.label, 'aria-label': c.label, dataset: { color: c.hex }, style: `--c:${c.hex}` }),
  );
  const custom = h('input', { type: 'color', id: id('colour'), value: studio.getFabric(), 'aria-label': L.colour });
  const pickColour = (hex: string) => {
    studio.setFabric(hex);
    custom.value = hex;
    swatchButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === hex)));
    changed();
  };
  swatchButtons.forEach((b) => b.addEventListener('click', () => pickColour(b.dataset.color!)));
  custom.addEventListener('input', () => pickColour(custom.value));
  swatchButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === studio.getFabric())));

  // ------------------------------------------------------------ size and neckline
  const sliders = new Map<string, { input: HTMLInputElement; out: HTMLOutputElement }>();
  const slider = (key: string, label: string) => {
    const [min, max] = SIZE_LIMITS[key as keyof typeof SIZE_LIMITS];
    const input = h('input', { type: 'range', id: id(key), min: String(min), max: String(max), value: String(studio.getSize()[key]) });
    const out = h('output', { for: id(key) }, `${input.value}%`);
    input.addEventListener('input', () => {
      out.textContent = `${input.value}%`;
      if (key in SIZE_PRESETS.regular) preset.value = 'custom';
      if (/^(front|back)/.test(key)) studio.view(key.startsWith('front') ? 'front' : 'back');
      studio.setSize({ [key]: Number(input.value) });
      changed();
    });
    sliders.set(key, { input, out });
    return h('div', { class: 'stu-control' }, h('label', { for: id(key) }, label, out), input);
  };
  const syncSliders = (size: Record<string, number>) => {
    for (const [k, s] of sliders) {
      s.input.value = String(size[k]);
      s.out.textContent = `${size[k]}%`;
    }
  };
  o.hooks.onSize = syncSliders;

  const preset = h(
    'select',
    { id: id('preset') },
    ...(['compact', 'regular', 'full', 'custom'] as const).map((k) => h('option', { value: k, disabled: k === 'custom' }, L.presets[k])),
  );
  const matchPreset = () => {
    const size = studio.getSize();
    const found = Object.entries(SIZE_PRESETS).find(([, p]) => Object.entries(p).every(([k, v]) => size[k] === v));
    preset.value = found?.[0] ?? 'custom';
  };
  matchPreset();
  preset.addEventListener('change', () => {
    const p = SIZE_PRESETS[preset.value as keyof typeof SIZE_PRESETS];
    if (!p) return;
    studio.setSize(p);
    syncSliders(studio.getSize());
    changed();
  });

  const neckButton = (side: 'front' | 'back') => {
    const b = h('button', { type: 'button', class: 'stu-btn stu-btn--small' }, L.dragNeck);
    b.addEventListener('click', () => studio.editNeck(side));
    return b;
  };
  const resetSize = h('button', { type: 'button', class: 'stu-btn stu-btn--small' }, L.reset);
  resetSize.addEventListener('click', () => {
    studio.editNeck(null);
    studio.setSize({ ...SIZE_PRESETS.regular, sleeveWidth: 100, frontHeight: 100, frontWidth: 100, backHeight: 100, backWidth: 100 }, 0);
    syncSliders(studio.getSize());
    matchPreset();
    changed();
  });

  // Neckline drag mode: hint and Done button.
  if (o.neckBar) {
    const done = h('button', { type: 'button', class: 'stu-btn stu-btn--primary stu-btn--small' }, L.done);
    done.addEventListener('click', () => studio.editNeck(null));
    const bar = o.neckBar;
    o.hooks.onNeckEdit = (side) => {
      bar.hidden = !side;
      bar.replaceChildren(...(side ? [h('span', {}, L.neckEditHint), done] : []));
      if (!side) changed();
    };
  }

  // ------------------------------------------------------------ panels
  const slotList = h('div', { class: 'stu-slots', role: 'group', 'aria-label': L.designs });
  const file = h('input', { type: 'file', id: id('file'), accept: '.png,.dst,image/png', class: 'stu-file' });
  const uploadLabel = h('label', { class: 'stu-upload', for: id('file') }, h('strong', {}, `＋ ${L.upload}`), h('span', {}, L.uploadHint), file);
  const mode = h(
    'select',
    { id: id('mode') },
    h('option', { value: 'edge' }, L.modeEdge),
    h('option', { value: 'free' }, L.modeFree),
  );
  const layout = h(
    'select',
    { id: id('layout') },
    h('option', { value: 'auto' }, L.layoutAuto),
    h('option', { value: 'straight' }, L.layoutStraight),
    h('option', { value: 'u' }, L.layoutU),
  );
  const layoutRow = h('div', { class: 'stu-field' }, h('label', { for: id('layout') }, L.layout), layout);
  const autoFit = h('button', { type: 'button', class: 'stu-btn stu-btn--primary' }, L.autoFit);
  const placement = h('div', { class: 'stu-placement' });
  const threads = h('div', { class: 'stu-threads' });
  const resetPlace = h('button', { type: 'button', class: 'stu-btn stu-btn--small' }, L.resetPlacement);
  const remove = h('button', { type: 'button', class: 'stu-btn stu-btn--small stu-btn--danger' }, L.remove);
  const panelTools = h(
    'div',
    { class: 'stu-panel-tools' },
    autoFit,
    h('div', { class: 'stu-field' }, h('label', { for: id('mode') }, L.placement), mode),
    layoutRow,
    placement,
    threads,
    h('div', { class: 'stu-row' }, resetPlace, remove),
  );

  function renderSlots() {
    slotList.replaceChildren(
      ...o.partNames.map((name, i) => {
        const p = studio.panels[i];
        const src = sources[i];
        const b = h(
          'button',
          { type: 'button', class: 'stu-slot', 'aria-pressed': String(selected === i) },
          h('span', { class: 'stu-slot__num' }, String(i + 1).padStart(2, '0')),
          h('span', { class: 'stu-slot__text' }, h('b', {}, name), h('small', {}, src ? src.name : p.border ? L.sample : L.empty)),
          h('span', { class: 'stu-slot__dot', 'aria-hidden': 'true' }, src ? '●' : '＋'),
        );
        b.addEventListener('click', () => {
          selected = i;
          studio.view(PANEL_VIEW[i]);
          renderSlots();
          renderPanel();
        });
        return b;
      }),
    );
  }

  function renderPanel() {
    const p = studio.panels[selected];
    const src = sources[selected];
    panelTools.hidden = !src;
    if (!src) return;
    mode.value = p.mode;
    layout.value = p.layout;
    layoutRow.hidden = src.kind !== 'dst';
    const edge = p.mode === 'edge';
    const controls: [string, string, number, number, string][] = [
      ['width', L.ctl.width, 20, 180, '%'],
      ['height', L.ctl.height, 20, 200, '%'],
      ['x', edge ? L.ctl.along : L.ctl.horizontal, -50, 50, '%'],
      ['y', edge ? L.ctl.inset : L.ctl.vertical, edge ? 0 : -50, edge ? 80 : 50, '%'],
      ['angle', L.ctl.angle, -180, 180, '°'],
    ];
    placement.replaceChildren(
      ...controls.map(([key, label, min, max, unit]) => {
        const input = h('input', { type: 'range', id: id('ctl-' + key), min: String(min), max: String(max), value: String(Math.max(min, Math.min(max, (p as unknown as Record<string, number>)[key]))) });
        const out = h('output', { for: id('ctl-' + key) }, `${input.value}${unit}`);
        input.addEventListener('input', () => {
          out.textContent = `${input.value}${unit}`;
          studio.updatePanel(selected, { [key]: Number(input.value) });
          changed();
        });
        return h('div', { class: 'stu-control' }, h('label', { for: id('ctl-' + key) }, label, out), input);
      }),
    );
    threads.replaceChildren();
    if (src.dst) {
      const dst = src.dst;
      threads.append(
        h('p', { class: 'stu-sub' }, L.threads),
        h(
          'div',
          { class: 'stu-row' },
          ...src.colors.map((c, i) => {
            const input = h('input', { type: 'color', value: c, title: `${L.threads} ${i + 1}`, 'aria-label': `${L.threads} ${i + 1}` });
            input.addEventListener('input', () => {
              src.colors[i] = input.value;
              studio.updatePanel(selected, { colors: [...src.colors], image: rasterDST(dst, src.colors) });
              changed();
            });
            return input;
          }),
        ),
      );
    }
  }

  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    const target = selected;
    const name = o.partNames[target];
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error(L.tooBig);
      let image: CanvasImageSource & { width: number; height: number };
      let src: Source;
      if (/\.dst$/i.test(f.name)) {
        const dst = parseDST(await f.arrayBuffer());
        const colors = Array.from({ length: dst.groups }, (_, i) => DST_PALETTE[i % DST_PALETTE.length]);
        image = rasterDST(dst, colors);
        src = { kind: 'dst', name: f.name, file: f, dst, colors };
        studio.updatePanel(target, { ...PLACEMENT_DEFAULTS, border: false, image, edgeImage: null, dst, colors });
        o.status(fill(L.addedDst, { part: name, stitches: dst.lines.length.toLocaleString('en-IN'), w: dst.widthMM.toFixed(0), h: dst.heightMM.toFixed(0) }));
      } else if (/\.png$/i.test(f.name) || f.type === 'image/png') {
        const head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
        if (head[0] !== 137 || head[1] !== 80 || head[2] !== 78 || head[3] !== 71) throw new Error(L.notPng);
        const bitmap = await createImageBitmap(f);
        if (bitmap.width > 12000 || bitmap.height > 12000) {
          bitmap.close();
          throw new Error(L.pngTooLarge);
        }
        image = bitmap;
        src = { kind: 'png', name: f.name, file: f, colors: [] };
        studio.updatePanel(target, { ...PLACEMENT_DEFAULTS, border: false, image, edgeImage: null, dst: null, colors: [] });
        o.status(fill(L.added, { part: name }));
      } else throw new Error(L.wrongType);
      sources[target] = src;
      studio.view(PANEL_VIEW[target]);
      renderSlots();
      renderPanel();
      changed();
    } catch (err) {
      o.status(err instanceof Error ? err.message : String(err), true);
    }
  });
  autoFit.addEventListener('click', () => {
    studio.updatePanel(selected, { ...PLACEMENT_DEFAULTS, layout: studio.panels[selected].layout });
    renderPanel();
    changed();
  });
  mode.addEventListener('change', () => {
    studio.updatePanel(selected, { mode: mode.value });
    renderPanel();
    changed();
  });
  layout.addEventListener('change', () => {
    studio.updatePanel(selected, { layout: layout.value });
    changed();
  });
  resetPlace.addEventListener('click', () => {
    studio.updatePanel(selected, { width: 100, height: 100, x: 0, y: 0, angle: 0 });
    renderPanel();
    changed();
  });
  remove.addEventListener('click', () => {
    sources[selected] = null;
    studio.updatePanel(selected, { image: null, edgeImage: null, dst: null, colors: [], border: false });
    o.status(fill(L.removed, { part: o.partNames[selected] }));
    renderSlots();
    renderPanel();
    changed();
  });

  // ------------------------------------------------------------ layout
  let sampleButton: HTMLButtonElement | null = null;
  if (o.sampleToggle) {
    sampleButton = h('button', { type: 'button', class: 'stu-btn stu-btn--small' });
    const syncSample = () => (sampleButton!.textContent = studio.panels.some((p) => p.border) ? L.hideSample : L.showSample);
    sampleButton.addEventListener('click', () => {
      studio.setSampleBorder(!studio.panels.some((p) => p.border));
      syncSample();
      renderSlots();
    });
    syncSample();
  }

  root.replaceChildren(
    h('section', { class: 'stu-section' }, h('h3', {}, L.colour), h('div', { class: 'stu-swatches' }, ...swatchButtons, h('label', { class: 'stu-swatch stu-swatch--custom', title: L.colour }, custom))),
    h(
      'section',
      { class: 'stu-section' },
      h('h3', {}, L.size),
      h('div', { class: 'stu-field' }, h('label', { for: id('preset') }, L.preset), preset),
      ...(['width', 'length', 'sleeve', 'sleeveWidth'] as const).map((k) => slider(k, L.sizes[k])),
      h('h3', {}, L.frontNeck),
      neckButton('front'),
      slider('frontHeight', L.neckHeight),
      slider('frontWidth', L.neckWidth),
      h('h3', {}, L.backNeck),
      neckButton('back'),
      slider('backHeight', L.neckHeight),
      slider('backWidth', L.neckWidth),
      h('p', { class: 'stu-sub' }, L.neckHint),
      resetSize,
      h('p', { class: 'stu-sub' }, L.sizeNote),
    ),
    h(
      'section',
      { class: 'stu-section' },
      h('h3', {}, L.designs),
      h('p', { class: 'stu-sub' }, `${L.designsHint} ${L.frontLeftPlain}`),
      slotList,
      uploadLabel,
      panelTools,
      sampleButton,
    ),
  );
  renderSlots();
  renderPanel();

  return { sources, selected: () => selected };
}
