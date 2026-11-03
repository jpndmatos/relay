import type { Filters } from './types';
const statuses = new Set(['active', 'all', 'Investigating', 'Identified', 'Monitoring', 'Resolved']);
const severities = new Set(['Critical', 'Major', 'Minor']);
const identifier = /^(?:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}|service-\d+)$/i;
export function getFilters(params: URLSearchParams): Filters {
  const page = Number(params.get('page'));
  const status = params.get('status') ?? 'active';
  const severity = params.get('severity') ?? '';
  const serviceId = params.get('serviceId') ?? '';
  const assigneeId = params.get('assigneeId') ?? '';
  return {
    q: (params.get('q') ?? '').slice(0, 300),
    status: statuses.has(status) ? status : 'active',
    severity: severities.has(severity) ? severity : '',
    serviceId: identifier.test(serviceId) ? serviceId : '',
    assigneeId: identifier.test(assigneeId) ? assigneeId : '',
    page: Number.isSafeInteger(page) && page >= 1 ? Math.min(page, 100_000) : 1,
  };
}
