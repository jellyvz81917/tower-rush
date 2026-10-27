export const CONFIG = Object.freeze({
  worldWidth: 360000,
  margin: 12000,
  initialWidth: 216000,
  initialX: 72000,
  tickMs: 1000 / 120,
  maxFrameMs: 50,
  maxSteps: 6,
  settlingTicks: 22,
  visibleBlocks: 80,
  floorHeight: 24,
  maxDpr: 2,
  maxCount: 2000000000,
});

export const stepForFloor = n => Math.min(1600 + 40 * (n - 1), 3200);
export const toleranceForFloor = (n, width) => Math.min(
  Math.max(6000 - 500 * Math.floor((n - 1) / 10), 2000),
  Math.floor(width / 10),
);
