// Service Worker para la extensión de Chrome - Chat Translation
class ChatTranslationBackground {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Cuando se instala la extensión
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                console.log('Extensión de traducción de chat instalada');
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
                this.injectChatScript(tabId);
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

    async injectChatScript(tabId) {
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

                console.log('Script de traducción de chat inyectado en pestaña:', tabId);
            }
        } catch (error) {
            console.error('Error al inyectar script:', error);
        }
    }

    async handleMessage(request, sender, sendResponse) {
        switch (request.action) {
            case 'startChatTranslation':
                await this.startChatTranslation(sender.tab.id);
                sendResponse({ success: true });
                break;

            case 'stopChatTranslation':
                await this.stopChatTranslation(sender.tab.id);
                sendResponse({ success: true });
                break;

            case 'saveChatLog':
                await this.saveChatLog(request.data);
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

            case 'getChatHistory':
                const history = await this.getChatHistory();
                sendResponse({ history });
                break;

            case 'clearChatHistory':
                await this.clearChatHistory();
                sendResponse({ success: true });
                break;

            default:
                sendResponse({ error: 'Acción no reconocida' });
        }
    }

    async startChatTranslation(tabId) {
        try {
            await chrome.tabs.sendMessage(tabId, { action: 'startChatTranslation' });
            this.updateBadge(tabId, '🌐');
            console.log('Traducción de chat iniciada en pestaña:', tabId);
        } catch (error) {
            console.error('Error al iniciar traducción de chat:', error);
        }
    }

    async stopChatTranslation(tabId) {
        try {
            await chrome.tabs.sendMessage(tabId, { action: 'stopChatTranslation' });
            this.updateBadge(tabId, '');
            console.log('Traducción de chat detenida en pestaña:', tabId);
        } catch (error) {
            console.error('Error al detener traducción de chat:', error);
        }
    }

    async saveChatLog(data) {
        try {
            const timestamp = new Date().toISOString();
            const chatLogData = {
                timestamp,
                messages: data.messages,
                sourceLanguage: data.sourceLanguage,
                targetLanguage: data.targetLanguage,
                platform: data.platform,
                sessionDuration: data.sessionDuration
            };

            // Obtener logs guardados
            const result = await chrome.storage.local.get(['savedChatLogs']);
            const savedChatLogs = result.savedChatLogs || [];

            // Agregar nuevo log
            savedChatLogs.push(chatLogData);

            // Limitar a los últimos 100 logs
            if (savedChatLogs.length > 100) {
                savedChatLogs.splice(0, savedChatLogs.length - 100);
            }

            await chrome.storage.local.set({ savedChatLogs });
            console.log('Log de chat guardado');
        } catch (error) {
            console.error('Error al guardar log de chat:', error);
        }
    }

    async getSettings() {
        try {
            const result = await chrome.storage.local.get(['chatTranslationSettings']);
            return result.chatTranslationSettings || {
                sourceLanguage: 'en',
                targetLanguage: 'es',
                autoTranslate: true,
                saveChatLogs: true,
                hideOnScreenShare: true,
                translationProvider: 'mymemory',
                showTimestamps: true,
                compactMode: false
            };
        } catch (error) {
            console.error('Error al obtener configuración:', error);
            return {};
        }
    }

    async updateSettings(settings) {
        try {
            await chrome.storage.local.set({ chatTranslationSettings: settings });
            console.log('Configuración actualizada');
        } catch (error) {
            console.error('Error al actualizar configuración:', error);
        }
    }

    async setDefaultSettings() {
        const defaultSettings = {
            sourceLanguage: 'en',
            targetLanguage: 'es',
            autoTranslate: true,
            saveChatLogs: true,
            hideOnScreenShare: true,
            translationProvider: 'mymemory',
            showTimestamps: true,
            compactMode: false
        };

        try {
            await chrome.storage.local.set({ chatTranslationSettings: defaultSettings });
            console.log('Configuración por defecto establecida');
        } catch (error) {
            console.error('Error al establecer configuración por defecto:', error);
        }
    }

    async translateText(text, fromLang, toLang) {
        try {
            // Intentar con múltiples servicios de traducción
            const translationServices = [
                () => this.translateWithMyMemory(text, fromLang, toLang),
                () => this.translateWithLibreTranslate(text, fromLang, toLang),
                () => this.translateWithMicrosoft(text, fromLang, toLang)
            ];

            for (const service of translationServices) {
                try {
                    const result = await service();
                    if (result && result !== text) {
                        return result;
                    }
                } catch (serviceError) {
                    console.warn('Servicio de traducción falló:', serviceError);
                    continue;
                }
            }

            return `[Traducción no disponible] ${text}`;
        } catch (error) {
            console.error('Error en traducción:', error);
            return `[Error de traducción] ${text}`;
        }
    }

    async translateWithMyMemory(text, fromLang, toLang) {
        const response = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`,
            {
                method: 'GET',
                headers: {
                    'User-Agent': 'Chrome Extension Chat Translator'
                }
            }
        );

        const data = await response.json();
        
        if (data.responseData && data.responseData.translatedText) {
            return data.responseData.translatedText;
        }
        
        throw new Error('MyMemory translation failed');
    }

    async translateWithLibreTranslate(text, fromLang, toLang) {
        // LibreTranslate API (requiere configuración del servidor)
        const response = await fetch('https://libretranslate.de/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: text,
                source: fromLang,
                target: toLang,
                format: 'text'
            })
        });

        const data = await response.json();
        
        if (data.translatedText) {
            return data.translatedText;
        }
        
        throw new Error('LibreTranslate translation failed');
    }

    async translateWithMicrosoft(text, fromLang, toLang) {
        // Microsoft Translator (requiere API key)
        // Por ahora retornamos null para usar otros servicios
        throw new Error('Microsoft Translator not configured');
    }

    async getChatHistory() {
        try {
            const result = await chrome.storage.local.get(['savedChatLogs']);
            return result.savedChatLogs || [];
        } catch (error) {
            console.error('Error al obtener historial de chat:', error);
            return [];
        }
    }

    async clearChatHistory() {
        try {
            await chrome.storage.local.set({ savedChatLogs: [] });
            console.log('Historial de chat limpiado');
        } catch (error) {
            console.error('Error al limpiar historial de chat:', error);
        }
    }

    updateBadge(tabId, text = '') {
        try {
            chrome.action.setBadgeText({
                text: text,
                tabId: tabId
            });

            chrome.action.setBadgeBackgroundColor({
                color: text === '🌐' ? '#34a853' : '#4285f4',
                tabId: tabId
            });
        } catch (error) {
            console.error('Error al actualizar badge:', error);
        }
    }

    // Funciones para estadísticas y métricas
    async updateStats(action, data = {}) {
        try {
            const result = await chrome.storage.local.get(['extensionStats']);
            const stats = result.extensionStats || {
                messagesTranslated: 0,
                sessionsStarted: 0,
                totalTimeActive: 0,
                lastUsed: null
            };

            switch (action) {
                case 'messageTranslated':
                    stats.messagesTranslated++;
                    break;
                case 'sessionStarted':
                    stats.sessionsStarted++;
                    stats.lastUsed = new Date().toISOString();
                    break;
                case 'timeActive':
                    stats.totalTimeActive += data.duration || 0;
                    break;
            }

            await chrome.storage.local.set({ extensionStats: stats });
        } catch (error) {
            console.error('Error al actualizar estadísticas:', error);
        }
    }
}

// Inicializar el service worker
const backgroundService = new ChatTranslationBackground();

// Mantener el service worker activo
chrome.runtime.onConnect.addListener((port) => {
    console.log('Service worker conectado');
});

// Función para mantener el service worker vivo
function keepAlive() {
    chrome.runtime.getPlatformInfo(() => {
        // Operación simple para mantener el service worker activo
    });
}

// Ejecutar cada 25 segundos para mantener el service worker activo
setInterval(keepAlive, 25000);

// Manejar instalación y configuración inicial
chrome.runtime.onStartup.addListener(() => {
    console.log('Extension startup - Chat Translation');
});

// Limpiar recursos cuando se suspende
chrome.runtime.onSuspend.addListener(() => {
    console.log('Extension suspending - Chat Translation');
});