# Paavai Embroidery — website

Public website for **paavaiembroidery.com**: English + Tamil, built with
[Astro](https://astro.build) and hosted on Netlify.

- **Pages:** Home, Gallery (+ live Instagram feed), Services & prices, About, Contact, Privacy — each at `/…` (English) and `/ta/…` (Tamil).
- **Enquiries:** the contact form saves a lead into **Shop Manager** (`website_leads`) and then opens WhatsApp with the message pre-filled, including where the visitor came from (e.g. *via Instagram ad – diwali*).
- **Prices:** read live from Shop Manager (`website_services`, published rows) every time the site builds.
- **Meta:** Pixel + Conversions API (deduplicated), Instagram feed, Instagram/Facebook Shop catalog feed at `/catalog.xml`, UTM attribution, cookie consent. See [docs/META_SETUP.md](docs/META_SETUP.md).

**New here? Start with [docs/HANDOVER.md](docs/HANDOVER.md).**

## Run locally

```sh
npm install
cp .env.example .env   # optional — without it the site uses sample prices
npm run dev            # http://localhost:4321
npm run build          # production build into dist/
```

The enquiry form posts to a Netlify Function, so to test it locally use
`npx netlify dev` instead of `npm run dev`.

## Where to change things

| What | File |
| --- | --- |
| Phone, hours, address, Instagram handle, map | `src/config/site.ts` |
| All page text (English + Tamil) | `src/i18n/strings.ts` |
| Gallery photos | put images in `public/images/gallery/`, list them in `src/data/gallery.ts` |
| Logo | save as `public/images/logo.svg` (or .png) and set `LOGO_SRC` in `src/components/Logo.astro` |
| Reviews | `src/data/reviews.json` (remove `"sample": true` on real ones) |
| Prices | in Shop Manager → website services (the sample list in `src/data/services.fallback.json` is only used until Supabase is connected) |
| Colors / fonts | `src/styles/global.css` |

Still placeholders: shop address (`showMap: false` hides the map until it's filled in), Instagram handle, photos, logo, reviews.

## Deploy on Netlify

1. Netlify → *Add new site* → *Import from GitHub* → pick this repo. Build settings come from `netlify.toml`.
2. *Site configuration → Environment variables*: add the values listed in `.env.example`.
3. *Domain management*: add `paavaiembroidery.com` and follow Netlify's DNS steps.
4. *Build hooks*: create one and call it daily (e.g. from a free cron service, or a Netlify scheduled function) so prices and the Instagram feed stay fresh. Changing prices in Shop Manager shows up on the next build.

## Shop Manager connection

Needs the migration `20261013000000_website_services_and_leads.sql` from the
Embroidery-Shop-Manager repo applied to Supabase. It adds:

- `website_services` — the public price list (only `is_published` rows are exposed, through the `public_website_services(org_slug)` function).
- `website_leads` — enquiries from the form, with UTM / Meta attribution. Only the server function writes them, using the service-role key.

Environment variables: `PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SHOP_ORG_SLUG` (build-time, read prices);
`SUPABASE_SERVICE_ROLE_KEY` and `SHOP_ORG_ID` (server-only, save leads). Never put the service-role key in a `PUBLIC_` variable.

## Instagram short links

`public/_redirects` defines tagged redirects for Instagram:

- `paavaiembroidery.com/ig` — use in the Instagram bio
- `paavaiembroidery.com/ig-story` — use in story link stickers
- `paavaiembroidery.com/ta/ig` — Tamil bio link

For ads, add URL parameters in Ads Manager, e.g.
`utm_source=instagram&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`.
