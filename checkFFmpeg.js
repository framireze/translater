const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('=== VERIFICANDO FFMPEG ===\n');

// Verificar si existe la carpeta bin
const binPath = path.join(__dirname, 'bin');
if (!fs.existsSync(binPath)) {
  console.log('❌ La carpeta "bin" no existe');
  console.log('   Créala con: mkdir bin\n');
} else {
  console.log('✅ Carpeta "bin" encontrada');
}

// Verificar si existe ffmpeg.exe
const ffmpegPath = path.join(__dirname, 'bin', 'ffmpeg.exe');
if (!fs.existsSync(ffmpegPath)) {
  console.log('❌ FFmpeg no encontrado en:', ffmpegPath);
  console.log('\n📥 INSTRUCCIONES PARA DESCARGAR FFMPEG:');
  console.log('1. Ve a: https://www.gyan.dev/ffmpeg/builds/');
  console.log('2. Descarga: ffmpeg-release-essentials.zip');
  console.log('3. Extrae el ZIP');
  console.log('4. Copia ffmpeg.exe de la carpeta "bin" del ZIP');
  console.log('5. Pégalo en:', binPath);
} else {
  console.log('✅ FFmpeg encontrado en:', ffmpegPath);
  
  // Verificar versión
  const versionProcess = spawn(ffmpegPath, ['-version']);
  
  versionProcess.stdout.on('data', (data) => {
    const output = data.toString();
    const versionMatch = output.match(/ffmpeg version ([\d\.\-\w]+)/);
    if (versionMatch) {
      console.log('✅ Versión:', versionMatch[1]);
    }
  });
  
  versionProcess.on('close', () => {
    console.log('\n=== LISTANDO DISPOSITIVOS DE AUDIO ===\n');
    
    // Intentar listar dispositivos con un método diferente
    const listProcess = spawn(ffmpegPath, [
      '-list_devices', 'true',
      '-f', 'dshow',
      '-i', 'dummy'
    ]);
    
    let fullOutput = '';
    
    // FFmpeg envía la salida de dispositivos a stderr, no stdout
    listProcess.stderr.on('data', (data) => {
      fullOutput += data.toString();
    });
    
    listProcess.on('close', () => {
      // Buscar dispositivos de audio en la salida
      const audioDevices = [];
      const lines = fullOutput.split('\n');
      let inAudioSection = false;
      
      lines.forEach(line => {
        if (line.includes('DirectShow audio devices')) {
          inAudioSection = true;
          console.log('📢 Dispositivos de audio encontrados:\n');
        } else if (line.includes('DirectShow video devices')) {
          inAudioSection = false;
        } else if (inAudioSection) {
          // Buscar líneas que contengan nombres de dispositivos entre comillas
          const deviceMatch = line.match(/\[dshow[^\]]*\]\s*"([^"]+)"/);
          if (deviceMatch) {
            audioDevices.push(deviceMatch[1]);
            console.log(`   ✓ "${deviceMatch[1]}"`);
          }
        }
      });
      
      if (audioDevices.length === 0) {
        console.log('⚠️  No se pudieron listar los dispositivos.');
        console.log('\n💡 SOLUCIÓN ALTERNATIVA:');
        console.log('Prueba estos nombres comunes en audioCapture.js:\n');
        console.log('   "Stereo Mix (Realtek(R) Audio)"');
        console.log('   "Stereo Mix (Realtek Audio)"');
        console.log('   "Mezcla estéreo (Realtek(R) Audio)"');
        console.log('   "Microphone Array (Intel® Smart Sound Technology for Digital Microphones)"');
      } else {
        console.log('\n✅ SIGUIENTE PASO:');
        console.log('Copia el nombre exacto del dispositivo Stereo Mix');
        console.log('y úsalo en audioCapture.js');
      }
    });
  });
}