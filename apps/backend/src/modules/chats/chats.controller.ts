import { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.middleware.js';
import { ChatsService } from './chats.service.js';
import { geminiProvider } from '../ai/gemini.provider.js';

export class ChatsController {
  static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const chats = await ChatsService.listChats(req.user!.id);
      res.json(chats);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error al obtener la lista de chats.' });
    }
  }

  static async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const title = req.body?.title ? String(req.body.title) : undefined;
      const chat = await ChatsService.createChat(req.user!.id, title);
      res.status(201).json(chat);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error al crear el chat.' });
    }
  }

  static async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const chat = await ChatsService.getChat(req.user!.id, req.params.id);
      if (!chat) {
        res.status(404).json({ error: 'Chat no encontrado.' });
        return;
      }
      res.json(chat);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error al obtener el chat.' });
    }
  }

  static async delete(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const ok = await ChatsService.deleteChat(req.user!.id, req.params.id);
      if (!ok) {
        res.status(404).json({ error: 'Chat no encontrado.' });
        return;
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error al eliminar el chat.' });
    }
  }

  static async sendMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const text = String(req.body?.text || '').trim();
      const files = Array.isArray(req.body?.files) ? req.body.files : [];
      const model = req.body?.model ? String(req.body.model) : undefined;

      if (!text && files.length === 0) {
        res.status(400).json({ error: 'Escribe un mensaje o adjunta un archivo.' });
        return;
      }

      if (files.length > 5) {
        res.status(400).json({ error: 'Máximo 5 archivos por mensaje.' });
        return;
      }

      const result = await ChatsService.sendMessage(req.user!, req.params.id, text, files, model);
      res.json(result);
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({
        error: err.message || 'Error al procesar el mensaje con Gemini.',
        code: err.code,
        requires_auth: err.requires_auth,
        limit: err.limit,
        current: err.current,
      });
    }
  }

  static async getModels(_req: AuthenticatedRequest, res: Response): Promise<void> {
    res.json({
      allowed: geminiProvider.getAllowedModels(),
      default: geminiProvider.getDefaultModel(),
    });
  }
}
