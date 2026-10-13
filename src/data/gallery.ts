// Gallery photos. To add your own: put the image in public/images/gallery/
// and add a line here. Recommended: square-ish JPG/WebP, about 1200px wide.
// The placeholders (*.svg) can be deleted once real photos are in.

export type GalleryItem = {
  src: string;
  category: 'Bridal' | 'Blouse' | 'Machine' | 'Kids';
  alt_en: string;
  alt_ta: string;
  featured?: boolean;
};

export const categoryLabels: Record<GalleryItem['category'], { en: string; ta: string }> = {
  Bridal: { en: 'Bridal', ta: 'மணப்பெண்' },
  Blouse: { en: 'Blouse', ta: 'பிளவுஸ்' },
  Machine: { en: 'Machine & logos', ta: 'இயந்திரம் & லோகோ' },
  Kids: { en: 'Kids', ta: 'குழந்தைகள்' },
};

export const gallery: GalleryItem[] = [
  { src: '/images/gallery/placeholder-1.svg', category: 'Bridal', alt_en: 'Bridal aari blouse (placeholder)', alt_ta: 'மணப்பெண் ஆரி பிளவுஸ்', featured: true },
  { src: '/images/gallery/placeholder-2.svg', category: 'Blouse', alt_en: 'Designer blouse back neck (placeholder)', alt_ta: 'டிசைனர் பிளவுஸ்', featured: true },
  { src: '/images/gallery/placeholder-3.svg', category: 'Machine', alt_en: 'Computer embroidery logo (placeholder)', alt_ta: 'கம்ப்யூட்டர் எம்ப்ராய்டரி லோகோ', featured: true },
  { src: '/images/gallery/placeholder-4.svg', category: 'Kids', alt_en: 'Kids pattu pavadai (placeholder)', alt_ta: 'குழந்தைகள் பட்டுப் பாவாடை', featured: true },
  { src: '/images/gallery/placeholder-5.svg', category: 'Bridal', alt_en: 'Zardosi sleeve work (placeholder)', alt_ta: 'ஜர்தோசி கை வேலை' },
  { src: '/images/gallery/placeholder-6.svg', category: 'Blouse', alt_en: 'Maggam work blouse (placeholder)', alt_ta: 'மக்கம் வேலை பிளவுஸ்' },
];
