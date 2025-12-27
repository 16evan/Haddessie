// ==UserScript==
// @name         Haddes&16evan的搜索聊天记录
// @namespace    https://chat.mufy.ai
// @version      1.2
// @description  搜索历史聊天记录关键词
// @author       Haddes/16evan
// @match        https://chat.mufy.ai/chat*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let isDigging = false;
    let stopDigging = false;

    // 注入CSS样式 (玻璃态 + 现代极简)
    const style = document.createElement('style');
    style.innerHTML = `
        /* 悬浮球：右侧偏上 */
        .sm-glass-btn {
          position: fixed;
          top: 35%; /* 屏幕高度的35%处 */
          right: 0;
          width: 40px;
          height: 50px;
          background: rgba(255, 255, 255, 0.65);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.8);
          border-right: none;
          border-radius: 12px 0 0 12px;
          box-shadow: -4px 4px 12px rgba(0,0,0,0.1);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: sans-serif;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          color: #333;
          font-weight: bold;
        }
        .sm-glass-btn:hover { width: 50px; background: rgba(255, 255, 255, 0.85); }

        /* 主面板：毛玻璃效果 */
        .sm-glass-panel {
          position: fixed;
          top: 35%;
          right: 60px; /* 在按钮左侧 */
          width: 280px;
          max-width: 80vw;
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          padding: 20px;
          z-index: 99998;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: none;
          opacity: 0;
          transform: translateX(20px) scale(0.95);
          transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        .sm-glass-panel.show { display: block; opacity: 1; transform: translateX(0) scale(1); }

        /* 输入框：高对比度 */
        .sm-g-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid rgba(0,0,0,0.1);
          border-radius: 8px;
          outline: none;
          background: rgba(255, 255, 255, 0.5);
          color: #000000; /* 强制纯黑文字 */
          font-size: 14px;
          margin-bottom: 12px;
          transition: 0.2s;
        }
        .sm-g-input:focus { background: #fff; box-shadow: 0 0 0 2px rgba(0,0,0,0.1); }
        .sm-g-input::placeholder { color: #888; }

        /* 按钮组 */
        .sm-g-btn-group { display: flex; gap: 10px; }
        .sm-g-btn {
          flex: 1;
          padding: 8px 0;
          border: none;
          background: rgba(0, 0, 0, 0.05);
          color: #444;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .sm-g-btn:hover { background: rgba(0, 0, 0, 0.1); }
        .sm-g-btn.primary { background: #333; color: #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.15); }
        .sm-g-btn.primary:hover { background: #000; transform: translateY(-1px); }

        /* 结果列表 */
        .sm-g-result {
          margin-top: 15px;
          max-height: 200px;
          overflow-y: auto;
          border-top: 1px solid rgba(0,0,0,0.05);
          padding-top: 5px;
        }
        /* 滚动条美化 */
        .sm-g-result::-webkit-scrollbar { width: 4px; }
        .sm-g-result::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 4px; }

        .sm-g-item {
          padding: 8px 10px;
          border-radius: 6px;
          cursor: pointer;
          color: #333; /* 结果文字深灰 */
          font-size: 13px;
          margin-bottom: 2px;
          display: flex;
          justify-content: space-between;
        }
        .sm-g-item:hover { background: rgba(0,0,0,0.05); }
        .sm-g-idx { font-weight: bold; color: #aaa; margin-right: 8px; }
    `;
    document.head.appendChild(style);

    // 悬浮球
    const fab = document.createElement('div');
    fab.className = 'sm-glass-btn';
    fab.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
    document.body.appendChild(fab);

    // 面板
    const panel = document.createElement('div');
    panel.className = 'sm-glass-panel';
    panel.innerHTML = `
        <div style="font-size:12px; color:#888; margin-bottom:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase;">Search History</div>
        <input type="text" class="sm-g-input" placeholder="Keyword...">
        <div class="sm-g-btn-group">
          <button class="sm-g-btn" id="sm-g-curr">当前页</button>
          <button class="sm-g-btn primary" id="sm-g-dig">深度挖掘</button>
        </div>
        <div id="sm-g-status" style="font-size:11px; color:#999; margin-top:8px; text-align:right;">Ready</div>
        <div class="sm-g-result" id="sm-g-list"></div>
    `;
    document.body.appendChild(panel);

    // 交互逻辑
    let isOpen = false;
    fab.onclick = () => {
        isOpen = !isOpen;
        if (isOpen) {
          panel.classList.add('show');
          fab.style.width = '50px';
          fab.innerHTML = '×';
        } else {
          panel.classList.remove('show');
          fab.style.width = '';
          fab.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
        }
    };

    const input = panel.querySelector('input');
    const status = panel.querySelector('#sm-g-status');
    const list = panel.querySelector('#sm-g-list');

    // 绑定事件
    panel.querySelector('#sm-g-curr').onclick = () => {
        stopDigging = true;
        doSearch(input.value, list, status, false);
    };

    const digBtn = panel.querySelector('#sm-g-dig');
    digBtn.onclick = () => {
        if (isDigging) {
          stopDigging = true;
          digBtn.innerText = "深度挖掘";
          digBtn.style.background = "#333";
          return;
        }
        const kw = input.value;
        if (!kw) return;

        stopDigging = false;
        digBtn.innerText = "停止";
        digBtn.style.background = "#666";
        startDigging(kw, list, status, digBtn);
    };

    // 挖掘核心逻辑 (不变，复用稳健版)
    async function startDigging(keyword, container, statusText, btn) {
        const chatContainer = document.querySelector('.w-full.flex-1.overflow-auto.scroll-primary');
        if (!chatContainer) {
          statusText.innerText = 'Error: No Chat';
          return;
        }

        isDigging = true;
        let attempts = 0;

        while (!stopDigging && attempts < 50) {
          const count = doSearch(keyword, container, statusText, true);

          if (count > 0) {
          // 如果找到了，自动暂停询问，或者继续挖？这里简化逻辑：找到就停，或者让用户再次点击
          // 模拟简单提示
          if(!confirm(`已发现 ${count} 条线索，是否继续向上翻找更早记录？`)) break;
          }

          const oldH = chatContainer.scrollHeight;
          chatContainer.scrollTop = 0;
          statusText.innerText = `Loading... (${attempts+1})`;

          await new Promise(r => setTimeout(r, 1500));

          if (chatContainer.scrollHeight <= oldH) {
          statusText.innerText = 'End of History';
          break;
          }
          chatContainer.scrollTop = 50;
          attempts++;
        }
        isDigging = false;
        btn.innerText = "深度挖掘";
        btn.style.background = "#333";
        statusText.innerText = "Done";
    }

    function doSearch(keyword, container, statusText, isSilent) {
        container.innerHTML = '';
        if (!keyword) return 0;

        const chatContainer = document.querySelector('.w-full.flex-1.overflow-auto.scroll-primary');
        if (!chatContainer) return 0;

        const walker = document.createTreeWalker(chatContainer, NodeFilter.SHOW_TEXT, null, false);
        let node;
        let count = 0;

        while(node = walker.nextNode()) {
          if (node.textContent.includes(keyword) && node.parentElement.offsetParent !== null) {
          count++;
          const item = document.createElement('div');
          item.className = 'sm-g-item';
          item.innerHTML = `<span class="sm-g-idx">${count}</span> <span>${node.textContent.substring(0, 18)}...</span>`;

          const el = node.parentElement;
          item.onclick = () => {
          el.scrollIntoView({behavior: "smooth", block: "center"});
          el.style.transition = "background 0.5s";
          el.style.backgroundColor = "rgba(255, 215, 0, 0.3)"; // 金色高亮
          setTimeout(()=>el.style.backgroundColor="", 1500);
          // 移动端自动收起
          if(window.innerWidth < 600) fab.click();
          };
          container.appendChild(item);
          }
        }
        if(!isSilent) statusText.innerText = count ? `${count} found` : 'No matches';
        return count;
    }
})();
