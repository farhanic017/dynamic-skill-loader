#!/usr/bin/env node
// Dynamic Skill Loader for OpenCode — Smart Lifecycle Management
// Copyright (C) 2026 Farhan Dhrubo
// 
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// 
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
// 
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// ── All internal logging goes to stderr (never stdout) to protect MCP's JSON-RPC stream ──

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { createInterface } from 'readline';

const args = process.argv.slice(2);
let SKILLS_DIR = './skills';
let cliMode = null;
let cliArg = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--skills-dir' || args[i] === '-s') {
    SKILLS_DIR = args[i + 1] || SKILLS_DIR;
    i++;
  } else if (args[i] === '--list' || args[i] === '-l') {
    cliMode = 'list';
  } else if (args[i] === '--match' || args[i] === '-m') {
    cliMode = 'match';
    cliArg = args[i + 1] || '';
    i++;
  } else if (args[i] === '--get' || args[i] === '-g') {
    cliMode = 'get';
    cliArg = args[i + 1] || '';
    i++;
  } else if (args[i] === '--unload' || args[i] === '-u') {
    cliMode = 'unload';
    cliArg = args[i + 1] || '';
    i++;
  } else if (args[i] === '--active' || args[i] === '-a') {
    cliMode = 'active';
  } else if (args[i] === '--context' || args[i] === '-c') {
    cliMode = 'context';
    cliArg = args[i + 1] || '';
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    cliMode = 'help';
  }
}
SKILLS_DIR = resolve(SKILLS_DIR);

// ── Session State (tracked in-memory, per-process) ──────────────
const activeSkills = new Map(); // name → { loadedAt: Date, callCount: number }
let currentTaskContext = { description: '', setAt: null };

// ── Normalizer for trigger matching ──────────────────────────────

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[-_\/\\.,;:!?@#$%^&*()\[\]{}|`~'"+=<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── YAML Frontmatter Parser ──────────────────────────────────────

function parseFrontmatter(text) {
  const result = {};
  if (!text) return result;
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) { i++; continue; }
    const match = trimmed.match(/^([\w-]+):\s*(.*)$/);
    if (!match) { i++; continue; }
    const key = match[1];
    let value = match[2];
    if (value === '|') {
      const parts = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s{2,}/)) {
        parts.push(lines[i].replace(/^\s{2,}/, ''));
        i++;
      }
      result[key] = parts.join('\n').trim();
      continue;
    }
    if (value === '') {
      const nextLine = lines[i + 1];
      if (nextLine) {
        const nt = nextLine.trim();
        const ni = nextLine.length - nextLine.trimStart().length;
        if (nt.startsWith('- ')) {
          const items = [];
          i++;
          while (i < lines.length) {
            const cl = lines[i].trim();
            if (!cl.startsWith('- ')) break;
            items.push(cl.replace(/^- /, '').replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim());
            i++;
          }
          result[key] = items;
          continue;
        }
        if (ni > 0) {
          const obj = {};
          i++;
          while (i < lines.length) {
            const cn = lines[i];
            const ct = cn.trim();
            if (cn.length - cn.trimStart().length < ni) break;
            const cm = ct.match(/^([\w-]+):\s*(.*)$/);
            if (cm) obj[cm[1]] = cm[2].trim().replace(/^"(.*)"$/, '$1') || null;
            i++;
          }
          result[key] = obj;
          continue;
        }
      }
      result[key] = '';
    } else {
      result[key] = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    }
    i++;
  }
  return result;
}

function parseSkillMd(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) return null;
  const fm = parseFrontmatter(fmMatch[1]);
  return {
    name: fm.name || '',
    description: fm.description || '',
    triggers: Array.isArray(fm.triggers) ? fm.triggers : [],
  };
}

// ── Skill Index ──────────────────────────────────────────────────

const skills = [];

