// 针对「已知问题」5 条的专项测试：v0.2.6 应失败，v0.2.7 应通过
const fs = require('fs');
const { JSDOM } = require('jsdom');

const FILE = process.argv[2];
const code = fs.readFileSync(FILE, 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

function baseDom(nicknames, extraBody) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="app">` +
      `<div class="card"><div class="pname">dsh.plugin-manager</div></div>` +
      `<div class="card"><div class="pname">@scope/my-tool</div></div>` +
      `<div class="card"><div class="pname">dsh.plain-plugin</div></div>` +
      (extraBody || '') +
      `</div></body></html>`,
    { runScripts: 'outside-only', url: 'https://localhost/' }
  );
  const w = dom.window;
  w.confirm = () => true;
  w.alert = () => {};
  w.localStorage.setItem('dsh_plugin_nicknames', JSON.stringify(nicknames || {}));
  return { dom, w };
}

function bootWithLoader(w) {
  let plugin = null;
  w.__ModuleLoader__ = { load: (def) => { plugin = def.factory(); } };
  w.eval(code);
  return plugin;
}

(async () => {
  // 已知问题 2：第一次加载要等 1 秒
  {
    const { w } = baseDom({ 'dsh.plain-plugin': '普通插件' });
    const plugin = bootWithLoader(w);
    const dispose = plugin.apply({});
    await sleep(150);
    ok('K2 150ms 内按钮已出现（不再空等 1 秒）', !!w.document.getElementById('nickname-float-btn'));
    const el = [...w.document.querySelectorAll('.pname')].find((e) => e.dataset.originalName);
    ok('K2 150ms 内备注已替换', !!el && el.textContent === '普通插件');
    dispose();
  }

  // 已知问题 3：DOM 结构变化 → 选择器可配置
  {
    const { w } = baseDom({ 'dsh.plain-plugin': '普通插件' });
    w.localStorage.setItem('dsh_plugin_nicknames_settings', JSON.stringify({ scanSelector: '.nonexistent' }));
    const plugin = bootWithLoader(w);
    const dispose = plugin.apply({});
    await sleep(1200);
    const el = [...w.document.querySelectorAll('.pname')].find((e) => e.dataset.originalName);
    ok('K3 自定义选择器生效（改成不匹配时不再替换）', !el, el && el.textContent);
    dispose();
  }

  // 已知问题 3：包名匹配规则可配置
  {
    const { w } = baseDom({}, `<div class="card"><div class="pname">custom.tool</div></div>`);
    w.localStorage.setItem('dsh_plugin_nicknames_settings', JSON.stringify({ namePattern: '^custom\\.tool$' }));
    const plugin = bootWithLoader(w);
    const dispose = plugin.apply({});
    await sleep(1200);
    const btn3 = w.document.getElementById('nickname-float-btn');
    if (!btn3) {
      ok('K3 自定义正则生效（默认规则匹配不到的包名被收录）', false, '浮动按钮未创建');
    } else {
      btn3.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const panel = w.document.getElementById('nickname-edit-panel');
      const pkgs = [...panel.querySelectorAll('.nickname-input')].map((i) => i.dataset.pkg);
      ok('K3 自定义正则生效（默认规则匹配不到的包名被收录）', pkgs.includes('custom.tool'), pkgs.join(' | '));
    }
    dispose();
  }

  // 已知问题 4：dispose 之后才冒出来的残留 UI 也要清掉
  {
    const { w } = baseDom({ 'dsh.plain-plugin': '普通插件' });
    const plugin = bootWithLoader(w);
    const dispose = plugin.apply({});
    await sleep(300);
    const btn = w.document.getElementById('nickname-float-btn');
    const session = btn && btn.dataset.nicknameUi;
    dispose();
    // 模拟宿主在 dispose 之后又补渲染出残留按钮
    if (session) {
      const ghost = w.document.createElement('button');
      ghost.id = 'nickname-float-btn';
      ghost.dataset.nicknameUi = session;
      w.document.body.appendChild(ghost);
    }
    await sleep(800);
    const left = w.document.getElementById('nickname-float-btn');
    ok('K4 dispose 后补渲染的残留被多轮清扫掉', !left, session ? 'session=' + session : '无会话标记（旧版）');
  }

  // 已知问题 1：没有 __ModuleLoader__ 的环境（dsh web 版）也能自举
  {
    const { w } = baseDom({ 'dsh.plain-plugin': '普通插件' });
    let bootErr = null;
    try {
      w.eval(code); // 不定义 __ModuleLoader__
    } catch (e) {
      bootErr = e.message;
    }
    ok('K1 无模块加载器时不报错', !bootErr, bootErr);
    await sleep(300);
    ok('K1 无模块加载器时自动启动', typeof w.__nicknameDispose === 'function');
    ok('K1 自动启动后按钮已创建', !!w.document.getElementById('nickname-float-btn'));
  }

  // 已知问题 1：localStorage 不可用时（隐私模式 / web 版）用内存兜底
  {
    const { w } = baseDom({});
    Object.defineProperty(w, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage blocked'); },
    });
    let plugin = null;
    let bootErr = null;
    try {
      plugin = bootWithLoader(w);
      plugin.apply({});
    } catch (e) {
      bootErr = e.message;
    }
    ok('K1 localStorage 不可用时仍能启动', !bootErr, bootErr);
    if (!bootErr) {
      await sleep(300);
      ok('K1 localStorage 不可用时按钮仍创建', !!w.document.getElementById('nickname-float-btn'));
      w.__setPluginNickname('dsh.plain-plugin', '内存兜底备注');
      const el = [...w.document.querySelectorAll('.pname')].find((e) => e.dataset.originalName);
      ok('K1 localStorage 不可用时备注仍能保存并替换', !!el && el.textContent === '内存兜底备注', el && el.textContent);
    }
  }

  // 已知问题 5：检测不到插件列表时给出刷新提示
  {
    const { w } = baseDom({}, '');
    const dom2 = new JSDOM(`<!doctype html><html><body><div>没有任何插件名文本</div></body></html>`,
      { runScripts: 'outside-only', url: 'https://localhost/' });
    const w2 = dom2.window;
    w2.confirm = () => true;
    w2.alert = () => {};
    const plugin2 = bootWithLoader(w2);
    const dispose2 = plugin2.apply({});
    await sleep(300);
    ok('K5 检测不到插件列表时出现刷新提示', !!w2.document.getElementById('nickname-install-hint'));
    dispose2();
  }

  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
