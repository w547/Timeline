/**
 * Template Editor - 模板编辑器
 *
 * 功能：
 * - 原始回答内容预览（只读）
 * - 模板编辑区，支持 {{}} 变量标记
 * - 语法高亮
 * - 语法校验
 * - 预览渲染效果
 * - 保存到提示词库
 * - 版本控制
 */

class TemplateEditor {
    constructor(options = {}) {
        this._overlay = null;
        this._modal = null;
        this._sourceAnswer = options.sourceAnswer || null;
        this._templateId = options.templateId || null;
        this._onSave = options.onSave || null;
        this._onClose = options.onClose || null;
        this._isDestroyed = false;
    }

    /**
     * 打开编辑器
     */
    async show() {
        await this._buildModal();
        document.body.appendChild(this._overlay);
        this._bindEvents();
        this._initEditor();

        requestAnimationFrame(() => {
            this._overlay.classList.add('visible');
        });
    }

    /**
     * 构建弹窗DOM
     */
    async _buildModal() {
        const manager = window.savedAnswersManager;
        let templateContent = '';
        let templateName = '';
        let templateId = this._templateId;

        // 如果是编辑已有模板，加载数据
        if (templateId && manager) {
            const templates = await manager.getTemplates();
            const template = templates.find(t => t.id === templateId);
            if (template) {
                templateContent = template.content || '';
                templateName = template.name || '';
            }
        }

        // 如果没有模板内容，从源回答生成
        if (!templateContent && this._sourceAnswer) {
            templateContent = this._sourceAnswer.content || '';
            templateName = '从回答抽取模板';
        }

        this._overlay = document.createElement('div');
        this._overlay.className = 'ait-template-editor-overlay';

        this._modal = document.createElement('div');
        this._modal.className = 'ait-template-editor-modal';

        const sourceContent = this._sourceAnswer
            ? this._escapeHtml(this._sourceAnswer.content?.substring(0, 500) || '')
            : '';

        this._modal.innerHTML = `
            <div class="ait-template-editor-header">
                <h3>模板编辑器</h3>
                <button class="ait-template-editor-close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="ait-template-editor-body">
                <!-- 模板名称 -->
                <div class="ait-template-editor-field">
                    <label>模板名称</label>
                    <input type="text" class="ait-template-editor-name" id="tpl-name"
                        value="${this._escapeHtml(templateName)}" maxlength="50" placeholder="输入模板名称">
                </div>

                ${this._sourceAnswer ? `
                <!-- 原始回答预览（只读） -->
                <div class="ait-template-editor-field">
                    <label>原始回答内容</label>
                    <div class="ait-template-editor-preview">
                        <div class="ait-template-editor-preview-content">${sourceContent || '无内容'}</div>
                        ${(this._sourceAnswer.content?.length || 0) > 500 ? '<div class="ait-template-editor-preview-more">... (共 ' + this._sourceAnswer.content.length + ' 字符)</div>' : ''}
                    </div>
                </div>
                ` : ''}

                <!-- 模板编辑区 -->
                <div class="ait-template-editor-field">
                    <label>
                        模板内容
                        <span class="ait-template-editor-hint">使用 <code>{{变量名}}</code> 标记可替换部分</span>
                    </label>
                    <div class="ait-template-editor-wrapper">
                        <div class="ait-template-editor-line-numbers" id="tpl-line-numbers">1</div>
                        <div class="ait-template-editor-textarea-wrapper">
                            <div class="ait-template-editor-syntax" id="tpl-syntax-layer"></div>
                            <textarea class="ait-template-editor-textarea" id="tpl-content"
                                placeholder="编辑模板内容，使用 {{变量名}} 标记变量部分..."
                                maxlength="10000"></textarea>
                        </div>
                    </div>
                    <div class="ait-template-editor-footer-bar">
                        <span class="ait-template-editor-char-count">
                            <span id="tpl-char-count">0</span>/10000
                        </span>
                        <div class="ait-template-editor-variable-btns">
                            <button class="ait-tpl-var-btn" data-var="topic">插入{{topic}}</button>
                            <button class="ait-tpl-var-btn" data-var="question">插入{{question}}</button>
                            <button class="ait-tpl-var-btn" data-var="context">插入{{context}}</button>
                            <button class="ait-tpl-var-btn ait-tpl-var-btn--custom" id="tpl-custom-var">自定义变量</button>
                        </div>
                        <span class="ait-template-editor-var-count" id="tpl-var-count">0 个变量</span>
                    </div>
                </div>

                <!-- 变量列表 -->
                <div class="ait-template-editor-field">
                    <label>变量预览与测试</label>
                    <div class="ait-template-editor-variables" id="tpl-variables-preview">
                        <div class="ait-template-editor-empty-vars">在模板中使用 <code>{{变量名}}</code> 后，变量将显示在这里</div>
                    </div>
                </div>
            </div>
            <div class="ait-template-editor-footer">
                <div class="ait-template-editor-footer-left">
                    ${this._templateId ? '<button class="ait-template-editor-btn ait-template-editor-btn--versions" id="tpl-show-versions">查看历史版本</button>' : ''}
                </div>
                <div class="ait-template-editor-footer-right">
                    <button class="ait-template-editor-btn ait-template-editor-btn--cancel">取消</button>
                    <button class="ait-template-editor-btn ait-template-editor-btn--preview" id="tpl-preview-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                        预览
                    </button>
                    <button class="ait-template-editor-btn ait-template-editor-btn--save" id="tpl-save-btn">
                        保存到提示词库
                    </button>
                </div>
            </div>
        `;

        this._overlay.appendChild(this._modal);

        // 设置初始内容
        const textarea = this._modal.querySelector('#tpl-content');
        textarea.value = templateContent;
        this._updateSyntaxHighlighting();
        this._updateLineNumbers();
        this._updateVariablesPreview();
        this._updateCharCount();
    }

