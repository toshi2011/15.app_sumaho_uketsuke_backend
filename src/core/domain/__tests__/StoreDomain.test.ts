import { StoreDomain } from '../StoreDomain';
import { StoreConfig, ResolvedStoreConfig, TimeSlot } from '../../config/StoreConfig';

describe('StoreDomain', () => {
    // テスト用のヘルパー: configを生成
    const createConfig = (overrides: any = {}): ResolvedStoreConfig => {
        return StoreConfig.resolve({
            lunchDuration: 60,
            dinnerDuration: 90,
            businessHours: {
                lunch: { start: '11:00', end: '14:00', isEnabled: true },
                dinner: { start: '17:00', end: '23:00', isEnabled: true },
            },
            ...overrides,
        });
    };

    describe('resolveSlotForTime()', () => {
        test('ランチ時刻 → ランチスロット返却', () => {
            const config = createConfig();
            const slot = StoreDomain.resolveSlotForTime(config.slots, 12 * 60); // 12:00
            expect(slot?.id).toBe('lunch');
        });

        test('ディナー時刻 → ディナースロット返却', () => {
            const config = createConfig();
            const slot = StoreDomain.resolveSlotForTime(config.slots, 19 * 60); // 19:00
            expect(slot?.id).toBe('dinner');
        });

        test('モーニング時刻（存在する場合）→ モーニングスロット返却', () => {
            const config = createConfig({
                businessHours: {
                    morning: { start: '07:00', end: '10:00', isEnabled: true },
                    lunch: { start: '11:00', end: '14:00', isEnabled: true },
                    dinner: { start: '17:00', end: '23:00', isEnabled: true },
                },
            });
            const slot = StoreDomain.resolveSlotForTime(config.slots, 8 * 60); // 08:00
            expect(slot?.id).toBe('morning');
        });

        test('どのスロットにも属さない → null', () => {
            const config = createConfig();
            const slot = StoreDomain.resolveSlotForTime(config.slots, 15 * 60); // 15:00
            expect(slot).toBeNull();
        });

        test('スロット境界: 開始時刻はマッチ、終了時刻はマッチしない', () => {
            const config = createConfig();
            // 11:00 はランチ開始 → マッチ
            const slotStart = StoreDomain.resolveSlotForTime(config.slots, 11 * 60);
            expect(slotStart?.id).toBe('lunch');
            // 14:00 はランチ終了 → マッチしない（ランチの endMin = 840 で startMin <= 840 < endMin は false）
            const slotEnd = StoreDomain.resolveSlotForTime(config.slots, 14 * 60);
            expect(slotEnd).toBeNull();
        });

        test('isEnabled=false のスロットは無視される', () => {
            const config = createConfig({
                businessHours: {
                    lunch: { start: '11:00', end: '14:00', isEnabled: false },
                    dinner: { start: '17:00', end: '23:00', isEnabled: true },
                },
            });
            const slot = StoreDomain.resolveSlotForTime(config.slots, 12 * 60);
            expect(slot).toBeNull();
        });
    });

    describe('getDuration()', () => {
        test('ランチ時刻 → ランチdurationが返ること', () => {
            const config = createConfig({ lunchDuration: 45 });
            expect(StoreDomain.getDuration('12:00', config)).toBe(45);
        });

        test('ディナー時刻 → ディナーdurationが返ること', () => {
            const config = createConfig({ dinnerDuration: 120 });
            expect(StoreDomain.getDuration('19:00', config)).toBe(120);
        });

        test('どのスロットにも属さない → ディナーdurationにフォールバック', () => {
            const config = createConfig({ dinnerDuration: 100 });
            expect(StoreDomain.getDuration('15:30', config)).toBe(100);
        });
    });

    describe('getApplicableSlot() - Ticket-08 高レベルAPI', () => {
        test('ランチ時刻 → ランチスロット返却', () => {
            const config = createConfig();
            const slot = StoreDomain.getApplicableSlot('12:00', config);
            expect(slot?.id).toBe('lunch');
            expect(slot?.label).toBe('ランチ');
        });

        test('ディナー時刻 → ディナースロット返却', () => {
            const config = createConfig();
            const slot = StoreDomain.getApplicableSlot('19:00', config);
            expect(slot?.id).toBe('dinner');
            expect(slot?.label).toBe('ディナー');
        });

        test('モーニング時刻 → モーニングスロット返却', () => {
            const config = createConfig({
                businessHours: {
                    morning: { start: '07:00', end: '10:00', isEnabled: true },
                    lunch: { start: '11:00', end: '14:00', isEnabled: true },
                    dinner: { start: '17:00', end: '23:00', isEnabled: true },
                },
            });
            const slot = StoreDomain.getApplicableSlot('08:30', config);
            expect(slot?.id).toBe('morning');
            expect(slot?.label).toBe('モーニング');
        });

        test('営業時間外 → null', () => {
            const config = createConfig();
            const slot = StoreDomain.getApplicableSlot('15:30', config);
            expect(slot).toBeNull();
        });

        test('取得したスロットのdurationが正しいこと', () => {
            const config = createConfig({ lunchDuration: 45, dinnerDuration: 120 });
            const lunchSlot = StoreDomain.getApplicableSlot('12:00', config);
            const dinnerSlot = StoreDomain.getApplicableSlot('19:00', config);
            expect(lunchSlot?.duration).toBe(45);
            expect(dinnerSlot?.duration).toBe(120);
        });
    });

    describe('isLunchTime() - @deprecated', () => {
        test('ランチ時刻 → true', () => {
            const config = createConfig();
            expect(StoreDomain.isLunchTime('12:00', config)).toBe(true);
        });

        test('ディナー時刻 → false', () => {
            const config = createConfig();
            expect(StoreDomain.isLunchTime('19:00', config)).toBe(false);
        });

        test('営業時間外 → false', () => {
            const config = createConfig();
            expect(StoreDomain.isLunchTime('15:30', config)).toBe(false);
        });
    });

    describe('canFitInBusinessHours()', () => {
        test('ランチ営業時間内でOK', () => {
            const config = createConfig();
            const result = StoreDomain.canFitInBusinessHours('11:30', 60, config);
            expect(result.valid).toBe(true);
        });

        test('ディナー営業時間内でOK', () => {
            const config = createConfig();
            const result = StoreDomain.canFitInBusinessHours('18:00', 90, config);
            expect(result.valid).toBe(true);
        });

        test('営業時間外 → NG', () => {
            const config = createConfig();
            const result = StoreDomain.canFitInBusinessHours('15:00', 60, config);
            expect(result.valid).toBe(false);
            expect(result.action).toBe('reject');
            expect(result.reason).toContain('営業時間外');
        });

        test('ランチ閉店超過 → NG', () => {
            const config = createConfig();
            const result = StoreDomain.canFitInBusinessHours('13:30', 60, config);
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('閉店時間を超過');
        });

        test('ディナー閉店超過 → NG', () => {
            const config = createConfig();
            const result = StoreDomain.canFitInBusinessHours('22:30', 90, config);
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('閉店時間を超過');
        });

        test('ランチラストオーダー超過 → NG', () => {
            const config = createConfig();
            // lastOrderOffset = 15分 → 14:00 - 15 = 13:45がラストオーダー
            const result = StoreDomain.canFitInBusinessHours('13:50', 10, config);
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('ラストオーダー');
        });

        test('3スロット構成でモーニング営業時間内OK', () => {
            const config = createConfig({
                businessHours: {
                    morning: { start: '07:00', end: '10:00', isEnabled: true },
                    lunch: { start: '11:00', end: '14:00', isEnabled: true },
                    dinner: { start: '17:00', end: '23:00', isEnabled: true },
                },
            });
            const result = StoreDomain.canFitInBusinessHours('08:00', 45, config);
            expect(result.valid).toBe(true);
        });
    });

    describe('generateTimeSlots()', () => {
        test('有効なランチ+ディナーで正しいスロットが生成されること', () => {
            const config = createConfig();
            const store = {
                businessHours: {
                    lunch: { start: '11:00', end: '14:00', isEnabled: true },
                    dinner: { start: '17:00', end: '23:00', isEnabled: true },
                },
            };
            const slots = StoreDomain.generateTimeSlots(config, '2026-02-15', store);
            expect(slots).toContain('11:00');
            expect(slots).toContain('13:45');
            expect(slots).not.toContain('14:00'); // 14:00はランチ終了のため含まない
            expect(slots).toContain('17:00');
            expect(slots).toContain('22:45');
        });

        test('定休日は空配列', () => {
            const config = createConfig();
            const store = {
                businessHours: {
                    lunch: { start: '11:00', end: '14:00' },
                    dinner: { start: '17:00', end: '23:00' },
                    holidays: ['Sun'],
                },
            };
            // 2026-02-15は日曜日
            const slots = StoreDomain.generateTimeSlots(config, '2026-02-15', store);
            expect(slots).toEqual([]);
        });

        test('ランチ無効時はディナーのみ生成', () => {
            const disabledConfig = createConfig({
                businessHours: {
                    lunch: { start: '11:00', end: '14:00', isEnabled: false },
                    dinner: { start: '17:00', end: '23:00', isEnabled: true },
                },
            });
            const store = {
                businessHours: {
                    lunch: { start: '11:00', end: '14:00', isEnabled: false },
                    dinner: { start: '17:00', end: '23:00', isEnabled: true },
                },
            };
            const slots = StoreDomain.generateTimeSlots(disabledConfig, '2026-02-16', store);
            expect(slots).not.toContain('12:00');
            expect(slots).toContain('17:00');
        });
    });

    // === Ticket-09: メニュー制限テスト ===

    describe('mapServiceTypeToSlotIds() - Ticket-09', () => {
        test('day → [lunch, morning]', () => {
            expect(StoreDomain.mapServiceTypeToSlotIds('day')).toEqual(['lunch', 'morning']);
        });

        test('night → [dinner]', () => {
            expect(StoreDomain.mapServiceTypeToSlotIds('night')).toEqual(['dinner']);
        });

        test('common → null（全スロットOK）', () => {
            expect(StoreDomain.mapServiceTypeToSlotIds('common')).toBeNull();
        });

        test('undefined → null（未設定は全スロットOK）', () => {
            expect(StoreDomain.mapServiceTypeToSlotIds(undefined)).toBeNull();
            expect(StoreDomain.mapServiceTypeToSlotIds(null)).toBeNull();
        });
    });

    describe('validateCourseRequirements() - Ticket-09 serviceType', () => {
        const menuItems = [
            { id: 1, documentId: 'course-lunch', name: 'ランチコースA', type: 'course', isCourse: true, duration: 60, serviceType: 'day', minGuests: 1 },
            { id: 2, documentId: 'course-dinner', name: 'ディナーコースB', type: 'course', isCourse: true, duration: 120, serviceType: 'night', minGuests: 2 },
            { id: 3, documentId: 'course-common', name: '終日コースC', type: 'course', isCourse: true, duration: 90, serviceType: 'common', minGuests: 1 },
            { id: 4, documentId: 'menu-display', name: '表示のみメニュー', type: 'display_only', serviceType: 'day' },
        ];

        test('day限定コース + ランチ時刻 → OK', () => {
            const config = createConfig();
            const result = StoreDomain.validateCourseRequirements('course-lunch', menuItems, 2, '12:00', config);
            expect(result.valid).toBe(true);
        });

        test('day限定コース + ディナー時刻 → NG', () => {
            const config = createConfig();
            const result = StoreDomain.validateCourseRequirements('course-lunch', menuItems, 2, '19:00', config);
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('昼');
        });

        test('night限定コース + ランチ時刻 → NG', () => {
            const config = createConfig();
            const result = StoreDomain.validateCourseRequirements('course-dinner', menuItems, 2, '12:00', config);
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('夜');
        });

        test('common コース → 全時間帯OK', () => {
            const config = createConfig();
            const lunchResult = StoreDomain.validateCourseRequirements('course-common', menuItems, 2, '12:00', config);
            const dinnerResult = StoreDomain.validateCourseRequirements('course-common', menuItems, 2, '19:00', config);
            expect(lunchResult.valid).toBe(true);
            expect(dinnerResult.valid).toBe(true);
        });

        test('後方互換: timeStr/config省略時はserviceTypeチェックをスキップ', () => {
            const result = StoreDomain.validateCourseRequirements('course-lunch', menuItems, 2);
            expect(result.valid).toBe(true);
        });
    });
});
