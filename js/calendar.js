/**
 * calendar.js — Week calendar & date helpers
 */
import { getAllHolidays } from './db.js';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

let _holidays = [];

export async function loadHolidays() {
    _holidays = await getAllHolidays();
}

export function isHoliday(dateStr) {
    // dateStr = 'YYYY-MM-DD'
    const mmdd = dateStr.slice(5); // 'MM-DD'
    return _holidays.some((h) => {
        if (h.repeat) return h.date === mmdd;
        return h.date === dateStr;
    });
}

export function getHolidayName(dateStr) {
    const mmdd = dateStr.slice(5);
    const h = _holidays.find((h) => {
        if (h.repeat) return h.date === mmdd;
        return h.date === dateStr;
    });
    return h ? h.name : null;
}

export function formatDateHeader(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const dow = DAY_NAMES[date.getDay()];
    return `${m}月${d}日 ${dow}曜日`;
}

export function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function fromDateStr(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

export function getWeekDates(centerDate, weekStartDay = 0) {
    const d = new Date(centerDate);
    const dow = d.getDay();
    const diff = ((dow - weekStartDay) + 7) % 7;
    const weekStart = addDays(d, -diff);
    const dates = [];
    for (let i = 0; i < 7; i++) {
        dates.push(addDays(weekStart, i));
    }
    return dates;
}

export function renderWeekCalendar(container, weekDates, selectedDate, todayStr) {
    container.innerHTML = '';
    for (const d of weekDates) {
        const ds = toDateStr(d);
        const isToday = ds === todayStr;
        const isSelected = ds === toDateStr(selectedDate);
        const holiday = isHoliday(ds);

        const dayEl = document.createElement('div');
        dayEl.className = 'week-day';
        dayEl.dataset.date = ds;

        const labelEl = document.createElement('span');
        labelEl.className = 'week-day-label';
        labelEl.textContent = DAY_NAMES[d.getDay()];
        dayEl.appendChild(labelEl);

        const numWrap = document.createElement('span');
        numWrap.className = 'week-day-num';
        if (isToday) numWrap.classList.add('today');
        if (isSelected && !isToday) numWrap.classList.add('selected');
        numWrap.textContent = d.getDate();

        if (holiday) {
            const dot = document.createElement('span');
            dot.className = 'holiday-dot';
            numWrap.appendChild(dot);
        }

        dayEl.appendChild(numWrap);
        container.appendChild(dayEl);
    }
}
