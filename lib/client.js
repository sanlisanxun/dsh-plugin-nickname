// lib/client.js
(function () {
  const NICKNAME_DEF = {
  id: 'dsh-plugin-nickname',
  factory: () => {
    // 默认扫描选择器与包名匹配规则，用户可在面板「高级」里覆盖，
    // dsh 改版导致 DOM 结构变化时无需改代码即可自救
    const DEFAULTS = {
      enabled: true,
      sortBy: 'name',
      groupBy: 'none',
      scanSelector: 'div, span, button, h2, h3',
      namePattern: '^(@?[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)?|dsh(\.[a-z-]+)+)$',
      allowOfficial: false,
      groupCollapsed: {},
      tags: { custom: [], assignments: {} }
    };

    // 官方插件：dsh 自带的 bundle 与 @deepseek-ai 命名空间的插件。
    // 内置集合取自 dsh-client-ui-plugin-manager 里的 BUILTIN_PROFILE_BUNDLES。
    const OFFICIAL_PREFIX = '@deepseek-ai/';
    const BUILTIN_BUNDLES = [
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@deepseek-ai/dsh-headless',
      '@deepseek-ai/dsh-sdk-app',
      '@deepseek-ai/dsh-acp-app',
      '@deepseek-ai/dsh-sdk-minimal'
    ];

    function isOfficialPackage(pkgName) {
      return pkgName.startsWith(OFFICIAL_PREFIX) || BUILTIN_BUNDLES.indexOf(pkgName) !== -1;
    }

    // 会话标记：dispose 的多轮清扫只清理本次会话注入的 UI，避免误删重新启用后的新 UI
    const uiSession = 's' + Date.now() + Math.random().toString(36).slice(2, 7);
    // localStorage 不可用（web 版 / 隐私模式）时的内存兜底
    const memoryStore = {};

    const plugin = {
      name: 'plugin-nickname-client',
      inject: [],
      apply(ctx) {
        'use strict';

        let observer = null;
        let shortcutHandler = null;
        let mouseMoveHandler = null;
        let mouseUpHandler = null;
        let outsideClickHandler = null;
        let escHandler = null;
        let searchTimer = null;
        let styleEl = null;
        let initTimer = null;

        function storageGet(key) {
          try {
            return localStorage.getItem(key);
          } catch (e) {
            return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
          }
        }

        function storageSet(key, value) {
          try {
            localStorage.setItem(key, value);
          } catch (e) {
            memoryStore[key] = value;
          }
        }

        function storageRemove(key) {
          try {
            localStorage.removeItem(key);
          } catch (e) {
            delete memoryStore[key];
          }
          if (key === 'dsh_plugin_nicknames_settings') settingsCache = undefined;
          if (key === 'dsh_plugin_nicknames') nickCache = undefined;
        }

        function buildNameRegex(pattern) {
          try {
            return new RegExp(pattern);
          } catch (e) {
            return new RegExp(DEFAULTS.namePattern);
          }
        }

        function queryCandidates(selector) {
          try {
            return document.querySelectorAll(selector || DEFAULTS.scanSelector);
          } catch (e) {
            return document.querySelectorAll(DEFAULTS.scanSelector);
          }
        }

        // 内存缓存：避免每次 MutationObserver 触发都重新 JSON.parse 读写 localStorage
        let settingsCache = undefined;
        let nickCache = undefined;
        function getSettings() {
          if (settingsCache) return settingsCache;
          try {
            const saved = storageGet('dsh_plugin_nicknames_settings');
            if (saved) {
              settingsCache = { ...DEFAULTS, ...JSON.parse(saved) };
            }
          } catch (e) {}
          if (!settingsCache) settingsCache = { ...DEFAULTS };
          return settingsCache;
        }

        function saveSettings(settings) {
          settingsCache = settings;
          storageSet('dsh_plugin_nicknames_settings', JSON.stringify(settings));
        }

        function getNicknames() {
          if (nickCache) return nickCache;
          try {
            const saved = storageGet('dsh_plugin_nicknames');
            if (saved) {
              nickCache = { ...JSON.parse(saved) };
            }
          } catch (e) {}
          if (!nickCache) nickCache = {};
          return nickCache;
        }

        function saveNicknames(map) {
          nickCache = map;
          storageSet('dsh_plugin_nicknames', JSON.stringify(map));
        }

        function escapeHtml(str) {
          return String(str).replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
          })[ch]);
        }

        // dsh 卡片标题形如「显示名 (包名)」，也认这种写法
        function matchPackage(text, pkgName) {
          if (text === pkgName) return true;
          // 前缀匹配需带边界：防止 dsh-context 误中 dsh-context-extra 这类长包名
          if (text.startsWith(pkgName)) {
            const next = text.charAt(pkgName.length);
            if (next === '' || !/[A-Za-z0-9.\/-]/.test(next)) return true;
          }
          return text.endsWith('(' + pkgName + ')') || text.endsWith('（' + pkgName + '）');
        }

        // 找到真正承载这段文本的叶子节点：
        // dsh 的插件名是 <button class=cardTitle>，外面还套了 div.titleRow / div.cardMain，
        // 只改写容器会把 button、图标、描述一起抹掉，所以必须把写入落到叶子上。
        // 找不到叶子就返回 null —— 宁可不替换，也不破坏结构。
        function findTextTarget(el, matchText) {
          let prefixHit = null;
          function walk(node) {
            if (node.children && node.children.length !== 0) {
              for (let i = 0; i < node.children.length; i++) {
                if (walk(node.children[i])) return true;
              }
              return false;
            }
            const t = (node.textContent || '').trim();
            if (t === '') return false;
            if (t === matchText) {
              prefixHit = node;
              return true;
            }
            if (!prefixHit && matchText.startsWith(t)) prefixHit = node;
            return false;
          }
          walk(el);
          return prefixHit;
        }

        function saveNickname(pkgName, nickname) {
          if (!getSettings().allowOfficial && isOfficialPackage(pkgName)) return;
          const nicknames = getNicknames();
          if (nickname.trim() === '') {
            delete nicknames[pkgName];
          } else {
            nicknames[pkgName] = nickname;
          }
          saveNicknames(nicknames);
          refreshAll();
        }

        function resetAll() {
          if (confirm('确定要重置所有插件备注名吗？')) {
            storageRemove('dsh_plugin_nicknames');
            refreshAll();
            openEditPanel();
          }
        }

        function uninstallPlugin() {
          if (confirm('确定要卸载 dsh-plugin-nickname 插件吗？\n\n这将清除所有备注和设置，dsh 会自动刷新页面后卸载本插件。\n\n此操作不可恢复，确定继续吗？')) {
            storageRemove('dsh_plugin_nicknames');
            storageRemove('dsh_plugin_nicknames_settings');
            storageRemove('dsh_plugin_nickname_btn_pos');
            refreshAll();
            const panel = document.getElementById('nickname-edit-panel');
            if (panel) panel.remove();
            alert('已清除 dsh-plugin-nickname 插件的所有数据！\n\n请在 dsh 插件设置里手动关闭或卸载本插件即可。');
          }
        }

        function replaceNicknames() {
          const settings = getSettings();
          if (!settings.enabled) return;
          const nicknames = getNicknames();
          // 长包名优先，避免 "a-b" 抢先匹配 "a-b-c"
          const entries = Object.entries(nicknames)
            .filter(([pkgName]) => settings.allowOfficial || !isOfficialPackage(pkgName))
            .sort((a, b) => b[0].length - a[0].length);
          if (entries.length === 0) return;
          // 优先只扫插件卡片内部，避免每次 MutationObserver 触发都全文档扫描
          const cards = document.querySelectorAll('[data-plugin-package]');
          let allElements;
          if (cards.length) {
            allElements = [];
            cards.forEach((c) => {
              try {
                const found = c.querySelectorAll(settings.scanSelector);
                for (let i = 0; i < found.length; i++) allElements.push(found[i]);
              } catch (e) {}
            });
          } else {
            allElements = queryCandidates(settings.scanSelector);
          }
          allElements.forEach((el) => {
            if (el.dataset.nicknameProcessed) return;
            // 不要改写本插件自己的界面（编辑面板里的包名标签就长这样）
            if (el.closest('[data-nickname-ui]')) return;
            const text = el.textContent.trim();
            for (const [pkgName, nickname] of entries) {
              if (!matchPackage(text, pkgName)) continue;
              // 只按「元素子节点」计数：空白文本节点的数量取决于渲染方式，
              // 用它做守卫会让同一份 DOM 在不同框架下行为不一致
              if (el.children.length > 2) break;
              const target = findTextTarget(el, text);
              if (!target) continue;
              if (target.dataset.nicknameProcessed) break;
              const original = target.textContent.trim();
              target.textContent = nickname;
              target.dataset.originalName = pkgName;
              target.dataset.originalText = original;
              target.dataset.nicknameProcessed = '1';
              target.title = '原名: ' + pkgName;
              break;
            }
          });
        }

        function refreshAll() {
          document.querySelectorAll('[data-nickname-processed]').forEach((el) => {
            el.textContent = el.dataset.originalText || el.dataset.originalName || '';
            delete el.dataset.nicknameProcessed;
            delete el.dataset.originalName;
            delete el.dataset.originalText;
            el.title = '';
          });
          replaceNicknames();
        }

        function initShortcut() {
          if (shortcutHandler) return;
          shortcutHandler = (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'N') {
              e.preventDefault();
              openEditPanel();
            }
          };
          document.addEventListener('keydown', shortcutHandler);
        }

        function createFloatingButton() {
          if (document.getElementById('nickname-float-btn')) return;
          const btn = document.createElement('button');
          btn.id = 'nickname-float-btn';
          btn.dataset.nicknameUi = uiSession;
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>改备注`;
          let savedPos = null;
          try {
            savedPos = JSON.parse(storageGet('dsh_plugin_nickname_btn_pos'));
          } catch (e) {}
          btn.style.cssText = `position: fixed !important;left: ${savedPos ? savedPos.left : '20px'} !important;top: ${savedPos ? savedPos.top : 'auto'} !important;bottom: ${savedPos ? savedPos.bottom : '120px'} !important;z-index: 2147483647 !important;padding: 8px 14px !important;border-radius: 24px !important;border: 1px solid rgba(255,255,255,0.15) !important;background: rgba(40,40,40,0.9) !important;backdrop-filter: blur(10px);color: #fff !important;font-size: 12px;cursor: pointer !important;box-shadow: 0 4px 12px rgba(0,0,0,0.3);transition: all 0.2s ease;`;
          btn.onmouseover = () => {
            btn.style.background = 'rgba(60,60,60,0.95)';
            btn.style.transform = 'translateY(-1px)';
          };
          btn.onmouseout = () => {
            btn.style.background = 'rgba(40,40,40,0.9)';
            btn.style.transform = 'translateY(0)';
          };
          btn.onclick = toggleEditPanel;
          let isDragging = false;
          let offsetX, offsetY;
          btn.addEventListener('mousedown', (e) => {
            isDragging = true;
            const rect = btn.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            btn.style.cursor = 'grabbing';
          });
          mouseMoveHandler = (e) => {
            if (!isDragging) return;
            btn.style.left = (e.clientX - offsetX) + 'px';
            btn.style.top = (e.clientY - offsetY) + 'px';
            btn.style.bottom = 'auto';
          };
          document.addEventListener('mousemove', mouseMoveHandler);
          mouseUpHandler = () => {
            if (isDragging) {
              isDragging = false;
              btn.style.cursor = 'pointer';
              const rect = btn.getBoundingClientRect();
              storageSet('dsh_plugin_nickname_btn_pos', JSON.stringify({
                left: rect.left + 'px',
                top: rect.top + 'px',
                bottom: 'auto'
              }));
            }
          };
          document.addEventListener('mouseup', mouseUpHandler);
          document.body.appendChild(btn);
        }

        function scanPlugins() {
          const nicknames = getNicknames();
          const plugins = new Set();
          Object.keys(nicknames).forEach(p => plugins.add(p));
          // dsh 的每张插件卡片都带 data-plugin-package，这是最可靠的包名来源
          document.querySelectorAll('[data-plugin-package]').forEach((el) => {
            const pkg = el.dataset.pluginPackage;
            if (pkg) plugins.add(pkg);
          });
          // 已被替换的元素仍可通过 data-original-name 取回包名
          document.querySelectorAll('[data-original-name]').forEach((el) => {
            const origin = el.dataset.originalName;
            if (origin) plugins.add(origin);
          });
          const settings = getSettings();
          const allElements = queryCandidates(settings.scanSelector);
          const nameRegex = buildNameRegex(settings.namePattern);
          allElements.forEach((el) => {
            if ((el.children.length === 0 || el.childNodes.length <= 2)) {
              const text = el.textContent.trim();
              if (nameRegex.test(text) && text.length > 3) {
                plugins.add(text);
              }
            }
          });
          return Array.from(plugins);
        }

        // 安装后宿主不会自动刷新，检测不到插件列表时提示用户手动刷新
        function refreshInstallHint() {
          const found = scanPlugins().length > 0;
          const old = document.getElementById('nickname-install-hint');
          if (old) old.remove();
          if (found) return;
          const hint = document.createElement('div');
          hint.id = 'nickname-install-hint';
          hint.dataset.nicknameUi = uiSession;
          hint.textContent = '未检测到插件列表，点此刷新页面';
          hint.style.cssText = 'position: fixed !important;left: 20px !important;bottom: 168px !important;z-index: 2147483647 !important;padding: 6px 12px !important;border-radius: 16px !important;border: 1px solid rgba(255,180,80,0.35) !important;background: rgba(70,50,20,0.92) !important;color: #ffc06b !important;font-size: 12px;cursor: pointer !important;box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
          hint.onclick = () => location.reload();
          document.body.appendChild(hint);
        }

        function removeSessionUI() {
          document.querySelectorAll('[data-nickname-ui="' + uiSession + '"]').forEach((el) => el.remove());
        }

        function closeEditPanel() {
          const existing = document.getElementById('nickname-edit-panel');
          if (existing) existing.remove();
          if (styleEl) {
            styleEl.remove();
            styleEl = null;
          }
          if (outsideClickHandler) {
            document.removeEventListener('click', outsideClickHandler);
            outsideClickHandler = null;
          }
          if (escHandler) {
            document.removeEventListener('keydown', escHandler);
            escHandler = null;
          }
        }

        function toggleEditPanel() {
          if (document.getElementById('nickname-edit-panel')) {
            closeEditPanel();
          } else {
            openEditPanel();
          }
        }

        function openEditPanel() {
          // 单例：先清掉旧面板、样式与外部点击监听，避免反复开关累积残留
          closeEditPanel();
          const settings = getSettings();
          const nicknames = getNicknames();
          let plugins = scanPlugins();
          const panel = document.createElement('div');
          panel.id = 'nickname-edit-panel';
          panel.dataset.nicknameUi = uiSession;
          panel.style.cssText = `position: fixed !important;right: 20px !important;top: 80px !important;z-index: 2147483647 !important;width: 360px;max-height: 600px;overflow-y: auto;background: rgba(30,30,30,0.95) !important;backdrop-filter: blur(20px);border: 1px solid rgba(255,255,255,0.1) !important;border-radius: 16px;box-shadow: 0 8px 32px rgba(0,0,0,0.4);color: #eee;font-size: 13px;animation: nicknameFadeIn 0.2s ease;`;
          styleEl = document.createElement('style');
          styleEl.textContent = `@keyframes nicknameFadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }.nickname-input:focus { outline: none !important;border-color: #4a9eff !important;box-shadow: 0 0 0 2px rgba(74,158,255,0.2) !important; }`;
          document.head.appendChild(styleEl);
          const tMgr = getTags();
          const tagManagerHtml = tMgr.custom.length === 0
            ? `<span style="font-size:11px;color:#666;">（暂无，在插件条目里点「+ 标签」新建）</span>`
            : tMgr.custom.map((name) => `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(120,255,170,0.12);color:#6ee7a8;border:1px solid rgba(120,255,170,0.3);">${escapeHtml(name)}<span class="nickname-tag-del" data-tag="${escapeHtml(name)}" style="cursor:pointer;color:#f88;margin-left:2px;">✕</span></span>`).join('');
          let html = `<div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);"><div style="font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>插件备注名管理</div><div style="display: flex; gap: 6px; align-items: center;"><label style="display: flex; align-items: center; gap: 4px; font-size: 12px; color: #aaa; cursor: pointer;"><input type="checkbox" id="nickname-enabled" ${settings.enabled ? 'checked' : ''} style="margin: 0; cursor: pointer;">启用</label><button id="nickname-reset-btn" title="重置所有备注" style="font-size: 11px; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #aaa; cursor: pointer; transition: all 0.2s;">重置</button><button id="nickname-export-btn" title="导出备注" style="font-size: 11px; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #aaa; cursor: pointer; transition: all 0.2s;">导出</button><button id="nickname-import-btn" title="导入备注" style="font-size: 11px; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #aaa; cursor: pointer; transition: all 0.2s;">导入</button></div></div><div style="display: flex; gap: 8px; margin-bottom: 12px;"><select id="nickname-sort" style="flex: 1; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; font-size: 12px; cursor: pointer;"><option value="name" ${settings.sortBy === 'name' ? 'selected' : ''}>按原名称排序</option><option value="nickname" ${settings.sortBy === 'nickname' ? 'selected' : ''}>按备注名排序</option></select><select id="nickname-group" style="flex: 1; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; font-size: 12px; cursor: pointer;"><option value="none" ${settings.groupBy === 'none' ? 'selected' : ''}>不分组</option><option value="hasNickname" ${settings.groupBy === 'hasNickname' ? 'selected' : ''}>按是否有备注分组</option><option value="tags" ${settings.groupBy === 'tags' ? 'selected' : ''}>按标签分组</option></select></div><details style="margin-bottom: 12px;"><summary style="cursor: pointer; font-size: 12px; color: #888; outline: none;">高级</summary><div style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;"><label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #bbb; cursor: pointer;" title="勾选后允许修改 dsh 官方插件（@deepseek-ai/*）的名称"><input type="checkbox" id="nickname-official" ${settings.allowOfficial ? 'checked' : ''} style="margin: 0; cursor: pointer;">允许修改官方插件（@deepseek-ai/*）</label><input type="text" id="nickname-selector" value="${escapeHtml(settings.scanSelector || DEFAULTS.scanSelector)}" placeholder="扫描选择器，如 div, span, h2, h3" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: #fff; font-size: 12px; box-sizing: border-box;"><input type="text" id="nickname-pattern" value="${escapeHtml(settings.namePattern || DEFAULTS.namePattern)}" placeholder="包名匹配正则" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: #fff; font-size: 12px; box-sizing: border-box;"><button id="nickname-adv-reset-btn" style="padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #aaa; cursor: pointer; font-size: 11px;">恢复默认</button></div><div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);"><div style="font-size:11px;color:#888;margin-bottom:6px;">自定义标签（固定分类 官方/已修改/未修改 不可删）</div><div id="nickname-tag-manager" style="display:flex;flex-wrap:wrap;gap:4px;">${tagManagerHtml}</div></div></details><input type="text" id="nickname-search" placeholder="搜索插件名称..." style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; font-size: 13px; box-sizing: border-box; margin-bottom: 16px; transition: all 0.2s;"><div id="nickname-list">`;


        // ---- 分组标签 ----
        // 固定分类：官方 / 已修改 / 未修改，由现有数据自动派生，只读不可改。
        // 自定义标签：用户自建，存于 settings.tags.custom（顺序即展示顺序）与
        // settings.tags.assignments（包名 -> [标签名]）。
        function getTags() {
          settings.tags = settings.tags || {};
          settings.tags.custom = settings.tags.custom || [];
          settings.tags.assignments = settings.tags.assignments || {};
          return settings.tags;
        }
        function fixedTagsOf(pkg) {
          const tags = [];
          if (!settings.allowOfficial && isOfficialPackage(pkg)) tags.push('官方');
          if (nicknames[pkg]) tags.push('已修改'); else tags.push('未修改');
          return tags;
        }
        function customTagsOf(pkg) {
          const t = getTags();
          return (t.assignments[pkg] || []).filter((x) => t.custom.indexOf(x) !== -1);
        }
        function toggleCustomTag(pkg, tag) {
          const t = getTags();
          const cur = t.assignments[pkg] || [];
          const idx = cur.indexOf(tag);
          if (idx === -1) cur.push(tag); else cur.splice(idx, 1);
          t.assignments[pkg] = cur;
          saveSettings(settings);
          renderList(panel.querySelector('#nickname-search').value);
        }
        function createCustomTag(name, pkg) {
          name = (name || '').trim();
          if (!name) return;
          const t = getTags();
          if (t.custom.indexOf(name) === -1) t.custom.push(name);
          if (pkg) {
            const cur = t.assignments[pkg] || [];
            if (cur.indexOf(name) === -1) cur.push(name);
            t.assignments[pkg] = cur;
          }
          saveSettings(settings);
          renderList(panel.querySelector('#nickname-search').value);
        }
        function deleteCustomTag(name) {
          const t = getTags();
          t.custom = t.custom.filter((x) => x !== name);
          for (const k in t.assignments) {
            t.assignments[k] = t.assignments[k].filter((x) => x !== name);
          }
          saveSettings(settings);
          renderList(panel.querySelector('#nickname-search').value);
        }

        function renderList(filter = '') {
          const listEl = panel.querySelector('#nickname-list');
          const q = filter.toLowerCase();
          const filtered = plugins.filter((p) => {
            if (p.toLowerCase().includes(q)) return true;
            if ((nicknames[p] || '').toLowerCase().includes(q)) return true;
            if (fixedTagsOf(p).some((t) => t.toLowerCase().includes(q))) return true;
            if (customTagsOf(p).some((t) => t.toLowerCase().includes(q))) return true;
            return false;
          });
          const sortBy = settings.sortBy;
          filtered.sort((a, b) => {
            if (sortBy === 'nickname') {
              const aNick = nicknames[a] || '';
              const bNick = nicknames[b] || '';
              return aNick.localeCompare(bNick, 'zh');
            } else {
              return a.localeCompare(b);
            }
          });
          const groupBy = settings.groupBy;
          const tagsCustom = getTags().custom;
          let grouped = {};
          if (groupBy === 'hasNickname') {
            grouped['已修改备注的插件'] = filtered.filter(p => nicknames[p]);
            grouped['未修改的插件'] = filtered.filter(p => !nicknames[p]);
          } else if (groupBy === 'tags') {
            const buckets = {};
            ['官方', '已修改', '未修改'].concat(tagsCustom).forEach((g) => (buckets[g] = []));
            filtered.forEach((p) => {
              const all = fixedTagsOf(p).concat(customTagsOf(p));
              [...new Set(all)].forEach((g) => { if (buckets[g]) buckets[g].push(p); });
            });
            grouped = buckets;
          } else {
            grouped['所有已安装插件'] = filtered;
          }
          let html = '';
          Object.entries(grouped).forEach(([groupName, groupPlugins]) => {
            if (groupPlugins.length === 0) return;
            const gCollapsed = !!(settings.groupCollapsed && settings.groupCollapsed[groupName]);
            html += `<div class="nickname-group" style="margin-bottom: 16px;">` +
              `<div class="nickname-group-header" data-group="${escapeHtml(groupName)}" style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; font-weight: 600; color: #888; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); user-select: none;">` +
                `<span class="nickname-group-toggle" style="display: inline-block; width: 10px; transition: transform 0.15s;">${gCollapsed ? '▸' : '▾'}</span>` +
                `<span>${groupName} (${groupPlugins.length})</span>` +
              `</div>` +
              `<div class="nickname-group-body" style="${gCollapsed ? 'display: none;' : ''}">`;
            groupPlugins.forEach((pkgName) => {
              const currentNick = nicknames[pkgName] || '';
            const official = !settings.allowOfficial && isOfficialPackage(pkgName);
              const fixed = fixedTagsOf(pkgName);
              const custom = customTagsOf(pkgName);
              const tagChips = fixed.map((t) => `<span class="nickname-tag tag-fixed" title="固定分类（自动）" style="font-size:10px;padding:1px 7px;border-radius:10px;background:rgba(120,170,255,0.12);color:#8ab4ff;border:1px solid rgba(120,170,255,0.25);user-select:none;">${escapeHtml(t)}</span>`).join('');
              const customChips = tagsCustom.map((t) => {
                const on = custom.indexOf(t) !== -1;
                return `<span class="nickname-tag tag-toggle${on ? ' on' : ''}" data-tag="${escapeHtml(t)}" title="点击切换是否打此标签" style="font-size:10px;padding:1px 7px;border-radius:10px;cursor:pointer;user-select:none;${on ? 'background:rgba(120,255,170,0.14);color:#6ee7a8;border:1px solid rgba(120,255,170,0.3);' : 'background:transparent;color:#777;border:1px dashed rgba(255,255,255,0.2);'}">${escapeHtml(t)}</span>`;
              }).join('');
              const tagsRow = `<div class="nickname-tags" data-pkg="${escapeHtml(pkgName)}" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;">${tagChips}${customChips}<span class="nickname-tag-add" title="新建标签并打给本插件" style="font-size:10px;padding:1px 7px;border-radius:10px;cursor:pointer;color:#aaa;border:1px dashed rgba(255,255,255,0.2);user-select:none;">+ 标签</span><span class="nickname-tag-new" style="display:none;"><input class="nickname-tag-input" placeholder="标签名" style="width:64px;font-size:10px;padding:1px 5px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.2);color:#fff;"><button class="nickname-tag-create" style="font-size:10px;padding:1px 6px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#ccc;cursor:pointer;margin-left:2px;">建</button></span></div>`;
              html += `<div style="margin-bottom: 10px; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.03);"><div style="color: #888; font-size: 11px; margin-bottom: 6px; word-break: break-all;">${escapeHtml(pkgName)}${official ? ' <span style="display: inline-block; padding: 1px 6px; border-radius: 4px; background: rgba(120,170,255,0.15); color: #8ab4ff; font-size: 10px;">官方</span>' : ''}</div><input type="text" value="${escapeHtml(currentNick)}" data-pkg="${escapeHtml(pkgName)}" class="nickname-input"${official ? ' disabled' : ''} style="width: 100%; padding: 7px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: ${official ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.2)'}; color: ${official ? '#777' : '#fff'}; font-size: 13px; box-sizing: border-box; margin-top: 0; transition: all 0.2s;" placeholder="${official ? '官方插件，默认不可改名' : '输入中文备注名，留空恢复原名'}">${tagsRow}</div>`;
            });
            html += `</div></div>`;
          });
          if (filtered.length === 0) {
            html = `<div style="color: #666; text-align: center; padding: 30px;">未找到匹配的插件</div>`;
          }
          const prevScroll = panel.scrollTop;
          listEl.innerHTML = html;
          panel.scrollTop = prevScroll;
          listEl.querySelectorAll('.nickname-group-header').forEach((header) => {
            header.addEventListener('click', () => {
              const name = header.dataset.group;
              settings.groupCollapsed = settings.groupCollapsed || {};
              const nowCollapsed = !settings.groupCollapsed[name];
              settings.groupCollapsed[name] = nowCollapsed;
              saveSettings(settings);
              const body = header.nextElementSibling;
              if (body && body.classList.contains('nickname-group-body')) {
                body.style.display = nowCollapsed ? 'none' : '';
                const tg = header.querySelector('.nickname-group-toggle');
                if (tg) tg.textContent = nowCollapsed ? '▸' : '▾';
              }
            });
          });
          panel.querySelectorAll('.nickname-input').forEach((input) => {
            input.addEventListener('change', (e) => {
              const pkg = e.target.dataset.pkg;
              const val = e.target.value.trim();
              saveNickname(pkg, val);
              nicknames[pkg] = val;
            });
          });
          listEl.querySelectorAll('.nickname-tags').forEach((tagsEl) => {
            const pkg = tagsEl.dataset.pkg;
            tagsEl.querySelectorAll('.tag-toggle').forEach((chip) => {
              chip.addEventListener('click', () => toggleCustomTag(pkg, chip.dataset.tag));
            });
            const addBtn = tagsEl.querySelector('.nickname-tag-add');
            const newWrap = tagsEl.querySelector('.nickname-tag-new');
            if (addBtn && newWrap) {
              addBtn.addEventListener('click', () => {
                newWrap.style.display = newWrap.style.display === 'none' ? '' : 'none';
              });
            }
            const createBtn = tagsEl.querySelector('.nickname-tag-create');
            const input = tagsEl.querySelector('.nickname-tag-input');
            if (createBtn && input) {
              createBtn.addEventListener('click', () => {
                const v = input.value.trim();
                if (v) { input.value = ''; newWrap.style.display = 'none'; createCustomTag(v, pkg); }
              });
            }
          });
        }

        html += `</div><div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);"><button id="nickname-uninstall-btn" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,100,100,0.3); background: rgba(255,100,100,0.1); color: #f66b6b; cursor: pointer; font-size: 12px; transition: all 0.2s;">清除数据并卸载本插件</button><button id="nickname-reload-btn" style="width: 100%; margin-top: 6px; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: #bbb; cursor: pointer; font-size: 12px; transition: all 0.2s;">刷新页面使改动生效</button></div>`;
        panel.innerHTML = html;

        panel.querySelector('#nickname-enabled').addEventListener('change', (e) => {
          settings.enabled = e.target.checked;
          saveSettings(settings);
          refreshAll();
        });
        panel.querySelector('#nickname-official').addEventListener('change', (e) => {
          settings.allowOfficial = e.target.checked;
          saveSettings(settings);
          refreshAll();
          openEditPanel();
        });
        panel.querySelector('#nickname-sort').addEventListener('change', (e) => {
          settings.sortBy = e.target.value;
          saveSettings(settings);
          renderList(panel.querySelector('#nickname-search').value);
        });
        panel.querySelector('#nickname-group').addEventListener('change', (e) => {
          settings.groupBy = e.target.value;
          saveSettings(settings);
          renderList(panel.querySelector('#nickname-search').value);
        });
        panel.querySelector('#nickname-reset-btn').addEventListener('click', () => {
          resetAll();
        });
        panel.querySelector('#nickname-uninstall-btn').addEventListener('click', () => {
          uninstallPlugin();
        });
        panel.querySelector('#nickname-reload-btn').addEventListener('click', () => {
          location.reload();
        });
        panel.querySelectorAll('.nickname-tag-del').forEach((del) => {
          del.addEventListener('click', () => deleteCustomTag(del.dataset.tag));
        });
        panel.querySelector('#nickname-selector').addEventListener('change', (e) => {
          settings.scanSelector = e.target.value.trim() || DEFAULTS.scanSelector;
          saveSettings(settings);
          refreshAll();
          openEditPanel();
        });
        panel.querySelector('#nickname-pattern').addEventListener('change', (e) => {
          const val = e.target.value.trim();
          try {
            new RegExp(val);
            settings.namePattern = val || DEFAULTS.namePattern;
          } catch (err) {
            alert('正则无效，已保留原值');
            settings.namePattern = DEFAULTS.namePattern;
          }
          saveSettings(settings);
          openEditPanel();
        });
        panel.querySelector('#nickname-adv-reset-btn').addEventListener('click', () => {
          settings.scanSelector = DEFAULTS.scanSelector;
          settings.namePattern = DEFAULTS.namePattern;
          saveSettings(settings);
          refreshAll();
          openEditPanel();
        });
        panel.querySelector('#nickname-search').addEventListener('input', (e) => {
          const v = e.target.value;
          clearTimeout(searchTimer);
          searchTimer = setTimeout(() => renderList(v), 120);
        });
        panel.querySelector('#nickname-export-btn').addEventListener('click', () => {
          const data = JSON.stringify(getNicknames(), null, 2);
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'plugin-nicknames.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        });
        panel.querySelector('#nickname-import-btn').addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json';
          input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              try {
                const data = JSON.parse(ev.target.result);
                saveNicknames(data);
                refreshAll();
                alert('导入成功！');
                openEditPanel();
              } catch (err) {
                alert('导入失败：文件格式不正确');
              }
            };
            reader.readAsText(file);
          };
          input.click();
        });

        renderList();
        document.body.appendChild(panel);
        const searchInput = panel.querySelector('#nickname-search');
        if (searchInput) searchInput.focus();
        escHandler = (e) => {
          if (e.key === 'Escape' && document.getElementById('nickname-edit-panel')) {
            closeEditPanel();
          }
        };
        document.addEventListener('keydown', escHandler);
        setTimeout(() => {
          if (!document.getElementById('nickname-edit-panel')) return;
          outsideClickHandler = (e) => {
            if (!panel.contains(e.target) && e.target.id !== 'nickname-float-btn') {
              closeEditPanel();
            }
          };
          document.addEventListener('click', outsideClickHandler);
        }, 100);
      }

      let mutationTimer = null;
      observer = new MutationObserver(() => {
        clearTimeout(mutationTimer);
        mutationTimer = setTimeout(() => {
          replaceNicknames();
          if (!document.getElementById('nickname-float-btn')) {
            createFloatingButton();
          }
          // 丢弃本插件自身写入引发的变更记录，避免无谓的二次全量扫描
          if (observer) observer.takeRecords();
        }, 300);
      });
      observer.observe(document.body, { childList: true, subtree: true });

      function bootstrap() {
        replaceNicknames();
        initShortcut();
        createFloatingButton();
        refreshInstallHint();
      }

      bootstrap();
      // 页面尚未渲染出插件列表时连续重试（最多约 2 秒），不再固定空等 1 秒
      let bootTries = 0;
      initTimer = setInterval(() => {
        bootTries += 1;
        bootstrap();
        if (bootTries >= 10) {
          clearInterval(initTimer);
          initTimer = null;
        }
      }, 200);

      window.__setPluginNickname = saveNickname;
      return () => {
        // 多次清扫：宿主可能在 dispose 之后才补渲染出残留 UI
        [0, 200, 600].forEach((delay) => setTimeout(removeSessionUI, delay));
        if (window.__nicknameTimer) clearTimeout(window.__nicknameTimer);
        if (initTimer) {
          clearInterval(initTimer);
          clearTimeout(initTimer);
          initTimer = null;
        }
        if (mutationTimer) clearTimeout(mutationTimer);
        if (observer) observer.disconnect();
        if (shortcutHandler) {
          document.removeEventListener('keydown', shortcutHandler);
        }
        if (mouseMoveHandler) {
          document.removeEventListener('mousemove', mouseMoveHandler);
        }
        if (mouseUpHandler) {
          document.removeEventListener('mouseup', mouseUpHandler);
        }
        if (outsideClickHandler) {
          document.removeEventListener('click', outsideClickHandler);
        }
        if (escHandler) {
          document.removeEventListener('keydown', escHandler);
        }
        if (searchTimer) clearTimeout(searchTimer);
        const floatBtn = document.getElementById('nickname-float-btn');
        if (floatBtn) floatBtn.remove();
        const panel = document.getElementById('nickname-edit-panel');
        if (panel) panel.remove();
        if (styleEl) styleEl.remove();
        document.querySelectorAll('[data-nickname-processed]').forEach((el) => {
          el.textContent = el.dataset.originalText || el.dataset.originalName || '';
          delete el.dataset.nicknameProcessed;
          delete el.dataset.originalName;
          delete el.dataset.originalText;
          el.title = '';
        });
        delete window.__setPluginNickname;
        delete window.__nicknameTimer;
      };
    }
  };
  return plugin;
}
};

if (window.__ModuleLoader__ && typeof window.__ModuleLoader__.load === 'function') {
  window.__ModuleLoader__.load(NICKNAME_DEF);
} else if (!window.__nicknameAutoBooted) {
  // 没有模块加载器时（dsh web 版等）自行启动，DOM 就绪即可生效
  window.__nicknameAutoBooted = true;
  const start = () => {
    try {
      window.__nicknameDispose = NICKNAME_DEF.factory().apply({});
    } catch (e) {
      console.warn('[plugin-nickname] auto boot failed', e);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
})();
