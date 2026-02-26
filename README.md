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
- **HAI platform features** - Hello/auth checks, username lifecycle, mailbox/email workflow, key registry lookups, and benchmark orchestration

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

1. Configure exactly one private-key password source (env is the developer default):
   ```bash
   # Option A (recommended for local dev)
   export JACS_PRIVATE_KEY_PASSWORD='use-a-strong-password'

   # Option B (recommended for containers/CI secrets mounts)
   export JACS_PASSWORD_FILE=/run/secrets/jacs_password

   # Option C (CLI convenience, init only)
   # openclaw jacs init --password-file /run/secrets/jacs_password
   ```

2. Initialize JACS with key generation:
   ```bash
   openclaw jacs init
   ```

3. Sign a document:
   ```bash
   openclaw jacs sign document.json
   ```

4. Verify a signed document:
   ```bash
   openclaw jacs verify signed-document.json
   ```

5. Bootstrap trust with another agent (tool flow):
   - Sender runs `jacs_share_public_key` and `jacs_share_agent`
   - Receiver runs `jacs_trust_agent_with_key` with the shared `agentJson` and `publicKeyPem`

### Direct JACS SDK Quick Start (outside this plugin)

For direct `@hai.ai/jacs/client` or `@hai.ai/jacs/simple` usage, first-time quickstart now requires identity (`name` and `domain`):

```ts
import { JacsClient } from "@hai.ai/jacs/client";

const client = await JacsClient.quickstart({
  name: "my-agent",
  domain: "agent.example.com",
  // optional; defaults to pq2025
  algorithm: "pq2025",
});
```

## JACS v0.8.0 Compatibility

moltyjacs v0.8.0 depends on `@hai.ai/jacs` v0.8.0, which uses an **async-first API**. All NAPI operations return Promises by default; sync variants use a `Sync` suffix (e.g., `loadSync` vs `load`). moltyjacs uses the async API for setup (`agent.load()`, `createAgent()`) and the sync API for hot-path operations (`signRequest`, `verifyResponse`) that must run on the V8 thread.

Recent JACS updates relevant to moltyjacs:
- Direct `quickstart()` usage in `@hai.ai/jacs/client` and `@hai.ai/jacs/simple` now requires identity inputs (`name` and `domain`) for first-time agent creation.
- Default algorithm across JACS is `pq2025`.
- Trust/bootstrap surfaces now include `trustAgentWithKey` / `trust_agent_with_key`, `sharePublicKey` / `share_public_key`, and `shareAgent` / `share_agent`.

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
| `jacs_verify_standalone` | Verify any signed document without JACS init (no agent required) |
| `jacs_verify_auto` | Verify any document (auto-fetches keys, supports trust levels) |
| `jacs_verify_dns` | Verify agent identity via DNS TXT record |
| `jacs_fetch_pubkey` | Fetch another agent's public key |
| `jacs_verify_with_key` | Verify with a specific public key |
| `jacs_hash` | Hash content |
| `jacs_identity` | Get your identity info |
| `jacs_share_public_key` | Share your current public key PEM for trust bootstrap |
| `jacs_share_agent` | Share your self-signed agent document for trust establishment |
| `jacs_trust_agent_with_key` | Trust an agent document using an explicit public key PEM |
| `jacs_audit` | Run read-only JACS security audit |

### Discovery and trust

| Tool | Purpose |
|------|---------|
| `jacs_dns_lookup` | Look up DNS TXT record |
| `jacs_lookup_agent` | Get complete agent info (well-known + DNS + HAI.ai) |
| `jacs_verify_hai_registration` | Verify HAI.ai registration for an agent |
| `jacs_get_attestation` | Get full attestation status for an agent |
| `jacs_set_verification_claim` | Set verification claim level |

### HAI platform integration

