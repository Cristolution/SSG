#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { compileVault } from './compiler.js';
import { buildManifest } from './manifest.js';

const { values } = parseArgs({
  options: {
    vault: { type: 'string', short: 'v' },
    passwords: { type: 'string', short: 'p' },
    dist: { type: 'string', short: 'd', default: './dist' },
  },
});

const { vault, passwords, dist } = values;

if (!vault || !passwords) {
  console.error('Usage: node cli/index.js --vault <path> --passwords <path> [--dist <path>]');
  process.exit(1);
}

if (!fs.existsSync(vault)) {
  console.error(`Vault not found: ${vault}`);
  process.exit(1);
}

if (!fs.existsSync(passwords)) {
  console.error(`Passwords file not found: ${passwords}`);
  process.exit(1);
}

// Clean and recreate dist/ to avoid stale artifacts
if (fs.existsSync(dist)) {
  for (const entry of fs.readdirSync(dist, { withFileTypes: true })) {
    const full = path.join(dist, entry.name);
    entry.isDirectory() ? fs.rmSync(full, { recursive: true }) : fs.unlinkSync(full);
  }
} else {
  fs.mkdirSync(dist, { recursive: true });
}
fs.mkdirSync(path.join(dist, 'content'), { recursive: true });

console.log(`\n🔐 SSG 2 — Encrypted Static Site Generator`);
console.log(`   Vault: ${vault}`);
console.log(`   Passwords: ${passwords}`);
console.log(`   Output: ${dist}\n`);

try {
  // Compile and encrypt all markdown files
  console.log('📄 Parsing markdown files...');
  const compiled = await compileVault(vault, passwords);
  console.log(`   Found ${compiled.length} note(s)`);

  // Build manifest
  console.log('🗺️  Building manifest...');
  const manifest = buildManifest(compiled);

  // Write manifest.json
  fs.writeFileSync(
    path.join(dist, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('   manifest.json written');

  // Write encrypted content files
  console.log('🔒 Encrypting and writing content files...');
  for (const item of compiled) {
    fs.writeFileSync(
      path.join(dist, 'content', item.outputFilename),
      item.encryptedContent
    );
    console.log(`   /content/${item.outputFilename}`);
  }

  // Copy frontend assets to dist
  console.log('📦 Copying frontend assets...');
  const frontendDir = path.join(process.cwd(), 'frontend');
  for (const file of fs.readdirSync(frontendDir)) {
    fs.copyFileSync(path.join(frontendDir, file), path.join(dist, file));
    console.log(`   /${file}`);
  }

  console.log(`\n✅ Build complete! ${compiled.length} encrypted page(s) ready in ${dist}/`);
  console.log(`\nTo deploy: push ${dist}/ to GitHub Pages`);
} catch (err) {
  console.error('❌ Build failed:', err.message);
  process.exit(1);
}
