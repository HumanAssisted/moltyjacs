# moltyjacs

**Sign it. Prove it.** JACS cryptographic provenance plugin for OpenClaw.

[Which integration should I use?](https://humanassisted.github.io/JACS/getting-started/decision-tree.html) | [Full JACS documentation](https://humanassisted.github.io/JACS/)

## Why use JACS?

**So your OpenClaw agent can be trusted -- and can trust others.** JACS is like **DKIM for agents**: you sign what you send; recipients verify the signature against your public key. It is **decentralized** -- no single authority. You publish your key (DNS, optional HAI.ai); others fetch and verify. Without it, nothing you say or do can be proven. With JACS you sign messages, commitments, and state; anyone with your public key can verify they came from you and were not altered. You get proof of origin, integrity, and accountability. Other agents can discover your key via DNS or HAI.ai and verify your documents; you verify theirs with `jacs_verify_auto` and optional trust levels (domain, attested). Keys and signed payloads stay local; you send the same signed JSON over any channel (WhatsApp, HTTP, MCP). **Use it whenever another agent or human needs to trust that you said or agreed to something.**

## Overview

moltyjacs adds post-quantum cryptographic signatures to your OpenClaw agent communications. It enables:

- **Document signing** - Sign any document with your agent's cryptographic identity
- **Verification** - Verify documents from other agents
- **Agent discovery** - Publish and discover agents via well-known endpoints and DNS
- **Multi-party agreements** - Create and manage agreements requiring multiple signatures
- **Agent state** - Sign and track memory, skills, plans, configs, and hooks
- **Commitments** - Track agreements and obligations between agents with lifecycle management
- **Todo lists** - Private, signed work tracking with goals and tasks
- **Conversations** - Signed message threads between agents

## Installation

### From npm

```bash
npm install moltyjacs
```

### From ClawHub

```bash
npx clawhub@latest install moltyjacs
```

### As OpenClaw Plugin

```bash
openclaw plugins install moltyjacs
```

### From GitHub

```bash
openclaw plugins install https://github.com/HumanAssisted/moltyjacs
```

## Quick Start

1. Initialize JACS with key generation:
   ```bash
   openclaw jacs init
   ```

2. Sign a document:
   ```bash
   openclaw jacs sign document.json
   ```

3. Verify a signed document:
   ```bash
   openclaw jacs verify signed-document.json
   ```

## JACS v0.8.0 Compatibility

moltyjacs v0.8.0 depends on `@hai.ai/jacs` v0.8.0, which uses an **async-first API**. All NAPI operations return Promises by default; sync variants use a `Sync` suffix (e.g., `loadSync` vs `load`). moltyjacs uses the async API for setup (`agent.load()`, `createAgent()`) and the sync API for hot-path operations (`signRequest`, `verifyResponse`) that must run on the V8 thread.

## CLI Commands

| Command | Description |
|---------|-------------|
| `openclaw jacs init` | Initialize JACS with key generation |
| `openclaw jacs status` | Show agent status and configuration |
| `openclaw jacs sign <file>` | Sign a document file |
| `openclaw jacs verify <file>` | Verify a signed document |
| `openclaw jacs hash <string>` | Hash a string |
| `openclaw jacs dns-record <domain>` | Generate DNS TXT record for discovery |
| `openclaw jacs lookup <domain>` | Look up another agent's info |
| `openclaw jacs register [--api-key <key>] [--preview]` | Register this agent with HAI.ai for attested trust level |
| `openclaw jacs attestation [domain]` | Check attestation status for this agent or another by domain |
| `openclaw jacs claim [level]` | Set or view verification claim (includes DNS/HAI proof details) |

## HAI.ai registration

To get an attested trust level, register your agent with HAI.ai once: run `openclaw jacs register`. You must set the `HAI_API_KEY` environment variable or pass `--api-key`. Use `--preview` to see what would be sent without registering. After registration, use `openclaw jacs attestation` to check your (or another agent's) attestation status, and `openclaw jacs claim <level>` to set or view your verification claim. `verified` now requires DNS TXT hash verification (domain configured + published hash matches your public key). See [Configuration](#configuration) and [Security](#security) for related options.

## Agent Tools

When used with an AI agent, these tools are available:

### Core signing and verification

| Tool | Purpose |
|------|---------|
| `jacs_sign` | Sign a document (returns signed doc; when small enough, includes `verification_url` for sharing) |
| `jacs_verify_link` | Get a shareable verification URL for a signed document (for https://hai.ai/jacs/verify) |
| `jacs_verify` | Verify a self-signed document |
| `jacs_verify_auto` | Verify any document (auto-fetches keys, supports trust levels) |
| `jacs_fetch_pubkey` | Fetch another agent's public key |
| `jacs_verify_with_key` | Verify with a specific public key |
| `jacs_hash` | Hash content |
| `jacs_identity` | Get your identity info |
| `jacs_audit` | Run read-only JACS security audit |

### Discovery and trust

| Tool | Purpose |
|------|---------|
| `jacs_dns_lookup` | Look up DNS TXT record |
| `jacs_lookup_agent` | Get complete agent info (well-known + DNS + HAI.ai) |
| `jacs_verify_hai_registration` | Verify HAI.ai registration for an agent |
| `jacs_get_attestation` | Get full attestation status for an agent |
| `jacs_set_verification_claim` | Set verification claim level |

### Agreements

| Tool | Purpose |
|------|---------|
| `jacs_create_agreement` | Create multi-party agreement |
| `jacs_sign_agreement` | Sign an agreement |
| `jacs_check_agreement` | Check agreement status |

### Agent state

| Tool | Purpose |
|------|---------|
| `jacs_create_agentstate` | Create signed agent state (memory, skill, plan, config, hook) |
| `jacs_sign_file_as_state` | Sign a file as agent state with path reference and hash |
| `jacs_verify_agentstate` | Verify an agent state document |

### Commitments

| Tool | Purpose |
|------|---------|
| `jacs_create_commitment` | Create a signed commitment |
| `jacs_update_commitment` | Update commitment status or fields |
| `jacs_dispute_commitment` | Dispute a commitment with a reason |
| `jacs_revoke_commitment` | Revoke a commitment with a reason |

### Todo lists

| Tool | Purpose |
|------|---------|
| `jacs_create_todo` | Create a signed todo list |
| `jacs_add_todo_item` | Add an item to a todo list |
| `jacs_update_todo_item` | Update a todo item |

### Conversations

| Tool | Purpose |
|------|---------|
| `jacs_start_conversation` | Start a new signed conversation thread |
| `jacs_send_message` | Send a signed message in a thread |

## Well-Known Endpoints

Your agent exposes these endpoints:

- `GET /.well-known/jacs-pubkey.json` - Your public key
- `GET /jacs/status` - Health check
- `POST /jacs/verify` - Public verification (this agent)
- `GET /jacs/attestation` - Full attestation status (trust level, HAI registration, DNS verification)

**Recipients** can verify any JACS document at [https://hai.ai/jacs/verify](https://hai.ai/jacs/verify) (paste a link with `?s=` or the base64). Use `jacs_verify_link` or the `verification_url` from `jacs_sign` when sharing signed content with humans.

Signing is internal only; no external sign endpoint is exposed (to protect the agent's identity).

## Configuration

Configure via `openclaw.plugin.json`:

```json
{
  "keyAlgorithm": "pq2025",
  "autoSign": false,
  "autoVerify": true,
  "agentName": "My Agent",
  "agentDescription": "Description",
  "agentDomain": "agent.example.com"
}
```

`agentId` is set automatically when you run `openclaw jacs init` and is not edited in the config file.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `JACS_PRIVATE_KEY_PASSWORD` | Password for the encrypted private key; required for signing when not prompted (e.g. headless/CI). |
| `HAI_API_KEY` | Used by `openclaw jacs register`; can be passed via `--api-key` instead. |
| `HAI_API_URL` | Optional override for HAI API base URL (default `https://api.hai.ai`). |

The key password is generated at `openclaw jacs init` and must be stored securely.

### Key Algorithms

- `pq2025` (default) - Post-quantum ML-DSA-87
- `pq-dilithium` - Dilithium
- `ring-Ed25519` - Ed25519
- `RSA-PSS` - RSA with PSS padding

## Security

- Private keys are encrypted with AES-256-GCM
- Key derivation uses PBKDF2
- Default algorithm (pq2025) provides quantum resistance
- DNS records enable DNSSEC-backed identity verification

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Run unit tests (uses mocked JACS module)
npm test

# Run integration tests (requires real @hai.ai/jacs native binary)
npm run test:integration

# Test local installation
openclaw plugins install . --link
openclaw plugins list
```

## Publishing

CI publishes on push of a tag `v*` (e.g. `v0.8.0`). **Publish [@hai.ai/jacs](https://www.npmjs.com/package/@hai.ai/jacs) from the [JACS](https://github.com/HumanAssisted/JACS) repo first** (tag `npm/v*`), then tag and push moltyjacs so the build can resolve the dependency.

### To npm

```bash
npm run build
npm publish
```

### To ClawHub

```bash
npm run clawhub:publish
```

Or publish to both npm and ClawHub:

```bash
npm run publish:all
```

## License

MIT License - see [LICENSE](LICENSE)

## Links
- [HAI.AI](https://hai.ai)
- [JACS Documentation](https://humanassisted.github.io/JACS/)
- [Decision Tree](https://humanassisted.github.io/JACS/getting-started/decision-tree.html)
- [OpenClaw](https://docs.openclaw.ai)
- [ClawHub](https://www.clawhub.com)
- [GitHub](https://github.com/HumanAssisted/moltyjacs)
