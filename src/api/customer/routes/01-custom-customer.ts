export default {
    routes: [
        {
            method: 'PUT',
            path: '/owner/customers/:id',
            handler: 'customer.updateOwner',
            config: {
                auth: false, // Bypass RBAC (verified in controller)
                policies: [], // Add security policies if needed, e.g. 'global::is-owner'
                middlewares: [],
            },
        },
    ],
};

