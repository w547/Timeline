/**
 * Structured Questions UI
 * 
 * Provides UI for extracting and managing structured question templates
 */

class StructuredQuestionsUI {
    constructor() {
        this._el = null;
        this._wrapper = null;
        this._timelineBar = null;
        this._visible = false;
        this._boundOnClickOutside = this._onClickOutside.bind(this);
    }

    get visible() { return this._visible; }

    /**
     * Bind timeline UI references
     */
    bind(wrapper, timelineBar) {
        this._wrapper = wrapper;
        this._timelineBar = timelineBar;
    }

    /**
     * Toggle visibility
     */
    toggle() {
        if (this._visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Show the panel
     */
    show() {
        const tm = window.timelineManager;
        if (!tm || !tm.markers || tm.markers.length === 0) return;
        if (!this._wrapper || !this._timelineBar) return;

        this.hide();

        // Create panel DOM
        this._el = document.createElement('div');
        this._el.className = 'ait-structured-questions-panel';

        // Header
        const header = document.createElement('div');
        header.className = 'ait-sq-header';

        const title = document.createElement('span');
        title.className = 'ait-sq-title';
        title.textContent = '结构化提问思路提炼';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'ait-sq-close';
        closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
        });

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Content
        const content = document.createElement('div');
        content.className = 'ait-sq-content';

        // Range selection
        const rangeSection = document.createElement('div');
        rangeSection.className = 'ait-sq-section';

        const rangeTitle = document.createElement('h3');
        rangeTitle.textContent = '选择对话范围';

        const rangeSelect = document.createElement('div');
        rangeSelect.className = 'ait-sq-range-select';

        const startLabel = document.createElement('label');
        startLabel.textContent = '开始';
        const startSelect = document.createElement('select');
        startSelect.className = 'ait-sq-start-select';

        const endLabel = document.createElement('label');
        endLabel.textContent = '结束';
        const endSelect = document.createElement('select');
        endSelect.className = 'ait-sq-end-select';

        // Populate options
        tm.markers.forEach((marker, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Q${index + 1}: ${marker.summary.substring(0, 30)}${marker.summary.length > 30 ? '...' : ''}`;
            startSelect.appendChild(option);

            const endOption = option.cloneNode(true);
            endSelect.appendChild(endOption);
        });

        endSelect.value = tm.markers.length - 1;

        rangeSelect.appendChild(startLabel);
        rangeSelect.appendChild(startSelect);
        rangeSelect.appendChild(endLabel);
        rangeSelect.appendChild(endSelect);

        rangeSection.appendChild(rangeTitle);
        rangeSection.appendChild(rangeSelect);

        // Extract button
        const extractBtn = document.createElement('button');
        extractBtn.className = 'ait-sq-extract-btn';
        extractBtn.textContent = '提取并分析';
        extractBtn.addEventListener('click', () => {
            const startIndex = parseInt(startSelect.value);
            const endIndex = parseInt(endSelect.value);
            this._extractAndAnalyze(startIndex, endIndex);
        });

        // Templates section
        const templatesSection = document.createElement('div');
        templatesSection.className = 'ait-sq-section';

        const templatesTitle = document.createElement('h3');
        templatesTitle.textContent = '学习模板';

        const templatesList = document.createElement('div');
        templatesList.className = 'ait-sq-templates-list';

        this._renderTemplates(templatesList);

        templatesSection.appendChild(templatesTitle);
        templatesSection.appendChild(templatesList);

        // Assemble content
        content.appendChild(rangeSection);
        content.appendChild(extractBtn);
        content.appendChild(templatesSection);

        this._el.appendChild(header);
        this._el.appendChild(content);

        // Sync height with timeline bar
        const barHeight = this._timelineBar.style.height;
        if (barHeight) {
            this._el.style.height = barHeight;
        }

        // Insert into wrapper
        this._wrapper.insertBefore(this._el, this._timelineBar);

        // Hide timeline bar
        this._timelineBar.style.display = 'none';

        this._visible = true;

        // Click outside to close
        setTimeout(() => {
            document.addEventListener('click', this._boundOnClickOutside, true);
        }, 0);
    }

    /**
     * Hide the panel
     */
    hide() {
        document.removeEventListener('click', this._boundOnClickOutside, true);
        if (this._el) {
            this._el.remove();
            this._el = null;
        }

        // Restore timeline bar
        if (this._timelineBar) {
            this._timelineBar.style.display = '';
        }

        this._visible = false;
    }

    /**
     * Extract and analyze questions
     */
    _extractAndAnalyze(startIndex, endIndex) {
        const tm = window.timelineManager;
        if (!tm || !tm.markers) return;

        const extractor = window.structuredQuestionsExtractor;
        if (!extractor) return;

        const questions = extractor.extractQuestions(tm.markers, startIndex, endIndex);
        const outline = extractor.analyzeStructure(questions);

        this._showAnalysisResult(outline);
    }

    /**
     * Show analysis result
     */
    _showAnalysisResult(outline) {
        // Create modal for result
        const modal = document.createElement('div');
        modal.className = 'ait-sq-result-modal';

        const modalContent = document.createElement('div');
        modalContent.className = 'ait-sq-result-content';

        const modalHeader = document.createElement('div');
        modalHeader.className = 'ait-sq-result-header';

        const modalTitle = document.createElement('h3');
        modalTitle.textContent = '结构化提纲';

        const modalClose = document.createElement('button');
        modalClose.className = 'ait-sq-result-close';
        modalClose.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        modalClose.addEventListener('click', () => {
            modal.remove();
        });

        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(modalClose);

        const modalBody = document.createElement('div');
        modalBody.className = 'ait-sq-result-body';

        // Render outline
        outline.sections.forEach((section, sectionIndex) => {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'ait-sq-section-result';

            const sectionTitle = document.createElement('h4');
            sectionTitle.textContent = `${sectionIndex + 1}. 【${section.title}】`;

            const questionsList = document.createElement('ul');
            section.questions.forEach((q, qIndex) => {
                const li = document.createElement('li');
                li.textContent = q.text;
                questionsList.appendChild(li);
            });

            sectionEl.appendChild(sectionTitle);
            sectionEl.appendChild(questionsList);
            modalBody.appendChild(sectionEl);
        });

        // Save as template button
        const saveBtn = document.createElement('button');
        saveBtn.className = 'ait-sq-save-template';
        saveBtn.textContent = '保存为学习模板';
        saveBtn.addEventListener('click', () => {
            this._saveTemplate(outline);
            modal.remove();
        });

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(modalBody);
        modalContent.appendChild(saveBtn);
        modal.appendChild(modalContent);

        document.body.appendChild(modal);
    }

    /**
     * Save template
     */
    _saveTemplate(outline) {
        const extractor = window.structuredQuestionsExtractor;
        if (!extractor) return;

        // Prompt for template name
        const name = prompt('请输入模板名称:', `学习模板 ${extractor.getTemplates().length + 1}`);
        if (name) {
            extractor.saveTemplate(outline, name);
            if (this._el) {
                const templatesList = this._el.querySelector('.ait-sq-templates-list');
                if (templatesList) {
                    this._renderTemplates(templatesList);
                }
            }
            
            // Show success message
            if (window.globalToastManager) {
                window.globalToastManager.success('模板保存成功');
            }
        }
    }

    /**
     * Render templates list
     */
    _renderTemplates(container) {
        const extractor = window.structuredQuestionsExtractor;
        if (!extractor) return;

        container.innerHTML = '';

        const templates = extractor.getTemplates();
        if (templates.length === 0) {
            container.innerHTML = '<div class="ait-sq-empty">暂无模板</div>';
            return;
        }

        templates.forEach(template => {
            const templateEl = document.createElement('div');
            templateEl.className = 'ait-sq-template-item';

            const templateName = document.createElement('span');
            templateName.className = 'ait-sq-template-name';
            templateName.textContent = template.name;

            const templateActions = document.createElement('div');
            templateActions.className = 'ait-sq-template-actions';

            const useBtn = document.createElement('button');
            useBtn.className = 'ait-sq-use-template';
            useBtn.textContent = '使用';
            useBtn.addEventListener('click', () => {
                this._useTemplate(template.id);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'ait-sq-delete-template';
            deleteBtn.textContent = '删除';
            deleteBtn.addEventListener('click', () => {
                if (confirm('确定删除此模板吗？')) {
                    extractor.deleteTemplate(template.id);
                    this._renderTemplates(container);
                }
            });

            templateActions.appendChild(useBtn);
            templateActions.appendChild(deleteBtn);
            templateEl.appendChild(templateName);
            templateEl.appendChild(templateActions);
            container.appendChild(templateEl);
        });
    }

    /**
     * Use a template
     */
    _useTemplate(templateId) {
        const extractor = window.structuredQuestionsExtractor;
        if (!extractor) return;

        const topic = prompt('请输入学习主题:', '新主题');
        if (topic) {
            const questions = extractor.generateQuestionsFromTemplate(templateId, topic);
            if (questions.length > 0) {
                // Show generated questions
                const modal = document.createElement('div');
                modal.className = 'ait-sq-result-modal';

                const modalContent = document.createElement('div');
                modalContent.className = 'ait-sq-result-content';

                const modalHeader = document.createElement('div');
                modalHeader.className = 'ait-sq-result-header';

                const modalTitle = document.createElement('h3');
                modalTitle.textContent = `基于模板生成的问题 (${topic})`;

                const modalClose = document.createElement('button');
                modalClose.className = 'ait-sq-result-close';
                modalClose.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
                modalClose.addEventListener('click', () => {
                    modal.remove();
                });

                modalHeader.appendChild(modalTitle);
                modalHeader.appendChild(modalClose);

                const modalBody = document.createElement('div');
                modalBody.className = 'ait-sq-result-body';

                const questionsList = document.createElement('ul');
                questions.forEach((q, index) => {
                    const li = document.createElement('li');
                    li.textContent = q;
                    questionsList.appendChild(li);
                });

                modalBody.appendChild(questionsList);

                modalContent.appendChild(modalHeader);
                modalContent.appendChild(modalBody);
                modal.appendChild(modalContent);

                document.body.appendChild(modal);
            }
        }
    }

    /**
     * Handle click outside
     */
    _onClickOutside(e) {
        if (!this._visible || !this._el) return;
        if (this._el.contains(e.target)) return;
        this.hide();
    }
}

// Export as singleton
if (typeof window.structuredQuestionsUI === 'undefined') {
    window.structuredQuestionsUI = new StructuredQuestionsUI();
}
