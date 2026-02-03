---
name: jacs
description: Cryptographic document signing and verification with JACS
user-invocable: true
metadata: {"openclaw":{"requires":{"config":["plugins.entries.jacs.enabled"]}}}
---

# JACS Cryptographic Provenance

Use these capabilities to sign, verify, and manage cryptographically secure documents. All signatures use post-quantum cryptography by default.

## Trust Levels

JACS supports three trust levels for agent verification:

| Level | Claim | Requirements | Use Case |
|-------|-------|--------------|----------|
| **Basic** | `unverified` | Self-signed JACS signature | Local/testing |
| **Domain** | `verified` | DNS TXT record + DNSSEC | Organizational trust |
| **Attested** | `verified-hai.ai` | HAI.ai registration | Platform-wide trust |

## Available Tools

### Core Signing & Verification

| Tool | Purpose |
|------|---------|
| `jacs_sign` | Sign a document with your JACS identity |
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

### HAI.ai Attestation (New in 0.2.0)

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

### Check an agent's attestation

```
What is the attestation status for agent.example.com?
```

### Get my identity and trust level

```
What is my JACS identity and trust level?
```

### Register with HAI.ai

Use the CLI command:
```
openclaw jacs register
```

### Create a multi-party agreement

```
Create an agreement for these agents to sign:
- agent1-id
- agent2-id

Document: {the document requiring signatures}
Question: "Do you approve this proposal?"
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

### HAI.ai Commands (New in 0.2.0)

- `openclaw jacs register` - Register this agent with HAI.ai
- `openclaw jacs attestation [domain]` - Check attestation status (self or other agent)
- `openclaw jacs claim [level]` - Set or view verification claim level

## Public Endpoints

Your agent exposes these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/.well-known/jacs-pubkey.json` | GET | Your public key + verification claim |
| `/jacs/status` | GET | Health check with trust info |
| `/jacs/attestation` | GET | Full attestation status |
| `/jacs/verify` | POST | Public verification endpoint |

Other agents discover you via DNS TXT record at `_v1.agent.jacs.{your-domain}`

**IMPORTANT: No signing endpoint is exposed.** Signing is internal-only - only the agent itself can sign documents using `jacs_sign`. This protects the agent's identity from external compromise.

## Security Notes

- **Signing is agent-internal only** - No external endpoint can trigger signing. Only the agent itself decides what to sign via `jacs_sign`. This is fundamental to identity integrity.
- All signatures use post-quantum cryptography (ML-DSA-87/pq2025) by default
- Private keys are encrypted at rest with AES-256-GCM using PBKDF2 key derivation
- Private keys never leave the agent - only public keys are shared
- Verification claims can only be upgraded, never downgraded
- Chain of custody is maintained for multi-agent workflows
- Documents include version UUIDs and timestamps to prevent replay attacks

## HAI.ai Registration

To achieve "attested" trust level:

1. Set up your agent domain: Configure `agentDomain` in settings
2. Publish DNS record: Run `openclaw jacs dns-record <domain>` and add to DNS
3. Register with HAI.ai: Run `openclaw jacs register` with your API key
4. Verify: Run `openclaw jacs attestation` to confirm "attested" status

Environment variables:
- `HAI_API_KEY` - Your HAI.ai API key for registration
- `HAI_API_URL` - Custom HAI.ai endpoint (default: https://api.hai.ai)
