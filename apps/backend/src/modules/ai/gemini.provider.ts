import { GoogleGenerativeAI, Content, Part } from '@google/generative-ai';
import { IProveedorIA, AIGenerateOptions, AIGenerateResult } from './ai.interface.js';

export const ALLOWED_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.1-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

export const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

export class GeminiProvider implements IProveedorIA {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  getAllowedModels(): string[] {
    return ALLOWED_MODELS;
  }

  getDefaultModel(): string {
    return DEFAULT_MODEL;
  }

  private getClient(): GoogleGenerativeAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw {
        status: 500,
        message: 'GEMINI_API_KEY no está configurada en las variables de entorno.',
      };
    }
    if (!this.genAI) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
    return this.genAI;
  }

  private formatParts(text?: string, files?: Array<{ mimeType: string; data: string }>): Part[] {
    const parts: Part[] = [];

    if (files && files.length > 0) {
      for (const f of files) {
        // Asegurar que solo pase el base64 limpio (sin header data:image/png;base64,)
        const base64Clean = f.data.includes(';base64,') ? f.data.split(';base64,')[1] : f.data;
        parts.push({
          inlineData: {
            mimeType: f.mimeType,
            data: base64Clean,
          },
        });
      }
    }

    if (text && text.trim().length > 0) {
      parts.push({ text: text.trim() });
    }

    return parts;
  }

  async generateResponse(opts: AIGenerateOptions): Promise<AIGenerateResult> {
    const client = this.getClient();
    let modelName = opts.model && ALLOWED_MODELS.includes(opts.model) ? opts.model : DEFAULT_MODEL;
    const startTime = Date.now();

    try {
      let model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: opts.systemInstruction || 'Eres SyBorx, un asistente de IA inteligente, amigable, preciso y servicial.',
      });

      // Construir historial de mensajes previos
      const contents: Content[] = [];

      for (const msg of opts.history) {
        const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
        let parts: Part[] = [];

        if (typeof msg.content === 'string') {
          if (msg.content.trim()) parts = [{ text: msg.content.trim() }];
        } else if (msg.content) {
          parts = this.formatParts(msg.content.text, msg.content.files);
        }

        if (parts.length > 0) {
          contents.push({
            role: geminiRole,
            parts,
          });
        }
      }

      // Añadir el mensaje actual del usuario
      const currentParts = this.formatParts(opts.text, opts.files);
      if (currentParts.length === 0) {
        throw { status: 400, message: 'El mensaje no contiene texto ni archivos válidos.' };
      }

      contents.push({
        role: 'user',
        parts: currentParts,
      });

      let response;
      try {
        response = await model.generateContent({ contents });
      } catch (callErr: any) {
        // Si el modelo específico falló con 404 (deprecado), reintentar con el default gemini-3.6-flash
        if (callErr.message && callErr.message.includes('404') && modelName !== 'gemini-3.6-flash') {
          console.warn(`⚠️ Modelo ${modelName} no disponible, reintentando con gemini-3.6-flash...`);
          modelName = 'gemini-3.6-flash';
          model = client.getGenerativeModel({
            model: modelName,
            systemInstruction: opts.systemInstruction || 'Eres SyBorx, un asistente de IA inteligente, amigable, preciso y servicial.',
          });
          response = await model.generateContent({ contents });
        } else {
          throw callErr;
        }
      }

      const latencyMs = Date.now() - startTime;
      const candidate = response.response;
      const replyText = candidate.text() || 'No pude generar una respuesta.';

      const usageMetadata = candidate.usageMetadata;
      const tokensInput = usageMetadata?.promptTokenCount || 0;
      const tokensOutput = usageMetadata?.candidatesTokenCount || 0;

      return {
        reply: replyText,
        tokensInput,
        tokensOutput,
        model: modelName,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      console.error('❌ Error en Gemini API:', err);
      throw {
        status: err.status || 500,
        message: err.message || 'Error al comunicarse con Gemini API.',
        latencyMs,
      };
    }
  }
}

export const geminiProvider = new GeminiProvider();
