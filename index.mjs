#!/usr/bin/env node
//  Dynamic Skill Loader for OpenCode  ───  On-Demand MCP Skill Server
//  Copyright (c) 2026 Farhan Dhrubo  <farhaiee123@gmail.com>
//  License: GPL-3.0  —  https://github.com/farhanic017/dynamic-skill-loader-for-opencode
//
//  This program is free software. You may NOT remove this notice,
//  re-distribute as your own work, or sell without attribution.
// =============================================================================

// ── All internal logging goes to stderr (never stdout) to protect MCP's JSON-RPC stream ──

import { readFileSync, readdirSync, existsSync, realpathSync } from 'fs';
import { join, resolve, relative } from 'path';
import { createInterface } from 'readline';

const VERSION = '1.1.0';
const APP_NAME = 'skill-dispatcher';

const args = process.argv.slice(2);
let SKILLS_DIR = './skills';
let cliMode = null;
let cliArg = '';
let BASE_DIR; // set after first resolve for path traversal checks

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
  } else if (args[i] === '--version' || args[i] === '-v') {
    cliMode = 'version';
  } else if (args[i] === '--help' || args[i] === '-h') {
    cliMode = 'help';
  }
}
SKILLS_DIR = resolve(SKILLS_DIR);
BASE_DIR = SKILLS_DIR;

// ── Normalizer for trigger matching ──────────────────────────────
// Strips punctuation, hyphens, underscores, collapses whitespace

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[-_\/\\.,;:!?@#$%^&*()\[\]{}|`~'"+=<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── YAML Frontmatter Parser ──────────────────────────────────────
// Each unhandled file is caught, logged to stderr, and skipped

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

function isPathSafe(targetPath) {
  try {
    const resolved = resolve(targetPath);
    const rel = relative(BASE_DIR, resolved);
    return !rel.startsWith('..') && !rel.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(rel) && resolved.startsWith(BASE_DIR);
  } catch {
    return false;
  }
}

function sanitizeSkillName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[^a-zA-Z0-9._\-\/]/g, '').slice(0, 200);
}

function indexSkills() {
  if (!existsSync(SKILLS_DIR)) {
    console.error(`[skill-dispatcher] Skills directory not found: ${SKILLS_DIR}`);
    return;
  }
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    const dir = join(SKILLS_DIR, entry.name);
    if (!isPathSafe(dir)) {
      console.error(`[skill-dispatcher] Skipping ${entry.name}: path traversal detected`);
      continue;
    }
    const mdPath = join(dir, 'SKILL.md');
    if (!existsSync(mdPath)) {
      console.error(`[skill-dispatcher] Skipping ${entry.name}: no SKILL.md found`);
      continue;
    }
    try {
      const content = readFileSync(mdPath, 'utf-8');
      const meta = parseSkillMd(content);
      if (meta && meta.name) {
        skills.push({ id: entry.name, dir, ...meta, fullContent: content });
      } else {
        console.error(`[skill-dispatcher] Skipping ${entry.name}: invalid YAML frontmatter (missing --- delimiters)`);
      }
    } catch (err) {
      console.error(`[skill-dispatcher] Skipping ${entry.name}: ${err.message}`);
    }
  }
  console.error(`[skill-dispatcher] Loaded ${skills.length} skills from ${SKILLS_DIR}`);
}

indexSkills();

// ── Matching Logic ───────────────────────────────────────────────
// Normalizes both query and triggers to catch hyphens, punctuation, etc.

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

// ── CLI Mode ─────────────────────────────────────────────────────

