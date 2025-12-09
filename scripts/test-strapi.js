const Strapi = require('@strapi/strapi');
console.log('Strapi lib loaded');
try {
  const strapi = Strapi({ distDir: './dist' });
  console.log('Strapi instance created');
  strapi.load().then(() => {
    console.log('Strapi loaded successfully');
    strapi.stop();
    process.exit(0);
  }).catch(e => {
    console.error('Strapi load failed:', e);
    process.exit(1);
  });
} catch (e) {
  console.error('Strapi init failed:', e);
}
