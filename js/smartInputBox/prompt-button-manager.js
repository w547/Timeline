/**
 * Prompt Button Manager
 * 
 * 提示词按钮管理器
 * 在输入框左上角显示一个 fixed 定位的"提示词"按钮
 * 
 * 位置更新策略（事件驱动）：
 * - resize 时立即更新
 * - MutationObserver 检测输入框出现/消失
 * - 不使用持续轮询
 */

class PromptButtonManager {
    constructor(adapter) {
        if (!adapter) {
            throw new Error('PromptButtonManager requires an adapter');
        }
        
        this.adapter = adapter;
        this.buttonElement = null;
        this.inputElement = null;
        this.isEnabled = false;
        this.isDestroyed = false;
        this.platformSettings = {};
        this.storageListener = null;
        this._unsubscribeObserver = null;  // DOMObserverManager 取消订阅函数
        
        // 提示词列表
        this.prompts = [];
        
        // 事件处理器引用
        this._onResize = null;
        this._rafPending = false;  // RAF 节流标志
        
        // 配置
        this.config = {
            gap: 8  // 按钮与输入框的间距
        };
    }
    
    /**
     * 初始化
     */
    async init() {
        // 1. 加载平台设置
        await this._loadPlatformSettings();
        
        // 2. 加载提示词列表
        await this._loadPrompts();
        
        // 3. 监听 Storage 变化
        this._attachStorageListener();
        
        // 4. 创建按钮
        this._createButton();
        
        // 5. 检查是否启用
        if (this._isPlatformEnabled()) {
            this._enable();
        }
    }
    
    /**
     * 加载提示词列表
     */
    async _loadPrompts() {
        try {
            const result = await chrome.storage.local.get('prompts');
            this.prompts = result.prompts || [];
        } catch (e) {
            console.error('[PromptButton] Failed to load prompts:', e);
            this.prompts = [];
        }
    }
    
    /**
     * 启用功能
     */
    _enable() {
        if (this.isEnabled) return;
        this.isEnabled = true;
        
        // 绑定事件
        this._bindEvents();
        
        // 启动输入框检测
        this._startInputDetection();
        
        // 尝试立即查找输入框
        this._findInputAndShow();
    }
    
    /**
     * 禁用功能
     */
    _disable() {
        if (!this.isEnabled) return;
        this.isEnabled = false;
        
        // 解绑事件
        this._unbindEvents();
        
        // 停止检测
        this._stopInputDetection();
        
        // 关闭浮窗
        this._hidePromptModal();
        
        // 隐藏按钮
        this._hideButton();
        
        // 清空输入框引用
        this.inputElement = null;
    }
    
    /**
     * 加载平台设置
     */
    async _loadPlatformSettings() {
        try {
            const result = await chrome.storage.local.get('promptButtonPlatformSettings');
            this.platformSettings = result.promptButtonPlatformSettings || {};
        } catch (e) {
            this.platformSettings = {};
        }
    }
    
    /**
     * 检查当前平台是否启用
     */
    _isPlatformEnabled() {
        try {
            const platform = getCurrentPlatform();
            if (!platform) return false;
            if (platform.features?.smartInput !== true) return false;
            return this.platformSettings[platform.id] !== false;
        } catch (e) {
            return true;
        }
    }
    
    /**
     * 监听 Storage 变化
     */
    _attachStorageListener() {
        this.storageListener = (changes, areaName) => {
            // ✅ 已销毁则忽略
            if (this.isDestroyed) return;
            
            if (areaName === 'local') {
                // 监听平台设置变化
                if (changes.promptButtonPlatformSettings) {
                this.platformSettings = changes.promptButtonPlatformSettings.newValue || {};
                const shouldEnable = this._isPlatformEnabled();
                
                if (shouldEnable && !this.isEnabled) {
                    this._enable();
                } else if (!shouldEnable && this.isEnabled) {
                    this._disable();
                    }
                }
                
                // 监听提示词列表变化
                if (changes.prompts) {
                    this.prompts = changes.prompts.newValue || [];
                }
            }
        };
        chrome.storage.onChanged.addListener(this.storageListener);
    }
    
    /**
     * 创建按钮元素
     */
    _createButton() {
        if (this.buttonElement) return;
        
        const button = document.createElement('div');
        button.className = 'smart-input-prompt-btn';
        button.innerHTML = `
            <svg class="smart-input-prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
        `;

        button.style.display = 'none';

        // ✅ 使用事件委托（解决长时间停留后事件失效问题）
        window.eventDelegateManager.on('click', '.smart-input-prompt-btn', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._handleClick();
        });

