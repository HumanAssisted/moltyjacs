.PHONY: install build test release release-delete-tags retry versions \
	publish-npm publish-clawhub clawhub-sync publish-all help

# Version from package.json (used for release tagging)
VERSION := $(shell grep '"version"' package.json | head -1 | sed 's/.*: *"\(.*\)".*/\1/')

# ============================================================================
# BUILD & TEST
# ============================================================================

install:
	npm install

build:
	npm run build

test:
	npm test

# ============================================================================
# VERSION INFO
# ============================================================================

versions:
	@echo "package.json version: $(VERSION)"

# ============================================================================
# GITHUB CI RELEASE (via git tags)
# ============================================================================
# Tag v* (e.g. v0.3.0) triggers .github/workflows/release.yml (npm + ClawHub).
# Required GitHub Secrets: NPM_TOKEN, CLAWHUB_TOKEN (optional for ClawHub).
# ============================================================================

# Verify tag does not already exist
check-version:
	@echo "moltyjacs version: $(VERSION)"
	@if git tag -l | grep -q "^v$(VERSION)$$"; then \
		echo "ERROR: Tag v$(VERSION) already exists (use 'make retry' to re-tag)"; \
		exit 1; \
	fi
	@echo "✓ Tag v$(VERSION) is available"

# Tag and push to trigger release via GitHub CI
release: check-version
	git tag v$(VERSION)
	git push origin v$(VERSION)
	@echo "Tagged v$(VERSION) - GitHub CI will publish to npm (and ClawHub)"

# Delete release tag for current version (use with caution - for fixing failed releases)
release-delete-tags:
	@echo "Deleting tag v$(VERSION)..."
	-git tag -d v$(VERSION)
	-git push origin --delete v$(VERSION)
	@echo "Deleted tag v$(VERSION)"

# Retry a failed release: delete old tag (local+remote), retag, push
retry:
	@echo "Retrying release for v$(VERSION)..."
	-git tag -d v$(VERSION)
	-git push origin --delete v$(VERSION)
	git tag v$(VERSION)
	git push origin v$(VERSION)
	@echo "✓ Re-tagged v$(VERSION) - GitHub CI will retry npm publish"

# ============================================================================
# OPENCLAW PUBLISHING (manual, no git tag)
# ============================================================================
# Publish to npm and/or OpenClaw registries (ClawHub). Requires local auth.
# ============================================================================

# Publish to npm only (install + build + npm publish; public for unscoped package)
publish-npm: install build
	npm publish --access public

# Publish to ClawHub (OpenClaw plugin registry)
publish-clawhub: install build
	npm run clawhub:publish

# Sync plugin metadata with ClawHub
clawhub-sync:
	npm run clawhub:sync

# Publish to npm and ClawHub
publish-all: install build
	npm publish --access public
	npm run clawhub:publish

# ============================================================================
# HELP
# ============================================================================

help:
	@echo "moltyjacs Makefile"
	@echo ""
	@echo "  make versions   Show version from package.json"
	@echo "  make install    npm install (run first if dependencies missing)"
	@echo "  make build      npm run build"
	@echo "  make test      npm test"
	@echo ""
	@echo "  make release   Tag v<VERSION> and push (CI publishes to npm + ClawHub)"
	@echo "  make retry     Delete v<VERSION> tag, re-tag and push (retry failed release)"
	@echo "  make release-delete-tags   Delete tag v<VERSION> locally and on origin"
	@echo ""
	@echo "  make publish-npm       Build and publish to npm only"
	@echo "  make publish-clawhub   Build and publish to ClawHub (OpenClaw)"
	@echo "  make clawhub-sync      Sync with ClawHub"
	@echo "  make publish-all      Build, publish to npm, then ClawHub"
