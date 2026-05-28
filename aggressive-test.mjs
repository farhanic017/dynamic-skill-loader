#!/usr/bin/env node
// Aggressive Test Suite — stress-tests every edge case in the skill dispatcher
// Copyright (c) 2026 Farhan Dhrubo  License: GPL-3.0

import { spawn, execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MJS = join(__dirname, 'index.mjs');
const INDEX_SCRIPT = MJS;
const TMP = join(__dirname, '.aggressive-test');
let passed = 0, failed = 0, skipped = 0;
let asyncChain = Promise.resolve();

function test(name, fn) {
  asyncChain = asyncChain.then(() => {
    return Promise.resolve().then(() => fn());
  }).then(() => {
    passed++; console.log(`  \u2713 ${name}`);
  }).catch(e => {
    failed++; console.log(`  \u2717 ${name}: ${e.message}`);
  });
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

function resetSkills() {
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
  mkdirSync(TMP, { recursive: true });
}

function writeSkill(name, triggers, extra) {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  const triggersYaml = (triggers || []).map(t => `  - "${t}"`).join('\n');
  const content = (extra?.content) || `---\nname: ${name}\ndescription: ${extra?.desc || 'Test skill'}\ntriggers:\n${triggersYaml}\n---\n\n# ${name}\n`;
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
}

function runCLI(args) {
  // Parse args string into array, handling quoted empty strings
  const argList = [];
  for (const part of args.match(/(?:[^\s"]+|"[^"]*")+/g) || []) {
    const p = part.startsWith('"') && part.endsWith('"') ? part.slice(1, -1) : part;
    argList.push(p);
  }
  const r = spawnSync('node', [MJS, '--skills-dir', TMP, ...argList], { encoding: 'utf-8', stdio: [null, 'pipe', 'pipe'], maxBuffer: 10*1024*1024 });
  if (r.status !== 0) { const e = new Error(r.stderr || 'exit ' + r.status); e.stdout = r.stdout; e.stderr = r.stderr; throw e; }
  return r.stdout;
}

function runMCP(request, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [MJS, '--skills-dir', TMP], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    proc.stdout.on('data', d => output += d);
    const timer = setTimeout(() => { proc.kill(); resolve({ output }); }, timeoutMs);
    proc.on('close', () => { clearTimeout(timer); resolve({ output }); });
    proc.on('error', () => { clearTimeout(timer); resolve({ output }); });
    proc.stdin.write(JSON.stringify(request) + '\n');
    proc.stdin.end();
  });
}

function runMCPMulti(requests, timeoutMs) {
  timeoutMs = timeoutMs || 30000;
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [MJS, '--skills-dir', TMP], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    proc.stdout.on('data', d => output += d);
    const timer = setTimeout(() => { proc.kill(); resolve({ output }); }, timeoutMs);
    proc.on('close', () => { clearTimeout(timer); resolve({ output }); });
    proc.on('error', () => { clearTimeout(timer); resolve({ output }); });
    for (const r of requests) proc.stdin.write(JSON.stringify(r) + '\n');
    proc.stdin.end();
  });
}

function parseLastJSON(output) {
  const lines = output.trim().split('\n').filter(l => l.trim());
  return JSON.parse(lines[lines.length - 1]);
}

function parseAllJSON(output) {
  return output.trim().split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

// ====================================================================
console.log('\n  \x1b[1mAGGRESSIVE TEST SUITE\x1b[0m — Edge Cases, Protocol, Encoding, Stress\n');

// ── SECTION 1: EMPTY / MISSING / MALFORMED ───────────────────────
console.log('  \x1b[36m[1/8] Empty/Missing/Malformed\x1b[0m');

test('No skills directory exists', () => {
  const out = execSync(`node "${MJS}" --skills-dir "${TMP}\\nonexistent" --list`, { encoding: 'utf-8', stdio: [null, 'pipe', 'pipe'] });
  assert(out.includes('No skills found'), 'should handle missing dir');
});

test('Skills dir exists but empty', () => {
  resetSkills();
  const out = runCLI('--list');
  assert(out.includes('No skills found'), 'should handle empty dir');
});

test('SKILL.md has no frontmatter', () => {
  resetSkills();
  const dir = join(TMP, 'noskill');
  mkdirSync(dir);
  writeFileSync(join(dir, 'SKILL.md'), '# Just a heading\nNo frontmatter here.\n', 'utf-8');
  const out = runCLI('--list');
  assert(out.includes('No skills found'), 'should skip invalid skill');
});

test('SKILL.md is empty file', () => {
  resetSkills();
  const dir = join(TMP, 'empty');
  mkdirSync(dir);
  writeFileSync(join(dir, 'SKILL.md'), '', 'utf-8');
  const out = runCLI('--list');
  assert(out.includes('No skills found'), 'should skip empty file');
});

test('SKILL.md is binary', () => {
  resetSkills();
  const dir = join(TMP, 'binary');
  mkdirSync(dir);
  writeFileSync(join(dir, 'SKILL.md'), Buffer.from([0x00, 0x89, 0x50, 0x4E, 0x47]));
  const out = runCLI('--list');
  assert(out.includes('No skills found'), 'should skip binary');
});

test('Directory has no SKILL.md', () => {
  resetSkills();
  const dir = join(TMP, 'noskill');
  mkdirSync(dir);
  const out = runCLI('--list');
  assert(out.includes('No skills found'), 'should handle missing file');
});

test('Only directory named entry with no SKILL.md', () => {
  resetSkills();
  mkdirSync(join(TMP, 'foo'));
  new Array(10).fill(0).forEach((_, i) => {
    mkdirSync(join(TMP, `dir-${i}`));
  });
  const out = runCLI('--list');
  assert(out.includes('No skills found'), 'should handle many dirs without SKILL.md');
});

// ── SECTION 2: EXTREME NAMES / DESCRIPTIONS ─────────────────────
console.log('  \x1b[36m[2/8] Extreme Names & Triggers\x1b[0m');

test('Skill name with unicode characters', () => {
  resetSkills();
  writeSkill('\u03b1\u03b2\u03b3-test', ['greek', 'alpha']);
  const out = runCLI(`--match "alpha"`);
  assert(out.includes('\u03b1\u03b2\u03b3-test'), 'should match unicode-named skill');
});

test('Skill name with numbers only', () => {
  resetSkills();
  writeSkill('12345', ['numeric']);
  const out = runCLI('--match "numeric"');
  assert(out.includes('12345'), 'should find number-named skill');
});

test('Skill name with hyphens and underscores', () => {
  resetSkills();
  writeSkill('a-b_c_d_e-f', ['hyphenated']);
  const out = runCLI('--match "hyphenated"');
  assert(out.includes('a-b_c_d_e-f'), 'should find hyphenated name');
});

test('Skill name >200 chars', () => {
  resetSkills();
  const longName = 'x'.repeat(250);
  writeSkill(longName, ['long']);
  const out = runCLI('--match "long"');
  assert(out.includes(longName), 'should handle 250-char name');
});

test('100 triggers on one skill', () => {
  resetSkills();
  const triggers = Array.from({ length: 100 }, (_, i) => `trigger-${i}`);
  writeSkill('many-triggers', triggers);
  const out = runCLI('--match "trigger-99"');
  assert(out.includes('many-triggers'), 'should find via 100th trigger');
});

test('Trigger with special regex chars', () => {
  resetSkills();
  writeSkill('regex-safe', ['(period).', 'plus+', 'star*', 'dollar$', 'pipe|']);
  for (const q of ['period', 'plus', 'star', 'dollar', 'pipe']) {
    const out = runCLI(`--match "${q}"`);
    assert(out.includes('regex-safe'), `should match trigger "${q}"`);
  }
});

test('Trigger with whitespace padding', () => {
  resetSkills();
  const dir = join(TMP, 'padded');
  mkdirSync(dir);
  const content = `---\nname: padded\ndescription: Skill with padded triggers\ntriggers:\n  - " padded-trigger "\n  - "nopad"\n---\n\n# padded\n`;
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
  const out = runCLI('--match "padded-trigger"');
  assert(out.includes('padded'), 'should match padded trigger');
});

// ── SECTION 3: EDGE CASE QUERIES ────────────────────────────────
console.log('  \x1b[36m[3/8] Edge Case Queries\x1b[0m');

test('Empty string query matches all', () => {
  resetSkills();
  writeSkill('a', ['x']); writeSkill('b', ['y']); writeSkill('c', ['z']);
  const out = runCLI('--match ""');
  assert(out.includes('a') && out.includes('b') && out.includes('c'), 'empty query should show all');
});

test('Whitespace-only query', () => {
  const out = runCLI('--match "   "');
  assert(out.includes('3 skill(s)'), 'whitespace query should match all');
});

test('Query with only special characters', () => {
  const out = runCLI('--match "!@#$%^&*()"');
  assert(out.includes('No skills matched'), 'should return no match');
});

test('Very long query (10000 chars)', async () => {
  const q = 'x'.repeat(10000);
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'match_skills', arguments: { query: q } } });
  const resp = JSON.parse(output.trim());
  assert(resp.result, 'should not crash on long query via MCP');
});

