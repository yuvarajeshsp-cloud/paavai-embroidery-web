// Anonymous design counters for the shop's Insights tab and the "Most
// popular" sort: page views, ♡ taps and WhatsApp enquiries per design code.
// Only the design code and the kind of action are sent — no cookies, no
// visitor ids — so this runs without the cookie consent. Each action is
// counted once per design per browser tab session.
import { SHOP_ORG_SLUG, SUPABASE_KEY, SUPABASE_URL } from '../config/supabase';

type Kind = 'view' | 'shortlist' | 'enquire';

export function countDesign(code: string, kind: Kind) {
  const key = `paavai-stat:${kind}:${code.toUpperCase()}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    /* storage blocked: count anyway */
  }
  fetch(`${SUPABASE_URL}/rest/v1/rpc/track_design_event`, {
    method: 'POST',
    keepalive: true,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_org_slug: SHOP_ORG_SLUG, p_code: code, p_kind: kind }),
  }).catch(() => {});
}

// WhatsApp links about designs: data-wa="design:PE-0001", or data-codes with
// a comma-separated list (shortlist and collection pages).
export function initStats() {
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[data-wa]');
    if (!a) return;
    const codes = a.dataset.codes
      ? a.dataset.codes.split(',')
      : a.dataset.wa?.startsWith('design:')
        ? [a.dataset.wa.slice(7)]
        : [];
    codes.filter(Boolean).forEach((c) => countDesign(c, 'enquire'));
  });
}
