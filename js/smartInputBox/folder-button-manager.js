/**
 * Folder Button Manager
 *
 * 文件夹按钮管理器
 * 在提示词按钮下方显示一个【文件夹】按钮
 * 点击后弹出大型浮窗（与设置→文件夹页面内容一致），含【炼化模板】按钮
 *
 * 定位策略：与【提示词】按钮使用相同的参考元素（输入框容器），仅垂直偏移
 */

class FolderButtonManager {
    constructor() {
        this.buttonElement = null;
        this.isDestroyed = false;
        this._folderModal = null;
        this._folderOverlay = null;
        this._boundKeyDown = null;
        this._unsubscribeObserver = null;

        this._inputElement = null;
        this._resizeObserver = null;
        this._rafPending = false;
        this._onResize = null;

        // 树渲染器
        this._treeRenderer = null;
        this._folderManager = null;
    }

    /**
     * 获取当前适配器
     */
    _getAdapter() {
        try {
            if (window.smartEnterAdapterRegistry) {
                return window.smartEnterAdapterRegistry.getAdapter();
            }
        } catch (e) {}
        return null;
    }

    /**
     * 初始化
     */
    async init() {
        this._folderManager = new FolderManager(StorageAdapter);
        this._createButton();
        this._findInputAndShow();
        this._bindPositionUpdate();
    }

    /**
     * 创建按钮 DOM
     */
    _createButton() {
        if (this.buttonElement) return;

        const button = document.createElement('div');
        button.className = 'smart-input-folder-btn';
        button.innerHTML = `
            <svg class="smart-input-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
        `;
        button.title = '文件夹';
        button.style.display = 'none';

        window.eventDelegateManager.on('click', '.smart-input-folder-btn', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._handleClick();
        });