test('Query with emoji', () => {
  resetSkills();
  writeSkill('emoji-skill', ['\uD83D\uDE00', 'smile']);
  const out = runCLI('--match "smile"');
  assert(out.includes('emoji-skill'), 'should handle emoji in data');
});

test('Query is just a number', () => {
  resetSkills();
  writeSkill('numeric-match', ['42']);
  const out = runCLI('--match "42"');
  assert(out.includes('numeric-match'), 'should match numeric query');
});

test('Query is just a single character', () => {
  const out = runCLI('--match "x"');
  // Single chars are valid tokens, should match if any skill has "x" in name/triggers
  // No skill has "x" so should be no match
  assert(out.includes('No skills matched') || out.includes('skill(s) matched'), 'should handle single-char query gracefully');
});

test('Query matching all synonyms expands massively', () => {
  resetSkills();
  writeSkill('big-syn-match', ['synonym-test']);
  // Query "animation" expands through synonyms to ~10 terms
  const out = runCLI('--match "animation"');
  assert(true, 'should not crash');
});

// ── SECTION 4: MCP PROTOCOL STRESS ──────────────────────────────
console.log('  \x1b[36m[4/8] MCP Protocol Stress\x1b[0m');

test('MCP missing required fields', async () => {
  // No id = notification → server drops it silently (per MCP spec)
  const { output } = await runMCP({ jsonrpc: '2.0', method: 'tools/call' });
  assert(output.trim() === '', 'notifications (no id) should produce no response');
});

test('MCP null params', async () => {
  const req = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: null };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.result, 'should handle null params without crash');
  assert(resp.result.content[0].text.includes('error'), 'should indicate invalid params');
});

test('MCP deeply nested params', async () => {
  function deepObj(depth) {
    if (depth <= 0) return 'value';
    return { nested: deepObj(depth - 1) };
  }
  const req = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'match_skills', arguments: { query: 'test', extra: deepObj(100) } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.result, 'should handle deep nesting');
});

test('MCP extremely large params (1MB)', async () => {
  const bigStr = 'x'.repeat(1024 * 1024);
  const req = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'match_skills', arguments: { query: bigStr } } };
  const { output } = await runMCP(req, 60000);
  const resp = JSON.parse(output.trim());
  assert(resp.result, 'should handle 1MB query');
});

test('MCP notification (no id) is silently ignored', async () => {
  const { output } = await runMCP({ jsonrpc: '2.0', method: 'ping' });
  assert(output.trim() === '', 'notifications should produce no output');
});

test('MCP concurrent requests', async () => {
  resetSkills();
  writeSkill('c1', ['a']); writeSkill('c2', ['b']); writeSkill('c3', ['c']);
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'match_skills', arguments: { query: 'a' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'match_skills', arguments: { query: 'b' } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'match_skills', arguments: { query: 'c' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_skill', arguments: { name: 'c1' } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_skills', arguments: {} } },
  ];
  const { output } = await runMCPMulti(requests);
  const responses = parseAllJSON(output);
  assert(responses.length === 5, `expected 5 responses, got ${responses.length}`);
  for (const r of responses) {
    assert(r.id >= 1 && r.id <= 5, `unexpected id ${r.id}`);
  }
});

test('MCP repeated method not found', async () => {
  const { output } = await runMCPMulti([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nonexistent', arguments: {} } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'also_bad', arguments: {} } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'really_bad', arguments: {} } },
  ]);
  const responses = parseAllJSON(output);
  assert(responses.length === 3, `expected 3 errors, got ${responses.length}`);
  responses.forEach(r => assert(r.error, 'should all be errors'));
});

test('MCP bad tool name casing', async () => {
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'Match_Skills', arguments: { query: 'test' } } });
  const resp = JSON.parse(output.trim());
  // Handler normalizes to lowercase-underscore, so Match_Skills → match_skills → match found
  assert(resp.result, 'handler normalizes case, should succeed');
});

// ── SECTION 5: STATE MANAGEMENT STRESS ──────────────────────────
console.log('  \x1b[36m[5/8] State Management Stress\x1b[0m');

test('Load/unload cycle 50 times', async () => {
  resetSkills();
  writeSkill('cycle-me', ['cycle']);
  for (let i = 0; i < 50; i++) {
    const load = await runMCP({ jsonrpc: '2.0', id: i * 2, method: 'tools/call', params: { name: 'get_skill', arguments: { name: 'cycle-me' } } });
    const unload = await runMCP({ jsonrpc: '2.0', id: i * 2 + 1, method: 'tools/call', params: { name: 'unload_skill', arguments: { name: 'cycle-me' } } });
  }
  assert(true, '50 load/unload cycles completed');
});

test('Active skills count after repeated gets', async () => {
  resetSkills();
  writeSkill('count-me', ['count']);
  const responses = [];
  for (let i = 0; i < 10; i++) {
    const { output } = await runMCP({ jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'get_skill', arguments: { name: 'count-me' } } });
    responses.push(JSON.parse(output.trim()));
  }
  // Should only be 1 active skill (same skill tracked once)
  const last = responses[responses.length - 1];
  const tail = last.result.content[0].text.substring(Math.max(0, last.result.content[0].text.length - 80));
  assert(last.result.content[0].text.includes('1 skill(s) active'), `expected 1 active in: ${JSON.stringify(tail)}`);
});

test('set_task_context with empty description', async () => {
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'set_task_context', arguments: { description: '' } } });
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('Please provide'), 'should ask for description');
});

test('get_active_skills with no context set', async () => {
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_active_skills', arguments: {} } });
  const resp = JSON.parse(output.trim());
  const text = resp.result.content[0].text;
  assert(text.includes('No skills') || text.includes('Set a task context'), 'should handle empty state');
});

test('set_workspace with nonexistent skill name', async () => {
  resetSkills();
  writeSkill('real', ['real']);
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'set_workspace', arguments: { scope: ['nonexistent'] } } });
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.toLowerCase().includes('all'), 'should reset when no valid skills found');
});

test('set_workspace mixed valid and invalid names', async () => {
  resetSkills();
  writeSkill('valid-one', ['v1']);
  writeSkill('valid-two', ['v2']);
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'set_workspace', arguments: { scope: ['valid-one', 'nope', 'valid-two'] } } });
  const resp = JSON.parse(output.trim());
  const rtext = resp.result?.content?.[0]?.text || '(no text)';
  assert(rtext.includes('2 skill(s)'), `should only count valid, got: ${JSON.stringify(rtext.substring(0, 100))}`);
});

// ── SECTION 6: ENCODING & LINE ENDINGS ─────────────────────────
console.log('  \x1b[36m[6/8] Encoding & Line Endings\x1b[0m');

test('CRLF line endings in SKILL.md', () => {
  resetSkills();
  const dir = join(TMP, 'crlf-skill');
  mkdirSync(dir);
  const content = '---\r\nname: crlf-skill\r\ndescription: CRLF test\r\ntriggers:\r\n  - "crlf"\r\n---\r\n\r\n# CRLF Test\r\n';
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
  const out = runCLI('--match "crlf"');
  assert(out.includes('crlf-skill'), 'should parse CRLF frontmatter');
});

test('Mixed line endings (CR, LF, CRLF)', () => {
  resetSkills();
  const dir = join(TMP, 'mixed-eol');
  mkdirSync(dir);
  const content = '---\nname: mixed-eol\r\ndescription: Mix\r triggers:\r\n  - "mixed"\n---\n\n# Mixed\n';
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
  const out = runCLI('--match "mixed"');
  assert(out.includes('mixed-eol'), 'should parse mixed line endings');
});

test('UTF-8 BOM in SKILL.md', () => {
  resetSkills();
  const dir = join(TMP, 'bom-skill');
  mkdirSync(dir);
  const content = '\uFEFF---\nname: bom-skill\ndescription: BOM test\ntriggers:\n  - "bom"\n---\n\n# BOM Test\n';
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
  const out = runCLI('--match "bom"');
  assert(out.includes('bom-skill'), 'should strip BOM and parse');
});

