const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class AudioCapture extends EventEmitter {
  constructor() {
    super();
    this.captureProcess = null;
    this.isCapturing = false;
    this.audioBuffer = [];
    this.bufferSize = 16000; // 1 segundo de audio a 16kHz
  }

  async startCapture() {
    if (this.isCapturing) {
      throw new Error('Ya se está capturando audio');
    }

    try {
      // Usar ffmpeg para capturar audio del sistema en Windows
      const ffmpegPath = path.join(__dirname, '..', 'bin', 'ffmpeg.exe');
      
      // Verificar si ffmpeg existe
      if (!fs.existsSync(ffmpegPath)) {
        throw new Error('ffmpeg.exe no encontrado. Por favor, descárgalo y colócalo en la carpeta bin/');
      }

      // Comando para capturar audio del dispositivo de audio virtual
      // Esto capturará el audio del sistema (lo que escuchas)
      this.captureProcess = spawn(ffmpegPath, [
        '-f', 'dshow',
        '-i', 'audio=Stereo Mix (Realtek(R) Audio)', // Nombre exacto sin comillas extras
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-f', 's16le',
        '-'
      ]);

      this.isCapturing = true;
      this.audioBuffer = [];

      // Manejar datos de audio
      this.captureProcess.stdout.on('data', (data) => {
        this.processAudioChunk(data);
      });

      // Manejar errores
      this.captureProcess.stderr.on('data', (data) => {
        console.error('FFmpeg error:', data.toString());
      });

      this.captureProcess.on('error', (error) => {
        console.error('Error en el proceso de captura:', error);
        this.emit('error', error);
        this.stopCapture();
      });

      this.captureProcess.on('close', (code) => {
        console.log(`Proceso de captura terminado con código ${code}`);
        this.isCapturing = false;
      });

      // Intentar con diferentes dispositivos si falla
      setTimeout(() => {
        if (!this.isCapturing) {
          this.tryAlternativeCapture();
        }
      }, 2000);

    } catch (error) {
      this.isCapturing = false;
      throw error;
    }
  }

  async tryAlternativeCapture() {
    // Método alternativo usando node-record-lpcm16
    try {
      const record = require('node-record-lpcm16');
      
      this.captureProcess = record.record({
        sampleRate: 16000,
        channels: 1,
        audioType: 'raw',
        recorder: 'sox', // o 'rec' dependiendo del sistema
        silence: '0.0',
        threshold: 0.5,
        device: null // Captura el dispositivo por defecto
      });

      this.isCapturing = true;

      this.captureProcess.stream()
        .on('data', (data) => {
          this.processAudioChunk(data);
        })
        .on('error', (error) => {
          console.error('Error en record:', error);
          this.emit('error', error);
        });

    } catch (error) {
      console.error('Error con método alternativo:', error);
      this.emit('error', new Error('No se pudo iniciar la captura de audio. Verifica los permisos y dispositivos.'));
    }
  }

  processAudioChunk(chunk) {
    // Acumular chunks de audio
    this.audioBuffer.push(chunk);
    
    // Calcular el tamaño total del buffer
    const totalSize = this.audioBuffer.reduce((acc, buf) => acc + buf.length, 0);
    
    // Si tenemos suficiente audio (aproximadamente 1 segundo), emitir
    if (totalSize >= this.bufferSize * 2) { // *2 porque es 16-bit audio
      const combinedBuffer = Buffer.concat(this.audioBuffer);
      this.emit('audioData', combinedBuffer);
      
      // Limpiar el buffer, manteniendo un pequeño overlap
      const overlap = this.audioBuffer[this.audioBuffer.length - 1];
      this.audioBuffer = [overlap];
    }
  }

  stopCapture() {
    if (this.captureProcess) {
      if (this.captureProcess.kill) {
        this.captureProcess.kill('SIGTERM');
      } else if (this.captureProcess.stop) {
        this.captureProcess.stop();
      }
      this.captureProcess = null;
    }
    this.isCapturing = false;
    this.audioBuffer = [];
  }

  // Método para listar dispositivos de audio disponibles
  static async listAudioDevices() {
    return new Promise((resolve, reject) => {
      const ffmpegPath = path.join(__dirname, '..', 'bin', 'ffmpeg.exe');
      
      const listProcess = spawn(ffmpegPath, [
        '-list_devices', 'true',
        '-f', 'dshow',
        '-i', 'dummy'
      ]);

      let output = '';
      
      listProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      listProcess.on('close', () => {
        const audioDevices = [];
        const lines = output.split('\n');
        let isAudioSection = false;
        
        lines.forEach(line => {
          if (line.includes('DirectShow audio devices')) {
            isAudioSection = true;
          } else if (line.includes('DirectShow video devices')) {
            isAudioSection = false;
          } else if (isAudioSection && line.includes('"')) {
            const match = line.match(/"([^"]+)"/);
            if (match) {
              audioDevices.push(match[1]);
            }
          }
        });
        
        resolve(audioDevices);
      });
    });
  }
}

module.exports = { AudioCapture };