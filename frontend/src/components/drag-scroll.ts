type HorizontalScrollable = {
  scrollLeft: number;
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
};

type DragPointerEvent<T extends HorizontalScrollable = HorizontalScrollable> = {
  button?: number;
  clientX: number;
  currentTarget: T;
  pointerId: number;
  preventDefault?: () => void;
};

type DragScrollOptions = {
  dragThresholdPx?: number;
};

export function createHorizontalDragScrollController(options: DragScrollOptions = {}) {
  const dragThresholdPx = options.dragThresholdPx ?? 12;
  let isPointerDown = false;
  let isDragging = false;
  let suppressNextClick = false;
  let activePointerId = 0;
  let startX = 0;
  let startScrollLeft = 0;

  const resetPointer = () => {
    isPointerDown = false;
    isDragging = false;
    activePointerId = 0;
  };

  return {
    onPointerDown(event: DragPointerEvent) {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }

      suppressNextClick = false;
      isPointerDown = true;
      isDragging = false;
      activePointerId = event.pointerId;
      startX = event.clientX;
      startScrollLeft = event.currentTarget.scrollLeft;
    },

    onPointerMove(event: DragPointerEvent) {
      if (!isPointerDown || event.pointerId !== activePointerId) {
        return;
      }

      const deltaX = event.clientX - startX;
      if (!isDragging && Math.abs(deltaX) <= dragThresholdPx) {
        return;
      }

      isDragging = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.currentTarget.scrollLeft = startScrollLeft - deltaX;
      event.preventDefault?.();
    },

    onPointerUp(event: DragPointerEvent) {
      if (!isPointerDown || event.pointerId !== activePointerId) {
        return;
      }

      if (isDragging) {
        suppressNextClick = true;
      }

      event.currentTarget.releasePointerCapture?.(event.pointerId);
      resetPointer();
    },

    onPointerCancel(event: DragPointerEvent) {
      if (isPointerDown && event.pointerId === activePointerId) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
      resetPointer();
    },

    consumeClickSuppression() {
      if (!suppressNextClick) {
        return false;
      }

      suppressNextClick = false;
      return true;
    },
  };
}
