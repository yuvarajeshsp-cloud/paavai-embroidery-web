// 3D blouse view of a design (website_designs.blouse3d): the Blouse Studio
// settings saved in /admin and shown by "View in 3D". No three.js here; the
// 3D engine is src/lib/studio/engine.js, loaded only when a view opens.

/** Order matches the engine's panels (0 front … 3 back). */
export const PART_KEYS = ['front', 'sleeve_right', 'sleeve_left', 'back'] as const;
export type PartKey = (typeof PART_KEYS)[number];

export type Size = {
  width: number;
  length: number;
  sleeve: number;
  sleeveWidth: number;
  frontHeight: number;
  frontWidth: number;
  backHeight: number;
  backWidth: number;
};

/** One embroidery panel: an image (PNG, or a DST drawn as stitches) and where it sits. */
export type Part = {
  /** Watermarked image (a DST is stored as its stitch drawing, never as the machine file). */
  url: string;
  /** For a U-shaped DST neckline: the stitches already unwrapped into a straight strip. */
  edge_url?: string | null;
  kind: 'png' | 'dst';
  /** 'edge' follows the blouse edge (neckline or sleeve cuff); 'free' places it on the panel. */
  mode: 'edge' | 'free';
  layout: 'auto' | 'straight' | 'u';
  width: number;
  height: number;
  x: number;
  y: number;
  angle: number;
  name?: string;
};

export type Blouse3D = {
  v: 2;
  /** Default fabric colour; visitors can try others. */
  color: string;
  size: Size;
  parts: Partial<Record<PartKey, Part>>;
};

export const DEFAULT_SIZE: Size = { width: 100, length: 100, sleeve: 100, sleeveWidth: 100, frontHeight: 100, frontWidth: 100, backHeight: 100, backWidth: 100 };

export const PARTS: { key: PartKey; en: string; ta: string }[] = [
  { key: 'front', en: 'Front (right side)', ta: 'முன்பக்கம் (வலது)' },
  { key: 'sleeve_right', en: 'Right sleeve', ta: 'வலது கை' },
  { key: 'sleeve_left', en: 'Left sleeve', ta: 'இடது கை' },
  { key: 'back', en: 'Back', ta: 'பின்பக்கம்' },
];

/** Fabric colours offered to visitors (the design's own colour is always first). */
export const FABRIC_COLORS: { hex: string; en: string; ta: string }[] = [
  { hex: '#654577', en: 'Plum', ta: 'பிளம்' },
  { hex: '#8a1538', en: 'Maroon', ta: 'மெரூன்' },
  { hex: '#c2185b', en: 'Rani pink', ta: 'ராணி பிங்க்' },
  { hex: '#185c58', en: 'Peacock green', ta: 'மயில் பச்சை' },
  { hex: '#26364d', en: 'Navy', ta: 'கடற்படை நீலம்' },
  { hex: '#e8a33d', en: 'Mustard', ta: 'கடுகு மஞ்சள்' },
  { hex: '#111111', en: 'Black', ta: 'கருப்பு' },
  { hex: '#f3ead8', en: 'Cream', ta: 'கிரீம்' },
];

const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const SIZE_RANGE: Record<keyof Size, [number, number]> = {
  width: [85, 120],
  length: [85, 120],
  sleeve: [75, 135],
  sleeveWidth: [80, 125],
  frontHeight: [60, 140],
  frontWidth: [80, 125],
  backHeight: [60, 140],
  backWidth: [80, 125],
};

/** Reads stored JSON into a complete Blouse3D, or null when it has no designs (or is an old format). */
export function parseBlouse3D(raw: unknown): Blouse3D | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 2) return null;
  const rawSize = (r.size ?? {}) as Record<string, unknown>;
  const size = Object.fromEntries(
    (Object.keys(SIZE_RANGE) as (keyof Size)[]).map((k) => [k, num(rawSize[k], ...SIZE_RANGE[k], DEFAULT_SIZE[k])]),
  ) as Size;
  const parts: Blouse3D['parts'] = {};
  const rawParts = (r.parts ?? {}) as Record<string, Record<string, unknown> | undefined>;
  for (const key of PART_KEYS) {
    const p = rawParts[key];
    if (!p || typeof p.url !== 'string' || !p.url) continue;
    parts[key] = {
      url: p.url,
      edge_url: typeof p.edge_url === 'string' && p.edge_url ? p.edge_url : null,
      kind: p.kind === 'dst' ? 'dst' : 'png',
      mode: p.mode === 'free' ? 'free' : 'edge',
      layout: p.layout === 'u' || p.layout === 'straight' ? p.layout : 'auto',
      width: num(p.width, 20, 180, 100),
      height: num(p.height, 20, 200, 100),
      x: num(p.x, -50, 50, 0),
      y: num(p.y, -50, 80, 0),
      angle: num(p.angle, -180, 180, 0),
      name: typeof p.name === 'string' ? p.name : undefined,
    };
  }
  if (!Object.keys(parts).length) return null;
  return { v: 2, color: typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : FABRIC_COLORS[0].hex, size, parts };
}

/** Every stored image of a 3D view (to delete replaced files). */
export const blouse3DUrls = (b: Blouse3D | null | undefined) =>
  Object.values(b?.parts ?? {}).flatMap((p) => [p!.url, p!.edge_url].filter((u): u is string => !!u));
