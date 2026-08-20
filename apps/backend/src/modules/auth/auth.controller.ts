import { Response } from 'express';
import { AuthService } from './auth.service.js';
import { AuthenticatedRequest } from './auth.middleware.js';

export class AuthController {
  static async register(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');

      if (username.length < 3) {
        res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres.' });
        return;
      }
      if (!/^[a-zA-Z0-9_\-\.]+$/.test(username)) {
        res.status(400).json({ error: 'El usuario solo puede contener letras, números, puntos, guiones y guion bajo.' });
        return;
      }
      if (password.length < 4) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres.' });
        return;
      }

      const { user, token } = await AuthService.registerUser(username, password);
      res.status(201).json({
        token,
        user: {
          id: user.id,
          username: user.name || user.external_id,
          tier: user.tier,
          messages_count: user.messages_count,
          max_messages_limit: user.max_messages_limit,
        },
      });
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message || 'Error al registrar usuario.' });
    }
  }

  static async login(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');

      if (!username || !password) {
        res.status(400).json({ error: 'Debes proporcionar usuario y contraseña.' });
        return;
      }

      const { user, token } = await AuthService.loginUser(username, password);
      res.json({
        token,
        user: {
          id: user.id,
          username: user.name || user.external_id,
          tier: user.tier,
          messages_count: user.messages_count,
          max_messages_limit: user.max_messages_limit,
        },
      });
    } catch (err: any) {
      const status = err.status || 401;
      res.status(status).json({ error: err.message || 'Usuario o contraseña incorrectos.' });
    }
  }

  static async logout(_req: AuthenticatedRequest, res: Response): Promise<void> {
    res.json({ ok: true });
  }

  static async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'No autenticado.' });
      return;
    }

    res.json({
      id: req.user.id,
      username: req.user.name || req.user.external_id,
      tier: req.user.tier,
      messages_count: req.user.messages_count,
      max_messages_limit: req.user.max_messages_limit,
      is_anonymous: req.user.is_anonymous,
    });
  }

  static async createAnonymousSession(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const visitorId = String(req.body?.visitor_id || `visitor_${Date.now()}`);
      const { user, token } = await AuthService.getOrCreateAnonymousUser(visitorId);
      res.json({
        token,
        user: {
          id: user.id,
          username: 'Invitado',
          tier: user.tier,
          messages_count: user.messages_count,
          max_messages_limit: user.max_messages_limit,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error al crear sesión anónima.' });
    }
  }
}
