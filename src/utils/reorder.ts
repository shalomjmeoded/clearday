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
