# Paavai Embroidery — website

Public website for **paavaifashions.com**: English + Tamil, built with
[Astro](https://astro.build) and hosted on Netlify.

- **Pages:** Home, Designs (catalogue with search and filters, a page per category and per design, "View in 3D" on a blouse mannequin), 3D Studio (customers try their own PNG/DST embroidery on the mannequin), Services & prices, About, Contact, Privacy — each at `/…` (English) and `/ta/…` (Tamil).
- **Admin page** at `/admin`, signed in with a Shop Manager account (Administrator/Manager): upload designs (bulk, watermarked), manage categories and prices, edit reviews, services, logo, Instagram/Google/Facebook links, address and hours. Content lives in the Shop Manager Supabase project; **Publish website** rebuilds the site.
- **Enquiries:** the contact form is saved by **Netlify Forms** (e-mail alerts) and then opens WhatsApp with the message pre-filled, including where the visitor came from (e.g. *via Instagram ad – diwali*).
- **Meta:** Pixel + Conversions API (deduplicated), Instagram feed, Instagram/Facebook Shop catalog feed at `/catalog.xml`, UTM attribution, cookie consent. See [docs/META_SETUP.md](docs/META_SETUP.md).

**New here? Start with [docs/HANDOVER.md](docs/HANDOVER.md).**

## Run locally

```sh
npm install
npm run dev            # http://localhost:4321 (admin at /admin)
npm run build          # production build into dist/
```

Netlify Forms only work on Netlify itself; locally the form still opens WhatsApp.

## Where to change things

| What | Where |
| --- | --- |
| Designs, categories, reviews, services & prices, logo, links, address, hours | `/admin` (Supabase `website_categories`, `website_designs`, `website_settings`, `website_items`; bucket `website-media`) |
| All page text (English + Tamil) | `src/i18n/strings.ts` |
| Colors / fonts | `src/styles/global.css` |
| Starting content / offline fallback | `src/data/*.json` |

## Deploy on Netlify

Already set up (site `paavai-embroidery`, domain paavaifashions.com). Pushing to `main` deploys. The **Publish website** button calls the build hook stored in the `BUILD_HOOK_URL` environment variable. Optional Meta / Instagram variables are listed in `.env.example`.

## Instagram short links

`public/_redirects` defines tagged redirects for Instagram:

- `paavaifashions.com/ig` — use in the Instagram bio
- `paavaifashions.com/ig-story` — use in story link stickers
- `paavaifashions.com/ta/ig` — Tamil bio link

For ads, add URL parameters in Ads Manager, e.g.
`utm_source=instagram&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`.
