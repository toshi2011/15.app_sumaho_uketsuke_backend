import { timeToMinutes } from '../../utils/timeUtils';
import { StoreConfig, ResolvedStoreConfig, TimeSlot } from '../config/StoreConfig';

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
    /** Ticket-09: 該当する営業スロットのID（例: 'lunch', 'dinner', 'morning'） */
    slotId?: string;
    /** Ticket-09: 該当する営業スロットの表示名（例: 'ランチ', 'ディナー'） */
    slotLabel?: string;
}

/**
 * 営業時間判定結果
 */
export interface BusinessHourValidationResult {
    valid: boolean;
    reason?: string;
    action?: 'reject' | 'call_store';
    minutes?: {
        start: number;
        end: number;
        close: number;
    };
}

/**
 * 占有率計算結果
 */
export interface OccupancyResult {
    usedTableIds: Set<number>;
    counterUsedSeats: Map<number, number>;
    unassignedCount: number;
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
     * Ticket-07: 指定時刻がどのTimeSlotに属するか判定
     * 複数該当時はisPriority=true の枠を優先
     * @param slots TimeSlot配列
     * @param timeMin 時刻（分換算）
     * @returns 該当するTimeSlot、またはnull
     */
    resolveSlotForTime: (slots: TimeSlot[], timeMin: number): TimeSlot | null => {
        // 有効なスロットのみ検索
        const enabledSlots = slots.filter(s => s.isEnabled);

        // まず isPriority=true のスロットからマッチを探す
        const priorityMatch = enabledSlots.find(
            s => s.isPriority && timeMin >= s.startMin && timeMin < s.endMin
        );
        if (priorityMatch) return priorityMatch;

        // 次に isPriority=false のスロットからマッチを探す
        const baseMatch = enabledSlots.find(
            s => !s.isPriority && timeMin >= s.startMin && timeMin < s.endMin
        );
        return baseMatch || null;
    },

    /**
     * Ticket-08: 指定時刻がどのサービス時間枠に属するかを判定する（高レベルAPI）
     * resolveSlotForTime の便利ラッパー。時間文字列とconfigを受け取り、
     * 内部で分換算とslots抽出を行う。
     *
     * 優先順位: 重複している場合、isPriority: true（特定の食事時間帯）の設定を優先する
     * （例：BaseとLunchが重なっていたらLunchの設定を採用）
     *
     * @param time 時間文字列 "HH:mm"
     * @param config ResolvedStoreConfig
     * @returns 該当するTimeSlot、またはnull（どの営業枠にも属さない場合）
     */
    getApplicableSlot: (time: string, config: ResolvedStoreConfig): TimeSlot | null => {
        const min = timeToMinutes(time);
        return StoreDomain.resolveSlotForTime(config.slots, min);
    },

    /**
     * 指定された時間帯の所要時間を取得
     * Ticket-07: slotsベースに変更。該当スロットのdurationを返す
     * @param timeStr 時間文字列 "HH:mm"
     * @param config ResolvedStoreConfig
     * @returns 所要時間（分）
     */
    getDuration: (timeStr: string, config: ResolvedStoreConfig): number => {
        const min = timeToMinutes(timeStr);
        const slot = StoreDomain.resolveSlotForTime(config.slots, min);
        if (slot) {
            return slot.duration;
        }
        // フォールバック: どのスロットにも属さない場合はdinnerDuration
        return config.dinnerDuration;
    },

