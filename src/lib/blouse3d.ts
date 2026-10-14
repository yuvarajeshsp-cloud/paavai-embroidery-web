// 3D blouse preview: the settings stored per design (website_designs.blouse3d)
// and their defaults. Shared by /admin and the design page; the 3D viewer
// itself is src/scripts/blouse3d-viewer.ts (loaded only when opened).

export type PartKey = 'front' | 'back' | 'sleeve_right' | 'sleeve_left';
export type NeckFront = 'round' | 'u' | 'sweetheart' | 'boat';
export type NeckBack = 'deep_u' | 'square' | 'boat' | 'high';
export type Sleeve = 'short' | 'elbow' | 'three_quarter';

/** One uploaded design image and where it sits on its panel. */
export type Placement = {
  url: string;
  /** Width of the design as a share of the panel width (0.05–1). */
  size: number;
  /** Centre of the design across the panel, 0 = left edge … 1 = right edge (as seen from outside). */
  x: number;
  /** Centre of the design up the panel, 0 = hem … 1 = top. */
  y: number;
};

export type Blouse3D = {
  neck_front: NeckFront;
  neck_back: NeckBack;
  sleeve: Sleeve;
  /** Default fabric colour, e.g. #8a1538. Visitors can try other colours. */
  color: string;
  parts: Partial<Record<PartKey, Placement>>;
};

export const PARTS: { key: PartKey; en: string; ta: string }[] = [
  { key: 'front', en: 'Front (right side)', ta: 'முன்பக்கம் (வலது)' },
  { key: 'back', en: 'Back', ta: 'பின்பக்கம்' },
  { key: 'sleeve_right', en: 'Right sleeve', ta: 'வலது கை' },
  { key: 'sleeve_left', en: 'Left sleeve', ta: 'இடது கை' },
];

export const NECK_FRONT: Record<NeckFront, string> = { round: 'Round', u: 'U neck', sweetheart: 'Sweetheart', boat: 'Boat neck' };
export const NECK_BACK: Record<NeckBack, string> = { deep_u: 'Deep U', square: 'Square', boat: 'Boat', high: 'High (closed)' };
export const SLEEVES: Record<Sleeve, string> = { short: 'Short', elbow: 'Elbow length', three_quarter: '¾ length' };

/** Where a newly uploaded design goes. The front design starts on the wearer's right half. */
export const DEFAULT_PLACEMENT: Record<PartKey, Omit<Placement, 'url'>> = {
  front: { size: 0.4, x: 0.3, y: 0.62 },
  back: { size: 0.6, x: 0.5, y: 0.55 },
  sleeve_right: { size: 0.55, x: 0.5, y: 0.22 },
  sleeve_left: { size: 0.55, x: 0.5, y: 0.22 },
};

/** Fabric colours offered to visitors (the design's own colour is always first). */
export const FABRIC_COLORS: { hex: string; en: string; ta: string }[] = [
  { hex: '#8a1538', en: 'Maroon', ta: 'மெரூன்' },
  { hex: '#c2185b', en: 'Rani pink', ta: 'ராணி பிங்க்' },
  { hex: '#e8a33d', en: 'Mustard', ta: 'கடுகு மஞ்சள்' },
  { hex: '#1b5e20', en: 'Bottle green', ta: 'பச்சை' },
  { hex: '#0d47a1', en: 'Royal blue', ta: 'ராயல் நீலம்' },
  { hex: '#4a148c', en: 'Purple', ta: 'ஊதா' },
  { hex: '#111111', en: 'Black', ta: 'கருப்பு' },
  { hex: '#f3ead8', en: 'Cream', ta: 'கிரீம்' },
];

export const emptyBlouse3D = (): Blouse3D => ({
  neck_front: 'u',
  neck_back: 'deep_u',
  sleeve: 'elbow',
  color: FABRIC_COLORS[0].hex,
  parts: {},
});

const pick = <T extends string>(v: unknown, allowed: Record<T, string>, fallback: T): T =>
  typeof v === 'string' && v in allowed ? (v as T) : fallback;
const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Reads stored JSON (possibly from an older version) into a complete Blouse3D, or null if it has no designs. */
export function parseBlouse3D(raw: unknown): Blouse3D | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const base = emptyBlouse3D();
  const parts: Blouse3D['parts'] = {};
  const rawParts = (r.parts ?? {}) as Record<string, Record<string, unknown> | undefined>;
  for (const { key } of PARTS) {
    const p = rawParts[key];
    if (!p || typeof p.url !== 'string' || !p.url) continue;
    const d = DEFAULT_PLACEMENT[key];
    parts[key] = { url: p.url, size: clamp(p.size, 0.05, 1, d.size), x: clamp(p.x, 0, 1, d.x), y: clamp(p.y, 0, 1, d.y) };
  }
  if (!Object.keys(parts).length) return null;
  return {
    neck_front: pick(r.neck_front, NECK_FRONT, base.neck_front),
    neck_back: pick(r.neck_back, NECK_BACK, base.neck_back),
    sleeve: pick(r.sleeve, SLEEVES, base.sleeve),
    color: typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : base.color,
    parts,
  };
}
