# SSG 2 — Encrypted Static Site Generator

A **100% local** static site generator that encrypts your Markdown notes before deployment. No raw content, passwords, or secrets ever leave your machine.

## How It Works

```
Local Vault (Markdown + passwords.md)
        │
        ▼
   ┌─────────────┐
   │  Local CLI  │  ◄── Runs entirely on YOUR machine
   │  Compile +  │
   │  Encrypt    │
   └──────┬──────┘
          │ git push (encrypted assets only)
          ▼
    GitHub Pages
  (index.html + *.enc files)
          │
          ▼
   Browser decrypts
   in-memory via
   Web Crypto API
```

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Create a vault

```
vault/
├── passwords.md      # Folder → password mapping
├── design/
│   └── neo-brutalism.md
└── projects/
    └── my-app.md
```

See `passwords.md.example` for the format.

### 3. Build

```bash
npm run build
```

### 4. Deploy

Push `dist/` to GitHub Pages. Only encrypted `.enc` files and the JS/HTML shell are public.

## CLI Usage

```bash
node cli/index.js \
  --vault ./vault \
  --passwords ./vault/passwords.md \
  --dist ./dist
```

## Security Model

- **Encryption:** AES-256-GCM via Web Crypto API
- **Key derivation:** PBKDF2 (100k iterations, SHA-256)
- **What gets published:** encrypted ciphertext blobs + the open-source frontend shell
- **What never gets published:** your raw Markdown, your passwords, your unencrypted content

## File Structure

```
SSG-2/
├── cli/
│   ├── index.js       # CLI entry point
│   ├── compiler.js    # Markdown parsing
│   ├── encryptor.js   # AES-256-GCM encryption
│   └── manifest.js    # manifest.json builder
├── frontend/
│   ├── index.html     # SPA shell
│   ├── app.js         # Router + renderer
│   ├── crypto.js      # Browser Web Crypto wrapper
│   └── style.css      # Styling
├── passwords.md.example
├── package.json
└── README.md
```
