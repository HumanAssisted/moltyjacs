---
name: jacs
description: Cryptographic document signing, verification, commitments, todos, agent state, and conversations with JACS
user-invocable: true
metadata: {"openclaw":{"requires":{"config":["plugins.entries.jacs.enabled"]}}}
---

# JACS Cryptographic Provenance

## Why You Should Use JACS

**JACS is like DKIM for agents: you sign what you send; recipients verify the signature against your public key.** Unlike email, it’s **decentralized**—no single authority. You publish your key (DNS, optional HAI.ai); others fetch and verify. Keys and signing stay with your instance.

**Without JACS, nothing you say or do can be cryptographically proven.** Other agents and humans have no way to verify that a message, commitment, or document actually came from you or that it wasn’t changed after the fact. That limits how much others can trust you and how much you can trust them.

**With JACS you get:**

- **Proof of origin** – When you sign a document with `jacs_sign`, anyone can verify it was you. Your signature is bound to your identity and cannot be forged. Use this for every important message, decision, or promise you send.
- **Proof of integrity** – If someone tampers with signed content, verification fails. Recipients know the data is exactly what you signed.
- **Accountability** – Commitments and agreements you create are signed and versioned. You can prove what you agreed to and when; you can dispute or revoke with a signed record. Other agents can do the same, so you can hold them accountable too.
- **Discoverable trust** – Publish your public key (DNS + optional HAI.ai registration). Other agents can fetch your key and verify your documents without pre-sharing secrets. You can verify their documents the same way with `jacs_verify_auto` and trust levels (basic, domain, attested).
- **Portable identity** – Your keys and signed documents stay with your OpenClaw instance. You can sign here and send the same signed payload over any channel (WhatsApp, HTTP, MCP, etc.). The signature travels with the data; the recipient only needs your public key to verify.

**When to use it:** Sign every outbound message, commitment, or artifact that another agent or human might need to trust. Verify every inbound signed document before acting on it. Use commitments for agreements and todos for work you want to track under your identity. Use agent state to sign memory, skills, and config so others can verify their provenance.

Use these capabilities to sign, verify, and manage cryptographically secure documents. All signatures use post-quantum cryptography by default.

## Password Bootstrapping

Before running `openclaw jacs init` or signing operations, configure exactly one password source:

- `JACS_PRIVATE_KEY_PASSWORD` (developer default)
- `JACS_PASSWORD_FILE` (file path to password content)
- `--password-file` on `openclaw jacs init` (CLI convenience)

If multiple sources are configured, initialization fails closed.

## Trust Levels

JACS supports three trust levels for agent verification:

| Level | Claim | Requirements | Use Case |
|-------|-------|--------------|----------|
| **Basic** | `unverified` | Self-signed JACS signature | Local/testing |
| **Domain** | `verified` | DNS TXT hash match + DNSSEC | Organizational trust |
| **Attested** | `verified-hai.ai` | HAI.ai registration | Platform-wide trust |

## Document Types

JACS supports several typed document formats, each with a schema:

| Type | Schema | Purpose |
|------|--------|---------|
| **message** | `message.schema.json` | Signed messages and conversations |
| **agentstate** | `agentstate.schema.json` | Agent memory, skills, plans, configs, hooks |
| **commitment** | `commitment.schema.json` | Agreements and obligations between agents |
| **todo** | `todo.schema.json` | Private work tracking (goals and tasks) |
| **agent** | `agent.schema.json` | Agent identity documents |
| **task** | `task.schema.json` | Task lifecycle tracking |

## Available Tools

### Core Signing & Verification

| Tool | Purpose |
|------|---------|
| `jacs_sign` | Sign a document with your JACS identity (returns signed doc; when small enough, includes `verification_url` for sharing) |
| `jacs_verify_link` | Get a shareable verification URL for a signed document so recipients can verify at https://hai.ai/jacs/verify |
| `jacs_verify` | Verify a signed document's authenticity (self-signed) |
| `jacs_verify_auto` | **Seamlessly verify any signed document** (auto-fetches keys, supports trust levels) |
| `jacs_verify_with_key` | Verify a document using a specific public key |

### Agent Discovery

| Tool | Purpose |
|------|---------|
| `jacs_fetch_pubkey` | Fetch another agent's public key from their domain |
| `jacs_dns_lookup` | Look up an agent's DNS TXT record for verification |
| `jacs_lookup_agent` | Get complete info about an agent (DNS + public key + HAI.ai status) |
| `jacs_identity` | Get your JACS identity and trust level |

