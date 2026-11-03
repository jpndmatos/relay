const fallback = new Map<string, string>();
export function getDraft(key: string): string | null {
  try {
    return sessionStorage.getItem(key) ?? fallback.get(key) ?? null;
  } catch {
    return fallback.get(key) ?? null;
  }
}
export function saveDraft(key: string, value: string) {
  if (value) fallback.set(key, value);
  else fallback.delete(key);
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* Restricted storage still preserves a draft across in-app navigation. */
  }
}
export function getFormDraft(key: string): Record<string, string> {
  try {
    const value = JSON.parse(getDraft(key) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? (Object.fromEntries(
          Object.entries(value).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}
