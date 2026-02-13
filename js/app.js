/**
 * app.js — Main entry point for Takt
 */
import { openDB, getAllTasks, saveTask, deleteTask, getAllSettings, getAllHolidays, importHolidays } from './db.js';
import {
    createTask, getScheduledForDate, getUnscheduledForDate,
    getSomedayTasks, sortSomedayTasks, detectBookings, buildTimeline,
    formatDuration, minToTime, timeToMin
} from './task.js';
import {
    loadHolidays, formatDateHeader, toDateStr, fromDateStr,
    addDays, getWeekDates, renderWeekCalendar
} from './calendar.js';
import { initSomeday, renderSomedayList } from './someday.js';
import { initSettings } from './settings.js';
import { initNotification, updateNotificationSettings, scheduleAllReminders, requestPermission } from './notification.js';
import { initSwipe } from './swipe.js';

// ===== State =====
let currentDate = new Date();
let allTasks = [];
let settings = {};

const todayStr = () => toDateStr(new Date());

// ===== DOM =====
const headerDate = document.getElementById('headerDate');
const weekCalendar = document.getElementById('weekCalendar');
const taskArea = document.getElementById('taskArea');
const unscheduledSection = document.getElementById('unscheduledSection');
const unscheduledList = document.getElementById('unscheduledList');
const timeline = document.getElementById('timeline');

// ===== Init =====
async function init() {
    await openDB();
    settings = await getAllSettings();

    // Apply theme
    document.documentElement.setAttribute('data-theme', settings.theme);

    // Load holidays (try loading bundled data on first visit)
    await loadHolidays();
    const existingHolidays = await getAllHolidays();
    if (existingHolidays.length === 0) {
        try {
            const res = await fetch('data/holidays-jp.json');
            if (res.ok) {
                const json = await res.json();
                await importHolidays(json);
                await loadHolidays();
            }
        } catch { /* ignore */ }
    }

    // Load tasks
    allTasks = await getAllTasks();

    // Init modules
    initSomeday(onTaskClick);
    initSettings(onSettingsClose);
    initNotification(settings.notificationsEnabled, settings.defaultRemindBefore);

    // Swipe navigation
    initSwipe(taskArea, {
        onSwipeLeft: () => navigateDay(1),
        onSwipeRight: () => navigateDay(-1),
    });
    initSwipe(weekCalendar, {
        onSwipeLeft: () => navigateDay(7),
        onSwipeRight: () => navigateDay(-7),
    });

    // Navigation buttons
    document.getElementById('prevDayBtn').addEventListener('click', () => navigateDay(-1));
    document.getElementById('nextDayBtn').addEventListener('click', () => navigateDay(1));
    document.getElementById('todayBtn').addEventListener('click', () => {
        currentDate = new Date();
        render();
    });

    // Week calendar click
    weekCalendar.addEventListener('click', (e) => {
        const dayEl = e.target.closest('.week-day');
        if (dayEl && dayEl.dataset.date) {
            currentDate = fromDateStr(dayEl.dataset.date);
            render();
        }
    });

    // Add button
    document.getElementById('addBtn').addEventListener('click', () => openTaskForm());

    // Task form setup
    setupTaskForm();

    // Render
    render();

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => { });
    }

    // Notification permission
    if (settings.notificationsEnabled) {
        requestPermission();
    }
}

// ===== Navigation =====
function navigateDay(offset) {
    currentDate = addDays(currentDate, offset);
    render();
}

// ===== Render =====
function render() {
    const dateStr = toDateStr(currentDate);

    // Header
    headerDate.textContent = formatDateHeader(currentDate);

    // Week calendar
    const weekDates = getWeekDates(currentDate, settings.weekStartDay);
    renderWeekCalendar(weekCalendar, weekDates, currentDate, todayStr());

    // Unscheduled tasks
    const unscheduled = getUnscheduledForDate(allTasks, dateStr);
    if (unscheduled.length > 0) {
        unscheduledSection.style.display = '';
        renderUnscheduled(unscheduled);
    } else {
        unscheduledSection.style.display = 'none';
    }

    // Timeline
    const scheduled = getScheduledForDate(allTasks, dateStr);
    const bookingIds = detectBookings(scheduled);
    const entries = buildTimeline(scheduled);
    renderTimeline(entries, bookingIds);

    // Someday list
    renderSomedayList(allTasks, settings.scoreThresholdN1, settings.scoreThresholdN2);

    // Schedule notifications for today
    if (dateStr === todayStr()) {
        scheduleAllReminders(scheduled);
    }
}

