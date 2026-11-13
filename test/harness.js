/* ============================================================
   test/harness.js — 测试运行器
   在 jsdom 环境中加载应用脚本，模拟浏览器环境
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'js');

/** 按依赖顺序加载的脚本清单 */
const SCRIPTS = [
  'utils.js',
  'storage.js',
  'seed.js',
  'store.js',
  'ui.js',
  'picker.js',
  'projects.js',
  'tasks.js',
  'incidents.js',
  'timelog.js',
  'releases.js',
  'queries.js',
  'briefing.js',
  'dashboard.js',
  'rightpanel.js',
  'app.js',
];

/**
 * 创建一套干净的浏览器环境（同步返回，app.js 会自行 boot）
 * 若需等待初始化完成，请使用 createSeededEnv
 */
function createEnv(opts = {}) {
  const html = `<!DOCTYPE html><html data-theme="dark"><head></head>
  <body data-opsdesk-manual="1">
    <div id="nav"></div>
    <div id="view-root"></div>
    <div id="main-scroll"></div>
    <div id="side-stats"></div>
    <div id="save-dot"></div>
    <div id="save-text"></div>
    <div id="theme-toggle"></div>
    <div id="top-new-task"></div>
    <div id="top-new-incident"></div>
    <div id="top-new-log"></div>
    <div id="top-new-release"></div>
    <div id="top-new-query"></div>
    <div id="btn-briefing"></div>
    <div id="btn-projects"></div>
    <div id="btn-export"></div>
    <div id="btn-import"></div>
    <div id="btn-demo"></div>
    <div id="btn-purge-demo"></div>
    <div id="btn-diag"></div>
    <div id="btn-shortcuts"></div>
    <div id="storage-info"></div>
    <div id="right-output"></div>
    <div id="right-stats"></div>
    <div id="right-copy"></div>
    <div id="right-regen"></div>
    <div id="modal-host"></div>
    <div id="toast-host"></div>
  </body></html>`;

  const dom = new JSDOM(html, {
    url: 'http://localhost:5173/',
    // 不开启 pretendToBeVisual：其内部 rAF 循环会阻止 Node 测试进程退出
    pretendToBeVisual: false,
    runScripts: 'outside-only',
  });

  const win = dom.window;

  // ---- IndexedDB 模拟 ----
  // 每个环境用独立的 FDBFactory：默认的 fake-indexeddb 实例是进程级共享的，
  // 会让上一个用例写入的 IDB 副本覆盖当前用例的 localStorage，造成用例间互相污染
  const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
  const FDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
  win.indexedDB = new FDBFactory();
  win.IDBKeyRange = FDBKeyRange.IDBKeyRange || FDBKeyRange;

  // ---- 补齐 jsdom 缺失的 API ----
  win.navigator.clipboard = {
    _buf: '',
    writeText(text) {
      this._buf = text;
      return Promise.resolve();
    },
    readText() {
      return Promise.resolve(this._buf);
    },
  };
  win.URL.createObjectURL = () => 'blob:mock';
  win.URL.revokeObjectURL = () => {};
  win.HTMLElement.prototype.scrollIntoView = function () {};

  // ---- 收集定时器，测试结束时统一清理 ----
  const timers = new Set();
  const origSetInterval = win.setInterval.bind(win);
  const origSetTimeout = win.setTimeout.bind(win);
  const origClearInterval = win.clearInterval.bind(win);
  const origClearTimeout = win.clearTimeout.bind(win);
  win.setInterval = function (fn, ms) {
    const id = origSetInterval(fn, ms);
    timers.add({ id, type: 'interval' });
    return id;
  };
  win.setTimeout = function (fn, ms) {
    const id = origSetTimeout(function () {
      timers.delete(t);
      return fn.apply(this, arguments);
    }, ms);
    const t = { id, type: 'timeout' };
    timers.add(t);
    return id;
  };
  win.clearInterval = function (id) {
    for (const t of timers) if (t.id === id) timers.delete(t);
    return origClearInterval(id);
  };
  win.clearTimeout = function (id) {
    for (const t of timers) if (t.id === id) timers.delete(t);
    return origClearTimeout(id);
  };
  // jsdom 不实现 layout，所有元素 getBoundingClientRect 返回 0，
  // 这会破坏依赖尺寸的断言，这里给出稳定默认值
  win.Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 };
  };

  // ---- 加载脚本 ----
  SCRIPTS.forEach((file) => {
    const code = fs.readFileSync(path.join(SRC, file), 'utf8');
    try {
      win.eval(code);
    } catch (e) {
      throw new Error(`加载 ${file} 失败: ${e.message}\n${e.stack}`);
    }
  });

  const env = {
    dom,
    window: win,
    document: win.document,
    OpsDesk: win.OpsDesk,
    Utils: win.OpsDesk.Utils,
    Storage: win.OpsDesk.Storage,
    FileBackup: win.OpsDesk.FileBackup,
    Seed: win.OpsDesk.Seed,
    Store: win.OpsDesk.Store,
    UI: win.OpsDesk.UI,
    Picker: win.OpsDesk.Picker,
    Projects: win.OpsDesk.Projects,
    Tasks: win.OpsDesk.Tasks,
    Incidents: win.OpsDesk.Incidents,
    TimeLog: win.OpsDesk.TimeLog,
    Releases: win.OpsDesk.Releases,
    Queries: win.OpsDesk.Queries,
    Briefing: win.OpsDesk.Briefing,
    Dashboard: win.OpsDesk.Dashboard,
    /** 清理环境（IndexedDB 连接 + 定时器） */
    cleanup() {
      // app.js 注册了跨天轮询定时器，必须清除否则测试进程无法退出
      for (const t of timers) {
        try {
          if (t.type === 'interval') origClearInterval(t.id);
          else origClearTimeout(t.id);
        } catch (e) {
          /* ignore */
        }
      }
      timers.clear();
      try {
        win.close();
      } catch (e) {
        /* ignore */
      }
    },
  };

  return env;
}

