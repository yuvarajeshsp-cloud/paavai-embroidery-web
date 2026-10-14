// Website admin (/admin). Signs in with Supabase (the Shop Manager accounts),
// edits website_settings / website_items and uploads media to the
// website-media bucket. Row level security enforces who may change what;
// the checks here only decide what to show.
import { createClient, type Session } from '@supabase/supabase-js';
import { MEDIA_BUCKET, SHOP_ORG_ID, SUPABASE_KEY, SUPABASE_URL } from '../config/supabase';

type Kind = 'gallery' | 'review' | 'service';
type Data = Record<string, unknown>;
type Item = { id: string; kind: Kind; position: number; hidden: boolean; data: Data; updated_at: string };

type Field = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'image' | 'url';
  options?: string[];
  hint?: string;
  required?: boolean;
  full?: boolean;
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'paavai-website-admin' },
});

const CATEGORIES = ['Bridal', 'Blouse', 'Machine', 'Kids', 'Other'];
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const root = $('#admin');

let session: Session | null = null;
let items: Item[] = [];
let settings: Data = {};
let publishedAt: string | null = null;
let lastChange = 0;

// ---------------------------------------------------------------- helpers

function toast(text: string, tone: 'ok' | 'error' = 'ok') {
  const el = $('#toast');
  el.textContent = text;
  el.dataset.tone = tone;
  el.dataset.show = 'true';
  clearTimeout(Number(el.dataset.timer));
  el.dataset.timer = String(setTimeout(() => (el.dataset.show = 'false'), tone === 'error' ? 6000 : 2500));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & Data = {}, ...children: (Node | string | null | false)[]) {
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

function youtubeId(url: string) {
  return url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/)?.[1] ?? null;
}

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

// ---------------------------------------------------------------- uploads

// Phone photos are large; shrink to at most 2000px and re-encode as JPEG so
// uploads are quick on mobile data. Logos (PNG/SVG) keep their format.
async function shrinkImage(file: File, keepFormat: boolean): Promise<Blob> {
  if (keepFormat || file.type === 'image/svg+xml' || !file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000 && file.type === 'image/jpeg') return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file; // e.g. HEIC the browser can't decode: upload as is
  }
}

async function upload(file: File, folder: string, keepFormat = false): Promise<string> {
  const isVideo = file.type.startsWith('video/');
  if (isVideo && file.size > 50 * 1024 * 1024) throw new Error('Video is larger than 50 MB. Upload it to YouTube or Instagram and add a link instead.');
  const body = isVideo ? file : await shrinkImage(file, keepFormat);
  const type = body.type || file.type;
  const ext = type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${SHOP_ORG_ID}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, body, { contentType: type, cacheControl: '31536000' });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

const bucketPrefix = `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/`;
function mediaPaths(data: Data): string[] {
  return ['image', 'video', 'poster']
    .map((k) => str(data[k]))
    .filter((u) => u.startsWith(bucketPrefix))
    .map((u) => decodeURIComponent(u.slice(bucketPrefix.length)));
}

async function removeMedia(paths: string[]) {
  if (paths.length) await supabase.storage.from(MEDIA_BUCKET).remove(paths);
}

// ---------------------------------------------------------------- data

async function loadAll() {
  const [{ data: rows, error }, { data: s }] = await Promise.all([
    supabase.from('website_items').select('id, kind, position, hidden, data, updated_at').order('position').order('created_at'),
    supabase.from('website_settings').select('data, published_at, updated_at').maybeSingle(),
  ]);
  if (error) throw error;
  items = (rows ?? []) as Item[];
  settings = (s?.data as Data) ?? {};
  publishedAt = s?.published_at ?? null;
  lastChange = Math.max(0, ...items.map((i) => new Date(i.updated_at).getTime()), s?.updated_at ? new Date(s.updated_at).getTime() : 0);
  renderAll();
}

function listOf(kind: Kind) {
  return items.filter((i) => i.kind === kind).sort((a, b) => a.position - b.position);
}

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
  const { error } = await supabase
    .from('website_items')
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: session?.user.id })
    .eq('id', item.id);
  if (error) throw error;
  Object.assign(item, patch);
  markChanged();
}

