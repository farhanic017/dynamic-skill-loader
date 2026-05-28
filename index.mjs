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

import { readFileSync, readdirSync, existsSync, rmSync, mkdirSync, writeFileSync, realpathSync } from 'fs';
import { join, resolve, basename, dirname, relative } from 'path';
import { spawn, spawnSync } from 'child_process';
import { createInterface } from 'readline';

// ── Security Constants ────────────────────────────────────────────
const MAX_VALUE_LENGTH = 100000;     // max chars for any single YAML value
const MAX_YAML_NESTING = 20;          // max recursion depth in YAML parser
const MAX_SKILL_FILE_SIZE = 10 * 1024 * 1024; // 10MB max skill file
const MAX_COMMAND_SIZE = 10 * 1024 * 1024; // 10MB max command body
const MAX_TRIGGERS = 500;            // max triggers per skill
const VALID_GIT_PROTOCOLS = ['http:', 'https:', 'ssh:', 'git:'];

// ── Security: Validate URL before git clone ─────────────────────
function isValidGitUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.length > 2000) return false; // sanity limit
  try {
    const parsed = new URL(url);
    return VALID_GIT_PROTOCOLS.includes(parsed.protocol) &&
      parsed.hostname && parsed.hostname.length > 0 &&
      !parsed.hostname.includes('..') && // no dotted traversal
      !/[:;|$&`(){}[\]!<>]/.test(parsed.pathname); // no shell chars in path
  } catch { return false; }
}

// ── Security: Prevent path traversal ─────────────────────────────
function isInsideSkillsDir(targetPath) {
  try {
    const resolved = resolve(targetPath);
    const base = resolve(SKILLS_DIR);
    return resolved.startsWith(base + '\\') || resolved.startsWith(base + '/') || resolved === base;
  } catch { return false; }
}

// ── Security: Prevent prototype pollution ───────────────────────
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
function isSafeKey(key) {
  return typeof key === 'string' && !FORBIDDEN_KEYS.has(key.trim()) && !FORBIDDEN_KEYS.has(key.trim().toLowerCase());
}

// ── Security: MCP message validation ────────────────────────────
function validateMCPMessage(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (typeof msg.jsonrpc !== 'string' || msg.jsonrpc !== '2.0') return false;
  if (msg.id !== undefined && msg.id !== null && typeof msg.id !== 'number' && typeof msg.id !== 'string') return false;
  if (msg.method !== undefined && typeof msg.method !== 'string') return false;
  if (msg.params !== undefined && msg.params !== null && typeof msg.params !== 'object') return false;
  return true;
}

const args = process.argv.slice(2);
let SKILLS_DIR = './skills';
let cliMode = null;
let cliArg = '';
let simpleMode = false; // --simple: plain JSON output for local models
let agentConfigPath = null; // --agent-config: restrict skills per agent

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
  } else if (args[i] === '--simple') {
    simpleMode = true;
  } else if (args[i] === '--agent-config') {
    agentConfigPath = args[i + 1] || null;
    i++;
  } else if (args[i] === '--import-repo') {
    cliMode = 'import-repo';
    cliArg = args[i + 1] || '';
    i++;
  } else if (args[i] === '--agent') {
    cliMode = 'agent';
    cliArg = args[i + 1] || 'opencode';
    i++;
  } else if (args[i] === '--list-commands') {
    cliMode = 'list-commands';
  } else if (args[i] === '--origin') {
    cliMode = 'origin';
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

// ── Workspace scope ─────────────────────────────────────────────
// null = all skills searchable; array = only named skills visible to match/list
let workspaceScope = null;

function getScopedSkills() {
  let filtered = skills;
  if (workspaceScope) filtered = filtered.filter(s => workspaceScope.includes(s.name));
  // Apply agent format filter
  filtered = filterSkillsByAgent(filtered, currentAgent);
  return filtered;
}

function setWorkspaceScope(scope) {
  if (!scope || scope.length === 0) { workspaceScope = null; return; }
  const valid = scope.map(n => n.toLowerCase().trim()).filter(n => skills.some(s =>
    s.name.toLowerCase() === n || (s.triggers || []).some(t => t.toLowerCase() === n)
  ));
  if (valid.length === 0) { workspaceScope = null; return; }
  // Resolve trigger names to skill names
  const resolved = new Set();
  for (const v of valid) {
    const exact = skills.find(s => s.name.toLowerCase() === v);
    if (exact) { resolved.add(exact.name); continue; }
    skills.filter(s => (s.triggers || []).some(t => t.toLowerCase() === v)).forEach(s => resolved.add(s.name));
  }
  workspaceScope = [...resolved];
}

// ── Normalizer for trigger matching ──────────────────────────────

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[-_\/\\.,;:!?@#$%^&*()\[\]{}|`~'"+=<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Synonym map for smart cross-domain discovery ─────────────────
// Maps common task terms to skill trigger keywords.
// When a user says "database", it expands to also match
// skills tagged with "postgres", "supabase", "sql", "storage", etc.
// This enables zero-config discovery across different vocabularies.

const SYNONYM_MAP = {
  'database': ['db', 'sql', 'postgres', 'supabase', 'storage', 'query', 'data', 'table', 'migration'],
  'auth': ['authentication', 'login', 'signin', 'signup', 'oauth', 'jwt', 'session', 'user', 'password'],
  'frontend': ['ui', 'ux', 'web', 'interface', 'react', 'component', 'layout', 'responsive', 'css', 'html'],
  'backend': ['server', 'api', 'endpoint', 'function', 'edge', 'cloud', 'runtime'],
  'animation': ['motion', 'gsap', 'animate', 'transition', 'scroll', 'timeline', 'tween', 'easing', 'spring'],
  'design': ['ui', 'ux', 'visual', 'brand', 'style', 'theme', 'color', 'typography', 'layout', 'css'],
  'browser': ['web', 'chrome', 'playwright', 'puppeteer', 'cdp', 'automation', 'navigation', 'page'],
  'test': ['testing', 'qa', 'spec', 'assert', 'verify', 'check', 'lint', 'audit'],
  'deploy': ['publish', 'release', 'ship', 'production', 'ci', 'cd', 'function', 'edge'],
  'security': ['secure', 'auth', 'permission', 'rbac', 'policy', 'encrypt', 'token', 'jwt'],
  'mobile': ['ios', 'android', 'react-native', 'swift', 'kotlin', 'app'],
  'data': ['chart', 'graph', 'visualization', 'd3', 'dashboard', 'analytics', 'metric'],
  'image': ['photo', 'picture', 'screenshot', 'canvas', 'svg', 'png', 'jpeg', 'render', 'visual'],
  'video': ['mp4', 'webm', 'mov', 'remotion', 'frame', 'animation', 'scene', 'timeline'],
  'search': ['find', 'query', 'index', 'retrieve', 'discover', 'lookup'],
  'network': ['fetch', 'api', 'http', 'request', 'ajax', 'websocket', 'rest', 'endpoint'],
  'state': ['store', 'reactive', 'signal', 'context', 'redux', 'recoil', 'zustand'],
  'prompt': ['llm', 'ai', 'instruction', 'template', 'generation', 'text'],
  'document': ['docx', 'word', 'pdf', 'file', 'report', 'letter'],
  'automation': ['script', 'workflow', 'pipeline', 'task', 'schedule', 'cron', 'bot'],
  'sales': ['crm', 'lead', 'prospect', 'outreach', 'customer', 'revenue', 'pipeline'],
  'marketing': ['campaign', 'seo', 'analytics', 'content', 'brand', 'social'],
  'icon': ['svg', 'vector', 'symbol', 'glyph', 'logo'],
  'typography': ['font', 'type', 'text', 'readability', 'typeface'],
};

// ── Tokenizer for smart matching ─────────────────────────────────
// Splits a query into meaningful tokens, preserving compound terms
// (e.g., "skill-dispatcher" stays as a token alongside "skill", "dispatcher").

function tokenize(str) {
  const tokens = [];
  const normalized = normalize(str);
  const words = normalized.split(/\s+/).filter(t => t.length > 0);
  for (const w of words) {
    tokens.push(w);
    // Also add compound splits for hyphenated/joined words
    if (w.includes('-') || w.includes('_') || w.includes('/')) {
      const parts = w.split(/[-_\/]/).filter(p => p.length > 1);
      for (const p of parts) {
        if (!tokens.includes(p)) tokens.push(p);
      }
    }
  }
  return [...new Set(tokens)];
}

function buildReverseSynonymMap() {
  const rev = {};
  for (const [key, vals] of Object.entries(SYNONYM_MAP)) {
    for (const v of vals) {
      if (!rev[v]) rev[v] = [];
      if (!rev[v].includes(key)) rev[v].push(key);
    }
  }
  return rev;
}

const REVERSE_SYNONYM_MAP = buildReverseSynonymMap();

function expandSynonyms(tokens) {
  const expanded = [];
  for (const t of tokens) {
    expanded.push(t);
    // Forward: key → values
    const fwd = SYNONYM_MAP[t];
    if (fwd) for (const s of fwd) { if (!expanded.includes(s)) expanded.push(s); }
    // Reverse: value → keys (e.g., "motion" → "animation")
    const rev = REVERSE_SYNONYM_MAP[t];
    if (rev) for (const s of rev) { if (!expanded.includes(s)) expanded.push(s); }
    // Also bring values of reverse-matched keys
    if (rev) {
      for (const rk of rev) {
        const fwd2 = SYNONYM_MAP[rk];
        if (fwd2) for (const s of fwd2) { if (!expanded.includes(s)) expanded.push(s); }
      }
    }
  }
  return [...new Set(expanded)];
}

// ── YAML Frontmatter Parser (recursive, handles all nesting) ────
// Supports: key: value, key: | (literal blocks), lists, nested objects,
// arrays of objects, any depth. Robust against Windows/macOS line endings.

// ── YAML Value Processing Utilities ──────────────────────────────

function processYamlEscapeSequence(str) {
  // Process standard YAML escape sequences in double-quoted strings
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
    .replace(/\\0/g, '\0')
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function interpretYamlTypedValue(val) {
  if (val === '' || val === undefined || val === null) return '';
  const lower = val.toLowerCase();
  // Typed nulls
  if (val === '~' || lower === 'null') return '';
  // Booleans
  if (lower === 'true' || lower === 'yes' || lower === 'on') return true;
  if (lower === 'false' || lower === 'no' || lower === 'off') return false;
  // Hex numbers
  if (/^0x[0-9a-fA-F]+$/.test(val)) return parseInt(val, 16);
  // Numeric separators
  if (/^[+-]?\d{1,3}(_\d{3})+(\.\d+)?$/.test(val)) return parseFloat(val.replace(/_/g, ''));
  // Decimal / float / scientific
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(val)) return parseFloat(val);
  return val;
}

function parseYamlValue(value, lines, i, indent, maxDepth) {
  if (maxDepth === undefined) maxDepth = MAX_YAML_NESTING;
  if (maxDepth <= 0) return value;

  // Folded block: value === '>'
  if (value === '>') {
    const parts = [];
    i++;
    while (i < lines.length && lines[i].length - lines[i].trimStart().length > indent) {
      const chunk = lines[i].replace(new RegExp(`^\\s{${indent + 2},}`), '');
      parts.push(chunk);
      i++;
    }
    return { val: parts.join(' ').replace(/  +/g, ' ').trim(), idx: i - 1 };
  }

  // Literal block: value === '|'
  if (value === '|') {
    const parts = [];
    i++;
    while (i < lines.length && lines[i].length - lines[i].trimStart().length > indent) {
      parts.push(lines[i].replace(new RegExp(`^\\s{${indent + 2},}`), ''));
      i++;
    }
    return { val: parts.join('\n').trim(), idx: i - 1 };
  }

  // Flow mapping: key: {a: 1, b: 2}
  if (value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1);
    const obj = {};
    let depth = 0;
    let current = '';
    let keyDone = false;
    let curKey = '';
    for (const ch of inner) {
      if ((ch === ',' || ch === ';') && depth === 0) {
        if (curKey) {
          const kv = parseYamlInlineValue(current.trim(), maxDepth - 1);
          const safeKey = curKey.trim();
          if (isSafeKey(safeKey)) obj[safeKey] = kv;
        }
        current = '';
        keyDone = false;
        curKey = '';
      } else if (ch === ':' && depth === 0 && !keyDone) {
        curKey = current.trim();
        current = '';
        keyDone = true;
      } else if (ch === '{' || ch === '[') { depth++; current += ch; }
      else if (ch === '}' || ch === ']') { depth--; current += ch; }
      else { current += ch; }
    }
    if (curKey) {
      const kv = parseYamlInlineValue(current.trim(), maxDepth - 1);
      const safeKey = curKey.trim();
      if (isSafeKey(safeKey)) obj[safeKey] = kv;
    }
    return { val: obj, idx: i };
  }

  // Inline array: key: [item1, item2, ...]
  if (value.startsWith('[') && value.endsWith(']')) {
    const items = [];
    let depth = 0;
    let current = '';
    for (const ch of value.slice(1, -1)) {
      if (ch === ',' && depth === 0) {
        items.push(parseYamlInlineValue(current.trim(), maxDepth - 1));
        current = '';
      } else if (ch === '[' || ch === '{') { depth++; current += ch; }
      else if (ch === ']' || ch === '}') { depth--; current += ch; }
      else { current += ch; }
    }
    if (current) items.push(parseYamlInlineValue(current.trim(), maxDepth - 1));
    return { val: items, idx: i };
  }

  return null; // not a block/inline value
}

function parseYamlInlineValue(val, maxDepth) {
  if (!val) return '';
  if (val.length > MAX_VALUE_LENGTH) return val.slice(0, MAX_VALUE_LENGTH);
  const dq = val.startsWith('"') && val.endsWith('"');
  const sq = val.startsWith("'") && val.endsWith("'");
  if (dq) return interpretYamlTypedValue(processYamlEscapeSequence(val.slice(1, -1)));
  if (sq) return val.slice(1, -1);
  // Check for nested flow structures
  if (val.startsWith('{') && val.endsWith('}')) {
    return parseYamlValue(val, [], 0, 0, maxDepth - 1)?.val || val;
  }
  if (val.startsWith('[') && val.endsWith(']')) {
    return parseYamlValue(val, [], 0, 0, maxDepth - 1)?.val || val;
  }
  return interpretYamlTypedValue(val);
}

// ── Recursive YAML Parser ────────────────────────────────────────

function parseYaml(lines, startIdx, baseIndent, maxDepth) {
  if (maxDepth === undefined) maxDepth = MAX_YAML_NESTING;
  if (maxDepth <= 0) return {};
  const result = {};
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) { i++; continue; }
    const indent = line.length - line.trimStart().length;
    if (baseIndent !== undefined && indent < baseIndent) break;
    if (trimmed === '---' || trimmed === '...') { i++; break; }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) { i++; continue; }
    let rawKey = trimmed.slice(0, colonIdx);
    let value = trimmed.slice(colonIdx + 1).trimStart();
    if ((rawKey.startsWith('"') && rawKey.endsWith('"')) || (rawKey.startsWith("'") && rawKey.endsWith("'"))) {
      rawKey = rawKey.slice(1, -1);
    }
    const key = rawKey.replace(/\s+/g, ' ').trim();
    if (!key) { i++; continue; }

    // Security: prototype pollution prevention
    if (!isSafeKey(key)) { i++; continue; }

    const anchorMatch = value.match(/^&([^\s]+)/);
    if (anchorMatch) {
      value = value.slice(anchorMatch[0].length).trimStart();
    }

    // Try block value and inline parsing
    const blockResult = parseYamlValue(value, lines, i, indent, maxDepth - 1);
    if (blockResult) {
      // Security: value length check
      if (typeof blockResult.val === 'string' && blockResult.val.length > MAX_VALUE_LENGTH) {
        result[key] = blockResult.val.slice(0, MAX_VALUE_LENGTH);
      } else {
        result[key] = blockResult.val;
      }
      i = blockResult.idx + 1;
      continue;
    }

    if (value === '') {
      // Could be a list, nested object, or empty value
      const nextIdx = i + 1;
      if (nextIdx < lines.length) {
        const nextLine = lines[nextIdx];
        const nextTrimmed = nextLine.trim();
        const nextIndent = nextLine.length - nextLine.trimStart().length;
        if (nextIndent > indent) {
          if (nextTrimmed.startsWith('- ')) {
            // List of items
            const items = [];
            let li = nextIdx;
            while (li < lines.length) {
              const cl = lines[li];
              const ctrimmed = cl.trim();
              const cindent = cl.length - cl.trimStart().length;
              if (cindent <= indent) break;
              if (ctrimmed.startsWith('- ')) {
                const itemContent = ctrimmed.replace(/^- /, '').trim();
                const nextNext = li + 1;
                if (nextNext < lines.length) {
                  const nnLine = lines[nextNext];
                  const nnIndent = nnLine.length - nnLine.trimStart().length;
                  if (nnIndent > cindent && !nnLine.trim().startsWith('- ')) {
                    const subResult = parseYaml(lines, li, cindent, maxDepth - 1);
                    const objResult = {};
                    const subColon = itemContent.indexOf(':');
                    let subKey = '';
                    let subVal = itemContent;
                    if (subColon !== -1) {
                      let rk = itemContent.slice(0, subColon);
                      const skQuoted = (rk.startsWith('"') && rk.endsWith('"')) || (rk.startsWith("'") && rk.endsWith("'"));
                      if (skQuoted) rk = rk.slice(1, -1);
                      subKey = rk.trim();
                      subVal = itemContent.slice(subColon + 1).trimStart();
                    }
                    if (subKey && isSafeKey(subKey)) {
                      if (subVal) {
                        objResult[subKey] = parseYamlInlineValue(subVal, maxDepth - 1);
                      } else {
                        objResult[subKey] = subResult;
                      }
                    }
                    if (Object.keys(objResult).length > 0) items.push(objResult);
                  } else {
                    items.push(parseYamlInlineValue(itemContent, maxDepth - 1));
                  }
                } else {
                  items.push(parseYamlInlineValue(itemContent, maxDepth - 1));
                }
                li++;
              } else if (cindent > indent) {
                li++;
              } else {
                break;
              }
            }
            result[key] = items;
            i = li;
            continue;
          } else {
            // Nested object
            const subResult = parseYaml(lines, nextIdx, nextIndent, maxDepth - 1);
            result[key] = subResult;
            let tempIdx = nextIdx;
            let lastKeyLine = nextIdx;
            while (tempIdx < lines.length) {
              const tl = lines[tempIdx];
              const ttrimmed = tl.trim();
              const tindent = tl.length - tl.trimStart().length;
              if (tindent < nextIndent && ttrimmed) break;
              const tColon = ttrimmed.indexOf(':');
              const tHasKey = tColon !== -1 && ttrimmed.slice(0, tColon).trim().length > 0;
              if (tHasKey) {
                const subKeys = Object.keys(subResult);
                const seenSoFar = new Set();
                for (let checkIdx = nextIdx; checkIdx <= tempIdx; checkIdx++) {
                  const ckLine = lines[checkIdx].trim();
                  const ckColon = ckLine.indexOf(':');
                  if (ckColon !== -1 && ckLine.slice(0, ckColon).trim().length > 0) {
                    seenSoFar.add(ckLine.slice(0, ckColon).replace(/^["']|["']$/g, '').trim());
                  }
                }
                if (subKeys.every(sk => seenSoFar.has(sk)) && tindent === nextIndent) {
                  break;
                }
              }
              lastKeyLine = tempIdx;
              tempIdx++;
            }
            i = lastKeyLine + 1;
            continue;
          }
        }
      }
      result[key] = '';
      i++;
      continue;
    }

    // Simple key: value
    result[key] = parseYamlInlineValue(value, maxDepth - 1);
    i++;
  }

  return result;
}

function parseFrontmatter(text) {
  if (!text) return {};
  if (text.length > MAX_VALUE_LENGTH) text = text.slice(0, MAX_VALUE_LENGTH);
  const normalized = text.replace(/\r\n|\r/g, '\n');
  const lines = normalized.split('\n');
  return parseYaml(lines, 0, 0, MAX_YAML_NESTING);
}

function parseSkillMd(content) {
  if (!content) return null;
  // Security: enforce max file size
  if (content.length > MAX_SKILL_FILE_SIZE) {
    console.error(`[dispatcher] Skill file exceeds max size (${content.length} > ${MAX_SKILL_FILE_SIZE}), skipping`);
    return null;
  }
  const normalized = content.replace(/\r\n|\r/g, '\n').replace(/^\uFEFF/, '');
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n(?:---\s*)?(?:\n|$)/);
  if (!fmMatch) return null;
  const fm = parseFrontmatter(fmMatch[1]);
  const rawTriggers = fm.triggers;
  let triggers = [];
  if (Array.isArray(rawTriggers)) {
    triggers = rawTriggers.slice(0, MAX_TRIGGERS); // Security: max triggers limit
  } else if (typeof rawTriggers === 'string' && rawTriggers.trim()) {
    triggers = rawTriggers.split(',').map(t => { const tt = t.trim(); const q = (tt.startsWith('"') && tt.endsWith('"')) || (tt.startsWith("'") && tt.endsWith("'")); return q ? tt.slice(1, -1) : tt; }).filter(t => t).slice(0, MAX_TRIGGERS);
  } else if (Array.isArray(fm.tags)) {
    triggers = fm.tags.slice(0, MAX_TRIGGERS);
  } else if (typeof fm.tags === 'string' && fm.tags.trim()) {
    triggers = fm.tags.split(',').map(t => { const tt = t.trim(); const q = (tt.startsWith('"') && tt.endsWith('"')) || (tt.startsWith("'") && tt.endsWith("'")); return q ? tt.slice(1, -1) : tt; }).filter(t => t).slice(0, MAX_TRIGGERS);
  }
  // Security: sanitize trigger values — length and content
  triggers = triggers.map(t => {
    if (typeof t !== 'string') return String(t).slice(0, 200);
    return t.slice(0, 200);
  });
  return {
    name: (typeof fm.name === 'string' ? fm.name : String(fm.name || '')).trim(),
    description: typeof fm.description === 'string' ? fm.description : String(fm.description || ''),
    triggers,
  };
}
// ── Skill Index ──────────────────────────────────────────────────