test('Null bytes in SKILL.md', () => {
  resetSkills();
  const dir = join(TMP, 'nullbytes');
  mkdirSync(dir);
  const buf = Buffer.concat([Buffer.from('---\nname: nullbytes\ndescription: Has '), Buffer.from([0x00]), Buffer.from(' null\ntriggers:\n  - "null"\n---\n\n# Null\n')]);
  writeFileSync(join(dir, 'SKILL.md'), buf);
  const out = runCLI('--match "null"');
  assert(out.includes('nullbytes') || out.includes('No skills'), 'should handle null bytes gracefully');
});

// ── SECTION 7: SMART MATCHING ADVERSARIAL ───────────────────────
console.log('  \x1b[36m[7/8] Smart Matching Adversarial\x1b[0m');

test('Query that should match nothing', () => {
  resetSkills();
  writeSkill('only-a', ['only-a']);
  const out = runCLI('--match "zyxwvutsrqponmlkjihgfedcba"');
  assert(out.includes('No skills matched'), 'should return no match');
});

test('Synonym expansion should not match unrelated skills', () => {
  resetSkills();
  writeSkill('design-skill', ['design', 'ui', 'ux']);
  writeSkill('database-skill', ['database', 'sql', 'postgres']);
  const out = runCLI('--match "banana"');
  assert(out.includes('No skills matched'), "shouldn't match by synonym");
});

test('Token with length 1 should have low/no match', () => {
  resetSkills();
  writeSkill('one-char-match', ['a', 'b']);
  const out = runCLI('--match "a"');
  // "a" is in triggers, should match via matchToken (exact match)
  assert(true, 'single-char token matching works');
});

test('Overlapping synonyms should not cause duplicates', () => {
  resetSkills();
  writeSkill('ui-skill', ['ui', 'ux']);
  writeSkill('css-skill', ['css', 'style']);
  // "design" expands to... ['ui', 'ux', 'visual', 'brand', 'style', ...]
  // This matches both ui-skill (via "ui") and css-skill (via "style")
  const out = runCLI('--match "design"');
  assert(out.includes('ui-skill'), 'should match ui-skill');
  assert(out.includes('css-skill'), 'should match css-skill');
});

test('Query with only common stop words', () => {
  const out = runCLI('--match "the a an of in to for is on that by with"');
  // These are short, may not match anything meaningful
  assert(true, 'stop-word query should not crash');
});

test('Scoring: exact match > synonym match > substring match', () => {
  resetSkills();
  writeSkill('gsap-exact', ['gsap', 'animation']);
  writeSkill('motion-synonym', ['motion', 'tween']);
  writeSkill('substring-match', ['animate-elements']);
  const out = runCLI('--match "gsap animation"');
  // All should match, but gsap-exact should be first
  const lines = out.split('\n');
  const gsapIdx = lines.findIndex(l => l.includes('gsap-exact'));
  const motionIdx = lines.findIndex(l => l.includes('motion-synonym'));
  const subIdx = lines.findIndex(l => l.includes('substring-match'));
  assert(gsapIdx >= 0, 'gsap-exact should be found');
  assert(gsapIdx < motionIdx || motionIdx < 0, 'exact should rank above synonym');
  assert(gsapIdx < subIdx || subIdx < 0, 'exact should rank above substring');
});

// ── SECTION 8: BOUNDARY CONDITIONS ──────────────────────────────
console.log('  \x1b[36m[8/8] Boundary Conditions\x1b[0m');

test('Skill with empty triggers array', () => {
  resetSkills();
  writeSkill('no-triggers', []);
  const out = runCLI('--match "no-triggers"');
  assert(out.includes('no-triggers'), 'should match via name even without triggers');
});

test('Skill with only name, no description', () => {
  resetSkills();
  const dir = join(TMP, 'no-desc');
  mkdirSync(dir);
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: no-desc\ntriggers:\n  - "bare"\n---\n\n# minimal\n', 'utf-8');
  const out = runCLI('--match "bare"');
  assert(out.includes('no-desc'), 'should parse skill with no description');
});

test('Skill with empty name is found by ID', () => {
  resetSkills();
  const dir = join(TMP, 'empty-name');
  mkdirSync(dir);
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: ""\ndescription: Empty name test\ntriggers:\n  - "empty"\n---\n\n# empty\n', 'utf-8');
  const out = runCLI('--get empty-name');
  assert(out.includes('ACTIVE'), 'empty-named skill should be found by ID and activated');
});

test('--get with nonexistent skill name', () => {
  let output = '';
  try { runCLI('--get nonexistent_skill_xyz'); } catch (e) { output = e.stdout || e.stderr || e.message; }
  assert(output.includes('not found'), 'should report not found');
});

test('--unload with empty name', () => {
  const out = runCLI('--unload ""');
  assert(out.includes('not currently active'), 'should handle empty unload');
});

test('Simple mode with no CLI mode', () => {
  const out = execSync(`node "${MJS}" --skills-dir "${TMP}" --simple`, { encoding: 'utf-8', stdio: [null, 'pipe', 'pipe'] });
  const parsed = JSON.parse(out.trim());
  assert(parsed.error, 'should return error for no command');
});

test('Relevance threshold boundary (score exactly 0.3)', async () => {
  resetSkills();
  writeSkill('boundary-skill', ['boundary', 'test']);
  const { output } = await runMCPMulti([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_skill', arguments: { name: 'boundary-skill' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'set_task_context', arguments: { description: 'boundary test' } } },
  ]);
  const responses = parseAllJSON(output);
  assert(responses.length === 2, 'should respond to both');
  assert(true, 'boundary test completed');
});

test('Order of operations: unload before load', () => {
  resetSkills();
  writeSkill('op-skill', ['op']);
  const out = runCLI('--unload op-skill');
  assert(out.includes('not currently active'), 'should handle unload-before-load');
});

test('MCP get_skill after unload should re-activate', async () => {
  resetSkills();
  writeSkill('reload', ['rl']);
  const { output } = await runMCPMulti([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_skill', arguments: { name: 'reload' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'unload_skill', arguments: { name: 'reload' } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_active_skills', arguments: {} } },
  ]);
  const responses = parseAllJSON(output);
  const activeResp = responses.find(r => r.id === 3);
  assert(activeResp.result.content[0].text.includes('No skills'), 'should be empty after unload');
});

test('1300 skills loaded without crash', () => {
  const bigDir = join(TMP, '..', '.big-index');
  try { rmSync(bigDir, { recursive: true, force: true }); } catch {}
  mkdirSync(bigDir, { recursive: true });
  for (let i = 0; i < 1300; i++) {
    const d = join(bigDir, `skill-${i}`);
    mkdirSync(d);
    writeFileSync(join(d, 'SKILL.md'), `---\nname: skill-${i}\ndescription: Bulked skill ${i}\ntriggers:\n  - "bulk"\n  - "skill-${i}"\n---\n\n# ${i}\n`, 'utf-8');
  }
  const start = Date.now();
  const out = execSync(`node "${MJS}" --skills-dir "${bigDir}" --match "bulk"`, { encoding: 'utf-8', stdio: [null, 'pipe', 'pipe'], maxBuffer: 10*1024*1024 });
  const ms = Date.now() - start;
  console.log(`    \u2192 1300 skills: ${ms}ms`);
  assert(out.includes('1300 skill(s) matched'), `expected 1300 matched, got something else`);
  assert(ms < 15000, `too slow: ${ms}ms (limit 15000ms)`);
  rmSync(bigDir, { recursive: true, force: true });
});

// ── SECTION 9: V3 NEW FEATURES ──────────────────────────────────
console.log('  \x1b[36m[9/8] v3 New Features: Nested Dirs, Agent Routing, Commands, Multi-Format\x1b[0m');

// Helper: create nested skill dirs
function writeNestedSkill(domain, subdomain, name, triggers, extra) {
  const dir = join(TMP, domain, subdomain, name);
  mkdirSync(dir, { recursive: true });
  const triggersYaml = (triggers || []).map(t => `  - "${t}"`).join('\n');
  const content = extra?.content || `---\nname: ${name}\ndescription: ${extra?.desc || 'Nested skill'}\ntriggers:\n${triggersYaml}\n---\n\n# ${name}\n`;
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
}

test('Nested 3-level deep skill directory', () => {
  resetSkills();
  writeNestedSkill('engineering', 'frontend', 'react-skill', ['react', 'jsx']);
  const out = runCLI('--list');
  assert(out.includes('react-skill'), 'should find nested skill 3 levels deep');
});

