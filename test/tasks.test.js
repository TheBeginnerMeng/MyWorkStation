/* ============================================================
   任务模块测试：重点覆盖「工作时间必填」强制规则
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createSeededEnv } = require('./harness');

/** 打开新建任务弹窗并返回其 DOM 句柄 */
function openTaskEditor(env) {
  env.Tasks.openEditor(null);
  const modal = env.document.querySelector('#modal-host .panel');
  assert.ok(modal, '任务弹窗未打开');
  return {
    root: modal,
    title: modal.querySelector('input[type=text]'),
    date: modal.querySelector('input[type=date]'),
    start: modal.querySelectorAll('input[type=time]')[0],
    end: modal.querySelectorAll('input[type=time]')[1],
    selects: modal.querySelectorAll('select'),
    hint: modal.querySelector('.hint'),
    buttons: Array.from(modal.querySelectorAll('button')),
    saveBtn() {
      return Array.from(modal.querySelectorAll('button')).find((b) =>
        /创建任务|保存修改/.test(b.textContent)
      );
    },
  };
}

/** 触发输入事件（jsdom 不自动派发） */
function fireInput(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('input', { bubbles: true }));
}

test('任务：新建弹窗应包含全部必填字段', async () => {
  const env = await createSeededEnv();
  try {
    const f = openTaskEditor(env);
    assert.ok(f.title, '缺少任务名称输入框');
    assert.ok(f.start, '缺少开始时间输入框');
    assert.ok(f.end, '缺少结束时间输入框');
    assert.ok(f.date, '缺少日期输入框');
    assert.ok(f.selects.length >= 3, '缺少状态/优先级/项目下拉框');
    assert.ok(f.saveBtn(), '缺少保存按钮');
    // 开始/结束时间应标注为必填
    const labels = Array.from(f.root.querySelectorAll('label')).map((l) => l.textContent);
    assert.ok(labels.some((l) => /开始时间/.test(l)), '开始时间缺少标签');
    assert.ok(labels.some((l) => /结束时间/.test(l)), '结束时间缺少标签');
  } finally {
    env.cleanup();
  }
});

test('任务【核心规则】：未填写工作时间时不得保存', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.tasks.length;
    const f = openTaskEditor(env);

    f.title.value = '一个没有时间的任务';
    fireInput(f.title);
    // 清空开始与结束时间
    f.start.value = '';
    f.end.value = '';
    fireInput(f.start);
    fireInput(f.end);

    f.saveBtn().click();

    // 1. 任务数不应变化
    assert.equal(env.Store.state.tasks.length, before, '未填时间仍创建了任务');
    // 2. 弹窗不应关闭
    assert.ok(env.document.querySelector('#modal-host .panel'), '弹窗被意外关闭');
    // 3. 应有错误提示
    const hintText = env.document.querySelector('#modal-host .hint').textContent;
    assert.ok(/必填/.test(hintText), `未给出必填提示，实际为: ${hintText}`);
    // 4. 时间字段应标红
    assert.ok(f.start.classList.contains('input-invalid'), '开始时间未标红');
    assert.ok(f.end.classList.contains('input-invalid'), '结束时间未标红');
  } finally {
    env.cleanup();
  }
});

test('任务【核心规则】：只填开始时间、漏填结束时间时不得保存', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.tasks.length;
    const f = openTaskEditor(env);
    f.title.value = '只有开始时间';
    fireInput(f.title);
    f.start.value = '09:00';
    f.end.value = '';
    fireInput(f.start);
    fireInput(f.end);

    f.saveBtn().click();

    assert.equal(env.Store.state.tasks.length, before, '漏填结束时间仍创建了任务');
    assert.ok(env.document.querySelector('#modal-host .panel'), '弹窗被意外关闭');
    assert.ok(f.end.classList.contains('input-invalid'), '结束时间未标红');
  } finally {
    env.cleanup();
  }
});

test('任务【核心规则】：任务名称为空时不得保存', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.tasks.length;
    const f = openTaskEditor(env);
    f.title.value = '   ';
    fireInput(f.title);
    f.saveBtn().click();

    assert.equal(env.Store.state.tasks.length, before, '名称为空仍创建了任务');
    assert.ok(env.document.querySelector('#modal-host .panel'), '弹窗被意外关闭');
    assert.ok(f.title.classList.contains('input-invalid'), '任务名称未标红');
  } finally {
    env.cleanup();
  }
});

test('任务：结束时间必须晚于开始时间', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.tasks.length;
    const f = openTaskEditor(env);
    f.title.value = '时间颠倒的任务';
    fireInput(f.title);
    f.start.value = '14:00';
    f.end.value = '10:00';
    fireInput(f.start);
    fireInput(f.end);

    f.saveBtn().click();

    assert.equal(env.Store.state.tasks.length, before, '结束早于开始仍创建了任务');
    const hintText = env.document.querySelector('#modal-host .hint').textContent;
    assert.ok(/晚于/.test(hintText), `未提示时间先后关系，实际为: ${hintText}`);
  } finally {
    env.cleanup();
  }
});

