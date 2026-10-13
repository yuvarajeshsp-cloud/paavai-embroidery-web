import fallback from '../data/services.fallback.json';

export type Service = {
  category: string;
  name_en: string;
  name_ta: string | null;
  description_en: string | null;
  description_ta: string | null;
  starting_price: number | null;
  price_unit: string | null;
  image_url?: string | null;
  sort_order: number;
};

let cache: Promise<Service[]> | undefined;

// The price list comes live from Shop Manager (website_services, published
// rows only) when the site is built. Until Supabase is configured, the sample
// list is used so the site can be previewed. Once it is configured, a failed
// fetch fails the build on purpose: Netlify then keeps the previous deploy
// live instead of publishing sample prices.
export function getServices(): Promise<Service[]> {
  cache ??= load();
  return cache;
}

async function load(): Promise<Service[]> {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.SUPABASE_ANON_KEY;
  const slug = import.meta.env.SHOP_ORG_SLUG;
  if (!url || !key || !slug) {
    console.warn('[services] Supabase not configured; using sample price list.');
    return fallback as Service[];
  }
  const res = await fetch(`${url}/rest/v1/rpc/public_website_services`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ org_slug: slug }),
  });
  if (!res.ok) throw new Error(`[services] Could not load price list from Shop Manager: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as Service[];
  return rows.map((r) => ({ ...r, starting_price: r.starting_price == null ? null : Number(r.starting_price) }));
}

export const formatPrice = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

// Stable id for a service: used as its anchor on /services and its id in the
// Meta catalog feed.
export const serviceSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
