const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('=== PROBANDO CAPTURA DE AUDIO ===\n');

const ffmpegPath = path.join(__dirname, 'bin', 'ffmpeg.exe');

// Lista de posibles nombres de dispositivos
const deviceNames = [
  'Stereo Mix (Realtek(R) Audio)',
  'Stereo Mix (Realtek Audio)',
  'Stereo Mix',
  'Mezcla estéreo (Realtek(R) Audio)',
  'Mezcla estéreo',
  'Realtek(R) Audio',
  'Microphone Array (Intel® Smart Sound Technology for Digital Microphones)',
  'Microphone Array'
];

let currentIndex = 0;

function testDevice(deviceName) {
  console.log(`\n🔍 Probando: "${deviceName}"`);
  
  const testProcess = spawn(ffmpegPath, [
    '-f', 'dshow',
    '-i', `audio="${deviceName}"`,
    '-t', '2',
    '-acodec', 'pcm_s16le',
    '-ar', '16000',
    '-ac', '1',
    '-f', 'null',
    '-'
  ]);

  let errorOutput = '';
  let worked = false;

  testProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
    // Si FFmpeg empieza a procesar, significa que el dispositivo funciona
    if (data.toString().includes('Stream #0:0') || data.toString().includes('size=')) {
      worked = true;
    }
  });

  testProcess.on('close', (code) => {
    if (worked || code === 0) {
      console.log(`✅ ¡FUNCIONA! Usa este nombre en audioCapture.js:`);
      console.log(`   '-i', 'audio="${deviceName}"',`);
      
      // Guardar el nombre que funciona
      fs.writeFileSync('working-device.txt', deviceName);
      console.log(`\n💾 Nombre guardado en: working-device.txt`);
    } else {
      console.log(`❌ No funciona`);
      
      // Buscar sugerencias en el error
      if (errorOutput.includes('DirectShow audio devices')) {
        console.log('\n📢 Dispositivos encontrados en el error:');
        const lines = errorOutput.split('\n');
        lines.forEach(line => {
          if (line.includes('"') && line.includes('DirectShow')) {
            const match = line.match(/"([^"]+)"/);
            if (match) {
              console.log(`   - "${match[1]}"`);
            }
          }
        });
      }
    }

    // Probar el siguiente dispositivo
    currentIndex++;
    if (currentIndex < deviceNames.length) {
      setTimeout(() => testDevice(deviceNames[currentIndex]), 1000);
    } else {
      console.log('\n=== PRUEBA COMPLETADA ===');
      console.log('\nSi ninguno funcionó, ejecuta este comando manualmente:');
      console.log('powershell:');
      console.log('.\\bin\\ffmpeg.exe -list_devices true -f dshow -i dummy 2>&1 | Select-String "DirectShow audio"');
    }
  });
}

// Iniciar prueba
console.log('Probando diferentes nombres de dispositivos...');
console.log('Esto tomará unos segundos...\n');
testDevice(deviceNames[0]);