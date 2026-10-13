const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FILE = process.argv[2];
const code = fs.readFileSync(FILE, 'utf8');

function makeDom(nicknames) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="app">` +
      `<div class="card"><div class="pname">dsh.plugin-manager</div></div>` +
      `<div class="card"><div class="pname">@scope/my-tool</div></div>` +
      `<div class="card"><div class="pname">dsh.plain-plugin</div></div>` +
      `<div class="card"><div class="pname">一段普通中文说明</div></div>` +
      `</div></body></html>`,
    { runScripts: 'outside-only', url: 'https://localhost/' }
  );
  const w = dom.window;
  w.confirm = () => true;
  w.alert = () => {};
  w.localStorage.setItem('dsh_plugin_nicknames', JSON.stringify(nicknames));
  let plugin = null;
  w.__ModuleLoader__ = { load: (def) => { plugin = def.factory(); } };
  w.eval(code);
  return { dom, w, plugin };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

(async () => {
  // T1: 基础替换 + 原名留存
  {
    const { w, plugin } = makeDom({ 'dsh.plain-plugin': '普通插件', '@scope/my-tool': '我的工具' });
    const dispose = plugin.apply({});
    await sleep(1200);
    const names = [...w.document.querySelectorAll('.pname')].map((e) => e.textContent);
    ok('T1 备注替换生效', names.includes('普通插件') && names.includes('我的工具'), names.join(' | '));
    const marked = w.document.querySelector('[data-original-name="dsh.plain-plugin"]');
    ok('T1 记录 data-original-name', !!marked);
    ok('T1 悬停 title 为原名', marked && marked.title === '原名: dsh.plain-plugin', marked && marked.title);
    ok('T1 未备注项保持原样', names.includes('dsh.plugin-manager') && names.includes('一段普通中文说明'));
    dispose();
  }

  // T2: 前缀冲突，长包名优先
  {
    const { w, plugin } = makeDom({ 'dsh.plugin': '短的', 'dsh.plugin-manager': '插件管理器' });
    const dispose = plugin.apply({});
    await sleep(1200);
    const el = [...w.document.querySelectorAll('.pname')].find((e) => e.dataset.originalName);
    ok('T2 长包名优先匹配', el && el.dataset.originalName === 'dsh.plugin-manager', el && el.dataset.originalName);
    ok('T2 替换结果为长包名的备注', el && el.textContent === '插件管理器', el && el.textContent);
    dispose();
  }

  // T3: 浮动按钮 toggle；重置后面板仍打开
  {
    const { w, plugin } = makeDom({ 'dsh.plain-plugin': '普通插件' });
    const dispose = plugin.apply({});
    await sleep(1200);
    const btn = w.document.getElementById('nickname-float-btn');
    ok('T3 浮动按钮已创建', !!btn);
    btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('T3 点击打开面板', !!w.document.getElementById('nickname-edit-panel'));
    btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('T3 再次点击关闭面板', !w.document.getElementById('nickname-edit-panel'));
    btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    w.document.getElementById('nickname-reset-btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const panel = w.document.getElementById('nickname-edit-panel');
    ok('T3 重置后面板仍然打开（不被误关）', !!panel);
    ok('T3 重置后备注已清空', panel && w.localStorage.getItem('dsh_plugin_nicknames') === null);
    dispose();
  }

  // T4: 备注名含 HTML 特殊字符时不破坏结构
  {
    const evil = '"><img src=x onerror=alert(1)>';
    const { w, plugin } = makeDom({ 'dsh.plain-plugin': evil });
    const dispose = plugin.apply({});
    await sleep(1200);
    w.document.getElementById('nickname-float-btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const panel = w.document.getElementById('nickname-edit-panel');
    const input = panel && panel.querySelector('.nickname-input[data-pkg=\'dsh.plain-plugin\']');
    ok('T4 未注入 img 元素', panel && panel.querySelectorAll('img').length === 0);
    ok('T4 input value 原样保留', input && input.value === evil, input && input.value);
    ok('T4 data-pkg 未被截断', input && input.dataset.pkg === 'dsh.plain-plugin', input && input.dataset.pkg);
    dispose();
  }

  // T5: 反复开关面板不残留 style 标签
  {
    const { w, plugin } = makeDom({ 'dsh.plain-plugin': '普通插件' });
    const dispose = plugin.apply({});
    await sleep(1200);
    const btn = w.document.getElementById('nickname-float-btn');
    for (let i = 0; i < 6; i++) btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const styles = w.document.head.querySelectorAll('style').length;
    ok('T5 head 中 style 不超过 1 个', styles <= 1, '实际 ' + styles);
    dispose();
  }

  // T6: dispose 清理彻底
  {
    const { w, plugin } = makeDom({ 'dsh.plain-plugin': '普通插件' });
    const dispose = plugin.apply({});
    await sleep(1200);
    w.document.getElementById('nickname-float-btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    dispose();
    ok('T6 浮动按钮已移除', !w.document.getElementById('nickname-float-btn'));
    ok('T6 面板已移除', !w.document.getElementById('nickname-edit-panel'));
    ok('T6 style 已移除', w.document.head.querySelectorAll('style').length === 0);
    ok('T6 原名已恢复', [...w.document.querySelectorAll('.pname')].some((e) => e.textContent === 'dsh.plain-plugin'));
    ok('T6 无 data-nickname-processed 残留', w.document.querySelectorAll('[data-nickname-processed]').length === 0);
    ok('T6 全局变量已清理', w.__setPluginNickname === undefined);
  }

  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
