/**
 * Prompt Template Extractor - 提示词模板提取器
 * 
 * 功能：根据收藏夹中的问题，自动提炼出可复用的提问模板
 * 
 * [新功能] 2024-xx 用户需求
 * - 用户收藏了多个关于某个主题的问题
 * - 希望 AI 分析这些问题，提炼出逻辑清晰的提问模板
 * - 输出顺序可能与输入顺序不同（根据整体逻辑重新组织）
 * - 每个提炼出的问题作为一个独立的提示词保存
 */

/**
 * 从收藏夹问题中提炼提问模板
 * @param {Array} questions - 收藏的问题列表，每个元素有 theme 属性
 * @param {Object} options - 配置选项
 * @param {string} options.folderName - 文件夹名称（用于命名提示词组）
 * @returns {Promise<Array>} - 提炼出的提示词列表
 */
async function extractPromptTemplates(questions, options = {}) {
    // folderName 参数保留用于未来扩展（如自定义 AI prompt）
    // eslint-disable-next-line no-unused-vars
    const _folderName = options.folderName || '未命名模板';
    
    if (!questions || questions.length === 0) {
        return [];
    }
    
    // 构建发送给 AI 的 prompt
    const questionsText = questions
        .map((q, i) => `${i + 1}. ${q.theme || q.question || ''}`)
        .join('\n');
    
    const systemPrompt = `你是一个专业的提问设计师，擅长从具体问题中提炼出可复用的提问模板。

## 任务
分析用户提供的多个问题，提炼出逻辑清晰、层次分明的提问模板。

## 分析原则
1. **理解整体逻辑**：分析这些问题的内在联系和逻辑结构
2. **识别共性模式**：找出问题中的共性主题和可变部分
3. **重新组织顺序**：根据知识的逻辑顺序（从基础到深入）重新排列
4. **保持独立性**：每个模板问题应该可以独立理解和使用

## 输出要求
1. 直接输出提炼后的提问模板列表，不要解释
2. 每个问题一行，格式为：问题内容
3. 问题数量可以少于原始数量（合并相似问题）
4. 问题数量可以多于原始数量（拆解复杂问题）
5. 不要使用编号或列表符号
6. 不要添加任何说明或解释
7. 确保每个问题都是完整的、可独立使用的问题

## 示例
输入：
1. Python装饰器是什么？
2. Python装饰器怎么用？
3. Python装饰器有哪些应用场景？
4. 如何编写自定义装饰器？

输出：
什么是Python装饰器，它的作用是什么？
Python装饰器的基本语法和使用方法是什么？
Python装饰器有哪些常见的应用场景？
如何编写自定义装饰器？
装饰器与函数闭包的关系是什么？`;

    const userPrompt = `请分析以下问题，提炼出逻辑清晰的提问模板：

${questionsText}

注意事项：
- 如果问题涉及"整体介绍"类内容，输出应该包含概述性问题
- 如果问题涉及"细节"类内容，输出应该包含具体细节问题
- 根据问题的整体逻辑重新组织顺序
- 每个问题都是独立的、可复用的模板`;

    try {
        // 使用全局的 AI 交互方法发送消息
        const response = await sendMessageToAI(systemPrompt, userPrompt);
        
        if (!response || !response.trim()) {
            console.error('[PromptExtractor] AI 返回为空');
            return [];
        }
        
        // 解析 AI 返回的问题列表
        const templates = response
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .filter(line => !line.match(/^[\d\-\*\.]+\s*$/)) // 过滤纯数字/符号行
            .map(line => line.replace(/^[\d\-\*\.]+\s*/, '')) // 去除编号
            .filter(line => line.length >= 5); // 过滤过短的内容
        
        console.log('[PromptExtractor] 提炼出', templates.length, '个模板');
        return templates;
        
    } catch (error) {
        console.error('[PromptExtractor] 提炼失败:', error);
        return [];
    }
}

/**
 * 发送消息给页面上的 AI
 * @param {string} systemPrompt - 系统提示
 * @param {string} userPrompt - 用户消息
 * @param {Object} options - 配置选项
 * @param {boolean} options.startNewChat - 是否创建新对话后再发送
 * @param {Function} options.onProgress - 进度回调函数
 * @returns {Promise<string>} - AI 的回复
 */
