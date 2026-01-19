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

// 値の取得元 (Ticket 01: 不整合追跡用)
export type ConfigSource = 'db' | 'default';

export interface ConfigValue<T> {
    value: T;
    source: ConfigSource;
}

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

    // メタデータ: 各値の取得元 (Ticket 01)
    source: {
        lunchDuration: ConfigSource;
        dinnerDuration: ConfigSource;
        maxDuration: ConfigSource;
        // 必要に応じて拡張
    };
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
    SEAT_SETTINGS: {
        TABLE_DEFAULT_MIN: 2,
        TABLE_DEFAULT_MAX: 4,
        TABLE_DEFAULT_CAPACITY: 4,
        COUNTER_DEFAULT_MIN: 1,
        COUNTER_DEFAULT_MAX: 2,
        COUNTER_DEFAULT_CAPACITY: 1,
        ROOM_DEFAULT_MIN: 3,
        ROOM_DEFAULT_MAX: 8,
        ROOM_DEFAULT_CAPACITY: 8
    }
};

export const StoreConfig = {
    /**
     * 店舗設定を解決する関数
     * DBの値とシステムデフォルト値をマージして、有効な設定オブジェクトを返します。
     * Ticket 01: Strapi 5対応、型変換の徹底、取得元の追跡を追加
     */
    resolve: (store: any): ResolvedStoreConfig => {
        // 1. Strapi 5 Data Normalization (attributesフラット化)
        const safeStore = store ? (store.attributes || store) : {};
        const bh = safeStore.businessHours || {};

        // Helper: Robust Number Conversion with Fallback
        const resolveNum = (val: any, defaultVal: number): { value: number, source: ConfigSource } => {
            if (val === undefined || val === null) {
                return { value: defaultVal, source: 'default' };
            }
            const num = Number(val);
            // 0 is considered invalid for duration in this context logic (based on previous fix),
            // OR if it's NaN.
            if (isNaN(num) || num === 0) {
                return { value: defaultVal, source: 'default' };
            }
            return { value: num, source: 'db' };
        };

        // Helper: Time String to Minutes
        const resolveTime = (val: string | undefined, defaultVal: string): number => {
            return timeToMinutes(val || defaultVal);
        };

        const lunchStartStr = bh.lunch?.start || DEFAULTS.LUNCH_START;
        const lunchEndStr = bh.lunch?.end || safeStore.lunchEndTime || DEFAULTS.LUNCH_END;
        const dinnerStartStr = bh.dinner?.start || DEFAULTS.DINNER_START;
        const dinnerEndStr = bh.dinner?.end || DEFAULTS.DINNER_END;

        // 深夜営業 (日またぎ) の判定ロジック
        let dinnerEndMin = resolveTime(dinnerEndStr, DEFAULTS.DINNER_END);
        const dinnerStartMin = resolveTime(dinnerStartStr, DEFAULTS.DINNER_START);

        // Late Night Logic Validation
        // 数値変換後、もし「終了時間 < 開始時間」かつ「終了時間が昼過ぎではない(例:朝4時まで)」場合は翌日扱い
        // ここでは簡易的に「12:00より前なら翌日」とみなす既存ロジックを踏襲
        if (dinnerEndMin < 12 * 60) {
            dinnerEndMin += 24 * 60;
        }

        // Resolve Durations with Source Tracking
        const lunchDuration = resolveNum(safeStore.lunchDuration, DEFAULTS.LUNCH_DURATION);
        const dinnerDuration = resolveNum(safeStore.dinnerDuration, DEFAULTS.DINNER_DURATION);
        const maxDuration = resolveNum(safeStore.maxDurationLimit, DEFAULTS.MAX_DURATION);

        return {
            lunchDuration: lunchDuration.value,
            dinnerDuration: dinnerDuration.value,
            cleanupDuration: DEFAULTS.CLEANUP, // 固定
            maxDuration: maxDuration.value,

            lunchStartMin: resolveTime(lunchStartStr, DEFAULTS.LUNCH_START),
            lunchEndMin: resolveTime(lunchEndStr, DEFAULTS.LUNCH_END),
            dinnerStartMin: dinnerStartMin,
            dinnerEndMin: dinnerEndMin,

            lastOrderOffset: DEFAULTS.LAST_ORDER_OFFSET,

            rawstore: safeStore,

            // Ticket 01: Metadata
            source: {
                lunchDuration: lunchDuration.source,
                dinnerDuration: dinnerDuration.source,
                maxDuration: maxDuration.source
            }
        };
    },

    /**
     * ヘルパー: 指定された時間(HH:mm)がランチタイムかどうかを判定
     */
    isLunch: (timeStr: string, config: ResolvedStoreConfig): boolean => {
        const min = timeToMinutes(timeStr);
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
