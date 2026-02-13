/**
 * settings.js — Settings sheet logic
 */
import { getAllSettings, setSetting, getAllHolidays, importHolidays, clearHolidays } from './db.js';

const overlay = document.getElementById('settingsOverlay');
const sheet = document.getElementById('settingsSheet');
let _onClose = null;

export function initSettings(onClose) {
    _onClose = onClose;

    document.getElementById('settingsBtn').addEventListener('click', open);
    document.getElementById('settingsClose').addEventListener('click', close);
    overlay.addEventListener('click', close);

    // Theme
    document.getElementById('settingTheme').addEventListener('change', async (e) => {
        const val = e.target.value;
        document.documentElement.setAttribute('data-theme', val);
        await setSetting('theme', val);
    });

    // Week start
    document.getElementById('settingWeekStart').addEventListener('change', async (e) => {
        await setSetting('weekStartDay', Number(e.target.value));
        if (_onClose) _onClose();
    });

    // Score thresholds
    document.getElementById('settingN1').addEventListener('change', async (e) => {
        await setSetting('scoreThresholdN1', Number(e.target.value));
    });
    document.getElementById('settingN2').addEventListener('change', async (e) => {
        await setSetting('scoreThresholdN2', Number(e.target.value));
    });

    // Notifications
    document.getElementById('settingNotifications').addEventListener('change', async (e) => {
        await setSetting('notificationsEnabled', e.target.checked);
    });
    document.getElementById('settingRemindBefore').addEventListener('change', async (e) => {
        await setSetting('defaultRemindBefore', Number(e.target.value));
    });

    // Holiday import
    const fileInput = document.getElementById('holidayFileInput');
    document.getElementById('importHolidaysBtn').addEventListener('click', () => {
        fileInput.click();
    });
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            await importHolidays(json);
            await updateHolidayCount();
            if (_onClose) _onClose();
        } catch (err) {
            console.error('Holiday import error:', err);
        }
        fileInput.value = '';
    });
}

export async function open() {
    const s = await getAllSettings();
    document.getElementById('settingTheme').value = s.theme;
    document.getElementById('settingWeekStart').value = String(s.weekStartDay);
    document.getElementById('settingN1').value = s.scoreThresholdN1;
    document.getElementById('settingN2').value = s.scoreThresholdN2;
    document.getElementById('settingNotifications').checked = s.notificationsEnabled;
    document.getElementById('settingRemindBefore').value = s.defaultRemindBefore;
    await updateHolidayCount();

    overlay.classList.add('active');
    sheet.classList.add('active');
}

export function close() {
    overlay.classList.remove('active');
    sheet.classList.remove('active');
    if (_onClose) _onClose();
}

async function updateHolidayCount() {
    const holidays = await getAllHolidays();
    document.getElementById('holidayCount').textContent = holidays.length;
}