async function deleteItem(item: Item) {
  const { error } = await supabase.from('website_items').delete().eq('id', item.id);
  if (error) throw error;
  items = items.filter((i) => i.id !== item.id);
  await removeMedia(mediaPaths(item.data)).catch(() => {});
  markChanged();
}

async function move(item: Item, dir: -1 | 1) {
  const list = listOf(item.kind);
  // Renumber first so positions are unique, then swap with the neighbour.
  list.forEach((it, i) => (it.position = i));
  const idx = list.indexOf(item);
  const other = list[idx + dir];
  if (!other) return;
  [item.position, other.position] = [other.position, item.position];
  const now = new Date().toISOString();
  const { error } = await supabase.from('website_items').upsert(
    list.map((it) => ({ id: it.id, organization_id: SHOP_ORG_ID, kind: it.kind, position: it.position, hidden: it.hidden, data: it.data, updated_at: now })),
  );
  if (error) throw error;
  markChanged();
}

// ---------------------------------------------------------------- forms

const galleryFields = (type: string): Field[] => [
  ...(type === 'youtube' ? [{ key: 'url', label: 'YouTube link', type: 'url', required: true } as Field] : []),
  ...(type === 'instagram'
    ? ([
        { key: 'url', label: 'Instagram post / reel link', type: 'url', required: true, hint: 'In Instagram: ⋯ → Copy link' },
        { key: 'image', label: 'Cover photo', type: 'image', hint: 'Instagram does not let other sites show its photos, so add the photo here.' },
      ] as Field[])
    : []),
  ...(type === 'photo' ? [{ key: 'image', label: 'Photo', type: 'image', required: true } as Field] : []),
  ...(type === 'video' ? [{ key: 'poster', label: 'Cover photo (shown before the video plays)', type: 'image' } as Field] : []),
  { key: 'category', label: 'Category', type: 'select', options: CATEGORIES },
  { key: 'caption_en', label: 'Caption (English)', type: 'text', hint: 'e.g. Bridal aari blouse with zardosi' },
  { key: 'caption_ta', label: 'Caption (Tamil)', type: 'text' },
  { key: 'featured', label: 'Show on home page (Recent work)', type: 'checkbox' },
  { key: 'hidden', label: 'Hide from website', type: 'checkbox' },
];

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
  { key: 'category', label: 'Category', type: 'select', options: CATEGORIES },
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

const getPath = (obj: Data, path: string) => path.split('.').reduce<unknown>((o, k) => (o as Data | undefined)?.[k], obj);
function setPath(obj: Data, path: string, value: unknown) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Data;
  o[keys.at(-1)!] = value;
}

