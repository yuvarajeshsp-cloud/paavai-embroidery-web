// Business details shown across the site. They are edited in the admin page
// (/admin → Shop details), which saves src/data/settings.json; only the name
// and domain are fixed here.
import settings from '../data/settings.json';

const handle = settings.instagram.trim().replace(/^@/, '');

export const site = {
  name: 'Paavai Embroidery',
  nameTa: 'பாவை எம்ப்ராய்டரி',
  domain: 'paavaifashions.com',
  url: 'https://paavaifashions.com',

  logo: settings.logo || null,

  // Digits only, with country code — used to build wa.me links.
  whatsapp: settings.whatsapp.replace(/\D/g, ''),
  phoneDisplay: settings.phone_display,

  instagram: handle,
  facebookUrl: settings.facebook_url || null,
  youtubeUrl: settings.youtube_url || null,
  googleReviewsUrl: settings.google_reviews_url || null,
  googleWriteReviewUrl: settings.google_write_review_url || null,

  address: settings.address,
  showMap: settings.show_map,
  // Google Maps search used for the embedded map.
  mapQuery: settings.map_query,
  // "Get directions" link: the shop's own Google Maps link when set.
  mapsUrl:
    settings.google_maps_url ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.map_query)}`,

  hours: { en: settings.hours_en, ta: settings.hours_ta },
  // For structured data (schema.org openingHours).
  openingHours: settings.opening_hours,
};

export const whatsappLink = (text?: string) =>
  `https://wa.me/${site.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

export const instagramLink = handle ? `https://instagram.com/${handle}` : null;

// Every social profile that is filled in, for links and schema.org sameAs.
export const socialLinks = [
  instagramLink && { name: 'Instagram', url: instagramLink },
  site.facebookUrl && { name: 'Facebook', url: site.facebookUrl },
  site.youtubeUrl && { name: 'YouTube', url: site.youtubeUrl },
  site.googleReviewsUrl && { name: 'Google', url: site.googleReviewsUrl },
].filter(Boolean) as { name: string; url: string }[];
