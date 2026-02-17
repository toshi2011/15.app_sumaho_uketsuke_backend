/**
 * 店主顧客管理コントローラー
 * 顧客メモ（internalNote）の更新を担当
 * 
 * 3層構造における位置づけ: Layer 3（Service/Controller）
 * - DBからのデータ取得・保存のみ。ビジネスロジックは含まない。
 */

export default {
    /**
     * 顧客情報を更新する（主にinternalNoteの更新用）
     * PUT /api/owner/customers/:id
     * 
     * @param ctx.params.id - 顧客のdocumentId
     * @param ctx.request.body.data.internalNote - 更新するメモ内容
     */
    async update(ctx) {
        const { id } = ctx.params;
        const { data } = ctx.request.body;

        if (!id) {
            return ctx.badRequest('Customer ID is required');
        }

        if (!data) {
            return ctx.badRequest('Update data is required');
        }

        try {
            // documentIdで顧客を検索して存在確認
            const existing = await strapi.documents('api::customer.customer').findOne({
                documentId: id,
            });

            if (!existing) {
                return ctx.notFound('Customer not found');
            }

            // 更新可能なフィールドを制限（セキュリティ対策）
            const allowedFields: Record<string, any> = {};
            if (data.internalNote !== undefined) {
                allowedFields.internalNote = data.internalNote;
            }
            if (data.allergyInfo !== undefined) {
                allowedFields.allergyInfo = data.allergyInfo;
            }
            if (data.preferences !== undefined) {
                allowedFields.preferences = data.preferences;
            }

            if (Object.keys(allowedFields).length === 0) {
                return ctx.badRequest('No valid fields to update');
            }

            // Strapi v5 documents API で更新
            const updated = await strapi.documents('api::customer.customer').update({
                documentId: id,
                data: allowedFields,
            });

            strapi.log.info(`[OwnerCustomer] Updated customer ${id}: fields=${Object.keys(allowedFields).join(',')}`);

            ctx.body = {
                success: true,
                data: {
                    id: updated.id,
                    documentId: updated.documentId,
                    name: updated.name,
                    internalNote: updated.internalNote,
                },
            };
        } catch (error) {
            strapi.log.error('[OwnerCustomer] Update error:', error);
            ctx.internalServerError('Failed to update customer');
        }
    },
};