/** Renders inputs for `fields` into `container`; returns a function that reads them back. */
function buildFields(container: HTMLElement, fields: Field[], values: Data, folder: string) {
  container.replaceChildren();
  const readers: (() => Promise<void> | void)[] = [];
  const out: Data = {};

  for (const f of fields) {
    const value = getPath(values, f.key);
    const hint = f.hint ? el('span', { class: 'hint' }, f.hint) : null;

    if (f.type === 'checkbox') {
      const input = el('input', { type: 'checkbox', checked: Boolean(value) });
      container.append(el('label', { class: `check${f.full ? ' full' : ''}` }, input, f.label));
      readers.push(() => setPath(out, f.key, input.checked));
      continue;
    }

    if (f.type === 'image') {
      let current = str(value);
      const preview = el('img', { alt: '', hidden: !current });
      if (current) preview.src = current;
      const file = el('input', { type: 'file', accept: 'image/*' });
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
      container.append(
        el('label', { class: f.full ? 'full' : '' }, f.label, el('div', { class: 'adm__img-field' }, preview, file, clear), hint),
      );
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
      input = el('select', {}, ...f.options!.map((o) => el('option', { value: o, selected: str(value) === o }, o)));
      if (!value) input.value = f.options![0];
    } else input = el('input', { type: f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text', value: str(value), min: '0' });
    input.required = Boolean(f.required);
    container.append(el('label', { class: f.full ? 'full' : '' }, f.label, input, hint));
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

/** Opens the editor dialog; resolves with the values, or null when cancelled. */
function edit(title: string, fields: Field[], values: Data, folder: string, onSave: (out: Data) => Promise<void>) {
  const dialog = $<HTMLDialogElement>('#editor');
  const form = $<HTMLFormElement>('#editor-form');
  const save = $<HTMLButtonElement>('#editor-save');
  $('#editor-title').textContent = title;
  const read = buildFields($('#editor-fields'), fields, values, folder);

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
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      save.disabled = false;
      save.textContent = 'Save';
    }
  };
  $('#editor-cancel').onclick = () => dialog.close();
  dialog.showModal();
}

function editItem(item: Item) {
  const fields =
    item.kind === 'gallery' ? galleryFields(str(item.data.type)) : item.kind === 'review' ? reviewFields : serviceFields;
  const title = item.kind === 'gallery' ? 'Edit gallery item' : item.kind === 'review' ? 'Edit review' : 'Edit service';
  edit(title, fields, { ...item.data, hidden: item.hidden }, item.kind, async (out) => {
    const { hidden, ...data } = out;
    const before = mediaPaths(item.data);
    await updateItem(item, { data: { ...item.data, ...data }, hidden: Boolean(hidden) });
    const after = new Set(mediaPaths(item.data));
    await removeMedia(before.filter((p) => !after.has(p))).catch(() => {});
  });
}

function addItem(kind: Kind, type?: string) {
  const fields = kind === 'gallery' ? galleryFields(type!) : kind === 'review' ? reviewFields : serviceFields;
  const title =
    kind === 'review' ? 'Add review' : kind === 'service' ? 'Add service' : type === 'youtube' ? 'Add YouTube video' : 'Add Instagram post';
  const defaults: Data = kind === 'gallery' ? { type, category: 'Bridal' } : kind === 'review' ? { rating: '5', source: 'Google' } : { price_unit: 'piece' };
  edit(title, fields, defaults, kind, async (out) => {
    const { hidden, ...data } = out;
    if (kind === 'gallery' && type === 'youtube' && !youtubeId(str(data.url))) throw new Error('That does not look like a YouTube link');
    await createItem(kind, { ...defaults, ...data }, Boolean(hidden));
  });
}

// ---------------------------------------------------------------- rendering

function thumbFor(d: Data): HTMLElement {
  const box = el('div', { class: 'adm__thumb' });
  const img = str(d.image || d.poster);
  if (d.type === 'video' && !img) {
    box.append(el('video', { src: str(d.video), muted: true, preload: 'metadata', playsInline: true }));
  } else if (d.type === 'youtube' && !img) {
    const id = youtubeId(str(d.url));
    box.append(id ? el('img', { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, alt: '', loading: 'lazy' }) : el('span', {}, 'YouTube'));
  } else if (img) {
    box.append(el('img', { src: img, alt: '', loading: 'lazy' }));
  } else {
    box.append(el('span', {}, d.type === 'instagram' ? 'Instagram post' : 'No photo'));
  }
  return box;
}

function actions(item: Item, list: Item[]) {
  const idx = list.indexOf(item);
  const btn = (act: string, label: string, title: string, disabled = false) =>
    el('button', { type: 'button', title, disabled, dataset: { act, id: item.id } }, label);
  return el(
    'div',
    { class: 'adm__btns' },
    btn('up', '↑', 'Move earlier', idx === 0),
    btn('down', '↓', 'Move later', idx === list.length - 1),
    btn('edit', 'Edit', 'Edit'),
    btn('toggle', item.hidden ? 'Show' : 'Hide', item.hidden ? 'Show on website' : 'Hide from website'),
    btn('delete', 'Delete', 'Delete'),
  );
}

const typeLabel: Record<string, string> = { photo: 'Photo', video: 'Video', youtube: 'YouTube', instagram: 'Instagram' };

function renderGallery() {
  const list = listOf('gallery');
  $('#list-gallery').replaceChildren(
    ...list.map((item) => {
      const d = item.data;
      return el(
        'li',
        { class: 'adm__item', dataset: { hidden: String(item.hidden) } },
        thumbFor(d),
        el(
          'div',
          { class: 'adm__body' },
          el('strong', {}, str(d.caption_en) || '(no caption)'),
          el(
            'div',
            { class: 'adm__badges' },
            el('span', { class: 'adm__badge' }, typeLabel[str(d.type)] ?? str(d.type)),
            el('span', { class: 'adm__badge' }, str(d.category)),
            d.featured ? el('span', { class: 'adm__badge' }, 'Home page') : null,
            item.hidden ? el('span', { class: 'adm__badge adm__badge--warn' }, 'Hidden') : null,
          ),
        ),
        actions(item, list),
      );
    }),
  );
  if (!list.length) $('#list-gallery').append(el('li', { class: 'muted' }, 'No photos yet.'));
}

function renderRows(kind: 'review' | 'service') {
  const list = listOf(kind);
  $(`#list-${kind}`).replaceChildren(
    ...list.map((item) => {
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
        actions(item, list),
      );
    }),
  );
  if (!list.length) $(`#list-${kind}`).append(el('li', { class: 'muted' }, 'Nothing here yet.'));
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
        .upsert({ organization_id: SHOP_ORG_ID, data, updated_at: new Date().toISOString(), updated_by: session?.user.id });
      if (error) throw error;
      const removed = str(settings.logo);
      if (removed && removed !== data.logo) await removeMedia(mediaPaths({ image: removed })).catch(() => {});
      settings = data;
      markChanged();
      renderSettings();
      toast('Shop details saved');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      button.disabled = false;
    }
  };
}

