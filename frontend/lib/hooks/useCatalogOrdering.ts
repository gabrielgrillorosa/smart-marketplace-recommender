import { useAppStore } from '@/store';

export function useCatalogOrdering() {
  const ordered = useAppStore((s) => s.ordered);
  const setOrdered = useAppStore((s) => s.setOrdered);

  function toggle() {
    setOrdered(!ordered);
  }

  function reset() {
    setOrdered(false);
  }

  return { ordered, toggle, reset };
}