/**
 * 初始化一套带演示数据的环境（需 await）
 *
 * 注意：应用启动时**不再自动灌入演示数据**（避免和真实数据混淆），
 * 所以测试环境改为显式把演示数据写进 localStorage，模拟「已载入演示数据的工作台」。
 */
async function createSeededEnv(opts = {}) {
  const env = createEnv(opts);
  const seeded = env.OpsDesk.Seed.normalize(env.OpsDesk.Seed.build());
  const at = Date.now();
  seeded.updatedAt = at;
  env.window.localStorage.setItem('opsdesk:state:v1', JSON.stringify(seeded));
  env.window.localStorage.setItem('opsdesk:meta:v1', JSON.stringify({ updatedAt: at }));
  // 受控启动 app.js（html 上带 data-opsdesk-manual="1" 故未自动 boot）
  env.OpsDesk.App.boot();
  await env.OpsDesk.App.ready;
  return env;
}

/** 读取 localStorage 中原始字符串 */
function rawLS(env, key) {
  return env.window.localStorage.getItem(key);
}

/** 等待若干毫秒（用于防抖落盘） */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 断言辅助 */
function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || '值不相等'}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

function assertDeep(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg || '结构不相等'}:\n  期望 ${e}\n  实际 ${a}`);
  }
}

function assertIncludes(haystack, needle, msg) {
  if (String(haystack).indexOf(needle) < 0) {
    throw new Error(`${msg || '未包含期望内容'}: "${needle}"\n--- 实际 ---\n${haystack}`);
  }
}

function assertNotIncludes(haystack, needle, msg) {
  if (String(haystack).indexOf(needle) >= 0) {
    throw new Error(`${msg || '不应包含该内容'}: "${needle}"\n--- 实际 ---\n${haystack}`);
  }
}

module.exports = {
  createEnv,
  createSeededEnv,
  rawLS,
  sleep,
  assert,
  assertEqual,
  assertDeep,
  assertIncludes,
  assertNotIncludes,
  SCRIPTS,
};
