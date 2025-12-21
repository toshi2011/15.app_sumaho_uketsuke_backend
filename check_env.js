const strapi = require('@strapi/strapi');
const app = strapi().load().then(() => {
    console.log('Database Client:', process.env.DATABASE_CLIENT);
    console.log('Database Filename:', process.env.DATABASE_FILENAME);
    console.log('Database Host:', process.env.DATABASE_HOST);
    process.exit(0);
});
