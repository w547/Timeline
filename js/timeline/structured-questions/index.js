/**
 * Structured Questions Extractor
 * 
 * Extracts and organizes user questions from conversation history
 * into structured learning templates.
 */

class StructuredQuestionsExtractor {
    constructor() {
        this.templates = [];
        this.loadTemplates();
    }

    /**
     * Extract user questions from timeline markers
     * @param {Array} markers - Timeline markers
     * @param {number} startIndex - Start index
     * @param {number} endIndex - End index
     * @returns {Array} Extracted questions
     */
    extractQuestions(markers, startIndex = 0, endIndex = markers.length - 1) {
        const questions = [];
        for (let i = startIndex; i <= endIndex; i++) {
            const marker = markers[i];
            if (marker && marker.summary) {
                questions.push({
                    id: marker.id,
                    text: marker.summary,
                    index: i
                });
            }
        }
        return questions;
    }

    /**
     * Analyze logical relationships between questions
     * @param {Array} questions - Extracted questions
     * @returns {Object} Structured outline
     */
    analyzeStructure(questions) {
        const outline = {
            type: 'learning',
            sections: [
                {
                    title: '整体框架询问',
                    questions: [],
                    type: 'overview'
                },
                {
                    title: '关键术语解析',
                    questions: [],
                    type: 'terms'
                },
                {
                    title: '深入发散探讨',
                    questions: [],
                    type: 'deep'
                }
            ]
        };

        // Simple heuristic for categorization
        questions.forEach((q, index) => {
            if (index === 0) {
                // First question is likely an overview
                outline.sections[0].questions.push(q);
            } else if (q.text.includes('什么是') || q.text.includes('定义') || q.text.includes('概念') || q.text.includes('术语')) {
                // Questions about definitions/terms
                outline.sections[1].questions.push(q);
            } else {
                // Other questions are likely deep discussions
                outline.sections[2].questions.push(q);
            }
        });

        return outline;
    }

    /**
     * Save structured outline as a template
     * @param {Object} outline - Structured outline
     * @param {string} name - Template name
     * @returns {Object} Saved template
     */
    saveTemplate(outline, name) {
        const template = {
            id: Date.now().toString(),
            name: name || `学习模板 ${this.templates.length + 1}`,
            outline: outline,
            createdAt: new Date().toISOString()
        };

        this.templates.push(template);
        this.saveTemplates();
        return template;
    }

    /**
     * Load templates from storage
     */
    loadTemplates() {
        try {
            const stored = localStorage.getItem('ait-structured-question-templates');
            if (stored) {
                this.templates = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load templates:', e);
            this.templates = [];
        }
    }

    /**
     * Save templates to storage
     */
    saveTemplates() {
        try {
            localStorage.setItem('ait-structured-question-templates', JSON.stringify(this.templates));
        } catch (e) {
            console.error('Failed to save templates:', e);
        }
    }

    /**
     * Get all templates
     * @returns {Array} Templates
     */
    getTemplates() {
        return this.templates;
    }

    /**
     * Delete a template
     * @param {string} templateId - Template ID
     * @returns {boolean} Success
     */
    deleteTemplate(templateId) {
        const index = this.templates.findIndex(t => t.id === templateId);
        if (index !== -1) {
            this.templates.splice(index, 1);
            this.saveTemplates();
            return true;
        }
        return false;
    }

    /**
     * Generate a new set of questions based on a template
     * @param {string} templateId - Template ID
     * @param {string} topic - New topic
     * @returns {Array} Generated questions
     */
    generateQuestionsFromTemplate(templateId, topic) {
        const template = this.templates.find(t => t.id === templateId);
        if (!template) return [];

        const generated = [];
        template.outline.sections.forEach(section => {
            section.questions.forEach(q => {
                // Simple replacement - in a real implementation, this could use AI
                const newQuestion = q.text.replace(/\b(主题|话题|内容)\b/g, topic);
                generated.push(newQuestion);
            });
        });

        return generated;
    }
}

// Export as singleton
if (typeof window.structuredQuestionsExtractor === 'undefined') {
    window.structuredQuestionsExtractor = new StructuredQuestionsExtractor();
}
