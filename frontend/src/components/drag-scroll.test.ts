import assert from "node:assert/strict";
import test from "node:test";

import { createHorizontalDragScrollController } from "./drag-scroll.js";

function pointerEvent(
  currentTarget: { scrollLeft: number; setPointerCapture?: (pointerId: number) => void; releasePointerCapture?: (pointerId: number) => void },
  clientX: number,
  pointerId = 1,
) {
  let prevented = false;

  return {
    button: 0,
    clientX,
    currentTarget,
    pointerId,
    preventDefault: () => {
      prevented = true;
    },
    wasPrevented: () => prevented,
  };
}

test("horizontal drag scroll updates scrollLeft and suppresses the next click", () => {
  const controller = createHorizontalDragScrollController();
  const target = {
    scrollLeft: 120,
    capturedPointerId: 0,
    releasedPointerId: 0,
    setPointerCapture(pointerId: number) {
      this.capturedPointerId = pointerId;
    },
    releasePointerCapture(pointerId: number) {
      this.releasedPointerId = pointerId;
    },
  };

  controller.onPointerDown(pointerEvent(target, 200, 7));
  const move = pointerEvent(target, 170, 7);
  controller.onPointerMove(move);
  controller.onPointerUp(pointerEvent(target, 170, 7));

  assert.equal(target.scrollLeft, 150);
  assert.equal(target.capturedPointerId, 7);
  assert.equal(target.releasedPointerId, 7);
  assert.equal(move.wasPrevented(), true);
  assert.equal(controller.consumeClickSuppression(), true);
  assert.equal(controller.consumeClickSuppression(), false);
});

test("horizontal drag scroll leaves ordinary clicks untouched", () => {
  const controller = createHorizontalDragScrollController({ dragThresholdPx: 4 });
  const target = {
    scrollLeft: 120,
    capturedPointerId: 0,
    setPointerCapture(pointerId: number) {
      this.capturedPointerId = pointerId;
    },
  };

  controller.onPointerDown(pointerEvent(target, 200));
  controller.onPointerMove(pointerEvent(target, 198));
  controller.onPointerUp(pointerEvent(target, 198));

  assert.equal(target.scrollLeft, 120);
  assert.equal(target.capturedPointerId, 0);
  assert.equal(controller.consumeClickSuppression(), false);
});

test("horizontal drag scroll treats small desktop click jitter as a click by default", () => {
  const controller = createHorizontalDragScrollController();
  const target = {
    scrollLeft: 120,
    capturedPointerId: 0,
    setPointerCapture(pointerId: number) {
      this.capturedPointerId = pointerId;
    },
  };

  controller.onPointerDown(pointerEvent(target, 200));
  controller.onPointerMove(pointerEvent(target, 193));
  controller.onPointerUp(pointerEvent(target, 193));

  assert.equal(target.scrollLeft, 120);
  assert.equal(target.capturedPointerId, 0);
  assert.equal(controller.consumeClickSuppression(), false);
});

test("horizontal drag scroll does not suppress a later ordinary click after drag cleanup", () => {
  const controller = createHorizontalDragScrollController({ dragThresholdPx: 4 });
  const target = { scrollLeft: 120 };

  controller.onPointerDown(pointerEvent(target, 200));
  controller.onPointerMove(pointerEvent(target, 170));
  controller.onPointerUp(pointerEvent(target, 170));

  controller.onPointerDown(pointerEvent(target, 170));
  controller.onPointerMove(pointerEvent(target, 170));
  controller.onPointerUp(pointerEvent(target, 170));

  assert.equal(controller.consumeClickSuppression(), false);
});