    /**
     * 時間帯がランチかどうかを判定
     * @deprecated Ticket-08: getApplicableSlot() を使用し、slot.id === 'lunch' で判定してください
     * @param timeStr 時間文字列 "HH:mm"
     * @param config ResolvedStoreConfig
     * @returns ランチタイムなら true
     */
    isLunchTime: (timeStr: string, config: ResolvedStoreConfig): boolean => {
        const slot = StoreDomain.getApplicableSlot(timeStr, config);
        return slot?.id === 'lunch';
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
     * Ticket-07: config.slots ベースに変更。lunch/dinner固定ロジックを廃止
     * @param config ResolvedStoreConfig
     * @param date 対象日付 "YYYY-MM-DD"
     * @param store 生の店舗オブジェクト（businessHours取得用）
     * @returns 時間スロット配列 ["11:00", "11:15", ...]
     */
    generateTimeSlots: (config: ResolvedStoreConfig, date: string, store: any): string[] => {
        const businessHours = store?.businessHours;

        // 1. 定休日チェック
        if (businessHours) {
            const d = new Date(date);
            const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];

            const holidays = businessHours.holidays || [];
            if (holidays.includes(dayOfWeek)) {
                return []; // 定休日
            }

            // 2. 臨時休業チェック
            const irregularHolidays = businessHours.irregularHolidays || [];
            if (irregularHolidays.includes(date)) {
                return []; // 臨時休業
            }
        }

        const slots: string[] = [];

        // 分換算の開始/終了から15分間隔でスロットを生成するヘルパー
        const addSlotsFromMinutes = (startMin: number, endMin: number) => {
            let currentMin = startMin;
            while (currentMin < endMin) {
                // 深夜営業（1440超え）の場合は実時間に戻す
                const displayMin = currentMin >= 1440 ? currentMin - 1440 : currentMin;
                const h = Math.floor(displayMin / 60);
                const m = displayMin % 60;
                slots.push(`${h}:${m.toString().padStart(2, '0')}`);
                currentMin += 15;
            }
        };

        // config.slots から有効なスロットの時間を生成
        const enabledSlots = config.slots.filter(s => s.isEnabled);

        if (enabledSlots.length === 0) {
            // フォールバック: 有効スロットがない場合はデフォルト営業時間
            for (let h = 11; h <= 20; h++) {
                for (let m = 0; m < 60; m += 15) {
                    if (h === 20 && m > 0) break;
                    slots.push(`${h}:${m.toString().padStart(2, '0')}`);
                }
            }
            return slots;
        }

        for (const slot of enabledSlots) {
            addSlotsFromMinutes(slot.startMin, slot.endMin);
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
        let course: any = null;
        if (courseId && menuItems && Array.isArray(menuItems)) {
            course = menuItems.find((m: any) => {
                // documentId または id でマッチング
                return m.documentId === courseId ||
                    String(m.id) === String(courseId) ||
                    m.id === Number(courseId);
            });
        }

        if (course) {
            // type === 'course' 優先、なければ isCourse (後方互換)
            const isCourse = course.type === 'course' || (course.isCourse === true && course.type !== 'display_only');

            // コースとして有効かつdurationがある場合
            if (isCourse && course.duration) {
                console.log(`[StoreDomain] Using Course Duration: ${course.duration}min (${course.name})`);
                return {
                    duration: Math.min(course.duration, config.maxDuration),
                    source: 'course',
                    courseName: course.name
                };
            }

            // display_only または duration未設定の場合
            // 時間はデフォルトを使うが、コース名(メニュー名)は保持する
            const defaultDuration = StoreDomain.getDuration(timeStr, config);
            return {
                duration: defaultDuration,
                source: 'default',
                courseName: course.name
            };
        }

        // コースが指定されていない or 見つからない場合はデフォルト時間を使用
        const defaultDuration = StoreDomain.getDuration(timeStr, config);
        // Ticket-09: isLunchTime(deprecated) → getApplicableSlot に変更
        const slot = StoreDomain.getApplicableSlot(timeStr, config);
        console.log(`[StoreDomain] Using Default Duration: ${defaultDuration}min (${slot?.label || 'unknown'})`);
        return {
            duration: defaultDuration,
            source: 'default'
        };
    },

    /**
     * Ticket-09: メニューのserviceTypeから対応するスロットIDの配列を返す
     * 
     * マッピングルール:
     *   'day'     → ['lunch', 'morning']  （昼間限定メニュー）
     *   'night'   → ['dinner']            （夜限定メニュー）
     *   'common'  → null                  （全時間帯で利用可能 → チェック不要）
     *   undefined → null                  （未設定の場合も全時間帯OK）
     * 
     * ⚠ 運用上の注意:
     * Baseスロット（id='base'）のみで運用する店舗の場合、
     * 'day'/'night' のメニューは提供不可と判定される。
     * → Baseスロットのみの店舗では、メニューの serviceType を 'common' に設定する運用が必要。
     * 将来、Baseスロットの時刻ベース救済判定（17:00前=day OK等）を実装する場合は
     * ここを拡張すること。
     * 
     * @param serviceType メニューのserviceType
     * @returns 許可されるスロットIDの配列、またはnull（全スロットで利用可能）
     */
    mapServiceTypeToSlotIds: (serviceType: string | undefined | null): string[] | null => {
        if (!serviceType || serviceType === 'common') return null;
        if (serviceType === 'day') return ['lunch', 'morning'];
        if (serviceType === 'night') return ['dinner'];
        return null; // 未知のserviceTypeは許可
    },

    /**
     * コースの利用条件（人数制限・提供時間帯）を検証する
     * Ticket-09: serviceType による提供時間帯チェックを追加
     * 
     * @param courseId コースID
     * @param menuItems メニュー配列
     * @param guests 人数
     * @param timeStr 予約時間 "HH:mm"（serviceType検証に使用）
     * @param config ResolvedStoreConfig（serviceType検証に使用）
     * @returns { valid: boolean, reason?: string }
     */
    validateCourseRequirements: (
        courseId: string | number | null,
        menuItems: any[],
        guests: number,
        timeStr?: string,
        config?: ResolvedStoreConfig
    ): { valid: boolean; reason?: string } => {
        if (!courseId || !menuItems) return { valid: true };

        const course = menuItems.find((m: any) => {
            return m.documentId === courseId ||
                String(m.id) === String(courseId) ||
                m.id === Number(courseId);
        });

        if (!course) return { valid: true };

        // minGuests チェック
        // type='course' (または isCourse=true) の場合のみ有効とする仕様
        const isCourse = course.type === 'course' || (course.isCourse === true && course.type !== 'display_only');

        if (isCourse && course.minGuests && guests < course.minGuests) {
            return {
                valid: false,
                reason: `このコースは${course.minGuests}名様から承ります。（現在${guests}名）`
            };
        }

        // Ticket-09: serviceType による提供時間帯チェック
        // timeStr と config が提供された場合のみ実行（後方互換のためオプショナル）
        if (timeStr && config && course.serviceType) {
            const allowedSlotIds = StoreDomain.mapServiceTypeToSlotIds(course.serviceType);
            if (allowedSlotIds !== null) {
                // serviceTypeが 'day' or 'night' → スロットIDマッチングが必要
                const currentSlot = StoreDomain.getApplicableSlot(timeStr, config);
                const currentSlotId = currentSlot?.id || null;

                if (!currentSlotId || !allowedSlotIds.includes(currentSlotId)) {
                    // ⚠ Baseスロット運用の店舗では、serviceType='day'/'night'のメニューは
                    // ここで弾かれる。運用上 'common' にするか、個別スロットを設定すること。
                    const serviceLabel = course.serviceType === 'day' ? '昼' : '夜';
                    return {
                        valid: false,
                        reason: `「${course.name}」は${serviceLabel}の時間帯のみ提供可能です。`
                    };
                }
            }
        }

        return { valid: true };
    },

    /**
     * 予約時間が営業時間内に収まるか判定する
     * Ticket-07: slotsベースに変更。ランチ/ディナー固定判定を廃止
     * 
     * @param timeStr 開始時間 "HH:mm"
     * @param duration 滞在時間（分）
     * @param config ResolvedStoreConfig
     * @returns BusinessHourValidationResult
     */
    /**
     * 予約時間が営業時間内に収まるか判定する
     * Ticket-07: slotsベースに変更。ランチ/ディナー固定判定を廃止
     * Improved: 連続するスロットを結合して判定（モーニング→ベース等のまたぎ予約を許可）
     * 
     * @param timeStr 開始時間 "HH:mm"
     * @param duration 滞在時間（分）
     * @param config ResolvedStoreConfig
     * @returns BusinessHourValidationResult
     */
    canFitInBusinessHours: (
        timeStr: string,
        duration: number,
        config: ResolvedStoreConfig
    ): BusinessHourValidationResult => {
        const startMin = timeToMinutes(timeStr);
        // 深夜営業対応: ランチ開始より前なら翌日扱い（既存ロジック踏襲）
        let adjustedStart = startMin;
        // 有効スロットの最小startMinを取得して深夜判定に使用
        const enabledSlots = config.slots.filter(s => s.isEnabled);
        const minSlotStart = enabledSlots.length > 0
            ? Math.min(...enabledSlots.map(s => s.startMin))
            : config.lunchStartMin; // フォールバック
        const maxSlotEnd = enabledSlots.length > 0
            ? Math.max(...enabledSlots.map(s => s.endMin))
            : config.dinnerEndMin; // フォールバック

        if (maxSlotEnd > 1440 && startMin < minSlotStart) {
            adjustedStart += 1440;
        }

        // まず、開始時間がどのスロットに含まれるか判定（従来通り）
        // これは「開始可能か」の判定と、ランチLOなどの属性チェック用
        const matchedSlot = StoreDomain.resolveSlotForTime(enabledSlots, adjustedStart);

        if (!matchedSlot) {
            // 営業時間外: 有効スロットの一覧を表示
            const slotDescriptions = enabledSlots.map(s => {
                const startH = Math.floor(s.startMin / 60);
                const startM = s.startMin % 60;
                const endMinNorm = s.endMin > 1440 ? s.endMin - 1440 : s.endMin;
                const endH = Math.floor(endMinNorm / 60);
                const endM = endMinNorm % 60;
                return `${s.label}: ${startH}:${startM.toString().padStart(2, '0')}~${endH}:${endM.toString().padStart(2, '0')}`;
            }).join(', ');

            return {
                valid: false,
                reason: `営業時間外です。${slotDescriptions}`,
                action: 'reject'
            };
        }

        // --- 終了時間の判定ロジック改善 ---
        // 単一スロットの endMin ではなく、連続・重複して繋がっているスロットの「実質的な閉店時間」を探す
        // 例: Morning(8-10) -> Base(8-22) の場合、実質閉店は22時

        let effectiveCloseMin = matchedSlot.endMin;

        // 探索済みスロットID（無限ループ防止）
        const visitedSlots = new Set<string>([matchedSlot.id]);
        let changed = true;

        while (changed) {
            changed = false;
            // 現在の effectiveCloseMin に接する、または包含するスロットを探して拡張する
            // 条件: スロットの開始 <= 現在の終了 (つながっている) かつ スロットの終了 > 現在の終了 (拡張できる)
            for (const slot of enabledSlots) {
                if (visitedSlots.has(slot.id)) continue;

                // スロットが現在の有効範囲と重なっているか、接しているか
                // Slot Start <= Current End
                if (slot.startMin <= effectiveCloseMin) {
                    if (slot.endMin > effectiveCloseMin) {
                        effectiveCloseMin = slot.endMin;
                        visitedSlots.add(slot.id);
                        changed = true;
                    }
                }
            }
        }

        const closeMin = effectiveCloseMin;
        const endMin = adjustedStart + duration;
        const endWithBuffer = endMin + config.cleanupDuration;

        console.log(`[StoreDomain] BusinessHour Check: Start=${adjustedStart}, End=${endWithBuffer}, EffectiveClose=${closeMin} (Started in ${matchedSlot.label})`);

        // 終了時間チェック: 予約終了時間（+片付け）が実質閉店時間を超えてはいけない
        if (endWithBuffer > closeMin) {
            const maxPossibleDuration = closeMin - adjustedStart - config.cleanupDuration;
            const closeMinNorm = closeMin > 1440 ? closeMin - 1440 : closeMin;
            const closeTimeStr = `${Math.floor(closeMinNorm / 60).toString().padStart(2, '0')}:${(closeMinNorm % 60).toString().padStart(2, '0')}`;

            return {
                valid: false,
                reason: `閉店時間を超過します（閉店: ${closeTimeStr}）。最大利用可能時間: ${maxPossibleDuration}分`,
                action: 'reject',
                minutes: {
                    start: adjustedStart,
                    end: endWithBuffer,
                    close: closeMin
                }
            };
        }

        // ラストオーダーチェック（ランチスロットのみ適用、既存仕様維持）
        // ※開始時間の属するスロットがランチの場合のみ適用
        if (matchedSlot.id === 'lunch' && config.lastOrderOffset > 0) {
            // ランチの場合は、ランチ固有の終わり（matchedSlot.endMin）を基準にするべきか、
            // それとも実質終了時間を基準にするべきか？
            // 一般的にランチLOはランチタイムの終わりに対するものなので、matchedSlot.endMinを使用
            const lunchEnd = matchedSlot.endMin;
            const lastOrderLimit = lunchEnd - config.lastOrderOffset;

            if (adjustedStart > lastOrderLimit) {
                const limitStr = `${Math.floor(lastOrderLimit / 60)}:${(lastOrderLimit % 60).toString().padStart(2, '0')}`;
                return {
                    valid: false,
                    reason: `ランチのラストオーダー(${limitStr})を過ぎています。`,
                    action: 'reject'
                };
            }
        }

        return {
            valid: true,
            minutes: {
                start: adjustedStart,
                end: endWithBuffer,
                close: closeMin
            }
        };
    },

    /**
     * 指定時間帯の占有状況を計算する
     * 重複予約を特定し、使用済みテーブルIDとカウンター席数を集計する
     * 
     * @param allReservations 日付単位の全予約リスト
     * @param activeTables 店舗のアクティブなテーブル設定
     * @param targetStartMin ターゲット開始時間（分）
     * @param targetEndMin ターゲット終了時間（分）
     * @param config ResolvedStoreConfig
     * @returns OccupancyResult
     */
    calculateOccupancy: (
        allReservations: any[],
        activeTables: ResolvedTableConfig[],
        targetStartMin: number,
        targetEndMin: number,
        config: ResolvedStoreConfig
    ): OccupancyResult => {
        const usedTableIds = new Set<number>();
        const counterUsedSeats = new Map<number, number>();
        let unassignedCount = 0;

        // 重複する予約をフィルタリング
        const overlappingReservations = allReservations.filter((res) => {
            let resStart = timeToMinutes(res.time);
            if (resStart === -1) return false;

            // 深夜対応
            const enabledSlots = config.slots.filter(s => s.isEnabled);
            const minSlotStart = enabledSlots.length > 0
                ? Math.min(...enabledSlots.map(s => s.startMin))
                : config.lunchStartMin;
            const maxSlotEnd = enabledSlots.length > 0
                ? Math.max(...enabledSlots.map(s => s.endMin))
                : config.dinnerEndMin;

            if (maxSlotEnd > 1440 && resStart < minSlotStart) {
                resStart += 1440;
            }

            // Ticket-07: スロットベースでduration決定
            const rSlot = StoreDomain.resolveSlotForTime(config.slots, resStart);
            let rBase = rSlot ? rSlot.duration : config.dinnerDuration;

            // 保存されたduration優先、なければデフォルト
            const storedDuration = (res as any).duration;
            const rDuration = Math.min(storedDuration || rBase, config.maxDuration);

            // 片付け時間を含めた終了時間
            const resEnd = resStart + rDuration;
            const theirEnd = resEnd + config.cleanupDuration;

            // Overlap: My Start < Their End AND Their Start < My End
            return (targetStartMin < theirEnd) && (resStart < targetEndMin);
        });

        // 集計
        overlappingReservations.forEach(r => {
            const res = r as any;
            if (res.assignedTables && res.assignedTables.length > 0) {
                res.assignedTables.forEach((t: any) => {
                    // 正規化されたテーブルデータでタイプ判定
                    const tableInStore = activeTables.find(st => st.id === t.id);
                    if (tableInStore && tableInStore.type === 'counter') {
                        // カウンター: 客数分を加算
                        const currentUsed = counterUsedSeats.get(t.id) || 0;
                        counterUsedSeats.set(t.id, currentUsed + (res.guests || 1));
                    } else {
                        // テーブル/個室: 完全占有
                        usedTableIds.add(t.id);
                    }
                });
            } else {
                unassignedCount++;
            }
        });

        return {
            usedTableIds,
            counterUsedSeats,
            unassignedCount
        };
    }
};
