/*
# Website design catalogue (paavaifashions.com/designs)

- website_categories: categories and subcategories (parent_id, two levels),
  added by staff in /admin. English + Tamil names, cover photo, order.
- website_designs: one row per design. `code` (PE-0001, PE-0002, ...) is
  given automatically per shop. Price is shown according to price_type:
  fixed (price), from (price), range (price .. price_max) or ask.
  `images` is the list of photo URLs (first = main photo), already
  watermarked by /admin before upload.
- A category with designs or subcategories can't be deleted (ON DELETE
  RESTRICT); hide it instead.
- public_website_content() now also returns visible categories and designs
  (designs in a hidden category, or under a hidden parent, are left out).
- website_media_usage(): storage used, for the meter in /admin.
*/

CREATE TABLE IF NOT EXISTS website_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES website_categories(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  name_en text NOT NULL,
  name_ta text,
  cover_image text,
  position int NOT NULL DEFAULT 0,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, slug),
  CHECK (parent_id IS DISTINCT FROM id)
);

CREATE TABLE IF NOT EXISTS website_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  category_id uuid NOT NULL REFERENCES website_categories(id) ON DELETE RESTRICT,
  title text,
  description text,
  price_type text NOT NULL DEFAULT 'ask' CHECK (price_type IN ('fixed', 'from', 'range', 'ask')),
  price numeric(10,2) CHECK (price IS NULL OR price >= 0),
  price_max numeric(10,2) CHECK (price_max IS NULL OR price_max >= 0),
  images text[] NOT NULL DEFAULT '{}',
  video text,
  tags text[] NOT NULL DEFAULT '{}',
  delivery text,
  featured boolean NOT NULL DEFAULT false,
  available boolean NOT NULL DEFAULT true,
  hidden boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_website_categories_org ON website_categories(organization_id, parent_id, position);
CREATE INDEX IF NOT EXISTS idx_website_designs_org ON website_designs(organization_id, category_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_stamp_organization_id ON website_categories;
CREATE TRIGGER trg_stamp_organization_id BEFORE INSERT ON website_categories
  FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_id();
DROP TRIGGER IF EXISTS trg_stamp_organization_id ON website_designs;
CREATE TRIGGER trg_stamp_organization_id BEFORE INSERT ON website_designs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_id();

-- Design codes: PE-0001, PE-0002, ... per shop. The advisory lock makes two
-- uploads at the same moment take different numbers.
CREATE OR REPLACE FUNCTION public.assign_website_design_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_no int;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('website_design_code:' || NEW.organization_id::text));
    SELECT COALESCE(MAX(NULLIF(substring(code FROM '(\d+)$'), '')::int), 0) + 1 INTO next_no
      FROM website_designs WHERE organization_id = NEW.organization_id;
    NEW.code := 'PE-' || lpad(next_no::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Runs after trg_stamp_organization_id (alphabetical), so organization_id is set.
DROP TRIGGER IF EXISTS trg_t_assign_code ON website_designs;
CREATE TRIGGER trg_t_assign_code BEFORE INSERT ON website_designs
  FOR EACH ROW EXECUTE FUNCTION public.assign_website_design_code();

-- A design's category, and a subcategory's parent, must belong to the same shop.
CREATE OR REPLACE FUNCTION public.check_website_catalogue_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'website_designs' THEN
    IF NOT EXISTS (SELECT 1 FROM website_categories c WHERE c.id = NEW.category_id AND c.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'Category belongs to another shop';
    END IF;
  ELSIF NEW.parent_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM website_categories c WHERE c.id = NEW.parent_id AND c.organization_id = NEW.organization_id AND c.parent_id IS NULL) THEN
      RAISE EXCEPTION 'Parent category must be a top-level category of the same shop';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_u_check_org ON website_designs;
CREATE TRIGGER trg_u_check_org BEFORE INSERT OR UPDATE ON website_designs
  FOR EACH ROW EXECUTE FUNCTION public.check_website_catalogue_org();
DROP TRIGGER IF EXISTS trg_u_check_org ON website_categories;
CREATE TRIGGER trg_u_check_org BEFORE INSERT OR UPDATE ON website_categories
  FOR EACH ROW EXECUTE FUNCTION public.check_website_catalogue_org();

ALTER TABLE website_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "website_categories_select" ON website_categories FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "website_categories_insert" ON website_categories FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "website_categories_update" ON website_categories FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "website_categories_delete" ON website_categories FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager());

CREATE POLICY "website_designs_select" ON website_designs FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "website_designs_insert" ON website_designs FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "website_designs_update" ON website_designs FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "website_designs_delete" ON website_designs FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager());

-- ============================================================
-- PUBLIC READ (website build)
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
  )
  SELECT jsonb_build_object(
    'found', EXISTS (SELECT 1 FROM org),
    'settings', COALESCE((SELECT s.data FROM website_settings s WHERE s.organization_id = (SELECT id FROM org)), '{}'::jsonb),
    'gallery', COALESCE((SELECT jsonb_agg(i.data ORDER BY i.position, i.created_at) FROM website_items i
                         WHERE i.organization_id = (SELECT id FROM org) AND i.kind = 'gallery' AND NOT i.hidden), '[]'::jsonb),
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
                FROM website_designs d
                WHERE d.organization_id = (SELECT id FROM org) AND NOT d.hidden AND cardinality(d.images) > 0
                  AND d.category_id IN (SELECT id FROM cats)), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.public_website_content(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_website_content(text) TO anon, authenticated;

-- Storage used: this shop's website photos, and the whole project (the free
-- plan's 1 GB limit is shared with Shop Manager's order attachments).
CREATE OR REPLACE FUNCTION public.website_media_usage()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.is_admin_or_manager() THEN jsonb_build_object(
    'website_bytes', COALESCE((SELECT sum((o.metadata->>'size')::bigint) FROM storage.objects o
                              WHERE o.bucket_id = 'website-media' AND (storage.foldername(o.name))[1] = public.current_org_id()::text), 0),
    'project_bytes', COALESCE((SELECT sum((o.metadata->>'size')::bigint) FROM storage.objects o), 0)
  ) END;
$$;

REVOKE ALL ON FUNCTION public.website_media_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.website_media_usage() TO authenticated;
