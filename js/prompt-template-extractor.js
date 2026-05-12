/**
 * Prompt Template Extractor - 提问模板提炼器
 * 
 * 功能：
 * - 从文件夹中的收藏问题提炼出结构化的提问模板
 * - 分析问题模式，生成可复用的通用问题模板
 * - 支持模板的保存、编辑和管理
 */

class PromptTemplateExtractor {
    constructor() {
        this.storageKey = 'promptTemplates';
    }

    /**
     * 获取所有模板
     * @returns {Promise<Array>}
     */
    async getTemplates() {
        try {
            const result = await chrome.storage.local.get(this.storageKey);
            return result[this.storageKey] || [];
        } catch (e) {
            console.error('[PromptTemplateExtractor] Failed to get templates:', e);
            return [];
        }
    }

    /**
     * 保存模板列表
     * @param {Array} templates 
     */
    async saveTemplates(templates) {
        try {
            await chrome.storage.local.set({ [this.storageKey]: templates });
        } catch (e) {
            console.error('[PromptTemplateExtractor] Failed to save templates:', e);
        }
    }

    /**
     * 获取文件夹中的所有收藏项内容
     * @param {string|null} folderId - 文件夹 ID，null 表示从所有文件夹获取
     * @returns {Promise<Array>} - 收藏项数组
     */
    async getStarredContents(folderId = null) {
        try {
            // 注意：实际存储 key 是 chatTimelineStars（复数）
            const result = await chrome.storage.local.get('chatTimelineStars');
            const items = result.chatTimelineStars || [];
            
            // 过滤出有问题的收藏项
            // 注意：字段名是 question，不是 content
            const userQuestions = items.filter(item => {
                if (!item.question || !item.question.trim()) return false;
                if (folderId !== null && item.folderId !== folderId) return false;
                return true;
            });
            
            return userQuestions.map(item => ({
                turnId: item.nodeId || item.index || item.key,
                content: item.question,
                theme: item.urlWithoutProtocol || '',
                platformId: ''
            }));
        } catch (e) {
            console.error('[PromptTemplateExtractor] Failed to get starred contents:', e);
            return [];
        }
    }

    /**
     * 提炼问题模板的核心算法
     * @param {Array} questions - 用户问题数组
     * @returns {Object} - { suiteName, questions }
     */
    extractTemplate(questions) {
        if (!questions || questions.length === 0) {
            return { suiteName: '', questions: [], error: '没有可用的问题' };
        }

        // 预处理：清理和标准化问题
        const normalizedQuestions = questions.map(q => ({
            original: q.content,
            cleaned: this._cleanQuestion(q.content),
            theme: q.theme || ''
        }));

        // 分析问题模式
        const patterns = this._analyzePatterns(normalizedQuestions);
        
        // 生成模板问题
        const templateQuestions = this._generateTemplateQuestions(patterns, normalizedQuestions);
        
        // 生成套件名称
        const suiteName = this._generateSuiteName(normalizedQuestions, patterns);

        return {
            suiteName,
            questions: templateQuestions,
            sourceCount: questions.length,
            extractedAt: Date.now()
        };
    }

    /**
     * 清理问题文本，提取核心内容
     * @param {string} text 
     * @returns {string}
     */
    _cleanQuestion(text) {
        if (!text) return '';
        
        // 移除多余空白
        let cleaned = text.replace(/\s+/g, ' ').trim();
        
        // 移除常见的前缀（如编号、特殊字符）
        cleaned = cleaned.replace(/^(问题?\d+[.:、，]\s*)/i, '');
        cleaned = cleaned.replace(/^(Q\d+[.:、，]\s*)/i, '');
        cleaned = cleaned.replace(/^[\[\(【〔].*?[\]\)】〕]\s*/, '');
        
        return cleaned;
    }

