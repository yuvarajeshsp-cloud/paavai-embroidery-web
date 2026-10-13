// Server-side copy of browser events (Conversions API), so ad reporting still
// works when the Pixel is blocked. Only a fixed set of events is accepted.
import { clientInfo, sendMetaEvent } from '../lib/meta.mjs';

const ALLOWED = new Set(['Contact', 'ViewContent']);

export default async (req, context) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!ALLOWED.has(body.event_name) || typeof body.event_id !== 'string') return new Response(null, { status: 422 });

  const str = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : undefined);
  await sendMetaEvent({
    eventName: body.event_name,
    eventId: body.event_id.slice(0, 100),
    eventSourceUrl: str(body.event_source_url, 500),
    userData: { fbp: str(body.fbp, 200), fbc: str(body.fbc, 500), ...clientInfo(req, context) },
  }).catch((err) => console.error('[meta-event]', err));

  return new Response(null, { status: 204 });
};