const skills = [];
const importedRepos = new Map(); // repoName → { origin, skills, commands }
const commandRegistry = new Map(); // commandName → { description, content, origin }

function skillMdPath(subDir) {
  const candidates = ['SKILL.md', 'skill.md', 'Skill.md', 'SKILL.MD'];
  for (const c of candidates) {
    const p = join(subDir, c);
    if (existsSync(p)) return p;
  }
  return null;
}

function findSkillDirs(dir, maxDepth = 4, currentDepth = 0) {
  const results = [];
  if (currentDepth > maxDepth) return results;
  if (!existsSync(dir)) return results;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subDir = join(dir, entry.name);
    // Skip hidden directories and node_modules
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const mdPath = skillMdPath(subDir);
    if (mdPath) {
      results.push({ dir: subDir, mdPath });
    } else {
      results.push(...findSkillDirs(subDir, maxDepth, currentDepth + 1));
    }
  }
  return results;
}

function parseSkillMdGemini(content) {
  // Gemini-style: GEMINI.md or markdown in .gemini/skills/ directories
  // Usually has a description blockquote after the heading
  if (!content) return null;
  const normalized = content.replace(/\r\n|\r/g, '\n');
  const nameMatch = normalized.match(/^#\s+(.+)/m);
  const descMatch = normalized.match(/^>\s*(.+)/m);
  // Require both heading AND blockquote description for Gemini format
  if (nameMatch && descMatch && descMatch[1].trim().length > 5) {
    return {
      name: nameMatch[1].trim().toLowerCase().replace(/\s+/g, '-'),
      description: descMatch[1].trim(),
      triggers: [nameMatch[1].trim().toLowerCase()],
    };
  }
  return null;
}

function parseSkillMdPlain(content, filePath) {
  if (!content) return null;
  const normalized = content.replace(/\r\n|\r/g, '\n');
  // Infer name from filename (directory name) or first H1
  const nameFromPath = filePath ? basename(dirname(filePath)) : '';
  // Remove common suffixes from inferred name
  const cleanName = nameFromPath.replace(/\.(md|markdown)$/i, '');
  const nameMatch = normalized.match(/^#\s+(.+)/m);
  const name = nameMatch ? nameMatch[1].trim() : (cleanName || 'unnamed');
  const descMatch = normalized.match(/^##?\s+Description\s*\n([^#\n]+)/im) ||
                    normalized.match(/^(?:This skill|This guide|This tool|This agent)\s+(.+)/im);
  return {
    name: name.toLowerCase().replace(/\s+/g, '-'),
    description: descMatch ? descMatch[1].trim().slice(0, 200) : '',
    triggers: name.split(/\s+/).filter(w => w.length > 2).map(w => w.toLowerCase()),
  };
}

function parseSkillMdCommand(content, filePath) {
  // Parse .claude/commands/*.md format: YAML frontmatter with description
  if (!content) return null;
  const normalized = content.replace(/\r\n|\r/g, '\n');
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n(?:---\s*)?(?:\n|$)/);
  if (!fmMatch) return null;
  const fm = parseFrontmatter(fmMatch[1]);
  const body = normalized.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  const name = basename(filePath || '').replace(/\.md$/i, '') || fm.name || 'command';
  return {
    name,
    description: fm.description || 'Custom command',
    triggers: fm.triggers || [name],
    isCommand: true,
    commandBody: body,
  };
}

function isBinaryContent(content) {
  // Check for null bytes which indicate binary content
  return content.includes('\0');
}

function parseSkillMdAdvanced(content, filePath) {
  if (!content) return null;
  // Reject binary content (null bytes)
  if (isBinaryContent(content)) return null;
  // Reject very short content (under ~120 chars) - likely not a real skill
  if (content.length < 120) return null;
  // Pattern A: Standard YAML frontmatter (OpenCode-style)
  const standard = parseSkillMd(content);
  if (standard && standard.name) return { ...standard, format: 'standard' };

  // Pattern B: Command format (.claude/commands/*.md)
  if (filePath && filePath.includes('commands')) {
    const cmd = parseSkillMdCommand(content, filePath);
    if (cmd) return { ...cmd, format: 'command' };
  }

  // Pattern C: Gemini-style
  const gemini = parseSkillMdGemini(content);
  if (gemini) return { ...gemini, format: 'gemini' };

  // Pattern D: Plain markdown with heading
  const plain = parseSkillMdPlain(content, filePath);
  if (plain && plain.name) return { ...plain, format: 'plain' };

  return null;
}

function indexSkillFromDir(dir, origin = 'local', mdPathOverride) {
  const mdPath = mdPathOverride || skillMdPath(dir);
  if (!mdPath) return null;
  // Security: prevent reading files outside allowed directories
  if (!isInsideSkillsDir(resolve(mdPath))) {
    console.error(`[dispatcher] Path traversal blocked: ${mdPath}`);
    return null;
  }
  try {
    const rawBuf = readFileSync(mdPath);
    const content = rawBuf.toString('utf-8');
    // Reject binary content before parsing (check raw buffer for null bytes)
    if (isBinaryContent(content) || rawBuf.includes(0)) return null;
    // Try standard parser first (backward compat), then advanced
    let meta = parseSkillMd(content);
    if (meta === null) {
      meta = parseSkillMdAdvanced(content, mdPath);
    }
    if (meta && (meta.name || (Array.isArray(meta.triggers) && meta.triggers.length > 0) || meta.description)) {
      const skillName = meta.name || basename(dir);
      const domain = basename(dirname(dir));
      // Plain/Gemini formats: require at least some triggers or description to be valid
      const fmt = meta.format || 'standard';
      if (fmt !== 'standard') {
        const hasTriggers = Array.isArray(meta.triggers) && meta.triggers.length > 0;
        const hasDesc = (meta.description || '').length > 5;
        if (!hasTriggers && !hasDesc) return null;
      }
      return {
        id: basename(dir),
        dir,
        name: skillName,
        description: meta.description || '',
        triggers: Array.isArray(meta.triggers) ? meta.triggers : [],
        fullContent: content,
        origin,
        domain: domain === basename(dir) ? '' : domain,
        format: fmt,
        isCommand: !!meta.isCommand,
        commandBody: meta.commandBody || '',
      };
    }
  } catch (err) {
    console.error(`[skill-dispatcher] Error reading ${mdPath}: ${err.message}`);
  }
  return null;
}

function indexCommandsFromDir(commandsDir, origin = 'local') {
  const count = { before: commandRegistry.size };
  if (!existsSync(commandsDir)) return;
  const scanCommands = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        scanCommands(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const meta = parseSkillMdCommand(content, fullPath);
          if (meta) {
            commandRegistry.set(meta.name, {
              description: meta.description,
              content: meta.commandBody || content,
              origin,
              path: fullPath,
            });
          }
        } catch {}
      }
    }
  };
  scanCommands(commandsDir);
  const added = commandRegistry.size - count.before;
  if (added > 0) console.error(`[skill-dispatcher] Indexed ${added} command(s) from ${commandsDir}`);
}

