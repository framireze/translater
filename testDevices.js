const { spawn } = require('child_process');
const path = require('path');

console.log('Buscando dispositivos de audio...\n');

const ffmpegPath = path.join(__dirname, 'bin', 'ffmpeg.exe');

// Listar dispositivos de audio
const listProcess = spawn(ffmpegPath, [
  '-list_devices', 'true',
  '-f', 'dshow',
  '-i', 'dummy'
], { shell: true });

let output = '';

listProcess.stderr.on('data', (data) => {
  output += data.toString();
});

listProcess.on('close', () => {
  console.log('=== DISPOSITIVOS DE AUDIO ENCONTRADOS ===\n');
  
  const lines = output.split('\n');
  let audioDevices = [];
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
        console.log(`✓ ${match[1]}`);
      }
    }
  });
  
  console.log('\n=== CÓMO USAR ===');
  console.log('Copia el nombre exacto del dispositivo que quieres usar');
  console.log('y pégalo en audioCapture.js en la línea:');
  console.log(`'-i', 'audio="NOMBRE_DEL_DISPOSITIVO"',`);
  
  if (audioDevices.length === 0) {
    console.log('\n⚠️  No se encontraron dispositivos de audio.');
    console.log('Asegúrate de que FFmpeg esté en la carpeta bin/');
  }
});