// Force Rebuild Timestamp: Refactor 2026-01-21 StoreDomain Pattern
import { factories } from '@strapi/strapi';
import { timeToMinutes } from '../../../utils/timeUtils';
import { StoreConfig } from '../../../core/config/StoreConfig';
import { StoreDomain, ResolvedTableConfig } from '../../../core/domain/StoreDomain';

const log = (message: string) => {
    try {
        strapi.log.debug(`[StoreService] ${message}`);
    } catch (e) {
        // ignore
    }
};

export default factories.createCoreService('api::store.store', ({ strapi }) => ({
    async checkAvailability(storeDocumentId, date, time, guests, courseId = null) {
        try {
            // 1. Fetch store settings and tables
            let store = await strapi.entityService.findOne('api::store.store', storeDocumentId, {
                populate: ['tables', 'businessHours', 'menuItems'] as any
            });

            if (!store) {
                // Try DB query fallback
                store = await strapi.db.query('api::store.store').findOne({
                    where: { documentId: storeDocumentId },
                    populate: true
                });
            }

            if (!store) {
                console.warn(`checkAvailability: Store not found for ID: ${storeDocumentId}`);
                return { available: false, capacityUsed: 0, requiredDuration: 0, reason: 'Store not found', action: 'reject' };
            }

            const config = StoreConfig.resolve(store);
            const menuItems = (store as any).menuItems || [];

            // === コース要件の検証 (minGuests等) ===
            const courseCheck = StoreDomain.validateCourseRequirements(courseId, menuItems, guests);
            if (!courseCheck.valid) {
                return {
                    available: false,
                    capacityUsed: 0,
                    requiredDuration: 0,
                    reason: courseCheck.reason,
                    action: 'reject'
                };
            }

            const durationResult = StoreDomain.getCourseDuration(courseId, menuItems, time, config);
            const currentBaseDuration = durationResult.duration;
            let requiredDuration = Math.min(currentBaseDuration, config.maxDuration);

            // === 営業時間＆閉店時間チェック (StoreDomainに委譲) ===
            const timeCheck = StoreDomain.canFitInBusinessHours(time, requiredDuration, config);
            if (!timeCheck.valid) {
                return {
                    available: false,
                    capacityUsed: 0,
                    requiredDuration,
                    reason: timeCheck.reason,
                    action: timeCheck.action || 'reject'
                };
            }

            const { start: adjustedTargetStart, end: targetEndWithBuffer } = timeCheck.minutes!;
            const targetEndMin = adjustedTargetStart + requiredDuration;

            let clockMin = targetEndMin;
            let isOvernight = false;
            if (clockMin >= 1440) {
                clockMin -= 1440;
                isOvernight = true;
            }
            const h = Math.floor(clockMin / 60);
            const m = clockMin % 60;
            const endTimeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

            // 4. Rule A: Table Inventory Check
            const allReservations = await strapi.entityService.findMany('api::reservation.reservation', {
                filters: {
                    date: date,
                    status: { $ne: 'canceled' },
                    store: { documentId: store.documentId } as any
                },
                populate: ['assignedTables']
            });

            const allTables = StoreDomain.resolveTables((store as any).tables);
            const activeTables = allTables.filter(t => t.isActive);

            // === Occupancy calculation ===
            const { usedTableIds, counterUsedSeats } = StoreDomain.calculateOccupancy(
                allReservations,
                activeTables,
                adjustedTargetStart,
                targetEndWithBuffer,
                config
            );

            // === Available table filtering ===
            const availableTables = StoreDomain.getAvailableTables(
                activeTables,
                usedTableIds,
                counterUsedSeats,
                guests
            );

            const allowOverCapacity = (store as any).allowOverCapacity === true;

            // ===== Seat assignment =====
            const fitTables = StoreDomain.getFittingTables(
                availableTables,
                guests,
                counterUsedSeats
            );

            let looseFitTables: ResolvedTableConfig[] = [];
            if (fitTables.length === 0) {
                looseFitTables = StoreDomain.getLooseFittingTables(
                    availableTables,
                    guests,
                    counterUsedSeats,
                    config
                );
            }

            const overCapacityTables = allowOverCapacity ? availableTables.filter(t => {
                return guests >= t.minCapacity && guests <= t.maxCapacity && guests > t.baseCapacity;
            }) : [];

            const guestsNum = Number(guests);
            const assignmentPriorities = (store as any).assignmentPriorities || {};
            const priorityList = StoreDomain.getPriorityList(guestsNum, assignmentPriorities);

            let selectedTable: ResolvedTableConfig | null = null;
            let matchStage = '';

            for (const pType of priorityList) {
                const match = StoreDomain.getBestFit(fitTables, [pType]);
                if (match) {
                    selectedTable = match;
                    matchStage = `A(${pType})`;
                    break;
                }
            }

            if (!selectedTable && fitTables.length > 0) {
                selectedTable = StoreDomain.getBestFit(fitTables);
                matchStage = 'B(any)';
            }

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

            if (!selectedTable && looseFitTables.length > 0) {
                selectedTable = looseFitTables[0];
                matchStage = 'B3(loose)';
            }

            if (!selectedTable && overCapacityTables.length > 0) {
                selectedTable = StoreDomain.getBestFit(overCapacityTables);
                matchStage = 'C(over)';
            }

            if (selectedTable) {
                const capacity = selectedTable.maxCapacity;
                return {
                    available: true,
                    capacityUsed: Math.round((guests / capacity) * 100),
                    candidateTable: selectedTable,
                    assignedTables: [selectedTable],
                    requiredDuration,
                    courseName: durationResult.courseName,
                    endTime: endTimeStr,
                    isOvernight,
                    action: 'proceed',
                    reason: 'Available',
                    bookingAcceptanceMode: config.bookingAcceptanceMode,
                    storeIdInt: store.id,
                    storeLocale: (store as any).locale
                };
            } else {
                const rejectionStrategy = (store as any).rejectionStrategy || 'auto_reject';
                const action = rejectionStrategy === 'call_request' ? 'call_store' : 'reject';
                const reason = rejectionStrategy === 'call_request'
                    ? 'No suitable table, please contact the store'
                    : 'No suitable table available for this party size';

                return {
                    available: false,
                    capacityUsed: 100,
                    requiredDuration,
                    reason,
                    action
                };
            }

        } catch (error) {
            strapi.log.error('Error in checkAvailability:', error);
            return { available: false, capacityUsed: 0, requiredDuration: 90, reason: String(error), action: 'reject' };
        }
    },
}));
