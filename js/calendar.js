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
    const found = _holidays.find((h) => {
        if (h.repeat) return h.date === mmdd;
        return h.date === dateStr;
    });
    return found ? found.name : null;
}

export function formatDateHeader(date) {
    const m = date.getMonth() + 1;
    return `${m}月`;
}

export function formatFullDate(date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const dow = DAY_NAMES[date.getDay()];
    return `${y}年${m}月${d}日 ${dow}曜日`;
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

/**
 * Render week calendar with optional slide animation.
 * @param {HTMLElement} container - The .week-calendar element
 * @param {Date[]} weekDates
 * @param {Date} selectedDate
 * @param {string} todayStr
 * @param {'left'|'right'|null} slideDirection - Animation direction
 */
export function renderWeekCalendar(container, weekDates, selectedDate, todayStr, slideDirection = null) {
    const buildInner = () => {
        const inner = document.createElement('div');
        inner.className = 'week-calendar-inner';

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
            if (isSelected) numWrap.classList.add('selected');
            numWrap.textContent = d.getDate();

            if (holiday) {
                const dot = document.createElement('span');
                dot.className = 'holiday-dot';
                numWrap.appendChild(dot);
            }

            dayEl.appendChild(numWrap);
            inner.appendChild(dayEl);
        }
        return inner;
    };

    if (!slideDirection) {
        // No animation, just replace
        container.innerHTML = '';
        container.appendChild(buildInner());
        return;
    }

    // Animate: old slides out, new slides in
    const oldInner = container.querySelector('.week-calendar-inner');

    if (oldInner) {
        // Slide out old
        const outClass = slideDirection === 'left' ? 'slide-out-left' : 'slide-out-right';
        oldInner.classList.add(outClass);

        // After old finishes, add new with slide-in
        oldInner.addEventListener('animationend', () => {
            oldInner.remove();
            const newInner = buildInner();
            const inClass = slideDirection === 'left' ? 'slide-in-right' : 'slide-in-left';
            newInner.classList.add(inClass);
            container.appendChild(newInner);
            newInner.addEventListener('animationend', () => {
                newInner.classList.remove(inClass);
            }, { once: true });
        }, { once: true });
    } else {
        container.innerHTML = '';
        container.appendChild(buildInner());
    }
}

/**
 * Render month calendar (for Month View)
 * @param {HTMLElement} container
 * @param {Date} yearMonth - Date object representing the month
 */
export function renderMonthCalendar(container, yearMonth) {
    container.innerHTML = '';

    // Header row (Sun Mon Tue...)
    const headerRow = document.createElement('div');
    headerRow.className = 'month-row header';
    DAY_NAMES.forEach(d => {
        const cell = document.createElement('div');
        cell.className = 'month-cell header-cell';
        cell.textContent = d;
        cell.style.fontSize = '12px';
        cell.style.color = 'var(--color-text-secondary)';
        cell.style.fontWeight = 'bold';
        headerRow.appendChild(cell);
    });
    container.appendChild(headerRow);

    // Days
    const y = yearMonth.getFullYear();
    const m = yearMonth.getMonth();
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);

    // Start from previous month's days to fill first week
    const startDow = firstDay.getDay(); // 0(Sun) - 6(Sat)
    const displayStart = addDays(firstDay, -startDow);

    // 6 weeks covers any month (max 31 days + 6 start offset = 37 days -> 6*7=42)
    const totalDays = 42;

    let currentRow = document.createElement('div');
    currentRow.className = 'month-row';

    const today = toDateStr(new Date());

    for (let i = 0; i < totalDays; i++) {
        const d = addDays(displayStart, i);
        const ds = toDateStr(d);
        const isCurrentMonth = d.getMonth() === m;

        const cell = document.createElement('div');
        cell.className = 'month-cell';
        cell.textContent = d.getDate();
        cell.dataset.date = ds;

        if (!isCurrentMonth) cell.classList.add('other-month');
        if (ds === today) cell.classList.add('today');

        currentRow.appendChild(cell);

        if ((i + 1) % 7 === 0) {
            container.appendChild(currentRow);
            currentRow = document.createElement('div');
            currentRow.className = 'month-row';
        }
    }
}

/**
 * Render year calendar (for Year View)
 * @param {HTMLElement} container
 * @param {Date} date - Date object for the year
 */
export function renderYearCalendar(container, date) {
    container.innerHTML = '';
    const y = date.getFullYear();
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();

    for (let m = 0; m < 12; m++) {
        const cell = document.createElement('div');
        cell.className = 'year-cell';
        cell.textContent = `${m + 1}月`;
        cell.dataset.month = m;

        if (y === thisYear && m === thisMonth) {
            cell.classList.add('current-month');
        }

        container.appendChild(cell);
    }
}