function renderUnscheduled(tasks) {
    unscheduledList.innerHTML = '';
    for (const task of tasks) {
        const card = document.createElement('div');
        card.className = 'unscheduled-card';
        card.dataset.id = task.id;

        const nameEl = document.createElement('div');
        nameEl.className = 'task-name';
        nameEl.textContent = task.name;
        card.appendChild(nameEl);

        const metaEl = document.createElement('div');
        metaEl.className = 'task-meta';
        metaEl.textContent = `時間未定 | ${formatDuration(task.duration)}`;
        card.appendChild(metaEl);

        card.addEventListener('click', () => onTaskClick(task));
        unscheduledList.appendChild(card);
    }
}

function renderTimeline(entries, bookingIds) {
    timeline.innerHTML = '';

    if (entries.length === 0) {
        timeline.innerHTML = `
      <div class="timeline-empty">
        <div class="timeline-empty-icon">📋</div>
        <div class="timeline-empty-text">タスクがありません</div>
      </div>`;
        return;
    }

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const isLast = i === entries.length - 1;

        const row = document.createElement('div');
        row.className = 'task-row';

        if (entry.type === 'task') {
            const task = entry.task;
            const isBooked = bookingIds.has(task.id);

            // Time gutter
            const gutter = createGutter(task.scheduledTime, !isLast);
            row.appendChild(gutter);

            // Card
            const cardArea = document.createElement('div');
            cardArea.className = 'card-area';

            const card = document.createElement('div');
            card.className = 'task-card';
            card.dataset.id = task.id;

            if (isBooked && !task.bookingApproved) {
                card.classList.add('booking');
            } else if (isBooked && task.bookingApproved) {
                card.classList.add('booking', 'approved');
            }

            const nameEl = document.createElement('div');
            nameEl.className = 'task-name';
            nameEl.textContent = task.name;
            card.appendChild(nameEl);

            const meta = document.createElement('div');
            meta.className = 'task-meta';

            const startEl = document.createElement('span');
            startEl.className = 'task-start';
            startEl.textContent = `${task.scheduledTime}〜`;
            meta.appendChild(startEl);

            const sep = document.createElement('span');
            sep.className = 'meta-separator';
            sep.textContent = '|';
            meta.appendChild(sep);

            const durEl = document.createElement('span');
            durEl.className = 'task-duration';
            durEl.textContent = formatDuration(task.duration);
            meta.appendChild(durEl);

            if (isBooked) {
                const badge = document.createElement('span');
                badge.className = 'booking-badge';
                badge.textContent = task.bookingApproved ? '許可済み' : 'ブッキング';
                meta.appendChild(badge);

                // Click badge to toggle approval
                badge.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    task.bookingApproved = !task.bookingApproved;
                    task.updatedAt = new Date().toISOString();
                    await saveTask(task);
                    allTasks = await getAllTasks();
                    render();
                });
            }

            card.appendChild(meta);
            card.addEventListener('click', () => onTaskClick(task));

            cardArea.appendChild(card);
            row.appendChild(cardArea);
        } else {
            // Empty slot
            row.classList.add('empty-row');

            const gutter = createGutter(entry.time, !isLast);
            row.appendChild(gutter);

            const cardArea = document.createElement('div');
            cardArea.className = 'card-area';

            const card = document.createElement('div');
            card.className = 'task-card empty-card';

            const nameEl = document.createElement('div');
            nameEl.className = 'task-name';
            nameEl.textContent = '空き';
            card.appendChild(nameEl);

            const meta = document.createElement('div');
            meta.className = 'task-meta';

            const startEl = document.createElement('span');
            startEl.className = 'task-start';
            startEl.textContent = `${entry.time}〜`;
            meta.appendChild(startEl);

            const sep = document.createElement('span');
            sep.className = 'meta-separator';
            sep.textContent = '|';
            meta.appendChild(sep);

            const durEl = document.createElement('span');
            durEl.className = 'task-duration';
            durEl.textContent = formatDuration(entry.duration);
            meta.appendChild(durEl);

            card.appendChild(meta);
            cardArea.appendChild(card);
            row.appendChild(cardArea);
        }

        timeline.appendChild(row);
    }
}

