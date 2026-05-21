---
name: skill-dispatcher
description: >
  Loads AI coding skills on-demand by matching trigger keywords against your
  task. 4 MCP tools: match_skills, get_skill, list_skills, unload_skill.
  Zero dependencies. Works with any model (local or cloud) via MCP stdio.
triggers:
  - skill-dispatcher
  - skill loader
  - dynamic skill
  - on-demand skills
  - trigger matching
  - install skill-dispatcher
  - setup skill-dispatcher
---

# Dynamic Skill Loader for OpenCode

An MCP server that loads AI coding skills **on-demand** by matching trigger
keywords against your task. Works with any MCP-compatible client.

## Instant Install (one command)

Drop this URL into your AI assistant:

```
https://github.com/farhanic017/dynamic-skill-loader-for-opencode
```

Your AI will clone, install, and configure everything automatically by
following these steps:

### 1. Auto-install (recommended)

```bash
git clone https://github.com/farhanic017/dynamic-skill-loader-for-opencode.git
cd dynamic-skill-loader-for-opencode
python install.py
```

The installer detects your AI client (opencode, Claude Desktop, Cursor),
configures the MCP server, and creates sample skills — all in one step.

### 2. Manual install (if not using the auto-installer)

#### Install globally

```bash
npm install -g .
```

Or use directly with npx each time:

```bash
npx skill-dispatcher --skills-dir ./my-skills
```

#### Add MCP server to your config

**For opencode** (`opencode.jsonc`):

```jsonc
{
  "instructions": ["path/to/instructions.md"],
  "mcp": {
    "skill-dispatcher": {
      "type": "local",
      "command": ["node", "/full/path/to/index.mjs", "--skills-dir", "/path/to/skills"],
      "enabled": true
    }
  }
}
```

Create an `instructions.md` file:

```markdown
## Skills
Skills are NOT pre-loaded. At the start of every task, call `match_skills`
with your task description to load relevant skills on-demand.
```

**For Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "skill-dispatcher": {
      "command": "node",
      "args": ["/full/path/to/index.mjs", "--skills-dir", "/path/to/skills"]
    }
  }
}
```

**For Cursor**: add in MCP server settings:

```
Name: skill-dispatcher
Type: command
Command: node /full/path/to/index.mjs --skills-dir /path/to/skills
```

### 3. Point it at your skills

Each skill is a directory with a `SKILL.md` file containing YAML frontmatter:

```markdown
---
name: gsap-core
description: Core GSAP animation library
triggers:
  - "gsap"
  - "web animation"
---
# gsap-core
Full skill instructions here...
```

## How it works

```
You: "build a hero section with GSAP animations"
       │
       ▼
match_skills("gsap hero section")
       │
       ▼
Returns: gsap-core, gsap-scrolltrigger, frontend-design
       │
       ▼
You call get_skill("gsap-core") → full instructions loaded
```

## 4 MCP Tools

| Tool | What it does |
|------|-------------|
| `match_skills(query)` | Matches your task against skill triggers (fuzzy, case-insensitive) |
| `get_skill(name)` | Loads the full SKILL.md content of a matched skill |
| `list_skills()` | Browses all available skills and their trigger keywords |
| `unload_skill(name)` | Marks a skill as no longer needed |

## CLI modes

```bash
# MCP server (default)
node index.mjs --skills-dir ./skills

# List all skills
node index.mjs --skills-dir ./skills --list

# Match by keywords
node index.mjs --skills-dir ./skills --match "animation gsap"

# Get full skill
node index.mjs --skills-dir ./skills --get gsap-core
```

## Model compatibility

Works with **any model** — local (Ollama, LM Studio, llama.cpp) or cloud
(OpenAI, Anthropic, Google, OpenRouter). The MCP client handles all
communication; the dispatcher just returns JSON-RPC responses.

## Copyright & License

**Copyright (c) 2026 Farhan Dhrubo** — All rights reserved.
Licensed under **GNU General Public License v3.0**.
See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for full terms.

**You may NOT** remove copyright notices, re-distribute as your own work,
or sell without attribution. All files contain embedded copyright headers.
