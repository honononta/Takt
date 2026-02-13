/**
 * app.js — Main entry point for Takt
 */
import { openDB, getAllTasks, saveTask, deleteTask, getAllSettings, getAllHolidays, importHolidays } from './db.js';
import {
    createTask, getScheduledForDate, getUnscheduledForDate,
    getSomedayTasks, sortSomedayTasks, detectBookings, buildTimeline,
    formatDuration, minToTime, timeToMin, expandRecurringTasks
} from './task.js';
import {
    loadHolidays, isHoliday, getHolidayName, formatDateHeader, formatFullDate, toDateStr, fromDateStr,
    addDays, getWeekDates, renderWeekCalendar, renderMonthCalendar, renderYearCalendar
} from './calendar.js';
import { initSomeday, renderSomedayList } from './someday.js';
import { initSettings } from './settings.js';
import { initSwipe } from './swipe.js';

// ===== State =====
let currentDate = new Date();
let currentView = 'week'; // 'week', 'month', 'year'
let allTasks = [];
let settings = {};
let _prevWeekKey = null; // 前回描画した週の識別キー
let _savedScrollTop = 0; // シート開閉時のスクロール位置保存
let _sheetActive = false; // シートが表示中かどうか

const todayStr = () => toDateStr(new Date());

// ===== Scroll Lock (iOS Safari 裏スクロール防止) =====

// touchmove ハンドラ: シート表示中にシート外のスクロールを防止
function _handleTouchMove(e) {
    if (!_sheetActive) return;
    // シート内(.sheet-body)のスクロールは許可
    const sheetBody = e.target.closest('.sheet-body');
    if (sheetBody) {
        const isScrollable = sheetBody.scrollHeight > sheetBody.clientHeight;
        if (isScrollable) return;
    }
    e.preventDefault();
}

// フォーカス/ブラー ハンドラ: シート内inputへのフォーカス時にスクロール
function _handleSheetFocusIn(e) {
    if (!_sheetActive) return;
    const input = e.target;
    if (!input || !input.closest('.bottom-sheet')) return;
    const sheetBody = input.closest('.sheet-body');
    if (!sheetBody) return;

    // キーボードが出た後にスクロール（少し待つ）
    setTimeout(() => {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.scrollTo(0, 0);
    }, 350);
}

function _handleSheetFocusOut() {
    if (!_sheetActive) return;
    // 背面のスクロール位置をリセット
    setTimeout(() => {
        window.scrollTo(0, 0);
    }, 100);
}

// visualViewport scroll ハンドラ: 裏のスクロールを常にリセット
function _handleVVScroll() {
    if (_sheetActive) window.scrollTo(0, 0);
}

export function lockScroll() {
    _savedScrollTop = taskArea ? taskArea.scrollTop : 0;
    _sheetActive = true;
    document.body.style.top = '0px';
    document.body.classList.add('sheet-open');

    // touchmove 防止（passive: false が必須）
    document.addEventListener('touchmove', _handleTouchMove, { passive: false });

    // フォーカス/ブラー 監視
    document.addEventListener('focusin', _handleSheetFocusIn);
    document.addEventListener('focusout', _handleSheetFocusOut);

    // visualViewport scroll 監視（裏スクロール防止のみ）
    if (window.visualViewport) {
        window.visualViewport.addEventListener('scroll', _handleVVScroll);
    }
}

export function unlockScroll() {
    _sheetActive = false;
    document.body.classList.remove('sheet-open');
    document.body.style.top = '';
    if (taskArea) taskArea.scrollTop = _savedScrollTop;

    // リスナー解除
    document.removeEventListener('touchmove', _handleTouchMove);
    document.removeEventListener('focusin', _handleSheetFocusIn);
    document.removeEventListener('focusout', _handleSheetFocusOut);
    if (window.visualViewport) {
        window.visualViewport.removeEventListener('scroll', _handleVVScroll);
    }

    // 最終スクロールリセット
    window.scrollTo(0, 0);
}

