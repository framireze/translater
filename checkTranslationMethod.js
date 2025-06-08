const { TranslationService } = require('./src/services/translationService');

// Verificar qué métodos tiene TranslationService
const service = new TranslationService('./credentials/dummy.json');

console.log('Métodos disponibles en TranslationService:');
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(service)));

// Verificar si tiene el método translate
if (typeof service.translate === 'function') {
  console.log('\n✅ El método translate existe');
} else {
  console.log('\n❌ El método translate NO existe');
  
  // Buscar métodos similares
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
  const translateMethods = methods.filter(m => m.toLowerCase().includes('translat'));
  
  if (translateMethods.length > 0) {
    console.log('\nMétodos relacionados con traducción encontrados:');
    translateMethods.forEach(m => console.log(`  - ${m}`));
  }
}