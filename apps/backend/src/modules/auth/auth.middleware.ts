import { Request, Response, NextFunction } from 'express';
import { AuthService, UserPayload } from './auth.service.js';

export interface AuthenticatedRequest extends Request {
  user?: UserPayload;
  token?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'No autorizado. Se requiere token de sesión.' });
    return;
  }

  const payload = AuthService.verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Token inválido o expirado. Inicia sesión de nuevo.' });
    return;
  }

  const user = await AuthService.getUserById(payload.id);
  if (!user) {
    res.status(401).json({ error: 'Usuario no encontrado.' });
    return;
  }

  req.user = user;
  req.token = token;
  next();
}
