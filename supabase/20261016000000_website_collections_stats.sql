/*
# Private client collections + design insights (paavaifashions.com)

- website_collections: a hand-picked set of designs for one customer
  ("Bridal options for Priya"), opened with an unguessable link
  /c/<token>. It may include designs hidden from the public site.
  Optional expiry; counts how often the link was opened.
  view_collection(token) is the only way the public can read one.

- website_design_stats: anonymous daily counters per design (page views,
  ♡ shortlist taps, WhatsApp enquiries). No visitor data is stored, only
  numbers. Written only through track_design_event(); read by the shop's
  staff (website_design_insights) and, as a popularity score, by the
  website build (public_website_content -> 'popular').
*/

-- ============================================================
-- COLLECTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS website_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- 16 hex characters from a random UUID (about 60 random bits).
  token text NOT NULL UNIQUE DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  title text NOT NULL,
  customer_name text,
  customer_phone text,
  note text,
  design_ids uuid[] NOT NULL DEFAULT '{}',
  show_prices boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  views int NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_website_collections_org ON website_collections(organization_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_stamp_organization_id ON website_collections;
CREATE TRIGGER trg_stamp_organization_id BEFORE INSERT ON website_collections
  FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_id();

ALTER TABLE website_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "website_collections_select" ON website_collections FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "website_collections_insert" ON website_collections FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "website_collections_update" ON website_collections FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "website_collections_delete" ON website_collections FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager());

