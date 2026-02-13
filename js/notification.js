/**
 * notification.js — Local notification (foreground only)
 */

let _enabled = false;
let _remindBefore = 10; // minutes

export function initNotification(enabled, remindBefore) {
    _enabled = enabled;
    _remindBefore = remindBefore;
}

export function updateNotificationSettings(enabled, remindBefore) {
    _enabled = enabled;
    _remindBefore = remindBefore;
}

export async function requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    return result === 'granted';
}

export function scheduleLocalReminder(task) {
    if (!_enabled || !task.scheduledDate || !task.scheduledTime) return null;
    if (!('Notification' in window) || Notification.permission !== 'granted') return null;

    const [h, m] = task.scheduledTime.split(':').map(Number);
    const taskTime = new Date(task.scheduledDate);
    taskTime.setHours(h, m, 0, 0);

    const remindTime = new Date(taskTime.getTime() - _remindBefore * 60 * 1000);
    const now = Date.now();
    const delay = remindTime.getTime() - now;

    if (delay <= 0) return null;

    const timerId = setTimeout(() => {
        new Notification('Takt リマインド', {
            body: `${task.name} が${_remindBefore}分後に始まります`,
            icon: 'icons/icon-192.png',
            tag: task.id,
        });
    }, delay);

    return timerId;
}

// Active timers map
const _timers = new Map();

export function scheduleAllReminders(tasks) {
    clearAllReminders();
    for (const t of tasks) {
        const id = scheduleLocalReminder(t);
        if (id !== null) _timers.set(t.id, id);
    }
}

export function clearAllReminders() {
    for (const [, timerId] of _timers) {
        clearTimeout(timerId);
    }
    _timers.clear();
}
