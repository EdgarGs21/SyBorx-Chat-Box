import { Router } from 'express';
import { ChatsController } from './chats.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';

export const chatsRouter = Router();

// Todas las rutas de chats requieren autenticación (token de usuario registrado o anónimo)
chatsRouter.use(requireAuth);

chatsRouter.get('/', ChatsController.list);
chatsRouter.post('/', ChatsController.create);
chatsRouter.get('/models', ChatsController.getModels);
chatsRouter.get('/:id', ChatsController.getById);
chatsRouter.delete('/:id', ChatsController.delete);
chatsRouter.post('/:id/messages', ChatsController.sendMessage);
