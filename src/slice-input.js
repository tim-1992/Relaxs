const clamp = (value, max) => Math.max(0, Math.min(max, value));

export function pointOnSliceArena(rect, width, height, event) {
  if (!rect.width || !rect.height || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
  return {
    x: clamp((event.clientX - rect.left) / rect.width * width, width),
    y: clamp((event.clientY - rect.top) / rect.height * height, height),
  };
}

export function sliceKeyboardCommand(event) {
  if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.defaultPrevented) return null;
  const target = event.target;
  if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(target?.tagName)) return null;
  if (event.key === ' ' && !event.repeat) return 'blade';
  return {ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down'}[event.key] || null;
}

export function moveSliceCursor(cursor, keys, dt, width, height) {
  const dx = Number(keys.has('right')) - Number(keys.has('left'));
  const dy = Number(keys.has('down')) - Number(keys.has('up'));
  const distance = Math.max(320, width * .8) * dt / (Math.hypot(dx, dy) || 1);
  return {x: clamp(cursor.x + dx * distance, width), y: clamp(cursor.y + dy * distance, height)};
}
