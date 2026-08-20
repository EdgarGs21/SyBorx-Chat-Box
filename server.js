require('dotenv').config();
const path = require('path');
const express = require('express');
const store = require('./src/store');
const gemini = require('./src/gemini');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '120mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Middleware de autenticación ----
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const session = store.getSession(token);
  if (!session) return res.status(401).json({ error: 'No autorizado. Vuelve a iniciar sesión.' });
  req.user = session.user;
  req.token = token;
  next();
}

// ---- Auth ----
app.post('/api/register', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (username.length < 3) return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres.' });
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(username)) {
    return res.status(400).json({ error: 'El usuario solo puede contener letras, números, puntos, guiones y guion bajo.' });
  }
  if (password.length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres.' });

  try {
    const user = store.createUser(username, password);
    const token = store.createSession(user.username);
    res.status(201).json({ token, user: { username: user.username } });
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
  res.json({ token, user: { username: user.username } });
});

app.post('/api/logout', requireAuth, (req, res) => {
  store.deleteSession(req.token);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.user });
});

// ---- Chats ----
app.get('/api/chats', requireAuth, (req, res) => {
  res.json(store.listChats(req.user));
});

app.post('/api/chats', requireAuth, (req, res) => {
  const chat = store.createChat(req.user);
  res.status(201).json(chat);
});

app.get('/api/chats/:id', requireAuth, (req, res) => {
  const chat = store.getChat(req.user, req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado.' });
  res.json(chat);
});

app.delete('/api/chats/:id', requireAuth, (req, res) => {
  const ok = store.deleteChat(req.user, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Chat no encontrado.' });
  res.json({ ok: true });
});

app.post('/api/chats/:id/messages', requireAuth, async (req, res) => {
  const chat = store.getChat(req.user, req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado.' });

  const text = String(req.body?.text || '').trim();
  const files = Array.isArray(req.body?.files) ? req.body.files : [];

  if (!text && files.length === 0) return res.status(400).json({ error: 'Escribe un mensaje o adjunta un archivo.' });
  if (files.length > 5) return res.status(400).json({ error: 'Máximo 5 archivos por mensaje.' });

  for (const f of files) {
    if (!f.mimeType || !f.data) return res.status(400).json({ error: 'Hay un archivo inválido.' });
    if (f.data.length > 20 * 1024 * 1024) {
      return res.status(413).json({ error: `"${f.name || 'Archivo'}" es demasiado grande (máximo 15 MB).` });
    }
  }

  const userContent = { text, files };
  store.appendMessage(req.user, chat.id, 'user', userContent);

  try {
    const history = store.getChat(req.user, chat.id).messages;
    const reply = await gemini.generateResponse({
      history,
      text,
      files,
      model: req.body?.model,
    });
    store.appendMessage(req.user, chat.id, 'assistant', { text: reply, files: [] });
    const updated = store.getChat(req.user, chat.id);
    res.json({ chat: updated, reply });
  } catch (e) {
    store.removeLastMessage(req.user, chat.id, 'user');
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

async function callGeminiWithRetry(model, content, retries = 3, delay = 1500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await model.generateContent(content);
    } catch (error) {
      const isHighDemand = error.message?.includes('high demand') || error.status === 503;
      if (!isHighDemand || attempt === retries) throw error;
      
      console.warn(`Servidor ocupado. Reintentando (${attempt}/${retries}) en ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Duplica el tiempo de espera en cada reintento
    }
  }
}

try {
  // Intento 1: Modelo Principal
  response = await callGeminiWithRetry(primaryModel, prompt);
} catch (error) {
  console.log("Cambiando a modelo de respaldo por alta demanda...");
  // Intento 2: Modelo secundario de respaldo
  response = await callGeminiWithRetry(fallbackModel, prompt);
}