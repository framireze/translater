// suggestionsGemini.js
// Sistema inteligente de sugerencias para entrevistas con Gemini

class SuggestionsGeminiService {
    constructor(geminiService) {
        this.geminiService = geminiService;
        this.conversationBuffer = [];
        this.maxBufferSize = 10;
        this.suggestionCache = new Map();
        this.lastSuggestionTime = 0;
        this.suggestionCooldown = 3000; // 3 segundos entre sugerencias
        
        // Configuración de contexto de entrevista
        this.interviewContext = {
            role: '',
            company: '',
            techStack: [],
            interviewType: '',
            language: 'es' // idioma preferido
        };
        
        // Patrones para detectar preguntas
        this.questionPatterns = [
            /\?$/,
            /^(what|how|why|when|where|which|who|can you|could you|would you|do you|have you|are you)/i,
            /^(explica|describe|cuéntame|dime|qué|cómo|por qué|cuándo|dónde|cuál|quién|puedes|podrías)/i,
            /(tell me|explain|describe)/i,
            /(háblame|explícame|descríbeme)/i
        ];
        
        // Preguntas comunes con respuestas predefinidas para respuesta rápida
        this.commonQuestions = {
            'tell me about yourself': {
                es: '• Resumen profesional (30s)\n• Experiencia relevante al rol\n• Logros principales\n• Por qué esta oportunidad',
                en: '• Professional summary (30s)\n• Relevant experience\n• Key achievements\n• Why this opportunity'
            },
            'háblame de ti': {
                es: '• Resumen profesional (30s)\n• Experiencia relevante al rol\n• Logros principales\n• Por qué esta oportunidad',
                en: '• Professional summary (30s)\n• Relevant experience\n• Key achievements\n• Why this opportunity'
            },
            'why do you want to work here': {
                es: '• Valores de la empresa\n• Proyectos interesantes\n• Crecimiento profesional\n• Aporte que puedes hacer',
                en: '• Company values alignment\n• Exciting projects\n• Growth opportunities\n• Value you can add'
            },
            'what are your strengths': {
                es: '• Fortaleza + ejemplo concreto\n• Cómo se relaciona con el rol\n• Resultados medibles\n• Beneficio para el equipo',
                en: '• Strength + concrete example\n• How it relates to role\n• Measurable results\n• Team benefit'
            },
            'what are your weaknesses': {
                es: '• Área de mejora real\n• Pasos para mejorar\n• Progreso actual\n• Convertirlo en positivo',
                en: '• Real improvement area\n• Steps to improve\n• Current progress\n• Turn into positive'
            }
        };
    }
    
    // Actualizar contexto de la entrevista
    updateInterviewContext(context) {
        Object.assign(this.interviewContext, context);
        console.log('Contexto de entrevista actualizado:', this.interviewContext);
    }
    
    // Procesar nueva transcripción y generar sugerencia si es necesario
    async processTranscription(transcriptionData) {
        // Añadir al buffer de conversación
        this.addToConversationBuffer(transcriptionData);
        
        // Verificar si es una pregunta del entrevistador
        if (this.isInterviewerQuestion(transcriptionData)) {
            // Verificar cooldown
            const now = Date.now();
            if (now - this.lastSuggestionTime < this.suggestionCooldown) {
                return null;
            }
            
            this.lastSuggestionTime = now;
            
            // Intentar respuesta rápida primero
            const quickResponse = this.getQuickResponse(transcriptionData.text);
            if (quickResponse) {
                return this.formatSuggestion(quickResponse, transcriptionData, 'quick');
            }
            
            // Si no hay respuesta rápida, generar con Gemini
            return await this.generateSmartSuggestion(transcriptionData);
        }
        
        return null;
    }
    
    // Detectar si es una pregunta del entrevistador
    isInterviewerQuestion(data) {
        const text = data.text.toLowerCase();
        
        // Verificar patrones de pregunta
        const isQuestion = this.questionPatterns.some(pattern => pattern.test(text));
        
        // Verificar longitud (las preguntas suelen ser más cortas)
        const isShortEnough = text.length < 200;
        
        // Verificar que no sea una respuesta del candidato (heurística simple)
        const notCandidateResponse = !text.includes('yo ') && !text.includes('i ') && 
                                   !text.includes('mi experiencia') && !text.includes('my experience');
        
        return isQuestion && isShortEnough && notCandidateResponse;
    }
    
    // Buscar respuesta rápida predefinida
    getQuickResponse(questionText) {
        const normalizedQuestion = questionText.toLowerCase().trim();
        
        for (const [key, responses] of Object.entries(this.commonQuestions)) {
            if (normalizedQuestion.includes(key) || this.fuzzyMatch(normalizedQuestion, key)) {
                return responses[this.interviewContext.language] || responses.es;
            }
        }
        
        return null;
    }
    
