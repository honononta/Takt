/**
 * task.js — Task helpers (scoring, sorting, creation)
 */
import { getAllSettings } from './db.js';

export function createTask(overrides = {}) {
    return {
        id: crypto.randomUUID(),
        name: '',
        memo: '',
        duration: 30,
        targetDate: null,
        targetTime: null,
        importance: 'mid',
        pinned: false,
        isSomeday: true,
        recurrence: null,
        scheduledDate: null,
        scheduledTime: null,
        bookingApproved: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

/** Calculate deadline score for a task */
export function deadlineScore(task, n1 = 8, n2 = 3) {
    if (!task.targetDate) return 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(task.targetDate);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));

    if (diff < 0) return 6;   // 期限超過
    if (diff === 0) return 5;  // 今日
    if (diff === 1) return 4;  // 前日
    if (diff < n1) return 3;   // N₂〜(N₁-1)日
    return 2;                   // N₁日以上
}

const IMPORTANCE_MAP = { low: 1, mid: 2, high: 3 };

export function importanceScore(task) {
    return IMPORTANCE_MAP[task.importance] || 2;
}

export function totalScore(task, n1 = 8, n2 = 3) {
    return deadlineScore(task, n1, n2) * importanceScore(task);
}

/** Sort someday tasks: pinned first, then by score desc */
export function sortSomedayTasks(tasks, n1 = 8, n2 = 3) {
    return [...tasks].sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        return totalScore(b, n1, n2) - totalScore(a, n1, n2);
    });
}

/** Get tasks for a specific date */
export function getTasksForDate(allTasks, dateStr) {
    return allTasks.filter(
        (t) => t.scheduledDate === dateStr && !t.isSomeday
    );
}

/** Get unscheduled tasks for a date (date set, time null) */
export function getUnscheduledForDate(allTasks, dateStr) {
    return allTasks.filter(
        (t) => t.scheduledDate === dateStr && t.scheduledTime === null && !t.isSomeday
    );
}

/** Get scheduled tasks for a date (has both date and time) sorted by time */
export function getScheduledForDate(allTasks, dateStr) {
    return allTasks
        .filter((t) => t.scheduledDate === dateStr && t.scheduledTime !== null && !t.isSomeday)
        .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}

/** Get someday tasks */
export function getSomedayTasks(allTasks) {
    return allTasks.filter((t) => t.isSomeday);
}

/** Check if two tasks have time overlap (booking) */
export function isBooking(taskA, taskB) {
    if (!taskA.scheduledTime || !taskB.scheduledTime) return false;
    const startA = timeToMin(taskA.scheduledTime);
    const endA = startA + taskA.duration;
    const startB = timeToMin(taskB.scheduledTime);
    const endB = startB + taskB.duration;
    return startA < endB && startB < endA;
}

/** Detect all bookings for a date */
export function detectBookings(tasks) {
    const bookingIds = new Set();
    for (let i = 0; i < tasks.length; i++) {
        for (let j = i + 1; j < tasks.length; j++) {
            if (isBooking(tasks[i], tasks[j])) {
                bookingIds.add(tasks[i].id);
                bookingIds.add(tasks[j].id);
            }
        }
    }
    return bookingIds;
}

/** Build empty-slot entries between tasks */
export function buildTimeline(tasks) {
    if (tasks.length === 0) return [];
    const entries = [];
    for (let i = 0; i < tasks.length; i++) {
        entries.push({ type: 'task', task: tasks[i] });
        if (i < tasks.length - 1) {
            const endA = timeToMin(tasks[i].scheduledTime) + tasks[i].duration;
            const startB = timeToMin(tasks[i + 1].scheduledTime);
            if (startB > endA) {
                entries.push({
                    type: 'empty',
                    time: minToTime(endA),
                    duration: startB - endA,
                });
            }
        }
    }
    return entries;
}

