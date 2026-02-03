export default [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      origin: ['*'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'x-store-id'],
      keepHeaderOnError: true,
    },
  },
  'global::store-context',
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
