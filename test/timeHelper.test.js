'use strict';

const assert = require('assert');
const TimeHelper = require('../lib/TimeHelper');

console.log('Running TimeHelper test suite...\n');

// 1. Timezone resolution
{
  const mockHomey = { clock: { getTimezone: () => 'Europe/Oslo' } };
  assert.strictEqual(TimeHelper.getTimezone(mockHomey), 'Europe/Oslo');

  const mockHomeyUS = { clock: { getTimezone: () => 'America/Chicago' } };
  assert.strictEqual(TimeHelper.getTimezone(mockHomeyUS), 'America/Chicago');

  const mockHomeyEmpty = { clock: { getTimezone: () => '' } };
  assert.ok(typeof TimeHelper.getTimezone(mockHomeyEmpty) === 'string');

  const mockHomeyThrows = { clock: { getTimezone: () => { throw new Error('fail'); } } };
  assert.ok(typeof TimeHelper.getTimezone(mockHomeyThrows) === 'string');

  assert.ok(typeof TimeHelper.getTimezone(null) === 'string');
  console.log('✓ Timezone resolution passed');
}

// 2. Language resolution
{
  assert.strictEqual(TimeHelper.isNorwegian({ i18n: { getLanguage: () => 'no' } }), true);
  assert.strictEqual(TimeHelper.isNorwegian({ i18n: { getLanguage: () => 'nb' } }), true);
  assert.strictEqual(TimeHelper.isNorwegian({ i18n: { getLanguage: () => 'nn' } }), true);
  assert.strictEqual(TimeHelper.isNorwegian({ i18n: { getLanguage: () => 'NO' } }), true);
  assert.strictEqual(TimeHelper.isNorwegian({ i18n: { getLanguage: () => 'en' } }), false);
  assert.strictEqual(TimeHelper.isNorwegian({ i18n: { getLanguage: () => 'de' } }), false);
  assert.strictEqual(TimeHelper.isNorwegian(null), true);
  console.log('✓ Language resolution passed');
}

// 3. Calendar date strings
{
  const testDate = new Date('2026-10-24T22:30:00Z');
  // In Europe/Oslo (CEST, UTC+2): 2026-10-25 00:30
  assert.strictEqual(TimeHelper.getCalendarDateString(testDate, 'Europe/Oslo'), '2026-10-25');
  // In UTC: 2026-10-24 22:30
  assert.strictEqual(TimeHelper.getCalendarDateString(testDate, 'UTC'), '2026-10-24');
  // In America/New_York (EDT, UTC-4): 2026-10-24 18:30
  assert.strictEqual(TimeHelper.getCalendarDateString(testDate, 'America/New_York'), '2026-10-24');
  console.log('✓ Calendar date strings passed');
}

// 4. Day difference and rollover
{
  const tz = 'Europe/Oslo';

  // Same day
  const now = new Date('2026-10-24T12:00:00Z');
  const earlierToday = new Date('2026-10-24T08:00:00Z');
  assert.strictEqual(TimeHelper.getDaysDifference(earlierToday, now, tz), 0);

  // Future clock skew
  const futureSkew = new Date('2026-10-24T12:00:10Z');
  assert.strictEqual(TimeHelper.getDaysDifference(futureSkew, now, tz), 0);

  // Midnight rollover: 23:55 CEST on Oct 23 vs 00:05 CEST on Oct 24
  const oct23Late = new Date('2026-10-23T21:55:00Z'); // 23:55 CEST
  const oct24Early = new Date('2026-10-23T22:05:00Z'); // 00:05 CEST
  assert.strictEqual(TimeHelper.getDaysDifference(oct23Late, oct24Early, tz), 1);

  // Month rollover: Oct 31 vs Nov 1
  const oct31 = new Date('2026-10-31T12:00:00Z');
  const nov01 = new Date('2026-11-01T12:00:00Z');
  assert.strictEqual(TimeHelper.getDaysDifference(oct31, nov01, tz), 1);

  // Year rollover: Dec 31 vs Jan 1
  const dec31 = new Date('2026-12-31T12:00:00Z');
  const jan01 = new Date('2027-01-01T12:00:00Z');
  assert.strictEqual(TimeHelper.getDaysDifference(dec31, jan01, tz), 1);

  // Leap year rollover: Feb 29 vs Mar 1
  const feb29 = new Date('2024-02-29T12:00:00Z');
  const mar01 = new Date('2024-03-01T12:00:00Z');
  assert.strictEqual(TimeHelper.getDaysDifference(feb29, mar01, tz), 1);

  // European Fall DST (25h day on Oct 25, 2026)
  const dstFallSat = new Date('2026-10-24T21:50:00Z'); // 23:50 CEST
  const dstFallSun = new Date('2026-10-24T22:10:00Z'); // 00:10 CEST on Oct 25
  assert.strictEqual(TimeHelper.getDaysDifference(dstFallSat, dstFallSun, tz), 1);

  // European Spring DST (23h day on Mar 29, 2026)
  const dstSpringSat = new Date('2026-03-28T22:50:00Z'); // 23:50 CET
  const dstSpringSun = new Date('2026-03-28T23:10:00Z'); // 00:10 CET on Mar 29
  assert.strictEqual(TimeHelper.getDaysDifference(dstSpringSat, dstSpringSun, tz), 1);

  // 3 days difference
  const wednesday = new Date('2026-10-21T10:00:00Z');
  assert.strictEqual(TimeHelper.getDaysDifference(wednesday, now, tz), 3);

  // 10 days difference
  const oct14 = new Date('2026-10-14T10:00:00Z');
  assert.strictEqual(TimeHelper.getDaysDifference(oct14, now, tz), 10);
  console.log('✓ Day difference and rollover calculations passed');
}

