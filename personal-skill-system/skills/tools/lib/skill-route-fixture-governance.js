'use strict';

const {
  shouldAppearOnActiveRouteSurface
} = require('./skill-kind-governance');

const ROUTE_FIXTURE_SCHEMA_VERSION = 1;
const GOVERNED_ROUTE_FIXTURE_NAME_PREFIX = 'placeholder-route-';

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeGovernedFixtureToken(value) {
  return normalizeString(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function isAsciiLikeFixtureToken(value) {
  return /^[a-z0-9 ]+$/i.test(normalizeString(value));
}

function isGovernedRouteFixture(fixture) {
  if (!fixture || typeof fixture !== 'object') {
    return false;
  }
  if (fixture.governed === true) {
    return true;
  }
  return normalizeString(fixture.name).startsWith(GOVERNED_ROUTE_FIXTURE_NAME_PREFIX);
}

function routeFixtureReferencesSkill(fixture, skillName) {
  const normalizedSkill = normalizeString(skillName).toLowerCase();
  if (!normalizedSkill) {
    return false;
  }
  if (normalizeString(fixture && fixture.expect).toLowerCase() === normalizedSkill) {
    return true;
  }
  return normalizeString(fixture && fixture['expect-fallback-question-contains']).toLowerCase().includes(normalizedSkill);
}

function collectGovernedFixtureTokens(skillName, values) {
  const skillToken = normalizeGovernedFixtureToken(skillName).toLowerCase();
  const preferred = [];
  const fallback = [];
  const seen = new Set();

  for (const raw of Array.isArray(values) ? values : []) {
    if (/-signal$|-trigger$/i.test(normalizeString(raw))) {
      continue;
    }
    const normalized = normalizeGovernedFixtureToken(raw);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (key === skillToken || seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (isAsciiLikeFixtureToken(normalized)) {
      preferred.push(normalized);
    } else {
      fallback.push(normalized);
    }
  }

  return preferred.length > 0 ? preferred : fallback;
}

function buildGovernedRouteFixture(routeDescriptor) {
  const skillName = normalizeString(routeDescriptor && (routeDescriptor.skill || routeDescriptor.name));
  const terms = collectGovernedFixtureTokens(skillName, [
    ...(Array.isArray(routeDescriptor && routeDescriptor.triggerKeywords) ? routeDescriptor.triggerKeywords : []),
    ...(Array.isArray(routeDescriptor && routeDescriptor.aliases) ? routeDescriptor.aliases : [])
  ]);
  const firstTerm = terms[0] || '';
  let query = `Run ${skillName} for this request.`;

  if (firstTerm) {
    query = `Run ${skillName} for this ${firstTerm} request.`;
  }

  return {
    name: `${GOVERNED_ROUTE_FIXTURE_NAME_PREFIX}${skillName}`,
    query,
    expect: skillName,
    'expect-no-fallback': true,
    governed: true
  };
}

function hasRouteFixtureEvidence(skillName, fixtures, options = {}) {
  const includeGoverned = options.includeGoverned !== false;
  return (Array.isArray(fixtures) ? fixtures : []).some((fixture) => {
    if (!includeGoverned && isGovernedRouteFixture(fixture)) {
      return false;
    }
    return routeFixtureReferencesSkill(fixture, skillName);
  });
}

function summarizeRouteFixtureEvidence(skillName, routeFixturesData) {
  const fixtures = (Array.isArray(routeFixturesData && routeFixturesData.cases) ? routeFixturesData.cases : [])
    .filter((fixture) => routeFixtureReferencesSkill(fixture, skillName));
  const governedFixtures = fixtures.filter((fixture) => isGovernedRouteFixture(fixture));
  const nongovernedFixtures = fixtures.filter((fixture) => !isGovernedRouteFixture(fixture));

  return {
    total: fixtures.length,
    governed: governedFixtures.length,
    nongoverned: nongovernedFixtures.length,
    'stable-evidence-satisfied': nongovernedFixtures.length > 0,
    'real-fixtures': nongovernedFixtures
      .map((fixture) => normalizeString(fixture && fixture.name))
      .filter(Boolean),
    'governed-fixtures': governedFixtures
      .map((fixture) => normalizeString(fixture && fixture.name))
      .filter(Boolean)
  };
}

function parseRouteFixtureExpectations(fixture) {
  const expectedSkill = typeof fixture.expect === 'string' && fixture.expect.trim() ? fixture.expect : null;
  const expectedFallbackMode = typeof fixture['expect-fallback-mode'] === 'string' && fixture['expect-fallback-mode'].trim()
    ? fixture['expect-fallback-mode']
    : null;
  const expectedFallbackQuestionContains = typeof fixture['expect-fallback-question-contains'] === 'string' && fixture['expect-fallback-question-contains'].trim()
    ? fixture['expect-fallback-question-contains'].toLowerCase()
    : null;
  const expectNoFallback = fixture['expect-no-fallback'] === true;

  return {
    expectedSkill,
    expectedFallbackMode,
    expectedFallbackQuestionContains,
    expectNoFallback
  };
}

function findGovernedRouteFixtureForSkill(fixtures, skillName) {
  return (Array.isArray(fixtures) ? fixtures : []).find((fixture) => (
    routeFixtureReferencesSkill(fixture, skillName) && isGovernedRouteFixture(fixture)
  )) || null;
}

function buildExpectedGovernedRouteFixtureForRecord(record) {
  if (!shouldAppearOnActiveRouteSurface(record)) {
    return null;
  }
  return buildGovernedRouteFixture({
    skill: record.name,
    triggerKeywords: record.triggerKeywords,
    aliases: record.aliases
  });
}

module.exports = {
  ROUTE_FIXTURE_SCHEMA_VERSION,
  GOVERNED_ROUTE_FIXTURE_NAME_PREFIX,
  isGovernedRouteFixture,
  routeFixtureReferencesSkill,
  buildGovernedRouteFixture,
  buildExpectedGovernedRouteFixtureForRecord,
  findGovernedRouteFixtureForSkill,
  hasRouteFixtureEvidence,
  summarizeRouteFixtureEvidence,
  parseRouteFixtureExpectations
};