        document.body.appendChild(button);
        this.buttonElement = button;

        const platform = typeof getCurrentPlatform === 'function' ? getCurrentPlatform() : null;
        if (window.inputBoxAnimationManager && platform?.features?.inputAnimation === true) {
            window.inputBoxAnimationManager.init();
        }
    }
    
    /**
     * 绑定事件（resize）
     */
    _bindEvents() {
        // 使用 RAF 节流，每帧最多更新一次
        const scheduleUpdate = () => {
            if (this._rafPending) return;
            this._rafPending = true;
            
            requestAnimationFrame(() => {
                this._rafPending = false;
                this._updatePosition();
            });
        };
        
        this._onResize = scheduleUpdate;
        
        window.addEventListener('resize', this._onResize);
    }
    
    /**
     * 解绑事件
     */
    _unbindEvents() {
        this._rafPending = false;
        
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            this._onResize = null;
        }
    }
    
    /**
     * 启动输入框检测
     * 使用 DOMObserverManager 统一管理
     */
    _startInputDetection() {
        if (this._unsubscribeObserver) return;
        
        if (window.DOMObserverManager) {
            this._unsubscribeObserver = window.DOMObserverManager.getInstance().subscribeBody('prompt-button', {
                callback: () => {
                    // 再次检查状态（防止禁用后仍执行）
                    if (!this.isEnabled || this.isDestroyed) return;
                    
                    if (!this.inputElement) {
                        // 还没找到输入框，尝试查找
                        this._findInputAndShow();
                    } else if (!document.body.contains(this.inputElement)) {
                        // 输入框被移除，重新查找
                        this.inputElement = null;
                        this._hideButton();
                        this._findInputAndShow();
                    } else {
                        // 输入框存在，更新位置（处理位置变化的情况）
                        this._updatePosition();
                    }
                },
                filter: { hasAddedNodes: true, hasAttributeChanges: true },
                debounce: 100
            });
        }
    }
    
    /**
     * 停止输入框检测
     */
    _stopInputDetection() {
        if (this._unsubscribeObserver) {
            this._unsubscribeObserver();
            this._unsubscribeObserver = null;
        }
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        if (this._transitionHandler) {
            document.body.removeEventListener('transitionend', this._transitionHandler);
            this._transitionHandler = null;
        }
    }
    
    /**
     * 查找输入框并显示按钮
     */
    _findInputAndShow() {
        if (!this.isEnabled || this.isDestroyed) return;
        
        try {
            const selector = this.adapter.getInputSelector();
            const input = document.querySelector(selector);
            
            if (input) {
                this.inputElement = input;
                this._updatePosition();
                this._observeInputResize();
            }
        } catch (e) {
            // 忽略
        }
    }
    
    _observeInputResize() {
        if (this._resizeObserver) this._resizeObserver.disconnect();
        if (!this.inputElement) return;
        const ref = this.adapter.getPositionReferenceElement?.(this.inputElement) || this.inputElement;
        this._resizeObserver = new ResizeObserver(() => {
            if (this.isEnabled && !this.isDestroyed) this._updatePosition();
        });
        this._resizeObserver.observe(ref);

        if (!this._transitionHandler) {
            this._transitionHandler = () => {
                if (this.isEnabled && !this.isDestroyed) this._updatePosition();
            };
            document.body.addEventListener('transitionend', this._transitionHandler);
        }
    }

    /**
     * 更新按钮位置
     */
    _updatePosition() {
        if (!this.buttonElement || !this.inputElement || this.isDestroyed || !this.isEnabled) {
            return;
        }
        
        try {
            // 获取定位参考元素（适配器可自定义，默认使用输入框）
            const referenceElement = this.adapter.getPositionReferenceElement?.(this.inputElement) || this.inputElement;
            const rect = referenceElement.getBoundingClientRect();
            
            // 参考元素不可见
            if (rect.width === 0 || rect.height === 0) {
                this._hideButton();
                return;
            }
            
            // 获取按钮尺寸
            this.buttonElement.style.visibility = 'hidden';
            this.buttonElement.style.display = 'flex';
            const buttonRect = this.buttonElement.getBoundingClientRect();
            
            // 获取平台偏移量
            const offset = this.adapter.getPromptButtonOffset?.(this.inputElement) || { top: 0, left: 0 };
            
            // 计算位置：相对于参考元素左上角
            const top = rect.top + offset.top;
            const left = rect.left - buttonRect.width - this.config.gap + offset.left;
            
            // 边界检查
            const safeTop = Math.max(8, Math.min(top, window.innerHeight - buttonRect.height - 8));
            const safeLeft = Math.max(8, left);
            
            // 设置位置并显示
            this.buttonElement.style.top = `${safeTop}px`;
            this.buttonElement.style.left = `${safeLeft}px`;
            this.buttonElement.style.visibility = 'visible';

            if (window.inputBoxAnimationManager) {
                const ref = this.adapter.getPositionReferenceElement?.(this.inputElement) || this.inputElement;
                window.inputBoxAnimationManager.updatePosition(ref.getBoundingClientRect());
            }
        } catch (e) {
            this._hideButton();
        }
    }
    
    /**
     * 隐藏按钮
     */
    _hideButton() {
        if (this.buttonElement) {
            this.buttonElement.style.display = 'none';
        }
        if (window.inputBoxAnimationManager) {
            window.inputBoxAnimationManager.hideActive();
        }
    }
    
    /**
     * 处理点击
     */
    _handleClick() {
        console.log('[PromptButton] Button clicked');
        
        if (!this.buttonElement) {
            return;
        }
        
        if (this._promptModal) {
            this._hidePromptModal();
            return;
        }
        
        this._showPromptModal();
    }

    /**
     * 显示提示词浮窗（包含完整提示词管理功能）
     */
    async _showPromptModal() {
        if (window.globalDropdownManager) {
            window.globalDropdownManager.hide(true);
        }

        this._promptOverlay = document.createElement('div');
        this._promptOverlay.className = 'prompt-modal-overlay';
        this._promptOverlay.addEventListener('click', () => this._hidePromptModal());
        document.body.appendChild(this._promptOverlay);

        const modal = document.createElement('div');
        modal.className = 'prompt-modal';

        const header = document.createElement('div');
        header.className = 'prompt-modal-header';
        header.innerHTML = `
            <div class="prompt-modal-header-left">
                <svg class="prompt-modal-header-icon" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                <span class="prompt-modal-title">提示词</span>
            </div>
        `;

        this._currentCategory = 'prompts';
        this._templates = [];

        const body = document.createElement('div');
        body.className = 'prompt-modal-body';

        // 先创建占位结构并显示浮窗，再异步加载数据
        this._renderFullPromptBody(body);

        modal.appendChild(header);
        modal.appendChild(body);
        document.body.appendChild(modal);
        this._promptModal = modal;

        requestAnimationFrame(() => {
            modal.classList.add('visible');
            this._positionPromptModal();
        });

        this._boundResize = () => this._positionPromptModal();
        window.addEventListener('resize', this._boundResize);

        document.addEventListener('keydown', this._boundKeyDown = (e) => {
            if (e.key === 'Escape') this._hidePromptModal();
        });

        // 确保数据加载完毕后再渲染提示词列表
        await this._loadPrompts();
        this._renderPromptListInModal();

        this._loadTemplatesForModal().then(() => {
            if (this._currentCategory === 'templates') {
                this._renderTemplateListInModal();
            }
        });
    }

    _renderFullPromptBody(body) {
        body.innerHTML = '';

        const categoryBar = document.createElement('div');
        categoryBar.className = 'prompt-modal-category-bar';
        categoryBar.innerHTML = `
            <button class="prompt-modal-category-tab active" data-category="prompts">提示词</button>
            <button class="prompt-modal-category-tab" data-category="templates">我的模板</button>
        `;
        categoryBar.querySelectorAll('.prompt-modal-category-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const cat = tab.getAttribute('data-category');
                this._switchCategoryInModal(cat);
            });
        });
        body.appendChild(categoryBar);

        const scrollArea = document.createElement('div');
        scrollArea.className = 'prompt-modal-scroll';
        scrollArea.innerHTML = `
            <div class="prompt-modal-list-section">
                <div class="prompt-modal-list-header">
                    <div class="prompt-modal-list-title" id="pm-list-title">提示词</div>
                    <div class="prompt-modal-list-actions" id="pm-list-actions">
                        <button class="prompt-modal-add-btn" id="pm-add-btn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <line x1="12" y1="5" x2="12" y2="19"/>
                                <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            <span>添加</span>
                        </button>
                    </div>
                </div>
                <div class="prompt-modal-list-container" id="pm-list-container"></div>
            </div>
        `;
        body.appendChild(scrollArea);

        scrollArea.querySelector('#pm-add-btn').addEventListener('click', () => {
            this._showPromptEditInModal(null);
        });

        this._renderPromptListInModal();
    }

    _switchCategoryInModal(category) {
        this._currentCategory = category;
        const tabs = this._promptModal.querySelectorAll('.prompt-modal-category-tab');
        tabs.forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-category') === category);
        });

        const titleEl = this._promptModal.querySelector('#pm-list-title');
        const addBtn = this._promptModal.querySelector('#pm-add-btn');

        if (category === 'prompts') {
            if (titleEl) titleEl.textContent = '提示词';
            if (addBtn) addBtn.style.display = '';
            this._renderPromptListInModal();
        } else {
            if (titleEl) titleEl.textContent = '我的模板';
            if (addBtn) addBtn.style.display = 'none';
            this._renderTemplateListInModal();
        }
    }

    _esc(t) {
        if (!t) return '';
        const d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

    _renderPromptListInModal() {
        const container = document.getElementById('pm-list-container');
        if (!container) return;

        if (this.prompts.length === 0) {
            container.innerHTML = `
                <div class="prompt-modal-empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    <span>暂无提示词</span>
                </div>
            `;
            return;
        }

        const sorted = [...this.prompts].sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return 0;
        });

        const pinIcon = '<span class="pm-pin-badge"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><line x1="5" y1="3" x2="19" y2="3"/><line x1="12" y1="7" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/></svg></span>';

        container.innerHTML = sorted.map(p => {
            const platform = (typeof SITE_INFO !== 'undefined' && p.platformId)
                ? SITE_INFO.find(s => s.id === p.platformId) : null;
            const logo = platform
                ? `<img class="pm-platform-logo" src="${chrome.runtime.getURL(platform.logoPath)}" alt="${this._esc(platform.name)}">`
                : '';
            return `
            <div class="pm-item ${p.pinned ? 'pinned' : ''}" data-id="${p.id}">
                <div class="pm-item-content" data-action="click">
                    <div class="pm-item-header">
                        <div class="pm-item-name">${p.pinned ? pinIcon : ''}${logo}<span class="pm-item-name-text">${this._esc(p.name || '')}</span></div>
                        <div class="pm-item-actions">
                            <button class="pm-item-btn pm-pin-btn ${p.pinned ? 'active' : ''}" data-id="${p.id}" title="置顶">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                                    <line x1="5" y1="3" x2="19" y2="3"/><line x1="12" y1="7" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/>
                                </svg>
                            </button>
                            <button class="pm-item-btn pm-edit-btn" data-id="${p.id}" title="编辑">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="pm-item-btn pm-delete-btn" data-id="${p.id}" title="删除">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                            <button class="pm-item-btn pm-move-up-btn" data-id="${p.id}" title="上移">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                    <polyline points="18 15 12 9 6 15"/>
                                </svg>
                            </button>
                            <button class="pm-item-btn pm-move-down-btn" data-id="${p.id}" title="下移">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                    <polyline points="6 9 12 15 18 9"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="pm-item-text">${this._esc((p.content || '').substring(0, 200))}${(p.content || '').length > 200 ? '...' : ''}</div>
                </div>
            </div>`;
        }).join('');

        this._bindPromptItemEventsInModal();
    }

    _bindPromptItemEventsInModal() {
        const container = document.getElementById('pm-list-container');
        if (!container) return;

        // 点击内容区域 -> 插入提示词
        container.querySelectorAll('.pm-item-content[data-action="click"]').forEach(el => {
            el.addEventListener('click', (e) => {
                const item = el.closest('.pm-item');
                const id = item?.getAttribute('data-id');
                const prompt = this.prompts.find(p => p.id === id);
                if (prompt) {
                    this._hidePromptModal();
                    this._insertPrompt(prompt);
                }
            });
        });

        // 置顶
        container.querySelectorAll('.pm-pin-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._togglePromptPin(btn.getAttribute('data-id'));
            });
        });

        // 编辑
        container.querySelectorAll('.pm-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                const prompt = this.prompts.find(p => p.id === id);
                if (prompt) this._showPromptEditInModal(prompt);
            });
        });

        // 删除
        container.querySelectorAll('.pm-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this._deletePromptInModal(btn.getAttribute('data-id'));
            });
        });

        // 上移
        container.querySelectorAll('.pm-move-up-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._movePromptInModal(btn.getAttribute('data-id'), 'up');
            });
        });

        // 下移
        container.querySelectorAll('.pm-move-down-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._movePromptInModal(btn.getAttribute('data-id'), 'down');
            });
        });
    }

    _renderTemplateListInModal() {
        const container = document.getElementById('pm-list-container');
        if (!container) return;

        if (!this._templates || this._templates.length === 0) {
            container.innerHTML = `
                <div class="prompt-modal-empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    <span>暂无模板</span>
                    <div style="font-size:11px;color:#9ca3af;margin-top:4px;">保存AI回答后，可从回答中抽取模板</div>
                </div>
            `;
            return;
        }

        container.innerHTML = this._templates.map(tpl => {
            const time = new Date(tpl.createdAt).toLocaleString('zh-CN');
            return `
            <div class="pm-item" data-id="${tpl.id}">
                <div class="pm-item-content">
                    <div class="pm-item-header">
                        <div class="pm-item-name">
                            <span class="pm-item-name-text">${this._esc(tpl.name || '未命名模板')}</span>
                        </div>
                        <div class="pm-item-actions">
                            <button class="pm-item-btn pm-template-edit-btn" data-id="${tpl.id}" title="编辑">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="pm-item-btn pm-template-delete-btn" data-id="${tpl.id}" title="删除">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="pm-item-text">${this._esc((tpl.content || '').substring(0, 150))}${(tpl.content || '').length > 150 ? '...' : ''}</div>
                    <div class="pm-item-meta"><span>${time}</span></div>
                </div>
            </div>`;
        }).join('');

        container.querySelectorAll('.pm-template-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                if (window.TemplateEditor) {
                    new window.TemplateEditor({
                        templateId: id,
                        onSave: async () => {
                            await this._loadTemplatesForModal();
                            this._renderTemplateListInModal();
                        }
                    }).show();
                }
            });
        });

        container.querySelectorAll('.pm-template-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
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
                    await this._loadTemplatesForModal();
                    this._renderTemplateListInModal();
                    if (window.globalToastManager) window.globalToastManager.show('success', '模板已删除');
                }
            });
        });
    }

    async _loadTemplatesForModal() {
        try {
            const result = await chrome.storage.local.get('answerTemplates');
            this._templates = result.answerTemplates || [];
        } catch (e) {
            this._templates = [];
        }
    }

    async _togglePromptPin(id) {
        const idx = this.prompts.findIndex(p => p.id === id);
        if (idx === -1) return;
        this.prompts[idx].pinned = !this.prompts[idx].pinned;
        await chrome.storage.local.set({ prompts: this.prompts });
        this._renderPromptListInModal();
    }

    async _movePromptInModal(id, direction) {
        const idx = this.prompts.findIndex(p => p.id === id);
        if (idx === -1) return;
        const target = direction === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= this.prompts.length) return;
        [this.prompts[idx], this.prompts[target]] = [this.prompts[target], this.prompts[idx]];
        await chrome.storage.local.set({ prompts: this.prompts });
        this._renderPromptListInModal();
    }

    async _deletePromptInModal(id) {
        const confirmed = window.globalPopconfirmManager
            ? await window.globalPopconfirmManager.show({
                title: '确定删除该提示词吗？',
                confirmText: '删除',
                confirmTextType: 'danger'
            })
            : confirm('确定删除该提示词吗？');
        if (!confirmed) return;
        this.prompts = this.prompts.filter(p => p.id !== id);
        await chrome.storage.local.set({ prompts: this.prompts });
        this._renderPromptListInModal();
        if (window.globalToastManager) window.globalToastManager.show('success', '已删除');
    }

    _showPromptEditInModal(prompt) {
        const isEdit = !!prompt;
        const overlay = document.createElement('div');
        overlay.className = 'pm-edit-overlay';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this._closePromptEditInModal(overlay);
        });

        const modal = document.createElement('div');
        modal.className = 'pm-edit-modal';
        const name = this._esc(prompt?.name || '');
        const content = this._esc(prompt?.content || '');

        modal.innerHTML = `
            <div class="pm-edit-header">
                <span>${isEdit ? '编辑提示词' : '添加提示词'}</span>
                <button class="pm-edit-close">&times;</button>
            </div>
            <div class="pm-edit-body">
                <div class="pm-edit-field">
                    <label>名称 <span class="pm-required">*</span></label>
                    <input type="text" class="pm-edit-input" id="pm-edit-name" placeholder="输入提示词名称" maxlength="16" value="${name}">
                </div>
                <div class="pm-edit-field">
                    <label>内容 <span class="pm-required">*</span></label>
                    <textarea class="pm-edit-textarea" id="pm-edit-content" placeholder="输入提示词内容" rows="8" maxlength="10000">${content}</textarea>
                    <div class="pm-edit-counter"><span id="pm-edit-count">${prompt?.content?.length || 0}</span>/10000</div>
                </div>
            </div>
            <div class="pm-edit-footer">
                <button class="pm-edit-btn-cancel">取消</button>
                <button class="pm-edit-btn-save">保存</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const nameInput = modal.querySelector('#pm-edit-name');
        const contentInput = modal.querySelector('#pm-edit-content');
        const charCount = modal.querySelector('#pm-edit-count');
        const closeBtn = modal.querySelector('.pm-edit-close');
        const cancelBtn = modal.querySelector('.pm-edit-btn-cancel');
        const saveBtn = modal.querySelector('.pm-edit-btn-save');

        contentInput.addEventListener('input', () => {
            charCount.textContent = contentInput.value.length;
        });

        const close = () => this._closePromptEditInModal(overlay);
        closeBtn.addEventListener('click', close);
        cancelBtn.addEventListener('click', close);

        saveBtn.addEventListener('click', async () => {
            const n = nameInput.value.trim();
            const c = contentInput.value.trim();
            if (!n || !c) {
                if (window.globalToastManager) window.globalToastManager.show('error', '名称和内容不能为空');
                return;
            }
            if (isEdit) {
                const idx = this.prompts.findIndex(p => p.id === prompt.id);
                if (idx !== -1) {
                    this.prompts[idx].name = n;
                    this.prompts[idx].content = c;
                    this.prompts[idx].updatedAt = Date.now();
                }
            } else {
                this.prompts.push({
                    id: Date.now().toString(),
                    name: n,
                    content: c,
                    platformId: '',
                    createdAt: Date.now()
                });
            }
            await chrome.storage.local.set({ prompts: this.prompts });
            this._renderPromptListInModal();
            if (window.globalToastManager) window.globalToastManager.show('success', isEdit ? '已更新' : '已添加');
            close();
        });

        requestAnimationFrame(() => overlay.classList.add('visible'));
    }

    _closePromptEditInModal(overlay) {
        overlay.classList.remove('visible');
        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 200);
    }

    _filterPromptModal(query) {
        if (!this._promptModal) return;
        const container = document.getElementById('pm-list-container');
        if (!container) return;
        const items = container.querySelectorAll('.pm-item');
        let visible = 0;
        items.forEach(item => {
            const text = (item.textContent || '').toLowerCase();
            const ok = !query || text.includes(query);
            item.style.display = ok ? '' : 'none';
            if (ok) visible++;
        });
    }

    /**
     * 计算浮窗位置（与文件夹浮窗一致的定位方式）
     */
    _positionPromptModal() {
        if (!this._promptModal || !this.buttonElement) return;
        const btnRect = this.buttonElement.getBoundingClientRect();
        if (btnRect.width <= 0 || btnRect.height <= 0) return;

        const modal = this._promptModal;
        const modalWidth = 540;
        const maxModalWidth = Math.min(modalWidth, window.innerWidth - 32);
        const modalHeight = 560;
        const maxModalHeight = Math.min(modalHeight, window.innerHeight - 60);
        const gap = 8;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        modal.style.width = maxModalWidth + 'px';
        modal.style.maxHeight = maxModalHeight + 'px';

        let left = btnRect.right - modalWidth;
        if (left < 8) left = 8;
        if (left + modalWidth > vw - 8) left = vw - modalWidth - 8;

        const spaceBelow = vh - btnRect.bottom - gap;
        const spaceAbove = btnRect.top - gap;
        let top;
        if (spaceBelow >= maxModalHeight) {
            top = btnRect.bottom + gap;
        } else if (spaceAbove >= maxModalHeight) {
            top = btnRect.top - gap - maxModalHeight;
        } else {
            top = Math.max(8, (vh - maxModalHeight) / 2);
        }
        top = Math.max(8, Math.min(top, vh - maxModalHeight - 8));

        modal.style.left = left + 'px';
        modal.style.top = top + 'px';
        modal.style.transform = 'none';
    }

    _hidePromptModal() {
        if (this._boundKeyDown) {
            document.removeEventListener('keydown', this._boundKeyDown);
            this._boundKeyDown = null;
        }
        if (this._boundResize) {
            window.removeEventListener('resize', this._boundResize);
            this._boundResize = null;
        }
        if (window.globalTooltipManager) {
            window.globalTooltipManager.hide();
        }
        if (this._promptModal) {
            this._promptModal.classList.remove('visible');
            setTimeout(() => {
                if (this._promptModal?.parentNode) {
                    this._promptModal.parentNode.removeChild(this._promptModal);
                }
                this._promptModal = null;
            }, 200);
        }
        if (this._promptOverlay?.parentNode) {
            this._promptOverlay.parentNode.removeChild(this._promptOverlay);
        }
        this._promptOverlay = null;
    }

    /**
     * 隐藏提示词下拉菜单（保留旧接口，供 MirrorSite 等调用方使用）
     */
    _showPromptDropdown() {
        if (window.globalDropdownManager) {
            window.globalDropdownManager.hide(true);
        }
        
        this._promptOverlay = document.createElement('div');
        this._promptOverlay.className = 'prompt-dropdown-overlay';
        this._promptOverlay.addEventListener('click', () => this._hidePromptDropdown());
        document.body.appendChild(this._promptOverlay);
        
        const currentPlatform = typeof getCurrentPlatform === 'function' ? getCurrentPlatform() : null;
        const currentPlatformId = currentPlatform?.id || '';
        const filteredPrompts = this.prompts.filter(p => !p.platformId || p.platformId === currentPlatformId);
        
        this._promptDropdown = createPromptDropdownUI({
            prompts: filteredPrompts,
            onItemClick: (prompt) => {
                this._hidePromptDropdown();
                this._insertPrompt(prompt);
            },
            onManageClick: () => {
                this._hidePromptDropdown();
                if (window.panelModal) window.panelModal.show('prompt');
            }
        });
        
        document.body.appendChild(this._promptDropdown);
        this._positionPromptDropdown();
        
        requestAnimationFrame(() => {
            this._promptDropdown.classList.add('visible');
        });
        
        this._boundCloseOnClickOutside = (e) => {
            if (!this._promptDropdown?.contains(e.target) && e.target !== this.buttonElement) {
                this._hidePromptDropdown();
            }
        };
        setTimeout(() => {
            document.addEventListener('click', this._boundCloseOnClickOutside, true);
        }, 0);
    }
    
    /**
     * 计算下拉菜单位置
     */
    _positionPromptDropdown() {
        if (!this._promptDropdown || !this.buttonElement) return;
        
        const buttonRect = this.buttonElement.getBoundingClientRect();
        const dropdownWidth = 320;
        const dropdownHeight = 400;
        const topPadding = 20; // 顶部安全距离
        const gap = 8; // 弹窗与按钮的间距
        
        // 设置固定宽高
        this._promptDropdown.style.width = `${dropdownWidth}px`;
        this._promptDropdown.style.height = `${dropdownHeight}px`;
        this._promptDropdown.style.visibility = 'hidden';
        this._promptDropdown.style.display = 'flex';
        
        // 水平位置：与按钮左对齐
        let left = buttonRect.left;
        if (left + dropdownWidth > window.innerWidth - 8) {
            left = window.innerWidth - dropdownWidth - 8;
        }
        left = Math.max(8, left);
        
        // 垂直位置：往上展开，底部挨着按钮顶部
        // 如果超过顶部安全距离，就把弹窗往下移
        const top = Math.max(topPadding, buttonRect.top - gap - dropdownHeight);
        
        this._promptDropdown.style.left = `${left}px`;
        this._promptDropdown.style.top = `${top}px`;
        this._promptDropdown.style.visibility = 'visible';
    }
    
    /**
     * 隐藏提示词下拉菜单
     */
    _hidePromptDropdown() {
        if (this._boundCloseOnClickOutside) {
            document.removeEventListener('click', this._boundCloseOnClickOutside, true);
            this._boundCloseOnClickOutside = null;
        }
        
        // 关闭可能还在显示的 tooltip
        if (window.globalTooltipManager) {
            window.globalTooltipManager.hide();
        }
        
        if (this._promptDropdown) {
            this._promptDropdown.classList.remove('visible');
            setTimeout(() => {
                if (this._promptDropdown?.parentNode) {
                    this._promptDropdown.parentNode.removeChild(this._promptDropdown);
                }
                this._promptDropdown = null;
            }, 150);
        }
        
        if (this._promptOverlay?.parentNode) {
            this._promptOverlay.parentNode.removeChild(this._promptOverlay);
        }
        this._promptOverlay = null;
    }
    
    /**
     * 插入提示词到输入框
     */
    _insertPrompt(prompt) {
        if (!this.inputElement || !prompt.content) {
            return;
        }
        
        try {
            // 获取适配器的插入方法
            if (this.adapter.insertText) {
                this.adapter.insertText(this.inputElement, prompt.content);
            } else {
                // 默认插入逻辑
                this._defaultInsertText(prompt.content);
            }
        } catch (e) {
            console.error('[PromptButton] Failed to insert prompt:', e);
        }
    }
    
    /**
     * 默认的文本插入逻辑（追加到末尾）
     */
    _defaultInsertText(text) {
        if (!this.inputElement) return;
        
        // 聚焦输入框
        this.inputElement.focus();
        
        if (this.inputElement.isContentEditable) {
            // contenteditable 处理：使用 insertText 追加，避免替换整个内容
            
            // 移动光标到末尾
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(this.inputElement);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
            
            // 配置：空行数（1个空行 = 2个换行符）
            const separatorBlankLines = 1;  // 新旧内容之间的空行数
            const trailingBlankLines = 1;   // 追加内容末尾的空行数
            
            const existingText = this.inputElement.innerText || '';
            const hasContent = existingText.trim().length > 0;
            
            let separator = '';
            if (hasContent) {
                // 检查末尾已有的空行数（换行符数 - 1 = 空行数）
                const trailingMatch = existingText.match(/\n+$/);
                const existingNewlines = trailingMatch ? trailingMatch[0].length : 0;
                const existingBlankLines = Math.max(0, existingNewlines - 1);
                
                // 计算需要补充多少空行才能达到目标
                const needBlankLines = Math.max(0, separatorBlankLines - existingBlankLines);
                // 空行数 + 1 = 换行符数（至少需要 1 个换行符来换行）
                separator = existingNewlines === 0 
                    ? '\n'.repeat(separatorBlankLines + 1)  // 没有换行，加完整的
                    : '\n'.repeat(needBlankLines);          // 有换行，补差值
            }
            
            const trailing = '\n'.repeat(trailingBlankLines + 1);
            const appendText = separator + text + trailing;
            
            // 使用 insertText 命令追加（execCommand 虽已弃用，但无替代方案能避免框架重格式化问题）
            document.execCommand('insertText', false, appendText);
            
            // 延迟设置焦点、光标和滚动
            setTimeout(() => {
                this.inputElement.focus();
                
                // 设置光标到末尾（contenteditable 需要 selection 才能显示光标）
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(this.inputElement);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
                
                this.inputElement.scrollTop = this.inputElement.scrollHeight;
            }, 50);
        } else {
            // textarea 或 input 处理：内联文本追加逻辑
            const existingText = this.inputElement.value || '';
            let finalText;
            if (!existingText.trim()) {
                finalText = text + '\n\n';
            } else {
                // 清理末尾换行符，添加1个空行（2个换行符）作为分隔
                const cleanedText = existingText.replace(/\n+$/, '');
                finalText = cleanedText + '\n\n' + text + '\n\n';
            }
            this.inputElement.value = finalText;
            this.inputElement.selectionStart = this.inputElement.selectionEnd = this.inputElement.value.length;
            
            // 触发 input 事件
            this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            
            // 延迟设置焦点和滚动
            setTimeout(() => {
                this.inputElement.focus();
                this.inputElement.selectionStart = this.inputElement.selectionEnd = this.inputElement.value.length;
                this.inputElement.scrollTop = this.inputElement.scrollHeight;
            }, 50);
        }
    }
    
    /**
     * 显示
     */
    show() {
        if (this.isEnabled) {
            this._findInputAndShow();
        }
    }
    
    /**
     * 隐藏
     */
    hide() {
        this._hideButton();
    }
    
    /**
     * 销毁
     */
    destroy() {
        this.isDestroyed = true;
        this._disable();
        
        // 关闭浮窗和下拉菜单
        this._hidePromptModal();
        this._hidePromptDropdown();
        
        // 移除 Storage 监听
        if (this.storageListener) {
            chrome.storage.onChanged.removeListener(this.storageListener);
            this.storageListener = null;
        }
        
        // 移除按钮
        if (this.buttonElement?.parentNode) {
            this.buttonElement.parentNode.removeChild(this.buttonElement);
            this.buttonElement = null;
        }
        if (window.inputBoxAnimationManager) {
            window.inputBoxAnimationManager.destroy();
        }
    }
}
