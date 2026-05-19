/**
 * Prompt Tab - 提示词设置
 * 
 * 功能：
 * - 提示词列表管理（添加、编辑、删除）
 * - 提示词按钮显示开关
 * - 提问模板提炼（炼化）功能
 */

class PromptTab extends BaseTab {
    constructor() {
        super();
        this.id = 'prompt';
        this.name = chrome.i18n.getMessage('hosegod');
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>`;
    }
    
    /**
     * 定义初始状态
     */
    getInitialState() {
        return {
            transient: {
                prompts: [],      // 提示词列表
                editingId: null,  // 正在编辑的提示词 ID
                templates: []     // 提炼模板列表
            },
            persistent: {}
        };
    }
    
    /**
     * 渲染设置内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'prompt-settings';

        // ==================== 分类标签栏 ====================
        const categoryBar = document.createElement('div');
        categoryBar.className = 'prompt-category-bar';
        categoryBar.innerHTML = `
            <button class="prompt-category-tab active" data-category="prompts">${chrome.i18n.getMessage('biwhckdj')}</button>
            <button class="prompt-category-tab" data-category="templates">我的模板</button>
        `;
        container.appendChild(categoryBar);

        // ==================== 滚动区域 ====================
        const scrollArea = document.createElement('div');
        scrollArea.className = 'prompt-settings-scroll';
        scrollArea.innerHTML = `
            <div class="prompt-list-section">
                <div class="prompt-list-header">
                    <div class="prompt-list-title" id="prompt-list-title">${chrome.i18n.getMessage('biwhckdj')}</div>
                    <div class="prompt-list-actions" id="prompt-list-actions">
                        <button class="prompt-add-btn" id="prompt-add-btn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"/>
                                <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            <span>${chrome.i18n.getMessage('addkbt')}</span>
                        </button>
                    </div>
                </div>
                <div class="prompt-list-container" id="prompt-list-container"></div>
            </div>
        `;
        container.appendChild(scrollArea);

        // ==================== 底部悬浮区域 ====================
        const bottomDivider = document.createElement('div');
        bottomDivider.className = 'prompt-settings-bottom-divider';
        container.appendChild(bottomDivider);

        const bottomSection = document.createElement('div');
        bottomSection.className = 'prompt-settings-bottom';
        bottomSection.innerHTML = `
            <div class="setting-item">
                <div class="setting-info">
                    <div class="setting-label">${chrome.i18n.getMessage('promptBtnDisplayLabel') || '显示提示词按钮'}</div>
                    <div class="setting-hint">${chrome.i18n.getMessage('hobsidbg')}</div>
                </div>
                <button class="starred-manage-btn">${chrome.i18n.getMessage('promptBtnSwitch') || '开关'}</button>
            </div>
        `;
        container.appendChild(bottomSection);

        this.addEventListener(bottomSection.querySelector('.starred-manage-btn'), 'click', () => {
            this._showPlatformManageModal();
        });

        return container;
    }
    
    /**
     * Tab 激活时加载状态
     */
    async mounted() {
        super.mounted();
        
        // 设置当前分类
        this._currentCategory = 'prompts';
        
        // 加载提示词列表
        await this.loadPrompts();
        await this.loadTemplates();
        
        // 渲染列表
        this.renderPromptList();
        
        // 绑定添加按钮事件
        this.bindAddButtonEvent();
        
        // 绑定分类标签切换事件
        this.bindCategoryTabEvents();

        // 监听 storage 变化，自动刷新提示词列表（支持外部写入，如文件夹炼化）
        this.addStorageListener((changes) => {
            if (changes.prompts) {
                console.log('[PromptTab] 检测到提示词列表变化，自动刷新');
                this.loadPrompts().then(() => this.renderPromptList());
            }
            if (changes.answerTemplates) {
                console.log('[PromptTab] 检测到模板列表变化，自动刷新');
                this.loadTemplates().then(() => {
                    if (this._currentCategory === 'templates') {
                        this.renderTemplateList();
                    }
                });
            }
        });
    }
    
    /**
     * 绑定分类标签事件
     */
    bindCategoryTabEvents() {
        const tabs = document.querySelectorAll('.prompt-category-tab');
        tabs.forEach(tab => {
            this.addEventListener(tab, 'click', () => {
                const category = tab.getAttribute('data-category');
                this._switchCategory(category);
            });
        });
    }
    
    /**
     * 切换分类
     */
    _switchCategory(category) {
        this._currentCategory = category;
        
        // 更新标签激活状态
        document.querySelectorAll('.prompt-category-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-category') === category);
        });
        
        // 更新标题和操作按钮可见性
        const titleEl = document.getElementById('prompt-list-title');
        const addBtn = document.getElementById('prompt-add-btn');
        
        if (category === 'prompts') {
            if (titleEl) titleEl.textContent = chrome.i18n.getMessage('biwhckdj');
            if (addBtn) addBtn.style.display = '';
        } else {
            if (titleEl) titleEl.textContent = '我的模板';
            if (addBtn) addBtn.style.display = 'none';
        }
        
        // 重新渲染列表
        if (category === 'prompts') {
            this.renderPromptList();
        } else {
            this.renderTemplateList();
        }
    }
    
    /**
     * 渲染我的模板列表
     */
    renderTemplateList() {
        const container = document.getElementById('prompt-list-container');
        if (!container) return;
        
        const templates = this.getState('templates') || [];
        
        if (templates.length === 0) {
            container.innerHTML = `
                <div class="prompt-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    <span>暂无模板</span>
                    <div style="font-size:11px;color:#aeaeb2;margin-top:4px;">保存AI回答后，可从回答中抽取模板</div>
                    <button class="prompt-add-btn" id="open-saved-answers-btn" style="margin-top:12px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span style="font-size:12px;">查看已保存的回答</span>
                    </button>
                </div>
            `;
            // 绑定打开已保存回答事件
            const btn = document.getElementById('open-saved-answers-btn');
            if (btn) {
                this.addEventListener(btn, 'click', () => {
                    if (window.SavedAnswersUI && typeof window.SavedAnswersUI.showAsOverlay === 'function') {
                        window.SavedAnswersUI.showAsOverlay();
                    }
                });
            }
            return;
        }
        
        container.innerHTML = templates.map((tpl, idx) => {
            const time = new Date(tpl.createdAt).toLocaleString('zh-CN');
            const varCount = (tpl.variables || []).length;
            
            return `
            <div class="prompt-item template-item" data-id="${tpl.id}">
                <div class="prompt-item-content">
                    <div class="prompt-item-header">
                        <div class="prompt-item-name">
                            <span class="prompt-item-name-text">${this._escapeHtml(tpl.name || '未命名模板')}</span>
                            ${varCount > 0 ? `<span class="template-var-badge">${varCount} 变量</span>` : ''}
                        </div>
                        <div class="prompt-item-actions">
                            <button class="prompt-item-btn template-edit-btn" data-id="${tpl.id}" title="编辑模板">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="prompt-item-btn template-delete-btn" data-id="${tpl.id}" title="删除模板">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="prompt-item-text">
                        <span class="prompt-item-text-content">${this._escapeHtml((tpl.content || '').substring(0, 150))}${(tpl.content || '').length > 150 ? '...' : ''}</span>
                    </div>
                    <div class="template-item-meta">
                        <span class="template-item-time">${time}</span>
                        ${tpl.sourceAnswerId ? '<span class="template-item-source" title="查看源回答">📎 来自回答</span>' : ''}
                    </div>
                </div>
            </div>`;
        }).join('');
        
        // 绑定事件
        this._bindTemplateItemEvents(templates);
    }
    
    /**
     * 绑定模板项事件
     */
    _bindTemplateItemEvents(templates) {
        // 编辑按钮
        document.querySelectorAll('.template-edit-btn').forEach(btn => {
            this.addEventListener(btn, 'click', () => {
                const id = btn.getAttribute('data-id');
                const editor = new TemplateEditor({ templateId: id, onSave: async () => {
                    await this.loadTemplates();
                    this.renderTemplateList();
                }});
                editor.show();
            });
            this.addEventListener(btn, 'mouseenter', () => {
                window.globalTooltipManager?.show('tpl-edit', 'button', btn, '编辑模板');
            });
            this.addEventListener(btn, 'mouseleave', () => {
                window.globalTooltipManager?.hide();
            });
        });
        
        // 删除按钮
        document.querySelectorAll('.template-delete-btn').forEach(btn => {
            this.addEventListener(btn, 'click', async () => {
                const id = btn.getAttribute('data-id');
                const confirmed = window.globalPopconfirmManager
                    ? await window.globalPopconfirmManager.show({
                        title: '确定删除该模板吗？',
                        confirmText: '删除',
                        confirmTextType: 'danger'
                    })
                    : confirm('确定删除该模板吗？');
                
                if (!confirmed) return;
                
                const manager = window.savedAnswersManager;
                if (manager) {
                    await manager.deleteTemplate(id);
                    await this.loadTemplates();
                    this.renderTemplateList();
                    if (window.globalToastManager) {
                        window.globalToastManager.show('success', '模板已删除');
                    }
                }
            });
            this.addEventListener(btn, 'mouseenter', () => {
                window.globalTooltipManager?.show('tpl-delete', 'button', btn, '删除模板');
            });
            this.addEventListener(btn, 'mouseleave', () => {
                window.globalTooltipManager?.hide();
            });
        });
    }
    
    /**
     * 加载模板列表
     */
    async loadTemplates() {
        try {
            const result = await chrome.storage.local.get('answerTemplates');
            this.setState('templates', result.answerTemplates || []);
        } catch (e) {
            console.error('[PromptTab] Failed to load templates:', e);
            this.setState('templates', []);
        }
    }
    
    unmounted() {
        super.unmounted();
    }

    /**
     * HTML 转义
     */
    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
