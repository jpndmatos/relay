import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoRequest, initialWorkspace } from "./demo";
import { targetLabel, utc } from "./types";
import type { Incident, Page, Service } from "./types";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
async function login(role = "Commander") {
  await demoRequest("/session/demo", "POST", { role });
}

describe("the portfolio demo preserves the API rules", () => {
  it("requires authentication for private data", async () => {
    await expect(demoRequest("/incidents")).rejects.toMatchObject({
      status: 401,
    });
    const status = await demoRequest<{ incidents: Record<string, unknown>[] }>(
      "/status",
    );
    expect(
      status.incidents.every((i) => !("events" in i) && !("assigneeName" in i)),
    ).toBe(true);
  });
  it("persists incident creation and retries the same key once", async () => {
    await login();
    const services = await demoRequest<Service[]>("/services");
    const input = {
      title: "Checkout queue integration",
      description: "Checkout requests are timing out for customers.",
      serviceId: services[0].id,
      severity: "Major",
    };
    const key = crypto.randomUUID();
    const created = await demoRequest<Incident>(
      "/incidents",
      "POST",
      input,
      key,
    );
    const retry = await demoRequest<Incident>("/incidents", "POST", input, key);
    expect(retry.id).toBe(created.id);
    const loaded = await demoRequest<Incident>(`/incidents/${created.id}`);
    expect(loaded.title).toBe(input.title);
    await expect(
      demoRequest(
        "/incidents",
        "POST",
        { ...input, title: "Different title" },
        key,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("enforces viewer permissions", async () => {
    await login("Viewer");
    await expect(
      demoRequest("/incidents", "POST", {}, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(demoRequest("/services")).resolves.toBeDefined();
  });
  it("rejects stale writes and invalid stage skips", async () => {
    await login();
    const list = await demoRequest<Page<Incident>>("/incidents?status=active");
    const incident = list.items[0];
    const updated = await demoRequest<Incident>(
      `/incidents/${incident.id}/comments`,
      "POST",
      { body: "Investigating upstream traffic.", version: incident.version },
    );
    expect(updated.version).toBe(incident.version + 1);
    await expect(
      demoRequest(`/incidents/${incident.id}/comments`, "POST", {
        body: "Stale comment",
        version: incident.version,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      demoRequest(`/incidents/${incident.id}/transition`, "POST", {
        status: "Resolved",
        note: "Attempt to skip monitoring.",
        version: updated.version,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("applies filters and pagination together", async () => {
    await login();
    const result = await demoRequest<Page<Incident>>(
      "/incidents?status=active&severity=Critical&q=CHECKOUT",
    );
    expect(result.total).toBe(1);
    expect(result.items[0].severity).toBe("Critical");
    const all = await demoRequest<Page<Incident>>(
      "/incidents?status=all&page=2",
    );
    expect(all.items.length).toBeGreaterThan(0);
    expect(all.page).toBe(2);
  });
  it("does not let responders register a service", async () => {
    await login("Responder");
    await expect(demoRequest("/services", "POST", {})).rejects.toMatchObject({
      status: 403,
    });
  });
  it("recovers a corrupt browser workspace without a blank screen", async () => {
    localStorage.setItem("relay.workspace.v1", "{broken");
    await login();
    const list = await demoRequest<Page<Incident>>("/incidents");
    expect(list.total).toBeGreaterThan(0);
  });
});

describe("UTC and target formatting", () => {
  it("interprets SQLite timestamps as UTC", () =>
    expect(utc("2026-11-03T12:00:00").toISOString()).toBe(
      "2026-11-03T12:00:00.000Z",
    ));
  it("shows resolved targets separately from overdue clocks", () => {
    const incident = initialWorkspace().incidents[0];
    expect(
      targetLabel({ ...incident, status: "Resolved", slaBreached: false }),
    ).toBe("Target met");
    expect(
      targetLabel({ ...incident, status: "Resolved", slaBreached: true }),
    ).toBe("Resolved late");
  });
});
