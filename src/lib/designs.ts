// Design catalogue: categories (two levels) and designs, edited in /admin
// and loaded from Supabase at build time (only visible ones).
import { content } from './content';
import { localePath, type Lang } from '../i18n/strings';
import { WORK_TYPES } from './work-types';
import { priceLabel, type PriceType } from './price';
import { parseBlouse3D, type Blouse3D } from './blouse3d';

export { WORK_TYPES };

export type Category = {
  id: string;
  parent_id: string | null;
  slug: string;
  name_en: string;
  name_ta: string | null;
  cover_image: string | null;
  position: number;
};


export type { PriceType };

export type Design = {
  code: string;
  category_id: string;
  title: string | null;
  description: string | null;
  price_type: PriceType;
  price: number | null;
  price_max: number | null;
  images: string[];
  video: string | null;
  tags: string[];
  delivery: string | null;
  featured: boolean;
  available: boolean;
  created_at: string;
  /** 3D mannequin preview, or null. */
  blouse3d: Blouse3D | null;
};

const num = (v: unknown) => (v == null || v === '' ? null : Number(v));

export const categories = (content.categories as Category[]).sort((a, b) => a.position - b.position);
export const designs = (content.designs as Design[]).map((d) => ({
  ...d,
  price: num(d.price),
  price_max: num(d.price_max),
  blouse3d: parseBlouse3D(d.blouse3d),
}));

// Popularity over the last 60 days (views + 5 × ♡ + 10 × WhatsApp enquiries),
// from the anonymous counters. The top designs get a "Popular" badge.
const popular = content.popular as Record<string, number>;
export const popularity = (code: string) => popular[code] ?? 0;
const ranked = Object.entries(popular).sort((a, b) => b[1] - a[1]);
const popularCodes = new Set(ranked.slice(0, Math.max(3, Math.ceil(designs.length / 10))).filter(([, n]) => n >= 10).map(([c]) => c));
export const isPopular = (code: string) => popularCodes.has(code);

const byId = new Map(categories.map((c) => [c.id, c]));
export const categoryById = (id: string | null) => (id ? byId.get(id) : undefined);
export const topCategories = categories.filter((c) => !c.parent_id);
export const subcategories = (parentId: string) => categories.filter((c) => c.parent_id === parentId);

export const categoryName = (c: Category, lang: Lang) => (lang === 'ta' && c.name_ta) || c.name_en;

/** "Blouse › Back neck" */
export function categoryPath(c: Category, lang: Lang) {
  const parent = categoryById(c.parent_id);
  return parent ? `${categoryName(parent, lang)} › ${categoryName(c, lang)}` : categoryName(c, lang);
}

/** Designs in a category, including its subcategories. */
export function designsIn(categoryId: string) {
  const ids = new Set([categoryId, ...subcategories(categoryId).map((c) => c.id)]);
  return designs.filter((d) => ids.has(d.category_id));
}

/** Categories that have at least one design (directly or in a subcategory). */
export const hasDesigns = (c: Category) => designsIn(c.id).length > 0;

export const designUrl = (lang: Lang, code: string) => localePath(lang, `/design/${code.toLowerCase()}`);
export const categoryUrl = (lang: Lang, slug: string) => localePath(lang, `/designs/${slug}`);

export const designName = (d: Design, lang: Lang) => d.title || categoryName(categoryById(d.category_id)!, lang);

export { priceLabel };

/** Lowest and highest price, for filtering ("ask" designs have none). */
export function priceBounds(d: Design): [number, number] | null {
  if (d.price_type === 'ask' || d.price == null) return null;
  const max = d.price_type === 'from' ? Infinity : d.price_type === 'range' && d.price_max != null ? d.price_max : d.price;
  return [d.price, max];
}

export const PRICE_BUCKETS = [
  { id: 'u1000', min: 0, max: 999, en: 'Under ₹1,000', ta: '₹1,000-க்கு கீழ்' },
  { id: '1000-3000', min: 1000, max: 3000, en: '₹1,000 – ₹3,000', ta: '₹1,000 – ₹3,000' },
  { id: '3000-6000', min: 3000, max: 6000, en: '₹3,000 – ₹6,000', ta: '₹3,000 – ₹6,000' },
  { id: '6000', min: 6000, max: Infinity, en: '₹6,000 and above', ta: '₹6,000 மற்றும் மேல்' },
] as const;

export const tagLabel = (tag: string, lang: Lang) => WORK_TYPES[tag]?.[lang] ?? tag;

/** Shown with a "New" badge for 30 days. */
export const isNew = (d: Design, now = Date.now()) => now - new Date(d.created_at).getTime() < 30 * 864e5;
