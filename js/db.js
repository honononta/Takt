/**
 * db.js — IndexedDB wrapper for Takt
 */

const DB_NAME = 'takt-db';
const DB_VERSION = 1;

let _db = null;

export function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('tasks')) {
                db.createObjectStore('tasks', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('holidays')) {
                db.createObjectStore('holidays', { keyPath: 'id' });
            }
        };
        req.onsuccess = (e) => {
            _db = e.target.result;
            resolve(_db);
        };
        req.onerror = (e) => reject(e.target.error);
    });
}

function tx(storeName, mode = 'readonly') {
    return _db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// ===== Tasks =====
export async function getAllTasks() {
    await openDB();
    return promisify(tx('tasks').getAll());
}

export async function getTask(id) {
    await openDB();
    return promisify(tx('tasks').get(id));
}

export async function saveTask(task) {
    await openDB();
    return promisify(tx('tasks', 'readwrite').put(task));
}

export async function deleteTask(id) {
    await openDB();
    return promisify(tx('tasks', 'readwrite').delete(id));
}

// ===== Settings =====
const DEFAULT_SETTINGS = {
    theme: 'light',
    weekStartDay: 0,
    accentColor: '#1a1a1a',
    scoreThresholdN1: 8,
    scoreThresholdN2: 3,
    notificationsEnabled: false,
    defaultRemindBefore: 10,
};

export async function getSetting(key) {
    await openDB();
    const row = await promisify(tx('settings').get(key));
    return row ? row.value : DEFAULT_SETTINGS[key];
}

export async function setSetting(key, value) {
    await openDB();
    return promisify(tx('settings', 'readwrite').put({ key, value }));
}

export async function getAllSettings() {
    await openDB();
    const rows = await promisify(tx('settings').getAll());
    const out = { ...DEFAULT_SETTINGS };
    for (const r of rows) out[r.key] = r.value;
    return out;
}

// ===== Holidays =====
export async function getAllHolidays() {
    await openDB();
    return promisify(tx('holidays').getAll());
}

export async function saveHoliday(h) {
    await openDB();
    return promisify(tx('holidays', 'readwrite').put(h));
}

export async function deleteHoliday(id) {
    await openDB();
    return promisify(tx('holidays', 'readwrite').delete(id));
}

export async function clearHolidays() {
    await openDB();
    return promisify(tx('holidays', 'readwrite').clear());
}

export async function importHolidays(jsonData) {
    await openDB();
    const store = tx('holidays', 'readwrite');
    const holidays = jsonData.holidays || jsonData;
    const promises = holidays.map((h) => promisify(store.put(h)));
    return Promise.all(promises);
}
