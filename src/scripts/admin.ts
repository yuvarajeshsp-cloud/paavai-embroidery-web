// Website admin (/admin). Signs in with Supabase (the Shop Manager accounts),
// edits the design catalogue (website_categories / website_designs), reviews
// and services (website_items) and shop details (website_settings), and
// uploads media to the website-media bucket. Row level security enforces who
// may change what; the checks here only decide what to show.
import { createClient, type Session } from '@supabase/supabase-js';
import { MEDIA_BUCKET, SHOP_ORG_ID, SUPABASE_KEY, SUPABASE_URL } from '../config/supabase';
import { WORK_TYPES } from '../lib/work-types';

type Kind = 'review' | 'service';
type Data = Record<string, unknown>;
type Item = { id: string; kind: Kind; position: number; hidden: boolean; data: Data; updated_at: string };
type Category = {
  id: string;
  parent_id: string | null;
  slug: string;
  name_en: string;
  name_ta: string | null;
  cover_image: string | null;
  position: number;
  hidden: boolean;
  updated_at: string;
};
type PriceType = 'fixed' | 'from' | 'range' | 'ask';
type Design = {
  id: string;
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
  hidden: boolean;
  created_at: string;
  updated_at: string;
};

type Option = string | { value: string; label: string };
type Field = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'image' | 'url' | 'images' | 'tags' | 'video';
  options?: Option[];
  hint?: string;
  required?: boolean;
  full?: boolean;
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'paavai-website-admin' },
});

const SERVICE_CATEGORIES = ['Bridal', 'Blouse', 'Machine', 'Kids', 'Other'];
const WATERMARK = 'Paavai Embroidery';
const PAGE = 50;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const root = $('#admin');

let session: Session | null = null;
let items: Item[] = [];
let categories: Category[] = [];
let designs: Design[] = [];
let settings: Data = {};
let publishedAt: string | null = null;
let lastChange = 0;
let designLimit = PAGE;

// ---------------------------------------------------------------- helpers

function toast(text: string, tone: 'ok' | 'error' = 'ok') {
  const el = $('#toast');
  el.textContent = text;
  el.dataset.tone = tone;
  el.dataset.show = 'true';
  clearTimeout(Number(el.dataset.timer));
  el.dataset.timer = String(setTimeout(() => (el.dataset.show = 'false'), tone === 'error' ? 6000 : 2500));
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & Data = {},
  ...children: (Node | string | null | false | undefined)[]
) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'class') node.className = String(v);
    else (node as unknown as Data)[k] = v;
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

const str = (v: unknown) => (v == null ? '' : String(v));
const now = () => new Date().toISOString();
const errMsg = (err: unknown, fallback: string) =>
  err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : fallback;

function markChanged() {
  lastChange = Date.now();
  renderPublishStatus();
}

