import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';

export const authRouter = Router();

authRouter.post('/register', AuthController.register);
authRouter.post('/login', AuthController.login);
authRouter.post('/logout', requireAuth, AuthController.logout);
authRouter.get('/me', requireAuth, AuthController.getMe);
authRouter.post('/anonymous', AuthController.createAnonymousSession);
