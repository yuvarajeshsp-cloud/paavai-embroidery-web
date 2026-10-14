// Price wording for designs, shared by the built pages and the browser-built
// collection page.
export type PriceType = 'fixed' | 'from' | 'range' | 'ask';
type Priced = { price_type: PriceType; price: number | null; price_max: number | null };

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export function priceLabel(d: Priced, lang: 'en' | 'ta'): string {
  const ta = lang === 'ta';
  if (d.price_type === 'ask' || d.price == null) return ta ? 'விலைக்கு கேளுங்கள்' : 'Price on request';
  if (d.price_type === 'from') return ta ? `${inr(d.price)} முதல்` : `From ${inr(d.price)}`;
  if (d.price_type === 'range' && d.price_max != null && d.price_max > d.price) return `${inr(d.price)} – ${inr(d.price_max)}`;
  return inr(d.price);
}
