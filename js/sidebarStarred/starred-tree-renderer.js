/**
 * StarredTreeRenderer - 收藏列表树渲染器（共享）
 *
 * 统一侧边栏和 Tab 两个场景的树结构渲染 + 交互逻辑。
 * 消费方通过 options 注入场景差异（搜索、平台图标、Toast 样式等）。
 *
 * @example
 * const renderer = new StarredTreeRenderer({
 *     scene: 'tab',
 *     showSearch: true,
 *     showPlatformIcon: true,
 *     folderManager,
 *     getSearchQuery: () => this.getState('searchQuery'),
 *     ...
 * });
 * renderer.renderTree(tree);
 */

class StarredTreeRenderer {

    /**
     * @param {Object} opts
     * @param {string}   opts.scene            - 'tab' | 'sidebar'
     * @param {boolean}  opts.showSearch        - 搜索过滤（sidebar: false, tab: true）
     * @param {boolean}  opts.showPlatformIcon  - 收藏项是否显示平台 logo
     * @param {string}   opts.emptyClass        - 空状态 CSS class
     * @param {Object}   opts.toastOptions      - Toast 额外参数（如 { color }）
     * @param {number}   [opts.tooltipGap]      - Tooltip gap
     * @param {Object}   opts.folderManager     - FolderManager 实例
     * @param {Function} opts.getSearchQuery    - () => string
     * @param {Function} opts.getFolderStates   - () => object
     * @param {Function} opts.setFolderStates   - (states) => void
     * @param {Function} opts.getListContainer  - () => HTMLElement|null
     * @param {Function} opts.onAfterAction     - 数据变更后的刷新回调
     * @param {Function} [opts.onAfterNavigate] - 导航后回调（tab: 关闭弹窗）
     */
    constructor(opts) {
        this.opts = Object.assign({
            scene: 'tab',
            showSearch: false,
            showPlatformIcon: false,
            emptyClass: 'timeline-starred-empty',
            toastOptions: {},
            tooltipGap: undefined,
            folderManager: null,
            getSearchQuery: () => '',
            getFolderStates: () => ({}),
            setFolderStates: () => {},
            getListContainer: () => null,
            onAfterAction: async () => {},
            onAfterNavigate: () => {},
        }, opts);

        this.folderManager = this.opts.folderManager;
        this._folderDataMap = new Map();
        this._itemDataMap = new Map();
        this._delegateContainer = null;
        this._delegateHandlers = null;
        this._urlChangeHandler = () => this._refreshActiveState();
        window.addEventListener('url:change', this._urlChangeHandler);

        this._dragState = null;
        this._currentDropTarget = null;
        this._dropPosition = null;
        this._currentDropItemTarget = null;
        this._dropItemPosition = null;

        // [新功能] 2024-xx 多选功能状态管理
        // 用于批量移动收藏项
        this._selectedItems = new Set();  // 存储被选中的 turnId
        this._isMultiSelectMode = false;  // 是否处于多选模式

        const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
            (navigator.userAgentData && navigator.userAgentData.platform === 'macOS');
        const gTop = isMac ? '#6CC4F8' : '#FFD666';
        const gBot = isMac ? '#3B9FE7' : '#E5A520';
        const id = this.opts.scene === 'sidebar' ? 'ss' : 'st';
        this._folderSvgClosed = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><defs><linearGradient id="${id}-fc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${gTop}"/><stop offset="100%" stop-color="${gBot}"/></linearGradient></defs><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" fill="url(#${id}-fc)"/></svg>`;
        this._folderSvgOpen  = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><defs><linearGradient id="${id}-fo" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${gTop}"/><stop offset="100%" stop-color="${gBot}"/></linearGradient></defs><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="url(#${id}-fo)" stroke-width="2" fill="none"/></svg>`;
    }

    // ==================== 树渲染 ====================

    renderTree(tree) {
        const list = this.opts.getListContainer();
        if (!list) return;

        if (this._delegateContainer !== list) {
            this._unbindContainerDelegation();
            this._bindContainerDelegation(list);
            this._delegateContainer = list;
        }

        this._folderDataMap.clear();
        this._itemDataMap.clear();

        if (window.globalTooltipManager?.forceHideAll) {
            window.globalTooltipManager.forceHideAll();
        }

        list.innerHTML = '';

        if (tree.folders.length === 0 && tree.uncategorized.length === 0) {
            if (this.opts.scene === 'sidebar') list.style.display = 'none';
            return;
        }
        list.style.display = '';

        // [新功能] 2024-xx 多选功能：渲染批量操作工具栏
        this._renderBatchToolbar(list);

        for (const folder of tree.folders) {
            this.renderFolder(folder, list);
        }

        if (tree.uncategorized.length > 0) {
            this._renderDefaultFolder(tree.uncategorized, list);
        }
        const searchQuery = this.opts.showSearch ? this.opts.getSearchQuery() : '';
        if (searchQuery && list.children.length === 0) {
            list.innerHTML = `
                <div class="${this.opts.emptyClass}">
                    <div style="margin-bottom:8px;">未找到匹配的收藏</div>
                    <div style="font-size:13px;color:#9ca3af;">
                        搜索关键词：<strong>"${this._escapeHtml(searchQuery)}"</strong>
                    </div>
                </div>`;
        }
    }

    /**
     * [新功能] 2024-xx 渲染批量操作工具栏
     * 
     * 【功能说明】
     * 在收藏列表顶部显示多选模式切换按钮和批量操作按钮
     * 
     * 【用户交互】
     * 1. 点击"多选"按钮进入多选模式
     * 2. 在多选模式下，显示复选框和批量操作工具栏
     * 3. 批量操作工具栏包含：全选、取消全选、移动选中项按钮
     * 4. 点击空白处或"取消"可退出多选模式
     */
    _renderBatchToolbar(container) {
        // 创建工具栏容器
        const toolbar = document.createElement('div');
        toolbar.className = 'ait-batch-toolbar';

        // 多选模式切换按钮
        const multiSelectBtn = document.createElement('button');
        multiSelectBtn.className = 'ait-batch-toolbar-btn';
        multiSelectBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <span>${chrome.i18n.getMessage('multiSelect') || '多选'}</span>
        `;
        multiSelectBtn.addEventListener('click', () => this._toggleMultiSelectMode());
        toolbar.appendChild(multiSelectBtn);

        // 批量操作区域（多选模式下显示）
        const batchActions = document.createElement('div');
        batchActions.className = 'ait-batch-actions';
        batchActions.style.display = 'none';

        // 已选数量显示
        const selectedCount = document.createElement('span');
        selectedCount.className = 'ait-batch-selected-count';
        selectedCount.textContent = chrome.i18n.getMessage('selectedCount') || '已选 0 项';
        batchActions.appendChild(selectedCount);

        // 全选按钮
        const selectAllBtn = document.createElement('button');
        selectAllBtn.className = 'ait-batch-action-btn';
        selectAllBtn.innerHTML = chrome.i18n.getMessage('selectAll') || '全选';
        selectAllBtn.addEventListener('click', () => this._selectAllItems());
        batchActions.appendChild(selectAllBtn);

        // 取消全选按钮
        const deselectAllBtn = document.createElement('button');
        deselectAllBtn.className = 'ait-batch-action-btn';
        deselectAllBtn.innerHTML = chrome.i18n.getMessage('deselectAll') || '取消全选';
        deselectAllBtn.addEventListener('click', () => this._deselectAllItems());
        batchActions.appendChild(deselectAllBtn);

        // 移动选中项按钮
        const moveBtn = document.createElement('button');
        moveBtn.className = 'ait-batch-action-btn primary';
        moveBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
                <polyline points="17 1 21 5 17 9"></polyline>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <polyline points="7 23 3 19 7 15"></polyline>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>
            <span>${chrome.i18n.getMessage('moveSelected') || '移动选中项'}</span>
        `;
        moveBtn.addEventListener('click', () => this._handleBatchMove());
        batchActions.appendChild(moveBtn);

        // 取消按钮
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'ait-batch-action-btn';
        cancelBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            <span>${chrome.i18n.getMessage('cancel') || '取消'}</span>
        `;
        cancelBtn.addEventListener('click', () => this._toggleMultiSelectMode(false));
        batchActions.appendChild(cancelBtn);

        toolbar.appendChild(batchActions);

        // 保存引用以便后续更新
        this._batchToolbar = toolbar;
        this._batchActions = batchActions;
        this._selectedCountEl = selectedCount;

        container.appendChild(toolbar);
    }

    renderFolder(folder, container, level = 0) {
        const searchQuery = this.opts.showSearch ? this.opts.getSearchQuery() : '';
        const folderStates = this.opts.getFolderStates();

        let filteredItems = folder.items;
        let folderNameMatches = false;

        if (searchQuery) {
            folderNameMatches = folder.name.toLowerCase().includes(searchQuery);
            filteredItems = folderNameMatches
                ? folder.items
                : folder.items.filter(item => this._matchesSearch(item, searchQuery));

            const hasMatchingChildren = (folder.children || []).some(child => {
                const childNameMatches = child.name.toLowerCase().includes(searchQuery);
                const childHasItems = child.items.some(item => this._matchesSearch(item, searchQuery));
                return childNameMatches || childHasItems;
            });

            if (!folderNameMatches && filteredItems.length === 0 && !hasMatchingChildren) {
                return;
            }
        }

        const isExpanded = searchQuery ? true : (folderStates[folder.id] === true);

        this._folderDataMap.set(folder.id, { folder, level });

        const folderEl = document.createElement('div');
        folderEl.className = `ait-folder-item ait-folder-level-${level}`;
        folderEl.dataset.folderId = folder.id;

        const header = document.createElement('div');
        header.className = 'ait-folder-header';
        header.draggable = true;

        const toggle = document.createElement('span');
        toggle.className = `ait-folder-toggle ${isExpanded ? 'expanded' : ''}`;
        toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

        const info = document.createElement('div');
        info.className = 'ait-folder-info';
        const iconHtml = folder.icon
            ? this._escapeHtml(folder.icon)
            : (isExpanded ? this._folderSvgOpen : this._folderSvgClosed);
        info.innerHTML = `<span class="ait-folder-icon">${iconHtml}</span><span class="ait-folder-name">${this._escapeHtml(folder.name)}</span>`;
        info.style.cursor = 'pointer';

        const actions = document.createElement('div');
        actions.className = 'ait-folder-actions';

        if (folder.pinned) {
            const pinIcon = document.createElement('span');
            pinIcon.className = 'ait-pin-indicator';
            pinIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.5"><line x1="5" y1="3" x2="19" y2="3"/><line x1="12" y1="7" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/></svg>';
            actions.appendChild(pinIcon);
        }

        const actBtn = document.createElement('button');
        actBtn.className = 'ait-folder-action-btn';
        actBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
        actions.appendChild(actBtn);

        header.appendChild(toggle);
        header.appendChild(info);
        header.appendChild(actions);
        folderEl.appendChild(header);

        const content = document.createElement('div');
        content.className = `ait-folder-content ${isExpanded ? 'expanded' : ''}`;

        if (folder.children && folder.children.length > 0) {
            for (const child of folder.children) {
                this.renderFolder(child, content, level + 1);
            }
        }
        for (const item of filteredItems) {
            content.appendChild(this.renderStarredItem(item));
        }

        folderEl.appendChild(content);
        container.appendChild(folderEl);
    }

    _renderDefaultFolder(items, container) {
        const searchQuery = this.opts.showSearch ? this.opts.getSearchQuery() : '';
        const folderStates = this.opts.getFolderStates();

        const filteredItems = searchQuery
            ? items.filter(item => this._matchesSearch(item, searchQuery))
            : items;

        if (searchQuery && filteredItems.length === 0) return;

        const isExpanded = searchQuery ? true : (folderStates['__default__'] !== false);

        const folderEl = document.createElement('div');
        folderEl.className = 'ait-folder-item ait-folder-level-0 default-folder';
        folderEl.dataset.folderId = '__default__';

        const header = document.createElement('div');
        header.className = 'ait-folder-header';

        const toggle = document.createElement('span');
        toggle.className = `ait-folder-toggle ${isExpanded ? 'expanded' : ''}`;
        toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

        const info = document.createElement('div');
        info.className = 'ait-folder-info';
        info.innerHTML = `<span class="ait-folder-icon">${isExpanded ? this._folderSvgOpen : this._folderSvgClosed}</span><span class="ait-folder-name">${chrome.i18n.getMessage('defaultFolder') || 'Default'}</span>`;
        info.style.cursor = 'pointer';

        header.appendChild(toggle);
        header.appendChild(info);
        folderEl.appendChild(header);

        const content = document.createElement('div');
        content.className = `ait-folder-content ${isExpanded ? 'expanded' : ''}`;

        for (const item of filteredItems) {
            content.appendChild(this.renderStarredItem(item));
        }

        folderEl.appendChild(content);
        container.appendChild(folderEl);
    }

    renderStarredItem(item) {
        this._itemDataMap.set(item.turnId, item);

        const el = document.createElement('div');
        el.className = 'timeline-starred-item';
        el.dataset.turnId = item.turnId;
        el.draggable = true;

        if (this._isCurrentPage(item)) {
            el.classList.add('active');
        }

        // [新功能] 2024-xx 多选功能：添加复选框
        // 多选模式下显示复选框，非多选模式隐藏
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'ait-multi-select-checkbox';
        checkbox.dataset.turnId = item.turnId;
        // 非多选模式时复选框不显示，但保持可点击（用于切换多选模式）
        el.appendChild(checkbox);

        if (this.opts.showPlatformIcon) {
            const siteInfo = getSiteInfoByUrl(item.url);
            const logo = document.createElement('div');
            logo.className = 'timeline-starred-item-logo';
            if (siteInfo.logo) {
                const img = document.createElement('img');
                img.src = siteInfo.logo;
                img.alt = siteInfo.name;
                logo.appendChild(img);
            } else {
                const initial = document.createElement('div');
                initial.className = 'timeline-starred-item-initial';
                initial.textContent = siteInfo.name.charAt(0).toUpperCase();
                logo.appendChild(initial);
            }
            el.appendChild(logo);
        }

        const name = document.createElement('div');
        name.className = 'timeline-starred-item-name';
        name.textContent = item.theme;
        el.appendChild(name);

        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'timeline-starred-item-actions';

        if (item.pinned) {
            const pinIcon = document.createElement('span');
            pinIcon.className = 'ait-pin-indicator';
            pinIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.5"><line x1="5" y1="3" x2="19" y2="3"/><line x1="12" y1="7" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/></svg>';
            actionsWrap.appendChild(pinIcon);
        }

        const moreBtn = document.createElement('button');
        moreBtn.className = 'timeline-starred-item-more';
        moreBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
        actionsWrap.appendChild(moreBtn);
        el.appendChild(actionsWrap);

        // [新功能] 2024-xx 多选功能：更新选中状态
        if (this._selectedItems.has(item.turnId)) {
            el.classList.add('selected');
            checkbox.checked = true;
        }

        return el;
    }

    // ==================== 容器级事件委托 ====================

    _bindContainerDelegation(container) {
        let hoveredName = null;

        let _clickTimer = null;
        const DBLCLICK_DELAY = 250;

        const onClick = (e) => {
            // [新功能] 2024-xx 多选功能：处理复选框点击
            const checkbox = e.target.closest('.ait-multi-select-checkbox');
            if (checkbox) {
                e.stopPropagation();
                const itemEl = checkbox.closest('.timeline-starred-item');
                if (itemEl) {
                    // 如果没有开启多选模式，先开启
                    if (!this._isMultiSelectMode) {
                        this._toggleMultiSelectMode(true);
                    }
                    const turnId = itemEl.dataset.turnId;
                    if (turnId) {
                        this._toggleItemSelection(turnId);
                    }
                }
                return;
            }

            const toggle = e.target.closest('.ait-folder-toggle');
            if (toggle) {
                const folderEl = toggle.closest('.ait-folder-item');
                if (folderEl) this.toggleFolder(folderEl.dataset.folderId);
                return;
            }

            const info = e.target.closest('.ait-folder-info');
            if (info) {
                const folderEl = info.closest('.ait-folder-item');
                if (folderEl) {
                    if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; }
                    const folderId = folderEl.dataset.folderId;
                    _clickTimer = setTimeout(() => { _clickTimer = null; this.toggleFolder(folderId); }, DBLCLICK_DELAY);
                }
                return;
            }

            const actBtn = e.target.closest('.ait-folder-action-btn');
            if (actBtn) {
                e.stopPropagation();
                const folderEl = actBtn.closest('.ait-folder-item');
                if (folderEl) {
                    const data = this._folderDataMap.get(folderEl.dataset.folderId);
                    if (data) this._showFolderMenu(actBtn, data.folder, data.level);
                }
                return;
            }

            // [新功能] 2024-xx 多选功能：点击收藏项名称时，如果是多选模式则切换选中状态
            if (e.target.closest('.timeline-starred-item-name')) {
                const itemEl = e.target.closest('.timeline-starred-item');
                if (itemEl) {
                    const item = this._itemDataMap.get(itemEl.dataset.turnId);
                    if (item) {
                        if (this._isMultiSelectMode) {
                            // 多选模式下，点击名称切换选中状态
                            const turnId = itemEl.dataset.turnId;
                            if (turnId) {
                                this._toggleItemSelection(turnId);
                            }
                        } else {
                            // 非多选模式下，执行原有导航逻辑
                            if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; }
                            _clickTimer = setTimeout(() => { _clickTimer = null; this._navigateToItem(item); }, DBLCLICK_DELAY);
                        }
                    }
                }
                return;
            }

            const moreBtn = e.target.closest('.timeline-starred-item-more');
            if (moreBtn) {
                e.stopPropagation();
                const itemEl = moreBtn.closest('.timeline-starred-item');
                if (itemEl) {
                    const item = this._itemDataMap.get(itemEl.dataset.turnId);
                    if (item) this._showItemMenu(moreBtn, item);
                }
                return;
            }
        };

        const onMouseover = (e) => {
            const name = e.target.closest('.timeline-starred-item-name');
            if (name === hoveredName) return;
            if (hoveredName) { window.globalTooltipManager?.hide(); hoveredName = null; }
            if (!name || name.scrollWidth <= name.clientWidth) return;
            if (!window.globalTooltipManager) return;
            const itemEl = name.closest('.timeline-starred-item');
            const item = itemEl ? this._itemDataMap.get(itemEl.dataset.turnId) : null;
            if (!item) return;
            hoveredName = name;
            const tipOpts = { placement: 'right' };
            if (this.opts.tooltipGap !== undefined) tipOpts.gap = this.opts.tooltipGap;
            window.globalTooltipManager.show('starred-item-name', 'button', itemEl, item.theme, tipOpts);
        };

        const onMouseout = (e) => {
            const name = e.target.closest('.timeline-starred-item-name');
            if (name && !name.contains(e.relatedTarget)) {
                hoveredName = null;
                window.globalTooltipManager?.hide();
            }
        };

        // ---- 收藏项自定义拖拽（mousedown/move/up） ----
        let _itemCD = null;

        const onItemMouseDown = (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('.timeline-starred-item-more') || e.target.closest('.timeline-starred-item-actions')) return;
            const itemEl = e.target.closest('.timeline-starred-item');
            if (!itemEl) return;
            const turnId = itemEl.dataset.turnId;
            const item = this._itemDataMap.get(turnId);
            if (!item) return;
            _itemCD = {
                startX: e.clientX, startY: e.clientY,
                turnId, sourceFolderId: item.folderId || null,
                sourceEl: itemEl, title: item.theme || '',
                active: false, ghost: null
            };
        };

        const onItemMouseMove = (e) => {
            if (!_itemCD) return;
            if (!_itemCD.active) {
                if (Math.abs(e.clientX - _itemCD.startX) < 5 && Math.abs(e.clientY - _itemCD.startY) < 5) return;
                _itemCD.active = true;
                document.body.classList.add('ait-custom-dragging');
                _itemCD.sourceEl.style.opacity = '0.35';
                _itemCD.sourceEl.style.transition = 'opacity 0.15s';
                const ghost = document.createElement('div');
                ghost.className = 'ait-custom-drag-ghost';
                ghost.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${this._escapeHtml(_itemCD.title || 'Item')}</span>`;
                document.body.appendChild(ghost);
                _itemCD.ghost = ghost;
            }
            if (_itemCD.ghost) {
                _itemCD.ghost.style.left = (e.clientX + 14) + 'px';
                _itemCD.ghost.style.top = (e.clientY - 16) + 'px';
            }
            const target = this._detectDropTarget(e.clientX, e.clientY, _itemCD.turnId);
            this._clearDropIndicator();
            this._clearItemDropIndicator();
            if (target?.type === 'item') {
                this._setItemDropIndicator(target.itemEl, target.position);
                const targetFid = target.folderId === '__default__' ? null : target.folderId;
                if (targetFid !== _itemCD.sourceFolderId) {
                    this._setDropIndicator(target.folderEl, 'inside');
                }
            } else if (target?.type === 'folder') {
                const fid = target.folderId;
                const actualId = fid === '__default__' ? null : fid;
                if (actualId !== _itemCD.sourceFolderId) this._setDropIndicator(target.folderEl, 'inside');
            }
        };

        const onItemMouseUp = (e) => {
            if (!_itemCD) return;
            if (_itemCD.active) {
                const target = this._detectDropTarget(e.clientX, e.clientY, _itemCD.turnId);
                if (target?.type === 'item') {
                    const actualFid = target.folderId === '__default__' ? null : target.folderId;
                    const draggedTurnId = _itemCD.turnId;

                    // [可能移除] 拖拽自动置顶：在 DOM 重渲染前推断 pinned 状态
                    const shouldPin = this._inferPinFromDrop(target.itemEl);
                    const currentItem = this._itemDataMap.get(draggedTurnId);
                    const needsPinChange = currentItem && (!!currentItem.pinned !== shouldPin);

                    this.folderManager.reorderStarredInFolder(
                        draggedTurnId, actualFid, target.turnId, target.position
                    ).then(async () => {
                        // [可能移除] 拖拽自动置顶：同步 pinned 状态到 storage
                        if (needsPinChange) {
                            await StarStorageManager.update(`chatTimelineStar:${draggedTurnId}`, { pinned: shouldPin });
                        }
                        this._toastAtFolder(target.folderEl, 'dragMoveSuccess', 'Moved');
                        this.opts.onAfterAction();
                    }).catch(err => console.error('[StarredTreeRenderer] Item reorder failed:', err));
                } else if (target?.type === 'folder') {
                    const actualId = target.folderId === '__default__' ? null : target.folderId;
                    if (actualId !== _itemCD.sourceFolderId) {
                        this.folderManager.moveStarredToFolder(_itemCD.turnId, actualId).then(() => {
                            this._toastAtFolder(target.folderEl, 'dragMoveSuccess', 'Moved');
                            this.opts.onAfterAction();
                        }).catch(err => console.error('[StarredTreeRenderer] Item move failed:', err));
                    }
                } else {
                    const listContainer = this.opts.getListContainer();
                    const boundary = listContainer?.closest('.ait-sidebar-starred') || listContainer?.closest('.starred-tab-container') || listContainer;
                    if (boundary) {
                        const rect = boundary.getBoundingClientRect();
                        const outside = e.clientX < rect.left || e.clientX > rect.right ||
                                        e.clientY < rect.top || e.clientY > rect.bottom;
                        if (outside) {
                            const fid = _itemCD.sourceFolderId || '__default__';
                            const folderEl = listContainer.querySelector(`[data-folder-id="${fid}"]`);
                            const turnId = _itemCD.turnId;
                            itemCDCleanup();
                            this.handleUnstar(turnId, folderEl);
                            return;
                        }
                    }
                }
            }
            itemCDCleanup();
        };

        const onItemKeyDown = (e) => { if (e.key === 'Escape' && _itemCD?.active) itemCDCleanup(); };

        const itemCDCleanup = () => {
            if (!_itemCD) return;
            document.body.classList.remove('ait-custom-dragging');
            if (_itemCD.sourceEl) { _itemCD.sourceEl.style.opacity = ''; _itemCD.sourceEl.style.transition = ''; }
            if (_itemCD.ghost) _itemCD.ghost.remove();
            this._clearDropIndicator();
            this._clearItemDropIndicator();
            _itemCD = null;
        };

        const onDragStart = (e) => {
            if (_itemCD) { e.preventDefault(); return; }

            const headerEl = e.target.closest('.ait-folder-header');
            if (headerEl) {
                const folderEl = headerEl.closest('.ait-folder-item');
                if (!folderEl || folderEl.classList.contains('default-folder')) {
                    e.preventDefault();
                    return;
                }
                const folderId = folderEl.dataset.folderId;
                const data = this._folderDataMap.get(folderId);
                if (!data) { e.preventDefault(); return; }
                this._dragState = {
                    type: 'folder', id: folderId,
                    sourceLevel: data.level,
                    sourceParentId: data.folder.parentId || null,
                    element: folderEl
                };
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', folderId);
                requestAnimationFrame(() => folderEl.classList.add('ait-dragging'));
            }
        };

        const onDragOver = (e) => {
            if (!this._dragState) {
                const folderEl = e.target.closest('.ait-folder-item');
                if (!folderEl) { this._clearDropIndicator(); return; }
                const types = e.dataTransfer?.types || [];
                if (types.includes('text/uri-list') || types.includes('text/plain') || types.includes('text/html')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    this._setDropIndicator(folderEl, 'inside');
                }
                return;
            }

            const folderEl = e.target.closest('.ait-folder-item');
            if (!folderEl) { this._clearDropIndicator(); return; }

            const targetFolderId = folderEl.dataset.folderId;

            if (this._dragState.type === 'item') {
                const actualTargetId = targetFolderId === '__default__' ? null : targetFolderId;
                if (actualTargetId === this._dragState.sourceFolderId) {
                    this._clearDropIndicator();
                    return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                this._setDropIndicator(folderEl, 'inside');

            } else if (this._dragState.type === 'folder') {
                if (targetFolderId === this._dragState.id || targetFolderId === '__default__') {
                    this._clearDropIndicator();
                    return;
                }
                const targetData = this._folderDataMap.get(targetFolderId);
                if (!targetData) { this._clearDropIndicator(); return; }

                const sameParent = targetData.level === this._dragState.sourceLevel &&
                    (targetData.folder.parentId || null) === this._dragState.sourceParentId;

                if (sameParent) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const headerEl = folderEl.querySelector(':scope > .ait-folder-header');
                    const rect = headerEl ? headerEl.getBoundingClientRect() : folderEl.getBoundingClientRect();
                    const pos = e.clientY < (rect.top + rect.height / 2) ? 'before' : 'after';
                    this._setDropIndicator(folderEl, pos);
                } else if (targetData.level === 0 && targetFolderId !== this._dragState.sourceParentId) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    this._setDropIndicator(folderEl, 'inside');
                } else {
                    this._clearDropIndicator();
                }
            }
        };

