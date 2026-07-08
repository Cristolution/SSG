# Repository Guidelines

SSG 2 is a 100% local encrypted static site generator — a Node.js CLI that compiles a Markdown vault to encrypted static assets and pairs with a browser-based SPA that decrypts content in-memory.

## Project Structure & Module Organization

- **`cli/`** — Node.js CLI that runs entirely locally. `index.js` is the entry point; `compiler.js` parses Markdown via `gray-matter`; `encryptor.js` handles AES-256-GCM via Node's `crypto` module; `manifest.js` builds `manifest.json` mapping routes to their encrypted files.
- **`frontend/`** — Static SPA shell deployed to GitHub Pages. `app.js` is the router, renderer, and in-browser decryption engine. Only encrypted `.enc` files and this shell are ever published.
- **`vault/`** — Local content source (never committed or published). Contains Markdown files organized under `design/`, `projects/`, and `public/`. `passwords.md` maps vault folders to their encryption passwords.

The `dist/` directory is the build output and is excluded from version control.

## Build, Test, and Development Commands

```bash
npm install        # Install dependencies: gray-matter, yargs
npm run build      # Compile and encrypt the vault
```

The build command is defined in `package.json` as:

```
node cli/index.js --vault ./vault --passwords ./vault/passwords.md --dist ./dist
```

Output filenames use the full vault-relative path (e.g. `design-color-system.enc`, `projects-api-documentation.enc`) to avoid collisions between same-named files in different folders. `dist/` is fully cleaned before each build.

The CLI accepts `--vault`, `--passwords`, and `--dist` flags. See `passwords.md.example` for the vault password format.

## Coding Style & Naming Conventions

No linting, formatting, or type-checking tooling is configured. The project uses vanilla JavaScript (`"type": "module"` in `package.json`). Consistency is enforced through code review rather than automated tooling.

Conventions observed in the codebase:
- **Files**: lowercase with hyphens (`encryptor.js`, `manifest.js`)
- **Classes**: PascalCase (`Manifest`, `Encryptor`)
- **Functions**: camelCase
- **Constants**: SCREAMING_SNAKE_CASE for security-relevant values (e.g., PBKDF2 iterations, algorithm names)

## Testing Guidelines

No test framework is configured. Verify changes by running `npm run build` and checking:
- `dist/content/` has correct `.enc` / `.txt` files (5 encrypted, 2 open)
- `dist/manifest.json` routes match actual files
- No stale artifacts from previous builds
- Encrypted files decrypt correctly with the expected password

## Commit & Pull Request Guidelines

This repository is not under git version control. If git is initialized, follow conventional commit format: `feat:`, `fix:`, `docs:`, `chore:` prefixes on subject lines.

---

*Last verified: 2026-07-08*
