import io

p = 'lib/client.js'
s = io.open(p, encoding='utf-8').read()


def rep(old, new, name):
    global s
    assert old in s, 'MISS: ' + name
    cnt = s.count(old)
    assert cnt == 1, 'NOT UNIQUE (%d): %s' % (cnt, name)
    s = s.replace(old, new, 1)


# 1) DEFAULTS 增加 tags
old1 = """      allowOfficial: false,
      groupCollapsed: {}"""
new1 = """      allowOfficial: false,
      groupCollapsed: {},
      tags: { custom: [], assignments: {} }"""
rep(old1, new1, 'defaults tags')

# 2) 标签相关 helper，插在 renderList 之前
helpers = r'''
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

'''
rep('        function renderList(filter = \'\') {', helpers + '        function renderList(filter = \'\') {', 'helpers before renderList')

# 3) 分组 select 增加「按标签分组」
old3 = '<option value="hasNickname" ${settings.groupBy === \'hasNickname\' ? \'selected\' : \'\'}>按是否有备注分组</option>'
new3 = old3 + '<option value="tags" ${settings.groupBy === \'tags\' ? \'selected\' : \'\'}>按标签分组</option>'
rep(old3, new3, 'group select tags option')

# 4) 搜索过滤增加标签匹配
old4 = "          const filtered = plugins.filter(p => p.toLowerCase().includes(filter.toLowerCase()) || (nicknames[p] || '').includes(filter));"
new4 = """          const q = filter.toLowerCase();
          const filtered = plugins.filter((p) => {
            if (p.toLowerCase().includes(q)) return true;
            if ((nicknames[p] || '').toLowerCase().includes(q)) return true;
            if (fixedTagsOf(p).some((t) => t.toLowerCase().includes(q))) return true;
            if (customTagsOf(p).some((t) => t.toLowerCase().includes(q))) return true;
            return false;
          });"""
rep(old4, new4, 'filter with tags')

# 5) grouped 增加 tags 分支
old5 = """          let grouped = {};
          if (groupBy === 'hasNickname') {
            grouped['已修改备注的插件'] = filtered.filter(p => nicknames[p]);
            grouped['未修改的插件'] = filtered.filter(p => !nicknames[p]);
          } else {
            grouped['所有已安装插件'] = filtered;
          }"""
new5 = """          const tagsCustom = getTags().custom;
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
          }"""
rep(old5, new5, 'grouped tags branch')

# 6) 插件条目增加标签行
old6 = """            const official = !settings.allowOfficial && isOfficialPackage(pkgName);
              html += `<div style="margin-bottom: 10px; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.03);"><div style="color: #888; font-size: 11px; margin-bottom: 6px; word-break: break-all;">${escapeHtml(pkgName)}${official ? ' <span style="display: inline-block; padding: 1px 6px; border-radius: 4px; background: rgba(120,170,255,0.15); color: #8ab4ff; font-size: 10px;">官方</span>' : ''}</div><input type="text" value="${escapeHtml(currentNick)}" data-pkg="${escapeHtml(pkgName)}" class="nickname-input"${official ? ' disabled' : ''} style="width: 100%; padding: 7px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: ${official ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.2)'}; color: ${official ? '#777' : '#fff'}; font-size: 13px; box-sizing: border-box; transition: all 0.2s;" placeholder="${official ? '官方插件，默认不可改名' : '输入中文备注名，留空恢复原名'}" style="margin-top: 0;"></div>`;"""
