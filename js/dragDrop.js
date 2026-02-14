/**
 * dragDrop.js — Long-press drag for someday tasks onto calendar / timeline
 */

const LONG_PRESS_MS = 400;
const DRAG_THRESHOLD = 8; // px to confirm drag start

let _longPressTimer = null;
let _isDragging = false;
let _dragTask = null;    // task object being dragged
let _dragGhost = null;   // floating ghost element
let _startX = 0;
let _startY = 0;
let _dragStarted = false;
let _onDrop = null;      // callback(task, dateStr)
let _justDragged = false; // prevent click after drag

/**
 * Returns true if a drag action just occurred (to suppress click events).
 */
export function wasDragAction() {
    return _justDragged;
}

/**
 * Initialize drag-drop system.
 * @param {Function} onDrop - Called as onDrop(task, dateStr) when dropped on valid target
 */
export function initDragDrop(onDrop) {
    _onDrop = onDrop;

    // Global move/end handlers (touch + mouse)
    document.addEventListener('touchmove', _onMove, { passive: false });
    document.addEventListener('touchend', _onEnd);
    document.addEventListener('touchcancel', _onEnd);
    document.addEventListener('mousemove', _onMove);
    document.addEventListener('mouseup', _onEnd);

    // Prevent text selection during drag
    document.addEventListener('selectstart', (e) => {
        if (_isDragging) e.preventDefault();
    });
}

/**
 * Attach long-press drag to a someday card element.
 * Called from someday.js when rendering cards.
 * @param {HTMLElement} cardEl - The .someday-card element
 * @param {Object} task - The task data
 */
export function attachDrag(cardEl, task) {
    // Touch
    cardEl.addEventListener('touchstart', (e) => {
        _beginLongPress(e, task, cardEl);
    }, { passive: true });

    // Mouse
    cardEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // left button only
        _beginLongPress(e, task, cardEl);
    });

    // Suppress iOS context menu on long-press
    cardEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}

function _beginLongPress(e, task, cardEl) {
    const pos = _getPos(e);
    _startX = pos.x;
    _startY = pos.y;
    _dragTask = task;
    _dragStarted = false;

    _clearLongPress();
    _longPressTimer = setTimeout(() => {
        _startDrag(cardEl, pos);
    }, LONG_PRESS_MS);
}

function _startDrag(cardEl, pos) {
    _isDragging = true;
    _dragStarted = true;

    // Haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(30);

    // Prevent scrolling and text selection during drag
    document.body.classList.add('dragging');

    // Create ghost
    _dragGhost = document.createElement('div');
    _dragGhost.className = 'drag-ghost';
    _dragGhost.textContent = _dragTask.name;
    document.body.appendChild(_dragGhost);

    _positionGhost(pos.x, pos.y);

    // Dim source card
    cardEl.classList.add('drag-source');

    // Add drop zone highlights
    _showDropZones();
}

function _onMove(e) {
    const pos = _getPos(e);

    // If long-press hasn't triggered yet, check if finger moved too much
    if (_longPressTimer && !_dragStarted) {
        const dx = Math.abs(pos.x - _startX);
        const dy = Math.abs(pos.y - _startY);
        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
            _clearLongPress();
        }
        return;
    }

    if (!_isDragging) return;

    if (e.cancelable) e.preventDefault();

    _positionGhost(pos.x, pos.y);
    _highlightTarget(pos.x, pos.y);
}

function _onEnd(e) {
    _clearLongPress();

    if (!_isDragging) return;

    const pos = _getPos(e, true);
    const dateStr = _getDropDate(pos.x, pos.y);

    // Clean up
    _cleanupDrag();

    // Prevent the subsequent click event from opening the edit form
    _justDragged = true;
    setTimeout(() => { _justDragged = false; }, 300);

    if (dateStr && _dragTask && _onDrop) {
        _onDrop(_dragTask, dateStr);
    }

    _dragTask = null;
}

function _positionGhost(x, y) {
    if (!_dragGhost) return;
    _dragGhost.style.left = x + 'px';
    _dragGhost.style.top = (y - 40) + 'px';
}

function _highlightTarget(x, y) {
    // Clear previous highlights
    document.querySelectorAll('.drop-highlight').forEach(el => el.classList.remove('drop-highlight'));

    const target = _getDropElement(x, y);
    if (target) {
        target.classList.add('drop-highlight');
    }
}

function _getDropElement(x, y) {
    // Temporarily hide ghost to find element under it
    if (_dragGhost) _dragGhost.style.pointerEvents = 'none';
    const elUnder = document.elementFromPoint(x, y);
    if (_dragGhost) _dragGhost.style.pointerEvents = '';

    if (!elUnder) return null;

    // Check week calendar day
    const weekDay = elUnder.closest('.week-day');
    if (weekDay && weekDay.dataset.date) return weekDay;

    // Check task area (timeline / unscheduled)
    const taskArea = elUnder.closest('.task-area');
    if (taskArea) return taskArea;

    return null;
}

function _getDropDate(x, y) {
    if (_dragGhost) _dragGhost.style.pointerEvents = 'none';
    const elUnder = document.elementFromPoint(x, y);
    if (_dragGhost) _dragGhost.style.pointerEvents = '';

    if (!elUnder) return null;

    // Week day target → use that day's date
    const weekDay = elUnder.closest('.week-day');
    if (weekDay && weekDay.dataset.date) {
        return weekDay.dataset.date;
    }

    // Task area (timeline/unscheduled) → use currently selected date
    const taskArea = elUnder.closest('.task-area');
    if (taskArea) {
        return '__CURRENT__'; // sentinel: caller should use currentDate
    }

    return null;
}

function _showDropZones() {
    // Add visual indicator to valid drop zones
    const weekView = document.getElementById('weekView');
    const taskArea = document.getElementById('taskArea');
    if (weekView && !weekView.classList.contains('view-hidden')) {
        weekView.classList.add('drop-zone-active');
    }
    if (taskArea) {
        taskArea.classList.add('drop-zone-active');
    }
}

function _cleanupDrag() {
    _isDragging = false;
    _dragStarted = false;

    document.body.classList.remove('dragging');

    if (_dragGhost) {
        _dragGhost.remove();
        _dragGhost = null;
    }

    // Remove drag-source class from all cards
    document.querySelectorAll('.drag-source').forEach(el => el.classList.remove('drag-source'));

    // Remove drop zone highlights
    document.querySelectorAll('.drop-zone-active').forEach(el => el.classList.remove('drop-zone-active'));
    document.querySelectorAll('.drop-highlight').forEach(el => el.classList.remove('drop-highlight'));
}

function _clearLongPress() {
    if (_longPressTimer) {
        clearTimeout(_longPressTimer);
        _longPressTimer = null;
    }
}

function _getPos(e, isEnd = false) {
    if (e.changedTouches && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}
