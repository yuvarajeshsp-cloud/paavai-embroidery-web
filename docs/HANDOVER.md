# Paavai Embroidery website: handover

Last updated: 14 Oct 2026

## 1. Where everything is

| What | Where |
| --- | --- |
| Website | https://paavaifashions.com (www redirects there) |
| Website code | https://github.com/yuvarajeshsp-cloud/paavai-embroidery-web (branch `main`, Netlify site `paavai-embroidery`) |
| Admin page (photos, videos, reviews, prices, links) | https://paavaifashions.com/admin, login with a Shop Manager account (Administrator or Manager) |
| Website content | Shop Manager Supabase project: tables `website_categories`, `website_designs`, `website_settings`, `website_items` (reviews, services), storage bucket `website-media` (SQL in `supabase/`) |
| Enquiries | Netlify → Forms → `enquiry`, e-mailed to yuvarajeshsp@gmail.com |
| Shop Manager app | https://app.paavaifashions.com (separate app; old paavaifashions.com/privacy.html and /delete-account.html links redirect there) |
| Meta setup guide | `docs/META_SETUP.md` |

## 2. Status

**Done**
- Website built with Astro: Home, Designs (catalogue), Services & prices, About, Contact, Privacy, in English (`/…`) and Tamil (`/ta/…`).
- Design catalogue: `/designs` (search, category and subcategory chips, price and work-type filters, sorting), a page per category (`/designs/<slug>`) and per design (`/design/pe-0001`) with photos, price, WhatsApp enquiry with the design code, share button and similar designs. `/gallery` redirects to `/designs`.
- Shortlist: ♡ on every design (saved on the visitor's phone), floating "Shortlist" button, `/shortlist` page with **Send shortlist on WhatsApp** (codes, names, prices and a link). A list link `/shortlist?codes=PE-0001,PE-0007` shows those designs to anyone — you can also send customers hand-picked sets this way.
- Instagram/Facebook Shop feed `/catalog.xml`: every design with a price (see `docs/META_SETUP.md` section 4).
- Client links: private pages `/c/<code>` with hand-picked designs for one customer (can include hidden "exclusive" designs, optional prices and end date). Loaded live — no publishing needed. The customer taps ♡ and sends their choices on WhatsApp; `/admin` shows when the link was opened.
- Insights: anonymous counts of design views, ♡ and WhatsApp enquiries (no visitor data). Shown in `/admin` → Insights and on each design row; the website gets a "Most popular" sort and "Popular" badges (updated when you publish).
- WhatsApp +91 95145 88588 on every page, pre-filled messages that say where the visitor came from.
- Admin page at `/admin` with the Shop Manager login: designs (bulk photo upload, watermark, quick price editing), categories and subcategories, reviews, services & prices, logo, phone, social and Google links, address, hours. **Publish website** puts changes live.
- Enquiry form saved by Netlify Forms (e-mail alert), then opens WhatsApp.
- Meta Pixel + Conversions API (`ViewContent` and `AddToWishlist` carry the design code), cookie banner, Instagram feed, short links `/ig`, `/ig-story`, `/ta/ig`. Switched off until their keys are added.

**Still to fill in** (in `/admin`): designs (starter categories are there, no designs yet), address (map hidden), logo, reviews (marked "Sample"), service prices (sample list), Google links.

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
| Designs | **+ Upload photos (one design each)**: pick many photos, choose the category (and optionally price and work type) and each photo becomes a design with its own code, PE-0001, PE-0002… Then set prices right in the list (Price on request / Fixed / From / Range). **Edit** a design to add more photos (← → to order, first = main photo), title, description, work type, delivery time, video, Featured, Available, Hide. Filter by category, "Price not set", hidden… A storage meter shows how much of the 1 GB free space is used. |
| Client links | **+ New client link**: title (e.g. "Bridal options for Priya"), customer name and WhatsApp number, a message, show/hide prices, optional end date, then tap designs to add them (hidden designs show as "Exclusive"). Then **Send on WhatsApp** (opens WhatsApp with the link ready), **Copy link** or **Preview** (doesn't count as the customer opening it). The list shows how many times the customer opened it. |
| Insights | Views, ♡ and WhatsApp enquiries for the last 7/30/90 days: totals, top 20 designs, totals per category, and how many designs had no views. |
| Categories | Add categories and subcategories (one level, e.g. Blouse › Back neck) with English and Tamil names and an optional cover photo. ↑ ↓ to order, Hide/Show. A category with designs or subcategories can't be deleted — hide it instead. |
| Reviews | Add your Google reviews (name, stars, text). Turn off **Sample** on real ones. |
| Services & prices | Name, Tamil name, price (empty = "Ask for a quote"), photo for the Instagram Shop. |
| Shop details & links | Logo, phone, Instagram, Facebook, YouTube, Google reviews link, Google "Write a review" link, Google Maps link, address + "Show address and map", hours. |

Design photos are shrunk to 1600 px and get a small "Paavai Embroidery · PE-0001" watermark in the bottom-right corner when uploaded; the original is not stored, so keep your originals on your phone. A design without photos, or in a hidden category, is not shown on the website.

**3D blouse view** (optional, in **Edit** on a design): choose the front neck, back neck, sleeve length and fabric colour, then upload up to four designs: **Front (right side)**, **Back**, **Right sleeve**, **Left sleeve**. Use PNG artwork with a **transparent background** (a JPG's white background shows on the blouse). Move each design with the **Size / Left ↔ right / Down ↕ up** sliders while watching the live 3D preview (drag it to turn; the preview turns to the part you are moving). "Left ↔ right" is as seen from outside: on the front, the wearer's right side is the left half of the panel. On save the images get the same small watermark and are stored in full quality (up to 2048 px). The website then shows a **View in 3D** button on that design (and a "3D" badge on its card): visitors can turn the mannequin, jump to front/back/sides and try other fabric colours.

Changes are saved straight away but appear on the website only after **Publish website** (top right); it takes about a minute. The page shows when there are unpublished changes.

Google links: **Write a review** — Google Business Profile → *Ask for reviews* → copy link. **Reviews / Maps** — Google Maps → your shop → *Share* → copy link.

Storage: the Supabase free plan has 1 GB for all files (shared with Shop Manager's order attachments). 500 designs × 3 photos ≈ 0.5–0.6 GB. When the meter passes 80 %, move to Supabase Pro (100 GB). Videos are served from Supabase (5 GB of downloads a month on the free plan), so keep them short.

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

- `src/lib/content.ts` calls the Supabase RPC `public_website_content(org_slug)` once per build (visible categories, designs with photos, reviews, services, settings). `src/lib/designs.ts` turns it into category/design helpers; `src/components/DesignBrowser.astro` does the filtering in the browser (all designs are in the page; 500 designs ≈ 30 KB gzipped). On Netlify a failed fetch fails the build, so the last good version stays live; locally it falls back to `src/data/*.json`.
- `src/config/supabase.ts`: project URL, publishable key, shop slug and id (public values; env vars `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_SHOP_ORG_SLUG`, `PUBLIC_SHOP_ORG_ID` override them).
- `src/pages/admin.astro` + `src/scripts/admin.ts`: the admin app (supabase-js); photos are resized and watermarked in the browser before upload. Design codes come from a database trigger (`assign_website_design_code`). Row level security does the real access control: read for the shop's users, write for its active Administrators/Managers; uploads only under `website-media/<organization_id>/`.
- `netlify/functions/publish.mjs`: checks the caller's Supabase session and role, then calls `BUILD_HOOK_URL` and stamps `website_settings.published_at`.
- Photos are resized by the Netlify Image CDN (`sizedImage()` in `src/lib/media.ts`; Supabase URLs allowed in `netlify.toml`).
- Enquiry form: Netlify Forms (`form-name=enquiry`, honeypot `website`); with consent it also calls `netlify/functions/enquiry.mjs` for a CAPI `Lead`.
- `src/layouts/Base.astro` forwards Supabase auth links (`#access_token=…`, `?code=…`) to app.paavaifashions.com, for older Shop Manager builds that still send them to the main domain.
- `src/scripts/tracking.ts`: cookie consent, Meta Pixel, UTM/fbclid capture, WhatsApp click tracking.
- `src/scripts/shortlist.ts`: ♡ buttons (`[data-heart]`), localStorage list, `AddToWishlist`. `/shortlist` builds itself from `/designs-index.json`.
- `src/pages/catalog.xml.ts`: Meta product feed (designs with a price, id = design code).
- 3D blouse: `website_designs.blouse3d` (jsonb, `supabase/20261017000000_website_blouse_3d.sql`), types and defaults in `src/lib/blouse3d.ts`. The viewer `src/scripts/blouse3d-viewer.ts` (three.js, ~150 KB gzipped) is loaded with `import()` only when "View in 3D" is opened (design page) or a 3D design is added in /admin. The mannequin and blouse are built in code: blouse panels carry UVs in real distances along the surface (so designs keep their proportions); each panel's texture is a canvas painted with the fabric colour and the design at its size/position; necklines are cut in the shader from a per-vertex distance (`aKeep`). Uploads go to `website-media/<org>/designs-3d/` as WebP (PNG fallback).
- `src/views/CollectionView.astro`: client link page; `public/_redirects` serves it for every `/c/*`. Data from `view_collection(token)` (counts opens unless `?preview=1`).
- `src/scripts/stats.ts`: anonymous counters via `track_design_event(slug, code, kind)`; table `website_design_stats`; admin reads `website_design_insights(since)`; the build gets 60-day scores in `popular`.