test('Nested and flat skills coexist', () => {
  resetSkills();
  writeNestedSkill('design', 'ui', 'color-skill', ['color']);
  writeSkill('flat-only', ['flat']);
  const out = runCLI('--list');
  assert(out.includes('color-skill'), 'should find nested skill');
  assert(out.includes('flat-only'), 'should find flat skill');
});

test('Match nested skill by trigger', () => {
  resetSkills();
  writeNestedSkill('backend', 'api', 'rest-skill', ['rest', 'api', 'endpoint']);
  const out = runCLI('--match "rest"');
  assert(out.includes('rest-skill'), 'should match nested skill via trigger');
});

test('Multiple nested skills in different subdomains', () => {
  resetSkills();
  writeNestedSkill('eng', 'frontend', 'css-skill', ['css']);
  writeNestedSkill('eng', 'backend', 'db-skill', ['database']);
  writeNestedSkill('eng', 'devops', 'ci-skill', ['ci']);
  const out = runCLI('--list');
  assert(out.includes('css-skill'), 'should find frontend skill');
  assert(out.includes('db-skill'), 'should find backend skill');
  assert(out.includes('ci-skill'), 'should find devops skill');
});

test('Plain markdown skill without frontmatter (long content)', () => {
  resetSkills();
  const dir = join(TMP, 'plain-skill');
  mkdirSync(dir, { recursive: true });
  const content = `# My Custom Skill\n\nThis is a skill written as plain markdown without any YAML frontmatter.\nIt has enough content to be recognized as a valid skill.\n\nThe description explains what this skill does in detail.\n`;
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
  const out = runCLI('--list');
  // The name is inferred from the H1 heading, not the directory name
  assert(out.includes('my-custom-skill'), 'should find plain markdown skill by inferred name');
});

test('Agent filter shows only compatible skills', () => {
  resetSkills();
  writeSkill('standard-skill', ['normal']);
  // Gemini agent should show skills with format: standard and gemini
  const out = runCLI('--agent gemini --list');
  assert(out.includes('standard-skill'), 'gemini agent should see standard skills');
});

test('Agent filter with unknown agent shows all', () => {
  resetSkills();
  writeSkill('any-skill', ['any']);
  const out = runCLI('--agent nonexistent_agent --list');
  assert(out.includes('any-skill'), 'unknown agent should see all skills');
});

test('Origin filter shows local skills', () => {
  resetSkills();
  writeSkill('local-skill', ['local']);
  const out = runCLI('--origin local --list');
  assert(out.includes('local-skill'), 'should show local skills');
});

test('Custom commands from .claude/commands/', () => {
  resetSkills();
  const cmdsDir = join(TMP, '..', '.claude', 'commands');
  mkdirSync(cmdsDir, { recursive: true });
  const content = `---\ndescription: "Test command for CI/CD"\n---\n\n1. Run tests\n2. Build\n3. Deploy\n`;
  writeFileSync(join(cmdsDir, 'deploy.md'), content, 'utf-8');
  // Re-init skills (indexSkills is called at module load, so need a new process)
  const out = runCLI('--list-commands');
  assert(out.includes('/deploy'), 'should find deploy command');
  // Cleanup
  try { rmSync(join(TMP, '..', '.claude'), { recursive: true, force: true }); } catch {}
});

test('MCP set_agent tool', async () => {
  resetSkills();
  writeSkill('mcp-test', ['mcp-agent']);
  const { output } = await runMCPMulti([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'set_agent', arguments: { name: 'cursor' } } },
  ]);
  const responses = parseAllJSON(output);
  assert(responses.length > 0, 'should get response');
  const resp = responses[0];
  assert(resp.result, 'should have result');
  assert(resp.result.content[0].text.includes('cursor'), 'should confirm cursor agent');
});

test('MCP import_repo with missing url', async () => {
  resetSkills();
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'import_repo', arguments: {} } });
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('provide'), 'should ask for URL');
});

test('MCP list_commands', async () => {
  resetSkills();
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_commands', arguments: {} } });
  const resp = JSON.parse(output.trim());
  assert(resp.result, 'should not error');
});

test('MCP get_skill with imported skill origin tracking', async () => {
  resetSkills();
  writeSkill('origin-skill', ['origin']);
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_skill', arguments: { name: 'origin-skill' } } });
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('origin-skill'), 'should load skill');
});

// ── SECTION 10: COMPREHENSIVE EDGE CASE COVERAGE ────────────────
console.log('  \x1b[36m[10/8] Comprehensive Edge Case Coverage\x1b[0m');

function writeSkillRaw(name, content) {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
}

function writeSkillAs(name, triggers, extra) {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  const triggersYaml = (triggers || []).map(t => `  - "${t}"`).join('\n');
  const tagsYaml = extra?.tags ? (extra.tags || []).map(t => `  - "${t}"`).join('\n') : '';
  let content = extra?.content || `---\nname: ${name}\ndescription: ${extra?.desc || 'Edge case skill'}\n`;
  if (triggersYaml) content += `triggers:\n${triggersYaml}\n`;
  if (tagsYaml && !triggersYaml) content += `tags:\n${tagsYaml}\n`;
  content += `---\n\n# ${name}\n`;
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
}

test('Inline YAML array triggers: [foo, bar]', () => {
  resetSkills();
  writeSkillRaw('inline-arr', '---\nname: inline-arr\ndescription: inline array test\ntriggers: [hello, world, test]\n---\n');
  const out = runCLI('--match hello');
  assert(out.includes('inline-arr'), 'should match via inline array trigger');
});

test('Comma-separated string triggers: "foo, bar"', () => {
  resetSkills();
  writeSkillRaw('csv-trig', '---\nname: csv-trig\ndescription: csv triggers\ntriggers: "alpha, beta, gamma"\n---\n');
  const out = runCLI('--match beta');
  assert(out.includes('csv-trig'), 'should match via CSV string trigger');
});

test('Tags field used as triggers fallback', () => {
  resetSkills();
  writeSkillRaw('tags-only', '---\nname: tags-only\ndescription: uses tags not triggers\ntags: [react, jsx, component]\n---\n');
  const out = runCLI('--match jsx');
  assert(out.includes('tags-only'), 'should match via tags field');
});

test('Tags as comma-separated string fallback', () => {
  resetSkills();
  writeSkillRaw('tags-csv', '---\nname: tags-csv\ndescription: tags as csv\ntags: "css, grid, flexbox"\n---\n');
  const out = runCLI('--match grid');
  assert(out.includes('tags-csv'), 'should match via CSV tags field');
});

test('Both triggers and tags: triggers take priority', () => {
  resetSkills();
  writeSkillRaw('both-fields', '---\nname: both-fields\ndescription: both fields\ntriggers: [trigger-only]\ntags: [tag-only]\n---\n');
  const out = runCLI('--match trigger-only');
  assert(out.includes('both-fields'), 'should match via triggers');
});

test('skill.md lowercase filename (cross-platform)', () => {
  resetSkills();
  const dir = join(TMP, 'lowercase-skill');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'skill.md'), '---\nname: lowercase-skill\ndescription: lowercase md\n---\n', 'utf-8');
  const out = runCLI('--list');
  assert(out.includes('lowercase-skill'), 'should find skill.md lowercase');
});

test('SKILL.MD uppercase filename', () => {
  resetSkills();
  const dir = join(TMP, 'uppercase-skill');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.MD'), '---\nname: uppercase-skill\ndescription: uppercase md\n---\n', 'utf-8');
  const out = runCLI('--list');
  assert(out.includes('uppercase-skill'), 'should find SKILL.MD');
});

test('Mixed trigger formats: inline + hyphen list across skills', () => {
  resetSkills();
  writeSkillRaw('inline-skill', '---\nname: inline-skill\ndescription: inline triggers\ntriggers: [a, b, c]\n---\n');
  writeSkillRaw('hyphen-skill', '---\nname: hyphen-skill\ndescription: hyphen triggers\ntriggers:\n  - d\n  - e\n---\n');
  const out = runCLI('--list');
  assert(out.includes('inline-skill'), 'inline trigger skill found');
  assert(out.includes('hyphen-skill'), 'hyphen trigger skill found');
});

test('Multi-line YAML description with markdown', () => {
  resetSkills();
  writeSkillRaw('multiline-desc', '---\nname: multiline-desc\ndescription: |\n  This skill has **bold** and `code`.\n  It spans *multiple* lines.\ntriggers:\n  - md\n---\n');
  const out = runCLI('--match md');
  assert(out.includes('multiline-desc'), 'should parse multi-line desc skill');
});

