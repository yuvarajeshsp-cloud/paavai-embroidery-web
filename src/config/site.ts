// Business details shown across the site. Edit here; every page picks it up.
// Entries marked TODO are placeholders until the real details are known.

export const site = {
  name: 'Paavai Embroidery',
  nameTa: 'பாவை எம்ப்ராய்டரி',
  domain: 'paavaiembroidery.com',
  url: 'https://paavaiembroidery.com',

  // Digits only, with country code — used to build wa.me links.
  whatsapp: '919514588588',
  phoneDisplay: '+91 95145 88588',

  // TODO: real Instagram handle (without @).
  instagram: 'paavaiembroidery',

  // TODO: real address. Set showMap to true once the address is filled in.
  address: {
    line1: 'Shop address line 1',
    line2: 'Area',
    city: 'City',
    state: 'Tamil Nadu',
    pin: '600000',
  },
  showMap: false,
  // Google Maps search used for the embedded map and "Get directions".
  mapQuery: 'Paavai Embroidery',

  hours: {
    en: 'Mon – Sat: 9:30 AM – 8:30 PM · Sunday closed',
    ta: 'திங்கள் – சனி: காலை 9:30 – இரவு 8:30 · ஞாயிறு விடுமுறை',
  },
  // For structured data (schema.org openingHours).
  openingHours: 'Mo-Sa 09:30-20:30',
} as const;

export const whatsappLink = (text?: string) =>
  `https://wa.me/${site.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

export const instagramLink = `https://instagram.com/${site.instagram}`;
