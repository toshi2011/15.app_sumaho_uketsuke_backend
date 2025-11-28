export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) { },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    // 1. Create Default Store if not exists
    const stores = await strapi.entityService.findMany('api::store.store', {
      limit: 1,
    });

    if (stores.length === 0) {
      console.log('No stores found. Creating default store...');
      try {
        await strapi.entityService.create('api::store.store', {
          data: {
            name: 'Default Store',
            maxCapacity: 20,
            maxGroupsPerSlot: 5,
            defaultDuration: 90,
            phoneNumber: '03-1234-5678',
          },
        });
        console.log('Default store created successfully.');
      } catch (error) {
        console.error('Error creating default store:', error);
      }
    }

    // 2. Grant Permissions to Public Role
    try {
      const publicRole = await strapi
        .query('plugin::users-permissions.role')
        .findOne({ where: { type: 'public' } });

      if (publicRole) {
        const permissions = await strapi
          .query('plugin::users-permissions.permission')
          .findMany({
            where: {
              role: publicRole.id,
              action: {
                $in: [
                  'api::store.store.find',
                  'api::store.store.findOne',
                  'api::store.store.update',
                  'api::store.store.checkAvailability',
                  'api::reservation.reservation.create',
                  'api::reservation.reservation.find', // Needed for checkAvailability service internally? No, service has full access. But frontend might need it?
                ],
              },
            },
          });

        const existingActions = permissions.map((p) => p.action);
        const actionsToAdd = [
          'api::store.store.find',
          'api::store.store.findOne',
          'api::store.store.update',
          'api::store.store.checkAvailability',
          'api::reservation.reservation.create',
        ].filter((action) => !existingActions.includes(action));

        if (actionsToAdd.length > 0) {
          console.log('Granting public permissions:', actionsToAdd);
          await Promise.all(
            actionsToAdd.map((action) =>
              strapi.query('plugin::users-permissions.permission').create({
                data: {
                  action,
                  role: publicRole.id,
                },
              })
            )
          );
          console.log('Permissions granted successfully.');
        }
      }
    } catch (error) {
      console.error('Error granting permissions:', error);
    }
  },
};
