/*
# 3D blouse preview (paavaifashions.com/design/<code>)

- website_designs.blouse3d: optional settings for the 3D mannequin view of a
  design: neckline (front/back), sleeve length, default fabric colour and up
  to four design images (front right side, back, right sleeve, left sleeve),
  each with its size and position on the panel. Edited in /admin; the images
  (transparent PNG/WebP, watermarked) are in the website-media bucket under
  designs-3d/. NULL = no 3D view.
- public_website_content() now also returns blouse3d for each design.
*/

ALTER TABLE website_designs ADD COLUMN IF NOT EXISTS blouse3d jsonb;

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
                  'available', d.available, 'created_at', d.created_at, 'blouse3d', d.blouse3d) ORDER BY d.position, d.created_at DESC)
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
