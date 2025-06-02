const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
  constructor(apiKeyOrConfig) {
    // Detectar si es API Key simple o configuración para Vertex AI
    if (typeof apiKeyOrConfig === 'string' && apiKeyOrConfig.startsWith('AIza')) {
      // Usar Google AI Studio (Gemini API directa)
      this.useVertexAI = false;
      this.genAI = new GoogleGenerativeAI(apiKeyOrConfig);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    } else {
      // Usar Vertex AI con Service Account
      this.useVertexAI = true;
      const { VertexAI } = require('@google-cloud/vertexai');
      this.vertex_ai = new VertexAI({
        project: process.env.GOOGLE_CLOUD_PROJECT_ID || 'tu-proyecto',
        location: 'us-central1',
        keyFilename: process.env.GOOGLE_CLOUD_KEY_PATH
      });
      this.model = this.vertex_ai.preview.getGenerativeModel({
        model: 'gemini-pro',
        generation_config: {
          max_output_tokens: 2048,
          temperature: 0.9,
          top_p: 1,
        },
      });
    }
    
    // Historial de conversación para mantener contexto
    this.conversationHistory = [];
    this.maxHistoryLength = 10;
    
    // Configuración del sistema
    this.systemPrompt = `Eres un asistente experto para entrevistas técnicas y reuniones profesionales. 
    Tu rol es:
    - Ayudar con respuestas técnicas precisas y concisas
    - Sugerir mejores formas de expresar ideas
    - Proporcionar información relevante sobre tecnologías mencionadas
    - Ayudar a formular preguntas inteligentes
    - Dar contexto sobre mejores prácticas y estándares de la industria
    
    Mantén las respuestas breves y al punto, ideales para usar durante una conversación en tiempo real.`;
  }

  async askQuestion(question, context = {}) {
    try {
      // Construir el prompt con contexto
      const prompt = this.buildPrompt(question, context);
      
      // Generar respuesta
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Guardar en historial
      this.addToHistory(question, text);
      
      return {
        answer: text,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error con Gemini:', error);
      return {
        answer: 'Lo siento, hubo un error al procesar tu pregunta. Por favor, intenta de nuevo.',
        error: error.message
      };
    }
  }

  buildPrompt(question, context) {
    let prompt = this.systemPrompt + '\n\n';
    
    // Añadir contexto de la conversación actual si existe
    if (context.currentTranscript) {
      prompt += `Contexto de la conversación actual:\n${context.currentTranscript}\n\n`;
    }
    
    // Añadir historial reciente
    if (this.conversationHistory.length > 0) {
      prompt += 'Historial reciente:\n';
      this.conversationHistory.slice(-3).forEach(item => {
        prompt += `Pregunta: ${item.question}\nRespuesta: ${item.answer}\n\n`;
      });
    }
    
    // Añadir información adicional del contexto
    if (context.meetingTopic) {
      prompt += `Tema de la reunión: ${context.meetingTopic}\n`;
    }
    
    if (context.techStack) {
      prompt += `Tecnologías relevantes: ${context.techStack.join(', ')}\n`;
    }
    
    prompt += `\nPregunta actual: ${question}\n`;
    prompt += '\nProporciona una respuesta concisa y útil:';
    
    return prompt;
  }

  async generateSuggestions(transcript, type = 'response') {
    const prompts = {
      response: `Basándote en esta conversación, sugiere 3 posibles respuestas breves y profesionales:\n\n${transcript}`,
      question: `Basándote en esta conversación, sugiere 3 preguntas inteligentes que podría hacer:\n\n${transcript}`,
      clarification: `Si necesitas aclarar algo de esta conversación, ¿qué preguntarías? Sugiere 2 aclaraciones:\n\n${transcript}`
    };
    
    try {
      const result = await this.model.generateContent(prompts[type]);
      const response = await result.response;
      const suggestions = response.text().split('\n').filter(s => s.trim());
      
      return suggestions.slice(0, 3); // Máximo 3 sugerencias
    } catch (error) {
      console.error('Error generando sugerencias:', error);
      return [];
    }
  }

  async analyzeConversation(fullTranscript) {
    const prompt = `Analiza esta conversación de entrevista/reunión y proporciona:
    1. Puntos clave discutidos
    2. Compromisos o tareas mencionadas
    3. Temas técnicos que requieren seguimiento
    4. Resumen general en 2-3 oraciones
    
    Conversación:
    ${fullTranscript}`;
    
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      
      return {
        analysis: response.text(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error analizando conversación:', error);
      return null;
    }
  }

  async getQuickInfo(term) {
    const prompt = `Proporciona una explicación muy breve (2-3 líneas) sobre: ${term}
    Enfócate en lo más importante para una entrevista técnica.`;
    
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      
      return {
        term: term,
        explanation: response.text(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error obteniendo información rápida:', error);
      return null;
    }
  }

  addToHistory(question, answer) {
    this.conversationHistory.push({
      question,
      answer,
      timestamp: new Date().toISOString()
    });
    
    // Mantener solo los últimos N elementos
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  // Método para preparación pre-entrevista
  async prepareForInterview(company, position, techStack) {
    const prompt = `Prepara información clave para una entrevista en:
    Empresa: ${company}
    Posición: ${position}
    Stack tecnológico: ${techStack.join(', ')}
    
    Proporciona:
    1. Preguntas técnicas comunes para este stack
    2. Aspectos clave de la empresa a mencionar
    3. Preguntas inteligentes para hacer al entrevistador
    4. Puntos a destacar de tu experiencia`;
    
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      
      return {
        preparation: response.text(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error preparando entrevista:', error);
      return null;
    }
  }
}

module.exports = { GeminiService };