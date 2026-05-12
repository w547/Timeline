/**
 * Saved Answers Module Loader
 *
 * 按需注入已保存回答系统的所有脚本和样式
 * 调用方式: window.savedAnswersModuleLoader.load()
 */

class SavedAnswersModuleLoader {
    static SCRIPTS = [
        'js/savedAnswers/saved-answers-manager.js',
        'js/savedAnswers/save-answer-button.js',
        'js/savedAnswers/saved-answers-ui.js',
        'js/savedAnswers/template-editor.js'
    ];

    static STYLES = [
        'js/savedAnswers/saved-answers.css',
        'js/savedAnswers/template-editor.css'
    ];

    static _loaded = false;

    /**
     * 加载所有模块
     */
    static async load() {
        if (SavedAnswersModuleLoader._loaded) return true;
        SavedAnswersModuleLoader._loaded = true;

        try {
            // 并行加载样式
            const stylePromises = SavedAnswersModuleLoader.STYLES.map(href => {
                return new Promise((resolve) => {
                    if (document.querySelector(`link[href*="${href}"]`)) {
                        resolve();
                        return;
                    }
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = chrome.runtime.getURL(href);
                    link.onload = () => resolve();
                    link.onerror = () => resolve(); // 不阻塞
                    document.head.appendChild(link);
                });
            });

            // 顺序加载脚本（有依赖关系）
            for (const src of SavedAnswersModuleLoader.SCRIPTS) {
                await SavedAnswersModuleLoader._loadScript(src);
            }

            await Promise.all(stylePromises);

            console.log('[SavedAnswersLoader] 所有模块加载完成');
            return true;
        } catch (e) {
            console.error('[SavedAnswersLoader] 模块加载失败:', e);
            SavedAnswersModuleLoader._loaded = false;
            return false;
        }
    }

    /**
     * 加载单个脚本
     */
    static _loadScript(src) {
        return new Promise((resolve, reject) => {
            const url = chrome.runtime.getURL(src);

            // 检查是否已加载
            if (document.querySelector(`script[src="${url}"]`)) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = url;
            script.onload = () => resolve();
            script.onerror = () => {
                console.warn('[SavedAnswersLoader] 脚本加载失败:', src);
                resolve(); // 不阻塞后续加载
            };
            document.head.appendChild(script);
        });
    }

    /**
     * 启动保存按钮注入
     */
    static async startButtonInjector() {
        if (!SavedAnswersModuleLoader._loaded) {
            await SavedAnswersModuleLoader.load();
        }

        if (window.saveAnswerButtonInjector) {
            try {
                await window.saveAnswerButtonInjector.init();
                console.log('[SavedAnswersLoader] 保存按钮注入已启动');
            } catch (e) {
                console.error('[SavedAnswersLoader] 保存按钮注入失败:', e);
            }
        }
    }

    /**
     * 停止保存按钮注入
     */
    static stopButtonInjector() {
        if (window.saveAnswerButtonInjector) {
            try { window.saveAnswerButtonInjector.destroy(); } catch (e) {}
        }
    }
}

window.SavedAnswersModuleLoader = SavedAnswersModuleLoader;
