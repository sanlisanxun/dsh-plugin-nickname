// 真实浏览器验证：用 Chromium 加载 tests/harness/index.html，断言备注替换与结构完好。
// 找不到本机 Chromium 时会打印 SKIP 并以 0 退出，不阻塞 npm test。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const roots = [
    join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
    join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application'),
  ].filter((p) => p && existsSync(p));
  for (const root of roots) {
    for (const dir of readdirSync(root)) {
      for (const rel of [
        join(root, dir, 'chrome-win64', 'chrome.exe'),
        join(root, dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
        join(root, dir, 'chrome.exe'),
      ]) {
        if (existsSync(rel)) return rel;
      }
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname === '/' ? '/tests/harness/index.html' : url.pathname;
  try {
    const body = await readFile(join(ROOT, decodeURIComponent(path)));
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const results = [];
const ok = (name, cond, extra) => {
  results.push([name, !!cond, extra]);
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !extra ? '' : '  -> ' + extra}`);
};

function loadDOM(query) {
  return new Promise((res, rej) => {
    const p = spawn(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server',
      '--virtual-time-budget=6000', '--no-first-run', '--no-default-browser-check',
      '--dump-dom', `http://127.0.0.1:${PORT}/?${query}`,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    let buf = '';
    p.stdout.on('data', (d) => (buf += d));
    p.on('error', rej);
    p.on('close', () => res(buf));
  });
}

const chrome = findChrome();
if (!chrome) {
  console.log('  SKIP  未找到本机 Chromium，跳过真实浏览器验证（可设 CHROME_PATH 指定）');
  process.exit(0);
}

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
try {
  // 默认：不分组的替换与结构断言
  const out = await loadDOM('open=1');
  const titles = [...out.matchAll(/class="cardTitle cardOpen"[^>]*>([^<]*)/g)].map((m) => m[1]);
  const dom = out.replace(/<script[\s\S]*?<\/script>/g, ''); // 去掉脚本源码里的模板字面量

  ok('真实浏览器：第三方包名已替换为备注', titles.includes('用量计费面板') && titles.includes('任务看板'), titles.join(' | '));
  ok('真实浏览器：「显示名 (包名)」已替换', titles.includes('上下文管理') && titles.includes('费用计量'), titles.join(' | '));
  ok('真实浏览器：无备注的插件保持原名', titles.includes('dsh-plugin-nickname'));
  ok('真实浏览器：标题按钮未被破坏', (out.match(/class="cardTitle cardOpen"/g) || []).length === 8);
  ok('真实浏览器：图标/描述未丢', (dom.match(/class="cardIcon"/g) || []).length === 7 && (dom.match(/class="cardDesc"/g) || []).length === 7);
  ok('真实浏览器：官方插件保持原名', titles.includes('@deepseek-ai/dsh-ui-theme'), titles.join(' | '));
  ok('真实浏览器：编辑面板已渲染', /id="nickname-edit-panel"/.test(out));
  ok('真实浏览器：面板标签显示包名而非备注', /@kenz1117\/dsh-ui-usage-billing<\//.test(out));
  ok('真实浏览器：官方条目输入框被禁用', /data-pkg="@deepseek-ai\/dsh-ui-theme"[^>]*disabled/.test(out));

  // 分组：两个分组都存在且默认展开
  const grouped = await loadDOM('group=hasNickname&open=1');
  const groupHeaders = [...grouped.matchAll(/class="nickname-group-header"[^>]*data-group="([^"]*)"/g)].map((m) => m[1]);
  ok('真实浏览器：分组渲染出两个分组', groupHeaders.length === 2, groupHeaders.join(' | '));
  ok('真实浏览器：分组默认全部展开', (grouped.match(/class="nickname-group-body" style="display: none;"/g) || []).length === 0);

  // 折叠：自动折叠「已修改备注的插件」后，该分组内容隐藏、指示符变 ▸，另一分组仍可见
  const collapsed = await loadDOM('group=hasNickname&open=1&collapse=' + encodeURIComponent('已修改备注的插件'));
  ok('真实浏览器：折叠后该分组内容隐藏', /class="nickname-group-body" style="display: none;"/.test(collapsed));
  ok('真实浏览器：折叠指示符变为 ▸', /data-group="已修改备注的插件"[^>]*><span class="nickname-group-toggle"[^>]*>▸<\/span>/.test(collapsed));
  ok('真实浏览器：仅被折叠的分组隐藏（另一分组仍可见）', (collapsed.match(/class="nickname-group-body" style="display: none;"/g) || []).length === 1);

  // 标签分组：固定分类 官方/已修改/未修改 必现，且预置的自定义标签也成组
  const tagged = await loadDOM('tags=1&open=1');
  const tagGroups = [...tagged.matchAll(/class="nickname-group-header"[^>]*data-group="([^"]*)"/g)].map((m) => m[1]);
  ok('真实浏览器：标签分组含固定分类 官方/已修改/未修改', ['官方', '已修改', '未修改'].every((g) => tagGroups.includes(g)), tagGroups.join(' | '));
  ok('真实浏览器：预置自定义标签也生成分组', tagGroups.includes('我的标签'), tagGroups.join(' | '));
  // 取「我的标签」分组（到下一个分组或正文结束）这一段，确认被打标的插件落在其中
  const tagSeg = tagged.match(/data-group="我的标签"[\s\S]*?(?=data-group="|<\/body>)/);
  ok('真实浏览器：自定义标签分组包含被打标的插件', !!tagSeg && /data-pkg="@kenz1117\/dsh-ui-usage-billing"/.test(tagSeg[0]), tagSeg ? '含' : '无分组');
  ok('真实浏览器：插件条目内显示固定标签 chip', /class="nickname-tag tag-fixed"[^>]*>官方<\/span>/.test(tagged));
  ok('真实浏览器：高级区列出自定义标签且可删除', /id="nickname-tag-manager"[\s\S]*?class="nickname-tag-del" data-tag="我的标签"/.test(tagged));
} finally {
  server.close();
}

const failed = results.filter(([, c]) => !c).length;
console.log(`\n结果: ${results.length - failed} 通过 / ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
