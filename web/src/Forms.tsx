import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { request } from "./api";
import { ErrorMessage } from "./components";
import type { Incident, NewIncident, NewService, Service } from "./types";
import { getFormDraft, saveDraft } from "./drafts";

export function IncidentForm({
  services,
  userId,
  done,
  close,
}: {
  services: Service[];
  userId: string;
  done: (incident: Incident) => void;
  close: () => void;
}) {
  const draftKey = `relay.form.incident.${userId}`;
  const [draft] = useState(() => getFormDraft(draftKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef(draft._key ?? crypto.randomUUID());
  const previousPayload = useRef(draft._payload ?? "");
  const persist = (form: HTMLFormElement) =>
    saveDraft(
      draftKey,
      JSON.stringify({
        ...Object.fromEntries(new FormData(form)),
        _key: idempotencyKey.current,
        _payload: previousPayload.current,
      }),
    );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const input: NewIncident = {
      title: String(data.get("title")),
      description: String(data.get("description")),
      serviceId: String(data.get("serviceId")),
      severity: data.get("severity") as NewIncident["severity"],
    };
    const payload = JSON.stringify(input);
    if (previousPayload.current && previousPayload.current !== payload)
      idempotencyKey.current = crypto.randomUUID();
    previousPayload.current = payload;
    persist(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const created = await request<Incident>(
        "/incidents",
        "POST",
        input,
        idempotencyKey.current,
      );
      saveDraft(draftKey, "");
      done(created);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="create-panel" aria-labelledby="create-title">
      <div className="section-heading">
        <h2 id="create-title">Declare an incident</h2>
        <button
          type="button"
          className="icon-button"
          disabled={busy}
          onClick={close}
          aria-label="Close incident form"
        >
          <X size={18} />
        </button>
      </div>
      <p>
        Start with the impact. You can coordinate the response once it is
        declared.
      </p>
      <form
        onSubmit={submit}
        onChange={(e) => persist(e.currentTarget)}
        className="incident-form"
      >
        <fieldset className="form-fields" disabled={busy}>
          <label className="form-wide">
            Incident title <span className="field-required">Required</span>
            <input
              autoFocus
              name="title"
              defaultValue={draft.title}
              required
              minLength={5}
              maxLength={160}
              placeholder="Elevated error rate in checkout"
              autoComplete="off"
            />
          </label>
          <label>
            Affected service{" "}
            <select
              name="serviceId"
              required
              defaultValue={
                services.some((s) => s.id === draft.serviceId)
                  ? draft.serviceId
                  : ""
              }
            >
              <option value="" disabled>
                Select a service
              </option>
              {services.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Severity{" "}
            <select
              name="severity"
              aria-label="Severity"
              defaultValue={draft.severity ?? "Major"}
            >
              <option value="Critical">Critical (30 min target)</option>
              <option value="Major">Major (2 hour target)</option>
              <option value="Minor">Minor (8 hour target)</option>
            </select>
          </label>
          <label className="form-wide">
            Impact and context <span className="field-required">Required</span>
            <textarea
              name="description"
              defaultValue={draft.description}
              required
              minLength={12}
              maxLength={4000}
              rows={3}
              placeholder="What is affected, and what do we know so far?"
            />
          </label>
          {error && (
            <div className="form-wide">
              <ErrorMessage message={error} />
            </div>
          )}
          <div className="form-actions form-wide">
            <span>
              Draft kept in this tab. The clock starts when you declare.
            </span>
            <button
              type="button"
              className="button"
              onClick={close}
              disabled={busy}
            >
              Close
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              <Plus size={16} aria-hidden="true" />
              {busy ? "Declaring…" : "Declare incident"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

export function ServiceForm({
  done,
  close,
}: {
  done: () => void;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    const input = Object.fromEntries(fields) as unknown as NewService;
    setBusy(true);
    setError("");
    try {
      await request("/services", "POST", input);
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="create-panel" aria-labelledby="service-form-title">
      <div className="section-heading">
        <h2 id="service-form-title">Register a service</h2>
        <button
          type="button"
          className="icon-button"
          disabled={busy}
          onClick={close}
          aria-label="Close service form"
        >
          <X size={18} />
        </button>
      </div>
      <form onSubmit={submit} className="incident-form">
        <fieldset className="form-fields" disabled={busy}>
          <label>
            Service name
            <input
              autoFocus
              name="name"
              required
              minLength={3}
              maxLength={80}
              placeholder="Search API"
            />
          </label>
          <label>
            Owning team
            <input
              name="team"
              required
              minLength={2}
              maxLength={80}
              placeholder="Platform"
            />
          </label>
          <label>
            Description
            <input
              name="description"
              required
              minLength={12}
              maxLength={240}
              placeholder="Search endpoints and indexing workloads"
            />
          </label>
          <label>
            Service tier
            <select name="tier" defaultValue="Core">
              <option>Critical</option>
              <option>Core</option>
              <option>Standard</option>
            </select>
          </label>
          {error && (
            <div className="form-wide">
              <ErrorMessage message={error} />
            </div>
          )}
          <div className="form-actions form-wide">
            <button
              type="button"
              className="button"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? "Registering…" : "Register service"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
