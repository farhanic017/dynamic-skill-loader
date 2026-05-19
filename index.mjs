#!/usr/bin/env node

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { createInterface } from 'readline';

const args = process.argv.slice(2);
let SKILLS_DIR = './skills';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--skills-dir' || args[i] === '-s') {
    SKILLS_DIR = args[i + 1] || SKILLS_DIR;
    i++;
  }
}
SKILLS_DIR = resolve(SKILLS_DIR);

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

const skills = [];

function indexSkills() {
  if (!existsSync(SKILLS_DIR)) return;
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(SKILLS_DIR, entry.name);
    const mdPath = join(dir, 'SKILL.md');
    if (!existsSync(mdPath)) continue;
    try {
      const content = readFileSync(mdPath, 'utf-8');
      const meta = parseSkillMd(content);
      if (meta) skills.push({ id: entry.name, dir, ...meta, fullContent: content });
    } catch { /* skip */ }
  }
}

indexSkills();

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
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (id === undefined || id === null) return;

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
              description: 'Match skills against your current task using trigger keywords. Call this at the START of every task to discover which skills are relevant.',
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
              description: 'Load the full content of a skill by name. Call after match_skills to get complete instructions for a matched skill.',
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
          ],
        });
        break;

      case 'tools/call': {
        const { name, arguments: args } = params;
        switch (name) {
          case 'match_skills': {
            const query = (args?.query || '').toLowerCase();
            if (!query) {
              respond(id, { content: [{ type: 'text', text: `No query. All ${skills.length} skills available — use \`list_skills\` to browse.` }] });
              break;
            }
            const matched = skills.filter(s => {
              if (s.name.toLowerCase().includes(query)) return true;
              if ((s.description || '').toLowerCase().includes(query)) return true;
              if (s.triggers.some(t => t.toLowerCase().includes(query) || query.includes(t.toLowerCase()))) return true;
              return false;
            });
            if (matched.length === 0) {
              respond(id, { content: [{ type: 'text', text: `No skills matched "${query}".\n\nAvailable: ${skills.map(s => s.name).join(', ')}` }] });
              break;
            }
            const text = matched.map(s =>
              `### ${s.name}\n**${s.description || 'No description'}**\nTriggers: ${s.triggers.join(', ') || '—'}`
            ).join('\n\n');
            respond(id, {
              content: [{
                type: 'text',
                text: `**${matched.length} skill(s)** matched "${query}":\n\n${text}\n\nCall \`get_skill\` with a name to load its full content.`,
              }],
            });
            break;
          }

          case 'get_skill': {
            const skillName = args?.name || '';
            const skill = skills.find(s => s.name === skillName || s.id === skillName);
            if (!skill) {
              respond(id, { content: [{ type: 'text', text: `Skill "${skillName}" not found.\nAvailable: ${skills.map(s => s.name).join(', ')}` }] });
              break;
            }
            respond(id, { content: [{ type: 'text', text: skill.fullContent }] });
            break;
          }

          case 'list_skills': {
            const text = skills.map(s => `- **${s.name}**: ${(s.description || 'No description').split('\n')[0]}`).join('\n');
            respond(id, { content: [{ type: 'text', text: `**${skills.length} skills installed**\n\n${text}` }] });
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
    respondError(id, -32603, err.message);
  }
});
