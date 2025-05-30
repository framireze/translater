// Service Worker para la extensión de Chrome
class TranscriptionExtensionBackground {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Cuando se instala la extensión
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                console.log('Extensión de transcripción instalada');
                this.setDefaultSettings();
            }
        });

        // Manejar mensajes del content script
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Mantener el canal de comunicación abierto
        });

        // Manejar cambios en las pestañas
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && this.isVideoCallSite(tab.url)) {
                this.injectTranscriptionScript(tabId);
            }
        });

        // Detectar cuando se activa una pestaña
        chrome.tabs.onActivated.addListener((activeInfo) => {
            chrome.tabs.get(activeInfo.tabId, (tab) => {
                if (this.isVideoCallSite(tab.url)) {
                    this.updateBadge(activeInfo.tabId);
                }
            });
        });
    }

    isVideoCallSite(url) {
        if (!url) return false;
        return url.includes('teams.microsoft.com') ||
            url.includes('meet.google.com');
    }

    async injectTranscriptionScript(tabId) {
        try {
            // Verificar si el content script ya está inyectado
            const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                function: () => {
                    return window.transcriptionExtensionLoaded || false;
                }
            });

            if (!results[0].result) {
                // Inyectar el content script si no está presente
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content.js']
                });

                await chrome.scripting.insertCSS({
                    target: { tabId: tabId },
                    files: ['content.css']
                });

                console.log('Script de transcripción inyectado en pestaña:', tabId);
            }
        } catch (error) {
            console.error('Error al inyectar script:', error);
        }
    }

    async handleMessage(request, sender, sendResponse) {
        switch (request.action) {
            case 'startTranscription':
                await this.startTranscription(sender.tab.id);
                sendResponse({ success: true });
                break;

            case 'stopTranscription':
                await this.stopTranscription(sender.tab.id);
                sendResponse({ success: true });
                break;

            case 'saveTranscription':
                await this.saveTranscription(request.data);
                sendResponse({ success: true });
                break;

            case 'getSettings':
                const settings = await this.getSettings();
                sendResponse({ settings });
                break;

            case 'updateSettings':
                await this.updateSettings(request.settings);
                sendResponse({ success: true });
                break;

            case 'translateText':
                const translation = await this.translateText(request.text, request.from, request.to);
                sendResponse({ translation });
                break;

            default:
                sendResponse({ error: 'Acción no reconocida' });
        }
    }

    async startTranscription(tabId) {
        try {
            await chrome.tabs.sendMessage(tabId, { action: 'startTranscription' });
            this.updateBadge(tabId, 'REC');
            console.log('Transcripción iniciada en pestaña:', tabId);
        } catch (error) {
            console.error('Error al iniciar transcripción:', error);
        }
    }

    async stopTranscription(tabId) {
        try {
            await chrome.tabs.sendMessage(tabId, { action: 'stopTranscription' });
            this.updateBadge(tabId, '');
            console.log('Transcripción detenida en pestaña:', tabId);
        } catch (error) {
            console.error('Error al detener transcripción:', error);
        }
    }

    async saveTranscription(data) {
        try {
            const timestamp = new Date().toISOString();
            const transcriptionData = {
                timestamp,
                content: data.content,
                language: data.language,
                platform: data.platform
            };

            // Obtener transcripciones guardadas
            const result = await chrome.storage.local.get(['savedTranscriptions']);
            const savedTranscriptions = result.savedTranscriptions || [];

            // Agregar nueva transcripción
            savedTranscriptions.push(transcriptionData);

            // Limitar a las últimas 50 transcripciones
            if (savedTranscriptions.length > 50) {
                savedTranscriptions.splice(0, savedTranscriptions.length - 50);
            }

            await chrome.storage.local.set({ savedTranscriptions });
            console.log('Transcripción guardada');
        } catch (error) {
            console.error('Error al guardar transcripción:', error);
        }
    }

    async getSettings() {
        try {
            const result = await chrome.storage.local.get(['transcriptionSettings']);
            return result.transcriptionSettings || {
                sourceLanguage: 'es-ES',
                targetLanguage: 'en',
                autoTranslate: true,
                saveTranscriptions: true,
                hideOnScreenShare: true
            };
        } catch (error) {
            console.error('Error al obtener configuración:', error);
            return {};
        }
    }

    async updateSettings(settings) {
        try {
            await chrome.storage.local.set({ transcriptionSettings: settings });
            console.log('Configuración actualizada');
        } catch (error) {
            console.error('Error al actualizar configuración:', error);
        }
    }

    async setDefaultSettings() {
        const defaultSettings = {
            sourceLanguage: 'es-ES',
            targetLanguage: 'en',
            autoTranslate: true,
            saveTranscriptions: true,
            hideOnScreenShare: true
        };

        try {
            await chrome.storage.local.set({ transcriptionSettings: defaultSettings });
            console.log('Configuración por defecto establecida');
        } catch (error) {
            console.error('Error al establecer configuración por defecto:', error);
        }
    }

    async translateText(text, fromLang, toLang) {
        const API_KEY = 'TU_CLAVE_API_AQUI';
        try {
            const response = await fetch(
                `https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        q: text,
                        source: fromLang,
                        target: toLang
                    })
                }
            );

            const data = await response.json();
            return data.data.translations[0].translatedText;
        } catch (error) {
            console.error('Error en traducción:', error);
            return `[Error de traducción] ${text}`;
        }
    }

    updateBadge(tabId, text = '') {
        try {
            chrome.action.setBadgeText({
                text: text,
                tabId: tabId
            });

            chrome.action.setBadgeBackgroundColor({
                color: text === 'REC' ? '#ff0000' : '#4285f4',
                tabId: tabId
            });
        } catch (error) {
            console.error('Error al actualizar badge:', error);
        }
    }
}

// Inicializar el service worker
const backgroundService = new TranscriptionExtensionBackground();

// Mantener el service worker activo
chrome.runtime.onConnect.addListener((port) => {
    console.log('Service worker conectado');
});

// Función para mantener el service worker vivo
function keepAlive() {
    chrome.runtime.getPlatformInfo(() => {
        // Simplemente una operación para mantener el service worker activo
    });
}

// Ejecutar cada 20 segundos para mantener el service worker activo
setInterval(keepAlive, 20000);