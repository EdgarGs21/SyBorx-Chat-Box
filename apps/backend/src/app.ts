import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { authRouter } from './modules/auth/auth.routes.js';
import { chatsRouter } from './modules/chats/chats.routes.js';
import { geminiProvider } from './modules/ai/gemini.provider.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de CORS
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : '*';

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir archivos estáticos del Frontend
const publicPathCandidates = [
  path.join(process.cwd(), 'public'),
  path.join(__dirname, '../public'),
  path.join(__dirname, '../../public'),
  path.join(__dirname, '../../../public'),
];

const publicPath = publicPathCandidates.find(p => fs.existsSync(p)) || path.join(process.cwd(), 'public');
app.use(express.static(publicPath));

// Endpoints de la API
app.use('/api', authRouter);
app.use('/api/chats', chatsRouter);

// Endpoint de modelos disponibles
app.get('/api/models', (_req: Request, res: Response) => {
  res.json({
    allowed: geminiProvider.getAllowedModels(),
    default: geminiProvider.getDefaultModel(),
  });
});

// Endpoint de Salud
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// 404 para rutas de API no encontradas
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

// Manejador global de errores
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ Error no controlado en la aplicación:', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Error interno del servidor.',
  });
});

app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 Chatbot Backend iniciado con éxito en el puerto ${PORT}`);
  console.log(`🌐 Acceso Web: http://localhost:${PORT}`);
  console.log(`🤖 Proveedor IA: ${process.env.IA_PROVIDER || 'gemini'} (${geminiProvider.getDefaultModel()})`);
  console.log('====================================================');
});

export default app;
