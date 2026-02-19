t # Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-02-11

### Added
- Added OpenClaw tool registration compatibility wrapper that exposes both `execute` (modern API) and `handler` (legacy compatibility).
- Added explicit `optional` classification for side-effecting tools to align with current OpenClaw tool guidance.
- Added DNS parser test coverage for legacy hash aliases (`pkh`, `publicKeyHash`) in addition to canonical `jac_public_key_hash`.
- Added README and skill guidance for MCP-vs-transport usage patterns.

### Changed
- Migrated all tool registrations to shared OpenClaw registration wrapper.
- Updated conversation tool descriptions to clarify they create signed payloads and do not perform message transport.
- Aligned plugin and marketplace metadata versions to `0.8.0`.
- Updated marketplace tool manifest to include `jacs_verify_standalone` and `jacs_verify_dns`.

### Fixed
- Fixed `jacs_verify_dns` to parse canonical JACS DNS TXT field `jac_public_key_hash` and preserve compatibility aliases.
- Removed silent config mismatch by marking `autoSign`/`autoVerify` as deprecated no-op behavior in docs/schema, and logging runtime warnings when configured.

### Test
- Updated test harness to support invoking tools through either `handler` or `execute`.
- Added tests for OpenClaw `optional` registration behavior and updated tool inventory assertions.
