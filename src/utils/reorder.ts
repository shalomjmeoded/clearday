/**
 * Moves one item `delta` slots within `ids`, or returns null when the move is
 * not possible (unknown id, or already at the end it is heading for).
 *
 * Backs the "Move up"/"Move down" accessibility actions, which stand in for a
 * drag gesture no screen reader can perform. Returning null rather than an
 * unchanged copy lets the caller skip the write and the haptic entirely.
 */
export function moveByOneSlot<T extends { id: string }>(
  items: T[],
  id: string,
  delta: number
): T[] | null {
  const from = items.findIndex((item) => item.id === id);
  if (from < 0) return null;
  const to = from + delta;
  if (to < 0 || to >= items.length) return null;

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Applies a reordering of a visible subset back onto the full list. The
 * visible items take each other's slots in their new order; everything that
 * was filtered out keeps its position. Dragging within a search result or a
 * filtered view therefore never renumbers the hidden tasks.
 */
export function applyPartialOrder(fullIds: string[], visibleOrdered: string[]): string[] {
  const visible = new Set(visibleOrdered);
  const slots = fullIds.filter((id) => visible.has(id));
  if (slots.length === 0) return fullIds;
  // Ids that are visible but somehow absent from the full list go to the end.
  const extra = visibleOrdered.filter((id) => !slots.includes(id));
  const queue = [...visibleOrdered.filter((id) => slots.includes(id))];
  const result = fullIds.map((id) => (visible.has(id) ? queue.shift()! : id));
  return [...result, ...extra];
}
