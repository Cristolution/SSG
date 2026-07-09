/**
 * SSG 2 Frontend — Hash router + in-browser decryption
 */

// ─── Web Crypto ────────────────────────────────────────────────────────────────

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';

// Strip leading slash for relative fetch compatibility
function assetPath(p) {
  return p.replace(/^\//, '');
}

async function deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    keyMaterial, { name: ALGORITHM, length: KEY_LENGTH }, false, ['decrypt']
  );
}

async function decrypt(encryptedBase64, password) {
  const data = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const salt = data.slice(0, SALT_LENGTH);
  const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = data.slice(SALT_LENGTH + IV_LENGTH, data.length - TAG_LENGTH);
  const tag = data.slice(data.length - TAG_LENGTH);
  const tagAndCiphertext = new Uint8Array(ciphertext.length + TAG_LENGTH);
  tagAndCiphertext.set(ciphertext, 0);
  tagAndCiphertext.set(tag, ciphertext.length);
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, tagAndCiphertext);
  return new TextDecoder().decode(plaintext);
}

// ─── State ────────────────────────────────────────────────────────────────────

let manifest = null;
let passwordCache = {};
let currentRoute = '/';

function cacheGet(folder) {
  const k = folder || '__default';
  if (!passwordCache[k]) passwordCache[k] = sessionStorage.getItem(`ssg2_pwd_${k}`);
  return passwordCache[k];
}

