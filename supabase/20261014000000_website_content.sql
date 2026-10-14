/*
# Public website content (paavaifashions.com)

Applied to the Shop Manager Supabase project (Embroidery-Shop-Manager-DB).
The website's /admin page signs in with a normal Shop Manager account.
Nothing in the Shop Manager app uses these tables.

- website_settings: one row per organization; `data` holds the shop details
  and links (logo, phone, Instagram, Google review links, address, hours).
- website_items: gallery photos/videos/links, reviews and services. `kind`
  says which list an item belongs to, `data` holds its fields, `position`
  its order on the page, `hidden` keeps it off the site without deleting it.
- website-media storage bucket: uploaded photos and videos, stored under
  "<organization_id>/...". Public read (the website shows them); only an
  Administrator or Manager of that organization can upload or delete.
- public_website_content(org_slug): what the website reads when it builds.
  Returns visible items only. The tables themselves stay closed to anon.
*/

CREATE TABLE IF NOT EXISTS website_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS website_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('gallery', 'review', 'service')),
  position int NOT NULL DEFAULT 0,
  hidden boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_website_items_org_kind ON website_items(organization_id, kind, position);

DROP TRIGGER IF EXISTS trg_stamp_organization_id ON website_settings;
CREATE TRIGGER trg_stamp_organization_id BEFORE INSERT ON website_settings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_id();
DROP TRIGGER IF EXISTS trg_stamp_organization_id ON website_items;
CREATE TRIGGER trg_stamp_organization_id BEFORE INSERT ON website_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_id();

ALTER TABLE website_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "website_settings_select" ON website_settings FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "website_settings_insert" ON website_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "website_settings_update" ON website_settings FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());

CREATE POLICY "website_items_select" ON website_items FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "website_items_insert" ON website_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "website_items_update" ON website_items FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());
CREATE POLICY "website_items_delete" ON website_items FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager());

-- ============================================================
-- STORAGE
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'website-media', 'website-media', true, 52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "website_media_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'website-media' AND (storage.foldername(name))[1] = public.current_org_id()::text);
CREATE POLICY "website_media_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'website-media' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.is_admin_or_manager());
CREATE POLICY "website_media_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'website-media' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.is_admin_or_manager());
CREATE POLICY "website_media_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'website-media' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.is_admin_or_manager());

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
  WITH org AS (SELECT id FROM organizations WHERE slug = org_slug)
  SELECT jsonb_build_object(
    'found', EXISTS (SELECT 1 FROM org),
    'settings', COALESCE((SELECT s.data FROM website_settings s WHERE s.organization_id = (SELECT id FROM org)), '{}'::jsonb),
    'gallery', COALESCE((SELECT jsonb_agg(i.data ORDER BY i.position, i.created_at) FROM website_items i
                         WHERE i.organization_id = (SELECT id FROM org) AND i.kind = 'gallery' AND NOT i.hidden), '[]'::jsonb),
    'reviews', COALESCE((SELECT jsonb_agg(i.data ORDER BY i.position, i.created_at) FROM website_items i
                         WHERE i.organization_id = (SELECT id FROM org) AND i.kind = 'review' AND NOT i.hidden), '[]'::jsonb),
    'services', COALESCE((SELECT jsonb_agg(i.data ORDER BY i.position, i.created_at) FROM website_items i
                          WHERE i.organization_id = (SELECT id FROM org) AND i.kind = 'service' AND NOT i.hidden), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.public_website_content(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_website_content(text) TO anon, authenticated;
