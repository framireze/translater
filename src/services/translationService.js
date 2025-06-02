const { Translate } = require('@google-cloud/translate').v2;

class TranslationService {
  constructor(keyFilePath) {
    this.translate = new Translate({
      keyFilename: keyFilePath
    });
    
    // Cache de traducciones para mejorar rendimiento
    this.translationCache = new Map();
    this.cacheMaxSize = 1000;
  }

  async translate(text, sourceLang, targetLang) {
    if (!text || text.trim() === '') {
      return null;
    }

    // Verificar cache
    const cacheKey = `${sourceLang}-${targetLang}-${text}`;
    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey);
    }

    try {
      const [translation] = await this.translate.translate(text, {
        from: sourceLang,
        to: targetLang
      });

      const result = {
        originalText: text,
        translatedText: translation,
        sourceLang: sourceLang,
        targetLang: targetLang,
        timestamp: new Date().toISOString()
      };

      // Guardar en cache
      this.addToCache(cacheKey, result);

      return result;
    } catch (error) {
      console.error('Error en traducción:', error);
      return {
        originalText: text,
        translatedText: text, // Devolver texto original si falla
        sourceLang: sourceLang,
        targetLang: targetLang,
        error: error.message
      };
    }
  }

  async detectLanguage(text) {
    try {
      const [detection] = await this.translate.detect(text);
      return {
        language: detection.language,
        confidence: detection.confidence
      };
    } catch (error) {
      console.error('Error detectando idioma:', error);
      return { language: 'unknown', confidence: 0 };
    }
  }

  async translateBatch(texts, sourceLang, targetLang) {
    try {
      const translations = await Promise.all(
        texts.map(text => this.translate(text, sourceLang, targetLang))
      );
      return translations;
    } catch (error) {
      console.error('Error en traducción por lotes:', error);
      return texts.map(text => ({
        originalText: text,
        translatedText: text,
        error: error.message
      }));
    }
  }

  addToCache(key, value) {
    // Limpiar cache si excede el tamaño máximo
    if (this.translationCache.size >= this.cacheMaxSize) {
      const firstKey = this.translationCache.keys().next().value;
      this.translationCache.delete(firstKey);
    }
    this.translationCache.set(key, value);
  }

  clearCache() {
    this.translationCache.clear();
  }

  // Método para obtener idiomas soportados
  async getSupportedLanguages(target = 'es') {
    try {
      const [languages] = await this.translate.getLanguages(target);
      return languages;
    } catch (error) {
      console.error('Error obteniendo idiomas:', error);
      return [];
    }
  }

  // Traducción con contexto para mejorar precisión
  async translateWithContext(text, context, sourceLang, targetLang) {
    // Añadir contexto para mejorar la traducción
    const textWithContext = context ? `${context}\n\n${text}` : text;
    
    const translation = await this.translate(textWithContext, sourceLang, targetLang);
    
    if (translation && context) {
      // Extraer solo la parte traducida relevante
      const contextTranslated = await this.translate(context, sourceLang, targetLang);
      if (contextTranslated) {
        translation.translatedText = translation.translatedText
          .replace(contextTranslated.translatedText, '')
          .trim();
      }
    }
    
    return translation;
  }
}

module.exports = { TranslationService };