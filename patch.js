/**
 * NexusChat — Feature Patch
 * ─────────────────────────────────────────────────────────────────────
 * Add this line just before </body> in index.html to activate:
 *   <script src="patch.js"></script>
 *
 * Adds four new features:
 *   1. Channel Categories   — collapsible folder groups in the sidebar
 *   2. Keyboard Shortcuts   — panel opened with the "?" key
 *   3. Webhook Integrations — new tab in Server Settings
 *   4. Invite Links         — expiry + max-use limits, new tab in Server Settings
 * ─────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────
   * HELPERS
   * ───────────────────────────────────────────────────────────────── */

  /** Safe HTML escape */
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Poll until Firebase db and auth are ready (max 12 s) */
  function waitForApp(cb, deadline) {
    deadline = deadline || Date.now() + 12000;
    if (window._ncDb && window.me !== undefined) { cb(); return; }
    if (Date.now() > deadline) { console.warn('[patch] waitForApp timed out'); return; }
    setTimeout(() => waitForApp(cb, deadline), 250);
  }

  /** Short-hands */
  const db  = () => window._ncDb;
  const me  = () => window.me  || window._ncMe;
  const myP = () => window.myP || window._ncMyP;

  /** Dynamic-import shorthand for Firestore */
  const FS_URL = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
  async function fs(...keys) {
    const mod = await import(FS_URL);
    const out = {};
    keys.forEach(k => { out[k] = mod[k]; });
    return out;
  }


  /* ─────────────────────────────────────────────────────────────────
   * INJECT STYLES
   * ───────────────────────────────────────────────────────────────── */

  const stylesheet = document.createElement('style');
  stylesheet.textContent = /* css */`

    /* ── Channel Categories ─────────────────────────────── */
    .ch-category { }

    .ch-cat-hdr {
      display: flex; align-items: center; gap: 5px;
      padding: 8px 10px 4px; border-radius: 8px;
      cursor: pointer; user-select: none;
      transition: background .12s;
      position: relative;
    }
    .ch-cat-hdr:hover { background: var(--md-surface-2); }

    .ch-cat-arrow {
      font-size: 14px !important;
      color: var(--md-on-surface-variant);
      transition: transform .18s;
      flex-shrink: 0;
      font-variation-settings: 'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 20;
    }
    .ch-cat-arrow.collapsed { transform: rotate(-90deg); }

    .ch-cat-name {
      flex: 1;
      font-size: 11px; font-weight: 800;
      text-transform: uppercase; letter-spacing: .07em;
      color: var(--md-on-surface-variant);
    }

    .ch-cat-btn {
      opacity: 0; transition: opacity .12s;
      width: 20px; height: 20px; border-radius: 50%;
      background: none; border: none; cursor: pointer;
      color: var(--md-on-surface-variant);
      display: flex; align-items: center; justify-content: center;
      padding: 0; flex-shrink: 0;
    }
    .ch-cat-hdr:hover .ch-cat-btn { opacity: 1; }

    .ch-cat-channels { overflow: hidden; }
    .ch-cat-channels.nc-collapsed { display: none; }

    .ch-cat-empty {
      padding: 4px 14px 8px;
      font-size: 12px; color: var(--md-on-surface-variant);
      opacity: .55; font-style: italic;
    }

    .nc-add-cat-btn {
      display: flex; align-items: center; gap: 7px;
      width: 100%; padding: 7px 10px;
      background: none; border: none; cursor: pointer;
      color: var(--md-on-surface-variant);
      font-size: 12px; font-weight: 600;
      border-radius: 10px; font-family: inherit;
      transition: background .12s, color .12s;
      margin-top: 4px;
    }
    .nc-add-cat-btn:hover {
      background: var(--md-surface-2);
      color: var(--md-on-surface);
    }

    /* ── Keyboard Shortcuts ──────────────────────────────── */
    #nc-kbd-ov {
      position: fixed; inset: 0; z-index: 9200;
      background: rgba(0,0,0,.55);
      display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(6px);
      animation: nc-fade-in .15s ease;
    }
    #nc-kbd-ov.nc-closing { animation: nc-fade-out .15s ease forwards; }
    @keyframes nc-fade-in  { from { opacity:0 } to { opacity:1 } }
    @keyframes nc-fade-out { from { opacity:1 } to { opacity:0 } }

    .nc-kbd-modal {
      background: var(--md-surface);
      border-radius: 24px;
      padding: 28px 30px 22px;
      width: min(600px, 95vw);
      max-height: 82vh;
      overflow-y: auto;
      box-shadow: var(--md-elev-4);
      animation: slideUp .28s cubic-bezier(.34,1.56,.64,1);
    }

    .nc-kbd-group { margin-bottom: 22px; }
    .nc-kbd-group-title {
      font-size: 10px; font-weight: 800;
      text-transform: uppercase; letter-spacing: .12em;
      color: var(--md-primary); margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 2px solid var(--md-outline-variant);
    }
    .nc-kbd-row {
      display: flex; align-items: center;
      justify-content: space-between; gap: 16px;
      padding: 9px 2px;
      border-bottom: 1px solid var(--md-outline-variant);
    }
    .nc-kbd-row:last-child { border-bottom: none; }
    .nc-kbd-desc { font-size: 13px; color: var(--md-on-surface); }
    .nc-kbd-keys { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .nc-key {
      background: var(--md-surface-2);
      border: 1.5px solid var(--md-outline);
      border-radius: 7px;
      padding: 3px 8px;
      font-size: 11px; font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      color: var(--md-on-surface);
      box-shadow: 0 2px 0 var(--md-outline);
      white-space: nowrap;
    }
    .nc-key-sep { font-size: 10px; color: var(--md-on-surface-variant); margin: 0 1px; }

    /* ── Shared: Webhooks + Invites list ─────────────────── */
    .nc-feat-item {
      background: var(--md-surface-1);
      border: 1.5px solid var(--md-outline-variant);
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 10px;
      transition: border-color .15s;
    }
    .nc-feat-item:hover { border-color: var(--md-outline); }
    .nc-feat-icon {
      width: 42px; height: 42px; border-radius: 13px;
      background: var(--md-primary-container);
      color: var(--md-primary);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; flex-shrink: 0;
    }
    .nc-feat-name { font-size: 14px; font-weight: 700; color: var(--md-on-surface); }
    .nc-feat-sub  { font-size: 12px; color: var(--md-on-surface-variant); margin-top: 2px; }

    .nc-url-row {
      display: flex; align-items: center; gap: 8px;
      background: var(--md-surface-2);
      border: 1.5px solid var(--md-outline);
      border-radius: 10px;
      padding: 7px 10px;
      margin-top: 10px;
    }
    .nc-url-inp {
      flex: 1; background: none; border: none; outline: none;
      font-size: 11px; font-family: 'JetBrains Mono', monospace;
      color: var(--md-on-surface); min-width: 0; cursor: text;
    }
    .nc-copy-btn {
      background: var(--md-primary); color: #fff;
      border: none; border-radius: 8px;
      padding: 4px 12px; font-size: 11px; font-weight: 700;
      cursor: pointer; flex-shrink: 0; font-family: inherit;
      transition: filter .12s;
    }
    .nc-copy-btn:hover { filter: brightness(.9); }

    .nc-del-btn {
      width: 34px; height: 34px; border-radius: 50%;
      border: none; background: none; cursor: pointer;
      color: var(--md-error);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background .12s;
    }
    .nc-del-btn:hover { background: rgba(217,48,37,.1); }

    .nc-empty {
      text-align: center; padding: 40px 20px;
      color: var(--md-on-surface-variant);
    }
    .nc-empty .icon { font-size: 40px; display: block; margin-bottom: 10px; }
    .nc-empty-title { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
    .nc-empty-sub   { font-size: 13px; }

    /* ── Invite status badges ────────────────────────────── */
    .nc-inv-badge {
      font-size: 10px; font-weight: 800;
      padding: 2px 9px; border-radius: 100px;
    }
    .nc-inv-active  { background: rgba(30,142,62,.12);  color: var(--md-success); }
    .nc-inv-expired { background: rgba(217,48,37,.10);  color: var(--md-error); }
    .nc-inv-used    { background: rgba(95,99,104,.12);  color: var(--md-on-surface-variant); }

    /* ── Option-picker buttons (invite modal) ────────────── */
    .nc-opt {
      padding: 8px 10px; border-radius: 10px;
      border: 1.5px solid var(--md-outline);
      background: var(--md-surface);
      font-size: 13px; font-weight: 600;
      cursor: pointer; color: var(--md-on-surface);
      transition: all .15s; font-family: inherit;
    }
    .nc-opt.nc-sel {
      background: var(--md-primary-container);
      color: var(--md-primary);
      border-color: var(--md-primary);
    }
    .nc-opt:hover:not(.nc-sel) { background: var(--md-surface-2); }

    /* ── Info box reused in both panels ─────────────────── */
    .nc-info-box {
      background: color-mix(in srgb, var(--md-primary) 10%, transparent);
      border: 1.5px solid var(--md-primary-container);
      border-radius: 14px; padding: 13px 15px;
      font-size: 12px; color: var(--md-on-surface); line-height: 1.7;
      flex-shrink: 0;
    }
    .nc-info-box code {
      font-family: 'JetBrains Mono', monospace;
      background: var(--md-surface-2);
      padding: 1px 5px; border-radius: 4px;
    }
  `;
  document.head.appendChild(stylesheet);


  /* =================================================================
   * FEATURE 1 — CHANNEL CATEGORIES
   * ================================================================= */

  window._ncCatCollapsed = window._ncCatCollapsed || {};
  window._ncCategories   = window._ncCategories   || {};
  window._ncLastChannels = window._ncLastChannels  || {};

  /** Load this server's categories from Firestore (cached). */
  async function loadCategories(sid) {
    if (!sid || sid === 'home' || sid === '__home__') return [];
    if (!db()) return [];
    try {
      const { getDocs, collection } = await fs('getDocs', 'collection');
      const snap = await getDocs(collection(db(), 'servers', sid, 'categories'));
      const cats = [];
      snap.forEach(d => cats.push({ id: d.id, ...d.data() }));
      cats.sort((a, b) => (a.order || 0) - (b.order || 0));
      window._ncCategories[sid] = cats;
      return cats;
    } catch (e) { return []; }
  }

  /** Build a .ch-item element that calls window-exposed functions. */
  function buildChItem(ch, sid) {
    const item = document.createElement('div');
    const icons = { text: '#', voice: '🔊', announce: '📣' };
    item.className = 'ch-item' + (window.voiceChannel === ch.id ? ' voice-on' : '');
    if (window.curCh === ch.id) item.classList.add('on');
    item.dataset.cid  = ch.id;
    item.dataset.type = ch.type;
    item.innerHTML = `<span class="ch-sym">${icons[ch.type] || '#'}</span><span class="ch-lbl">${esc(ch.name)}</span>`;
    item.onclick = () => window.selectCh?.(ch, sid || 'home');
    if (sid && sid !== 'home') {
      item.oncontextmenu = e => { e.preventDefault(); ncChCtx(e, ch.id, sid); };
    }
    return item;
  }

  /* ── Patch renderChannels ──────────────────────────────────────── */
  const _origRC = window.renderChannels;

  window.renderChannels = async function (chs, sid) {
    // Cache channels so category operations can reference them
    if (sid) window._ncLastChannels[sid] = chs;

    const cats = await loadCategories(sid);

    // No categories defined — fall back to the original renderer untouched
    if (!cats.length) {
      return _origRC?.(chs, sid);
    }

    const list = document.getElementById('ch-list');
    if (!list) return;
    list.innerHTML = '';

    const isOwner = window.allSrvs?.[sid]?.ownerId === me()?.uid || myP()?.isAdmin;
    const secLabels = { text: 'Text Channels', voice: 'Voice Channels', announce: 'Announcements' };

    // Sort channels into category buckets
    const catBuckets = {};
    cats.forEach(c => { catBuckets[c.id] = []; });
    const uncategorized = [];
    chs.forEach(ch => {
      if (ch.categoryId && catBuckets[ch.categoryId] !== undefined) {
        catBuckets[ch.categoryId].push(ch);
      } else {
        uncategorized.push(ch);
      }
    });

    /* ── Render each category ── */
    cats.forEach(cat => {
      const collapsed = !!window._ncCatCollapsed[sid + cat.id];
      const catEl = document.createElement('div');
      catEl.className = 'ch-category';
      catEl.dataset.catId = cat.id;

      // Header
      const hdr = document.createElement('div');
      hdr.className = 'ch-cat-hdr';
      hdr.onclick = () => _toggleCat(sid, cat.id, hdr);

      hdr.innerHTML = `
        <span class="material-symbols-rounded ch-cat-arrow${collapsed ? ' collapsed' : ''}">expand_more</span>
        <span class="ch-cat-name">${esc(cat.name)}</span>
        ${isOwner ? `
          <button class="ch-cat-btn" title="Category options"
            onclick="event.stopPropagation(); window._ncCatMenu(event,'${esc(sid)}','${esc(cat.id)}','${esc(cat.name).replace(/'/g, "\\'")}')">
            <span class="material-symbols-rounded" style="font-size:15px">more_horiz</span>
          </button>
        ` : ''}
      `;

      // Channel container
      const container = document.createElement('div');
      container.className = 'ch-cat-channels' + (collapsed ? ' nc-collapsed' : '');
      container.id = 'nc-cat-' + cat.id;

      if (catBuckets[cat.id].length) {
        catBuckets[cat.id].forEach(ch => container.appendChild(buildChItem(ch, sid)));
      } else {
        const ph = document.createElement('div');
        ph.className = 'ch-cat-empty';
        ph.textContent = 'No channels — right-click a channel to move it here';
        container.appendChild(ph);
      }

      catEl.appendChild(hdr);
      catEl.appendChild(container);
      list.appendChild(catEl);
    });

    /* ── Uncategorized channels, grouped by type ── */
    if (uncategorized.length) {
      const groups = { text: [], voice: [], announce: [] };
      uncategorized.forEach(ch => (groups[ch.type] || groups.text).push(ch));
      ['text', 'announce', 'voice'].forEach(type => {
        if (!groups[type]?.length) return;
        const sec = document.createElement('div');
        const hdrEl = document.createElement('div');
        hdrEl.className = 'ch-sec-hdr';
        hdrEl.innerHTML = `
          <div><span>${secLabels[type]}</span></div>
          ${isOwner ? `<span class="ch-add-i icon sm" onclick="window.showAddCh()" title="Add channel">add</span>` : ''}
        `;
        sec.appendChild(hdrEl);
        groups[type].forEach(ch => sec.appendChild(buildChItem(ch, sid)));
        list.appendChild(sec);
      });
    }

    /* ── Add Category button for server owners ── */
    if (isOwner) {
      const btn = document.createElement('button');
      btn.className = 'nc-add-cat-btn';
      btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px">create_new_folder</span>Add Category';
      btn.onclick = () => window._ncAddCategory(sid);
      list.appendChild(btn);
    }
  };

  /** Toggle collapse state of a category */
  function _toggleCat(sid, catId, hdrEl) {
    const key = sid + catId;
    window._ncCatCollapsed[key] = !window._ncCatCollapsed[key];
    const collapsed = window._ncCatCollapsed[key];
    hdrEl.querySelector('.ch-cat-arrow')?.classList.toggle('collapsed', collapsed);
    const container = document.getElementById('nc-cat-' + catId);
    if (container) container.classList.toggle('nc-collapsed', collapsed);
  }

  /* ── Channel context menu (replaces module-private showChCtx for category items) ── */
  function ncChCtx(e, chid, sid) {
    const m = document.getElementById('ctx-menu');
    if (!m) return;
    m.innerHTML = '';

    const isOwner = window.allSrvs?.[sid]?.ownerId === me()?.uid || myP()?.isAdmin;
    const cats = window._ncCategories?.[sid] || [];

    function addI(icon, label, fn, cls) {
      const el = document.createElement('div');
      el.className = 'ctx-i' + (cls ? ' ' + cls : '');
      el.innerHTML = `<span class="icon sm">${icon}</span>${label}`;
      el.onclick = () => { m.classList.add('hidden'); fn(); };
      m.appendChild(el);
    }
    function addSep() {
      const el = document.createElement('div');
      el.style.cssText = 'height:1px;background:var(--md-outline-variant);margin:4px 8px';
      m.appendChild(el);
    }
    function addLbl(text) {
      const el = document.createElement('div');
      el.style.cssText = 'padding:3px 14px 2px;font-size:10px;font-weight:700;color:var(--md-on-surface-variant);text-transform:uppercase;letter-spacing:.06em';
      el.textContent = text;
      m.appendChild(el);
    }

    addI('tag',       'Copy channel name',     () => { navigator.clipboard?.writeText('#' + chid); window.showToast?.('📋 Copied'); });
    addI('push_pin',  'View pinned messages',  () => window.togglePinPanel?.());

    // ── Move to category ──
    if (isOwner && cats.length) {
      addSep();
      addLbl('Move to Category');
      cats.forEach(cat => {
        addI('folder', cat.name, async () => {
          const { updateDoc, doc } = await fs('updateDoc', 'doc');
          await updateDoc(doc(db(), 'servers', sid, 'channels', chid), { categoryId: cat.id }).catch(() => {});
          window.showToast?.(`📁 Moved to "${cat.name}"`);
          window.switchServer?.(sid);
        });
      });
      addI('folder_off', 'Remove from category', async () => {
        const { updateDoc, doc } = await fs('updateDoc', 'doc');
        await updateDoc(doc(db(), 'servers', sid, 'channels', chid), { categoryId: null }).catch(() => {});
        window.showToast?.('📁 Removed from category');
        window.switchServer?.(sid);
      });
    }

    // ── Mod actions ──
    if (isOwner) {
      addSep();
      addI('settings', 'Channel Settings', () => window.openChannelSettings?.(chid, sid));
      addI('timer', 'Set Slow Mode', async () => {
        const v = prompt('Slow mode (seconds, 0 to disable):', '0');
        if (v === null) return;
        const n = Math.max(0, parseInt(v) || 0);
        const { updateDoc, doc } = await fs('updateDoc', 'doc');
        await updateDoc(doc(db(), 'servers', sid, 'channels', chid), { slowMode: n }).catch(() => {});
        window.showToast?.(n ? `⏱️ Slow mode: ${n}s` : 'Slow mode disabled');
      });
      addI('edit', 'Edit Topic', async () => {
        const cur = document.getElementById('hch-topic')?.textContent || '';
        const t = prompt('Channel topic:', cur);
        if (t === null) return;
        const { updateDoc, doc } = await fs('updateDoc', 'doc');
        await updateDoc(doc(db(), 'servers', sid, 'channels', chid), { topic: t }).catch(() => {});
        const el = document.getElementById('hch-topic');
        if (el) el.textContent = t;
        window.showToast?.('✅ Topic updated');
      });
      addSep();
      addI('delete', 'Delete Channel', async () => {
        if (!confirm('Delete this channel? All messages will be lost.')) return;
        const { getDocs, deleteDoc, collection, doc } = await fs('getDocs', 'deleteDoc', 'collection', 'doc');
        const msgs = await getDocs(collection(db(), 'servers', sid, 'channels', chid, 'messages')).catch(() => null);
        if (msgs) for (const d of msgs.docs) await deleteDoc(d.ref).catch(() => {});
        await deleteDoc(doc(db(), 'servers', sid, 'channels', chid)).catch(() => {});
        window.showToast?.('🗑️ Channel deleted');
      }, 'red');
    }

    const vw = window.innerWidth, vh = window.innerHeight;
    m.classList.remove('hidden');
    const mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.min(e.clientX, vw - mw - 8) + 'px';
    m.style.top  = Math.min(e.clientY, vh - mh - 8) + 'px';
  }

  /* ── Category management helpers (all on window for onclick attrs) ── */

  window._ncCatMenu = function (e, sid, catId, catName) {
    const m = document.getElementById('ctx-menu');
    if (!m) return;
    m.innerHTML = '';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'padding:6px 14px 8px;font-size:11px;font-weight:700;color:var(--md-on-surface-variant);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--md-outline-variant);margin-bottom:4px';
    hdr.textContent = catName;
    m.appendChild(hdr);

    function addI(icon, label, fn, cls) {
      const el = document.createElement('div');
      el.className = 'ctx-i' + (cls ? ' ' + cls : '');
      el.innerHTML = `<span class="icon sm">${icon}</span>${label}`;
      el.onclick = () => { m.classList.add('hidden'); fn(); };
      m.appendChild(el);
    }

    addI('edit', 'Rename category',  () => window._ncRenameCategory(sid, catId, catName));
    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:var(--md-outline-variant);margin:4px 8px';
    m.appendChild(sep);
    addI('delete', 'Delete category', () => window._ncDeleteCategory(sid, catId), 'red');

    const vw = window.innerWidth, vh = window.innerHeight;
    m.classList.remove('hidden');
    const mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.min(e.clientX, vw - mw - 8) + 'px';
    m.style.top  = Math.min(e.clientY, vh - mh - 8) + 'px';
  };

  window._ncAddCategory = async function (sid) {
    const name = prompt('Category name:');
    if (!name?.trim()) return;
    try {
      const { addDoc, collection, serverTimestamp } = await fs('addDoc', 'collection', 'serverTimestamp');
      const cats = window._ncCategories[sid] || [];
      await addDoc(collection(db(), 'servers', sid, 'categories'), {
        name: name.trim(), order: cats.length, createdAt: serverTimestamp()
      });
      window.showToast?.('📁 Category created!');
      window.switchServer?.(sid);
    } catch (e) { window.showToast?.('❌ ' + e.message); }
  };

  window._ncRenameCategory = async function (sid, catId, oldName) {
    const name = prompt('Rename category:', oldName);
    if (!name?.trim() || name.trim() === oldName) return;
    try {
      const { updateDoc, doc } = await fs('updateDoc', 'doc');
      await updateDoc(doc(db(), 'servers', sid, 'categories', catId), { name: name.trim() });
      const el = document.querySelector(`[data-cat-id="${catId}"] .ch-cat-name`);
      if (el) el.textContent = name.trim();
      window.showToast?.('✅ Category renamed');
    } catch (e) { window.showToast?.('❌ ' + e.message); }
  };

  window._ncDeleteCategory = async function (sid, catId) {
    if (!confirm('Delete this category? Channels inside will become uncategorized.')) return;
    try {
      const { deleteDoc, getDocs, collection, doc, query, where, updateDoc } =
        await fs('deleteDoc', 'getDocs', 'collection', 'doc', 'query', 'where', 'updateDoc');
      const snap = await getDocs(
        query(collection(db(), 'servers', sid, 'channels'), where('categoryId', '==', catId))
      ).catch(() => null);
      if (snap) snap.forEach(d => updateDoc(d.ref, { categoryId: null }).catch(() => {}));
      await deleteDoc(doc(db(), 'servers', sid, 'categories', catId));
      window.showToast?.('🗑️ Category deleted');
      window.switchServer?.(sid);
    } catch (e) { window.showToast?.('❌ ' + e.message); }
  };


  /* =================================================================
   * FEATURE 2 — KEYBOARD SHORTCUTS PANEL
   * ================================================================= */

  const SHORTCUT_GROUPS = [
    {
      title: 'Navigation',
      rows: [
        { desc: 'Search messages',           keys: [['Ctrl','K']] },
        { desc: 'Open Settings',             keys: [['Ctrl', ',']] },
        { desc: 'Show keyboard shortcuts',   keys: [['?']] },
        { desc: 'Close modal / panel',       keys: [['Esc']] },
      ]
    },
    {
      title: 'Message Formatting',
      rows: [
        { desc: 'Bold',                      keys: [['Ctrl','B']] },
        { desc: 'Italic',                    keys: [['Ctrl','I']] },
        { desc: 'Open emoji picker',         keys: [['Ctrl','E']] },
        { desc: 'Toggle markdown preview',   keys: [['Ctrl','P']] },
        { desc: 'Send message',              keys: [['Enter']] },
        { desc: 'New line in message',       keys: [['Shift','Enter']] },
      ]
    },
    {
      title: 'Voice & Calls',
      rows: [
        { desc: 'Push to Talk (when enabled)', keys: [['Custom key']] },
        { desc: 'Toggle fullscreen',           keys: [['F11']] },
      ]
    },
    {
      title: 'Developer',
      rows: [
        { desc: 'Toggle Developer Console',  keys: [['Ctrl','Shift','J']] },
        { desc: 'Clear Dev Console',         keys: [['Ctrl','L']] },
      ]
    },
  ];

  window.ncOpenShortcuts = function () {
    if (document.getElementById('nc-kbd-ov')) { window.ncCloseShortcuts(); return; }

    const overlay = document.createElement('div');
    overlay.id = 'nc-kbd-ov';
    overlay.onclick = e => { if (e.target === overlay) window.ncCloseShortcuts(); };

    const modal = document.createElement('div');
    modal.className = 'nc-kbd-modal';
    modal.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px">
        <div>
          <h2 style="font-size:20px;font-weight:800;margin:0;letter-spacing:-.01em">Keyboard Shortcuts</h2>
          <div style="font-size:12px;color:var(--md-on-surface-variant);margin-top:4px">
            Press <span class="nc-key" style="font-size:10px">?</span> anywhere (outside a text field) to toggle
          </div>
        </div>
        <button onclick="window.ncCloseShortcuts()"
          style="width:36px;height:36px;border-radius:50%;border:none;background:var(--md-surface-2);cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--md-on-surface-variant);transition:background .15s"
          onmouseover="this.style.background='var(--md-surface-3)'"
          onmouseout="this.style.background='var(--md-surface-2)'">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
    `;

    SHORTCUT_GROUPS.forEach(group => {
      const sec = document.createElement('div');
      sec.className = 'nc-kbd-group';
      sec.innerHTML = `<div class="nc-kbd-group-title">${group.title}</div>`;

      group.rows.forEach(row => {
        const el = document.createElement('div');
        el.className = 'nc-kbd-row';
        const keysHtml = row.keys
          .map(combo => combo.map(k => `<span class="nc-key">${k}</span>`)
                              .join('<span class="nc-key-sep">+</span>'))
          .join('<span class="nc-key-sep" style="margin:0 6px">or</span>');
        el.innerHTML = `<span class="nc-kbd-desc">${row.desc}</span><div class="nc-kbd-keys">${keysHtml}</div>`;
        sec.appendChild(el);
      });

      modal.appendChild(sec);
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  };

  window.ncCloseShortcuts = function () {
    const ov = document.getElementById('nc-kbd-ov');
    if (!ov) return;
    ov.classList.add('nc-closing');
    setTimeout(() => ov.remove(), 150);
  };

  // `?` key trigger — skip when focus is inside any text input
  document.addEventListener('keydown', e => {
    if (e.key !== '?') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.contentEditable === 'true') return;
    e.preventDefault();
    window.ncOpenShortcuts();
  });

  // Inject keyboard button into the chat header toolbar
  function _injectShortcutsBtn() {
    if (document.getElementById('nc-shortcuts-hdr-btn')) return;
    const hdr = document.getElementById('chat-hdr');
    if (!hdr) return;
    const btn = document.createElement('button');
    btn.id        = 'nc-shortcuts-hdr-btn';
    btn.className = 'hdr-btn';
    btn.title     = 'Keyboard Shortcuts (?)';
    btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px">keyboard</span>';
    btn.onclick   = window.ncOpenShortcuts;
    // Insert as first action button in the header
    const firstBtn = hdr.querySelector('.hdr-btn');
    if (firstBtn) hdr.insertBefore(btn, firstBtn);
    else hdr.appendChild(btn);
  }
  setTimeout(_injectShortcutsBtn, 400);


  /* =================================================================
   * FEATURE 3 — WEBHOOK INTEGRATIONS
   * ================================================================= */

  /** Injects the Webhooks tab + panel into the Server Settings modal. */
  function _injectWebhookTab() {
    if (document.getElementById('srv-tab-webhooks')) return;
    const tabBar    = document.querySelector('#m-srv-settings .mdm > div:nth-child(2)');
    const panelWrap = document.getElementById('srv-panel-general')?.parentElement;
    if (!tabBar || !panelWrap) return;

    // ── Tab button ──
    const tabBtn = document.createElement('button');
    tabBtn.id        = 'srv-tab-webhooks';
    tabBtn.className = 'av-tab';
    tabBtn.style.borderRadius = '8px 8px 0 0';
    tabBtn.textContent = '🔗 Webhooks';
    tabBtn.onclick = () => window.switchSrvTab?.('webhooks');
    tabBar.appendChild(tabBtn);

    // ── Panel ──
    const panel = document.createElement('div');
    panel.id = 'srv-panel-webhooks';
    panel.style.cssText = 'display:none;overflow-y:auto;flex:1;flex-direction:column;gap:14px;padding:2px';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <div style="font-size:15px;font-weight:700">Webhooks</div>
          <div style="font-size:12px;color:var(--md-on-surface-variant);margin-top:2px">
            Post messages to channels from external services
          </div>
        </div>
        <button class="mdb mdb-fill" style="padding:8px 14px;font-size:13px;height:auto;flex-shrink:0"
          onclick="window.ncOpenCreateWebhook()">
          <span class="material-symbols-rounded" style="font-size:15px;vertical-align:middle">add</span> New Webhook
        </button>
      </div>
      <div class="nc-info-box" style="flex-shrink:0">
        <strong>How it works:</strong> Copy the webhook URL below. Load it in a browser or HTTP client
        with <code>&amp;msg=Your+text+here</code> appended to post a message to the target channel.
        Works with Zapier, Make, curl, or any service that can send a GET request.
      </div>
      <div id="nc-wh-list" style="flex:1"></div>
    `;
    panelWrap.appendChild(panel);

    // ── Extend switchSrvTab to handle this new tab ──
    const _prev = window.switchSrvTab;
    window.switchSrvTab = function (tab) {
      _prev?.(tab);
      const p = document.getElementById('srv-panel-webhooks');
      const b = document.getElementById('srv-tab-webhooks');
      if (p) p.style.display = tab === 'webhooks' ? 'flex' : 'none';
      if (b) {
        b.classList.toggle('on', tab === 'webhooks');
        b.style.borderBottom = tab === 'webhooks' ? '3px solid var(--md-primary)' : '';
        b.style.marginBottom = tab === 'webhooks' ? '-2px' : '';
        if (tab === 'webhooks') _loadWebhooks(window.srvSettingsTargetId);
      }
    };
  }

  async function _loadWebhooks(sid) {
    const list = document.getElementById('nc-wh-list');
    if (!list || !sid) return;
    list.innerHTML = '<div style="color:var(--md-on-surface-variant);font-size:13px;padding:8px 0">Loading…</div>';
    try {
      const { getDocs, collection } = await fs('getDocs', 'collection');
      const snap = await getDocs(collection(db(), 'servers', sid, 'webhooks'));
      const hooks = [];
      snap.forEach(d => hooks.push({ id: d.id, ...d.data() }));

      if (!hooks.length) {
        list.innerHTML = `
          <div class="nc-empty">
            <span class="icon">webhook</span>
            <div class="nc-empty-title">No webhooks or bots yet</div>
            <div class="nc-empty-sub">Create one to connect external services or a Bot Builder bot</div>
          </div>`;
        return;
      }

      list.innerHTML = '';
      hooks.forEach(wh => {
        const item = document.createElement('div');
        item.className = 'nc-feat-item';

        if (wh.type === 'bot') {
          // ── Bot Builder entry ──
          const tokenDisplay = wh.botAuthToken
            ? wh.botAuthToken.slice(0, 12) + '••••••••••••••••••••'
            : '⚠️ No token — re-add this bot to set one';
          const tokenTitle = wh.botAuthToken
            ? 'Token registered — only this bot can post to this server'
            : 'No auth token set. Delete and re-add this bot to register a token.';
          item.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px">
              <div class="nc-feat-icon" style="background:rgba(34,232,122,.12);color:#22e87a">
                🤖
              </div>
              <div style="flex:1;min-width:0">
                <div class="nc-feat-name">${esc(wh.name)}</div>
                <div class="nc-feat-sub">Bot Builder bot · listens in <strong>#${esc(wh.channelName || wh.channelId)}</strong></div>
              </div>
              <button class="nc-del-btn" title="Remove bot"
                onclick="window.ncDeleteWebhook('${esc(sid)}','${wh.id}')">
                <span class="material-symbols-rounded" style="font-size:18px">delete</span>
              </button>
            </div>
            <div class="nc-url-row" style="margin-top:10px">
              <span style="font-size:11px;color:var(--md-on-surface-variant);flex-shrink:0;font-family:'JetBrains Mono',monospace">Server ID:</span>
              <input class="nc-url-inp" readonly value="${esc(sid)}" onclick="this.select()" title="Paste this into the Bot Builder">
              <button class="nc-copy-btn"
                onclick="window._ncCopySid('${esc(sid)}')">
                Copy ID
              </button>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:7px 10px;border-radius:10px;background:${wh.botAuthToken ? 'rgba(181,109,255,.08)' : 'rgba(255,92,92,.08)'};border:1.5px solid ${wh.botAuthToken ? 'rgba(181,109,255,.25)' : 'rgba(255,92,92,.25)'}">
              <span style="font-size:14px">${wh.botAuthToken ? '🛡' : '⚠️'}</span>
              <span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:${wh.botAuthToken ? '#b56dff' : '#ff8a8a'};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(tokenTitle)}">${esc(tokenDisplay)}</span>
              <span style="font-size:10px;font-weight:700;color:${wh.botAuthToken ? '#22e87a' : '#ff8a8a'};flex-shrink:0">${wh.botAuthToken ? '✓ LOCKED' : 'NO TOKEN'}</span>
            </div>
          `;
        } else {
          // ── Standard webhook entry ──
          const baseUrl   = `${location.origin}${location.pathname}?wh_id=${wh.id}&wh_srv=${sid}&wh_token=${wh.token}`;
          const sampleUrl = baseUrl + '&msg=Hello+from+webhook';
          item.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px">
              <div class="nc-feat-icon">
                <span class="material-symbols-rounded">webhook</span>
              </div>
              <div style="flex:1;min-width:0">
                <div class="nc-feat-name">${esc(wh.name)}</div>
                <div class="nc-feat-sub">Posts to <strong>#${esc(wh.channelName || wh.channelId)}</strong></div>
              </div>
              <button class="nc-del-btn" title="Delete webhook"
                onclick="window.ncDeleteWebhook('${esc(sid)}','${wh.id}')">
                <span class="material-symbols-rounded" style="font-size:18px">delete</span>
              </button>
            </div>
            <div class="nc-url-row">
              <input class="nc-url-inp" readonly
                value="${esc(sampleUrl)}"
                onclick="this.select()"
                title="Replace the msg= value with your message text">
              <button class="nc-copy-btn"
                onclick="navigator.clipboard.writeText('${esc(baseUrl)}&msg=').then(()=>window.showToast?.('🔗 Base URL copied — append &amp;msg=your+message'))">
                Copy URL
              </button>
            </div>
          `;
        }
        list.appendChild(item);
      });
    } catch (e) {
      list.innerHTML = `<div style="color:var(--md-error);font-size:13px">Failed to load: ${esc(e.message)}</div>`;
    }
  }

  window.ncOpenCreateWebhook = async function () {
    let modal = document.getElementById('nc-m-create-wh');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'nc-m-create-wh';
      modal.className = 'mdov hidden';
      modal.style.zIndex = '10001';
      modal.innerHTML = `
        <div class="mdm" style="width:min(460px,95vw);gap:16px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <h2 style="font-size:18px;font-weight:800" id="nc-wh-modal-title">🔗 New Webhook</h2>
            <button class="sb-icon" onclick="document.getElementById('nc-m-create-wh').classList.add('hidden')">
              <span class="icon sm">close</span>
            </button>
          </div>

          <!-- Type toggle -->
          <div style="display:flex;gap:8px;background:var(--md-surface-2);border-radius:12px;padding:4px">
            <button id="nc-wh-type-webhook" onclick="window._ncWhSetType('webhook')"
              style="flex:1;padding:8px;border-radius:9px;border:none;cursor:pointer;font-weight:700;font-size:13px;font-family:inherit;transition:all .15s;background:var(--md-primary);color:#fff">
              🔗 Webhook
            </button>
            <button id="nc-wh-type-bot" onclick="window._ncWbSetType('bot')"
              style="flex:1;padding:8px;border-radius:9px;border:none;cursor:pointer;font-weight:700;font-size:13px;font-family:inherit;transition:all .15s;background:transparent;color:var(--md-on-surface-variant)">
              🤖 Bot Builder
            </button>
          </div>

          <div class="fld">
            <label id="nc-wh-name-lbl">Webhook Name</label>
            <input class="mdi" id="nc-wh-name" placeholder="e.g. GitHub CI Alerts" maxlength="60"/>
          </div>
          <div class="fld">
            <label>Channel</label>
            <select class="mdi" id="nc-wh-channel"
              style="padding:10px 12px;font-family:inherit;background:var(--md-surface);color:var(--md-on-surface)">
              <option disabled>Loading channels…</option>
            </select>
          </div>

          <!-- Bot Builder info box (hidden by default) -->
          <div id="nc-wh-bot-info" style="display:none;background:rgba(34,232,122,.08);border:1.5px solid rgba(34,232,122,.25);border-radius:14px;padding:13px 15px;font-size:12px;line-height:1.7;color:var(--md-on-surface)">
            <strong>How to connect your Bot Builder bot:</strong><br>
            1. Open the Bot Builder and build your bot flow.<br>
            2. Copy the <strong>Server ID</strong> shown below into the trigger block.<br>
            3. Copy your <strong>Bot Auth Token</strong> (purple badge in the toolbar) into the field below.<br>
            4. Click <em>Run Bot</em> — only this bot's token will be allowed to post here.<br>
            <div style="margin-top:10px;display:flex;align-items:center;gap:8px;background:var(--md-surface-2);border:1.5px solid var(--md-outline);border-radius:10px;padding:7px 10px">
              <span style="font-size:11px;color:var(--md-on-surface-variant);font-family:'JetBrains Mono',monospace;flex-shrink:0">Server ID:</span>
              <input id="nc-wh-srv-id-display" class="nc-url-inp" readonly style="cursor:text" onclick="this.select()">
              <button class="nc-copy-btn" onclick="window._ncCopySid(document.getElementById('nc-wh-srv-id-display').value)">Copy</button>
            </div>
          </div>

          <!-- Bot Auth Token field (only visible when type=bot) -->
          <div id="nc-wh-bot-token-wrap" style="display:none" class="fld">
            <label style="display:flex;align-items:center;gap:6px">
              🛡 Bot Auth Token
              <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:100px;background:rgba(181,109,255,.12);color:#b56dff;font-family:'JetBrains Mono',monospace">required</span>
            </label>
            <input class="mdi" id="nc-wh-bot-token"
              placeholder="nxbt_..."
              maxlength="37"
              style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.02em"
              autocomplete="off" spellcheck="false"/>
            <div style="font-size:11px;color:var(--md-on-surface-variant);margin-top:5px;line-height:1.6">
              Find this in the Bot Builder toolbar — the purple <strong>🛡 Bot Auth Token</strong> badge. Only the bot with this exact token can post to this server. Any other token is rejected.
            </div>
          </div>

          <div class="auth-err" id="nc-wh-err" style="min-height:0"></div>
          <div class="modal-acts">
            <button class="mdb mdb-text"
              onclick="document.getElementById('nc-m-create-wh').classList.add('hidden')">Cancel</button>
            <button class="mdb mdb-fill" onclick="window.ncCreateWebhook()">
              <span class="icon sm">add</span><span id="nc-wh-create-lbl">Create Webhook</span>
            </button>
          </div>
        </div>
      `;
      modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
      document.body.appendChild(modal);
    }

    // Reset to webhook type
    window._ncWbSetType('webhook');
    document.getElementById('nc-wh-name').value = '';
    document.getElementById('nc-wh-err').textContent = '';
    const _tokInp = document.getElementById('nc-wh-bot-token');
    if (_tokInp) _tokInp.value = '';

    // Fetch channels from Firestore directly (fixes stale-cache bug)
    const sid = window.srvSettingsTargetId;
    const sel = document.getElementById('nc-wh-channel');
    sel.innerHTML = '<option disabled>Loading channels…</option>';
    try {
      const { getDocs, collection } = await fs('getDocs', 'collection');
      const snap = await getDocs(collection(db(), 'servers', sid, 'channels'));
      const chs = [];
      snap.forEach(d => chs.push({ id: d.id, ...d.data() }));
      const textChs = chs.filter(c => (c.type || 'text') !== 'voice');
      sel.innerHTML = textChs.length
        ? textChs.map(ch => `<option value="${esc(ch.id)}" data-name="${esc(ch.name)}">#${esc(ch.name)}</option>`).join('')
        : '<option disabled>No text channels found</option>';
    } catch (e) {
      sel.innerHTML = '<option disabled>Error loading channels</option>';
    }

    // Fill server ID display
    const sidDisp = document.getElementById('nc-wh-srv-id-display');
    if (sidDisp) sidDisp.value = sid || '';

    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('nc-wh-name')?.focus(), 80);
  };

  // Type switcher helper (on window so inline onclick can call it)
  window._ncCopySid = function (id) {
    navigator.clipboard.writeText(id).then(() => window.showToast?.('✅ Server ID copied!'));
  };

  window._ncWbSetType = function (type) {
    window._ncWbCurrentType = type;
    const isBot = type === 'bot';
    const wBtn  = document.getElementById('nc-wh-type-webhook');
    const bBtn  = document.getElementById('nc-wh-type-bot');
    const info  = document.getElementById('nc-wh-bot-info');
    const title = document.getElementById('nc-wh-modal-title');
    const lbl   = document.getElementById('nc-wh-name-lbl');
    const crlbl = document.getElementById('nc-wh-create-lbl');
    const tokWrap = document.getElementById('nc-wh-bot-token-wrap');
    if (wBtn) { wBtn.style.background = isBot ? 'transparent' : 'var(--md-primary)'; wBtn.style.color = isBot ? 'var(--md-on-surface-variant)' : '#fff'; }
    if (bBtn) { bBtn.style.background = isBot ? 'rgba(34,232,122,.18)' : 'transparent'; bBtn.style.color = isBot ? '#22e87a' : 'var(--md-on-surface-variant)'; }
    if (info)    info.style.display    = isBot ? 'block' : 'none';
    if (tokWrap) tokWrap.style.display = isBot ? 'block' : 'none';
    if (title) title.textContent   = isBot ? '🤖 Add Bot Builder Bot' : '🔗 New Webhook';
    if (lbl)   lbl.textContent     = isBot ? 'Bot Name' : 'Webhook Name';
    if (crlbl) crlbl.textContent   = isBot ? 'Add Bot' : 'Create Webhook';
    document.getElementById('nc-wh-name').placeholder = isBot ? 'e.g. NexusBot' : 'e.g. GitHub CI Alerts';
    // Clear token field on type change
    const tokInp = document.getElementById('nc-wh-bot-token');
    if (tokInp) tokInp.value = '';
  };

  window.ncCreateWebhook = async function () {
    const name      = document.getElementById('nc-wh-name')?.value.trim();
    const selEl     = document.getElementById('nc-wh-channel');
    const channelId = selEl?.value;
    const channelName = selEl?.options[selEl.selectedIndex]?.dataset.name || channelId;
    const errEl     = document.getElementById('nc-wh-err');
    const sid       = window.srvSettingsTargetId;
    const isBot     = window._ncWbCurrentType === 'bot';

    if (!name)      { errEl.textContent = 'Name is required'; return; }
    if (!channelId) { errEl.textContent = 'Select a channel'; return; }
    errEl.textContent = '';
    try {
      const { addDoc, collection, serverTimestamp } = await fs('addDoc', 'collection', 'serverTimestamp');

      if (isBot) {
        // Validate bot auth token
        const botAuthToken = (document.getElementById('nc-wh-bot-token')?.value || '').trim();
        if (!botAuthToken) { errEl.textContent = 'Bot Auth Token is required — copy it from the 🛡 badge in Bot Builder'; return; }
        if (!/^nxbt_[a-z0-9]{32}$/.test(botAuthToken)) {
          errEl.textContent = 'Invalid token format. It should look like: nxbt_ followed by 32 characters. Copy it exactly from Bot Builder.';
          return;
        }
        await addDoc(collection(db(), 'servers', sid, 'webhooks'), {
          name, channelId, channelName,
          type: 'bot',
          botAuthToken,
          createdBy: me()?.uid,
          createdAt: serverTimestamp()
        });
        document.getElementById('nc-m-create-wh').classList.add('hidden');
        window.showToast?.('🤖 Bot added! Copy the Server ID from the list and paste it into your Bot Builder. Only this bot token can access this server.');
        // Restart token enforcement for the server with the new token
        _startBotTokenEnforcement(sid);
      } else {
        const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
          .map(b => b.toString(16).padStart(2, '0')).join('');
        await addDoc(collection(db(), 'servers', sid, 'webhooks'), {
          name, channelId, channelName, token,
          type: 'webhook',
          createdBy: me()?.uid,
          createdAt: serverTimestamp()
        });
        document.getElementById('nc-m-create-wh').classList.add('hidden');
        window.showToast?.('✅ Webhook created!');
      }
      _loadWebhooks(sid);
    } catch (e) { document.getElementById('nc-wh-err').textContent = 'Failed: ' + e.message; }
  };

  /* ── Bot Token Enforcement ───────────────────────────────────────────
   * Loads all registered bot tokens for a server, then watches every
   * text channel for incoming bot messages. Any message whose
   * botAuthToken doesn't match a registered token is deleted immediately.
   * ─────────────────────────────────────────────────────────────────── */

  /** Map of sid → array of active unsubscribe functions */
  const _botWatcherUnsubscribers = {};

  /** Validate a token string matches the Bot Builder format. */
  function _isValidBotToken(tok) {
    return typeof tok === 'string' && /^nxbt_[a-z0-9]{32}$/.test(tok);
  }

  /**
   * Start (or restart) enforcement for a server.
   * Tears down any previous watchers for that sid first.
   */
  async function _startBotTokenEnforcement(sid) {
    if (!sid || sid === 'home' || sid === '__home__') return;

    // Tear down old watchers for this server
    if (_botWatcherUnsubscribers[sid]) {
      _botWatcherUnsubscribers[sid].forEach(fn => { try { fn(); } catch (e) {} });
      delete _botWatcherUnsubscribers[sid];
    }

    if (!db()) return;

    try {
      const { getDocs, onSnapshot, deleteDoc, collection, doc } =
        await fs('getDocs', 'onSnapshot', 'deleteDoc', 'collection', 'doc');

      // Build the set of valid tokens for this server
      const whSnap = await getDocs(collection(db(), 'servers', sid, 'webhooks'));
      const validTokens = new Set();
      whSnap.forEach(d => {
        const wh = d.data();
        if (wh.type === 'bot' && _isValidBotToken(wh.botAuthToken)) {
          validTokens.add(wh.botAuthToken);
        }
      });

      // If no bots with tokens are registered, nothing to enforce
      if (validTokens.size === 0) return;

      // Get all channels for this server
      const chSnap = await getDocs(collection(db(), 'servers', sid, 'channels'));
      const unsubs = [];

      chSnap.forEach(chDoc => {
        const chId = chDoc.id;
        // Watch this channel's messages for new bot messages
        const unsub = onSnapshot(
          collection(db(), 'servers', sid, 'channels', chId, 'messages'),
          snap => {
            snap.docChanges().forEach(change => {
              if (change.type !== 'added') return;
              const msg = change.doc.data();
              // Only inspect bot-authored messages
              if (!msg.isBot && !msg.botAuthToken) return;
              // A message is "bot-authored" if it has a botAuthToken field
              if (!msg.botAuthToken) return;
              // If the token doesn't match any registered token, delete the message
              if (!validTokens.has(msg.botAuthToken)) {
                deleteDoc(doc(db(), 'servers', sid, 'channels', chId, 'messages', change.doc.id))
                  .catch(() => {}); // silent — may lack permission on some setups
                console.warn(`[NexusChat patch] Rejected bot message in #${chId} — unregistered token`);
              }
            });
          },
          () => {} // ignore listener errors silently
        );
        unsubs.push(unsub);
      });

      _botWatcherUnsubscribers[sid] = unsubs;
      console.log(`[NexusChat patch] 🛡 Bot token enforcement active for server ${sid} — ${validTokens.size} token(s) registered, watching ${unsubs.length} channel(s)`);
    } catch (e) {
      console.warn('[NexusChat patch] Bot enforcement setup failed:', e.message);
    }
  }

  /** Expose so external code (or the console) can trigger a refresh. */
  window._ncRefreshBotEnforcement = _startBotTokenEnforcement;

  window.ncDeleteWebhook = async function (sid, whId) {
    if (!confirm('Delete this webhook? Services using it will stop working immediately.')) return;
    try {
      const { deleteDoc, doc } = await fs('deleteDoc', 'doc');
      await deleteDoc(doc(db(), 'servers', sid, 'webhooks', whId));
      window.showToast?.('🗑️ Webhook deleted');
      _loadWebhooks(sid);
      // Re-run enforcement so the deleted bot's token is no longer trusted
      _startBotTokenEnforcement(sid);
    } catch (e) { window.showToast?.('❌ ' + e.message); }
  };

  /** Runs on page load — checks URL params for an inbound webhook trigger. */
  async function _processInboundWebhook() {
    const p   = new URLSearchParams(location.search);
    const id  = p.get('wh_id'),  srv = p.get('wh_srv');
    const tok = p.get('wh_token'), msg = p.get('msg') || p.get('wh_msg');
    if (!id || !srv || !tok || !msg) return;
    history.replaceState({}, '', location.pathname);
    waitForApp(async () => {
      try {
        const { getDoc, doc, addDoc, collection, serverTimestamp } =
          await fs('getDoc', 'doc', 'addDoc', 'collection', 'serverTimestamp');
        const snap = await getDoc(doc(db(), 'servers', srv, 'webhooks', id));
        if (!snap.exists() || snap.data().token !== tok) {
          window.showToast?.('❌ Invalid webhook token'); return;
        }
        const wh = snap.data();
        await addDoc(collection(db(), 'servers', srv, 'channels', wh.channelId, 'messages'), {
          text: decodeURIComponent(msg),
          authorId:   'webhook_' + id,
          authorName: wh.name || 'Webhook',
          authorAvatar: '🔗',
          isWebhook: true,
          createdAt: serverTimestamp(),
          edited: false
        });
        window.showToast?.(`🔗 Webhook posted to #${wh.channelId}`);
      } catch (e) { window.showToast?.('❌ Webhook error: ' + e.message); }
    });
  }


  /* =================================================================
   * FEATURE 4 — INVITE LINKS WITH EXPIRY + MAX USES
   * ================================================================= */

  function _injectInviteTab() {
    if (document.getElementById('srv-tab-invites')) return;
    const tabBar    = document.querySelector('#m-srv-settings .mdm > div:nth-child(2)');
    const panelWrap = document.getElementById('srv-panel-general')?.parentElement;
    if (!tabBar || !panelWrap) return;

    // ── Tab button ──
    const tabBtn = document.createElement('button');
    tabBtn.id        = 'srv-tab-invites';
    tabBtn.className = 'av-tab';
    tabBtn.style.borderRadius = '8px 8px 0 0';
    tabBtn.textContent = '✉️ Invites';
    tabBtn.onclick = () => window.switchSrvTab?.('invites');
    tabBar.appendChild(tabBtn);

    // ── Panel ──
    const panel = document.createElement('div');
    panel.id = 'srv-panel-invites';
    panel.style.cssText = 'display:none;overflow-y:auto;flex:1;flex-direction:column;gap:14px;padding:2px';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <div style="font-size:15px;font-weight:700">Invite Links</div>
          <div style="font-size:12px;color:var(--md-on-surface-variant);margin-top:2px">
            Create time-limited or use-capped invite links
          </div>
        </div>
        <button class="mdb mdb-fill" style="padding:8px 14px;font-size:13px;height:auto;flex-shrink:0"
          onclick="window.ncOpenCreateInvite()">
          <span class="material-symbols-rounded" style="font-size:15px;vertical-align:middle">add_link</span> Create Invite
        </button>
      </div>
      <div id="nc-inv-list" style="flex:1"></div>
    `;
    panelWrap.appendChild(panel);

    const _prev2 = window.switchSrvTab;
    window.switchSrvTab = function (tab) {
      _prev2?.(tab);
      const p = document.getElementById('srv-panel-invites');
      const b = document.getElementById('srv-tab-invites');
      if (p) p.style.display = tab === 'invites' ? 'flex' : 'none';
      if (b) {
        b.classList.toggle('on', tab === 'invites');
        b.style.borderBottom = tab === 'invites' ? '3px solid var(--md-primary)' : '';
        b.style.marginBottom = tab === 'invites' ? '-2px' : '';
        if (tab === 'invites') _loadInvites(window.srvSettingsTargetId);
      }
    };
  }

  async function _loadInvites(sid) {
    const list = document.getElementById('nc-inv-list');
    if (!list || !sid) return;
    list.innerHTML = '<div style="color:var(--md-on-surface-variant);font-size:13px;padding:8px 0">Loading…</div>';
    try {
      const { getDocs, collection } = await fs('getDocs', 'collection');
      const snap = await getDocs(collection(db(), 'servers', sid, 'timed_invites'));
      const invites = [];
      snap.forEach(d => invites.push({ id: d.id, ...d.data() }));
      invites.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

      if (!invites.length) {
        list.innerHTML = `
          <div class="nc-empty">
            <span class="icon">mail</span>
            <div class="nc-empty-title">No timed invites yet</div>
            <div class="nc-empty-sub">Create one with a custom expiry and use limit</div>
          </div>`;
        return;
      }

      list.innerHTML = '';
      const now = Date.now();

      invites.forEach(inv => {
        const expiryMs = inv.expiresAt?.toMillis?.() ?? null;
        const expired  = expiryMs !== null && expiryMs < now;
        const usedUp   = inv.maxUses > 0 && (inv.useCount || 0) >= inv.maxUses;
        const active   = !expired && !usedUp;

        const url = `${location.origin}${location.pathname}?tinv=${inv.id}&srv=${sid}`;

        let expiryStr = '● Never expires';
        if (expiryMs) {
          const d = new Date(expiryMs);
          expiryStr = expired
            ? `Expired ${d.toLocaleDateString()}`
            : `Expires ${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        const usesStr = inv.maxUses > 0
          ? `${inv.useCount || 0} / ${inv.maxUses} uses`
          : `${inv.useCount || 0} uses · unlimited`;

        const badgeCls   = active ? 'nc-inv-active' : expired ? 'nc-inv-expired' : 'nc-inv-used';
        const badgeLbl   = active ? '● Active' : expired ? 'Expired' : 'Max uses reached';

        const item = document.createElement('div');
        item.className = 'nc-feat-item';
        item.innerHTML = `
          <div style="display:flex;align-items:flex-start;gap:12px">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px">
                <span style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:var(--md-primary)">${inv.id.slice(0, 8)}…</span>
                <span class="nc-inv-badge ${badgeCls}">${badgeLbl}</span>
              </div>
              <div style="font-size:12px;color:var(--md-on-surface-variant);display:flex;gap:10px;flex-wrap:wrap">
                <span>${expiryStr}</span>
                <span style="opacity:.4">·</span>
                <span>${usesStr}</span>
              </div>
              ${active ? `
              <div class="nc-url-row" style="margin-top:10px">
                <input class="nc-url-inp" readonly value="${esc(url)}" onclick="this.select()">
                <button class="nc-copy-btn"
                  onclick="navigator.clipboard.writeText('${esc(url)}').then(()=>window.showToast?.('🔗 Invite link copied!'))">
                  Copy
                </button>
              </div>` : ''}
            </div>
            <button class="nc-del-btn" title="Revoke invite"
              onclick="window.ncRevokeInvite('${esc(sid)}','${inv.id}')">
              <span class="material-symbols-rounded" style="font-size:18px">link_off</span>
            </button>
          </div>
        `;
        list.appendChild(item);
      });
    } catch (e) {
      list.innerHTML = `<div style="color:var(--md-error);font-size:13px">Failed to load invites: ${esc(e.message)}</div>`;
    }
  }

  window.ncOpenCreateInvite = function () {
    let modal = document.getElementById('nc-m-create-inv');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'nc-m-create-inv';
      modal.className = 'mdov hidden';
      modal.style.zIndex = '10001';
      modal.innerHTML = `
        <div class="mdm" style="width:min(430px,95vw);gap:20px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <h2 style="font-size:18px;font-weight:800">✉️ Create Invite Link</h2>
            <button class="sb-icon"
              onclick="document.getElementById('nc-m-create-inv').classList.add('hidden')">
              <span class="icon sm">close</span>
            </button>
          </div>

          <div>
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--md-on-surface-variant);margin-bottom:10px">
              Expires After
            </div>
            <div id="nc-inv-expiry" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
              <button class="nc-opt" data-val="1h">1 hour</button>
              <button class="nc-opt" data-val="12h">12 hours</button>
              <button class="nc-opt" data-val="1d">1 day</button>
              <button class="nc-opt nc-sel" data-val="7d">7 days</button>
              <button class="nc-opt" data-val="30d">30 days</button>
              <button class="nc-opt" data-val="never">Never</button>
            </div>
          </div>

          <div>
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--md-on-surface-variant);margin-bottom:10px">
              Max Uses
            </div>
            <div id="nc-inv-uses" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
              <button class="nc-opt" data-val="1">1 use</button>
              <button class="nc-opt" data-val="5">5 uses</button>
              <button class="nc-opt" data-val="10">10 uses</button>
              <button class="nc-opt" data-val="25">25 uses</button>
              <button class="nc-opt" data-val="100">100 uses</button>
              <button class="nc-opt nc-sel" data-val="0">Unlimited</button>
            </div>
          </div>

          <div class="auth-err" id="nc-inv-err" style="min-height:0"></div>
          <div class="modal-acts">
            <button class="mdb mdb-text"
              onclick="document.getElementById('nc-m-create-inv').classList.add('hidden')">Cancel</button>
            <button class="mdb mdb-fill" onclick="window.ncCreateTimedInvite()">
              <span class="icon sm">add_link</span>Generate Link
            </button>
          </div>
        </div>
      `;
      // Delegated click handler for option pickers
      modal.addEventListener('click', e => {
        const btn = e.target.closest('.nc-opt');
        if (!btn) return;
        const group = btn.closest('[id^="nc-inv-"]');
        if (!group) return;
        group.querySelectorAll('.nc-opt').forEach(b => b.classList.remove('nc-sel'));
        btn.classList.add('nc-sel');
      });
      modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
      document.body.appendChild(modal);
    }
    document.getElementById('nc-inv-err').textContent = '';
    modal.classList.remove('hidden');
  };

  window.ncCreateTimedInvite = async function () {
    const errEl    = document.getElementById('nc-inv-err');
    const sid      = window.srvSettingsTargetId;
    const expVal   = document.querySelector('#nc-inv-expiry .nc-opt.nc-sel')?.dataset.val || 'never';
    const maxUses  = parseInt(document.querySelector('#nc-inv-uses .nc-opt.nc-sel')?.dataset.val ?? '0');

    const EXPIRY_MS = { '1h': 3.6e6, '12h': 4.32e7, '1d': 8.64e7, '7d': 6.048e8, '30d': 2.592e9 };
    const expiresAt = expVal !== 'never' ? new Date(Date.now() + EXPIRY_MS[expVal]) : null;

    try {
      const { addDoc, collection, serverTimestamp, Timestamp } =
        await fs('addDoc', 'collection', 'serverTimestamp', 'Timestamp');
      await addDoc(collection(db(), 'servers', sid, 'timed_invites'), {
        createdBy: me()?.uid,
        createdAt: serverTimestamp(),
        maxUses,
        useCount: 0,
        expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null,
      });
      document.getElementById('nc-m-create-inv').classList.add('hidden');
      window.showToast?.('✅ Invite link created!');
      _loadInvites(sid);
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
  };

  window.ncRevokeInvite = async function (sid, invId) {
    if (!confirm('Revoke this invite link? It will stop working immediately.')) return;
    try {
      const { deleteDoc, doc } = await fs('deleteDoc', 'doc');
      await deleteDoc(doc(db(), 'servers', sid, 'timed_invites', invId));
      window.showToast?.('🔗 Invite revoked');
      _loadInvites(sid);
    } catch (e) { window.showToast?.('❌ ' + e.message); }
  };

  /** Runs on page load — checks URL params for a timed invite. */
  async function _processInboundInvite() {
    const p     = new URLSearchParams(location.search);
    const invId = p.get('tinv'), sid = p.get('srv');
    if (!invId || !sid) return;
    history.replaceState({}, '', location.pathname);
    sessionStorage.setItem('nc_pending_tinvite', JSON.stringify({ invId, sid }));

    // Resolve after auth is ready
    window._ncResolvePendingInvite = async function () {
      const raw = sessionStorage.getItem('nc_pending_tinvite');
      if (!raw) return;
      let pending;
      try { pending = JSON.parse(raw); } catch (e) { return; }
      sessionStorage.removeItem('nc_pending_tinvite');

      waitForApp(async () => {
        try {
          const { getDoc, doc } = await fs('getDoc', 'doc');
          const invSnap = await getDoc(doc(db(), 'servers', pending.sid, 'timed_invites', pending.invId));
          if (!invSnap.exists()) { window.showToast?.('❌ Invite not found or was revoked'); return; }

          const inv    = invSnap.data();
          const expiry = inv.expiresAt?.toMillis?.() ?? null;
          if (expiry && expiry < Date.now()) { window.showToast?.('❌ This invite has expired'); return; }
          if (inv.maxUses > 0 && (inv.useCount || 0) >= inv.maxUses) {
            window.showToast?.('❌ This invite has reached its maximum uses'); return;
          }

          // Load server data
          const srvSnap = await getDoc(doc(db(), 'servers', pending.sid));
          if (!srvSnap.exists()) { window.showToast?.('❌ Server not found'); return; }
          const srv = { id: pending.sid, ...srvSnap.data() };

          // Already a member?
          const joined = myP()?.joinedServers || [];
          if (joined.includes(pending.sid) || srv.ownerId === me()?.uid) {
            window.showToast?.("✅ You're already in this server!");
            await window.loadServers?.();
            window.switchServer?.(pending.sid);
            return;
          }

          // Stash for use-count increment after join
          window._ncPendingTimedInv = { sid: pending.sid, invId: pending.invId };

          // Reuse the existing Server-invite join modal
          window._pendingInviteSrv = srv;
          const icon   = srv.icon || '🏠';
          const banner = document.getElementById('srv-invite-banner');
          if (banner) {
            banner.style.background = 'linear-gradient(135deg, var(--md-primary), #1558b0)';
            if (icon.startsWith('http')) {
              banner.innerHTML = `<img src="${esc(icon)}" style="width:72px;height:72px;border-radius:20px;object-fit:cover">`;
            } else {
              banner.textContent = icon;
            }
          }
          const nm = document.getElementById('srv-invite-name');
          const mt = document.getElementById('srv-invite-meta');
          const er = document.getElementById('srv-invite-err');
          if (nm) nm.textContent = srv.name || 'Server';
          if (mt) mt.textContent = `${srv.memberCount || 1} member${(srv.memberCount || 1) !== 1 ? 's' : ''}`;
          if (er) er.textContent = '';
          document.getElementById('m-srv-invite-join')?.classList.remove('hidden');
        } catch (e) { window.showToast?.('❌ Invite error: ' + e.message); }
      });
    };
  }

  // Override confirmJoinViaInvite to handle timed invites.
  //
  // ROOT CAUSE: patch.js sets window._pendingInviteSrv but index.html declares
  // _pendingInviteSrv with `let` inside its <script> block, so it is a closed-over
  // script-scope variable — NOT a window property. The original confirmJoinViaInvite
  // checks that closed-over variable, finds it null for timed invites, and returns
  // immediately without doing anything.
  //
  // FIX: when a timed invite is pending we perform the full join here, using
  // window._pendingInviteSrv (which we control). Regular invites fall through to
  // the original function, which has its own closed-over variable already set.
  waitForApp(() => {
    const _origConfirmJoin = window.confirmJoinViaInvite;
    window.confirmJoinViaInvite = async function () {
      // Timed-invite path — handle entirely here
      if (window._ncPendingTimedInv && window._pendingInviteSrv) {
        const btn = document.getElementById('srv-invite-join-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
        const srv              = window._pendingInviteSrv;
        const sid              = srv.id;
        const { sid: tSid, invId } = window._ncPendingTimedInv;
        // Clear early so a double-click cannot fire twice
        window._ncPendingTimedInv  = null;
        window._pendingInviteSrv   = null;
        try {
          const { updateDoc, doc, arrayUnion, increment } =
            await fs('updateDoc', 'doc', 'arrayUnion', 'increment');
          await updateDoc(doc(db(), 'users', me()?.uid), { joinedServers: arrayUnion(sid) });
          await updateDoc(doc(db(), 'servers', sid),     { memberCount: (srv.memberCount || 1) + 1 });
          await updateDoc(doc(db(), 'servers', tSid, 'timed_invites', invId), { useCount: increment(1) });
          window.showToast?.(`🎉 Welcome to ${srv.name}!`);
          window.closeModal?.('m-srv-invite-join');
          if (window.allSrvs) window.allSrvs[sid] = srv;
          if (!document.querySelector(`.nr-srv[data-sid="${sid}"]`)) {
            window.renderSrvIcon?.(sid, srv);
          }
          window.selectServer?.(sid);
          window.loadServers?.();
        } catch (e) {
          const er = document.getElementById('srv-invite-err');
          if (er) er.textContent = '❌ ' + e.message;
          if (btn) { btn.disabled = false; btn.textContent = 'Join Server'; }
          // Restore pending state so the user can retry
          window._ncPendingTimedInv = { sid: tSid, invId };
          window._pendingInviteSrv  = srv;
        }
        return;
      }
      // Regular invite path — delegate to index.html's original function
      await _origConfirmJoin?.();
    };
  });


  /* =================================================================
   * BOOTSTRAP
   * ================================================================= */

  // Run URL processors immediately
  _processInboundWebhook();
  _processInboundInvite();

  // Inject server-settings tabs whenever the modal becomes visible
  function _tryInjectTabs() {
    _injectWebhookTab();
    _injectInviteTab();
  }

  const _srvModal = document.getElementById('m-srv-settings');
  if (_srvModal) {
    new MutationObserver(() => {
      if (!_srvModal.classList.contains('hidden')) _tryInjectTabs();
    }).observe(_srvModal, { attributes: true, attributeFilter: ['class'] });
  }

  // Also hook openServerSettings so tabs are always present
  const _origOpenSS = window.openServerSettings;
  window.openServerSettings = async function (sid) {
    await _origOpenSS?.(sid);
    setTimeout(_tryInjectTabs, 60);
  };

  // Start bot token enforcement whenever the user switches servers
  const _origSwitchSrv = window.switchServer;
  window.switchServer = function (sid, ...args) {
    const ret = _origSwitchSrv?.(sid, ...args);
    // Run after a short delay so Firestore is ready
    setTimeout(() => _startBotTokenEnforcement(sid), 800);
    return ret;
  };

  // Also start enforcement for the current server on load
  waitForApp(() => {
    const curSid = window.currentServerId || window.curSrv;
    if (curSid && curSid !== 'home' && curSid !== '__home__') {
      setTimeout(() => _startBotTokenEnforcement(curSid), 1200);
    }
  });

  // Attempt injection immediately in case the modal is already open
  _tryInjectTabs();
  setTimeout(_tryInjectTabs, 600);

  // Resolve any pending timed invite once the user is authenticated
  const _authPoll = setInterval(() => {
    if (window.me) {
      clearInterval(_authPoll);
      window._ncResolvePendingInvite?.();
    }
  }, 300);

  console.log('[NexusChat patch.js] ✅ Categories · Shortcuts · Webhooks · Invites · Bot Auth — ready');

})();