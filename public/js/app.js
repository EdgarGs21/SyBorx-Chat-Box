/* ============================================================
   SyBorx Chat — Frontend
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const ICONS = {
    chat: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    doc: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    sun: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  };

  const state = {
    token: localStorage.getItem('syborx_token') || '',
    username: localStorage.getItem('syborx_user') || '',
    theme: localStorage.getItem('syborx_theme') || 'dark',
    model: ['gemini-2.5-flash', 'gemini-3.1-flash'].includes(localStorage.getItem('syborx_model'))
      ? 'gemini-flash-latest'
      : (localStorage.getItem('syborx_model') || 'gemini-flash-latest'),
    chats: [],
    currentChatId: null,
    attachments: [],
    sending: false,
  };

  let authMode = 'login';

  /* ===================== API ===================== */
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
      body: opts.body,
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* sin cuerpo JSON */ }
    if (res.status === 401) {
      clearSession();
      showLogin();
      throw new Error('Sesión expirada. Inicia sesión de nuevo.');
    }
    if (!res.ok) throw new Error(data.error || 'Error del servidor.');
    return data;
  }

  function clearSession() {
    state.token = '';
    state.username = '';
    state.currentChatId = null;
    localStorage.removeItem('syborx_token');
    localStorage.removeItem('syborx_user');
  }

  /* ===================== THEME ===================== */
  function applyTheme(t) {
    state.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('syborx_theme', t);
    $('theme-toggle').innerHTML = t === 'dark' ? ICONS.sun : ICONS.moon;
  }

  /* ===================== AUTH UI ===================== */
  function setAuthMode(mode) {
    authMode = mode;
    $('tab-login').classList.toggle('active', mode === 'login');
    $('tab-register').classList.toggle('active', mode === 'register');
    $('auth-submit').textContent = mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
    $('auth-error').textContent = '';
  }

  function showLogin() {
    $('app').classList.add('hidden');
    $('login-screen').classList.remove('hidden');
    setAuthMode('login');
    $('auth-username').focus();
  }

  function showApp() {
    $('login-screen').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('profile-name').textContent = state.username;
    $('avatar').textContent = (state.username[0] || 'U').toUpperCase();
    showEmptyState();
  }

  async function enterApp() {
    showApp();
    await loadChats();
  }

  /* ===================== SIDEBAR ===================== */
  function toggleSidebar(force) {
    const isMobile = window.innerWidth <= 900;
    if (isMobile) {
      let open;
      if (force === 'open') { $('sidebar').classList.add('open'); open = true; }
      else if (force === 'close') { $('sidebar').classList.remove('open'); open = false; }
      else { $('sidebar').classList.toggle('open'); open = $('sidebar').classList.contains('open'); }
      $('app').classList.toggle('sidebar-hidden', !open);
    } else {
      $('sidebar').classList.toggle('collapsed');
      const collapsed = $('sidebar').classList.contains('collapsed');
      $('app').classList.toggle('sidebar-hidden', collapsed);
    }
  }

  /* ===================== CHATS ===================== */
  function formatDate(iso) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    }
    const days = Math.floor((now - d) / 86400000);
    if (days === 1) return 'Ayer';
    if (days < 7) return d.toLocaleDateString('es', { weekday: 'long' });
    const opts = { day: '2-digit', month: 'short' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('es', opts);
  }

  async function loadChats() {
    state.chats = await api('/api/chats');
    renderChatList();
  }

  function renderChatList() {
    const list = $('chat-list');
    list.innerHTML = '';

    if (!state.chats.length) {
      const empty = document.createElement('div');
      empty.className = 'chat-empty';
      empty.innerHTML = 'Aún no hay conversaciones.<br>Crea una con "Nuevo chat".';
      list.appendChild(empty);
      return;
    }

    for (const c of state.chats) {
      const item = document.createElement('div');
      item.className = 'chat-item' + (c.id === state.currentChatId ? ' active' : '');

      const ico = document.createElement('div');
      ico.className = 'chat-ico';
      ico.innerHTML = ICONS.chat;

      const meta = document.createElement('div');
      meta.className = 'chat-meta';
      const title = document.createElement('div');
      title.className = 'chat-title';
      title.textContent = c.title;
      const date = document.createElement('div');
      date.className = 'chat-date';
      date.textContent = formatDate(c.updatedAt);
      meta.append(title, date);

      const del = document.createElement('button');
      del.className = 'chat-del';
      del.title = 'Eliminar chat';
      del.innerHTML = ICONS.x;
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('¿Eliminar este chat?')) return;
        try {
          await api(`/api/chats/${c.id}`, { method: 'DELETE' });
          if (state.currentChatId === c.id) showEmptyState();
          await loadChats();
          toast('Chat eliminado.');
        } catch (err) {
          toast(err.message);
        }
      });

      item.append(ico, meta, del);
      item.addEventListener('click', () => selectChat(c.id));
      list.appendChild(item);
    }
  }

  async function selectChat(id) {
    state.currentChatId = id;
    if (window.innerWidth <= 900) toggleSidebar('close');
    try {
      const chat = await api(`/api/chats/${id}`);
      renderMessages(chat.messages);
      showChatView();
      renderChatList();
    } catch (err) {
      toast(err.message);
    }
  }

  function showChatView() {
    $('empty-state').classList.add('hidden');
    $('messages').classList.remove('hidden');
    $('input').focus();
  }

  function showEmptyState() {
    state.currentChatId = null;
    $('messages').classList.add('hidden');
    $('empty-state').classList.remove('hidden');
    renderChatList();
  }

  /* ===================== MENSAJES ===================== */
  function renderMessages(messages) {
    const box = $('messages-inner');
    box.innerHTML = '';
    for (const m of messages) box.appendChild(renderMessage(m));
    scrollBottom();
  }

  function renderMessage(msg) {
    const isUser = msg.role === 'user';
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + (isUser ? 'user' : 'bot');

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    for (const f of msg.content.files || []) {
      if (f.mimeType.startsWith('image/')) {
        const img = document.createElement('img');
        img.className = 'msg-image';
        img.src = `data:${f.mimeType};base64,${f.data}`;
        img.alt = f.name;
        bubble.appendChild(img);
      } else {
        bubble.appendChild(fileChip(f));
      }
    }

    if (msg.content.text) {
      const div = document.createElement('div');
      if (isUser) div.textContent = msg.content.text;
      else div.innerHTML = mdToHtml(msg.content.text);
      bubble.appendChild(div);
    }

    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = new Date(msg.createdAt || Date.now()).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    bubble.appendChild(time);

    wrap.appendChild(bubble);
    return wrap;
  }

  function appendMessageUI(role, content) {
    const box = $('messages-inner');
    box.appendChild(renderMessage({ role, content, createdAt: new Date().toISOString() }));
  }

  function fileChip(f) {
    const chip = document.createElement('span');
    chip.className = 'file-chip';
    chip.innerHTML = ICONS.doc;
    const name = document.createElement('span');
    name.textContent = f.name;
    chip.appendChild(name);
    return chip;
  }

  function showTyping() {
    const box = $('messages-inner');
    const wrap = document.createElement('div');
    wrap.className = 'msg bot';
    wrap.id = 'typing';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    wrap.appendChild(bubble);
    box.appendChild(wrap);
    scrollBottom();
  }

  function hideTyping() {
    const t = $('typing');
    if (t) t.remove();
  }

  function scrollBottom() {
    requestAnimationFrame(() => {
      const area = $('messages-area');
      area.scrollTop = area.scrollHeight;
    });
  }

  /* ===================== ENVÍO ===================== */
  async function sendMessage() {
    if (state.sending) return;
    const text = $('input').value.trim();
    if (!text && state.attachments.length === 0) return;

    state.sending = true;
    $('send-btn').disabled = true;

    let chatId = state.currentChatId;
    if (!chatId) {
      try {
        const chat = await api('/api/chats', { method: 'POST' });
        chatId = chat.id;
        state.currentChatId = chatId;
        showChatView();
      } catch (e) {
        toast(e.message);
        state.sending = false;
        $('send-btn').disabled = false;
        return;
      }
    }

    const files = state.attachments.slice();
    appendMessageUI('user', { text, files });
    $('input').value = '';
    autoResizeInput();
    clearAttachments();
    showTyping();
    scrollBottom();

    try {
      const data = await api(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text, files, model: state.model }),
      });
      hideTyping();
      appendMessageUI('assistant', { text: data.reply, files: [] });
      await loadChats();
      scrollBottom();
    } catch (e) {
      hideTyping();
      toast(e.message);
      await loadChats();
    }

    state.sending = false;
    $('send-btn').disabled = false;
    $('input').focus();
  }

  /* ===================== ARCHIVOS ===================== */
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      r.readAsDataURL(file);
    });
  }

  function renderAttachments() {
    const box = $('attachments-preview');
    box.innerHTML = '';
    state.attachments.forEach((f, i) => {
      const chip = document.createElement('div');
      chip.className = 'attach-chip';
      if (f.mimeType.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = `data:${f.mimeType};base64,${f.data}`;
        img.alt = f.name;
        chip.appendChild(img);
      } else {
        const ico = document.createElement('span');
        ico.innerHTML = ICONS.doc;
        chip.appendChild(ico);
      }
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = f.name;
      chip.appendChild(name);
      const x = document.createElement('button');
      x.className = 'x';
      x.title = 'Quitar';
      x.innerHTML = ICONS.x;
      x.addEventListener('click', () => {
        state.attachments.splice(i, 1);
        renderAttachments();
      });
      chip.appendChild(x);
      box.appendChild(chip);
    });
  }

  function clearAttachments() {
    state.attachments = [];
    renderAttachments();
  }

  /* ===================== MARKDOWN ===================== */
  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function mdToHtml(md) {
    if (!md) return '';
    const esc = escapeHtml(md);
    const inline = (s) => s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    let result = '';
    const blocks = esc.split(/```/);
    for (let i = 0; i < blocks.length; i++) {
      if (i % 2 === 1) {
        const code = blocks[i].replace(/^\s*\w*\s*\n/, '').replace(/\n$/, '');
        result += `<pre><code>${code}</code></pre>`;
        continue;
      }
      let list = null;
      const closeList = () => { if (list) { result += `</${list}>`; list = null; } };

      for (const raw of blocks[i].split('\n')) {
        const line = raw;
        let m;

        if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
          closeList();
          const lvl = m[1].length;
          result += `<h${lvl}>${inline(m[2])}</h${lvl}>`;
          continue;
        }
        if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
          if (list !== 'ul') { closeList(); result += '<ul>'; list = 'ul'; }
          result += `<li>${inline(m[1])}</li>`;
          continue;
        }
        if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
          if (list !== 'ol') { closeList(); result += '<ol>'; list = 'ol'; }
          result += `<li>${inline(m[1])}</li>`;
          continue;
        }
        closeList();
        if (/^&gt;\s*/.test(line)) {
          result += `<blockquote>${inline(line.replace(/^&gt;\s*/, ''))}</blockquote>`;
          continue;
        }
        if (/^-{3,}\s*$/.test(line)) {
          result += '<hr>';
          continue;
        }
        if (line.trim() === '') continue;
        result += `<p>${inline(line)}</p>`;
      }
      closeList();
    }
    return result;
  }

  /* ===================== TOAST ===================== */
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  /* ===================== INPUT ===================== */
  function autoResizeInput() {
    const el = $('input');
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }

  /* ===================== EVENTOS ===================== */
  function bindEvents() {
    $('tab-login').addEventListener('click', () => { setAuthMode('login'); });
    $('tab-register').addEventListener('click', () => { setAuthMode('register'); });

    $('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = $('auth-username').value.trim();
      const password = $('auth-password').value;
      $('auth-error').textContent = '';
      const btn = $('auth-submit');
      btn.disabled = true;
      try {
        const data = await api(authMode === 'login' ? '/api/login' : '/api/register', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        state.token = data.token;
        state.username = data.user.username;
        localStorage.setItem('syborx_token', data.token);
        localStorage.setItem('syborx_user', data.user.username);
        await enterApp();
      } catch (err) {
        $('auth-error').textContent = err.message;
      }
      btn.disabled = false;
    });

    $('theme-toggle').addEventListener('click', () => {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    $('sidebar-toggle').addEventListener('click', () => toggleSidebar());
    $('sidebar-reopen').addEventListener('click', () => toggleSidebar('open'));

    $('settings-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      $('profile-menu').classList.add('hidden');
      $('settings-menu').classList.toggle('hidden');
    });
    $('profile-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      $('settings-menu').classList.add('hidden');
      $('profile-menu').classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
      $('profile-menu').classList.add('hidden');
      $('settings-menu').classList.add('hidden');
    });

    $('logout-btn').addEventListener('click', async () => {
      try { await api('/api/logout', { method: 'POST' }); } catch (_) { /* ignorar */ }
      clearSession();
      showLogin();
    });
    $('switch-account-btn').addEventListener('click', async () => {
      try { await api('/api/logout', { method: 'POST' }); } catch (_) { /* ignorar */ }
      clearSession();
      showLogin();
    });

    const ms = $('model-select');
    ms.value = state.model;
    ms.addEventListener('change', () => {
      state.model = ms.value;
      localStorage.setItem('syborx_model', state.model);
      toast(`Modelo: ${ms.options[ms.selectedIndex].text}`);
    });

    $('new-chat').addEventListener('click', async () => {
      try {
        const chat = await api('/api/chats', { method: 'POST' });
        state.currentChatId = chat.id;
        renderMessages([]);
        showChatView();
        await loadChats();
        $('input').focus();
      } catch (err) {
        toast(err.message);
      }
    });

    $('send-btn').addEventListener('click', sendMessage);

    const input = $('input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    input.addEventListener('input', autoResizeInput);

    $('attach-btn').addEventListener('click', () => $('file-input').click());

    $('file-input').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      for (const f of files) {
        if (state.attachments.length >= 5) { toast('Máximo 5 archivos por mensaje.'); break; }
        if (f.size > 15 * 1024 * 1024) { toast(`"${f.name}" supera el límite de 15 MB.`); continue; }
        try {
          const dataUrl = await readFileAsDataURL(f);
          state.attachments.push({
            name: f.name,
            mimeType: f.type || 'application/octet-stream',
            data: dataUrl.split(',')[1],
            size: f.size,
          });
        } catch (err) {
          toast(err.message);
        }
      }
      renderAttachments();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) $('sidebar').classList.remove('open');
    });
  }

  /* ===================== INIT ===================== */
  (async function init() {
    applyTheme(state.theme);
    bindEvents();

    if (state.token) {
      try {
        await api('/api/me');
        await enterApp();
      } catch (_) {
        showLogin();
      }
    } else {
      showLogin();
    }
  })();
})();