// ===== DOM =====
const headerDate = document.getElementById('headerDate');
const viewContainer = document.getElementById('viewContainer');
const weekView = document.getElementById('weekView');
const monthView = document.getElementById('monthView');
const yearView = document.getElementById('yearView');
const taskArea = document.getElementById('taskArea');
const unscheduledSection = document.getElementById('unscheduledSection');
const unscheduledList = document.getElementById('unscheduledList');
const timeline = document.getElementById('timeline');
const holidayBanner = document.getElementById('holidayBanner');
const holidayNameEl = document.getElementById('holidayName');
const dateInfoMain = document.getElementById('dateInfoMain');
const dateInfoSub = document.getElementById('dateInfoSub');

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
    // Load tasks
    await loadAllTasks();

    // Init modules
    initSomeday(onTaskClick);
    initSettings(onSettingsClose);

    // Swipe navigation
    initSwipe(taskArea, {
        onSwipeLeft: () => navigateNext(),
        onSwipeRight: () => navigatePrev(),
    });
    initSwipe(viewContainer, {
        onSwipeLeft: () => navigateNext(7), // 7 is ignored for month/year but used for week if logic allows
        onSwipeRight: () => navigatePrev(7),
    });

    // Navigation buttons
    document.getElementById('prevDayBtn').addEventListener('click', () => navigatePrev());
    document.getElementById('nextDayBtn').addEventListener('click', () => navigateNext());
    document.getElementById('todayBtn').addEventListener('click', () => {
        currentDate = new Date();
        render();
    });

    // Header Date Click (Switch View)
    headerDate.addEventListener('click', () => {
        if (currentView === 'week') {
            switchView('month');
        } else if (currentView === 'month') {
            switchView('year');
        }
    });

    // View Clicks
    weekView.addEventListener('click', (e) => {
        const dayEl = e.target.closest('.week-day');
        if (dayEl && dayEl.dataset.date) {
            currentDate = fromDateStr(dayEl.dataset.date);
            render(); // Select day
        }
    });

    monthView.addEventListener('click', (e) => {
        const cell = e.target.closest('.month-cell');
        if (cell && cell.dataset.date) {
            currentDate = fromDateStr(cell.dataset.date);
            switchView('week');
        }
    });

    yearView.addEventListener('click', (e) => {
        const cell = e.target.closest('.year-cell');
        if (cell && cell.dataset.month !== undefined) {
            const m = parseInt(cell.dataset.month, 10);
            currentDate.setMonth(m);
            switchView('month');
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
}

// ===== Navigation =====
function navigatePrev(days = 1) {
    if (currentView === 'week') {
        currentDate = addDays(currentDate, -days);
        render('right'); // Slide right (showing past)
    } else if (currentView === 'month') {
        currentDate.setMonth(currentDate.getMonth() - 1);
        currentDate = new Date(currentDate);
        render('right');
    } else if (currentView === 'year') {
        currentDate.setFullYear(currentDate.getFullYear() - 1);
        currentDate = new Date(currentDate);
        render('right');
    }
}

function navigateNext(days = 1) {
    if (currentView === 'week') {
        currentDate = addDays(currentDate, days);
        render('left'); // Slide left (showing future)
    } else if (currentView === 'month') {
        currentDate.setMonth(currentDate.getMonth() + 1);
        currentDate = new Date(currentDate);
        render('left');
    } else if (currentView === 'year') {
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        currentDate = new Date(currentDate);
        render('left');
    }
}

function switchView(view) {
    if (currentView === view) return;
    if (viewContainer.classList.contains('animating')) return;

    const oldView = currentView;
    const oldEl = document.getElementById(oldView + 'View');
    const newEl = document.getElementById(view + 'View');

    // Start Animation Prep
    viewContainer.classList.add('animating');
    const startHeight = viewContainer.offsetHeight;
    viewContainer.style.height = startHeight + 'px';

    // Switch Logic
    currentView = view;
    render();

    // Restore oldEl visibility for animation
    oldEl.classList.remove('view-hidden');

    const newHeight = newEl.offsetHeight;

    // Execute Animation (Fade)
    requestAnimationFrame(() => {
        viewContainer.style.transition = 'height 0.25s ease-in-out';
        viewContainer.style.height = newHeight + 'px';

        const exit = 'view-fade-exit';
        const exitActive = 'view-fade-exit-active';
        const enter = 'view-fade-enter';
        const enterActive = 'view-fade-enter-active';

        oldEl.classList.add(exit);
        newEl.classList.add(enter);

        // Trigger reflow
        void oldEl.offsetWidth;

        oldEl.classList.add(exitActive);
        newEl.classList.add(enterActive);

        // Cleanup
        setTimeout(() => {
            viewContainer.classList.remove('animating');
            viewContainer.style.height = '';
            viewContainer.style.transition = '';

            oldEl.classList.remove(exit, exitActive);
            oldEl.classList.add('view-hidden');

            newEl.classList.remove(enter, enterActive);
        }, 250); // Match CSS duration
    });
}

// ===== Render =====
/**
 * @param {'left'|'right'|null} slideDir
 */
function render(slideDir = null) {
    const dateStr = toDateStr(currentDate);

    // Prepare scheduled dates for dots
    const scheduledDates = new Set();
    allTasks.forEach(t => {
        if (t.scheduledDate && !t.isSomeday) {
            scheduledDates.add(t.scheduledDate);
        }
    });

    // Header & Views
    if (currentView === 'week') {
        headerDate.textContent = formatDateHeader(currentDate); // M月

        weekView.classList.remove('view-hidden');
        monthView.classList.add('view-hidden');
        yearView.classList.add('view-hidden');

        // Render Week
        const weekDates = getWeekDates(currentDate, settings.weekStartDay);
        const newWeekKey = toDateStr(weekDates[0]);
        let dir = slideDir;

        // Suppress animation if week hasn't changed
        if (_prevWeekKey !== null && newWeekKey === _prevWeekKey) {
            dir = null;
        }

        if (!dir && _prevWeekKey !== null && newWeekKey !== _prevWeekKey) {
            dir = fromDateStr(newWeekKey) > fromDateStr(_prevWeekKey) ? 'left' : 'right';
        }
        _prevWeekKey = newWeekKey;
        renderWeekCalendar(weekView, weekDates, currentDate, todayStr(), dir, scheduledDates);

    } else if (currentView === 'month') {
        headerDate.textContent = `${currentDate.getFullYear()}年 ${currentDate.getMonth() + 1}月`;

        weekView.classList.add('view-hidden');
        monthView.classList.remove('view-hidden');
        yearView.classList.add('view-hidden');

        renderMonthCalendar(monthView, currentDate, scheduledDates);

    } else if (currentView === 'year') {
        headerDate.textContent = `${currentDate.getFullYear()}年`;

        weekView.classList.add('view-hidden');
        monthView.classList.add('view-hidden');
        yearView.classList.remove('view-hidden');

        renderYearCalendar(yearView, currentDate);
    }

    // Visibility Control
    const isWeek = currentView === 'week';
    const dateInfoArea = document.querySelector('.date-info-area');
    if (dateInfoArea) dateInfoArea.style.display = isWeek ? '' : 'none';
    timeline.style.display = isWeek ? '' : 'none';
    unscheduledSection.style.display = isWeek ? '' : 'none';
    const somedaySection = document.getElementById('somedaySection') || document.querySelector('.someday-section');
    if (somedaySection) somedaySection.style.display = isWeek ? '' : 'none';

    if (isWeek) {
        // Date Info Area
        dateInfoMain.textContent = formatFullDate(currentDate);

        // Holiday
        const hName = getHolidayName(dateStr);
        if (hName) {
            dateInfoSub.textContent = hName;
            dateInfoSub.style.display = '';
            dateInfoSub.style.color = 'var(--color-danger)';
            if (holidayBanner) holidayBanner.style.display = 'none';
        } else {
            dateInfoSub.style.display = 'none';
            if (holidayBanner) holidayBanner.style.display = 'none';
        }

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
        <svg class="timeline-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
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
            if (task.isInstance || (task.recurrence && task.recurrence.type !== 'none')) {
                const icon = document.createElement('span');
                icon.className = 'recurrence-icon';
                icon.textContent = ' ↻';
                nameEl.appendChild(icon);
            }
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
    const goalTargetGroup = document.getElementById('goalTargetGroup');
    const dateTargetGroup = document.getElementById('dateTargetGroup');
    const timeGroup = document.getElementById('timeGroup');
    const importanceBtns = document.querySelectorAll('.importance-btn');
    const headerSaveBtn = document.getElementById('taskHeaderSaveBtn');
    const pinnedRow = document.getElementById('taskPinnedRow');

    taskOverlay.addEventListener('click', closeTaskForm);
    closeBtn.addEventListener('click', closeTaskForm);

    // Recurrence toggle
    const recurrenceSelect = document.getElementById('taskRecurrence');
    recurrenceSelect.addEventListener('change', toggleRecurrenceOptions);

    // Duration custom toggle
    durationSelect.addEventListener('change', () => {
        customDurationGroup.style.display = durationSelect.value === 'custom' ? '' : 'none';
    });

    // Target type toggle
    document.querySelectorAll('input[name="targetType"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            const val = document.querySelector('input[name="targetType"]:checked').value;
            goalTargetGroup.style.display = val === 'goal' ? '' : 'none';
            dateTargetGroup.style.display = val === 'date' ? '' : 'none';
            // 日付指定の時はピン留めを非表示
            pinnedRow.style.display = val === 'date' ? 'none' : '';
            // 繰り返し設定は日付指定時のみ表示
            const recurrenceGroup = document.getElementById('taskRecurrenceGroup');
            if (recurrenceGroup) recurrenceGroup.style.display = val === 'date' ? '' : 'none';
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
        const idStr = document.getElementById('taskId').value;
        if (!idStr) return;

        if (idStr.includes('_')) {
            // Instance deletion -> Add exception
            const [originalId, dateStr] = idStr.split('_');
            // Assuming allTasks contains the original (it should if loaded)
            // But we need to ensure we have the Original Object.
            // allTasks contains *Instances* and *Non-Recurring*.
            // It might NOT contain the *Original Template* if the template itself is transparent?
            // In expandRecurringTasks, we pushed the template? 
            // "result.push(task)" only if non-recurring!
            // Wait! If recurrence type is NOT none, we did NOT push the original template in expandRecurringTasks!
            // So `allTasks` does NOT contain the original template.
            // We must fetch it from DB.
            const originalTask = await getTaskFromDB(originalId); // Need helper or use getAllTasks().find
            if (originalTask) {
                if (!originalTask.recurrence.exceptions) originalTask.recurrence.exceptions = {};
                originalTask.recurrence.exceptions[dateStr] = 'deleted';
                originalTask.updatedAt = new Date().toISOString();
                await saveTask(originalTask);
            }
        } else {
            // Normal deletion
            await deleteTask(idStr);
        }
        await loadAllTasks();
        closeTaskForm();
        render();
    });

    // Submit (Header Save Button)
    headerSaveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await saveTaskFromForm();
        closeTaskForm();
        render();
    });

    // Submit (Form submit - Enter key etc)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveTaskFromForm();
        closeTaskForm();
        render();
    });
}