function indexSkills() {
  if (!existsSync(SKILLS_DIR)) {
    console.error(`[skill-dispatcher] Skills directory not found: ${SKILLS_DIR}`);
    return;
  }
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(SKILLS_DIR, entry.name);
    const mdPath = join(dir, 'SKILL.md');
    if (!existsSync(mdPath)) {
      console.error(`[skill-dispatcher] Skipping ${entry.name}: no SKILL.md found`);
      continue;
    }
    try {
      const content = readFileSync(mdPath, 'utf-8');
      const meta = parseSkillMd(content);
      if (meta) {
        skills.push({ id: entry.name, dir, ...meta, fullContent: content });
      } else {
        console.error(`[skill-dispatcher] Skipping ${entry.name}: invalid YAML frontmatter`);
      }
    } catch (err) {
      console.error(`[skill-dispatcher] Skipping ${entry.name}: ${err.message}`);
    }
  }
  console.error(`[skill-dispatcher] Loaded ${skills.length} skills from ${SKILLS_DIR}`);
}

indexSkills();

// ── Matching Logic ───────────────────────────────────────────────

function matchSkills(query) {
  const q = normalize(query);
  return skills.filter(s => {
    if (normalize(s.name).includes(q)) return true;
    if (normalize(s.description || '').includes(q)) return true;
    if (s.triggers.some(t => {
      const tn = normalize(t);
      return tn.includes(q) || q.includes(tn);
    })) return true;
    return false;
  });
}

// ── Lifecycle: Relevance Engine ─────────────────────────────────
// Scores each loaded skill against the current task context.
// Uses token overlap between context and skill's triggers/name/description.
// Zero-config, works with any current or future skill.

function computeRelevance(skill, contextNorm) {
  const candidates = [
    ...(skill.triggers || []),
    skill.name || '',
    skill.description || '',
  ].filter(Boolean).map(normalize).filter(s => s.length > 0);

  if (candidates.length === 0) return 0;

  const contextTokens = new Set(contextNorm.split(/\s+/).filter(t => t.length > 2));

  let matchScore = 0;
  for (const candidate of candidates) {
    const candidateTokens = candidate.split(/\s+/).filter(t => t.length > 2);
    for (const ct of candidateTokens) {
      if (contextTokens.has(ct)) {
        matchScore += 1;
      } else {
        for (const ctxToken of contextTokens) {
          if (ct.includes(ctxToken) || ctxToken.includes(ct)) {
            matchScore += 0.5;
            break;
          }
        }
      }
    }
  }

  return Math.min(matchScore / Math.max(candidates.length, 1), 1);
}

function getActiveSkillsWithRelevance(contextDescription) {
  const contextNorm = normalize(contextDescription || currentTaskContext.description || '');
  const result = [];
  for (const [name, meta] of activeSkills) {
    const skill = skills.find(s => s.name === name || s.id === name);
    const relevance = skill && contextNorm ? computeRelevance(skill, contextNorm) : null;
    const since = meta.loadedAt ? Math.floor((Date.now() - meta.loadedAt.getTime()) / 1000) : 0;
    result.push({
      name,
      domain: name.split(/[-_]/)[0].toLowerCase(),
      loaded_seconds_ago: since,
      call_count: meta.callCount,
      relevance: relevance !== null ? Number(relevance.toFixed(2)) : null,
      status: relevance === null ? 'unknown' : relevance >= 0.3 ? 'relevant' : relevance >= 0.1 ? 'low' : 'stale',
    });
  }
  // Sort: relevant first, then low, then stale
  const order = { relevant: 0, low: 1, stale: 2, unknown: 3 };
  result.sort((a, b) => (order[a.status] || 9) - (order[b.status] || 9));
  return result;
}

function getStaleSkillNames(contextDescription) {
  return getActiveSkillsWithRelevance(contextDescription)
    .filter(s => s.status === 'stale')
    .map(s => s.name);
}

// ── Skill domain auto-grouping ───────────────────────────────────
// Computes "domain family" from shared trigger keywords.
// Any two skills that share ≥1 trigger keyword are in the same family.
// Future skills automatically get grouped without config.

