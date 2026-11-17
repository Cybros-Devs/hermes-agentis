import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfileCatalog,
  isValidCustomProfileSlug,
  normalizeProfileId,
  parseHermesProfilesEnv,
  resolveProfileRuntimeConfig,
  toRedactedProfileSummary,
} from './profileRegistry';

test('normalizeProfileId normalizes valid slugs and guards reserved routes', () => {
  assert.equal(normalizeProfileId('Coder Agent!'), 'coder-agent');
  assert.equal(normalizeProfileId('research_v2'), 'research_v2');
  assert.equal(normalizeProfileId(''), 'default');
  assert.equal(normalizeProfileId('api'), 'default');
  assert.equal(normalizeProfileId('v1'), 'default');

  assert.equal(isValidCustomProfileSlug('coder'), true);
  assert.equal(isValidCustomProfileSlug('default'), false);
  assert.equal(isValidCustomProfileSlug('v1'), false);
});

test('parseHermesProfilesEnv parses CSV and JSON specs accurately', () => {
  const csv = parseHermesProfilesEnv({
    HERMES_PROFILES: 'coder,researcher=http://127.0.0.1:8643/',
  });
  assert.equal(csv.length, 2);
  assert.deepEqual(
    csv.map((d) => ({ id: d.id, mode: d.mode, baseUrl: d.baseUrl })),
    [
      { id: 'coder', mode: 'multiplexed', baseUrl: undefined },
      { id: 'researcher', mode: 'standalone', baseUrl: 'http://127.0.0.1:8643' },
    ]
  );

  const json = parseHermesProfilesEnv({
    HERMES_PROFILES: JSON.stringify([
      { id: 'ops', label: 'Ops Profile', mode: 'multiplexed' },
      { id: 'sandbox', mode: 'standalone', baseUrl: 'http://127.0.0.1:8649', apiKey: 'sk-sbx' },
    ]),
  });
  assert.equal(json.length, 2);
  assert.equal(json[0].label, 'Ops Profile');
  assert.equal(json[0].mode, 'multiplexed');
  assert.equal(json[1].baseUrl, 'http://127.0.0.1:8649');
  assert.equal(json[1].apiKey, 'sk-sbx');
});

test('resolveProfileRuntimeConfig routes multiplexed profiles under /p/<slug> and prioritizes profile keys', () => {
  const env = {
    HERMES_API_URL: 'http://127.0.0.1:8642',
    HERMES_API_KEY: 'default-key',
    HERMES_PROFILE_API_KEY: 'shared-profile-key',
    HERMES_API_KEY_CODER: 'coder-specific-key',
  };

  const coder = resolveProfileRuntimeConfig(
    { id: 'coder', mode: 'multiplexed', source: 'env' },
    env
  );
  assert.equal(coder.baseUrl, 'http://127.0.0.1:8642');
  assert.equal(coder.routePrefix, '/p/coder');
  assert.equal(coder.apiKey, 'coder-specific-key');

  const researcher = resolveProfileRuntimeConfig(
    { id: 'researcher', mode: 'multiplexed', source: 'discovered' },
    env
  );
  assert.equal(researcher.routePrefix, '/p/researcher');
  assert.equal(researcher.apiKey, 'shared-profile-key');

  const standalone = resolveProfileRuntimeConfig(
    {
      id: 'isolated',
      mode: 'standalone',
      baseUrl: 'http://127.0.0.1:8655/',
      apiKey: 'explicit-standalone-key',
      source: 'custom',
    },
    env
  );
  assert.equal(standalone.baseUrl, 'http://127.0.0.1:8655');
  assert.equal(standalone.routePrefix, '');
  assert.equal(standalone.apiKey, 'explicit-standalone-key');
});

test('toRedactedProfileSummary never exposes apiKey in serialized output', () => {
  const { runtimes } = buildProfileCatalog({
    env: {
      HERMES_API_URL: 'http://127.0.0.1:8642',
      HERMES_API_KEY: 'super-secret-default',
      HERMES_PROFILES: 'coder',
      HERMES_API_KEY_CODER: 'super-secret-coder',
    },
    customProfiles: [
      {
        id: 'lab',
        mode: 'standalone',
        baseUrl: 'http://127.0.0.1:8660',
        apiKey: 'secret-lab-token',
        source: 'custom',
      },
    ],
  });

  const summaries = runtimes.map((r) => toRedactedProfileSummary(r));
  assert.equal(summaries.length, 3);
  for (const s of summaries) {
    assert.equal('apiKey' in s, false);
    assert.equal(JSON.stringify(s).includes('super-secret'), false);
    assert.equal(JSON.stringify(s).includes('secret-lab-token'), false);
    assert.equal(s.hasApiKey, true);
  }
});
