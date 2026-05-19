/**
 * Question List Panel
 *
 * 嵌入时间轴 wrapper 内，与 timeline-bar 互斥切换显示。
 * 支持：序号、单行省略、当前激活高亮、收藏状态展示与切换、长按标记📌、点击跳转。
 */
class QuestionListPopup {
    constructor() {
        this._el = null;
        this._listEl = null;
        this._visible = false;
        this._timelineBar = null;
        this._wrapper = null;
        this._boundOnActiveChange = this._onActiveChange.bind(this);
        this._boundOnClickOutside = this._onClickOutside.bind(this);
    }

    get visible() { return this._visible; }

    /**
     * 绑定时间轴 UI 引用（由 TimelineManager 调用）
     */
    bind(wrapper, timelineBar) {
        this._wrapper = wrapper;
        this._timelineBar = timelineBar;
    }

    toggle() {
        if (this._visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        const tm = window.timelineManager;
        if (!tm || !tm.markers || tm.markers.length === 0) return;
        if (!this._wrapper || !this._timelineBar) return;

        this.hide();

        // 创建面板 DOM
        this._el = document.createElement('div');
        this._el.className = 'ait-question-list-popup';

        // Header
        const header = document.createElement('div');
        header.className = 'ait-ql-header';

        const title = document.createElement('span');
        title.className = 'ait-ql-title';
        title.textContent = chrome.i18n.getMessage('questionListTitle') || 'Questions';

        const headerRight = document.createElement('div');
        headerRight.className = 'ait-ql-header-right';

        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'ait-ql-settings';
        settingsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
            if (window.panelModal) {
                window.panelModal.show('timeline');
            }
        });

        headerRight.appendChild(settingsBtn);

        header.appendChild(title);
        header.appendChild(headerRight);

        // List
        this._listEl = document.createElement('div');
        this._listEl.className = 'ait-ql-list';
        this._renderItems(tm);

        this._el.appendChild(header);
        this._el.appendChild(this._listEl);

        // 同步高度：与 timeline-bar 一致
        const barHeight = this._timelineBar.style.height;
        if (barHeight) {
            this._el.style.height = barHeight;
        }

        // 插入到 wrapper 内，timeline-bar 之前
        this._wrapper.insertBefore(this._el, this._timelineBar);

        // 隐藏 timeline-bar
        this._timelineBar.style.display = 'none';

        this._visible = true;

        // 监听时间轴激活节点变化
        window.addEventListener('timeline:activeChange', this._boundOnActiveChange);

        // 点击外部区域关闭
        setTimeout(() => {
            document.addEventListener('click', this._boundOnClickOutside, true);
        }, 0);

        // 按钮高亮
        if (tm.ui && tm.ui.questionListBtn) {
            tm.ui.questionListBtn.classList.add('active');
        }