// 5. formatLastSeen output
{
  const mockHomeyNo = {
    clock: { getTimezone: () => 'Europe/Oslo' },
    i18n: { getLanguage: () => 'nb' }
  };

  const mockHomeyEn = {
    clock: { getTimezone: () => 'Europe/Oslo' },
    i18n: { getLanguage: () => 'en' }
  };

  const now = new Date('2026-10-24T12:30:00Z'); // 14:30 CEST

  // Initial waiting text
  assert.strictEqual(TimeHelper.formatLastSeen(0, mockHomeyNo), 'Venter på første sjekk...');
  assert.strictEqual(TimeHelper.formatLastSeen(null, mockHomeyEn), 'Waiting for probe...');
  assert.strictEqual(TimeHelper.formatLastSeen(-50, mockHomeyNo), 'Venter på første sjekk...');

  // Today
  const todayEarlier = new Date('2026-10-24T08:15:00Z'); // 10:15 CEST
  assert.strictEqual(
    TimeHelper.formatLastSeen(todayEarlier.getTime(), mockHomeyNo, { now: now.getTime() }),
    'I dag kl. 10:15'
  );
  assert.strictEqual(
    TimeHelper.formatLastSeen(todayEarlier.getTime(), mockHomeyEn, { now: now.getTime() }),
    'Today at 10:15'
  );

  // Yesterday
  const yesterdayLate = new Date('2026-10-23T21:45:00Z'); // 23:45 CEST
  assert.strictEqual(
    TimeHelper.formatLastSeen(yesterdayLate.getTime(), mockHomeyNo, { now: now.getTime() }),
    'I går kl. 23:45'
  );
  assert.strictEqual(
    TimeHelper.formatLastSeen(yesterdayLate.getTime(), mockHomeyEn, { now: now.getTime() }),
    'Yesterday at 23:45'
  );

  // Weekday (Wednesday Oct 21 from Saturday Oct 24)
  const wednesday = new Date('2026-10-21T10:00:00Z'); // 12:00 CEST
  assert.strictEqual(
    TimeHelper.formatLastSeen(wednesday.getTime(), mockHomeyNo, { now: now.getTime() }),
    'Onsdag kl. 12:00'
  );
  assert.strictEqual(
    TimeHelper.formatLastSeen(wednesday.getTime(), mockHomeyEn, { now: now.getTime() }),
    'Wednesday at 12:00'
  );

  // 10 days ago (Wednesday Oct 14)
  const oct14 = new Date('2026-10-14T10:00:00Z'); // 12:00 CEST
  const resNoOld = TimeHelper.formatLastSeen(oct14.getTime(), mockHomeyNo, { now: now.getTime() });
  assert.ok(resNoOld.startsWith('14. okt. kl. 12:00'));

  const resEnOld = TimeHelper.formatLastSeen(oct14.getTime(), mockHomeyEn, { now: now.getTime() });
  assert.ok(resEnOld.startsWith('Oct 14 at 12:00'));

  console.log('✓ formatLastSeen relative string formatting passed');
}

console.log('\nAll tests passed successfully!');
