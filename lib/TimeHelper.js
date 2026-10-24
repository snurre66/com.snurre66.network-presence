'use strict';

class TimeHelper {
  /**
   * Get the configured Homey timezone or safe system fallback.
   * Never hardcodes a specific region or city.
   *
   * @param {object} [homey]
   * @returns {string} IANA timezone identifier (e.g. 'Europe/Oslo', 'America/New_York')
   */
  static getTimezone(homey) {
    try {
      if (homey && homey.clock && typeof homey.clock.getTimezone === 'function') {
        const tz = homey.clock.getTimezone();
        if (tz && typeof tz === 'string' && tz.trim()) {
          return tz.trim();
        }
      }
    } catch (_) {}

    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (resolved && typeof resolved === 'string') {
        return resolved;
      }
    } catch (_) {}

    return 'UTC';
  }

  /**
   * Determine whether Norwegian language formatting should be used.
   *
   * @param {object} [homey]
   * @returns {boolean}
   */
  static isNorwegian(homey) {
    try {
      if (homey && homey.i18n && typeof homey.i18n.getLanguage === 'function') {
        const lang = (homey.i18n.getLanguage() || '').toLowerCase();
        return lang === 'no' || lang === 'nb' || lang === 'nn';
      }
    } catch (_) {}
    return true; // Default to Norwegian in this app
  }

  /**
   * Get calendar date string formatted as YYYY-MM-DD in the target timezone.
   *
   * @param {number|Date} dateOrTimestamp
   * @param {string} timeZone
   * @returns {string} e.g. "2026-10-24"
   */
  static getCalendarDateString(dateOrTimestamp, timeZone) {
    const d = (dateOrTimestamp instanceof Date) ? dateOrTimestamp : new Date(dateOrTimestamp);
    return d.toLocaleDateString('en-CA', { timeZone });
  }

  /**
   * Calculate difference in whole calendar days between now and timestamp in the specified timezone.
   * Returns:
   *  0 for today (or future clock skew)
   *  1 for yesterday
   *  2 for 2 days ago, etc.
   *
   * @param {number|Date} timestamp
   * @param {number|Date} now
   * @param {string} timeZone
   * @returns {number}
   */
  static getDaysDifference(timestamp, now, timeZone) {
    const targetDateStr = TimeHelper.getCalendarDateString(timestamp, timeZone);
    const nowDateStr = TimeHelper.getCalendarDateString(now, timeZone);

    if (targetDateStr === nowDateStr) {
      return 0;
    }

    const [yNow, mNow, dNow] = nowDateStr.split('-').map(Number);
    const [yTgt, mTgt, dTgt] = targetDateStr.split('-').map(Number);

    const diff = Math.round((Date.UTC(yNow, mNow - 1, dNow) - Date.UTC(yTgt, mTgt - 1, dTgt)) / 86400000);
    return diff < 0 ? 0 : diff;
  }

  /**
   * Format HH:mm time string in the target timezone (24-hour format).
   *
   * @param {number|Date} timestamp
   * @param {string} timeZone
   * @param {string} locale
   * @returns {string} e.g. "14:32"
   */
  static formatTime(timestamp, timeZone, locale = 'nb-NO') {
    const d = (timestamp instanceof Date) ? timestamp : new Date(timestamp);
    return d.toLocaleTimeString(locale, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  /**
   * Format a timestamp into a clean relative "last seen" string for device cards:
   * - Today: "I dag kl. 14:32" (or "Today at 14:32")
   * - Yesterday: "I går kl. 14:32" (or "Yesterday at 14:32")
   * - 2-6 days: "Mandag kl. 14:32" (or "Monday at 14:32")
   * - 7+ days: "17. okt. kl. 14:32" (or "Oct 17 at 14:32")
   *
   * @param {number|Date} timestamp
   * @param {object} [homey]
   * @param {object} [options]
   * @param {number|Date} [options.now]
   * @param {string} [options.timeZone]
   * @returns {string}
   */
  static formatLastSeen(timestamp, homey = null, options = {}) {
    if (!timestamp || Number(timestamp) <= 0) {
      return TimeHelper.getInitialWaitingText(homey);
    }

    try {
      const timeZone = options.timeZone || TimeHelper.getTimezone(homey);
      const isNo = TimeHelper.isNorwegian(homey);
      const locale = isNo ? 'nb-NO' : 'en-US';
      const now = options.now !== undefined ? options.now : Date.now();
      const date = (timestamp instanceof Date) ? timestamp : new Date(Number(timestamp));

      const timeStr = TimeHelper.formatTime(date, timeZone, locale);
      const diffDays = TimeHelper.getDaysDifference(date, now, timeZone);

      if (diffDays === 0) {
        return isNo ? `I dag kl. ${timeStr}` : `Today at ${timeStr}`;
      }

      if (diffDays === 1) {
        return isNo ? `I går kl. ${timeStr}` : `Yesterday at ${timeStr}`;
      }

      if (diffDays < 7) {
        const weekday = date.toLocaleDateString(locale, { timeZone, weekday: 'long' });
        const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
        return isNo ? `${capitalized} kl. ${timeStr}` : `${capitalized} at ${timeStr}`;
      }

      const shortDate = date.toLocaleDateString(locale, { timeZone, day: 'numeric', month: 'short' });
      return isNo ? `${shortDate} kl. ${timeStr}` : `${shortDate} at ${timeStr}`;
    } catch (_) {
      // Clean fallback if anything unexpected fails
      try {
        const d = new Date(timestamp);
        return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', hour12: false });
      } catch {
        return '';
      }
    }
  }

  /**
   * Return initial text when a device has never been probed.
   *
   * @param {object} [homey]
   * @returns {string}
   */
  static getInitialWaitingText(homey) {
    return TimeHelper.isNorwegian(homey) ? 'Venter på første sjekk...' : 'Waiting for probe...';
  }
}

module.exports = TimeHelper;
