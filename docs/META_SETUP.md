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
4. *Events Manager → Settings → Domains* (or Business settings → Brand safety → Domains): add and verify `paavaiembroidery.com`.
5. Test: Events Manager → *Test events* → copy the test code → add it in Netlify as `META_TEST_EVENT_CODE` → redeploy, open the site, accept cookies, tap WhatsApp and send a test enquiry. You should see **PageView**, **Contact** and **Lead**, each marked as received from both *Browser* and *Server* and deduplicated. Remove `META_TEST_EVENT_CODE` afterwards.

What gets sent (only after the visitor taps **Accept** on the cookie banner):

| Event | When | From |
| --- | --- | --- |
| PageView | every page | browser |
| Contact | any WhatsApp button tapped | browser + server |
| Lead | enquiry form saved | browser + server (with hashed phone + first name for matching) |

In Ads Manager, optimise campaigns for **Leads** using this Pixel.

### Next step: "Purchase" when a lead becomes an order

Every lead in Shop Manager keeps its `event_id`, `fbp`, `fbc` and `fbclid`.
When staff convert a lead into a paid order, Shop Manager can send a
**Purchase** event (with the order value) to the Conversions API, so
Instagram ads optimise for paying customers, not just enquiries. This is
planned as a Shop Manager feature.

## 3. Instagram feed on the website

1. <https://developers.facebook.com> → *My Apps → Create app* → type **Business**.
2. Add the product **Instagram** → *API setup with Instagram login*.
3. Add the shop's Instagram account as a tester / connect it, and **generate a token** with the `instagram_business_basic` permission.
4. Exchange it for a **long-lived token** (valid 60 days), as described on that same setup page.
5. In Netlify, add `INSTAGRAM_ACCESS_TOKEN` = the long-lived token and redeploy.

The feed is fetched on every build, so set up the daily build hook (see README). The token must be **refreshed before 60 days** run out (one call to `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=…`). If it expires, the Instagram section simply disappears until a new token is added; the rest of the site keeps working.

## 4. Instagram / Facebook Shop catalog

The site publishes a product feed at **https://paavaiembroidery.com/catalog.xml**, one item per published service that has a price.

1. *Commerce Manager* (<https://business.facebook.com/commerce>) → *Add catalog* → **E-commerce** → *Upload product info*.
2. *Data sources → Data feed → Scheduled feed* → URL `https://paavaiembroidery.com/catalog.xml` → repeat **daily**, currency **INR**.
3. Connect the catalog to the Pixel (*Catalog → Settings → Event sources*).
4. To tag products in Instagram posts, set up the shop under *Commerce Manager → Shops* (Meta reviews eligibility).

Each product needs a real photo (JPG or PNG, at least 500×500). Set `image_url` on each service in Shop Manager. Until then, items use a gallery photo of the same category, or the default image.

## 5. Tagged links

- Instagram bio: `paavaiembroidery.com/ig`
- Story link sticker: `paavaiembroidery.com/ig-story`
- Ads (Ads Manager → *URL parameters*): `utm_source=instagram&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`

The source is saved with every lead in Shop Manager and appended to the
WhatsApp message (e.g. "(via Instagram ad – Diwali bridal)").
