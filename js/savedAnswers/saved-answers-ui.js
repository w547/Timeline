/**
 * Saved Answers UI - 已保存回答管理页面
 *
 * 功能：
 * - 搜索、筛选、分页
 * - 查看、删除、抽取模板
 * - 批量操作
 */

class SavedAnswersUI {
    constructor(container) {
        this._container = container;
        this._page = 1;
        this._pageSize = 20;
        this._searchQuery = '';
        this._filterHasTemplate = undefined;
        this._selectedIds = new Set();
        this._allAnswers = [];
        this._renderedAnswers = [];
    }

    /**
     * 渲染页面
     */
    async render() {
        this._container.innerHTML = '';
        const page = document.createElement('div');
        page.className = 'ait-saved-answers-page';

        // 工具栏
        page.appendChild(this._renderToolbar());

        // 列表
        const listEl = document.createElement('div');
        listEl.className = 'ait-saved-answers-list';
        listEl.id = 'saved-answers-list';
        page.appendChild(listEl);

        // 分页
        const paginationEl = document.createElement('div');
        paginationEl.className = 'ait-saved-answers-pagination';
        paginationEl.id = 'saved-answers-pagination';
        page.appendChild(paginationEl);

        this._container.appendChild(page);

        // 加载数据
        await this._loadAndRender();

        // 绑定事件
        this._bindEvents();
    }

    /**
     * 渲染工具栏
     */
    _renderToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'ait-saved-answers-toolbar';

        toolbar.innerHTML = `
            <input type="text" class="ait-saved-answers-search" id="sa-search"
                placeholder="搜索已保存的回答...">
            <select class="ait-saved-answers-filter" id="sa-filter">
                <option value="all">全部回答</option>
                <option value="hasTemplate">已有模板</option>
                <option value="noTemplate">未抽取模板</option>
            </select>
            <span class="ait-saved-answers-count" id="sa-count"></span>
            <div class="ait-saved-answers-actions">
                <button class="ait-saved-answers-action-btn" id="sa-select-all">全选</button>
                <button class="ait-saved-answers-action-btn ait-saved-answers-action-btn--danger" id="sa-delete-selected">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    删除选中
                </button>
            </div>
        `;