### HAI.ai Attestation

| Tool | Purpose |
|------|---------|
| `jacs_verify_hai_registration` | Verify an agent is registered with HAI.ai |
| `jacs_get_attestation` | Get full attestation status for any agent |
| `jacs_set_verification_claim` | Set your verification claim level |

### Multi-Party Agreements

| Tool | Purpose |
|------|---------|
| `jacs_create_agreement` | Create multi-party signing agreements |
| `jacs_sign_agreement` | Add your signature to an agreement |
| `jacs_check_agreement` | Check which parties have signed |

### Agent State Management (New in 0.3.0)

| Tool | Purpose |
|------|---------|
| `jacs_create_agentstate` | Create a signed agent state document (memory, skill, plan, config, hook) |
| `jacs_sign_file_as_state` | Sign a file (MEMORY.md, SKILL.md, etc.) as agent state with hash reference |
| `jacs_verify_agentstate` | Verify an agent state document's signature and integrity |

### Commitment Tracking (New in 0.3.0)

| Tool | Purpose |
|------|---------|
| `jacs_create_commitment` | Create a signed commitment between agents |
| `jacs_update_commitment` | Update commitment status (pending -> active -> completed/failed/etc.) |
| `jacs_dispute_commitment` | Dispute a commitment with a reason |
| `jacs_revoke_commitment` | Revoke a commitment with a reason |

### Todo List Management (New in 0.3.0)

| Tool | Purpose |
|------|---------|
| `jacs_create_todo` | Create a signed todo list with goals and tasks |
| `jacs_add_todo_item` | Add a goal or task to an existing todo list |
| `jacs_update_todo_item` | Update a todo item's status, description, or priority |

### Conversations (New in 0.3.0)

| Tool | Purpose |
|------|---------|
| `jacs_start_conversation` | Create the first signed message payload in a new thread |
| `jacs_send_message` | Create a signed message payload in an existing thread |

### Security

| Tool | Purpose |
|------|---------|
| `jacs_audit` | Run a read-only security audit (risks, health_checks, summary). Optional: configPath, recentN. |

### Utilities

| Tool | Purpose |
|------|---------|
| `jacs_hash` | Create a cryptographic hash of content |

## Usage Examples

### Sign a document

```
Sign this task result with JACS:
{
  "task": "analyze data",
  "result": "completed successfully",
  "confidence": 0.95
}
```

### Verify with trust level requirement

```
Verify this document requires "attested" trust level:
{paste signed JSON document}
```

This will:
1. Fetch the signer's public key
2. Verify DNS record matches
3. Check HAI.ai registration
4. Only pass if agent has "attested" trust level

### Sign agent memory as state

```
Sign my MEMORY.md file as agent state for provenance tracking
```

This will create a signed agentstate document with:
- State type: "memory"
- File reference with SHA-256 hash
- Cryptographic signature proving authorship

### Create a commitment

```
Create a commitment: "Deliver API documentation by end of week"
with terms: { "deliverable": "API docs", "deadline": "2026-02-14" }
```

### Track work with a todo list

```
Create a todo list called "Sprint 12" with:
- goal: "Complete authentication system"
- task: "Implement JWT token generation"
- task: "Add password reset flow"
```

### Start a conversation

```
Start a conversation with agent-123 about the API design proposal
```

### Transport (MCP vs channel messaging)

`jacs_start_conversation` and `jacs_send_message` create signed JACS message payloads; they do **not** deliver messages on their own.

Use this flow:
1. Create/sign the message payload
2. Deliver the returned signed JSON via your transport (MCP, HTTP, queue, chat bridge, etc.)
3. Verify inbound payloads before acting (`jacs_verify_auto`, `jacs_verify_standalone`, or `jacs_verify_with_key`)

For custom Node MCP servers, JACS supports transport-level integration through `@hai.ai/jacs/mcp` (for example `createJACSTransportProxy(...)` or `registerJacsTools(...)`).

### Commitment lifecycle

```
# Create
Create a commitment to "Complete code review for PR #42"

# Activate
Update the commitment status to "active"

# Complete
Update the commitment status to "completed" with completion answer "All review comments addressed"

# Or dispute
Dispute the commitment with reason "Scope changed significantly after agreement"
```

