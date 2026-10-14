# Paavai Embroidery — website

Public website for **paavaiembroidery.com**: English + Tamil, built with
[Astro](https://astro.build) and hosted on Netlify.

- **Pages:** Home, Gallery (+ live Instagram feed), Services & prices, About, Contact, Privacy — each at `/…` (English) and `/ta/…` (Tamil).
- **Admin page** at `/admin` ([Decap CMS](https://decapcms.org)): upload photos and videos, add YouTube/Instagram links, edit reviews, prices, logo, Instagram/Google/Facebook links, address and hours. Each save is a commit; Netlify rebuilds in about a minute.
- **Enquiries:** the contact form is saved by **Netlify Forms** (e-mail alerts) and then opens WhatsApp with the message pre-filled, including where the visitor came from (e.g. *via Instagram ad – diwali*).
- **Meta:** Pixel + Conversions API (deduplicated), Instagram feed, Instagram/Facebook Shop catalog feed at `/catalog.xml`, UTM attribution, cookie consent. See [docs/META_SETUP.md](docs/META_SETUP.md).

**New here? Start with [docs/HANDOVER.md](docs/HANDOVER.md).**

## Run locally

```sh
npm install
npm run dev            # http://localhost:4321
npx decap-server       # (second terminal) then open http://localhost:4321/admin/ — edits files locally, no login
npm run build          # production build into dist/
```

Netlify Forms only work on Netlify itself; locally the form still opens WhatsApp.

## Where to change things

Day-to-day content is edited in the admin page (`/admin`), which writes these files:

| What | File |
| --- | --- |
| Gallery: photos, uploaded videos, YouTube and Instagram links | `src/data/gallery.json` (uploads in `public/images/uploads/`, `public/videos/`) |
| Reviews | `src/data/reviews.json` |
| Services & prices | `src/data/services.json` |
| Logo, phone, Instagram/Facebook/YouTube, Google review & Maps links, address, hours | `src/data/settings.json` |
| Admin page fields | `public/admin/config.yml` |

In code only:

| What | File |
| --- | --- |
| All page text (English + Tamil) | `src/i18n/strings.ts` |
| Colors / fonts | `src/styles/global.css` |

## Deploy on Netlify

1. Netlify → *Add new site* → *Import from GitHub* → pick this repo. Build settings come from `netlify.toml`.
2. *Domain management*: add `paavaiembroidery.com` and follow Netlify's DNS steps.
3. Admin login: create a GitHub OAuth app and add it under Netlify → *Site configuration → Access & security → OAuth* (steps in [docs/HANDOVER.md](docs/HANDOVER.md)).
4. *Forms*: enable form detection and add an e-mail notification for the `enquiry` form.
5. Optional: *Environment variables* from `.env.example` for Meta and the Instagram feed.

## Instagram short links

`public/_redirects` defines tagged redirects for Instagram:

- `paavaiembroidery.com/ig` — use in the Instagram bio
- `paavaiembroidery.com/ig-story` — use in story link stickers
- `paavaiembroidery.com/ta/ig` — Tamil bio link

For ads, add URL parameters in Ads Manager, e.g.
`utm_source=instagram&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`.
