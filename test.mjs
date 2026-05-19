#!/usr/bin/env node
// Test suite for Dynamic Skill Loader
// Copyright (C) 2026 Farhan Dhrubo

import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MJS = join(__dirname, 'index.mjs');
const TMP = join(__dirname, '.test-skills');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// Clean and create test skills
function setupSkills() {
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
  mkdirSync(TMP, { recursive: true });

  const skills = {
    'gsap-core': {
      triggers: ['gsap', 'web animation', 'tween', 'easing'],
      body: '# GSAP Core\n\nGreenSock Animation Platform.'
    },
    'frontend-design': {
      triggers: ['frontend', 'design', 'css', 'responsive'],
      body: '# Frontend Design\n\nResponsive UI patterns.'
    },
    'skill-dispatcher': {
      triggers: ['skill loader', 'dynamic skill', 'trigger matching'],
      body: '# Skill Dispatcher\n\nThe skill-dispatcher itself.'
    }
  };
  for (const [name, info] of Object.entries(skills)) {
    const dir = join(TMP, name);
    mkdirSync(dir, { recursive: true });
    const triggersYaml = info.triggers.map(t => `  - "${t}"`).join('\n');
    const content = `---\nname: ${name}\ndescription: >\n  ${info.body.split('\n')[0]}\ntriggers:\n${triggersYaml}\n---\n\n${info.body}\n`;
    writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
  }
}

function runCLI(args) {
  const result = execSync(`node "${MJS}" --skills-dir "${TMP}" ${args}`, { encoding: 'utf-8' });
  return result;
}

function runMCP(request) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [MJS, '--skills-dir', TMP], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let errOutput = '';
    proc.stdout.on('data', d => output += d);
    proc.stderr.on('data', d => errOutput += d);

    let resolved = false;
    proc.stdout.on('end', () => {
      if (!resolved) { resolved = true; resolve({ output, errOutput }); }
    });
    proc.on('error', reject);
    proc.stdin.write(JSON.stringify(request) + '\n');
    setTimeout(() => {
      proc.kill();
      if (!resolved) { resolved = true; resolve({ output, errOutput }); }
    }, 3000);
  });
}

// ── Run tests ─────────────────────────────────────────────────
console.log('\n  Skill Dispatcher Tests\n');

setupSkills();

// 1. Check files exist
test('index.mjs exists', () => assert(existsSync(MJS)));
test('Test skills created', () => {
  assert(existsSync(join(TMP, 'gsap-core', 'SKILL.md')));
  assert(existsSync(join(TMP, 'frontend-design', 'SKILL.md')));
  assert(existsSync(join(TMP, 'skill-dispatcher', 'SKILL.md')));
});

// 2. CLI --list
test('CLI --list returns 3 skills', () => {
  const out = runCLI('--list');
  assert(out.includes('gsap-core'), 'missing gsap-core');
  assert(out.includes('frontend-design'), 'missing frontend-design');
  assert(out.includes('skill-dispatcher'), 'missing skill-dispatcher');
});

// 3. CLI --match
test('CLI --match "gsap" returns gsap-core', () => {
  const out = runCLI('--match "gsap"');
  assert(out.includes('gsap-core'), 'did not match gsap-core');
});

test('CLI --match "css" returns frontend-design', () => {
  const out = runCLI('--match "css"');
  assert(out.includes('frontend-design'), 'did not match frontend-design');
});

test('CLI --match "skill loader" returns skill-dispatcher', () => {
  const out = runCLI('--match "skill loader"');
  assert(out.includes('skill-dispatcher'), 'did not match skill-dispatcher');
});

test('CLI --match no-match returns 0', () => {
  const out = runCLI('--match "xyznonexistent"');
  assert(out.includes('No skills matched'), 'should report no match');
});

// 4. CLI --get
test('CLI --get gsap-core returns full content', () => {
  const out = runCLI('--get gsap-core');
  assert(out.includes('GSAP Core'), 'missing content');
  assert(out.includes('gsap'), 'missing triggers');
});

test('CLI --get unknown returns error', () => {
  try {
    runCLI('--get nonexistent');
    assert(false, 'should have thrown');
  } catch (e) {
    assert(e.stdout.includes('not found'), 'wrong error message');
  }
});