new6 = """            const official = !settings.allowOfficial && isOfficialPackage(pkgName);
              const fixed = fixedTagsOf(pkgName);
              const custom = customTagsOf(pkgName);
              const tagChips = fixed.map((t) => `<span class="nickname-tag tag-fixed" title="固定分类（自动）" style="font-size:10px;padding:1px 7px;border-radius:10px;background:rgba(120,170,255,0.12);color:#8ab4ff;border:1px solid rgba(120,170,255,0.25);user-select:none;">${escapeHtml(t)}</span>`).join('');
              const customChips = tagsCustom.map((t) => {
                const on = custom.indexOf(t) !== -1;
                return `<span class="nickname-tag tag-toggle${on ? ' on' : ''}" data-tag="${escapeHtml(t)}" title="点击切换是否打此标签" style="font-size:10px;padding:1px 7px;border-radius:10px;cursor:pointer;user-select:none;${on ? 'background:rgba(120,255,170,0.14);color:#6ee7a8;border:1px solid rgba(120,255,170,0.3);' : 'background:transparent;color:#777;border:1px dashed rgba(255,255,255,0.2);'}">${escapeHtml(t)}</span>`;
              }).join('');
              const tagsRow = `<div class="nickname-tags" data-pkg="${escapeHtml(pkgName)}" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;">${tagChips}${customChips}<span class="nickname-tag-add" title="新建标签并打给本插件" style="font-size:10px;padding:1px 7px;border-radius:10px;cursor:pointer;color:#aaa;border:1px dashed rgba(255,255,255,0.2);user-select:none;">+ 标签</span><span class="nickname-tag-new" style="display:none;"><input class="nickname-tag-input" placeholder="标签名" style="width:64px;font-size:10px;padding:1px 5px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.2);color:#fff;"><button class="nickname-tag-create" style="font-size:10px;padding:1px 6px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#ccc;cursor:pointer;margin-left:2px;">建</button></span></div>`;
              html += `<div style="margin-bottom: 10px; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.03);"><div style="color: #888; font-size: 11px; margin-bottom: 6px; word-break: break-all;">${escapeHtml(pkgName)}${official ? ' <span style="display: inline-block; padding: 1px 6px; border-radius: 4px; background: rgba(120,170,255,0.15); color: #8ab4ff; font-size: 10px;">官方</span>' : ''}</div><input type="text" value="${escapeHtml(currentNick)}" data-pkg="${escapeHtml(pkgName)}" class="nickname-input"${official ? ' disabled' : ''} style="width: 100%; padding: 7px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: ${official ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.2)'}; color: ${official ? '#777' : '#fff'}; font-size: 13px; box-sizing: border-box; transition: all 0.2s;" placeholder="${official ? '官方插件，默认不可改名' : '输入中文备注名，留空恢复原名'}" style="margin-top: 0;">${tagsRow}</div>`;"""
rep(old6, new6, 'entry tags row')

# 7) renderList 内增加标签行事件监听（在 nickname-input 监听之后）
old7 = """            });
          });
        }"""
new7 = """            });
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
        }"""
rep(old7, new7, 'tags listeners')

# 8) 高级区前插入标签管理区（computed 变量 + html + 删除监听）
old8 = "          let html = `<div style=\"display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);\">"
new8 = """          const tMgr = getTags();
          const tagManagerHtml = tMgr.custom.length === 0
            ? `<span style="font-size:11px;color:#666;">（暂无，在插件条目里点「+ 标签」新建）</span>`
            : tMgr.custom.map((name) => `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(120,255,170,0.12);color:#6ee7a8;border:1px solid rgba(120,255,170,0.3);">${escapeHtml(name)}<span class="nickname-tag-del" data-tag="${escapeHtml(name)}" style="cursor:pointer;color:#f88;margin-left:2px;">✕</span></span>`).join('');
          let html = `<div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);\">"""
rep(old8, new8, 'tag manager var+html')

old9 = '恢复默认</button></div></details><input type="text" id="nickname-search"'
new9 = '恢复默认</button></div><div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);"><div style="font-size:11px;color:#888;margin-bottom:6px;">自定义标签（固定分类 官方/已修改/未修改 不可删）</div><div id="nickname-tag-manager" style="display:flex;flex-wrap:wrap;gap:4px;">${tagManagerHtml}</div></div></details><input type="text" id="nickname-search"'
rep(old9, new9, 'tag manager html')

old10 = "        panel.querySelector('#nickname-selector').addEventListener('change', (e) => {"
new10 = """        panel.querySelectorAll('.nickname-tag-del').forEach((del) => {
          del.addEventListener('click', () => deleteCustomTag(del.dataset.tag));
        });
        panel.querySelector('#nickname-selector').addEventListener('change', (e) => {"""
rep(old10, new10, 'tag del listener')

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('patch applied')