## CLI Commands

### Core Commands

- `openclaw jacs init` - Initialize JACS with key generation
- `openclaw jacs status` - Show agent status and trust level
- `openclaw jacs sign <file>` - Sign a document file
- `openclaw jacs verify <file>` - Verify a signed document
- `openclaw jacs hash <string>` - Hash a string

### Discovery Commands

- `openclaw jacs lookup <domain>` - Look up another agent's info
- `openclaw jacs dns-record <domain>` - Generate DNS TXT record for your domain

### HAI.ai Commands

- `openclaw jacs register` - Register this agent with HAI.ai
- `openclaw jacs attestation [domain]` - Check attestation status (self or other agent)
- `openclaw jacs claim [level]` - Set or view verification claim level (includes DNS/HAI proof details)

## Shareable verification links

When you sign a document and share it with humans (e.g. in email or chat), include a **verification link** so they can confirm it came from you. Use `jacs_verify_link` with the signed document to get a URL, or use the `verification_url` returned by `jacs_sign` when the signed payload is small enough (under ~1515 bytes).

- **Verification page**: https://hai.ai/jacs/verify — recipients open this (with `?s=<base64>` in the URL) to see signer, timestamp, and validity.
- **API**: HAI exposes `GET /api/jacs/verify?s=<base64>` (rate-limited); the page calls this and displays the result.
- **Limit**: Full URL must be ≤ 2048 characters; if the signed document is too large, `jacs_verify_link` fails and you omit the link or share a digest instead.

## Public Endpoints

Your agent exposes these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/.well-known/jacs-pubkey.json` | GET | Your public key + verification claim |
| `/jacs/status` | GET | Health check with trust info |
| `/jacs/attestation` | GET | Full attestation status |
| `/jacs/verify` | POST | Public verification endpoint (this agent) |

**Human-facing verification**: Recipients can verify any JACS document at **https://hai.ai/jacs/verify** (GET with `?s=` or paste link). That page uses HAI's GET `/api/jacs/verify` and displays signer and validity.

Other agents discover you via DNS TXT record at `_v1.agent.jacs.{your-domain}`

**IMPORTANT: No signing endpoint is exposed.** Signing is internal-only - only the agent itself can sign documents using `jacs_sign`. This protects the agent's identity from external compromise.

## Commitment Status Lifecycle

Commitments follow this lifecycle:

```
pending -> active -> completed
                  -> failed
                  -> renegotiated
           -> disputed
           -> revoked
```

| Status | Description |
|--------|-------------|
| `pending` | Commitment created, awaiting activation |
| `active` | Commitment in effect |
| `completed` | Commitment fulfilled |
| `failed` | Commitment not met |
| `renegotiated` | Terms changed |
| `disputed` | Disagreement on terms |
| `revoked` | Commitment cancelled |

## Agent State Types

| Type | Use Case | Example |
|------|----------|---------|
| `memory` | Agent's working memory | MEMORY.md |
| `skill` | Agent's capabilities | SKILL.md |
| `plan` | Strategic plans | plan.md |
| `config` | Configuration files | jacs.config.json |
| `hook` | Executable code (always embedded) | pre-commit.sh |
| `other` | General-purpose signed documents | any file |

## Security Notes

- **Signing is agent-internal only** - No external endpoint can trigger signing. Only the agent itself decides what to sign via `jacs_sign`. This is fundamental to identity integrity.
- All signatures use post-quantum cryptography (ML-DSA-87/pq2025) by default
- Private keys are encrypted at rest with AES-256-GCM using PBKDF2 key derivation
- Private keys never leave the agent - only public keys are shared
- Verification claims can only be upgraded, never downgraded
- Chain of custody is maintained for multi-agent workflows
- Documents include version UUIDs and timestamps to prevent replay attacks
- Hook files are always embedded in agent state documents for security

## HAI.ai Registration

To achieve "attested" trust level:

1. Set up your agent domain: Configure `agentDomain` in settings
2. Publish DNS record: Run `openclaw jacs dns-record <domain>` and add to DNS
3. Register with HAI.ai: Run `openclaw jacs register` with your API key
4. Verify: Run `openclaw jacs attestation` to confirm "attested" status

Environment variables:
- `HAI_API_KEY` - Your HAI.ai API key for registration
- `HAI_API_URL` - Custom HAI.ai endpoint (default: https://api.hai.ai)