test('任务：起止时间相同时不得保存', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.tasks.length;
    const f = openTaskEditor(env);
    f.title.value = '零时长任务';
    fireInput(f.title);
    f.start.value = '09:00';
    f.end.value = '09:00';
    fireInput(f.start);
    fireInput(f.end);

    f.saveBtn().click();
    assert.equal(env.Store.state.tasks.length, before, '零时长仍创建了任务');
  } finally {
    env.cleanup();
  }
});

test('任务：信息完整时应成功创建并关闭弹窗', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.tasks.length;
    const f = openTaskEditor(env);
    f.title.value = '完整信息的任务';
    fireInput(f.title);
    f.start.value = '19:30';
    f.end.value = '21:00';
    fireInput(f.start);
    fireInput(f.end);

    f.saveBtn().click();

    assert.equal(env.Store.state.tasks.length, before + 1, '任务未创建');
    assert.ok(!env.document.querySelector('#modal-host .panel'), '弹窗未关闭');

    const created = env.Store.state.tasks[env.Store.state.tasks.length - 1];
    assert.equal(created.title, '完整信息的任务');
    assert.equal(created.startTime, '19:30');
    assert.equal(created.endTime, '21:00');
    assert.equal(created.status, 'todo');
    assert.ok(created.id, '任务缺少 id');
    assert.ok(created.createdAt, '任务缺少 createdAt');
  } finally {
    env.cleanup();
  }
});

test('任务：编辑应更新原任务而非新增', async () => {
  const env = await createSeededEnv();
  try {
    const target = env.Store.state.tasks.find((t) => t.title.includes('HDFS NameNode'));
    const before = env.Store.state.tasks.length;
    env.Tasks.openEditor(target);
    const modal = env.document.querySelector('#modal-host .panel');
    const titleInput = modal.querySelector('input[type=text]');
    titleInput.value = '改过名字的任务';
    fireInput(titleInput);

    Array.from(modal.querySelectorAll('button')).find((b) => /保存修改/.test(b.textContent)).click();

    assert.equal(env.Store.state.tasks.length, before, '编辑却新增了任务');
    const updated = env.Store.taskById(target.id);
    assert.equal(updated.title, '改过名字的任务', '原任务未被更新');
  } finally {
    env.cleanup();
  }
});

test('任务：状态切换应遵循字典定义的流转顺序', async () => {
  const env = await createSeededEnv();
  try {
    const todo = env.Store.state.tasks.find((t) => t.status === 'todo');
    // 先渲染看板，拿到任务卡片
    env.Tasks.render(env.document.getElementById('view-root'));
    const card = env.document.querySelector('.kb-col [data-task-id="' + todo.id + '"]');
    assert.ok(card, '未找到任务卡片');

    // 卡片上的四个状态切换按钮
    const switchBtns = Array.from(card.querySelectorAll('button')).filter((b) =>
      /标记为/.test(b.title || '')
    );
    assert.ok(switchBtns.length === 4, '状态切换按钮数量不符');

    const doingBtn = switchBtns.find((b) => /进行中/.test(b.title));
    doingBtn.click();
    assert.equal(env.Store.taskById(todo.id).status, 'doing', '状态未切换为进行中');

    // 重新渲染后卡片会重建，需重新查询
    env.Tasks.render(env.document.getElementById('view-root'));
    const card2 = env.document.querySelector('.kb-col [data-task-id="' + todo.id + '"]');
    const doneBtn = Array.from(card2.querySelectorAll('button')).find((b) => /已完成/.test(b.title));
    doneBtn.click();
    assert.equal(env.Store.taskById(todo.id).status, 'done', '状态未切换为已完成');

    // 当前状态的按钮应标注（当前）
    env.Tasks.render(env.document.getElementById('view-root'));
    const card3 = env.document.querySelector('.kb-col [data-task-id="' + todo.id + '"]');
    const currentBtn = Array.from(card3.querySelectorAll('button')).find((b) => /（当前）/.test(b.title || ''));
    assert.ok(currentBtn, '未标注当前状态');
    assert.ok(/已完成/.test(currentBtn.title), '当前状态标注错误');
  } finally {
    env.cleanup();
  }
});

test('任务：删除应从状态中移除该任务', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.tasks.length;
    const target = env.Store.state.tasks[0];
    env.Tasks.render(env.document.getElementById('view-root'));
    const card = env.document.querySelector('.kb-col [data-task-id="' + target.id + '"]');
    assert.ok(card, '未找到任务卡片');
    const delBtn = Array.from(card.querySelectorAll('button')).find((b) => b.title === '删除');
    delBtn.click();

    // 二次确认弹窗
    const panels = env.document.querySelectorAll('#modal-host .panel');
    const confirmBtn = Array.from(panels[panels.length - 1].querySelectorAll('button')).find((b) =>
      /确认删除/.test(b.textContent)
    );
    assert.ok(confirmBtn, '未出现删除确认弹窗');
    confirmBtn.click();

    assert.equal(env.Store.state.tasks.length, before - 1, '任务未被删除');
    assert.equal(env.Store.taskById(target.id), undefined, '已删除任务仍可查询到');
  } finally {
    env.cleanup();
  }
});