// 5. MCP initialize
test('MCP initialize responds correctly', async () => {
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const resp = JSON.parse(output.trim());
  assert(resp.jsonrpc === '2.0', 'wrong jsonrpc');
  assert(resp.id === 1, 'wrong id');
  assert(resp.result.serverInfo.name === 'skill-dispatcher', 'wrong server name');
  assert(resp.result.protocolVersion === '2024-11-05', 'wrong protocol version');
});

// 6. MCP tools/list
test('MCP tools/list returns 4 tools', async () => {
  const { output } = await runMCP({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const resp = JSON.parse(output.trim());
  const tools = resp.result.tools;
  assert(tools.length === 4, `expected 4 tools, got ${tools.length}`);
  const names = tools.map(t => t.name).sort();
  assert(names[0] === 'get_skill', 'missing get_skill');
  assert(names[1] === 'list_skills', 'missing list_skills');
  assert(names[2] === 'match_skills', 'missing match_skills');
  assert(names[3] === 'unload_skill', 'missing unload_skill');
});

// 7. MCP match_skills
test('MCP match_skills("gsap") works', async () => {
  const req = { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'match_skills', arguments: { query: 'gsap' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  const text = resp.result.content[0].text;
  assert(text.includes('gsap-core'), 'missing gsap-core');
  assert(text.includes('1 skill(s)'), 'wrong count');
});

test('MCP match_skills("") returns all', async () => {
  const req = { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'match_skills', arguments: { query: '' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('All 3 skills'), 'should mention all skills');
});

// 8. MCP get_skill
test('MCP get_skill("gsap-core") works', async () => {
  const req = { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_skill', arguments: { name: 'gsap-core' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('GSAP Core'), 'missing content');
});

test('MCP get_skill("unknown") returns error message', async () => {
  const req = { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_skill', arguments: { name: 'unknown' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('not found'), 'should say not found');
});

// 9. MCP list_skills
test('MCP list_skills returns 3 skills', async () => {
  const req = { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'list_skills', arguments: {} } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  const text = resp.result.content[0].text;
  assert(text.includes('3 skills'), 'wrong count');
  assert(text.includes('gsap-core'), 'missing gsap-core');
});

// 10. MCP unload_skill
test('MCP unload_skill("gsap-core") works', async () => {
  const req = { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'unload_skill', arguments: { name: 'gsap-core' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('unloaded'), 'should confirm unload');
});

test('MCP unload_skill("unknown") returns not found', async () => {
  const req = { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'unload_skill', arguments: { name: 'nope' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('not found'), 'should say not found');
});

// 11. MCP unknown tool
test('MCP unknown tool returns error', async () => {
  const req = { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'nonexistent', arguments: {} } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.error && resp.error.code === -32601, 'should return error code');
});

// 12. MCP ping
test('MCP ping responds', async () => {
  const { output } = await runMCP({ jsonrpc: '2.0', id: 11, method: 'ping' });
  const resp = JSON.parse(output.trim());
  assert(resp.jsonrpc === '2.0', 'wrong jsonrpc');
  assert(resp.id === 11, 'wrong id');
});

// 13. Fuzzy matching (hyphens, punctuation)
test('CLI fuzzy match handles hyphens', () => {
  const out = runCLI('--match "web-animation"');
  assert(out.includes('gsap-core'), 'should match despite hyphens');
});

test('CLI fuzzy match handles punctuation', () => {
  const out = runCLI('--match "skill loader!"');
  assert(out.includes('skill-dispatcher'), 'should match despite punctuation');
});

// 14. Match by description
test('CLI match by description header', () => {
  const out = runCLI('--match "GSAP Core"');
  assert(out.includes('gsap-core'), 'should match by description');
});

// 15. Normalization: query contains part of trigger
test('CLI substring trigger match', () => {
  const out = runCLI('--match "anim"');
  assert(out.includes('gsap-core'), 'should match by substring of trigger');
});

// ── Summary ──
const total = passed + failed;
console.log(`\n  Total: ${total}  Passed: ${passed}  Failed: ${failed}\n`);

// Cleanup
try { rmSync(TMP, { recursive: true, force: true }); } catch {}

if (failed > 0) process.exit(1);