function indexSkills() {
  if (!existsSync(SKILLS_DIR)) {
    console.error(`[skill-dispatcher] Skills directory not found: ${SKILLS_DIR}`);
    return;
  }
  skills.length = 0;
  const dirs = findSkillDirs(SKILLS_DIR, 4);
  const seenNames = new Set();
  for (const entry of dirs) {
    const dir = typeof entry === 'string' ? entry : entry.dir;
    const mdPathOverride = typeof entry === 'string' ? null : entry.mdPath;
    const skill = indexSkillFromDir(dir, 'local', mdPathOverride);
    if (skill) {
      // Deduplicate by name
      if (!seenNames.has(skill.name)) {
        seenNames.add(skill.name);
        skills.push(skill);
      } else {
        // Skill with same name exists, keep the one with more triggers
        const existing = skills.find(s => s.name === skill.name);
        if (skill.triggers.length > (existing?.triggers.length || 0)) {
          const idx = skills.indexOf(existing);
          skills[idx] = skill;
        }
      }
    }
  }
  // Also index commands from .claude/commands/ if present
  const claudeCommandsDir = join(SKILLS_DIR, '..', '.claude', 'commands');
  indexCommandsFromDir(claudeCommandsDir, 'local');
  const claudeCommandsDirAlt = join(dirname(SKILLS_DIR), '.claude', 'commands');
  if (claudeCommandsDirAlt !== claudeCommandsDir) {
    indexCommandsFromDir(claudeCommandsDirAlt, 'local');
  }
  console.error(`[skill-dispatcher] Loaded ${skills.length} skills from ${SKILLS_DIR}${commandRegistry.size > 0 ? ` (${commandRegistry.size} commands)` : ''}`);
}

