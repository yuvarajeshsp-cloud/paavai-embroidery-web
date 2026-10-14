# Paavai Embroidery website: handover

Last updated: 14 Oct 2026

## 1. Where everything is

| What | Where |
| --- | --- |
| Website | https://paavaifashions.com (www redirects there) |
| Website code | https://github.com/yuvarajeshsp-cloud/paavai-embroidery-web (branch `main`, Netlify site `paavai-embroidery`) |
| Admin page (photos, videos, reviews, prices, links) | https://paavaifashions.com/admin, login with a Shop Manager account (Administrator or Manager) |
| Website content | Shop Manager Supabase project: tables `website_settings`, `website_items`, storage bucket `website-media` (SQL in `supabase/`) |
| Enquiries | Netlify → Forms → `enquiry`, e-mailed to yuvarajeshsp@gmail.com |
| Shop Manager app | https://app.paavaifashions.com (separate app; old paavaifashions.com/privacy.html and /delete-account.html links redirect there) |
| Meta setup guide | `docs/META_SETUP.md` |

## 2. Status

**Done**
- Website built with Astro: Home, Gallery, Services & prices, About, Contact, Privacy, in English (`/…`) and Tamil (`/ta/…`).
- WhatsApp +91 95145 88588 on every page, pre-filled messages that say where the visitor came from.
- Admin page at `/admin` with the Shop Manager login: gallery (photo upload, video upload, YouTube and Instagram links), reviews, services & prices, logo, phone, social and Google links, address, hours. **Publish website** puts changes live.
- Enquiry form saved by Netlify Forms (e-mail alert), then opens WhatsApp.
- Meta Pixel + Conversions API, cookie banner, Instagram feed, Shop catalog at `/catalog.xml`, short links `/ig`, `/ig-story`, `/ta/ig`. Switched off until their keys are added.

**Still placeholders** (edit in `/admin`): address (map hidden), logo, gallery photos, reviews (marked "Sample"), prices (sample list), Google links.

## 3. Work on your computer

Install **Node.js 22 or newer** and **Git**, then:

```sh
git clone https://github.com/yuvarajeshsp-cloud/paavai-embroidery-web
cd paavai-embroidery-web
npm install
npm run dev        # http://localhost:4321 — reads the live content from Supabase
```

`npm run build` makes the final site in `dist/`; `npx astro check` type-checks. Without internet, the dev server falls back to the sample content in `src/data/*.json`. Pushing to `main` deploys automatically.

## 4. Netlify (already set up)

- Site `paavai-embroidery`, linked to the GitHub repo, domains paavaifashions.com + www.
- Forms: detection on, e-mail notification for `enquiry`.
- Environment variable `BUILD_HOOK_URL` (secret): the build hook the **Publish website** button calls (via `netlify/functions/publish.mjs`).
- Optional: `PUBLIC_META_PIXEL_ID`, `META_CAPI_TOKEN`, `INSTAGRAM_ACCESS_TOKEN` (see `.env.example`). If the Instagram feed is used, call the build hook once a day (e.g. https://cron-job.org) so it stays fresh.

## 5. Using the admin page

Open https://paavaifashions.com/admin on a phone or computer and sign in with your Shop Manager e-mail and password. Only **Administrators and Managers** of Paavai Embroidery can sign in; others are turned away.

| Tab | What you can do |
| --- | --- |
| Gallery | **+ Photos** (pick several at once; they are shrunk before upload), **+ Video** (MP4 under 50 MB), **+ YouTube link**, **+ Instagram link**. Then **Edit** to set category, captions, "Show on home page". ↑ ↓ to reorder, Hide/Show, Delete. |
| Reviews | Add your Google reviews (name, stars, text). Turn off **Sample** on real ones. |
| Services & prices | Name, Tamil name, price (empty = "Ask for a quote"), photo for the Instagram Shop. |
| Shop details & links | Logo, phone, Instagram, Facebook, YouTube, Google reviews link, Google "Write a review" link, Google Maps link, address + "Show address and map", hours. |

Changes are saved straight away but appear on the website only after **Publish website** (top right); it takes about a minute. The page shows when there are unpublished changes.

Google links: **Write a review** — Google Business Profile → *Ask for reviews* → copy link. **Reviews / Maps** — Google Maps → your shop → *Share* → copy link.

Videos are served from Supabase (free plan: 5 GB of downloads a month), so keep uploads short; put long videos on YouTube/Instagram and add a link.

## 6. Edits that are still in code

| Change | File |
| --- | --- |
| Any page text, English and Tamil | `src/i18n/strings.ts` |
| Colours and fonts | `src/styles/global.css` (top of the file) |
| Instagram short links | `public/_redirects` |
| Privacy text | `src/views/PrivacyView.astro` |
| Fields shown in the admin page | `src/scripts/admin.ts` (field lists near the middle) |

Each page lives once in `src/views/*View.astro`. The files in `src/pages/` (English) and `src/pages/ta/` (Tamil) just show that view in one language.

## 7. Meta / Instagram

Follow `docs/META_SETUP.md`: Business account, then Pixel + token (`PUBLIC_META_PIXEL_ID`, `META_CAPI_TOKEN`), then the Instagram feed token (`INSTAGRAM_ACCESS_TOKEN`, which **must be refreshed every 60 days**), then the catalog feed URL `https://paavaifashions.com/catalog.xml`.

## 8. How it works (for a developer)

- `src/lib/content.ts` calls the Supabase RPC `public_website_content(org_slug)` once per build (visible items only). On Netlify a failed fetch fails the build, so the last good version stays live; locally it falls back to `src/data/*.json`.
- `src/config/supabase.ts`: project URL, publishable key, shop slug and id (public values; env vars `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_SHOP_ORG_SLUG`, `PUBLIC_SHOP_ORG_ID` override them).
- `src/pages/admin.astro` + `src/scripts/admin.ts`: the admin app (supabase-js). Row level security does the real access control: read for the shop's users, write for its active Administrators/Managers; uploads only under `website-media/<organization_id>/`.
- `netlify/functions/publish.mjs`: checks the caller's Supabase session and role, then calls `BUILD_HOOK_URL` and stamps `website_settings.published_at`.
- Photos are resized by the Netlify Image CDN (`sizedImage()` in `src/lib/gallery.ts`; Supabase URLs allowed in `netlify.toml`).
- Enquiry form: Netlify Forms (`form-name=enquiry`, honeypot `website`); with consent it also calls `netlify/functions/enquiry.mjs` for a CAPI `Lead`.
- `src/layouts/Base.astro` forwards Supabase auth links (`#access_token=…`, `?code=…`) to app.paavaifashions.com, for older Shop Manager builds that still send them to the main domain.
- `src/scripts/tracking.ts`: cookie consent, Meta Pixel, UTM/fbclid capture, WhatsApp click tracking.