    // Generar sugerencia inteligente con Gemini
    async generateSmartSuggestion(questionData) {
        try {
            // Verificar cache primero
            const cacheKey = this.generateCacheKey(questionData.text);
            if (this.suggestionCache.has(cacheKey)) {
                return this.suggestionCache.get(cacheKey);
            }
            
            // Preparar contexto para Gemini
            const context = this.prepareContext(questionData);
            const prompt = this.buildSuggestionPrompt(questionData.text, context);
            
            // Llamar a Gemini con configuración optimizada
            const response = await this.geminiService.model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 300,
                    topP: 0.8,
                    topK: 40
                }
            });
            
            const suggestion = await response.response.text();
            const formattedSuggestion = this.formatSuggestion(suggestion, questionData, 'ai');
            
            // Cachear respuesta
            this.suggestionCache.set(cacheKey, formattedSuggestion);
            this.cleanupCache();
            
            return formattedSuggestion;
            
        } catch (error) {
            console.error('Error generando sugerencia:', error);
            return null;
        }
    }
    
    // Preparar contexto relevante
    prepareContext(questionData) {
        const recentContext = this.conversationBuffer.slice(-5);
        const questionTopic = this.detectQuestionTopic(questionData.text);
        
        return {
            recentConversation: recentContext.map(item => 
                `${item.speaker || 'Speaker'}: ${item.text}`
            ).join('\n'),
            currentQuestion: questionData.text,
            interviewInfo: this.interviewContext,
            questionTopic: questionTopic,
            language: questionData.language || this.interviewContext.language
        };
    }
    
    // Construir prompt optimizado para Gemini
    buildSuggestionPrompt(question, context) {
        const lang = context.language === 'es' ? 'español' : 'inglés';
        
        return `Eres un coach experto en entrevistas técnicas. El candidato acaba de recibir esta pregunta:

"${question}"

${context.recentConversation ? `Contexto reciente:\n${context.recentConversation}\n` : ''}

Información de la entrevista:
- Rol: ${context.interviewInfo.role || 'No especificado'}
- Empresa: ${context.interviewInfo.company || 'No especificada'}
- Stack: ${context.interviewInfo.techStack.join(', ') || 'No especificado'}
- Tipo: ${context.questionTopic}

Proporciona una sugerencia de respuesta BREVE y EFECTIVA en ${lang}:
- Máximo 4 puntos clave
- Usa bullet points (•)
- Incluye ejemplos específicos cuando sea relevante
- Para preguntas de comportamiento, usa formato STAR resumido
- Para preguntas técnicas, incluye términos clave

IMPORTANTE: Solo los puntos clave, NO la respuesta completa.`;
    }
    
    // Detectar el tipo de pregunta
    detectQuestionTopic(questionText) {
        const text = questionText.toLowerCase();
        
        const topics = {
            technical: ['algorithm', 'code', 'implement', 'architecture', 'design pattern', 
                       'algoritmo', 'código', 'implementar', 'arquitectura', 'patrón'],
            behavioral: ['tell me about a time', 'describe a situation', 'example',
                        'cuéntame sobre una vez', 'describe una situación', 'ejemplo'],
            system_design: ['design', 'scale', 'system', 'diseñar', 'escalar', 'sistema'],
            experience: ['experience', 'background', 'experiencia', 'trayectoria'],
            cultural: ['why here', 'values', 'por qué aquí', 'valores', 'cultura']
        };
        
        for (const [topic, keywords] of Object.entries(topics)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                return topic;
            }
        }
        
        return 'general';
    }
    
    // Formatear sugerencia
    formatSuggestion(suggestionText, questionData, type) {
        return {
            id: `suggestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            questionText: questionData.text,
            questionTimestamp: questionData.timestamp,
            suggestion: suggestionText,
            type: type, // 'quick' o 'ai'
            confidence: this.calculateConfidence(suggestionText, type),
            language: questionData.language || this.interviewContext.language,
            timestamp: new Date().toISOString(),
            topic: this.detectQuestionTopic(questionData.text)
        };
    }
    
    // Calcular confianza de la sugerencia
    calculateConfidence(suggestion, type) {
        if (type === 'quick') return 'high'; // Respuestas predefinidas
        
        if (!suggestion || suggestion.length < 50) return 'low';
        if (suggestion.length > 200 && suggestion.includes('•')) return 'high';
        return 'medium';
    }
    
    // Añadir al buffer de conversación
    addToConversationBuffer(data) {
        this.conversationBuffer.push({
            text: data.text,
            language: data.language,
            timestamp: data.timestamp,
            speaker: this.detectSpeaker(data)
        });
        
        if (this.conversationBuffer.length > this.maxBufferSize) {
            this.conversationBuffer.shift();
        }
    }
    
    // Detectar quién está hablando
    detectSpeaker(data) {
        return this.isInterviewerQuestion(data) ? 'interviewer' : 'candidate';
    }
    
    // Generar clave de cache
    generateCacheKey(text) {
        return text.toLowerCase().trim().replace(/\s+/g, ' ').substring(0, 100);
    }
    
    // Limpiar cache antiguo
    cleanupCache() {
        if (this.suggestionCache.size > 50) {
            const keysToDelete = Array.from(this.suggestionCache.keys()).slice(0, 10);
            keysToDelete.forEach(key => this.suggestionCache.delete(key));
        }
    }
    
    // Coincidencia aproximada
    fuzzyMatch(str1, str2, threshold = 0.7) {
        const words1 = str1.split(' ');
        const words2 = str2.split(' ');
        let matches = 0;
        
        words2.forEach(word => {
            if (words1.some(w => w.includes(word) || word.includes(w))) {
                matches++;
            }
        });
        
        return (matches / words2.length) >= threshold;
    }
    
    // Obtener estadísticas del servicio
    getStats() {
        return {
            bufferSize: this.conversationBuffer.length,
            cacheSize: this.suggestionCache.size,
            cacheHitRate: this.cacheHits ? 
                (this.cacheHits / (this.cacheHits + this.cacheMisses) * 100).toFixed(2) + '%' : '0%',
            context: this.interviewContext
        };
    }
    
    // Limpiar todo
    clear() {
        this.conversationBuffer = [];
        this.suggestionCache.clear();
        this.lastSuggestionTime = 0;
    }
}

module.exports = { SuggestionsGeminiService };