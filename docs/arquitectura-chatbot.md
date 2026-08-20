# Documento Técnico — Chatbot Multimodal (Texto / Imagen / Audio futuro)

**Versión:** 1.0  
**Fecha:** Agosto 2026  
**Autor:** Equipo de Ingeniería  
**Estado:** Propuesta de arquitectura con Google Gemini API y PostgreSQL  

---

## 1. Objetivo y Alcance

Diseñar e implementar un chatbot embebible con las siguientes capacidades por fases:

| Fase | Capacidad | Estado |
|---|---|---|
| 1 (MVP) | Conversación por texto con historial | Objetivo inmediato |
| 2 | Envío y análisis multimodal de imágenes (Gemini) | Objetivo inmediato |
| 3 | Entrada/salida de audio (STT / TTS) | Arquitectura lista / Implementación futura |

---

## 2. Contrato de API

| Método | Endpoint | Descripción | Payload / Query |
|---|---|---|---|
| `POST` | `/api/conversaciones` | Crear nuevo chat | `{ "titulo"?: string, "identificador_usuario": string }` |
| `GET` | `/api/conversaciones` | Listar chats | `?usuario_id=...&limit=20` |
| `GET` | `/api/conversaciones/:id/mensajes` | Ver historial de un chat | `id` en path params |
| `DELETE` | `/api/conversaciones/:id` | Eliminar chat | `id` en path params |
| `POST` | `/api/uploads` | Subir imagen a disco | `multipart/form-data` con campo `file` |
| `POST` | `/api/chat` | Enviar mensaje (texto o con adjunto) | `{ "conversacion_id": string, "mensaje": string, "adjunto_id"?: string }` |

---

## 3. Arquitectura y Tecnologías

- **Backend:** Node.js + TypeScript (Express / Fastify)
- **Base de Datos:** PostgreSQL 16 (con migraciones versionadas)
- **Proveedor IA:** Google Gemini API (`@google/genai`) mediante interfaz `IProveedorIA`
- **Almacenamiento de Archivos:** Disco local (`apps/backend/uploads/`) en Fase 1 y 2
- **Contenedores:** Docker & Docker Compose
