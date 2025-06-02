const { spawn } = require('child_process');
const path = require('path');

console.log('=== PROBANDO STEREO MIX ===\n');
console.log('1. Reproduce algo de audio (YouTube, música, etc.)');
console.log('2. Deberías ver datos de audio en unos segundos...\n');

const ffmpegPath = path.join(__dirname, 'bin', 'ffmpeg.exe');

const testProcess = spawn(ffmpegPath, [
  '-f', 'dshow',
  '-i', 'audio=Stereo Mix (Realtek(R) Audio)',
  '-t', '5',  // Grabar 5 segundos
  '-acodec', 'pcm_s16le',
  '-ar', '16000',
  '-ac', '1',
  'test_audio.wav'  // Guardar en archivo para verificar
]);

let hasData = false;

testProcess.stderr.on('data', (data) => {
  const output = data.toString();
  console.log(output);
  
  if (output.includes('size=') || output.includes('time=')) {
    hasData = true;
    console.log('✅ ¡Capturando audio correctamente!');
  }
});

testProcess.on('close', (code) => {
  if (code === 0 && hasData) {
    console.log('\n✅ ¡ÉXITO! Stereo Mix funciona correctamente.');
    console.log('📁 Audio de prueba guardado en: test_audio.wav');
    console.log('\n🚀 Ya puedes usar la aplicación:');
    console.log('   npm start');
  } else {
    console.log('\n❌ Hubo un problema.');
    console.log('Asegúrate de:');
    console.log('1. Tener audio reproduciéndose');
    console.log('2. Stereo Mix está habilitado y como dispositivo por defecto');
  }
});