# Changelog

## 3.0.0

- Added multi-format skill parsing for YAML, plain markdown, Gemini-style markdown, command files, and Claude Code skills.
- Added routing for 14 AI coding agents.
- Added external GitHub repository import.
- Added nested skill directory scanning.
- Added command registry support for `.claude/commands/*.md`.
- Added cross-repo origin tracking and `--origin` filtering.
- Expanded YAML parsing and hardening.
- Added security checks for Git URL validation, path traversal, prototype pollution, MCP message structure, and input limits.
- Expanded aggressive test coverage to 166 passing tests.
