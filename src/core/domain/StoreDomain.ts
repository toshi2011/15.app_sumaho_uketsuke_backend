import { timeToMinutes } from '../../utils/timeUtils';
import { StoreConfig, ResolvedStoreConfig } from '../config/StoreConfig';

// ==========================================
// StoreDomain - 店舗ビジネスロジック
// ==========================================
//
// このファイルは StoreConfig の設定値を使用して計算を行うロジックを提供します。
// StoreConfig.ts = 設定値（静的データ）の定義・整形
// StoreDomain.ts = 判定ロジック（動的振る舞い）
//
// ビジネスロジック内では、store オブジェクトを直接参照せず、
// このファイルのメソッドを経由することで、一貫性と保守性を確保します。
// ==========================================

/**
 * 正規化されたテーブル設定
 * Strapi v5 の型曖昧さを吸収し、常に有効な値を保証
 */
export interface ResolvedTableConfig {
    id: number;
    documentId?: string;
    name: string;
    type: 'table' | 'counter' | 'private';
    isActive: boolean;
    baseCapacity: number;  // 基本定員
    minCapacity: number;   // 最小人数
    maxCapacity: number;   // 最大人数
}

/**
 * テーブル検証結果
 */
export interface TableValidationResult {
    valid: boolean;
    reason?: string;
    availableTables?: ResolvedTableConfig[];
    counterSeatsRemaining?: Map<number, number>;
}

/**
 * 予約可能スロット
 */
export interface AvailableSlot {
    time: string;
    status: 'AVAILABLE' | 'FULL' | 'CLOSED' | 'LIMITED';
    capacityUsed: number;
    action?: 'proceed' | 'reject' | 'call_store' | 'pending_review';
    reason?: string;
}

/**
 * StoreDomain - 店舗ロジックサービス
 */
