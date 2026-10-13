# Paavai Embroidery website: handover

Last updated: 13 Oct 2026

## 1. Where everything is

| What | Where |
| --- | --- |
| Website code | https://github.com/yuvarajeshsp-cloud/paavai-embroidery-web (branch `main`) |
| Shop Manager database change | https://github.com/yuvarajeshsp-cloud/embroidery-shop-manager, branch `claude/sharp-ritchie-uz9afj`, file `supabase/migrations/20261013000000_website_services_and_leads.sql` (**not merged and not applied yet**) |
| Domain | paavaiembroidery.com (not connected yet) |
| Hosting | Netlify (site not created yet) |
| Meta setup guide | `docs/META_SETUP.md` in the website repo |

## 2. Status

**Done**
- Website built with Astro: Home, Gallery, Services & prices, About, Contact, Privacy, in English (`/…`) and Tamil (`/ta/…`).
- Colours #d3d3ff / #9f9fff, with deep indigo for text.
- WhatsApp +91 95145 88588 on every page. Messages are pre-filled and say where the visitor came from.
- Enquiry form: saves to Shop Manager, then opens WhatsApp.
- Meta Pixel + Conversions API, cookie banner, Instagram feed, Shop catalog at `/catalog.xml`, short links `/ig`, `/ig-story`, `/ta/ig`.
- All of these are switched off until their keys are added.

**Still placeholders**: address (map hidden), Instagram handle, logo, gallery photos, reviews (marked "sample"), and prices (sample list until Shop Manager is connected).

## 3. Work on your computer

Install **Node.js 22 or newer** (https://nodejs.org) and **Git**, then run:

```sh
git clone https://github.com/yuvarajeshsp-cloud/paavai-embroidery-web
cd paavai-embroidery-web
npm install
npm run dev        # open http://localhost:4321 (live preview as you edit)
```

- `npm run build`: makes the final site in `dist/` and checks for errors.
- `npx astro check`: type check.
- To test the enquiry form locally: `npm install -g netlify-cli`, then `netlify dev`.
- Once `npm install` has run, the site builds without internet. Fonts, the Instagram feed and live prices need internet, and are skipped or fall back if offline.

Saving your changes:

```sh
git add -A
git commit -m "Describe the change"
git push           # Netlify updates the live site automatically (after step 4)
```

## 4. Put it online (Netlify), one time

1. Open https://app.netlify.com/start/deploy?repository=https://github.com/yuvarajeshsp-cloud/paavai-embroidery-web
2. Log in with GitHub, allow access to the repo, then click **Save & Deploy**. The settings come from `netlify.toml`.
3. **Site configuration → Change site name** → `paavai-embroidery`.
4. **Domain management → Add domain** → `paavaiembroidery.com`, then copy the DNS records it shows into your domain provider's account. HTTPS turns on automatically.
5. **Build hooks**: create a hook and call it once a day (for example from https://cron-job.org) so prices and the Instagram feed stay fresh.

## 5. Connect Shop Manager (live prices and saved enquiries)

1. **Merge** the Shop Manager branch `claude/sharp-ritchie-uz9afj` into your main branch (open a pull request on GitHub).
2. **Apply the database change**: Supabase dashboard → **SQL Editor** → paste the contents of `20261013000000_website_services_and_leads.sql` → **Run**. (Or `supabase db push` if you use the Supabase CLI.) It only adds two tables and one function; existing data is not touched.
3. Find your shop's ids (SQL Editor): `select id, slug, name from organizations;`
4. In Netlify → **Site configuration → Environment variables**, add:

| Name | Value | Where to find it |
| --- | --- | --- |
| `PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Project Settings → API |
| `SUPABASE_ANON_KEY` | anon / publishable key | same page |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key | same page. **Secret**: only paste it into Netlify |
| `SHOP_ORG_SLUG` | `slug` from step 3 | |
| `SHOP_ORG_ID` | `id` from step 3 | |

5. **Deploys → Trigger deploy**.
6. Add services: until the Shop Manager app has a screen for this, insert rows in Supabase → Table editor → `website_services` (pick your organization, fill `name_en`, `name_ta`, `starting_price`, `category`, set `is_published` = true), then redeploy.
7. Test: send an enquiry on the live site, then check Table editor → `website_leads`.

Note: as soon as these variables are set, the sample prices disappear. If no service is published, the site shows only "Ask for a quote".

## 6. Everyday edits

| Change | File |
| --- | --- |
| Phone, hours, address, Instagram handle (set `showMap: true` after adding the address) | `src/config/site.ts` |
| Any text, English and Tamil | `src/i18n/strings.ts` |
| Gallery photos | copy JPG/WebP (about 1200px wide) to `public/images/gallery/`, add a line in `src/data/gallery.ts`, delete the `placeholder-*.svg` lines |
| Logo | save as `public/images/logo.svg` or `.png`, set `LOGO_SRC` in `src/components/Logo.astro` |
| Reviews | `src/data/reviews.json` (remove `"sample": true` for real ones) |
| Colours and fonts | `src/styles/global.css` (top of the file) |
| Instagram short links | `public/_redirects` |
| Privacy text | `src/views/PrivacyView.astro` |

Each page lives once in `src/views/*View.astro`. The files in `src/pages/` (English) and `src/pages/ta/` (Tamil) just show that view in one language.

## 7. Meta / Instagram

Follow `docs/META_SETUP.md`: Business account, then Pixel + token (`PUBLIC_META_PIXEL_ID`, `META_CAPI_TOKEN`), then the Instagram feed token (`INSTAGRAM_ACCESS_TOKEN`, which **must be refreshed every 60 days**), then the catalog feed URL `https://paavaiembroidery.com/catalog.xml`.

## 8. How it works (for a developer)

- `src/lib/services.ts`: at build time, calls the Supabase RPC `public_website_services(org_slug)`. If it isn't configured, it uses `src/data/services.fallback.json`. If it is configured but fails, the build fails on purpose so Netlify keeps the last good version.
- `src/lib/instagram.ts`: Instagram Graph API at build time. If there's no token, the section is hidden.
- `src/scripts/tracking.ts`: cookie consent, Meta Pixel, UTM/fbclid capture (kept 30 days), WhatsApp click tracking (`a[data-wa]`).
- `netlify/functions/enquiry.mjs`: checks the input, filters spam (hidden field and minimum fill time), inserts into `website_leads` with the service-role key, and sends a CAPI `Lead` event (only with consent) using the same `event_id` as the browser so Meta counts it once.
- `netlify/functions/meta-event.mjs`: server copy of `Contact` / `ViewContent`.
- `netlify/lib/meta.mjs`: Conversions API helper (phone hashed as SHA-256 with country code 91).

## 9. Next steps

1. Shop Manager app: screens to edit website services and to view and convert website leads.
2. Shop Manager: send a Meta `Purchase` event when a lead becomes a paid order (the attribution columns are already stored on each lead).
3. Real photos, logo, address, Instagram handle and reviews.
4. Have a native speaker review the Tamil text in `src/i18n/strings.ts`.
5. Translate the Privacy page into Tamil.
