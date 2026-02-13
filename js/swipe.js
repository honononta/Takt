/**
 * swipe.js — Horizontal swipe navigation
 */

const SWIPE_THRESHOLD = 50;

export function initSwipe(element, { onSwipeLeft, onSwipeRight }) {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    element.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        tracking = true;
    }, { passive: true });

    element.addEventListener('touchmove', (e) => {
        // allow vertical scroll
    }, { passive: true });

    element.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;

        const touch = e.changedTouches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;

        // Only count horizontal swipes where dx > dy
        if (Math.abs(dx) < SWIPE_THRESHOLD) return;
        if (Math.abs(dy) > Math.abs(dx)) return;

        if (dx < 0 && onSwipeLeft) {
            onSwipeLeft();
        } else if (dx > 0 && onSwipeRight) {
            onSwipeRight();
        }
    }, { passive: true });
}
