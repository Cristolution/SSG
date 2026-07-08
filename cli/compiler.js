import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { encrypt } from './encryptor.js';

/**
 * Parses a passwords.md file into a folder → password map.
 * Folders with no entry and no default are treated as "open" (no encryption).
 * @param {string} passwordsPath
 * @returns {{ folderMap: Record<string, string>, defaultPassword: string | null }}
 */
export function parsePasswordsFile(passwordsPath) {
  const content = fs.readFileSync(passwordsPath, 'utf8');
  const lines = content.split('\n');
  const folderMap = {};
  let defaultPassword = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (key === 'default') {
      defaultPassword = value;
    } else {
      folderMap[key] = value;
    }
  }

  return { folderMap, defaultPassword };
}

/**
 * Finds the best-matching password for a given file path.
 * Most specific (longest) folder prefix wins.
 * Returns null if no match and no default — meaning "open to all".
 * @param {string} filePath - absolute path to the .md file
 * @param {Record<string, string>} folderMap
 * @param {string | null} defaultPassword
 * @returns {string | null}
 */
function getPasswordForFile(filePath, folderMap, defaultPassword) {
  // Use vault-relative path for matching (not absolute path)
  const vaultRelative = filePath.replace(/\\/g, '/').replace(/^.*vault\//, '').replace(/^\/+/, '');
  let bestMatch = defaultPassword;
  let bestMatchLen = 0;

  for (const [folder, password] of Object.entries(folderMap)) {
    const folderNorm = folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    // Match by path segment — the folder must be the first segment of the relative path
    if ((vaultRelative.startsWith(folderNorm + '/') || vaultRelative === folderNorm) && folderNorm.length > bestMatchLen) {
      bestMatch = password;
      bestMatchLen = folderNorm.length;
    }
  }

  return bestMatch; // null means open (no password)
}

/**
 * Converts an absolute file path to a route path.
 * e.g. /vault/design/neo-brutalism.md → /design/neo-brutalism
 * @param {string} filePath
 * @param {string} vaultRoot
 * @returns {string}
 */
function pathToRoute(filePath, vaultRoot) {
  const relative = path.relative(vaultRoot, filePath).replace(/\\/g, '/');
  const withoutExt = relative.replace(/\.md$/, '');
  // Remove leading/trailing slashes
  return '/' + withoutExt.replace(/^\/|\/$/g, '');
}

/**
 * Recursively finds all .md files in a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function findMarkdownFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Compiles a single markdown file.
 * @param {string} filePath
 * @param {string} vaultRoot
 * @param {Record<string, string>} folderMap
 * @param {string} defaultPassword
 * @returns {Promise<{frontmatter: object, encryptedContent: string, outputFilename: string, route: string}>}
 */
async function compileFile(filePath, vaultRoot, folderMap, defaultPassword) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);

  const password = getPasswordForFile(filePath, folderMap, defaultPassword);
  const isOpen = password === null;
  const encryptedContent = isOpen
    ? content.trim()
    : await encrypt(content.trim(), password);

  const route = pathToRoute(filePath, vaultRoot);
  // Use full route as slug to avoid collisions between same-name files in different folders
  const slug = route.replace(/^\//, '').replace(/\//g, '-');
  const ext = isOpen ? '.txt' : '.enc';
  const outputFilename = slug + ext;

  return {
    frontmatter: {
      title: data.title || slug,
      tags: data.tags || [],
      folder: data.folder || '',
      description: data.description || '',
    },
    encryptedContent,
    outputFilename,
    route,
    isOpen,
  };
}

/**
 * Compiles all markdown files in a vault.
 * @param {string} vaultPath
 * @param {string} passwordsPath
 * @returns {Promise<Array>}
 */
export async function compileVault(vaultPath, passwordsPath) {
  const { folderMap, defaultPassword } = parsePasswordsFile(passwordsPath);
  const files = findMarkdownFiles(vaultPath);

  // Exclude passwords.md itself
  const mdFiles = files.filter(f => !f.endsWith('passwords.md'));

  const results = [];
  for (const file of mdFiles) {
    const result = await compileFile(file, vaultPath, folderMap, defaultPassword);
    results.push(result);
  }

  return results;
}
