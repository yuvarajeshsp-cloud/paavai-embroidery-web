# Meta (Instagram / Facebook) setup

Everything Meta-related is already built and stays **off** until the IDs
below are added in Netlify (*Site configuration → Environment variables*),
followed by a redeploy. Never paste tokens into code, chat or GitHub.

## 1. Business account

1. Go to <https://business.facebook.com> and create a Business portfolio for Paavai Embroidery.
2. *Settings → Accounts → Instagram accounts*: connect the shop's Instagram. It must be a **Professional** (Business or Creator) account: Instagram app → Settings → Account type and tools.
3. Connect the shop's Facebook Page too, if there is one.

## 2. Pixel + Conversions API

1. *Events Manager → Connect data sources → Web* → name it "Paavai website" → this creates a Pixel (also called a Dataset). Copy its **ID**.
2. In that Pixel: *Settings → Conversions API → Generate access token*. Copy the **token**.
3. In Netlify, add:
   - `PUBLIC_META_PIXEL_ID` = the Pixel ID
   - `META_CAPI_TOKEN` = the token
4. *Events Manager → Settings → Domains* (or Business settings → Brand safety → Domains): add and verify `paavaifashions.com`.
5. Test: Events Manager → *Test events* → copy the test code → add it in Netlify as `META_TEST_EVENT_CODE` → redeploy, open the site, accept cookies, tap WhatsApp and send a test enquiry. You should see **PageView**, **Contact** and **Lead**, each marked as received from both *Browser* and *Server* and deduplicated. Remove `META_TEST_EVENT_CODE` afterwards.

What gets sent (only after the visitor taps **Accept** on the cookie banner):

| Event | When | From |
| --- | --- | --- |
| PageView | every page | browser |
| Contact | any WhatsApp button tapped | browser + server |
| Lead | enquiry form saved | browser + server (with hashed phone + first name for matching) |

In Ads Manager, optimise campaigns for **Leads** using this Pixel.

### Later: "Purchase" events

To let Instagram ads optimise for paying customers (not just enquiries),
Meta can be told about sales: Events Manager → *Offline events* / upload a
CSV of phone numbers and order values every week or so.

## 3. Instagram feed on the website

1. <https://developers.facebook.com> → *My Apps → Create app* → type **Business**.
2. Add the product **Instagram** → *API setup with Instagram login*.
3. Add the shop's Instagram account as a tester / connect it, and **generate a token** with the `instagram_business_basic` permission.
4. Exchange it for a **long-lived token** (valid 60 days), as described on that same setup page.
5. In Netlify, add `INSTAGRAM_ACCESS_TOKEN` = the long-lived token and redeploy.

The feed is fetched on every build, so set up the daily build hook (see README). The token must be **refreshed before 60 days** run out (one call to `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=…`). If it expires, the Instagram section simply disappears until a new token is added; the rest of the site keeps working.

## 4. Instagram / Facebook Shop catalog

The site publishes a product feed at **https://paavaifashions.com/catalog.xml**. It is rebuilt every time you press **Publish website** in `/admin`.

What is in it:
- **One product per design that has a price** (Fixed, From or Range). Designs set to "Price on request" are left out, because Meta requires a price. For From/Range prices the lowest price is used and the description says "Starting price ₹…".
- Product id = **design code** (PE-0001), title = design name + code, all photos (main photo + up to 10 more), link to the design page (tagged `utm_source=instagram&utm_medium=shop`), availability from the "Available to order" switch, category path in `product_type` and `custom_label_0/1`, work types in `custom_label_2`.
- Services that have their own photo in `/admin` → Services & prices.

Set-up (one time):
1. *Commerce Manager* (<https://business.facebook.com/commerce>) → *Add catalog* → **E-commerce** → *Upload product info*, owned by the shop's Business account.
2. *Catalog → Data sources → Add items → Data feed → Scheduled feed* → URL `https://paavaifashions.com/catalog.xml` → repeat **daily**, currency **INR**. Use *Fetch now* the first time.
3. *Catalog → Events* (or *Settings → Event sources*): connect the **Pixel** (section 2). The site already sends `ViewContent` (design page) and `AddToWishlist` (♡ shortlist) with `content_ids` = design code, so Meta can match visits to products.
4. *Commerce Manager → Shops* → create a shop for the Instagram account (checkout method: **checkout on another website**). Meta reviews eligibility; this can take a few days.
5. Once approved: in the Instagram app, *Settings → Business tools → Shopping*, then tag designs in posts and reels (*Tag products*).
6. Optional: in Ads Manager, a **catalog sales** campaign can show people the designs they looked at or shortlisted.

Notes:
- Photos must be JPG/PNG of at least 500×500 (the admin's 1600 px uploads are fine).
- The small "Paavai Embroidery · PE-0001" watermark is usually accepted, but Meta can reject product images it considers to have overlays. If products are rejected for the image, tell your developer: the admin can keep an unwatermarked copy for the catalog.
- Prices in the feed must match the website, so change prices only in `/admin` and press **Publish website**.

## 5. Tagged links

- Instagram bio: `paavaifashions.com/ig`
- Story link sticker: `paavaifashions.com/ig-story`
- Ads (Ads Manager → *URL parameters*): `utm_source=instagram&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`

The source is saved with every enquiry (Netlify → Forms, field `came_from`) and appended to the
WhatsApp message (e.g. "(via Instagram ad – Diwali bridal)").