        return toolbar;
    }

    /**
     * 加载并渲染列表
     */
    async _loadAndRender() {
        const manager = window.savedAnswersManager;
        if (!manager) return;

        this._allAnswers = await manager.getSavedAnswers({
            search: this._searchQuery,
            hasTemplate: this._filterHasTemplate
        });

        // 分页
        const totalPages = Math.ceil(this._allAnswers.length / this._pageSize);
        if (this._page > totalPages) this._page = Math.max(1, totalPages);

        const start = (this._page - 1) * this._pageSize;
        this._renderedAnswers = this._allAnswers.slice(start, start + this._pageSize);

        this._renderList();
        this._renderPagination();
        this._updateCount();
    }

    /**
     * 渲染列表
     */
    _renderList() {
        const listEl = document.getElementById('saved-answers-list');
        if (!listEl) return;

        if (this._allAnswers.length === 0) {
            listEl.innerHTML = `
                <div class="ait-saved-answers-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                    </svg>
                    <div class="ait-saved-answers-empty-title">暂无已保存的回答</div>
                    <div class="ait-saved-answers-empty-desc">
                        在AI回答下方点击"保存回答"按钮，即可将回答保存到这里。
                    </div>
                </div>
            `;
            return;
        }

        listEl.innerHTML = this._renderedAnswers.map(answer => {
            const hasTemplate = !!answer.templateId;
            const time = new Date(answer.createdAt).toLocaleString('zh-CN', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const isSelected = this._selectedIds.has(answer.id);

            return `
            <div class="ait-saved-answer-item ${isSelected ? 'ait-saved-answer-item--selected' : ''}"
                data-answer-id="${answer.id}">
                <input type="checkbox" class="ait-saved-answer-checkbox"
                    data-answer-id="${answer.id}" ${isSelected ? 'checked' : ''}>
                <div class="ait-saved-answer-body">
                    ${answer.question ? `<div class="ait-saved-answer-question">${this._escapeHtml(answer.question.substring(0, 100))}</div>` : ''}
                    <div class="ait-saved-answer-content">${this._escapeHtml(answer.content.substring(0, 200))}</div>
                    <div class="ait-saved-answer-meta">
                        <span class="ait-saved-answer-platform">${this._escapeHtml(answer.platform || '未知平台')}</span>
                        <span>${time}</span>
                        ${hasTemplate ? `<span class="ait-saved-answer-has-template">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                            </svg>
                            已抽取模板
                        </span>` : ''}
                    </div>
                </div>
                <div class="ait-saved-answer-actions">
                    <button class="ait-saved-answer-action-icon ait-saved-answer-action-icon--primary"
                        title="查看详情" data-action="view" data-id="${answer.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="ait-saved-answer-action-icon ait-saved-answer-action-icon--primary"
                        title="抽取模板" data-action="extract" data-id="${answer.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                        </svg>
                    </button>
                    <button class="ait-saved-answer-action-icon ait-saved-answer-action-icon--danger"
                        title="删除" data-action="delete" data-id="${answer.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>`;
        }).join('');

        // 绑定操作按钮事件
        listEl.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                const id = btn.getAttribute('data-id');
                await this._handleAction(action, id);
            });
        });

        // 绑定复选框事件
        listEl.querySelectorAll('.ait-saved-answer-checkbox').forEach(cb => {
            cb.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleSelection(cb.getAttribute('data-answer-id'));
            });
        });

        // 点击行查看详情
        listEl.querySelectorAll('.ait-saved-answer-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' ||
                    e.target.closest('button')) {
                    return;
                }
                this._showDetail(item.getAttribute('data-answer-id'));
            });
        });
    }

    /**
     * 渲染分页
     */
    _renderPagination() {
        const paginationEl = document.getElementById('saved-answers-pagination');
        if (!paginationEl) return;

        const totalPages = Math.ceil(this._allAnswers.length / this._pageSize);
        if (totalPages <= 1) {
            paginationEl.innerHTML = '';
            return;
        }

        let html = '<button class="ait-saved-answers-page-btn" data-page="prev" ' +
            (this._page <= 1 ? 'disabled' : '') + '>‹</button>';

        // 显示页码范围
        const maxVisible = 5;
        let startPage = Math.max(1, this._page - Math.floor(maxVisible / 2));
        const endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        if (startPage > 1) {
            html += '<button class="ait-saved-answers-page-btn" data-page="1">1</button>';
            if (startPage > 2) html += '<span style="padding: 0 4px; color: #aeaeb2;">...</span>';
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="ait-saved-answers-page-btn ${i === this._page ? 'ait-saved-answers-page-btn--active' : ''}"
                data-page="${i}">${i}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += '<span style="padding: 0 4px; color: #aeaeb2;">...</span>';
            html += `<button class="ait-saved-answers-page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        html += '<button class="ait-saved-answers-page-btn" data-page="next" ' +
            (this._page >= totalPages ? 'disabled' : '') + '>›</button>';

        paginationEl.innerHTML = html;

        // 绑定分页事件
        paginationEl.querySelectorAll('.ait-saved-answers-page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.getAttribute('data-page');
                if (page === 'prev') this._page--;
                else if (page === 'next') this._page++;
                else this._page = parseInt(page);
                this._loadAndRender();
            });
        });
    }

    /**
     * 更新计数
     */
    _updateCount() {
        const countEl = document.getElementById('sa-count');
        if (countEl) {
            countEl.textContent = `共 ${this._allAnswers.length} 条回答`;
        }
    }

    /**
     * 绑定工具栏事件
     */
    _bindEvents() {
        // 搜索
        const searchEl = document.getElementById('sa-search');
        if (searchEl) {
            let debounceTimer;
            searchEl.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this._searchQuery = searchEl.value.trim();
                    this._page = 1;
                    this._loadAndRender();
                }, 300);
            });
        }

        // 筛选
        const filterEl = document.getElementById('sa-filter');
        if (filterEl) {
            filterEl.addEventListener('change', () => {
                const val = filterEl.value;
                if (val === 'hasTemplate') this._filterHasTemplate = true;
                else if (val === 'noTemplate') this._filterHasTemplate = false;
                else this._filterHasTemplate = undefined;
                this._page = 1;
                this._loadAndRender();
            });
        }

        // 全选
        const selectAllBtn = document.getElementById('sa-select-all');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                if (this._selectedIds.size === this._renderedAnswers.length) {
                    this._selectedIds.clear();
                    selectAllBtn.textContent = '全选';
                } else {
                    this._renderedAnswers.forEach(a => this._selectedIds.add(a.id));
                    selectAllBtn.textContent = '取消全选';
                }
                this._renderList();
            });
        }

        // 删除选中
        const deleteSelectedBtn = document.getElementById('sa-delete-selected');
        if (deleteSelectedBtn) {
            deleteSelectedBtn.addEventListener('click', async () => {
                if (this._selectedIds.size === 0) {
                    if (window.globalToastManager) {
                        window.globalToastManager.show('warning', '请先选择要删除的回答');
                    }
                    return;
                }

                const confirmed = window.globalPopconfirmManager
                    ? await window.globalPopconfirmManager.show({
                        title: `确定删除选中的 ${this._selectedIds.size} 条回答吗？`,
                        confirmText: '删除',
                        confirmTextType: 'danger'
                    })
                    : confirm(`确定删除选中的 ${this._selectedIds.size} 条回答吗？`);

                if (!confirmed) return;

                const manager = window.savedAnswersManager;
                const deleted = await manager.deleteAnswers([...this._selectedIds]);
                this._selectedIds.clear();

                if (window.globalToastManager) {
                    window.globalToastManager.show('success', `已删除 ${deleted} 条回答`);
                }

                await this._loadAndRender();
            });
        }
    }

    /**
     * 切换选中
     */
    _toggleSelection(id) {
        if (this._selectedIds.has(id)) {
            this._selectedIds.delete(id);
        } else {
            this._selectedIds.add(id);
        }
        this._renderList();
    }

    /**
     * 处理操作
     */
    async _handleAction(action, id) {
        const manager = window.savedAnswersManager;
        const answer = this._allAnswers.find(a => a.id === id);
        if (!answer) return;

        switch (action) {
            case 'view':
                this._showDetail(id);
                break;

            case 'extract':
                if (answer.templateId) {
                    // 编辑已有模板
                    const editor = new TemplateEditor({ templateId: answer.templateId, onSave: () => this._loadAndRender() });
                    await editor.show();
                } else {
                    // 新建模板
                    const editor = TemplateEditor.fromAnswer(answer);
                    editor._onSave = () => this._loadAndRender();
                    await editor.show();
                }
                break;

            case 'delete':
                const confirmed = window.globalPopconfirmManager
                    ? await window.globalPopconfirmManager.show({
                        title: '确定删除这条回答吗？',
                        confirmText: '删除',
                        confirmTextType: 'danger'
                    })
                    : confirm('确定删除这条回答吗？');

                if (!confirmed) return;

                try {
                    await manager.deleteAnswer(id);
                    if (window.globalToastManager) {
                        window.globalToastManager.show('success', '回答已删除');
                    }
                    await this._loadAndRender();
                } catch (e) {
                    if (window.globalToastManager) {
                        window.globalToastManager.show('error', '删除失败');
                    }
                }
                break;
        }
    }

    /**
     * 显示回答详情
     */
    _showDetail(id) {
        const answer = this._allAnswers.find(a => a.id === id);
        if (!answer) return;

        const overlay = document.createElement('div');
        overlay.className = 'ait-template-preview-overlay';

        const modal = document.createElement('div');
        modal.className = 'ait-template-preview-modal';

        modal.innerHTML = `
            <div class="ait-template-preview-header">
                <h3>回答详情</h3>
                <button class="ait-template-preview-close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="ait-template-preview-body">
                ${answer.question ? `<div style="margin-bottom:12px;padding:10px;background:rgba(116,80,255,0.04);border-radius:8px;border-left:3px solid #7450ff;">
                    <div style="font-size:11px;color:#7450ff;margin-bottom:4px;font-weight:500;">关联问题</div>
                    <div style="font-size:13px;color:#1d1d1f;">${this._escapeHtml(answer.question)}</div>
                </div>` : ''}
                <div class="ait-template-preview-content">${this._escapeHtml(answer.content)}</div>
            </div>
            <div class="ait-template-preview-footer">
                <button class="ait-template-editor-btn ait-template-editor-btn--cancel" id="detail-close">关闭</button>
                <button class="ait-template-editor-btn ait-template-editor-btn--save" id="detail-extract">
                    ${answer.templateId ? '编辑模板' : '抽取模板'}
                </button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        modal.querySelector('.ait-template-preview-close').addEventListener('click', close);
        modal.querySelector('#detail-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        modal.querySelector('#detail-extract').addEventListener('click', async () => {
            close();
            if (answer.templateId) {
                const editor = new TemplateEditor({ templateId: answer.templateId, onSave: () => this._loadAndRender() });
                await editor.show();
            } else {
                const editor = TemplateEditor.fromAnswer(answer);
                editor._onSave = () => this._loadAndRender();
                await editor.show();
            }
        });

        requestAnimationFrame(() => overlay.classList.add('visible'));
    }

    /**
     * 销毁
     */
    destroy() {
        this._container.innerHTML = '';
        this._selectedIds.clear();
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

/**
 * 以全屏弹窗方式显示已保存回答页面
 */
SavedAnswersUI.showAsOverlay = async function() {
    if (!window.savedAnswersManager) return;

    const overlay = document.createElement('div');
    overlay.className = 'ait-saved-answers-overlay';

    const modal = document.createElement('div');
    modal.className = 'ait-saved-answers-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'ait-saved-answers-modal-header';
    header.innerHTML = `
        <h3>已保存回答管理</h3>
        <button class="ait-saved-answers-modal-close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    `;

    // Body (container for UI)
    const body = document.createElement('div');
    body.className = 'ait-saved-answers-modal-body';

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const ui = new SavedAnswersUI(body);
    await ui.render();

    // Close
    const close = () => overlay.remove();
    header.querySelector('.ait-saved-answers-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    requestAnimationFrame(() => overlay.classList.add('visible'));

    // ESC key
    const onKeyDown = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKeyDown); } };
    document.addEventListener('keydown', onKeyDown);
};

window.SavedAnswersUI = SavedAnswersUI;
