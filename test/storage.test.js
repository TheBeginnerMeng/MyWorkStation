/* ============================================================
   持久化测试：localStorage + IndexedDB 双写与恢复
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createEnv, createSeededEnv, sleep } = require('./harness');

test('存储：save 后 localStorage 应有数据，且能被 load 读回', async () => {
  const env = createEnv();
  try {
    const { Storage } = env;
    const state = { hello: 'world', n: 42 };
    const res = await Storage.save(state);
    assert.ok(res.ok, '保存未成功');
    assert.ok(res.ls, 'localStorage 写入失败');
    assert.ok(res.idb, 'IndexedDB 写入失败');

    const loaded = await Storage.load();
    assert.deepEqual(loaded.state, state, '读回的数据不一致');
    assert.equal(loaded.source, 'localStorage');
  } finally {
    env.cleanup();
  }
});

test('存储：IndexedDB 镜像应包含完整状态', async () => {
  const env = createEnv();
  try {
    const { Storage } = env;
    await Storage.save({ a: 1, tasks: [{ id: 'x' }] });
    await sleep(80);
    const raw = await new Promise((resolve) => {
      const req = env.window.indexedDB.open('opsdesk-db', 1);
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('kv', 'readonly');
        const g = tx.objectStore('kv').get('state');
        g.onsuccess = () => resolve(g.result);
        g.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
    assert.ok(raw, 'IndexedDB 中未找到 state');
    assert.deepEqual(raw.state, { a: 1, tasks: [{ id: 'x' }] }, 'IndexedDB 内容不一致');
    assert.ok(raw.updatedAt > 0, 'updatedAt 缺失');
  } finally {
    env.cleanup();
  }
});

test('存储：localStorage 被清空后应能从 IndexedDB 恢复', async () => {
  const env = createEnv();
  try {
    const { Storage } = env;
    const state = { marker: 'recover-me', list: [1, 2, 3] };
    await Storage.save(state);
    await sleep(80);

    // 模拟 localStorage 被浏览器清理
    env.window.localStorage.clear();

    const loaded = await Storage.load();
    assert.ok(loaded.state, '未能从 IndexedDB 恢复数据');
    assert.deepEqual(loaded.state, state, '恢复的数据不一致');
    assert.equal(loaded.source, 'indexedDB');
    // 恢复后应回填 localStorage
    assert.ok(env.window.localStorage.getItem('opsdesk:state:v1'), '未回填 localStorage');
  } finally {
    env.cleanup();
  }
});

test('存储：IndexedDB 数据更新时应以较新者为准', async () => {
  const env = createEnv();
  try {
    const { Storage } = env;
    // 先写旧的到 localStorage
    await Storage.save({ version: 'old' });
    await sleep(50);
    // 直接往 IndexedDB 写一份更新的
    await new Promise((resolve) => {
      const req = env.window.indexedDB.open('opsdesk-db', 1);
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put({ state: { version: 'new' }, updatedAt: Date.now() + 10000 }, 'state');
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      };
      req.onerror = resolve;
    });

    const loaded = await Storage.load();
    assert.equal(loaded.state.version, 'new', '未采用更新的 IndexedDB 数据');
  } finally {
    env.cleanup();
  }
});

test('存储：clear 应清空两侧数据', async () => {
  const env = createEnv();
  try {
    const { Storage } = env;
    await Storage.save({ x: 1 });
    await sleep(50);
    await Storage.clear();
    const loaded = await Storage.load();
    assert.ok(!loaded.state, 'clear 后仍能读到数据');
  } finally {
    env.cleanup();
  }
});

test('存储：exportJSON / importJSON 应可往返', () => {
  const env = createEnv();
  try {
    const { Storage } = env;
    const state = { tasks: [{ id: 'a', title: '任务' }], settings: { theme: 'light' } };
    const json = Storage.exportJSON(state);
    assert.ok(typeof json === 'string' && json.length > 0);

    const parsed = Storage.importJSON(json);
    assert.deepEqual(parsed, state, '导入数据与原数据不一致');
    assert.equal(parsed.settings.theme, 'light');
  } finally {
    env.cleanup();
  }
});

test('存储：importJSON 对非法内容应抛错而非静默失败', () => {
  const env = createEnv();
  try {
    const { Storage } = env;
    assert.throws(() => Storage.importJSON('not json'), /JSON|Unexpected/i);
    assert.throws(() => Storage.importJSON('null'), /格式|状态/i);
    assert.throws(() => Storage.importJSON('[]'), /格式|状态/i);
  } finally {
    env.cleanup();
  }
});

test('存储：空白启动不应写盘占位，也不应灌入演示数据', async () => {
  const env = createEnv();
  try {
    await env.Store.init();
    await sleep(200);
    // 故意不写盘：否则「空的」状态会占住 key，
    // 下次启动会误判成「有数据」，也可能在数据损坏时把它冲掉
    const raw = env.window.localStorage.getItem('opsdesk:state:v1');
    assert.equal(raw, null, '空白启动不应写入占位数据');
    assert.equal(env.Store.state.tasks.length, 0, '启动不应自动灌入演示任务');
    assert.equal(env.Store.state.projects.length, 1, '应保留一个默认项目');
  } finally {
    env.cleanup();
  }
});

test('存储：用户产生第一次编辑后应真正落盘，刷新可恢复', async () => {
  const env = createEnv();
  try {
    await env.Store.init();
    env.Store.mutate((s) => {
      s.tasks.push({
        id: 'tsk_real_1',
        title: '我的真实任务',
        project: s.projects[0].id,
        date: env.Utils.today(),
        startTime: '09:00',
        endTime: '10:00',
        status: 'todo',
        priority: 'P2',
      });
    }, 'test');
    await sleep(200);

    const raw = env.window.localStorage.getItem('opsdesk:state:v1');
    assert.ok(raw, '状态未写入 localStorage');
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed.tasks), '落盘数据中 tasks 非法');
    assert.equal(parsed.tasks.length, 1, '真实任务应被保存');
    assert.ok(!parsed.tasks.some((t) => t.demo), '落盘数据不应含演示记录');
  } finally {
    env.cleanup();
  }
});
