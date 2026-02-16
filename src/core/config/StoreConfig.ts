import { timeToMinutes } from '../../utils/timeUtils';

// ==========================================
// 店舗設定 (StoreConfig) 項目説明
// ==========================================
//
// --- Ticket-07: TimeSlot 抽象化 ---
// slots              : 全てのサービス時間枠（モーニング/ランチ/ディナー等）の配列
//                      各枠はid, 開始/終了(分), デフォルト滞在時間, 優先度, 有効フラグを持つ
//
// --- 時間設定 (Durations) --- (後方互換、@deprecated)
// lunchDuration      : ランチ平均滞在時間 (分) → slots[id='lunch'].duration を使用
// dinnerDuration     : ディナー平均滞在時間 (分) → slots[id='dinner'].duration を使用
// cleanupDuration    : 片付け時間 (分) - 予約間のバッファ時間 (現在は0固定)
// maxDuration        : 最大滞在時間 (分) - 予約の最大長さ制限
//
// --- 営業時間境界 (Business Hours Boundaries) --- (後方互換、@deprecated)
// lunchStartMin      : ランチ開始時間 (分換算) → slots[id='lunch'].startMin を使用
// lunchEndMin        : ランチ終了時間 (分換算) → slots[id='lunch'].endMin を使用
// dinnerStartMin     : ディナー開始時間 (分換算) → slots[id='dinner'].startMin を使用
// dinnerEndMin       : ディナー終了時間 (分換算) → slots[id='dinner'].endMin を使用
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

/**
 * Ticket-07: サービス時間枠を表す汎用インターフェース
 * ランチ/ディナーに限定せず、モーニングや将来の時間帯にも対応
 */
export interface TimeSlot {
    /** スロット識別子（'morning', 'lunch', 'dinner' など） */
    id: string;
    /** 表示名（'モーニング', 'ランチ', 'ディナー'） */
    label: string;
    /** 営業開始（0時からの分換算） */
    startMin: number;
    /** 営業終了（0時からの分換算、深夜営業の場合は+1440） */
    endMin: number;
    /** この枠のデフォルト滞在時間（分） */
    duration: number;
    /** true=名前付きスロット（lunch等）、false=base枠。重複時にこちらを優先 */
    isPriority: boolean;
    /** 有効/無効フラグ */
    isEnabled: boolean;
}

/** TimeSlot のラベルマッピング */
const SLOT_LABELS: Record<string, string> = {
    base: '通し営業',
    morning: 'モーニング',
    lunch: 'ランチ',
    dinner: 'ディナー',
};

// 解決済みの設定値インターフェース
export interface ResolvedStoreConfig {
    // Ticket-07: TimeSlot 配列（新規・推奨）
    /** 全サービス時間枠の配列。新規コードはこちらを使用すること */
    slots: TimeSlot[];

    // --- 後方互換フィールド（@deprecated） ---
    /** @deprecated slots[id='lunch'].duration を使用してください */
    lunchDuration: number;
    /** @deprecated slots[id='dinner'].duration を使用してください */
    dinnerDuration: number;
    cleanupDuration: number;
    maxDuration: number;

    /** @deprecated slots[id='lunch'].startMin を使用してください */
    lunchStartMin: number;
    /** @deprecated slots[id='lunch'].endMin を使用してください */
    lunchEndMin: number;
    /** @deprecated slots[id='dinner'].startMin を使用してください */
    dinnerStartMin: number;
    /** @deprecated slots[id='dinner'].endMin を使用してください */
    dinnerEndMin: number;

    // ルール
    lastOrderOffset: number;
    bookingAcceptanceMode: 'auto' | 'manual';
    rejectionStrategy: 'auto_reject' | 'call_request';

    // 緩和マッチ設定 (Loose Matching)
    looseMatchMinEfficiency: number;
    looseMatchMaxWastedSeats: number;

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
    MORNING_START: "07:00",
    MORNING_END: "10:00",
    LUNCH_START: "11:00",
    LUNCH_END: "15:00",
    DINNER_START: "18:00",
    DINNER_END: "23:00",

    // 所要時間 (分) (Durations)
    MORNING_DURATION: 45,
    LUNCH_DURATION: 60,
    DINNER_DURATION: 75,
    CLEANUP: 0,
    MAX_DURATION: 180,

    // ロジック設定 (Logic)
    LAST_ORDER_OFFSET: 15,

    // 緩和マッチング設定 (Loose Matching)
    // 厳密マッチ（minCapacity条件）が失敗した場合のフォールバック用
    LOOSE_MATCH_MIN_EFFICIENCY: 0.5,     // 最小効率 (50%) - 席の半分以上埋まること
    LOOSE_MATCH_MAX_WASTED_SEATS: 2,     // 最大許容空席数

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

        // Resolve Loose Match Settings (緩和マッチ設定)
        // 店舗DBに設定があればそれを使用、なければデフォルト値
        const looseMatchMinEfficiency = resolveNum(
            safeStore.looseMatchMinEfficiency,
            DEFAULTS.LOOSE_MATCH_MIN_EFFICIENCY
        );
        const looseMatchMaxWastedSeats = resolveNum(
            safeStore.looseMatchMaxWastedSeats,
            DEFAULTS.LOOSE_MATCH_MAX_WASTED_SEATS
        );

        // === Ticket-07: TimeSlot 配列の生成 ===
        const lunchStartMinVal = resolveTime(lunchStartStr, DEFAULTS.LUNCH_START);
        const lunchEndMinVal = resolveTime(lunchEndStr, DEFAULTS.LUNCH_END);

        const slots: TimeSlot[] = [];

