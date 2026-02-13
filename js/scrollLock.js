/**
 * scrollLock.js — Scroll locking utilities for bottom sheets
 */

let _savedScrollTop = 0;
let _sheetActive = false;

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
    const taskArea = document.getElementById('taskArea');
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

    const taskArea = document.getElementById('taskArea');
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
