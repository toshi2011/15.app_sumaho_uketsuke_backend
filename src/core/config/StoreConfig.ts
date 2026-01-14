import { timeToMinutes } from '../../utils/timeUtils';

// ==========================================
// 店舗設定 (StoreConfig) 項目説明
// ==========================================
//
// --- 時間設定 (Durations) ---
// lunchDuration      : ランチ平均滞在時間 (分) - ランチタイム予約のデフォルト所要時間
// dinnerDuration     : ディナー平均滞在時間 (分) - ディナータイム予約のデフォルト所要時間
// cleanupDuration    : 片付け時間 (分) - 予約間のバッファ時間 (現在は0固定)
// maxDuration        : 最大滞在時間 (分) - 予約の最大長さ制限
//
// --- 営業時間境界 (Business Hours Boundaries) ---
// lunchStartMin      : ランチ開始時間 (分換算)
// lunchEndMin        : ランチ終了時間 (分換算)
// dinnerStartMin     : ディナー開始時間 (分換算)
// dinnerEndMin       : ディナー終了時間 (分換算)
//
// --- ルール (Rules) ---
// lastOrderOffset    : ラストオーダー前倒し時間 (分) - 閉店時間の何分前まで予約を受け付けるか
//
// ==========================================

// 解決済みの設定値インターフェース
export interface ResolvedStoreConfig {
    // 時間設定
    lunchDuration: number;
    dinnerDuration: number;
    cleanupDuration: number;
    maxDuration: number;

    // 営業時間境界 (分換算)
    lunchStartMin: number;
    lunchEndMin: number;
    dinnerStartMin: number;
    dinnerEndMin: number;

    // ルール
    lastOrderOffset: number;

    // 元の店舗エンティティ (参照用)
    rawstore: any;
}

// システムデフォルト値 (定数定義)
const DEFAULTS = {
    // 時間文字列 (Time Strings)
    LUNCH_START: "11:00",
    LUNCH_END: "15:00",
    DINNER_START: "18:00",
    DINNER_END: "23:00",

    // 所要時間 (分) (Durations)
    LUNCH_DURATION: 60,
    DINNER_DURATION: 75,
    CLEANUP: 0,
    MAX_DURATION: 180,

    // ロジック設定 (Logic)
    LAST_ORDER_OFFSET: 15,

    // 座席設定 (Seat Defaults)
    // 命名規則: [TYPE]_[ID]_[PROPERTY]
    SEAT_SETTINGS: {
        // テーブル席 (Table)
        TABLE_DEFAULT_MIN: 2,      // 最小案内人数
        TABLE_DEFAULT_MAX: 4,      // 最大案内人数
        TABLE_DEFAULT_CAPACITY: 4, // 物理定員

        // カウンター席 (Counter)
        COUNTER_DEFAULT_MIN: 1,
        COUNTER_DEFAULT_MAX: 2, // 1席あたりの最大は1だが、連結ロジック用
        COUNTER_DEFAULT_CAPACITY: 1,

        // 個室 (Private Room / Koshitsu)
        ROOM_DEFAULT_MIN: 3,
        ROOM_DEFAULT_MAX: 8,
        ROOM_DEFAULT_CAPACITY: 8
    }
};

export const StoreConfig = {
    /**
     * 店舗設定を解決する関数
     * DBの値とシステムデフォルト値をマージして、有効な設定オブジェクトを返します。
     */
    resolve: (store: any): ResolvedStoreConfig => {
        const safeStore = store || {};
        const bh = safeStore.businessHours || {};

        // ヘルパー: 時間文字列を分に変換 (デフォルト値付き)
        const resolveTime = (val: string | undefined, defaultVal: string): number => {
            return timeToMinutes(val || defaultVal);
        };

        const lunchStartStr = bh.lunch?.start || DEFAULTS.LUNCH_START;
        const lunchEndStr = bh.lunch?.end || safeStore.lunchEndTime || DEFAULTS.LUNCH_END; // 個別フィールドへのfallback
        const dinnerStartStr = bh.dinner?.start || DEFAULTS.DINNER_START;
        const dinnerEndStr = bh.dinner?.end || DEFAULTS.DINNER_END;

        // 深夜営業 (日またぎ) の判定ロジック
        let dinnerEndMin = resolveTime(dinnerEndStr, DEFAULTS.DINNER_END);
        const dinnerStartMin = resolveTime(dinnerStartStr, DEFAULTS.DINNER_START);
        if (dinnerEndMin < 12 * 60) {
            // 終了時間が早い時間 (例: 02:00) の場合、翌日 (26:00) とみなす
            dinnerEndMin += 24 * 60;
        }

        return {
            lunchDuration: safeStore.lunchDuration ?? DEFAULTS.LUNCH_DURATION,
            dinnerDuration: safeStore.dinnerDuration ?? DEFAULTS.DINNER_DURATION,
            cleanupDuration: DEFAULTS.CLEANUP, // 現在は0に固定 (ビジネス要件)
            maxDuration: safeStore.maxDurationLimit ?? DEFAULTS.MAX_DURATION,

            lunchStartMin: resolveTime(lunchStartStr, DEFAULTS.LUNCH_START),
            lunchEndMin: resolveTime(lunchEndStr, DEFAULTS.LUNCH_END),
            dinnerStartMin: dinnerStartMin,
            dinnerEndMin: dinnerEndMin,

            lastOrderOffset: DEFAULTS.LAST_ORDER_OFFSET,

            rawstore: safeStore
        };
    },

    /**
     * ヘルパー: 指定された時間(HH:mm)がランチタイムかどうかを判定
     */
    isLunch: (timeStr: string, config: ResolvedStoreConfig): boolean => {
        const min = timeToMinutes(timeStr);
        // ランチタイムの範囲内かチェック
        return min >= config.lunchStartMin && min < config.lunchEndMin;
    },

    /**
     * ヘルパー: Configに基づいて、指定時間の標準所要時間を取得
     */
    getStandardDuration: (timeStr: string, config: ResolvedStoreConfig): number => {
        if (StoreConfig.isLunch(timeStr, config)) {
            return config.lunchDuration;
        }
        return config.dinnerDuration;
    }
};
