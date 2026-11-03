import { beforeEach, expect, it, vi } from "vitest";
import { getDraft, getFormDraft, saveDraft } from "./drafts";
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
});
it("restores user-scoped drafts and removes a committed draft", () => {
  const key = crypto.randomUUID();
  saveDraft(key, "Investigating the upstream pool.");
  expect(getDraft(key)).toBe("Investigating the upstream pool.");
  expect(getDraft(`${key}-another-user`)).toBeNull();
  saveDraft(key, "");
  expect(getDraft(key)).toBeNull();
});
it("keeps in-app drafts usable if browser storage is restricted", () => {
  vi.stubGlobal("sessionStorage", {
    getItem() {
      throw new Error("Storage blocked");
    },
    setItem() {
      throw new Error("Storage blocked");
    },
    removeItem() {
      throw new Error("Storage blocked");
    },
  });
  const key = crypto.randomUUID();
  saveDraft(key, "Retain my update");
  expect(getDraft(key)).toBe("Retain my update");
});
it("recovers malformed form storage and only accepts string fields", () => {
  const key = crypto.randomUUID();
  saveDraft(key, "{invalid");
  expect(getFormDraft(key)).toEqual({});
  saveDraft(
    key,
    JSON.stringify({ title: "Valid title", injected: { nested: true } }),
  );
  expect(getFormDraft(key)).toEqual({ title: "Valid title" });
});
