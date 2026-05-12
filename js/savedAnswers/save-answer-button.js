/**
 * Save Answer Button Injector - 在AI回答区域注入"保存回答"按钮
 *
 * 在每条AI回答下方添加保存按钮，风格与平台原生按钮（复制/分享等）保持一致
 */

class SaveAnswerButtonInjector {
    static BUTTON_CLASS = 'ait-save-answer-btn';
    static BUTTON_SAVED_CLASS = 'ait-save-answer-btn--saved';
    static PROCESSED_ATTR = 'data-ait-save-processed';
    static INJECT_DELAY = 1000;
    static OBSERVER_DEBOUNCE = 500;

    constructor() {
        this._observer = null;
        this._adapter = null;
        this._debounceTimer = null;
        this._isDestroyed = false;
    }

    /**
     * 启动注入
     */
    async init() {
        try {
            this._adapter = window.smartEnterAdapterRegistry?.getAdapter?.();
        } catch (e) {}

        await this._injectAllButtons();

        // 监听DOM变化，自动为新回答添加按钮
        if (window.DOMObserverManager) {
            this._observer = window.DOMObserverManager.getInstance().subscribeBody(
                'save-answer-btn',
                {
                    callback: () => this._onDOMChange(),
                    debounce: SaveAnswerButtonInjector.OBSERVER_DEBOUNCE
                }
            );
        }
    }

