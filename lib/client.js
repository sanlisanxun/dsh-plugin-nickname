// lib/client.js — 插件备注客户端
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

        function getNicknames() {
          try {
            const saved = localStorage.getItem('dsh_plugin_nicknames');
            if (saved) {
              return { ...JSON.parse(saved) };
            }
          } catch (e) {}
          return {};
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

        function replaceNicknames() {
          const nicknames = getNicknames();
          const allElements = document.querySelectorAll('div, span, h2, h3');

          allElements.forEach((el) => {
            if (el.dataset.nicknameProcessed) return;
            const text = el.textContent.trim();

            for (const [pkgName, nickname] of Object.entries(nicknames)) {
              if (text === pkgName || text.startsWith(pkgName)) {
                if (el.children.length === 0 || el.childNodes.length <= 2) {
                  el.textContent = nickname;
                  el.dataset.originalName = pkgName;
                  el.dataset.nicknameProcessed = '1';
                  el.title = `原名: ${pkgName}`;
                  break;
                }
              }
            }
          });
        }

        function refreshAll() {
          document.querySelectorAll('[data-nickname-processed]').forEach((el) => {
            el.textContent = el.dataset.originalName;
            delete el.dataset.nicknameProcessed;
            delete el.dataset.originalName;
            el.title = '';
          });
          replaceNicknames();
        }

        // 用快捷键打开/关闭面板：Ctrl+Shift+N
        function initShortcut() {
          shortcutHandler = (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'N') {
              e.preventDefault();
              openEditPanel();
            }
          };
          document.addEventListener('keydown', shortcutHandler);
        }

        // 同时也加一个小按钮在左下角，快捷键不好使就点按钮
        function createFloatingButton() {
          // 先检查有没有了，避免重复创建
          if (document.getElementById('nickname-float-btn')) return;
          
          const btn = document.createElement('button');
          btn.id = 'nickname-float-btn';
          btn.textContent = '📝 备注';
          btn.style.cssText = `
            position: fixed !important;
            left: 20px !important;
            bottom: 120px !important;
            z-index: 2147483647 !important;
            padding: 8px 14px !important;
            border-radius: 20px !important;
            border: 1px solid #555 !important;
            background: #333 !important;
            color: #fff !important;
            font-size: 12px !important;
            cursor: pointer !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
          `;
          btn.onclick = openEditPanel;
          document.body.appendChild(btn);
        }

        // 扫描当前页面上的所有插件
        function scanPlugins() {
          const nicknames = getNicknames();
          const plugins = new Set();

          // 先加上用户已经设置过的
          Object.keys(nicknames).forEach(p => plugins.add(p));

          // 再扫描页面上的插件列表
          const allElements = document.querySelectorAll('div, span');
          allElements.forEach((el) => {
            if (el.children.length === 0 || el.childNodes.length <= 2) {
              const text = el.textContent.trim();
              // 看起来像包名的：dsh-xxx 或者 @xxx/yyy 或者 dsh.xxx
              if (/^(@?[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)?|dsh\.[a-z-]+)$/.test(text) && text.length > 3) {
                plugins.add(text);
              }
            }
          });

          return Array.from(plugins).sort();
        }

        function openEditPanel() {
          console.log('[nickname] openEditPanel called');
          const existing = document.getElementById('nickname-edit-panel');
          if (existing) {
            existing.remove();
            return;
          }

          const nicknames = getNicknames();
          let plugins = scanPlugins(); // 自动扫描所有插件
          
          const panel = document.createElement('div');
          panel.id = 'nickname-edit-panel';
          panel.style.cssText = `
            position: fixed !important;
            right: 20px !important;
            top: 80px !important;
            z-index: 2147483647 !important;
            width: 340px;
            max-height: 600px;
            overflow-y: auto;
            background: #1e1e1e !important;
            border: 1px solid #555 !important;
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            color: #eee;
            font-size: 13px;
          `;

          let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="font-weight: 600; font-size: 14px;">插件备注名设置</div>
              <div style="display: flex; gap: 8px;">
                <button id="nickname-export-btn" style="font-size: 11px; padding: 4px 8px; border-radius: 4px; border: 1px solid #555; background: #2a2a2a; color: #ccc; cursor: pointer;">导出</button>
                <button id="nickname-import-btn" style="font-size: 11px; padding: 4px 8px; border-radius: 4px; border: 1px solid #555; background: #2a2a2a; color: #ccc; cursor: pointer;">导入</button>
              </div>
            </div>
            <input type="text" id="nickname-search" placeholder="搜索插件..." style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid #444; background: #2a2a2a; color: #fff; font-size: 13px; box-sizing: border-box; margin-bottom: 12px;">
            <div id="nickname-list">
          `;

          function renderList(filter = '') {
            const listEl = panel.querySelector('#nickname-list');
            const filtered = plugins.filter(p => p.toLowerCase().includes(filter.toLowerCase()) || (nicknames[p] || '').includes(filter));
            
            let html = '';
            filtered.forEach((pkgName) => {
              const currentNick = nicknames[pkgName] || '';
              html += `
                <div style="margin-bottom: 10px;">
                  <div style="color: #888; font-size: 11px; margin-bottom: 4px; word-break: break-all;">${pkgName}</div>
                  <input type="text" value="${currentNick}" data-pkg="${pkgName}"
                    class="nickname-input"
                    style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid #444;
                           background: #2a2a2a; color: #fff; font-size: 13px; box-sizing: border-box;"
                    placeholder="输入中文备注（留空显示原名）">
                </div>
              `;
            });
            
            if (filtered.length === 0) {
              html = '<div style="color: #666; text-align: center; padding: 20px;">没有匹配的插件</div>';
            }
            
            listEl.innerHTML = html;
            
            // 重新绑定事件
            panel.querySelectorAll('.nickname-input').forEach((input) => {
              input.addEventListener('change', (e) => {
                const pkg = e.target.dataset.pkg;
                const val = e.target.value.trim();
                saveNickname(pkg, val);
                nicknames[pkg] = val;
              });
            });
          }

          html += `</div>`;
          panel.innerHTML = html;

          // 搜索框事件
          panel.querySelector('#nickname-search').addEventListener('input', (e) => {
            renderList(e.target.value);
          });

          // 导出按钮
          panel.querySelector('#nickname-export-btn').addEventListener('click', () => {
            const data = JSON.stringify(getNicknames(), null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'plugin-nicknames.json';
            a.click();
            URL.revokeObjectURL(url);
          });

          // 导入按钮
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
                  openEditPanel(); // 重新打开面板刷新
                } catch (err) {
                  alert('导入失败：文件格式错误');
                }
              };
              reader.readAsText(file);
            };
            input.click();
          });

          // 初始渲染
          renderList();

          document.body.appendChild(panel);
          console.log('[nickname] panel appended, found', plugins.length, 'plugins');
          
          // 点击面板外面关闭面板
          setTimeout(() => {
            const closeOnOutsideClick = (e) => {
              if (!panel.contains(e.target) && e.target.id !== 'nickname-float-btn') {
                panel.remove();
                document.removeEventListener('click', closeOnOutsideClick);
              }
            };
            document.addEventListener('click', closeOnOutsideClick);
          }, 100);
        }

        // MutationObserver
        observer = new MutationObserver(() => {
          clearTimeout(window.__nicknameTimer);
          window.__nicknameTimer = setTimeout(() => {
            replaceNicknames();
            // 检查按钮还在不在，不在就重新加
            if (!document.getElementById('nickname-float-btn')) {
              createFloatingButton();
            }
          }, 300);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // 初始化
        setTimeout(() => {
          replaceNicknames();
          initShortcut();
          createFloatingButton();
        }, 1000);

        window.__setPluginNickname = saveNickname;
        console.log('[plugin-nickname] client loaded');

        // 卸载时清理所有资源
        return () => {
          console.log('[plugin-nickname] disposing...');
          
          // 停止 MutationObserver
          if (observer) observer.disconnect();
          
          // 移除快捷键监听
          if (shortcutHandler) {
            document.removeEventListener('keydown', shortcutHandler);
          }
          
          // 移除左下角按钮
          const floatBtn = document.getElementById('nickname-float-btn');
          if (floatBtn) floatBtn.remove();
          
          // 移除编辑面板
          const panel = document.getElementById('nickname-edit-panel');
          if (panel) panel.remove();
          
          // 把所有被替换的文字恢复成原来的英文包名
          document.querySelectorAll('[data-nickname-processed]').forEach((el) => {
            el.textContent = el.dataset.originalName;
            delete el.dataset.nicknameProcessed;
            delete el.dataset.originalName;
            el.title = '';
          });
          
          console.log('[plugin-nickname] disposed successfully');
        };
      }
    };

    return plugin;
  }
});
