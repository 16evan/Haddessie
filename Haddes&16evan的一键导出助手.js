// ==UserScript==
// @name         Haddes&16evan的一键导出助手
// @namespace    https://chat.mufy.ai/
// @version      1.2
// @description  一键导出网页输入框/富文本内容为TXT或DOC文件，支持浮窗交互，适配各种编辑器。
// @author       Haddes/16evan
// @match        https://chat.mufy.ai/create*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // === 1. 样式设置 (完全保留原有样式) ===
    const style = document.createElement('style');
    style.textContent = `
        #mufy-export-widget {
            position: fixed;
            bottom: 15%;
            right: 20px;
            z-index: 999999;
            font-family: sans-serif;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 10px;
        }

        .mufy-btn-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: rgba(20, 20, 20, 0.95);
            padding: 15px;
            border-radius: 12px;
            border: 1px solid #444;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            transform: translateX(120%);
            transition: transform 0.3s ease;
        }

        .mufy-btn-group.show { transform: translateX(0); }

        .mufy-toggle {
            width: 45px;
            height: 45px;
            background: #812425; /* 配合你的人设红色 */
            color: #fff;
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            font-size: 20px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.4);
            border: 2px solid #FCE4A9; /* 金色边框 */
            transition: transform 0.2s;
        }
        .mufy-toggle:hover { transform: scale(1.1); }

        .mufy-btn {
            background: #333;
            color: #e0e0e0;
            border: 1px solid #555;
            padding: 8px 15px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
        }

        .mufy-btn:hover {
            background: #C00000;
            color: white;
            border-color: #FCE4A9;
        }

        .mufy-header {
            font-size: 12px;
            color: #FCE4A9;
            text-align: center;
            margin-bottom: 5px;
            font-weight: bold;
        }
    `;
    document.head.appendChild(style);

    // === 2. 创建UI (完全保留原有结构) ===
    const container = document.createElement('div');
    container.id = 'mufy-export-widget';
    container.innerHTML = `
        <div class="mufy-btn-group" id="mufy-panel">
            <div class="mufy-header">Mufy 导出助手</div>
            <button class="mufy-btn" id="mufy-txt">导出 TXT</button>
            <button class="mufy-btn" id="mufy-doc">导出 DOC</button>
        </div>
        <div class="mufy-toggle" id="mufy-toggle" title="点击展开导出菜单">💾</div>
    `;
    document.body.appendChild(container);

    // === 3. 核心抓取逻辑 (完全保留原有逻辑) ===
    function scrapeMufyData() {
        let resultText = "";

        const fieldMap = {
            'name': '【名称】',
            'introduction': '【角色介绍】',
            'characterSetting': '【人设】',
            'adversityHandling': '【逆境处理】',
            'beautification': '【全局美化代码】',
            'codeRenderContent': '【小剧场代码】',
            'greeting': '【开场设计】',
            'defaultPerception': '【默认认知】',
            'authorNote': '【厨子厨艺/作者的话】',
            'plotSetting': '【情节设定】',
            'outputSetting': '【输出设定】',
            'styleSamples': '【样例对话 & 文风】'
        };

        for (const [key, title] of Object.entries(fieldMap)) {
            const el = document.querySelector(`[name="${key}"]`);
            if (el && el.value.trim()) {
                resultText += `${title}\n${el.value.trim()}\n\n------------------------\n\n`;
            }
        }

        const itemInputs = document.querySelectorAll('input[id^="item-name-backend-item-"]');
        if (itemInputs.length > 0) {
            let itemSection = "";
            let hasItem = false;

            itemInputs.forEach((nameInput, index) => {
                const nameVal = nameInput.value.trim();
                if (!nameVal) return;

                const descId = nameInput.id.replace('item-name-', 'item-desc-');
                const descInput = document.getElementById(descId);
                const descVal = descInput ? descInput.value.trim() : "无描述";

                itemSection += `[物品 ${index + 1}]\n名称：${nameVal}\n描述：${descVal}\n\n`;
                hasItem = true;
            });

            if (hasItem) {
                resultText += `【物品栏 / Inventory】\n${itemSection}------------------------\n\n`;
            }
        }

        const interactName = document.getElementById('interaction-name');
        if (interactName && interactName.value.trim()) {
             resultText += `【交互名称】：${interactName.value.trim()}\n`;
        }

        const promptInput = document.getElementById('use-copywriting');
        if (promptInput && promptInput.value.trim()) {
             resultText += `【提示词/后果】：${promptInput.value.trim()}\n`;
        }

        const postScriptInput = document.querySelector('input[placeholder*="展示在聊天框里的内容"]');
        if (postScriptInput && postScriptInput.value.trim()) {
             resultText += `【使用后文案】：${postScriptInput.value.trim()}\n`;
        }

        if (!resultText) {
            return "未检测到任何内容，请确保你已经填写了信息。";
        }

        resultText = `=== Mufy 角色档案导出 ===\n导出时间：${new Date().toLocaleString()}\n\n${resultText}`;

        return resultText;
    }

    // === 4. 下载功能 (仅修改DOC导出逻辑，避免生成XML文件夹) ===
    function download(content, ext) {
        if (content.startsWith("未检测到")) {
            alert(content);
            return;
        }

        const nameInput = document.querySelector('[name="name"]');
        let filename = nameInput && nameInput.value.trim() ? nameInput.value.trim() : "Mufy角色档案";

        // TXT导出逻辑完全保留
        if (ext === 'txt') {
             const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
             saveAs(blob, `${filename}.txt`);
        }
        // 重构DOC导出逻辑：用纯文本模式生成，避免Word转换为XML格式
        else if (ext === 'doc') {
             // 关键：使用纯文本MIME类型，仅修改后缀为.doc，强制Word以纯文本模式打开
             const docBlob = new Blob([content], { type: 'text/plain;charset=utf-8' });
             saveAs(docBlob, `${filename}.doc`);
        }
    }

    // 保存函数完全保留
    function saveAs(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // === 5. 事件绑定 (完全保留原有逻辑) ===
    const panel = document.getElementById('mufy-panel');
    const toggle = document.getElementById('mufy-toggle');

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('show');
    });

    document.getElementById('mufy-txt').addEventListener('click', () => {
        download(scrapeMufyData(), 'txt');
    });

    document.getElementById('mufy-doc').addEventListener('click', () => {
        download(scrapeMufyData(), 'doc');
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            panel.classList.remove('show');
        }
    });

})();