function renderPublishStatus() {
  const status = $('#publish-status');
  const pub = publishedAt ? new Date(publishedAt).getTime() : 0;
  if (lastChange > pub) {
    status.textContent = 'You have changes that are not on the website yet.';
    status.style.color = '#8a5a00';
  } else {
    status.textContent = publishedAt ? `Last published ${new Date(publishedAt).toLocaleString('en-IN')}` : '';
    status.style.color = '';
  }
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'category';

// ---------------------------------------------------------------- uploads

// Phone photos are large; shrink to at most `max` px and re-encode as JPEG
// so uploads are quick on mobile data and storage lasts. With `watermark`,
// the shop name and design code are drawn in the bottom-right corner.
async function prepareImage(file: File, opts: { max?: number; watermark?: string; keepFormat?: boolean } = {}): Promise<Blob> {
  const { max = 2000, watermark, keepFormat = false } = opts;
  if (keepFormat || file.type === 'image/svg+xml' || !file.type.startsWith('image/')) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (watermark) throw new Error(`${file.name}: this photo format can't be read. Save it as JPG and try again.`);
    return file; // e.g. HEIC the browser can't decode: upload as is
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  if (!watermark && scale === 1 && file.size < 1_500_000 && file.type === 'image/jpeg') return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (watermark) {
    const size = Math.max(14, Math.round(Math.min(canvas.width, canvas.height) * 0.032));
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const x = canvas.width - size * 0.8;
    const y = canvas.height - size * 0.7;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.35;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(watermark, x, y);
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
  return blob ?? file;
}

async function uploadBlob(body: Blob, folder: string, name: string): Promise<string> {
  const type = body.type || 'application/octet-stream';
  const ext = type === 'image/jpeg' ? 'jpg' : (name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${SHOP_ORG_ID}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, body, { contentType: type, cacheControl: '31536000' });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function upload(file: File, folder: string, keepFormat = false): Promise<string> {
  if (file.type.startsWith('video/')) {
    if (file.size > 50 * 1024 * 1024) throw new Error('Video is larger than 50 MB. Upload it to YouTube or Instagram instead.');
    return uploadBlob(file, folder, file.name);
  }
  return uploadBlob(await prepareImage(file, { keepFormat }), folder, file.name);
}

const uploadDesignPhoto = async (file: File, code: string) =>
  uploadBlob(await prepareImage(file, { max: 1600, watermark: `${WATERMARK} · ${code}` }), 'designs', file.name);

const bucketPrefix = `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/`;
const toPaths = (urls: unknown[]) =>
  urls.map(str).filter((u) => u.startsWith(bucketPrefix)).map((u) => decodeURIComponent(u.slice(bucketPrefix.length)));

async function removeMedia(urls: unknown[]) {
  const paths = toPaths(urls);
  if (paths.length) await supabase.storage.from(MEDIA_BUCKET).remove(paths).catch(() => {});
}

async function showUsage() {
  const { data } = await supabase.rpc('website_media_usage');
  if (!data) return;
  const mb = (b: number) => `${Math.round(b / 1048576)} MB`;
  const total = Number(data.project_bytes);
  const pct = Math.round((total / 1073741824) * 100);
  const box = $('#usage');
  box.textContent = `Storage: website photos ${mb(Number(data.website_bytes))} · total used ${mb(total)} of 1 GB (${pct}%, free plan, shared with Shop Manager).`;
  box.dataset.warn = String(pct >= 80);
  if (pct >= 80) box.textContent += ' Getting full: consider the Supabase Pro plan.';
}

// ---------------------------------------------------------------- data

async function loadAll() {
  const [it, st, ca, de] = await Promise.all([
    supabase.from('website_items').select('id, kind, position, hidden, data, updated_at').in('kind', ['review', 'service']).order('position'),
    supabase.from('website_settings').select('data, published_at, updated_at').maybeSingle(),
    supabase.from('website_categories').select('*').order('position'),
    supabase.from('website_designs').select('*').order('created_at', { ascending: false }),
  ]);
  for (const r of [it, ca, de]) if (r.error) throw r.error;
  items = (it.data ?? []) as Item[];
  settings = (st.data?.data as Data) ?? {};
  publishedAt = st.data?.published_at ?? null;
  categories = (ca.data ?? []) as Category[];
  designs = ((de.data ?? []) as Design[]).map((d) => ({ ...d, price: d.price == null ? null : Number(d.price), price_max: d.price_max == null ? null : Number(d.price_max) }));
  const times = [
    ...items.map((i) => i.updated_at),
    ...categories.map((c) => c.updated_at),
    ...designs.map((d) => d.updated_at),
    st.data?.updated_at,
  ].filter(Boolean) as string[];
  lastChange = Math.max(0, ...times.map((t) => new Date(t).getTime()));
  renderAll();
  void showUsage();
}

const listOf = (kind: Kind) => items.filter((i) => i.kind === kind).sort((a, b) => a.position - b.position);

async function createItem(kind: Kind, data: Data, hidden = false) {
  const list = listOf(kind);
  const position = list.length ? Math.max(...list.map((i) => i.position)) + 1 : 0;
  const { data: row, error } = await supabase
    .from('website_items')
    .insert({ organization_id: SHOP_ORG_ID, kind, position, hidden, data, updated_by: session?.user.id })
    .select('id, kind, position, hidden, data, updated_at')
    .single();
  if (error) throw error;
  items.push(row as Item);
  markChanged();
}

async function updateItem(item: Item, patch: Partial<Pick<Item, 'data' | 'hidden' | 'position'>>) {
  const { error } = await supabase.from('website_items').update({ ...patch, updated_at: now(), updated_by: session?.user.id }).eq('id', item.id);
  if (error) throw error;
  Object.assign(item, patch);
  markChanged();
}

async function deleteItem(item: Item) {
  const { error } = await supabase.from('website_items').delete().eq('id', item.id);
  if (error) throw error;
  items = items.filter((i) => i.id !== item.id);
  await removeMedia([item.data.image]);
  markChanged();
}

/** Swap an item with its neighbour in `list`, saving both positions. */
async function swap<T extends { id: string; position: number }>(table: string, list: T[], item: T, dir: -1 | 1) {
  list.forEach((it, i) => (it.position = i));
  const other = list[list.indexOf(item) + dir];
  if (!other) return;
  [item.position, other.position] = [other.position, item.position];
  for (const it of list) {
    const { error } = await supabase.from(table).update({ position: it.position }).eq('id', it.id);
    if (error) throw error;
  }
  markChanged();
}

// Categories

const catById = (id: string | null) => categories.find((c) => c.id === id);
const topCats = () => categories.filter((c) => !c.parent_id).sort((a, b) => a.position - b.position);
const childCats = (id: string) => categories.filter((c) => c.parent_id === id).sort((a, b) => a.position - b.position);
const catLabel = (c: Category) => {
  const p = catById(c.parent_id);
  return p ? `${p.name_en} › ${c.name_en}` : c.name_en;
};
/** Category choices for a design: top-level categories with their subcategories under them. */
const catOptions = () => topCats().flatMap((c) => [{ value: c.id, label: c.name_en }, ...childCats(c.id).map((s) => ({ value: s.id, label: `${c.name_en} › ${s.name_en}` }))]);
const designCount = (catId: string) =>
  designs.filter((d) => d.category_id === catId || catById(d.category_id)?.parent_id === catId).length;

async function saveCategory(cat: Category | null, out: Data) {
  const row = {
    name_en: str(out.name_en).trim(),
    name_ta: str(out.name_ta).trim() || null,
    parent_id: str(out.parent_id) || null,
    cover_image: str(out.cover_image) || null,
    hidden: Boolean(out.hidden),
    updated_at: now(),
    updated_by: session?.user.id,
  };
  if (cat) {
    if (row.parent_id && childCats(cat.id).length) throw new Error('This category has subcategories, so it must stay a top-level category.');
    const { error } = await supabase.from('website_categories').update(row).eq('id', cat.id);
    if (error) throw error;
    if (cat.cover_image && cat.cover_image !== row.cover_image) await removeMedia([cat.cover_image]);
    Object.assign(cat, row);
  } else {
    const taken = new Set(categories.map((c) => c.slug));
    const base = slugify(row.parent_id ? `${catById(row.parent_id)!.slug}-${row.name_en}` : row.name_en);
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    const siblings = categories.filter((c) => c.parent_id === row.parent_id);
    const position = siblings.length ? Math.max(...siblings.map((c) => c.position)) + 1 : 0;
    const { data, error } = await supabase
      .from('website_categories')
      .insert({ ...row, organization_id: SHOP_ORG_ID, slug, position })
      .select('*')
      .single();
    if (error) throw error;
    categories.push(data as Category);
  }
  markChanged();
}

async function deleteCategory(cat: Category) {
  if (childCats(cat.id).length) throw new Error('Delete or move its subcategories first, or hide it instead.');
  if (designCount(cat.id)) throw new Error('This category still has designs. Move or delete them first, or hide the category.');
  const { error } = await supabase.from('website_categories').delete().eq('id', cat.id);
  if (error) throw error;
  categories = categories.filter((c) => c.id !== cat.id);
  await removeMedia([cat.cover_image]);
  markChanged();
}

// Designs

const DESIGN_COLUMNS = 'id, code, category_id, title, description, price_type, price, price_max, images, video, tags, delivery, featured, available, hidden, created_at, updated_at';

async function insertDesign(row: Partial<Design>): Promise<Design> {
  const { data, error } = await supabase
    .from('website_designs')
    .insert({ organization_id: SHOP_ORG_ID, updated_by: session?.user.id, ...row })
    .select(DESIGN_COLUMNS)
    .single();
  if (error) throw error;
  const d = data as Design;
  designs.unshift(d);
  markChanged();
  return d;
}

async function updateDesign(d: Design, patch: Partial<Design>) {
  const { error } = await supabase
    .from('website_designs')
    .update({ ...patch, updated_at: now(), updated_by: session?.user.id })
    .eq('id', d.id);
  if (error) throw error;
  Object.assign(d, patch);
  markChanged();
}

async function deleteDesign(d: Design) {
  const { error } = await supabase.from('website_designs').delete().eq('id', d.id);
  if (error) throw error;
  designs = designs.filter((x) => x.id !== d.id);
  await removeMedia([...d.images, d.video]);
  markChanged();
}

function checkPrice(type: PriceType, price: number | null, max: number | null) {
  if (type !== 'ask' && price == null) throw new Error('Enter a price, or choose “Price on request”.');
  if (type === 'range' && (max == null || max < (price ?? 0))) throw new Error('For a range, the second price must be higher than the first.');
}

// ---------------------------------------------------------------- forms

const reviewFields: Field[] = [
  { key: 'name', label: 'Customer name', type: 'text', required: true },
  { key: 'rating', label: 'Stars', type: 'select', options: ['5', '4', '3', '2', '1'] },
  { key: 'text_en', label: 'Review (English)', type: 'textarea', required: true },
  { key: 'text_ta', label: 'Review (Tamil, optional)', type: 'textarea' },
  { key: 'source', label: 'Where it came from', type: 'select', options: ['Google', 'Instagram', 'WhatsApp', 'Facebook', 'In shop'] },
  { key: 'link', label: 'Link to the review (optional)', type: 'url' },
  { key: 'sample', label: 'Sample (placeholder) review', type: 'checkbox' },
  { key: 'hidden', label: 'Hide from website', type: 'checkbox' },
];

const serviceFields: Field[] = [
  { key: 'name_en', label: 'Name (English)', type: 'text', required: true },
  { key: 'name_ta', label: 'Name (Tamil)', type: 'text' },
  { key: 'category', label: 'Category', type: 'select', options: SERVICE_CATEGORIES },
  { key: 'starting_price', label: 'Starting price (₹)', type: 'number', hint: 'Empty = “Ask for a quote”' },
  { key: 'price_unit', label: 'Per', type: 'select', options: ['piece', 'metre', 'set', 'design'] },
  { key: 'description_en', label: 'Description (English)', type: 'textarea' },
  { key: 'description_ta', label: 'Description (Tamil)', type: 'textarea' },
  { key: 'image', label: 'Photo (for the Instagram / Facebook Shop)', type: 'image' },
  { key: 'hidden', label: 'Hide from website', type: 'checkbox' },
];

const settingsFields: Field[] = [
  { key: 'logo', label: 'Logo', type: 'image', hint: 'PNG with transparent background or SVG. Empty = text logo.', full: true },
  { key: 'whatsapp', label: 'WhatsApp number (with 91)', type: 'text', required: true },
  { key: 'phone_display', label: 'Phone (as shown)', type: 'text', required: true },
  { key: 'instagram', label: 'Instagram username', type: 'text', hint: 'Without @' },
  { key: 'facebook_url', label: 'Facebook page link', type: 'url' },
  { key: 'youtube_url', label: 'YouTube channel link', type: 'url' },
  { key: 'google_reviews_url', label: 'Google reviews link', type: 'url', hint: 'Google Maps → your shop → Reviews → Share → Copy link' },
  { key: 'google_write_review_url', label: 'Google “Write a review” link', type: 'url', hint: 'Google Business Profile → Ask for reviews → Copy link' },
  { key: 'google_maps_url', label: 'Google Maps link to the shop', type: 'url', hint: 'Used for “Get directions”' },
  { key: 'address.line1', label: 'Address line 1', type: 'text' },
  { key: 'address.line2', label: 'Address line 2 / area', type: 'text' },
  { key: 'address.city', label: 'City', type: 'text' },
  { key: 'address.state', label: 'State', type: 'text' },
  { key: 'address.pin', label: 'PIN code', type: 'text' },
  { key: 'show_map', label: 'Show address and map on the website', type: 'checkbox' },
  { key: 'map_query', label: 'Map search text', type: 'text', hint: 'e.g. Paavai Embroidery, Salem' },
  { key: 'hours_en', label: 'Opening hours (English)', type: 'text' },
  { key: 'hours_ta', label: 'Opening hours (Tamil)', type: 'text' },
  { key: 'opening_hours', label: 'Opening hours for Google', type: 'text', hint: 'Format: Mo-Sa 09:30-20:30' },
];

const categoryFields = (cat: Category | null): Field[] => [
  { key: 'name_en', label: 'Name (English)', type: 'text', required: true },
  { key: 'name_ta', label: 'Name (Tamil)', type: 'text' },
  {
    key: 'parent_id',
    label: 'Inside',
    type: 'select',
    options: [{ value: '', label: '— Top-level category —' }, ...topCats().filter((c) => c.id !== cat?.id).map((c) => ({ value: c.id, label: c.name_en }))],
    hint: 'Choose a category to make this a subcategory of it.',
  },
  { key: 'cover_image', label: 'Cover photo (optional)', type: 'image', hint: 'Empty = the newest design photo is used.' },
  { key: 'hidden', label: 'Hide from website (its designs are hidden too)', type: 'checkbox' },
];

const PRICE_TYPES = [
  { value: 'ask', label: 'Price on request' },
  { value: 'fixed', label: 'Fixed price' },
  { value: 'from', label: 'From (starting price)' },
  { value: 'range', label: 'Price range' },
];

const designFields = (): Field[] => [
  { key: 'images', label: 'Photos (first one is the main photo)', type: 'images', full: true },
  { key: 'category_id', label: 'Category', type: 'select', options: catOptions(), required: true },
  { key: 'title', label: 'Title (optional)', type: 'text', hint: 'e.g. Peacock aari back neck. Empty = category name.' },
  { key: 'price_type', label: 'Price', type: 'select', options: PRICE_TYPES },
  { key: 'price', label: 'Price (₹)', type: 'number', hint: 'For a range: the lowest price' },
  { key: 'price_max', label: 'Up to (₹), for a range', type: 'number' },
  { key: 'tags', label: 'Work type', type: 'tags', full: true },
  { key: 'description', label: 'Description (optional)', type: 'textarea' },
  { key: 'delivery', label: 'Delivery time (optional)', type: 'text', hint: 'e.g. 7–10 days' },
  { key: 'video', label: 'Video (optional, MP4 under 50 MB)', type: 'video' },
  { key: 'featured', label: 'Featured on the home page', type: 'checkbox' },
  { key: 'available', label: 'Available to order', type: 'checkbox' },
  { key: 'hidden', label: 'Hide from website', type: 'checkbox' },
];

const getPath = (obj: Data, path: string) => path.split('.').reduce<unknown>((o, k) => (o as Data | undefined)?.[k], obj);
function setPath(obj: Data, path: string, value: unknown) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Data;
  o[keys.at(-1)!] = value;
}

/**
 * Renders inputs for `fields` into `container`; returns a function that reads
 * them back. Single images and videos are uploaded when read; an `images`
 * field returns its photos in order as URLs (kept) and Files (new), so the
 * caller can watermark new ones with the design code.
 */
function buildFields(container: HTMLElement, fields: Field[], values: Data, folder: string) {
  container.replaceChildren();
  const readers: (() => Promise<void> | void)[] = [];
  const out: Data = {};

  for (const f of fields) {
    const value = getPath(values, f.key);
    const hint = f.hint ? el('span', { class: 'hint' }, f.hint) : null;
    const cls = f.full ? 'full' : '';

    if (f.type === 'checkbox') {
      const input = el('input', { type: 'checkbox', checked: Boolean(value) });
      container.append(el('label', { class: `check ${cls}` }, input, f.label));
      readers.push(() => setPath(out, f.key, input.checked));
      continue;
    }

    if (f.type === 'tags') {
      const chosen = new Set((value as string[] | undefined) ?? []);
      const boxes = Object.entries(WORK_TYPES).map(([tag, l]) => {
        const input = el('input', { type: 'checkbox', checked: chosen.has(tag), value: tag });
        return { input, label: el('label', {}, input, l.en) };
      });
      container.append(el('div', { class: cls }, el('strong', {}, f.label), el('div', { class: 'adm__checks' }, ...boxes.map((b) => b.label))));
      readers.push(() => setPath(out, f.key, boxes.filter((b) => b.input.checked).map((b) => b.input.value)));
      continue;
    }

    if (f.type === 'images') {
      const photos: (string | File)[] = [...((value as string[] | undefined) ?? [])];
      const list = el('div', { class: 'adm__photos' });
      const add = el('input', { type: 'file', accept: 'image/*', multiple: true });
      const draw = () =>
        list.replaceChildren(
          ...photos.map((p, i) => {
            const img = el('img', { alt: '', src: typeof p === 'string' ? p : URL.createObjectURL(p) });
            const btn = (label: string, title: string, fn: () => void, disabled = false) => {
              const b = el('button', { type: 'button', title, disabled }, label);
              b.addEventListener('click', () => {
                fn();
                draw();
              });
              return b;
            };
            return el(
              'div',
              { class: 'adm__photo' },
              img,
              i === 0 ? el('span', {}, 'Main') : null,
              el(
                'div',
                {},
                btn('←', 'Move earlier', () => photos.splice(i - 1, 0, photos.splice(i, 1)[0]), i === 0),
                btn('✕', 'Remove', () => photos.splice(i, 1)),
                btn('→', 'Move later', () => photos.splice(i + 1, 0, photos.splice(i, 1)[0]), i === photos.length - 1),
              ),
            );
          }),
        );
      add.addEventListener('change', () => {
        photos.push(...(add.files ?? []));
        add.value = '';
        draw();
      });
      draw();
      container.append(el('div', { class: cls }, el('strong', {}, f.label), list, el('label', { class: 'hint' }, 'Add photos: ', add)));
      readers.push(() => setPath(out, f.key, [...photos]));
      continue;
    }

    if (f.type === 'image' || f.type === 'video') {
      let current = str(value);
      const isVideo = f.type === 'video';
      const preview = isVideo ? el('video', { muted: true, hidden: !current }) : el('img', { alt: '', hidden: !current });
      if (current) preview.src = current;
      const file = el('input', { type: 'file', accept: isVideo ? 'video/mp4,video/quicktime,video/webm' : 'image/*' });
      const clear = el('button', { type: 'button', class: 'link', hidden: !current }, 'Remove');
      clear.addEventListener('click', () => {
        current = '';
        preview.hidden = true;
        clear.hidden = true;
        file.value = '';
      });
      file.addEventListener('change', () => {
        const chosen = file.files?.[0];
        if (!chosen) return;
        preview.src = URL.createObjectURL(chosen);
        preview.hidden = false;
        clear.hidden = false;
      });
      container.append(el('label', { class: cls }, f.label, el('div', { class: 'adm__img-field' }, preview, file, clear), hint));
      readers.push(async () => {
        const chosen = file.files?.[0];
        if (chosen) current = await upload(chosen, folder, f.key === 'logo');
        if (f.required && !current) throw new Error(`${f.label} is required`);
        setPath(out, f.key, current);
      });
      continue;
    }

    let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (f.type === 'textarea') input = el('textarea', { value: str(value) });
    else if (f.type === 'select') {
      const opts = f.options!.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
      input = el('select', {}, ...opts.map((o) => el('option', { value: o.value }, o.label)));
      input.value = value == null || value === '' ? opts[0]?.value ?? '' : str(value);
    } else input = el('input', { type: f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text', value: str(value), min: '0' });
    input.required = Boolean(f.required);
    input.name = f.key;
    container.append(el('label', { class: cls }, f.label, input, hint));
    readers.push(() => {
      const v = input.value.trim();
      if (f.type === 'number') setPath(out, f.key, v === '' ? null : Number(v));
      else setPath(out, f.key, v);
    });
  }

  return async () => {
    for (const r of readers) await r();
    return out;
  };
}

/** Opens the editor dialog with `fields`; `onSave` gets the values read back. */
function edit(title: string, fields: Field[], values: Data, folder: string, onSave: (out: Data) => Promise<void>) {
  const dialog = $<HTMLDialogElement>('#editor');
  const form = $<HTMLFormElement>('#editor-form');
  const save = $<HTMLButtonElement>('#editor-save');
  $('#editor-title').textContent = title;
  const read = buildFields($('#editor-fields'), fields, values, folder);

  // Price inputs only make sense for some price types.
  const type = form.querySelector<HTMLSelectElement>('select[name=price_type]');
  const syncPrice = () => {
    const p = form.querySelector<HTMLElement>('input[name=price]')?.closest('label');
    const m = form.querySelector<HTMLElement>('input[name=price_max]')?.closest('label');
    if (p) p.hidden = type!.value === 'ask';
    if (m) m.hidden = type!.value !== 'range';
  };
  if (type) {
    type.addEventListener('change', syncPrice);
    syncPrice();
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    save.disabled = true;
    save.textContent = 'Saving…';
    try {
      await onSave(await read());
      dialog.close();
      renderAll();
      toast('Saved');
    } catch (err) {
      renderAll();
      toast(errMsg(err, 'Could not save'), 'error');
    } finally {
      save.disabled = false;
      save.textContent = 'Save';
    }
  };
  $('#editor-cancel').onclick = () => dialog.close();
  dialog.showModal();
}

function editItem(item: Item) {
  const fields = item.kind === 'review' ? reviewFields : serviceFields;
  edit(item.kind === 'review' ? 'Edit review' : 'Edit service', fields, { ...item.data, hidden: item.hidden }, item.kind, async (out) => {
    const { hidden, ...data } = out;
    const oldImage = item.data.image;
    await updateItem(item, { data: { ...item.data, ...data }, hidden: Boolean(hidden) });
    if (oldImage && oldImage !== item.data.image) await removeMedia([oldImage]);
  });
}

function addItem(kind: Kind) {
  const defaults: Data = kind === 'review' ? { rating: '5', source: 'Google' } : { price_unit: 'piece' };
  edit(kind === 'review' ? 'Add review' : 'Add service', kind === 'review' ? reviewFields : serviceFields, defaults, kind, async (out) => {
    const { hidden, ...data } = out;
    await createItem(kind, { ...defaults, ...data }, Boolean(hidden));
  });
}

/** Uploads new photos (watermarked with the design's code) and returns the final URL list. */
async function finishPhotos(code: string, photos: (string | File)[]) {
  const urls: string[] = [];
  for (const p of photos) urls.push(typeof p === 'string' ? p : await uploadDesignPhoto(p, code));
  return urls;
}

function designPatch(out: Data): Partial<Design> {
  const price_type = (str(out.price_type) || 'ask') as PriceType;
  const price = price_type === 'ask' ? null : (out.price as number | null);
  const price_max = price_type === 'range' ? (out.price_max as number | null) : null;
  checkPrice(price_type, price, price_max);
  return {
    category_id: str(out.category_id),
    title: str(out.title).trim() || null,
    description: str(out.description).trim() || null,
    price_type,
    price,
    price_max,
    tags: out.tags as string[],
    delivery: str(out.delivery).trim() || null,
    video: str(out.video) || null,
    featured: Boolean(out.featured),
    available: Boolean(out.available),
    hidden: Boolean(out.hidden),
  };
}

function editDesign(d: Design | null) {
  if (!categories.length) return toast('Add a category first (Categories tab).', 'error');
  const values: Data = d ? { ...d } : { price_type: 'ask', available: true, images: [], tags: [], category_id: str($<HTMLSelectElement>('#f-cat').value) };
  edit(d ? `Edit design ${d.code}` : 'Add design', designFields(), values, 'designs', async (out) => {
    const photos = out.images as (string | File)[];
    if (!photos.length) throw new Error('Add at least one photo.');
    const patch = designPatch(out);
    const target = d ?? (await insertDesign({ ...patch, images: [] }));
    const oldMedia = d ? [...d.images, d.video] : [];
    let images: string[];
    try {
      images = await finishPhotos(target.code, photos);
    } catch (err) {
      if (!d) await deleteDesign(target).catch(() => {});
      throw err;
    }
    await updateDesign(target, { ...patch, images });
    const keep = new Set<unknown>([...images, target.video]);
    await removeMedia(oldMedia.filter((u) => u && !keep.has(u)));
  });
}

function editCategory(cat: Category | null) {
  const values: Data = cat ? { ...cat, parent_id: cat.parent_id ?? '' } : { parent_id: '' };
  edit(cat ? 'Edit category' : 'Add category', categoryFields(cat), values, 'categories', (out) => saveCategory(cat, out));
}

/** Bulk upload: each photo becomes a new design in the chosen category. */
function bulkUpload(files: File[]) {
  if (!categories.length) return toast('Add a category first (Categories tab).', 'error');
  const fields: Field[] = [
    { key: 'category_id', label: 'Category for these designs', type: 'select', options: catOptions(), required: true },
    { key: 'price_type', label: 'Price', type: 'select', options: PRICE_TYPES, hint: 'You can change each design later.' },
    { key: 'price', label: 'Price (₹)', type: 'number', hint: 'For a range: the lowest price' },
    { key: 'price_max', label: 'Up to (₹), for a range', type: 'number' },
    { key: 'tags', label: 'Work type', type: 'tags', full: true },
  ];
  const values = { category_id: $<HTMLSelectElement>('#f-cat').value, price_type: 'ask', tags: [] };
  edit(`Upload ${files.length} photo${files.length === 1 ? '' : 's'} as new designs`, fields, values, 'designs', async (out) => {
    const base = designPatch({ ...out, available: true });
    let done = 0;
    for (const file of files) {
      toast(`Uploading ${done + 1} of ${files.length}…`);
      let d: Design | null = null;
      try {
        d = await insertDesign({ ...base, images: [] });
        const url = await uploadDesignPhoto(file, d.code);
        await updateDesign(d, { images: [url] });
        done++;
      } catch (err) {
        if (d) await deleteDesign(d).catch(() => {});
        toast(`${file.name}: ${errMsg(err, 'upload failed')}`, 'error');
      }
    }
    void showUsage();
    if (done < files.length) throw new Error(`${done} of ${files.length} uploaded; the rest failed.`);
  });
}

// ---------------------------------------------------------------- rendering

function rowButtons(id: string, acts: [string, string, boolean?][]) {
  return el(
    'div',
    { class: 'adm__btns' },
    ...acts.map(([act, label, disabled]) => el('button', { type: 'button', disabled: Boolean(disabled), dataset: { act, id } }, label)),
  );
}

function renderItems(kind: Kind) {
  const list = listOf(kind);
  $(`#list-${kind}`).replaceChildren(
    ...list.map((item, i) => {
      const d = item.data;
      const title = kind === 'review' ? `${'★'.repeat(Number(d.rating) || 5)} ${str(d.name)}` : str(d.name_en);
      const sub =
        kind === 'review'
          ? str(d.text_en).slice(0, 140)
          : d.starting_price != null && d.starting_price !== ''
            ? `From ₹${d.starting_price} per ${str(d.price_unit) || 'piece'} · ${str(d.category)}`
            : `Ask for a quote · ${str(d.category)}`;
      return el(
        'li',
        { class: 'adm__row', dataset: { hidden: String(item.hidden) } },
        kind === 'service' && d.image ? el('img', { src: str(d.image), alt: '' }) : null,
        el(
          'div',
          { class: 'adm__body' },
          el('strong', {}, title),
          el('span', { class: 'muted small' }, sub),
          el(
            'div',
            { class: 'adm__badges' },
            d.sample ? el('span', { class: 'adm__badge adm__badge--warn' }, 'Sample') : null,
            item.hidden ? el('span', { class: 'adm__badge adm__badge--warn' }, 'Hidden') : null,
          ),
        ),
        rowButtons(`${kind}:${item.id}`, [
          ['up', '↑', i === 0],
          ['down', '↓', i === list.length - 1],
          ['edit', 'Edit'],
          ['toggle', item.hidden ? 'Show' : 'Hide'],
          ['delete', 'Delete'],
        ]),
      );
    }),
  );
  if (!list.length) $(`#list-${kind}`).append(el('li', { class: 'muted' }, 'Nothing here yet.'));
}

function renderCategories() {
  const rows: HTMLElement[] = [];
  const row = (c: Category, siblings: Category[], child: boolean) => {
    const i = siblings.indexOf(c);
    const n = designCount(c.id);
    const parentHidden = child && catById(c.parent_id)?.hidden;
    rows.push(
      el(
        'li',
        { class: `adm__row${child ? ' adm__row--child' : ''}`, dataset: { hidden: String(c.hidden || Boolean(parentHidden)) } },
        c.cover_image ? el('img', { src: c.cover_image, alt: '' }) : null,
        el(
          'div',
          { class: 'adm__body' },
          el('strong', {}, child ? `↳ ${c.name_en}` : c.name_en),
          el('span', { class: 'muted small' }, [c.name_ta, `${n} design${n === 1 ? '' : 's'}`, `/designs/${c.slug}`].filter(Boolean).join(' · ')),
          c.hidden ? el('div', { class: 'adm__badges' }, el('span', { class: 'adm__badge adm__badge--warn' }, 'Hidden')) : null,
        ),
        rowButtons(`category:${c.id}`, [
          ['up', '↑', i === 0],
          ['down', '↓', i === siblings.length - 1],
          ['edit', 'Edit'],
          ['toggle', c.hidden ? 'Show' : 'Hide'],
          ['delete', 'Delete'],
        ]),
      ),
    );
  };
  const tops = topCats();
  for (const c of tops) {
    row(c, tops, false);
    const kids = childCats(c.id);
    for (const k of kids) row(k, kids, true);
  }
  $('#list-category').replaceChildren(...rows);
  if (!rows.length) $('#list-category').append(el('li', { class: 'muted' }, 'No categories yet. Add one to start.'));

  // Category filter on the Designs tab.
  const f = $<HTMLSelectElement>('#f-cat');
  const keep = f.value;
  f.replaceChildren(
    el('option', { value: '' }, 'All categories'),
    ...catOptions().map((o) => el('option', { value: o.value }, `${o.label} (${designCount(o.value)})`)),
  );
  f.value = catById(keep) ? keep : '';
}

function priceEditor(d: Design) {
  const type = el('select', { ariaLabel: 'Price type' }, ...PRICE_TYPES.map((o) => el('option', { value: o.value }, o.label)));
  type.value = d.price_type;
  const price = el('input', { type: 'number', min: '0', placeholder: '₹', value: str(d.price), ariaLabel: 'Price' });
  const max = el('input', { type: 'number', min: '0', placeholder: 'up to ₹', value: str(d.price_max), ariaLabel: 'Up to' });
  const sync = () => {
    price.hidden = type.value === 'ask';
    max.hidden = type.value !== 'range';
  };
  sync();
  const save = async () => {
    sync();
    const t = type.value as PriceType;
    const p = price.value === '' ? null : Number(price.value);
    const m = max.value === '' ? null : Number(max.value);
    try {
      if (t !== 'ask' && p == null) return; // wait for the price to be typed
      if (t === 'range' && m == null) return;
      checkPrice(t, p, m);
      await updateDesign(d, { price_type: t, price: t === 'ask' ? null : p, price_max: t === 'range' ? m : null });
      toast(`${d.code}: price saved`);
    } catch (err) {
      toast(errMsg(err, 'Could not save'), 'error');
    }
  };
  type.addEventListener('change', save);
  price.addEventListener('change', save);
  max.addEventListener('change', save);
  return el('div', { class: 'adm__price' }, type, price, max);
}

function filteredDesigns() {
  const q = $<HTMLInputElement>('#f-q').value.trim().toLowerCase();
  const cat = $<HTMLSelectElement>('#f-cat').value;
  const state = $<HTMLSelectElement>('#f-state').value;
  return designs.filter((d) => {
    if (cat && d.category_id !== cat && catById(d.category_id)?.parent_id !== cat) return false;
    if (state === 'noprice' && !(d.price_type === 'ask' || d.price == null)) return false;
    if (state === 'featured' && !d.featured) return false;
    if (state === 'hidden' && !d.hidden) return false;
    if (state === 'unavailable' && d.available) return false;
    return !q || `${d.code} ${d.title ?? ''}`.toLowerCase().includes(q);
  });
}

function renderDesigns() {
  const list = filteredDesigns();
  $('#design-count').textContent = `${list.length} of ${designs.length} designs`;
  $('#list-design').replaceChildren(
    ...list.slice(0, designLimit).map((d) => {
      const cat = catById(d.category_id);
      return el(
        'li',
        { class: 'adm__row', dataset: { hidden: String(d.hidden) } },
        d.images[0] ? el('img', { src: d.images[0], alt: '', loading: 'lazy' }) : null,
        el(
          'div',
          { class: 'adm__body' },
          el('strong', {}, `${d.code}${d.title ? ` · ${d.title}` : ''}`),
          el('span', { class: 'muted small' }, `${cat ? catLabel(cat) : '?'} · ${d.images.length} photo${d.images.length === 1 ? '' : 's'}`),
          priceEditor(d),
          el(
            'div',
            { class: 'adm__badges' },
            d.featured ? el('span', { class: 'adm__badge' }, 'Featured') : null,
            !d.available ? el('span', { class: 'adm__badge adm__badge--warn' }, 'Not available') : null,
            d.hidden ? el('span', { class: 'adm__badge adm__badge--warn' }, 'Hidden') : null,
            !d.images.length ? el('span', { class: 'adm__badge adm__badge--warn' }, 'No photo – not shown') : null,
          ),
        ),
        rowButtons(`design:${d.id}`, [
          ['edit', 'Edit'],
          ['toggle', d.hidden ? 'Show' : 'Hide'],
          ['delete', 'Delete'],
        ]),
      );
    }),
  );
  if (!list.length) $('#list-design').append(el('li', { class: 'muted' }, designs.length ? 'No designs match.' : 'No designs yet. Upload photos to start.'));
  $('#design-more').hidden = list.length <= designLimit;
}

let readSettings: () => Promise<Data>;
function renderSettings() {
  const form = $<HTMLFormElement>('#settings-form');
  const fieldsBox = el('div', { class: 'adm__form adm__form--wide full' });
  readSettings = buildFields(fieldsBox, settingsFields, settings, 'settings');
  const button = el('button', { type: 'submit', class: 'btn btn--primary' }, 'Save shop details');
  form.replaceChildren(fieldsBox, el('div', { class: 'full' }, button));
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    button.disabled = true;
    try {
      const out = await readSettings();
      const data: Data = { ...settings, ...out, address: { ...(settings.address as Data), ...(out.address as Data) } };
      data.whatsapp = str(data.whatsapp).replace(/\D/g, '');
      data.instagram = str(data.instagram).trim().replace(/^@/, '');
      const { error } = await supabase
        .from('website_settings')
        .upsert({ organization_id: SHOP_ORG_ID, data, updated_at: now(), updated_by: session?.user.id });
      if (error) throw error;
      if (settings.logo && settings.logo !== data.logo) await removeMedia([settings.logo]);
      settings = data;
      markChanged();
      renderSettings();
      toast('Shop details saved');
    } catch (err) {
      toast(errMsg(err, 'Could not save'), 'error');
    } finally {
      button.disabled = false;
    }
  };
}

function renderAll() {
  renderCategories();
  renderDesigns();
  renderItems('review');
  renderItems('service');
  renderSettings();
  renderPublishStatus();
}

// ---------------------------------------------------------------- events

document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab.dataset.tab));
  }),
);

