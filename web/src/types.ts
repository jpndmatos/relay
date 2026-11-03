export type Severity = 'Critical' | 'Major' | 'Minor';
export type Stage = 'Investigating' | 'Identified' | 'Monitoring' | 'Resolved';
export type Role = 'Commander' | 'Responder' | 'Viewer';
export interface User { id: string; name: string; email: string; role: Role }
export interface Session { user: User | null; csrfToken: string; demoEnabled: boolean }
export interface Responder { id: string; name: string }
export interface IncidentEvent { id: string; kind: string; actor: string; body: string; createdAt: string; status: Stage }
export interface Incident {
  id: string; number: number; title: string; description: string;
  serviceId: string; serviceName: string; team: string; severity: Severity; status: Stage;
  assigneeId: string | null; assigneeName: string | null; createdAt: string; updatedAt: string;
  dueAt: string; resolvedAt: string | null; slaBreached: boolean; version: number; events: IncidentEvent[];
}
export interface Service { id: string; name: string; description: string; team: string; tier: string; health: string; activeIncidents: number }
export interface Overview {
  active: number; critical: number; overdue: number; resolvedThisWeek: number; meanResolutionMinutes: number | null;
  days: { date: string; opened: number; resolved: number }[];
  recentEvents: (IncidentEvent & { incidentId: string })[];
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface Filters { q: string; status: string; severity: string; serviceId: string; assigneeId: string; page: number }
export interface NewIncident { title: string; description: string; serviceId: string; severity: Severity }
export interface NewService { name: string; description: string; team: string; tier: string }
export const stages: Stage[] = ['Investigating', 'Identified', 'Monitoring', 'Resolved'];
export const budgets: Record<Severity, number> = { Critical: 30, Major: 120, Minor: 480 };
export const formatNumber = (number: number) => `RLY-${String(number).padStart(4, '0')}`;
export const utc = (date: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(date) ? date : `${date}Z`);
export function relativeTime(value: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - utc(value).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
export function targetLabel(incident: Incident, now = Date.now()) {
  if (incident.status === 'Resolved') return incident.slaBreached ? 'Resolved late' : 'Target met';
  const minutes = Math.ceil((utc(incident.dueAt).getTime() - now) / 60000);
  if (minutes <= 0) return `${Math.abs(minutes)}m overdue`;
  return minutes > 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m left` : `${minutes}m left`;
}