| Tool | Purpose |
|------|---------|
| `jacs_hai_hello` | Call HAI hello endpoint with JACS auth |
| `jacs_hai_test_connection` | Test HAI connectivity without mutating state |
| `jacs_hai_register` | Register this agent with HAI |
| `jacs_hai_check_username` | Check HAI username availability |
| `jacs_hai_claim_username` | Claim username for an agent |
| `jacs_hai_update_username` | Rename claimed username |
| `jacs_hai_delete_username` | Release claimed username |
| `jacs_hai_verify_document` | Verify signed document via HAI public verifier |
| `jacs_hai_get_verification` | Get advanced verification/badge by agent ID |
| `jacs_hai_verify_agent_document` | Run advanced verification using an agent document |
| `jacs_hai_fetch_remote_key` | Fetch remote key from HAI key registry |
| `jacs_hai_verify_agent` | Multi-level agent verification (signature + DNS + HAI) |
| `jacs_hai_send_email` | Send email from this agent mailbox |
| `jacs_hai_list_messages` | List mailbox messages |
| `jacs_hai_get_message` | Retrieve one mailbox message by ID |
| `jacs_hai_mark_message_read` | Mark message as read |
| `jacs_hai_mark_message_unread` | Mark message as unread |
| `jacs_hai_delete_message` | Delete mailbox message |
| `jacs_hai_search_messages` | Search mailbox with filters |
| `jacs_hai_get_unread_count` | Get unread mailbox count |
| `jacs_hai_reply` | Reply to a message ID |
| `jacs_hai_get_email_status` | Get mailbox status/limits |
| `jacs_hai_free_chaotic_run` | Run free benchmark tier |
| `jacs_hai_dns_certified_run` | Run DNS-certified benchmark flow (returns checkout URL when pending) |
| `jacs_hai_submit_response` | Submit benchmark job response |
| `jacs_hai_benchmark_run` | Run legacy benchmark endpoint by name/tier |

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
| `jacs_start_conversation` | Create the first signed message payload in a new thread |
| `jacs_send_message` | Create a signed message payload in an existing thread |

## MCP and Message Transport

`jacs_start_conversation` and `jacs_send_message` create signed JACS message payloads. They do **not** perform delivery/transport by themselves.

Use this pattern for agent-to-agent messaging:

1. Create/sign payload (`jacs_start_conversation` or `jacs_send_message`)
2. Deliver the returned signed JSON over your chosen channel (MCP, HTTP, queue, chat bridge, etc.)
3. Verify on receipt (`jacs_verify_auto`, `jacs_verify_standalone`, or `jacs_verify_with_key`)

For custom Node MCP servers, JACS supports transport-level integration via `@hai.ai/jacs/mcp`:

- `createJACSTransportProxy(...)` for automatic signing/verification at transport boundaries
- `registerJacsTools(...)` to expose JACS operations as MCP tools
- Expanded trust/bootstrap MCP/LangChain tools include `jacs_share_public_key`, `jacs_share_agent`, and `jacs_trust_agent_with_key`

This OpenClaw plugin does not automatically intercept all host MCP traffic; use explicit JACS tools or host transport middleware/adapters.

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
  "agentName": "My Agent",
  "agentDescription": "Description",
  "agentDomain": "agent.example.com"
}
```

`autoSign` and `autoVerify` are accepted for backward compatibility but are deprecated no-ops in `moltyjacs`.

`agentId` is set automatically when you run `openclaw jacs init` and is not edited in the config file.

JACS key filenames are read from `jacs.config.json`:
- `jacs_agent_public_key_filename` (default: `jacs.public.pem`)
- `jacs_agent_private_key_filename` (default: `jacs.private.pem.enc`)

### Environment variables

| Variable | Purpose |
|----------|---------|
| `JACS_PRIVATE_KEY_PASSWORD` | Password for the encrypted private key; developer-default source for local/headless usage. |
| `JACS_PASSWORD_FILE` | Path to a file containing the private-key password (newline allowed at end of file). |
| `HAI_API_KEY` | Used by `openclaw jacs register`; can be passed via `--api-key` instead. |
| `HAI_API_URL` | Optional override for HAI API base URL (default `https://api.hai.ai`). |

Configure exactly one password source. If multiple password sources are set, initialization fails closed to avoid ambiguity.
On Unix-like systems, password files must be owner-only (for example `chmod 600 /run/secrets/jacs_password`).

### Key Algorithms

- `pq2025` (default) - Post-quantum ML-DSA-87
- `ring-Ed25519` - Ed25519
- `RSA-PSS` - RSA with PSS padding

## Cross-Language Compatibility

Documents signed by moltyjacs (Node.js) can be verified by Rust or Python agents, and vice versa. Cross-language interop is tested on every commit with Ed25519 and post-quantum (ML-DSA-87) algorithms. See the [JACS cross-language tests](https://github.com/HumanAssisted/JACS/tree/main/jacs/tests/cross_language) for details.

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
