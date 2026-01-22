// Force Rebuild Timestamp: Refactor 2026-01-21 StoreDomain Pattern
import { factories } from '@strapi/strapi';
import { timeToMinutes, normalizeBusinessHours } from '../../../utils/timeUtils';
import { StoreConfig } from '../../../core/config/StoreConfig';
import { StoreDomain, ResolvedTableConfig } from '../../../core/domain/StoreDomain';

const log = (message: string) => {
    try {
        strapi.log.debug(`[StoreService] ${message}`);
    } catch (e) {
        // ignore
    }
};

const formatMin = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export default factories.createCoreService('api::store.store', ({ strapi }) => ({
    async checkAvailability(storeDocumentId, date, time, guests, courseId = null) {
        try {
            // 1. Fetch store settings and tables
            // Ticket 01: Explicitly use documentId
            let store = await strapi.entityService.findOne('api::store.store', storeDocumentId, {
                populate: ['tables', 'businessHours', 'menuItems'] as any // tables, businessHours, menuItems を明示的に取得
            });

            if (!store) {
                // Try DB query fallback if entityService fails (rare for valid ID)
                store = await strapi.db.query('api::store.store').findOne({
                    where: { documentId: storeDocumentId },
                    populate: true // DB Queryでは true で全リレーション・フィールド取得
                });
            }

            if (!store) {
                console.warn(`checkAvailability: Store not found for ID: ${storeDocumentId}`);
                return { available: false, capacityUsed: 0, requiredDuration: 0, reason: 'Store not found', action: 'reject' };
            }

            console.log(`[DEBUG] checkAvailability (TableLogic): storeDocumentId=${storeDocumentId}, date=${date}, time=${time}, guests=${guests}`);

            // === USE CENTRALIZED CONFIG ===
            // console.log(`[DEBUG] Raw Store Config Candidates: lunchDuration=${(store as any).lunchDuration}, dinnerDuration=${(store as any).dinnerDuration}`);
            const config = StoreConfig.resolve(store);
            console.log(`[StoreService] Resolved Config for DocID ${storeDocumentId}: LunchDur=${config.lunchDuration}, DinnerDur=${config.dinnerDuration}`);

            if (!(store as any).tables) {
                // warning or silent
            }

            const targetStartMin = timeToMinutes(time);
            let adjustedTargetStart = targetStartMin;
            // Handle late night boundary if needed
            if (config.dinnerEndMin > 1440 && targetStartMin < config.lunchStartMin) {
                adjustedTargetStart += 1440;
            }

            let isLunch = false;
            let closingMin = 0;

            // Rule B: Range Classification & Gap Check
            if (adjustedTargetStart >= config.lunchStartMin && adjustedTargetStart < config.lunchEndMin) {
                isLunch = true;
                closingMin = config.lunchEndMin;
            } else if (adjustedTargetStart >= config.dinnerStartMin && adjustedTargetStart < config.dinnerEndMin) {
                isLunch = false;
                closingMin = config.dinnerEndMin;
            } else {
                return {
                    available: false,
                    capacityUsed: 0,
                    requiredDuration: 0,
                    reason: `Outside of business hours. Lunch: ${formatMin(config.lunchStartMin)}~${formatMin(config.lunchEndMin)}, Dinner: ${formatMin(config.dinnerStartMin)}~${formatMin(config.dinnerEndMin)}`,
                    action: 'reject'
                };
            }

            // === コース選択に基づく滞在時間の決定 ===
            const menuItems = (store as any).menuItems || [];
            const durationResult = StoreDomain.getCourseDuration(courseId, menuItems, time, config);
            const currentBaseDuration = durationResult.duration;
            console.log(`[StoreService] Duration resolved: ${currentBaseDuration}min (source: ${durationResult.source}${durationResult.courseName ? ', course: ' + durationResult.courseName : ''})`);


            // Duration Calculation
            let requiredDuration = Math.min(currentBaseDuration, config.maxDuration);

            const targetEndMin = adjustedTargetStart + requiredDuration;
            const targetEndWithBuffer = targetEndMin + config.cleanupDuration;

            // Rule C: Closing Time Constraint
            if (isLunch) {
                // Lunch: Last Order Logic
                const lastOrderLimit = closingMin - config.lastOrderOffset;

                if (adjustedTargetStart > lastOrderLimit) {
                    return {
                        available: false,
                        capacityUsed: 0,
                        requiredDuration,
                        reason: `Lunch Last Order exceeded. Max start: ${formatMin(lastOrderLimit)}. Target: ${time}`,
                        action: 'reject'
                    };
                }
            } else {
                if (targetEndWithBuffer > closingMin) {
                    const maxPossible = closingMin - adjustedTargetStart - config.cleanupDuration;
                    return {
                        available: false,
                        capacityUsed: 0,
                        requiredDuration,
                        endTime: null,
                        isOvernight: false,
                        reason: `Exceeds closing time. Max duration available: ${maxPossible} min`,
                        action: 'reject'
                    };
                }
            }

            // Calculate EndTime/Overnight for valid response
            let clockMin = targetEndMin;
            let isOvernight = false;
            if (clockMin >= 1440) {
                clockMin -= 1440;
                isOvernight = true;
            }
            const h = Math.floor(clockMin / 60);
            const m = clockMin % 60;
            // HH:mm format for frontend/logic usage (API uses HH:mm:ss.SSS for Time type)
            const endTimeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

            // 4. Rule A: Table Inventory Check
            // Debug: First fetch ALL reservations for this date (no store filter) to see what exists
            const debugAllRes = await strapi.entityService.findMany('api::reservation.reservation', {
                filters: { date: date },
                populate: ['assignedTables', 'store']
            });
            console.log(`[Overlap DEBUG] ALL reservations for ${date} (no store filter): ${debugAllRes.length}`);
            debugAllRes.forEach((r: any) => {
                console.log(`  - ID:${r.id}, time:${r.time}, store:${r.store?.documentId || 'NO STORE'}, status:${r.status}, tables:${r.assignedTables?.map((t: any) => t.name).join(',') || 'none'}`);
            });

            // Fetch ALL reservations for this store on this date to check overlap
            const allReservations = await strapi.entityService.findMany('api::reservation.reservation', {
                filters: {
                    date: date,
                    status: { $ne: 'canceled' },
                    store: { documentId: store.documentId } as any // Proper relation filter format
                },
                populate: ['assignedTables']
            });

            console.log(`[Overlap] Checking date=${date}, time=${time}, storeDocId=${store.documentId}, allReservations count=${allReservations.length}`);
            console.log(`[Overlap] Target slot: start=${adjustedTargetStart}min (${time}), end=${targetEndWithBuffer}min`);

            // Identify overlapping reservations
            const overlappingReservations = allReservations.filter((res) => {
                let resStart = timeToMinutes(res.time);
                if (resStart === -1) return false;

                if (config.dinnerEndMin > 1440 && resStart < config.lunchStartMin) resStart += 1440;

                // Infer duration for existing res (using same logic as target)
                let rIsLunch = (resStart >= config.lunchStartMin && resStart < config.lunchEndMin);
                let rBase = rIsLunch ? config.lunchDuration : config.dinnerDuration;

                // Use stored duration if available (preferred), else use config default
                const storedDuration = (res as any).duration;
                const rDuration = Math.min(storedDuration || rBase, config.maxDuration);

                // Assuming cleanup is 0 as per config, but if we had it, we'd add it here
                const resEnd = resStart + rDuration;
                const theirEnd = resEnd + config.cleanupDuration;

                const myStart = adjustedTargetStart;
                const myEnd = targetEndWithBuffer;

                // Overlap: My Start < Their End AND Their Start < My End
                const overlaps = (myStart < theirEnd) && (resStart < myEnd);

                console.log(`[Overlap] Res ID=${(res as any).id}, time=${res.time}, start=${resStart}min, end=${theirEnd}min, overlaps=${overlaps}, tables=${(res as any).assignedTables?.map((t: any) => t.name).join(',') || 'none'}`);

                return overlaps;
            });

            // Identify used tables and counter seat usage
            const usedTableIds = new Set<number>(); // For non-counter tables (fully occupied)
            const counterUsedSeats: Map<number, number> = new Map(); // For counter tables: tableId -> usedSeats
            let unassignedReservationCount = 0;

            // === USE StoreDomain for table normalization ===
            const allTables = StoreDomain.resolveTables((store as any).tables);
            const activeTables = allTables.filter(t => t.isActive);

            overlappingReservations.forEach(r => {
                const res = r as any;
                if (res.assignedTables && res.assignedTables.length > 0) {
                    res.assignedTables.forEach((t: any) => {
                        // Check if this is a counter-type table using normalized data
                        const tableInStore = activeTables.find(st => st.id === t.id);
                        if (tableInStore && tableInStore.type === 'counter') {
                            // For counters, track used seats instead of marking entire table as used
                            const currentUsed = counterUsedSeats.get(t.id) || 0;
                            counterUsedSeats.set(t.id, currentUsed + (res.guests || 1));
                        } else {
                            // Non-counter tables are fully occupied by any reservation
                            usedTableIds.add(t.id);
                        }
                    });
                } else {
                    unassignedReservationCount++;
                }
            });

            // Log counter seat usage (using normalized data)
            console.log(`[Counter] Seat usage:`, Array.from(counterUsedSeats.entries()).map(([id, used]) => {
                const t = activeTables.find(x => x.id === id);
                return `${t?.name || id}: ${used}/${t?.maxCapacity || 5}`;
            }).join(', ') || 'none');

            // === USE StoreDomain for available table filtering ===
            const availableTables = StoreDomain.getAvailableTables(
                activeTables,
                usedTableIds,
                counterUsedSeats,
                guests
            );

            console.log(`[DEBUG] Tables Total: ${allTables.length}, Active: ${activeTables.length}, Used (non-counter): ${usedTableIds.size}, Counter tables with partial use: ${counterUsedSeats.size}, Available for ${guests} guests: ${availableTables.length}`);


            const allowOverCapacity = (store as any).allowOverCapacity === true;

            // ===== USE StoreDomain for seat assignment =====
            // Phase 1: Find tables that can accommodate guests (Strict Match)
            const fitTables = StoreDomain.getFittingTables(
                availableTables,
                guests,
                counterUsedSeats
            );

            // Phase 1.5: Loose Match calculation (if strict match fails)
            // 厳密マッチが0件の場合のみ、緩和マッチを計算
            let looseFitTables: ResolvedTableConfig[] = [];
            if (fitTables.length === 0) {
                looseFitTables = StoreDomain.getLooseFittingTables(
                    availableTables,
                    guests,
                    counterUsedSeats,
                    config
                );
                if (looseFitTables.length > 0) {
                    console.log(`[SeatAssign] Loose Match Candidates: ${looseFitTables.length} (Eff>=${config.looseMatchMinEfficiency}, Wasted<=${config.looseMatchMaxWastedSeats})`);
                }
            }

            // Phase 2: Find tables where guests can fit but exceed baseCapacity (over-capacity)
            const overCapacityTables = allowOverCapacity ? availableTables.filter(t => {
                // Already using normalized data - no fallback needed
                return guests >= t.minCapacity && guests <= t.maxCapacity && guests > t.baseCapacity;
            }) : [];

            console.log(`[SeatAssign] FitTables: ${fitTables.length}, LooseFit: ${looseFitTables.length}, OverCapacity: ${overCapacityTables.length}`);

            // === USE StoreDomain for priority list ===
            const guestsNum = Number(guests);
            const assignmentPriorities = (store as any).assignmentPriorities || {};
            const priorityList = StoreDomain.getPriorityList(guestsNum, assignmentPriorities);

            console.log(`[SeatAssign] guests=${guests}, priorityList=${priorityList.join(',')}`);

            // Phase 4: Find best match using staged fallback
            // Stage A: Priority type with strict match
            // Stage B: Any type with strict match  
            // Stage B2: Priority type with loose match (緩和マッチ)
            // Stage B3: Any type with loose match (緩和マッチ)
            // Stage C: Over-capacity (if allowed)
            // Stage D: Reject or call_store

            let selectedTable: ResolvedTableConfig | null = null;
            let matchStage = '';

            // Stage A: Priority types in fit tables (using StoreDomain.getBestFit)
            for (const pType of priorityList) {
                const match = StoreDomain.getBestFit(fitTables, [pType]);
                if (match) {
                    selectedTable = match;
                    matchStage = `A(${pType})`;
                    break;
                }
            }

            // Stage B: Any type in fit tables
            if (!selectedTable && fitTables.length > 0) {
                selectedTable = StoreDomain.getBestFit(fitTables);
                matchStage = 'B(any)';
            }

            // Stage B2: Priority types in loose fit tables (緩和マッチ)
            // looseFitTables は既に「無駄が少ない順」にソート済み
            if (!selectedTable && looseFitTables.length > 0) {
                for (const pType of priorityList) {
                    const match = looseFitTables.find(t => t.type === pType);
                    if (match) {
                        selectedTable = match;
                        matchStage = `B2(${pType}-loose)`;
                        break;
                    }
                }
            }

            // Stage B3: Any type in loose fit tables (緩和マッチ - タイプ不問)
            if (!selectedTable && looseFitTables.length > 0) {
                selectedTable = looseFitTables[0]; // ソート済みなので先頭が最適
                matchStage = 'B3(loose)';
            }

            // Stage C: Over-capacity tables
            if (!selectedTable && overCapacityTables.length > 0) {
                selectedTable = StoreDomain.getBestFit(overCapacityTables);
                matchStage = 'C(over)';
            }

            // Phase 5: Return result
            if (selectedTable) {
                // Using normalized data - no fallback needed
                const capacity = selectedTable.maxCapacity;
                const bookingAcceptanceMode = (store as any).bookingAcceptanceMode || 'manual';

                console.log(`[SeatAssign] Selected: ${selectedTable.name} (Stage ${matchStage}), DocID: ${selectedTable.documentId}, BookingMode: ${bookingAcceptanceMode}`);

                return {
                    available: true,
                    capacityUsed: Math.round((guests / capacity) * 100),
                    candidateTable: selectedTable,
                    assignedTables: [selectedTable],
                    requiredDuration,
                    courseName: durationResult.courseName, // コース名を追加
                    endTime: endTimeStr,
                    isOvernight,
                    action: 'proceed', // or 'pending_review'
                    reason: 'Available',
                    bookingAcceptanceMode: config.bookingAcceptanceMode, // pass config
                    storeIdInt: store.id,
                    storeLocale: (store as any).locale
                };
            } else {
                // Stage D: No table found
                const rejectionStrategy = (store as any).rejectionStrategy || 'auto_reject';
                const action = rejectionStrategy === 'call_request' ? 'call_store' : 'reject';
                const reason = rejectionStrategy === 'call_request'
                    ? 'No suitable table, please contact the store'
                    : 'No suitable table available for this party size';

                console.log(`[SeatAssign] No match found. Action: ${action}`);

                return {
                    available: false,
                    capacityUsed: 100,
                    requiredDuration,
                    reason,
                    action
                };
            }

        } catch (error) {
            console.error('Error in checkAvailability:', error);
            return { available: false, capacityUsed: 0, requiredDuration: 90, reason: String(error), action: 'reject' };
        }
    },
}));
