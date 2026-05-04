import { useMemo } from 'react';
import type { VaultItem } from '../store';

/**
 * Tokenized fuzzy search across title, URL, and username simultaneously.
 *
 * Example: "goo acc 123" will find a Google item whose username contains
 * "acc" and where the URL contains "123" or vice-versa — any token can
 * match any field.
 */
export function useSmartSearch(items: VaultItem[], query: string): VaultItem[] {
  return useMemo(() => {
    if (!query.trim()) return items;

    const tokens = query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return items.filter((item) => {
      const fields = [
        item.title.toLowerCase(),
        item.username.toLowerCase(),
        item.url.toLowerCase(),
        item.note.toLowerCase(),
        item.type.toLowerCase(),
      ];

      // Every token must match at least one field
      return tokens.every((token) =>
        fields.some((field) => field.includes(token)),
      );
    });
  }, [items, query]);
}
