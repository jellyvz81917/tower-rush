export function bindInput(canvas, place) {
  const held = new Set();
  let pointer = null;
  const down = event => {
    if (!event.isPrimary || event.button !== 0 || pointer !== null) return;
    event.preventDefault();
    pointer = event.pointerId;
    canvas.focus({ preventScroll: true });
    place();
  };
  const up = event => { if (event.pointerId === pointer) pointer = null; };
  const keydown = event => {
    if (!['Space', 'Enter'].includes(event.code)) return;
    event.preventDefault();
    if (event.repeat || held.has(event.code)) return;
    held.add(event.code);
    place();
  };
  const keyup = event => held.delete(event.code);
  canvas.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  canvas.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  return { clear() { held.clear(); pointer = null; } };
}