function renderAll() {
  renderGallery();
  renderRows('review');
  renderRows('service');
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
    if (what === 'review' || what === 'service') addItem(what);
    else addItem('gallery', what);
  }),
);

root.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
  if (!btn) return;
  const item = items.find((i) => i.id === btn.dataset.id);
  if (!item) return;
  try {
    switch (btn.dataset.act) {
      case 'edit':
        return editItem(item);
      case 'up':
      case 'down':
        await move(item, btn.dataset.act === 'up' ? -1 : 1);
        break;
      case 'toggle':
        await updateItem(item, { hidden: !item.hidden });
        break;
      case 'delete':
        if (!confirm('Delete this item? Uploaded photos/videos for it are deleted too.')) return;
        await deleteItem(item);
        toast('Deleted');
        break;
    }
    renderAll();
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
  }
});

async function addUploads(input: HTMLInputElement, type: 'photo' | 'video') {
  const files = [...(input.files ?? [])];
  input.value = '';
  if (!files.length) return;
  let done = 0;
  for (const file of files) {
    toast(`Uploading ${done + 1} of ${files.length}…`);
    try {
      const url = await upload(file, 'gallery');
      await createItem('gallery', type === 'photo' ? { type, image: url, category: 'Bridal' } : { type, video: url, category: 'Bridal' });
      done++;
    } catch (err) {
      toast(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`, 'error');
    }
  }
  renderAll();
  if (done) toast(`${done} added. Use Edit to set the category and caption.`);
}
$<HTMLInputElement>('#add-photos').addEventListener('change', (e) => addUploads(e.target as HTMLInputElement, 'photo'));
$<HTMLInputElement>('#add-video').addEventListener('change', (e) => addUploads(e.target as HTMLInputElement, 'video'));

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
    publishedAt = new Date().toISOString();
    renderPublishStatus();
    toast('Publishing… the website updates in about 1 minute.');
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Could not publish', 'error');
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
  const allowed =
    profile?.is_active && profile.organization_id === SHOP_ORG_ID && ['Administrator', 'Manager'].includes(profile.role);
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
    $('#login-form .adm__error').textContent = err instanceof Error ? err.message : 'Could not load';
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