function createGutter(timeStr, showLine) {
    const gutter = document.createElement('div');
    gutter.className = 'time-gutter';

    const inner = document.createElement('div');
    inner.className = 'time-gutter-inner';

    const label = document.createElement('span');
    label.className = 'time-label';
    label.textContent = timeStr;
    inner.appendChild(label);

    const dot = document.createElement('span');
    dot.className = 'gutter-dot';
    inner.appendChild(dot);

    gutter.appendChild(inner);

    if (showLine) {
        const line = document.createElement('div');
        line.className = 'gutter-line';
        gutter.appendChild(line);
    }

    return gutter;
}

// ===== Task Form =====
const taskOverlay = document.getElementById('taskOverlay');
const taskSheet = document.getElementById('taskSheet');

function setupTaskForm() {
    const form = document.getElementById('taskForm');
    const closeBtn = document.getElementById('taskSheetClose');
    const deleteBtn = document.getElementById('taskDeleteBtn');
    const durationSelect = document.getElementById('taskDuration');
    const customDurationGroup = document.getElementById('customDurationGroup');
    const dateTargetGroup = document.getElementById('dateTargetGroup');
    const timeGroup = document.getElementById('timeGroup');
    const importanceBtns = document.querySelectorAll('.importance-btn');

    taskOverlay.addEventListener('click', closeTaskForm);
    closeBtn.addEventListener('click', closeTaskForm);

    // Duration custom toggle
    durationSelect.addEventListener('change', () => {
        customDurationGroup.style.display = durationSelect.value === 'custom' ? '' : 'none';
    });

    // Target type toggle
    document.querySelectorAll('input[name="targetType"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            const val = document.querySelector('input[name="targetType"]:checked').value;
            dateTargetGroup.style.display = val === 'date' ? '' : 'none';
        });
    });

    // Time type toggle
    document.querySelectorAll('input[name="timeType"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            const val = document.querySelector('input[name="timeType"]:checked').value;
            timeGroup.style.display = val === 'specified' ? '' : 'none';
        });
    });

    // Importance buttons
    importanceBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            importanceBtns.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Delete
    deleteBtn.addEventListener('click', async () => {
        const id = document.getElementById('taskId').value;
        if (id) {
            await deleteTask(id);
            allTasks = await getAllTasks();
            closeTaskForm();
            render();
        }
    });

    // Submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveTaskFromForm();
        closeTaskForm();
        render();
    });
}

