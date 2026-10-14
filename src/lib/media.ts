import { SUPABASE_URL } from '../config/supabase';

// Photos are served through Netlify's image CDN, resized and converted to
// WebP/AVIF automatically (Supabase URLs are allowed in netlify.toml).
// Elsewhere (local preview) the original file is used.
export function sizedImage(src: string, width: number): string {
  if (!import.meta.env.PROD || !process.env.NETLIFY || src.endsWith('.svg')) return src;
  if (!src.startsWith('/') && !src.startsWith(`${SUPABASE_URL}/storage/`)) return src;
  return `/.netlify/images?url=${encodeURIComponent(src)}&w=${width}`;
}

// Labels for the service categories on the Services page.
const serviceCategories: Record<string, { en: string; ta: string }> = {
  Bridal: { en: 'Bridal', ta: 'மணப்பெண்' },
  Blouse: { en: 'Blouse', ta: 'பிளவுஸ்' },
  Machine: { en: 'Machine & logos', ta: 'இயந்திரம் & லோகோ' },
  Kids: { en: 'Kids', ta: 'குழந்தைகள்' },
  Other: { en: 'Other', ta: 'மற்றவை' },
};

export const categoryLabel = (category: string, lang: 'en' | 'ta') => serviceCategories[category]?.[lang] ?? category;