function buildDomainFamilies() {
  const triggerToSkills = new Map();
  for (const s of skills) {
    for (const t of (s.triggers || [])) {
      const key = normalize(t);
      if (!triggerToSkills.has(key)) triggerToSkills.set(key, []);
      triggerToSkills.get(key).push(s.name);
    }
  }
  // Merge skill sets that share triggers
  const families = new Map();
  for (const [trigger, skillNames] of triggerToSkills) {
    if (skillNames.length < 2) continue;
    // Find existing family that contains any of these skills
    let found = false;
    for (const [familyName, members] of families) {
      if (skillNames.some(n => members.has(n))) {
        for (const n of skillNames) members.add(n);
        found = true;
        break;
      }
    }
    if (!found) {
      families.set(trigger, new Set(skillNames));
    }
  }
  // Merge families that overlap
  let changed = true;
  while (changed) {
    changed = false;
    const entries = [...families.entries()];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [nameA, setA] = entries[i];
        const [nameB, setB] = entries[j];
        if ([...setA].some(n => setB.has(n))) {
          for (const n of setB) setA.add(n);
          families.delete(nameB);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return families;
}

const domainFamilies = buildDomainFamilies();

function getSkillFamily(name) {
  for (const [_, members] of domainFamilies) {
    if (members.has(name)) return [...members];
  }
  return [name];
}

// ── CLI Mode ─────────────────────────────────────────────────────

if (cliMode) {
  switch (cliMode) {
    case 'help':
      console.log(`
skill-dispatcher — On-demand skill loader with smart lifecycle management

USAGE:
  # MCP server mode (for AI tools like opencode, Claude, Cursor)
  skill-dispatcher --skills-dir ./skills

  # CLI mode (direct terminal use)
  skill-dispatcher --skills-dir ./skills --list
  skill-dispatcher --skills-dir ./skills --match "animation gsap"
  skill-dispatcher --skills-dir ./skills --get gsap-core
  skill-dispatcher --skills-dir ./skills --active
  skill-dispatcher --skills-dir ./skills --context "building a hero section"

OPTIONS:
  -s, --skills-dir <path>   Path to skills directory (default: ./skills)
  -l, --list                List all available skills
  -m, --match <query>       Match skills by trigger keywords
  -g, --get <name>          Get full content of a specific skill
  -u, --unload <name>       Unload a skill (remove from active set)
  -a, --active              Show currently active (loaded) skills with relevance
  -c, --context <desc>      Set task context and get lifecycle recommendations
  -h, --help                Show this help
`);
      process.exit(0);

    case 'list':
      if (skills.length === 0) {
        console.log('No skills found in', SKILLS_DIR);
        process.exit(0);
      }
      console.log(`\n  ${skills.length} skills in ${SKILLS_DIR}\n`);
      for (const s of skills) {
        const desc = (s.description || '').split('\n')[0].slice(0, 70);
        const active = activeSkills.has(s.name) ? ' [ACTIVE]' : '';
        console.log(`  ${(s.name + active).padEnd(28)} ${desc}`);
      }
      console.log();
      process.exit(0);

    case 'match': {
      const matched = matchSkills(cliArg);
      if (matched.length === 0) {
        console.log(`\n  No skills matched "${cliArg}"\n`);
        process.exit(0);
      }
      console.log(`\n  ${matched.length} skill(s) matched "${cliArg}":\n`);
      for (const s of matched) {
        const active = activeSkills.has(s.name) ? ' [ACTIVE]' : '';
        console.log(`  ${s.name}${active}`);
        console.log(`  ${(s.description || '').split('\n')[0].slice(0, 80)}`);
        console.log(`  Triggers: ${s.triggers.join(', ') || '—'}`);
        const family = getSkillFamily(s.name);
        if (family.length > 1) {
          console.log(`  Family: ${family.filter(n => n !== s.name).join(', ')}`);
        }
        console.log();
      }
      process.exit(0);
    }

    case 'get': {
      const skill = skills.find(s => s.name === cliArg || s.id === cliArg);
      if (!skill) {
        console.log(`\n  Skill "${cliArg}" not found\n`);
        process.exit(1);
      }
      // Track in session state
      if (!activeSkills.has(skill.name)) {
        activeSkills.set(skill.name, { loadedAt: new Date(), callCount: 0 });
      }
      activeSkills.get(skill.name).callCount++;
      console.log(skill.fullContent);
      console.log(`\n--- Skill "${skill.name}" is now ACTIVE (${activeSkills.size} active total) ---`);
      process.exit(0);
    }

    case 'unload':
      if (activeSkills.has(cliArg)) {
        activeSkills.delete(cliArg);
        console.log(`Skill "${cliArg}" unloaded. ${activeSkills.size} skill(s) still active.`);
      } else {
        console.log(`Skill "${cliArg}" is not currently active. Nothing to unload.`);
      }
      process.exit(0);

    case 'active': {
      const loaded = getActiveSkillsWithRelevance('');
      if (loaded.length === 0) {
        console.log('\n  No active skills. Use --get <name> to load one.\n');
        process.exit(0);
      }
      console.log(`\n  ${loaded.length} active skill(s)`);
      if (currentTaskContext.description) {
        console.log(`  Current context: "${currentTaskContext.description}"\n`);
      }
      console.log();
      for (const s of loaded) {
        const statusIcon = s.status === 'relevant' ? '✓' : s.status === 'low' ? '~' : s.status === 'stale' ? '✗' : '?';
        console.log(`  ${statusIcon} ${s.name.padEnd(24)} ${s.status.padEnd(10)} domain:${s.domain.padEnd(16)} calls:${s.call_count}`);
      }
      const stale = loaded.filter(s => s.status === 'stale');
      if (stale.length > 0 && currentTaskContext.description) {
        console.log(`\n  Recommendation: unload stale skills — ${stale.map(s => s.name).join(', ')}`);
      }
      console.log();
      process.exit(0);
    }

    case 'context': {
      currentTaskContext = { description: cliArg, setAt: new Date() };
      const loaded = getActiveSkillsWithRelevance(cliArg);
      const allLoaded = [...activeSkills.keys()];
      if (allLoaded.length === 0) {
        console.log(`\n  Context set to: "${cliArg}"`);
        console.log(`  No active skills. Use --get to load skills.\n`);
        process.exit(0);
      }
      console.log(`\n  Context set to: "${cliArg}"`);
      console.log(`  ${allLoaded.length} active skill(s)\n`);
      for (const s of loaded) {
        const relStr = s.relevance !== null ? `rel:${s.relevance.toFixed(2)}` : 'rel:?';
        console.log(`  [${s.status.padEnd(8)}] ${s.name.padEnd(24)} ${relStr.padEnd(12)} calls:${s.call_count}`);
      }
      const staleNames = getStaleSkillNames(cliArg);
      if (staleNames.length > 0) {
        console.log(`\n  → Unload recommendation: ${staleNames.join(', ')}`);
        console.log(`    These skills have low relevance to "${cliArg.split(' ').slice(0, 6).join(' ')}..."`);
      }
      console.log();
      process.exit(0);
    }
  }
}

// ── MCP Server Mode (default) ───────────────────────────────────

const rl = createInterface({ input: process.stdin, terminal: false });

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

rl.on('line', (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch {
    console.error(`[skill-dispatcher] Malformed JSON-RPC message ignored`);
    return;
  }
  const { id, method, params } = msg;
  if (id === undefined || id === null) return;

  try {
    switch (method) {
      case 'initialize':
        respond(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'skill-dispatcher', version: '2.0.0' },
        });
        break;

      case 'tools/list':
        respond(id, {
          tools: [
            {
              name: 'match_skills',
              description: 'Match skills against your current task using trigger keywords. Call at the START of every task to discover relevant skills on-demand. Returns matched skills with their domain family information.',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Task description or keywords to match against skill triggers' },
                },
                required: ['query'],
              },
            },
            {
              name: 'get_skill',
              description: 'Load the full content of a skill by name. Call after match_skills to load complete instructions for a matched skill. The skill is automatically tracked as "active" for lifecycle management.',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Skill name (e.g., "gsap-core", "frontend-design")' },
                },
                required: ['name'],
              },
            },
            {
              name: 'list_skills',
              description: 'List all available skills with descriptions and trigger keywords. Active skills are marked with [ACTIVE].',
              inputSchema: { type: 'object', properties: {} },
            },
            {
              name: 'unload_skill',
              description: 'Unload a skill — removes it from the active set and frees context. Call when switching to a task that no longer needs this skill. The dispatcher remembers what you unloaded.',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Skill name to unload (e.g., "gsap-core")' },
                },
                required: ['name'],
              },
            },
            {
              name: 'set_task_context',
              description: 'Declare what you are currently working on. The dispatcher scores all active skills against this context and recommends which skills to unload (stale skills unrelated to current work). Call BEFORE switching between unrelated task domains to keep context lean.',
              inputSchema: {
                type: 'object',
                properties: {
                  description: { type: 'string', description: 'Description of current task (e.g., "building a hero section with GSAP animations")' },
                },
                required: ['description'],
              },
            },
            {
              name: 'get_active_skills',
              description: 'List all currently loaded skills with their domain, relevance score against the current task context, and lifecycle status (relevant / low / stale). Use this to decide which skills to keep or unload.',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        });
        break;

      case 'tools/call': {
        const { name, arguments: args } = params;
        switch (name) {
          case 'match_skills': {
            const rawQuery = args?.query || '';
            const query = rawQuery.toLowerCase();
            if (!query) {
              respond(id, {
                content: [{ type: 'text', text: `No query. All ${skills.length} skills available — use \`list_skills\` to browse.` }],
              });
              break;
            }
            const matched = matchSkills(query);
            if (matched.length === 0) {
              respond(id, {
                content: [{ type: 'text', text: `No skills matched "${rawQuery}".\n\nAvailable: ${skills.map(s => s.name).join(', ')}` }],
              });
              break;
            }
            const text = matched.map(s => {
              const active = activeSkills.has(s.name) ? ' **[ACTIVE]**' : '';
              const family = getSkillFamily(s.name);
              const familyStr = family.length > 1 ? `\nSkill family: ${family.filter(n => n !== s.name).join(', ')}` : '';
              return `### ${s.name}${active}\n**${s.description || 'No description'}**\nTriggers: ${s.triggers.join(', ') || '—'}${familyStr}`;
            }).join('\n\n');
            const staleNote = currentTaskContext.description
              ? `\n\n_Context: "${currentTaskContext.description}". Call \`set_task_context\` if switching tasks._`
              : '';
            respond(id, {
              content: [{
                type: 'text',
                text: `**${matched.length} skill(s)** matched "${rawQuery}":\n\n${text}\n\nCall \`get_skill\` with a name to load its full content (auto-tracked as active).${staleNote}`,
              }],
            });
            break;
          }

          case 'get_skill': {
            const skillName = args?.name || '';
            const skill = skills.find(s => s.name === skillName || s.id === skillName);
            if (!skill) {
              respond(id, {
                content: [{ type: 'text', text: `Skill "${skillName}" not found.\nAvailable: ${skills.map(s => s.name).join(', ')}` }],
              });
              break;
            }
            // Track as active
            if (!activeSkills.has(skill.name)) {
              activeSkills.set(skill.name, { loadedAt: new Date(), callCount: 0 });
            }
            activeSkills.get(skill.name).callCount++;

            const family = getSkillFamily(skill.name);
            const familyNote = family.length > 1
              ? `\n\n**Skill family:** ${family.filter(n => n !== skill.name).join(', ')}\n_Related skills share triggers — consider loading them too._`
              : '';

            respond(id, {
              content: [{
                type: 'text',
                text: `${skill.fullContent}\n\n---\n**${skill.name}** is now ACTIVE (${activeSkills.size} skill(s) active). Use \`set_task_context\` to track what you're working on.${familyNote}`,
              }],
            });
            break;
          }

          case 'list_skills': {
            const text = skills.map(s => {
              const active = activeSkills.has(s.name) ? ' **[ACTIVE]**' : '';
              const desc = (s.description || 'No description').split('\n')[0];
              return `- **${s.name}${active}**: ${desc}`;
            }).join('\n');
            const activeCount = activeSkills.size;
            respond(id, {
              content: [{
                type: 'text',
                text: `**${skills.length} skills installed** (${activeCount} active)\n\n${text}\n\n_Call \`get_active_skills\` for lifecycle status._`,
              }],
            });
            break;
          }

          case 'unload_skill': {
            const skillName = args?.name || '';
            if (activeSkills.has(skillName)) {
              activeSkills.delete(skillName);
              const family = getSkillFamily(skillName);
              const familyNote = family.length > 1
                ? `\n_Related skills in same family: ${family.filter(n => n !== skillName).join(', ')}. Unload them too if not needed._`
                : '';
              respond(id, {
                content: [{
                  type: 'text',
                  text: `**${skillName}** unloaded. ${activeSkills.size} skill(s) still active.${familyNote}\n\nCall \`set_task_context\` with your current task to check relevance of remaining skills.`,
                }],
              });
            } else {
              // Still let them "unload" even if not tracked (stateless mode)
              respond(id, {
                content: [{ type: 'text', text: `**${skillName}** is not currently active. Nothing to unload. Use \`get_skill\` to load it first.` }],
              });
            }
            break;
          }

          case 'set_task_context': {
            const description = args?.description || '';
            if (!description) {
              respond(id, {
                content: [{ type: 'text', text: 'Please provide a task description (e.g., `set_task_context({ description: "building a hero section with animations" })`).' }],
              });
              break;
            }
            currentTaskContext = { description, setAt: new Date() };
            const allActive = [...activeSkills.keys()];
            if (allActive.length === 0) {
              respond(id, {
                content: [{
                  type: 'text',
                  text: `**Task context set:** "${description}"\n\nNo skills currently active. Call \`match_skills\` with your task to discover relevant skills, then \`get_skill\` to load them.`,
                }],
              });
              break;
            }
            const scored = getActiveSkillsWithRelevance(description);
            const relevant = scored.filter(s => s.status === 'relevant');
            const low = scored.filter(s => s.status === 'low');
            const stale = scored.filter(s => s.status === 'stale');

            let output = `**Task context set:** "${description}"\n\n**Active skills: ${allActive.length}**\n\n`;
            if (relevant.length > 0) {
              output += `**✓ Relevant** (keep loaded):\n${relevant.map(s => `  • ${s.name} (relevance: ${s.relevance})`).join('\n')}\n\n`;
            }
            if (low.length > 0) {
              output += `**~ Low relevance** (consider keeping if related):\n${low.map(s => `  • ${s.name} (relevance: ${s.relevance})`).join('\n')}\n\n`;
            }
            if (stale.length > 0) {
              output += `**✗ Stale** (recommended to unload):\n${stale.map(s => `  • ${s.name} (relevance: ${s.relevance})`).join('\n')}\n\n`;
              output += `Call \`unload_skill("name")\` for each stale skill to free context.\n`;
            }
            if (stale.length === 0 && allActive.length > 0) {
              output += `All active skills are relevant to this task. No unload needed.\n`;
            }
            // Show family recommendations
            const staleNames = stale.map(s => s.name);
            const familiesToUnload = new Set();
            for (const sn of staleNames) {
              const family = getSkillFamily(sn);
              if (family.length > 1) {
                for (const f of family) {
                  if (!staleNames.includes(f) && activeSkills.has(f)) {
                    familiesToUnload.add(f);
                  }
                }
              }
            }
            if (familiesToUnload.size > 0) {
              output += `\n**Related skills** in the same families as stale skills: ${[...familiesToUnload].join(', ')}\n_Consider unloading these too if they are not relevant._\n`;
            }

            respond(id, { content: [{ type: 'text', text: output }] });
            break;
          }

          case 'get_active_skills': {
            const allActive = [...activeSkills.keys()];
            if (allActive.length === 0) {
              respond(id, {
                content: [{ type: 'text', text: 'No skills currently active. Call `match_skills` to discover skills for your task, then `get_skill` to load them.' }],
              });
              break;
            }
            const scored = getActiveSkillsWithRelevance(currentTaskContext.description || '');

            let output = `**${allActive.length} active skill(s)**\n\n`;
            if (currentTaskContext.description) {
              output += `Context: "${currentTaskContext.description}"\n\n`;
            }
            output += scored.map(s => {
              const icon = s.status === 'relevant' ? '✓' : s.status === 'low' ? '~' : s.status === 'stale' ? '✗' : '?';
              const relStr = s.relevance !== null ? `(rel: ${s.relevance})` : '';
              return `${icon} **${s.name}** — ${s.status} ${relStr} — domain: ${s.domain} — calls: ${s.call_count} — loaded ${s.loaded_seconds_ago}s ago`;
            }).join('\n');

            const staleNames = stale.filter(s => activeSkills.has(s.name));
            if (stale.length > 0 && currentTaskContext.description) {
              output += `\n\n**Unload recommendation:** ${staleNames.join(', ')} — these skills have low relevance to the current task context.`;
              output += `\nCall \`unload_skill("name")\` or \`set_task_context\` with your current task description.`;
            } else if (!currentTaskContext.description) {
              output += `\n\nSet a task context with \`set_task_context\` to get relevance scores and unload recommendations.`;
            }
            respond(id, { content: [{ type: 'text', text: output }] });
            break;
          }

          default:
            respondError(id, -32601, `Tool not found: ${name}`);
        }
        break;
      }

      case 'ping':
        respond(id, {});
        break;

      default:
        respondError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    console.error(`[skill-dispatcher] Error handling ${method}: ${err.message}`);
    respondError(id, -32603, err.message);
  }
});
