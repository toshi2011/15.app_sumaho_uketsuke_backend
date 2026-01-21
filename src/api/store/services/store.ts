// Force Rebuild Timestamp: Refactor 2026-01-14 Fix Lint
import { factories } from '@strapi/strapi';
import { timeToMinutes, normalizeBusinessHours } from '../../../utils/timeUtils';
import { StoreConfig } from '../../../core/config/StoreConfig';

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
    async checkAvailability(storeDocumentId, date, time, guests) {
        try {
            // 1. Fetch store settings and tables
            // Ticket 01: Explicitly use documentId
            let store = await strapi.entityService.findOne('api::store.store', storeDocumentId, {
                populate: '*' // StoreConfig用の設定値を全て取得するため '*' に変更
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
            let currentBaseDuration = 90;
            let closingMin = 0;

            // Rule B: Range Classification & Gap Check
            if (adjustedTargetStart >= config.lunchStartMin && adjustedTargetStart < config.lunchEndMin) {
                isLunch = true;
                currentBaseDuration = config.lunchDuration;
                closingMin = config.lunchEndMin;
            } else if (adjustedTargetStart >= config.dinnerStartMin && adjustedTargetStart < config.dinnerEndMin) {
                isLunch = false;
                currentBaseDuration = config.dinnerDuration;
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

            // Get active tables first for type checking
            const tables = (store as any).tables || [];
            const activeTables = tables.filter((t: any) => t.isActive);

            overlappingReservations.forEach(r => {
                const res = r as any;
                if (res.assignedTables && res.assignedTables.length > 0) {
                    res.assignedTables.forEach((t: any) => {
                        // Check if this is a counter-type table
                        const tableInStore = activeTables.find((st: any) => st.id === t.id);
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

            // Log counter seat usage
            console.log(`[Counter] Seat usage:`, Array.from(counterUsedSeats.entries()).map(([id, used]) => {
                const t = activeTables.find((x: any) => x.id === id);
                return `${t?.name || id}: ${used}/${t?.maxCapacity || t?.capacity || 5}`;
            }).join(', ') || 'none');

            // Available Tables = Store Tables - Used Tables (for non-counter)
            // For counters, check remaining capacity
            const availableTables = activeTables.filter((t: any) => {
                if (t.type === 'counter') {
                    // Counter: check if remaining capacity can fit guests
                    const usedSeats = counterUsedSeats.get(t.id) || 0;
                    const maxSeats = t.maxCapacity || t.capacity || 5;
                    const remainingSeats = maxSeats - usedSeats;
                    return remainingSeats >= guests;
                } else {
                    // Non-counter: check if not fully occupied
                    return !usedTableIds.has(t.id);
                }
            });

            console.log(`[DEBUG] Tables Total: ${tables.length}, Active: ${activeTables.length}, Used (non-counter): ${usedTableIds.size}, Counter tables with partial use: ${counterUsedSeats.size}, Available for ${guests} guests: ${availableTables.length}`);


            const allowOverCapacity = (store as any).allowOverCapacity === true;

            // ===== SIMPLIFIED SEAT ASSIGNMENT LOGIC (v2) =====
            // Phase 1: Find tables that can accommodate guests (using maxCapacity as limit)
            const fitTables = availableTables.filter((t: any) => {
                const tMin = t.minCapacity || 1;
                if (t.type === 'counter') {
                    // Counter: remaining capacity is the limit
                    const usedSeats = counterUsedSeats.get(t.id) || 0;
                    const maxSeats = t.maxCapacity || t.capacity || 5;
                    const remainingSeats = maxSeats - usedSeats;
                    return guests >= tMin && guests <= remainingSeats;
                } else {
                    const tMax = t.maxCapacity || t.baseCapacity || t.capacity || 4;
                    return guests >= tMin && guests <= tMax;
                }
            });

            // Phase 2: Find tables where guests can fit but exceed baseCapacity (over-capacity)
            const overCapacityTables = allowOverCapacity ? availableTables.filter((t: any) => {
                const tMin = t.minCapacity || 1;
                const tBase = t.baseCapacity || t.capacity || 4;
                const tMax = t.maxCapacity || tBase;
                // Already in fitTables (guests <= tMax), so check if guests > tBase
                return guests >= tMin && guests <= tMax && guests > tBase;
            }) : [];

            console.log(`[SeatAssign] FitTables: ${fitTables.length}, OverCapacity: ${overCapacityTables.length}`);

            // Phase 3: Resolve priority list
            const guestsNum = Number(guests); // Ensure numeric comparison
            const assignmentPriorities = (store as any).assignmentPriorities || {};
            let priorityList: string[] = [];
            let foundPriority = false;

            console.log(`[SeatAssign] guests=${guests} (type: ${typeof guests}), guestsNum=${guestsNum}, assignmentPriorities keys: ${Object.keys(assignmentPriorities).join(',') || 'none'}`);

            for (const key in assignmentPriorities) {
                const setting = assignmentPriorities[key];
                if (setting && setting.range && Array.isArray(setting.range) && setting.priority) {
                    const [min, max] = setting.range;
                    const cleanMax = max === null || max === undefined ? 999 : max;
                    if (guestsNum >= min && guestsNum <= cleanMax) {
                        priorityList = setting.priority;
                        foundPriority = true;
                        console.log(`[SeatAssign] Matched priority config '${key}': range=[${min},${cleanMax}], priority=${setting.priority.join(',')}`);
                        break;
                    }
                }
            }

            if (!foundPriority) {
                if (guestsNum <= 2) {
                    priorityList = ['counter', 'table', 'private'];
                } else if (guestsNum <= 4) {
                    priorityList = ['table', 'private', 'counter'];
                } else {
                    priorityList = ['private', 'table'];
                }
            }

            console.log(`[SeatAssign] PriorityList: ${priorityList.join(',')}`);

            // Phase 4: Find best match using staged fallback
            // Stage A: Priority type with exact/under capacity
            // Stage B: Any type with exact/under capacity  
            // Stage C: Over-capacity (if allowed)
            // Stage D: Reject or call_store

            let selectedTable: any = null;
            let matchStage = '';

            // Helper to get best fit from a list (smallest capacity that fits)
            const getBestFit = (tables: any[], types?: string[]) => {
                let filtered = tables;
                if (types && types.length > 0) {
                    filtered = tables.filter((t: any) => {
                        const tType = t.type || 'table';
                        return types.includes(tType);
                    });
                }
                if (filtered.length === 0) return null;

                // Sort by capacity (ascending) - prefer smallest that fits
                filtered.sort((a: any, b: any) => {
                    const capA = a.maxCapacity || a.baseCapacity || a.capacity || 4;
                    const capB = b.maxCapacity || b.baseCapacity || b.capacity || 4;
                    return capA - capB;
                });
                return filtered[0];
            };

            // Stage A: Priority types in fit tables
            for (const pType of priorityList) {
                const match = getBestFit(fitTables, [pType]);
                if (match) {
                    selectedTable = match;
                    matchStage = `A(${pType})`;
                    break;
                }
            }

            // Stage B: Any type in fit tables
            if (!selectedTable && fitTables.length > 0) {
                selectedTable = getBestFit(fitTables);
                matchStage = 'B(any)';
            }

            // Stage C: Over-capacity tables
            if (!selectedTable && overCapacityTables.length > 0) {
                selectedTable = getBestFit(overCapacityTables);
                matchStage = 'C(over)';
            }

            // Phase 5: Return result
            if (selectedTable) {
                const capacity = selectedTable.maxCapacity || selectedTable.baseCapacity || selectedTable.capacity || 4;
                const bookingAcceptanceMode = (store as any).bookingAcceptanceMode || 'manual';

                console.log(`[SeatAssign] Selected: ${selectedTable.name} (Stage ${matchStage}), DocID: ${selectedTable.documentId}, BookingMode: ${bookingAcceptanceMode}`);

                return {
                    available: true,
                    capacityUsed: Math.round((guests / capacity) * 100),
                    requiredDuration,
                    reason: '',
                    action: 'proceed',
                    candidateTable: selectedTable,
                    assignedTables: [selectedTable],
                    bookingAcceptanceMode
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
