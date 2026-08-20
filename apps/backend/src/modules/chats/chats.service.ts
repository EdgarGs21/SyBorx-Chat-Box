import { query, withTransaction } from '../../db/client.js';
import { geminiProvider } from '../ai/gemini.provider.js';
import { AIChatMessage, AIMessageFile } from '../ai/ai.interface.js';
import { UserPayload } from '../auth/auth.service.js';

export interface ChatDTO {
  id: string;
  title: string;
  channel: string;
  created_at: string;
  updated_at: string;
  messages?: MessageDTO[];
}

export interface AttachmentDTO {
  id: string;
  storage_provider: string;
  file_path: string;
  original_name?: string;
  mime_type: string;
  size_bytes?: number;
}

export interface MessageDTO {
  id: string;
  role: 'user' | 'assistant' | 'system';
  type: 'text' | 'image' | 'audio';
  content: {
    text: string;
    files: Array<{
      id?: string;
      name?: string;
      mimeType: string;
      data?: string;
      url?: string;
    }>;
  };
  tokens_input?: number;
  tokens_output?: number;
  created_at: string;
}

export class ChatsService {
  /**
   * Lista todos los chats de un usuario
   */
  static async listChats(userId: string): Promise<ChatDTO[]> {
    const res = await query<ChatDTO>(
      `SELECT id, title, channel, created_at, updated_at
       FROM chats
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    return res.rows;
  }

  /**
   * Crea un nuevo chat
   */
  static async createChat(userId: string, title?: string): Promise<ChatDTO> {
    const chatTitle = title?.trim() || 'Nueva conversación';
    const res = await query<ChatDTO>(
      `INSERT INTO chats (user_id, title)
       VALUES ($1, $2)
       RETURNING id, title, channel, created_at, updated_at`,
      [userId, chatTitle]
    );
    return res.rows[0];
  }

  /**
   * Obtiene un chat con todo su historial de mensajes y adjuntos
   */
  static async getChat(userId: string, chatId: string): Promise<ChatDTO | null> {
    const chatRes = await query<ChatDTO>(
      `SELECT id, title, channel, created_at, updated_at
       FROM chats
       WHERE id = $1 AND user_id = $2`,
      [chatId, userId]
    );

    if (chatRes.rowCount === 0) return null;
    const chat = chatRes.rows[0];

    // Obtener mensajes del chat
    const messagesRes = await query<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      type: 'text' | 'image' | 'audio';
      content: string | null;
      tokens_input: number;
      tokens_output: number;
      created_at: string;
    }>(
      `SELECT id, role, type, content, tokens_input, tokens_output, created_at
       FROM messages
       WHERE chat_id = $1
       ORDER BY created_at ASC`,
      [chatId]
    );

    // Obtener adjuntos del chat
    const attachmentsRes = await query<{
      id: string;
      message_id: string;
      storage_provider: string;
      file_path: string;
      original_name: string | null;
      mime_type: string;
      size_bytes: number | null;
    }>(
      `SELECT ma.id, ma.message_id, ma.storage_provider, ma.file_path, ma.original_name, ma.mime_type, ma.size_bytes
       FROM message_attachments ma
       JOIN messages m ON ma.message_id = m.id
       WHERE m.chat_id = $1`,
      [chatId]
    );

    const attachmentsByMessageId = new Map<string, any[]>();
    for (const att of attachmentsRes.rows) {
      if (!attachmentsByMessageId.has(att.message_id)) {
        attachmentsByMessageId.set(att.message_id, []);
      }
      attachmentsByMessageId.get(att.message_id)!.push({
        id: att.id,
        name: att.original_name || 'Archivo',
        mimeType: att.mime_type,
        data: att.file_path, // Base64 o URL
        url: att.file_path,
      });
    }

    const messages: MessageDTO[] = messagesRes.rows.map((m) => ({
      id: m.id,
      role: m.role,
      type: m.type,
      content: {
        text: m.content || '',
        files: attachmentsByMessageId.get(m.id) || [],
      },
      tokens_input: m.tokens_input,
      tokens_output: m.tokens_output,
      created_at: m.created_at,
    }));

    chat.messages = messages;
    return chat;
  }

  /**
   * Elimina un chat
   */
  static async deleteChat(userId: string, chatId: string): Promise<boolean> {
    const res = await query(
      `DELETE FROM chats WHERE id = $1 AND user_id = $2`,
      [chatId, userId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Envía un mensaje, valida cuotas, procesa con Gemini y persiste en PostgreSQL
   */
  static async sendMessage(
    user: UserPayload,
    chatId: string,
    text: string,
    files: AIMessageFile[] = [],
    modelOverride?: string
  ): Promise<{ chat: ChatDTO; reply: string }> {
    // 1. Verificar existencia del chat
    const chat = await this.getChat(user.id, chatId);
    if (!chat) {
      throw { status: 404, message: 'Chat no encontrado.' };
    }

    // 2. Control de Cuota / Límite de mensajes por Tier
    if (user.messages_count >= user.max_messages_limit) {
      throw {
        status: 403,
        code: 'LIMIT_REACHED',
        message: `Has alcanzado el límite de ${user.max_messages_limit} consultas disponibles para tu cuenta ${user.tier}. Regístrate o actualiza tu plan para continuar.`,
        requires_auth: user.is_anonymous,
        limit: user.max_messages_limit,
        current: user.messages_count,
      };
    }

    // 3. Preparar historial para Gemini
    const history: AIChatMessage[] = (chat.messages || []).map((m) => ({
      role: m.role,
      content: {
        text: m.content.text,
        files: m.content.files.map((f) => ({
          mimeType: f.mimeType,
          data: f.data || '',
          name: f.name,
        })),
      },
    }));

    // 4. Guardar mensaje de usuario en PostgreSQL
    const messageType = files.length > 0 ? 'image' : 'text';
    
    const userMsgRes = await query<{ id: string }>(
      `INSERT INTO messages (chat_id, role, type, content)
       VALUES ($1, 'user', $2, $3)
       RETURNING id`,
      [chatId, messageType, text.trim()]
    );
    const userMsgId = userMsgRes.rows[0].id;

    // Guardar adjuntos si existen
    if (files && files.length > 0) {
      for (const f of files) {
        await query(
          `INSERT INTO message_attachments (message_id, storage_provider, file_path, original_name, mime_type)
           VALUES ($1, 'local', $2, $3, $4)`,
          [userMsgId, f.data, f.name || 'archivo', f.mimeType]
        );
      }
    }

    // 5. Llamar a Gemini API
    let aiResult;
    try {
      aiResult = await geminiProvider.generateResponse({
        history,
        text,
        files,
        model: modelOverride,
      });
    } catch (err: any) {
      // Revertir mensaje de usuario si falló Gemini
      await query(`DELETE FROM messages WHERE id = $1`, [userMsgId]);
      
      // Registrar log de error
      await query(
        `INSERT INTO api_usage_logs (chat_id, provider, model, success, error_message, latency_ms)
         VALUES ($1, 'gemini', $2, false, $3, $4)`,
        [chatId, modelOverride || geminiProvider.getDefaultModel(), err.message, err.latencyMs || 0]
      );
      throw err;
    }

    // 6. Guardar respuesta del Asistente en PostgreSQL
    await query(
      `INSERT INTO messages (chat_id, role, type, content, tokens_input, tokens_output)
       VALUES ($1, 'assistant', 'text', $2, $3, $4)`,
      [chatId, aiResult.reply, aiResult.tokensInput, aiResult.tokensOutput]
    );

    // 7. Incrementar contador de mensajes del usuario
    await query(
      `UPDATE users
       SET messages_count = messages_count + 1
       WHERE id = $1`,
      [user.id]
    );

    // 8. Registrar log de uso exitoso
    await query(
      `INSERT INTO api_usage_logs (chat_id, provider, model, latency_ms, prompt_tokens, completion_tokens, success)
       VALUES ($1, 'gemini', $2, $3, $4, $5, true)`,
      [chatId, aiResult.model, aiResult.latencyMs, aiResult.tokensInput, aiResult.tokensOutput]
    );

    // 9. Si el chat tenía título genérico, renombrarlo con el tema del mensaje
    if (chat.title === 'Nueva conversación' && text.trim().length > 0) {
      const generatedTitle = text.trim().slice(0, 30) + (text.length > 30 ? '...' : '');
      await query(`UPDATE chats SET title = $1 WHERE id = $2`, [generatedTitle, chatId]);
    }

    // 10. Devolver el chat actualizado
    const updatedChat = await this.getChat(user.id, chatId);
    return {
      chat: updatedChat!,
      reply: aiResult.reply,
    };
  }
}