document.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((b) =>
  b.addEventListener('click', () => {
    const what = b.dataset.add!;
    if (what === 'design') editDesign(null);
    else if (what === 'category') editCategory(null);
    else addItem(what as Kind);
  }),
);

root.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
  if (!btn) return;
  const [type, id] = btn.dataset.id!.split(':');
  const act = btn.dataset.act!;
  try {
    if (type === 'design') {
      const d = designs.find((x) => x.id === id)!;
      if (act === 'edit') return editDesign(d);
      if (act === 'toggle') await updateDesign(d, { hidden: !d.hidden });
      if (act === 'delete') {
        if (!confirm(`Delete design ${d.code} and its photos? This can't be undone.`)) return;
        await deleteDesign(d);
        toast(`${d.code} deleted`);
        void showUsage();
      }
    } else if (type === 'category') {
      const c = catById(id)!;
      if (act === 'edit') return editCategory(c);
      if (act === 'toggle') {
        const { error } = await supabase.from('website_categories').update({ hidden: !c.hidden, updated_at: now() }).eq('id', c.id);
        if (error) throw error;
        c.hidden = !c.hidden;
        markChanged();
      }
      if (act === 'up' || act === 'down') {
        const siblings = categories.filter((x) => x.parent_id === c.parent_id).sort((a, b) => a.position - b.position);
        await swap('website_categories', siblings, c, act === 'up' ? -1 : 1);
      }
      if (act === 'delete') {
        if (!confirm(`Delete category “${c.name_en}”?`)) return;
        await deleteCategory(c);
        toast('Category deleted');
      }
    } else {
      const item = items.find((i) => i.id === id)!;
      if (act === 'edit') return editItem(item);
      if (act === 'toggle') await updateItem(item, { hidden: !item.hidden });
      if (act === 'up' || act === 'down') await swap('website_items', listOf(item.kind), item, act === 'up' ? -1 : 1);
      if (act === 'delete') {
        if (!confirm('Delete this item?')) return;
        await deleteItem(item);
        toast('Deleted');
      }
    }
    renderAll();
  } catch (err) {
    toast(errMsg(err, 'Something went wrong'), 'error');
  }
});

