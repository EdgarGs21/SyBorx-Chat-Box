const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

const SALT = 'syborx_chat_salt_v1';

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

function createUser(username, password) {
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
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return user;
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
  createUser,
  findUser,
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
  uid,
};