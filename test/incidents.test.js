/* ============================================================
   生产问题排查看板测试
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createSeededEnv } = require('./harness');

function openIncidentEditor(env) {
  env.Incidents.openEditor(null);
  const modal = env.document.querySelector('#modal-host .panel');
  assert.ok(modal, '故障弹窗未打开');
  const textareas = modal.querySelectorAll('textarea');
  return {
    root: modal,
    title: modal.querySelector('input[type=text]'),
    selects: modal.querySelectorAll('select'),
    symptom: textareas[0],
    impact: textareas[1],
    diagnosis: textareas[2],
    solution: textareas[3],
    saveBtn: Array.from(modal.querySelectorAll('button')).find((b) => /录入故障|保存修改/.test(b.textContent)),
  };
}

function fireInput(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('input', { bubbles: true }));
}

test('故障：录入表单应包含四个结构化字段', async () => {
  const env = await createSeededEnv();
  try {
    const f = openIncidentEditor(env);
    const labels = Array.from(f.root.querySelectorAll('label')).map((l) => l.textContent);
    ['故障 / 现象', '影响范围', '排查与定位过程', '解决方案'].forEach((name) => {
      assert.ok(labels.some((l) => l.includes(name)), `缺少字段：${name}`);
    });
    // 严重级别与状态下拉
    assert.ok(f.selects.length >= 3, '缺少项目/严重级别/状态下拉');
  } finally {
    env.cleanup();
  }
});

test('故障：标题为空时不得保存', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.incidents.length;
    const f = openIncidentEditor(env);
    f.symptom.value = '只有现象没有标题';
    fireInput(f.symptom);
    f.saveBtn.click();

    assert.equal(env.Store.state.incidents.length, before, '标题为空仍录入了故障');
    assert.ok(env.document.querySelector('#modal-host .panel'), '弹窗被意外关闭');
    assert.ok(f.title.classList.contains('input-invalid'), '标题未标红');
  } finally {
    env.cleanup();
  }
});

test('故障：完整录入应创建记录并保存四个字段', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.incidents.length;
    const f = openIncidentEditor(env);
    f.title.value = '测试故障现象';
    f.symptom.value = '节点内存暴涨';
    f.impact.value = '影响 2 个下游任务';
    f.diagnosis.value = '排查步骤一、二';
    f.solution.value = '扩容并加限制';
    fireInput(f.title);

    f.saveBtn.click();

    assert.equal(env.Store.state.incidents.length, before + 1, '故障未录入');
    assert.ok(!env.document.querySelector('#modal-host .panel'), '弹窗未关闭');
    const created = env.Store.state.incidents[0];
    assert.equal(created.title, '测试故障现象');
    assert.equal(created.symptom, '节点内存暴涨');
    assert.equal(created.impact, '影响 2 个下游任务');
    assert.equal(created.diagnosis, '排查步骤一、二');
    assert.equal(created.solution, '扩容并加限制');
    assert.equal(created.status, 'tracking', '默认状态应为跟进中');
  } finally {
    env.cleanup();
  }
});

test('故障：状态切换应更新记录', async () => {
  const env = await createSeededEnv();
  try {
    const inc = env.Store.state.incidents.find((i) => i.status === 'tracking');
    env.Incidents.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');
    const card = Array.from(root.querySelectorAll('.panel')).find((p) =>
      p.textContent.includes(inc.title)
    );
    assert.ok(card, '未找到故障卡片');
    const resolveBtn = Array.from(card.querySelectorAll('button')).find((b) => b.textContent.trim() === '已解决');
    assert.ok(resolveBtn, '未找到状态切换按钮');
    resolveBtn.click();
    assert.equal(env.Store.incidentById(inc.id).status, 'resolved', '状态未更新');
  } finally {
    env.cleanup();
  }
});

test('故障：按状态筛选应生效且计数正确', async () => {
  const env = await createSeededEnv();
  try {
    const root = env.document.getElementById('view-root');
    env.Incidents.filter.status = 'all';
    env.Incidents.filter.project = 'all';
    env.Incidents.filter.keyword = '';
    env.Incidents.render(root);

    const total = env.Store.state.incidents.length;
    assert.ok(root.textContent.includes(`全部\n${total}`) || root.textContent.includes(String(total)), '总数显示异常');

    // 筛出跟进中
    env.Incidents.filter.status = 'tracking';
    env.Incidents.render(root);
    const trackingCount = env.Store.state.incidents.filter((i) => i.status === 'tracking').length;
    // 卡片数 = 故障卡片数（每张卡片含标题）
    const cards = root.querySelectorAll('.panel.group');
    assert.equal(cards.length, trackingCount, '按状态筛选的卡片数不符');

    env.Incidents.filter.status = 'all';
  } finally {
    env.cleanup();
  }
});

test('故障：关键词检索应覆盖现象/影响/方案各字段', async () => {
  const env = await createSeededEnv();
  try {
    const root = env.document.getElementById('view-root');
    env.Incidents.filter.status = 'all';
    env.Incidents.filter.project = 'all';

    // 用方案中的独特词检索
    env.Incidents.filter.keyword = 'YARN';
    env.Incidents.render(root);
    const cards = root.querySelectorAll('.panel.group');
    assert.ok(cards.length >= 1, '按方案关键词未检索到记录');

    // 用不存在的词
    env.Incidents.filter.keyword = 'ZZZ不存在的关键词';
    env.Incidents.render(root);
    assert.equal(root.querySelectorAll('.panel.group').length, 0, '无匹配时应为空');

    env.Incidents.filter.keyword = '';
  } finally {
    env.cleanup();
  }
});

test('故障：按时间倒序/正序应改变展示顺序', async () => {
  const env = await createSeededEnv();
  try {
    const root = env.document.getElementById('view-root');
    env.Incidents.filter.status = 'all';
    env.Incidents.filter.keyword = '';

    env.Incidents.filter.sort = 'desc';
    env.Incidents.render(root);
    const descTitles = Array.from(root.querySelectorAll('.panel.group')).map((c) =>
      c.querySelector('.text-\\[13\\.5px\\]')?.textContent || ''
    );

    env.Incidents.filter.sort = 'asc';
    env.Incidents.render(root);
    const ascTitles = Array.from(root.querySelectorAll('.panel.group')).map((c) =>
      c.querySelector('.text-\\[13\\.5px\\]')?.textContent || ''
    );

    assert.ok(descTitles.length > 1, '故障记录过少，无法验证排序');
    assert.notDeepEqual(descTitles, ascTitles, '正序与倒序结果相同');
    // 倒序应把最新放前面
    assert.equal(descTitles[0], ascTitles[ascTitles.length - 1], '倒序首项不等于正序末项');

    env.Incidents.filter.sort = 'desc';
  } finally {
    env.cleanup();
  }
});
