# Agents Guide

## Publishing

Do NOT run `npm publish` directly. Publishing is handled by GitHub CI via git tags.

To release a new version:

1. Bump the version in `package.json`
2. Commit and push to `main`
3. Run `make release` — this tags `v<VERSION>` and pushes the tag, which triggers `.github/workflows/release.yml`

The CI workflow runs `deps:prod` (swaps local file: deps for registry versions from `publish.deps.json`), builds, and publishes to npm + ClawHub.

If a release fails, use `make retry` to delete the tag and re-tag.