    /**
     * 分析问题模式
     * @param {Array} questions 
     * @returns {Object}
     */
    _analyzePatterns(questions) {
        const patterns = {
            // 问题类型关键词
            types: {
                how: 0,      // 如何类
                what: 0,     // 什么类
                why: 0,      // 为什么类
                when: 0,     // 什么时候类
                where: 0,    // 在哪里类
                who: 0,       // 谁类
                compare: 0,  // 对比类
                list: 0,     // 列表类
                summary: 0,  // 总结类
                code: 0,     // 代码类
                explain: 0,  // 解释类
                other: 0     // 其他
            },
            // 共同主题
            commonTopics: [],
            // 变量占位符
            placeholders: [],
            // 问题长度分布
            lengthStats: {
                avg: 0,
                min: Infinity,
                max: 0
            }
        };

        let totalLength = 0;
        
        questions.forEach(q => {
            const text = q.cleaned.toLowerCase();
            const words = text.split(/\s+/);
            
            // 统计长度
            totalLength += q.cleaned.length;
            patterns.lengthStats.min = Math.min(patterns.lengthStats.min, q.cleaned.length);
            patterns.lengthStats.max = Math.max(patterns.lengthStats.max, q.cleaned.length);
            
            // 分类问题类型
            if (text.match(/^(how|如何|怎样|怎么)/)) patterns.types.how++;
            else if (text.match(/^(what|什么是|什么|哪个)/)) patterns.types.what++;
            else if (text.match(/^(why|为什么|为何)/)) patterns.types.why++;
            else if (text.match(/^(when|什么时候|何时)/)) patterns.types.when++;
            else if (text.match(/^(where|在哪里|何处)/)) patterns.types.where++;
            else if (text.match(/^(who|谁|哪个人)/)) patterns.types.who++;
            else if (text.match(/(对比|比较|差异|区别|vs\.?|versus)/)) patterns.types.compare++;
            else if (text.match(/(列表|列出|列举|清单|步骤)/)) patterns.types.list++;
            else if (text.match(/(总结|概括|归纳|要点)/)) patterns.types.summary++;
            else if (text.match(/(代码|function|class|def |const |let |var |=>)/)) patterns.types.code++;
            else if (text.match(/(解释|说明|讲解|理解)/)) patterns.types.explain++;
            else patterns.types.other++;
            
            // 提取常见主题（如果有的话）
            if (q.theme) {
                patterns.commonTopics.push(q.theme);
            }
        });

        // 计算平均长度
        patterns.lengthStats.avg = questions.length > 0 
            ? Math.round(totalLength / questions.length) 
            : 0;
        
        // 去重主题
        patterns.commonTopics = [...new Set(patterns.commonTopics.filter(Boolean))];

        return patterns;
    }

    /**
     * 生成模板问题
     * @param {Object} patterns 
     * @param {Array} questions 
     * @returns {Array}
     */
    _generateTemplateQuestions(patterns, questions) {
        const templates = [];
        const processedTexts = new Set();
        
        // 1. 基于问题类型生成模板
        const typeOrder = ['what', 'how', 'why', 'explain', 'compare', 'list', 'code', 'summary', 'other'];
        
        typeOrder.forEach(type => {
            if (patterns.types[type] > 0) {
                const template = this._generateTypeTemplate(type, patterns);
                if (template) {
                    templates.push(template);
                }
            }
        });

        // 2. 从原始问题提取通用模式
        const commonPatterns = this._extractCommonPatterns(questions);
        commonPatterns.forEach(pattern => {
            if (templates.length < 10) { // 最多10个模板问题
                templates.push({
                    id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    type: 'pattern',
                    text: pattern,
                    isPlaceholder: true
                });
            }
        });

        // 3. 如果模板太少，从原始问题中选择有代表性的
        if (templates.length < 3 && questions.length > 0) {
            // 选择最短、中等、最长的三个问题作为示例
            const sorted = [...questions].sort((a, b) => a.cleaned.length - b.cleaned.length);
            const indices = [];
            if (sorted.length >= 1) indices.push(0);
            if (sorted.length >= 2) indices.push(Math.floor(sorted.length / 2));
            if (sorted.length >= 3) indices.push(sorted.length - 1);
            
            indices.forEach(idx => {
                const q = sorted[idx];
                if (!processedTexts.has(q.cleaned.substring(0, 50))) {
                    templates.push({
                        id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        type: 'example',
                        text: q.cleaned,
                        isPlaceholder: true
                    });
                    processedTexts.add(q.cleaned.substring(0, 50));
                }
            });
        }

        // 添加编号
        templates.forEach((tpl, idx) => {
            tpl.order = idx + 1;
        });

        return templates;
    }

    /**
     * 生成特定类型的模板
     * @param {string} type 
     * @param {Object} patterns 
     * @returns {Object|null}
     */
    _generateTypeTemplate(type, patterns) {
        const typeTemplates = {
            what: {
                id: `tpl_${Date.now()}_what`,
                type: 'what',
                text: '[核心概念/主题]是什么？请给出定义和关键特征。',
                description: '概念定义类问题'
            },
            how: {
                id: `tpl_${Date.now()}_how`,
                type: 'how',
                text: '如何[完成目标/解决问题]？请提供具体步骤和方法。',
                description: '方法步骤类问题'
            },
            why: {
                id: `tpl_${Date.now()}_why`,
                type: 'why',
                text: '为什么[现象/结果]会出现？请分析原因和影响因素。',
                description: '原因分析类问题'
            },
            explain: {
                id: `tpl_${Date.now()}_explain`,
                type: 'explain',
                text: '请详细解释[主题/概念]，包括原理、特点和实际应用。',
                description: '详细解释类问题'
            },
            compare: {
                id: `tpl_${Date.now()}_compare`,
                type: 'compare',
                text: '请对比分析[对象A]和[对象B]，列出异同点和各自的优劣势。',
                description: '对比分析类问题'
            },
            list: {
                id: `tpl_${Date.now()}_list`,
                type: 'list',
                text: '请列出[主题]的主要方面/类型/步骤，并简要说明。',
                description: '列举说明类问题'
            },
            code: {
                id: `tpl_${Date.now()}_code`,
                type: 'code',
                text: '请提供[功能]的代码实现，要求：[具体要求]',
                description: '代码实现类问题'
            },
            summary: {
                id: `tpl_${Date.now()}_summary`,
                type: 'summary',
                text: '请总结[主题]的核心要点，并指出需要注意的关键点。',
                description: '总结归纳类问题'
            },
            other: {
                id: `tpl_${Date.now()}_other`,
                type: 'other',
                text: '关于[主题]，你还想了解哪些方面？',
                description: '开放探索类问题'
            }
        };

        return typeTemplates[type] || null;
    }

