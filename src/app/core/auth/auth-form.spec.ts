import { FormControl } from '@angular/forms';
import { latestBirthDate, localCalendarDate, pastCalendarDate } from './auth-form';

describe('local calendar birth-date validation', () => {
  afterEach(() => jest.useRealTimers());
  it('uses the local date rather than UTC near midnight and sets yesterday as the max', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 13, 23, 59));
    expect(localCalendarDate()).toBe('2026-10-13'); expect(latestBirthDate()).toBe('2026-10-12');
    expect(pastCalendarDate(new FormControl('2026-10-13'))).toEqual({ pastDate: true });
    expect(pastCalendarDate(new FormControl('2026-10-12'))).toBeNull();
  });
  it('accepts leap days only in real calendar dates', () => {
    expect(pastCalendarDate(new FormControl('2024-02-29'))).toBeNull();
    expect(pastCalendarDate(new FormControl('2025-02-29'))).toEqual({ pastDate: true });
    expect(pastCalendarDate(new FormControl('2020-13-01'))).toEqual({ pastDate: true });
  });
});
