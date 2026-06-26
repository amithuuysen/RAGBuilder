/** Normalize tags from API (array, JSON string, or comma-separated). */
export function normalizeTags(tags: unknown): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
  if (typeof tags === "string") {
    const trimmed = tags.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [String(parsed)];
      } catch {
        // fall through to comma split
      }
    }
    return trimmed.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return [];
}
