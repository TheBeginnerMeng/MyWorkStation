/* ============================================================
   时间流水账测试：自动分类、时长计算、占比统计
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createSeededEnv } = require('./harness');

test('流水：自动分类应正确识别四类工作', async () => {
  const env = await createSeededEnv();
  try {
    const infer = env.TimeLog.inferCategory;
    assert.equal(infer('编写 Spark 脚本'), 'dev');
    assert.equal(infer('开发新接口'), 'dev');
    assert.equal(infer('代码重构'), 'dev');
    assert.equal(infer('灰度切流值守'), 'ops');
    assert.equal(infer('部署上线'), 'ops');
    assert.equal(infer('巡检监控告警'), 'ops');
    assert.equal(infer('晨会同步进度'), 'meeting');
    assert.equal(infer('方案评审会'), 'meeting');
    assert.equal(infer('定位故障根因'), 'debug');
    assert.equal(infer('排查异常报错'), 'debug');
    assert.equal(infer('修复 OOM 问题'), 'debug');
  } finally {
    env.cleanup();
  }
});

test('流水：分类应遵循优先级（排错 > 会议 > 运维 > 开发）', async () => {
  const env = await createSeededEnv();
  try {
    const infer = env.TimeLog.inferCategory;
    // 同时含"会议"与"排查" → 排错优先
    assert.equal(infer('会议中排查问题'), 'debug');
    // 同时含"运维"与"开发" → 运维优先
    assert.equal(infer('开发运维脚本'), 'ops');
    // 空描述回落到开发
    assert.equal(infer(''), 'dev');
    assert.equal(infer(null), 'dev');
  } finally {
    env.cleanup();
  }
});

test('流水：时长计算应正确，且支持跨天', async () => {
  const env = await createSeededEnv();
  try {
    const d = env.TimeLog.durationOf;
    assert.equal(d('14:00', '16:00'), 120);
    assert.equal(d('09:00', '09:30'), 30);
    assert.equal(d('23:00', '01:00'), 120, '跨天时长计算错误');
    assert.equal(d('10:00', '10:00'), 0);
  } finally {
    env.cleanup();
  }
});

test('流水：跨天时长与 categoryStats 口径应一致', async () => {
  const env = await createSeededEnv();
  try {
    // 存入一条跨天记录：23:00 -> 01:00 应计为 2 小时
    const today = env.Utils.today();
    env.Store.mutate((s) => {
      s.timeLogs.push({
        id: 'cross_midnight',
        date: today,
        startTime: '23:00',
        endTime: '01:00',
        category: 'dev',
        desc: '跨天任务',
        project: null,
        createdAt: Date.now(),
      });
    });
    const cat = env.Store.categoryStats(today);
    const devBucket = cat.buckets.find((b) => b.key === 'dev');
    // 用同样的口径重算一遍，逐条核对
    const expected = env.Store.state.timeLogs
      .filter((l) => l.date === today)
      .reduce((sum, l) => sum + env.TimeLog.durationOf(l.startTime, l.endTime), 0);
    assert.equal(cat.total, expected, 'categoryStats 总时长与 durationOf 口径不一致');
    assert.ok(devBucket.minutes >= 120, '跨天记录未按 2 小时计入');
  } finally {
    env.cleanup();
  }
});

test('流水：录入弹窗应自动计算时长并联动分类', async () => {
  const env = await createSeededEnv();
  try {
    env.TimeLog.openEditor(null);
    const modal = env.document.querySelector('#modal-host .panel');
    const desc = modal.querySelector('input[type=text]');
    const times = modal.querySelectorAll('input[type=time]');
    const start = times[0];
    const end = times[1];

    desc.value = '编写 Spark 调优脚本';
    desc.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    start.value = '14:00';
    start.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    end.value = '16:00';
    end.dispatchEvent(new env.window.Event('input', { bubbles: true }));

    const hint = modal.querySelector('.hint');
    assert.ok(/2h/.test(hint.textContent), `未计算时长，实际: ${hint.textContent}`);

    // 分类应被自动推断为开发
    const categorySelect = modal.querySelectorAll('select')[0];
    assert.equal(categorySelect.value, 'dev', '分类未自动推断为开发');
  } finally {
    env.cleanup();
  }
});

test('流水：描述或时间为空时不得保存', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.timeLogs.length;
    env.TimeLog.openEditor(null);
    const modal = env.document.querySelector('#modal-host .panel');
    const saveBtn = Array.from(modal.querySelectorAll('button')).find((b) => /记录|保存修改/.test(b.textContent));

    // 描述为空
    modal.querySelector('input[type=text]').value = '';
    saveBtn.click();
    assert.equal(env.Store.state.timeLogs.length, before, '描述为空仍保存了');

    // 描述有但时间为空
    const desc = modal.querySelector('input[type=text]');
    desc.value = '有描述但没时间';
    desc.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    const times = modal.querySelectorAll('input[type=time]');
    times[0].value = '';
    times[1].value = '';
    saveBtn.click();
    assert.equal(env.Store.state.timeLogs.length, before, '时间为空仍保存了');
  } finally {
    env.cleanup();
  }
});

test('流水：渲染应包含环形图与分类占比', async () => {
  const env = await createSeededEnv();
  try {
    env.TimeLog.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');
    assert.ok(root.querySelector('svg'), '未渲染 SVG 环形图');
    const circles = root.querySelectorAll('svg circle');
    assert.ok(circles.length >= 2, '环形图未绘制');
    // 占比条
    assert.ok(root.textContent.includes('分类占比'), '缺少分类占比区');
    // 明细列表
    assert.ok(root.textContent.includes('流水明细'), '缺少流水明细区');
  } finally {
    env.cleanup();
  }
});

test('流水：删除应移除记录', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.timeLogs.length;
    const target = env.Store.state.timeLogs[0];
    env.TimeLog.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');
    const row = Array.from(root.querySelectorAll('.group')).find((g) => g.textContent.includes(target.desc));
    assert.ok(row, '未找到流水行');
    const delBtn = Array.from(row.querySelectorAll('button')).find((b) => b.title === '删除');
    delBtn.click();
    assert.equal(env.Store.state.timeLogs.length, before - 1, '流水未被删除');
  } finally {
    env.cleanup();
  }
});

test('流水：按日期切换应切换统计口径', async () => {
  const env = await createSeededEnv();
  try {
    const root = env.document.getElementById('view-root');
    env.TimeLog.render(root);
    const todayTotal = env.Store.categoryStats(env.Utils.today()).total;

    // 切到昨天
    env.TimeLog.setViewDate(env.Utils.yesterday());
    env.TimeLog.render(root);
    const yestTotal = env.Store.categoryStats(env.Utils.yesterday()).total;
    assert.notEqual(todayTotal, yestTotal, '今天与昨天的总时长不应相同');
  } finally {
    env.cleanup();
  }
});
