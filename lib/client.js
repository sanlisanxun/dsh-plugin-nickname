// lib/client.js
window.__ModuleLoader__.load({
  id: 'dsh-plugin-nickname',
  factory: () => {
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
        let styleEl = null;
        let initTimer = null;

        function getSettings() {
          try {
            const saved = localStorage.getItem('dsh_plugin_nicknames_settings');
            if (saved) {
              return { enabled: true, sortBy: 'name', groupBy: 'none', ...JSON.parse(saved) };
            }
          } catch (e) {}
          return { enabled: true, sortBy: 'name', groupBy: 'none' };
        }

        function saveSettings(settings) {
          localStorage.setItem('dsh_plugin_nicknames_settings', JSON.stringify(settings));
        }

        function getNicknames() {
          try {
            const saved = localStorage.getItem('dsh_plugin_nicknames');
            if (saved) {
              return { ...JSON.parse(saved) };
            }
          } catch (e) {}
          return {};
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

        // 只改写文本节点，避免 textContent 赋值把子元素（图标等）一起抹掉
        function setElementText(el, text) {
          if (el.children.length === 0) {
            el.textContent = text;
            return true;
          }
          for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
              node.nodeValue = text;
              return true;
            }
          }
          return false;
        }

        function saveNickname(pkgName, nickname) {
          const nicknames = getNicknames();
          if (nickname.trim() === '') {
            delete nicknames[pkgName];
          } else {
            nicknames[pkgName] = nickname;
          }
          localStorage.setItem('dsh_plugin_nicknames', JSON.stringify(nicknames));
          refreshAll();
        }

        function resetAll() {
          if (confirm('确定要重置所有插件备注名吗？')) {
            localStorage.removeItem('dsh_plugin_nicknames');
            refreshAll();
            openEditPanel();
          }
        }

        function uninstallPlugin() {
          if (confirm('确定要卸载 dsh-plugin-nickname 插件吗？\n\n这将清除所有备注和设置，dsh 会自动刷新页面后卸载本插件。\n\n此操作不可恢复，确定继续吗？')) {
            localStorage.removeItem('dsh_plugin_nicknames');
            localStorage.removeItem('dsh_plugin_nicknames_settings');
            localStorage.removeItem('dsh_plugin_nickname_btn_pos');
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
          const entries = Object.entries(nicknames).sort((a, b) => b[0].length - a[0].length);
          if (entries.length === 0) return;
          const allElements = document.querySelectorAll('div, span, h2, h3');
          allElements.forEach((el) => {
            if (el.dataset.nicknameProcessed) return;
            const text = el.textContent.trim();
            for (const [pkgName, nickname] of entries) {
              if (text === pkgName || text.startsWith(pkgName)) {
                if (el.children.length === 0 || el.childNodes.length <= 2) {
                  if (!setElementText(el, nickname)) break;
                  el.dataset.originalName = pkgName;
                  el.dataset.nicknameProcessed = '1';
                  el.title = '原名: ' + pkgName;
                  break;
                }
              }
            }
          });
        }

        function refreshAll() {
          document.querySelectorAll('[data-nickname-processed]').forEach((el) => {
            setElementText(el, el.dataset.originalName || '');
            delete el.dataset.nicknameProcessed;
            delete el.dataset.originalName;
            el.title = '';
          });
          replaceNicknames();
        }

        function initShortcut() {
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
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>改备注`;
          let savedPos = null;
          try {
            savedPos = JSON.parse(localStorage.getItem('dsh_plugin_nickname_btn_pos'));
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
              localStorage.setItem('dsh_plugin_nickname_btn_pos', JSON.stringify({
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
          // 已被替换的元素仍可通过 data-original-name 取回包名
          document.querySelectorAll('[data-original-name]').forEach((el) => {
            const origin = el.dataset.originalName;
            if (origin) plugins.add(origin);
          });
          const allElements = document.querySelectorAll('div, span');
          allElements.forEach((el) => {
            if ((el.children.length === 0 || el.childNodes.length <= 2)) {
              const text = el.textContent.trim();
              if (/^(@?[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)?|dsh(\.[a-z-]+)+)$/.test(text) && text.length > 3) {
                plugins.add(text);
              }
            }
          });
          return Array.from(plugins);
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
        }

        function toggleEditPanel() {
          if (document.getElementById('nickname-edit-panel')) {
            closeEditPanel();
          } else {
            openEditPanel();
          }
        }

        function openEditPanel() {
          console.log('[nickname] openEditPanel called');
          // 单例：先清掉旧面板、样式与外部点击监听，避免反复开关累积残留
          closeEditPanel();
          const settings = getSettings();
          const nicknames = getNicknames();
          let plugins = scanPlugins();
          const panel = document.createElement('div');
          panel.id = 'nickname-edit-panel';
          panel.style.cssText = `position: fixed !important;right: 20px !important;top: 80px !important;z-index: 2147483647 !important;width: 360px;max-height: 600px;overflow-y: auto;background: rgba(30,30,30,0.95) !important;backdrop-filter: blur(20px);border: 1px solid rgba(255,255,255,0.1) !important;border-radius: 16px;box-shadow: 0 8px 32px rgba(0,0,0,0.4);color: #eee;font-size: 13px;animation: nicknameFadeIn 0.2s ease;`;
          styleEl = document.createElement('style');
          styleEl.textContent = `@keyframes nicknameFadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }.nickname-input:focus { outline: none !important;border-color: #4a9eff !important;box-shadow: 0 0 0 2px rgba(74,158,255,0.2) !important; }`;
          document.head.appendChild(styleEl);
          let html = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);"><div style="font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>插件备注名管理</div><div style="display: flex; gap: 6px; align-items: center;"><label style="display: flex; align-items: center; gap: 4px; font-size: 12px; color: #aaa; cursor: pointer;"><input type="checkbox" id="nickname-enabled" ${settings.enabled ? 'checked' : ''} style="margin: 0; cursor: pointer;">启用</label><button id="nickname-reset-btn" title="重置所有备注" style="font-size: 11px; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #aaa; cursor: pointer; transition: all 0.2s;">重置</button><button id="nickname-export-btn" title="导出备注" style="font-size: 11px; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #aaa; cursor: pointer; transition: all 0.2s;">导出</button><button id="nickname-import-btn" title="导入备注" style="font-size: 11px; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #aaa; cursor: pointer; transition: all 0.2s;">导入</button></div></div><div style="display: flex; gap: 8px; margin-bottom: 12px;"><select id="nickname-sort" style="flex: 1; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; font-size: 12px; cursor: pointer;"><option value="name" ${settings.sortBy === 'name' ? 'selected' : ''}>按原名称排序</option><option value="nickname" ${settings.sortBy === 'nickname' ? 'selected' : ''}>按备注名排序</option></select><select id="nickname-group" style="flex: 1; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; font-size: 12px; cursor: pointer;"><option value="none" ${settings.groupBy === 'none' ? 'selected' : ''}>不分组</option><option value="hasNickname" ${settings.groupBy === 'hasNickname' ? 'selected' : ''}>按是否有备注分组</option></select></div><input type="text" id="nickname-search" placeholder="搜索插件名称..." style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; font-size: 13px; box-sizing: border-box; margin-bottom: 16px; transition: all 0.2s;"><div id="nickname-list">`;

        function renderList(filter = '') {
          const listEl = panel.querySelector('#nickname-list');
          const filtered = plugins.filter(p => p.toLowerCase().includes(filter.toLowerCase()) || (nicknames[p] || '').includes(filter));
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
          let grouped = {};
          if (groupBy === 'hasNickname') {
            grouped['已修改备注的插件'] = filtered.filter(p => nicknames[p]);
            grouped['未修改的插件'] = filtered.filter(p => !nicknames[p]);
          } else {
            grouped['所有已安装插件'] = filtered;
          }
          let html = '';
          Object.entries(grouped).forEach(([groupName, groupPlugins]) => {
            if (groupPlugins.length === 0) return;
            html += `<div style="margin-bottom: 16px;"><div style="font-size: 12px; font-weight: 600; color: #888; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05);">${groupName} (${groupPlugins.length})</div>`;
            groupPlugins.forEach((pkgName) => {
              const currentNick = nicknames[pkgName] || '';
              html += `<div style="margin-bottom: 10px; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.03);"><div style="color: #888; font-size: 11px; margin-bottom: 6px; word-break: break-all;">${escapeHtml(pkgName)}</div><input type="text" value="${escapeHtml(currentNick)}" data-pkg="${escapeHtml(pkgName)}" class="nickname-input" style="width: 100%; padding: 7px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: #fff; font-size: 13px; box-sizing: border-box; transition: all 0.2s;" placeholder="输入中文备注名，留空恢复原名"></div>`;
            });
            html += `</div>`;
          });
          if (filtered.length === 0) {
            html = `<div style="color: #666; text-align: center; padding: 30px;">未找到匹配的插件</div>`;
          }
          listEl.innerHTML = html;
          panel.querySelectorAll('.nickname-input').forEach((input) => {
            input.addEventListener('change', (e) => {
              const pkg = e.target.dataset.pkg;
              const val = e.target.value.trim();
              saveNickname(pkg, val);
              nicknames[pkg] = val;
            });
          });
        }

        html += `</div><div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);"><button id="nickname-uninstall-btn" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,100,100,0.3); background: rgba(255,100,100,0.1); color: #f66b6b; cursor: pointer; font-size: 12px; transition: all 0.2s;">清除数据并卸载本插件</button></div>`;
        panel.innerHTML = html;

        panel.querySelector('#nickname-enabled').addEventListener('change', (e) => {
          settings.enabled = e.target.checked;
          saveSettings(settings);
          refreshAll();
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
        panel.querySelector('#nickname-search').addEventListener('input', (e) => {
          renderList(e.target.value);
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
                localStorage.setItem('dsh_plugin_nicknames', JSON.stringify(data));
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
        console.log('[nickname] panel appended, found', plugins.length, 'plugins');
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

      initTimer = setTimeout(() => {
        replaceNicknames();
        initShortcut();
        createFloatingButton();
      }, 1000);

      window.__setPluginNickname = saveNickname;
      console.log('plugin-nickname client loaded');

      return () => {
        console.log('[plugin-nickname] disposing...');
        if (window.__nicknameTimer) clearTimeout(window.__nicknameTimer);
        if (initTimer) clearTimeout(initTimer);
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
        const floatBtn = document.getElementById('nickname-float-btn');
        if (floatBtn) floatBtn.remove();
        const panel = document.getElementById('nickname-edit-panel');
        if (panel) panel.remove();
        if (styleEl) styleEl.remove();
        document.querySelectorAll('[data-nickname-processed]').forEach((el) => {
          el.textContent = el.dataset.originalName;
          delete el.dataset.nicknameProcessed;
          delete el.dataset.originalName;
          el.title = '';
        });
        delete window.__setPluginNickname;
        delete window.__nicknameTimer;
        console.log('[plugin-nickname] disposed successfully');
      };
    }
  };
  return plugin;
}
});