    /**
     * DOM变化处理
     */
    _onDOMChange() {
        if (this._isDestroyed) return;
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._injectAllButtons();
        }, SaveAnswerButtonInjector.OBSERVER_DEBOUNCE);
    }

    /**
     * 为所有AI回答注入按钮
     */
    async _injectAllButtons() {
        if (this._isDestroyed) return;

        // 获取AI回答元素
        const aiMessages = this._getAIMessages();
        if (!aiMessages || aiMessages.length === 0) return;

        for (const msgEl of aiMessages) {
            if (msgEl.hasAttribute(SaveAnswerButtonInjector.PROCESSED_ATTR)) continue;

            // 检查是否已有按钮
            if (msgEl.querySelector(`.${SaveAnswerButtonInjector.BUTTON_CLASS}`)) {
                msgEl.setAttribute(SaveAnswerButtonInjector.PROCESSED_ATTR, 'true');
                continue;
            }

            this._injectButton(msgEl);
            msgEl.setAttribute(SaveAnswerButtonInjector.PROCESSED_ATTR, 'true');
        }
    }

    /**
     * 获取所有AI回答元素
     */
    _getAIMessages() {
        const selectors = [
            '[data-message-author-role="assistant"]',
            '[data-role="assistant"]',
            '.markdown-body',
            '[data-testid*="conversation-turn"]',
            '.claude-message'
        ];

        // 优先使用适配器的选择器
        if (this._adapter) {
            try {
                const aiSelector = this._adapter.getAIMessageSelector?.();
                if (aiSelector) {
                    const elements = document.querySelectorAll(aiSelector);
                    if (elements.length > 0) return Array.from(elements);
                }
            } catch (e) {}
        }

        for (const sel of selectors) {
            const elements = document.querySelectorAll(sel);
            if (elements.length > 0) return Array.from(elements);
        }

        return [];
    }

    /**
     * 在单个AI回答元素中注入按钮
     */
    _injectButton(msgEl) {
        // 查找按钮容器（通常包含复制、分享等按钮）
        const actionBar = this._findActionBar(msgEl);

        const btn = document.createElement('button');
        btn.className = SaveAnswerButtonInjector.BUTTON_CLASS;
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
        `;
        btn.title = '保存回答';
        btn.setAttribute('aria-label', '保存回答');

        // 获取回答内容用于保存
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this._handleSaveClick(btn, msgEl);
        });

        if (actionBar) {
            actionBar.appendChild(btn);
        } else {
            // 没有动作栏，创建简单容器附加到消息末尾
            const container = document.createElement('div');
            container.className = 'ait-save-answer-container';
            container.style.cssText = 'display:flex;justify-content:flex-end;margin-top:8px;gap:8px;';
            container.appendChild(btn);
            msgEl.appendChild(container);
        }
    }

    /**
     * 查找动作栏容器
     */
    _findActionBar(msgEl) {
        // 常见平台的动作栏选择器
        const selectors = [
            '.flex.items-center.gap-1',          // 通用
            '[class*="action"]',                  // 包含action的类
            '[class*="toolbar"]',                 // 包含toolbar的类
            'div:last-child > div:last-child',    // 最后一个div的最后一个子div
            '.flex-wrap.items-center',
            '.message-actions',
            '.response-actions'
        ];

        for (const sel of selectors) {
            try {
                const el = msgEl.querySelector(sel);
                if (el && el.querySelector('button, svg')) {
                    return el;
                }
            } catch (e) {}
        }

        return null;
    }

    /**
     * 处理保存按钮点击
     */
    async _handleSaveClick(btn, msgEl) {
        // 防重复
        if (btn.disabled) return;

        // 弹出确认对话框
        const confirmed = await this._showConfirmDialog();
        if (!confirmed) return;

        btn.disabled = true;
        btn.classList.add('ait-save-answer-btn--loading');

        try {
            const content = this._extractAnswerContent(msgEl);
            const question = this._extractRelatedQuestion(msgEl);
            const turnId = this._extractTurnId(msgEl);

            const manager = window.savedAnswersManager;
            if (!manager) {
                throw new Error('保存管理器未初始化');
            }

            await manager.saveAnswer({
                content,
                question,
                turnId,
                url: location.href,
                platform: manager._detectPlatform()
            });

            // 成功反馈
            btn.classList.remove('ait-save-answer-btn--loading');
            btn.classList.add(SaveAnswerButtonInjector.BUTTON_SAVED_CLASS);
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            `;
            btn.title = '已保存';

            if (window.globalToastManager) {
                window.globalToastManager.show('success', '回答已成功保存');
            }

            // 3秒后恢复正常状态
            setTimeout(() => {
                btn.classList.remove(SaveAnswerButtonInjector.BUTTON_SAVED_CLASS);
                btn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                    </svg>
                `;
                btn.title = '保存回答';
            }, 3000);

        } catch (e) {
            btn.disabled = false;
            btn.classList.remove('ait-save-answer-btn--loading');

            if (e.message === '该回答正在保存中，请勿重复操作') {
                if (window.globalToastManager) {
                    window.globalToastManager.show('warning', e.message);
                }
            } else {
                console.error('[SaveAnswerBtn] 保存失败:', e);
                if (window.globalToastManager) {
                    window.globalToastManager.show('error', '保存失败: ' + (e.message || '未知错误'));
                }
            }
        } finally {
            btn.disabled = false;
        }
    }

    /**
     * 显示确认对话框
     */
    async _showConfirmDialog() {
        if (window.globalPopconfirmManager) {
            return await window.globalPopconfirmManager.show({
                title: '确定保存当前回答内容吗？',
                confirmText: '确定',
                cancelText: '取消',
                confirmTextType: 'primary'
            });
        }
        // 降级方案
        return confirm('确定保存当前回答内容吗？');
    }

    /**
     * 提取回答文本内容
     */
    _extractAnswerContent(msgEl) {
        // 优先使用适配器
        if (this._adapter) {
            try {
                const text = this._adapter.extractText?.(msgEl);
                if (text) return text;
            } catch (e) {}
        }

        // 获取纯文本
        const clone = msgEl.cloneNode(true);
        // 移除代码块和按钮等无关元素
        clone.querySelectorAll('button, .ait-save-answer-btn, .ait-save-answer-container, script, style')
            .forEach(el => el.remove());

        return (clone.textContent || '').trim();
    }

    /**
     * 提取关联的问题文本
     */
    _extractRelatedQuestion(msgEl) {
        try {
            // 查找前一个用户消息
            if (this._adapter) {
                const userSelector = this._adapter.getUserMessageSelector?.();
                if (userSelector) {
                    const userMessages = document.querySelectorAll(userSelector);
                    const msgRect = msgEl.getBoundingClientRect();

                    for (let i = userMessages.length - 1; i >= 0; i--) {
                        const userRect = userMessages[i].getBoundingClientRect();
                        if (userRect.top < msgRect.top) {
                            return (userMessages[i].textContent || '').trim().substring(0, 200);
                        }
                    }
                }
            }
        } catch (e) {}
        return '';
    }

    /**
     * 提取轮次ID
     */
    _extractTurnId(msgEl) {
        return msgEl.getAttribute('data-turn-id') ||
               msgEl.getAttribute('data-message-id') ||
               msgEl.getAttribute('data-conversation-turn') ||
               `msg_${Date.now()}`;
    }

    /**
     * 销毁
     */
    destroy() {
        this._isDestroyed = true;
        if (this._observer) {
            try { this._observer(); } catch (e) {}
            this._observer = null;
        }
        clearTimeout(this._debounceTimer);

        // 移除所有按钮
        document.querySelectorAll(`.${SaveAnswerButtonInjector.BUTTON_CLASS}`)
            .forEach(btn => btn.remove());
        document.querySelectorAll('.ait-save-answer-container')
            .forEach(el => el.remove());
        document.querySelectorAll(`[${SaveAnswerButtonInjector.PROCESSED_ATTR}]`)
            .forEach(el => el.removeAttribute(SaveAnswerButtonInjector.PROCESSED_ATTR));
    }
}

// 导出
if (typeof window.saveAnswerButtonInjector === 'undefined') {
    window.saveAnswerButtonInjector = new SaveAnswerButtonInjector();
}
