class VideoCallTranscriber {
    constructor() {
      this.isActive = false;
      this.recognition = null;
      this.currentLanguage = 'es-ES';
      this.targetLanguage = 'en';
      this.transcriptionPanel = null;
      this.isScreenSharing = false;
      
      this.init();
    }
  
    async init() {
      // Esperar a que la página se cargue completamente
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setup());
      } else {
        this.setup();
      }
    }
  
    setup() {
      this.createTranscriptionPanel();
      this.initSpeechRecognition();
      this.detectScreenSharing();
      this.addEventListeners();
      
      // Cargar configuración guardada
      this.loadSettings();
    }
  
    createTranscriptionPanel() {
      // Crear panel flotante para las transcripciones
      this.transcriptionPanel = document.createElement('div');
      this.transcriptionPanel.id = 'transcription-panel';
      this.transcriptionPanel.innerHTML = `
        <div class="transcription-header">
          <span>🎤 Transcripción en Tiempo Real</span>
          <div class="transcription-controls">
            <button id="toggle-transcription" class="control-btn">▶️</button>
            <button id="clear-transcription" class="control-btn">🗑️</button>
            <button id="minimize-panel" class="control-btn">➖</button>
          </div>
        </div>
        <div class="transcription-content">
          <div class="language-selector">
            <select id="source-language">
              <option value="es-ES">Español</option>
              <option value="en-US">English</option>
              <option value="fr-FR">Français</option>
              <option value="de-DE">Deutsch</option>
              <option value="it-IT">Italiano</option>
              <option value="pt-BR">Português</option>
            </select>
            <span>→</span>
            <select id="target-language">
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="it">Italiano</option>
              <option value="pt">Português</option>
            </select>
          </div>
          <div id="transcription-text" class="transcription-text"></div>
          <div id="translation-text" class="translation-text"></div>
        </div>
      `;
      
      document.body.appendChild(this.transcriptionPanel);
    }
  
    initSpeechRecognition() {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.error('Speech Recognition no está soportado en este navegador');
        return;
      }
  
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.currentLanguage;
  
      this.recognition.onresult = (event) => {
        let transcript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        
        if (transcript) {
          this.displayTranscription(transcript);
          this.translateText(transcript);
        }
      };
  
      this.recognition.onerror = (event) => {
        console.error('Error en reconocimiento de voz:', event.error);
      };
  
      this.recognition.onend = () => {
        if (this.isActive) {
          // Reiniciar automáticamente si está activo
          setTimeout(() => {
            this.recognition.start();
          }, 100);
        }
      };
    }
  
    async translateText(text) {
      try {
        // Usar la API de Google Translate (necesitarás una clave API)
        const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${this.currentLanguage.split('-')[0]}|${this.targetLanguage}`);
        const data = await response.json();
        
        if (data.responseData && data.responseData.translatedText) {
          this.displayTranslation(data.responseData.translatedText);
        }
      } catch (error) {
        console.error('Error en traducción:', error);
        // Fallback: mostrar texto original
        this.displayTranslation(`[Traducción no disponible] ${text}`);
      }
    }
  
    displayTranscription(text) {
      const transcriptionDiv = document.getElementById('transcription-text');
      if (transcriptionDiv) {
        const timestamp = new Date().toLocaleTimeString();
        transcriptionDiv.innerHTML += `<div class="transcript-line"><span class="timestamp">[${timestamp}]</span> ${text}</div>`;
        transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
      }
    }
  
    displayTranslation(text) {
      const translationDiv = document.getElementById('translation-text');
      if (translationDiv) {
        const timestamp = new Date().toLocaleTimeString();
        translationDiv.innerHTML += `<div class="translation-line"><span class="timestamp">[${timestamp}]</span> ${text}</div>`;
        translationDiv.scrollTop = translationDiv.scrollHeight;
      }
    }
  
    detectScreenSharing() {
      // Detectar cuando se está compartiendo pantalla
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          // Buscar indicadores de pantalla compartida en Teams y Meet
          const shareIndicators = document.querySelectorAll('[data-tid="screen-share-indicator"], [aria-label*="sharing"], .sharing-indicator, [title*="sharing"]');
          
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
  
    handleScreenShareChange() {
      if (this.isScreenSharing) {
        // Ocultar panel durante pantalla compartida
        this.transcriptionPanel.style.display = 'none';
      } else {
        // Mostrar panel cuando no se comparte pantalla
        this.transcriptionPanel.style.display = 'block';
      }
    }
  
    addEventListeners() {
      // Control de transcripción
      document.addEventListener('click', (e) => {
        if (e.target.id === 'toggle-transcription') {
          this.toggleTranscription();
        } else if (e.target.id === 'clear-transcription') {
          this.clearTranscription();
        } else if (e.target.id === 'minimize-panel') {
          this.minimizePanel();
        }
      });
  
      // Cambio de idiomas
      document.addEventListener('change', (e) => {
        if (e.target.id === 'source-language') {
          this.currentLanguage = e.target.value;
          if (this.recognition) {
            this.recognition.lang = this.currentLanguage;
          }
          this.saveSettings();
        } else if (e.target.id === 'target-language') {
          this.targetLanguage = e.target.value;
          this.saveSettings();
        }
      });
  
      // Hacer el panel arrastrable
      this.makeDraggable();
    }
  
    toggleTranscription() {
      const button = document.getElementById('toggle-transcription');
      
      if (!this.isActive) {
        this.startTranscription();
        button.textContent = '⏸️';
        button.title = 'Pausar transcripción';
      } else {
        this.stopTranscription();
        button.textContent = '▶️';
        button.title = 'Iniciar transcripción';
      }
    }
  
    startTranscription() {
      if (this.recognition) {
        this.isActive = true;
        this.recognition.start();
        console.log('Transcripción iniciada');
      }
    }
  
    stopTranscription() {
      if (this.recognition) {
        this.isActive = false;
        this.recognition.stop();
        console.log('Transcripción detenida');
      }
    }
  
    clearTranscription() {
      const transcriptionDiv = document.getElementById('transcription-text');
      const translationDiv = document.getElementById('translation-text');
      
      if (transcriptionDiv) transcriptionDiv.innerHTML = '';
      if (translationDiv) translationDiv.innerHTML = '';
    }
  
    minimizePanel() {
      const content = this.transcriptionPanel.querySelector('.transcription-content');
      const button = document.getElementById('minimize-panel');
      
      if (content.style.display === 'none') {
        content.style.display = 'block';
        button.textContent = '➖';
      } else {
        content.style.display = 'none';
        button.textContent = '➕';
      }
    }
  
    makeDraggable() {
      const header = this.transcriptionPanel.querySelector('.transcription-header');
      let isDragging = false;
      let startX, startY, startLeft, startTop;
  
      header.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = this.transcriptionPanel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
  
      const onMouseMove = (e) => {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        this.transcriptionPanel.style.left = (startLeft + deltaX) + 'px';
        this.transcriptionPanel.style.top = (startTop + deltaY) + 'px';
      };
  
      const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
    }
  
    async saveSettings() {
      const settings = {
        currentLanguage: this.currentLanguage,
        targetLanguage: this.targetLanguage
      };
      
      if (chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ transcriptionSettings: settings });
      }
    }
  
    async loadSettings() {
      if (chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get(['transcriptionSettings']);
        const settings = result.transcriptionSettings;
        
        if (settings) {
          this.currentLanguage = settings.currentLanguage || 'es-ES';
          this.targetLanguage = settings.targetLanguage || 'en';
          
          // Actualizar selects
          const sourceSelect = document.getElementById('source-language');
          const targetSelect = document.getElementById('target-language');
          
          if (sourceSelect) sourceSelect.value = this.currentLanguage;
          if (targetSelect) targetSelect.value = this.targetLanguage;
          
          if (this.recognition) {
            this.recognition.lang = this.currentLanguage;
          }
        }
      }
    }
  }
  
  // Inicializar cuando la página esté lista
  const transcriber = new VideoCallTranscriber();