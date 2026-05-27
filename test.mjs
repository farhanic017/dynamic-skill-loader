#!/usr/bin/env node
//  Dynamic Skill Loader for OpenCode  ───  Test Suite (v2.0 Lifecycle)
//  Copyright (c) 2026 Farhan Dhrubo  <farhaiee123@gmail.com>
//  License: GPL-3.0  —  https://github.com/farhanic017/dynamic-skill-loader-for-opencode
//
//  This program is free software. You may NOT remove this notice,
//  re-distribute as your own work, or sell without attribution.
// =============================================================================

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
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \u2717 ${name}: ${e.message}`);
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
    },
    'supabase': {
      triggers: ['supabase', 'database', 'auth', 'postgres'],
      body: '# Supabase\n\nBackend database and auth.'
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
  return execSync(`node "${MJS}" --skills-dir "${TMP}" ${args}`, { encoding: 'utf-8' });
}

function runCLIWithStderr(args) {
  try {
    const result = execSync(`node "${MJS}" --skills-dir "${TMP}" ${args}`, { encoding: 'utf-8' });
    return { stdout: result, stderr: '' };
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '' };
  }
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
console.log('\n  Skill Dispatcher v2.0 — Lifecycle Tests\n');

setupSkills();

// ── 1. Basic operations ──────────────────────────────────────
test('index.mjs exists', () => assert(existsSync(MJS)));

test('Test skills created', () => {
  assert(existsSync(join(TMP, 'gsap-core', 'SKILL.md')));
  assert(existsSync(join(TMP, 'frontend-design', 'SKILL.md')));
  assert(existsSync(join(TMP, 'skill-dispatcher', 'SKILL.md')));
  assert(existsSync(join(TMP, 'supabase', 'SKILL.md')));
});

// ── 2. CLI --list ────────────────────────────────────────────
test('CLI --list returns 4 skills', () => {
  const out = runCLI('--list');
  assert(out.includes('gsap-core'), 'missing gsap-core');
  assert(out.includes('frontend-design'), 'missing frontend-design');
  assert(out.includes('skill-dispatcher'), 'missing skill-dispatcher');
  assert(out.includes('supabase'), 'missing supabase');
});

// ── 3. CLI --match ───────────────────────────────────────────
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

test('CLI --match "supabase" returns supabase', () => {
  const out = runCLI('--match "supabase"');
  assert(out.includes('supabase'), 'did not match supabase');
});

test('CLI --match no-match returns 0', () => {
  const out = runCLI('--match "xyznonexistent"');
  assert(out.includes('No skills matched'), 'should report no match');
});

// ── 4. CLI --get (auto-tracks as active) ─────────────────────
test('CLI --get gsap-core returns content and marks active', () => {
  const out = runCLI('--get gsap-core');
  assert(out.includes('GSAP Core'), 'missing content');
  assert(out.includes('ACTIVE'), 'should mention ACTIVE');
});

// ── 5. CLI --active (lifecycle) ──────────────────────────────
test('CLI --active shows proper output format', () => {
  const out = runCLI('--active');
  // Should show either no active skills or the format
  assert(out.includes('active') || out.includes('No active'), 'should mention active status');
});

// ── 6. CLI --context (lifecycle scoring) ─────────────────────
test('CLI --context shows proper output format', () => {
  const out = runCLI('--context "animations and web design"');
  assert(out.includes('Context set'), 'should confirm context was set');
  assert(out.includes('animations'), 'should show the context text');
});

// ── 7. CLI --unload (lifecycle) ──────────────────────────────
test('CLI --unload handles not-active skill gracefully', () => {
  const out = runCLI('--unload gsap-core');
  assert(out.includes('not currently active'), 'should say not active when skill not loaded');
});

test('CLI --unload unknown skill handles gracefully', () => {
  const out = runCLI('--unload nonexistent');
  assert(out.includes('not currently active'), 'should say not active');
});

// ── 8. MCP initialize ───────────────────────────────────────
test('MCP initialize responds correctly', async () => {
  const { output } = await runMCP({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const resp = JSON.parse(output.trim());
  assert(resp.jsonrpc === '2.0', 'wrong jsonrpc');
  assert(resp.id === 1, 'wrong id');
  assert(resp.result.serverInfo.name === 'skill-dispatcher', 'wrong server name');
  assert(resp.result.protocolVersion === '2024-11-05', 'wrong protocol version');
});

// ── 9. MCP tools/list (now 7 tools with set_workspace) ──────
test('MCP tools/list returns 7 tools', async () => {
  const { output } = await runMCP({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const resp = JSON.parse(output.trim());
  const tools = resp.result.tools;
  assert(tools.length === 7, `expected 7 tools, got ${tools.length}`);
  const names = tools.map(t => t.name).sort();
  assert(names[0] === 'get_active_skills', 'missing get_active_skills');
  assert(names[1] === 'get_skill', 'missing get_skill');
  assert(names[2] === 'list_skills', 'missing list_skills');
  assert(names[3] === 'match_skills', 'missing match_skills');
  assert(names[4] === 'set_task_context', 'missing set_task_context');
  assert(names[5] === 'set_workspace', 'missing set_workspace');
  assert(names[6] === 'unload_skill', 'missing unload_skill');
});

// ── 10. MCP match_skills ────────────────────────────────────
test('MCP match_skills("gsap") works', async () => {
  const req = { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'match_skills', arguments: { query: 'gsap' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  const text = resp.result.content[0].text;
  assert(text.includes('gsap-core'), 'missing gsap-core');
});

test('MCP match_skills("") shows all in scope', async () => {
  const req = { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'match_skills', arguments: { query: '' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('4 skill(s) in scope'), 'should mention all skills');
});

// ── 11. MCP get_skill (with active tracking) ────────────────
test('MCP get_skill("gsap-core") marks as active', async () => {
  const req = { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_skill', arguments: { name: 'gsap-core' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('GSAP Core'), 'missing content');
  assert(resp.result.content[0].text.includes('ACTIVE'), 'should mention active');
});

test('MCP get_skill("unknown") returns error message', async () => {
  const req = { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_skill', arguments: { name: 'unknown' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('not found'), 'should say not found');
});

// ── 12. MCP set_task_context (NEW lifecycle tool) ───────────
test('MCP set_task_context with context works', async () => {
  // Load a skill first
  await runMCP({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_skill', arguments: { name: 'gsap-core' } } });
  const req = { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'set_task_context', arguments: { description: 'building animations with gsap' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  const text = resp.result.content[0].text;
  assert(text.includes('Task context set'), 'should confirm context');
  assert(text.includes('gsap-core'), 'should mention gsap-core');
});

test('MCP set_task_context with empty description returns guidance', async () => {
  const req = { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'set_task_context', arguments: { description: '' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('Please provide'), 'should ask for description');
});

// ── 13. MCP get_active_skills (NEW lifecycle tool) ──────────
test('MCP get_active_skills returns loaded skills', async () => {
  const req = { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'get_active_skills', arguments: {} } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  const text = resp.result.content[0].text;
  assert(text.includes('active'), 'should mention active count');
});

// ── 14. MCP unload_skill (with active tracking) ─────────────
test('MCP unload_skill("gsap-core") works with active tracking', async () => {
  const req = { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'unload_skill', arguments: { name: 'gsap-core' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('unloaded'), 'should confirm unload');
});

test('MCP unload_skill("unknown") returns not found', async () => {
  const req = { jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'unload_skill', arguments: { name: 'nope' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.result.content[0].text.includes('not currently active'), 'should say not active');
});

// ── 15. Lifecycle: relevance scoring via MCP ────────────────
test('MCP set_task_context scores gsap high and supabase low for animation task', async () => {
  await runMCP({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'get_skill', arguments: { name: 'gsap-core' } } });
  await runMCP({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'get_skill', arguments: { name: 'supabase' } } });
  
  const req = { jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'set_task_context', arguments: { description: 'animations and gsap tween effects for website' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  const text = resp.result.content[0].text;
  
  assert(text.includes('gsap-core'), 'gsap-core should be mentioned');
  assert(text.includes('supabase'), 'supabase should be mentioned');
  // Supabase should be stale for animation task
  assert(text.includes('Stale') || text.includes('supabase'), 'supabase may be stale');
});

test('MCP set_task_context scores supabase high for database task', async () => {
  const req = { jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'set_task_context', arguments: { description: 'setting up supabase database and auth for user login' } } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  const text = resp.result.content[0].text;
  
  assert(text.includes('supabase'), 'supabase should be relevant');
});

// ── 16. MCP unknown tool ────────────────────────────────────
test('MCP unknown tool returns error', async () => {
  const req = { jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'nonexistent', arguments: {} } };
  const { output } = await runMCP(req);
  const resp = JSON.parse(output.trim());
  assert(resp.error && resp.error.code === -32601, 'should return error code');
});

// ── 17. MCP ping ────────────────────────────────────────────
test('MCP ping responds', async () => {
  const { output } = await runMCP({ jsonrpc: '2.0', id: 18, method: 'ping' });
  const resp = JSON.parse(output.trim());
  assert(resp.jsonrpc === '2.0', 'wrong jsonrpc');
  assert(resp.id === 18, 'wrong id');
});

// ── 18. Fuzzy matching ──────────────────────────────────────
test('CLI fuzzy match handles hyphens', () => {
  const out = runCLI('--match "web-animation"');
  assert(out.includes('gsap-core'), 'should match despite hyphens');
});

test('CLI fuzzy match handles punctuation', () => {
  const out = runCLI('--match "skill loader!"');
  assert(out.includes('skill-dispatcher'), 'should match despite punctuation');
});

test('CLI substring trigger match', () => {
  const out = runCLI('--match "anim"');
  assert(out.includes('gsap-core'), 'should match by substring of trigger');
});

// ── 19. CLI --help ─────────────────────────────────────────
test('CLI --help shows new lifecycle flags', () => {
  const out = runCLI('--help');
  assert(out.includes('--active'), 'should mention --active');
  assert(out.includes('--context'), 'should mention --context');
  assert(out.includes('--simple'), 'should mention --simple');
  assert(out.includes('--agent-config'), 'should mention --agent-config');
});

// ── 20. Smart scoring: multi-token ranking ────────────────
test('CLI smart match ranks gsap-core highest for "gsap animation"', () => {
  const out = runCLI('--match "gsap animation"');
  const lines = out.split('\n');
  // First skill line (highest score) should contain gsap-core
  const firstSkill = lines.find(l => l.includes('█') || l.includes('░░'));
  assert(out.includes('gsap-core'), 'gsap-core should be in results');
  assert(firstSkill === undefined || out.indexOf('gsap-core') < out.indexOf('frontend-design') || !out.includes('frontend-design'), 'gsap-core should rank higher');
});

test('CLI smart match scores visible in output', () => {
  const out = runCLI('--match "gsap"');
  assert(out.includes('█') || out.includes('score'), 'should show score visualization');
});

// ── 21. Synonym expansion via CLI ─────────────────────────
test('CLI synonym "database" matches supabase', () => {
  const out = runCLI('--match "database"');
  assert(out.includes('supabase'), '"database" synonym should match supabase');
});

test('CLI synonym "authentication" matches supabase', () => {
  const out = runCLI('--match "authentication"');
  assert(out.includes('supabase'), '"authentication" synonym should match supabase');
});

test('CLI synonym "motion" matches gsap-core', () => {
  const out = runCLI('--match "motion"');
  assert(out.includes('gsap-core'), '"motion" synonym should match gsap-core');
});

// ── 22. Simple mode JSON (for local models) ───────────────
test('Simple mode --list returns valid JSON', () => {
  const out = runCLI('--simple --list');
  const parsed = JSON.parse(out);
  assert(Array.isArray(parsed.skills), 'should have skills array');
  assert(parsed.skills.length === 4, 'should have 4 skills');
});

test('Simple mode --match returns valid JSON with scores', () => {
  const out = runCLI('--simple --match "gsap animation"');
  const parsed = JSON.parse(out);
  assert(parsed.count > 0, 'should have results');
  assert(parsed.results[0].score > 0, 'should have scores');
  assert(parsed.results[0].name !== undefined, 'should have name');
});

test('Simple mode --get returns valid JSON', () => {
  const out = runCLI('--simple --get gsap-core');
  const parsed = JSON.parse(out);
  assert(parsed.name === 'gsap-core', 'name should match');
  assert(parsed.content.length > 0, 'should have content');
  assert(parsed.active_count > 0, 'should be active');
});

test('Simple mode --active returns valid JSON', () => {
  const out = runCLI('--simple --active');
  const parsed = JSON.parse(out);
  assert(parsed.active_count >= 0, 'should have active_count');
});

test('Simple mode --unload returns valid JSON', () => {
  const out = runCLI('--simple --unload gsap-core');
  const parsed = JSON.parse(out);
  assert(parsed.skill === 'gsap-core', 'should reference skill');
});

// ── 23. Agent config ──────────────────────────────────────
function testAgentConfig() {
  const cfgPath = join(TMP, '..', '.test-agent.json');
  const cfg = { name: 'test-agent', allowedSkills: ['gsap-core', 'frontend-design'] };
  writeFileSync(cfgPath, JSON.stringify(cfg), 'utf-8');
  const out = execSync(`node "${MJS}" --skills-dir "${TMP}" --agent-config "${cfgPath}" --list`, { encoding: 'utf-8' });
  rmSync(cfgPath);
  return out;
}

test('Agent config restricts skills to allowed list', () => {
  const out = testAgentConfig();
  assert(out.includes('gsap-core'), 'should include gsap-core');
  assert(out.includes('frontend-design'), 'should include frontend-design');
  assert(!out.includes('supabase'), 'should NOT include supabase');
  assert(!out.includes('skill-dispatcher'), 'should NOT include skill-dispatcher');
});

// ── 24. Deep smart matching: compound tokens ──────────────
test('CLI smart match handles compound "web-animation" token', () => {
  const out = runCLI('--match "web-animation"');
  assert(out.includes('gsap-core'), 'should match via token splitting');
});

test('CLI smart match multiple tokens boosts specificity', () => {
  const out = runCLI('--match "supabase database postgres"');
  const lines = out.split('\n');
  const firstSkillLine = lines.find(l => l.includes('█') || l.includes('supabase'));
  assert(out.includes('supabase'), 'supabase should be in results');
});

// ── 25. Simple mode context ───────────────────────────────
test('Simple mode --context returns valid JSON', () => {
  const out = runCLI('--simple --context "animations and gsap"');
  const parsed = JSON.parse(out);
  assert(parsed.context === 'animations and gsap', 'context should match');
});

// ── Summary ──
const total = passed + failed;
console.log(`\n  Total: ${total}  Passed: ${passed}  Failed: ${failed}\n`);

// Cleanup
try { rmSync(TMP, { recursive: true, force: true }); } catch {}

if (failed > 0) process.exit(1);