if (cliMode) {
  switch (cliMode) {
    case 'version':
      console.log(`${APP_NAME} v${VERSION}`);
      console.log(`License: GPL-3.0  Copyright (c) 2026 Farhan Dhrubo`);
      console.log(`https://github.com/farhanic017/dynamic-skill-loader-for-opencode`);
      process.exit(0);

    case 'help':
      console.log(`
${APP_NAME} v${VERSION} — On-demand skill loader for AI coding assistants

USAGE:
  # MCP server mode (for AI tools like opencode, Claude, Cursor)
  ${APP_NAME} --skills-dir ./skills

  # CLI mode (direct terminal use)
  ${APP_NAME} --skills-dir ./skills --list
  ${APP_NAME} --skills-dir ./skills --match "animation gsap"
  ${APP_NAME} --skills-dir ./skills --get gsap-core

OPTIONS:
  -s, --skills-dir <path>   Path to skills directory (default: ./skills)
  -l, --list                List all available skills
  -m, --match <query>       Match skills by trigger keywords
  -g, --get <name>          Get full content of a specific skill
  -u, --unload <name>       Forget a previously loaded skill
  -v, --version             Show version and copyright
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
        console.log(`  ${s.name.padEnd(22)} ${desc}`);
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
        console.log(`  ${s.name}`);
        console.log(`  ${(s.description || '').split('\n')[0].slice(0, 80)}`);
        console.log(`  Triggers: ${s.triggers.join(', ') || '—'}`);
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
      console.log(skill.fullContent);
      process.exit(0);
    }

    case 'unload':
      console.log(`Skill "${cliArg}" marked as unloaded. No-op in stateless mode — the model controls its own context.`);
      process.exit(0);
  }
}

// ── MCP Server Mode (default) ───────────────────────────────────
// All responses go to stdout via process.stdout.write (JSON-RPC).
// Everything else — diagnostics, warnings, debug — goes to stderr.

const MAX_INPUT_SIZE = 1024 * 100; // 100KB limit per message

const rl = createInterface({ input: process.stdin, terminal: false });

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

rl.on('line', (line) => {
  if (line.length > MAX_INPUT_SIZE) {
    console.error(`[skill-dispatcher] Message exceeds ${MAX_INPUT_SIZE} bytes, ignored`);
    return;
  }
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch {
    console.error(`[skill-dispatcher] Malformed JSON-RPC message ignored`);
    return;
  }
  if (!msg || typeof msg !== 'object') {
    console.error(`[skill-dispatcher] Invalid message type`);
    return;
  }
  const { id, method, params } = msg;
  if (id === undefined || id === null) return;
  if (method && typeof method !== 'string') {
    respondError(id, -32600, 'Invalid method type');
    return;
  }

  try {
    switch (method) {
      case 'initialize':
        respond(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'skill-dispatcher', version: '1.0.0' },
        });
        break;

      case 'tools/list':
        respond(id, {
          tools: [
            {
              name: 'match_skills',
              description: 'Match skills against your current task using trigger keywords. Call at the START of every task to discover relevant skills on-demand.',
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
              description: 'Load the full content of a skill by name. Call after match_skills to load complete instructions for a matched skill.',
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
              description: 'List all available skills with descriptions and trigger keywords.',
              inputSchema: { type: 'object', properties: {} },
            },
            {
              name: 'unload_skill',
              description: 'Mark a skill as no longer relevant to the current task. Call this when you move on to a different task and no longer need a previously loaded skill in context.',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Skill name to unload (e.g., "gsap-core")' },
                },
                required: ['name'],
              },
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
            const text = matched.map(s =>
              `### ${s.name}\n**${s.description || 'No description'}**\nTriggers: ${s.triggers.join(', ') || '—'}`
            ).join('\n\n');
            respond(id, {
              content: [{
                type: 'text',
                text: `**${matched.length} skill(s)** matched "${rawQuery}":\n\n${text}\n\nCall \`get_skill\` with a name to load its full content.`,
              }],
            });
            break;
          }

          case 'get_skill': {
            const skillName = sanitizeSkillName(args?.name || '');
            if (!skillName) {
              respond(id, { content: [{ type: 'text', text: 'Skill name is required.' }] });
              break;
            }
            const skill = skills.find(s => s.name === skillName || s.id === skillName);
            if (!skill) {
              respond(id, {
                content: [{ type: 'text', text: `Skill "${skillName}" not found.\nAvailable: ${skills.map(s => s.name).join(', ')}` }],
              });
              break;
            }
            respond(id, { content: [{ type: 'text', text: skill.fullContent }] });
            break;
          }

          case 'list_skills': {
            const text = skills.map(s =>
              `- **${s.name}**: ${(s.description || 'No description').split('\n')[0]}`
            ).join('\n');
            respond(id, {
              content: [{ type: 'text', text: `**${skills.length} skills installed**\n\n${text}` }],
            });
            break;
          }

          case 'unload_skill': {
            const skillName = sanitizeSkillName(args?.name || '');
            if (!skillName) {
              respond(id, { content: [{ type: 'text', text: 'Skill name is required.' }] });
              break;
            }
            const skill = skills.find(s => s.name === skillName || s.id === skillName);
            if (!skill) {
              respond(id, {
                content: [{ type: 'text', text: `Skill "${skillName}" not found. Nothing to unload.` }],
              });
              break;
            }
            respond(id, {
              content: [{
                type: 'text',
                text: `**${skill.name}** unloaded. Stop using this skill's instructions for the remainder of the conversation unless re-triggered.`,
              }],
            });
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
