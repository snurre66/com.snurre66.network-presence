'use strict';

const USER_MAP = {
  'aed2c21c-c3a8-43f0-b446-d4d2d558ad07': 'Thomas',
  '95dcd577-8e6d-4a55-9898-b2b7d5351ccb': 'Marta-Kristine',
  '17081d71-f69d-4205-91b0-b123a01dd41a': 'Emilie',
  'e46751f2-20c2-45a4-90f1-43cee4808a2b': 'Mariell'
};

class UserHelper {
  /**
   * Resolve a user ID or full name into a friendly first name (e.g. "Thomas").
   */
  static getFirstName(idOrName) {
    if (!idOrName || idOrName === 'none') return null;
    if (USER_MAP[idOrName]) return USER_MAP[idOrName];

    const clean = idOrName.trim();
    const lower = clean.toLowerCase();

    if (lower.includes('thomas')) return 'Thomas';
    if (lower.includes('marta')) return 'Marta-Kristine';
    if (lower.includes('emilie')) return 'Emilie';
    if (lower.includes('mariell')) return 'Mariell';

    const parts = clean.split(/\s+/);
    return parts[0] || null;
  }
}

module.exports = UserHelper;
