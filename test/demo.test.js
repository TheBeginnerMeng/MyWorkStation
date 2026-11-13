/* ============================================================
   演示数据生命周期测试
   背景：以前应用启动时会自动灌入一套演示数据，结果和用户自己的
   真实数据混在一起，还反复出现。这里锁定「不自动播种 + 可一键清除」。
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createEnv, createSeededEnv } = require('./harness');

/** 造一条真实的（非演示）任务 */
function realTask(env, id, title) {
  env.Store.mutate((s) => {
    s.tasks.push({
      id,
      title,
      project: s.projects[0].id,
      date: env.Utils.today(),
      startTime: '09:00',
      endTime: '10:00',
      status: 'todo',
      priority: 'P2',
      note: '',
      flagship: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }, 'test');
  return id;
}

test('演示：空存储启动应是空白工作台，不含任何演示数据', async () => {
  const env = createEnv();
  try {
    const res = await env.Store.init();
    assert.equal(res.blank, true, '空存储应标记为空白启动');
    assert.equal(env.Store.state.tasks.length, 0, '不应有演示任务');
    assert.equal(env.Store.state.incidents.length, 0, '不应有演示故障');
    assert.equal(env.Store.state.timeLogs.length, 0, '不应有演示流水');
    assert.equal(env.Store.state.releases.length, 0, '不应有演示版本');
    assert.equal(env.Store.state.queries.length, 0, '不应有演示取数单');
    // 仍要留一个可用项目，否则各模块无处归属
    assert.equal(env.Store.state.projects.length, 1, '应保留一个默认项目');
    assert.ok(!env.Store.state.projects[0].demo, '默认项目不应是演示项目');
  } finally {
    env.cleanup();
  }
});

test('演示：重复启动不会凭空长出演示数据', async () => {
  const env = createEnv();
  try {
    await env.Store.init();
    const first = env.Store.state.tasks.length;
    // 模拟「重启」：再初始化一次
    const env2 = createEnv();
    try {
      await env2.Store.init();
      assert.equal(env2.Store.state.tasks.length, 0, '第二次启动仍不应有演示数据');
    } finally {
      env2.cleanup();
    }
    assert.equal(env.Store.state.tasks.length, first);
  } finally {
    env.cleanup();
  }
});

test('演示：种子数据自带 demo 标记，且归一化后保留', () => {
  const env = createEnv();
  try {
    const demo = env.Seed.normalize(env.Seed.build());
    assert.ok(demo.tasks.length > 0);
    assert.ok(demo.tasks.every((t) => t.demo === true), '演示任务应带 demo 标记');
    assert.ok(demo.incidents.every((i) => i.demo === true), '演示故障应带 demo 标记');
    assert.ok(demo.timeLogs.every((l) => l.demo === true), '演示流水应带 demo 标记');
    assert.ok(demo.releases.every((r) => r.demo === true), '演示版本应带 demo 标记');
    assert.ok(demo.queries.every((q) => q.demo === true), '演示取数单应带 demo 标记');
    assert.ok(demo.projects.every((p) => p.demo === true), '演示项目应带 demo 标记');

    // 再归一化一次，标记不能丢
    const again = env.Seed.normalize(demo);
    assert.ok(again.tasks.every((t) => t.demo === true), '归一化后 demo 标记应保留');
  } finally {
    env.cleanup();
  }
});

test('演示：载入演示数据只新增，不动已有真实数据', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.tasks.length;
    realTask(env, 'tsk_real_1', '我的真实任务');
    const added = env.Store.appendDemo();

    assert.ok(added.tasks > 0, '应追加演示任务');
    assert.equal(env.Store.state.tasks.length, before + 1 + added.tasks, '任务总数应为原有 + 真实 + 演示');
    assert.ok(env.Store.state.tasks.some((t) => t.id === 'tsk_real_1'), '真实任务应保留');
    assert.ok(env.Store.state.tasks.some((t) => t.demo), '应有演示任务被追加');

    // 演示项目若与真实项目重名，应自动改名，避免混在一起
    const names = env.Store.state.projects.map((p) => p.name);
    assert.equal(new Set(names).size, names.length, '项目名不应重复');
  } finally {
    env.cleanup();
  }
});