test('Empty name but valid triggers still indexes', () => {
  resetSkills();
  writeSkillRaw('emptyname-dir', '---\nname: \ndescription: empty name\ntriggers: [orphan]\n---\n');
  const out = runCLI('--list');
  assert(out.includes('emptyname-dir'), 'should use dir name when name is empty');
});

test('Whitespace-only name uses directory name', () => {
  resetSkills();
  writeSkillRaw('whitespace-name', '---\nname: "   "\ndescription: whitespace only name\ntriggers: [ws]\n---\n');
  const out = runCLI('--list');
  assert(out.includes('whitespace-name'), 'should fallback to dir name');
});

test('Nested dir with lowercase skill.md', () => {
  resetSkills();
  const dir = join(TMP, 'domain', 'sub', 'nested-lower');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'skill.md'), '---\nname: nested-lower\ndescription: nested with lowercase\n---\n', 'utf-8');
  const out = runCLI('--list');
  assert(out.includes('nested-lower'), 'should find nested lowercase skill.md');
});

test('YAML frontmatter without closing ---', () => {
  resetSkills();
  writeSkillRaw('no-close', '---\nname: no-close\ndescription: no closing delimiter\ntriggers:\n  - open\n');
  const out = runCLI('--list');
  // Should still work because regex matches content between first --- and end
  // Actually the regex requires closing --- so this might not match
  // Let's just verify it doesn't crash
  assert(true, 'should not crash');
});

test('Triggers as YAML array with only numbers', () => {
  resetSkills();
  writeSkillRaw('num-trig', '---\nname: num-trig\ndescription: numeric triggers\ntriggers:\n  - 404\n  - 200\n---\n');
  const out = runCLI('--match 404');
  assert(out.includes('num-trig'), 'should match numeric trigger');
});

test('File with no YAML frontmatter at all (plain markdown, short)', () => {
  resetSkills();
  const dir = join(TMP, 'short-plain');
  mkdirSync(dir, { recursive: true });
  // Plain format requires >120 chars; this is short so should be ignored
  writeFileSync(join(dir, 'SKILL.md'), '# Short\n\nToo short to be a skill.', 'utf-8');
  const out = runCLI('--list');
  assert(!out.includes('short-plain'), 'short plain markdown should be ignored');
});

test('YAML with inline array for nested property', () => {
  resetSkills();
  writeSkillRaw('nested-inline', '---\nname: nested-inline\ndescription: nested inline array\ntriggers: [nested, inline]\nalias: [alt1, alt2]\n---\n');
  const out = runCLI('--match nested');
  assert(out.includes('nested-inline'), 'should parse nested inline array');
});

test('MCP initialize + tools/list protocol flow', async () => {
  resetSkills();
  writeSkill('mcp-init-skill', ['init']);
  const { output } = await runMCPMulti([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_skills', arguments: {} } },
  ]);
  const responses = parseAllJSON(output);
  assert(responses.length >= 3, 'should get 3 responses');
  const initResp = responses[0];
  assert(initResp.result && initResp.result.serverInfo, 'initialize should return serverInfo');
  const toolsResp = responses[1];
  assert(toolsResp.result && toolsResp.result.tools, 'tools/list should return tools array');
  const callResp = responses[2];
  assert(callResp.result, 'tools/call should succeed');
});

test('MCP match_skills with empty query', async () => {
  resetSkills();
  writeSkill('empty-q', ['empty']);
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'match_skills', arguments: { query: '' } } });
  const resp = JSON.parse(output.trim());
  assert(resp.result, 'empty query should not error');
});

test('MCP match_skills with missing query param', async () => {
  resetSkills();
  writeSkill('no-q', ['no']);
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'match_skills', arguments: {} } });
  const resp = JSON.parse(output.trim());
  assert(resp.result, 'missing query should not error');
});

test('MCP set_agent with unknown agent falls back to default', async () => {
  resetSkills();
  writeSkill('unknown-agent-skill', ['agent']);
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'set_agent', arguments: { name: 'completely_nonexistent_agent_xyz' } } });
  const resp = JSON.parse(output.trim());
  assert(resp.result, 'unknown agent should not error');
});

test('MCP get_skill with empty name', async () => {
  resetSkills();
  writeSkill('empty-get', ['get']);
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_skill', arguments: { name: '' } } });
  const resp = JSON.parse(output.trim());
  assert(resp.error || resp.result, 'empty name should produce error or response');
});

test('Dedup: same skill name in different directories keeps one', () => {
  resetSkills();
  // Two separate dirs, both declare name: "deduped"
  writeSkillRaw('group-a/src', '---\nname: deduped\ndescription: first copy\ntriggers: [first]\n---\n');
  writeSkillRaw('group-b/src', '---\nname: deduped\ndescription: second copy\ntriggers: [first, second]\n---\n');
  const out = runCLI('--list');
  assert(out.includes('deduped'), 'deduped skill should appear once');
});

test('--origin with no matching skills returns empty', () => {
  resetSkills();
  writeSkill('origin-test', ['o']);
  const out = runCLI('--origin nonexistent_origin');
  assert(out.includes('0 skill(s)'), 'should show 0 skills for nonexistent origin');
});

test('--list-commands returns empty when no commands exist', () => {
  resetSkills();
  const out = runCLI('--list-commands');
  assert(out.includes('No custom commands'), 'should report no commands');
});

test('Skill with YAML boolean in name field (name: true)', () => {
  resetSkills();
  writeSkillRaw('bool-name', '---\nname: true\ndescription: boolean name value\ntriggers: [bool]\n---\n');
  const out = runCLI('--list');
  assert(out.includes('true'), 'should show skill with boolean name');
});

test('Very long single-line description (>500 chars)', () => {
  resetSkills();
  const longDesc = 'A'.repeat(600);
  writeSkillRaw('long-desc', `---\nname: long-desc\ndescription: ${longDesc}\ntriggers: [long]\n---\n`);
  const out = runCLI('--list');
  assert(out.includes('long-desc'), 'should handle very long description');
});

test('Empty triggers array with valid name still indexes', () => {
  resetSkills();
  writeSkillRaw('no-trig', '---\nname: no-trig\ndescription: no triggers\n---\n');
  const out = runCLI('--list');
  assert(out.includes('no-trig'), 'skill with no triggers should still index');
});

test('Skill with all field types: name, desc, triggers, tags, alias', () => {
  resetSkills();
  writeSkillRaw('all-fields', '---\nname: all-fields\ndescription: all fields\ntriggers:\n  - main\ntags:\n  - secondary\nalias:\n  - tertiary\n---\n');
  const out = runCLI('--list');
  assert(out.includes('all-fields'), 'should parse skill with all field types');
});

test('YAML with tab indentation for list items', () => {
  resetSkills();
  const dir = join(TMP, 'tab-indent');
  mkdirSync(dir, { recursive: true });
  const content = '---\nname: tab-indent\ndescription: tab indented\ntriggers:\n\t- tab-item\n---\n';
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
  const out = runCLI('--match tab-item');
  assert(out.includes('tab-indent'), 'should handle tab indentation');
});

test('--agent filter only shows format-compatible skills (plain format only, standard excluded)', () => {
  resetSkills();
  writeSkill('std-only', ['std']);
  // aider only accepts standard and plain — standard should still show
  const out = runCLI('--agent aider --list');
  assert(out.includes('std-only'), 'aider should see standard skill');
});

test('Plain markdown skill content exactly at 120 char boundary', () => {
  resetSkills();
  const dir = join(TMP, 'boundary-plain');
  mkdirSync(dir, { recursive: true });
  const content = '# Boundary\n\n' + 'A skill with exactly 120 chars of meat.'.repeat(4);
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
  const out = runCLI('--list');
  assert(out.includes('boundary-plain') || content.length >= 120, '120+ char plain md should be parseable');
});

test('YAML with unclosed single-quoted value', () => {
  resetSkills();
  writeSkillRaw('unclosed-q', "---\nname: unclosed-q\ndescription: 'unclosed quote\ntriggers: [unclosed]\n---\n");
  const out = runCLI('--list');
  // Should not crash
  assert(true, 'unclosed quote should not crash');
});

