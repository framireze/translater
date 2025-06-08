const speech = require('@google-cloud/speech');
const fs = require('fs');
const { EventEmitter } = require('events');

class TranscriptionService extends EventEmitter {
  constructor(keyFilePath) {
    super();
    this.mockMode = false;
    
    try {
      // Verificar si el archivo existe y es válido
      if (!fs.existsSync(keyFilePath)) {
        console.log('⚠️  Archivo de credenciales no encontrado, usando modo mock');
        this.mockMode = true;
      } else {
        const credentials = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
        if (credentials.project_id === 'dummy-project') {
          console.log('📌 Usando transcripción en modo mock (sin Google Cloud)');
          this.mockMode = true;
        } else {
          this.client = new speech.SpeechClient({
            keyFilename: keyFilePath
          });
        }
      }
    } catch (error) {
      console.error('Error inicializando servicio de transcripción:', error);
      this.mockMode = true;
    }
    
    this.recognizeStream = null;
    this.isStreaming = false;
    this.restartCounter = 0;
    this.lastTranscript = '';
    this.mockCounter = 0;
    this.lastResult = null;
    this.silenceTimeout = null;
    this.lastAudioTime = Date.now();
    this.interimTranscript = '';
    this.lastRestartTime = null;
    this.lastEmittedTranscript = ''; // Para evitar duplicados
    
    // TEMPORAL: Activar modo mock para pruebas
    // this.mockMode = true;
    console.log('TranscriptionService inicializado - Mock:', this.mockMode);
  }

  async startStreamingRecognition() {
    if (this.mockMode) {
      // Modo mock - no hacer nada
      this.isStreaming = true;
      return;
    }

    if (this.isStreaming) return;

    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'es-ES', // Idioma principal
      alternativeLanguageCodes: ['en-US', 'pt-BR'], // Idiomas alternativos
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      model: 'latest_long', // Mejor modelo para conversaciones largas
      useEnhanced: true,
      profanityFilter: false,
      enableWordConfidence: true,
      maxAlternatives: 1,
      speechContexts: [{
        phrases: [
          // Añadir términos técnicos comunes en entrevistas
          'API', 'REST', 'GraphQL', 'microservices', 'Docker', 'Kubernetes',
          'React', 'Node.js', 'Python', 'Java', 'JavaScript', 'TypeScript',
          'database', 'SQL', 'NoSQL', 'MongoDB', 'PostgreSQL',
          'AWS', 'Azure', 'Google Cloud', 'CI/CD', 'DevOps'
        ],
        boost: 20
      }]
    };

    const request = {
      config,
      interimResults: true, // Obtener resultados parciales
      singleUtterance: false
    };

    this.recognizeStream = this.client
      .streamingRecognize(request)
      .on('error', (error) => {
        console.error('Error en streaming:', error);
        this.handleStreamError(error);
      })
      .on('data', (data) => {
        this.processTranscriptionData(data);
      });

    this.isStreaming = true;
    
