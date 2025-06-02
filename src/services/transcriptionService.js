const speech = require('@google-cloud/speech');

class TranscriptionService {
  constructor(keyFilePath) {
    this.client = new speech.SpeechClient({
      keyFilename: keyFilePath
    });
    
    this.recognizeStream = null;
    this.isStreaming = false;
    this.restartCounter = 0;
    this.lastTranscript = '';
    console.log('TranscriptionService inicializado con:', keyFilePath);
  }

  async startStreamingRecognition() {
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
    console.log('Procesando datos de transcripción:', data);
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

        const transcriptionResult = {
          text: transcript,
          isFinal: isFinal,
          confidence: confidence,
          language: detectedLanguage,
          timestamp: new Date().toISOString()
        };

        // Solo emitir si hay cambios significativos
        if (transcript !== this.lastTranscript) {
          this.lastTranscript = transcript;
          return transcriptionResult;
        }
      }
    }
    return null;
  }

  handleStreamError(error) {
    if (error.code === 11) {
      // Error de timeout, reiniciar stream
      console.log('Timeout del stream, reiniciando...');
      this.restartStream();
    } else if (error.code === 3 || error.code === 4) {
      // Error de límite de duración
      console.log('Límite de duración alcanzado, reiniciando...');
      this.restartStream();
    } else {
      console.error('Error no manejado:', error);
      this.stopStreaming();
    }
  }

  async restartStream() {
    this.restartCounter++;
    console.log(`Reiniciando stream (intento ${this.restartCounter})...`);
    
    this.stopStreaming();
    
    // Esperar un momento antes de reiniciar
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (this.restartCounter < 10) {
      await this.startStreamingRecognition();
    } else {
      console.error('Demasiados reintentos, deteniendo servicio');
    }
  }

  stopStreaming() {
    if (this.recognizeStream) {
      this.recognizeStream.end();
      this.recognizeStream = null;
    }
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