    /**
     * 提取问题中的通用模式
     * @param {Array} questions 
     * @returns {Array}
     */
    _extractCommonPatterns(questions) {
        const patterns = [];
        const minOccurrence = Math.ceil(questions.length / 3); // 至少1/3出现
        
        // 提取常见前缀模式
        const prefixes = {};
        questions.forEach(q => {
            const words = q.cleaned.split(/\s+/);
            if (words.length >= 2) {
                const prefix = words.slice(0, 2).join(' ');
                prefixes[prefix] = (prefixes[prefix] || 0) + 1;
            }
        });

        // 找出高频前缀
        Object.entries(prefixes)
            .filter(([_, count]) => count >= minOccurrence)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .forEach(([prefix, count]) => {
                patterns.push(`${prefix}...的核心要点是什么？`);
            });

        // 提取主体词模式
        const subjects = {};
        questions.forEach(q => {
            // 尝试提取"关于X"模式
            const match = q.cleaned.match(/关于(.+?)[，,，、]|^(.+?)的/);
            if (match) {
                const subject = match[1] || match[2];
                if (subject && subject.length > 2 && subject.length < 20) {
                    subjects[subject] = (subjects[subject] || 0) + 1;
                }
            }
        });

        // 找出高频主体词
        Object.entries(subjects)
            .filter(([_, count]) => count >= minOccurrence)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .forEach(([subject]) => {
                patterns.push(`关于${subject}，请给出全面的介绍和分析。`);
            });

        return patterns;
    }

    /**
     * 生成套件名称
     * @param {Array} questions 
     * @param {Object} patterns 
     * @returns {string}
     */
    _generateSuiteName(questions, patterns) {
        // 优先使用共同主题
        if (patterns.commonTopics.length > 0) {
            return `${patterns.commonTopics[0]}提问模板套件`;
        }

        // 基于问题类型推断
        const typeCounts = Object.entries(patterns.types)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => b[1] - a[1]);

        if (typeCounts.length > 0) {
            const topType = typeCounts[0][0];
            const typeNames = {
                how: '操作指南',
                what: '概念解析',
                why: '原因分析',
                explain: '详细说明',
                compare: '对比分析',
                list: '要点列举',
                code: '代码实现',
                summary: '总结归纳'
            };
            return `${typeNames[topType] || '综合'}提问模板套件`;
        }

        // 默认名称
        return `通用提问模板套件`;
    }

    /**
     * 保存提炼后的模板
     * @param {Object} templateData - 模板数据
     * @returns {Promise<Object>}
     */
    async saveExtractedTemplate(templateData) {
        const templates = await this.getTemplates();
        
        const newTemplate = {
            id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            suiteName: templateData.suiteName,
            questions: templateData.questions,
            sourceCount: templateData.sourceCount || 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        templates.push(newTemplate);
        await this.saveTemplates(templates);
        
        return newTemplate;
    }

    /**
     * 更新模板
     * @param {string} templateId 
     * @param {Object} updates 
     * @returns {Promise<boolean>}
     */
    async updateTemplate(templateId, updates) {
        const templates = await this.getTemplates();
        const index = templates.findIndex(t => t.id === templateId);
        
        if (index === -1) return false;

        templates[index] = {
            ...templates[index],
            ...updates,
            updatedAt: Date.now()
        };

        await this.saveTemplates(templates);
        return true;
    }

    /**
     * 删除模板
     * @param {string} templateId 
     * @returns {Promise<boolean>}
     */
    async deleteTemplate(templateId) {
        const templates = await this.getTemplates();
        const filtered = templates.filter(t => t.id !== templateId);
        
        if (filtered.length === templates.length) return false;
        
        await this.saveTemplates(filtered);
        return true;
    }

    /**
     * 获取模板详情
     * @param {string} templateId 
     * @returns {Promise<Object|null>}
     */
    async getTemplate(templateId) {
        const templates = await this.getTemplates();
        return templates.find(t => t.id === templateId) || null;
    }

    /**
     * 将模板转换为提示词格式
     * @param {Object} template 
     * @returns {Object}
     */
    templateToPrompt(template) {
        const questions = template.questions
            .map((q, idx) => `Q${idx + 1}: ${q.text}`)
            .join('\n');

        return {
            name: template.suiteName,
            content: `【提问模板套件】

${template.questions.map((q, idx) => `Q${idx + 1}: ${q.text}`).join('\n')}

---
提示：使用时请将方括号[]中的内容替换为具体的上下文或需求。`
        };
    }
}

// 导出单例
window.promptTemplateExtractor = new PromptTemplateExtractor();