// Helper to get task by ID from DB (since allTasks might not have it)
async function getTaskFromDB(id) {
    const tasks = await getAllTasks();
    return tasks.find(t => t.id === id);
}

// Deep compare recurrence objects
function isSameRecurrence(r1, r2) {
    if (!r1 && !r2) return true;
    if (!r1 || !r2) return false;
    // Simple JSON stringify comparison
    // Key order should be consistent from getRecurrenceFromForm
    return JSON.stringify(r1) === JSON.stringify(r2);
}

async function openTaskForm(task = null) {
    const title = document.getElementById('taskSheetTitle');
    const idInput = document.getElementById('taskId');
    const nameInput = document.getElementById('taskName');
    const memoInput = document.getElementById('taskMemo');
    const durationSelect = document.getElementById('taskDuration');
    const customDuration = document.getElementById('customDuration');
    const customDurationGroup = document.getElementById('customDurationGroup');
    const targetDate = document.getElementById('targetDate');
    const goalDate = document.getElementById('goalDate');
    const targetTime = document.getElementById('targetTime');
    const pinnedInput = document.getElementById('taskPinned');
    const deleteBtn = document.getElementById('taskDeleteBtn');
    const importanceBtns = document.querySelectorAll('.importance-btn');
    const goalTargetGroup = document.getElementById('goalTargetGroup');
    const dateTargetGroup = document.getElementById('dateTargetGroup');
    const timeGroup = document.getElementById('timeGroup');
    const pinnedRow = document.getElementById('taskPinnedRow');
    const recurrenceGroup = document.getElementById('taskRecurrenceGroup');

    // Reset Recurrence UI State
    if (recurrenceGroup) recurrenceGroup.style.display = '';
    document.getElementById('taskRecurrence').disabled = false;
    document.getElementById('recurrenceDetails').style.opacity = '';
    document.getElementById('recurrenceDetails').style.pointerEvents = '';

    if (task) {
        title.textContent = task.isInstance ? 'タスク編集 (繰り返し)' : 'タスク編集';
        idInput.value = task.id;
        nameInput.value = task.name;
        memoInput.value = task.memo || '';
        pinnedInput.checked = task.pinned;
        deleteBtn.style.display = '';

        // Recurrence Handling
        let recurrenceToSet = task.recurrence;

        // If Instance, fetch Original to get Recurrence
        if (task.isInstance && task.originalTaskId) {
            const original = await getTaskFromDB(task.originalTaskId);
            if (original) {
                recurrenceToSet = original.recurrence;
            }
        }

        setRecurrenceToForm(recurrenceToSet);

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
        if (task.isSomeday && task.targetDate) {
            // 目標タイプ
            document.querySelector('input[name="targetType"][value="goal"]').checked = true;
            goalTargetGroup.style.display = '';
            dateTargetGroup.style.display = 'none';
            pinnedRow.style.display = '';
            goalDate.value = task.targetDate || '';
            if (recurrenceGroup) recurrenceGroup.style.display = 'none';
        } else if (task.isSomeday) {
            document.querySelector('input[name="targetType"][value="someday"]').checked = true;
            goalTargetGroup.style.display = 'none';
            dateTargetGroup.style.display = 'none';
            pinnedRow.style.display = '';
            if (recurrenceGroup) recurrenceGroup.style.display = 'none';
        } else {
            document.querySelector('input[name="targetType"][value="date"]').checked = true;
            goalTargetGroup.style.display = 'none';
            dateTargetGroup.style.display = '';
            pinnedRow.style.display = 'none';
            if (recurrenceGroup) recurrenceGroup.style.display = '';
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

        setRecurrenceToForm(null);

        importanceBtns.forEach((b) => {
            b.classList.toggle('active', b.dataset.value === 'mid');
        });

        document.querySelector('input[name="targetType"][value="someday"]').checked = true;
        goalTargetGroup.style.display = 'none';
        dateTargetGroup.style.display = 'none';
        pinnedRow.style.display = '';
        if (recurrenceGroup) recurrenceGroup.style.display = 'none';
        document.querySelector('input[name="timeType"][value="undecided"]').checked = true;
        timeGroup.style.display = 'none';

        // Default date to current view date
        targetDate.value = toDateStr(currentDate);
        goalDate.value = toDateStr(currentDate);
        targetTime.value = '09:00';
    }

    taskOverlay.classList.add('active');
    taskSheet.classList.add('active');
    lockScroll();
    setTimeout(() => {
        nameInput.focus({ preventScroll: true });
    }, 350);
}

function closeTaskForm() {
    taskOverlay.classList.remove('active');
    taskSheet.classList.remove('active');
    unlockScroll();
}

async function saveTaskFromForm() {
    const idStr = document.getElementById('taskId').value;
    const name = document.getElementById('taskName').value.trim();
    if (!name) return;

    const durationSelect = document.getElementById('taskDuration');
    let duration = Number(durationSelect.value);
    if (durationSelect.value === 'custom') {
        duration = Number(document.getElementById('customDuration').value) || 30;
    }

    const targetType = document.querySelector('input[name="targetType"]:checked').value;
    const memo = document.getElementById('taskMemo').value;
    const importance = document.querySelector('.importance-btn.active')?.dataset.value || 'mid';
    const pinned = document.getElementById('taskPinned').checked;

    let isSomeday = false;
    let targetDateVal = null;
    let scheduledDateVal = null;
    let scheduledTimeVal = null;

    if (targetType === 'someday') {
        isSomeday = true;
    } else if (targetType === 'goal') {
        isSomeday = true;
        targetDateVal = document.getElementById('goalDate').value || null;
    } else {
        isSomeday = false;
        scheduledDateVal = document.getElementById('targetDate').value || null;
        targetDateVal = scheduledDateVal;
        const timeType = document.querySelector('input[name="timeType"]:checked').value;
        if (timeType === 'specified') {
            scheduledTimeVal = document.getElementById('targetTime').value || null;
        }
    }

    const now = new Date().toISOString();
    const newRecurrence = getRecurrenceFromForm();

    // Check Instance vs New/Original
    if (idStr && idStr.includes('_')) {
        // --- Instance Update Logic ---
        const [originalId, dateStr] = idStr.split('_');
        const originalTask = await getTaskFromDB(originalId);

        if (originalTask) {
            // Check if Recurrence Changed
            const recurrenceChanged = !isSameRecurrence(originalTask.recurrence, newRecurrence);

            if (recurrenceChanged) {
                // SERIES UPDATE: Update the Original Task
                const updatedOriginal = {
                    ...originalTask,
                    name,
                    memo,
                    duration,
                    importance,
                    pinned: false,
                    isSomeday: false,
                    targetDate: targetDateVal,
                    scheduledDate: targetDateVal || originalTask.scheduledDate, // Use new date as start if set
                    scheduledTime: scheduledTimeVal,
                    recurrence: newRecurrence,
                    updatedAt: now
                };
                await saveTask(updatedOriginal);
            } else {
                // INSTANCE UPDATE (Exception)
                if (!originalTask.recurrence.exceptions) originalTask.recurrence.exceptions = {};

                const overrides = {
                    name, memo, duration, importance, pinned,
                    isSomeday, targetDate: targetDateVal,
                    scheduledDate: scheduledDateVal, scheduledTime: scheduledTimeVal,
                    updatedAt: now
                };

                // If scheduledDate changed, it moves to another day (Logic might need handling in expandRecurringTasks)
                // Current expandRecurringTasks puts it at "dateStr".
                // If we change "scheduledDate" in override, expandRecurringTasks should respect it?
                // AddInstance does: `...ex // Apply overrides`.
                // So `instance.scheduledDate` becomes new date.
                // But it's keyed by `dateStr` (original date).
                // So it will appear on New Date, but ID remains `OriginalID_OriginalDate`.
                // This is fine.

                originalTask.recurrence.exceptions[dateStr] = overrides;
                await saveTask(originalTask);
            }
        }
    } else {
        // --- Regular Task / New Task ---
        const task = idStr ? await getTaskFromDB(idStr) : createTask();

        // If idStr was valid but task not found (shouldn't happen), createTask() makes new ID.
        if (idStr && !task) {
            // fallback?
        }

        const updatedTask = {
            ...task,
            name,
            memo,
            duration,
            importance,
            pinned,
            isSomeday,
            targetDate: targetDateVal,
            scheduledDate: isSomeday ? null : scheduledDateVal,
            scheduledTime: scheduledTimeVal,
            recurrence: newRecurrence,
            updatedAt: now
        };

        if (newRecurrence) {
            updatedTask.isSomeday = false;
            if (!updatedTask.scheduledDate) {
                updatedTask.scheduledDate = toDateStr(new Date());
            }
        }

        await saveTask(updatedTask);
    }

    await loadAllTasks();
}


function onTaskClick(task) {
    openTaskForm(task);
}

async function onSettingsClose() {
    settings = await getAllSettings();
    document.documentElement.setAttribute('data-theme', settings.theme);
    await loadHolidays();
    render();
}

// ===== Start =====
init();

// ===== Recurrence Logic =====

function toggleRecurrenceOptions() {
    const type = document.getElementById('taskRecurrence').value;
    const details = document.getElementById('recurrenceDetails');
    const daily = document.getElementById('recurrenceDaily');
    const weekly = document.getElementById('recurrenceWeekly');
    const monthly = document.getElementById('recurrenceMonthly');
    const yearly = document.getElementById('recurrenceYearly');

    details.style.display = type === 'none' ? 'none' : '';
    daily.style.display = type === 'daily' ? '' : 'none';
    weekly.style.display = type === 'weekly' ? '' : 'none';
    monthly.style.display = type === 'monthly' ? '' : 'none';
    yearly.style.display = type === 'yearly' ? '' : 'none';
}

function getRecurrenceFromForm() {
    const type = document.getElementById('taskRecurrence').value;
    if (type === 'none') return null;

    const r = { type };

    // Until date
    const until = document.getElementById('recurrenceUntil').value;
    if (until) r.until = until;

    if (type === 'daily') {
        const excludeCheckboxes = document.querySelectorAll('#dailyExcludeSelector input:checked');
        if (excludeCheckboxes.length > 0) {
            r.excludeDays = Array.from(excludeCheckboxes).map(c => parseInt(c.value, 10));
        }
    } else if (type === 'weekly') {
        const includeCheckboxes = document.querySelectorAll('#weeklyIncludeSelector input:checked');
        if (includeCheckboxes.length > 0) {
            r.daysOfWeek = Array.from(includeCheckboxes).map(c => parseInt(c.value, 10));
        }
    } else if (type === 'monthly') {
        // Derive day from targetDate
        const dateStr = document.getElementById('targetDate').value;
        if (dateStr) {
            const date = new Date(dateStr);
            r.dayOfMonth = date.getDate();
        }

        const avoidCheckboxes = document.querySelectorAll('#monthlyAvoidSelector input:checked');
        if (avoidCheckboxes.length > 0) {
            r.avoidDays = Array.from(avoidCheckboxes).map(c => parseInt(c.value, 10));
            r.avoidDirection = document.getElementById('monthlyAvoidDir').value;
        }
    } else if (type === 'yearly') {
        // Derive month/day from targetDate
        const dateStr = document.getElementById('targetDate').value;
        if (dateStr) {
            const date = new Date(dateStr);
            r.month = date.getMonth() + 1; // 1-12
            r.dayOfMonth = date.getDate();
        }

        const avoidCheckboxes = document.querySelectorAll('#yearlyAvoidSelector input:checked');
        if (avoidCheckboxes.length > 0) {
            r.avoidDays = Array.from(avoidCheckboxes).map(c => parseInt(c.value, 10));
            r.avoidDirection = document.getElementById('yearlyAvoidDir').value;
        }
    }

    return r;
}

function setRecurrenceToForm(recurrence) {
    const select = document.getElementById('taskRecurrence');

    // Reset all inputs
    document.querySelectorAll('.day-selector input').forEach(c => c.checked = false);
    document.querySelectorAll('.day-selector-sm input').forEach(c => c.checked = false);
    // Note: removed explicit day/month inputs reset as they are removed from DOM
    document.getElementById('monthlyAvoidDir').value = 'before';
    document.getElementById('yearlyAvoidDir').value = 'before';
    document.getElementById('recurrenceUntil').value = '';

    if (!recurrence || recurrence.type === 'none') {
        select.value = 'none';
        toggleRecurrenceOptions();
        return;
    }

    select.value = recurrence.type;
    toggleRecurrenceOptions();

    const r = recurrence;
    if (r.until) document.getElementById('recurrenceUntil').value = r.until;
    if (r.type === 'daily') {
        if (r.excludeDays) {
            r.excludeDays.forEach(d => {
                const cb = document.querySelector(`#dailyExcludeSelector input[value="${d}"]`);
                if (cb) cb.checked = true;
            });
        }
    } else if (r.type === 'weekly') {
        if (r.daysOfWeek) {
            r.daysOfWeek.forEach(d => {
                const cb = document.querySelector(`#weeklyIncludeSelector input[value="${d}"]`);
                if (cb) cb.checked = true;
            });
        }
    } else if (r.type === 'monthly') {
        // Day derived from date, no manual input needed
        if (r.avoidDays) {
            r.avoidDays.forEach(d => {
                const cb = document.querySelector(`#monthlyAvoidSelector input[value="${d}"]`);
                if (cb) cb.checked = true;
            });
            if (r.avoidDirection) document.getElementById('monthlyAvoidDir').value = r.avoidDirection;
        }
    } else if (r.type === 'yearly') {
        // Month/Day derived from date
        if (r.avoidDays) {
            r.avoidDays.forEach(d => {
                const cb = document.querySelector(`#yearlyAvoidSelector input[value="${d}"]`);
                if (cb) cb.checked = true;
            });
            if (r.avoidDirection) document.getElementById('yearlyAvoidDir').value = r.avoidDirection;
        }
    }
}

async function loadAllTasks() {
    const raw = await getAllTasks();
    // Expand recurrence for +/- 1 year from today (or wider)
    // Takt is likely used for near future/past mostly.
    const start = addDays(new Date(), -365);
    const end = addDays(new Date(), 365);
    // Format dates for expansion (YYYY-MM-DD)
    const startStr = toDateStr(start);
    const endStr = toDateStr(end);

    allTasks = expandRecurringTasks(raw, startStr, endStr);
}
