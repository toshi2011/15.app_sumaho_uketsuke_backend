import { StoreConfig, TimeSlot, ResolvedStoreConfig, buildCategoryPreset } from '../StoreConfig';

describe('StoreConfig', () => {
    // テスト用のヘルパー: 最小限のstoreオブジェクト
    const createStore = (overrides: any = {}) => ({
        lunchDuration: 60,
        dinnerDuration: 90,
        defaultDuration: 90,
        lunchEndTime: '14:00',
        businessHours: {
            lunch: { start: '11:00', end: '14:00', isEnabled: true },
            dinner: { start: '17:00', end: '23:00', isEnabled: true },
            holidays: [],
            irregularHolidays: [],
        },
        ...overrides,
    });

    describe('resolve()', () => {
        test('ランチ+ディナーがある場合、slotsに2枠入ること', () => {
            const config = StoreConfig.resolve(createStore());
            const enabledSlots = config.slots.filter(s => s.isEnabled);
            expect(enabledSlots).toHaveLength(2);
            expect(enabledSlots[0].id).toBe('lunch');
            expect(enabledSlots[1].id).toBe('dinner');
        });

        test('slotsのstartMin/endMinが正しく分換算されること', () => {
            const config = StoreConfig.resolve(createStore());
            const lunch = config.slots.find(s => s.id === 'lunch');
            const dinner = config.slots.find(s => s.id === 'dinner');
            expect(lunch?.startMin).toBe(11 * 60); // 660
            expect(lunch?.endMin).toBe(14 * 60);   // 840
            expect(dinner?.startMin).toBe(17 * 60); // 1020
            expect(dinner?.endMin).toBe(23 * 60);   // 1380
        });

        test('slotsのdurationが店舗設定を反映すること', () => {
            const config = StoreConfig.resolve(createStore({
                lunchDuration: 45,
                dinnerDuration: 120,
            }));
            const lunch = config.slots.find(s => s.id === 'lunch');
            const dinner = config.slots.find(s => s.id === 'dinner');
            expect(lunch?.duration).toBe(45);
            expect(dinner?.duration).toBe(120);
        });

        test('businessHoursが空/未設定の場合、デフォルトスロットが生成されること（後方互換）', () => {
            const config = StoreConfig.resolve({});
            expect(config.slots.length).toBeGreaterThanOrEqual(2);
            const lunch = config.slots.find(s => s.id === 'lunch');
            const dinner = config.slots.find(s => s.id === 'dinner');
            expect(lunch).toBeDefined();
            expect(dinner).toBeDefined();
            expect(lunch?.isEnabled).toBe(true);
            expect(dinner?.isEnabled).toBe(true);
        });

        test('morningキーがある場合、slotsに3枠入ること', () => {
            const config = StoreConfig.resolve(createStore({
                businessHours: {
                    morning: { start: '07:00', end: '10:00', isEnabled: true },
                    lunch: { start: '11:00', end: '14:00', isEnabled: true },
                    dinner: { start: '17:00', end: '23:00', isEnabled: true },
                },
            }));
            expect(config.slots).toHaveLength(3);
            expect(config.slots[0].id).toBe('morning');
            expect(config.slots[0].startMin).toBe(7 * 60);
            expect(config.slots[0].endMin).toBe(10 * 60);
        });

        test('isEnabled: false のランチ → slotsの該当枠のisEnabledがfalse', () => {
            const config = StoreConfig.resolve(createStore({
                businessHours: {
                    lunch: { start: '11:00', end: '14:00', isEnabled: false },
                    dinner: { start: '17:00', end: '23:00', isEnabled: true },
                },
            }));
            const lunch = config.slots.find(s => s.id === 'lunch');
            expect(lunch?.isEnabled).toBe(false);
        });

        test('後方互換: lunchStartMin/dinnerEndMin等のフラットフィールドも正しい値であること', () => {
            const config = StoreConfig.resolve(createStore());
            expect(config.lunchStartMin).toBe(11 * 60);
            expect(config.lunchEndMin).toBe(14 * 60);
            expect(config.dinnerStartMin).toBe(17 * 60);
            expect(config.dinnerEndMin).toBe(23 * 60);
            expect(config.lunchDuration).toBe(60);
            expect(config.dinnerDuration).toBe(90);
        });

        test('morningのdurationがbh.morning.durationから取得できること', () => {
            const config = StoreConfig.resolve(createStore({
                businessHours: {
                    morning: { start: '07:00', end: '10:00', isEnabled: true, duration: 30 },
                    lunch: { start: '11:00', end: '14:00', isEnabled: true },
                    dinner: { start: '17:00', end: '23:00', isEnabled: true },
                },
            }));
            const morning = config.slots.find(s => s.id === 'morning');
            expect(morning?.duration).toBe(30);
        });

        test('Ticket-10: baseキーがありisEnabled=trueの場合、slotsにbase枠が含まれること', () => {
            const config = StoreConfig.resolve(createStore({
                businessHours: {
                    base: { start: '08:00', end: '22:00', isEnabled: true },
                    morning: { start: '08:00', end: '10:00', isEnabled: true },
                    lunch: { start: '11:00', end: '14:00', isEnabled: true },
                    dinner: { start: '17:00', end: '22:00', isEnabled: true },
                },
            }));
            const baseSlot = config.slots.find(s => s.id === 'base');
            expect(baseSlot).toBeDefined();
            expect(baseSlot?.startMin).toBe(8 * 60);  // 480
            expect(baseSlot?.endMin).toBe(22 * 60);    // 1320
            expect(baseSlot?.isPriority).toBe(false);   // 名前付きスロット優先のため
            expect(baseSlot?.isEnabled).toBe(true);
            // morning/lunch/dinnerも同時に存在すること
            expect(config.slots.find(s => s.id === 'morning')).toBeDefined();
            expect(config.slots.find(s => s.id === 'lunch')).toBeDefined();
            expect(config.slots.find(s => s.id === 'dinner')).toBeDefined();
        });

        test('Ticket-10: baseキーがありisEnabled=falseの場合、slotsにbase枠が含まれないこと', () => {
            const config = StoreConfig.resolve(createStore({
                businessHours: {
                    base: { start: '08:00', end: '22:00', isEnabled: false },
                    lunch: { start: '11:00', end: '14:00', isEnabled: true },
                    dinner: { start: '17:00', end: '23:00', isEnabled: true },
                },
            }));
            const baseSlot = config.slots.find(s => s.id === 'base');
            expect(baseSlot).toBeUndefined();
        });
    });

    describe('resolveSlot()', () => {
        let config: ResolvedStoreConfig;

        beforeEach(() => {
            config = StoreConfig.resolve(createStore());
        });

        test('ランチ時刻 → ランチスロットが返ること', () => {
            const slot = StoreConfig.resolveSlot('12:00', config);
            expect(slot?.id).toBe('lunch');
        });

        test('ディナー時刻 → ディナースロットが返ること', () => {
            const slot = StoreConfig.resolveSlot('19:00', config);
            expect(slot?.id).toBe('dinner');
        });

        test('どのスロットにも属さない時刻 → null', () => {
            const slot = StoreConfig.resolveSlot('15:00', config);
            expect(slot).toBeNull();
        });

        test('isEnabled=falseのスロットはマッチしない', () => {
            const disabledConfig = StoreConfig.resolve(createStore({
                businessHours: {
                    lunch: { start: '11:00', end: '14:00', isEnabled: false },
                    dinner: { start: '17:00', end: '23:00', isEnabled: true },
                },
            }));
            const slot = StoreConfig.resolveSlot('12:00', disabledConfig);
            expect(slot).toBeNull();
        });
    });

    describe('isLunch()', () => {
        test('ランチ時間帯ならtrue', () => {
            const config = StoreConfig.resolve(createStore());
            expect(StoreConfig.isLunch('12:00', config)).toBe(true);
        });

        test('ディナー時間帯ならfalse', () => {
            const config = StoreConfig.resolve(createStore());
            expect(StoreConfig.isLunch('19:00', config)).toBe(false);
        });
    });

    describe('getStandardDuration()', () => {
        test('ランチ時刻 → ランチdurationが返ること', () => {
            const config = StoreConfig.resolve(createStore({ lunchDuration: 45 }));
            expect(StoreConfig.getStandardDuration('12:00', config)).toBe(45);
        });

        test('ディナー時刻 → ディナーdurationが返ること', () => {
            const config = StoreConfig.resolve(createStore({ dinnerDuration: 120 }));
            expect(StoreConfig.getStandardDuration('19:00', config)).toBe(120);
        });

        test('どのスロットにも属さない時刻 → ディナーdurationにフォールバック', () => {
            const config = StoreConfig.resolve(createStore({ dinnerDuration: 100 }));
            expect(StoreConfig.getStandardDuration('15:30', config)).toBe(100);
        });
    });

    describe('detectDefaults (カテゴリ対応)', () => {
        test('category未指定 と restaurant で完全一致（後方互換）', () => {
            const noCategory = StoreConfig.resolve(createStore({ category: undefined }));
            const restaurant = StoreConfig.resolve(createStore({ category: 'restaurant' }));
            // rawstore以外の全フィールドが一致すること
            expect(noCategory.lunchDuration).toBe(restaurant.lunchDuration);
            expect(noCategory.dinnerDuration).toBe(restaurant.dinnerDuration);
            expect(noCategory.maxDuration).toBe(restaurant.maxDuration);
            expect(noCategory.lunchStartMin).toBe(restaurant.lunchStartMin);
            expect(noCategory.lunchEndMin).toBe(restaurant.lunchEndMin);
            expect(noCategory.dinnerStartMin).toBe(restaurant.dinnerStartMin);
            expect(noCategory.dinnerEndMin).toBe(restaurant.dinnerEndMin);
            expect(noCategory.slots.length).toBe(restaurant.slots.length);
            noCategory.slots.forEach((slot, i) => {
                expect(slot.id).toBe(restaurant.slots[i].id);
                expect(slot.label).toBe(restaurant.slots[i].label);
                expect(slot.startMin).toBe(restaurant.slots[i].startMin);
                expect(slot.endMin).toBe(restaurant.slots[i].endMin);
                expect(slot.duration).toBe(restaurant.slots[i].duration);
            });
        });

        test('category=cafe でDB値未設定 → カフェ用デフォルト適用', () => {
            const config = StoreConfig.resolve({
                category: 'cafe',
                businessHours: {},
            });
            expect(config.lunchDuration).toBe(60);   // cafe default
            expect(config.dinnerDuration).toBe(60);   // cafe default
            expect(config.maxDuration).toBe(120);     // cafe default
        });

        test('category=cafe でもDB値がある場合はDB値が優先', () => {
            const config = StoreConfig.resolve({
                category: 'cafe',
                lunchDuration: 45,
                dinnerDuration: 90,
                businessHours: {},
            });
            expect(config.lunchDuration).toBe(45);   // DB値
            expect(config.dinnerDuration).toBe(90);   // DB値
        });

        test('category=salon → スロットラベルがサロン用', () => {
            const config = StoreConfig.resolve({
                category: 'salon',
                businessHours: {},
            });
            const lunch = config.slots.find(s => s.id === 'lunch');
            const dinner = config.slots.find(s => s.id === 'dinner');
            expect(lunch?.label).toBe('午前');
            expect(dinner?.label).toBe('午後');
        });

        test('category=izakaya → デフォルトのディナー終了時間が23:30', () => {
            const config = StoreConfig.resolve({
                category: 'izakaya',
                businessHours: {},
            });
            const dinner = config.slots.find(s => s.id === 'dinner');
            expect(dinner?.startMin).toBe(17 * 60);      // 1020
            expect(dinner?.endMin).toBe(23 * 60 + 30);    // 1410
        });

        test('category=classroom → スロットラベルがクラス用', () => {
            const config = StoreConfig.resolve({
                category: 'classroom',
                businessHours: {},
            });
            const lunch = config.slots.find(s => s.id === 'lunch');
            const dinner = config.slots.find(s => s.id === 'dinner');
            expect(lunch?.label).toBe('午前クラス');
            expect(dinner?.label).toBe('午後クラス');
        });

        test('既存のrestaurant createStoreの出力が変わらないこと（完全後方互換）', () => {
            // 既存テストと同じcreateStoreを使用し、category指定なし
            const config = StoreConfig.resolve(createStore());
            // 既存テストのアサーションと同じ期待値
            expect(config.lunchStartMin).toBe(11 * 60);
            expect(config.lunchEndMin).toBe(14 * 60);
            expect(config.dinnerStartMin).toBe(17 * 60);
            expect(config.dinnerEndMin).toBe(23 * 60);
            expect(config.lunchDuration).toBe(60);
            expect(config.dinnerDuration).toBe(90);
            const lunch = config.slots.find(s => s.id === 'lunch');
            const dinner = config.slots.find(s => s.id === 'dinner');
            expect(lunch?.label).toBe('ランチ');
            expect(dinner?.label).toBe('ディナー');
        });
    });

    describe('buildCategoryPreset (店舗作成時プリセット注入)', () => {
        it('restaurant → ランチ・ディナー有効、モーニング・base無効', () => {
            const preset = buildCategoryPreset('restaurant');
            expect(preset.category).toBe('restaurant');
            expect(preset.businessHours.lunch.isEnabled).toBe(true);
            expect(preset.businessHours.dinner.isEnabled).toBe(true);
            expect(preset.businessHours.morning.isEnabled).toBe(false);
            expect(preset.businessHours.base.isEnabled).toBe(false);
        });

        it('cafe → 全スロット有効、MAX_DURATION=120', () => {
            const preset = buildCategoryPreset('cafe');
            expect(preset.category).toBe('cafe');
            expect(preset.businessHours.base.isEnabled).toBe(true);
            expect(preset.businessHours.morning.isEnabled).toBe(true);
            expect(preset.businessHours.lunch.isEnabled).toBe(true);
            expect(preset.businessHours.dinner.isEnabled).toBe(true);
            expect(preset.maxDurationLimit).toBe(120);
        });

        it('izakaya → ディナー終了23:30、ディナー所要時間90分', () => {
            const preset = buildCategoryPreset('izakaya');
            expect(preset.businessHours.dinner.end).toBe('23:30');
            expect(preset.dinnerDuration).toBe(90);
        });

        it('salon → base有効、ランチ開始09:00', () => {
            const preset = buildCategoryPreset('salon');
            expect(preset.businessHours.base.isEnabled).toBe(true);
            expect(preset.businessHours.lunch.start).toBe('09:00');
        });

        it('undefined → restaurant と同じ結果', () => {
            const presetUndef = buildCategoryPreset(undefined);
            const presetRest = buildCategoryPreset('restaurant');
            expect(presetUndef).toEqual(presetRest);
        });

        it('プリセットをresolveに通しても正常動作（往復テスト）', () => {
            const preset = buildCategoryPreset('cafe');
            const config = StoreConfig.resolve(preset);
            expect(config.lunchDuration).toBe(60);
            expect(config.dinnerDuration).toBe(60);
            expect(config.maxDuration).toBe(120);
            const lunch = config.slots.find(s => s.id === 'lunch');
            expect(lunch?.isEnabled).toBe(true);
        });
    });
});
