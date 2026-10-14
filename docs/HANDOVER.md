# Paavai Embroidery website: handover

Last updated: 14 Oct 2026

## 1. Where everything is

| What | Where |
| --- | --- |
| Website code | https://github.com/yuvarajeshsp-cloud/paavai-embroidery-web (branch `main`) |
| Admin page (photos, videos, reviews, prices, links) | https://paavaifashions.com/admin (after step 4) |
| Enquiries | Netlify → your site → **Forms** → `enquiry` (plus e-mail alerts) |
| Domain | paavaifashions.com and www (the Shop Manager app is at app.paavaifashions.com) |
| Hosting | Netlify (site not created yet) |
| Meta setup guide | `docs/META_SETUP.md` |

The website does **not** depend on Shop Manager (the separate shop/order app).

## 2. Status

**Done**
- Website built with Astro: Home, Gallery, Services & prices, About, Contact, Privacy, in English (`/…`) and Tamil (`/ta/…`).
- Colours #d3d3ff / #9f9fff, with deep indigo for text.
- WhatsApp +91 95145 88588 on every page. Messages are pre-filled and say where the visitor came from.
- **Admin page** (`/admin`): gallery (photos, uploaded videos, YouTube links, Instagram post/reel links), reviews, services & prices, logo, phone, Instagram/Facebook/YouTube, Google reviews and "Write a review" links, Google Maps link, address, hours.
- Enquiry form: saved by Netlify Forms, then opens WhatsApp.
- Meta Pixel + Conversions API, cookie banner, Instagram feed, Shop catalog at `/catalog.xml`, short links `/ig`, `/ig-story`, `/ta/ig`. Switched off until their keys are added.

**Still placeholders** (all editable in `/admin`): address (map hidden), Instagram handle, logo, gallery photos, reviews (marked "sample"), prices (sample list), Google links.

## 3. Work on your computer

Install **Node.js 22 or newer** (https://nodejs.org) and **Git**, then run:

```sh
git clone https://github.com/yuvarajeshsp-cloud/paavai-embroidery-web
cd paavai-embroidery-web
npm install
npm run dev        # open http://localhost:4321 (live preview as you edit)
```

- Admin page locally: in a second terminal run `npx decap-server`, then open http://localhost:4321/admin/ and click **Login** (no password; it edits the files on your computer, commit and push them afterwards).
- `npm run build`: makes the final site in `dist/` and checks for errors. `npx astro check`: type check.

Saving code changes:

```sh
git add -A
git commit -m "Describe the change"
git push           # Netlify updates the live site automatically (after step 4)
```

## 4. Put it online (Netlify), one time

1. Open https://app.netlify.com/start/deploy?repository=https://github.com/yuvarajeshsp-cloud/paavai-embroidery-web
2. Log in with GitHub, allow access to the repo, then click **Save & Deploy**. The settings come from `netlify.toml`.
3. **Site configuration → Change site name** → `paavai-embroidery`.
4. **Domain management → Add domain** → `paavaifashions.com`, then copy the DNS records it shows into your domain provider's account. HTTPS turns on automatically.
5. **Forms**: Netlify → **Forms** → *Enable form detection*, then redeploy once. Under **Forms → Form notifications** add an e-mail notification for `enquiry`.
6. **Admin login** (lets you log in to `/admin` with GitHub):
   1. GitHub → Settings → Developer settings → **OAuth Apps** → *New OAuth App*.
      Homepage URL `https://paavaifashions.com`, Authorization callback URL `https://api.netlify.com/auth/done`. Create it, then *Generate a new client secret*.
   2. Netlify → **Site configuration → Access & security → OAuth** → *Install provider* → GitHub → paste the Client ID and secret.
   3. Open https://paavaifashions.com/admin and log in with GitHub. Anyone who should edit the site needs a GitHub account added as a collaborator on the repo.
7. Optional, for the Instagram feed only: **Build hooks** → create a hook and call it once a day (for example from https://cron-job.org) so the feed stays fresh.

## 5. Using the admin page

Open `/admin` on your phone or computer → **Website**:

| Section | What you can do |
| --- | --- |
| Gallery – photos & videos | **Add item** → *Photo* (upload from phone), *Video (upload)* (short MP4, under 20 MB, add a cover photo), *YouTube video* (paste link), *Instagram post / reel* (paste link + cover photo). Pick a category, add captions, tick **Show on home page** for the "Recent work" section. Drag to reorder. |
| Reviews | Copy your Google reviews in (name, stars, text). Turn **Sample** off on real ones. |
| Services & prices | Name, Tamil name, price (empty = "Ask for a quote"), photo for the Instagram Shop. |
| Shop details & links | Logo, phone, Instagram username, Facebook/YouTube links, Google reviews link, Google "Write a review" link, Google Maps link, address (+ **Show address and map**), hours. |

Click **Publish** (top right). The live site updates in about a minute.

Where to find the Google links:
- **Write a review**: Google Business Profile (search your shop name on Google while logged in) → *Ask for reviews* → copy the link.
- **Reviews / Maps link**: Google Maps → your shop → *Share* → *Copy link*.

Photos straight from a phone are fine: Netlify resizes them and serves WebP automatically. Long videos make the site repo heavy, so put those on YouTube/Instagram and add a link instead.

## 6. Edits that are still in code

| Change | File |
| --- | --- |
| Any page text, English and Tamil | `src/i18n/strings.ts` |
| Colours and fonts | `src/styles/global.css` (top of the file) |
| Instagram short links | `public/_redirects` |
| Privacy text | `src/views/PrivacyView.astro` |
| Fields shown in the admin page | `public/admin/config.yml` |

Each page lives once in `src/views/*View.astro`. The files in `src/pages/` (English) and `src/pages/ta/` (Tamil) just show that view in one language.

## 7. Meta / Instagram

Follow `docs/META_SETUP.md`: Business account, then Pixel + token (`PUBLIC_META_PIXEL_ID`, `META_CAPI_TOKEN`), then the Instagram feed token (`INSTAGRAM_ACCESS_TOKEN`, which **must be refreshed every 60 days**), then the catalog feed URL `https://paavaifashions.com/catalog.xml`.

## 8. How it works (for a developer)

- Content lives in `src/data/*.json` and is read at build time: `src/config/site.ts` (settings), `src/lib/gallery.ts`, `src/lib/services.ts`, `src/components/Reviews.astro`.
- `public/admin/` is Decap CMS (GitHub backend through Netlify's OAuth). Uploads go to `public/images/uploads/` and `public/videos/`.
- `sizedImage()` in `src/lib/gallery.ts` serves uploaded photos through the Netlify Image CDN (`/.netlify/images`) on Netlify builds.
- YouTube tiles load `youtube-nocookie.com` only when tapped.
- `src/scripts/tracking.ts`: cookie consent, Meta Pixel, UTM/fbclid capture (kept 30 days), WhatsApp click tracking (`a[data-wa]`).
- Enquiry form (`src/components/EnquiryForm.astro`) posts to Netlify Forms (`form-name=enquiry`, honeypot `website`). With consent, it also calls `netlify/functions/enquiry.mjs`, which sends a CAPI `Lead` with the same `event_id` as the browser.
- `netlify/functions/meta-event.mjs`: server copy of `Contact` / `ViewContent`. `netlify/lib/meta.mjs`: Conversions API helper.
