'use client';

import React, { useLayoutEffect, useRef } from 'react';

export interface ReorderableGridProps<T> {
  items: T[];
  getKey: (item: T) => string;
  getScore: (item: T) => number | undefined;
  renderItem: (item: T) => React.ReactNode;
  ordered: boolean;
}

export function ReorderableGrid<T>({
  items,
  getKey,
  getScore,
  renderItem,
  ordered,
}: ReorderableGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevPositionsRef = useRef<Map<string, DOMRect>>(new Map());

  const displayItems = ordered
    ? [...items].sort((a, b) => {
        const sa = getScore(a) ?? -1;
        const sb = getScore(b) ?? -1;
        return sb - sa;
      })
    : items;

  // FIRST: snapshot positions before the render cycle commits
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new Map<string, DOMRect>();
    container.querySelectorAll<HTMLElement>('[data-reorderable-key]').forEach((el) => {
      const key = el.dataset.reorderableKey!;
      map.set(key, el.getBoundingClientRect());
    });
    prevPositionsRef.current = map;
  });

  // LAST: apply FLIP deltas after DOM has moved to new positions
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const prev = prevPositionsRef.current;
    if (prev.size === 0) return;

    container.querySelectorAll<HTMLElement>('[data-reorderable-key]').forEach((el) => {
      const key = el.dataset.reorderableKey!;
      const from = prev.get(key);
      if (!from) return;
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (dx === 0 && dy === 0) return;

      // Apply "First" position instantly
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.transition = 'none';

      requestAnimationFrame(() => {
        // Animate to "Last" position (current DOM position)
        el.style.transition = '';
        el.style.transform = '';
      });
    });
  }, [ordered]);

  return (
    <div
      ref={containerRef}
      aria-live="polite"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
    >
      {displayItems.map((item) => {
        const key = getKey(item);
        const score = getScore(item);
        return (
          <div
            key={key}
            data-reorderable-key={key}
            data-testid="reorderable-item"
            data-score={score !== undefined ? String(score) : ''}
            className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
          >
            {renderItem(item)}
          </div>
        );
      })}
    </div>
  );
}
