/**
 * settings.js — Settings sheet logic (通知・祝日設定を削除)
 */
import { getAllSettings, setSetting } from './db.js';
import { lockScroll, unlockScroll } from './app.js';

let _onClose = null;

export function initSettings(onClose) {
    _onClose = onClose;

    const btn = document.getElementById('settingsBtn');
    if (btn) btn.addEventListener('click', open);

    const closeBtn = document.getElementById('settingsClose');
    if (closeBtn) closeBtn.addEventListener('click', close);

    const overlay = document.getElementById('settingsOverlay');
    if (overlay) overlay.addEventListener('click', close);

    // Theme
    const themeSelect = document.getElementById('settingTheme');
    if (themeSelect) {
        themeSelect.addEventListener('change', async (e) => {
            const val = e.target.value;
            document.documentElement.setAttribute('data-theme', val);
            await setSetting('theme', val);
        });
    }

    // Week start
    const weekStartSelect = document.getElementById('settingWeekStart');
    if (weekStartSelect) {
        weekStartSelect.addEventListener('change', async (e) => {
            await setSetting('weekStartDay', Number(e.target.value));
            if (_onClose) _onClose();
        });
    }

    // Score thresholds
    const n1Input = document.getElementById('settingN1');
    if (n1Input) {
        n1Input.addEventListener('change', async (e) => {
            await setSetting('scoreThresholdN1', Number(e.target.value));
        });
    }
    const n2Input = document.getElementById('settingN2');
    if (n2Input) {
        n2Input.addEventListener('change', async (e) => {
            await setSetting('scoreThresholdN2', Number(e.target.value));
        });
    }
}

export async function open() {
    // Close Task Sheet if open
    const taskSheet = document.getElementById('taskSheet');
    const taskOverlay = document.getElementById('taskOverlay');
    if (taskSheet && taskSheet.classList.contains('active')) {
        taskSheet.classList.remove('active');
        if (taskOverlay) taskOverlay.classList.remove('active');
    }

    const overlay = document.getElementById('settingsOverlay');
    const sheet = document.getElementById('settingsSheet');

    const s = await getAllSettings();
    const themeEl = document.getElementById('settingTheme');
    if (themeEl) themeEl.value = s.theme;

    const weekEl = document.getElementById('settingWeekStart');
    if (weekEl) weekEl.value = String(s.weekStartDay);

    const n1El = document.getElementById('settingN1');
    if (n1El) n1El.value = s.scoreThresholdN1;

    const n2El = document.getElementById('settingN2');
    if (n2El) n2El.value = s.scoreThresholdN2;

    if (overlay) overlay.classList.add('active');
    if (sheet) sheet.classList.add('active');
    lockScroll();
}

export function close() {
    const overlay = document.getElementById('settingsOverlay');
    const sheet = document.getElementById('settingsSheet');

    if (overlay) overlay.classList.remove('active');
    if (sheet) sheet.classList.remove('active');
    unlockScroll();
    if (_onClose) _onClose();
}