        this._scrollActiveIntoView();
    }

    hide() {
        window.removeEventListener('timeline:activeChange', this._boundOnActiveChange);
        document.removeEventListener('click', this._boundOnClickOutside, true);
        if (this._el) {
            this._el.remove();
            this._el = null;
            this._listEl = null;
        }

        // 恢复 timeline-bar
        if (this._timelineBar) {
            this._timelineBar.style.display = '';
        }

        this._visible = false;

        // 取消按钮高亮
        const tm = window.timelineManager;
        if (tm && tm.ui && tm.ui.questionListBtn) {
            tm.ui.questionListBtn.classList.remove('active');
        }
    }

    _renderItems(tm) {
        if (!this._listEl) return;
        this._listEl.innerHTML = '';

        if (tm.markers.length === 0) {
            this._listEl.innerHTML = `<div class="ait-ql-empty">${chrome.i18n.getMessage('questionListEmpty') || 'No questions yet'}</div>`;
            return;
        }

        const frag = document.createDocumentFragment();

        tm.markers.forEach((marker, i) => {
            const item = document.createElement('div');
            item.className = 'ait-ql-item';
            if (marker.id === tm.activeTurnId) item.classList.add('active');
            item.dataset.index = i;
            item.dataset.turnId = marker.id;

            const idx = document.createElement('span');
            idx.className = 'ait-ql-item-index';
            idx.textContent = `Q${i + 1}`;

            const text = document.createElement('span');
            text.className = 'ait-ql-item-text';
            text.textContent = marker.summary || '...';

            // Pin icon
            const isPinned = tm.pinned.has(marker.id);
            const pin = document.createElement('span');
            pin.className = 'ait-ql-item-pin';
            if (!isPinned) pin.classList.add('not-pinned');
            const pinTip = () => tm.pinned.has(marker.id)
                ? (chrome.i18n.getMessage('unpinAction') || '取消标记重点')
                : (chrome.i18n.getMessage('pinAction') || '标记重点');
            pin.addEventListener('click', async (e) => {
                e.stopPropagation();
                const ok = await tm.togglePin(marker.id);
                if (ok) {
                    pin.classList.toggle('not-pinned', !tm.pinned.has(marker.id));
                }
            });
            pin.addEventListener('mouseenter', () => {
                window.globalTooltipManager.show(`ql-pin-${i}`, 'button', pin, pinTip(), { placement: 'top' });
            });
            pin.addEventListener('mouseleave', () => { window.globalTooltipManager.hide(); });

            // Star icon
            const isStarred = tm.starred.has(marker.id);
            const starTip = () => tm.starred.has(marker.id)
                ? (chrome.i18n.getMessage('unstarAction') || '取消收藏')
                : (chrome.i18n.getMessage('starAction') || '收藏到文件夹');
            const star = document.createElement('span');
            star.className = 'ait-ql-item-star';
            if (!isStarred) star.classList.add('not-starred');
            star.dataset.turnId = marker.id;
            star.addEventListener('click', async (e) => {
                e.stopPropagation();
                const result = await tm.toggleStar(marker.id);
                if (result?.success) {
                    star.classList.toggle('not-starred', !tm.starred.has(marker.id));
                }
            });
            star.addEventListener('mouseenter', () => {
                window.globalTooltipManager.show(`ql-star-${i}`, 'button', star, starTip(), { placement: 'top' });
            });
            star.addEventListener('mouseleave', () => { window.globalTooltipManager.hide(); });

            text.addEventListener('mouseenter', () => {
                if (text.scrollWidth > text.clientWidth) {
                    const dotEl = marker.dotElement;
                    const el = dotEl && tm
                        ? tm._buildNodeTooltipElement(dotEl, marker.summary || '')
                        : this._buildItemTooltipElement(marker);
                    window.globalTooltipManager.show(
                        `ql-item-${i}`,
                        'node',
                        item,
                        { element: el },
                        { placement: 'left', maxWidth: 320 }
                    );
                }
            });
            text.addEventListener('mouseleave', () => {
                window.globalTooltipManager.hide();
            });

            item.addEventListener('click', () => {
                tm.scrollToIndex(i);
                this._updateActiveItem(marker.id);
            });

            item.appendChild(idx);
            item.appendChild(text);
            item.appendChild(pin);
            item.appendChild(star);
            frag.appendChild(item);
        });

        this._listEl.appendChild(frag);
    }

    _updateActiveItem(turnId) {
        if (!this._listEl) return;
        this._listEl.querySelectorAll('.ait-ql-item.active').forEach(el => el.classList.remove('active'));
        const item = this._listEl.querySelector(`.ait-ql-item[data-turn-id="${turnId}"]`);
        if (item) item.classList.add('active');
    }

    _scrollActiveIntoView() {
        if (!this._listEl) return;
        const activeItem = this._listEl.querySelector('.ait-ql-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
    }
    // ✅ 插入文本到AI输入框
    _insertToAIInput(text) {
        try {
            const adapter = window.smartEnterAdapterRegistry?.getAdapter?.();
            let inputElement = null;
            
            if (adapter) {
                const selector = adapter.getInputSelector?.();
                if (selector) {
                    inputElement = document.querySelector(selector);
                }
            }
            
            if (!inputElement) {
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
                    if (el && el.offsetParent !== null) {
                        inputElement = el;
                        break;
                    }
                }
            }
            
            if (!inputElement) {
                console.warn('[QuestionList] 未找到AI输入框');
                return;
            }

            inputElement.focus();
            if (inputElement.isContentEditable) {
                inputElement.textContent = text;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                inputElement.value = text;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            }
            console.log('[QuestionList] 已将合并文本插入到AI输入框');
        } catch (e) {
            console.error('[QuestionList] 插入AI输入框失败:', e);
        }
    }

    // ✅ 触发炼化流程
    async _triggerRefineFlow(markers, folderName) {
        try {
            // 构建系统级深度分析prompt
            const questionsText = markers.map((m, i) => `${i + 1}. ${m.summary || ''}`).join('\n');
            
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

            // 插入到AI输入框并自动发送
            const adapter = window.smartEnterAdapterRegistry?.getAdapter?.();
            let inputElement = null;
            
            if (adapter) {
                const selector = adapter.getInputSelector?.();
                if (selector) {
                    inputElement = document.querySelector(selector);
                }
            }
            
            if (!inputElement) {
                const selectors = [
                    '#prompt-textarea',
                    'textarea[placeholder*="问"]',
                    'textarea[placeholder*="message"]',
                    'div[contenteditable="true"]',
                    '[role="textbox"]',
                    'textarea'
                ];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el && el.offsetParent !== null) {
                        inputElement = el;
                        break;
                    }
                }
            }
            
            if (!inputElement) {
                console.warn('[QuestionList] 未找到输入框用于炼化');
                return;
            }

            // 插入prompt
            inputElement.focus();
            if (inputElement.isContentEditable) {
                inputElement.textContent = refinedPrompt;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                inputElement.value = refinedPrompt;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // 自动发送
            setTimeout(async () => {
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
                    
                    // 等待AI回复并保存到提示词
                    this._waitAndSaveAIResponse(folderName, markers.length);
                } catch (e) {
                    console.error('[QuestionList] 自动发送失败:', e);
                }
            }, 500);

            if (window.globalToastManager) {
                window.globalToastManager.info(`已将炼化提示词插入并自动发送，AI回复将自动保存到提示词`);
            }
        } catch (e) {
            console.error('[QuestionList] 触发炼化流程失败:', e);
        }
    }

    // ✅ 查找发送按钮
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

    // ✅ 等待AI回复并保存到提示词
    async _waitAndSaveAIResponse(folderName, questionCount) {
        const MAX_WAIT = 180000; // 180秒
        const POLL_INTERVAL = 3000;
        const startTime = Date.now();
        
        const checkComplete = () => {
            const elapsed = Date.now() - startTime;
            
            // 获取最新AI回复
            const response = this._getLatestAIResponse();
            if (response && response.length > 200) {
                // 检查是否包含完成标记
                const hasCompleteMarkers = (
                    response.includes('完整Skill提示词') ||
                    response.includes('层层深入') ||
                    response.includes('提问框架')
                );
                
                // 如果内容稳定，认为完成
                if (hasCompleteMarkers && response.length > 500) {
                    return response;
                }
            }
            
            if (elapsed >= MAX_WAIT) {
                // 超时，返回已获取的最长内容
                const lastResponse = this._getLatestAIResponse();
                return lastResponse?.length > 200 ? lastResponse : null;
            }
            
            return null;
        };
        
        // 轮询等待
        const response = await new Promise((resolve) => {
            let lastLength = 0;
            let stableCount = 0;
            
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
                
                const result = checkComplete();
                if (result || (stableCount >= 3 && currentLength > 500)) {
                    clearInterval(poll);
                    resolve(result || currentResponse);
                }
                
                if (Date.now() - startTime >= MAX_WAIT) {
                    clearInterval(poll);
                    resolve(currentResponse || null);
                }
            }, POLL_INTERVAL);
        });
        
        // 保存AI回复到提示词
        if (response && response.trim().length > 100) {
            await this._saveAIResponseToPrompts(response, folderName, questionCount);
        }
    }

    // ✅ 获取最新AI回复
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
        
        // 备选选择器
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

    // ✅ 解析AI炼化回复，提取完整Skill提示词和层层深入提问模板
    _parseRefinedSections(responseText) {
        const result = { skillPrompt: null, templates: [] };

        const sections = responseText.split(/(?=###\s)/);

        for (const section of sections) {
            const trimmed = section.trim();

            if (/^###\s*完整Skill提示词/i.test(trimmed)) {
                result.skillPrompt = trimmed
                    .replace(/^###\s*完整Skill提示词\s*\n*/i, '')
                    .trim();
            }

            if (/^###\s*层层深入提问模板/i.test(trimmed)) {
                const templateBody = trimmed
                    .replace(/^###\s*层层深入提问模板\s*\n*/i, '')
                    .trim();

                const lines = templateBody.split('\n');
                for (const line of lines) {
                    const cleaned = line
                        .replace(/^\d+[\.\、\)）:：]\s*/, '')
                        .trim();
                    const contentOnly = cleaned.replace(/^\[.+\][：:]?\s*/, '').trim();
                    if (contentOnly.length >= 5) {
                        result.templates.push(contentOnly);
                    } else if (cleaned.length >= 5) {
                        result.templates.push(cleaned);
                    }
                }
            }
        }

        return result;
    }

    // ✅ 保存AI回复到提示词 — 解析完整回复并分层保存
    async _saveAIResponseToPrompts(responseText, folderName, questionCount) {
        try {
            const result = await chrome.storage.local.get('prompts');
            const prompts = result.prompts || [];
            const baseTime = Date.now();
            const timestamp = new Date().toLocaleString('zh-CN');

            // 1. 保存完整AI回复
            prompts.push({
                id: `refined_${baseTime}`,
                name: `${folderName}_炼化结果_${timestamp}`.substring(0, 50),
                content: responseText,
                platformId: '',
                createdAt: baseTime,
                source: 'refined',
                sourceFolder: folderName,
                questionCount
            });

            // 2. 解析并分层保存
            const parsed = this._parseRefinedSections(responseText);

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

            const templateCount = parsed.templates.length;
            console.log('[QuestionList] AI回复已保存到提示词，共', 1 + (parsed.skillPrompt ? 1 : 0) + templateCount, '条');
            if (window.globalToastManager) {
                window.globalToastManager.success(
                    `"${folderName}" 炼化完成，已保存 ${templateCount} 条提问模板到提示词`
                );
            }
        } catch (e) {
            console.error('[QuestionList] 保存AI回复到提示词失败:', e);
        }
    }

    _buildItemTooltipElement(marker) {
        const container = document.createElement('div');
        container.className = 'timeline-tooltip-container';

        const contentWrap = document.createElement('div');
        contentWrap.className = 'timeline-tooltip-content-wrap';

        const timeStr = marker.element?.getAttribute('data-ait-time');
        if (timeStr) {
            const timeTag = document.createElement('span');
            timeTag.className = 'timeline-tooltip-time';
            timeTag.textContent = timeStr;
            contentWrap.appendChild(timeTag);
        }

        const content = document.createElement('div');
        content.className = 'timeline-tooltip-content';
        content.style.pointerEvents = 'none';
        content.textContent = marker.summary || '';

        contentWrap.appendChild(content);
        container.appendChild(contentWrap);
        return container;
    }

    _onClickOutside(e) {
        if (!this._visible || !this._el) return;
        if (this._el.contains(e.target)) return;
        const tm = window.timelineManager;
        if (tm?.ui?.questionListBtn?.contains(e.target)) return;
        this.hide();
    }

    _onActiveChange(e) {
        if (!this._visible) return;
        const tm = window.timelineManager;
        if (!tm || !tm.markers) return;
        const idx = e.detail?.currentIndex;
        if (idx == null || idx < 0 || idx >= tm.markers.length) return;
        const turnId = tm.markers[idx].id;
        this._updateActiveItem(turnId);
        this._scrollActiveIntoView();
    }

    onMarkersRebuilt() {
        if (!this._visible || !this._listEl) return;
        const tm = window.timelineManager;
        if (!tm || !tm.markers || tm.markers.length === 0) {
            this.hide();
            return;
        }

        const scrollTop = this._listEl.scrollTop;
        this._renderItems(tm);
        this._listEl.scrollTop = scrollTop;
    }
}

if (typeof window.questionListPopup === 'undefined') {
    window.questionListPopup = new QuestionListPopup();
}