indexSkills();

// ── Agent Routing Table ─────────────────────────────────────────
// Maps AI tool names to compatible skill categories/formats.
// Skills tagged with these categories are visible to the agent.

const AGENT_ROUTING = {
  opencode: { match: ['standard', 'plain', 'gemini', 'command'], desc: 'Default OpenCode agent' },
  claude: { match: ['standard', 'command', 'gemini', 'plain'], desc: 'Claude Code / Claude Desktop' },
  cursor: { match: ['standard', 'plain'], desc: 'Cursor editor' },
  aider: { match: ['standard', 'plain'], desc: 'Aider CLI' },
  windsurf: { match: ['standard', 'plain', 'gemini'], desc: 'Windsurf editor' },
  codex: { match: ['standard', 'command', 'plain'], desc: 'Codex CLI' },
  gemini: { match: ['gemini', 'standard', 'plain'], desc: 'Gemini CLI' },
  antigravity: { match: ['standard', 'command', 'plain', 'gemini'], desc: 'Antigravity 1.x/2.x' },
  kilocode: { match: ['standard', 'plain'], desc: 'Kilo Code' },
  augment: { match: ['standard', 'plain', 'command'], desc: 'Augment Code' },
  hermes: { match: ['standard', 'gemini', 'plain'], desc: 'Hermes CLI' },
  'mistral-vibe': { match: ['standard', 'plain'], desc: 'Mistral Vibe' },
  openclaw: { match: ['standard', 'plain', 'gemini'], desc: 'OpenClaw' },
};

