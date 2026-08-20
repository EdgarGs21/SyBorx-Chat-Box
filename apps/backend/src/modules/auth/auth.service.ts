import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../../db/client.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_key_12345';
const JWT_EXPIRES_IN = '7d';

export interface UserPayload {
  id: string;
  external_id: string;
  email?: string | null;
  name?: string | null;
  is_anonymous: boolean;
  tier: 'anonymous' | 'free' | 'pro' | 'enterprise';
  messages_count: number;
  max_messages_limit: number;
}

export class AuthService {
  /**
   * Genera un JWT para el usuario
   */
  static generateToken(user: UserPayload): string {
    return jwt.sign(
      {
        id: user.id,
        external_id: user.external_id,
        tier: user.tier,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  /**
   * Verifica un token JWT
   */
  static verifyToken(token: string): { id: string; external_id: string; tier: string } | null {
    try {
      return jwt.verify(token, JWT_SECRET) as { id: string; external_id: string; tier: string };
    } catch {
      return null;
    }
  }

  /**
   * Registra un nuevo usuario con credenciales
   */
  static async registerUser(username: string, password: string): Promise<{ user: UserPayload; token: string }> {
    const cleanUsername = username.trim().toLowerCase();
    
    // Verificar si el usuario ya existe
    const existing = await query('SELECT id FROM users WHERE external_id = $1 OR email = $1', [cleanUsername]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw { status: 409, message: 'El nombre de usuario ya está en uso.' };
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Los usuarios registrados inician con tier 'free' y 30 consultas
    const res = await query<UserPayload>(
      `INSERT INTO users (external_id, email, password_hash, name, is_anonymous, tier, messages_count, max_messages_limit)
       VALUES ($1, $1, $2, $3, false, 'free', 0, 30)
       RETURNING id, external_id, email, name, is_anonymous, tier, messages_count, max_messages_limit`,
      [cleanUsername, passwordHash, username.trim()]
    );

    const user = res.rows[0];
    const token = this.generateToken(user);
    return { user, token };
  }

  /**
   * Inicia sesión con usuario y contraseña
   */
  static async loginUser(username: string, password: string): Promise<{ user: UserPayload; token: string }> {
    const cleanUsername = username.trim().toLowerCase();
    const res = await query<{
      id: string;
      external_id: string;
      email: string | null;
      password_hash: string | null;
      name: string | null;
      is_anonymous: boolean;
      tier: 'anonymous' | 'free' | 'pro' | 'enterprise';
      messages_count: number;
      max_messages_limit: number;
    }>(
      `SELECT id, external_id, email, password_hash, name, is_anonymous, tier, messages_count, max_messages_limit
       FROM users
       WHERE external_id = $1 OR email = $1`,
      [cleanUsername]
    );

    if (res.rowCount === 0 || !res.rows[0].password_hash) {
      throw { status: 401, message: 'Usuario o contraseña incorrectos.' };
    }

    const userRow = res.rows[0];
    const valid = await bcrypt.compare(password, userRow.password_hash);
    if (!valid) {
      throw { status: 401, message: 'Usuario o contraseña incorrectos.' };
    }

    const user: UserPayload = {
      id: userRow.id,
      external_id: userRow.external_id,
      email: userRow.email,
      name: userRow.name,
      is_anonymous: userRow.is_anonymous,
      tier: userRow.tier,
      messages_count: userRow.messages_count,
      max_messages_limit: userRow.max_messages_limit,
    };

    const token = this.generateToken(user);
    return { user, token };
  }

  /**
   * Obtiene o crea un usuario anónimo (para visitantes web)
   */
  static async getOrCreateAnonymousUser(visitorId: string): Promise<{ user: UserPayload; token: string }> {
    const cleanId = `anon_${visitorId.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 50)}`;
    
    let res = await query<UserPayload>(
      `SELECT id, external_id, email, name, is_anonymous, tier, messages_count, max_messages_limit
       FROM users
       WHERE external_id = $1`,
      [cleanId]
    );

    if (res.rowCount === 0) {
      res = await query<UserPayload>(
        `INSERT INTO users (external_id, is_anonymous, tier, messages_count, max_messages_limit)
         VALUES ($1, true, 'anonymous', 0, 3)
         RETURNING id, external_id, email, name, is_anonymous, tier, messages_count, max_messages_limit`,
        [cleanId]
      );
    }

    const user = res.rows[0];
    const token = this.generateToken(user);
    return { user, token };
  }

  /**
   * Busca un usuario por ID
   */
  static async getUserById(id: string): Promise<UserPayload | null> {
    const res = await query<UserPayload>(
      `SELECT id, external_id, email, name, is_anonymous, tier, messages_count, max_messages_limit
       FROM users
       WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }
}
