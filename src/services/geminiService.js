const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
  constructor() {
    this.history = [];
    this.conversationHistory = [];
    this.maxHistoryLength = 10;
    this.chat = null; // Para mantener la sesión de chat
    
    // Prompt del sistema para dar contexto a Gemini
    this.systemPrompt = `Eres un asistente experto en desarrollo de software que ayuda durante entrevistas técnicas y reuniones. 
    Proporciona respuestas concisas, precisas y profesionales.
    Si es una pregunta técnica, incluye ejemplos de código cuando sea relevante.`;

    try {
      this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      this.model = this.genAI.getGenerativeModel({
        model: "gemini-2.5-pro-preview-06-05",
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7,
          topP: 0.95,
        }
      });
      
      // Inicializar el chat con el contexto del sistema
      this.initializeChat();
      
    } catch (error) {
      console.error('Error al inicializar GeminiService:', error);
      throw new Error(`No se pudo inicializar GeminiService: ${error.message}`);
    }
  }

  initializeChat() {
    this.chat = this.model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: this.systemPrompt }]
        },
        {
          role: "model",
          parts: [{ text: "Entendido. Estoy listo para ayudarte con preguntas técnicas y durante tus entrevistas. ¿En qué puedo asistirte?" }]
        }
      ],
      generationConfig: {
        maxOutputTokens: 8192,
      }
    });
  }

  async askQuestion(question, context = {}) {
    try {
      console.log('Procesando pregunta:', question);
      console.log('Contexto recibido:', context);

      // Construir el mensaje con contexto
      let contextualizedQuestion = this.buildContextualizedQuestion(question, context);
      
      // Si no hay chat o queremos reiniciar la conversación
      if (!this.chat || context.newConversation) {
        this.initializeChat();
      }

      // Enviar mensaje al chat
      const result = await this.chat.sendMessage(contextualizedQuestion);
      const response = await result.response;

      // Verificar si la respuesta se generó correctamente
      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        
        if (candidate.finishReason === 'STOP') {
          const text = response.text();
          
          // Guardar en historial
          this.addToHistory(question, text, context);
          
          return {
            answer: text,
            timestamp: new Date().toISOString(),
            context: context
          };
        } else {
          console.error(`Respuesta no completada. Razón: ${candidate.finishReason}`);
          if (candidate.finishReason === 'SAFETY') {
            console.error('Bloqueado por seguridad:', candidate.safetyRatings);
          }
          throw new Error(`Respuesta incompleta: ${candidate.finishReason}`);
        }
      }

      throw new Error('No se recibió respuesta válida del modelo');

    } catch (error) {
      console.error('Error con Gemini:', error);
      
      // Si hay un error, intentar reinicializar el chat
      this.initializeChat();
      
      return {
        answer: 'Lo siento, hubo un error al procesar tu pregunta. Por favor, intenta de nuevo.',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  buildContextualizedQuestion(question, context) {
    let parts = [];

    // Agregar contexto de la conversación actual
    if (context.currentTranscript) {
      parts.push(`[Contexto de conversación actual: ${context.currentTranscript}]`);
    }

    // Agregar tema de la reunión
    if (context.meetingTopic) {
      parts.push(`[Tema de la reunión: ${context.meetingTopic}]`);
    }

    // Agregar tecnologías relevantes
    if (context.techStack && context.techStack.length > 0) {
      parts.push(`[Stack tecnológico: ${context.techStack.join(', ')}]`);
    }

    // Agregar rol o posición
    if (context.role) {
      parts.push(`[Rol: ${context.role}]`);
    }

    // Agregar nivel de detalle esperado
    if (context.detailLevel) {
      parts.push(`[Nivel de detalle: ${context.detailLevel}]`);
    }

    // Agregar idioma si es necesario
    if (context.language) {
      parts.push(`[Responder en: ${context.language}]`);
    }

    // Construir la pregunta final
    if (parts.length > 0) {
      return parts.join('\n') + '\n\n' + question;
    }
    
    return question;
  }

  addToHistory(question, answer, context = {}) {
    const historyEntry = {
      question,
      answer,
      context,
      timestamp: new Date().toISOString()
    };

    this.conversationHistory.push(historyEntry);

    // Mantener solo los últimos N elementos
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
    }
  }

  async generateSuggestions(transcript, type = 'response') {
    const prompts = {
      response: `Basándote en esta conversación, sugiere 3 posibles respuestas breves y profesionales que podría dar el candidato:\n\n${transcript}\n\nFormato: Una respuesta por línea, sin numeración.`,
      question: `Basándote en esta conversación, sugiere 3 preguntas inteligentes que el candidato podría hacer:\n\n${transcript}\n\nFormato: Una pregunta por línea, sin numeración.`,
      clarification: `Si el candidato necesita aclarar algo de esta conversación, ¿qué debería preguntar? Sugiere 2 aclaraciones:\n\n${transcript}\n\nFormato: Una aclaración por línea, sin numeración.`
    };

    try {
      const result = await this.model.generateContent(prompts[type]);
      const response = await result.response;
      const text = response.text();
      
      // Dividir por líneas y filtrar vacías
      const suggestions = text
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .slice(0, 3);

      return suggestions;
    } catch (error) {
      console.error('Error generando sugerencias:', error);
      return [];
    }
  }

  async analyzeConversation(fullTranscript) {
    const prompt = `Analiza esta conversación de entrevista/reunión y proporciona un análisis estructurado:

${fullTranscript}

Proporciona:
1. **Puntos clave discutidos**: Lista los temas principales
2. **Compromisos o tareas**: Cualquier acción acordada
3. **Temas técnicos mencionados**: Tecnologías, conceptos o problemas técnicos
4. **Preguntas sin responder**: Si quedó algo pendiente
5. **Resumen ejecutivo**: 2-3 oraciones con lo más importante

Formato: Usa subtítulos claros para cada sección.`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;

      return {
        analysis: response.text(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error analizando conversación:', error);
      return {
        analysis: 'No se pudo analizar la conversación.',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getQuickInfo(term, context = {}) {
    const contextStr = context.techStack ? 
      ` en el contexto de ${context.techStack.join(', ')}` : '';
    
    const prompt = `Proporciona una explicación concisa (2-3 líneas) sobre "${term}"${contextStr}.
Enfócate en lo más relevante para una entrevista técnica.
Si hay un ejemplo corto que ayude, inclúyelo.`;

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
      return {
        term: term,
        explanation: 'No se pudo obtener información.',
        error: error.message
      };
    }
  }

  async prepareForInterview(company, position, techStack = []) {
    const prompt = `Prepara información clave para una entrevista:

**Empresa**: ${company}
**Posición**: ${position}
**Stack tecnológico**: ${techStack.join(', ')}

Proporciona información estructurada sobre:

1. **Preguntas técnicas frecuentes**: 5 preguntas comunes para este stack y posición
2. **Sobre la empresa**: Puntos clave para demostrar interés y conocimiento
3. **Preguntas para el entrevistador**: 3-4 preguntas inteligentes y relevantes
4. **Puntos fuertes a destacar**: Cómo relacionar experiencia con los requisitos
5. **Preparación técnica**: Conceptos clave para repasar

Formato: Usa listas y sé específico con ejemplos cuando sea posible.`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;

      return {
        preparation: response.text(),
        company,
        position,
        techStack,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error preparando entrevista:', error);
      return {
        preparation: 'No se pudo generar la preparación.',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Método para reiniciar la conversación manteniendo el historial
  resetConversation() {
    this.initializeChat();
    console.log('Conversación reiniciada. Historial mantenido.');
  }

  // Método para limpiar todo
  clearAll() {
    this.conversationHistory = [];
    this.initializeChat();
    console.log('Historial y conversación limpiados.');
  }

  // Obtener el historial de conversación
  getHistory() {
    return this.conversationHistory;
  }

  // Obtener estadísticas de uso
  getStats() {
    return {
      totalQuestions: this.conversationHistory.length,
      sessionStart: this.conversationHistory[0]?.timestamp || null,
      lastQuestion: this.conversationHistory[this.conversationHistory.length - 1]?.timestamp || null
    };
  }
}

module.exports = { GeminiService };