export const StoreDomain = {
    /**
     * テーブル情報を正規化し、絶対に undefined にならない値を保証する
     * @param rawTables 生のテーブル配列（store.tables）
     * @returns 正規化されたテーブル設定の配列
     */
    resolveTables: (rawTables: any): ResolvedTableConfig[] => {
        if (!Array.isArray(rawTables)) return [];

        return rawTables.map((t: any) => {
            // Strapi v5 では attributes の中にデータがある場合と、フラットな場合がある
            const attrs = t.attributes || t;

            // 基本定員（必須）- capacity, baseCapacity の順でフォールバック
            const baseCapacity = Number(attrs.baseCapacity || attrs.capacity || 2);

            // 最小・最大（未設定なら適切なデフォルトをフォールバック）
            const minCapacity = Number(attrs.minCapacity || 1);
            const maxCapacity = Number(attrs.maxCapacity || baseCapacity);

            // タイプ判定（カウンターは名前からも推測）
            let tableType: 'table' | 'counter' | 'private' = attrs.type || 'table';
            if (!attrs.type && attrs.name?.includes('カウンター')) {
                tableType = 'counter';
            }

            return {
                id: Number(t.id),
                documentId: t.documentId,
                name: String(attrs.name || 'Unknown Table'),
                type: tableType,
                isActive: attrs.isActive !== false, // デフォルト true
                baseCapacity,
                minCapacity,
                maxCapacity,
            };
        });
    },

    /**
     * 指定人数がテーブルに収容可能かどうかを判定
     * @param table 正規化されたテーブル設定
     * @param guests ゲスト人数
     * @returns 収容可能なら true
     */
    tableFits: (table: ResolvedTableConfig, guests: number): boolean => {
        return guests >= table.minCapacity && guests <= table.maxCapacity;
    },

    /**
     * 優先順位ロジックの隠蔽
     * 人数を渡せば、優先すべきタイプの配列が返る
     * @param guests ゲスト人数
     * @param priorities store.assignmentPriorities (JSON型)
     * @returns 優先順位の配列 ['counter', 'table', 'private'] など
     */
    getPriorityList: (guests: number, priorities: any): string[] => {
        // デフォルト値（人数別）
        let defaultList: string[];
        if (guests <= 2) {
            defaultList = ['counter', 'table', 'private'];
        } else if (guests <= 4) {
            defaultList = ['table', 'private', 'counter'];
        } else {
            defaultList = ['private', 'table'];
        }

        if (!priorities || typeof priorities !== 'object') {
            return defaultList;
        }

        // 設定のマッチングロジック
        for (const key in priorities) {
            const setting = priorities[key];
            if (!setting || !setting.range || !Array.isArray(setting.range)) {
                continue;
            }

            const [min, max] = setting.range;
            const cleanMax = max === null || max === undefined ? 999 : max;

            if (guests >= min && guests <= cleanMax) {
                return setting.priority || defaultList;
            }
        }

        return defaultList;
    },

    /**
     * 指定された時間帯の所要時間を取得
     * @param timeStr 時間文字列 "HH:mm"
     * @param config ResolvedStoreConfig
     * @returns 所要時間（分）
     */
    getDuration: (timeStr: string, config: ResolvedStoreConfig): number => {
        const min = timeToMinutes(timeStr);
        if (min >= config.lunchStartMin && min < config.lunchEndMin) {
            return config.lunchDuration;
        }
        return config.dinnerDuration;
    },

    /**
     * 時間帯がランチかどうかを判定
     * @param timeStr 時間文字列 "HH:mm"
     * @param config ResolvedStoreConfig
     * @returns ランチタイムなら true
     */
    isLunchTime: (timeStr: string, config: ResolvedStoreConfig): boolean => {
        const min = timeToMinutes(timeStr);
        return min >= config.lunchStartMin && min < config.lunchEndMin;
    },

    /**
     * 使用済みテーブルを除いた利用可能テーブルをフィルタリング
     * カウンター席は部分的な空き状況を考慮
     * @param tables 正規化されたテーブル配列
     * @param usedTableIds 使用中テーブルIDのセット（非カウンター用）
     * @param counterUsedSeats カウンター使用席数のマップ
     * @param guests ゲスト人数
     * @returns 利用可能なテーブル配列
     */
    getAvailableTables: (
        tables: ResolvedTableConfig[],
        usedTableIds: Set<number>,
        counterUsedSeats: Map<number, number>,
        guests: number
    ): ResolvedTableConfig[] => {
        return tables.filter(t => {
            if (!t.isActive) return false;

            if (t.type === 'counter') {
                // カウンター: 残席数を確認
                const usedSeats = counterUsedSeats.get(t.id) || 0;
                const remainingSeats = t.maxCapacity - usedSeats;
                return remainingSeats >= guests;
            } else {
                // 非カウンター: 使用中でなければ利用可能
                return !usedTableIds.has(t.id);
            }
        });
    },

    /**
     * ゲスト人数に適合するテーブルをフィルタリング
     * @param tables 利用可能テーブル配列
     * @param guests ゲスト人数
     * @param counterUsedSeats カウンター使用席数のマップ（カウンターの残席計算用）
     * @returns 適合するテーブル配列
     */
    getFittingTables: (
        tables: ResolvedTableConfig[],
        guests: number,
        counterUsedSeats: Map<number, number>
    ): ResolvedTableConfig[] => {
        return tables.filter(t => {
            if (t.type === 'counter') {
                // カウンター: 残席数での判定
                const usedSeats = counterUsedSeats.get(t.id) || 0;
                const remainingSeats = t.maxCapacity - usedSeats;
                return guests >= t.minCapacity && guests <= remainingSeats;
            } else {
                return StoreDomain.tableFits(t, guests);
            }
        });
    },

    /**
     * 緩和条件でゲスト人数に適合するテーブルをフィルタリング
     * Stage 2用: minCapacityを無視し、効率性チェックを適用
     * 厳密マッチ（getFittingTables）で候補が0件の場合にのみ使用
     * 
     * @param tables 利用可能テーブル配列
     * @param guests ゲスト人数
     * @param counterUsedSeats カウンター使用席数のマップ
     * @param config ResolvedStoreConfig（店舗別の閾値設定を含む）
     * @returns 適合するテーブル配列（無駄席数の少ない順にソート済み）
     */
    getLooseFittingTables: (
        tables: ResolvedTableConfig[],
        guests: number,
        counterUsedSeats: Map<number, number>,
        config: ResolvedStoreConfig
    ): ResolvedTableConfig[] => {
        const minEfficiency = config.looseMatchMinEfficiency;
        const maxWastedSeats = config.looseMatchMaxWastedSeats;

        const looseTables = tables.filter(t => {
            if (t.type === 'counter') {
                // カウンターは残席チェックのみ（効率性チェック対象外）
                // ※本来の厳密マッチで弾かれている場合のみここに来るが、
                // カウンターは通常minCapacity=1なので厳密マッチで拾われるはず。
                // ここでは念のため実装しておく。
                const usedSeats = counterUsedSeats.get(t.id) || 0;
                const remainingSeats = t.maxCapacity - usedSeats;
                return guests <= remainingSeats;
            } else {
                // 緩和条件: 最大人数に収まること
                if (guests > t.maxCapacity) return false;

                // 効率性チェック（店舗設定に基づく）
                const efficiency = guests / t.maxCapacity;
                const wastedSeats = t.maxCapacity - guests;

                // 効率が良い、かつ無駄が許容範囲内であればOK
                return efficiency >= minEfficiency && wastedSeats <= maxWastedSeats;
            }
        });

        // 無駄席数が少ない順にソート（最適席を優先）
        // 同じ無駄席数の場合はid順で安定ソート（デバッグ容易性のため）
        return looseTables.sort((a, b) => {
            const wastedA = a.maxCapacity - guests;
            const wastedB = b.maxCapacity - guests;
            if (wastedA !== wastedB) {
                return wastedA - wastedB;
            }
            // 同じ無駄席数ならid順
            return a.id - b.id;
        });
    },

    /**
     * 最適なテーブルを選択（最小容量で収まるものを優先）
     * @param tables テーブル配列
     * @param types 優先タイプ（指定がなければ全て対象）
     * @returns 最適なテーブル、または null
     */
    getBestFit: (tables: ResolvedTableConfig[], types?: string[]): ResolvedTableConfig | null => {
        let filtered = tables;
        if (types && types.length > 0) {
            filtered = tables.filter(t => types.includes(t.type));
        }

        if (filtered.length === 0) return null;

        // 容量昇順でソート（最小容量で収まるものを優先）
        filtered.sort((a, b) => a.maxCapacity - b.maxCapacity);
        return filtered[0];
    },

    /**
     * 営業時間から予約可能な時間スロットを生成
     * フロントエンドで計算していたロジックをバックエンドに集約
     * @param config ResolvedStoreConfig
     * @param date 対象日付 "YYYY-MM-DD"
     * @param store 生の店舗オブジェクト（businessHours取得用）
     * @returns 時間スロット配列 ["11:00", "11:15", ...]
     */
    generateTimeSlots: (config: ResolvedStoreConfig, date: string, store: any): string[] => {
        const businessHours = store?.businessHours;
        if (!businessHours) {
            // フォールバック: デフォルト営業時間
            const slots: string[] = [];
            for (let h = 11; h <= 20; h++) {
                for (let m = 0; m < 60; m += 15) {
                    if (h === 20 && m > 0) break;
                    slots.push(`${h}:${m.toString().padStart(2, '0')}`);
                }
            }
            return slots;
        }

        const d = new Date(date);
        const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];

        // 1. 定休日チェック
        const holidays = businessHours.holidays || [];
        if (holidays.includes(dayOfWeek)) {
            return []; // 定休日
        }

        // 2. 臨時休業チェック
        const irregularHolidays = businessHours.irregularHolidays || [];
        if (irregularHolidays.includes(date)) {
            return []; // 臨時休業
        }

        const slots: string[] = [];

        const addSlots = (start: string, end: string) => {
            if (!start || !end) return;
            const [startH, startM] = start.split(':').map(Number);
            const [endH, endM] = end.split(':').map(Number);

            let currentH = startH;
            let currentM = startM;
            const endTotal = endH * 60 + endM;

            while (true) {
                const currentTotal = currentH * 60 + currentM;
                if (currentTotal >= endTotal) break;

                slots.push(`${currentH}:${currentM.toString().padStart(2, '0')}`);

                currentM += 15;
                if (currentM >= 60) {
                    currentH += 1;
                    currentM = 0;
                }
            }
        };

        // ランチ営業
        const lunch = businessHours.lunch;
        if (lunch && lunch.isEnabled !== false) {
            addSlots(lunch.start || '11:00', lunch.end || '14:00');
        }

        // ディナー営業
        const dinner = businessHours.dinner;
        if (dinner && dinner.isEnabled !== false) {
            addSlots(dinner.start || '17:00', dinner.end || '23:00');
        }

        // 重複排除＆ソート
        return Array.from(new Set(slots)).sort((a, b) => {
            const [Ah, Am] = a.split(':').map(Number);
            const [Bh, Bm] = b.split(':').map(Number);
            return (Ah * 60 + Am) - (Bh * 60 + Bm);
        });
    },

    /**
     * 時間が重なっているかどうかを判定（Overlap検出）
     * @param aStart 予約Aの開始時間（分）
     * @param aEnd 予約Aの終了時間（分）
     * @param bStart 予約Bの開始時間（分）
     * @param bEnd 予約Bの終了時間（分）
     * @returns 重なっている場合 true
     */
    isTimeOverlap: (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean => {
        // 既存予約の開始 < 今回の終了 AND 既存予約の終了 > 今回の開始
        return aStart < bEnd && aEnd > bStart;
    },

    /**
     * コース選択時の滞在時間を取得
     * コースが選択されている場合はコースの duration を優先し、
     * 選択されていない場合は時間帯に応じた StoreConfig のデフォルト時間を使用
     * 
     * @param courseId 選択されたコースのID（documentId または数値ID）、null の場合は席のみ予約
     * @param menuItems 店舗のメニュー項目リスト（isCourse, duration を含む）
     * @param timeStr 予約時間 "HH:mm"
     * @param config ResolvedStoreConfig
     * @returns { duration: number, source: 'course' | 'default', courseName?: string }
     */
    getCourseDuration: (
        courseId: string | number | null,
        menuItems: any[],
        timeStr: string,
        config: ResolvedStoreConfig
    ): { duration: number; source: 'course' | 'default'; courseName?: string } => {
        // コースIDが指定されている場合、該当コースを検索
        if (courseId && menuItems && Array.isArray(menuItems)) {
            const course = menuItems.find((m: any) => {
                // documentId または id でマッチング
                return m.documentId === courseId ||
                    String(m.id) === String(courseId) ||
                    m.id === Number(courseId);
            });

            // コースが見つかり、isCourse=true かつ duration が設定されている場合
            if (course && course.isCourse === true && course.duration) {
                console.log(`[StoreDomain] Using Course Duration: ${course.duration}min (${course.name})`);
                return {
                    duration: Math.min(course.duration, config.maxDuration),
                    source: 'course',
                    courseName: course.name
                };
            }
        }

        // コースが指定されていない or 見つからない場合はデフォルト時間を使用
        const defaultDuration = StoreDomain.getDuration(timeStr, config);
        console.log(`[StoreDomain] Using Default Duration: ${defaultDuration}min (${StoreDomain.isLunchTime(timeStr, config) ? 'lunch' : 'dinner'})`);
        return {
            duration: defaultDuration,
            source: 'default'
        };
    }
};
