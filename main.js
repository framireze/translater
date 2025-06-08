const { app, BrowserWindow, ipcMain, screen, Menu, Tray } = require('electron');
const path = require('path');
const { AudioCapture } = require('./src/audioCapture');
const { TranscriptionService } = require('./src/services/transcriptionService');
const { TranslationService } = require('./src/services/translationService');
const { GeminiService } = require('./src/services/geminiService');
require('dotenv').config();

let mainWindow;
let overlayWindow;
let tray;
let audioCapture;
let transcriptionService;
let translationService;
let geminiService;

// Configuración de ventanas
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadFile('src/views/index.html');
  
  // DevTools en modo desarrollo
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Ventana overlay flotante
function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  overlayWindow = new BrowserWindow({
    width: 400,
    height: 600,
    x: width - 420,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    skipTaskbar: true,
    resizable: true
  });

  overlayWindow.loadFile('src/views/overlay.html');
  overlayWindow.setIgnoreMouseEvents(false);
  
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// System tray
function createTray() {
  try {
    // Usar nativeImage para mejor compatibilidad
    const { nativeImage } = require('electron');
    const trayIconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    
    // Verificar si el archivo existe
    const fs = require('fs');
    if (!fs.existsSync(trayIconPath)) {
      console.error('Tray icon no encontrado en:', trayIconPath);
      // Crear un icono temporal si no existe
      const tempIcon = nativeImage.createEmpty();
      tray = new Tray(tempIcon);
    } else {
      // Cargar el icono usando nativeImage
      const trayIcon = nativeImage.createFromPath(trayIconPath);
      // Redimensionar a 16x16 para Windows
      const resizedIcon = trayIcon.resize({ width: 16, height: 16 });
      tray = new Tray(resizedIcon);
    }
    
    const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar aplicación',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createMainWindow();
        }
      }
    },
    {
      label: 'Mostrar/Ocultar Overlay',
      click: () => {
        if (overlayWindow) {
          overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
        } else {
          createOverlayWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Interview Assistant 360');
  tray.setContextMenu(contextMenu);
} catch (error) {
  console.error('Error creando el tray:', error);
}}

// Inicializar servicios
function initializeServices() {
  try {
    console.log('Inicializando servicios...');
    console.log('GOOGLE_CLOUD_KEY_PATH:', process.env.GOOGLE_CLOUD_KEY_PATH);
    console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'Configurado' : 'No configurado');
    
    audioCapture = new AudioCapture();
    transcriptionService = new TranscriptionService(process.env.GOOGLE_CLOUD_KEY_PATH);
    translationService = new TranslationService(process.env.GOOGLE_CLOUD_KEY_PATH);
    geminiService = new GeminiService(process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_KEY_PATH);
    
    console.log('Servicios inicializados correctamente');
  } catch (error) {
    console.error('Error inicializando servicios:', error);
  }
}

// IPC Handlers
ipcMain.handle('start-capture', async () => {
  try {
    console.log('=== INICIANDO CAPTURA ===');
    
    // Verificar que audioCapture esté inicializado
    if (!audioCapture) {
      console.error('AudioCapture no está inicializado');
      initializeServices(); // Intentar inicializar de nuevo
      if (!audioCapture) {
        throw new Error('No se pudo inicializar el servicio de captura de audio');
      }
    }
    
    // Verificar servicios
    console.log('AudioCapture:', audioCapture ? 'OK' : 'NO');
    console.log('TranscriptionService:', transcriptionService ? 'OK' : 'NO');
    console.log('TranslationService:', translationService ? 'OK' : 'NO');
    
    // Remover listeners anteriores para evitar duplicados
    audioCapture.removeAllListeners('audioData');
    transcriptionService.removeAllListeners('transcription');
    
    // Configurar listener para transcripciones
    transcriptionService.on('transcription', async (transcription) => {
      console.log('✅ Transcripción recibida:', transcription.text);
      
      // Enviar transcripción a las ventanas
      if (mainWindow) {
        mainWindow.webContents.send('transcription', transcription);
      }
      if (overlayWindow) {
        overlayWindow.webContents.send('transcription', transcription);
      }
      
      // Traducir si es necesario
      if (transcription.language !== 'es') {
        try {
          const translation = await translationService.translate(
            transcription.text, 
            transcription.language, 
            'es',
            transcription.transcriptId
          );
          
          if (mainWindow && translation) {
            mainWindow.webContents.send('translation', translation);
          }
          if (overlayWindow && translation) {
            overlayWindow.webContents.send('translation', translation);
          }
        } catch (error) {
          console.error('Error traduciendo:', error);
        }
      }
    });
    
    // Listener para transcripciones parciales
    transcriptionService.on('interim-transcription', (transcription) => {
      // Enviar a las ventanas sin traducir (son temporales)
      if (mainWindow) {
        mainWindow.webContents.send('interim-transcription', transcription);
      }
      if (overlayWindow) {
        overlayWindow.webContents.send('interim-transcription', transcription);
      }
    });
    
    // Listener para errores de transcripción
    transcriptionService.on('error', (error) => {
      console.error('Error en servicio de transcripción:', error);
    });
    
    // Iniciar streaming de transcripción
    console.log('Iniciando streaming de transcripción...');
    await transcriptionService.startStreamingRecognition();
    console.log('Streaming iniciado correctamente');
    
    await audioCapture.startCapture();
    
    // Contador para debug
    let audioChunkCount = 0;
    
    audioCapture.on('audioData', async (audioBuffer) => {
      audioChunkCount++;
      if (audioChunkCount % 10 === 0) {
        console.log(`Audio chunk #${audioChunkCount}, tamaño: ${audioBuffer.length} bytes`);
      }
      
      try {
        // Solo enviar el audio al stream
        await transcriptionService.transcribe(audioBuffer);
      } catch (error) {
        console.error('Error procesando audio:', error);
        // No detener la captura por errores de transcripción
      }
    });
    
    // Listener para errores de captura
    audioCapture.on('error', (error) => {
      console.error('Error en captura de audio:', error);
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error starting capture:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-capture', async () => {
  try {
    if (audioCapture) {
      audioCapture.stopCapture();
    }
    if (transcriptionService && transcriptionService.stopStreaming) {
      transcriptionService.stopStreaming();
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ask-gemini', async (event, question, context) => {
  try {
    const response = await geminiService.askQuestion(question, context);
    return { success: true, response };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('toggle-overlay', () => {
  if (overlayWindow) {
    overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
  } else {
    createOverlayWindow();
  }
});


// IPC for Overlay:
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('window-hide', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.hide();
});

ipcMain.on('window-pin', (event, isPinned) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setAlwaysOnTop(isPinned);
});

ipcMain.on('window-resize', (event, { deltaX, deltaY }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
      const [width, height] = win.getSize();
      win.setSize(
          Math.max(300, width + deltaX),
          Math.max(200, height + deltaY)
      );
  }
});

// FIN DE IPC's Overlay

// App events
app.whenReady().then(async () => {
  try {
    createMainWindow();
    createOverlayWindow();
    createTray();
    initializeServices();
  } catch (error) {
    console.error('Error durante la inicialización:', error);
  }
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error);
  // No cerrar la aplicación
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesa rechazada no manejada:', reason);
  // No cerrar la aplicación
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});