export function timeToMin(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

export function minToTime(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
}

export function formatDuration(min) {
    if (min < 60) return `${min}分`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

/**
 * ----------------------------------------------------------------
 * Recurrence Logic
 * ----------------------------------------------------------------
 */

/** Check if a year is leap year */
function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/** Get last day of month */
function getLastDayOfMonth(year, month) {
    // month is 0-indexed in JS Date, but 1-indexed in common usage.
    // Here we assume standard JS Date month (0-11).
    // new Date(year, month + 1, 0) gives last day of month.
    return new Date(year, month + 1, 0).getDate();
}

/** Apply avoid rules (shift date if matches avoidDays) */
function applyAvoidRules(date, avoidDays, direction) {
    if (!avoidDays || avoidDays.length === 0) return new Date(date);

    let d = new Date(date);
    // Safety break to prevent infinite loop
    let loops = 0;
    while (avoidDays.includes(d.getDay()) && loops < 30) {
        if (direction === 'before') {
            d.setDate(d.getDate() - 1);
        } else {
            d.setDate(d.getDate() + 1);
        }
        loops++;
    }
    return d;
}

/** Format YYYY-MM-DD */
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Expand recurring tasks into instances */
export function expandRecurringTasks(tasks, startStr, endStr) {
    const startDate = new Date(startStr);
    let viewEndDate = new Date(endStr);
    const result = [];

    tasks.forEach(task => {
        // Non-recurring
        if (!task.recurrence || task.recurrence.type === 'none') {
            result.push(task);
            return;
        }

        const r = task.recurrence;
        const exceptions = r.exceptions || {};

        // Effective end date (min of view end vs recurrence end)
        let effectiveEndDate = new Date(viewEndDate);
        if (r.until) {
            const untilDate = new Date(r.until);
            untilDate.setHours(23, 59, 59, 999);
            if (untilDate < effectiveEndDate) {
                effectiveEndDate = untilDate;
            }
        }

        // If recurrence ends before window starts, skip
        if (effectiveEndDate < startDate) return;

        if (r.type === 'daily') {
            let d = new Date(startDate);
            while (d <= effectiveEndDate) {
                const dayOfWeek = d.getDay();
                if (!r.excludeDays || !r.excludeDays.includes(dayOfWeek)) {
                    addInstance(task, d, exceptions, result);
                }
                d.setDate(d.getDate() + 1);
            }
        }
        else if (r.type === 'weekly') {
            let d = new Date(startDate);
            while (d <= effectiveEndDate) {
                const dayOfWeek = d.getDay();
                if (r.daysOfWeek && r.daysOfWeek.includes(dayOfWeek)) {
                    addInstance(task, d, exceptions, result);
                }
                d.setDate(d.getDate() + 1);
            }
        }
        else if (r.type === 'monthly') {
            const targetDay = parseInt(r.dayOfMonth, 10);
            let d = new Date(startDate);
            // Start from 1st of start month to handle shift/avoid correctly
            d.setDate(1);

            while (d <= effectiveEndDate) {
                const year = d.getFullYear();
                const month = d.getMonth();
                const lastDay = getLastDayOfMonth(year, month);

                // Determine actual date (e.g. 31st -> 30th if Feb)
                let actualDay = Math.min(targetDay, lastDay);
                let checkDate = new Date(year, month, actualDay);

                // Apply avoid
                let finalDate = applyAvoidRules(checkDate, r.avoidDays, r.avoidDirection);

                if (finalDate >= startDate && finalDate <= effectiveEndDate) {
                    addInstance(task, finalDate, exceptions, result);
                }

                // Next month
                d.setMonth(d.getMonth() + 1);
            }
        }
        else if (r.type === 'yearly') {
            const targetMonth = parseInt(r.month, 10) - 1; // 0-11
            const targetDay = parseInt(r.dayOfMonth, 10);

            let y = startDate.getFullYear();
            const endY = effectiveEndDate.getFullYear();

            for (let year = y; year <= endY; year++) {
                // Determine date
                // Handle Feb 29 on non-leap years? -> Feb 28
                let actualDay = targetDay;
                if (targetMonth === 1 && targetDay === 29 && !isLeapYear(year)) {
                    actualDay = 28;
                }

                let checkDate = new Date(year, targetMonth, actualDay);

                // Apply avoid
                let finalDate = applyAvoidRules(checkDate, r.avoidDays, r.avoidDirection);

                if (finalDate >= startDate && finalDate <= effectiveEndDate) {
                    addInstance(task, finalDate, exceptions, result);
                }
            }
        }
    });

    return result;
}

function addInstance(template, dateObj, exceptions, list) {
    const dateStr = formatDate(dateObj);

    // Check exceptions
    if (exceptions[dateStr]) {
        const ex = exceptions[dateStr];
        if (ex === 'deleted') return; // Skip

        // Instance modified
        const instance = {
            ...template,
            id: template.id + '_' + dateStr, // Unique ID for finding
            originalTaskId: template.id,
            scheduledDate: dateStr,
            isInstance: true,
            recurrence: null, // Instance itself is not recurring
            ...ex // Apply overrides
        };
        list.push(instance);
    } else {
        // Regular instance
        const instance = {
            ...template,
            id: template.id + '_' + dateStr,
            originalTaskId: template.id,
            scheduledDate: dateStr,
            isInstance: true,
            recurrence: null
        };
        list.push(instance);
    }
}
