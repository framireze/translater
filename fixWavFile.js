const fs = require('fs');

console.log('Arreglando archivo WAV...\n');

try {
  // Leer el audio raw
  const rawAudio = fs.readFileSync('debug_captured_audio.wav');
  
  // Crear header WAV correcto
  const numChannels = 1;
  const sampleRate = 16000;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = rawAudio.length;
  
  const buffer = Buffer.alloc(44);
  
  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(dataSize + 36, 4);
  buffer.write('WAVE', 8);
  
  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk size
  buffer.writeUInt16LE(1, 20); // Audio format (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  
  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  // Combinar header y datos
  const wavFile = Buffer.concat([buffer, rawAudio]);
  
  // Guardar archivo corregido
  fs.writeFileSync('audio_corregido.wav', wavFile);
  
  console.log('✅ Archivo WAV corregido guardado como: audio_corregido.wav');
  console.log(`   Duración: ${(dataSize / byteRate).toFixed(2)} segundos`);
  console.log(`   Tamaño: ${(wavFile.length / 1024).toFixed(2)} KB`);
  
} catch (error) {
  console.error('Error:', error.message);
}