-- Public read of one collection by its link. p_count = false for the shop's
-- own preview, so it doesn't count as the customer opening it.
CREATE OR REPLACE FUNCTION public.view_collection(p_token text, p_count boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c website_collections;
BEGIN
  SELECT * INTO c FROM website_collections WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RETURN jsonb_build_object('found', false, 'expired', true);
  END IF;
  IF p_count THEN
    UPDATE website_collections SET views = views + 1, last_viewed_at = now() WHERE id = c.id;
  END IF;
  RETURN jsonb_build_object(
    'found', true,
    'title', c.title,
    'customer_name', c.customer_name,
    'note', c.note,
    'show_prices', c.show_prices,
    'expires_at', c.expires_at,
    'designs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', d.code, 'title', d.title, 'description', d.description,
        'price_type', CASE WHEN c.show_prices THEN d.price_type ELSE 'ask' END,
        'price', CASE WHEN c.show_prices THEN d.price END,
        'price_max', CASE WHEN c.show_prices THEN d.price_max END,
        'images', to_jsonb(d.images), 'video', d.video, 'tags', to_jsonb(d.tags), 'delivery', d.delivery,
        'available', d.available,
        -- Only designs that are on the public site get a link to their page.
        'public', NOT d.hidden AND NOT cat.hidden AND NOT COALESCE(par.hidden, false),
        'category_en', cat.name_en, 'category_ta', cat.name_ta,
        'parent_en', par.name_en, 'parent_ta', par.name_ta
      ) ORDER BY array_position(c.design_ids, d.id))
      FROM website_designs d
      JOIN website_categories cat ON cat.id = d.category_id
      LEFT JOIN website_categories par ON par.id = cat.parent_id
      WHERE d.id = ANY (c.design_ids) AND d.organization_id = c.organization_id AND cardinality(d.images) > 0
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.view_collection(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.view_collection(text, boolean) TO anon, authenticated;

-- ============================================================
-- DESIGN STATS
-- ============================================================

CREATE TABLE IF NOT EXISTS website_design_stats (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  design_id uuid NOT NULL REFERENCES website_designs(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT current_date,
  views int NOT NULL DEFAULT 0,
  shortlists int NOT NULL DEFAULT 0,
  enquiries int NOT NULL DEFAULT 0,
  PRIMARY KEY (design_id, day)
);

CREATE INDEX IF NOT EXISTS idx_website_design_stats_org_day ON website_design_stats(organization_id, day);

ALTER TABLE website_design_stats ENABLE ROW LEVEL SECURITY;

-- Read-only for the shop's staff; written only by track_design_event().
CREATE POLICY "website_design_stats_select" ON website_design_stats FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE OR REPLACE FUNCTION public.track_design_event(p_org_slug text, p_code text, p_kind text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d_id uuid;
  o_id uuid;
BEGIN
  IF p_kind NOT IN ('view', 'shortlist', 'enquire') THEN
    RETURN;
  END IF;
  SELECT d.id, d.organization_id INTO d_id, o_id
    FROM website_designs d JOIN organizations o ON o.id = d.organization_id
    WHERE o.slug = p_org_slug AND d.code = upper(p_code);
  IF d_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO website_design_stats (organization_id, design_id, day, views, shortlists, enquiries)
  VALUES (o_id, d_id, current_date,
          (p_kind = 'view')::int, (p_kind = 'shortlist')::int, (p_kind = 'enquire')::int)
  ON CONFLICT (design_id, day) DO UPDATE SET
    views = website_design_stats.views + EXCLUDED.views,
    shortlists = website_design_stats.shortlists + EXCLUDED.shortlists,
    enquiries = website_design_stats.enquiries + EXCLUDED.enquiries;
END;
$$;

REVOKE ALL ON FUNCTION public.track_design_event(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_design_event(text, text, text) TO anon, authenticated;

-- Totals per design since p_since, for the Insights tab (row level security
-- limits it to the caller's shop).
CREATE OR REPLACE FUNCTION public.website_design_insights(p_since date)
RETURNS TABLE (design_id uuid, views bigint, shortlists bigint, enquiries bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.design_id, sum(s.views), sum(s.shortlists), sum(s.enquiries)
  FROM website_design_stats s
  WHERE s.day >= p_since
  GROUP BY s.design_id;
$$;

REVOKE ALL ON FUNCTION public.website_design_insights(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.website_design_insights(date) TO authenticated;

-- ============================================================
-- PUBLIC READ (website build): add popularity scores
-- ============================================================

CREATE OR REPLACE FUNCTION public.public_website_content(org_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH org AS (SELECT id FROM organizations WHERE slug = org_slug),
  cats AS (
    SELECT c.* FROM website_categories c
    LEFT JOIN website_categories p ON p.id = c.parent_id
    WHERE c.organization_id = (SELECT id FROM org) AND NOT c.hidden AND (p.id IS NULL OR NOT p.hidden)
  ),
  vis AS (
    SELECT d.* FROM website_designs d
    WHERE d.organization_id = (SELECT id FROM org) AND NOT d.hidden AND cardinality(d.images) > 0
      AND d.category_id IN (SELECT id FROM cats)
  )
  SELECT jsonb_build_object(
    'found', EXISTS (SELECT 1 FROM org),
    'settings', COALESCE((SELECT s.data FROM website_settings s WHERE s.organization_id = (SELECT id FROM org)), '{}'::jsonb),
    'gallery', '[]'::jsonb,
    'reviews', COALESCE((SELECT jsonb_agg(i.data ORDER BY i.position, i.created_at) FROM website_items i
                         WHERE i.organization_id = (SELECT id FROM org) AND i.kind = 'review' AND NOT i.hidden), '[]'::jsonb),
    'services', COALESCE((SELECT jsonb_agg(i.data ORDER BY i.position, i.created_at) FROM website_items i
                          WHERE i.organization_id = (SELECT id FROM org) AND i.kind = 'service' AND NOT i.hidden), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'id', c.id, 'parent_id', c.parent_id, 'slug', c.slug, 'name_en', c.name_en, 'name_ta', c.name_ta,
                     'cover_image', c.cover_image, 'position', c.position) ORDER BY c.position, c.name_en) FROM cats c), '[]'::jsonb),
    'designs', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'code', d.code, 'category_id', d.category_id, 'title', d.title, 'description', d.description,
                  'price_type', d.price_type, 'price', d.price, 'price_max', d.price_max, 'images', to_jsonb(d.images),
                  'video', d.video, 'tags', to_jsonb(d.tags), 'delivery', d.delivery, 'featured', d.featured,
                  'available', d.available, 'created_at', d.created_at) ORDER BY d.position, d.created_at DESC)
                FROM vis d), '[]'::jsonb),
    -- Last 60 days: views + 5 × shortlists + 10 × enquiries, per design code.
    'popular', COALESCE((SELECT jsonb_object_agg(x.code, x.score) FROM (
                  SELECT d.code, sum(s.views + 5 * s.shortlists + 10 * s.enquiries) AS score
                  FROM website_design_stats s JOIN vis d ON d.id = s.design_id
                  WHERE s.day >= current_date - 60
                  GROUP BY d.code) x WHERE x.score > 0), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.public_website_content(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_website_content(text) TO anon, authenticated;
