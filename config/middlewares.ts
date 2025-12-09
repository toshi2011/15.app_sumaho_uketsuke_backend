export default [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  {
    name: 'strapi::body',
    config: {
      includeUnparsed: true,
      multipart: true,
      jsonLimit: '10mb',
    },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
