import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  LogOut,
  Plus,
  Radio,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  ApiError,
  isAborted,
  isLocalDemo,
  read,
  request,
  subscribe,
} from "./api";
import {
  Badge,
  Breadcrumb,
  Empty,
  ErrorMessage,
  EventSymbol,
  SeverityBadge,
  Skeleton,
  StageIcon,
  Target,
  Time,
} from "./components";
import { useWorkspace } from "./useWorkspace";
import { WorkspaceLoading } from "./WorkspaceLoading";
import { ServiceWatch } from "./ServiceWatch";
import { getFilters } from "./navigation";
import { formatNumber, utc } from "./types";
import type {
  Filters,
  Incident,
  Overview,
  Role,
  Service,
  Session,
  User,
} from "./types";

const loadDetail = () => import("./IncidentDetail");
const loadForms = () => import("./Forms");
const IncidentDetail = lazy(() =>
  loadDetail().then((module) => ({ default: module.IncidentDetail })),
);
const IncidentForm = lazy(() =>
  loadForms().then((module) => ({ default: module.IncidentForm })),
);
const ServiceForm = lazy(() =>
  loadForms().then((module) => ({ default: module.ServiceForm })),
);

const sourceUrl =
  import.meta.env.VITE_SOURCE_URL ||
  "https://jpndmatos.github.io/Portfolio/assets/downloads/relay-source.zip";
const blankFilters: Filters = {
  q: "",
  status: "active",
  severity: "",
  serviceId: "",
  assigneeId: "",
  page: 1,
};
function readParams() {
  return new URLSearchParams(window.location.search);
}
function Logo() {
  return (
    <>
      <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M6 7h10a6 6 0 0 1 0 12h-4M6 13v12m10-6 9 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="square"
        />
      </svg>
      <span>relay</span>
    </>
  );
}