async function sendMessageToAI(systemPrompt, userPrompt, options = {}) {
    const { startNewChat = false, onProgress } = options;
    
    console.log('[PromptExtractor] 开始发送消息, startNewChat:', startNewChat);
    
    // 如果需要创建新对话
    if (startNewChat) {
        await startNewConversation();
        // 等待新对话页面加载完成
        await waitForInputReady();
    }
    
    // 尝试使用 smartEnterManager 或 adapter 的方法
    try {
        const adapter = window.smartEnterAdapterRegistry?.getAdapter?.();
        if (adapter && adapter.sendChatMessage) {
            console.log('[PromptExtractor] 使用 adapter.sendChatMessage');
            const response = await adapter.sendChatMessage(systemPrompt, userPrompt);
            if (response) {
                return response;
            }
        }
    } catch (e) {
        console.debug('[PromptExtractor] adapter.sendChatMessage not available:', e);
    }
    
    // 备选方案：直接在输入框中发送消息并等待回复
    const inputElement = findInputElement();
    if (!inputElement) {
        throw new Error('未找到输入框');
    }
    
    // 构建完整消息
    const fullMessage = `${systemPrompt}\n\n---\n\n${userPrompt}`;
    console.log('[PromptExtractor] 插入消息到输入框, 长度:', fullMessage.length);
    
    // 插入消息到输入框
    insertTextToInput(inputElement, fullMessage);
    
    // 触发发送（回车或点击发送按钮）
    setTimeout(() => {
        // 尝试触发发送
        const sendBtn = findSendButton();
        if (sendBtn) {
            console.log('[PromptExtractor] 点击发送按钮');
            sendBtn.click();
        } else {
            // 直接按回车发送
            console.log('[PromptExtractor] 按回车发送');
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
            });
            inputElement.dispatchEvent(enterEvent);
        }
    }, 500);
    
    // 等待 AI 回复（监听消息元素出现），传入进度回调
    return waitForAIResponse({ onProgress });
}

/**
 * 等待输入框准备就绪
 */
async function waitForInputReady(maxWaitTime = 10000) {
    console.log('[PromptExtractor] 等待输入框准备就绪...');
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
        const inputElement = findInputElement();
        if (inputElement && isVisible(inputElement)) {
            console.log('[PromptExtractor] 输入框已就绪');
            return true;
        }
        // 等待100ms再检查
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.warn('[PromptExtractor] 等待输入框超时');
    return false;
}

/**
 * 开始新对话
 * @returns {Promise<boolean>} - 是否成功创建新对话
 */
async function startNewConversation() {
    try {
        const adapter = window.smartEnterAdapterRegistry?.getAdapter?.();
        if (adapter && typeof adapter.startNewConversation === 'function') {
            return await adapter.startNewConversation();
        }
        
        // 备选方案：直接导航到根路径
        const currentUrl = location.href;
        const baseUrl = location.origin;
        
        // 检查当前是否在对话页面
        if (currentUrl.includes('/c/') || currentUrl.includes('/g/')) {
            window.location.href = baseUrl;
            // 等待页面加载
            await new Promise(resolve => setTimeout(resolve, 2000));
            return true;
        }
        
        return false;
    } catch (e) {
        console.error('[PromptExtractor] startNewConversation failed:', e);
        return false;
    }
}

/**
 * 查找输入框元素
 */
function findInputElement() {
    try {
        const adapter = window.smartEnterAdapterRegistry?.getAdapter?.();
        if (adapter) {
            const selector = adapter.getInputSelector?.();
            if (selector) {
                const el = document.querySelector(selector);
                if (el && isVisible(el)) return el;
            }
        }
    } catch (e) {}
    
    // 备选选择器 - 按优先级排列
    const selectors = [
        '#prompt-textarea',  // ChatGPT
        'textarea[placeholder*="问"]',
        'textarea[placeholder*="message"]',
        'textarea[placeholder*="Message"]',
        'div[contenteditable="true"]',
        '[role="textbox"]',
        'textarea'
    ];
    
    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && isVisible(el)) return el;
    }
    
    return null;
}

/**
 * 查找发送按钮
 */
