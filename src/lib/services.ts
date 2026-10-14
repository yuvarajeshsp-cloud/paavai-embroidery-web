// The price list is edited in the admin page (/admin → Services & prices),
// which saves src/data/services.json. Order in the admin = order on the site.
import data from '../data/services.json';

export type Service = {
  category: string;
  name_en: string;
  name_ta?: string | null;
  description_en?: string | null;
  description_ta?: string | null;
  starting_price?: number | null;
  price_unit?: string | null;
  image?: string | null;
  show?: boolean;
};

const services = (data.services as Service[])
  .filter((s) => s.show !== false && s.name_en)
  .map((s) => ({ ...s, starting_price: s.starting_price == null || (s.starting_price as unknown) === '' ? null : Number(s.starting_price) }));

export async function getServices(): Promise<Service[]> {
  return services;
}

export const formatPrice = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

// Stable id for a service: used as its anchor on /services and its id in the
// Meta catalog feed.
export const serviceSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
