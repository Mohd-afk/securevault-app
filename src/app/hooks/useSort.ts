import { useState, useMemo } from 'react';
import type { VaultItem } from '../store';

export type SortOption =
  | 'title-asc'
  | 'title-desc'
  | 'modified-new'
  | 'modified-old'
  | 'created-new'
  | 'created-old'
  | 'size-asc';

export const SORT_LABELS: Record<SortOption, string> = {
  'title-asc': 'Title ↑',
  'title-desc': 'Title ↓',
  'modified-new': 'Modified ↑',
  'modified-old': 'Modified ↓',
  'created-new': 'Created ↑',
  'created-old': 'Created ↓',
  'size-asc': 'Size ↑',
};

function sortItems(items: VaultItem[], option: SortOption): VaultItem[] {
  const sorted = [...items];
  switch (option) {
    case 'title-asc':
      return sorted.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
      );
    case 'title-desc':
      return sorted.sort((a, b) =>
        b.title.localeCompare(a.title, undefined, { sensitivity: 'base' }),
      );
    case 'modified-new':
      return sorted.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    case 'modified-old':
      return sorted.sort(
        (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      );
    case 'created-new':
      return sorted.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    case 'created-old':
      return sorted.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    case 'size-asc':
      // Sort by password byte length (proxy for "size")
      return sorted.sort(
        (a, b) => a.password.length - b.password.length,
      );
    default:
      return sorted;
  }
}

/**
 * useSort — returns sorted items and controls.
 * Default: 'created-new' (matches reference screenshot).
 */
export function useSort(items: VaultItem[], initial: SortOption = 'created-new') {
  const [sortOption, setSortOption] = useState<SortOption>(initial);
  const sortedItems = useMemo(
    () => sortItems(items, sortOption),
    [items, sortOption],
  );
  return { sortedItems, sortOption, setSortOption };
}
