require('dotenv').config();
const path = require('path');
const express = require('express');
const store = require('./src/store');
const gemini = require('./src/gemini');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '120mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Middlewares de identidad ----
// Identidad = usuario autenticado (Bearer token) o anónimo (X-Client-Id)
function getToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function requireAuth(req, res, next) {
  const session = store.getSession(getToken(req));
  if (!session) return res.status(401).json({ error: 'No autorizado. Vuelve a iniciar sesión.' });
  req.user = session.user;
  req.token = getToken(req);
  next();
}

function requireIdentity(req, res, next) {
  const session = store.getSession(getToken(req));
  if (session) {
    req.identity = { kind: 'user', user: session.user, token: getToken(req) };
    return next();
  }
  const cid = req.headers['x-client-id'];
  if (cid && typeof cid === 'string' && cid.length >= 8 && cid.length <= 64) {
    req.identity = { kind: 'anon', clientId: cid };
    return next();
  }
  return res.status(401).json({ error: 'No autorizado.' });
}

function ownerKey(identity) {
  return identity.kind === 'user' ? identity.user : 'anon:' + identity.clientId;
}

function getUsage(identity) {
  if (identity.kind === 'user') return store.getUserUsage(identity.user) || store.getAnonPlan('sin-usuario');
  return store.getAnonPlan(identity.clientId);
}

// ---- Auth ----
app.post('/api/register', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const plan = store.ACCOUNT_PLANS.includes(req.body?.plan) ? req.body.plan : 'gratuito';

  if (username.length < 3) return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres.' });
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(username)) {
    return res.status(400).json({ error: 'El usuario solo puede contener letras, números, puntos, guiones y guion bajo.' });
  }
  if (password.length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres.' });

  try {
    const user = store.createUser(username, password, plan);
    const token = store.createSession(user.username);
    res.status(201).json({
      token,
      user: { username: user.username, plan: user.plan },
      usage: store.getUserUsage(user.username),
    });
  } catch (e) {
    if (e.code === 'EXISTS') return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const user = store.findUser(username);
  if (!user || !store.verifyPassword(user, password)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  const token = store.createSession(user.username);
  res.json({
    token,
    user: { username: user.username, plan: user.plan },
    usage: store.getUserUsage(user.username),
  });
});

app.post('/api/logout', requireAuth, (req, res) => {
  store.deleteSession(req.token);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.user, usage: store.getUserUsage(req.user) });
});

app.get('/api/usage', requireIdentity, (req, res) => {
  res.json(getUsage(req.identity));
});

// ---- Chats ----
app.get('/api/chats', requireIdentity, (req, res) => {
  res.json(store.listChats(ownerKey(req.identity)));
});

app.post('/api/chats', requireIdentity, (req, res) => {
  const chat = store.createChat(ownerKey(req.identity));
  res.status(201).json(chat);
});

app.get('/api/chats/:id', requireIdentity, (req, res) => {
  const chat = store.getChat(ownerKey(req.identity), req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado.' });
  res.json(chat);
});

app.delete('/api/chats/:id', requireIdentity, (req, res) => {
  const ok = store.deleteChat(ownerKey(req.identity), req.params.id);
  if (!ok) return res.status(404).json({ error: 'Chat no encontrado.' });
  res.json({ ok: true });
});

app.post('/api/chats/:id/messages', requireIdentity, async (req, res) => {
  const identity = req.identity;
  const owner = ownerKey(identity);
  const chat = store.getChat(owner, req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado.' });

  const text = String(req.body?.text || '').trim();
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  const usage = getUsage(identity);

  if (!text && files.length === 0) return res.status(400).json({ error: 'Escribe un mensaje o adjunta un archivo.' });

  // Límites del plan
  if (files.length > 0 && usage.maxFiles === 0) {
    return res.status(403).json({ error: 'Los usuarios anónimos no pueden adjuntar archivos. Inicia sesión para habilitarlos.' });
  }
  if (files.length > usage.maxFiles) {
    return res.status(400).json({
      error: `Tu plan ${usage.label} permite hasta ${usage.maxFiles} ${usage.maxFiles === 1 ? 'archivo' : 'archivos'} por mensaje.`,
    });
  }
  if (usage.used >= usage.maxResponses) {
    return res.status(429).json({
      error: `Has alcanzado el límite de ${usage.maxResponses} respuestas de tu plan ${usage.label}. Inicia sesión o cambia de cuenta para continuar.`,
    });
  }

  for (const f of files) {
    if (!f.mimeType || !f.data) return res.status(400).json({ error: 'Hay un archivo inválido.' });
    if (f.data.length > 20 * 1024 * 1024) {
      return res.status(413).json({ error: `"${f.name || 'Archivo'}" es demasiado grande (máximo 15 MB).` });
    }
  }

  const userContent = { text, files };
  store.appendMessage(owner, chat.id, 'user', userContent);

  try {
    const history = store.getChat(owner, chat.id).messages;
    const reply = await gemini.generateResponse({
      history,
      text,
      files,
      model: req.body?.model,
    });
    store.appendMessage(owner, chat.id, 'assistant', { text: reply, files: [] });

    // Contar la respuesta consumida
    if (identity.kind === 'user') store.incrementResponses(identity.user);
    else store.incrementAnonUsage(identity.clientId);

    const updated = store.getChat(owner, chat.id);
    res.json({ chat: updated, reply, usage: getUsage(identity) });
  } catch (e) {
    store.removeLastMessage(owner, chat.id, 'user');
    const status = e.status || 500;
    res.status(status).json({ error: e.message || 'Error inesperado al contactar a Gemini.' });
  }
});

app.get('/api/models', requireAuth, (req, res) => {
  res.json({ allowed: gemini.ALLOWED_MODELS, default: gemini.DEFAULT_MODEL });
});

// 404 para APIs desconocidas
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

app.listen(PORT, () => {
  console.log('========================================');
  console.log('  SyBorx Chat arrancando...');
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  Modelo por defecto: ${gemini.DEFAULT_MODEL}`);
  if (!process.env.GEMINI_API_KEY) {
    console.log('  ⚠  GEMINI_API_KEY no configurada.');
    console.log('     Crea el archivo .env (ver .env.example) o lee el README.');
  }
  console.log('========================================');
});