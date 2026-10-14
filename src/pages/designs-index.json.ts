// Compact list of every visible design, for the shortlist page (which builds
// itself in the browser from the codes saved on the visitor's phone).
import type { APIRoute } from 'astro';
import { sizedImage } from '../lib/media';
import { designName, designUrl, designs, priceLabel } from '../lib/designs';

export const GET: APIRoute = () => {
  const list = designs.map((d) => ({
    c: d.code,
    i: sizedImage(d.images[0], 320),
    a: d.available,
    en: { n: designName(d, 'en'), p: priceLabel(d, 'en'), u: designUrl('en', d.code) },
    ta: { n: designName(d, 'ta'), p: priceLabel(d, 'ta'), u: designUrl('ta', d.code) },
  }));
  return new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
