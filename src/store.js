const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const ANON_FILE = path.join(DATA_DIR, 'anonymous.json');

const SALT = 'syborx_chat_salt_v1';

// Planes de usuario y sus límites (archivos = fotos/documentos por mensaje)
const PLANS = {
  anonimo: { id: 'anonimo', label: 'Anónimo', maxResponses: 5, maxFiles: 0 },
  gratuito: { id: 'gratuito', label: 'Gratuito', maxResponses: 50, maxFiles: 5 },
  pro: { id: 'pro', label: 'Pro', maxResponses: 100, maxFiles: 15 },
  enterprise: { id: 'enterprise', label: 'Enterprise', maxResponses: 200, maxFiles: 40 },
};

const ACCOUNT_PLANS = ['gratuito', 'pro', 'enterprise'];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(file, fallback) {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + SALT).digest('hex');
}

function uid() {
  return crypto.randomBytes(16).toString('hex');
}

// ---- Usuarios ----
function getUsers() {
  return readJSON(USERS_FILE, []);
}

function saveUsers(users) {
  writeJSON(USERS_FILE, users);
}

function findUser(username) {
  return getUsers().find((u) => u.username.toLowerCase() === String(username).toLowerCase());
}

function getUser(username) {
  return getUsers().find((u) => u.username === username);
}

function createUser(username, password, plan = 'gratuito') {
  const users = getUsers();
  if (findUser(username)) {
    const err = new Error('Ese usuario ya existe');
    err.code = 'EXISTS';
    throw err;
  }
  const user = {
    id: uid(),
    username,
    password: hashPassword(password),
    plan: ACCOUNT_PLANS.includes(plan) ? plan : 'gratuito',
    responsesUsed: 0,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return user;
}

function incrementResponses(username) {
  const users = getUsers();
  const u = users.find((x) => x.username === username);
  if (u) {
    u.responsesUsed = (u.responsesUsed || 0) + 1;
    saveUsers(users);
  }
}

function getUserUsage(username) {
  const u = getUser(username);
  if (!u) return null;
  const plan = PLANS[u.plan] || PLANS.gratuito;
  return {
    plan: plan.id,
    label: plan.label,
    used: u.responsesUsed || 0,
    maxResponses: plan.maxResponses,
    maxFiles: plan.maxFiles,
  };
}

// ---- Uso anónimo (por clientId persistido en localStorage) ----
// data/anonymous.json = { [clientId]: { responses, createdAt } }
function getAnonUsage(clientId) {
  const m = readJSON(ANON_FILE, {});
  const e = m[clientId];
  return e ? { responses: e.responses || 0 } : { responses: 0 };
}

function incrementAnonUsage(clientId) {
  const m = readJSON(ANON_FILE, {});
  const e = m[clientId] || { responses: 0, createdAt: new Date().toISOString() };
  e.responses = (e.responses || 0) + 1;
  m[clientId] = e;
  writeJSON(ANON_FILE, m);
}

function getAnonPlan(clientId) {
  const u = getAnonUsage(clientId);
  const plan = PLANS.anonimo;
  return {
    plan: plan.id,
    label: plan.label,
    used: u.responses,
    maxResponses: plan.maxResponses,
    maxFiles: plan.maxFiles,
  };
}

function verifyPassword(user, password) {
  return user.password === hashPassword(password);
}

// ---- Sesiones (en memoria) ----
const sessions = new Map(); // token -> { user, createdAt }

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user: username, createdAt: Date.now() });
  return token;
}

function getSession(token) {
  return token ? sessions.get(token) || null : null;
}

function deleteSession(token) {
  if (token) sessions.delete(token);
}

// ---- Chats ----
// Estructura: { [chatId]: { id, user, title, createdAt, updatedAt, messages: [{role, content, createdAt}] } }
function getChats() {
  return readJSON(CHATS_FILE, {});
}

function saveChats(chats) {
  writeJSON(CHATS_FILE, chats);
}

function listChats(username) {
  const chats = getChats();
  return Object.values(chats)
    .filter((c) => c.user === username)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }));
}

function createChat(username) {
  const chats = getChats();
  const id = uid();
  const chat = {
    id,
    user: username,
    title: 'Nuevo chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
  chats[id] = chat;
  saveChats(chats);
  return chat;
}

function getChat(username, id) {
  const chats = getChats();
  const chat = chats[id];
  if (!chat || chat.user !== username) return null;
  return chat;
}

function deleteChat(username, id) {
  const chats = getChats();
  if (!chats[id] || chats[id].user !== username) return false;
  delete chats[id];
  saveChats(chats);
  return true;
}

function appendMessage(username, id, role, content) {
  const chats = getChats();
  const chat = chats[id];
  if (!chat || chat.user !== username) return null;
  chat.messages.push({ role, content, createdAt: new Date().toISOString() });
  chat.updatedAt = new Date().toISOString();
  if (chat.messages.length === 1) {
    const first = chat.messages[0].content.text || '';
    chat.title = first.slice(0, 40) || 'Nuevo chat';
  }
  saveChats(chats);
  return chat;
}

function removeLastMessage(username, id, role) {
  const chats = getChats();
  const chat = chats[id];
  if (!chat || chat.user !== username) return;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === role) {
      chat.messages.splice(i, 1);
      break;
    }
  }
  chat.updatedAt = new Date().toISOString();
  saveChats(chats);
}

module.exports = {
  PLANS,
  ACCOUNT_PLANS,
  createUser,
  findUser,
  getUser,
  verifyPassword,
  createSession,
  getSession,
  deleteSession,
  listChats,
  createChat,
  getChat,
  deleteChat,
  appendMessage,
  removeLastMessage,
  incrementResponses,
  getUserUsage,
  getAnonUsage,
  incrementAnonUsage,
  getAnonPlan,
  uid,
};