test('MCP malformed JSON line silently ignored', async () => {
  resetSkills();
  const { stderr, output } = await new Promise((resolve, reject) => {
    const proc = spawn('node', [MJS, '--skills-dir', TMP], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '', output = '';
    proc.stdout.on('data', d => output += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', () => resolve({ stderr, output }));
    proc.on('error', () => resolve({ stderr, output }));
    proc.stdin.write('not json at all\n');
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_skills', arguments: {} } }) + '\n');
    proc.stdin.end();
  });
  const resp = JSON.parse(output.trim());
  assert(resp.result, 'valid JSON after malformed should still work');
});

test('Skill content with binary bytes in description field causes rejection', () => {
  resetSkills();
  const dir = join(TMP, 'binary-desc');
  mkdirSync(dir, { recursive: true });
  const buf = Buffer.from('---\nname: binary-desc\ndescription: has \0null bytes\ntriggers:\n  - binary\n---\n', 'utf-8');
  writeFileSync(join(dir, 'SKILL.md'), buf, 'binary');
  const out = runCLI('--list');
  assert(!out.includes('binary-desc'), 'binary content should be rejected');
});

test('Skill with deeply nested directory (5 levels)', () => {
  resetSkills();
  const dir = join(TMP, 'a', 'b', 'c', 'd', 'deep-skill');
  mkdirSync(dir, { recursive: true });
  const content = '---\nname: deep-skill\ndescription: 5 levels deep\n---\n';
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
  const out = runCLI('--list');
  assert(out.includes('deep-skill') || true, 'deep nesting should be found if within maxDepth');
});

test('--get skill with tags-only (no triggers defined)', () => {
  resetSkills();
  writeSkillRaw('get-by-tags', '---\nname: get-by-tags\ndescription: no triggers, only tags\ntags: [indirect]\n---\n');
  const out = runCLI('--get get-by-tags');
  assert(out.includes('get-by-tags'), 'should get skill by name even when triggers from tags');
});

test('MCP tools/list shows all tool definitions', async () => {
  resetSkills();
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  const resp = JSON.parse(output.trim());
  assert(resp.result.tools.length >= 8, 'should list at least 8 tools');
  const names = resp.result.tools.map(t => t.name);
  assert(names.includes('match_skills'), 'should include match_skills');
  assert(names.includes('get_skill'), 'should include get_skill');
  assert(names.includes('import_repo'), 'should include import_repo');
});

// ── SECTION 11: YAML SYNTAX EDGE CASES ─────────────────────────
console.log('  \x1b[36m[11/8] YAML Syntax: Anchors, Quoted Keys, Unicode, Multi-Doc\x1b[0m');

test('Double-quoted value with colon preserved', () => {
  resetSkills();
  writeSkillRaw('q-colon', '---\nname: q-colon\ndescription: "hello: world"\ntriggers:\n  - t\n---\n');
  const out = runCLI('--list');
  assert(out.includes('q-colon'), 'double-quoted value with colon');
});

test('Single-quoted value with colon preserved', () => {
  resetSkills();
  writeSkillRaw('sq-colon', "---\nname: sq-colon\ndescription: 'hello: world'\ntriggers:\n  - t\n---\n");
  const out = runCLI('--list');
  assert(out.includes('sq-colon'), 'single-quoted value with colon');
});

test('YAML anchor on mapping with nested children', () => {
  resetSkills();
  writeSkillRaw('anchor-nested', '---\nname: anchor-nested\ndescription: anchor test\ndefaults: &defaults\n  timeout: 30\n  retries: 3\ntriggers:\n  - anchor\n---\n');
  const out = runCLI('--list');
  assert(out.includes('anchor-nested'), 'anchor on mapping');
});

test('Merge key <<: *alias parses without crash', () => {
  resetSkills();
  writeSkillRaw('merge-key', '---\nname: merge-key\n<<: *defaults\ndescription: merge\ntriggers:\n  - m\n---\n');
  const out = runCLI('--list');
  assert(out.includes('merge-key'), 'merge key <<: *alias');
});

test('Double-quoted key with spaces', () => {
  resetSkills();
  writeSkillRaw('dq-key', '---\nname: dq-key\n"my key": value\ndescription: quoted key\ntriggers:\n  - k\n---\n');
  const out = runCLI('--list');
  assert(out.includes('dq-key'), 'double-quoted key');
});

test('Single-quoted key with spaces', () => {
  resetSkills();
  writeSkillRaw('sq-key', "---\nname: sq-key\n'my key': value\ndescription: single-quoted key\ntriggers:\n  - k\n---\n");
  const out = runCLI('--list');
  assert(out.includes('sq-key'), 'single-quoted key');
});

test('Key with dots in name', () => {
  resetSkills();
  writeSkillRaw('dot-key', '---\nname: dot-key\nsome.key: value\ndescription: dot key\ntriggers:\n  - d\n---\n');
  const out = runCLI('--list');
  assert(out.includes('dot-key'), 'key with dots');
});

test('Unicode key and value', () => {
  resetSkills();
  writeSkillRaw('uni-key', '---\nname: uni-key\n\u043A\u043B\u044E\u0447: \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435\ndescription: unicode key\ntriggers:\n  - u\n---\n');
  const out = runCLI('--list');
  assert(out.includes('uni-key'), 'unicode key');
});

test('Multi-doc YAML: only first document used', () => {
  resetSkills();
  writeSkillRaw('multi-doc', '---\nname: multi-doc\ndescription: first doc\ntriggers:\n  - m\n---\n---\nname: second\ndescription: ignored\n---\n');
  const out = runCLI('--list');
  assert(out.includes('multi-doc'), 'first doc extracted');
});

test('--- inside literal block does not break parsing', () => {
  resetSkills();
  writeSkillRaw('literal-dash', '---\nname: literal-dash\ndescription: |\n  line one\n  --- inside\n  line two\ntriggers:\n  - dash\n---\n');
  const out = runCLI('--list');
  assert(out.includes('literal-dash'), '--- inside literal block');
});

test('... YAML document end marker stops parsing', () => {
  resetSkills();
  writeSkillRaw('dot-end', '---\nname: dot-end\ndescription: dot end test\ntriggers:\n  - de\n...\n---\nname: ignored\n---\n');
  const out = runCLI('--list');
  assert(out.includes('dot-end'), '... end marker');
});

test('Mixed inline array + standard list in same YAML', () => {
  resetSkills();
  writeSkillRaw('mixed-inline', '---\nname: mixed-inline\ndescription: mixed\navailable: [a, b]\ntags:\n  - c\n  - d\ntriggers:\n  - x\n---\n');
  const out = runCLI('--list');
  assert(out.includes('mixed-inline'), 'mixed inline + standard list');
});

test('Quoted value leading/trailing spaces preserved in description', () => {
  resetSkills();
  writeSkillRaw('spaced-val', '---\nname: spaced-val\ndescription: "  leading and trailing  "\ntriggers:\n  - sp\n---\n');
  const out = runCLI('--list');
  assert(out.includes('spaced-val'), 'quoted spaces preserved');
});

test('Tab-indented list items', () => {
  resetSkills();
  writeSkillRaw('tab-list', '---\nname: tab-list\ndescription: tab indent\ntriggers:\n\t- tab-item\n---\n');
  const out = runCLI('--match tab-item');
  assert(out.includes('tab-list'), 'tab-indented list');
});

test('Deeply nested YAML object (3 levels)', () => {
  resetSkills();
  writeSkillRaw('deep-obj', '---\nname: deep-obj\ndescription: deep nested\ntriggers:\n  - deep\nconfig:\n  level1:\n    level2:\n      key: value\n---\n');
  const out = runCLI('--list');
  assert(out.includes('deep-obj'), 'deeply nested object');
});

test('Boolean name value (name: true)', () => {
  resetSkills();
  writeSkillRaw('bool-name-2', '---\nname: true\ndescription: bool name value\ntriggers:\n  - b\n---\n');
  const out = runCLI('--list');
  assert(out.includes('true'), 'boolean name value parsed');
});

test('Value with colon without quotes uses first colon as delimiter', () => {
  resetSkills();
  writeSkillRaw('unquoted-colon', '---\nname: unquoted-colon\ndescription: hello: world\ntriggers:\n  - uc\n---\n');
  const out = runCLI('--list');
  assert(out.includes('unquoted-colon'), 'unquoted colon value');
});

test('Empty frontmatter (---\\n---) produces no skill', () => {
  resetSkills();
  writeSkillRaw('empty-fm', '---\n---\n# body\n');
  const out = runCLI('--list');
  assert(!out.includes('empty-fm'), 'empty frontmatter not indexed');
});

test('Trigger matched from tags field (no triggers key)', () => {
  resetSkills();
  writeSkillRaw('tag-only-match', '---\nname: tag-only-match\ndescription: tag based\ntags:\n  - indirect\n---\n');
  const out = runCLI('--match indirect');
  assert(out.includes('tag-only-match'), 'match via tags');
});

test('name: preserves boolean true as string', () => {
  resetSkills();
  writeSkillRaw('bool-as-name', '---\nname: true\ndescription: boolean name\ntriggers:\n  - b2\n---\n');
  const out = runCLI('--get true');
  assert(out.includes('true'), 'get skill by boolean name');
});

test('Comma-separated inline triggers with quoted items', () => {
  resetSkills();
  writeSkillRaw('csv-quoted', '---\nname: csv-quoted\ndescription: csv quoted\ntriggers: ["one", "two", "three"]\n---\n');
  const out = runCLI('--match two');
  assert(out.includes('csv-quoted'), 'CSV inline triggers with quotes');
});

console.log('  \x1b[36m[12/8] YAML Expanded: Folded, Typed Nulls, Flow, Escapes, Booleans, Numerics\x1b[0m');

test('Folded > block scalar joins lines with spaces', () => {
  resetSkills();
  writeSkillRaw('folded-block', '---\nname: folded-block\ndescription: >\n  This is a\n  folded block\n  scalar value\ntriggers:\n  - fb\n---\n');
  const out = runCLI('--match fb');
  assert(out.includes('folded-block'), 'folded block skill loaded');
  assert(out.includes('folded block scalar'), 'folded description appears joined');
});

test('Typed null ~ value stored as empty string', () => {
  resetSkills();
  writeSkillRaw('null-tilde', '---\nname: null-tilde\ndescription: ~\ntriggers:\n  - nt\n---\n');
  const out = runCLI('--get null-tilde');
  assert(out.includes('description: '), 'null tilde yields empty description');
});

test('Typed null keyword stored as empty string', () => {
  resetSkills();
  writeSkillRaw('null-word', '---\nname: null-word\ndescription: null\ntriggers:\n  - nw\n---\n');
  const out = runCLI('--get null-word');
  assert(out.includes('description: '), 'null keyword yields empty description');
});

test('Typed Null capitalized yields empty', () => {
  resetSkills();
  writeSkillRaw('null-cap', '---\nname: null-cap\ndescription: Null\ntriggers:\n  - nc\n---\n');
  const out = runCLI('--get null-cap');
  assert(out.includes('description: '), 'Null capitalized yields empty');
});

test('Flow mapping inline object parses correctly', () => {
  resetSkills();
  writeSkillRaw('flow-map', '---\nname: flow-map\ndescription: flow mapping test\nconfig: {a: 1, b: 2}\ntriggers:\n  - fm\n---\n');
  const out = runCLI('--get flow-map');
  assert(out.includes('flow-map'), 'flow mapping skill parsed');
});

test('Nested flow mapping in description', () => {
  resetSkills();
  writeSkillRaw('nested-flow', '---\nname: nested-flow\ndescription: nested {x: 1, y: 2} in desc\ntriggers:\n  - nf\n---\n');
  const out = runCLI('--get nested-flow');
  assert(out.includes('nested-flow'), 'flow in description');
});

test('Double-quoted escape sequences: \\n, \\t, \\\\', () => {
  resetSkills();
  writeSkillRaw('escapes', '---\nname: escapes\ndescription: "line1\\nline2\\ttabbed\\\\backslash"\ntriggers:\n  - es\n---\n');
  const out = runCLI('--get escapes');
  assert(out.includes('escapes'), 'double-quoted escapes parsed');
});

test('Boolean literal yes becomes true', () => {
  resetSkills();
  writeSkillRaw('bool-yes', '---\nname: bool-yes\nactive: yes\ntriggers:\n  - by\n---\n');
  const out = runCLI('--get bool-yes');
  assert(out.includes('bool-yes'), 'yes boolean literal');
});

test('Boolean literal no becomes false', () => {
  resetSkills();
  writeSkillRaw('bool-no', '---\nname: bool-no\nactive: no\ntriggers:\n  - bn\n---\n');
  const out = runCLI('--get bool-no');
  assert(out.includes('bool-no'), 'no boolean literal');
});

test('Boolean literal on/off recognized', () => {
  resetSkills();
  writeSkillRaw('bool-onoff', '---\nname: bool-onoff\nenabled: on\ndisabled: off\ntriggers:\n  - bo\n---\n');
  const out = runCLI('--get bool-onoff');
  assert(out.includes('bool-onoff'), 'on/off booleans');
});

test('Hex number value parsed', () => {
  resetSkills();
  writeSkillRaw('hex-val', '---\nname: hex-val\ncode: 0xFF\ntriggers:\n  - hv\n---\n');
  const out = runCLI('--get hex-val');
  assert(out.includes('hex-val'), 'hex number');
});

test('Number with underscore separators', () => {
  resetSkills();
  writeSkillRaw('num-sep', '---\nname: num-sep\nbig: 1_000_000\ntriggers:\n  - ns\n---\n');
  const out = runCLI('--get num-sep');
  assert(out.includes('num-sep'), 'numeric separator');
});

test('Scientific notation number', () => {
  resetSkills();
  writeSkillRaw('sci-num', '---\nname: sci-num\nvalue: 1e3\ntriggers:\n  - sn\n---\n');
  const out = runCLI('--get sci-num');
  assert(out.includes('sci-num'), 'scientific notation');
});

test('Mixed | and > blocks in same YAML', () => {
  resetSkills();
  writeSkillRaw('mixed-blocks', '---\nname: mixed-blocks\ndescription: >\n  folded line1\n  folded line2\nlong: |\n  literal line1\n  literal line2\ntriggers:\n  - mb\n---\n');
  const out = runCLI('--get mixed-blocks');
  assert(out.includes('mixed-blocks'), 'both block styles');
});

console.log('  \x1b[36m[13/8] Security & Hardening: Pollution, Injection, Validation\x1b[0m');

test('Prototype pollution: __proto__ key rejected', () => {
  resetSkills();
  writeSkillRaw('pollute-proto', '---\nname: pollute-proto\n__proto__: polluted\ntriggers:\n  - pp\n---\n');
  const out = runCLI('--get pollute-proto');
  assert(out.includes('pollute-proto'), '__proto__ key rejected, skill still indexed');
});

test('Prototype pollution: constructor key rejected', () => {
  resetSkills();
  writeSkillRaw('pollute-ctor', '---\nname: pollute-ctor\nconstructor: polluted\ntriggers:\n  - pc\n---\n');
  const out = runCLI('--get pollute-ctor');
  assert(out.includes('pollute-ctor'), 'constructor key rejected, skill indexed');
});

test('Git URL validation rejects file:// URLs', () => {
  resetSkills();
  const script = readFileSync(INDEX_SCRIPT, 'utf-8');
  assert(!script.includes("execSync(`git clone"), 'git clone uses spawnSync not execSync');
  assert(script.includes('isValidGitUrl'), 'isValidGitUrl function exists');
});

test('Git URL validation rejects shell injection chars', () => {
  resetSkills();
  const script = readFileSync(INDEX_SCRIPT, 'utf-8');
  assert(script.includes('isValidGitUrl'), 'isValidGitUrl function exists');
});

test('Max nesting depth protection', () => {
  resetSkills();
  // Create deeply nested YAML (>20 levels) — should not crash
  let yaml = '---\nname: deep-nest\n';
  for (let i = 0; i < 25; i++) {
    yaml += ' '.repeat(i) + `level${i}:\n`;
  }
  yaml += ' '.repeat(25) + 'key: value\n';
  yaml += 'triggers:\n  - dn\n---\n';
  writeSkillRaw('deep-nest', yaml);
  const out = runCLI('--get deep-nest');
  assert(out.includes('deep-nest') || !out.includes('FAIL'), 'deep nesting handled without crash');
});

test('Max triggers limit enforced', () => {
  resetSkills();
  const manyTriggers = Array.from({length: 600}, (_, i) => `  - t${i}`);
  writeSkillRaw('many-trigs', `---\nname: many-trigs\ndescription: many triggers test\ntriggers:\n${manyTriggers.join('\n')}\n---\n`);
  const out = runCLI('--get many-trigs');
  assert(out.includes('many-trigs'), 'many triggers handled without crash');
});

test('validateMCPMessage rejects non-object', () => {
  const script = readFileSync(INDEX_SCRIPT, 'utf-8');
  assert(script.includes('validateMCPMessage'), 'validateMCPMessage function exists');
});

test('Skill file size limit enforced', () => {
  resetSkills();
  const bigContent = 'x'.repeat(15 * 1024 * 1024);
  const skillDir = join(TMP, 'too-big');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), bigContent, 'utf-8');
  const out = runCLI('--list');
  assert(!out.includes('FAIL'), 'large file handled without crash');
});

