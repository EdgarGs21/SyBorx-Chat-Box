# SyBorx Chat

Chatbox con la API de **Google Gemini**. Frontend con efecto *liquid glass*, tema claro (crema + azul marino) y oscuro (azul marino profundo), y backend Node.js/Express que protege tu API key.

## Funcionalidades

- **Modo anónimo**: la primera pantalla es el chat box, sin necesidad de cuenta. El perfil muestra "Anónimo" y ofrece *Iniciar sesión* / *Registrarse*.
- **Menú lateral (30%)** con el historial de chats: título auto-generado, fecha de creación y botón para eliminar.
- **Panel superior** con icono de configuración (cambiar modelo de Gemini) e icono de perfil (plan, uso, cerrar sesión / cambiar de cuenta).
- **Área de chat (70%)** con la caja de texto redondeada estilo vidrio y botón para adjuntar archivos (imágenes y documentos).
- **Botón flotante** para alternar entre tema claro y oscuro.
- **Planes con límites** (respuestas = mensajes respondidos; archivos = fotos/documentos por mensaje):

| Plan      | Respuestas | Archivos por mensaje |
|-----------|-----------|----------------------|
| Anónimo   | 5         | 0                    |
| Gratuito  | 50        | 5                    |
| Pro       | 100       | 15                   |
| Enterprise| 200       | 40                   |

## Cómo obtener tu API key de Gemini (gratis)

1. Entra a **Google AI Studio**: https://aistudio.google.com
2. Inicia sesión con tu cuenta de Google y acepta los términos de servicio.
3. Ve a la página **API Keys**: https://aistudio.google.com/apikey
4. Pulsa **"Create API key"**. Se crea automáticamente una key asociada a tu proyecto de Google Cloud.
5. Copia la key (formato `AIza...`).
   - Si aparece la etiqueta **"Unrestricted"**, haz clic en **"Add restrictions"** y restringe la key a la **Gemini API**.
6. En el proyecto, crea el archivo **`.env`** (puedes copiar `.env.example`) y pega tu key:

```
GEMINI_API_KEY=TU_API_KEY_AQUI
```

> Modelos disponibles en la capa gratuita: `gemini-flash-latest` (por defecto) y `gemini-3.5-flash-lite`. Otros como `gemini-3.x` o `gemini-2.5-pro` pueden requerir el plan de pago o no estar disponibles para cuentas nuevas.

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo .env con tu API key (ver arriba)
#    cp .env.example .env   (y edítalo)

# 3. Arrancar
npm start
```

Abre **http://localhost:3000**. Puedes usar el chat inmediatamente como anónimo o registrarte eligiendo tu plan.

## Estructura

```
chatBox/
├── server.js          # Servidor Express + rutas de la API (planes, identidad anónima)
├── src/
│   ├── gemini.js      # Cliente de la API de Gemini
│   └── store.js       # Persistencia de usuarios, chats y uso (data/*.json)
├── public/
│   ├── index.html
│   ├── css/style.css  # Temas claro/oscuro + glassmorphism
│   └── js/app.js      # Lógica del frontend
├── data/              # Se crea en tiempo de ejecución (no se sube a git)
└── .env.example
```

## Configuración

| Variable        | Descripción                                              | Valor por defecto        |
|-----------------|----------------------------------------------------------|--------------------------|
| `GEMINI_API_KEY`| Tu API key de Gemini (obligatoria)                       | —                        |
| `GEMINI_MODEL`  | Modelo por defecto                                       | `gemini-flash-latest`    |
| `PORT`          | Puerto del servidor                                      | `3000`                   |

## Notas

- La API key vive solo en el servidor (`server.js` → `src/gemini.js`); nunca se envía al navegador.
- El uso anónimo se rastrea por un `clientId` guardado en el `localStorage` del navegador (se resetea si se borran los datos del sitio).
- Las contraseñas se guardan con hash SHA-256. Es una app local/demo, no apta para producción.
- Los chats, usuarios y uso se guardan en `data/*.json` (no versionados).