        document.body.appendChild(button);
        this.buttonElement = button;
    }

    /**
     * 查找输入框并显示按钮
     */
    _findInputAndShow() {
        if (this.isDestroyed) return;
        try {
            const adapter = this._getAdapter();
            if (!adapter) return;
            const selector = adapter.getInputSelector();
            const input = document.querySelector(selector);
            if (input) {
                this._inputElement = input;
                this._updatePosition();
                this._observeInputResize();
            }
        } catch (e) {}
    }

    _observeInputResize() {
        if (this._resizeObserver) this._resizeObserver.disconnect();
        if (!this._inputElement) return;
        const adapter = this._getAdapter();
        const ref = adapter?.getPositionReferenceElement?.(this._inputElement) || this._inputElement;
        this._resizeObserver = new ResizeObserver(() => {
            if (!this.isDestroyed) this._updatePosition();
        });
        this._resizeObserver.observe(ref);
    }

    /**
     * 绑定位置更新（事件驱动，与 PromptButtonManager 一致）
     */
    _bindPositionUpdate() {
        // RAF 节流的 resize 处理
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

        // DOM 变化监听（复用 DOMObserverManager）
        if (window.DOMObserverManager) {
            this._unsubscribeObserver = window.DOMObserverManager.getInstance().subscribeBody('folder-button', {
                callback: () => {
                    if (this.isDestroyed) return;
                    if (!this._inputElement) {
                        this._findInputAndShow();
                    } else if (!document.body.contains(this._inputElement)) {
                        this._inputElement = null;
                        this._hideButton();
                        this._findInputAndShow();
                    } else {
                        this._updatePosition();
                    }
                },
                filter: { hasAddedNodes: true, hasAttributeChanges: true },
                debounce: 100
            });
        }
    }

    /**
     * 更新按钮位置（与提示词按钮相同参考元素，垂直偏移在其下方）
     */
    _updatePosition() {
        if (!this.buttonElement || this.isDestroyed) return;

        // 优先使用提示词按钮的位置（已由 PromptButtonManager 计算好）
        const promptBtn = document.querySelector('.smart-input-prompt-btn');
        if (promptBtn && promptBtn.style.display !== 'none') {
            const promptRect = promptBtn.getBoundingClientRect();
            if (promptRect.width > 0 && promptRect.height > 0) {
                const gap = 4;
                this.buttonElement.style.top = `${promptRect.bottom + gap}px`;
                this.buttonElement.style.left = `${promptRect.left}px`;
                this.buttonElement.style.display = 'flex';
                this.buttonElement.style.visibility = 'visible';
                return;
            }
        }

        // 备用：自行计算相对输入框的位置（与 PromptButtonManager 相同逻辑）
        if (!this._inputElement) {
            this._hideButton();
            return;
        }
        try {
            const adapter = this._getAdapter();
            const ref = adapter?.getPositionReferenceElement?.(this._inputElement) || this._inputElement;
            const rect = ref.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) { this._hideButton(); return; }

            this.buttonElement.style.visibility = 'hidden';
            this.buttonElement.style.display = 'flex';
            const btnRect = this.buttonElement.getBoundingClientRect();
            const offset = adapter?.getPromptButtonOffset?.(this._inputElement) || { top: 0, left: 0 };
            const gap = 8;

            // 提示词按钮在同位置，文件夹按钮在下方（32px 按钮高 + 4px 间距）
            const promptBtnTop = rect.top + offset.top;
            const folderTop = promptBtnTop + 32 + 4;

            const top = Math.max(8, Math.min(folderTop, window.innerHeight - btnRect.height - 8));
            const left = Math.max(8, rect.left - btnRect.width - gap + offset.left);

            this.buttonElement.style.top = `${top}px`;
            this.buttonElement.style.left = `${left}px`;
            this.buttonElement.style.visibility = 'visible';
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
    }

    /**
     * 处理点击 - 显示大型浮窗（与设置→文件夹页面一致的内容）
     */
    async _handleClick() {
        if (this._folderModal) {
            this._hideModal();
            return;
        }

        // 关闭其他 UI
        if (window.globalDropdownManager) {
            window.globalDropdownManager.hide(true);
        }
        if (window.globalTooltipManager) {
            window.globalTooltipManager.hide();
        }

        this._showModal();
    }

    /**
     * 显示大型浮窗（含完整文件夹树 + 炼化模板按钮）
     */
    async _showModal() {
        // 初始化搜索状态
        this._searchQuery = '';

        // 遮罩层
        this._folderOverlay = document.createElement('div');
        this._folderOverlay.className = 'folder-modal-overlay';
        this._folderOverlay.addEventListener('click', () => this._hideModal());
        document.body.appendChild(this._folderOverlay);

        // 浮窗容器
        const modal = document.createElement('div');
        modal.className = 'folder-modal';

        // Header
        const header = document.createElement('div');
        header.className = 'folder-modal-header';
        header.innerHTML = `
            <div class="folder-modal-header-left">
                <svg class="folder-modal-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span class="folder-modal-title">文件夹</span>
            </div>
            <button class="folder-modal-close" title="关闭">✕</button>
        `;
        header.querySelector('.folder-modal-close').addEventListener('click', () => this._hideModal());

        // Toolbar（与设置页一致：添加文件夹 + 搜索）
        const toolbar = document.createElement('div');
        toolbar.className = 'folder-modal-toolbar';

        const addBtn = document.createElement('button');
        addBtn.className = 'folder-modal-add-btn';
        addBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
            <span>新建文件夹</span>
        `;
        addBtn.addEventListener('click', () => this._handleCreateFolder());

        const searchBox = document.createElement('div');
        searchBox.className = 'folder-modal-search';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '搜索文件夹或问题...';
        searchInput.autocomplete = 'off';
        searchInput.addEventListener('input', () => {
            this._searchQuery = searchInput.value.trim().toLowerCase();
            this._refreshModalTree();
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                this._searchQuery = '';
                this._refreshModalTree();
            }
        });
        searchBox.appendChild(searchInput);

        toolbar.appendChild(addBtn);
        toolbar.appendChild(searchBox);

        // Body（文件夹树容器）
        const body = document.createElement('div');
        body.className = 'folder-modal-body';

        modal.appendChild(header);
        modal.appendChild(toolbar);
        modal.appendChild(body);
        document.body.appendChild(modal);
        this._folderModal = modal;

        // 初始化 StarredTreeRenderer（不依赖 FolderManager，整个树都在这里管理）
        if (!this._folderManager) {
            this._folderManager = new FolderManager(StorageAdapter);
        }

        const tree = await this._folderManager.getStarredByFolder();

        this._treeRenderer = new StarredTreeRenderer({
            scene: 'modal',
            showSearch: true,
            showPlatformIcon: false,
            emptyClass: 'folder-modal-empty',
            folderManager: this._folderManager,
            getSearchQuery: () => this._searchQuery || '',
            getFolderStates: () => this._modalFolderStates || {},
            setFolderStates: (s) => { this._modalFolderStates = s; },
            getListContainer: () => body,
            onAfterAction: () => this._refreshModalTree(),
            onAfterNavigate: () => {}
        });
        this._modalFolderStates = {};

        this._treeRenderer.renderTree(tree);

        // 渲染后注入「炼化模板」按钮到每个文件夹行
        this._injectRefineButtons(body);

        // 显示动画
        requestAnimationFrame(() => {
            modal.classList.add('visible');
        });

        // Esc 关闭
        this._boundKeyDown = (e) => {
            if (e.key === 'Escape') this._hideModal();
        };
        document.addEventListener('keydown', this._boundKeyDown);
    }

    /**
     * 刷新浮窗中的树
     */
    async _refreshModalTree() {
        if (!this._treeRenderer || !this._folderManager) return;
        const tree = await this._folderManager.getStarredByFolder();
        const body = this._folderModal?.querySelector('.folder-modal-body');
        if (body) {
            this._treeRenderer.renderTree(tree);
            this._injectRefineButtons(body);
        }
    }

    /**
     * 新建文件夹（复用 StarredTreeRenderer 的创建逻辑）
     */
    _handleCreateFolder() {
        if (this._treeRenderer && typeof this._treeRenderer.handleCreateFolder === 'function') {
            this._treeRenderer.handleCreateFolder(null);
        }
    }

    /**
     * 注入【炼化模板】按钮到每个文件夹头部
     */
    _injectRefineButtons(container) {
        // 查找所有文件夹头部（.ait-folder-header），在 actions 区域追加按钮
        const headers = container.querySelectorAll('.ait-folder-header');
        headers.forEach(header => {
            const folderEl = header.closest('.ait-folder-item');
            if (!folderEl) return;

            const folderId = folderEl.dataset.folderId;
            if (!folderId || folderId === '__default__') return;

            // 检查是否已注入
            if (header.querySelector('.folder-refine-btn')) return;

            const actions = header.querySelector('.ait-folder-actions');
            const targetParent = actions || header;

            const refineBtn = document.createElement('button');
            refineBtn.className = 'folder-refine-btn';
            refineBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                <span>炼化模板</span>
            `;
            refineBtn.title = '将该文件夹中所有问题合并，提炼模板并发送给AI';
            refineBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this._handleRefineFolder(folderId);
            });

            targetParent.appendChild(refineBtn);
        });

        // 也为「全部问题」的 header 添加炼化按钮
        const defaultHeaders = container.querySelectorAll('.default-folder .ait-folder-header');
        defaultHeaders.forEach(header => {
            if (header.querySelector('.folder-refine-btn')) return;

            const refineBtn = document.createElement('button');
            refineBtn.className = 'folder-refine-btn';
            refineBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                <span>炼化模板</span>
            `;
            refineBtn.title = '将「全部问题」中所有问题合并，提炼模板并发送给AI';
            refineBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this._handleRefineFolder(null);
            });
            header.appendChild(refineBtn);
        });
    }

    /**
     * 处理「炼化模板」按钮点击
     * @param {string|null} folderId - 文件夹ID（null=全部问题）
     */
    async _handleRefineFolder(folderId) {
        // 获取文件夹数据
        const tree = await this._folderManager.getStarredByFolder();
        let targetFolder;

        if (folderId === null) {
            // 全部问题
            const items = tree.uncategorized || [];
            targetFolder = {
                id: '__default__',
                name: chrome.i18n.getMessage('defaultFolder') || '全部问题',
                items: items.map(item => ({
                    question: item.fullContent || item.theme || ''
                }))
            };
        } else {
            // 查找具体文件夹（含子文件夹的所有问题）
            let allItems = [];
            let folderName = '未知文件夹';
            const collectItems = (folders) => {
                for (const f of folders) {
                    if (f.id === folderId) {
                        folderName = f.name;
                        // 收集该文件夹及其子文件夹的所有项目
                        const collectAll = (node) => {
                            allItems.push(...(node.items || []));
                            if (node.children) {
                                node.children.forEach(child => collectAll(child));
                            }
                        };
                        collectAll(f);
                        return true;
                    }
                    if (f.children) {
                        if (collectItems(f.children)) return true;
                    }
                }
                return false;
            };
            const found = collectItems(tree.folders);
            if (!found || allItems.length === 0) {
                if (window.globalToastManager) {
                    window.globalToastManager.show('warning', '该文件夹中没有有效问题');
                }
                return;
            }
            targetFolder = {
                id: folderId,
                name: folderName,
                items: allItems.map(item => ({
                    question: item.fullContent || item.theme || ''
                }))
            };
        }

        // 关闭浮窗
        this._hideModal();

        // 执行炼化
        this._refineFolder(targetFolder);
    }

    /**
     * 隐藏浮窗
     */
    _hideModal() {
        if (this._boundKeyDown) {
            document.removeEventListener('keydown', this._boundKeyDown);
            this._boundKeyDown = null;
        }

        if (this._folderModal) {
            this._folderModal.classList.remove('visible');
            setTimeout(() => {
                if (this._folderModal?.parentNode) {
                    this._folderModal.parentNode.removeChild(this._folderModal);
                }
                this._folderModal = null;
                this._treeRenderer = null;
            }, 200);
        }

        if (this._folderOverlay?.parentNode) {
            this._folderOverlay.parentNode.removeChild(this._folderOverlay);
        }
        this._folderOverlay = null;
    }

    /**
     * HTML 转义
     */
    _escape(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // ==================== 炼化流程 ====================

    /**
     * 炼化文件夹：将文件夹内所有问题发送给AI
     */
    async _refineFolder(folder) {
        console.log(`[FolderButton] _refineFolder 开始: ${folder.name}, items=${folder.items?.length || 0}`);

        const questions = folder.items
            .map(item => item.question || '')
            .filter(q => q.trim());

        if (questions.length === 0) {
            console.warn('[FolderButton] 无有效问题，取消炼化');
            if (window.globalToastManager) {
                window.globalToastManager.show('warning', '该文件夹中没有有效问题');
            }
            return;
        }

        console.log(`[FolderButton] 有效问题数: ${questions.length}`);

        // 构建炼化 prompt
        const questionsText = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
        const refinedPrompt = `【问题分析任务】

请AI分析并整理以下所有问题，重点关注问题间的关联逻辑、提问技巧及对模糊领域的处理方式。

## 原始问题列表
${questionsText}

## 分析要求
1. **关联分析**：找出各问题之间的逻辑关联、递进关系、互补关系
2. **提问技巧**：分析提问者的提问策略和技巧
3. **模糊领域处理**：识别并分析对模糊、不确定领域的提问方式

## 输出要求
1. 输出一份**完整的Skill提示词**，可作为该研究领域的系统指令
2. 生成**3-5个层层深入的提问模板语句**（从基础认知到深层探索）

请按照以下格式输出：

### 完整Skill提示词
[系统指令内容]

### 层层深入提问模板
1. [第一层：基础认知提问]
2. [第二层：深入理解提问]
3. [第三层：关联延伸提问]
4. [第四层：批判反思提问]
5. [第五层：创新应用提问]`;

        // 找到输入框
        const inputElement = this._findInputElement();
        if (!inputElement) {
            console.error('[FolderButton] 未找到AI输入框');
            if (window.globalToastManager) {
                window.globalToastManager.show('error', '未找到AI输入框');
            }
            return;
        }

        console.log('[FolderButton] 输入框已找到, isContentEditable=', !!inputElement.isContentEditable);

        // 插入 prompt
        inputElement.focus();
        if (inputElement.isContentEditable) {
            inputElement.textContent = refinedPrompt;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            inputElement.value = refinedPrompt;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        }

        console.log('[FolderButton] Prompt已插入输入框');

        if (window.globalToastManager) {
            window.globalToastManager.info(`已将"${folder.name}"中 ${questions.length} 个问题发送给AI炼化`);
        }

        // 自动发送（600ms 延迟确保输入框处理完成）
        setTimeout(() => {
            try {
                const sendBtn = this._findSendButton();
                if (sendBtn && !sendBtn.disabled) {
                    console.log('[FolderButton] 点击发送按钮');
                    sendBtn.click();
                } else {
                    console.log('[FolderButton] 未找到发送按钮，模拟Enter发送');
                    // 重新获取输入框（可能已被框架替换）
                    const currentInput = this._findInputElement() || inputElement;
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
                    });
                    currentInput.dispatchEvent(enterEvent);
                }

                console.log('[FolderButton] 发送完成，开始等待AI回复...');
                // 等待AI回复并保存到提示词
                this._waitAndSaveAIResponse(folder.name, questions.length);
            } catch (e) {
                console.error('[FolderButton] 自动发送失败:', e);
                if (window.globalToastManager) {
                    window.globalToastManager.show('error', '发送失败: ' + e.message);
                }
            }
        }, 600);
    }

    /**
     * 查找AI输入框
     */
    _findInputElement() {
        try {
            const adapter = window.smartEnterAdapterRegistry?.getAdapter?.();
            if (adapter) {
                const selector = adapter.getInputSelector?.();
                if (selector) {
                    const el = document.querySelector(selector);
                    if (el && el.offsetParent !== null) return el;
                }
            }
        } catch (e) {}

        const selectors = [
            '#prompt-textarea',
            'textarea[placeholder*="问"]',
            'textarea[placeholder*="message"]',
            'textarea[placeholder*="Message"]',
            'div[contenteditable="true"]',
            '[role="textbox"]',
            'textarea'
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) return el;
        }
        return null;
    }

    /**
     * 查找发送按钮
     */
    _findSendButton() {
        try {
            const adapter = window.smartEnterAdapterRegistry?.getAdapter?.();
            if (adapter) {
                const selector = adapter.getSendButtonSelector?.();
                if (selector) {
                    const btn = document.querySelector(selector);
                    if (btn && btn.offsetParent !== null) return btn;
                }
            }
        } catch (e) {}

        const selectors = [
            '#composer-submit-button',
            'button[data-testid="send-button"]',
            'button[type="submit"]',
            'button[aria-label*="send" i]',
            'button[aria-label*="发送" i]',
            'button[aria-label*="Send" i]',
            '.send-button',
            '[data-testid="send-button"]'
        ];
        for (const sel of selectors) {
            const btn = document.querySelector(sel);
            if (btn && btn.offsetParent !== null) return btn;
        }
        return null;
    }

    /**
     * 等待AI回复并保存到提示词
     */
    /**
     * 等待AI回复并保存到提示词（递归 setTimeout 模式，无竞态）
     */
    async _waitAndSaveAIResponse(folderName, questionCount) {
        const MAX_WAIT = 180000;   // 180秒
        const POLL_INTERVAL = 3000; // 3秒间隔
        const startTime = Date.now();
        let lastLength = 0;
        let stableCount = 0;
        let lastPollTime = 0;

        // 用递归 setTimeout 替代 setInterval，彻底避免 async 竞态
        const poll = async () => {
            // 防止销毁后继续执行
            if (this.isDestroyed) {
                console.warn('[FolderButton] 管理器已销毁，停止等待');
                return;
            }

            const elapsed = Date.now() - startTime;
            const currentResponse = this._getLatestAIResponse();
            const currentLength = currentResponse?.length || 0;
            const deltaFromLast = currentLength - lastPollTime;

            if (currentLength > 0 && deltaFromLast !== 0) {
                console.log(`[FolderButton] 轮询: ${currentLength}字 (已等${Math.round(elapsed/1000)}s, 增长${deltaFromLast > 0 ? '+' + deltaFromLast : deltaFromLast})`);
            }
            lastPollTime = currentLength;

            // 稳定性检测
            if (currentLength > 200) {
                if (Math.abs(currentLength - lastLength) < 30) {
                    stableCount++;
                } else {
                    stableCount = 0;
                }
            }
            lastLength = currentLength;

            const hasCompleteMarkers = currentResponse && (
                currentResponse.includes('完整Skill提示词') ||
                currentResponse.includes('层层深入') ||
                currentResponse.includes('提问框架')
            );

            const isStable = stableCount >= 3 && currentLength > 500;
            const isComplete = hasCompleteMarkers && currentLength > 500;

            // 完成判定
            if (isComplete || isStable) {
                console.log(`[FolderButton] ✅ AI回复完成: ${currentLength}字, complete=${isComplete}, stable=${isStable}`);
                await this._doSave(currentResponse, folderName, questionCount);
                return;
            }

            // 超时判定
            if (elapsed >= MAX_WAIT) {
                console.log(`[FolderButton] ⏰ 超时(${MAX_WAIT/1000}s), 已获取${currentLength}字`);
                if (currentResponse && currentResponse.length > 200) {
                    await this._doSave(currentResponse, folderName, questionCount);
                } else {
                    console.warn('[FolderButton] 超时且回复不足200字，未保存');
                    if (window.globalToastManager) {
                        window.globalToastManager.show('warning', `炼化超时：AI未在${MAX_WAIT/1000}秒内完成回复`);
                    }
                }
                return;
            }

            // 继续下一轮
            setTimeout(poll, POLL_INTERVAL);
        };

        // 启动第一轮（延迟首次，给 AI 一些时间开始回复）
        setTimeout(poll, 2000);
    }

    /**
     * 执行保存（统一入口，确保错误处理一致）
     */
    async _doSave(responseText, folderName, questionCount) {
        try {
            console.log(`[FolderButton] 开始保存到提示词: ${responseText?.length || 0}字`);
            await this._saveAIResponseToPrompts(responseText, folderName, questionCount);
            console.log('[FolderButton] ✅ 保存成功');
        } catch (e) {
            console.error('[FolderButton] ❌ 保存失败:', e);
            if (window.globalToastManager) {
                window.globalToastManager.show('error', '保存AI回复失败: ' + e.message);
            }
        }
    }

    /**
     * 获取最新AI回复
     */
    _getLatestAIResponse() {
        try {
            const adapter = window.smartEnterAdapterRegistry?.getAdapter?.();
            if (adapter) {
                const aiSelector = adapter.getAIMessageSelector?.();
                if (aiSelector) {
                    const elements = document.querySelectorAll(aiSelector);
                    for (let i = elements.length - 1; i >= 0; i--) {
                        const text = (elements[i].textContent || '').trim();
                        if (text.length > 100 && !text.includes('【问题分析任务】')) {
                            return text;
                        }
                    }
                }
            }
        } catch (e) {}

        // 平台特定选择器（优先于通用选择器）
        const platformSelector = this._getAIMessageSelectorForCurrentSite();
        if (platformSelector) {
            const elements = document.querySelectorAll(platformSelector);
            for (let i = elements.length - 1; i >= 0; i--) {
                const text = (elements[i].textContent || '').trim();
                if (text.length > 100 && !text.includes('【问题分析任务】')) {
                    return text;
                }
            }
        }

        const selectors = [
            '[data-message-author-role="assistant"]',
            '[data-role="assistant"]',
            '.markdown-body',
            '.prose'
        ];
        for (const sel of selectors) {
            const elements = document.querySelectorAll(sel);
            for (let i = elements.length - 1; i >= 0; i--) {
                const text = (elements[i].textContent || '').trim();
                if (text.length > 100 && !text.includes('【问题分析任务】')) {
                    return text;
                }
            }
        }
        return '';
    }

    /**
     * 根据当前网站获取 AI 消息选择器（平台特定）
     */
    _getAIMessageSelectorForCurrentSite() {
        const hostname = location.hostname;
        if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) {
            return '[data-message-author-role="assistant"]';
        }
        if (hostname.includes('claude.ai')) {
            return '.claude-message, [data-type="assistant"]';
        }
        if (hostname.includes('gemini.google') || hostname.includes('bard.google')) {
            return '[data-type="assistant"], .gemini-message';
        }
        if (hostname.includes('deepseek.com')) {
            return '[data-role="assistant"], .deepseek-message';
        }
        if (hostname.includes('kimi.moonshot.cn') || hostname.includes('kimi')) {
            return '[data-role="assistant"], .message-assistant';
        }
        if (hostname.includes('tongyi') || hostname.includes('qwen')) {
            return '[data-role="assistant"], .assistant-message, .chat-message-assistant';
        }
        if (hostname.includes('doubao') || hostname.includes('yuewen')) {
            return '[data-role="assistant"], .assistant-message, .bot-message';
        }
        if (hostname.includes('yuanbao')) {
            return '[data-role="assistant"], .agent-message, .chat-assistant';
        }
        if (hostname.includes('grok') || hostname.includes('x.com')) {
            return '[data-role="assistant"], .assistant-message';
        }
        if (hostname.includes('perplexity')) {
            return '[data-role="assistant"], [class*="assistant"]';
        }
        if (hostname.includes('yiyan') || hostname.includes('baidu')) {
            return '[data-role="assistant"], .assistant-message';
        }
        if (hostname.includes('notebooklm')) {
            return '[data-role="assistant"], .assistant-message';
        }
        return null;
    }

    /**
     * 解析AI炼化回复，提取完整Skill提示词和层层深入提问模板
     * @param {string} responseText - AI完整回复
     * @returns {{ skillPrompt: string|null, templates: string[] }}
     */
    _parseRefinedSections(responseText) {
        const result = { skillPrompt: null, templates: [] };

        // 按 ### 分隔符切分各段落
        const sections = responseText.split(/(?=###\s)/);

        for (const section of sections) {
            const trimmed = section.trim();

            // 提取完整Skill提示词
            if (/^###\s*完整Skill提示词/i.test(trimmed)) {
                result.skillPrompt = trimmed
                    .replace(/^###\s*完整Skill提示词\s*\n*/i, '')
                    .trim();
            }

            // 提取层层深入提问模板
            if (/^###\s*层层深入提问模板/i.test(trimmed)) {
                const templateBody = trimmed
                    .replace(/^###\s*层层深入提问模板\s*\n*/i, '')
                    .trim();

                // 按行解析，提取带编号的模板语句
                const lines = templateBody.split('\n');
                for (const line of lines) {
                    // 去除编号：1. 1、1) 1）1: 等
                    const cleaned = line
                        .replace(/^\d+[\.\、\)）:：]\s*/, '')
                        .trim();
                    // 过滤掉层级标签（如 [第一层：...]）
                    const contentOnly = cleaned.replace(/^\[.+\][：:]?\s*/, '').trim();
                    if (contentOnly.length >= 5) {
                        result.templates.push(contentOnly);
                    } else if (cleaned.length >= 5) {
                        // 如果去掉层级标签后太短，保留原始内容
                        result.templates.push(cleaned);
                    }
                }
            }
        }

        return result;
    }

    /**
     * 保存AI回复到提示词 — 解析完整回复并分层保存
     */
    async _saveAIResponseToPrompts(responseText, folderName, questionCount) {
        try {
            const result = await chrome.storage.local.get('prompts');
            const prompts = result.prompts || [];
            const baseTime = Date.now();
            const timestamp = new Date().toLocaleString('zh-CN');

            console.log(`[FolderButton] _saveAIResponseToPrompts: 回复长度=${responseText?.length || 0}, 文件夹=${folderName}, 问题数=${questionCount}`);
            console.log(`[FolderButton] 已存储提示词数量: ${prompts.length}`);

            // ========== 1. 保存完整AI回复（保持向后兼容） ==========
            prompts.push({
                id: `refined_${baseTime}`,
                name: `${folderName}_炼化结果_${timestamp}`.substring(0, 50),
                content: responseText,
                platformId: '',
                createdAt: baseTime,
                source: 'refined_ai',
                sourceFolder: folderName,
                questionCount
            });

            // ========== 2. 解析并分层保存 ==========
            const parsed = this._parseRefinedSections(responseText);

            console.log(`[FolderButton] 解析结果: skillPrompt=${parsed.skillPrompt ? parsed.skillPrompt.length + '字' : '无'}, templates=${parsed.templates.length}条`);

            // 2a. 保存完整Skill提示词
            if (parsed.skillPrompt && parsed.skillPrompt.length > 20) {
                prompts.push({
                    id: `refined_skill_${baseTime}`,
                    name: `${folderName}_完整Skill提示词`.substring(0, 50),
                    content: parsed.skillPrompt,
                    platformId: '',
                    createdAt: baseTime + 1,
                    source: 'refined_skill',
                    sourceFolder: folderName,
                    questionCount
                });
            }

            // 2b. 保存每个层层深入提问模板语句
            parsed.templates.forEach((template, index) => {
                const shortName = template.substring(0, 25);
                prompts.push({
                    id: `refined_tpl_${baseTime}_${index}`,
                    name: `${folderName}_模板Q${index + 1}: ${shortName}${template.length > 25 ? '...' : ''}`.substring(0, 50),
                    content: template,
                    platformId: '',
                    createdAt: baseTime + 2 + index,
                    source: 'refined_template',
                    sourceFolder: folderName,
                    questionCount
                });
            });

            await chrome.storage.local.set({ prompts });
            console.log(`[FolderButton] chrome.storage.local.set 完成, 总共 ${prompts.length} 条提示词`);

            const templateCount = parsed.templates.length;
            const totalSaved = 1 + (parsed.skillPrompt ? 1 : 0) + templateCount;
            if (window.globalToastManager) {
                window.globalToastManager.success(
                    `"${folderName}" 炼化完成，已保存 ${totalSaved} 条提示词（含 ${templateCount} 条提问模板）`
                );
            }
        } catch (e) {
            console.error('[FolderButton] 保存AI回复失败:', e);
            if (window.globalToastManager) {
                window.globalToastManager.show('error', '保存AI回复失败: ' + e.message);
            }
        }
    }

    /**
     * 销毁
     */
    destroy() {
        this.isDestroyed = true;

        // 停止位置监听
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            this._onResize = null;
        }
        if (this._unsubscribeObserver) {
            this._unsubscribeObserver();
            this._unsubscribeObserver = null;
        }
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        this._rafPending = false;

        this._hideModal();

        if (this.buttonElement?.parentNode) {
            this.buttonElement.parentNode.removeChild(this.buttonElement);
            this.buttonElement = null;
        }
    }
}

// 全局导出
window.FolderButtonManager = FolderButtonManager;