export default function App() {
  const [params, setParams] = useState(readParams);
  const rawView = params.get("view");
  const view =
    rawView && ["services", "activity", "status"].includes(rawView)
      ? rawView
      : "incidents";
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [revision, setRevision] = useState(0);
  const [publicData, setPublicData] = useState<{
    services: Service[];
    incidents: Pick<
      Incident,
      "id" | "title" | "severity" | "status" | "serviceId" | "updatedAt"
    >[];
  } | null>(null);
  const [publicLoading, setPublicLoading] = useState(true);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("Connecting");
  const [creating, setCreating] = useState(false);
  const [newService, setNewService] = useState(false);
  const [switching, setSwitching] = useState(false);
  const filters = getFilters(params);
  const filtersKey = JSON.stringify(filters);
  const workspace = useWorkspace(
    view === "status" ? undefined : session?.user?.id,
    filtersKey,
    revision,
  );
  const { data } = workspace;
  const loading = view === "status" ? publicLoading : workspace.loading;
  const visibleError = error || (view !== "status" ? workspace.error : "");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // A commit and its SignalR echo can arrive together. Reconcile that burst once.
  const refresh = useCallback(() => {
    if (document.hidden || !navigator.onLine) return;
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(
      () => setRevision((n) => n + 1),
      60,
    );
  }, []);
  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);
  const updateParams = useCallback(
    (values: Record<string, string | number | null>, replace = false) => {
      const next = readParams();
      Object.entries(values).forEach(([key, value]) =>
        value === null || value === ""
          ? next.delete(key)
          : next.set(key, String(value)),
      );
      const query = next.toString();
      const url = window.location.pathname + (query ? `?${query}` : "");
      window.history[replace ? "replaceState" : "pushState"]({}, "", url);
      setParams(next);
    },
    [],
  );
  const setFilters = (values: Partial<Filters>) =>
    updateParams({ page: null, ...values }, true);
  const clearFilters = () =>
    updateParams(
      Object.fromEntries(Object.keys(blankFilters).map((key) => [key, null])),
      true,
    );
  const openIncident = useCallback(
    (id: string) => {
      void loadDetail().catch(() => {});
      updateParams({ incident: id });
    },
    [updateParams],
  );
  useEffect(() => {
    const listener = () => setParams(readParams());
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  const loadSession = useCallback(async () => {
    setSessionError("");
    try {
      setSession(await request<Session>("/session"));
    } catch (e) {
      setSessionError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void loadSession();
    const expired = () => {
      setSession(null);
      void loadSession();
    };
    window.addEventListener("relay:expired", expired);
    return () => window.removeEventListener("relay:expired", expired);
  }, [loadSession]);
  useEffect(() => {
    if (!session?.user) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    subscribe(refresh, (state) => {
      if (!disposed) setConnection(state);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else stop = cleanup;
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [session?.user?.id, refresh]);
  useEffect(() => {
    if (!session?.user && view !== "status") return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const pause = () => {
      window.clearInterval(timer);
      timer = undefined;
    };
    const resume = (reconcile: boolean) => {
      pause();
      if (!document.hidden && navigator.onLine) {
        if (reconcile) refresh();
        timer = window.setInterval(refresh, 30_000);
      }
    };
    const onResume = () => resume(true);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("online", onResume);
    window.addEventListener("offline", pause);
    resume(false);
    return () => {
      pause();
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("online", onResume);
      window.removeEventListener("offline", pause);
    };
  }, [session?.user?.id, view, refresh]);
  useEffect(() => {
    if (view !== "status") return;
    const controller = new AbortController();
    const { signal } = controller;
    setPublicLoading(true);
    read<typeof publicData>("/status", signal)
      .then((value) => {
        if (!signal.aborted) {
          setPublicData(value);
          setError("");
        }
      })
      .catch((e) => {
        if (!isAborted(e)) setError(e.message);
      })
      .finally(() => {
        if (!signal.aborted) setPublicLoading(false);
      });
    return () => controller.abort();
  }, [view, revision]);
  async function changeRole(role: Role) {
    setSwitching(true);
    setError("");
    setCreating(false);
    setNewService(false);
    try {
      await request("/session/demo", "POST", { role });
      await loadSession();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSwitching(false);
    }
  }
  async function logout() {
    try {
      await request("/session/logout", "POST");
      await loadSession();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const user = session?.user;
  const canWrite = user && user.role !== "Viewer";
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("dialog")) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        view === "incidents" &&
        user
      ) {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>('input[name="search"]')
          ?.focus();
      }
      if (
        event.altKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "n" &&
        view === "incidents" &&
        canWrite
      ) {
        event.preventDefault();
        void loadForms().catch(() => {});
        setCreating(true);
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [view, !!user, canWrite]);
  const serviceFilter = (id: string) => {
    setCreating(false);
    updateParams({
      view: "incidents",
      serviceId: id,
      status: "active",
      page: null,
      incident: null,
    });
  };
  const nav = (target: string) => {
    setCreating(false);
    setNewService(false);
    updateParams({
      view: target === "incidents" ? null : target,
      incident: null,
    });
  };

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <a
            className="brand"
            href={window.location.pathname}
            aria-label="Relay home"
          >
            <Logo />
          </a>
          <span className="workspace-label">Incident workspace</span>
          <nav aria-label="Workspace navigation">
            <button
              type="button"
              aria-current={view === "incidents" ? "page" : undefined}
              className={view === "incidents" ? "active" : ""}
              onClick={() => nav("incidents")}
            >
              Incidents
            </button>
            <button
              type="button"
              aria-current={view === "services" ? "page" : undefined}
              className={view === "services" ? "active" : ""}
              onClick={() => nav("services")}
            >
              Services
            </button>
            <button
              type="button"
              aria-current={view === "activity" ? "page" : undefined}
              className={view === "activity" ? "active" : ""}
              onClick={() => nav("activity")}
            >
              Activity
            </button>
            <button
              type="button"
              aria-current={view === "status" ? "page" : undefined}
              className={view === "status" ? "active" : ""}
              onClick={() => nav("status")}
            >
              Status page
              <ArrowUpRight size={12} aria-hidden="true" />
            </button>
          </nav>
          {!session && (
            <div className="user-menu pending-user" aria-hidden="true">
              <span className="avatar" />
              <span />
            </div>
          )}
          {user && (
            <div className="user-menu">
              <span className="avatar">
                {user.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <strong>{user.name}</strong>
                {session.demoEnabled ? (
                  <select
                    aria-label="Demo role"
                    value={user.role}
                    onChange={(e) => void changeRole(e.target.value as Role)}
                    disabled={switching}
                  >
                    <option>Commander</option>
                    <option>Responder</option>
                    <option>Viewer</option>
                  </select>
                ) : (
                  <small>{user.role}</small>
                )}
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => void logout()}
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="demo-bar" role="region" aria-label="Workspace mode">
        <div className="demo-bar-inner">
          <ShieldCheck size={15} aria-hidden="true" />
          <strong>
            {isLocalDemo
              ? "Interactive demo"
              : !session
                ? "Connecting workspace"
                : session.demoEnabled
                  ? "Demo workspace"
                  : "Private workspace"}
          </strong>
          <span>
            {isLocalDemo
              ? "Sample data, saved in this browser. The full app runs on .NET."
              : !session
                ? "Loading your workspace session."
                : session.demoEnabled
                  ? "Sample data, persisted in SQLite. Choose a role to explore permissions."
                  : "Your team’s incidents, service health and recovery updates."}
          </span>
          {isLocalDemo && user && (
            <button
              type="button"
              className="demo-reset"
              aria-label="Reset demo workspace"
              title="Reset demo workspace"
              onClick={async () => {
                if (
                  window.confirm(
                    "Reset all local demo changes and restore the sample workspace?",
                  )
                ) {
                  const { resetDemo } = await import("./demo");
                  resetDemo();
                  refresh();
                }
              }}
            >
              <RotateCcw size={12} aria-hidden="true" />
              <span className="reset-label">Reset</span>
            </button>
          )}
        </div>
      </div>
      <main id="main" className="app-container">
        {sessionError && (
          <ErrorMessage
            message={sessionError}
            retry={() => void loadSession()}
          />
        )}
        {!session && !sessionError && view !== "status" && (
          <WorkspaceLoading shell />
        )}
        {visibleError && (
          <ErrorMessage message={visibleError} retry={refresh} />
        )}
        {view === "status" ? (
          <StatusView data={publicData} loading={loading} />
        ) : session && !user ? (
          <Login demoEnabled={session.demoEnabled} signedIn={loadSession} />
        ) : (
          user && (
            <>
              <div className="page-heading">
                <div>
                  <Breadcrumb>
                    {view === "services"
                      ? "Service directory"
                      : view === "activity"
                        ? "Activity"
                        : "Incidents"}
                  </Breadcrumb>
                  <h1>
                    {view === "services"
                      ? "Services"
                      : view === "activity"
                        ? "Activity"
                        : "Incidents"}
                  </h1>
                  <p>
                    {view === "services"
                      ? "Service health, ownership and impact in one place."
                      : view === "activity"
                        ? "A shared record of the decisions that get you back online."
                        : "Triage the impact. Find the owner. Get back to normal."}
                  </p>
                </div>
                {view === "incidents" && canWrite && (
                  <button
                    type="button"
                    className="button primary"
                    onPointerEnter={() => void loadForms().catch(() => {})}
                    onFocus={() => void loadForms().catch(() => {})}
                    onClick={() => setCreating((v) => !v)}
                    aria-expanded={creating}
                    aria-keyshortcuts="Alt+Shift+n"
                    title="Declare incident (Alt+Shift+N)"
                  >
                    <Plus size={16} aria-hidden="true" />
                    Declare incident
                  </button>
                )}
                {view === "services" && user.role === "Commander" && (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => setNewService((v) => !v)}
                    aria-expanded={newService}
                  >
                    <Plus size={16} aria-hidden="true" />
                    Register service
                  </button>
                )}
              </div>
              {user.role === "Viewer" && (
                <div className="viewer-note">
                  <ShieldCheck size={16} aria-hidden="true" />
                  You are viewing this workspace with read-only permissions.
                </div>
              )}
              <Suspense
                fallback={
                  <div className="form-loading" role="status">
                    Opening form…
                  </div>
                }
              >
                {creating && data && (
                  <IncidentForm
                    userId={user.id}
                    services={data.services}
                    close={() => setCreating(false)}
                    done={(incident) => {
                      setCreating(false);
                      refresh();
                      openIncident(incident.id);
                    }}
                  />
                )}
                {newService && (
                  <ServiceForm
                    close={() => setNewService(false)}
                    done={() => {
                      setNewService(false);
                      refresh();
                    }}
                  />
                )}
              </Suspense>
              {!data && loading ? (
                <WorkspaceLoading />
              ) : (
                data && (
                  <>
                    {view === "incidents" && (
                      <>
                        <dl className="metrics">
                          <div>
                            <dt>Active incidents</dt>
                            <dd>
                              {data.overview.active}
                              <span>across your services</span>
                            </dd>
                          </div>
                          <div>
                            <dt>Critical right now</dt>
                            <dd
                              className={
                                data.overview.critical ? "critical-value" : ""
                              }
                            >
                              {data.overview.critical}
                              <span>needs immediate attention</span>
                            </dd>
                          </div>
                          <div>
                            <dt>Resolution targets</dt>
                            <dd>
                              {data.overview.overdue}
                              <span>overdue incidents</span>
                            </dd>
                          </div>
                          <div>
                            <dt>Mean recovery, 7 days</dt>
                            <dd>
                              {data.overview.meanResolutionMinutes ?? "—"}
                              {data.overview.meanResolutionMinutes !== null && (
                                <small>min</small>
                              )}
                              <span>
                                {data.overview.resolvedThisWeek} incidents
                                resolved
                              </span>
                            </dd>
                          </div>
                        </dl>
                        <div className="workspace-grid">
                          <section
                            className="queue-panel"
                            aria-labelledby="queue-title"
                            aria-busy={loading}
                          >
                            <div className="queue-heading">
                              <h2 id="queue-title">
                                Incident queue{" "}
                                <span>{data.incidents.total}</span>
                              </h2>
                              <span className="connection" role="status">
                                <Radio size={13} aria-hidden="true" />
                                {loading ? "Updating…" : connection}
                              </span>
                            </div>
                            <QueueFilters
                              filters={filters}
                              setFilters={setFilters}
                              services={data.services}
                              user={user}
                            />
                            {loading && (
                              <span className="visually-hidden" role="status">
                                Refreshing incident queue
                              </span>
                            )}
                            {data.incidents.items.length === 0 ? (
                              <Empty title="The queue is clear">
                                No incidents match this view. Change a filter to
                                see the rest of the workspace.
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={clearFilters}
                                >
                                  Clear filters
                                </button>
                              </Empty>
                            ) : (
                              <div
                                className="table-wrap"
                                tabIndex={0}
                                role="region"
                                aria-label="Workspace table"
                              >
                                <table className="incident-table">
                                  <thead>
                                    <tr>
                                      <th scope="col">Incident</th>
                                      <th scope="col">Severity</th>
                                      <th scope="col">Status</th>
                                      <th scope="col">Owner / target</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {data.incidents.items.map((incident) => (
                                      <tr key={incident.id}>
                                        <td>
                                          <button
                                            type="button"
                                            className="incident-link"
                                            onPointerEnter={() =>
                                              void loadDetail().catch(() => {})
                                            }
                                            onFocus={() =>
                                              void loadDetail().catch(() => {})
                                            }
                                            onClick={() =>
                                              openIncident(incident.id)
                                            }
                                          >
                                            <span className="incident-number">
                                              {formatNumber(incident.number)}
                                            </span>
                                            <strong>{incident.title}</strong>
                                            <span className="incident-subline">
                                              {incident.serviceName}
                                              <span aria-hidden="true">/</span>
                                              <Time
                                                value={incident.createdAt}
                                              />
                                            </span>
                                          </button>
                                        </td>
                                        <td>
                                          <SeverityBadge
                                            severity={incident.severity}
                                          />
                                        </td>
                                        <td>
                                          <span
                                            className={`stage-label ${incident.status.toLowerCase()}`}
                                          >
                                            <StageIcon
                                              stage={incident.status}
                                            />
                                            {incident.status}
                                          </span>
                                        </td>
                                        <td>
                                          <span className="owner-label">
                                            {incident.assigneeName ??
                                              "Unassigned"}
                                          </span>
                                          <Target incident={incident} />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <div className="queue-footer">
                              {data.incidents.items.length > 0 &&
                                (filters.q ||
                                  filters.severity ||
                                  filters.serviceId ||
                                  filters.assigneeId) && (
                                  <button
                                    type="button"
                                    className="text-button clear-filters"
                                    onClick={clearFilters}
                                  >
                                    Clear filters
                                    <X size={12} aria-hidden="true" />
                                  </button>
                                )}
                              <span>
                                {data.incidents.total === 0
                                  ? "No matching incidents"
                                  : `${(filters.page - 1) * data.incidents.pageSize + 1}–${Math.min(filters.page * data.incidents.pageSize, data.incidents.total)} of ${data.incidents.total} incidents`}
                              </span>
                              <div>
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label="Previous page"
                                  disabled={filters.page <= 1}
                                  onClick={() =>
                                    setFilters({ page: filters.page - 1 })
                                  }
                                >
                                  <ChevronLeft size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label="Next page"
                                  disabled={
                                    filters.page * data.incidents.pageSize >=
                                    data.incidents.total
                                  }
                                  onClick={() =>
                                    setFilters({ page: filters.page + 1 })
                                  }
                                >
                                  <ChevronRight size={16} />
                                </button>
                              </div>
                            </div>
                          </section>
                          <ServiceWatch
                            services={data.services}
                            responders={data.responders}
                            userId={user.id}
                            filter={serviceFilter}
                            directory={() => nav("services")}
                          />
                        </div>
                      </>
                    )}
                    {view === "services" && (
                      <section className="directory">
                        <div className="section-heading">
                          <h2>Service directory</h2>
                          <span>
                            {data.services.length} registered services
                          </span>
                        </div>
                        {!data.services.length ? (
                          <Empty title="No services registered">
                            Register your first service before declaring an
                            incident.
                          </Empty>
                        ) : (
                          <div
                            className="table-wrap"
                            tabIndex={0}
                            role="region"
                            aria-label="Workspace table"
                          >
                            <table className="service-table">
                              <thead>
                                <tr>
                                  <th scope="col">Service</th>
                                  <th scope="col">Owning team</th>
                                  <th scope="col">Tier</th>
                                  <th scope="col">Health</th>
                                  <th scope="col">Active incidents</th>
                                </tr>
                              </thead>
                              <tbody>
                                {data.services.map((service) => (
                                  <tr key={service.id}>
                                    <td>
                                      <button
                                        type="button"
                                        className="incident-link"
                                        onClick={() =>
                                          serviceFilter(service.id)
                                        }
                                      >
                                        <strong>{service.name}</strong>
                                        <span>{service.description}</span>
                                      </button>
                                    </td>
                                    <td>{service.team}</td>
                                    <td>
                                      <Badge>{service.tier}</Badge>
                                    </td>
                                    <td>
                                      <Badge tone={service.health}>
                                        {service.health === "Operational" ? (
                                          <Check size={13} />
                                        ) : (
                                          <Activity size={13} />
                                        )}
                                        {service.health}
                                      </Badge>
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className="text-button"
                                        onClick={() =>
                                          serviceFilter(service.id)
                                        }
                                      >
                                        {service.activeIncidents}
                                        <ArrowUpRight
                                          size={13}
                                          aria-hidden="true"
                                        />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <p className="directory-note">
                          Health is derived from active incidents. Resolving an
                          incident updates its affected service automatically.
                        </p>
                      </section>
                    )}
                    {view === "activity" && (
                      <div className="activity-view">
                        <RecentActivity
                          overview={data.overview}
                          openIncident={openIncident}
                        />
                        <RecoveryChart overview={data.overview} />
                      </div>
                    )}
                  </>
                )
              )}
              {params.get("incident") && data && (
                <Suspense
                  fallback={
                    <div className="detail-pending" role="status">
                      Opening incident…
                    </div>
                  }
                >
                  <IncidentDetail
                    key={params.get("incident")}
                    id={params.get("incident")!}
                    revision={revision}
                    user={user}
                    responders={data.responders}
                    close={() => updateParams({ incident: null }, true)}
                    changed={refresh}
                  />
                </Suspense>
              )}
            </>
          )
        )}
      </main>
      <footer className="app-footer">
        <span>
          Relay <span className="footer-slash">/</span> Incident response
          workspace.
        </span>
        <a href={sourceUrl} target="_blank" rel="noreferrer">
          Standalone source
          <ArrowUpRight size={12} aria-hidden="true" />
        </a>
        {!isLocalDemo && user && (
          <a href="/openapi/v1.json" target="_blank" rel="noreferrer">
            OpenAPI
            <ArrowDownToLine size={12} aria-hidden="true" />
          </a>
        )}
      </footer>
    </>
  );
}

function QueueFilters({
  filters,
  setFilters,
  services,
  user,
}: {
  filters: Filters;
  setFilters: (value: Partial<Filters>) => void;
  services: Service[];
  user: User;
}) {
  return (
    <>
      <div className="queue-tabs" role="group" aria-label="Incident view">
        {[
          ["active", "Active incidents"],
          ["Resolved", "Resolved"],
          ["all", "All incidents"],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={filters.status === value ? "selected" : ""}
            aria-pressed={filters.status === value}
            aria-label={label}
            onClick={() => setFilters({ status: value })}
          >
            <span className="full-label">{label}</span>
            <span className="compact-label">
              {value === "active" ? "Active" : value === "all" ? "All" : label}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={`mine-filter ${filters.assigneeId ? "selected" : ""}`}
          aria-pressed={!!filters.assigneeId}
          aria-label="Assigned to me"
          title="Assigned to me"
          onClick={() =>
            setFilters({ assigneeId: filters.assigneeId ? "" : user.id })
          }
        >
          <span className="full-label">Assigned to me</span>
          <span className="compact-label">Mine</span>
        </button>
      </div>
      <div className="queue-filters">
        <label className="search-input">
          <Search size={15} aria-hidden="true" />
          <span className="visually-hidden">Search incidents</span>
          <input
            name="search"
            value={filters.q}
            placeholder="Search incidents…"
            autoComplete="off"
            spellCheck={false}
            aria-keyshortcuts="Control+k Meta+k"
            title="Search incidents (Ctrl/⌘ K)"
            onChange={(e) => setFilters({ q: e.target.value })}
          />
          {filters.q && (
            <button
              type="button"
              className="icon-button"
              aria-label="Clear search"
              onClick={() => setFilters({ q: "" })}
            >
              <X size={12} />
            </button>
          )}
        </label>
        <label className="filter-select">
          <Filter size={13} aria-hidden="true" />
          <span className="visually-hidden">Filter severity</span>
          <select
            aria-label="Filter severity"
            value={filters.severity}
            onChange={(e) => setFilters({ severity: e.target.value })}
          >
            <option value="">All severities</option>
            <option>Critical</option>
            <option>Major</option>
            <option>Minor</option>
          </select>
        </label>
        <label className="filter-select">
          <span className="visually-hidden">Filter service</span>
          <select
            aria-label="Filter service"
            value={filters.serviceId}
            onChange={(e) => setFilters({ serviceId: e.target.value })}
          >
            <option value="">All services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

const RecoveryChart = memo(function RecoveryChart({
  overview,
}: {
  overview: Overview;
}) {
  const max = Math.max(
    1,
    ...overview.days.flatMap((d) => [d.opened, d.resolved]),
  );
  return (
    <section className="recovery-panel">
      <div className="section-heading">
        <h2>Recovery rhythm</h2>
        <span>Last 7 days, UTC</span>
      </div>
      <div className="chart-legend">
        <span>
          <i className="opened-key" />
          Opened
        </span>
        <span>
          <i className="resolved-key" />
          Resolved
        </span>
      </div>
      <div
        className="bar-chart"
        role="img"
        aria-label={overview.days
          .map((d) => `${d.date}: ${d.opened} opened, ${d.resolved} resolved`)
          .join("; ")}
      >
        {overview.days.map((day) => (
          <div className="chart-day" key={day.date}>
            <div className="bar-pair">
              <svg viewBox="0 0 44 120" role="presentation" aria-hidden="true">
                <rect
                  className="opened-bar"
                  x="4"
                  y={120 - (day.opened / max) * 110}
                  width="14"
                  height={(day.opened / max) * 110}
                  rx="2"
                />
                <rect
                  className="resolved-bar"
                  x="23"
                  y={120 - (day.resolved / max) * 110}
                  width="14"
                  height={(day.resolved / max) * 110}
                  rx="2"
                />
              </svg>
              <span className="chart-tooltip">
                {day.opened} opened / {day.resolved} resolved
              </span>
            </div>
            <span>
              {new Date(`${day.date}T12:00:00Z`).toLocaleDateString("en", {
                weekday: "short",
                timeZone: "UTC",
              })}
            </span>
          </div>
        ))}
      </div>
      <p className="chart-caption">
        <Clock3 size={13} aria-hidden="true" />
        {overview.resolvedThisWeek
          ? `${overview.resolvedThisWeek} incidents resolved in the last seven days.`
          : "Resolved incidents will appear here as your team works."}
      </p>
    </section>
  );
});
const RecentActivity = memo(function RecentActivity({
  overview,
  openIncident,
  compact = false,
}: {
  overview: Overview;
  openIncident: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <section className="recent-panel">
      <div className="section-heading">
        <h2>Latest updates</h2>
        <Activity size={16} aria-hidden="true" />
      </div>
      {overview.recentEvents.length === 0 ? (
        <Empty title="A fresh workspace">
          Declare an incident to start the shared timeline.
        </Empty>
      ) : (
        <ol className="recent-list">
          {overview.recentEvents.slice(0, compact ? 3 : 6).map((e) => (
            <li key={e.id}>
              <EventSymbol kind={e.kind} />
              <button type="button" onClick={() => openIncident(e.incidentId)}>
                <span>
                  <strong>{e.actor}</strong>
                  <Time value={e.createdAt} />
                </span>
                <p>{e.body}</p>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});
function Login({
  demoEnabled,
  signedIn,
}: {
  demoEnabled: boolean;
  signedIn: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signIn(role?: Role, e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const fields = e ? new FormData(e.currentTarget) : null;
    setBusy(true);
    setError("");
    try {
      await request(
        role ? "/session/demo" : "/session/login",
        "POST",
        role
          ? { role }
          : { email: fields?.get("email"), password: fields?.get("password") },
      );
      await signedIn();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Could not sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="login-screen">
      <div className="login-art" aria-hidden="true">
        <Radio size={42} strokeWidth={1.3} />
      </div>
      <h1>Calm in the incident room.</h1>
      <p>
        A shared workspace for the moment something breaks, and every step back
        to normal.
      </p>
      {error && <ErrorMessage message={error} />}
      {demoEnabled ? (
        <div className="login-demo">
          <button
            type="button"
            className="button primary"
            onClick={() => void signIn("Commander")}
            disabled={busy}
          >
            {busy ? "Opening workspace…" : "Explore as commander"}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => void signIn("Viewer")}
            disabled={busy}
          >
            Explore with read-only access
          </button>
          <span className="login-note">
            Fictional services and incidents. No account needed.
          </span>
        </div>
      ) : (
        <form
          className="login-form"
          onSubmit={(e) => void signIn(undefined, e)}
        >
          <label>
            Email address
            <input name="email" type="email" required autoComplete="username" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}
      <div className="login-foot">
        <ShieldCheck size={14} aria-hidden="true" />
        {demoEnabled
          ? "Three roles. One source of truth."
          : "Contact your workspace administrator for access."}
      </div>
    </section>
  );
}
function StatusView({
  data,
  loading,
}: {
  data: {
    services: Service[];
    incidents: Pick<
      Incident,
      "id" | "title" | "severity" | "status" | "serviceId" | "updatedAt"
    >[];
  } | null;
  loading: boolean;
}) {
  if (!data && loading) return <Skeleton />;
  if (!data)
    return (
      <Empty title="Status is temporarily unavailable">
        Retry the request above to check current service health.
      </Empty>
    );
  const healthy = data?.services.every((s) => s.health === "Operational");
  return (
    <section className="public-status">
      <a className="text-button" href={window.location.pathname}>
        <ArrowLeft size={14} aria-hidden="true" />
        Back to workspace
      </a>
      <h1>
        {healthy ? "All systems operational." : "Some services need attention."}
      </h1>
      <p>Current service health. Updated automatically every 30 seconds.</p>
      {data && (
        <>
          <div
            className={`status-banner ${healthy ? "operational" : "degraded"}`}
          >
            <ShieldCheck size={22} aria-hidden="true" />
            <span>
              {healthy
                ? "No active disruptions"
                : `${data.incidents.length} active incidents`}
            </span>
          </div>
          <h2>Services</h2>
          <ul className="public-services">
            {data.services.map((s) => (
              <li key={s.id}>
                <span>{s.name}</span>
                <Badge tone={s.health}>
                  {s.health === "Operational" ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Activity size={14} aria-hidden="true" />
                  )}
                  {s.health}
                </Badge>
              </li>
            ))}
          </ul>
          <h2>Active incidents</h2>
          {data.incidents.length ? (
            <div className="public-incidents">
              {data.incidents.map((i) => (
                <article key={i.id}>
                  <SeverityBadge severity={i.severity} />
                  <h3>{i.title}</h3>
                  <div>
                    <StageIcon stage={i.status} />
                    <span>{i.status}</span>
                    <time dateTime={i.updatedAt}>
                      {utc(i.updatedAt).toLocaleString()}
                    </time>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty title="Everything is running normally">
              There are no active incidents to report.
            </Empty>
          )}
        </>
      )}
    </section>
  );
}
