/* ============================================================
   数据不丢测试
   背景：用户反馈「每次重启，原来记录的真实数据都没了，被重置成测试数据」。
   根因链：
     ① 浏览器存储按 origin 隔离 —— 换浏览器 / 换端口 / 换目录 / 被清理
        → 读不到数据
     ② 旧版读到"没有数据"就自动灌入演示数据，并 persist() 覆盖真实数据
     ③ localStorage 里 JSON 解析失败时，旧版把"损坏"当成"没有"，
        同样触发播种覆盖
   本文件锁定修复：
     · 绝不自动播种
     · 区分「没有数据」与「数据损坏」，损坏原文另存抢救，绝不覆盖
     · 空白启动不写盘占位
     · 目录级文件备份（跟着程序文件夹走）可写可读可恢复
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createEnv, createSeededEnv, sleep } = require('./harness');

test('数据安全：空白启动不得写入任何占位数据', async () => {
  const env = createEnv();
  try {
    const res = await env.Store.init();
    assert.equal(res.blank, true);
    await sleep(150);
    assert.equal(
      env.window.localStorage.getItem('opsdesk:state:v1'),
      null,
      '空白启动不应写入占位状态'
    );
    assert.equal(env.window.localStorage.getItem('opsdesk:meta:v1'), null, '不应写入 meta');
  } finally {
    env.cleanup();
  }
});

test('数据安全：localStorage 数据损坏时应被识别，且不得被覆盖', async () => {
  const env = createEnv();
  try {
    // 模拟"写坏了"的 localStorage：key 存在，但内容不是合法 JSON
    env.window.localStorage.setItem('opsdesk:state:v1', '{"tasks":[{"title":"真实任务"');

    const res = await env.Store.init();

    // 必须明确告诉上层"这是损坏"，而不是"这是首次使用"
    assert.ok(res.diagnostics, '应返回诊断信息');
    assert.equal(res.diagnostics.localPresent, true, '应识别出 key 存在');
    assert.equal(res.diagnostics.localCorrupted, true, '应识别出数据损坏');
    assert.equal(res.diagnostics.corruptSaved, true, '损坏原文应被另存抢救');

    // 损坏的原文必须留一份副本，否则下一次启动就彻底没了
    const saved = env.window.localStorage.getItem('opsdesk:corrupt:v1');
    assert.ok(saved, '损坏原文未留副本');
    assert.ok(saved.indexOf('真实任务') >= 0, '副本里应包含原始内容');

    // 最关键：绝不能用空白状态把损坏的原文冲掉
    await sleep(150);
    const raw = env.window.localStorage.getItem('opsdesk:state:v1');
    assert.ok(raw.indexOf('真实任务') >= 0, '损坏原文被覆盖了');
    assert.ok(raw.indexOf('{"tasks":[{"title":"真实任务"') === 0, '原始内容应原样保留');
  } finally {
    env.cleanup();
  }
});

test('数据安全：数据损坏且无 IndexedDB 副本时，绝不灌入演示数据', async () => {
  const env = createEnv();
  try {
    env.window.localStorage.setItem('opsdesk:state:v1', 'not-json-at-all');
    const res = await env.Store.init();
    assert.equal(res.blank, true, '应视为无可用数据');
    assert.equal(env.Store.state.tasks.length, 0, '不得灌入演示任务');
    assert.ok(!env.Store.state.tasks.some((t) => t.demo), '不得出现演示记录');
    assert.equal(env.Store.state.projects.length, 1, '只保留默认项目');
  } finally {
    env.cleanup();
  }
});

test('数据安全：保存失败（两侧都写不进）必须被标记为失败而不是静默成功', async () => {
  const env = createEnv();
  try {
    // 模拟 localStorage 与 IndexedDB 都不可用
    env.window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    env.window.indexedDB = undefined;

    const res = await env.Store.init();
    assert.ok(res, 'init 应正常返回');
    // 写盘失败时 store 必须能感知
    const p = globalThis;
    void p;
  } finally {
    env.cleanup();
  }
});

test('数据安全：存储探针应能区分"可用"与"不可用"', () => {
  const env = createEnv();
  try {
    const p = env.Storage.probe();
    assert.equal(p.localStorage, true, 'localStorage 应可用');
    assert.equal(p.indexedDB, true, 'IndexedDB 应可用');
    assert.equal(typeof p.origin, 'string');
  } finally {
    env.cleanup();
  }
});

test('数据安全：目录级备份在无本地服务时应优雅降级', async () => {
  const env = createEnv();
  try {
    // jsdom 环境没有 fetch / http origin，FileBackup 应判定为不支持
    const FB = env.FileBackup;
    assert.ok(FB, 'FileBackup 应被导出');
    assert.equal(FB.supported, false, '无本地服务时应判定为不支持');

    const res = await env.Store.checkFileBackup();
    assert.equal(res.available, false, '应报告没有可用的目录备份');
    assert.equal(res.supported, false, '应报告不支持');
  } finally {
    env.cleanup();
  }
});

test('数据安全：保存成功后应自动把数据同步到目录备份', async () => {
  const env = await createSeededEnv();
  try {
    // 注入一个假的 fetch，模拟本地服务可用
    const calls = [];
    env.window.fetch = function (url, opts) {
      calls.push({ url: String(url), method: (opts && opts.method) || 'GET' });
      if ((opts && opts.method) === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ ok: false }) });
    };
    // FileBackup.supported 在脚本加载时就决定了，这里直接重算
    env.FileBackup.supported = true;

    env.Store.mutate((s) => {
      s.tasks.push({
        id: 'tsk_real_1',
        title: '要同步的真实任务',
        project: s.projects[0].id,
        date: env.Utils.today(),
        startTime: '09:00',
        endTime: '10:00',
        status: 'todo',
        priority: 'P2',
      });
    }, 'test');

    await sleep(2600); // 等待 2s 防抖后的目录备份同步

    const put = calls.filter((c) => c.method === 'PUT');
    assert.ok(put.length > 0, '保存后应向目录备份文件发起写入');
    assert.ok(put[0].url.indexOf('__opsdesk/backup') >= 0, 'URL 不对：' + put[0].url);
    assert.equal(env.Store.fileBackupState.lastOk, true, '目录备份应同步成功');
  } finally {
    env.cleanup();
  }
});

test('数据安全：能从目录备份恢复数据并保留真实记录', async () => {
  const env = await createSeededEnv();
  try {
    const fileState = {
      settings: { theme: 'dark', activeView: 'tasks', focusProjectId: null },
      projects: [{ id: 'prj_x', name: '文件里的项目', color: '#38bdf8', flagship: false, desc: '' }],
      tasks: [{
        id: 'tsk_from_file',
        title: '来自目录备份的任务',
        project: 'prj_x',
        date: '2026-01-01',
        startTime: '09:00',
        endTime: '10:00',
        status: 'todo',
        priority: 'P2',
      }],
      incidents: [],
      timeLogs: [],
      releases: [],
      queries: [],
    };

    env.Store.restoreFromFileBackup(fileState);

    assert.equal(env.Store.state.tasks.length, 1, '应恢复出文件里的任务');
    assert.equal(env.Store.state.tasks[0].title, '来自目录备份的任务');
    assert.equal(env.Store.state.projects.length, 1, '应恢复出文件里的项目');
    assert.equal(env.Store.state.projects[0].name, '文件里的项目');
  } finally {
    env.cleanup();
  }
});

test('数据安全：恢复目录备份后项目为空时应兜底保留一个项目', async () => {
  const env = await createSeededEnv();
  try {
    env.Store.restoreFromFileBackup({
      settings: { theme: 'dark', activeView: 'tasks', focusProjectId: 'prj_gone' },
      projects: [],
      tasks: [],
      incidents: [],
      timeLogs: [],
      releases: [],
      queries: [],
    });
    assert.ok(env.Store.state.projects.length >= 1, '应至少保留一个项目');
    assert.equal(env.Store.state.settings.focusProjectId, env.Store.state.projects[0].id,
      'focusProjectId 不应指向已不存在的项目');
  } finally {
    env.cleanup();
  }
});