    /**
     * 初始化编辑器
     */
    _initEditor() {
        const textarea = this._modal.querySelector('#tpl-content');
        textarea.focus();
    }

    /**
     * 绑定事件
     */
    _bindEvents() {
        const textarea = this._modal.querySelector('#tpl-content');
        const nameInput = this._modal.querySelector('#tpl-name');
        const saveBtn = this._modal.querySelector('#tpl-save-btn');
        const previewBtn = this._modal.querySelector('#tpl-preview-btn');
        const closeBtn = this._modal.querySelector('.ait-template-editor-close');
        const cancelBtn = this._modal.querySelector('.ait-template-editor-btn--cancel');
        const versionsBtn = this._modal.querySelector('#tpl-show-versions');
        const variablesPreview = this._modal.querySelector('#tpl-variables-preview');

        // 文本输入事件
        textarea.addEventListener('input', () => {
            this._updateSyntaxHighlighting();
            this._updateLineNumbers();
            this._updateVariablesPreview();
            this._updateCharCount();
        });

        textarea.addEventListener('keydown', (e) => {
            // Tab键插入两个空格
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 2;
                this._updateSyntaxHighlighting();
            }
        });

        textarea.addEventListener('scroll', () => {
            this._syncScroll();
        });

        // 变量按钮
        this._modal.querySelectorAll('.ait-tpl-var-btn[data-var]').forEach(btn => {
            btn.addEventListener('click', () => {
                const varName = btn.getAttribute('data-var');
                this._insertVariable(varName);
            });
        });

        // 自定义变量按钮
        const customVarBtn = this._modal.querySelector('#tpl-custom-var');
        if (customVarBtn) {
            customVarBtn.addEventListener('click', () => {
                const varName = prompt('输入变量名（不含{{}}）:', 'variable');
                if (varName && varName.trim()) {
                    this._insertVariable(varName.trim());
                }
            });
        }

        // 变量预览区 - 输入测试值
        variablesPreview.addEventListener('input', () => {
            // 动态更新会在 _updateVariablesPreview 中处理
        });

        // 预览按钮
        previewBtn.addEventListener('click', () => {
            this._showPreview();
        });

        // 保存按钮 - 防重复提交
        let saving = false;
        saveBtn.addEventListener('click', async () => {
            if (saving) return;
            saving = true;
            saveBtn.disabled = true;
            saveBtn.textContent = '保存中...';

            try {
                await this._handleSave();
            } catch (e) {
                console.error('[TemplateEditor] 保存失败:', e);
                if (window.globalToastManager) {
                    window.globalToastManager.show('error', '保存失败: ' + e.message);
                }
            } finally {
                saving = false;
                saveBtn.disabled = false;
                saveBtn.innerHTML = '保存到提示词库';
            }
        });

        // 版本历史按钮
        if (versionsBtn) {
            versionsBtn.addEventListener('click', () => this._showVersionHistory());
        }

