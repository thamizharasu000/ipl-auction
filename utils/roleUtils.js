/**
 * Central place for player-role helpers so the abbreviation logic and the
 * Room.teams role-count field names never drift apart across files.
 */

const ROLE_ABBR = {
  Batter: 'BAT',
  Bowler: 'BOWL',
  'All-Rounder': 'AR',
  Wicketkeeper: 'WK'
};

const ROLE_COUNT_FIELD = {
  Batter: 'batCount',
  Bowler: 'bowlCount',
  'All-Rounder': 'arCount',
  Wicketkeeper: 'wkCount'
};

function roleAbbr(role) {
  return ROLE_ABBR[role] || role;
}

function roleCountField(role) {
  return ROLE_COUNT_FIELD[role] || null;
}

module.exports = { ROLE_ABBR, ROLE_COUNT_FIELD, roleAbbr, roleCountField };
