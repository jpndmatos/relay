export function WorkspaceLoading({ shell = false }: { shell?: boolean }) {
  return <div className="workspace-loading" role="status" aria-label="Loading workspace" aria-busy="true">
    {shell && <div className="loading-heading" aria-hidden="true"><span /><span /><span /></div>}
    <div className="loading-metrics" aria-hidden="true">{[0, 1, 2, 3].map(n => <div key={n}><span /><strong /><span /></div>)}</div>
    <div className="loading-workspace" aria-hidden="true"><div className="loading-queue"><div className="loading-toolbar" /><div className="loading-toolbar" />{[0, 1, 2, 3].map(n => <div className="loading-incident" key={n}><span /><span /><span /></div>)}</div><div className="loading-watch" /></div>
    <span className="visually-hidden">Loading incident queue and service health.</span>
  </div>;
}
