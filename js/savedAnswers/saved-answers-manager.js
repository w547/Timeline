/**
 * Saved Answers Manager - 手动保存回答管理器
 *
 * 功能：
 * - 管理用户手动保存的AI回答
 * - 支持CRUD操作
 * - 防重复提交
 * - 与模板系统关联
 */

class SavedAnswersManager {
    static STORAGE_KEY = 'savedAnswers';
    static TEMPLATE_STORAGE_KEY = 'answerTemplates';
    static TEMPLATE_VERSION_KEY = 'templateVersions';
    static MAX_ANSWERS = 1000;

    constructor() {
        this._savingLock = new Map(); // 防重复提交锁: turnId -> Promise
    }

    /**
     * 获取所有已保存的回答
     * @param {Object} filters - 筛选条件
     * @returns {Promise<Array>}
     */
    async getSavedAnswers(filters = {}) {
        try {
            const result = await chrome.storage.local.get(SavedAnswersManager.STORAGE_KEY);
            let answers = result[SavedAnswersManager.STORAGE_KEY] || [];

            // 筛选
            if (filters.search) {
                const query = filters.search.toLowerCase();
                answers = answers.filter(a =>
                    (a.content || '').toLowerCase().includes(query) ||
                    (a.question || '').toLowerCase().includes(query) ||
                    (a.name || '').toLowerCase().includes(query)
                );
            }
            if (filters.platform) {
                answers = answers.filter(a => a.platform === filters.platform);
            }
            if (filters.hasTemplate !== undefined) {
                answers = answers.filter(a => filters.hasTemplate ? !!a.templateId : !a.templateId);
            }

            // 按时间倒序
            answers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            return answers;
        } catch (e) {
            console.error('[SavedAnswers] Failed to load:', e);
            return [];
        }
    }

    /**
     * 获取单个保存的回答
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getSavedAnswer(id) {
        const answers = await this.getSavedAnswers();
        return answers.find(a => a.id === id) || null;
    }

    /**
     * 手动保存回答（带防重复提交）
     * @param {Object} data - { content, question, turnId, url, platform }
     * @returns {Promise<Object>}
     */
    async saveAnswer(data) {
        const lockKey = data.turnId || data.content?.substring(0, 50);

        // 防重复提交：如果已有进行中的保存操作，返回其Promise
        if (this._savingLock.has(lockKey)) {
            console.warn('[SavedAnswers] 重复提交已被阻止, key:', lockKey);
            throw new Error('该回答正在保存中，请勿重复操作');
        }

        const savePromise = this._doSave(data);
        this._savingLock.set(lockKey, savePromise);

        try {
            const result = await savePromise;
            return result;
        } finally {
            // 延迟清除锁，防止快速重复点击
            setTimeout(() => {
                this._savingLock.delete(lockKey);
            }, 1000);
        }
    }

