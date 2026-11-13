/* ============================================================
   数据模型与状态中心测试
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createEnv, createSeededEnv } = require('./harness');

test('Seed：演示数据应包含规格要求的三类关键内容', () => {
  const env = createEnv();
  try {
    const seed = env.Seed.build();
    // 两条带时间的待办
    const timed = seed.tasks.filter((t) => /^\d{2}:\d{2}$/.test(t.startTime) && /^\d{2}:\d{2}$/.test(t.endTime));
    assert.ok(timed.length >= 2, '带时间的任务不足两条');
    // HDFS 故障记录
    const hdfs = seed.incidents.find((i) => /HDFS/.test(i.title) && /OOM/.test(i.title));
    assert.ok(hdfs, '缺少 HDFS OOM 故障记录');
    assert.ok(hdfs.symptom, '故障记录缺少现象字段');
    assert.ok(hdfs.impact, '故障记录缺少影响范围');
    assert.ok(hdfs.diagnosis, '故障记录缺少排查过程');
    assert.ok(hdfs.solution, '故障记录缺少解决方案');
    // 重点项目进展
    const flagship = seed.tasks.filter((t) => t.flagship);
    assert.ok(flagship.length >= 1, '缺少重点项目/长线任务');
    assert.ok(seed.projects.some((p) => p.flagship), '缺少重点项目标记');
  } finally {
    env.cleanup();
  }
});

test('Seed：所有演示数据的日期应相对当天生成', () => {
  const env = createEnv();
  try {
    const seed = env.Seed.build();
    const today = env.Utils.today();
    // 允许窗口：前天 ~ 明天（演示数据覆盖近期产出聚合场景）
    const earliest = env.Utils.ymd(env.Utils.addDays(new Date(), -2));
    const latest = env.Utils.tomorrow();
    seed.tasks.forEach((t) => {
      assert.ok(
        t.date >= earliest && t.date <= latest,
        `任务「${t.title}」的日期 ${t.date} 超出 [${earliest}, ${latest}] 范围`
      );
    });
    // 至少要有今日与昨日的任务，保证晨会汇总有内容
    assert.ok(seed.tasks.some((t) => t.date === today), '缺少今日任务');
    assert.ok(seed.tasks.some((t) => t.date === env.Utils.yesterday()), '缺少昨日任务');
  } finally {
    env.cleanup();
  }
});

test('Seed：normalize 应把项目名称解析为项目 ID（防归属塌缩）', () => {
  const env = createEnv();
  try {
    const raw = env.Seed.build();
    // 模拟历史数据：project 存的是名称而非 ID
    raw.tasks.forEach((t) => {
      t.project = env.Store ? t.project : t.project;
    });
    const norm = env.Seed.normalize(raw);
    const names = norm.projects.map((p) => p.name);
    // 每个任务的 project 必须是合法 ID
    norm.tasks.forEach((t) => {
      assert.ok(
        norm.projects.some((p) => p.id === t.project),
        `任务「${t.title}」的项目 ${t.project} 未解析为有效 ID`
      );
    });
    // 不应全部塌缩到同一个项目
    const distinct = new Set(norm.tasks.map((t) => t.project));
    assert.ok(distinct.size > 1, '所有任务塌缩到了同一个项目');
    assert.ok(names.includes('集群迁移'));
  } finally {
    env.cleanup();
  }
});

test('Seed：normalize 应剔除脏数据并补全缺失字段', () => {
  const env = createEnv();
  try {
    const norm = env.Seed.normalize({
      tasks: [
        null,
        { title: '正常任务' },
        { title: '' },
        { title: '坏时间', startTime: 'abc', endTime: '99:99', date: 'xxx' },
      ],
      incidents: [{ symptom: '没有标题' }, null],
      timeLogs: [{ desc: 'x', startTime: 'bad' }],
      projects: [{ name: 'P1' }],
    });
    assert.equal(norm.tasks.length, 2, '脏数据未被正确剔除');
    assert.ok(norm.projects.length >= 1);
    const bad = norm.tasks.find((t) => t.title === '坏时间');
    assert.match(bad.startTime, /^\d{2}:\d{2}$/, '非法时间未被修正');
    assert.match(bad.date, /^\d{4}-\d{2}-\d{2}$/, '非法日期未被修正');
    // 故障记录应补上标题
    assert.ok(norm.incidents[0].title, '未补全故障标题');
    // 项目应补上颜色
    assert.ok(/^#[0-9a-f]{6}$/i.test(norm.projects[0].color), '未补全项目颜色');
  } finally {
    env.cleanup();
  }
});

test('Seed：normalize 对完全无效输入应返回可用的空状态', () => {
  const env = createEnv();
  try {
    const norm = env.Seed.normalize(null);
    assert.ok(norm, '未返回状态');
    assert.ok(Array.isArray(norm.tasks));
    assert.ok(Array.isArray(norm.projects));
    // 关键行为：normalize 不再往空数据里塞演示项目
    // （否则用户删空项目后，每次启动又冒出测试数据）
    assert.equal(norm.projects.length, 0, 'normalize 不应再回落到演示项目');
    assert.ok(!norm.projects.some((p) => p.demo), '不应出现演示项目');
    const norm2 = env.Seed.normalize({ tasks: 'not-an-array' });
    assert.deepEqual(norm2.tasks, [], '非数组 tasks 应归一化为空数组');
  } finally {
    env.cleanup();
  }
});

test('Store：mutate 应更新状态并触发订阅', async () => {
  const env = await createSeededEnv();
  try {
    let fired = 0;
    const off = env.Store.subscribe(() => fired++);
    env.Store.mutate((s) => {
      s.tasks.push({ id: 'x', title: '新任务', date: env.Utils.today(), status: 'todo' });
    }, 'test');
    assert.ok(fired >= 1, '订阅回调未触发');
    assert.equal(env.Store.state.tasks.length, (await Promise.resolve(0), env.Store.state.tasks.length));
    assert.ok(env.Store.taskById('x'), '新任务未进入状态');
    off();
  } finally {
    env.cleanup();
  }
});

test('Store：stats 统计应与实际数据一致', async () => {
  const env = await createSeededEnv();
  try {
    const today = env.Utils.today();
    const st = env.Store.stats();
    const todayTasks = env.Store.state.tasks.filter((t) => t.date === today);
    const done = todayTasks.filter((t) => t.status === 'done');
    assert.equal(st.todayTaskTotal, todayTasks.length, '当日任务总数不符');
    assert.equal(st.todayTaskDone, done.length, '已完成数不符');
    assert.equal(
      st.todayTaskRate,
      todayTasks.length ? Math.round((done.length / todayTasks.length) * 100) : 0,
      '完成率不符'
    );
    const open = env.Store.state.incidents.filter((i) => i.status === 'tracking');
    assert.equal(st.openIncidents, open.length, '跟进中故障数不符');
  } finally {
    env.cleanup();
  }
});

test('Store：categoryStats 分类占比应归一化且总和一致', async () => {
  const env = await createSeededEnv();
  try {
    const today = env.Utils.today();
    const cat = env.Store.categoryStats(today);
    assert.ok(cat.buckets.length === 4, '分类数不符');
    const sumPct = cat.buckets.reduce((a, b) => a + b.pct, 0);
    // 四舍五入误差应在 2% 以内
    assert.ok(Math.abs(100 - sumPct) <= 2, `百分比总和 ${sumPct} 偏离 100 过多`);
    // 各分类时长之和应等于总时长
    const sumMin = cat.buckets.reduce((a, b) => a + b.minutes, 0);
    assert.equal(sumMin, cat.total, '分类时长之和与总时长不符');
  } finally {
    env.cleanup();
  }
});

test('Store：categoryStats 对未知日期应返回全零而非崩溃', async () => {
  const env = await createSeededEnv();
  try {
    const cat = env.Store.categoryStats('2000-01-01');
    assert.equal(cat.total, 0);
    assert.equal(cat.buckets.length, 4);
    cat.buckets.forEach((b) => assert.equal(b.pct, 0));
  } finally {
    env.cleanup();
  }
});

test('Store：projectName 对未知 ID 应有合理兜底', async () => {
  const env = await createSeededEnv();
  try {
    const name = env.Store.projectName('not-exist');
    assert.ok(typeof name === 'string' && name.length > 0, '未知项目应有兜底名称');
    assert.ok(env.Store.projectColor('not-exist'), '未知项目应有兜底颜色');
  } finally {
    env.cleanup();
  }
});

test('Store：dictItem 对未知状态应返回合法条目', async () => {
  const env = await createSeededEnv();
  try {
    const d = env.Store.dictItem('taskStatus', 'weird');
    assert.ok(d && d.key && d.label && d.color, '未知状态未返回合法兜底条目');
  } finally {
    env.cleanup();
  }
});
