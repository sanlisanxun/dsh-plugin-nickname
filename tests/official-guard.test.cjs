// 官方插件（@deepseek-ai/* 与 dsh 内置 bundle）默认不可改名
const fs = require('fs');
const { JSDOM } = require('jsdom');

const FILE = process.argv[2];
const code = fs.readFileSync(FILE, 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CARD = (pkg, title, desc) => `
<li data-plugin-package="${pkg}">
  <div class="cardHead">
    <span class="cardIcon" aria-hidden="true"></span>
    <div class="cardMain">
      <div class="titleRow"><button type="button" class="cardTitle cardOpen">${title}</button></div>
      <span class="cardDesc">${desc}</span>
    </div>
    <div class="cardEnd"></div>
  </div>
</li>`;

function makeDom(settings) {
  const dom = new JSDOM(
    `<!doctype html><html><body><ul class="cards">` +
      CARD('@deepseek-ai/dsh-ui-theme', '@deepseek-ai/dsh-ui-theme', 'Official theme plugin') +
      CARD('@deepseek-ai/dsh-base', '@deepseek-ai/dsh-base', 'Official base bundle') +
      CARD('@kenz1117/dsh-ui-usage-billing', '@kenz1117/dsh-ui-usage-billing', 'Usage billing') +
      CARD('dsh-context', '上下文 (dsh-context)', '上下文洞察与管理插件') +
      `</ul></body></html>`,
    { runScripts: 'outside-only', url: 'https://localhost/' }
  );
  const w = dom.window;
  w.confirm = () => true;
  w.alert = () => {};
  w.localStorage.setItem('dsh_plugin_nicknames', JSON.stringify({
    '@deepseek-ai/dsh-ui-theme': '官方主题',
    '@deepseek-ai/dsh-base': '官方底座',
    '@kenz1117/dsh-ui-usage-billing': '用量计费面板',
    'dsh-context': '上下文管理'
  }));
  if (settings) w.localStorage.setItem('dsh_plugin_nicknames_settings', JSON.stringify(settings));
  let plugin = null;
  w.__ModuleLoader__ = { load: (def) => { plugin = def.factory(); } };
  w.eval(code);
  return { w, plugin };
}

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};
const titleOf = (w, pkg) =>
  w.document.querySelector(`[data-plugin-package="${pkg}"] button.cardTitle`).textContent;

(async () => {
  // 默认屏蔽
  {
    const { w, plugin } = makeDom(null);
    const dispose = plugin.apply({});
    await sleep(1300);
    ok('默认：官方插件不被改名', titleOf(w, '@deepseek-ai/dsh-ui-theme') === '@deepseek-ai/dsh-ui-theme',
       titleOf(w, '@deepseek-ai/dsh-ui-theme'));
    ok('默认：内置 bundle 不被改名', titleOf(w, '@deepseek-ai/dsh-base') === '@deepseek-ai/dsh-base',
       titleOf(w, '@deepseek-ai/dsh-base'));
    ok('默认：第三方仍正常改名', titleOf(w, '@kenz1117/dsh-ui-usage-billing') === '用量计费面板',
       titleOf(w, '@kenz1117/dsh-ui-usage-billing'));
    ok('默认：第三方内置名（显示名(包名)）仍正常', titleOf(w, 'dsh-context') === '上下文管理',
       titleOf(w, 'dsh-context'));

    // 面板里官方条目应只读
    w.document.getElementById('nickname-float-btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const panel = w.document.getElementById('nickname-edit-panel');
    const officialInput = panel.querySelector('.nickname-input[data-pkg="@deepseek-ai/dsh-ui-theme"]');
    const normalInput = panel.querySelector('.nickname-input[data-pkg="@kenz1117/dsh-ui-usage-billing"]');
    ok('面板：官方条目输入框被禁用', officialInput && officialInput.disabled === true);
    ok('面板：第三方条目输入框可编辑', normalInput && normalInput.disabled === false);
    ok('面板：官方条目有官方标记', panel.innerHTML.includes('>官方</span>'));
    ok('面板：存在「改官方」开关', !!panel.querySelector('#nickname-official'));
    ok('面板：「改官方」默认未勾选', panel.querySelector('#nickname-official').checked === false);

    // 强行保存官方备注应无效
    w.__setPluginNickname('@deepseek-ai/dsh-ui-theme', '强行改名');
    ok('保存：官方插件的备注写不进去', titleOf(w, '@deepseek-ai/dsh-ui-theme') === '@deepseek-ai/dsh-ui-theme');
    dispose();
  }

  // 打开开关后允许
  {
    const { w, plugin } = makeDom({ allowOfficial: true });
    const dispose = plugin.apply({});
    await sleep(1300);
    ok('允许官方：官方插件可被改名', titleOf(w, '@deepseek-ai/dsh-ui-theme') === '官方主题',
       titleOf(w, '@deepseek-ai/dsh-ui-theme'));
    ok('允许官方：内置 bundle 可被改名', titleOf(w, '@deepseek-ai/dsh-base') === '官方底座',
       titleOf(w, '@deepseek-ai/dsh-base'));
    ok('允许官方：第三方不受影响', titleOf(w, '@kenz1117/dsh-ui-usage-billing') === '用量计费面板');
    w.document.getElementById('nickname-float-btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const panel = w.document.getElementById('nickname-edit-panel');
    const officialInput = panel.querySelector('.nickname-input[data-pkg="@deepseek-ai/dsh-ui-theme"]');
    ok('允许官方：官方条目输入框恢复可编辑', officialInput && officialInput.disabled === false);
    ok('允许官方：「改官方」开关为勾选', panel.querySelector('#nickname-official').checked === true);
    dispose();
  }

  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
