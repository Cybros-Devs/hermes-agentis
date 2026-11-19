import test from 'node:test';
import assert from 'node:assert/strict';
import { AVAILABLE_COMMANDS } from './cliEngine';
import {
  SLASH_COMMAND_CATALOG,
  filterSlashCommands,
  resolvePaletteSelection,
  shouldShowSlashPalette,
} from './slashPalette';

test('SLASH_COMMAND_CATALOG covers every command registered in AVAILABLE_COMMANDS', () => {
  const catalogSet = new Set(SLASH_COMMAND_CATALOG.map((c) => c.command));
  for (const cmd of AVAILABLE_COMMANDS) {
    assert.ok(catalogSet.has(cmd), `Expected SLASH_COMMAND_CATALOG to include ${cmd}`);
  }
});

test('shouldShowSlashPalette displays only during command token entry or explicit empty toggle', () => {
  assert.equal(shouldShowSlashPalette('', false), false);
  assert.equal(shouldShowSlashPalette('', true), true);
  assert.equal(shouldShowSlashPalette('/', false), true);
  assert.equal(shouldShowSlashPalette('/sk', false), true);
  assert.equal(shouldShowSlashPalette('/new ', false), false);
  assert.equal(shouldShowSlashPalette('check open PRs', true), false);
});

test('filterSlashCommands ranks exact/prefix matches first and surfaces /approve when approvals await', () => {
  const skillMatches = filterSlashCommands('/sk');
  assert.equal(skillMatches[0]?.command, '/skills');

  const gateMatches = filterSlashCommands('/gate');
  assert.equal(gateMatches[0]?.command, '/gateway');

  const urgentDefault = filterSlashCommands('/', { pendingApprovalCount: 2 });
  assert.equal(urgentDefault[0]?.command, '/approve');

  const emptyMatches = filterSlashCommands('/zzzzz');
  assert.equal(emptyMatches.length, 0);
});

test('resolvePaletteSelection distinguishes immediate commands from argument commands', () => {
  const skillsSpec = SLASH_COMMAND_CATALOG.find((c) => c.command === '/skills')!;
  const newSpec = SLASH_COMMAND_CATALOG.find((c) => c.command === '/new')!;

  assert.deepEqual(resolvePaletteSelection(skillsSpec), {
    mode: 'run',
    value: '/skills',
  });
  assert.deepEqual(resolvePaletteSelection(newSpec), {
    mode: 'insert',
    value: '/new ',
  });
});