        // Ticket-10: 基本営業時間（通し営業）
        // isPriority: false とし、morning/lunch/dinner と重複する時間帯では名前付きスロットを優先
        if (bh.base && bh.base.isEnabled) {
            const baseStartStr = bh.base.start || '08:00';
            const baseEndStr = bh.base.end || '22:00';
            const baseDuration = resolveNum(
                safeStore.baseDuration || bh.base.duration,
                DEFAULTS.LUNCH_DURATION  // 通し営業のデフォルトはランチ相当
            );
            slots.push({
                id: 'base',
                label: SLOT_LABELS['base'] || '通し営業',
                startMin: resolveTime(baseStartStr, '08:00'),
                endMin: resolveTime(baseEndStr, '22:00'),
                duration: baseDuration.value,
                isPriority: false,
                isEnabled: true,
            });
        }

        // モーニング（businessHoursに morning キーがある場合のみ生成）
        if (bh.morning) {
            const morningStartStr = bh.morning.start || DEFAULTS.MORNING_START;
            const morningEndStr = bh.morning.end || DEFAULTS.MORNING_END;
            const morningDuration = resolveNum(
                safeStore.morningDuration || bh.morning.duration,
                DEFAULTS.MORNING_DURATION
            );
            slots.push({
                id: 'morning',
                label: SLOT_LABELS['morning'] || 'モーニング',
                startMin: resolveTime(morningStartStr, DEFAULTS.MORNING_START),
                endMin: resolveTime(morningEndStr, DEFAULTS.MORNING_END),
                duration: morningDuration.value,
                isPriority: true,
                isEnabled: bh.morning.isEnabled !== false,
            });
        }

        // ランチ（デフォルトで生成。businessHoursにlunchキーがない場合もデフォルト値で生成）
        const lunchIsEnabled = bh.lunch ? bh.lunch.isEnabled !== false : true;
        slots.push({
            id: 'lunch',
            label: SLOT_LABELS['lunch'] || 'ランチ',
            startMin: lunchStartMinVal,
            endMin: lunchEndMinVal,
            duration: lunchDuration.value,
            isPriority: true,
            isEnabled: lunchIsEnabled,
        });

        // ディナー（デフォルトで生成。businessHoursにdinnerキーがない場合もデフォルト値で生成）
        const dinnerIsEnabled = bh.dinner ? bh.dinner.isEnabled !== false : true;
        slots.push({
            id: 'dinner',
            label: SLOT_LABELS['dinner'] || 'ディナー',
            startMin: dinnerStartMin,
            endMin: dinnerEndMin,
            duration: dinnerDuration.value,
            isPriority: true,
            isEnabled: dinnerIsEnabled,
        });

        return {
            // Ticket-07: TimeSlot 配列（推奨）
            slots,

            // 後方互換フィールド（@deprecated）
            lunchDuration: lunchDuration.value,
            dinnerDuration: dinnerDuration.value,
            cleanupDuration: DEFAULTS.CLEANUP, // 固定
            maxDuration: maxDuration.value,

            lunchStartMin: lunchStartMinVal,
            lunchEndMin: lunchEndMinVal,
            dinnerStartMin: dinnerStartMin,
            dinnerEndMin: dinnerEndMin,

            lastOrderOffset: DEFAULTS.LAST_ORDER_OFFSET,
            bookingAcceptanceMode: safeStore.bookingAcceptanceMode || 'manual',
            rejectionStrategy: safeStore.rejectionStrategy || 'auto_reject',

            // 緩和マッチ設定
            looseMatchMinEfficiency: looseMatchMinEfficiency.value,
            looseMatchMaxWastedSeats: looseMatchMaxWastedSeats.value,

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
     * Ticket-07: 指定時刻がどの有効なTimeSlotに属するか判定する
     * 複数該当時は isPriority=true の枠を優先
     * @param timeStr 時間文字列 "HH:mm"
     * @param config ResolvedStoreConfig
     * @returns 該当するTimeSlot、またはnull（どの枠にも属さない場合）
     */
    resolveSlot: (timeStr: string, config: ResolvedStoreConfig): TimeSlot | null => {
        const min = timeToMinutes(timeStr);
        // 有効なスロットのみ検索
        const enabledSlots = config.slots.filter(s => s.isEnabled);

        // まず isPriority=true のスロットからマッチを探す
        const priorityMatch = enabledSlots.find(
            s => s.isPriority && min >= s.startMin && min < s.endMin
        );
        if (priorityMatch) return priorityMatch;

        // 次に isPriority=false のスロットからマッチを探す
        const baseMatch = enabledSlots.find(
            s => !s.isPriority && min >= s.startMin && min < s.endMin
        );
        return baseMatch || null;
    },

    /**
     * ヘルパー: 指定された時間(HH:mm)がランチタイムかどうかを判定
     * Ticket-07: 内部実装をslotsベースに変更（シグネチャ維持、後方互換）
     */
    isLunch: (timeStr: string, config: ResolvedStoreConfig): boolean => {
        const slot = StoreConfig.resolveSlot(timeStr, config);
        return slot?.id === 'lunch';
    },

    /**
     * ヘルパー: Configに基づいて、指定時間の標準所要時間を取得
     * Ticket-07: 内部実装をslotsベースに変更（シグネチャ維持、後方互換）
     */
    getStandardDuration: (timeStr: string, config: ResolvedStoreConfig): number => {
        const slot = StoreConfig.resolveSlot(timeStr, config);
        if (slot) {
            return slot.duration;
        }
        // どのスロットにも属さない場合はディナーdurationにフォールバック
        return config.dinnerDuration;
    }
};
