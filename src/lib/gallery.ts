// Gallery items are edited in the admin page (/admin → Gallery), which saves
// src/data/gallery.json. Photos and videos are uploaded there too.
import data from '../data/gallery.json';

type Base = {
  category: string;
  caption_en?: string;
  caption_ta?: string;
  featured?: boolean;
  hidden?: boolean;
};

export type GalleryItem =
  | (Base & { type: 'photo'; image: string })
  | (Base & { type: 'video'; video: string; poster?: string })
  | (Base & { type: 'youtube'; url: string })
  | (Base & { type: 'instagram'; url: string; image?: string });

export const gallery = (data.items as GalleryItem[]).filter((i) => !i.hidden);

const labels: Record<string, { en: string; ta: string }> = {
  Bridal: { en: 'Bridal', ta: 'மணப்பெண்' },
  Blouse: { en: 'Blouse', ta: 'பிளவுஸ்' },
  Machine: { en: 'Machine & logos', ta: 'இயந்திரம் & லோகோ' },
  Kids: { en: 'Kids', ta: 'குழந்தைகள்' },
  Other: { en: 'Other', ta: 'மற்றவை' },
};

export const categoryLabel = (category: string, lang: 'en' | 'ta') => labels[category]?.[lang] ?? category;

/** The still image that stands for an item (for the catalog feed and previews). */
export const itemImage = (i: GalleryItem): string | undefined =>
  i.type === 'photo' ? i.image : i.type === 'video' ? i.poster : i.type === 'instagram' ? i.image : undefined;

/** YouTube video id from a watch, share, embed or Shorts link. */
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// Photos uploaded from a phone are often 4–8 MB. On Netlify they are served
// through its image CDN, resized and converted to WebP/AVIF automatically.
// Elsewhere (local preview) the original file is used.
export function sizedImage(src: string, width: number): string {
  if (!import.meta.env.PROD || !process.env.NETLIFY || !src.startsWith('/') || src.endsWith('.svg')) return src;
  return `/.netlify/images?url=${encodeURIComponent(src)}&w=${width}`;
}
