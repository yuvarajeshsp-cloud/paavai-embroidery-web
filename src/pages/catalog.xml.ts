// Product feed for Meta Commerce Manager (Instagram / Facebook Shop).
// Commerce Manager -> Catalog -> Data sources -> Data feed -> scheduled feed
// URL: https://paavaifashions.com/catalog.xml (refresh daily).
//
// One item per visible design that has a price (Meta requires a price, so
// "price on request" designs are left out). The id is the design code, the
// same id the site sends with ViewContent / AddToWishlist events, so Meta can
// match website visits to products. For "from" and range prices the lowest
// price is used. Services with their own photo are listed too.
import type { APIRoute } from 'astro';
import { site } from '../config/site';
import { categoryById, designName, designs, tagLabel, type Design } from '../lib/designs';
import { getServices, serviceSlug } from '../lib/services';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const abs = (src: string) => new URL(src, site.url).toString();
const utm = (id: string) => `utm_source=instagram&utm_medium=shop&utm_campaign=catalog&utm_content=${encodeURIComponent(id)}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function designItem(d: Design): string {
  const cat = categoryById(d.category_id)!;
  const parent = categoryById(cat.parent_id);
  const path = parent ? `${parent.name_en} > ${cat.name_en}` : cat.name_en;
  const name = designName(d, 'en');
  const work = d.tags.map((t) => tagLabel(t, 'en')).join(', ');
  const description =
    d.description ||
    `${path.replace(' > ', ' – ')} embroidery design ${d.code}${work ? ` (${work})` : ''}. Made to order by ${site.name}.`;
  const note =
    d.price_type === 'range' && d.price_max != null
      ? ` Price ₹${d.price}–₹${d.price_max} depending on the design.`
      : d.price_type === 'from'
        ? ` Starting price ₹${d.price}; final price depends on the design.`
        : '';
  const extra = d.images.slice(1, 11).map((src) => `      <g:additional_image_link>${esc(abs(src))}</g:additional_image_link>`);
  return [
    '    <item>',
    `      <g:id>${esc(d.code)}</g:id>`,
    `      <g:title>${esc(clip(`${name} – ${d.code}`, 150))}</g:title>`,
    `      <g:description>${esc(clip(`${description}${note}`, 5000))}</g:description>`,
    `      <g:availability>${d.available ? 'in stock' : 'out of stock'}</g:availability>`,
    '      <g:condition>new</g:condition>',
    `      <g:price>${Number(d.price).toFixed(2)} INR</g:price>`,
    `      <g:link>${esc(`${site.url}/design/${d.code.toLowerCase()}?${utm(d.code)}`)}</g:link>`,
    `      <g:image_link>${esc(abs(d.images[0]))}</g:image_link>`,
    ...extra,
    `      <g:brand>${esc(site.name)}</g:brand>`,
    `      <g:product_type>${esc(path)}</g:product_type>`,
    '      <g:google_product_category>Apparel &amp; Accessories &gt; Clothing</g:google_product_category>',
    `      <g:custom_label_0>${esc(parent?.name_en ?? cat.name_en)}</g:custom_label_0>`,
    `      <g:custom_label_1>${esc(cat.name_en)}</g:custom_label_1>`,
    ...(work ? [`      <g:custom_label_2>${esc(work)}</g:custom_label_2>`] : []),
    `      <g:custom_label_3>${d.price_type}</g:custom_label_3>`,
    '    </item>',
  ].join('\n');
}

export const GET: APIRoute = async () => {
  const designItems = designs.filter((d) => d.price_type !== 'ask' && d.price != null && d.images.length).map(designItem);

  const serviceItems = (await getServices())
    .filter((s) => s.starting_price != null && s.image)
    .map((svc) => {
      const id = serviceSlug(svc.name_en);
      return `    <item>
      <g:id>${esc(id)}</g:id>
      <g:title>${esc(svc.name_en)}</g:title>
      <g:description>${esc(`${svc.description_en || svc.name_en} Starting price ₹${svc.starting_price}.`)}</g:description>
      <g:availability>in stock</g:availability>
      <g:condition>new</g:condition>
      <g:price>${Number(svc.starting_price).toFixed(2)} INR</g:price>
      <g:link>${esc(`${site.url}/services?${utm(id)}#${id}`)}</g:link>
      <g:image_link>${esc(abs(svc.image!))}</g:image_link>
      <g:brand>${esc(site.name)}</g:brand>
      <g:product_type>Services &gt; ${esc(svc.category)}</g:product_type>
    </item>`;
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${esc(site.name)}</title>
    <link>${site.url}</link>
    <description>${esc(site.name)} embroidery designs</description>
${[...designItems, ...serviceItems].join('\n')}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
