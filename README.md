# Interview Assistant 360 🎤

Una aplicación de escritorio potente para asistencia en tiempo real durante entrevistas técnicas y reuniones profesionales. Transcribe, traduce y proporciona soporte con IA durante tus videollamadas.

## 🚀 Características

- **Transcripción en Tiempo Real**: Captura y transcribe el audio del sistema usando Google Speech-to-Text
- **Traducción Automática**: Traduce automáticamente conversaciones en otros idiomas
- **Asistente IA Integrado**: Gemini AI para responder preguntas técnicas y proporcionar contexto
- **Overlay Flotante**: Ventana always-on-top para ver transcripciones sin cambiar de aplicación
- **Sugerencias Inteligentes**: Obtén sugerencias de respuestas y preguntas basadas en el contexto
- **Historial de Conversación**: Guarda y analiza conversaciones completas

## 📋 Requisitos Previos

- Windows 10/11
- Node.js 16+ y npm
- Cuenta de Google Cloud con APIs habilitadas:
  - Speech-to-Text API
  - Translation API
- API Key de Google Gemini
- FFmpeg (para captura de audio)

## 🛠️ Instalación

### 1. Clonar el repositorio
```bash
git clone [tu-repositorio]
cd interview-assistant-360
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita las siguientes APIs:
   - Cloud Speech-to-Text API
   - Cloud Translation API
4. Crea una cuenta de servicio:
   - Ve a "IAM y administración" > "Cuentas de servicio"
   - Crea una nueva cuenta de servicio
   - Descarga el archivo JSON de credenciales
5. Guarda el archivo JSON en `credentials/google-cloud-key.json`

### 4. Configurar Gemini AI

1. Ve a [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Genera una nueva API key
3. Copia la API key

### 5. Configurar variables de entorno

1. Copia el archivo `.env.example` a `.env`:
```bash
cp .env.example .env
```

2. Edita `.env` con tus credenciales:
```env
GOOGLE_CLOUD_KEY_PATH=./credentials/google-cloud-key.json
GEMINI_API_KEY=tu_api_key_de_gemini
```

### 6. Instalar FFmpeg

1. Descarga FFmpeg desde [ffmpeg.org](https://ffmpeg.org/download.html)
2. Extrae `ffmpeg.exe` en la carpeta `bin/` del proyecto
3. La estructura debe ser: `interview-assistant-360/bin/ffmpeg.exe`

## 🚀 Uso

### Iniciar la aplicación
```bash
npm start
```

### Modo desarrollo (con DevTools)
```bash
npm run dev
```

### Construir ejecutable
```bash
npm run build
```

## 💡 Guía de Uso

### 1. Configuración inicial
- Al iniciar, selecciona tu dispositivo de audio en el dropdown
- Para capturar audio de videollamadas, selecciona "Mezcla estéreo" o similar

### 2. Iniciar grabación
- Haz clic en "Iniciar Grabación" para comenzar la transcripción
- El indicador se pondrá rojo y parpadeará

### 3. Usar el Overlay
- Haz clic en "Overlay" para mostrar/ocultar la ventana flotante
- Puedes moverla y redimensionarla según necesites
- El botón 📌 la mantiene siempre visible

### 4. Asistente IA
- Escribe preguntas en el panel derecho
- Usa las sugerencias rápidas para consultas comunes
- El contexto de la conversación se mantiene automáticamente

### 5. Acciones rápidas en Overlay
- **Transcripción**: Vista en tiempo real de lo que se dice
- **Sugerencias**: Respuestas sugeridas basadas en contexto
- **Acciones**: Herramientas rápidas como traducir, resumir, etc.

## 🔧 Solución de Problemas

### El audio no se captura
1. Verifica que el dispositivo de audio correcto esté seleccionado
2. En Windows, habilita "Mezcla estéreo" en configuración de sonido
3. Asegúrate de que FFmpeg esté en la carpeta `bin/`

### Error de autenticación con Google
1. Verifica que el archivo de credenciales esté en la ruta correcta
2. Confirma que las APIs estén habilitadas en Google Cloud Console
3. Revisa que las credenciales tengan los permisos necesarios

### La traducción no funciona
1. Verifica que el idioma de origen sea detectado correctamente
2. Asegúrate de que la API de Translation esté habilitada
3. Revisa los logs en la consola para errores específicos

## 📁 Estructura del Proyecto

```
interview-assistant-360/
├── main.js                 # Proceso principal de Electron
├── package.json           # Configuración del proyecto
├── .env                   # Variables de entorno (no commitear)
├── .env.example          # Ejemplo de configuración
├── bin/                  # Binarios externos
│   └── ffmpeg.exe       # FFmpeg para captura de audio
├── credentials/         # Credenciales de Google Cloud
│   └── google-cloud-key.json
├── src/
│   ├── audioCapture.js  # Módulo de captura de audio
│   ├── services/       # Servicios de APIs
│   │   ├── transcriptionService.js
│   │   ├── translationService.js
│   │   └── geminiService.js
│   └── views/          # Interfaces HTML
│       ├── index.html  # Ventana principal
│       └── overlay.html # Ventana flotante
└── assets/            # Recursos de la aplicación
    ├── icon.png
    └── tray-icon.png
```

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la licencia MIT. Ver `LICENSE` para más detalles.

## 🙏 Agradecimientos

- Google Cloud Speech-to-Text por la transcripción
- Google Translate por las traducciones
- Google Gemini por la asistencia IA
- Electron por el framework de aplicación de escritorio

---

**Nota**: Esta aplicación está diseñada para uso personal y educativo. Asegúrate de cumplir con las leyes locales sobre grabación de conversaciones y obtén el consentimiento necesario antes de grabar.