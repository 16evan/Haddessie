// ==UserScript==
// @name         Haddes&16evan的快速回复beta
// @namespace    https://chat.mufy.ai
// @version      1.2
// @description  搜索历史聊天记录关键词
// @author       Haddes/16evan
// @match        https://chat.mufy.ai/chat*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- 核心配置与默认数据 ---
    const CONFIG = {
        key_data: 'neo_panel_data_v5_2', // 更新key以防旧数据冲突
        key_theme: 'neo_panel_theme_v5_2',
        default_theme: 'bw',
        default_data: [
          { id: 1700000000001, title: '生成用户资料卡', author: 'System', content: '$生成用户资料卡', group: '功能向', pinned: false, date: 1700000000001 },
          { id: 1700000000002, title: '生成极繁环境', author: 'System', content: '$生成极繁主义环境描写，侧重光影与氛围', group: '剧情向', pinned: false, date: 1700000000002 },
          { id: 1700000000003, title: '生成今日运势', author: 'System', content: '$生成今日运势组件，包含宜忌与签文', group: '功能向', pinned: false, date: 1700000000003 },
          { id: 1700000000004, title: '生成悬浮时钟', author: 'System', content: '$生成极简主义悬浮时钟', group: '功能向', pinned: false, date: 1700000000004 }
        ]
    };

    // --- 主题配置 ---
    const THEMES = {
        'bw': { name: '极简黑白', bg: '#ffffff', text: '#222222', accent: '#000000', border: '#e5e5e5', surface: '#f9f9f9', input: '#ffffff', icon: '#333' },
        'modern': { name: '现代黑蓝', bg: '#1a1a1a', text: '#e0e0e0', accent: '#3a86ff', border: '#333333', surface: '#252525', input: '#121212', icon: '#3a86ff' },
        'pink': { name: '低饱和灰粉', bg: '#fdfcfc', text: '#5c5c5c', accent: '#dbaeb8', border: '#efe6e8', surface: '#fff5f7', input: '#ffffff', icon: '#dbaeb8' },
        'mint': { name: '薄荷巧克力', bg: '#2b2220', text: '#e0e0e0', accent: '#70c1b3', border: '#423632', surface: '#362b28', input: '#1f1917', icon: '#70c1b3' }
    };

    // --- 状态管理 ---
    let state = {
        data: GM_getValue(CONFIG.key_data, CONFIG.default_data),
        theme: GM_getValue(CONFIG.key_theme, CONFIG.default_theme),
        isExpanded: false,
        activeGroups: {},
        searchTerm: ''
    };

    // --- 安全 DOM 注入 ---
    const style = document.createElement('style');
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.id = 'neo-root-v5-refined';
    document.body.appendChild(container);

    // --- 核心逻辑类 ---
    class TextProcessor {
        constructor() {
          this._inputSelectors = [
          '#mufy_chat_input_box textarea',
          '#mufy_chat_input_box input',
          '#mufy_chat_input_container textarea',
          'textarea[placeholder*="输入"]',
          'textarea',
          'input[type="text"]'
          ];
        }
        findInputField() {
          const contexts = [document];
          try { if (window.frameElement) contexts.push(window.parent.document); } catch(e){}

          for (const doc of contexts) {
          if (!doc) continue;
          for (const selector of this._inputSelectors) {
          const el = doc.querySelector(selector);
          if (el && !el.disabled && !el.readOnly) return el;
          }
          }
          return null;
        }

        writeToInput(content) {
          const inputElement = this.findInputField();
          if (!inputElement) {
          if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(content).then(() => {
          alert('未找到输入框，内容已复制到剪贴板。');
          }).catch(() => alert('无法写入输入框且复制失败。'));
          } else {
          alert('未找到输入框。');
          }
          return;
          }
          this._injectAndTrigger(inputElement, content);
        }

        _injectAndTrigger(element, text) {
          try {
          element.focus();
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          const oldVal = element.value;
          const start = element.selectionStart || oldVal.length;
          const end = element.selectionEnd || oldVal.length;

          const newVal = oldVal.substring(0, start) + text + oldVal.substring(end);

          if (nativeSetter) {
          nativeSetter.call(element, newVal);
          } else {
          element.value = newVal;
          }

          const newPos = start + text.length;
          if (element.setSelectionRange) element.setSelectionRange(newPos, newPos);

          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (e) {
          try {
          element.value += text;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          } catch(err) {}
          }
        }
    }
    const processor = new TextProcessor();

    // --- UI 渲染引擎 ---
    function renderStyles() {
        const t = THEMES[state.theme];
        style.textContent = `
          #neo-root-v5-refined {
          --bg: ${t.bg};
          --text: ${t.text};
          --accent: ${t.accent};
          --border: ${t.border};
          --surface: ${t.surface};
          --input: ${t.input};
          --icon: ${t.icon};
          --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          position: fixed;
          top: 50%; right: 10px; /* 垂直居中，靠右 */
          transform: translateY(-50%);
          z-index: 2147483647;
          font-family: var(--font);
          display: flex; flex-direction: row-reverse; /* 面板在左，工具栏在右 */
          align-items: center; /* 垂直居中对齐 */
          gap: 12px;
          pointer-events: none;
          line-height: 1.4;
          }
          #neo-root-v5-refined * { box-sizing: border-box; }

          /* Toolbar (Vertical) */
          .neo-toolbar {
          display: flex; flex-direction: column; gap: 8px;
          pointer-events: auto;
          background: var(--bg); padding: 8px; border-radius: 20px;
          border: 1px solid var(--border);
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          backdrop-filter: blur(10px);
          opacity: 0.3; /* 默认半透明 */
          transition: opacity 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          }
          .neo-toolbar:hover, .neo-toolbar.active { opacity: 1; /* 悬停或激活时实色 */ }

          .neo-btn {
          background: var(--surface); color: var(--text);
          border: 1px solid var(--border);
          border-radius: 50%; cursor: pointer;
          font-size: 14px; height: 36px; width: 36px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
          user-select: none;
          font-weight: bold;
          }
          .neo-btn:hover { border-color: var(--accent); color: var(--accent); transform: scale(1.1); }
          .neo-btn:active { transform: scale(0.95); }

          /* Panel */
          .neo-panel {
          width: 300px; height: 450px;
          background: var(--bg); border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.15);
          display: flex; flex-direction: column;
          pointer-events: auto; overflow: hidden;
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s;
          opacity: 1;
          transform: translateX(0);
          }
          .neo-panel.hidden {
          transform: translateX(20px);
          opacity: 0; pointer-events: none;
          position: absolute; /* 隐藏时不占位 */
          }

          /* Header */
          .neo-header {
          padding: 10px; border-bottom: 1px solid var(--border);
          display: flex; gap: 8px; align-items: center;
          background: var(--surface);
          position: relative;
          }
          .neo-search {
          flex: 1; background: var(--input); border: 1px solid var(--border);
          color: var(--text); font-size: 13px; padding: 6px 8px; border-radius: 6px;
          outline: none; transition: border-color 0.2s;
          }
          .neo-search:focus { border-color: var(--accent); }

          /* Theme Palette */
          .neo-palette {
          position: absolute; top: 42px; left: 10px;
          background: var(--bg); border: 1px solid var(--border);
          border-radius: 8px; padding: 8px;
          display: flex; gap: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          z-index: 20; opacity: 0; pointer-events: none;
          transform: translateY(-5px);
          transition: all 0.2s;
          }
          .neo-palette.visible { opacity: 1; pointer-events: auto; transform: translateY(0); }
          .neo-color-swatch {
          width: 20px; height: 20px; border-radius: 50%; cursor: pointer;
          border: 1px solid var(--border);
          }
          .neo-color-swatch:hover { transform: scale(1.2); }

          /* List */
          .neo-list { flex: 1; overflow-y: auto; padding: 0; }
          .neo-list::-webkit-scrollbar { width: 4px; }
          .neo-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

          /* Group */
          .neo-group-header {
          padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--text);
          background: var(--surface); cursor: pointer; border-bottom: 1px solid var(--border);
          display: flex; justify-content: space-between; align-items: center;
          user-select: none; opacity: 0.9; transition: opacity 0.2s;
          }
          .neo-group-header:hover { opacity: 1; background: var(--border); }
          .neo-group-content { display: none; }
          .neo-group-content.active { display: block; }

          /* Items */
          .neo-item {
          padding: 10px 12px; border-bottom: 1px solid var(--border);
          background: var(--bg); transition: background 0.1s;
          position: relative;
          }
          .neo-item:hover { background: var(--surface); }
          .neo-item-main { cursor: pointer; }
          .neo-item-title { font-size: 13px; font-weight: 500; color: var(--text); margin-bottom: 4px; display: flex; align-items: center; gap: 4px; }
          .neo-item-meta { font-size: 10px; color: #999; display: flex; gap: 6px; align-items: center; }

          /* Actions */
          .neo-item-actions {
          position: absolute; top: 10px; right: 10px;
          display: none; gap: 6px;
          }
          .neo-item:hover .neo-item-actions { display: flex; }
          .neo-action-btn {
          font-size: 11px; padding: 2px 6px; border: 1px solid var(--border);
          border-radius: 4px; background: var(--bg); cursor: pointer;
          color: var(--text); display: flex; align-items: center; justify-content: center;
          }
          .neo-action-btn:hover { color: var(--accent); border-color: var(--accent); background: var(--surface); }

          /* Footer */
          .neo-footer {
          padding: 8px 12px; border-top: 1px solid var(--border);
          background: var(--surface); display: flex; justify-content: space-between; align-items: center;
          }

          /* Modal */
          .neo-modal {
          position: absolute; inset: 0; background: rgba(0,0,0,0.4);
          display: flex; align-items: center; justify-content: center;
          z-index: 30; padding: 20px; backdrop-filter: blur(2px);
          }
          .neo-modal-content {
          background: var(--bg); padding: 16px; border-radius: 8px;
          width: 100%; box-shadow: 0 15px 40px rgba(0,0,0,0.2);
          border: 1px solid var(--border); animation: neo-pop 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          }
          @keyframes neo-pop { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }

          .neo-form-group { margin-bottom: 10px; }
          .neo-label { display: block; font-size: 11px; color: var(--text); margin-bottom: 4px; opacity: 0.7; }
          .neo-input, .neo-textarea {
          width: 100%; background: var(--input); border: 1px solid var(--border);
          color: var(--text); font-size: 12px; padding: 6px; border-radius: 4px;
          outline: none; transition: border-color 0.2s;
          }
          .neo-textarea { height: 80px; resize: none; font-family: monospace; }
          .neo-input:focus, .neo-textarea:focus { border-color: var(--accent); }
          .neo-modal-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
          .neo-badge {
          font-size: 9px; padding: 2px 5px; border-radius: 3px;
          background: var(--border); color: var(--text); opacity: 0.8;
          }
          .pinned-star { color: #f5a623; font-size: 12px; }
        `;
    }

    // --- 逻辑处理 ---
    function saveData() {
        GM_setValue(CONFIG.key_data, state.data);
        // 不再全量 render，而是定向更新
        // 为了简单起见，这里仍然调用 render，但 render 会处理 DOM 差异（或重新生成）
        // 鉴于这是一个小面板，全量重绘性能损耗可忽略，但为了搜索体验，我们只在非搜索输入时重绘列表
        renderList();
    }

    function togglePin(id) {
        const idx = state.data.findIndex(i => i.id === id);
        if (idx > -1) {
          state.data[idx].pinned = !state.data[idx].pinned;
          saveData();
        }
    }

    function deleteItem(id) {
        if (confirm('确定删除此指令？')) {
          state.data = state.data.filter(i => i.id !== id);
          saveData();
        }
    }

    function setTheme(key) {
        state.theme = key;
        GM_setValue(CONFIG.key_theme, state.theme);
        renderStyles();
        // 重新渲染头部图标颜色等
        const themeBtn = document.getElementById('neo-theme-btn');
        if(themeBtn) themeBtn.style.color = THEMES[key].icon;
    }

    function openEditModal(item = null) {
        const isNew = !item;
        const modalHtml = `
          <div class="neo-form-group">
          <label class="neo-label">标题</label>
          <input class="neo-input" id="neo-edit-title" value="${item ? item.title.replace(/"/g, '&quot;') : ''}" placeholder="指令名称">
          </div>
          <div class="neo-form-group">
          <label class="neo-label">分组</label>
          <input class="neo-input" id="neo-edit-group" value="${item ? item.group.replace(/"/g, '&quot;') : '剧情向'}" placeholder="例如: 功能向">
          </div>
          <div class="neo-form-group">
          <label class="neo-label">作者</label>
          <input class="neo-input" id="neo-edit-author" value="${item ? item.author.replace(/"/g, '&quot;') : 'Director'}" placeholder="署名">
          </div>
          <div class="neo-form-group">
          <label class="neo-label">指令内容</label>
          <textarea class="neo-textarea" id="neo-edit-content" placeholder="$指令...">${item ? item.content : ''}</textarea>
          </div>
          <div class="neo-modal-btns">
          <button class="neo-btn" style="width:auto;padding:0 12px;border-radius:6px;" id="neo-cancel-btn">取消</button>
          <button class="neo-btn" style="width:auto;padding:0 12px;border-radius:6px;border-color:var(--accent);color:var(--accent);font-weight:600" id="neo-save-btn">保存</button>
          </div>
        `;

        const modal = document.createElement('div');
        modal.className = 'neo-modal';
        modal.innerHTML = `<div class="neo-modal-content">${modalHtml}</div>`;
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };

        container.querySelector('.neo-panel').appendChild(modal);
        setTimeout(() => modal.querySelector('#neo-edit-title').focus(), 50);

        modal.querySelector('#neo-cancel-btn').onclick = () => modal.remove();
        modal.querySelector('#neo-save-btn').onclick = () => {
          const title = modal.querySelector('#neo-edit-title').value.trim();
          if (!title) return alert('标题不能为空');

          const newItem = {
          id: item ? item.id : Date.now(),
          title: title,
          group: modal.querySelector('#neo-edit-group').value.trim() || '默认',
          author: modal.querySelector('#neo-edit-author').value.trim() || 'System',
          content: modal.querySelector('#neo-edit-content').value,
          pinned: item ? item.pinned : false,
          date: item ? item.date : Date.now()
          };

          if (isNew) {
          state.data.push(newItem);
          } else {
          const idx = state.data.findIndex(i => i.id === item.id);
          if (idx > -1) state.data[idx] = newItem;
          }
          saveData();
          modal.remove();
        };
    }

    function handleImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = e => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => {
          try {
          const json = JSON.parse(ev.target.result);
          if (Array.isArray(json)) {
          const existIds = new Set(state.data.map(i => i.id));
          let count = 0;
          json.forEach(item => {
          if (item.title && item.content) {
          if (!item.id || existIds.has(item.id)) item.id = Date.now() + Math.random();
          state.data.push(item);
          count++;
          }
          });
          saveData();
          alert(`成功导入 ${count} 条指令`);
          }
          } catch(e) { alert('文件格式错误'); }
          };
          reader.readAsText(file);
        };
        input.click();
    }

    function handleExport() {
        const text = JSON.stringify(state.data, null, 2);
        const blob = new Blob([text], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `neo_commands_backup.json`;
        a.click();
    }

    // --- 独立渲染函数：仅更新列表 ---
    function renderList() {
        const list = container.querySelector('.neo-list');
        if (!list) return;
        list.innerHTML = '';

        const term = state.searchTerm.toLowerCase().trim();
        let displayData = state.data.filter(item => {
          if (!term) return true;
          return (item.title || '').toLowerCase().includes(term) ||
          (item.author || '').toLowerCase().includes(term) ||
          (item.content || '').toLowerCase().includes(term);
        }).sort((a, b) => a.date - b.date);

        const groups = { '⭐ 收藏置顶': [] };
        const otherGroups = {};

        displayData.forEach(item => {
          if (item.pinned) {
          groups['⭐ 收藏置顶'].push(item);
          } else {
          const g = item.group || '默认';
          if (!otherGroups[g]) otherGroups[g] = [];
          otherGroups[g].push(item);
          }
        });

        Object.assign(groups, otherGroups);

        Object.keys(groups).forEach(gName => {
          const items = groups[gName];
          if (items.length === 0) return;

          const gHeader = document.createElement('div');
          gHeader.className = 'neo-group-header';
          gHeader.innerHTML = `<span>${gName}</span> <span>${items.length}</span>`;

          let isOpen = !!state.searchTerm || (gName === '⭐ 收藏置顶') || !!state.activeGroups[gName];
          const gContent = document.createElement('div');
          gContent.className = `neo-group-content ${isOpen ? 'active' : ''}`;

          gHeader.onclick = () => {
          state.activeGroups[gName] = !state.activeGroups[gName];
          gContent.classList.toggle('active');
          };

          items.forEach(item => {
          const el = document.createElement('div');
          el.className = 'neo-item';
          el.innerHTML = `
          <div class="neo-item-main">
          <div class="neo-item-title">${item.pinned ? '<span class="pinned-star">★</span>' : ''}${item.title}</div>
          <div class="neo-item-meta"><span class="neo-badge">${item.author}</span></div>
          </div>
          <div class="neo-item-actions">
          <div class="neo-action-btn edit-btn" title="编辑">✎</div>
          <div class="neo-action-btn pin-btn" title="${item.pinned?'取消收藏':'收藏'}">${item.pinned?'✕':'★'}</div>
          <div class="neo-action-btn del-btn" title="删除">🗑</div>
          </div>
          `;
          el.querySelector('.neo-item-main').onclick = () => processor.writeToInput(item.content);
          el.querySelector('.edit-btn').onclick = (e) => { e.stopPropagation(); openEditModal(item); };
          el.querySelector('.pin-btn').onclick = (e) => { e.stopPropagation(); togglePin(item.id); };
          el.querySelector('.del-btn').onclick = (e) => { e.stopPropagation(); deleteItem(item.id); };
          gContent.appendChild(el);
          });
          list.appendChild(gHeader);
          list.appendChild(gContent);
        });
    }

    // --- 主结构渲染 ---
    function render() {
        container.innerHTML = '';
        renderStyles();

        // 1. Panel (Left side of container due to flex-direction: row-reverse)
        const panel = document.createElement('div');
        panel.className = `neo-panel ${state.isExpanded ? '' : 'hidden'}`;

        // Header
        const header = document.createElement('div');
        header.className = 'neo-header';

        // Palette
        const palette = document.createElement('div');
        palette.className = 'neo-palette';
        Object.keys(THEMES).forEach(k => {
          const swatch = document.createElement('div');
          swatch.className = 'neo-color-swatch';
          swatch.style.backgroundColor = THEMES[k].accent;
          swatch.title = THEMES[k].name;
          swatch.onclick = () => { setTheme(k); palette.classList.remove('visible'); };
          palette.appendChild(swatch);
        });

        header.innerHTML = `
          <div class="neo-btn" style="width:28px;height:28px;border-radius:6px;background:transparent;border:none;" id="neo-theme-btn" title="配色主题">🎨</div>
          <input class="neo-search" placeholder="搜索 (指令/作者)..." value="${state.searchTerm}">
          <div class="neo-btn" style="width:28px;height:28px;border-radius:6px;" id="neo-add-btn" title="新建指令">+</div>
        `;
        header.appendChild(palette);

        // Theme button interaction
        const themeBtn = header.querySelector('#neo-theme-btn');
        themeBtn.style.color = THEMES[state.theme].icon;
        themeBtn.onclick = (e) => { e.stopPropagation(); palette.classList.toggle('visible'); };
        document.addEventListener('click', (e) => { if(!header.contains(e.target)) palette.classList.remove('visible'); });

        // Search Input with Debounce (防抖核心逻辑)
        const searchInput = header.querySelector('.neo-search');
        searchInput.oninput = (e) => {
          state.searchTerm = e.target.value;
          if (window._neoSearchTimer) clearTimeout(window._neoSearchTimer);
          window._neoSearchTimer = setTimeout(() => {
          // 仅重绘列表，不触碰输入框焦点
          renderList();
          }, 400); // 400ms 延迟
        };

        header.querySelector('#neo-add-btn').onclick = () => openEditModal();
        panel.appendChild(header);

        // List Container
        const list = document.createElement('div');
        list.className = 'neo-list';
        panel.appendChild(list);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'neo-footer';
        footer.innerHTML = `
          <div style="display:flex;gap:6px;">
          <div class="neo-btn" style="width:24px;height:24px;border-radius:4px;font-size:12px;" id="neo-imp-btn" title="导入">📥</div>
          <div class="neo-btn" style="width:24px;height:24px;border-radius:4px;font-size:12px;" id="neo-exp-btn" title="导出">📤</div>
          </div>
          <div style="font-size:9px;color:var(--text);opacity:0.4;font-family:monospace;">SECURE V5.2</div>
        `;
        footer.querySelector('#neo-imp-btn').onclick = handleImport;
        footer.querySelector('#neo-exp-btn').onclick = handleExport;
        panel.appendChild(footer);

        // 2. Toolbar (Right side, vertical)
        const toolbar = document.createElement('div');
        toolbar.className = 'neo-toolbar';
        toolbar.innerHTML = `
          <div class="neo-btn" id="neo-toggle-btn" title="面板">☰</div>
          <div class="neo-btn" id="neo-brac" title="括号">（）</div>
          <div class="neo-btn" id="neo-quote" title="引号">“”</div>
        `;

        // 绑定事件
        toolbar.querySelector('#neo-brac').onclick = () => processor.writeToInput('（）');
        toolbar.querySelector('#neo-quote').onclick = () => processor.writeToInput('“”');
        toolbar.querySelector('#neo-toggle-btn').onclick = () => {
          state.isExpanded = !state.isExpanded;
          const p = container.querySelector('.neo-panel');
          const t = container.querySelector('.neo-toolbar');
          if (state.isExpanded) {
          p.classList.remove('hidden');
          t.classList.add('active'); // 展开时工具栏保持实色
          } else {
          p.classList.add('hidden');
          t.classList.remove('active');
          }
        };

        container.appendChild(panel);
        container.appendChild(toolbar);

        // 初次填充列表
        renderList();
    }

    // 启动
    setTimeout(render, 500);

})();
