// Everything editable on the site (shop details, gallery, reviews, services)
// is read once per build from Supabase, through public_website_content(),
// which only returns items that are not hidden. Staff edit it at /admin.
//
// The JSON files in src/data/ are the starting content and the fallback for
// local development without internet. A Netlify build never falls back: if
// Supabase can't be reached the build fails, so the last good version stays
// live instead of the sample content.
import localSettings from '../data/settings.json';
import localGallery from '../data/gallery.json';
import localReviews from '../data/reviews.json';
import localServices from '../data/services.json';
import { SHOP_ORG_SLUG, SUPABASE_KEY, SUPABASE_URL } from '../config/supabase';

export type Settings = typeof localSettings;

type Content = {
  settings: Settings;
  gallery: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  services: Record<string, unknown>[];
};

const local: Content = {
  settings: localSettings,
  gallery: (localGallery.items as Record<string, unknown>[]).filter((i) => !i.hidden),
  reviews: (localReviews.reviews as Record<string, unknown>[]).filter((i) => !i.hidden),
  services: (localServices.services as Record<string, unknown>[]).filter((i) => i.show !== false),
};

async function load(): Promise<Content> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_website_content`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_slug: SHOP_ORG_SLUG }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!data.found) throw new Error(`No shop with slug "${SHOP_ORG_SLUG}"`);
    return {
      // Missing keys (e.g. a field added later) keep their local default.
      settings: { ...localSettings, ...data.settings, address: { ...localSettings.address, ...data.settings?.address } },
      gallery: data.gallery,
      reviews: data.reviews,
      services: data.services,
    };
  } catch (err) {
    if (process.env.NETLIFY) throw new Error(`[content] Could not load website content from Supabase: ${err}`);
    console.warn(`[content] Using local sample content (${err}).`);
    return local;
  }
}

export const content = await load();
