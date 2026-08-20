# SyBorx Chat

Chatbox con la API de **Google Gemini**. Frontend con efecto *liquid glass*, tema claro (crema + azul marino) y oscuro (negro + grises), y backend Node.js/Express que protege tu API key.

## Funcionalidades

- Menú lateral (30% de la pantalla) con el historial de chats: título, fecha de creación y botón para eliminar.
- Panel superior con icono de configuración (cambiar modelo de Gemini) e icono de perfil (cerrar sesión / cambiar de cuenta).
- Área de chat (70% de la pantalla) con el título "SyBorx Chat", caja de texto redondeada con efecto vidrio y botón para adjuntar archivos (imágenes y documentos).
- Botón flotante para alternar entre tema claro y oscuro.
- Login con usuario y contraseña (cada usuario tiene sus propios chats).

## Cómo obtener tu API key de Gemini (gratis)

1. Entra a **Google AI Studio**: https://aistudio.google.com
2. Inicia sesión con tu cuenta de Google y acepta los términos de servicio.
3. Ve a la página **"Get API key"** (o al menú **API Keys**): https://aistudio.google.com/apikey
4. Pulsa **"Create API key"**. Se crea automáticamente una key asociada a tu proyecto de Google Cloud.
5. Copia la key (tiene formato `AIza...`).
   - Si aparece la etiqueta **"Unrestricted"**, haz clic en **"Add restrictions"** y restringe la key a la **Gemini API** por seguridad.
6. En el proyecto, crea el archivo **`.env`** (puedes copiar `.env.example`) y pega tu key:

```
GEMINI_API_KEY=TU_API_KEY_AQUI
```

> El modelo predeterminado es `gemini-3.1-flash`. La disponibilidad y los límites dependen de tu cuenta y de la API de Gemini.

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo .env con tu API key (ver arriba)
#    cp .env.example .env   (y edítalo)

# 3. Arrancar
npm start
```

Abre **http://localhost:3000** en tu navegador. Crea tu cuenta en la pantalla de inicio y a conversar.

## Estructura

```
chatBox/
├── server.js          # Servidor Express + rutas de la API
├── src/
│   ├── gemini.js      # Cliente de la API de Gemini
│   └── store.js       # Persistencia de usuarios y chats (data/*.json)
├── public/
│   ├── index.html
│   ├── css/style.css  # Temas claro/oscuro + glassmorphism
│   └── js/app.js      # Lógica del frontend
├── data/              # Se crea en tiempo de ejecución (no se sube a git)
└── .env.example
```

## Configuración

| Variable        | Descripción                                              | Valor por defecto      |
|-----------------|----------------------------------------------------------|------------------------|
| `GEMINI_API_KEY`| Tu API key de Gemini (obligatoria)                       | —                      |
| `GEMINI_MODEL`  | Modelo por defecto                                       | `gemini-3.1-flash`     |
| `PORT`          | Puerto del servidor                                      | `3000`                 |

## Notas de seguridad

- La API key vive solo en el servidor (`server.js` → `src/gemini.js`); nunca se envía al navegador.
- Las contraseñas se guardan con hash SHA-256. Es una app local/demo, no apta para producción.
- Los chats y usuarios se guardan en `data/*.json` (no versionados).