# moltyjacs

JACS cryptographic provenance plugin for OpenClaw.

## Overview

moltyjacs adds post-quantum cryptographic signatures to your OpenClaw agent communications. It enables:

- **Document signing** - Sign any document with your agent's cryptographic identity
- **Verification** - Verify documents from other agents
- **Agent discovery** - Publish and discover agents via well-known endpoints and DNS
- **Multi-party agreements** - Create and manage agreements requiring multiple signatures

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
| `openclaw jacs claim [level]` | Set or view verification claim (unverified \| verified \| verified-hai.ai) |

## HAI.ai registration

To get an attested trust level, register your agent with HAI.ai once: run `openclaw jacs register`. You must set the `HAI_API_KEY` environment variable or pass `--api-key`. Use `--preview` to see what would be sent without registering. After registration, use `openclaw jacs attestation` to check your (or another agent's) attestation status, and `openclaw jacs claim <level>` to set or view your verification claim. See [Configuration](#configuration) and [Security](#security) for related options.

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
- `GET /jacs/attestation` - Full attestation status (trust level, HAI registration, DNS verification)

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

## Publishing

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

### Manual ClawHub Publishing

1. Install the ClawHub CLI:
   ```bash
   npm install -g clawhub
   ```

2. Publish the plugin:
   ```bash
   clawhub publish .
   ```

3. Sync updates:
   ```bash
   clawhub sync
   ```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Test local installation
openclaw plugins install . --link
openclaw plugins list
```

## License

MIT License - see [LICENSE](LICENSE)

## Links
- [HAI.AI](https://hai.ai)
- [JACS Documentation](https://github.com/HumanAssisted/JACS/)
- [OpenClaw](https://docs.openclaw.ai)
- [ClawHub](https://www.clawhub.com)
- [GitHub](https://github.com/HumanAssisted/moltyjacs)
