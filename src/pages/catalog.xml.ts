// Product feed for Meta Commerce Manager (Instagram / Facebook Shop).
// Commerce Manager -> Catalog -> Data sources -> Data feed -> scheduled feed
// URL: https://paavaifashions.com/catalog.xml (refresh daily).
// Meta needs a JPG/PNG image (min 500x500) for every item: services without
// an image fall back to a design photo from a category of the same name,
// then the default one.
import type { APIRoute } from 'astro';
import { site } from '../config/site';
import { categories, designsIn } from '../lib/designs';
import { getServices, serviceSlug, type Service } from '../lib/services';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function imageFor(svc: Service): string {
  const src =
    svc.image ||
    designsIn(categories.find((c) => c.name_en.toLowerCase() === svc.category.toLowerCase())?.id ?? '')[0]?.images[0] ||
    '/images/catalog-default.jpg';
  return new URL(src, site.url).toString();
}

export const GET: APIRoute = async () => {
  const services = (await getServices()).filter((s) => s.starting_price != null);
  const items = services
    .map((svc) => {
      const id = serviceSlug(svc.name_en);
      const link = `${site.url}/services?utm_source=instagram&utm_medium=shop&utm_campaign=catalog&utm_content=${id}#${id}`;
      return `    <item>
      <g:id>${esc(id)}</g:id>
      <g:title>${esc(svc.name_en)}</g:title>
      <g:description>${esc(svc.description_en || svc.name_en)}</g:description>
      <g:availability>in stock</g:availability>
      <g:condition>new</g:condition>
      <g:price>${Number(svc.starting_price).toFixed(2)} INR</g:price>
      <g:link>${esc(link)}</g:link>
      <g:image_link>${esc(imageFor(svc))}</g:image_link>
      <g:brand>${esc(site.name)}</g:brand>
      <g:product_type>${esc(svc.category)}</g:product_type>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${esc(site.name)}</title>
    <link>${site.url}</link>
    <description>${esc(site.name)} services</description>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