        const onDrop = async (e) => {
            if (!this._dragState) {
                e.preventDefault();
                const folderEl = e.target.closest('.ait-folder-item');
                if (folderEl) {
                    const url = (e.dataTransfer.getData('text/uri-list') || '').split('\n').filter(l => l && !l.startsWith('#'))[0]?.trim()
                             || e.dataTransfer.getData('URL') || '';
                    const plainText = e.dataTransfer.getData('text/plain') || '';
                    const html = e.dataTransfer.getData('text/html') || '';
                    if (url) {
                        await this._handleExternalDrop(url, plainText, html, folderEl);
                    }
                }
                this._clearDropIndicator();
                return;
            }
            e.preventDefault();

            const folderEl = e.target.closest('.ait-folder-item');
            if (!folderEl) { this._cleanupDrag(); return; }

            const targetFolderId = folderEl.dataset.folderId;

            if (this._dragState.type === 'item') {
                const actualTargetId = targetFolderId === '__default__' ? null : targetFolderId;
                if (actualTargetId === this._dragState.sourceFolderId) { this._cleanupDrag(); return; }
                try {
                    await this.folderManager.moveStarredToFolder(this._dragState.id, actualTargetId);
                    this._toast('success', 'dragMoveSuccess', 'Moved');
                    await this.opts.onAfterAction();
                } catch (err) {
                    console.error('[StarredTreeRenderer] Drag move failed:', err);
                }

            } else if (this._dragState.type === 'folder') {
                if (targetFolderId === this._dragState.id || targetFolderId === '__default__') {
                    this._cleanupDrag(); return;
                }
                const position = this._dropPosition;
                if (position === 'inside') {
                    const result = await this.folderManager.moveFolderToParent(this._dragState.id, targetFolderId);
                    if (result.ok) {
                        this._toastAtFolder(folderEl, 'dragMoveSuccess', 'Moved');
                        await this.opts.onAfterAction();
                    } else if (result.error === 'hasChildren') {
                        this._toast('error', 'folderMoveHasChildren', 'Has subfolders, cannot nest further');
                    } else if (result.error === 'maxDepth') {
                        this._toast('error', 'folderMoveMaxDepth', 'Maximum folder depth reached');
                    }
                } else if (position === 'before' || position === 'after') {
                    try {
                        await this.folderManager.moveFolderToPosition(this._dragState.id, targetFolderId, position);
                        this._toastAtFolder(folderEl, 'dragMoveSuccess', 'Moved');
                        await this.opts.onAfterAction();
                    } catch (err) {
                        console.error('[StarredTreeRenderer] Folder reorder failed:', err);
                    }
                }
            }
            this._cleanupDrag();
        };

