// 用 dsh 插件管理页真实的卡片 DOM 结构验证备注替换
// 结构取自 dsh-client-ui-plugin-manager/lib/client.js: CardHead (2111-2142) + PackageCard (2220-2251)
const fs = require('fs');
const { JSDOM } = require('jsdom');

const FILE = process.argv[2];
const code = fs.readFileSync(FILE, 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 每张卡片：li[data-plugin-package] > div.cardHead > (span.cardIcon, div.cardMain > div.titleRow > button.cardTitle + span.cardDesc, div.cardEnd)
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

const dom = new JSDOM(
  `<!doctype html><html><body><ul class="cards">` +
    CARD('@kenz1117/dsh-ui-usage-billing', '@kenz1117/dsh-ui-usage-billing', 'Usage billing dashboard') +
    CARD('@linxin666/dsh-client-ui-task-board', '@linxin666/dsh-client-ui-task-board', 'Host-authoritative task board') +
    CARD('dsh-context', '上下文 (dsh-context)', '上下文洞察与管理插件') +
    CARD('dsh-cost-meter', '费用计量 (dsh-cost-meter)', '费用计量：按会话统计 token 与成本') +
    CARD('dsh-plugin-simplemanager', '插件管家 (dsh-plugin-simplemanager)', '内核版本看板') +
    `</ul></body></html>`,
  { runScripts: 'outside-only', url: 'https://localhost/' }
);
const w = dom.window;
w.confirm = () => true;
w.alert = () => {};
w.localStorage.setItem('dsh_plugin_nicknames', JSON.stringify({
  '@kenz1117/dsh-ui-usage-billing': '用量计费面板',
  '@linxin666/dsh-client-ui-task-board': '任务看板',
  'dsh-context': '上下文管理',
  'dsh-cost-meter': '费用计量',
  'dsh-plugin-simplemanager': '插件管家',
}));

let plugin = null;
w.__ModuleLoader__ = { load: (def) => { plugin = def.factory(); } };
w.eval(code);

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

(async () => {
  const dispose = plugin.apply({});
  await sleep(1300);

  const btnText = (pkg) =>
    w.document.querySelector(`[data-plugin-package="${pkg}"] button.cardTitle`).textContent;
  const liText = (pkg) => w.document.querySelector(`[data-plugin-package="${pkg}"]`).textContent;

  ok('第三方包名被替换为备注', btnText('@kenz1117/dsh-ui-usage-billing') === '用量计费面板',
     btnText('@kenz1117/dsh-ui-usage-billing'));
  ok('第三方包名（第二个）被替换', btnText('@linxin666/dsh-client-ui-task-board') === '任务看板',
     btnText('@linxin666/dsh-client-ui-task-board'));
  ok('「显示名 (包名)」形式被替换', liText('dsh-context').includes('上下文管理'),
     liText('dsh-context').slice(0, 40));
  ok('标题按钮未被破坏（仍可点击）',
     w.document.querySelectorAll('[data-plugin-package] button.cardTitle').length === 5,
     '剩余 button 数 ' + w.document.querySelectorAll('[data-plugin-package] button.cardTitle').length);
  ok('卡片结构完好（图标/描述未丢）',
     !!w.document.querySelector('[data-plugin-package="dsh-context"] span.cardDesc') &&
     !!w.document.querySelector('[data-plugin-package="dsh-context"] span.cardIcon'));

  dispose();
  ok('dispose 后标题恢复原名', btnText('@kenz1117/dsh-ui-usage-billing') === '@kenz1117/dsh-ui-usage-billing',
     btnText('@kenz1117/dsh-ui-usage-billing'));

  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
