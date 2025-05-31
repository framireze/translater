class ChatMessageInterceptor {
  constructor() {
    this.isActive = false;
    this.currentLanguage = 'es-ES';
    this.targetLanguage = 'en';
    this.chatPanel = null;
    this.isScreenSharing = false;
    this.messages = [];
    this.platform = this.detectPlatform();
    this.recognition = null;
    this.isListening = false;
    this.sessionStartTime = null;
    this.wordCount = 0;
    
    this.init();
  }

  async init() {
    // Evitar inicialización múltiple
    if (window.chatMessageInterceptorInstance && window.chatMessageInterceptorInstance !== this) {
      return;
    }
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  async setup() {
    await this.loadSettings();
    this.createChatPanel();
    this.initSpeechRecognition();
    this.detectScreenSharing();
    this.addEventListeners();
    this.setupMessageListener();
  }

  detectPlatform() {
    const url = window.location.href;
    if (url.includes('teams.microsoft.com')) return 'teams';
    if (url.includes('meet.google.com')) return 'meet';
    return 'unknown';
  }

  createChatPanel() {
    // Verificar si ya existe el panel
    if (document.getElementById('chat-translation-panel')) {
      this.chatPanel = document.getElementById('chat-translation-panel');
      return;
    }

    this.chatPanel = document.createElement('div');
    this.chatPanel.id = 'chat-translation-panel';
    this.chatPanel.innerHTML = `
      <div class="chat-header">
        <div class="platform-info">
          <span class="platform-icon">${this.platform === 'teams' ? '📺' : '🎥'}</span>
          <span>Chat Translation</span>
        </div>
        <div class="chat-controls">
          <button id="toggle-speech" class="control-btn speech-btn" title="Iniciar reconocimiento de voz">🎤</button>
          <button id="toggle-translation" class="control-btn" title="Activar/Desactivar traducción">🌐</button>
          <button id="clear-chat" class="control-btn" title="Limpiar chat">🗑️</button>
          <button id="minimize-chat" class="control-btn" title="Minimizar">➖</button>
        </div>
      </div>
      <div class="chat-content">
        <div class="language-selector">
          <select id="source-language">
            <option value="es-ES">Español (España)</option>
            <option value="es-MX">Español (México)</option>
            <option value="en-US">English (US)</option>
            <option value="fr-FR">Français</option>
            <option value="de-DE">Deutsch</option>
            <option value="it-IT">Italiano</option>
            <option value="pt-BR">Português (Brasil)</option>
          </select>
          <button id="swap-languages" class="swap-btn" title="Intercambiar idiomas" style="
            background: none;
            border: 1px solid #ddd;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            transition: all 0.2s;
          ">⇄</button>
          <select id="target-language">
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="it">Italiano</option>
            <option value="pt">Português</option>
          </select>
        </div>
        <div class="chat-container">
          <div class="original-chat">
            <div class="chat-title">
              <span class="flag">🇪🇸</span>
              <span>Original Chat</span>
            </div>
            <div id="original-messages" class="messages-container"></div>
          </div>
          <div class="translated-chat">
            <div class="chat-title">
              <div class="translation-icon">🌐</div>
              <span>Translation (English)</span>
            </div>
            <div id="translated-messages" class="messages-container"></div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.chatPanel);
  }

  initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('Speech Recognition no soportado en este navegador');
      this.showNotification('Speech Recognition no soportado en este navegador', 'error');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.currentLanguage;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      console.log('Reconocimiento de voz iniciado');
      this.isListening = true;
      this.updateSpeechButton();
    };

    this.recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      if (finalTranscript) {
        this.processSpeechResult(finalTranscript, true);
      } else if (interimTranscript) {
        this.processSpeechResult(interimTranscript, false);
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Error en Speech Recognition:', event.error);
      this.isListening = false;
      this.updateSpeechButton();
      
      if (event.error === 'not-allowed') {
        this.showNotification('Permisos de micrófono denegados. Por favor, permite el acceso al micrófono.', 'error');
      } else if (event.error === 'no-speech') {
        // Solo reintentar si está activo y no hay otros errores
        if (this.isActive && this.isListening) {
          setTimeout(() => {
            if (this.isActive) {
              this.startSpeechRecognition();
            }
          }, 1000);
        }
      }
    };

    this.recognition.onend = () => {
      console.log('Reconocimiento de voz terminado');
      this.isListening = false;
      this.updateSpeechButton();
      
      // Reiniciar automáticamente si está activo
      if (this.isActive) {
        setTimeout(() => {
          this.startSpeechRecognition();
        }, 100);
      }
    };
  }

  processSpeechResult(text, isFinal) {
    if (!text.trim()) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const messageData = {
      id: Date.now() + Math.random(),
      text: text.trim(),
      sender: 'You',
      timestamp: timestamp,
      platform: this.platform,
      isFinal: isFinal
    };
    
    if (isFinal) {
      // Remover mensaje provisional si existe
      const provisional = document.querySelector('.provisional-message');
      if (provisional) provisional.remove();
      
      this.messages.push(messageData);
      this.displayMessage(messageData, true);
      this.translateAndDisplay(messageData);
      
      // Actualizar contador de palabras
      this.wordCount += text.trim().split(/\s+/).length;
      this.updateStats();
    } else {
      // Mostrar texto provisional
      this.displayMessage(messageData, false);
    }
  }

  startSpeechRecognition() {
    if (this.recognition && !this.isListening) {
      try {
        this.recognition.start();
      } catch (error) {
        console.error('Error al iniciar reconocimiento:', error);
        // Si ya está iniciado, no hacer nada
        if (error.message && error.message.includes('already started')) {
          this.isListening = true;
          this.updateSpeechButton();
        }
      }
    }
  }

  stopSpeechRecognition() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.error('Error al detener reconocimiento:', error);
      }
    }
  }

  updateSpeechButton() {
    const speechButton = document.getElementById('toggle-speech');
    if (speechButton) {
      if (this.isListening) {
        speechButton.style.background = '#dc3545';
        speechButton.innerHTML = '⏹️';
        speechButton.title = 'Detener grabación';
        speechButton.classList.add('recording');
      } else if (this.isActive) {
        speechButton.style.background = '#28a745';
        speechButton.innerHTML = '🎤';
        speechButton.title = 'Micrófono activo (click para desactivar)';
        speechButton.classList.remove('recording');
        speechButton.classList.add('active');
      } else {
        speechButton.style.background = 'rgba(255, 255, 255, 0.2)';
        speechButton.innerHTML = '🎤';
        speechButton.title = 'Iniciar reconocimiento de voz';
        speechButton.classList.remove('recording', 'active');
      }
    }
  }

  showNotification(message, type = 'info') {
    // Remover notificaciones existentes
    const existingNotification = document.querySelector('.extension-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = 'extension-notification';
    notification.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      background: ${type === 'error' ? '#dc3545' : '#28a745'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 1000000;
      font-family: Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, 5000);
  }

  displayMessage(messageData, isFinal = true) {
    const originalContainer = document.getElementById('original-messages');
    if (!originalContainer) return;
    
    if (!isFinal) {
      // Buscar mensaje provisional existente
      let provisional = originalContainer.querySelector('.provisional-message');
      if (provisional) {
        provisional.querySelector('.message-text').textContent = messageData.text;
      } else {
        // Crear nuevo mensaje provisional
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message-bubble user-message provisional-message';
        messageDiv.innerHTML = `
          <div class="message-header">
            <span class="sender">${messageData.sender}</span>
            <span class="timestamp">${messageData.timestamp}</span>
          </div>
          <div class="message-text">${messageData.text}</div>
        `;
        originalContainer.appendChild(messageDiv);
      }
    } else {
      // Mensaje final
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message-bubble user-message';
      messageDiv.innerHTML = `
        <div class="message-header">
          <span class="sender">${messageData.sender}</span>
          <span class="timestamp">${messageData.timestamp}</span>
        </div>
        <div class="message-text">${messageData.text}</div>
      `;
      originalContainer.appendChild(messageDiv);
    }
    
    originalContainer.scrollTop = originalContainer.scrollHeight;
  }

  async translateAndDisplay(messageData) {
    if (this.chatPanel.classList.contains('translation-disabled')) {
      return;
    }
    
    try {
      const translatedText = await this.translateText(messageData.text);
      
      const translatedContainer = document.getElementById('translated-messages');
      if (!translatedContainer) return;
      
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message-bubble user-message';
      
      messageDiv.innerHTML = `
        <div class="message-header">
          <span class="sender">${messageData.sender}</span>
          <span class="timestamp">${messageData.timestamp}</span>
        </div>
        <div class="message-text">${translatedText}</div>
      `;
      
      translatedContainer.appendChild(messageDiv);
      translatedContainer.scrollTop = translatedContainer.scrollHeight;
      
      // Notificar al background sobre la traducción
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ 
          action: 'updateStats', 
          statType: 'messageTranslated' 
        });
      }
      
    } catch (error) {
      console.error('Error al traducir mensaje:', error);
    }
  }

  async translateText(text) {
    try {
      const sourceLanguage = this.currentLanguage.split('-')[0];
      const targetLanguage = this.targetLanguage;
      
      console.log(`Traduciendo de ${sourceLanguage} a ${targetLanguage}: "${text}"`);
      
      // Método 1: Google Translate (sin API key)
      try {
        const response = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLanguage}&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(text)}`
        );
        
        if (response.ok) {
          const data = await response.json();
          
          // La respuesta de Google Translate es un array anidado complejo
          let translatedText = '';
          if (data && data[0]) {
            for (let i = 0; i < data[0].length; i++) {
              if (data[0][i] && data[0][i][0]) {
                translatedText += data[0][i][0];
              }
            }
          }
          
          if (translatedText && translatedText !== text) {
            console.log(`Traducción exitosa: "${translatedText}"`);
            return translatedText;
          }
        }
      } catch (error) {
        console.warn('Error con Google Translate:', error);
      }
      
      // Método 2: Intentar con el background service
      if (chrome.runtime && chrome.runtime.sendMessage) {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'translateText',
            text: text,
            from: sourceLanguage,
            to: targetLanguage
          });
          
          if (response && response.translation && response.translation !== text) {
            return response.translation;
          }
        } catch (error) {
          console.warn('Error al traducir con background service:', error);
        }
      }
      
      // Método 3: LibreTranslate (API pública)
      try {
        const libreResponse = await fetch('https://libretranslate.com/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: text,
            source: sourceLanguage,
            target: targetLanguage,
            format: 'text'
          })
        });
        
        if (libreResponse.ok) {
          const libreData = await libreResponse.json();
          if (libreData.translatedText) {
            return libreData.translatedText;
          }
        }
      } catch (error) {
        console.warn('Error con LibreTranslate:', error);
      }
      
      // Si todos los métodos fallan
      console.error('Todos los métodos de traducción fallaron');
      return `[Traducción no disponible] ${text}`;
    } catch (error) {
      console.error('Error general en traducción:', error);
      return `[Error de traducción] ${text}`;
    }
  }

  detectScreenSharing() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        const shareIndicators = document.querySelectorAll([
          '[data-tid="screen-share-indicator"]',
          '[aria-label*="sharing"]',
          '.sharing-indicator',
          '[title*="sharing"]',
          '[class*="screen-share"]'
        ].join(','));
        
        const wasSharing = this.isScreenSharing;
        this.isScreenSharing = shareIndicators.length > 0;
        
        if (wasSharing !== this.isScreenSharing) {
          this.handleScreenShareChange();
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-label', 'title', 'data-tid']
    });
  }

  async handleScreenShareChange() {
    const settings = await this.getSettings();
    
    if (settings.hideOnScreenShare) {
      if (this.isScreenSharing) {
        this.chatPanel.style.display = 'none';
      } else {
        this.chatPanel.style.display = 'block';
      }
    }
  }

  setupMessageListener() {
    // Escuchar mensajes del popup y background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'startTranscription':
          this.startTranscription();
          sendResponse({ success: true });
          break;
          
        case 'stopTranscription':
          this.stopTranscription();
          sendResponse({ success: true });
          break;
          
        case 'clearTranscription':
          this.clearChat();
          sendResponse({ success: true });
          break;
          
        case 'getTranscriptionData':
          sendResponse({ 
            data: {
              messages: this.messages,
              wordCount: this.wordCount,
              sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0
            }
          });
          break;
          
        case 'startChatTranslation':
          this.startTranscription();
          sendResponse({ success: true });
          break;
          
        case 'stopChatTranslation':
          this.stopTranscription();
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ error: 'Acción no reconocida' });
      }
      
      return true; // Mantener el canal abierto para respuestas asíncronas
    });
  }

  addEventListeners() {
    // Usar event delegation para evitar problemas con elementos dinámicos
    this.chatPanel.addEventListener('click', (e) => {
      const target = e.target;
      
      if (target.id === 'toggle-speech' || target.closest('#toggle-speech')) {
        e.preventDefault();
        this.toggleSpeechRecognition();
      } else if (target.id === 'toggle-translation' || target.closest('#toggle-translation')) {
        e.preventDefault();
        this.toggleTranslation();
      } else if (target.id === 'clear-chat' || target.closest('#clear-chat')) {
        e.preventDefault();
        this.clearChat();
      } else if (target.id === 'minimize-chat' || target.closest('#minimize-chat')) {
        e.preventDefault();
        this.minimizePanel();
      } else if (target.id === 'swap-languages' || target.closest('#swap-languages')) {
        e.preventDefault();
        this.swapLanguages();
      }
    });

    this.chatPanel.addEventListener('change', (e) => {
      const target = e.target;
      
      if (target.id === 'source-language') {
        this.currentLanguage = target.value;
        if (this.recognition) {
          this.recognition.lang = this.currentLanguage;
        }
        this.updateChatTitle();
        this.saveSettings();
        
        // Reiniciar reconocimiento con nuevo idioma
        if (this.isActive && this.isListening) {
          this.stopSpeechRecognition();
          setTimeout(() => this.startSpeechRecognition(), 500);
        }
      } else if (target.id === 'target-language') {
        this.targetLanguage = target.value;
        this.updateChatTitle();
        this.saveSettings();
      }
    });

    this.makeDraggable();
  }

  startTranscription() {
    this.isActive = true;
    this.sessionStartTime = Date.now();
    this.startSpeechRecognition();
    this.showNotification('Transcripción iniciada', 'info');
    this.updateSpeechButton();
    
    // Notificar al background
    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ 
        action: 'updateStats', 
        statType: 'sessionStarted' 
      });
    }
  }

  stopTranscription() {
    this.isActive = false;
    this.stopSpeechRecognition();
    this.showNotification('Transcripción detenida', 'info');
    this.updateSpeechButton();
    
    // Guardar duración de la sesión
    if (this.sessionStartTime && chrome.runtime && chrome.runtime.sendMessage) {
      const duration = Date.now() - this.sessionStartTime;
      chrome.runtime.sendMessage({ 
        action: 'updateStats', 
        statType: 'timeActive',
        data: { duration: duration }
      });
    }
  }

  toggleSpeechRecognition() {
    if (!this.recognition) {
      this.showNotification('Speech Recognition no está disponible', 'error');
      return;
    }
    
    if (this.isActive) {
      this.stopTranscription();
    } else {
      this.startTranscription();
    }
  }

  toggleTranslation() {
    const isDisabled = this.chatPanel.classList.contains('translation-disabled');
    
    if (isDisabled) {
      this.chatPanel.classList.remove('translation-disabled');
      this.showNotification('Traducción activada', 'info');
    } else {
      this.chatPanel.classList.add('translation-disabled');
      this.showNotification('Traducción desactivada', 'info');
    }
    
    const button = document.getElementById('toggle-translation');
    if (button) {
      button.style.background = isDisabled ? '#28a745' : '#6c757d';
    }
    
    this.saveSettings();
  }

  clearChat() {
    const originalContainer = document.getElementById('original-messages');
    const translatedContainer = document.getElementById('translated-messages');
    
    if (originalContainer) originalContainer.innerHTML = '';
    if (translatedContainer) translatedContainer.innerHTML = '';
    
    this.messages = [];
    this.wordCount = 0;
    this.showNotification('Chat limpiado', 'info');
  }

  swapLanguages() {
    const sourceSelect = document.getElementById('source-language');
    const targetSelect = document.getElementById('target-language');
    
    if (!sourceSelect || !targetSelect) return;
    
    // Obtener los valores actuales
    const currentSource = this.currentLanguage;
    const currentTarget = this.targetLanguage;
    
    // Mapear idiomas completos a códigos cortos y viceversa
    const langMap = {
      'es-ES': 'es',
      'es-MX': 'es',
      'en-US': 'en',
      'fr-FR': 'fr',
      'de-DE': 'de',
      'it-IT': 'it',
      'pt-BR': 'pt'
    };
    
    const reverseLangMap = {
      'es': 'es-ES',
      'en': 'en-US',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'it': 'it-IT',
      'pt': 'pt-BR'
    };
    
    // Intercambiar valores
    const newTarget = langMap[currentSource] || currentSource;
    const newSource = reverseLangMap[currentTarget] || currentTarget;
    
    // Actualizar selectores
    if (sourceSelect.querySelector(`option[value="${newSource}"]`)) {
      sourceSelect.value = newSource;
      this.currentLanguage = newSource;
    }
    
    if (targetSelect.querySelector(`option[value="${newTarget}"]`)) {
      targetSelect.value = newTarget;
      this.targetLanguage = newTarget;
    }
    
    // Actualizar reconocimiento de voz
    if (this.recognition) {
      this.recognition.lang = this.currentLanguage;
    }
    
    // Si está grabando, reiniciar con el nuevo idioma
    if (this.isActive && this.isListening) {
      this.stopSpeechRecognition();
      setTimeout(() => this.startSpeechRecognition(), 500);
    }
    
    this.updateChatTitle();
    this.saveSettings();
    this.showNotification('Idiomas intercambiados', 'info');
  }

  minimizePanel() {
    const content = this.chatPanel.querySelector('.chat-content');
    const button = document.getElementById('minimize-chat');
    
    if (content.style.display === 'none') {
      content.style.display = 'flex';
      button.textContent = '➖';
      button.title = 'Minimizar';
      this.chatPanel.classList.remove('minimized');
    } else {
      content.style.display = 'none';
      button.textContent = '➕';
      button.title = 'Expandir';
      this.chatPanel.classList.add('minimized');
    }
  }

  updateChatTitle() {
    const sourceLang = this.currentLanguage.split('-')[0];
    const targetLang = this.targetLanguage;
    
    const langNames = {
      'en': 'English',
      'es': 'Español',
      'fr': 'Français',
      'de': 'Deutsch',
      'it': 'Italiano',
      'pt': 'Português'
    };
    
    const langFlags = {
      'en': '🇺🇸',
      'es': '🇪🇸',
      'fr': '🇫🇷',
      'de': '🇩🇪',
      'it': '🇮🇹',
      'pt': '🇵🇹'
    };
    
    const originalTitle = document.querySelector('.original-chat .chat-title');
    if (originalTitle) {
      const flag = originalTitle.querySelector('.flag');
      if (flag) flag.textContent = langFlags[sourceLang] || '🌐';
    }
    
    const translatedTitle = document.querySelector('.translated-chat .chat-title span');
    if (translatedTitle) {
      translatedTitle.textContent = `Translation (${langNames[targetLang] || targetLang})`;
    }
  }

  makeDraggable() {
    const header = this.chatPanel.querySelector('.chat-header');
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    header.addEventListener('mousedown', (e) => {
      // No arrastrar si se hace clic en un botón
      if (e.target.closest('.control-btn')) return;
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.chatPanel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      
      // Cambiar cursor
      header.style.cursor = 'grabbing';
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      
      e.preventDefault();
    });

    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      const newLeft = startLeft + deltaX;
      const newTop = startTop + deltaY;
      
      // Limitar el movimiento dentro de la ventana
      const maxLeft = window.innerWidth - this.chatPanel.offsetWidth;
      const maxTop = window.innerHeight - this.chatPanel.offsetHeight;
      
      this.chatPanel.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
      this.chatPanel.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
      this.chatPanel.style.right = 'auto';
    };

    const onMouseUp = () => {
      isDragging = false;
      header.style.cursor = 'move';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  async saveSettings() {
    const settings = {
      currentLanguage: this.currentLanguage,
      targetLanguage: this.targetLanguage,
      sourceLanguage: this.currentLanguage,
      isActive: this.isActive,
      autoTranslate: !this.chatPanel.classList.contains('translation-disabled'),
      hideOnScreenShare: true,
      saveTranscriptions: true
    };
    
    // Guardar usando chrome.storage
    if (chrome.storage && chrome.storage.local) {
      try {
        await chrome.storage.local.set({ chatTranslationSettings: settings });
        
        // También notificar al background
        if (chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            action: 'updateSettings',
            settings: settings
          });
        }
      } catch (error) {
        console.error('Error guardando configuración:', error);
        // Fallback a localStorage
        localStorage.setItem('chatTranslationSettings', JSON.stringify(settings));
      }
    } else {
      // Usar localStorage si no hay chrome.storage disponible
      localStorage.setItem('chatTranslationSettings', JSON.stringify(settings));
    }
  }

  async loadSettings() {
    let settings = null;
    
    // Intentar cargar desde chrome.storage primero
    if (chrome.storage && chrome.storage.local) {
      try {
        const result = await chrome.storage.local.get(['chatTranslationSettings']);
        settings = result.chatTranslationSettings;
      } catch (error) {
        console.error('Error cargando configuración desde chrome.storage:', error);
      }
    }
    
    // Si no hay settings en chrome.storage, intentar localStorage
    if (!settings) {
      const localSettings = localStorage.getItem('chatTranslationSettings');
      if (localSettings) {
        try {
          settings = JSON.parse(localSettings);
        } catch (error) {
          console.error('Error parseando configuración desde localStorage:', error);
        }
      }
    }
    
    // Valores por defecto mejorados
    const defaults = {
      currentLanguage: 'en-US',
      targetLanguage: 'es',
      sourceLanguage: 'en-US',
      isActive: false,
      autoTranslate: true,
      hideOnScreenShare: true,
      saveTranscriptions: true
    };
    
    // Aplicar configuración con valores por defecto
    settings = { ...defaults, ...settings };
    
    this.currentLanguage = settings.currentLanguage || settings.sourceLanguage;
    this.targetLanguage = settings.targetLanguage;
    this.isActive = settings.isActive === true;
    
    const sourceSelect = document.getElementById('source-language');
    const targetSelect = document.getElementById('target-language');
    
    if (sourceSelect) sourceSelect.value = this.currentLanguage;
    if (targetSelect) targetSelect.value = this.targetLanguage;
    
    if (settings.autoTranslate === false) {
      this.chatPanel.classList.add('translation-disabled');
    }
    
    this.updateChatTitle();
    
    if (this.recognition) {
      this.recognition.lang = this.currentLanguage;
    }
    
    this.updateSpeechButton();
    
    // Si estaba activo, iniciar reconocimiento
    if (this.isActive) {
      setTimeout(() => {
        this.startTranscription();
      }, 1000);
    }
  }

  async getSettings() {
    if (chrome.storage && chrome.storage.local) {
      try {
        const result = await chrome.storage.local.get(['chatTranslationSettings']);
        return result.chatTranslationSettings || {};
      } catch (error) {
        console.error('Error obteniendo configuración:', error);
      }
    }
    
    // Fallback a localStorage
    const localSettings = localStorage.getItem('chatTranslationSettings');
    if (localSettings) {
      try {
        return JSON.parse(localSettings);
      } catch (error) {
        console.error('Error parseando configuración local:', error);
      }
    }
    
    return {};
  }

  updateStats() {
    // Actualizar estadísticas si el popup está abierto
    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'updateWordCount',
        wordCount: this.wordCount
      }).catch(() => {
        // El popup puede no estar abierto, ignorar el error
      });
    }
  }
}

// Verificar si el script ya fue cargado para evitar duplicación
if (!window.chatMessageInterceptorInstance) {
  // Marcar que el script está cargado
  window.transcriptionExtensionLoaded = true;
  
  // Inicializar el interceptor de chat
  window.chatMessageInterceptorInstance = new ChatMessageInterceptor();
}