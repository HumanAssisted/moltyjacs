# moltyjacs

JACS cryptographic provenance plugin for OpenClaw.

## Overview

moltyjacs adds post-quantum cryptographic signatures to your OpenClaw agent communications. It enables:

- **Document signing** - Sign any document with your agent's cryptographic identity
- **Verification** - Verify documents from other agents
- **Agent discovery** - Publish and discover agents via well-known endpoints and DNS
- **Multi-party agreements** - Create and manage agreements requiring multiple signatures

## Installation

```bash
npm install moltyjacs
```

Or install as an OpenClaw plugin:

```bash
openclaw plugins install moltyjacs
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

## Agent Tools

When used with an AI agent, these tools are available:

| Tool | Purpose |
|------|---------|
| `jacs_sign` | Sign a document |
| `jacs_verify` | Verify a self-signed document |
| `jacs_verify_auto` | Verify any document (auto-fetches keys) |
| `jacs_fetch_pubkey` | Fetch another agent's public key |
| `jacs_verify_with_key` | Verify with a specific public key |
| `jacs_dns_lookup` | Look up DNS TXT record |
| `jacs_lookup_agent` | Get complete agent info |
| `jacs_create_agreement` | Create multi-party agreement |
| `jacs_sign_agreement` | Sign an agreement |
| `jacs_check_agreement` | Check agreement status |
| `jacs_hash` | Hash content |
| `jacs_identity` | Get your identity info |

## Well-Known Endpoints

Your agent exposes these endpoints:

- `GET /.well-known/jacs-pubkey.json` - Your public key
- `GET /jacs/status` - Health check
- `POST /jacs/verify` - Public verification
- `POST /jacs/sign` - Authenticated signing

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

## License

MIT License - see [LICENSE](LICENSE)

## Links

- [JACS Documentation](https://hai.ai/jacs)
- [OpenClaw](https://openclaw.dev)
- [GitHub](https://github.com/HumanAssisted/moltyjacs)