function openTaskForm(task = null) {
    const title = document.getElementById('taskSheetTitle');
    const idInput = document.getElementById('taskId');
    const nameInput = document.getElementById('taskName');
    const memoInput = document.getElementById('taskMemo');
    const durationSelect = document.getElementById('taskDuration');
    const customDuration = document.getElementById('customDuration');
    const customDurationGroup = document.getElementById('customDurationGroup');
    const targetDate = document.getElementById('targetDate');
    const targetTime = document.getElementById('targetTime');
    const pinnedInput = document.getElementById('taskPinned');
    const deleteBtn = document.getElementById('taskDeleteBtn');
    const importanceBtns = document.querySelectorAll('.importance-btn');
    const dateTargetGroup = document.getElementById('dateTargetGroup');
    const timeGroup = document.getElementById('timeGroup');

    if (task) {
        title.textContent = 'タスク編集';
        idInput.value = task.id;
        nameInput.value = task.name;
        memoInput.value = task.memo || '';
        pinnedInput.checked = task.pinned;
        deleteBtn.style.display = '';

        // Duration
        const stdDurations = [5, 10, 15, 30, 45, 60, 120, 180];
        if (stdDurations.includes(task.duration)) {
            durationSelect.value = String(task.duration);
            customDurationGroup.style.display = 'none';
        } else {
            durationSelect.value = 'custom';
            customDuration.value = task.duration;
            customDurationGroup.style.display = '';
        }

        // Importance
        importanceBtns.forEach((b) => {
            b.classList.toggle('active', b.dataset.value === task.importance);
        });

        // Target
        if (task.isSomeday) {
            document.querySelector('input[name="targetType"][value="someday"]').checked = true;
            dateTargetGroup.style.display = 'none';
        } else {
            document.querySelector('input[name="targetType"][value="date"]').checked = true;
            dateTargetGroup.style.display = '';
            targetDate.value = task.scheduledDate || task.targetDate || '';

            if (task.scheduledTime) {
                document.querySelector('input[name="timeType"][value="specified"]').checked = true;
                timeGroup.style.display = '';
                targetTime.value = task.scheduledTime;
            } else {
                document.querySelector('input[name="timeType"][value="undecided"]').checked = true;
                timeGroup.style.display = 'none';
            }
        }
    } else {
        title.textContent = 'タスク追加';
        idInput.value = '';
        nameInput.value = '';
        memoInput.value = '';
        durationSelect.value = '30';
        customDurationGroup.style.display = 'none';
        pinnedInput.checked = false;
        deleteBtn.style.display = 'none';

        importanceBtns.forEach((b) => {
            b.classList.toggle('active', b.dataset.value === 'mid');
        });

        document.querySelector('input[name="targetType"][value="someday"]').checked = true;
        dateTargetGroup.style.display = 'none';
        document.querySelector('input[name="timeType"][value="undecided"]').checked = true;
        timeGroup.style.display = 'none';

        // Default date to current view date
        targetDate.value = toDateStr(currentDate);
        targetTime.value = '09:00';
    }

    taskOverlay.classList.add('active');
    taskSheet.classList.add('active');
    nameInput.focus();
}

function closeTaskForm() {
    taskOverlay.classList.remove('active');
    taskSheet.classList.remove('active');
}

async function saveTaskFromForm() {
    const id = document.getElementById('taskId').value;
    const name = document.getElementById('taskName').value.trim();
    if (!name) return;

    const durationSelect = document.getElementById('taskDuration');
    let duration = Number(durationSelect.value);
    if (durationSelect.value === 'custom') {
        duration = Number(document.getElementById('customDuration').value) || 30;
    }

    const targetType = document.querySelector('input[name="targetType"]:checked').value;
    const importance = document.querySelector('.importance-btn.active')?.dataset.value || 'mid';
    const pinned = document.getElementById('taskPinned').checked;

    let isSomeday = targetType === 'someday';
    let scheduledDate = null;
    let scheduledTime = null;
    let targetDateVal = null;

    if (!isSomeday) {
        scheduledDate = document.getElementById('targetDate').value || null;
        targetDateVal = scheduledDate;
        const timeType = document.querySelector('input[name="timeType"]:checked').value;
        if (timeType === 'specified') {
            scheduledTime = document.getElementById('targetTime').value || null;
        }
    }

    const now = new Date().toISOString();
    const task = id
        ? { ...(allTasks.find((t) => t.id === id) || createTask()), updatedAt: now }
        : createTask({ createdAt: now, updatedAt: now });

    Object.assign(task, {
        name,
        memo: document.getElementById('taskMemo').value,
        duration,
        targetDate: targetDateVal,
        targetTime: scheduledTime,
        importance,
        pinned,
        isSomeday,
        scheduledDate,
        scheduledTime,
    });

    if (id) task.id = id;

    await saveTask(task);
    allTasks = await getAllTasks();
}

function onTaskClick(task) {
    openTaskForm(task);
}

async function onSettingsClose() {
    settings = await getAllSettings();
    document.documentElement.setAttribute('data-theme', settings.theme);
    await loadHolidays();
    updateNotificationSettings(settings.notificationsEnabled, settings.defaultRemindBefore);
    render();
}

// ===== Start =====
init();
