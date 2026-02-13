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
