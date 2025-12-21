/**
 * Converts a time string (HH:mm or HH:mm:ss) to minutes from midnight.
 * 
 * @param timeStr - Time string in "HH:mm" or "HH:mm:ss" format.
 * @returns Integer representing minutes from midnight (0-1439 for standard day).
 *          Returns -1 if invalid format.
 */
export const timeToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return -1;
    return hours * 60 + minutes;
};

/**
 * Converts minutes from midnight to a time string (HH:mm:ss).
 * 
 * @param minutes - Integer representing minutes from midnight.
 * @returns Time string in "HH:mm:ss.000" format (Strapi compatible).
 *          Handles overflow (e.g., 1500 -> 25:00:00.000).
 */
export const minutesToTime = (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:00.000`; // Strapi 5 Time format
};

/**
 * Normalizes a closing time that might be "next day" relative to an opening time.
 * If closing time represents a time smaller than opening time (e.g. Open 17:00, Close 02:00),
 * it adds 24 hours (1440 minutes) to the closing time.
 * 
 * @param startMinutes - Minutes for opening time
 * @param endMinutes - Minutes for closing time
 * @returns Normalized endMinutes (might be > 1440)
 */
export const normalizeBusinessHours = (startMinutes: number, endMinutes: number): number => {
    if (endMinutes < startMinutes) {
        return endMinutes + 1440;
    }
    return endMinutes;
};