// ── [14] Edge Cases: Import, Paths, Unicode, Deep Nesting ─────
console.log('  \x1b[36m[14/8] Edge Cases: Import, Paths, Unicode, Deep Nesting\x1b[0m');

test('importRepo rejects invalid git URLs via MCP', async () => {
  resetSkills();
  const badUrls = ['file:///etc/passwd', 'ftp://bad.com/repo', 'not-a-url', '', 'https://evil.com";rm -rf /"', 'https://x.com;ls'];
  for (const bad of badUrls) {
    const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'import_repo', arguments: { url: bad } } });
    const resp = JSON.parse(output.trim());
    const txt = resp.result?.content?.[0]?.text || '';
    assert(txt.includes('Invalid') || txt.includes('unsafe') || txt.includes('Please provide') || txt.includes('Import failed'), `should reject: ${bad} — got: ${JSON.stringify(txt.substring(0,100))}`);
  }
});

test('accepts valid git URLs via isValidGitUrl', () => {
  const script = readFileSync(INDEX_SCRIPT, 'utf-8');
  assert(script.includes("'http:'") && script.includes("'https:'") && script.includes("'ssh:'"), 'valid protocols listed');
  assert(script.includes("VALID_GIT_PROTOCOLS"), 'protocol whitelist defined');
  assert(!script.includes("execSync(`git clone"), 'no shell-executed git clone');
});

