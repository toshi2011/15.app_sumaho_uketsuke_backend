/**
 * Menu Item Lifecycle Hooks
 * コースメニューのバリデーションを行う
 */

// バリデーション関数: isCourse=true の場合は duration が必須
const validateCourseDuration = (data: any) => {
    if (data.isCourse === true && !data.duration) {
        throw new Error('コースメニューには滞在時間（duration）の設定が必要です。');
    }
    // duration の範囲チェック（スキーマでも設定しているが念のため）
    if (data.duration && (data.duration < 60 || data.duration > 180)) {
        throw new Error('滞在時間は60分から180分の範囲で設定してください。');
    }
};

export default {
    /**
     * 作成前のバリデーション
     */
    beforeCreate(event: any) {
        const { data } = event.params;
        validateCourseDuration(data);
    },

    /**
     * 更新前のバリデーション
     */
    beforeUpdate(event: any) {
        const { data } = event.params;
        // 部分更新の場合を考慮（isCourseがtrueに変更される場合のみチェック）
        if (data.isCourse === true) {
            validateCourseDuration(data);
        }
    }
};
