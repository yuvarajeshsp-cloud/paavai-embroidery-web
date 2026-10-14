// "Publish website" button in /admin: rebuilds the site so the latest
// content from Supabase goes live. Only an active Administrator or Manager of
// the shop may trigger it; the build hook URL stays on the server.
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || 'https://brjosrtzyjorncmjhqhg.supabase.co';
const SUPABASE_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_aHybAGjo0HzjcnHMq1itXw_8WWOa7Y-';
const SHOP_ORG_ID = process.env.PUBLIC_SHOP_ORG_ID || '3fe9ac04-2646-4684-bd1f-ef2b9fcb1413';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Not signed in' });
  const asUser = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` };

  // Row level security only lets a user read their own profile.
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: asUser });
  if (!userRes.ok) return json(401, { error: 'Session expired, please sign in again' });
  const user = await userRes.json();

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(user.id)}&select=role,organization_id,is_active`,
    { headers: asUser },
  );
  const [profile] = profRes.ok ? await profRes.json() : [];
  if (
    !profile ||
    !profile.is_active ||
    profile.organization_id !== SHOP_ORG_ID ||
    !['Administrator', 'Manager'].includes(profile.role)
  ) {
    return json(403, { error: 'Only an Administrator or Manager of the shop can publish' });
  }

  const hook = process.env.BUILD_HOOK_URL;
  if (!hook) return json(503, { error: 'Publishing is not set up (BUILD_HOOK_URL missing)' });
  const build = await fetch(`${hook}?trigger_title=${encodeURIComponent(`Published by ${user.email}`)}`, { method: 'POST' });
  if (!build.ok) return json(502, { error: 'Could not start the update' });

  await fetch(`${SUPABASE_URL}/rest/v1/website_settings?organization_id=eq.${SHOP_ORG_ID}`, {
    method: 'PATCH',
    headers: { ...asUser, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ published_at: new Date().toISOString() }),
  }).catch(() => {});

  return json(200, { ok: true });
};