        const onDragEnd = () => { this._cleanupDrag(); };

        const onDblClick = (e) => {
            if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; }

            const info = e.target.closest('.ait-folder-info');
            if (info) {
                const folderEl = info.closest('.ait-folder-item');
                if (folderEl && !folderEl.classList.contains('default-folder')) {
                    const data = this._folderDataMap.get(folderEl.dataset.folderId);
                    if (data) this.handleEditFolder(data.folder.id, data.folder.name);
                }
                return;
            }

            const nameEl = e.target.closest('.timeline-starred-item-name');
            if (nameEl) {
                const itemEl = nameEl.closest('.timeline-starred-item');
                if (itemEl) {
                    const item = this._itemDataMap.get(itemEl.dataset.turnId);
                    if (item) this.handleEditStarred(item.turnId, item.fullContent, item.folderId);
                }
                return;
            }
        };

        container.addEventListener('dblclick', onDblClick);
        container.addEventListener('click', onClick);
        container.addEventListener('mouseover', onMouseover);
        container.addEventListener('mouseout', onMouseout);
        container.addEventListener('mousedown', onItemMouseDown, true);
        container.addEventListener('dragstart', onDragStart);
        container.addEventListener('dragover', onDragOver);
        container.addEventListener('drop', onDrop);
        container.addEventListener('dragend', onDragEnd);
        document.addEventListener('mousemove', onItemMouseMove);
        document.addEventListener('mouseup', onItemMouseUp);
        document.addEventListener('keydown', onItemKeyDown);

        this._delegateHandlers = { container, onDblClick, onClick, onMouseover, onMouseout, onItemMouseDown, onItemMouseMove, onItemMouseUp, onItemKeyDown, onDragStart, onDragOver, onDrop, onDragEnd };
    }

    _unbindContainerDelegation() {
        if (!this._delegateHandlers) return;
        const h = this._delegateHandlers;
        if (h.onDblClick) h.container.removeEventListener('dblclick', h.onDblClick);
        h.container.removeEventListener('click', h.onClick);
        h.container.removeEventListener('mouseover', h.onMouseover);
        h.container.removeEventListener('mouseout', h.onMouseout);
        h.container.removeEventListener('mousedown', h.onItemMouseDown, true);
        if (h.onDragStart) {
            h.container.removeEventListener('dragstart', h.onDragStart);
            h.container.removeEventListener('dragover', h.onDragOver);
            h.container.removeEventListener('drop', h.onDrop);
            h.container.removeEventListener('dragend', h.onDragEnd);
        }
        if (h.onItemMouseMove) {
            document.removeEventListener('mousemove', h.onItemMouseMove);
            document.removeEventListener('mouseup', h.onItemMouseUp);
            document.removeEventListener('keydown', h.onItemKeyDown);
        }
        this._delegateHandlers = null;
    }

    // ==================== 展开 / 折叠 ====================

    toggleFolder(folderId) {
        const states = this.opts.getFolderStates();
        states[folderId] = !states[folderId];
        this.opts.setFolderStates(states);

        const list = this.opts.getListContainer();
        if (!list) return;

        const folderEl = list.querySelector(`[data-folder-id="${folderId}"]`);
        if (!folderEl) return;

        const toggle = folderEl.querySelector('.ait-folder-toggle');
        const content = folderEl.querySelector('.ait-folder-content');
        const icon = folderEl.querySelector('.ait-folder-icon');
        const expanded = states[folderId];

        if (toggle) toggle.classList.toggle('expanded', expanded);
        if (content) content.classList.toggle('expanded', expanded);
        if (icon && !icon.textContent.trim()) {
            icon.innerHTML = expanded ? this._folderSvgOpen : this._folderSvgClosed;
        }
    }

    // ==================== 菜单 ====================

    _showFolderMenu(trigger, folder, level) {
        const items = [];

        if (level === 0) {
            items.push({
                label: chrome.i18n.getMessage('vpmzkx') || 'New Subfolder',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
                onClick: () => this.handleCreateFolder(folder.id)
            });
        }

        items.push({
            label: folder.pinned ? (chrome.i18n.getMessage('unpinItem') || 'Unpin') : (chrome.i18n.getMessage('pinItem') || 'Pin to top'),
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="3" x2="19" y2="3"/><line x1="12" y1="7" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/></svg>',
            onClick: () => this._handleTogglePinFolder(folder.id)
        });

        items.push({
            label: chrome.i18n.getMessage('xvkpmz') || 'Edit',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
            onClick: () => this.handleEditFolder(folder.id, folder.name)
        });

        items.push({ type: 'divider' });

        items.push({
            label: chrome.i18n.getMessage('mzxvkp') || 'Delete',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
            className: 'danger',
            onClick: () => this.handleDeleteFolder(folder.id)
        });

        window.globalDropdownManager.show({ trigger, items, position: 'bottom-right', width: 160 });
    }

    async _showItemMenu(trigger, item) {
        const items = [
            {
                label: item.pinned ? (chrome.i18n.getMessage('unpinItem') || 'Unpin') : (chrome.i18n.getMessage('pinItem') || 'Pin to top'),
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="3" x2="19" y2="3"/><line x1="12" y1="7" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/></svg>',
                onClick: () => this._handleTogglePinStarred(item.turnId)
            },
            {
                label: chrome.i18n.getMessage('vkpxzm') || 'Edit',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
                onClick: () => this.handleEditStarred(item.turnId, item.fullContent, item.folderId)
            },
            {
                label: chrome.i18n.getMessage('vxkpmz') || 'Move to',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
                onClick: () => this.handleEditStarred(item.turnId, item.fullContent, item.folderId)
            },
            {
                label: chrome.i18n.getMessage('mvkxpz') || 'Copy',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
                onClick: () => this.handleCopy(item.theme)
            },
            { type: 'divider' },
            {
                label: chrome.i18n.getMessage('bpxjkw') || 'Unstar',
                icon: '<svg viewBox="0 0 24 24" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="0.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
                className: 'danger',
                onClick: () => this.handleUnstar(item.turnId)
            }
        ];

        window.globalDropdownManager.show({ trigger, items, position: 'bottom-right', width: 160 });
    }

    // ==================== 操作（CRUD） ====================

    _toast(type, msgKey, fallback) {
        if (!window.globalToastManager) return;
        const o = this.opts.toastOptions;
        const hasOpts = o && Object.keys(o).length > 0;
        window.globalToastManager[type](
            chrome.i18n.getMessage(msgKey) || fallback,
            null,
            hasOpts ? o : undefined
        );
    }

    _toastAtFolder(folderEl, msgKey, fallback) {
        if (!window.globalToastManager) return;
        const header = folderEl.querySelector(':scope > .ait-folder-header') || folderEl;
        window.globalToastManager.success(
            chrome.i18n.getMessage(msgKey) || fallback,
            header,
            {
                position: 'right',
                gap: 6,
                color: {
                    light: { backgroundColor: '#0d0d0d', textColor: '#ffffff', borderColor: '#0d0d0d' },
                    dark: { backgroundColor: '#ffffff', textColor: '#1f2937', borderColor: '#e5e7eb' }
                }
            }
        );
    }

    async handleCreateFolder(parentId = null) {
        if (!window.folderEditModal) return;
        try {
            const parentPath = parentId ? await this.folderManager.getFolderPath(parentId) : '';
            const title = parentId
                ? (chrome.i18n.getMessage('xmkvpz') || 'New subfolder in {folderName}').replace('{folderName}', parentPath)
                : chrome.i18n.getMessage('kxvpmz') || 'New Folder';

            const result = await window.folderEditModal.show({
                mode: 'create', title,
                placeholder: chrome.i18n.getMessage('vzkpmx') || 'Folder name',
                requiredMessage: chrome.i18n.getMessage('kmxpvz') || 'Name is required',
                maxLength: 15
            });
            if (!result) return;

            const exists = await this.folderManager.isFolderNameExists(result.name, parentId);
            if (exists) { this._toast('error', 'kpvzmx', 'Name already exists'); return; }

            await this.folderManager.createFolder(result.name, parentId, result.icon);
            this._toast('success', 'xzvkpm', 'Created');
            await this.opts.onAfterAction();
        } catch (error) {
            console.error('[StarredTreeRenderer] Create folder failed:', error);
            if (error.message) this._toast('error', '', error.message);
        }
    }

    async handleEditFolder(folderId, currentName) {
        if (!window.folderEditModal) return;
        try {
            const folders = await this.folderManager.getFolders();
            const folder = folders.find(f => f.id === folderId);
            if (!folder) return;
            const parentId = folder.parentId || null;

            const result = await window.folderEditModal.show({
                mode: 'edit',
                title: chrome.i18n.getMessage('pxmzvk') || 'Edit Folder',
                name: currentName,
                icon: folder.icon || '',
                placeholder: chrome.i18n.getMessage('mvzxkp') || 'Folder name',
                maxLength: 15
            });
            if (!result) return;

            const nameChanged = result.name !== currentName;
            const iconChanged = result.icon !== (folder.icon || '');
            if (!nameChanged && !iconChanged) return;

            if (nameChanged) {
                const exists = await this.folderManager.isFolderNameExists(result.name, parentId, folderId);
                if (exists) { this._toast('error', 'kpvzmx', 'Name already exists'); return; }
            }

            await this.folderManager.updateFolder(folderId, result.name, result.icon);
            this._toast('success', 'folderUpdated', 'Updated');
            await this.opts.onAfterAction();
        } catch (error) {
            console.error('[StarredTreeRenderer] Edit folder failed:', error);
        }
    }

    async handleDeleteFolder(folderId) {
        try {
            const tree = await this.folderManager.getStarredByFolder();
            let folderData = tree.folders.find(f => f.id === folderId);
            if (!folderData) {
                for (const parent of tree.folders) {
                    if (parent.children) {
                        folderData = parent.children.find(c => c.id === folderId);
                        if (folderData) break;
                    }
                }
            }
            if (!folderData) { this._toast('error', 'zpxmkv', 'Folder not found'); return; }

            const totalItems = this._countAllItems(folderData);
            const title = (chrome.i18n.getMessage('qzmvkx') || 'Delete folder "{folderName}"?')
                .replace('{folderName}', folderData.name);
            const content = totalItems > 0
                ? (chrome.i18n.getMessage('wjxnkp') || '{count} starred items inside will also be deleted.')
                    .replace('{count}', totalItems)
                : '';

            const confirmed = await window.globalPopconfirmManager.show({
                title,
                content,
                confirmTextType: 'danger'
            });
            if (!confirmed) return;
            await this.folderManager.deleteFolder(folderId);
            this._toast('success', 'kvpzmx', 'Deleted');
            await this.opts.onAfterAction();
        } catch (error) {
            console.error('[StarredTreeRenderer] Delete folder failed:', error);
            this._toast('error', 'mxkvzp', 'Delete failed');
        }
    }

    async _handleTogglePinFolder(folderId) {
        try {
            await this.folderManager.togglePinFolder(folderId);
            await this.opts.onAfterAction();
        } catch (error) {
            console.error('[StarredTreeRenderer] Toggle pin folder failed:', error);
        }
    }

    async _handleTogglePinStarred(turnId) {
        try {
            await this.folderManager.togglePinStarred(turnId);
            await this.opts.onAfterAction();
        } catch (error) {
            console.error('[StarredTreeRenderer] Toggle pin starred failed:', error);
        }
    }

    async handleEditStarred(turnId, currentTheme, currentFolderId) {
        if (!window.starInputModal) return;
        try {
            const result = await window.starInputModal.show({
                title: chrome.i18n.getMessage('vkpxzm') || 'Edit',
                defaultValue: currentTheme,
                placeholder: chrome.i18n.getMessage('zmxvkp') || 'Title',
                folderManager: this.folderManager,
                defaultFolderId: currentFolderId || null
            });
            if (!result || !result.value?.trim()) return;

            const key = `chatTimelineStar:${turnId}`;
            const item = await StarStorageManager.findByKey(key);
            if (item) {
                const updates = {};
                if (result.value.trim() !== currentTheme) updates.question = result.value.trim();
                if (result.folderId !== (currentFolderId || null)) updates.folderId = result.folderId;
                if (Object.keys(updates).length > 0) {
                    await StarStorageManager.update(key, updates);
                    this._toast('success', 'vmkxpz', 'Updated');
                    await this.opts.onAfterAction();
                }
            }
        } catch (error) {
            console.error('[StarredTreeRenderer] Edit starred failed:', error);
        }
    }

    async handleCopy(text) {
        try {
            await navigator.clipboard.writeText(text);
            this._toast('success', 'xpzmvk', 'Copied');
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); this._toast('success', 'xpzmvk', 'Copied'); }
            catch { this._toast('error', 'kpzmvx', 'Copy failed'); }
            finally { document.body.removeChild(ta); }
        }
    }

    async handleUnstar(turnId, anchorEl = null) {
        try {
            if (!anchorEl) {
                const list = this.opts.getListContainer();
                if (list) {
                    const items = list.querySelectorAll('.timeline-starred-item');
                    for (const el of items) {
                        if (el.dataset.turnId === turnId) {
                            anchorEl = el.closest('.ait-folder-item');
                            break;
                        }
                    }
                }
            }

            const key = `chatTimelineStar:${turnId}`;
            await StarStorageManager.remove(key);

            if (anchorEl) {
                this._toastAtFolder(anchorEl, 'pzmvkx', 'Unstarred');
            } else {
                this._toast('success', 'pzmvkx', 'Unstarred');
            }
            await this.opts.onAfterAction();
        } catch (error) {
            console.error('[StarredTreeRenderer] Unstar failed:', error);
        }
    }

    // ==================== 点击导航 ====================

    async _navigateToItem(item) {
        const url = item.url || `https://${item.urlWithoutProtocol}`;
        const nodeKey = item.nodeId !== undefined ? item.nodeId : item.index;
        const needsScroll = nodeKey !== undefined && nodeKey !== -1;
        const isSamePage = location.href === url ||
            location.href.replace(/^https?:\/\//, '') === url.replace(/^https?:\/\//, '');

        if (isSamePage) {
            const tm = window.timelineManager;
            if (needsScroll && tm) {
                const marker = this._findMarker(tm, nodeKey);
                if (marker?.element) tm.smoothScrollTo(marker.element);
            }
            this.opts.onAfterNavigate();
        } else if (this._isSameSite(url)) {
            if (needsScroll && window.timelineManager) {
                await window.timelineManager.setNavigateDataForUrl(url, nodeKey);
            }
            const adapter = window.sidebarStarredAdapterRegistry?.getAdapter();
            if (!adapter?.navigateToConversation(url)) {
                location.href = url;
            }
            this.opts.onAfterNavigate();
        } else {
            if (needsScroll && window.timelineManager) {
                await window.timelineManager.setNavigateDataForUrl(url, nodeKey);
            }
            window.open(url, '_blank');
        }
    }

    _findMarker(tm, nodeKey) {
        if (nodeKey == null) return null;
        if (tm.adapter?.findMarkerByStoredIndex) {
            return tm.adapter.findMarkerByStoredIndex(nodeKey, tm.markers, tm.markerMap);
        }
        if (tm.adapter?.generateTurnIdFromIndex) {
            const m = tm.markerMap?.get(tm.adapter.generateTurnIdFromIndex(nodeKey));
            if (m) return m;
        }
        if (typeof nodeKey === 'number' && nodeKey >= 0 && nodeKey < tm.markers.length) {
            return tm.markers[nodeKey];
        }
        return null;
    }

    _isSameSite(url) {
        try {
            const u = new URL(url);
            if (u.hostname === location.hostname) return true;
            const main = h => h.split('.').slice(-2).join('.');
            return main(u.hostname) === main(location.hostname);
        } catch { return false; }
    }

    _isCurrentPage(item) {
        if (!item.urlWithoutProtocol) return false;
        const current = location.href.replace(/^https?:\/\//, '');
        return current === item.urlWithoutProtocol;
    }

    // ==================== [新功能] 2024-xx 多选功能 ====================

    /**
     * 切换多选模式
     * @param {boolean} [enable] - 指定开启或关闭，不指定则切换
     */
    _toggleMultiSelectMode(enable) {
        const shouldEnable = enable !== undefined ? enable : !this._isMultiSelectMode;

        this._isMultiSelectMode = shouldEnable;

        if (!shouldEnable) {
            // 退出多选模式，清除所有选中项
            this._selectedItems.clear();
        }

        // 更新工具栏状态
        this._updateBatchToolbarState();

        // 更新列表中所有复选框的显示状态
        const list = this.opts.getListContainer();
        if (list) {
            list.querySelectorAll('.timeline-starred-item').forEach(el => {
                el.classList.toggle('multi-select-mode', shouldEnable);
            });
        }

        console.log(`[StarredTreeRenderer] 多选模式: ${shouldEnable ? '开启' : '关闭'}, 已选 ${this._selectedItems.size} 项`);
    }

    /**
     * 更新批量操作工具栏状态
     */
    _updateBatchToolbarState() {
        if (!this._batchToolbar) return;

        const toolbar = this._batchToolbar;
        const batchActions = this._batchActions;

        // 切换工具栏按钮的显示
        const multiSelectBtn = toolbar.querySelector('.ait-batch-toolbar-btn');
        if (multiSelectBtn) {
            multiSelectBtn.style.display = this._isMultiSelectMode ? 'none' : 'flex';
        }

        // 显示/隐藏批量操作区域
        if (batchActions) {
            batchActions.style.display = this._isMultiSelectMode ? 'flex' : 'none';
        }

        // 更新已选数量
        this._updateSelectedCount();
    }

    /**
     * 更新已选数量显示
     */
    _updateSelectedCount() {
        if (!this._selectedCountEl) return;

        const count = this._selectedItems.size;
        const msg = chrome.i18n.getMessage('selectedCount') || '已选 $count 项';
        this._selectedCountEl.textContent = msg.replace('$count', count);
    }

    /**
     * 全选所有收藏项
     */
    _selectAllItems() {
        const list = this.opts.getListContainer();
        if (!list) return;

        list.querySelectorAll('.timeline-starred-item').forEach(el => {
            const turnId = el.dataset.turnId;
            if (turnId) {
                this._selectedItems.add(turnId);
                el.classList.add('selected');
                const checkbox = el.querySelector('.ait-multi-select-checkbox');
                if (checkbox) checkbox.checked = true;
            }
        });

        this._updateSelectedCount();
    }

    /**
     * 取消全选
     */
    _deselectAllItems() {
        this._selectedItems.clear();

        const list = this.opts.getListContainer();
        if (list) {
            list.querySelectorAll('.timeline-starred-item').forEach(el => {
                el.classList.remove('selected');
                const checkbox = el.querySelector('.ait-multi-select-checkbox');
                if (checkbox) checkbox.checked = false;
            });
        }

        this._updateSelectedCount();
    }

    /**
     * 切换单个收藏项的选中状态
     * @param {string} turnId - 收藏项 ID
     */
    _toggleItemSelection(turnId) {
        if (this._selectedItems.has(turnId)) {
            this._selectedItems.delete(turnId);
        } else {
            this._selectedItems.add(turnId);
        }

        // 更新列表项的样式
        const list = this.opts.getListContainer();
        if (list) {
            const itemEl = list.querySelector(`.timeline-starred-item[data-turn-id="${turnId}"]`);
            if (itemEl) {
                itemEl.classList.toggle('selected', this._selectedItems.has(turnId));
                const checkbox = itemEl.querySelector('.ait-multi-select-checkbox');
                if (checkbox) checkbox.checked = this._selectedItems.has(turnId);
            }
        }

        this._updateSelectedCount();
    }

    /**
     * 处理批量移动选中项
     * 
     * 【用户交互流程】
     * 1. 用户点击"移动选中项"按钮
     * 2. 显示文件夹选择菜单
     * 3. 用户选择目标文件夹
     * 4. 执行批量移动操作
     * 5. 显示结果提示
     */
    async _handleBatchMove() {
        const selectedTurnIds = Array.from(this._selectedItems);

        if (selectedTurnIds.length === 0) {
            this._toast('warning', 'noItemSelected', '请先选择要移动的收藏项');
            return;
        }

        // 获取所有文件夹用于显示选择菜单
        const folders = await this.folderManager.getFolders();

        // 构建文件夹选择菜单项
        const items = [
            {
                label: chrome.i18n.getMessage('defaultFolder') || '未分类',
                icon: '📁',
                onClick: () => this._executeBatchMove(selectedTurnIds, null)
            }
        ];

        // 添加子文件夹选项
        for (const folder of folders) {
            items.push({
                label: folder.name,
                icon: folder.icon || '📂',
                onClick: () => this._executeBatchMove(selectedTurnIds, folder.id)
            });
        }

        // 添加取消选项
        items.push({ type: 'divider' });
        items.push({
            label: chrome.i18n.getMessage('cancel') || '取消',
            onClick: () => { }
        });

        // 显示文件夹选择菜单
        const toolbar = this._batchToolbar;
        if (toolbar) {
            window.globalDropdownManager.show({
                trigger: toolbar.querySelector('.ait-batch-action-btn.primary'),
                items: items,
                position: 'top',
                width: 180
            });
        }
    }

    /**
     * 执行批量移动操作
     * @param {string[]} turnIds - 要移动的收藏项 ID 数组
     * @param {string|null} targetFolderId - 目标文件夹 ID（null = 未分类）
     */
    async _executeBatchMove(turnIds, targetFolderId) {
        if (turnIds.length === 0) return;

        try {
            // 调用 folderManager 的批量移动方法
            const result = await this.folderManager.moveStarredItemsToFolder(turnIds, targetFolderId);

            // 显示结果提示
            if (result.success > 0) {
                const folderName = targetFolderId === null
                    ? (chrome.i18n.getMessage('defaultFolder') || '未分类')
                    : this._getFolderNameById(targetFolderId);

                // [新功能] 2024-xx 多选移动：使用国际化消息，替换占位符
                const msgTemplate = chrome.i18n.getMessage('batchMoveSuccess') || '已移动 $count 项到目标文件夹';
                const message = msgTemplate.replace('$count', result.success) + `「${folderName}」`;
                this._toast('success', '', message);
            }

            if (result.failed > 0) {
                console.error(`[StarredTreeRenderer] 批量移动失败 ${result.failed} 项:`, result.errors);
                // [新功能] 2024-xx 多选移动：使用国际化消息，替换占位符
                const msgTemplate = chrome.i18n.getMessage('batchMovePartial') || '部分移动失败（$count 项）';
                const message = msgTemplate.replace('$count', result.failed);
                this._toast('warning', '', message);
            }

            // 退出多选模式并刷新
            this._toggleMultiSelectMode(false);
            await this.opts.onAfterAction();

        } catch (error) {
            console.error('[StarredTreeRenderer] 批量移动失败:', error);
            this._toast('error', 'batchMoveFailed', '批量移动失败');
        }
    }

    /**
     * 根据文件夹 ID 获取文件夹名称
     * @param {string} folderId - 文件夹 ID
     * @returns {string}
     */
    _getFolderNameById(folderId) {
        // 从已缓存的文件夹数据中查找
        for (const [id, data] of this._folderDataMap) {
            if (id === folderId) {
                return data.folder.name;
            }
        }
        return folderId;
    }

    // ==================== 生命周期 ====================

    destroy() {
        window.removeEventListener('url:change', this._urlChangeHandler);
        this._unbindContainerDelegation();
        this._delegateContainer = null;
        this._folderDataMap.clear();
        this._itemDataMap.clear();
        // [新功能] 2024-xx 多选功能：清理多选状态
        this._selectedItems.clear();
        this._isMultiSelectMode = false;
    }

    // ==================== URL 变化 → active 状态 ====================

    _refreshActiveState() {
        const list = this.opts.getListContainer();
        if (!list) return;
        list.querySelectorAll('.timeline-starred-item').forEach(el => {
            const turnId = el.dataset.turnId;
            if (!turnId) return;
            const urlPart = turnId.substring(0, turnId.lastIndexOf(':'));
            const current = location.href.replace(/^https?:\/\//, '');
            el.classList.toggle('active', current === urlPart);
        });
    }

    // ==================== 工具 ====================

    _countAllItems(folder) {
        let count = folder.items.length;
        if (folder.children) {
            for (const child of folder.children) count += this._countAllItems(child);
        }
        return count;
    }

    _matchesSearch(item, query) {
        if (!query) return true;
        return item.theme && item.theme.toLowerCase().includes(query);
    }

    _escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    // ==================== 外部拖入处理 ====================

    async _handleExternalDrop(url, plainText, html, folderEl, dropOpts) {
        try {
            const folderId = folderEl.dataset.folderId;
            const actualFolderId = folderId === '__default__' ? null : folderId;
            const refTurnId = dropOpts?.refTurnId || null;
            const refPosition = dropOpts?.position || null;

            const urlWithoutProtocol = url.replace(/^https?:\/\//, '');
            const key = `chatTimelineStar:${urlWithoutProtocol}:-1`;
            const turnId = `${urlWithoutProtocol}:-1`;

            const existing = await StarStorageManager.findByKey(key);
            if (existing) {
                if (refTurnId) {
                    await this.folderManager.reorderStarredInFolder(turnId, actualFolderId, refTurnId, refPosition);
                } else if ((existing.folderId || null) !== actualFolderId) {
                    await StarStorageManager.update(key, { folderId: actualFolderId });
                } else {
                    return;
                }
                this._toastAtFolder(folderEl, 'dragMoveSuccess', 'Moved');
                await this.opts.onAfterAction();
                return;
            }

            let title = '';
            if (plainText && plainText !== url && !/^https?:\/\//.test(plainText)) {
                title = plainText.substring(0, 100);
            }
            if (!title && html) {
                const tmp = document.createElement('div');
                tmp.innerHTML = html;
                title = tmp.textContent?.trim()?.substring(0, 100) || '';
                if (/^https?:\/\//.test(title)) title = '';
            }
            if (!title) {
                title = decodeURIComponent(urlWithoutProtocol.split('/').pop() || 'Conversation');
            }

            await StarStorageManager.add({
                key, url, urlWithoutProtocol,
                index: -1,
                question: title,
                timestamp: Date.now(),
                folderId: actualFolderId
            });

            if (refTurnId) {
                await this.folderManager.reorderStarredInFolder(turnId, actualFolderId, refTurnId, refPosition);
            }

            this._toastAtFolder(folderEl, 'nativeMenuStarSuccess', 'Starred');
            await this.opts.onAfterAction();
        } catch (err) {
            console.error('[StarredTreeRenderer] External drop failed:', err);
        }
    }

    // ==================== 拖拽辅助 ====================

    _setDropIndicator(folderEl, position) {
        if (this._currentDropTarget === folderEl && this._dropPosition === position) return;
        this._clearDropIndicator();
        this._currentDropTarget = folderEl;
        this._dropPosition = position;
        if (position === 'inside') {
            folderEl.classList.add('ait-drag-over');
        } else if (position === 'before') {
            folderEl.classList.add('ait-drop-before');
        } else if (position === 'after') {
            folderEl.classList.add('ait-drop-after');
        }
    }

    _clearDropIndicator() {
        if (this._currentDropTarget) {
            this._currentDropTarget.classList.remove('ait-drag-over', 'ait-drop-before', 'ait-drop-after');
            this._currentDropTarget = null;
            this._dropPosition = null;
        }
    }

    _cleanupDrag() {
        if (this._dragState?.element) {
            this._dragState.element.classList.remove('ait-dragging');
        }
        this._dragState = null;
        this._clearDropIndicator();
    }

    // ==================== 收藏项位置指示 ====================

    _setItemDropIndicator(itemEl, position) {
        if (this._currentDropItemTarget === itemEl && this._dropItemPosition === position) return;
        this._clearItemDropIndicator();
        this._currentDropItemTarget = itemEl;
        this._dropItemPosition = position;
        itemEl.classList.add(position === 'before' ? 'ait-item-drop-before' : 'ait-item-drop-after');
    }

    _clearItemDropIndicator() {
        if (this._currentDropItemTarget) {
            this._currentDropItemTarget.classList.remove('ait-item-drop-before', 'ait-item-drop-after');
            this._currentDropItemTarget = null;
            this._dropItemPosition = null;
        }
    }

    /**
     * [可能移除] 拖拽自动置顶推断
     *
     * 直接使用参考项（用户拖放目标附近的收藏项）的 pinned 状态：
     *   - 参考项是置顶的 → 返回 true（落在置顶区域）
     *   - 参考项是非置顶的 → 返回 false（落在非置顶区域）
     *
     * 在置顶/非置顶边界处，_detectDropTarget 根据鼠标与元素中点的距离
     * 决定 before/after，从而天然地将边界决定权交给用户的鼠标位置。
     *
     * @param {HTMLElement} refItemEl - 落点参考收藏项元素
     * @returns {boolean}
     */
    _inferPinFromDrop(refItemEl) {
        const refData = this._itemDataMap.get(refItemEl.dataset.turnId);
        return !!refData?.pinned;
    }

    /**
     * 拖拽悬停检测：优先检测收藏项精确位置，其次文件夹整体
     * @returns {{ type: 'item', itemEl, folderEl, turnId, folderId, position } | { type: 'folder', folderEl, folderId } | null}
     */
    _detectDropTarget(clientX, clientY, sourceTurnId) {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el) return null;

        const itemEl = el.closest('.timeline-starred-item');
        if (itemEl && itemEl.dataset.turnId !== sourceTurnId) {
            const folderEl = itemEl.closest('.ait-folder-item');
            if (folderEl) {
                const rect = itemEl.getBoundingClientRect();
                const pos = clientY < (rect.top + rect.height / 2) ? 'before' : 'after';
                return {
                    type: 'item', itemEl, folderEl,
                    turnId: itemEl.dataset.turnId,
                    folderId: folderEl.dataset.folderId,
                    position: pos
                };
            }
        }

        const folderEl = el.closest('.ait-folder-item');
        if (folderEl) {
            return { type: 'folder', folderEl, folderId: folderEl.dataset.folderId };
        }
        return null;
    }
}