    /**
     * 内部保存逻辑
     */
    async _doSave(data) {
        if (!data.content || !data.content.trim()) {
            throw new Error('回答内容不能为空');
        }

        try {
            const result = await chrome.storage.local.get(SavedAnswersManager.STORAGE_KEY);
            const answers = result[SavedAnswersManager.STORAGE_KEY] || [];

            // 检查是否已保存（根据turnId去重）
            if (data.turnId) {
                const exists = answers.find(a => a.turnId === data.turnId);
                if (exists) {
                    // 更新已有记录
                    exists.content = data.content;
                    exists.question = data.question || exists.question;
                    exists.updatedAt = Date.now();
                    await chrome.storage.local.set({ [SavedAnswersManager.STORAGE_KEY]: answers });
                    return exists;
                }
            }

            // 限制数量
            if (answers.length >= SavedAnswersManager.MAX_ANSWERS) {
                answers.shift(); // 删除最旧的
            }

            const savedAnswer = {
                id: `saved_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                content: data.content.trim(),
                question: data.question || '',
                turnId: data.turnId || null,
                url: data.url || location.href,
                platform: data.platform || this._detectPlatform(),
                templateId: null, // 关联的模板ID
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            answers.push(savedAnswer);
            await chrome.storage.local.set({ [SavedAnswersManager.STORAGE_KEY]: answers });

            console.log('[SavedAnswers] 已保存回答:', savedAnswer.id);
            return savedAnswer;
        } catch (e) {
            console.error('[SavedAnswers] 保存失败:', e);
            throw new Error('保存失败: ' + (e.message || '未知错误'));
        }
    }

    /**
     * 更新保存的回答
     */
    async updateAnswer(id, updates) {
        const result = await chrome.storage.local.get(SavedAnswersManager.STORAGE_KEY);
        const answers = result[SavedAnswersManager.STORAGE_KEY] || [];
        const index = answers.findIndex(a => a.id === id);

        if (index === -1) {
            throw new Error('回答不存在');
        }

        answers[index] = {
            ...answers[index],
            ...updates,
            updatedAt: Date.now()
        };

        await chrome.storage.local.set({ [SavedAnswersManager.STORAGE_KEY]: answers });
        return answers[index];
    }

    /**
     * 删除保存的回答
     */
    async deleteAnswer(id) {
        const result = await chrome.storage.local.get(SavedAnswersManager.STORAGE_KEY);
        const answers = result[SavedAnswersManager.STORAGE_KEY] || [];
        const filtered = answers.filter(a => a.id !== id);

        if (filtered.length === answers.length) {
            throw new Error('回答不存在');
        }

        await chrome.storage.local.set({ [SavedAnswersManager.STORAGE_KEY]: filtered });

        // 同时解除模板关联
        await this._unlinkTemplate(id);
        return true;
    }

    /**
     * 批量删除
     */
    async deleteAnswers(ids) {
        const idSet = new Set(ids);
        const result = await chrome.storage.local.get(SavedAnswersManager.STORAGE_KEY);
        const answers = result[SavedAnswersManager.STORAGE_KEY] || [];
        const filtered = answers.filter(a => !idSet.has(a.id));

        await chrome.storage.local.set({ [SavedAnswersManager.STORAGE_KEY]: filtered });
        return answers.length - filtered.length;
    }

    // ==================== 模板管理 ====================

    /**
     * 获取所有模板
     */
    async getTemplates() {
        try {
            const result = await chrome.storage.local.get(SavedAnswersManager.TEMPLATE_STORAGE_KEY);
            return result[SavedAnswersManager.TEMPLATE_STORAGE_KEY] || [];
        } catch (e) {
            return [];
        }
    }

    /**
     * 保存模板
     * @param {Object} templateData
     */
    async saveTemplate(templateData) {
        const result = await chrome.storage.local.get(SavedAnswersManager.TEMPLATE_STORAGE_KEY);
        const templates = result[SavedAnswersManager.TEMPLATE_STORAGE_KEY] || [];

        const template = {
            id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: templateData.name || '未命名模板',
            content: templateData.content || '',
            variables: templateData.variables || [],
            sourceAnswerId: templateData.sourceAnswerId || null,
            category: templateData.category || 'general',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        templates.push(template);
        await chrome.storage.local.set({ [SavedAnswersManager.TEMPLATE_STORAGE_KEY]: templates });

        // 关联到源回答
        if (templateData.sourceAnswerId) {
            await this.updateAnswer(templateData.sourceAnswerId, { templateId: template.id });
        }

        // 创建初始版本
        await this._createTemplateVersion(template.id, template.content, '初始版本');

        return template;
    }

    /**
     * 更新模板
     */
    async updateTemplate(id, updates, versionMessage = '') {
        const result = await chrome.storage.local.get(SavedAnswersManager.TEMPLATE_STORAGE_KEY);
        const templates = result[SavedAnswersManager.TEMPLATE_STORAGE_KEY] || [];
        const index = templates.findIndex(t => t.id === id);

        if (index === -1) throw new Error('模板不存在');

        const oldContent = templates[index].content;
        templates[index] = {
            ...templates[index],
            ...updates,
            updatedAt: Date.now()
        };

        await chrome.storage.local.set({ [SavedAnswersManager.TEMPLATE_STORAGE_KEY]: templates });

        // 如果内容变化，创建新版本
        if (updates.content && updates.content !== oldContent) {
            await this._createTemplateVersion(id, updates.content, versionMessage || '更新模板');
        }

        return templates[index];
    }

    /**
     * 删除模板
     */
    async deleteTemplate(id) {
        const result = await chrome.storage.local.get(SavedAnswersManager.TEMPLATE_STORAGE_KEY);
        const templates = result[SavedAnswersManager.TEMPLATE_STORAGE_KEY] || [];
        const filtered = templates.filter(t => t.id !== id);

        await chrome.storage.local.set({ [SavedAnswersManager.TEMPLATE_STORAGE_KEY]: filtered });

        // 解除关联的回答的模板引用
        await this._unlinkAnswersFromTemplate(id);

        // 清理版本
        const verResult = await chrome.storage.local.get(SavedAnswersManager.TEMPLATE_VERSION_KEY);
        const versions = verResult[SavedAnswersManager.TEMPLATE_VERSION_KEY] || {};
        delete versions[id];
        await chrome.storage.local.set({ [SavedAnswersManager.TEMPLATE_VERSION_KEY]: versions });

        return true;
    }

    /**
     * 获取使用某模板的所有回答
     */
    async getAnswersByTemplate(templateId) {
        const answers = await this.getSavedAnswers();
        return answers.filter(a => a.templateId === templateId);
    }

    // ==================== 版本控制 ====================

    /**
     * 创建模板版本
     */
    async _createTemplateVersion(templateId, content, message = '') {
        const result = await chrome.storage.local.get(SavedAnswersManager.TEMPLATE_VERSION_KEY);
        const allVersions = result[SavedAnswersManager.TEMPLATE_VERSION_KEY] || {};
        const versions = allVersions[templateId] || [];

        versions.push({
            id: `ver_${Date.now()}`,
            templateId,
            content,
            message,
            createdAt: Date.now()
        });

        // 限制版本数量
        if (versions.length > 50) {
            versions.splice(0, versions.length - 50);
        }

        allVersions[templateId] = versions;
        await chrome.storage.local.set({ [SavedAnswersManager.TEMPLATE_VERSION_KEY]: allVersions });
    }

    /**
     * 获取模板版本历史
     */
    async getTemplateVersions(templateId) {
        const result = await chrome.storage.local.get(SavedAnswersManager.TEMPLATE_VERSION_KEY);
        const allVersions = result[SavedAnswersManager.TEMPLATE_VERSION_KEY] || {};
        return (allVersions[templateId] || []).sort((a, b) => b.createdAt - a.createdAt);
    }

    /**
     * 恢复模板版本
     */
    async restoreTemplateVersion(templateId, versionId) {
        const versions = await this.getTemplateVersions(templateId);
        const version = versions.find(v => v.id === versionId);
        if (!version) throw new Error('版本不存在');

        return await this.updateTemplate(templateId, {
            content: version.content
        }, `恢复到版本: ${version.message}`);
    }

    // ==================== 辅助方法 ====================

    /**
     * 解除模板关联
     */
    async _unlinkTemplate(answerId) {
        const result = await chrome.storage.local.get(SavedAnswersManager.STORAGE_KEY);
        const answers = result[SavedAnswersManager.STORAGE_KEY] || [];
        const answer = answers.find(a => a.id === answerId);
        if (answer && answer.templateId) {
            answer.templateId = null;
            await chrome.storage.local.set({ [SavedAnswersManager.STORAGE_KEY]: answers });
        }
    }

    /**
     * 解除所有关联某模板的回答
     */
    async _unlinkAnswersFromTemplate(templateId) {
        const result = await chrome.storage.local.get(SavedAnswersManager.STORAGE_KEY);
        const answers = result[SavedAnswersManager.STORAGE_KEY] || [];
        let changed = false;
        answers.forEach(a => {
            if (a.templateId === templateId) {
                a.templateId = null;
                changed = true;
            }
        });
        if (changed) {
            await chrome.storage.local.set({ [SavedAnswersManager.STORAGE_KEY]: answers });
        }
    }

    /**
     * 检测当前平台
     */
    _detectPlatform() {
        try {
            if (typeof SITE_INFO !== 'undefined') {
                const site = SITE_INFO.find(s => location.hostname.includes(s.hostname || ''));
                if (site) return site.id;
            }
        } catch (e) {}
        return location.hostname.replace('www.', '');
    }

    /**
     * 获取统计信息
     */
    async getStats() {
        const answers = await this.getSavedAnswers();
        const templates = await this.getTemplates();
        const withTemplate = answers.filter(a => !!a.templateId);

        return {
            totalAnswers: answers.length,
            totalTemplates: templates.length,
            answersWithTemplate: withTemplate.length,
            platforms: [...new Set(answers.map(a => a.platform))]
        };
    }

    /**
     * 导出数据
     */
    async exportData() {
        const answers = await this.getSavedAnswers();
        const templates = await this.getTemplates();

        const verResult = await chrome.storage.local.get(SavedAnswersManager.TEMPLATE_VERSION_KEY);
        const versions = verResult[SavedAnswersManager.TEMPLATE_VERSION_KEY] || {};

        return {
            version: 1,
            exportedAt: Date.now(),
            answers,
            templates,
            templateVersions: versions
        };
    }

    /**
     * 导入数据
     */
    async importData(data) {
        if (!data || data.version !== 1) {
            throw new Error('无效的导入数据格式');
        }

        const current = await chrome.storage.local.get([
            SavedAnswersManager.STORAGE_KEY,
            SavedAnswersManager.TEMPLATE_STORAGE_KEY,
            SavedAnswersManager.TEMPLATE_VERSION_KEY
        ]);

        // 合并回答
        const existingAnswers = current[SavedAnswersManager.STORAGE_KEY] || [];
        const existingIds = new Set(existingAnswers.map(a => a.id));
        const newAnswers = (data.answers || []).filter(a => !existingIds.has(a.id));
        const mergedAnswers = [...existingAnswers, ...newAnswers];

        // 合并模板
        const existingTemplates = current[SavedAnswersManager.TEMPLATE_STORAGE_KEY] || [];
        const existingTplIds = new Set(existingTemplates.map(t => t.id));
        const newTemplates = (data.templates || []).filter(t => !existingTplIds.has(t.id));
        const mergedTemplates = [...existingTemplates, ...newTemplates];

        // 合并版本
        const existingVersions = current[SavedAnswersManager.TEMPLATE_VERSION_KEY] || {};
        const importVersions = data.templateVersions || {};
        const mergedVersions = { ...existingVersions };
        for (const [tplId, vers] of Object.entries(importVersions)) {
            const existing = mergedVersions[tplId] || [];
            const existingVerIds = new Set(existing.map(v => v.id));
            const newVers = vers.filter(v => !existingVerIds.has(v.id));
            mergedVersions[tplId] = [...existing, ...newVers];
        }

        await chrome.storage.local.set({
            [SavedAnswersManager.STORAGE_KEY]: mergedAnswers,
            [SavedAnswersManager.TEMPLATE_STORAGE_KEY]: mergedTemplates,
            [SavedAnswersManager.TEMPLATE_VERSION_KEY]: mergedVersions
        });

        return {
            answersImported: newAnswers.length,
            templatesImported: newTemplates.length
        };
    }

    /**
     * 销毁
     */
    destroy() {
        this._savingLock.clear();
    }
}

// 导出单例
if (typeof window.savedAnswersManager === 'undefined') {
    window.savedAnswersManager = new SavedAnswersManager();
}