test('演示：清除演示数据只删演示记录，真实数据保留', async () => {
  const env = await createSeededEnv();
  try {
    realTask(env, 'tsk_real_1', '我的真实任务');
    env.Store.mutate((s) => {
      s.incidents.push({
        id: 'inc_real_1',
        title: '我的真实故障',
        project: s.projects[0].id,
        severity: 'P2',
        status: 'tracking',
        date: env.Utils.today(),
        occurredAt: '10:00',
        symptom: '',
        impact: '',
        diagnosis: '',
        solution: '',
        owner: '我',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }, 'test');

    const counts = env.Store.demoStats();
    assert.ok(counts.tasks > 0, '演示数据统计应识别出演示任务');

    const removed = env.Store.purgeDemo();

    assert.ok(removed.tasks > 0, '应删除演示任务');
    assert.equal(env.Store.state.tasks.length, 1, '只剩真实任务');
    assert.equal(env.Store.state.tasks[0].id, 'tsk_real_1');
    assert.equal(env.Store.state.incidents.length, 1, '只剩真实故障');
    assert.equal(env.Store.state.incidents[0].id, 'inc_real_1');
    assert.equal(env.Store.state.timeLogs.length, 0, '演示流水应被清除');
    assert.equal(env.Store.state.releases.length, 0, '演示版本应被清除');
    assert.equal(env.Store.state.queries.length, 0, '演示取数单应被清除');
    // 至少保留一个项目
    assert.ok(env.Store.state.projects.length >= 1, '清除后应至少保留一个项目');
  } finally {
    env.cleanup();
  }
});

test('演示：旧版本已落库的演示记录（无 demo 标记）也能被识别并清除', () => {
  const env = createEnv();
  try {
    // 模拟老版本数据：只有 id 特征，没有 demo 标记
    const legacy = {
      settings: { theme: 'dark', activeView: 'dashboard', focusProjectId: 'prj_migration' },
      projects: [
        { id: 'prj_migration', name: '集群迁移', color: '#38bdf8', flagship: true, desc: '' },
        { id: 'prj_migration2', name: '集群迁移', color: '#38bdf8', flagship: false, desc: '' },
      ],
      tasks: [
        { id: 'tsk_demo_1', title: '演示任务', project: 'prj_migration', date: '2026-01-01', startTime: '09:00', endTime: '10:00', status: 'todo', priority: 'P2' },
        { id: 'tsk_real_9', title: '真实任务', project: 'prj_migration', date: '2026-01-01', startTime: '09:00', endTime: '10:00', status: 'todo', priority: 'P2' },
      ],
      incidents: [{ id: 'inc_demo_1', title: '演示故障', date: '2026-01-01' }],
      timeLogs: [{ id: 'tl_3', date: '2026-01-01', startTime: '09:00', endTime: '10:00', category: 'dev', desc: 'x' }],
      releases: [{ id: 'rel_demo_1', version: 'v1.0', date: '2026-01-01' }],
      queries: [{ id: 'qry_demo_1', code: 'QS2026010101', title: '演示取数单' }],
    };
    const counts = env.Seed.demoCounts(legacy);
    assert.equal(counts.tasks, 1, '应识别出旧版演示任务');
    assert.equal(counts.incidents, 1);
    assert.equal(counts.timeLogs, 1);
    assert.equal(counts.releases, 1);
    assert.equal(counts.queries, 1);
    // 项目：id 是演示 id 且名称未改 → 算演示；同名但不同 id → 不算
    assert.equal(counts.projects, 1, '只有原始名称的演示项目才算');

    const res = env.Seed.stripDemo(legacy);
    assert.equal(res.state.tasks.length, 1);
    assert.equal(res.state.tasks[0].id, 'tsk_real_9', '真实任务应保留');
    assert.equal(res.state.projects.length, 1);
    assert.equal(res.state.projects[0].id, 'prj_migration2', '同名但不同 id 的项目应保留');
  } finally {
    env.cleanup();
  }
});

test('演示：清除后 focusProjectId 不得指向已删除的演示项目', () => {
  const env = createEnv();
  try {
    const state = {
      settings: { theme: 'dark', activeView: 'dashboard', focusProjectId: 'prj_migration' },
      projects: [{ id: 'prj_migration', name: '集群迁移', color: '#38bdf8', flagship: true, desc: '' }],
      tasks: [],
      incidents: [],
      timeLogs: [],
      releases: [],
      queries: [],
    };
    const res = env.Seed.stripDemo(state);
    assert.equal(res.state.projects.length, 0);
    assert.equal(res.state.settings.focusProjectId, null, 'focusProjectId 应被清空');
  } finally {
    env.cleanup();
  }
});

test('演示：存储自检应报告可用性与当前存储空间', () => {
  const env = createEnv();
  try {
    const p = env.Storage.probe();
    assert.equal(p.localStorage, true, 'localStorage 应可用');
    assert.equal(p.indexedDB, true, 'IndexedDB 应可用');
    assert.ok(typeof p.origin === 'string');
  } finally {
    env.cleanup();
  }
});

test('演示：meta 时间戳丢失时，新的 localStorage 不应被旧 IDB 副本覆盖', async () => {
  const env = createEnv();
  try {
    const { Storage } = env;
    await Storage.save({ marker: 'newer', updatedAt: Date.now() });
    await new Promise((r) => setTimeout(r, 80));

    // 模拟：IndexedDB 里躺着一份更旧的副本，且 meta 被清掉
    await new Promise((resolve) => {
      const req = env.window.indexedDB.open('opsdesk-db', 1);
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put({ state: { marker: 'older' }, updatedAt: Date.now() - 60000 }, 'state');
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      };
      req.onerror = resolve;
    });
    env.window.localStorage.removeItem('opsdesk:meta:v1');

    const loaded = await Storage.load();
    assert.equal(loaded.state.marker, 'newer', '不应被旧 IDB 副本覆盖');
    assert.equal(loaded.source, 'localStorage');
  } finally {
    env.cleanup();
  }
});