test('任务：看板渲染应包含四个状态列', async () => {
  const env = await createSeededEnv();
  try {
    env.Tasks.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');
    const cols = root.querySelectorAll('.kb-col');
    assert.equal(cols.length, 4, '看板列数不符');
    const statuses = Array.from(cols).map((c) => c.dataset.status);
    assert.deepEqual(statuses, ['todo', 'doing', 'done', 'blocked'], '看板状态列不符');
  } finally {
    env.cleanup();
  }
});

test('任务：看板卡片应可拖拽（draggable）', async () => {
  const env = await createSeededEnv();
  try {
    env.Tasks.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');
    const cards = root.querySelectorAll('.kb-col [data-task-id]');
    assert.ok(cards.length > 0, '看板没有卡片');
    cards.forEach((c) => assert.equal(c.getAttribute('draggable'), 'true', '卡片缺少 draggable'));
  } finally {
    env.cleanup();
  }
});

test('任务：时间轴应渲染所有任务且重叠任务分泳道不重叠', async () => {
  const env = await createSeededEnv();
  try {
    env.Tasks.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');
    const blocks = root.querySelectorAll('.tl-block');
    const today = env.Utils.today();
    const todayTasks = env.Store.state.tasks.filter((t) => t.date === today);
    assert.equal(blocks.length, todayTasks.length, '时间轴任务块数量不符');

    // 校验无重叠：同一泳道内不应有时间交叠
    const byLane = {};
    blocks.forEach((b) => {
      const id = b.dataset.taskId;
      const t = env.Store.taskById(id);
      const left = b.style.left;
      (byLane[left] = byLane[left] || []).push(t);
    });
    Object.keys(byLane).forEach((lane) => {
      const list = byLane[lane].slice().sort((a, b) => env.Utils.toMin(a.startTime) - env.Utils.toMin(b.startTime));
      for (let i = 1; i < list.length; i++) {
        assert.ok(
          env.Utils.toMin(list[i].startTime) >= env.Utils.toMin(list[i - 1].endTime),
          `泳道 ${lane} 内任务「${list[i].title}」与「${list[i - 1].title}」时间重叠`
        );
      }
    });
  } finally {
    env.cleanup();
  }
});

test('任务：筛选（项目 / 状态 / 关键词）应同时作用于时间轴与看板', async () => {
  const env = await createSeededEnv();
  try {
    const root = env.document.getElementById('view-root');
    env.Tasks.filter.date = env.Utils.today();
    env.Tasks.filter.project = 'all';
    env.Tasks.filter.status = 'all';
    env.Tasks.filter.keyword = '';
    env.Tasks.render(root);

    const allText = root.textContent;
    assert.ok(/HDFS NameNode/.test(allText), '初始应显示全部任务');

    // 按关键词过滤 —— 时间轴与看板都应被过滤
    env.Tasks.filter.keyword = 'Spark';
    env.Tasks.render(root);
    assert.ok(/Spark 作业倾斜/.test(root.textContent), '过滤后应保留匹配任务');
    assert.ok(!/每日集群巡检/.test(root.textContent), '过滤后仍显示了不匹配任务');

    // 时间轴的任务块数量应等于过滤后的任务数
    const visible = env.Store.state.tasks.filter(
      (t) => t.date === env.Utils.today() && /Spark/.test(t.title)
    );
    const blocks = root.querySelectorAll('.tl-block');
    assert.equal(blocks.length, visible.length, '时间轴未同步应用筛选条件');

    // 看板卡片数量也应一致
    const cards = root.querySelectorAll('.kb-col [data-task-id]');
    assert.equal(cards.length, visible.length, '看板未同步应用筛选条件');

    // 按状态过滤
    env.Tasks.filter.keyword = '';
    env.Tasks.filter.status = 'done';
    env.Tasks.render(root);
    assert.ok(!/Spark 作业倾斜/.test(root.textContent), '状态过滤未生效');

    // 筛空时应给出「清除筛选」而非「这一天还没有安排」
    env.Tasks.filter.keyword = '不存在的关键词XYZ';
    env.Tasks.render(root);
    assert.ok(/清除筛选/.test(root.textContent), '筛空时未提供清除筛选入口');
    assert.ok(!/这一天还没有安排/.test(root.textContent), '筛空时误报为无安排');

    // 重置
    env.Tasks.filter.status = 'all';
    env.Tasks.filter.keyword = '';
  } finally {
    env.cleanup();
  }
});