function findSendButton() {
    try {
        const adapter = window.smartEnterAdapterRegistry?.getAdapter?.();
        if (adapter) {
            const selector = adapter.getSendButtonSelector?.();
            if (selector) {
                const btn = document.querySelector(selector);
                if (btn && isVisible(btn)) return btn;
            }
        }
    } catch (e) {}
    
    // 备选选择器 - 按优先级排列
    const selectors = [
        '#composer-submit-button',  // ChatGPT
        'button[data-testid="send-button"]',
        'button[type="submit"]',
        'button[aria-label*="send" i]',
        'button[aria-label*="发送" i]',
        'button[aria-label*="Send" i]',
        'button[aria-label*="提交" i]',
        '.send-button',
        '[data-testid="send-button"]'
    ];
    
    for (const selector of selectors) {
        const btn = document.querySelector(selector);
        if (btn && isVisible(btn)) return btn;
    }
    
    return null;
}

/**
 * 检查元素是否可见
 */
function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           el.offsetWidth > 0 &&
           el.offsetHeight > 0;
}

/**
 * 插入文本到输入框
 */
function insertTextToInput(inputElement, text) {
    inputElement.focus();
    
    if (inputElement.isContentEditable) {
        // contenteditable
        document.execCommand('insertText', false, text);
    } else {
        // textarea/input
        inputElement.value = text;
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

/**
 * 等待 AI 回复
 * 核心逻辑：
 * 1. 发送消息后，等待AI开始回复（检测到新消息元素出现）
 * 2. 持续检测回复内容，直到AI回复"完成"（包含炼化结果标记或内容稳定）
 * 3. 超时时间：180秒
 * 4. 每30秒显示进度弹窗
 */
function waitForAIResponse(options = {}) {
    const { onProgress } = options; // 进度回调函数
    
    return new Promise((resolve, reject) => {
        let observer = null;
        let pollingInterval = null;
        let progressInterval = null;
        let elapsedTime = 0;
        
        // 记录已检测到的AI回复内容，用于判断是否还在生成中
        let lastContentLength = 0;
        let lastCheckTime = Date.now();
        let stableCount = 0; // 连续稳定的次数
        let lastStableStartTime = Date.now(); // 稳定区间的开始时间
        const STABLE_THRESHOLD = 3; // 连续3次检测内容不变则认为已稳定
        const STABILITY_MIN_TIME = 8000; // 最小稳定时间：8秒
        const PROGRESS_INTERVAL = 30000; // 30秒显示一次进度
        const MAX_TIME = 180000; // 180秒
        const POLL_INTERVAL = 2000; // 2秒轮询一次
        
        // 记录获取到的最新回复内容
        let latestResponse = '';
        // 记录最大获取到的内容长度
        let maxContentLength = 0;
        
        // 清理函数
        const cleanup = () => {
            if (timeout) clearTimeout(timeout);
            if (pollingInterval) clearInterval(pollingInterval);
            if (progressInterval) clearInterval(progressInterval);
            if (observer) observer.disconnect();
            observer = null;
        };
        
        // 显示进度弹窗
        const showProgress = (message) => {
            const percent = Math.min(100, Math.round((elapsedTime / MAX_TIME) * 100));
            const progressMsg = `${message}`;
            
            if (window.globalToastManager) {
                try {
                    window.globalToastManager.show('info', progressMsg, {
                        duration: 28000
                    });
                } catch (e) {
                    console.debug('[PromptExtractor] Toast show failed:', e);
                }
            }
            
            // 同时调用回调
            if (onProgress) {
                try {
                    onProgress({ elapsed: elapsedTime, percent, message });
                } catch (e) {
                    console.debug('[PromptExtractor] onProgress callback failed:', e);
                }
            }
            
            console.log(`[PromptExtractor] ${progressMsg} (已等待${Math.round(elapsedTime/1000)}秒)`);
        };
        
        // 检测函数：检查AI是否已完成回复
        const checkResponseComplete = () => {
            const response = getLatestAIResponse();
            const now = Date.now();
            
            if (!response || response.trim().length < 50) {
                // AI还没有有效回复，重置稳定计数
                stableCount = 0;
                lastContentLength = 0;
                return false;
            }
            
            // 记录最新回复内容
            latestResponse = response;
            if (response.length > maxContentLength) {
                maxContentLength = response.length;
            }
            
            // 检查是否包含炼化结果的完成标记
            const hasCompleteMarkers = (
                response.includes('完整Skill提示词') ||
                response.includes('层层深入') ||
                response.includes('提问框架')
            );
            
            // 检查是否还在加载中
            const isStillLoading = checkIsStillLoading(response);
            if (isStillLoading) {
                console.log('[PromptExtractor] AI仍在生成中... 长度:', response.length);
                stableCount = 0;
                return false;
            }
            
            // 检查内容是否稳定（长度变化小于50字符）
            const lengthDiff = Math.abs(response.length - lastContentLength);
            const isStable = lengthDiff < 50;
            
            if (isStable) {
                if (stableCount === 0) {
                    // 开始新的稳定区间
                    lastStableStartTime = lastCheckTime;
                }
                stableCount++;
            } else {
                stableCount = 0;
            }
            
            // 计算从稳定开始到现在的时间
            const stableTime = now - lastStableStartTime;
            lastContentLength = response.length;
            lastCheckTime = now;
            
            console.log(`[PromptExtractor] AI回复检测: 长度=${response.length}, 变化=${lengthDiff}, 稳定次数=${stableCount}, 稳定持续=${stableTime}ms`);
            
            // 判断AI回复是否完成：
            // 1. 包含炼化结果标记 -> 认为完成
            // 2. 内容稳定超过3次检测 且 稳定时间超过8秒 -> 认为已稳定完成
            if (hasCompleteMarkers) {
                console.log('[PromptExtractor] 检测到炼化结果标记，认为AI回复已完成');
                return true;
            }
            
            if (stableCount >= STABLE_THRESHOLD && stableTime >= STABILITY_MIN_TIME) {
                console.log('[PromptExtractor] 内容稳定时间足够长，认为AI回复已完成');
                return true;
            }
            
            return false;
        };
        
        // 超时时间：180秒
        const timeout = setTimeout(() => {
            cleanup();
            console.log('[PromptExtractor] 等待AI回复超时（180秒）');
            console.log('[PromptExtractor] 最大获取内容长度:', maxContentLength);
            
            // 超时时返回已获取的最长回复
            if (latestResponse && latestResponse.trim().length > 100) {
                console.log('[PromptExtractor] 超时，返回已获取的内容，长度:', latestResponse.length);
                if (window.globalToastManager) {
                    try {
                        window.globalToastManager.show('warning', `超时！已获取 ${latestResponse.length} 字内容`);
                    } catch (e) {}
                }
                resolve(latestResponse);
            } else {
                const errorMsg = '等待AI回复超时（180秒）且未获取到有效回复';
                console.error('[PromptExtractor]', errorMsg);
                if (window.globalToastManager) {
                    try {
                        window.globalToastManager.show('error', errorMsg);
                    } catch (e) {}
                }
                reject(new Error(errorMsg));
            }
        }, MAX_TIME);
        
        // 启动进度弹窗（每30秒）
        progressInterval = setInterval(() => {
            elapsedTime += PROGRESS_INTERVAL;
            if (latestResponse && latestResponse.length > 100) {
                showProgress(`AI正在分析中...已获取 ${latestResponse.length} 字`);
            } else {
                showProgress('AI正在思考，请稍候...');
            }
        }, PROGRESS_INTERVAL);
        
        // 启动轮询（每2秒）
        pollingInterval = setInterval(() => {
            elapsedTime += POLL_INTERVAL;
            try {
                if (checkResponseComplete()) {
                    cleanup();
                    console.log('[PromptExtractor] AI回复完成，内容长度:', latestResponse?.length || 0);
                    if (window.globalToastManager) {
                        try {
                            window.globalToastManager.show('success', `AI回复完成！共 ${latestResponse?.length || 0} 字`);
                        } catch (e) {}
                    }
                    resolve(latestResponse);
                }
            } catch (e) {
                console.error('[PromptExtractor] 轮询检测出错:', e);
            }
        }, POLL_INTERVAL);
        
        // 同时监听DOM变化作为补充
        observer = new MutationObserver(() => {
            try {
                if (checkResponseComplete()) {
                    cleanup();
                    console.log('[PromptExtractor] DOM变化检测到AI回复完成');
                    if (window.globalToastManager) {
                        try {
                            window.globalToastManager.show('success', `AI回复完成！共 ${latestResponse?.length || 0} 字`);
                        } catch (e) {}
                    }
                    resolve(latestResponse);
                }
            } catch (e) {
                console.error('[PromptExtractor] DOM观察出错:', e);
            }
        });
        
        // 监听整个文档的变化
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
        
        // 立即检查一次
        const immediateResponse = getLatestAIResponse();
        if (immediateResponse && immediateResponse.trim().length > 100) {
            latestResponse = immediateResponse;
            maxContentLength = immediateResponse.length;
            console.log('[PromptExtractor] 立即检测到回复，长度:', immediateResponse.length);
        }
        
        console.log('[PromptExtractor] 开始等待AI回复（最多等待180秒）...');
        
        // 立即显示第一次进度
        setTimeout(() => {
            showProgress('AI已开始分析，请稍候...');
        }, 1000);
    });
}

/**
 * 检查AI是否还在加载中
 */
function checkIsStillLoading(response) {
    if (!response) return false;
    
    const trimmedResponse = response.trim();
    
    // 检测加载中指示器
    const loadingIndicators = [
        '正在思考', 'thinking', 'typing', '生成中', '加载中', 'processing', '正在输入'
    ];
    
    const endsWithLoading = loadingIndicators.some(indicator => 
        trimmedResponse.endsWith(indicator)
    );
    
    // 检测省略号
    const hasEllipsis = /\.{3,}$/.test(trimmedResponse);
    
    // 内容太短
    const isTooShort = response.length < 200;
    
    // 以连接词结尾（句子中间，不完整）
    const endsWithConjunction = /[但而且并且或者因此所以于是]$/.test(trimmedResponse);
    
    if (endsWithLoading || (hasEllipsis && isTooShort) || (endsWithConjunction && isTooShort)) {
        return true;
    }
    
    return false;
}

/**
 * 获取 AI 的最新回复（根据不同平台实现）
 */
function getLatestAIResponse() {
    let debugInfo = [];
    
    // 尝试使用当前适配器的选择器获取 AI 消息
    try {
        const adapter = window.smartEnterAdapterRegistry?.getAdapter?.();
        if (adapter) {
            // 尝试获取 AI 消息选择器
            const aiSelector = adapter.getAIMessageSelector?.() || getAIMessageSelectorForCurrentSite();
            debugInfo.push(`适配器选择器: ${aiSelector}`);
            
            if (aiSelector) {
                const elements = document.querySelectorAll(aiSelector);
                debugInfo.push(`找到 ${elements.length} 个元素`);
                
                if (elements.length > 0) {
                    // 获取最后一个 AI 消息
                    for (let i = elements.length - 1; i >= 0; i--) {
                        const el = elements[i];
                        const text = (el.textContent || '').trim();
                        
                        // 排除用户消息（我们发送的提示词）
                        const isLikelyUserMessage = (
                            text.includes('【问题分析任务】') ||
                            (text.includes('以下是我在研究') && text.length < 500)
                        );
                        
                        if (isLikelyUserMessage) {
                            debugInfo.push(`跳过用户消息: ${text.substring(0, 50)}`);
                            continue;
                        }
                        
                        // 只要是AI的回复就返回（不论是否完整）
                        if (text.length > 50) {
                            debugInfo.push(`找到AI回复: ${text.length} 字`);
                            console.log('[PromptExtractor]', debugInfo.join(', '));
                            return text;
                        }
                    }
                }
            }
        }
    } catch (e) {
        debugInfo.push(`适配器错误: ${e.message}`);
        console.debug('[PromptExtractor] adapter selector failed', e);
    }
    
    // 尝试从各个平台的选择器中获取回复
    const selectors = [
        // 特定平台选择器
        '[data-message-author-role="assistant"]',  // ChatGPT
        '[data-role="assistant"]',                  // 通用
        '.message-content',
        '.ai-response',
        '.claude-message',
        '.gpt-message',
        '.gemini-message',
        '[class*="assistant"]',
        '[class*="ai-message"]',
        '[class*="ai-response"]',
        // 常见的 markdown 内容容器
        '.markdown-body',
        '.prose',
        '[data-testid*="message"]'
    ];
    
    for (const selector of selectors) {
        try {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                // 获取最后一个 AI 消息
                for (let i = elements.length - 1; i >= 0; i--) {
                    const el = elements[i];
                    const text = (el.textContent || '').trim();
                    
                    // 排除用户消息
                    const isLikelyUserMessage = (
                        text.includes('【问题分析任务】') ||
                        (text.includes('以下是我在研究') && text.length < 500)
                    );
                    
                    if (isLikelyUserMessage) {
                        continue;
                    }
                    
                    // 只要是AI的回复就返回
                    if (text.length > 50) {
                        debugInfo.push(`选择器 ${selector} 找到: ${text.length} 字`);
                        console.log('[PromptExtractor]', debugInfo.join(', '));
                        return text;
                    }
                }
            }
        } catch (e) {
            // 忽略选择器错误
        }
    }
    
    // 如果找不到，尝试查找包含炼化标记的容器
    const allElements = document.querySelectorAll('div, article, section, main');
    for (const el of allElements) {
        const text = (el.textContent || '').trim();
        
        // 排除用户消息
        const isLikelyUserMessage = (
            text.includes('【问题分析任务】') ||
            (text.includes('以下是我在研究') && text.length < 500)
        );
        
        if (isLikelyUserMessage) {
            continue;
        }
        
        // 寻找包含炼化结果的容器
        if (text.includes('完整Skill提示词') || text.includes('层层深入') || text.includes('提问框架')) {
            console.log('[PromptExtractor] 找到包含炼化标记的容器, 长度:', text.length);
            return text;
        }
    }
    
    // 最后尝试查找最长的文本块
    let longestText = '';
    for (const el of allElements) {
        const text = (el.textContent || '').trim();
        if (text.length > longestText.length && text.length > 100) {
            // 排除用户输入的内容
            if (!isUserInput(text)) {
                longestText = text;
            }
        }
    }
    
    if (longestText.length > 100) {
        debugInfo.push(`最长文本块: ${longestText.length} 字`);
        console.log('[PromptExtractor]', debugInfo.join(', '));
    }
    
    return longestText;
}

/**
 * 判断是否是用户输入的内容（需要排除的）
 */
function isUserInput(text) {
    const userInputMarkers = [
        '你是专业的提问设计师',
        '请分析以下问题',
        '【问题分析任务】',
        '问题间的关联逻辑',
        '层层深入的提问模板',
        '以下是我在研究'
    ];
    
    return userInputMarkers.some(marker => text.includes(marker));
}

/**
 * 根据当前网站获取 AI 消息选择器
 */
function getAIMessageSelectorForCurrentSite() {
    const hostname = location.hostname;
    
    // ChatGPT
    if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) {
        return '[data-message-author-role="assistant"]';
    }
    
    // Claude
    if (hostname.includes('claude.ai')) {
        return '.claude-message, [data-type="assistant"]';
    }
    
    // Gemini
    if (hostname.includes('gemini.google') || hostname.includes('bard.google')) {
        return '[data-type="assistant"], .gemini-message';
    }
    
    // DeepSeek
    if (hostname.includes('deepseek.com')) {
        return '[data-role="assistant"], .deepseek-message';
    }
    
    // Kimi / Moonshot
    if (hostname.includes('kimi.moonshot.cn') || hostname.includes('kimi.lim Baker.cn')) {
        return '[data-role="assistant"], .message-assistant';
    }
    
    // 通用的选择器
    return '[data-role="assistant"], [data-type="assistant"]';
}

