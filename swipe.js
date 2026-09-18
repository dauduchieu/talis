// Emit a bubbling `swipe` event with `event.direction` on every element.
(() => {
    const activePointers = new Map();
    const activeTouches = new Map();
    const minDistance = 40;
    const minHoldTime = 500;

    const getScreenPosition = (event) => ({
        x: event.screenX ?? event.clientX,
        y: event.screenY ?? event.clientY,
    });

    const emitSwipe = (start, endPosition, endTime) => {
        const deltaX = endPosition.x - start.x;
        const deltaY = endPosition.y - start.y;
        const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
        const holdTime = endTime - start.time;

        if (distance < minDistance || holdTime < minHoldTime) return;

        const direction =
            Math.abs(deltaX) > Math.abs(deltaY)
                ? deltaX > 0 ? "toright" : "toleft"
                : deltaY > 0 ? "down" : "up";

        const swipeEvent = new CustomEvent("swipe", {
            bubbles: true,
            detail: { direction, deltaX, deltaY },
        });

        swipeEvent.direction = direction;
        start.target.dispatchEvent(swipeEvent);
    };

    window.addEventListener("pointerdown", (event) => {
        // iPhone Safari may cancel PointerEvents when a scroll starts.
        if (event.pointerType === "touch") return;

        const position = getScreenPosition(event);

        activePointers.set(event.pointerId, {
            target: event.target,
            x: position.x,
            y: position.y,
            time: event.timeStamp,
        });

        // Keep receiving the gesture even when the pointer leaves a scrollable child.
        if (typeof event.target.setPointerCapture === "function") {
            event.target.setPointerCapture(event.pointerId);
        }
    }, true);

    window.addEventListener("pointerup", (event) => {
        if (event.pointerType === "touch") return;

        const start = activePointers.get(event.pointerId);
        activePointers.delete(event.pointerId);

        if (!start) return;

        emitSwipe(start, getScreenPosition(event), event.timeStamp);
    }, true);

    window.addEventListener("pointercancel", (event) => {
        if (event.pointerType === "touch") return;

        activePointers.delete(event.pointerId);
    }, true);

    // TouchEvent fallback for iPhone Safari, including scrollable elements.
    window.addEventListener("touchstart", (event) => {
        for (const touch of event.changedTouches) {
            activeTouches.set(touch.identifier, {
                target: event.target,
                x: touch.screenX ?? touch.clientX,
                y: touch.screenY ?? touch.clientY,
                time: event.timeStamp,
            });
        }
    }, { capture: true, passive: true });

    window.addEventListener("touchend", (event) => {
        for (const touch of event.changedTouches) {
            const start = activeTouches.get(touch.identifier);
            activeTouches.delete(touch.identifier);

            if (!start) continue;

            emitSwipe(start, {
                x: touch.screenX ?? touch.clientX,
                y: touch.screenY ?? touch.clientY,
            }, event.timeStamp);
        }
    }, { capture: true, passive: true });

    window.addEventListener("touchcancel", (event) => {
        for (const touch of event.changedTouches) {
            activeTouches.delete(touch.identifier);
        }
    }, { capture: true, passive: true });
})();
