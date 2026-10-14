// The website shares the Shop Manager Supabase project: content lives in the
// website_settings / website_items tables and the website-media bucket, and
// /admin signs in with a normal Shop Manager account (Administrator or
// Manager of this shop). These values are public (they are shipped to the
// browser for /admin anyway); env vars override them.

export const SUPABASE_URL: string =
  import.meta.env.PUBLIC_SUPABASE_URL || 'https://brjosrtzyjorncmjhqhg.supabase.co';

// Publishable (anon) key: safe in the browser; row level security decides
// what each signed-in user can read and change.
export const SUPABASE_KEY: string =
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_aHybAGjo0HzjcnHMq1itXw_8WWOa7Y-';

// The shop's organization in Shop Manager.
export const SHOP_ORG_SLUG: string = import.meta.env.PUBLIC_SHOP_ORG_SLUG || 'paavai-embroidery';
export const SHOP_ORG_ID: string = import.meta.env.PUBLIC_SHOP_ORG_ID || '3fe9ac04-2646-4684-bd1f-ef2b9fcb1413';

export const MEDIA_BUCKET = 'website-media';
