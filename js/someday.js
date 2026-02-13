/**
 * someday.js — "いつかやる" bottom-sheet logic
 */
import { sortSomedayTasks, getSomedayTasks, totalScore, formatDuration } from './task.js';

const overlay = document.getElementById('somedayOverlay');
const sheet = document.getElementById('somedaySheet');
const list = document.getElementById('somedayList');
const openBtn = document.getElementById('somedayBtn');
const closeBtn = document.getElementById('somedayClose');

let _onTaskClick = null;

export function initSomeday(onTaskClick) {
    _onTaskClick = onTaskClick;

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);
}

export function open() {
    overlay.classList.add('active');
    sheet.classList.add('active');
}

export function close() {
    overlay.classList.remove('active');
    sheet.classList.remove('active');
}

export function renderSomedayList(allTasks, n1 = 8, n2 = 3) {
    const someday = getSomedayTasks(allTasks);
    const sorted = sortSomedayTasks(someday, n1, n2);

    list.innerHTML = '';

    if (sorted.length === 0) {
        list.innerHTML = '<div class="someday-empty">タスクがありません</div>';
        return;
    }

    for (const task of sorted) {
        const card = document.createElement('div');
        card.className = 'someday-card';
        card.dataset.id = task.id;

        const nameEl = document.createElement('div');
        nameEl.className = 'task-name';
        nameEl.textContent = task.name;
        card.appendChild(nameEl);

        const metaEl = document.createElement('div');
        metaEl.className = 'someday-meta';

        if (task.pinned) {
            const pinEl = document.createElement('span');
            pinEl.className = 'pin-icon';
            pinEl.textContent = '📌';
            metaEl.appendChild(pinEl);
        }

        const durEl = document.createElement('span');
        durEl.textContent = formatDuration(task.duration);
        metaEl.appendChild(durEl);

        if (task.targetDate) {
            const dateEl = document.createElement('span');
            dateEl.textContent = `〜${task.targetDate}`;
            metaEl.appendChild(dateEl);
        }

        const scoreEl = document.createElement('span');
        scoreEl.className = 'score-badge';
        scoreEl.textContent = `${totalScore(task, n1, n2)}pt`;
        metaEl.appendChild(scoreEl);

        card.appendChild(metaEl);

        card.addEventListener('click', () => {
            close();
            if (_onTaskClick) _onTaskClick(task);
        });

        list.appendChild(card);
    }
}
