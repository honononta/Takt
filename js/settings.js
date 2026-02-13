/**
 * settings.js — Settings sheet logic (通知・祝日設定を削除)
 */
import { getAllSettings, setSetting } from './db.js';

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
}

export async function open() {
    const s = await getAllSettings();
    document.getElementById('settingTheme').value = s.theme;
    document.getElementById('settingWeekStart').value = String(s.weekStartDay);
    document.getElementById('settingN1').value = s.scoreThresholdN1;
    document.getElementById('settingN2').value = s.scoreThresholdN2;

    overlay.classList.add('active');
    sheet.classList.add('active');
}

export function close() {
    overlay.classList.remove('active');
    sheet.classList.remove('active');
    if (_onClose) _onClose();
}
