/**
 * カスタムルート: 店主顧客管理API
 * 顧客メモ（internalNote）の更新を提供
 */

export default {
    routes: [
        {
            method: 'PUT',
            path: '/owner/customers/:id',
            handler: 'owner-customer.update',
            config: {
                policies: [],
                middlewares: [],
                description: '顧客情報更新（メモ等）',
            },
        },
    ],
};
