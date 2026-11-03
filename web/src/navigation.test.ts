import { describe, expect, it } from 'vitest';
import { getFilters } from './navigation';

describe('shareable queue filters', () => {
  it('rejects unknown filter values and invalid identifiers', () => {
    expect(getFilters(new URLSearchParams('status=unknown&severity=banana&serviceId=oops&assigneeId=oops&page=NaN')))
      .toEqual({ q: '', status: 'active', severity: '', serviceId: '', assigneeId: '', page: 1 });
  });
  it('preserves valid demo and API identifiers', () => {
    const result = getFilters(new URLSearchParams('status=Monitoring&severity=Critical&serviceId=service-2&assigneeId=e6e4ac30-f879-4359-b7f1-5f12fab60001&page=3&q=checkout'));
    expect(result).toMatchObject({ status: 'Monitoring', severity: 'Critical', serviceId: 'service-2', page: 3, q: 'checkout' });
    expect(result.assigneeId).toHaveLength(36);
  });
  it('bounds excessive pagination and query length', () => {
    expect(getFilters(new URLSearchParams('page=99999999')).page).toBe(100_000);
    expect(getFilters(new URLSearchParams('page=-2')).page).toBe(1);
    expect(getFilters(new URLSearchParams(`q=${'x'.repeat(400)}`)).q).toHaveLength(300);
  });
});
