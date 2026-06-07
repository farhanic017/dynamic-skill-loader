# Security Policy

Dynamic Skill Loader reads local instruction files and can import public skill repositories. Please report security issues responsibly.

## Supported Versions

The `main` branch receives security fixes.

## Reporting a Vulnerability

Open a private security advisory on GitHub if available, or contact the maintainer through the GitHub profile listed in this repository.

Please include:

- A clear impact statement.
- Reproduction steps.
- A minimal malicious skill file, command file, repo URL, or MCP message when possible.
- Your recommended fix, if you have one.

## Security Boundaries

Security-sensitive areas include:

- Git URL validation and import behavior.
- Path traversal protections around skill file loading.
- YAML parsing and prototype pollution checks.
- MCP JSON-RPC message validation.
- stdout/stderr separation for MCP server mode.
- Token or credential redaction in errors.