/**
 * 将提炼出的模板保存为提示词
 * @param {Array} templates - 模板列表
 * @param {Object} options - 配置选项
 * @param {string} options.folderName - 文件夹名称（用于命名）
 * @param {string} options.platformId - 平台 ID
 * @returns {Promise<Array>} - 保存的提示词列表
 */
async function saveTemplatesAsPrompts(templates, options = {}) {
    const { folderName = '未命名模板', platformId = '' } = options;
    
    if (!templates || templates.length === 0) {
        return [];
    }
    
    // 获取现有的提示词
    const result = await chrome.storage.local.get('prompts');
    const prompts = result.prompts || [];
    
    const newPrompts = templates.map((template, index) => ({
        id: `template_${Date.now()}_${index}`,
        name: template.substring(0, 30) + (template.length > 30 ? '...' : ''),
        content: template,
        platformId: platformId,
        createdAt: Date.now(),
        source: 'extracted',
        sourceFolder: folderName
    }));
    
    // 添加到列表
    prompts.push(...newPrompts);
    
    // 保存
    await chrome.storage.local.set({ prompts });
    
    console.log('[PromptExtractor] 保存了', newPrompts.length, '个提示词');
    
    return newPrompts;
}

// 导出到全局
window.PromptTemplateExtractor = {
    extract: extractPromptTemplates,
    save: saveTemplatesAsPrompts,
    sendToAI: sendMessageToAI
};