    // Reiniciar el stream cada 60 segundos (límite de Google)
    setTimeout(() => {
      if (this.isStreaming) {
        this.restartStream();
      }
    }, 55000);
  }

  async transcribe(audioBuffer) {
    if (this.mockMode) {
      // Simular transcripción en modo mock
      this.mockCounter++;
      
      // Cada 3 segundos, generar una transcripción de prueba
      if (this.mockCounter % 3 === 0) {
        const mockPhrases = [
          "Esta es una transcripción de prueba",
          "El audio se está capturando correctamente",
          "Modo mock activado - configura Google Cloud para transcripción real",
          "Testing the English transcription",
          "This is a mock transcription in English"
        ];
        
        const randomPhrase = mockPhrases[Math.floor(Math.random() * mockPhrases.length)];
        const isFinal = Math.random() > 0.5;
        const language = randomPhrase.includes('English') || randomPhrase.includes('Testing') ? 'en' : 'es';
        
        return {
          text: randomPhrase,
          isFinal: isFinal,
          confidence: 0.95,
          language: language,
          timestamp: new Date().toISOString()
        };
      }
      return null;
    }
    try {
      if (!this.isStreaming) {
        await this.startStreamingRecognition();
      }

      if (this.recognizeStream && !this.recognizeStream.destroyed) {
        this.recognizeStream.write(audioBuffer);
      }

    } catch (error) {
      console.error('Error en transcripción:', error);
      return null;
    }
  }

  processTranscriptionData(data) {
    if (data.results && data.results[0]) {
      const result = data.results[0];
      
      if (result.alternatives && result.alternatives[0]) {
        const transcript = result.alternatives[0].transcript;
        const confidence = result.alternatives[0].confidence || 0;
        const isFinal = result.isFinal;
        
        // Detectar el idioma real utilizado
        let detectedLanguage = 'es';
        if (result.languageCode) {
          detectedLanguage = result.languageCode.split('-')[0];
        }

        // Si es un resultado final, emitir la transcripción completa
        if (isFinal) {
          // Solo emitir si no es duplicado
          if (transcript !== this.lastEmittedTranscript) {
            const transcriptionResult = {
              text: transcript,
              isFinal: true,
              confidence: confidence,
              language: detectedLanguage,
              timestamp: new Date().toISOString()
            };
            
            console.log('Transcripción final:', transcript);
            this.emit('transcription', transcriptionResult);
            
            // Guardar lo que emitimos
            this.lastEmittedTranscript = transcript;
          }
          
          // IMPORTANTE: Limpiar TODOS los estados después de emitir final
          this.lastTranscript = '';
          this.interimTranscript = '';
          this.clearSilenceTimeout();
          
          // Después de un resultado final, Google empieza fresh
          this.lastEmittedTranscript = '';
          
          return transcript !== this.lastEmittedTranscript ? {
            text: transcript,
            isFinal: true,
            confidence: confidence,
            language: detectedLanguage,
            timestamp: new Date().toISOString()
          } : null;
        } else {
          // Para resultados interim, NO acumular con texto anterior
          // Google ya maneja la acumulación internamente
          this.interimTranscript = transcript;
          
          // Reiniciar el timeout de silencio
          this.resetSilenceTimeout();
          
          // Emitir actualizaciones parciales
          if (transcript !== this.lastTranscript && transcript.trim().length > 0) {
            this.lastTranscript = transcript;
            
            const interimResult = {
              text: transcript,
              isFinal: false,
              confidence: confidence,
              language: detectedLanguage,
              timestamp: new Date().toISOString()
            };
            
            this.emit('interim-transcription', interimResult);
          }
        }
      }
    }
    return null;
  }

  // Método para manejar el timeout de silencio
  resetSilenceTimeout() {
    this.clearSilenceTimeout();
    
    // Crear nuevo timeout de 3 segundos
    this.silenceTimeout = setTimeout(() => {
      console.log('Silencio detectado - finalizando transcripción actual');
      
      // Solo emitir si hay texto nuevo que no se ha emitido
      if (this.interimTranscript && 
          this.interimTranscript.trim().length > 0 && 
          this.interimTranscript !== this.lastEmittedTranscript &&
          !this.interimTranscript.startsWith(this.lastEmittedTranscript)) {
        
        const finalResult = {
          text: this.interimTranscript,
          isFinal: true,
          confidence: 1,
          language: 'es',
          timestamp: new Date().toISOString(),
          forcedByTimeout: true
        };
        
        this.emit('transcription', finalResult);
        this.lastEmittedTranscript = this.interimTranscript;
        
        // Limpiar estados
        this.interimTranscript = '';
        this.lastTranscript = '';
      }
    }, 3000); // 3 segundos de silencio
  }

  clearSilenceTimeout() {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
  }

  handleStreamError(error) {
    if (error.code === 11) {
      // Error de timeout, finalizar cualquier transcripción pendiente
      console.log('Timeout del stream - finalizando transcripción pendiente');
      
      // Si hay texto interim, emitirlo como final antes de reiniciar
      if (this.interimTranscript && this.interimTranscript.trim().length > 0) {
        const finalResult = {
          text: this.interimTranscript,
          isFinal: true,
          confidence: 1,
          language: 'es',
          timestamp: new Date().toISOString(),
          forcedByTimeout: true
        };
        
        this.emit('transcription', finalResult);
        this.interimTranscript = '';
        this.lastTranscript = '';
      }
      
      // Ahora sí reiniciar el stream
      this.restartStream();
    } else if (error.code === 3 || error.code === 4) {
      // Error de límite de duración
      console.log('Límite de duración alcanzado, reiniciando...');
      this.restartStream();
    } else {
      console.error('Error no manejado:', error);
      // Para otros errores, intentar reiniciar también
      this.restartStream();
    }
  }

  async restartStream() {
    // No incrementar el contador si es un reinicio programado (no por error)
    const isScheduledRestart = this.restartCounter === 0 || (Date.now() - this.lastRestartTime > 50000);
    
    if (!isScheduledRestart) {
      this.restartCounter++;
    }
    
    console.log(`Reiniciando stream de transcripción ${isScheduledRestart ? '(programado)' : `(intento ${this.restartCounter})`}...`);
    
    // Limpiar TODOS los estados antes de reiniciar
    this.clearSilenceTimeout();
    this.interimTranscript = '';
    this.lastTranscript = '';
    this.lastEmittedTranscript = '';
    
    this.stopStreaming();
    
    // Esperar un momento antes de reiniciar
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Resetear el contador si han pasado más de 5 minutos desde el último reinicio por error
    if (this.lastRestartTime && Date.now() - this.lastRestartTime > 300000) {
      this.restartCounter = 0;
    }
    this.lastRestartTime = Date.now();
    
    if (isScheduledRestart || this.restartCounter < 10) {
      try {
        await this.startStreamingRecognition();
        console.log('Stream reiniciado exitosamente');
      } catch (error) {
        console.error('Error reiniciando stream:', error);
      }
    } else {
      console.error('Demasiados reintentos por errores, deteniendo servicio');
      this.emit('error', new Error('Servicio de transcripción detenido por múltiples errores'));
    }
  }

  stopStreaming() {
    if (this.recognizeStream) {
      this.recognizeStream.end();
      this.recognizeStream = null;
    }
    if (this.streamRestartTimer) {
      clearTimeout(this.streamRestartTimer);
      this.streamRestartTimer = null;
    }
    // Limpiar timeout de silencio
    this.clearSilenceTimeout();
    this.isStreaming = false;
  }

  // Método alternativo para transcripción no streaming (para archivos)
  async transcribeAudioFile(audioBuffer, languageCode = 'es-ES') {
    const audio = {
      content: audioBuffer.toString('base64')
    };

    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: languageCode,
      enableAutomaticPunctuation: true,
      model: 'latest_long',
      useEnhanced: true
    };

    const request = {
      audio: audio,
      config: config
    };

    try {
      const [response] = await this.client.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join(' ');
      
      return {
        text: transcription,
        confidence: response.results[0]?.alternatives[0]?.confidence || 0
      };
    } catch (error) {
      console.error('Error en transcripción de archivo:', error);
      throw error;
    }
  }
}

module.exports = { TranscriptionService };