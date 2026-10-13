// Saves a website enquiry into Shop Manager (website_leads) and reports it to
// Meta as a "Lead" (only if the visitor accepted cookies).
import { clientInfo, normalizePhone, sendMetaEvent, sha256 } from '../lib/meta.mjs';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const clip = (v, n) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, n) : null;
};

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  // Bots: filled the hidden field, or submitted faster than a person can type.
  // Answer "ok" so they don't retry, but save nothing.
  if (body.website || (typeof body.elapsed_ms === 'number' && body.elapsed_ms < 2500)) {
    return json(200, { ok: true });
  }

  const name = clip(body.name, 80);
  const phone = normalizePhone(body.phone);
  if (!name || phone.length < 10 || phone.length > 15) return json(422, { error: 'Name and phone are required' });

  const attr = body.attribution && typeof body.attribution === 'object' ? body.attribution : {};
  const preferred = /^\d{4}-\d{2}-\d{2}$/.test(body.preferred_date || '') ? body.preferred_date : null;
  const consent = body.consent === true;

  const lead = {
    organization_id: process.env.SHOP_ORG_ID,
    name,
    phone: `+${phone}`,
    service: clip(body.service, 120),
    message: clip(body.message, 1000),
    preferred_date: preferred,
    language: body.language === 'ta' ? 'ta' : 'en',
    source_page: clip(body.source_page, 200),
    utm_source: clip(attr.utm_source, 200),
    utm_medium: clip(attr.utm_medium, 200),
    utm_campaign: clip(attr.utm_campaign, 200),
    utm_content: clip(attr.utm_content, 200),
    fbclid: clip(attr.fbclid, 500),
    // Meta browser ids are only kept when the visitor consented.
    fbp: consent ? clip(body.fbp, 200) : null,
    fbc: consent ? clip(body.fbc, 500) : null,
    event_id: clip(body.event_id, 100),
  };

  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !lead.organization_id) {
    console.error('[enquiry] Supabase is not configured; lead not saved.');
    return json(503, { error: 'Not configured' });
  }

  const res = await fetch(`${url}/rest/v1/website_leads`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(lead),
  });
  if (!res.ok) {
    console.error('[enquiry] Supabase insert failed', res.status, await res.text());
    return json(502, { error: 'Could not save' });
  }

  if (consent) {
    try {
      await sendMetaEvent({
        eventName: 'Lead',
        eventId: lead.event_id,
        eventSourceUrl: clip(body.event_source_url, 500) || undefined,
        userData: {
          ph: [sha256(phone)],
          fn: [sha256(name.split(/\s+/)[0].toLowerCase())],
          country: [sha256('in')],
          fbp: lead.fbp,
          fbc: lead.fbc,
          ...clientInfo(req, context),
        },
        customData: { content_name: lead.service || 'enquiry' },
      });
    } catch (err) {
      // The lead is saved; a Meta outage must not fail the enquiry.
      console.error('[enquiry] Meta event failed', err);
    }
  }

  return json(200, { ok: true });
};