function cacheSet(folder, password) {
  const k = folder || '__default';
  passwordCache[k] = password;
  sessionStorage.setItem(`ssg2_pwd_${k}`, password);
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderMarkdown(text) {
  const lines = text.split('\n');
  let html = '';
  let inCode = false;
  let codeLang = '';
  let inList = false;
  let inBlockquote = false;
  // Table state: flush current accumulated table rows to html, then reset
  let tableRows = [];

  function flushTable() {
    if (tableRows.length === 0) return;
    const [headerRow, ...bodyRows] = tableRows;
    html += '<table><thead>' + headerRow + '</thead>';
    if (bodyRows.length > 0) html += '<tbody>' + bodyRows.join('') + '</tbody>';
    html += '</table>';
    tableRows = [];
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      if (!inCode) {
        flushTable();
        codeLang = line.slice(3).trim();
        inCode = true;
        html += `<pre data-lang="${escapeHtml(codeLang)}"><code>`;
      } else {
        html += `</code></pre>`;
        inCode = false;
        codeLang = '';
      }
      continue;
    }
    if (inCode) {
      html += escapeHtml(line) + '\n';
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      flushTable();
      if (!inBlockquote) { html += '<blockquote>'; inBlockquote = true; }
      html += `<p>${escapeHtml(line.slice(2))}</p>`;
      continue;
    } else if (inBlockquote) {
      html += '</blockquote>';
      inBlockquote = false;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { flushTable(); html += '<hr>'; continue; }

    // Headers
    const h3m = line.match(/^### (.+)/);
    if (h3m) { flushTable(); html += `<h3>${escapeHtml(h3m[1])}</h3>`; continue; }
    const h2m = line.match(/^## (.+)/);
    if (h2m) { flushTable(); html += `<h2>${escapeHtml(h2m[1])}</h2>`; continue; }
    const h1m = line.match(/^# (.+)/);
    if (h1m) { flushTable(); html += `<h1>${escapeHtml(h1m[1])}</h1>`; continue; }

    // Inline code
    line = line.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
    // Bold
    line = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    line = line.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Links
    line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Tables
    if (/^\|/.test(line)) {
      const cells = line.split('|').filter((_, i, a) => i > 0 && i < a.length - 1);
      const isSep = /^[-:]+$/.test(cells.map(c => c.replace(/\s/g,'')).join(''));
      const isData = cells.length > 0 && !/^[-:]/.test(cells[0].replace(/\s/g, ''));
      if (isData) {
        tableRows.push(`<tr>${cells.map(c => `<td>${c.trim()}</td>`).join('')}</tr>`);
        continue;
      } else if (isSep) {
        continue; // separator row — skip
      }
    }

    // End of table: any non-table, non-list, non-blockquote line
    if (tableRows.length > 0) {
      flushTable();
    }

    // Lists
    if (/^[-*] /.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${line.slice(2)}</li>`;
      continue;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
    }

    if (line.trim()) html += `<p>${line || '&nbsp;'}</p>`;
  }

  if (inCode) html += '</code></pre>';
  if (inList) html += '</ul>';
  if (inBlockquote) html += '</blockquote>';
  if (tableRows.length > 0) flushTable();

  return html;
}

// ─── Modal ───────────────────────────────────────────────────────────────────

let pendingDecrypt = null;

function showPasswordModal(folder, isOpen) {
  if (isOpen) {
    pendingDecrypt.callback('');
    pendingDecrypt = null;
    return;
  }

  const modal = $('#password-modal');
  $('#modal-context').textContent = folder
    ? `Folder: /${folder}  ·  Contents are encrypted`
    : 'Contents are encrypted';
  $('#password-error').textContent = '';
  $('#password-input').value = '';
  modal.classList.remove('hidden');
  $('#password-input').focus();
  $('#password-submit').onclick = attemptDecrypt;
  $('#password-cancel').onclick = hidePasswordModal;
  $('#password-input').onkeydown = (e) => {
    if (e.key === 'Enter') attemptDecrypt();
    if (e.key === 'Escape') hidePasswordModal();
  };
  $('#modal-backdrop').onclick = hidePasswordModal;
}

function hidePasswordModal() {
  $('#password-modal').classList.add('hidden');
  pendingDecrypt = null;
}

async function attemptDecrypt() {
  const password = $('#password-input').value;
  if (!password) {
    $('#password-error').textContent = 'Please enter a password.';
    return;
  }
  try {
    const plaintext = await decrypt(pendingDecrypt.encryptedContent, password);
    cacheSet(pendingDecrypt.folder, password);
    pendingDecrypt.callback(plaintext);
    hidePasswordModal();
  } catch {
    $('#password-error').textContent = 'Decryption failed — wrong password?';
    $('#password-input').value = '';
  }
}

// ─── Sidebar Builder ─────────────────────────────────────────────────────────

function buildSidebar() {
  const nav = $('#nav-links');
  if (!manifest || !manifest.routes) {
    nav.innerHTML = '<p class="nav-loading">No routes found.</p>';
    return;
  }

  nav.innerHTML = '';
  const routes = Object.entries(manifest.routes);

  if (!routes.length) {
    nav.innerHTML = '<p class="nav-empty">No pages yet.</p>';
    return;
  }

  // Group routes by top-level folder
  const groups = {};
  for (const [route, info] of routes) {
    const parts = route.split('/').filter(Boolean);
    const topFolder = parts[0] || 'root';
    if (!groups[topFolder]) groups[topFolder] = [];
    groups[topFolder].push({ route, info });
  }

  // Label map for folder names
  const folderLabels = {
    public: 'Public',
    design: 'Design',
    projects: 'Projects',
    root: 'Notes',
  };

  for (const [folder, items] of Object.entries(groups)) {
    const label = folderLabels[folder] || folder.charAt(0).toUpperCase() + folder.slice(1);

    const section = document.createElement('p');
    section.className = 'nav-section';
    section.textContent = label;
    nav.appendChild(section);

    for (const { route, info } of items) {
      const a = document.createElement('a');
      a.href = `#${route}`;
      a.dataset.route = route;

      const isOpen = !!info.open;
      const icon = isOpen ? '🔓' : '🔒';
      a.innerHTML = `<span class="nav-icon">${icon}</span><span class="nav-label">${escapeHtml(info.title || route)}</span>`;

      if (isOpen) {
        a.title = 'Open — no password required';
      } else if (info.tags && info.tags.length) {
        a.title = info.tags.map(t => `#${t}`).join(' ');
      }

      if (route === currentRoute) a.classList.add('active');
      nav.appendChild(a);
    }
  }
}

// ─── Active Link Updater ─────────────────────────────────────────────────────

function updateActiveLink(route) {
  currentRoute = route;
  document.querySelectorAll('#nav-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route);
  });
}

// ─── Page Renderer ────────────────────────────────────────────────────────────

function renderPage(route, info, plaintext) {
  const content = $('#page-content');
  const tagsHtml = info.tags && info.tags.length
    ? info.tags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')
    : '';

  content.innerHTML = `
    <div class="page-meta">
      ${tagsHtml}
      ${info.open ? '<span class="tag" style="background:#d94f00;color:#f5f3ee;border-color:#d94f00">🔓 Open</span>' : '<span class="tag">🔒 Protected</span>'}
    </div>
    ${renderMarkdown(plaintext)}
  `;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

async function navigateTo(route) {
  updateActiveLink(route);
  const content = $('#page-content');

  if (!route || route === '/') {
    content.innerHTML = `
      <div class="welcome">
        <h1>SSG 2</h1>
        <p>Select a page from the sidebar to unlock and read it.</p>
      </div>
      <p class="loading" style="margin-top:1.5rem">Navigate to a page to get started.</p>
    `;
    return;
  }

  const routeInfo = manifest.routes[route];
  if (!routeInfo) {
    content.innerHTML = `<p class="error">Page not found: ${escapeHtml(route)}</p>`;
    return;
  }

  content.innerHTML = `<p class="loading">Decrypting...</p>`;
  const folder = routeInfo.folder || null;
  const isOpen = !!routeInfo.open;

  // Open pages — no decryption needed
  if (isOpen) {
    try {
      const plaintext = await fetch(assetPath(routeInfo.encrypted_file_path)).then(r => r.text());
      renderPage(route, routeInfo, plaintext);
    } catch (e) {
      content.innerHTML = `<p class="error">Failed to load content.</p>`;
    }
    return;
  }

  // Protected — check cache first
  const cachedPassword = cacheGet(folder);

  try {
    const encryptedContent = await fetch(assetPath(routeInfo.encrypted_file_path)).then(r => r.text());

    if (cachedPassword) {
      try {
        const plaintext = await decrypt(encryptedContent, cachedPassword);
        renderPage(route, routeInfo, plaintext);
        return;
      } catch {
        cacheSet(folder, null); // bad cache entry
      }
    }

    pendingDecrypt = {
      encryptedContent,
      route,
      folder,
      callback: (plaintext) => renderPage(route, routeInfo, plaintext),
    };
    showPasswordModal(folder, false);
  } catch (err) {
    content.innerHTML = `<p class="error">Failed to load: ${escapeHtml(routeInfo.encrypted_file_path)}</p>`;
  }
}

// ─── Hash Router ─────────────────────────────────────────────────────────────

function getRoute() {
  return window.location.hash ? window.location.hash.slice(1) : '/';
}

function handleRoute() {
  navigateTo(getRoute());
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    manifest = await fetch('manifest.json').then(r => r.json());
  } catch {
    $('#nav-links').innerHTML = '<p class="nav-loading" style="color:#c0392b">Failed to load manifest.json</p>';
    return;
  }

  buildSidebar();

  // Always call handleRoute — Playwright's page.goto(url-with-hash) does NOT fire
  // hashchange on initial navigation, so we need an explicit call after manifest loads.
  handleRoute();

  window.addEventListener('hashchange', handleRoute);
}

init();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function $(sel) { return document.querySelector(sel); }