        // 关闭
        const closeModal = (e) => {
            if (e && e.target !== this._overlay) return;
            // 检查是否有未保存内容
            if (textarea.value.trim() && !saving) {
                if (!confirm('有未保存的模板内容，确定关闭吗？')) return;
            }
            this.close();
        };
        closeBtn.addEventListener('click', () => closeModal({ target: this._overlay }));
        cancelBtn.addEventListener('click', () => closeModal({ target: this._overlay }));
        this._overlay.addEventListener('click', closeModal);

        // 键盘快捷键 Ctrl+S 保存
        this._boundKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveBtn.click();
            }
        };
        document.addEventListener('keydown', this._boundKeyDown);
    }

    /**
     * 插入变量
     */
    _insertVariable(varName) {
        const textarea = this._modal.querySelector('#tpl-content');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const varText = `{{${varName}}}`;
        textarea.value = textarea.value.substring(0, start) + varText + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + varText.length;
        textarea.focus();
        this._updateSyntaxHighlighting();
        this._updateVariablesPreview();
        this._updateCharCount();
    }

    /**
     * 更新语法高亮
     */
    _updateSyntaxHighlighting() {
        const textarea = this._modal.querySelector('#tpl-content');
        const syntaxLayer = this._modal.querySelector('#tpl-syntax-layer');
        if (!textarea || !syntaxLayer) return;

        let text = textarea.value || '';

        // 转义HTML
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // 高亮 {{变量名}}
        text = text.replace(/\{\{([^}]+)\}\}/g,
            '<span class="ait-tpl-var-highlight">{{<span class="ait-tpl-var-name">$1</span>}}</span>');

        syntaxLayer.innerHTML = text + '\n';
    }

    /**
     * 更新行号
     */
    _updateLineNumbers() {
        const textarea = this._modal.querySelector('#tpl-content');
        const lineNumbers = this._modal.querySelector('#tpl-line-numbers');
        if (!textarea || !lineNumbers) return;

        const lines = textarea.value.split('\n');
        const count = Math.max(1, lines.length);
        let html = '';
        for (let i = 1; i <= count; i++) {
            html += `<span>${i}</span>`;
        }
        lineNumbers.innerHTML = html;
    }

    /**
     * 同步滚动
     */
    _syncScroll() {
        const textarea = this._modal.querySelector('#tpl-content');
        const lineNumbers = this._modal.querySelector('#tpl-line-numbers');
        const syntaxLayer = this._modal.querySelector('#tpl-syntax-layer');
        if (lineNumbers) lineNumbers.scrollTop = textarea.scrollTop;
        if (syntaxLayer) syntaxLayer.scrollTop = textarea.scrollTop;
    }

    /**
     * 更新变量预览
     */
    _updateVariablesPreview() {
        const textarea = this._modal.querySelector('#tpl-content');
        const previewDiv = this._modal.querySelector('#tpl-variables-preview');
        const varCount = this._modal.querySelector('#tpl-var-count');
        if (!textarea || !previewDiv) return;

        const content = textarea.value || '';
        const varMatch = content.match(/\{\{([^}]+)\}\}/g) || [];
        const varNames = [...new Set(
            varMatch.map(m => m.replace(/^\{\{|\}\}$/g, ''))
        )];

        if (varCount) varCount.textContent = `${varNames.length} 个变量`;

        if (varNames.length === 0) {
            previewDiv.innerHTML = '<div class="ait-template-editor-empty-vars">在模板中使用 <code>{{变量名}}</code> 后，变量将显示在这里</div>';
            return;
        }

        previewDiv.innerHTML = varNames.map(name => `
            <div class="ait-tpl-var-input-row">
                <label class="ait-tpl-var-label">{{${this._escapeHtml(name)}}}</label>
                <input type="text" class="ait-tpl-var-input" data-var-name="${this._escapeHtml(name)}"
                    placeholder="输入测试值..." value="">
            </div>
        `).join('');
    }

    /**
     * 更新字符计数
     */
    _updateCharCount() {
        const textarea = this._modal.querySelector('#tpl-content');
        const charCount = this._modal.querySelector('#tpl-char-count');
        if (textarea && charCount) {
            charCount.textContent = textarea.value.length;
        }
    }

    /**
     * 渲染模板预览
     */
    _renderPreview(template, variables) {
        return template.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
            const key = varName.trim();
            return variables[key] !== undefined ? variables[key] : match;
        });
    }

    /**
     * 获取当前变量测试值
     */
    _getVariableValues() {
        const values = {};
        const inputs = this._modal.querySelectorAll('.ait-tpl-var-input');
        inputs.forEach(input => {
            const name = input.getAttribute('data-var-name');
            if (name) values[name] = input.value || `{{${name}}}`;
        });
        return values;
    }

    /**
     * 显示预览
     */
    _showPreview() {
        const textarea = this._modal.querySelector('#tpl-content');
        const template = textarea.value || '';
        const variables = this._getVariableValues();
        const previewText = this._renderPreview(template, variables);

        const overlay = document.createElement('div');
        overlay.className = 'ait-template-preview-overlay';

        const modal = document.createElement('div');
        modal.className = 'ait-template-preview-modal';

        modal.innerHTML = `
            <div class="ait-template-preview-header">
                <h3>模板预览</h3>
                <button class="ait-template-preview-close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="ait-template-preview-body">
                <div class="ait-template-preview-content">${this._escapeHtml(previewText).replace(/\n/g, '<br>')}</div>
            </div>
            <div class="ait-template-preview-footer">
                <button class="ait-template-editor-btn ait-template-editor-btn--cancel">关闭</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        modal.querySelector('.ait-template-preview-close').addEventListener('click', close);
        modal.querySelector('.ait-template-editor-btn--cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        requestAnimationFrame(() => overlay.classList.add('visible'));
    }

    /**
     * 语法校验
     */
    _validateTemplate(content) {
        const errors = [];

        // 检查未闭合的 {{ 或 }}
        const openCount = (content.match(/\{\{/g) || []).length;
        const closeCount = (content.match(/\}\}/g) || []).length;
        if (openCount !== closeCount) {
            errors.push('变量标记 {{ 和 }} 数量不匹配');
        }

        // 检查空变量 {{}}
        if (/\{\{\s*\}\}/.test(content)) {
            errors.push('存在空的变量标记 {{}}，请填写变量名');
        }

        // 检查变量名是否合法
        const varMatch = content.match(/\{\{([^}]+)\}\}/g) || [];
        for (const m of varMatch) {
            const name = m.replace(/^\{\{|\}\}$/g, '').trim();
            if (!/^[\w\u4e00-\u9fa5]+$/.test(name)) {
                errors.push(`变量名 "${name}" 包含非法字符，只支持字母、数字、下划线和中文`);
            }
        }

        return errors;
    }

    /**
     * 处理保存
     */
    async _handleSave() {
        const textarea = this._modal.querySelector('#tpl-content');
        const nameInput = this._modal.querySelector('#tpl-name');
        const content = textarea.value.trim();
        const name = nameInput.value.trim();

        if (!name) {
            if (window.globalToastManager) {
                window.globalToastManager.show('error', '请输入模板名称');
            }
            nameInput.focus();
            return;
        }

        if (!content) {
            if (window.globalToastManager) {
                window.globalToastManager.show('error', '模板内容不能为空');
            }
            textarea.focus();
            return;
        }

        // 语法校验
        const errors = this._validateTemplate(content);
        if (errors.length > 0) {
            if (window.globalToastManager) {
                window.globalToastManager.show('warning', errors[0]);
            }
            return;
        }

        const manager = window.savedAnswersManager;
        if (!manager) throw new Error('保存管理器未初始化');

        // 提取变量列表
        const varMatch = content.match(/\{\{([^}]+)\}\}/g) || [];
        const variables = [...new Set(varMatch.map(m => m.replace(/^\{\{|\}\}$/g, '').trim()))];

        let result;

        if (this._templateId) {
            // 更新已有模板
            result = await manager.updateTemplate(this._templateId, {
                name, content, variables
            }, '编辑更新');
        } else {
            // 创建新模板
            result = await manager.saveTemplate({
                name, content, variables,
                sourceAnswerId: this._sourceAnswer?.id || null
            });
        }

        // 同时保存到提示词库
        await this._saveToPrompts(name, content);

        if (window.globalToastManager) {
            window.globalToastManager.show('success', '模板已保存到提示词库');
        }

        if (this._onSave) {
            await this._onSave(result);
        }

        this.close();
    }

    /**
     * 保存到提示词库
     */
    async _saveToPrompts(name, content) {
        try {
            const result = await chrome.storage.local.get('prompts');
            const prompts = result.prompts || [];

            const newPrompt = {
                id: `tpl_prompt_${Date.now()}`,
                name: `[模板] ${name}`,
                content: content,
                platformId: '',
                createdAt: Date.now(),
                source: 'template',
                category: 'template'
            };

            prompts.push(newPrompt);
            await chrome.storage.local.set({ prompts });

            console.log('[TemplateEditor] 已保存到提示词库:', name);
        } catch (e) {
            console.error('[TemplateEditor] 保存到提示词库失败:', e);
        }
    }

    /**
     * 显示版本历史
     */
    async _showVersionHistory() {
        const manager = window.savedAnswersManager;
        if (!manager || !this._templateId) return;

        const versions = await manager.getTemplateVersions(this._templateId);

        const overlay = document.createElement('div');
        overlay.className = 'ait-template-preview-overlay';

        const modal = document.createElement('div');
        modal.className = 'ait-version-history-modal';

        modal.innerHTML = `
            <div class="ait-version-history-header">
                <h3>版本历史</h3>
                <button class="ait-version-history-close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="ait-version-history-body">
                ${versions.length === 0 ? '<div class="ait-version-history-empty">暂无版本记录</div>' : ''}
                ${versions.map((v, idx) => `
                    <div class="ait-version-item" data-version-id="${v.id}">
                        <div class="ait-version-item-header">
                            <span class="ait-version-item-time">${new Date(v.createdAt).toLocaleString('zh-CN')}</span>
                            <span class="ait-version-item-label">${idx === 0 ? '当前版本' : ''}</span>
                        </div>
                        <div class="ait-version-item-message">${this._escapeHtml(v.message || '')}</div>
                        <div class="ait-version-item-content">${this._escapeHtml((v.content || '').substring(0, 200))}${(v.content || '').length > 200 ? '...' : ''}</div>
                        ${idx > 0 ? `<button class="ait-version-restore-btn" data-version-id="${v.id}">恢复到该版本</button>` : ''}
                    </div>
                `).join('')}
            </div>
            <div class="ait-version-history-footer">
                <button class="ait-template-editor-btn ait-template-editor-btn--cancel">关闭</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        modal.querySelector('.ait-version-history-close').addEventListener('click', close);
        modal.querySelector('.ait-template-editor-btn--cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        // 恢复版本按钮
        modal.querySelectorAll('.ait-version-restore-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const versionId = btn.getAttribute('data-version-id');
                if (confirm('确定恢复到此版本吗？当前内容将被替换。')) {
                    try {
                        await manager.restoreTemplateVersion(this._templateId, versionId);
                        // 重新加载模板内容
                        const templates = await manager.getTemplates();
                        const template = templates.find(t => t.id === this._templateId);
                        if (template) {
                            const textarea = this._modal.querySelector('#tpl-content');
                            textarea.value = template.content || '';
                            this._updateSyntaxHighlighting();
                            this._updateLineNumbers();
                            this._updateVariablesPreview();
                            this._updateCharCount();
                        }
                        overlay.remove();
                        if (window.globalToastManager) {
                            window.globalToastManager.show('success', '已恢复到选定版本');
                        }
                    } catch (e) {
                        if (window.globalToastManager) {
                            window.globalToastManager.show('error', '恢复失败');
                        }
                    }
                }
            });
        });

        requestAnimationFrame(() => overlay.classList.add('visible'));
    }

    /**
     * 关闭编辑器
     */
    close() {
        if (this._boundKeyDown) {
            document.removeEventListener('keydown', this._boundKeyDown);
            this._boundKeyDown = null;
        }

        if (this._overlay) {
            this._overlay.classList.remove('visible');
            setTimeout(() => {
                if (this._overlay?.parentNode) {
                    this._overlay.parentNode.removeChild(this._overlay);
                }
            }, 200);
        }

        this._isDestroyed = true;

        if (this._onClose) {
            this._onClose();
        }
    }

    // ==================== 静态工厂方法 ====================

    /**
     * 从回答创建模板编辑器
     */
    static fromAnswer(answer) {
        return new TemplateEditor({ sourceAnswer: answer });
    }

    /**
     * 编辑已有模板
     */
    static fromTemplate(templateId) {
        return new TemplateEditor({ templateId });
    }

    // 工具方法
    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

window.TemplateEditor = TemplateEditor;
