export function placement(previous, moving, tolerance) {
  const left = Math.max(previous.x, moving.x);
  const right = Math.min(previous.x + previous.width, moving.x + moving.width);
  const width = Math.max(0, right - left);
  if (width === 0) return { kind: 'miss', x: moving.x, width: 0, cut: null };
  if (Math.abs(moving.x - previous.x) <= tolerance) {
    return { kind: 'perfect', x: previous.x, width: previous.width, cut: null };
  }
  const cut = moving.x < previous.x
    ? { x: moving.x, width: left - moving.x, direction: -1 }
    : { x: right, width: moving.x + moving.width - right, direction: 1 };
  return { kind: 'normal', x: left, width, cut };
}
