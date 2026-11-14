import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_APPROVALS,
  INITIAL_BRIEF_DECISIONS,
  INITIAL_TASKS,
  executeCliInput,
} from './cliEngine';

const baseCtx = {
  activeChannel: 'general' as const,
  approvals: INITIAL_APPROVALS,
  tasks: INITIAL_TASKS,
  brief: INITIAL_BRIEF_DECISIONS,
  isMuted: false,
};

test('executeCliInput routes natural language prompts to chat', () => {
  const res = executeCliInput('Summarize my morning brief', baseCtx);
  assert.equal(res.type, 'chat');
  if (res.type === 'chat') {
    assert.equal(res.prompt, 'Summarize my morning brief');
  }
});

test('executeCliInput handles /switch and validates channels', () => {
  const ok = executeCliInput('/switch ops', baseCtx);
  assert.equal(ok.type, 'handled');
  if (ok.type === 'handled') {
    assert.equal(ok.switchChannel, 'ops');
  }

  const bad = executeCliInput('/switch invalid-room', baseCtx);
  assert.equal(bad.type, 'handled');
  if (bad.type === 'handled') {
    assert.equal(bad.mood, 'alert');
    assert.equal(bad.switchChannel, undefined);
  }
});

test('executeCliInput approves pending card by id', () => {
  const res = executeCliInput('/approve card-1', baseCtx);
  assert.equal(res.type, 'handled');
  if (res.type === 'handled') {
    assert.equal(res.approveCardId, 'card-1');
    assert.equal(res.mood, 'happy');
  }
});

test('executeCliInput handles /shader modes including holo, norm, and invalid input', () => {
  const holo = executeCliInput('/shader holo', baseCtx);
  assert.equal(holo.type, 'handled');
  if (holo.type === 'handled') {
    assert.equal(holo.setShader, 'holo');
    assert.equal(holo.mood, 'focused');
  }

  const norm = executeCliInput('/shader norm', baseCtx);
  assert.equal(norm.type, 'handled');
  if (norm.type === 'handled') {
    assert.equal(norm.setShader, 'norm');
    assert.equal(norm.mood, 'focused');
  }

  const bad = executeCliInput('/shader invalid', baseCtx);
  assert.equal(bad.type, 'handled');
  if (bad.type === 'handled') {
    assert.equal(bad.setShader, undefined);
    assert.equal(bad.mood, 'alert');
  }
});

test('executeCliInput handles /style halftone dither modes', () => {
  const braille = executeCliInput('/style braille', baseCtx);
  assert.equal(braille.type, 'handled');
  if (braille.type === 'handled') {
    assert.equal(braille.setDitherStyle, 'braille');
    assert.equal(braille.mood, 'focused');
  }

  const invalid = executeCliInput('/style nope', baseCtx);
  assert.equal(invalid.type, 'handled');
  if (invalid.type === 'handled') {
    assert.equal(invalid.setDitherStyle, undefined);
    assert.equal(invalid.mood, 'alert');
  }
});

test('executeCliInput handles Hermes Agent /skills, /memory, /cron, /gateway, and /resume', () => {
  const skills = executeCliInput('/skills', baseCtx);
  assert.equal(skills.type, 'handled');
  if (skills.type === 'handled') {
    assert.match(skills.output, /duet-bridge/);
    assert.match(skills.output, /mcp__duet__/);
  }

  const mem = executeCliInput('/memory', baseCtx);
  assert.equal(mem.type, 'handled');
  if (mem.type === 'handled') {
    assert.match(mem.output, /8642/);
  }

  const cron = executeCliInput('/cron', baseCtx);
  assert.equal(cron.type, 'handled');
  if (cron.type === 'handled') {
    assert.match(cron.output, /cronjob_manage/i);
  }

  const gw = executeCliInput('/gateway', baseCtx);
  assert.equal(gw.type, 'handled');
  if (gw.type === 'handled') {
    assert.match(gw.output, /\/v1\/runs/);
  }

  const resume = executeCliInput('/resume duet-ops', baseCtx);
  assert.equal(resume.type, 'handled');
  if (resume.type === 'handled') {
    assert.equal(resume.switchChannel, 'ops');
  }
});



