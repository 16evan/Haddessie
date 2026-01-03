// ==UserScript==
// @name         Haddes&16evan的实时全局美化渲染
// @namespace    https://chat.mufy.ai
// @version      1.2
// @description  实时CSS注入面板，支持一键显隐、实时预览、本地记忆。
// @author       Haddes/16evan
// @match        https://chat.mufy.ai/chat*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- 0. 核心配置与主题库 ---
    const THEMES = {
        'default': { name: 'Noir (黑白灰)', bg: '#1a1a1a', text: '#e0e0e0', accent: '#808080', border: '#404040', hl: '#ffffff', scroll: '#666', inputBg: '#2d2d2d' },
        'dopamine': { name: 'Dopamine (蓝粉)', bg: 'rgba(255, 240, 245, 0.98)', text: '#FF69B4', accent: '#87CEFA', border: '#FFB6C1', hl: '#1E90FF', scroll: '#FFB6C1', inputBg: '#fff0f5' },
        'deepsea': { name: 'Abyss (极简黑蓝)', bg: '#050510', text: '#a0a0ff', accent: '#0000ff', border: '#101030', hl: '#4040ff', scroll: '#1e1e40', inputBg: '#0a0a20' },
        'mintchoco': { name: 'MintChoco (薄荷巧)', bg: '#3b2f2f', text: '#98ff98', accent: '#00ced1', border: '#5c4033', hl: '#e0ffff', scroll: '#556b2f', inputBg: '#2f2525' }
    };

    const DEFAULT_DATA = {
        theme: 'default',
        activeTab: 0,
        tabs: [
          { id: 1, name: 'Main', code: '/* 在此输入CSS或HTML混合代码 */\n' }
        ],
        snapshots: []
    };

    const DB_KEY = 'mio_ro_data_' + window.location.hostname;
    let store = (() => {
        try {
          let s = JSON.parse(localStorage.getItem(DB_KEY)) || DEFAULT_DATA;
          if(!s.snapshots) s.snapshots = [];
          return s;
        } catch (e) { return DEFAULT_DATA; }
    })();

    const save = () => localStorage.setItem(DB_KEY, JSON.stringify(store));

    // --- 栈管理 ---
    const undoStack = [];
    const redoStack = [];
    const MAX_STACK = 50;

    const pushState = (val) => {
        if(undoStack.length > 0 && undoStack[undoStack.length-1] === val) return;
        undoStack.push(val);
        if(undoStack.length > MAX_STACK) undoStack.shift();
        redoStack.length = 0;
    };

    // --- 1. 注入引擎 ---
    let styleTag = document.createElement('style');
    styleTag.id = 'mio-css-engine';

    let htmlContainer = document.createElement('div');
    htmlContainer.id = 'mio-html-layer';
    Object.assign(htmlContainer.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        pointerEvents: 'none', zIndex: '2147483647', overflow: 'hidden'
    });

    const ensureInjection = () => {
        if (!document.head.contains(styleTag)) document.head.appendChild(styleTag);
        if (!document.body.contains(htmlContainer)) document.body.appendChild(htmlContainer);
    };

    const parseAndInject = () => {
        let fullCss = '';
        let fullHtml = '';
        store.tabs.forEach(tab => {
          let raw = tab.code || '';
          const styleRegex = /<style>]*>([\s\S]*?)<\/style>/gi;
          let cssMatch;
          while ((cssMatch = styleRegex.exec(raw)) !== null) {
          fullCss += cssMatch[1] + '\n';
          }
          let htmlPart = raw.replace(styleRegex, '');
          if (!/<style/i.test(raw) && !/<\/?[a-z][\s\S]*>/i.test(raw) && raw.trim().length > 0) {
          fullCss += raw + '\n';
          } else {
          fullHtml += htmlPart;
          }
        });
        styleTag.innerHTML = fullCss;
        htmlContainer.innerHTML = fullHtml;
        ensureInjection();
    };

    // --- 2. UI 构建 ---
    const scrollbarStyle = document.createElement('style');
    document.head.appendChild(scrollbarStyle);

    const updateScrollbarTheme = (t) => {
        scrollbarStyle.innerHTML = `
          #mio-textarea::-webkit-scrollbar { width: 6px; height: 6px; }
          #mio-textarea::-webkit-scrollbar-track { background: transparent; }
          #mio-textarea::-webkit-scrollbar-thumb { background: ${t.scroll}; border-radius: 3px; }
          #mio-textarea::-webkit-scrollbar-thumb:hover { background: ${t.accent}; }
          #mio-panel * { scrollbar-width: thin; scrollbar-color: ${t.scroll} transparent; }
          .mio-tool-btn:hover { color: ${t.hl} !important; text-shadow: 0 0 5px ${t.accent}; }
        `;
    };

    const applyTheme = (themeKey) => {
        const t = THEMES[themeKey] || THEMES['default'];
        const root = document.querySelector(':root');
        if(!root) return;
        panel.style.setProperty('--mio-bg', t.bg);
        panel.style.setProperty('--mio-text', t.text);
        panel.style.setProperty('--mio-accent', t.accent);
        panel.style.setProperty('--mio-border', t.border);
        panel.style.setProperty('--mio-hl', t.hl);
        panel.style.setProperty('--mio-input-bg', t.inputBg || '#333');
        updateScrollbarTheme(t);
    };

    const toggleBtn = document.createElement('div');
    toggleBtn.innerHTML = '✒️';
    Object.assign(toggleBtn.style, {
        position: 'fixed', right: '0', top: '30%', width: '35px', height: '35px',
        background: '#333', color: '#fff', border: '1px solid #555', borderRight: 'none',
        display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer',
        zIndex: '2147483647', borderRadius: '4px 0 0 4px', fontSize: '16px'
    });

    const panel = document.createElement('div');
    panel.id = 'mio-panel';
    Object.assign(panel.style, {
        position: 'fixed', right: '50px', top: '10%', width: '450px', height: '600px',
        background: 'var(--mio-bg)', border: '2px solid var(--mio-border)',
        display: 'none', flexDirection: 'column', zIndex: '2147483647',
        boxShadow: '0 5px 20px rgba(0,0,0,0.5)', borderRadius: '6px',
        fontFamily: 'Consolas, monospace', color: 'var(--mio-text)',
        transition: 'height 0.1s'
    });

    // 顶部工具栏
    const header = document.createElement('div');
    Object.assign(header.style, {
        padding: '5px 8px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--mio-border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'move', userSelect: 'none',
        flexShrink: 0, height: '36px'
    });

    const leftTools = document.createElement('div');
    leftTools.style.display = 'flex';
    leftTools.style.alignItems = 'center';

    const themeSelect = document.createElement('select');
    Object.assign(themeSelect.style, {
        background: 'transparent', color: 'var(--mio-accent)', border: '1px solid var(--mio-border)',
        fontSize: '11px', padding: '2px', outline: 'none', marginRight: '10px'
    });
    Object.keys(THEMES).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k; opt.text = THEMES[k].name; themeSelect.appendChild(opt);
    });
    themeSelect.value = store.theme;
    themeSelect.onchange = (e) => { store.theme = e.target.value; save(); applyTheme(store.theme); };
    leftTools.appendChild(themeSelect);

    const historyBtn = document.createElement('span');
    historyBtn.innerHTML = '🕒';
    historyBtn.title = 'Snapshots (Max 5)';
    Object.assign(historyBtn.style, { cursor:'pointer', fontSize:'14px', marginRight:'10px' });
    historyBtn.onclick = (e) => toggleHistoryMenu(e);
    leftTools.appendChild(historyBtn);
    header.appendChild(leftTools);

    const toolsDiv = document.createElement('div');
    toolsDiv.style.display = 'flex';
    toolsDiv.style.gap = '8px';

    const createToolBtn = (text, action, tip) => {
        const b = document.createElement('span');
        b.innerHTML = text; b.title = tip; b.className = 'mio-tool-btn';
        Object.assign(b.style, { cursor: 'pointer', color: 'var(--mio-accent)', fontSize: '14px', transition: '0.2s' });
        b.onclick = action;
        toolsDiv.appendChild(b);
    };

    // --- 工具栏按钮定义 ---
    createToolBtn('Aa', () => insertText("@import url('');\n"), '插入字体引入');
    createToolBtn('🎨', () => insertText('<style>\n\n</style>'), '插入 <style> 标签');
    createToolBtn('👾', () => insertText('pointer-events: auto;\n'), '插入击穿代码');
    createToolBtn('📱', () => insertText('@media (max-width: 768px) {\n    \n}'), '插入手机适配');
    createToolBtn('🔍', () => toggleFindBar(), '查找/替换');
    createToolBtn('↩️', () => execUndo(), '撤销 (Ctrl+Z)');
    createToolBtn('↪️', () => execRedo(), '重做 (Ctrl+Y)');
    createToolBtn('➕', () => createNewTab(), '新建页面');

    header.appendChild(toolsDiv);

    // 查找替换栏
    const findBar = document.createElement('div');
    Object.assign(findBar.style, {
        display: 'none', padding: '5px', background: 'var(--mio-input-bg)',
        borderBottom: '1px solid var(--mio-border)', fontSize: '12px', alignItems: 'center', gap: '5px'
    });

    const findInput = document.createElement('input');
    findInput.placeholder = 'Find...';
    Object.assign(findInput.style, { width: '80px', background:'transparent', border:'1px solid var(--mio-border)', color:'var(--mio-text)', padding:'2px' });
    // [New Feature] Enter key to find
    findInput.onkeydown = (e) => {
        if(e.key === 'Enter') {
          e.preventDefault();
          doFind(findInput.value);
        }
    };

    const replaceInput = document.createElement('input');
    replaceInput.placeholder = 'Replace...';
    Object.assign(replaceInput.style, { width: '80px', background:'transparent', border:'1px solid var(--mio-border)', color:'var(--mio-text)', padding:'2px' });

    const btnStyle = { cursor:'pointer', padding:'2px 6px', background:'var(--mio-accent)', color:'#000', borderRadius:'2px', border:'none' };

    const findNextBtn = document.createElement('button');
    findNextBtn.innerText = '↓'; Object.assign(findNextBtn.style, btnStyle);
    findNextBtn.onclick = () => doFind(findInput.value);

    const replaceBtn = document.createElement('button');
    replaceBtn.innerText = 'R'; Object.assign(replaceBtn.style, btnStyle);
    replaceBtn.onclick = () => doReplace(findInput.value, replaceInput.value);

    const replaceAllBtn = document.createElement('button');
    replaceAllBtn.innerText = 'All'; Object.assign(replaceAllBtn.style, btnStyle);
    replaceAllBtn.onclick = () => doReplaceAll(findInput.value, replaceInput.value);

    const closeFindBtn = document.createElement('span');
    closeFindBtn.innerText = '×'; closeFindBtn.style.cursor = 'pointer'; closeFindBtn.style.marginLeft = 'auto';
    closeFindBtn.onclick = () => { findBar.style.display = 'none'; textarea.focus(); };

    findBar.appendChild(findInput);
    findBar.appendChild(findNextBtn);
    findBar.appendChild(replaceInput);
    findBar.appendChild(replaceBtn);
    findBar.appendChild(replaceAllBtn);
    findBar.appendChild(closeFindBtn);

    // 标签栏
    const tabBar = document.createElement('div');
    Object.assign(tabBar.style, {
        display: 'flex', overflowX: 'auto', background: 'rgba(0,0,0,0.1)',
        borderBottom: '1px solid var(--mio-border)', flexShrink: 0
    });
    tabBar.style.scrollbarWidth = 'none';

    // 编辑区
    const editorContainer = document.createElement('div');
    Object.assign(editorContainer.style, { flex: '1', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' });

    const textarea = document.createElement('textarea');
    textarea.id = 'mio-textarea';
    Object.assign(textarea.style, {
        width: '100%', height: '100%', border: 'none', resize: 'none',
        background: 'transparent', color: 'var(--mio-text)', padding: '10px',
        fontFamily: 'Consolas, monospace', fontSize: '12px', lineHeight: '1.5',
        outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        overflowY: 'auto', overflowX: 'hidden'
    });

    const errorBar = document.createElement('div');
    Object.assign(errorBar.style, {
        height: 'auto', minHeight:'0px', fontSize: '10px', color: '#ff4444', padding: '0 5px',
        background: 'rgba(255,0,0,0.1)', display: 'none', alignItems: 'center', flexShrink: 0,
        borderTop: '1px solid #ff4444'
    });

    // 底部
    const footer = document.createElement('div');
    Object.assign(footer.style, {
        height: '24px', background: 'rgba(0,0,0,0.3)', borderTop: '1px solid var(--mio-border)',
        display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'move',
        userSelect: 'none', flexShrink: 0, position: 'relative'
    });
    const footerText = document.createElement('span');
    footerText.innerHTML = ':::: CHRONO & ORDER v1.4 ::::'; // 更新版本号
    Object.assign(footerText.style, { fontSize:'9px', color: 'var(--mio-accent)', opacity: 0.7, letterSpacing:'1px' });
    footer.appendChild(footerText);

    const resizer = document.createElement('div');
    Object.assign(resizer.style, {
        width: '15px', height: '100%', position: 'absolute', right: '0', bottom: '0',
        cursor: 'nwse-resize', zIndex: '2'
    });
    resizer.innerHTML = '<span style="position:absolute;bottom:2px;right:2px;color:var(--mio-accent);font-size:10px;">◢</span>';
    footer.appendChild(resizer);


    // --- 逻辑实现 ---

    const execUndo = () => {
        if(undoStack.length === 0) return;
        const current = textarea.value;
        redoStack.push(current);
        const prev = undoStack.pop();
        textarea.value = prev;
        triggerUpdate(false);
    };

    const execRedo = () => {
        if(redoStack.length === 0) return;
        const current = textarea.value;
        undoStack.push(current);
        const next = redoStack.pop();
        textarea.value = next;
        triggerUpdate(false);
    };

    const toggleFindBar = () => {
        findBar.style.display = findBar.style.display === 'none' ? 'flex' : 'none';
        if(findBar.style.display === 'flex') findInput.focus();
    };

    // [New Feature] Enhanced Scrolling Logic
    const scrollToCursor = (pos) => {
        const val = textarea.value;
        const textUpToCursor = val.substring(0, pos);
        const lineCount = textUpToCursor.split('\n').length;
        // 粗略计算：行高约18px (12px * 1.5)，让目标行处于视图中间偏上位置
        const lineHeight = 18;
        const targetScrollTop = (lineCount - 5) * lineHeight;
        textarea.scrollTop = targetScrollTop > 0 ? targetScrollTop : 0;
    };

    const doFind = (str) => {
        if(!str) return;
        const val = textarea.value;
        const start = textarea.selectionEnd;
        const idx = val.indexOf(str, start);
        if(idx !== -1) {
          textarea.selectionStart = idx;
          textarea.selectionEnd = idx + str.length;
          textarea.blur();
          textarea.focus();
          scrollToCursor(idx); // Force scroll
        } else {
          // 循环搜索
          const wrapIdx = val.indexOf(str, 0);
          if(wrapIdx !== -1) {
          textarea.selectionStart = wrapIdx;
          textarea.selectionEnd = wrapIdx + str.length;
          textarea.blur();
          textarea.focus();
          scrollToCursor(wrapIdx); // Force scroll
          } else {
          // alert('Not found: ' + str);
          // 找不到时不弹窗打扰，只闪烁输入框提示
          findInput.style.background = '#552222';
          setTimeout(() => findInput.style.background = 'transparent', 200);
          }
        }
    };

    const doReplace = (findStr, repStr) => {
        if(!findStr) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.substring(start, end);
        if(selected === findStr) {
          insertText(repStr);
          doFind(findStr);
        } else {
          doFind(findStr);
        }
    };

    const doReplaceAll = (findStr, repStr) => {
        if(!findStr) return;
        const val = textarea.value;
        const newVal = val.split(findStr).join(repStr);
        if(val !== newVal) {
          textarea.value = newVal;
          triggerUpdate();
          alert('Replaced all occurrences.');
        }
    };

    const saveSnapshot = () => {
        if(!store.snapshots) store.snapshots = [];
        const snap = {
          time: new Date().toLocaleString(),
          tabs: JSON.parse(JSON.stringify(store.tabs))
        };
        store.snapshots.unshift(snap);
        if(store.snapshots.length > 5) store.snapshots.pop();
        save();
        alert('Snapshot saved!');
    };

    const loadSnapshot = (idx) => {
        if(!confirm('Load this snapshot? Current unsaved work will be overwritten.')) return;
        const snap = store.snapshots[idx];
        if(snap) {
          store.tabs = JSON.parse(JSON.stringify(snap.tabs));
          store.activeTab = 0;
          save();
          renderTabs();
          textarea.value = store.tabs[0].code;
          undoStack.length = 0;
          triggerUpdate(false);
        }
    };

    const toggleHistoryMenu = (e) => {
        const existing = document.getElementById('mio-history-menu');
        if(existing) { existing.remove(); return; }
        const menu = document.createElement('div');
        menu.id = 'mio-history-menu';
        Object.assign(menu.style, {
          position: 'absolute', top: '35px', left: '10px', width: '200px',
          background: 'var(--mio-bg)', border: '1px solid var(--mio-accent)',
          zIndex: '2147483647', boxShadow: '0 5px 15px rgba(0,0,0,0.5)', borderRadius: '4px',
          padding: '5px'
        });
        const saveBtn = document.createElement('div');
        saveBtn.innerText = '[+ Save Current State]';
        Object.assign(saveBtn.style, { cursor:'pointer', color:'var(--mio-hl)', padding:'4px', borderBottom:'1px solid var(--mio-border)', marginBottom:'5px' });
        saveBtn.onclick = () => { saveSnapshot(); menu.remove(); };
        menu.appendChild(saveBtn);
        if(store.snapshots && store.snapshots.length > 0) {
          store.snapshots.forEach((snap, idx) => {
          const item = document.createElement('div');
          item.innerText = `${idx+1}. ${snap.time}`;
          Object.assign(item.style, { cursor:'pointer', color:'var(--mio-text)', padding:'3px', fontSize:'11px' });
          item.onmouseover = () => item.style.color = 'var(--mio-accent)';
          item.onmouseout = () => item.style.color = 'var(--mio-text)';
          item.onclick = () => { loadSnapshot(idx); menu.remove(); };
          menu.appendChild(item);
          });
        } else {
          const empty = document.createElement('div');
          empty.innerText = 'No snapshots.';
          empty.style.color = '#777';
          menu.appendChild(empty);
        }
        panel.appendChild(menu);
        const closeHandler = (ev) => {
          if(!menu.contains(ev.target) && ev.target !== e.target) {
          menu.remove();
          document.removeEventListener('click', closeHandler);
          }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    };

    let draggedTabIdx = null;

    const renderTabs = () => {
        tabBar.innerHTML = '';
        store.tabs.forEach((tab, index) => {
          const t = document.createElement('div');
          const isActive = index === store.activeTab;
          t.draggable = true;
          Object.assign(t.style, {
          padding: '5px 8px', fontSize: '11px', cursor: 'pointer',
          background: isActive ? 'var(--mio-accent)' : 'transparent',
          color: isActive ? '#fff' : 'var(--mio-text)',
          borderRight: '1px solid var(--mio-border)',
          minWidth: '60px', textAlign: 'center', userSelect: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '5px'
          });
          t.ondragstart = (e) => {
          draggedTabIdx = index;
          e.dataTransfer.effectAllowed = 'move';
          t.style.opacity = '0.5';
          };
          t.ondragend = () => {
          t.style.opacity = '1';
          draggedTabIdx = null;
          };
          t.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
          t.ondrop = (e) => {
          e.preventDefault();
          if (draggedTabIdx === null || draggedTabIdx === index) return;
          const movedTab = store.tabs.splice(draggedTabIdx, 1)[0];
          store.tabs.splice(index, 0, movedTab);
          store.tabs.forEach((tb, i) => { if(tb.name === movedTab.name && index === i) store.activeTab = i; });
          save();
          renderTabs();
          };
          const nameSpan = document.createElement('span');
          nameSpan.textContent = tab.name;
          t.appendChild(nameSpan);
          if (store.tabs.length > 1) {
          const delBtn = document.createElement('span');
          delBtn.innerHTML = '✖';
          Object.assign(delBtn.style, {
          color: '#ff4444', fontWeight:'bold', fontSize:'12px', opacity: '0.8',
          padding: '0 2px', borderRadius: '50%'
          });
          delBtn.onclick = (e) => {
          e.stopPropagation();
          if(confirm(`Delete "${tab.name}"?`)) {
          store.tabs.splice(index, 1);
          if (store.activeTab >= store.tabs.length) store.activeTab = store.tabs.length - 1;
          save();
          renderTabs();
          textarea.value = store.tabs[store.activeTab].code;
          triggerUpdate();
          }
          };
          t.appendChild(delBtn);
          }
          t.onclick = () => {
          store.activeTab = index;
          save();
          renderTabs();
          textarea.value = store.tabs[store.activeTab].code || '';
          undoStack.length = 0;
          checkSyntax(textarea.value);
          };
          t.ondblclick = () => {
          const newName = prompt('Rename Tab:', tab.name);
          if(newName) { store.tabs[index].name = newName; save(); renderTabs(); }
          };
          tabBar.appendChild(t);
        });
    };

    const createNewTab = () => {
        const id = Date.now();
        store.tabs.push({ id, name: 'Page ' + store.tabs.length, code: '' });
        store.activeTab = store.tabs.length - 1;
        save();
        renderTabs();
        textarea.value = '';
        undoStack.length = 0;
        triggerUpdate();
    };

    const insertText = (text) => {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const oldVal = textarea.value;
        textarea.value = oldVal.substring(0, start) + text + oldVal.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length - 1;
        textarea.focus();
        triggerUpdate();
    };

    const checkSyntax = (code) => {
        let err = null;
        const stack = [];
        const pairs = { '{': '}', '(': ')', '[': ']' };
        let line = 1;
        for (let i = 0; i < code.length; i++) {
          const char = code[i];
          if (char === '\n') line++;
          if (pairs[char]) stack.push({ char, line });
          else if (Object.values(pairs).includes(char)) {
          if (stack.length === 0) { err = `Line ${line}: Unexpected '${char}'`; break; }
          const last = stack.pop();
          if (pairs[last.char] !== char) { err = `Line ${line}: Mismatched '${last.char}'`; break; }
          }
        }
        if (!err && stack.length > 0) err = `Line ${stack[0].line}: Unclosed '${stack[0].char}'`;

        if (err) {
          errorBar.style.display = 'flex'; errorBar.textContent = '⚠️ ' + err;
        } else {
          errorBar.style.display = 'none';
        }
    };

    const triggerUpdate = (shouldPushHistory = true) => {
        const val = textarea.value;
        if(shouldPushHistory) pushState(val);
        store.tabs[store.activeTab].code = val;
        save();
        checkSyntax(val);
        parseAndInject();
    };

    textarea.addEventListener('input', () => triggerUpdate(true));

    textarea.addEventListener('keydown', (e) => {
        if((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          execUndo();
        }
        if((e.ctrlKey || e.metaKey) && e.key === 'y') {
          e.preventDefault();
          execRedo();
        }
    });

    panel.appendChild(header);
    panel.appendChild(findBar);
    panel.appendChild(tabBar);
    editorContainer.appendChild(textarea);
    panel.appendChild(editorContainer);
    panel.appendChild(errorBar);
    panel.appendChild(footer);

    setTimeout(() => {
        document.body.appendChild(toggleBtn);
        document.body.appendChild(panel);
        applyTheme(store.theme);
        renderTabs();
        textarea.value = store.tabs[store.activeTab].code || '';
        pushState(textarea.value);
        parseAndInject();
    }, 500);

    let isVisible = false;
    toggleBtn.onclick = () => {
        isVisible = !isVisible;
        panel.style.display = isVisible ? 'flex' : 'none';
        toggleBtn.textContent = isVisible ? '×' : '✒️';
        if(isVisible) textarea.focus();
    };

    document.addEventListener('keydown', (e) => {
        if(e.key === 'Escape' && isVisible) toggleBtn.click();
    });

    let isDrag = false, startX, startY, initLeft, initTop;
    const startDrag = (e) => {
        if(['SELECT','INPUT','BUTTON','SPAN'].includes(e.target.tagName) && e.target.onclick) return;
        if(e.target.className === 'mio-tool-btn') return;
        isDrag = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        initLeft = rect.left;
        initTop = rect.top;
    };
    header.onmousedown = startDrag;
    footer.onmousedown = startDrag;

    let isResizing = false, rStartX, rStartY, initW, initH;
    resizer.onmousedown = (e) => {
        isResizing = true;
        rStartX = e.clientX; rStartY = e.clientY;
        initW = panel.offsetWidth; initH = panel.offsetHeight;
        e.stopPropagation(); e.preventDefault();
    };

    document.onmousemove = (e) => {
        if(isDrag) {
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          panel.style.left = (initLeft + dx) + 'px';
          panel.style.top = (initTop + dy) + 'px';
        }
        if(isResizing) {
          const dx = e.clientX - rStartX;
          const dy = e.clientY - rStartY;
          panel.style.width = Math.max(350, initW + dx) + 'px';
          panel.style.height = Math.max(250, initH + dy) + 'px';
        }
    };
    document.onmouseup = () => { isDrag = false; isResizing = false; };

})();