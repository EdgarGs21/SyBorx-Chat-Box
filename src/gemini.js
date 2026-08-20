const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash';

const ALLOWED_MODELS = [
  'gemini-3.1-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
];

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function resolveModel(requested) {
  if (requested && ALLOWED_MODELS.includes(requested)) return requested;
  return DEFAULT_MODEL;
}

/**
 * Llama a la API de Gemini.
 * @param {object} opts
 * @param {Array}  opts.history  Mensajes previos [{ role, content: { text, files } }]
 * @param {string} opts.text     Texto del mensaje actual
 * @param {Array}  opts.files    Archivos actuales [{ name, mimeType, data }] base64
 * @param {string} opts.model    Modelo solicitado (opcional)
 * @returns {Promise<string>} Respuesta de texto
 */
async function generateResponse({ history = [], text = '', files = [], model }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('Falta la GEMINI_API_KEY. Crea el archivo .env (mira .env.example y el README).');
    err.code = 'NO_KEY';
    throw err;
  }

  const contents = buildContents(history, text, files);
  const url = `${API_BASE}/models/${resolveModel(model)}:generateContent`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({ contents }),
    });
  } catch (e) {
    const err = new Error('No se pudo conectar con la API de Gemini (revisa tu conexión a internet).');
    err.status = 502;
    throw err;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg = data.error?.message || `Error de la API de Gemini (HTTP ${response.status})`;
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }

  const reply = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || '')
    .join('') || 'Sin respuesta.';

  return reply;
}

function buildContents(history, text, files) {
  const MAX_TURNS = 8;
  let recent = history.slice(-MAX_TURNS);
  // La conversación debe alternar user/model y empezar con user
  if (recent.length && recent[0].role !== 'user') recent = recent.slice(1);

  const contents = [];
  for (const msg of recent) {
    const parts = [];
    if (msg.content.text) parts.push({ text: msg.content.text });
    for (const f of msg.content.files || []) {
      if (f.data) parts.push({ inline_data: { mime_type: f.mimeType, data: f.data } });
    }
    contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts });
  }

  const parts = [];
  if (text) parts.push({ text });
  for (const f of files || []) {
    parts.push({ inline_data: { mime_type: f.mimeType, data: f.data } });
  }
  contents.push({ role: 'user', parts });

  return contents;
}

module.exports = { generateResponse, resolveModel, ALLOWED_MODELS, DEFAULT_MODEL };