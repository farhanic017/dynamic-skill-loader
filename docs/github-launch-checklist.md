# GitHub Launch Checklist

Use this after merging the SEO cleanup. These actions cannot be fully configured from files in the repository, but they strongly affect GitHub discovery and star conversion.

## Repository About Section

Set the repository description to:

```text
Universal MCP skill dispatcher for AI coding agents. Load Claude Code, OpenCode, Cursor, Gemini, command, and GitHub-hosted skills on demand.
```

Set the website to:

```text
https://github.com/farhanic017/dynamic-skill-loader#readme
```

Set topics:

```text
mcp
mcp-server
model-context-protocol
ai-agent
ai-coding
claude-code
opencode
cursor-ai
codex
gemini-cli
skill-loader
prompt-engineering
context-management
developer-tools
agent-tools
```

## Launch Post

Short version:

```text
I built Dynamic Skill Loader: a zero-dependency MCP server that loads AI coding skills on demand instead of stuffing every instruction into context.

It supports Claude Code, OpenCode, Cursor, Gemini-style markdown, commands, external GitHub skill repos, agent routing, active-skill lifecycle tracking, and 166 parser/security tests.

Repo: https://github.com/farhanic017/dynamic-skill-loader
```

Long version:

```text
Dynamic Skill Loader is a universal MCP skill dispatcher for AI coding agents.

The problem: Claude Code, OpenCode, Cursor, Codex, Gemini CLI, and similar tools get overloaded when every rule, framework guide, and workflow note is always in context.

The fix: index skills once, match by task, load only the relevant instruction files, track active skills, and unload stale ones when the task changes.

Highlights:
- 5 skill formats: YAML, plain markdown, Gemini-style markdown, .claude/commands, Claude Code skills
- 14 agent routing profiles
- external GitHub repo import
- nested skill directory scanning
- command registry
- origin filtering
- security hardening around git import, path traversal, YAML parsing, MCP messages, and token redaction
- 166 aggressive tests

Repo: https://github.com/farhanic017/dynamic-skill-loader
```

## Launch Targets

- GitHub README and topics.
- Hacker News "Show HN".
- Reddit: r/ClaudeAI, r/LocalLLaMA, r/programming, r/OpenSource.
- X/Twitter with a demo GIF.
- LinkedIn developer post.
- Discord or community channels for Claude Code, OpenCode, Cursor, MCP, and agent tooling.

## Conversion Checklist

- Pin the repo on the GitHub profile.
- Enable Discussions.
- Confirm Actions shows green tests.
- Add a GitHub social preview image in repository settings.
- Open 2-4 beginner-friendly issues after launch.
- Respond quickly to issues and comments in the first 48 hours.
