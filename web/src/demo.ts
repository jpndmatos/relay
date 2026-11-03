import { ApiError } from './api';
import { budgets, stages, utc } from './types';
import type { Incident, IncidentEvent, NewIncident, NewService, Overview, Role, Service, Session, User } from './types';

interface Workspace { schema: 1; incidents: Incident[]; services: Service[]; keys: Record<string, string> }
const key = 'relay.workspace.v1';
const people: User[] = [
  { id: 'e6e4ac30-f879-4359-b7f1-5f12fab60001', name: 'Alex Morgan', email: 'alex@relay.example', role: 'Commander' },
  { id: 'e6e4ac30-f879-4359-b7f1-5f12fab60002', name: 'Sam Rivera', email: 'sam@relay.example', role: 'Viewer' },
  { id: 'e6e4ac30-f879-4359-b7f1-5f12fab60003', name: 'Jules Chen', email: 'jules@relay.example', role: 'Responder' },
];
function timestamp(minutesAgo: number) { return new Date(Date.now() - minutesAgo * 60000).toISOString(); }
function event(kind: string, body: string, status: Incident['status'], at: string, actor = 'Alex Morgan'): IncidentEvent {
  return { id: crypto.randomUUID(), kind, body, status, createdAt: at, actor };
}
export function initialWorkspace(): Workspace {
  const services: Service[] = [
    ['Payments API', 'Checkout, authorisation and payment processing.', 'Commerce', 'Critical'],
    ['Authentication', 'Sign-in, sessions and identity verification.', 'Platform', 'Critical'],
    ['Notification worker', 'Email delivery and asynchronous notifications.', 'Messaging', 'Core'],
    ['Public API', 'Public endpoints and partner integrations.', 'Platform', 'Core'],
    ['Analytics pipeline', 'Product events and reporting workloads.', 'Data', 'Standard'],
  ].map(([name, description, team, tier], index) => ({ id: `service-${index}`, name, description, team, tier, health: 'Operational', activeIncidents: 0 }));
  const seeds: [string, string, number, Incident['severity'], number, number][] = [
    ['Elevated checkout failure rate', 'Payment authorisations are intermittently timing out. The response team is investigating the upstream connection pool.', 0, 'Critical', 18, 1],
    ['Delayed transactional emails', 'Transactional email delivery is delayed. Queue depth is increasing while the primary provider recovers.', 2, 'Major', 46, 2],
    ['Intermittent sign-in errors', 'A subset of sign-in requests returns a session validation error following the latest key rotation.', 1, 'Major', 32, 0],
    ['Reporting jobs running behind', 'Hourly analytics reports are arriving later than scheduled. No events have been lost.', 4, 'Minor', 95, 1],
    ['Partner API latency recovered', 'Partner API response times increased during a scheduled index rebuild. The rebuild has completed.', 3, 'Minor', 180, 3],
    ['Webhook deliveries restored', 'Webhook retries accumulated after a deploy. The worker concurrency limit has been adjusted.', 0, 'Major', 260, 3],
  ];
  // A small, explicit sample history; all charts are computed from these records.
  for (let day = 1; day <= 6; day++)
    for (let n = 0; n < (day % 3) + 1; n++)
      seeds.push([['Connection pool saturation', 'Queue backlog', 'Elevated response latency'][n % 3],
        'The team isolated the affected component, applied a mitigation and verified that normal operation had recovered.',
        (day + n) % 5, n % 2 ? 'Minor' : 'Major', day * 1440 + 60 + n * 90, 3]);
  const incidents = seeds.map(([title, description, service, severity, age, stage], n): Incident => {
    const createdAt = timestamp(age);
    const events = [event('created', description, 'Investigating', createdAt)];
    if (stage > 0) events.push(event('assigned', 'Assigned to Alex Morgan.', 'Investigating', timestamp(age - 2)));
    if (stage > 0) events.push(event('status', 'The affected component has been isolated. Preparing a targeted mitigation.', 'Identified', timestamp(age - 5)));
    if (stage > 1) events.push(event('status', 'Mitigation is deployed. Watching error rates and queue depth before closing.', 'Monitoring', timestamp(age - 12), 'Jules Chen'));
    if (stage > 2) events.push(event('status', 'Service has recovered and the backlog is cleared. Follow-up actions recorded.', 'Resolved', timestamp(age - 24)));
    return { id: crypto.randomUUID(), number: n + 1, title, description, serviceId: services[service].id,
      serviceName: services[service].name, team: services[service].team, severity, status: stages[stage],
      assigneeId: stage ? people[0].id : null, assigneeName: stage ? people[0].name : null,
      createdAt, updatedAt: events[events.length - 1].createdAt, dueAt: new Date(utc(createdAt).getTime() + budgets[severity] * 60000).toISOString(),
      resolvedAt: stage === 3 ? timestamp(age - 24) : null, slaBreached: false, version: events.length, events };
  });
  return { schema: 1, incidents, services, keys: {} };
}
function save(workspace: Workspace) { localStorage.setItem(key, JSON.stringify(workspace)); }
function load(): Workspace {
  const stored = localStorage.getItem(key);
  let workspace: Workspace;
  try {
    workspace = stored ? JSON.parse(stored) : initialWorkspace();
    if (workspace.schema !== 1 || !Array.isArray(workspace.incidents) || !Array.isArray(workspace.services)) throw new Error('Invalid workspace');
  } catch { workspace = initialWorkspace(); }
  let changed = !stored;
  for (const i of workspace.incidents) {
    if (i.status !== 'Resolved' && !i.slaBreached && utc(i.dueAt).getTime() < Date.now()) {
      i.slaBreached = true; i.version++; i.updatedAt = timestamp(0);
      i.events.push(event('sla', 'The resolution target was exceeded. Escalate to the service owner.', i.status, i.updatedAt, 'Relay'));
      changed = true;
    }
  }
  if (changed) save(workspace);
  return workspace;
}
function currentUser() { return people.find(p => p.id === localStorage.getItem('relay.user')) ?? null; }
function requireUser() { const user = currentUser(); if (!user) throw new ApiError(401, 'Sign in to open this workspace.'); return user; }
function requireWriter() { const user = requireUser(); if (user.role === 'Viewer') throw new ApiError(403, 'Your viewer role is read-only.'); return user; }
function services(workspace: Workspace) {
  return workspace.services.map(s => {
    const active = workspace.incidents.filter(i => i.serviceId === s.id && i.status !== 'Resolved');
    return { ...s, activeIncidents: active.length, health: !active.length ? 'Operational' : active.some(i => i.severity === 'Critical') ? 'Disrupted' : 'Degraded' };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
function checkLength(value: unknown, min: number, max: number, field: string): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
    throw new ApiError(422, `${field} must be between ${min} and ${max.toLocaleString()} characters.`);
  return value.trim();
}
export async function demoRequest<T>(path: string, method = 'GET', body?: unknown, requestKey?: string): Promise<T> {
  // Real storage operations are asynchronous at the adapter boundary, without
  // imposing artificial latency on the public portfolio demo.
  await Promise.resolve();
  const data = body as Record<string, unknown>;
  const url = new URL(path, 'https://relay.example');
  const route = url.pathname;
  let result: unknown;
  if (route === '/session' && method === 'GET')
    return { user: currentUser(), csrfToken: 'local-demo', demoEnabled: true } as Session as T;
  if (route === '/session/demo') {
    const person = people.find(p => p.role === (body as { role: Role }).role);
    if (!person) throw new ApiError(400, 'Choose a demo role.');
    localStorage.setItem('relay.user', person.id); return person as T;
  }
  if (route === '/session/logout') { localStorage.removeItem('relay.user'); return undefined as T; }
  const workspace = load();
  if (route === '/status') return { services: services(workspace).map(({ id, name, health, activeIncidents }) => ({ id, name, health, activeIncidents })), incidents: workspace.incidents.filter(i => i.status !== 'Resolved').map(i => ({ id: i.id, number: i.number, title: i.title, serviceId: i.serviceId, severity: i.severity, status: i.status, updatedAt: i.updatedAt })), updatedAt: timestamp(0) } as T;
  requireUser();
  if (route === '/responders') return people.filter(p => p.role !== 'Viewer').map(({ id, name }) => ({ id, name })) as T;
  if (route === '/services' && method === 'GET') return services(workspace) as T;
  if (route === '/overview') {
    const active = workspace.incidents.filter(i => i.status !== 'Resolved');
    const resolved = workspace.incidents.filter(i => i.resolvedAt && utc(i.resolvedAt).getTime() > Date.now() - 7 * 86400000);
    const overview: Overview = { active: active.length, critical: active.filter(i => i.severity === 'Critical').length,
      overdue: active.filter(i => utc(i.dueAt).getTime() < Date.now()).length,
      resolvedThisWeek: resolved.length, meanResolutionMinutes: resolved.length ? Math.round(resolved.reduce((s, i) => s + (utc(i.resolvedAt!).getTime() - utc(i.createdAt).getTime()) / 60000, 0) / resolved.length) : null,
      days: Array.from({ length: 7 }, (_, n) => {
        const date = new Date(Date.now() - (6 - n) * 86400000).toISOString().slice(0, 10);
        return { date, opened: workspace.incidents.filter(i => i.createdAt.startsWith(date)).length, resolved: workspace.incidents.filter(i => i.resolvedAt?.startsWith(date)).length };
      }),
      recentEvents: workspace.incidents.flatMap(i => i.events.map(e => ({ ...e, incidentId: i.id }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    };
    return overview as T;
  }
  if (route === '/incidents' && method === 'GET') {
    const params = url.searchParams;
    let items = [...workspace.incidents];
    const q = params.get('q')?.toLowerCase(); const status = params.get('status');
    if (q) items = items.filter(i => `${i.title} ${i.description}`.toLowerCase().includes(q));
    if (status === 'active') items = items.filter(i => i.status !== 'Resolved');
    else if (status && status !== 'all') items = items.filter(i => i.status === status);
    for (const field of ['severity', 'serviceId', 'assigneeId'] as const)
      if (params.get(field)) items = items.filter(i => i[field] === params.get(field));
    items.sort((a, b) => Number(a.status === 'Resolved') - Number(b.status === 'Resolved') ||
      ['Critical', 'Major', 'Minor'].indexOf(a.severity) - ['Critical', 'Major', 'Minor'].indexOf(b.severity) || b.createdAt.localeCompare(a.createdAt));
    const page = Math.max(1, Number(params.get('page')) || 1); const pageSize = 10;
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize } as T;
  }
  const match = route.match(/^\/incidents\/([^/]+)(?:\/(assign|comments|transition))?$/);
  if (match && method === 'GET') {
    const incident = workspace.incidents.find(i => i.id === match[1]);
    if (!incident) throw new ApiError(404, 'This incident could not be found.');
    return { ...incident, events: [...incident.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) } as T;
  }
  const user = requireWriter();
  if (route === '/services' && method === 'POST') {
    if (user.role !== 'Commander') throw new ApiError(403, 'Only commanders can register services.');
    const input = body as NewService;
    const name = checkLength(input.name, 3, 80, 'Name');
    if (workspace.services.some(s => s.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, 'A service with this name already exists.');
    if (!['Critical', 'Core', 'Standard'].includes(input.tier)) throw new ApiError(422, 'Choose a valid tier.');
    result = { id: crypto.randomUUID(), name, description: checkLength(input.description, 12, 240, 'Description'), team: checkLength(input.team, 2, 80, 'Team'), tier: input.tier, health: 'Operational', activeIncidents: 0 };
    workspace.services.push(result as Service);
  } else if (route === '/incidents' && method === 'POST') {
    const input = body as NewIncident;
    if (!requestKey) throw new ApiError(400, 'An idempotency key is required.');
    const existing = workspace.incidents.find(i => i.id === workspace.keys[`${user.id}:${requestKey}`]);
    if (existing) {
      if (existing.title !== input.title.trim() || existing.description !== input.description.trim() || existing.serviceId !== input.serviceId || existing.severity !== input.severity)
        throw new ApiError(409, 'Use a new idempotency key for a different incident.');
      return existing as T;
    }
    const service = workspace.services.find(s => s.id === input.serviceId);
    if (!service || !budgets[input.severity]) throw new ApiError(422, 'Choose a service and severity.');
    const title = checkLength(input.title, 5, 160, 'Title');
    const description = checkLength(input.description, 12, 4000, 'Description');
    const incident: Incident = { id: crypto.randomUUID(), number: Math.max(0, ...workspace.incidents.map(i => i.number)) + 1,
      title, description, serviceId: service.id, serviceName: service.name, team: service.team,
      severity: input.severity, status: 'Investigating', assigneeId: null, assigneeName: null,
      createdAt: timestamp(0), updatedAt: timestamp(0), dueAt: new Date(Date.now() + budgets[input.severity] * 60000).toISOString(),
      resolvedAt: null, slaBreached: false, version: 1, events: [event('created', description, 'Investigating', timestamp(0), user.name)] };
    workspace.incidents.push(incident); workspace.keys[`${user.id}:${requestKey}`] = incident.id; result = incident;
  } else if (match && method === 'POST') {
    const incident = workspace.incidents.find(i => i.id === match[1]);
    if (!incident) throw new ApiError(404, 'This incident could not be found.');
    if (incident.version !== data.version) throw new ApiError(409, 'Another responder updated this incident. Refresh and try again.');
    let kind = ''; let message = '';
    if (match[2] === 'comments') { kind = 'comment'; message = checkLength(data.body, 3, 4000, 'Update'); }
    else if (match[2] === 'assign') {
      if (incident.status === 'Resolved') throw new ApiError(422, 'A resolved incident cannot be reassigned.');
      const person = people.find(p => p.id === data.assigneeId && p.role !== 'Viewer');
      if (!person) throw new ApiError(422, 'Choose a responder.');
      if (person.id === incident.assigneeId) return incident as T;
      incident.assigneeId = person.id; incident.assigneeName = person.name; kind = 'assigned'; message = `Assigned to ${person.name}.`;
    } else if (match[2] === 'transition') {
      if (stages.indexOf(data.status as Incident['status']) !== stages.indexOf(incident.status) + 1 || incident.status === 'Resolved') throw new ApiError(422, 'Move to the next incident stage.');
      if (!incident.assigneeId) throw new ApiError(422, 'Assign a responder before changing the incident stage.');
      message = checkLength(data.note, 12, 4000, 'Stage update'); kind = 'status';
      incident.status = data.status as Incident['status'];
      if (incident.status === 'Resolved') incident.resolvedAt = timestamp(0);
      if (utc(incident.dueAt).getTime() < Date.now()) incident.slaBreached = true;
    } else throw new ApiError(404, 'This action is unavailable.');
    incident.version++; incident.updatedAt = timestamp(0);
    incident.events.push(event(kind, message, incident.status, incident.updatedAt, user.name));
    result = { ...incident, events: [...incident.events].reverse() };
  } else throw new ApiError(404, 'This page could not be found.');
  save(workspace); return result as T;
}
export function resetDemo() { localStorage.removeItem(key); }
