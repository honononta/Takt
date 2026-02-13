/**
 * someday.js — "いつかやる" persistent panel with drag-to-resize
 */
import { sortSomedayTasks, getSomedayTasks, formatDuration } from './task.js';

const panel = document.getElementById('somedayPanel');
const handle = document.getElementById('somedayHandle');
const list = document.getElementById('somedayList');
const countEl = document.getElementById('somedayCount');

let _onTaskClick = null;

// ===== Drag state =====
let _isDragging = false;
let _startY = 0;
let _startHeight = 0;
const MIN_HEIGHT = 48;
const MAX_HEIGHT_RATIO = 0.5; // 50vh

export function initSomeday(onTaskClick) {
    _onTaskClick = onTaskClick;

    // Drag handle events (touch)
    handle.addEventListener('touchstart', _onDragStart, { passive: false });
    document.addEventListener('touchmove', _onDragMove, { passive: false });
    document.addEventListener('touchend', _onDragEnd);

    // Drag handle events (mouse)
    handle.addEventListener('mousedown', _onDragStart);
    document.addEventListener('mousemove', _onDragMove);
    document.addEventListener('mouseup', _onDragEnd);
}

// ===== Show / Hide (for other sheet coordination) =====

export function hide() {
    panel.classList.add('hidden');
}

export function show() {
    panel.classList.remove('hidden');
}

// ===== Drag handlers =====

function _onDragStart(e) {
    _isDragging = true;
    _startY = _getY(e);
    _startHeight = panel.offsetHeight;

    // Disable transition during drag for smooth feel
    panel.style.transition = 'none';

    if (e.type === 'touchstart') {
        e.preventDefault();
    }
}

function _onDragMove(e) {
    if (!_isDragging) return;

    const currentY = _getY(e);
    const deltaY = _startY - currentY; // positive = dragging up = making taller
    const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO;
    const newHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, _startHeight + deltaY));

    panel.style.height = newHeight + 'px';

    if (e.cancelable) e.preventDefault();
}

function _onDragEnd() {
    if (!_isDragging) return;
    _isDragging = false;

    // Restore transition
    panel.style.transition = '';
}

function _getY(e) {
    if (e.touches && e.touches.length > 0) {
        return e.touches[0].clientY;
    }
    return e.clientY;
}

// ===== Render =====

export function renderSomedayList(allTasks, n1 = 8, n2 = 3) {
    const someday = getSomedayTasks(allTasks);
    const sorted = sortSomedayTasks(someday, n1, n2);

    // Update count
    countEl.textContent = sorted.length > 0 ? `${sorted.length}件` : '';

    list.innerHTML = '';

    if (sorted.length === 0) {
        list.innerHTML = '<div class="someday-empty">タスクがありません</div>';
        return;
    }

    for (const task of sorted) {
        const card = document.createElement('div');
        card.className = 'someday-card';
        card.dataset.id = task.id;

        // Goal date coloring
        if (task.targetDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const goalDate = new Date(task.targetDate);
            goalDate.setHours(0, 0, 0, 0);
            if (goalDate.getTime() === today.getTime()) {
                card.classList.add('goal-today');
            } else if (goalDate < today) {
                card.classList.add('goal-overdue');
            }
        }

        const nameEl = document.createElement('div');
        nameEl.className = 'task-name';
        nameEl.textContent = task.name;
        card.appendChild(nameEl);

        const metaEl = document.createElement('div');
        metaEl.className = 'someday-meta';

        if (task.pinned) {
            const pinEl = document.createElement('span');
            pinEl.className = 'pin-icon';
            pinEl.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 11V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7"/><path d="M5 17h14"/><path d="M6 11l1.5 6h9L18 11"/></svg>';
            metaEl.appendChild(pinEl);
        }

        const durEl = document.createElement('span');
        durEl.textContent = formatDuration(task.duration);
        metaEl.appendChild(durEl);

        if (task.targetDate) {
            const dateEl = document.createElement('span');
            dateEl.className = 'goal-date';
            const d = new Date(task.targetDate);
            const mm = d.getMonth() + 1;
            const dd = d.getDate();
            dateEl.textContent = `目標 ${mm}/${dd}`;
            metaEl.appendChild(dateEl);
        }

        card.appendChild(metaEl);

        card.addEventListener('click', () => {
            if (_onTaskClick) _onTaskClick(task);
        });

        list.appendChild(card);
    }
}
