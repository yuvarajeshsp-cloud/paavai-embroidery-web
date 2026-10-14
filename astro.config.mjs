import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://paavaifashions.com',
  trailingSlash: 'ignore',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ta'],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin') && !/\/c\/?$/.test(page),
      i18n: { defaultLocale: 'en', locales: { en: 'en-IN', ta: 'ta-IN' } },
    }),
  ],
});
