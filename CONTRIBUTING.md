# Contributing to Dynamic Skill Loader

Thanks for improving Dynamic Skill Loader. The most useful contributions are bug reports with reproduction steps, parser edge cases, new skill-format examples, security hardening, and compatibility notes for AI coding agents.

## Local Setup

```bash
git clone https://github.com/farhanic017/dynamic-skill-loader.git
cd dynamic-skill-loader
npm test
```

There are no runtime npm dependencies. Node.js 18 or newer is required.

## Development Workflow

1. Create a focused branch.
2. Keep runtime changes small and covered by tests.
3. Run `npm test` before opening a pull request.
4. Update `README.md` when behavior, flags, formats, or agent support changes.

## Good Issues

Please include:

- Operating system and Node.js version.
- The exact command or MCP request.
- A minimal skill file or repo structure that reproduces the problem.
- Expected behavior and actual behavior.

## Pull Request Checklist

- Tests pass with `npm test`.
- New parser behavior has at least one test case.
- Security-sensitive changes avoid shell execution and path traversal.
- Docs mention any new CLI flag, MCP tool, skill format, or agent behavior.
