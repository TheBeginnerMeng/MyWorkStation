/* 冒烟测试：确认 harness 能正确加载应用 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createEnv, createSeededEnv } = require('./harness');

test('环境加载：所有模块应挂载到 OpsDesk 命名空间', () => {
  const env = createEnv();
  try {
    assert.ok(env.OpsDesk, 'OpsDesk 未挂载');
    ['Utils', 'Storage', 'Seed', 'Store', 'UI', 'Tasks', 'Incidents', 'TimeLog', 'Briefing', 'Dashboard', 'RightPanel'].forEach(
      (m) => assert.ok(env.OpsDesk[m], `模块 ${m} 缺失`)
    );
    assert.ok(env.OpsDesk.DICT, '字典缺失');
  } finally {
    env.cleanup();
  }
});

test('初始化：应载入演示数据', async () => {
  const env = await createSeededEnv();
  try {
    const s = env.Store.state;
    assert.ok(s.tasks.length >= 5, '任务数量不足');
    assert.ok(s.incidents.length >= 3, '故障数量不足');
    assert.ok(s.timeLogs.length >= 5, '流水数量不足');
    assert.ok(s.projects.length >= 4, '项目数量不足');
  } finally {
    env.cleanup();
  }
});