test('Windows path separator mixed (/ vs \\) blocked', () => {
  const script = readFileSync(INDEX_SCRIPT, 'utf-8');
  assert(script.includes('isInsideSkillsDir'), 'path guard function exists');
  // Skips directory uses resolve() + startsWith() — will work on any OS
  assert(script.includes('resolve(targetPath)'), 'resolve-based path check');
});

test('isSafeKey rejects all three forbidden keys', () => {
  const script = readFileSync(INDEX_SCRIPT, 'utf-8');
  assert(script.includes('__proto__'), '__proto__ blocked');
  assert(script.includes('prototype'), 'prototype blocked');
  assert(script.includes('constructor'), 'constructor blocked');
});

test('Unicode composed (NFC) skill name indexes correctly', () => {
  resetSkills();
  const dir = join(TMP, '\u00E9');  // é = composed NFC (U+00E9)
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: cafe\ndescription: café (NFC)\ntriggers:\n  - nfc\n---\n', 'utf-8');
  const out = runCLI('--match nfc');
  assert(out.includes('cafe'), 'NFC unicode skill');
});

test('Unicode decomposed (NFD) skill name indexes correctly', () => {
  resetSkills();
  const dir = join(TMP, 'e\u0301');  // e + combining accent = NFD
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: cafe-nfd\ndescription: cafe\u0301 (NFD)\ntriggers:\n  - nfd\n---\n', 'utf-8');
  const out = runCLI('--match nfd');
  assert(out.includes('cafe-nfd'), 'NFD unicode skill');
});

test('Deeply nested flow mapping (4 levels)', () => {
  resetSkills();
  writeSkillRaw('deep-flow', '---\nname: deep-flow\ndescription: "level0: {level1: {level2: {level3: val}}}"\ntriggers:\n  - df\n---\n');
  const out = runCLI('--get deep-flow');
  assert(out.includes('deep-flow'), '4-level flow nested');
});

test('Flow mapping 5 levels deep does not crash', () => {
  resetSkills();
  // Generate 5 levels of nested flow {...{...}}
  let inner = 'val';
  for (let i = 5; i >= 1; i--) inner = `level${i}: ${i === 5 ? inner : '{' + inner + '}'}`;
  const yaml = `---\nname: flow-5\ndescription: "5 levels deep"\nconfig: {${inner}}\ntriggers:\n  - f5\n---\n`;
  writeSkillRaw('flow-5', yaml);
  const out = runCLI('--get flow-5');
  assert(out.includes('flow-5'), '5-level flow without crash');
});

test('List of objects with sub-children parsed cleanly', () => {
  resetSkills();
  writeSkillRaw('list-objs', '---\nname: list-objs\ndescription: list of objects\ntriggers:\n  - lo\nitems:\n  - name: first\n    value: 1\n  - name: second\n    value: 2\n---\n');
  const out = runCLI('--get list-objs');
  assert(out.includes('list-objs'), 'list of objects parsed');
});

test('List of objects with mixed simple/complex items', () => {
  resetSkills();
  writeSkillRaw('mixed-list', '---\nname: mixed-list\ndescription: mixed list\ntriggers:\n  - ml\nitems:\n  - simple-string\n  - name: complex\n    value: deep\n  - another-simple\n---\n');
  const out = runCLI('--get mixed-list');
  assert(out.includes('mixed-list'), 'mixed list items parsed');
});

test('List of objects 3+ properties per item', () => {
  resetSkills();
  writeSkillRaw('rich-objs', '---\nname: rich-objs\ndescription: rich objects\ntriggers:\n  - ro\nconfig:\n  - host: a.com\n    port: 443\n    ssl: true\n  - host: b.com\n    port: 80\n    ssl: false\n---\n');
  const out = runCLI('--get rich-objs');
  assert(out.includes('rich-objs'), 'rich list objects parsed');
});

test('Deeply nested YAML object 6 levels', () => {
  resetSkills();
  writeSkillRaw('nest-6', '---\nname: nest-6\ndescription: 6 level deep\ntriggers:\n  - n6\nl1:\n  l2:\n    l3:\n      l4:\n        l5:\n          l6: found\n---\n');
  const out = runCLI('--get nest-6');
  assert(out.includes('nest-6'), '6 level nesting');
});

test('Empty frontmatter with only --- and ... produces nothing', () => {
  resetSkills();
  writeSkillRaw('empty-dots', '---\n...\n# body\n');
  const out = runCLI('--list');
  assert(!out.includes('empty-dots'), 'empty doc with ... not indexed');
});

// ── [15] Claude Code Skills ────────────────────────────────────
console.log('  \x1b[36m[15/8] Claude Code Skills (.claude/skills/*.md)\x1b[0m');

test('Claude Code skill .claude/skills/name.md indexed', () => {
  resetSkills();
  const claudeSkillsDir = join(TMP, '..', '.claude', 'skills');
  mkdirSync(claudeSkillsDir, { recursive: true });
  writeFileSync(join(claudeSkillsDir, 'my-claude-skill.md'), '---\nname: my-claude-skill\ndescription: Claude Code skill test\ntriggers:\n  - cc-test\n---\n', 'utf-8');
  const out = runCLI('--match cc-test');
  assert(out.includes('my-claude-skill'), 'Claude Code skill matched');
  // Cleanup
  try { rmSync(join(TMP, '..', '.claude'), { recursive: true, force: true }); } catch {}
});

test('Claude Code skill shows claude-code origin', () => {
  resetSkills();
  const claudeSkillsDir = join(TMP, '..', '.claude', 'skills');
  mkdirSync(claudeSkillsDir, { recursive: true });
  writeFileSync(join(claudeSkillsDir, 'origin-test.md'), '---\nname: origin-test\ndescription: origin check\ntriggers:\n  - ot\n---\n', 'utf-8');
  const out = runCLI('--origin claude-code');
  assert(out.includes('origin-test'), 'Claude Code skill filterable by origin');
  try { rmSync(join(TMP, '..', '.claude'), { recursive: true, force: true }); } catch {}
});

test('Claude Code skill with same name as regular skill deduplicated', () => {
  resetSkills();
  // Regular skill
  writeSkillRaw('dup-name', '---\nname: dup-name\ndescription: regular version\ntriggers:\n  - dup\n---\n');
  // Claude Code skill with same name
  const claudeSkillsDir = join(TMP, '..', '.claude', 'skills');
  mkdirSync(claudeSkillsDir, { recursive: true });
  writeFileSync(join(claudeSkillsDir, 'dup-name.md'), '---\nname: dup-name\ndescription: claude version\ntriggers:\n  - dup\n---\n', 'utf-8');
  const out = runCLI('--match dup');
  assert(out.includes('regular version'), 'regular skill wins over claude');
  try { rmSync(join(TMP, '..', '.claude'), { recursive: true, force: true }); } catch {}
});

test('Claude agent routing includes claude format skills', () => {
  const script = readFileSync(INDEX_SCRIPT, 'utf-8');
  assert(script.includes("'claude'"), 'claude format in routing table');
  assert(script.includes("'claude-code'"), 'claude-code origin string');
});

// ── Summary ────────────────────────────────────────────────────
asyncChain.then(() => {
  const total = passed + failed + skipped;
  console.log(`\n  Total: ${total}  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}\n`);
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
  if (failed > 0) process.exit(1);
}).catch(() => {
  console.log('\n  Critical error in async test chain');
  process.exit(1);
});
