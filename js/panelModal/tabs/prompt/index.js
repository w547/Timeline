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

        // ==================== 滚动区域 ====================
        const scrollArea = document.createElement('div');
        scrollArea.className = 'prompt-settings-scroll';
        scrollArea.innerHTML = `
            <div class="prompt-list-section">
                <div class="prompt-list-header">
                    <div class="prompt-list-title">${chrome.i18n.getMessage('biwhckdj')}</div>
                    <div class="prompt-list-actions">
                        <button class="prompt-extract-btn" id="prompt-extract-btn" title="从收藏问题提炼模板">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                                <path d="M2 17l10 5 10-5"/>
                                <path d="M2 12l10 5 10-5"/>
                            </svg>
                            <span>${chrome.i18n.getMessage('promptExtractBtn') || '炼化模板'}</span>
                        </button>
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
        
        // 加载提示词列表
        await this.loadPrompts();
        await this.loadTemplates();
        
        // 渲染提示词列表
        this.renderPromptList();
        
        // 绑定添加按钮事件
        this.bindAddButtonEvent();
        
        // 绑定炼化按钮事件
        this.bindExtractButtonEvent();

        // 监听 storage 变化，自动刷新提示词列表（支持外部写入，如文件夹炼化）
        this.addStorageListener((changes) => {
            if (changes.prompts) {
                console.log('[PromptTab] 检测到提示词列表变化，自动刷新');
                this.loadPrompts().then(() => this.renderPromptList());
            }
        });
    }
    
    /**
     * 加载模板列表
     */
    async loadTemplates() {
        try {
            const result = await chrome.storage.local.get('promptTemplates');
            this.setState('templates', result.promptTemplates || []);
        } catch (e) {
            console.error('[PromptTab] Failed to load templates:', e);
            this.setState('templates', []);
        }
    }
    
    /**
     * 绑定炼化按钮事件
     */
    bindExtractButtonEvent() {
        const extractBtn = document.getElementById('prompt-extract-btn');
        if (extractBtn) {
            this.addEventListener(extractBtn, 'click', () => {
                this.showExtractModal();
            });
        }
    }
    
    /**
     * 显示炼化弹窗
     */
    showExtractModal() {
        const overlay = document.createElement('div');
        overlay.className = 'prompt-extract-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'prompt-extract-modal';
        
        modal.innerHTML = `
            <div class="prompt-extract-header">
                <h3>${chrome.i18n.getMessage('promptExtractTitle') || '炼化提问模板'}</h3>
                <button class="prompt-extract-close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="prompt-extract-body">
                <div class="prompt-extract-intro">
                    <p>${chrome.i18n.getMessage('promptExtractIntro') || '从收藏文件夹中的问题提炼出结构化的提问模板，方便复用。'}</p>
                </div>
                <div class="prompt-extract-folder-section">
                    <label>${chrome.i18n.getMessage('promptExtractFolderLabel') || '选择文件夹'}</label>
                    <select id="extract-folder-select" class="prompt-extract-select">
                        <option value="">${chrome.i18n.getMessage('promptExtractAllFolders') || '所有文件夹'}</option>
                    </select>
                </div>
                <div class="prompt-extract-preview">
                    <div class="prompt-extract-preview-title">${chrome.i18n.getMessage('promptExtractPreview') || '问题预览'}</div>
                    <div class="prompt-extract-preview-list" id="extract-preview-list">
                        <div class="prompt-extract-empty">${chrome.i18n.getMessage('promptExtractSelectFolder') || '请选择文件夹查看问题'}</div>
                    </div>
                    <div class="prompt-extract-count" id="extract-question-count"></div>
                </div>
            </div>
            <div class="prompt-extract-footer">
                <button class="prompt-extract-btn-cancel">${chrome.i18n.getMessage('pxvkmz')}</button>
                <button class="prompt-extract-btn-extract" id="extract-start-btn" disabled>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    ${chrome.i18n.getMessage('promptExtractStart') || '开始炼化'}
                </button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // 初始化文件夹选择器
        this._initExtractModal(overlay, modal);
        
        // 显示动画
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
    }
    
    /**
     * 初始化炼化弹窗
     */
    async _initExtractModal(overlay, modal) {
        const folderSelect = modal.querySelector('#extract-folder-select');
        const previewList = modal.querySelector('#extract-preview-list');
        const questionCount = modal.querySelector('#extract-question-count');
        const startBtn = modal.querySelector('#extract-start-btn');
        const closeBtn = modal.querySelector('.prompt-extract-close');
        const cancelBtn = modal.querySelector('.prompt-extract-btn-cancel');
        
        // 加载文件夹列表
        const folders = await this._getFolders();
        folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = `${folder.icon || '📁'} ${folder.name}`;
            folderSelect.appendChild(option);
        });
        
        // 加载所有收藏问题用于预览
        const extractor = window.promptTemplateExtractor;
        let allQuestions = await extractor.getStarredContents();
        
        // 更新预览
        const updatePreview = async () => {
            const folderId = folderSelect.value || null;
            const questions = folderId 
                ? await extractor.getStarredContents(folderId)
                : allQuestions;
            
            if (questions.length === 0) {
                previewList.innerHTML = `<div class="prompt-extract-empty">${chrome.i18n.getMessage('promptExtractNoQuestions') || '该文件夹没有收藏的问题'}</div>`;
                questionCount.textContent = '';
                startBtn.disabled = true;
            } else {
                previewList.innerHTML = questions.slice(0, 10).map((q, idx) => `
                    <div class="prompt-extract-preview-item">
                        <span class="prompt-extract-preview-index">Q${idx + 1}</span>
                        <span class="prompt-extract-preview-text">${this._escapeHtml(this._truncate(q.content, 80))}</span>
                    </div>
                `).join('') + (questions.length > 10 ? `<div class="prompt-extract-more">... ${chrome.i18n.getMessage('promptExtractMore', [questions.length - 10]) || `还有 ${questions.length - 10} 个问题`}</div>` : '');
                questionCount.textContent = chrome.i18n.getMessage('promptExtractTotal', [questions.length]) || `共 ${questions.length} 个问题`;
                startBtn.disabled = false;
            }
        };
        
        // 文件夹选择变化时更新预览
        folderSelect.addEventListener('change', updatePreview);
        
        // 初始化预览
        await updatePreview();
        
        // 开始炼化
        startBtn.addEventListener('click', async () => {
            const folderId = folderSelect.value || null;
            const questions = folderId 
                ? await extractor.getStarredContents(folderId)
                : await extractor.getStarredContents();
            
            if (questions.length === 0) {
                if (window.globalToastManager) {
                    window.globalToastManager.show('error', chrome.i18n.getMessage('promptExtractNoQuestions') || '没有可用的问题');
                }
                return;
            }
            
            // 显示加载状态
            startBtn.disabled = true;
            startBtn.innerHTML = `<svg class="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/>
            </svg> ${chrome.i18n.getMessage('promptExtractProcessing') || '炼化中...'}`;
            
            // 关闭选择弹窗
            this._closeExtractModal(overlay);
            
            try {
                // ✅ 新流程：创建新AI对话 + 自动发送 + 保存AI回复
                await this._refineWithAI(questions, folderId);
            } catch (e) {
                console.error('[PromptTab] Extract failed:', e);
                if (window.globalToastManager) {
                    window.globalToastManager.show('error', chrome.i18n.getMessage('promptExtractFailed') || '炼化失败');
                }
            }
            
            startBtn.disabled = false;
            startBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg> ${chrome.i18n.getMessage('promptExtractStart') || '开始炼化'}`;
        });
        
        // 关闭弹窗
        const closeModal = () => this._closeExtractModal(overlay);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    }
    
    /**
     * 关闭炼化弹窗
     */
    _closeExtractModal(overlay) {
        overlay.classList.remove('visible');
        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 200);
    }

    /**
     * ✅ 新炼化流程：创建新AI对话、自动发送深度分析prompt、保存AI回复到提示词
     */
    async _refineWithAI(questions, folderId) {
        const folderName = folderId 
            ? (await this._getFolderName(folderId) || '炼化模板')
            : '炼化模板';

        // 构建深度分析prompt
        const questionsText = questions.map((q, i) => `${i + 1}. ${q.content || q.theme || ''}`).join('\n');
        
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

        if (window.globalToastManager) {
            window.globalToastManager.info('正在创建新对话并发送炼化提示词...');
        }

        try {
            // 1. 创建新AI对话
            await this._startNewConversation();
            await this._waitForInputReady();

            // 2. 插入prompt到输入框
            const inputElement = this._findInputElement();
            if (!inputElement) {
                throw new Error('未找到AI输入框');
            }

            inputElement.focus();
            if (inputElement.isContentEditable) {
                inputElement.textContent = refinedPrompt;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                inputElement.value = refinedPrompt;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // 3. 自动发送
            await new Promise(resolve => setTimeout(resolve, 300));
            this._autoSend(inputElement);

            // 4. 等待AI回复并保存到提示词
            if (window.globalToastManager) {
                window.globalToastManager.info('已自动发送，正在等待AI回复...');
            }

            const response = await this._waitForAIResponse();
            if (response && response.trim().length > 100) {
                await this._saveAIResponseToPrompts(response, folderName, questions.length);
            } else {
                if (window.globalToastManager) {
                    window.globalToastManager.show('warning', 'AI回复获取失败或内容过短');
                }
            }
        } catch (e) {
            console.error('[PromptTab] _refineWithAI error:', e);
            if (window.globalToastManager) {
                window.globalToastManager.show('error', '炼化流程失败: ' + (e.message || '未知错误'));
            }
        }
    }

    /**
     * 获取文件夹名称
     */
    async _getFolderName(folderId) {
        try {
            const result = await chrome.storage.local.get('folders');
            const folders = result.folders || [];
            const folder = folders.find(f => f.id === folderId);
            return folder?.name || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * 创建新AI对话
     */
    async _startNewConversation() {
        try {
            const adapter = window.smartEnterAdapterRegistry?.getAdapter?.();
            if (adapter && typeof adapter.startNewConversation === 'function') {
                const result = await adapter.startNewConversation();
                if (result) return true;
            }
            
            // 备选方案：导航到根路径
            const currentUrl = location.href;
            const baseUrl = location.origin;
            if (currentUrl.includes('/c/') || currentUrl.includes('/g/')) {
                window.location.href = baseUrl;
                await new Promise(resolve => setTimeout(resolve, 2500));
                return true;
            }
            
            return false;
        } catch (e) {
            console.error('[PromptTab] startNewConversation failed:', e);
            return false;
        }
    }

    /**
     * 等待输入框就绪
     */
    async _waitForInputReady(maxWait = 10000) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait) {
            const inputEl = this._findInputElement();
            if (inputEl && inputEl.offsetParent !== null) return true;
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        return false;
    }

    /**
     * 查找输入框
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
     * 自动发送消息
     */
    _autoSend(inputElement) {
        try {
            const sendBtn = this._findSendButton();
            if (sendBtn && !sendBtn.disabled) {
                sendBtn.click();
            } else {
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
                });
                inputElement.dispatchEvent(enterEvent);
            }
            console.log('[PromptTab] 消息已自动发送');
        } catch (e) {
            console.error('[PromptTab] autoSend failed:', e);
        }
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
     * 等待AI回复
     */
    _waitForAIResponse() {
        const MAX_WAIT = 180000; // 180秒
        const POLL_INTERVAL = 3000;
        const startTime = Date.now();
        let lastLength = 0;
        let stableCount = 0;

        return new Promise((resolve) => {
            const poll = setInterval(() => {
                const currentResponse = this._getLatestAIResponse();
                const currentLength = currentResponse?.length || 0;

                if (currentLength > 200) {
                    if (Math.abs(currentLength - lastLength) < 30) {
                        stableCount++;
                    } else {
                        stableCount = 0;
                    }
                    lastLength = currentLength;
                }

                // 判断是否完成
                const hasCompleteMarkers = currentResponse && (
                    currentResponse.includes('完整Skill提示词') ||
                    currentResponse.includes('层层深入') ||
                    currentResponse.includes('提问框架')
                );

                const isStable = stableCount >= 3 && currentLength > 500;
                const isComplete = hasCompleteMarkers && currentLength > 500;

                if (isComplete || isStable) {
                    clearInterval(poll);
                    console.log('[PromptTab] AI回复完成, 长度:', currentLength);
                    resolve(currentResponse);
                    return;
                }

                if (Date.now() - startTime >= MAX_WAIT) {
                    clearInterval(poll);
                    console.log('[PromptTab] 等待超时, 返回当前内容长度:', currentLength);
                    resolve(currentResponse || '');
                }
            }, POLL_INTERVAL);
        });
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
                    if (elements.length > 0) {
                        for (let i = elements.length - 1; i >= 0; i--) {
                            const text = (elements[i].textContent || '').trim();
                            if (text.length > 100 && !text.includes('【问题分析任务】')) {
                                return text;
                            }
                        }
                    }
                }
            }
        } catch (e) {}

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
     * 保存AI回复到提示词
     */
    async _saveAIResponseToPrompts(responseText, folderName, questionCount) {
        try {
            const result = await chrome.storage.local.get('prompts');
            const prompts = result.prompts || [];
            
            const timestamp = new Date().toLocaleString('zh-CN');
            const promptName = `${folderName}_炼化结果_${timestamp}`;
            
            const newPrompt = {
                id: `refined_${Date.now()}`,
                name: promptName.substring(0, 50),
                content: responseText,
                platformId: '',
                createdAt: Date.now(),
                source: 'refined_ai',
                sourceFolder: folderName,
                questionCount: questionCount
            };
            
            prompts.push(newPrompt);
            await chrome.storage.local.set({ prompts });
            
            console.log('[PromptTab] AI回复已保存到提示词:', promptName);
            if (window.globalToastManager) {
                window.globalToastManager.success(`AI炼化结果已保存到提示词`);
            }
        } catch (e) {
            console.error('[PromptTab] 保存AI回复失败:', e);
        }
    }
    
    /**
     * 显示炼化结果弹窗
     */
    async showExtractResultModal(result, folderId) {
        const overlay = document.createElement('div');
        overlay.className = 'prompt-extract-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'prompt-extract-modal prompt-extract-result-modal';
        
        modal.innerHTML = `
            <div class="prompt-extract-header">
                <h3>${chrome.i18n.getMessage('promptExtractResultTitle') || '提炼结果'}</h3>
                <button class="prompt-extract-close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="prompt-extract-body">
                <div class="prompt-extract-result-info">
                    <div class="prompt-extract-source-count">${chrome.i18n.getMessage('promptExtractSourceCount') || '基于'} ${result.sourceCount} ${chrome.i18n.getMessage('promptExtractQuestions') || '个问题提炼'}</div>
                </div>
                <div class="prompt-extract-suite-name-section">
                    <label>${chrome.i18n.getMessage('promptExtractSuiteName') || '套件名称'}</label>
                    <input type="text" id="extract-suite-name" class="prompt-extract-input" 
                        value="${this._escapeHtml(result.suiteName)}" maxlength="30">
                </div>
                <div class="prompt-extract-questions">
                    <div class="prompt-extract-questions-title">${chrome.i18n.getMessage('promptExtractTemplateQuestions') || '模板问题'}</div>
                    <div class="prompt-extract-questions-list" id="extract-questions-list">
                        ${result.questions.map((q, idx) => `
                            <div class="prompt-extract-question-item" data-id="${q.id}">
                                <span class="prompt-extract-question-index">Q${idx + 1}</span>
                                <input type="text" class="prompt-extract-question-input" 
                                    value="${this._escapeHtml(q.text)}" maxlength="200">
                                <button class="prompt-extract-question-delete" data-id="${q.id}">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="18" y1="6" x2="6" y2="18"/>
                                        <line x1="6" y1="6" x2="18" y2="18"/>
                                    </svg>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="prompt-extract-footer">
                <button class="prompt-extract-btn-cancel">${chrome.i18n.getMessage('pxvkmz')}</button>
                <button class="prompt-extract-btn-save" id="extract-save-btn">
                    ${chrome.i18n.getMessage('promptExtractSaveAsTemplate') || '保存为模板'}
                </button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // 绑定事件
        const closeBtn = modal.querySelector('.prompt-extract-close');
        const cancelBtn = modal.querySelector('.prompt-extract-btn-cancel');
        const saveBtn = modal.querySelector('#extract-save-btn');
        const questionsList = modal.querySelector('#extract-questions-list');
        const suiteNameInput = modal.querySelector('#extract-suite-name');
        
        // 删除问题按钮
        questionsList.querySelectorAll('.prompt-extract-question-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = btn.closest('.prompt-extract-question-item');
                if (item) item.remove();
                // 重新编号
                questionsList.querySelectorAll('.prompt-extract-question-item').forEach((el, idx) => {
                    el.querySelector('.prompt-extract-question-index').textContent = `Q${idx + 1}`;
                });
            });
        });
        
        // 保存模板
        saveBtn.addEventListener('click', async () => {
            const suiteName = suiteNameInput.value.trim();
            if (!suiteName) {
                if (window.globalToastManager) {
                    window.globalToastManager.show('error', chrome.i18n.getMessage('promptExtractNameRequired') || '请输入套件名称');
                }
                suiteNameInput.focus();
                return;
            }
            
            // 收集问题
            const questions = [];
            questionsList.querySelectorAll('.prompt-extract-question-item').forEach((el, idx) => {
                const text = el.querySelector('.prompt-extract-question-input').value.trim();
                if (text) {
                    questions.push({
                        id: `tpl_${Date.now()}_${idx}`,
                        text: text,
                        order: idx + 1
                    });
                }
            });
            
            if (questions.length === 0) {
                if (window.globalToastManager) {
                    window.globalToastManager.show('error', chrome.i18n.getMessage('promptExtractQuestionsRequired') || '至少需要一个问题');
                }
                return;
            }
            
            // 保存
            const extractor = window.promptTemplateExtractor;
            const templateData = {
                suiteName,
                questions,
                sourceCount: result.sourceCount,
                folderId: folderId
            };
            
            const savedTemplate = await extractor.saveExtractedTemplate(templateData);
            
            // 同时转换为提示词
            const promptData = extractor.templateToPrompt(savedTemplate);
            await this.byaskjndg(promptData);
            
            if (window.globalToastManager) {
                window.globalToastManager.show('success', chrome.i18n.getMessage('promptExtractSaveSuccess') || '模板已保存');
            }
            
            // 刷新列表
            await this.loadPrompts();
            await this.loadTemplates();
            this.renderPromptList();
            
            // 关闭弹窗
            this._closeExtractModal(overlay);
        });
        
        // 关闭弹窗
        const closeModal = () => this._closeExtractModal(overlay);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
        
        // 显示动画
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
    }
    
    /**
     * 获取文件夹列表
     */
    async _getFolders() {
        try {
            const result = await chrome.storage.local.get('folders');
            return result.folders || [];
        } catch (e) {
            console.error('[PromptTab] Failed to get folders:', e);
            return [];
        }
    }
    
    /**
     * 加载提示词列表
     */
    async loadPrompts() {
        try {
            const result = await chrome.storage.local.get('prompts');
            this.setState('prompts', result.prompts || []);
        } catch (e) {
            console.error('[PromptTab] Failed to load prompts:', e);
            this.setState('prompts', []);
        }
    }
    
    /**
     * 保存提示词列表
     */
    async savePrompts() {
        try {
            const prompts = this.getState('prompts') || [];
            await chrome.storage.local.set({ prompts: prompts });
        } catch (e) {
            console.error('[PromptTab] Failed to save prompts:', e);
        }
    }
    
    /**
     * 从 storage 中获取最新的提示词列表（防止内存状态过期导致数据丢失）
     */
    async _getFreshPrompts() {
        try {
            const result = await chrome.storage.local.get('prompts');
            return result.prompts || [];
        } catch (e) {
            return this.getState('prompts') || [];
        }
    }
    
    /**
     * 根据 platformId 获取平台信息
     */
    _getPlatformInfo(platformId) {
        if (!platformId || typeof SITE_INFO === 'undefined') return null;
        return SITE_INFO.find(site => site.id === platformId) || null;
    }
    
    /**
     * 渲染提示词列表
     */
    renderPromptList() {
        const container = document.getElementById('prompt-list-container');
        if (!container) return;
        
        const prompts = this.getState('prompts') || [];
        
        if (prompts.length === 0) {
            container.innerHTML = `
                <div class="prompt-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    <span>${chrome.i18n.getMessage('hsiwhwl')}</span>
                </div>
            `;
            return;
        }
        
        // 排序：置顶的在前面
        const sortedPrompts = [...prompts].sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return 0;
        });
        
        const pinIcon = '<span class="prompt-pin-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="3" x2="19" y2="3"/><line x1="12" y1="7" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/></svg></span>';
        
        container.innerHTML = sortedPrompts.map((prompt) => {
            // 获取平台 logo
            const platform = this._getPlatformInfo(prompt.platformId);
            const platformLogo = platform ? `<img class="prompt-platform-logo" src="${chrome.runtime.getURL(platform.logoPath)}" alt="${platform.name}" title="${platform.name}">` : '';
            const promptName = this._escapeHtml(prompt.name || '');
            
            return `
            <div class="prompt-item ${prompt.pinned ? 'pinned' : ''}" data-id="${prompt.id}">
                <div class="prompt-item-content">
                    <div class="prompt-item-header">
                        <div class="prompt-item-name">${prompt.pinned ? pinIcon : ''}${platformLogo}<span class="prompt-item-name-text">${promptName}</span></div>
                        <div class="prompt-item-actions">
                            <button class="prompt-item-btn prompt-pin-btn ${prompt.pinned ? 'active' : ''}" data-id="${prompt.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <line x1="5" y1="3" x2="19" y2="3"/>
                                    <line x1="12" y1="7" x2="12" y2="21"/>
                                    <polyline points="8 11 12 7 16 11"/>
                                </svg>
                            </button>
                            <button class="prompt-item-btn prompt-edit-btn" data-id="${prompt.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="prompt-item-btn prompt-delete-btn" data-id="${prompt.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                            <button class="prompt-item-btn prompt-move-up-btn" data-id="${prompt.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="18 15 12 9 6 15"/>
                                </svg>
                            </button>
                            <button class="prompt-item-btn prompt-move-down-btn" data-id="${prompt.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="6 9 12 15 18 9"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="prompt-item-text"><span class="prompt-item-text-content">${this._escapeHtml(prompt.content)}</span></div>
                </div>
            </div>`;
        }).join('');
        
        // 绑定按钮事件
        this.bindPromptItemEvents();
    }
    
    /**
     * 绑定添加按钮事件
     */
    bindAddButtonEvent() {
        const addBtn = document.getElementById('prompt-add-btn');
        if (addBtn) {
            this.addEventListener(addBtn, 'click', () => {
                this.showPromptModal();
            });
        }
    }
    
    /**
     * 绑定提示词项的按钮事件
     */
    bindPromptItemEvents() {
        // 置顶按钮
        const pinBtns = document.querySelectorAll('.prompt-pin-btn');
        pinBtns.forEach(btn => {
            this.addEventListener(btn, 'click', (e) => {
                const id = btn.getAttribute('data-id');
                this.togglePin(id);
            });
            this.addEventListener(btn, 'mouseenter', () => {
                window.globalTooltipManager?.show('prompt-pin', 'button', btn, chrome.i18n.getMessage('pntotp') || '置顶');
            });
            this.addEventListener(btn, 'mouseleave', () => {
                window.globalTooltipManager?.hide();
            });
        });
        
        // 编辑按钮
        const editBtns = document.querySelectorAll('.prompt-edit-btn');
        editBtns.forEach(btn => {
            this.addEventListener(btn, 'click', (e) => {
                const id = btn.getAttribute('data-id');
                this.hsksuywm(id);
            });
            this.addEventListener(btn, 'mouseenter', () => {
                window.globalTooltipManager?.show('prompt-edit', 'button', btn, chrome.i18n.getMessage('vkpxzm') || '编辑');
            });
            this.addEventListener(btn, 'mouseleave', () => {
                window.globalTooltipManager?.hide();
            });
        });
        
        // 删除按钮
        const deleteBtns = document.querySelectorAll('.prompt-delete-btn');
        deleteBtns.forEach(btn => {
            this.addEventListener(btn, 'click', (e) => {
                const id = btn.getAttribute('data-id');
                this.deletePrompt(id);
            });
            this.addEventListener(btn, 'mouseenter', () => {
                window.globalTooltipManager?.show('prompt-delete', 'button', btn, chrome.i18n.getMessage('mzxvkp') || '删除');
            });
            this.addEventListener(btn, 'mouseleave', () => {
                window.globalTooltipManager?.hide();
            });
        });
        
        // 上移按钮
        const moveUpBtns = document.querySelectorAll('.prompt-move-up-btn');
        moveUpBtns.forEach(btn => {
            this.addEventListener(btn, 'click', (e) => {
                const id = btn.getAttribute('data-id');
                this.movePrompt(id, 'up');
            });
            this.addEventListener(btn, 'mouseenter', () => {
                window.globalTooltipManager?.show('prompt-move-up', 'button', btn, chrome.i18n.getMessage('mvupkt') || '上移');
            });
            this.addEventListener(btn, 'mouseleave', () => {
                window.globalTooltipManager?.hide();
            });
        });
        
        // 下移按钮
        const moveDownBtns = document.querySelectorAll('.prompt-move-down-btn');
        moveDownBtns.forEach(btn => {
            this.addEventListener(btn, 'click', (e) => {
                const id = btn.getAttribute('data-id');
                this.movePrompt(id, 'down');
            });
            this.addEventListener(btn, 'mouseenter', () => {
                window.globalTooltipManager?.show('prompt-move-down', 'button', btn, chrome.i18n.getMessage('mvdnkt') || '下移');
            });
            this.addEventListener(btn, 'mouseleave', () => {
                window.globalTooltipManager?.hide();
            });
        });
    }
    
    /**
     * 切换置顶状态
     */
    async togglePin(id) {
        const prompts = await this._getFreshPrompts();
        const index = prompts.findIndex(p => p.id === id);
        
        if (index !== -1) {
            const isPinned = prompts[index].pinned;
            prompts[index].pinned = !isPinned;
            
            this.setState('prompts', prompts);
            await this.savePrompts();
            this.renderPromptList();
            
            // 显示提示
            if (window.globalToastManager) {
                const message = prompts[index].pinned 
                    ? (chrome.i18n.getMessage('pmpknd'))
                    : (chrome.i18n.getMessage('pmuknp'));
                window.globalToastManager.show('success', message);
            }
        }
    }
    
    /**
     * 移动提示词位置
     * @param {string} id - 提示词 ID
     * @param {string} direction - 移动方向：'up' 或 'down'
     */
    async movePrompt(id, direction) {
        const prompts = await this._getFreshPrompts();
        const index = prompts.findIndex(p => p.id === id);
        
        if (index === -1) return;
        
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        
        // 边界检查
        if (targetIndex < 0 || targetIndex >= prompts.length) {
            return;
        }
        
        // 交换位置
        [prompts[index], prompts[targetIndex]] = [prompts[targetIndex], prompts[index]];
        
        this.setState('prompts', prompts);
        await this.savePrompts();
        this.renderPromptList();
    }
    
    /**
     * 获取支持智能输入的平台列表
     */
    _getSmartInputPlatforms() {
        // id 为空表示全部平台
        const platforms = [{ id: '', name: chrome.i18n.getMessage('allptfm') }];
        if (typeof SITE_INFO !== 'undefined') {
            SITE_INFO.forEach(site => {
                if (site.features?.smartInput === true) {
                    platforms.push({ id: site.id, name: site.name });
                }
            });
        }
        return platforms;
    }
    
    /**
     * 显示提示词编辑弹窗
     */
    showPromptModal(prompt = null) {
        const isEdit = !!prompt;
        const title = isEdit 
            ? (chrome.i18n.getMessage('hsksuywm'))
            : (chrome.i18n.getMessage('byaskjndg'));
        
        // 获取平台列表
        const platforms = this._getSmartInputPlatforms();
        const currentPlatformId = prompt?.platformId || '';
        const currentPlatform = platforms.find(p => p.id === currentPlatformId) || platforms[0];
        
        // 创建自定义弹窗
        const overlay = document.createElement('div');
        overlay.className = 'prompt-modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'prompt-modal';
        
        modal.innerHTML = `
            <div class="prompt-modal-header">
                <h3>${title}</h3>
                <button class="prompt-modal-close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="prompt-modal-body">
                <div class="prompt-modal-field">
                    <label>${chrome.i18n.getMessage('hsuywkw')}<span class="required-mark">*</span></label>
                    <input type="text" class="prompt-modal-input" id="prompt-name-input"
                        placeholder="${chrome.i18n.getMessage('hsuywkwPlaceholder')}"
                        maxlength="16" value="${this._escapeHtml(prompt?.name || '')}">
                </div>
                <div class="prompt-modal-field">
                    <label>${chrome.i18n.getMessage('promptContent')}<span class="required-mark">*</span></label>
                    <textarea class="prompt-modal-textarea" id="prompt-content-input"
                        placeholder="${chrome.i18n.getMessage('uwkjwjw')}"
                        rows="4" maxlength="10000">${this._escapeHtml(prompt?.content || '')}</textarea>
                    <div class="prompt-char-counter">
                        <div class="prompt-platform-select" id="prompt-platform-select">
                            <span class="prompt-platform-label">${chrome.i18n.getMessage('ptfmsl')}：</span>
                            <span class="prompt-platform-select-text">${currentPlatform.name}</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </div>
                        <span><span id="prompt-char-count">${prompt?.content?.length || 0}</span>/10000</span>
                    </div>
                </div>
            </div>
            <div class="prompt-modal-footer">
                <button class="prompt-modal-btn prompt-modal-cancel">${chrome.i18n.getMessage('pxvkmz')}</button>
                <button class="prompt-modal-btn prompt-modal-confirm">${chrome.i18n.getMessage('svkbtn')}</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // 获取元素
        const nameInput = modal.querySelector('#prompt-name-input');
        const contentInput = modal.querySelector('#prompt-content-input');
        const charCount = modal.querySelector('#prompt-char-count');
        const closeBtn = modal.querySelector('.prompt-modal-close');
        const cancelBtn = modal.querySelector('.prompt-modal-cancel');
        const confirmBtn = modal.querySelector('.prompt-modal-confirm');
        const platformSelect = modal.querySelector('#prompt-platform-select');
        const platformText = platformSelect.querySelector('.prompt-platform-select-text');
        
        // 当前选中的平台 ID
        let selectedPlatformId = currentPlatformId;
        
        // 自动调整高度函数
        const autoResize = () => {
            contentInput.style.height = 'auto';
            const newHeight = Math.min(contentInput.scrollHeight, 200);
            contentInput.style.height = newHeight + 'px';
        };
        
        // 字符计数更新 + 自动调整高度
        contentInput.addEventListener('input', () => {
            charCount.textContent = contentInput.value.length;
            autoResize();
        });
        
        // 初始化高度（编辑时内容可能已存在）
        autoResize();
        
        // 平台选择器点击
        platformSelect.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.globalDropdownManager) {
                const items = platforms.map(p => ({
                    label: p.name,
                    onClick: () => {
                        selectedPlatformId = p.id;
                        platformText.textContent = p.name;
                    }
                }));
                
                window.globalDropdownManager.show({
                    trigger: platformSelect,
                    items: items,
                    position: 'bottom-left',
                    width: Math.max(150, platformSelect.offsetWidth)
                });
            }
        });
        
        // 显示动画
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
        
        // 关闭弹窗
        const closeModal = () => {
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 200);
        };
        
        // 保存
        const savePrompt = async () => {
            const name = nameInput.value.trim();
            const content = contentInput.value.trim();
            
            // 验证名称
            if (!name) {
                if (window.globalToastManager) {
                    window.globalToastManager.show('error', chrome.i18n.getMessage('zmxvkp'));
                }
                nameInput.focus();
                return;
            }
            
            // 验证内容
            if (!content) {
                if (window.globalToastManager) {
                    window.globalToastManager.show('error', chrome.i18n.getMessage('zmxvkp'));
                }
                contentInput.focus();
                return;
            }
            
            // 保存
            if (isEdit) {
                await this.updatePrompt(prompt.id, { name, content, platformId: selectedPlatformId });
            } else {
                await this.byaskjndg({ name, content, platformId: selectedPlatformId });
            }
            
            closeModal();
        };
        
        // 事件绑定
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        confirmBtn.addEventListener('click', savePrompt);
    }
    
    /**
     * 添加提示词
     */
    async byaskjndg(values) {
        const prompts = await this._getFreshPrompts();
        const newPrompt = {
            id: Date.now().toString(),
            name: values.name?.trim() || '',
            content: values.content.trim(),
            platformId: values.platformId || '',
            createdAt: Date.now()
        };
        
        prompts.push(newPrompt);
        this.setState('prompts', prompts);
        
        await this.savePrompts();
        this.renderPromptList();
        
        // 显示成功提示
        if (window.globalToastManager) {
            window.globalToastManager.show('success', chrome.i18n.getMessage('shwsuwk'));
        }
    }
    
    /**
     * 编辑提示词
     */
    hsksuywm(id) {
        const prompts = this.getState('prompts') || [];
        const prompt = prompts.find(p => p.id === id);
        if (prompt) {
            this.showPromptModal(prompt);
        }
    }
    
    /**
     * 更新提示词
     */
    async updatePrompt(id, values) {
        const prompts = await this._getFreshPrompts();
        const index = prompts.findIndex(p => p.id === id);
        
        if (index !== -1) {
            prompts[index] = {
                ...prompts[index],
                name: values.name !== undefined ? values.name.trim() : (prompts[index].name || ''),
                content: values.content.trim(),
                platformId: values.platformId !== undefined ? values.platformId : (prompts[index].platformId || ''),
                updatedAt: Date.now()
            };
            
            this.setState('prompts', prompts);
            await this.savePrompts();
            this.renderPromptList();
            
            // 显示成功提示
            if (window.globalToastManager) {
                window.globalToastManager.show('success', chrome.i18n.getMessage('hwkwbhwk'));
            }
        }
    }
    
    /**
     * 删除提示词
     */
    async deletePrompt(id) {
        const prompts = await this._getFreshPrompts();
        const prompt = prompts.find(p => p.id === id);
        
        // 使用确认弹窗
        if (window.globalPopconfirmManager) {
            const confirmed = await window.globalPopconfirmManager.show({
                title: chrome.i18n.getMessage('dcnfmq'),
                confirmText: chrome.i18n.getMessage('mzxvkp'),
                cancelText: chrome.i18n.getMessage('pxvkmz'),
                confirmTextType: 'danger'
            });
            
            if (confirmed) {
                const newPrompts = prompts.filter(p => p.id !== id);
                this.setState('prompts', newPrompts);
                await this.savePrompts();
                this.renderPromptList();
                
                // 显示成功提示
                if (window.globalToastManager) {
                    window.globalToastManager.show('success', chrome.i18n.getMessage('qrtypd'));
                }
            }
        }
    }
    
    async _showPlatformManageModal() {
        const platforms = getPlatformsByFeature('smartInput');
        const result = await chrome.storage.local.get('promptButtonPlatformSettings');
        const settings = result.promptButtonPlatformSettings || {};

        const overlay = document.createElement('div');
        overlay.className = 'starred-platform-modal-overlay';

        const items = platforms.map(p => {
            const logoHtml = p.logoPath
                ? `<img src="${chrome.runtime.getURL(p.logoPath)}" alt="${p.name}">`
                : `<span>${p.name.charAt(0)}</span>`;
            return `
                <div class="starred-platform-item">
                    <div class="starred-platform-info">
                        <div class="starred-platform-logo">${logoHtml}</div>
                        <span class="starred-platform-name">${p.name}</span>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" data-platform-id="${p.id}" ${settings[p.id] !== false ? 'checked' : ''}>
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>`;
        }).join('');

        overlay.innerHTML = `
            <div class="starred-platform-modal">
                <div class="starred-platform-modal-header">
                    <span>${chrome.i18n.getMessage('mkvzpx')}</span>
                    <button class="starred-platform-modal-close">✕</button>
                </div>
                <div class="starred-platform-modal-body">${items}</div>
            </div>`;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('.starred-platform-modal-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelectorAll('input[data-platform-id]').forEach(cb => {
            cb.addEventListener('change', async () => {
                const cur = (await chrome.storage.local.get('promptButtonPlatformSettings')).promptButtonPlatformSettings || {};
                cur[cb.dataset.platformId] = cb.checked;
                await chrome.storage.local.set({ promptButtonPlatformSettings: cur });
            });
        });
    }
    
    /**
     * 截断文本
     */
    _truncate(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
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
    
    /**
     * Tab 卸载时清理
     */
    unmounted() {
        super.unmounted();
    }
}