let currentAgent = 'opencode';

function setAgent(agentName) {
  const key = agentName.toLowerCase().trim();
  if (AGENT_ROUTING[key]) {
    currentAgent = key;
    return `Agent set to: ${key} (${AGENT_ROUTING[key].desc})`;
  }
  // Try fuzzy match
  const match = Object.keys(AGENT_ROUTING).find(a => a.includes(key) || key.includes(a));
  if (match) {
    currentAgent = match;
    return `Agent set to: ${match} (fuzzy matched from "${agentName}")`;
  }
  return `Unknown agent "${agentName}". Using default: opencode. Available: ${Object.keys(AGENT_ROUTING).join(', ')}`;
}

function filterSkillsByAgent(skillList, agentName) {
  const key = (agentName || currentAgent).toLowerCase().trim();
  const routing = AGENT_ROUTING[key];
  if (!routing) return skillList; // No filtering for unknown agents
  return skillList.filter(s => routing.match.includes(s.format || 'standard'));
}

function filterSkillsByOrigin(skillList, origin) {
  if (!origin || origin === 'all') return skillList;
  return skillList.filter(s => s.origin === origin);
}

// ── External Repo Importer ──────────────────────────────────────

function importRepo(url) {
  const repoName = url.replace(/\.git$/, '').split('/').pop().replace(/[^a-z0-9_-]/gi, '_');
  const repoDir = join(SKILLS_DIR, '..', '.imported', repoName);

  if (importedRepos.has(repoName)) {
    return `Repo "${repoName}" already imported. ${importedRepos.get(repoName).skills.length} skills loaded.`;
  }

  // Security: validate git URL before any I/O
  if (!isValidGitUrl(url)) {
    return `Import failed: Invalid or unsafe git URL`;
  }

  try {
    console.error(`[skill-dispatcher] Cloning ${url} → ${repoDir}...`);
    if (existsSync(repoDir)) {
      rmSync(repoDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    }
    mkdirSync(repoDir, { recursive: true });

    // Security: use spawnSync instead of execSync to prevent shell injection
    const gitResult = spawnSync('git', ['clone', '--depth', '1', '--single-branch', url, repoDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
      maxBuffer: 50 * 1024 * 1024
    });

    if (gitResult.status !== 0) {
      const stderr = gitResult.stderr?.toString() || '';
      const sanitized = stderr.replace(/(https?:\/\/)[^@]+@/g, '$1***@'); // strip embedded tokens
      throw new Error(`git clone failed (exit ${gitResult.status}): ${sanitized.slice(0, 500)}`);
    }

    console.error(`[skill-dispatcher] Clone complete. Indexing skills...`);

    const skillDirs = findSkillDirs(repoDir, 6);
    const repoSkills = [];
    const seenNames = new Set();
    for (const entry of skillDirs) {
      const dir = typeof entry === 'string' ? entry : entry.dir;
      const mdPathOverride = typeof entry === 'string' ? null : entry.mdPath;
      const skill = indexSkillFromDir(dir, repoName, mdPathOverride);
      if (skill && !seenNames.has(skill.name)) {
        seenNames.add(skill.name);
        repoSkills.push(skill);
        skills.push(skill);
      }
    }

    const commandsDir = join(repoDir, '.claude', 'commands');
    indexCommandsFromDir(commandsDir, repoName);

    importedRepos.set(repoName, { origin: repoName, skills: repoSkills, dir: repoDir });
    console.error(`[skill-dispatcher] Imported ${repoSkills.length} skills from ${repoName}`);
    return `Imported ${repoSkills.length} skills from "${repoName}". Total skills: ${skills.length}. Commands: ${commandRegistry.size}`;
  } catch (err) {
    console.error(`[skill-dispatcher] Import failed for ${url}: ${err.message}`);
    try { rmSync(repoDir, { recursive: true, force: true, maxRetries: 3 }); } catch {}
    return `Import failed: ${err.message}`;
  }
}

// ── Agent Config (optional) ─────────────────────────────────────
// Restricts skills based on an agent's JSON profile.
// Subagents only see skills they're allowed to use.

if (agentConfigPath) {
  try {
    const cfg = JSON.parse(readFileSync(agentConfigPath, 'utf-8'));
    // Build scope step by step: start with all, then filter
    let agentScopeSet = new Set(skills.map(s => s.name));

    if (cfg.allowedSkills && Array.isArray(cfg.allowedSkills) && cfg.allowedSkills.length > 0) {
      agentScopeSet = new Set(skills.filter(s => cfg.allowedSkills.includes(s.name)).map(s => s.name));
      console.error(`[skill-dispatcher] Agent "${cfg.name || 'unnamed'}" → allowed ${agentScopeSet.size} skills`);
    }
    if (cfg.allowedTriggers && Array.isArray(cfg.allowedTriggers) && cfg.allowedTriggers.length > 0) {
      const triggerFiltered = skills.filter(s => (s.triggers || []).some(t => cfg.allowedTriggers.includes(t)));
      agentScopeSet = new Set([...agentScopeSet].filter(n => triggerFiltered.some(s => s.name === n)));
      console.error(`[skill-dispatcher] Trigger filter → ${agentScopeSet.size} skills remaining`);
    }
    if (cfg.excludeSkills && Array.isArray(cfg.excludeSkills) && cfg.excludeSkills.length > 0) {
      agentScopeSet = new Set([...agentScopeSet].filter(n => !cfg.excludeSkills.includes(n)));
      console.error(`[skill-dispatcher] Excluded ${cfg.excludeSkills.length} skill(s) → ${agentScopeSet.size} remaining`);
    }

    workspaceScope = [...agentScopeSet];
  } catch (err) {
    console.error(`[skill-dispatcher] Agent config error: ${err.message}. Proceeding with all skills.`);
  }
}

// ── Smart Matching Engine ───────────────────────────────────────
// Token-aware scoring with synonym expansion and weighted fields.
// Returns ranked results — best match first. The score reflects
// how many query tokens matched and their match quality.
// Zero-config: works with ANY current or future skill.

function matchToken(token, text) {
  if (!text) return 0;
  const words = text.split(/\s+/);
  // Exact word match (highest confidence)
  for (const w of words) {
    if (w === token) return 1.0;
  }
  // Substring within a word
  if (token.length >= 2) {
    for (const w of words) {
      if (w.includes(token)) return 0.8;
      if (w.startsWith(token) || token.startsWith(w)) return 0.7;
    }
  }
  return 0;
}

function computeSmartScore(skill, tokens, expandedTokens) {
  if (tokens.length === 0) return 0;

  const nameNorm = normalize(skill.name);
  const descNorm = normalize(skill.description || '');
  const triggerNorms = (skill.triggers || []).map(t => normalize(t));

  let totalScore = 0;
  let matchedTokens = new Set();

  for (const token of tokens) {
    let tokenScore = 0;

    // Name: highest weight (3x)
    const nameHit = matchToken(token, nameNorm);
    if (nameHit > 0) tokenScore = Math.max(tokenScore, nameHit * 3);

    // Triggers: medium weight (2x)
    for (const tn of triggerNorms) {
      const trigHit = matchToken(token, tn);
      if (trigHit > 0) tokenScore = Math.max(tokenScore, trigHit * 2);
    }

    // Description: base weight (1x)
    const descHit = matchToken(token, descNorm);
    if (descHit > 0) tokenScore = Math.max(tokenScore, descHit * 1);

    // Synonym expansion: check if any expanded term matches triggers
    if (tokenScore === 0) {
      for (const exp of expandedTokens) {
        if (exp === token) continue;
        for (const tn of triggerNorms) {
          const synHit = matchToken(exp, tn);
          if (synHit > 0) { tokenScore = Math.max(tokenScore, synHit * 1.5); break; }
        }
        if (tokenScore > 0) break;
        const synNameHit = matchToken(exp, nameNorm);
        if (synNameHit > 0) { tokenScore = Math.max(tokenScore, synNameHit * 1.2); break; }
      }
    }

    if (tokenScore > 0) {
      matchedTokens.add(token);
      totalScore += tokenScore;
    }
  }

  // Boost if most tokens matched (query was specific)
  const matchRatio = matchedTokens.size / tokens.length;
  if (matchRatio >= 0.8 && tokens.length > 1) totalScore *= 1.3;
  if (matchRatio >= 1.0 && tokens.length > 1) totalScore *= 1.15;

  // Normalize to a 0-100 scale for readability
  return Math.round(totalScore * 100) / 100;
}

function matchSkills(query) {
  if (!query || !query.trim()) return [...getScopedSkills()];
  const tokens = tokenize(query);
  const expandedTokens = expandSynonyms(tokens);
  const scoped = getScopedSkills();

  const scored = scoped.map(s => ({
    skill: s,
    score: computeSmartScore(s, tokens, expandedTokens),
  }));

  const filtered = scored.filter(s => s.score > 0);
  filtered.sort((a, b) => b.score - a.score);

  return filtered.map(s => s.skill);
}

// Returns scored results with metadata (for MCP and CLI)
function matchSkillsScored(query) {
  if (!query || !query.trim()) {
    return getScopedSkills().map(s => ({
      name: s.name,
      description: s.description,
      triggers: s.triggers,
      score: 0,
      family: formatFamilySummary(s.name),
      active: activeSkills.has(s.name),
    }));
  }
  const tokens = tokenize(query);
  const expandedTokens = expandSynonyms(tokens);
  const scoped = getScopedSkills();

  const scored = scoped.map(s => ({
    name: s.name,
    description: s.description,
    triggers: s.triggers,
    score: computeSmartScore(s, tokens, expandedTokens),
    family: formatFamilySummary(s.name),
    active: activeSkills.has(s.name),
  }));

  const filtered = scored.filter(s => s.score > 0);
  filtered.sort((a, b) => b.score - a.score);

  return filtered;
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

/**
 * Format a concise family summary to avoid O(n) name listings for large families.
 * Returns e.g. "part of design family (49 related)" or empty string if alone.
 */
function formatFamilySummary(skillName) {
  const family = getSkillFamily(skillName);
  if (family.length <= 1) return '';
  const others = family.filter(n => n !== skillName);
  const count = others.length;
  if (count <= 3) return `Family: ${others.join(', ')}`;
  return `Family: ${others.slice(0, 3).join(', ')}, and ${count - 3} more`;
}

// ── Simple mode: plain JSON for local models ──────────────────

if (simpleMode) {
  function simpleOutput() {
    switch (cliMode) {
      case 'list': {
        const all = getScopedSkills();
        return { skills: all.map(s => ({ name: s.name, description: s.description, triggers: s.triggers })) };
      }
      case 'match': {
        const results = matchSkillsScored(cliArg);
        return { query: cliArg, count: results.length, results };
      }
      case 'get': {
        const skill = skills.find(s => s.name === cliArg || s.id === cliArg);
        if (!skill) return { error: `Skill "${cliArg}" not found` };
        if (!activeSkills.has(skill.name)) activeSkills.set(skill.name, { loadedAt: new Date(), callCount: 0 });
        activeSkills.get(skill.name).callCount++;
        return { name: skill.name, content: skill.fullContent, description: skill.description, triggers: skill.triggers, active_count: activeSkills.size };
      }
      case 'active': {
        const loaded = getActiveSkillsWithRelevance(currentTaskContext.description || '');
        return { context: currentTaskContext.description || null, active_count: loaded.length, tasks: loaded };
      }
      case 'unload': {
        const wasActive = activeSkills.has(cliArg);
        if (wasActive) activeSkills.delete(cliArg);
        return { skill: cliArg, unloaded: wasActive, remaining_active: activeSkills.size };
      }
      case 'context': {
        currentTaskContext = { description: cliArg, setAt: new Date() };
        const loaded = getActiveSkillsWithRelevance(cliArg);
        return { context: cliArg, active_count: loaded.length, tasks: loaded };
      }
      case 'import-repo': {
        const result = importRepo(cliArg);
        return { message: result, imported_repos: [...importedRepos.keys()], total_skills: skills.length };
      }
      case 'agent': {
        const msg = setAgent(cliArg);
        return { message: msg, current_agent: currentAgent };
      }
      case 'list-commands': {
        return { commands: [...commandRegistry.entries()].map(([name, meta]) => ({ name, description: meta.description, origin: meta.origin })) };
      }
      case 'origin': {
        const filtered = filterSkillsByOrigin(skills, cliArg);
        return { origin: cliArg || 'all', count: filtered.length, skills: filtered.map(s => ({ name: s.name, origin: s.origin, format: s.format })) };
      }
      default:
        return { error: 'Unknown command. Use --help.' };
    }
  }
  process.stdout.write(JSON.stringify(simpleOutput(), null, 2) + '\n');
  process.exit(0);
}

// ── CLI Mode ─────────────────────────────────────────────────────

if (cliMode) {
  switch (cliMode) {
    case 'help':
      console.log(`
skill-dispatcher v3.0 — Universal Skill Loader with Multi-Repo / Multi-Agent support

USAGE:
  # MCP server mode (for AI tools like opencode, Claude, Cursor)
  skill-dispatcher --skills-dir ./skills

  # CLI mode (direct terminal use)
  skill-dispatcher --skills-dir ./skills --list
  skill-dispatcher --skills-dir ./skills --match "animation gsap"
  skill-dispatcher --skills-dir ./skills --get gsap-core
  skill-dispatcher --skills-dir ./skills --active
  skill-dispatcher --skills-dir ./skills --context "building a hero section"

  # Import skills from external GitHub repo
  skill-dispatcher --skills-dir ./skills --import-repo https://github.com/alirezarezvani/claude-skills

  # Filter skills for a specific AI agent
  skill-dispatcher --skills-dir ./skills --agent cursor --list

  # List custom commands (.claude/commands/*.md)
  skill-dispatcher --skills-dir ./skills --list-commands

  # Filter skills by origin (local, imported-repo-name)
  skill-dispatcher --skills-dir ./skills --origin claude-skills --list

  # Simple mode (plain JSON output — for local models)
  skill-dispatcher --skills-dir ./skills --simple --match "database"

  # Agent mode (restricted skill scope via config)
  skill-dispatcher --skills-dir ./skills --agent-config ./agent-profile.json

OPTIONS:
  -s, --skills-dir <path>      Path to skills directory (default: ./skills)
  -l, --list                   List all available skills
  -m, --match <query>          Match skills by trigger keywords (smart scored)
  -g, --get <name>             Get full content of a specific skill
  -u, --unload <name>          Unload a skill (remove from active set)
  -a, --active                 Show currently active (loaded) skills with relevance
  -c, --context <desc>         Set task context and get lifecycle recommendations
      --import-repo <url>      Clone and index skills from a GitHub repo
      --agent <name>           Filter skills for a specific AI agent
      --list-commands          List custom commands from .claude/commands/
      --origin <name>          Filter skills by origin (local or repo name)
      --simple                 Plain JSON output (for local models that exec CLI)
      --agent-config <path>    Restrict skills per agent profile JSON
  -h, --help                   Show this help

SUPPORTED AGENTS: ${Object.keys(AGENT_ROUTING).join(', ')}
`);
      process.exit(0);

    case 'list':
      const scopedList = getScopedSkills();
      if (scopedList.length === 0) {
        console.log('\n  No skills found.\n');
        process.exit(0);
      }
      const listNote = workspaceScope ? ` (scoped: ${workspaceScope.length} of ${skills.length})` : '';
      console.log(`\n  ${scopedList.length} skills in ${SKILLS_DIR}${listNote}\n`);
      for (const s of scopedList) {
        const desc = (s.description || '').split('\n')[0].slice(0, 70);
        const active = activeSkills.has(s.name) ? ' [ACTIVE]' : '';
        console.log(`  ${(s.name + active).padEnd(28)} ${desc}`);
      }
      console.log();
      process.exit(0);

    case 'match': {
      const scored = matchSkillsScored(cliArg);
      if (scored.length === 0) {
        console.log(`\n  No skills matched "${cliArg}"\n`);
        process.exit(0);
      }
      console.log(`\n  ${scored.length} skill(s) matched "${cliArg}" (sorted by relevance):\n`);
      for (const s of scored) {
        const active = s.active ? ' [ACTIVE]' : '';
        const scoreBar = s.score > 0 ? ` ${'█'.repeat(Math.min(Math.round(s.score), 10))}${'░'.repeat(Math.max(10 - Math.round(s.score), 0))} ${s.score}` : '';
        console.log(`  ${(s.name + active).padEnd(28)}${scoreBar}`);
        console.log(`  ${(s.description || '').split('\n')[0].slice(0, 80)}`);
        console.log(`  Triggers: ${s.triggers.join(', ') || '—'}`);
        const famStr = s.family;
        if (famStr) console.log(`  ${famStr}`);
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

    case 'import-repo': {
      const result = importRepo(cliArg);
      console.log(`\n  ${result}\n`);
      process.exit(0);
    }

    case 'agent': {
      const msg = setAgent(cliArg);
      const scoped = filterSkillsByAgent(skills, currentAgent);
      console.log(`\n  ${msg}`);
      console.log(`  ${scoped.length} of ${skills.length} skills compatible with ${currentAgent}\n`);
      process.exit(0);
    }

    case 'list-commands': {
      if (commandRegistry.size === 0) {
        console.log('\n  No custom commands found.\n');
        process.exit(0);
      }
      console.log(`\n  ${commandRegistry.size} custom command(s):\n`);
      for (const [name, meta] of commandRegistry) {
        console.log(`  /${name.padEnd(30)} ${meta.description}`);
      }
      console.log();
      process.exit(0);
    }

    case 'origin': {
      const filtered = filterSkillsByOrigin(skills, cliArg);
      const note = cliArg ? ` (origin: ${cliArg})` : ' (all origins)';
      console.log(`\n  ${filtered.length} skill(s)${note}\n`);
      for (const s of filtered) {
        const desc = (s.description || '').split('\n')[0].slice(0, 60);
        console.log(`  ${s.name.padEnd(24)} [${s.origin.padEnd(12)}] ${desc}`);
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
  // Security: enforce max input size
  if (line.length > MAX_COMMAND_SIZE) {
    console.error(`[skill-dispatcher] Message exceeds max size (${line.length}), ignored`);
    return;
  }
  let msg;
  try { msg = JSON.parse(line); } catch {
    console.error(`[skill-dispatcher] Malformed JSON-RPC message ignored`);
    return;
  }
  // Security: validate MCP message structure
  if (!validateMCPMessage(msg)) {
    console.error(`[skill-dispatcher] Invalid JSON-RPC message structure`);
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
            {
              name: 'set_workspace',
              description: 'Restrict the skill index to only skills relevant to your current workspace. After calling this, match_skills and list_skills only see skills in scope. Call with an empty array to reset and see all skills again. This keeps the skill index lean — only the skills you need are discoverable.',
              inputSchema: {
                type: 'object',
                properties: {
                  scope: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of skill names or trigger keywords to include in scope (e.g., ["gsap", "animation", "frontend-design"]). Empty array to reset to all skills.',
                  },
                },
                required: ['scope'],
              },
            },
            {
              name: 'import_repo',
              description: 'Clone and index all skills from an external GitHub repo. Skills are tagged with the repo name as origin and merged into the main skill index.',
              inputSchema: {
                type: 'object',
                properties: {
                  url: { type: 'string', description: 'GitHub repo URL to import (e.g., https://github.com/alirezarezvani/claude-skills)' },
                },
                required: ['url'],
              },
            },
            {
              name: 'list_commands',
              description: 'List all custom commands indexed from .claude/commands/ directories across all imported repos and local skills. Commands are /command-name style.',
              inputSchema: { type: 'object', properties: {} },
            },
            {
              name: 'set_agent',
              description: 'Set the current AI agent to filter skills by compatibility. Skills in formats incompatible with the agent will be hidden from match_skills and list_skills.',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: `Agent name. Supported: ${Object.keys(AGENT_ROUTING).join(', ')}` },
                },
                required: ['name'],
              },
            },
          ],
        });
        break;

      case 'tools/call': {
        if (!params || !params.name) {
          respond(id, { content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid params: name required' }) }] });
          break;
        }
        const name = params.name.toLowerCase();
        const args = params.arguments || {};
        switch (name) {
          case 'match_skills': {
            const rawQuery = args?.query || '';
            const query = rawQuery.toLowerCase();
            if (!query) {
              respond(id, {
                content: [{ type: 'text', text: `No query. ${getScopedSkills().length} skill(s) in scope — use \`list_skills\` to browse.` }],
              });
              break;
            }
            const scored = matchSkillsScored(query);
            if (scored.length === 0) {
              respond(id, {
                content: [{ type: 'text', text: `No skills matched "${rawQuery}".\n\nAvailable: ${getScopedSkills().map(s => s.name).join(', ')}` }],
              });
              break;
            }
            const scoreRank = scored.length > 1 ? `\n\n_Ranked by smart score — top match: **${scored[0].name}** (${scored[0].score})_\n` : '';
            const text = scored.map(s => {
              const active = s.active ? ' **[ACTIVE]**' : '';
              const scoreStr = s.score > 0 ? ` _(score: ${s.score})_` : '';
              const familyStr = s.family;
              const familyLine = familyStr ? `\n${familyStr}` : '';
              return `### ${s.name}${active}${scoreStr}\n**${s.description || 'No description'}**\nTriggers: ${s.triggers.join(', ') || '—'}${familyLine}`;
            }).join('\n\n');
            const staleNote = currentTaskContext.description
              ? `\n\n_Context: "${currentTaskContext.description}". Call \`set_task_context\` if switching tasks._`
              : '';
            respond(id, {
              content: [{
                type: 'text',
                text: `**${scored.length} skill(s)** matched "${rawQuery}":${scoreRank}\n\n${text}\n\nCall \`get_skill\` with a name to load its full content (auto-tracked as active).${staleNote}`,
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

            const famStr = formatFamilySummary(skill.name);
            const familyNote = famStr
              ? `\n\n**${famStr}**\n_Related skills share triggers — consider loading them too._`
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
            const scoped = getScopedSkills();
            const text = scoped.map(s => {
              const active = activeSkills.has(s.name) ? ' **[ACTIVE]**' : '';
              const desc = (s.description || 'No description').split('\n')[0];
              return `- **${s.name}${active}**: ${desc}`;
            }).join('\n');
            const activeCount = activeSkills.size;
            const scopeNote = workspaceScope ? ` (scoped: ${scoped.length} of ${skills.length})` : '';
            respond(id, {
              content: [{
                type: 'text',
                text: `**${scoped.length} skills${scopeNote}** (${activeCount} active)\n\n${text}\n\n_Call \`get_active_skills\` for lifecycle status._`,
              }],
            });
            break;
          }

          case 'unload_skill': {
            const skillName = args?.name || '';
            if (activeSkills.has(skillName)) {
              activeSkills.delete(skillName);
              const famStr = formatFamilySummary(skillName);
              const familyNote = famStr
                ? `\n_${famStr}. Unload them too if not needed._`
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

          case 'set_workspace': {
            const scope = args?.scope || [];
            if (!Array.isArray(scope) || scope.length === 0) {
              workspaceScope = null;
              respond(id, { content: [{ type: 'text', text: `Workspace reset. All ${skills.length} skills are now discoverable.\n\nUse \`set_workspace\` with specific skill names or triggers to scope down.` }] });
            } else {
              setWorkspaceScope(scope);
              const scoped = getScopedSkills();
              if (workspaceScope === null) {
                respond(id, { content: [{ type: 'text', text: `Workspace reset. All ${scoped.length} skills are now discoverable (none of the names matched).\n\nUse \`set_workspace\` with specific skill names or triggers to scope down.` }] });
              } else {
                respond(id, { content: [{ type: 'text', text: `Workspace scoped to ${scoped.length} skill(s).\n\nOnly these skills are now visible to \`match_skills\` and \`list_skills\`.\nUse \`set_workspace\` with an empty scope to reset.` }] });
              }
            }
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

            const staleSkills = scored.filter(s => s.status === 'stale');
            const staleNames = staleSkills.map(s => s.name);
            if (staleSkills.length > 0 && currentTaskContext.description) {
              output += `\n\n**Unload recommendation:** ${staleNames.join(', ')} — these skills have low relevance to the current task context.`;
              output += `\nCall \`unload_skill("name")\` or \`set_task_context\` with your current task description.`;
            } else if (!currentTaskContext.description) {
              output += `\n\nSet a task context with \`set_task_context\` to get relevance scores and unload recommendations.`;
            }
            respond(id, { content: [{ type: 'text', text: output }] });
            break;
          }

          case 'import_repo': {
            const url = args?.url || '';
            if (!url) {
              respond(id, { content: [{ type: 'text', text: 'Please provide a GitHub repo URL (e.g., `import_repo({ url: "https://github.com/alirezarezvani/claude-skills" })`).' }] });
              break;
            }
            if (!isValidGitUrl(url)) {
              respond(id, { content: [{ type: 'text', text: `Invalid or unsafe git URL. Only http/https/ssh/git protocols are allowed. Provided: ${url.slice(0, 200)}` }] });
              break;
            }
            const result = importRepo(url);
            const origins = [...importedRepos.keys()];
            respond(id, {
              content: [{ type: 'text', text: `**Import Result:** ${result}\n\n**Imported repos:** ${origins.join(', ') || 'none'}\n**Total skills:** ${skills.length}\n**Commands:** ${commandRegistry.size}` }],
            });
            break;
          }

          case 'list_commands': {
            if (commandRegistry.size === 0) {
              respond(id, { content: [{ type: 'text', text: 'No custom commands found. Import a repo with `.claude/commands/` to add commands.' }] });
              break;
            }
            const cmdText = [...commandRegistry.entries()].map(([name, meta]) => {
              return `- **/${name}**: ${meta.description} _(origin: ${meta.origin})_`;
            }).join('\n');
            respond(id, {
              content: [{ type: 'text', text: `**${commandRegistry.size} custom command(s)**\n\n${cmdText}\n\nCommands are loaded from \`.claude/commands/\` directories.` }],
            });
            break;
          }

          case 'set_agent': {
            const agentName = args?.name || '';
            if (!agentName) {
              const current = currentAgent;
              const agents = Object.keys(AGENT_ROUTING).join(', ');
              const msg = 'Current agent: **' + current + '**. Available agents: ' + agents + '. Call set_agent with a name to switch (e.g., set_agent({ name: "cursor" })).';
              respond(id, { content: [{ type: 'text', text: msg }] });
              break;
            }
            const msg = setAgent(agentName);
            const scopedCount = filterSkillsByAgent(skills, currentAgent).length;
            respond(id, {
              content: [{ type: 'text', text: msg + '\n\n' + scopedCount + ' of ' + skills.length + ' skills are compatible with **' + currentAgent + '**.\nUse set_workspace to further scope if needed.' }],
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