$<HTMLInputElement>('#bulk-files').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (files.length) bulkUpload(files);
});

['#f-q', '#f-cat', '#f-state'].forEach((sel) =>
  $(sel).addEventListener(sel === '#f-q' ? 'input' : 'change', () => {
    designLimit = PAGE;
    renderDesigns();
  }),
);
$('#design-more').addEventListener('click', () => {
  designLimit += PAGE;
  renderDesigns();
});

$('#publish').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('#publish');
  btn.disabled = true;
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch('/.netlify/functions/publish', {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Could not publish (${res.status})`);
    publishedAt = now();
    renderPublishStatus();
    toast('Publishing… the website updates in about 1 minute.');
  } catch (err) {
    toast(errMsg(err, 'Could not publish'), 'error');
  } finally {
    btn.disabled = false;
  }
});

$('#sign-out').addEventListener('click', () => supabase.auth.signOut());

$<HTMLFormElement>('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const err = form.querySelector<HTMLElement>('.adm__error')!;
  const button = form.querySelector<HTMLButtonElement>('button')!;
  const f = new FormData(form);
  button.disabled = true;
  err.textContent = '';
  const { error } = await supabase.auth.signInWithPassword({ email: String(f.get('email')).trim(), password: String(f.get('password')) });
  button.disabled = false;
  if (error) err.textContent = error.message === 'Invalid login credentials' ? 'Wrong e-mail or password.' : error.message;
});

// ---------------------------------------------------------------- session

async function enter(s: Session | null) {
  session = s;
  if (!s) {
    root.dataset.state = 'login';
    return;
  }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('display_name, role, organization_id, is_active')
    .eq('id', s.user.id)
    .maybeSingle();
  const allowed = profile?.is_active && profile.organization_id === SHOP_ORG_ID && ['Administrator', 'Manager'].includes(profile.role);
  if (!allowed) {
    await supabase.auth.signOut();
    root.dataset.state = 'login';
    $('#login-form .adm__error').textContent = 'This account cannot edit the website. Ask an Administrator of the shop.';
    return;
  }
  $('#who').textContent = `${profile.display_name || s.user.email} (${profile.role})`;
  try {
    await loadAll();
    root.dataset.state = 'app';
  } catch (err) {
    root.dataset.state = 'login';
    $('#login-form .adm__error').textContent = errMsg(err, 'Could not load');
  }
}

supabase.auth.onAuthStateChange((event, s) => {
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
    // Supabase calls this inside its auth lock; continue outside it.
    setTimeout(() => {
      if (event === 'SIGNED_IN' && session?.user.id === s?.user.id) return;
      void enter(s);
    }, 0);
  }
});
