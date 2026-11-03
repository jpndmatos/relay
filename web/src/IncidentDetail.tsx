import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  MessageSquare,
  RefreshCw,
  UserRound,
  X,
} from "lucide-react";
import { ApiError, isAborted, read, request } from "./api";
import {
  Badge,
  ErrorMessage,
  EventSymbol,
  SeverityBadge,
  Skeleton,
  StageIcon,
  Target,
  Time,
} from "./components";
import { formatNumber, stages, utc } from "./types";
import type { Incident, Responder, User } from "./types";
import { getDraft, saveDraft } from "./drafts";

export function IncidentDetail({
  id,
  revision,
  user,
  responders,
  close,
  changed,
}: {
  id: string;
  revision: number;
  user: User;
  responders: Responder[];
  close: () => void;
  changed: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState("comment");
  const draftKey = `relay.draft.${user.id}.${id}`;
  const [note, setNote] = useState(() => getDraft(draftKey) ?? "");
  useEffect(() => {
    saveDraft(draftKey, note);
  }, [draftKey, note]);
  const canWrite = user.role !== "Viewer";
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    read<Incident>(`/incidents/${id}`, signal)
      .then((value) => {
        if (!signal.aborted) {
          setIncident(value);
          setLoadError("");
        }
      })
      .catch((e) => {
        if (!isAborted(e)) setLoadError(e.message);
      });
    return () => controller.abort();
  }, [id, revision, retry]);
  async function mutate(action: string, data: object) {
    if (!incident) return;
    setError("");
    setBusy(true);
    try {
      const updated = await request<Incident>(
        `/incidents/${incident.id}/${action}`,
        "POST",
        { ...data, version: incident.version },
      );
      setIncident(updated);
      if (action !== "assign") {
        setNote("");
        setMode("comment");
      }
      changed();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) setRetry((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }
  function post(e: FormEvent) {
    e.preventDefault();
    void mutate(
      mode === "comment" ? "comments" : "transition",
      mode === "comment"
        ? { body: note }
        : { status: stages[stages.indexOf(incident!.status) + 1], note },
    );
  }
  const next = incident
    ? stages[stages.indexOf(incident.status) + 1]
    : undefined;
  return (
    <dialog
      ref={dialog}
      className="detail-dialog"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      aria-label={incident ? undefined : "Loading incident details"}
      aria-labelledby={incident ? "incident-detail-title" : undefined}
    >
      <div className="detail-surface">
        <div className="detail-toolbar">
          <span>{incident ? formatNumber(incident.number) : "Incident"}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Refresh incident"
            onClick={() => setRetry((n) => n + 1)}
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Close incident"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        {(error || loadError) && (
          <ErrorMessage
            message={error || loadError}
            close={() => {
              setError("");
              setLoadError("");
            }}
            retry={() => setRetry((n) => n + 1)}
          />
        )}
        {!incident ? (
          !error && !loadError && <Skeleton />
        ) : (
          <>
            <div className="detail-heading">
              <div className="badge-row">
                <SeverityBadge severity={incident.severity} />
                <Badge tone={incident.status}>
                  <StageIcon stage={incident.status} />
                  {incident.status}
                </Badge>
              </div>
              <h2 id="incident-detail-title">{incident.title}</h2>
              <p>{incident.description}</p>
            </div>
            <dl className="detail-meta">
              <div>
                <dt>Affected service</dt>
                <dd>{incident.serviceName}</dd>
              </div>
              <div>
                <dt>Resolution target</dt>
                <dd>
                  <Target incident={incident} />
                </dd>
              </div>
              <div>
                <dt>Declared</dt>
                <dd>
                  {utc(incident.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
              <div>
                <dt>
                  <label htmlFor="assignee">Responder</label>
                </dt>
                <dd>
                  {canWrite && incident.status !== "Resolved" ? (
                    <select
                      id="assignee"
                      value={incident.assigneeId ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        void mutate("assign", { assigneeId: e.target.value })
                      }
                    >
                      <option value="" disabled>
                        Unassigned
                      </option>
                      {responders.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    (incident.assigneeName ?? "Unassigned")
                  )}
                </dd>
              </div>
            </dl>
            <div
              className="stage-track"
              aria-label={`Current stage: ${incident.status}`}
            >
              {stages.map((stage, n) => (
                <div
                  className={`${n <= stages.indexOf(incident.status) ? "reached" : ""}`}
                  key={stage}
                >
                  <StageIcon stage={stage} />
                  <span>{stage}</span>
                </div>
              ))}
            </div>
            {canWrite && (
              <form className="update-form" onSubmit={post}>
                <div
                  className="update-mode"
                  role="group"
                  aria-label="Update type"
                >
                  <button
                    type="button"
                    disabled={busy}
                    className={mode === "comment" ? "selected" : ""}
                    aria-pressed={mode === "comment"}
                    onClick={() => setMode("comment")}
                  >
                    <MessageSquare size={14} aria-hidden="true" />
                    Add update
                  </button>
                  {next && (
                    <button
                      type="button"
                      disabled={busy}
                      className={mode === "transition" ? "selected" : ""}
                      aria-pressed={mode === "transition"}
                      onClick={() => setMode("transition")}
                    >
                      <ArrowRight size={14} aria-hidden="true" />
                      Move to {next.toLowerCase()}
                    </button>
                  )}
                </div>
                {mode === "transition" && !incident.assigneeId && (
                  <p className="form-help">
                    <UserRound size={14} aria-hidden="true" />
                    Assign a responder above before moving to the next stage.
                  </p>
                )}
                <label className="visually-hidden" htmlFor="incident-note">
                  {mode === "comment" ? "Incident update" : "Stage update"}
                </label>
                <textarea
                  id="incident-note"
                  name="note"
                  rows={3}
                  value={note}
                  disabled={busy}
                  onChange={(e) => setNote(e.target.value)}
                  required
                  minLength={mode === "comment" ? 3 : 12}
                  maxLength={4000}
                  placeholder={
                    mode === "comment"
                      ? "Share what you know. Keep the team in the loop."
                      : "What changed? Explain the mitigation or recovery."
                  }
                />
                <div className="update-submit">
                  <span>
                    {note && !busy
                      ? "Draft saved in this tab"
                      : `Posted as ${user.name.split(" ")[0]}`}
                  </span>
                  <button
                    type="submit"
                    className="button primary"
                    disabled={
                      busy || (mode === "transition" && !incident.assigneeId)
                    }
                  >
                    {busy
                      ? "Saving…"
                      : mode === "comment"
                        ? "Post update"
                        : `Mark ${next?.toLowerCase()}`}
                  </button>
                </div>
              </form>
            )}
            <section className="timeline-section">
              <div className="section-heading">
                <h3>Incident timeline</h3>
                <span>{incident.events.length} events</span>
              </div>
              <ol className="timeline">
                {[...incident.events]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((e) => (
                    <li key={e.id}>
                      <EventSymbol kind={e.kind} />
                      <div className="timeline-content">
                        <div className="timeline-meta">
                          <strong>{e.actor}</strong>
                          <Time value={e.createdAt} />
                        </div>
                        {e.kind === "status" && (
                          <Badge tone={e.status}>
                            <StageIcon stage={e.status} />
                            {e.status}
                          </Badge>
                        )}
                        <p>{e.body}</p>
                      </div>
                    </li>
                  ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </dialog>
  );
}
