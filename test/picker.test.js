/* ============================================================
   picker.js 测试：日期 / 时间选择控件
   重点验证「点选代替手输」的主路径与关键边界
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createSeededEnv } = require('./harness');

/** 拿到当前打开的选择面板 */
function panel(env) {
  return env.document.querySelector('.picker-panel');
}

/** 点击选择器触发按钮 */
function openPicker(env, field) {
  field.trigger.click();
  return panel(env);
}

test('picker：日期字段应渲染触发按钮并隐藏原生输入框', async () => {
  const env = await createSeededEnv();
  try {
    const f = env.Picker.dateField({ value: '2026-11-12' });
    env.document.body.appendChild(f.el);

    assert.ok(f.trigger, '缺少触发按钮');
    assert.equal(f.trigger.getAttribute('aria-haspopup'), 'dialog');
    // 原生 input 保留为数据载体，但不可见、不可聚焦
    assert.equal(f.input.type, 'date');
    assert.equal(f.input.getAttribute('tabindex'), '-1');
    assert.ok(f.input.classList.contains('picker-native'), '原生 input 未隐藏');
    // 触发按钮上应显示日期与星期
    assert.ok(/2026-11-12/.test(f.trigger.textContent), `按钮文案未显示日期: ${f.trigger.textContent}`);
    assert.ok(/周四/.test(f.trigger.textContent), `按钮文案未显示星期: ${f.trigger.textContent}`);
    assert.equal(f.value, '2026-11-12');
  } finally {
    env.cleanup();
  }
});

test('picker：点击日历面板中的某一天应写入日期并关闭面板', async () => {
  const env = await createSeededEnv();
  try {
    const f = env.Picker.dateField({ value: '2026-11-12' });
    env.document.body.appendChild(f.el);

    const p = openPicker(env, f);
    assert.ok(p, '日期面板未展开');
    assert.ok(/2026年11月/.test(p.textContent), `面板标题错误: ${p.textContent}`);

    // 找一个非今天、非当前选中日的格子点击
    const cells = Array.from(p.querySelectorAll('.picker-cell'));
    const target = cells.find((c) => !c.classList.contains('is-out') && !c.classList.contains('is-sel') && !c.classList.contains('is-today'));
    assert.ok(target, '未找到可选的日期格子');
    const dayNum = target.textContent;
    target.click();

    assert.equal(f.value, `2026-11-${String(dayNum).padStart(2, '0')}`, '点击后日期未写入');
    assert.equal(panel(env), null, '选择后面板未关闭');
    // 触发按钮文案应同步
    assert.ok(/2026-11/.test(f.trigger.textContent), '按钮文案未同步');
  } finally {
    env.cleanup();
  }
});

test('picker：日期面板的「今天/明天」快捷按钮应直接写入对应日期', async () => {
  const env = await createSeededEnv();
  try {
    const f = env.Picker.dateField({ value: '2020-01-01' });
    env.document.body.appendChild(f.el);

    const p = openPicker(env, f);
    const chip = Array.from(p.querySelectorAll('.picker-chip')).find((c) => c.textContent === '今天');
    assert.ok(chip, '未找到「今天」快捷按钮');
    chip.click();

    assert.equal(f.value, env.Utils.today(), '「今天」未写入当天日期');
    assert.equal(panel(env), null, '选择后面板未关闭');
  } finally {
    env.cleanup();
  }
});

test('picker：日期面板可翻到上/下个月', async () => {
  const env = await createSeededEnv();
  try {
    const f = env.Picker.dateField({ value: '2026-11-12' });
    env.document.body.appendChild(f.el);

    const p = openPicker(env, f);
    const next = Array.from(p.querySelectorAll('.picker-nav')).find((b) => b.title === '下一月');
    assert.ok(next, '未找到「下一月」按钮');
    next.click();

    assert.ok(/2026年12月/.test(p.textContent), '未切换到下个月');
    // 选中的 11-12 不在 12 月，12 月视图不应有选中格
    assert.ok(!p.querySelector('.picker-cell.is-sel'), '翻到下个月后不应仍显示原选中格');

    // 翻回原月，选中态应恢复
    const prev = Array.from(p.querySelectorAll('.picker-nav')).find((b) => b.title === '上一月');
    prev.click();
    assert.ok(/2026年11月/.test(p.textContent), '未切回原月份');
    assert.ok(p.querySelector('.picker-cell.is-sel'), '翻回后选中态丢失');
  } finally {
    env.cleanup();
  }
});

test('picker：时间字段应提供常用时段并支持点选', async () => {
  const env = await createSeededEnv();
  try {
    const f = env.Picker.timeField({ value: '09:00' });
    env.document.body.appendChild(f.el);

    const p = openPicker(env, f);
    assert.ok(p, '时间面板未展开');

    const chip = Array.from(p.querySelectorAll('.picker-chip')).find((c) => c.textContent === '14:00');
    assert.ok(chip, '未找到「14:00」常用时段');
    chip.click();

    assert.equal(f.value, '14:00', '常用时段未写入');
    assert.equal(panel(env), null, '选择后时间面板未关闭');
  } finally {
    env.cleanup();
  }
});

test('picker：时间面板应支持先选小时再选分钟', async () => {
  const env = await createSeededEnv();
  try {
    const f = env.Picker.timeField({ value: '09:00' });
    env.document.body.appendChild(f.el);

    const p = openPicker(env, f);
    // 小时区：00~23；分钟区：00~55（步长 5）
    const cells = Array.from(p.querySelectorAll('.picker-cell'));
    const hour20 = cells.find((c) => c.textContent === '20');
    assert.ok(hour20, '未找到 20 点');
    hour20.click();
    assert.equal(f.value, '09:00', '仅选小时不应立即提交');
    assert.ok(panel(env), '仅选小时后面板不应关闭');

    const min45 = Array.from(p.querySelectorAll('.picker-cell')).find((c) => c.textContent === '45');
    assert.ok(min45, '未找到 45 分');
    min45.click();

    assert.equal(f.value, '20:45', '小时 + 分钟组合未写入');
    assert.equal(panel(env), null, '选完分钟后面板未关闭');
  } finally {
    env.cleanup();
  }
});

test('picker：结束时间可基于开始时间一键推导', async () => {
  const env = await createSeededEnv();
  try {
    const start = env.Picker.timeField({ value: '09:00' });
    const end = env.Picker.timeField({
      value: '',
      relatedStart: function () {
        return start.value;
      },
    });
    env.document.body.appendChild(start.el);
    env.document.body.appendChild(end.el);

    const p = openPicker(env, end);
    const rel = Array.from(p.querySelectorAll('.picker-chip')).find((c) => c.textContent === '+1小时');
    assert.ok(rel, '未找到「+1小时」快捷');
    assert.ok(/基于开始时间 09:00/.test(p.textContent), '未显示基准开始时间');
    rel.click();

    assert.equal(end.value, '10:00', '相对快捷未正确推导结束时间');
  } finally {
    env.cleanup();
  }
});

test('picker：手动输入兜底可写入合法日期/时间', async () => {
  const env = await createSeededEnv();
  try {
    const f = env.Picker.dateField({ value: '2026-11-12' });
    env.document.body.appendChild(f.el);

    const p = openPicker(env, f);
    const mini = p.querySelector('.picker-mini');
    assert.ok(mini, '缺少手动输入兜底');
    mini.value = '2027-03-05';
    mini.dispatchEvent(
      new env.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );

    assert.equal(f.value, '2027-03-05', '手动输入未生效');
    assert.equal(panel(env), null, '手动输入生效后面板应关闭');
  } finally {
    env.cleanup();
  }
});

test('picker：非法的手动输入应被拒绝，不污染数据', async () => {
  const env = await createSeededEnv();
  try {
    const f = env.Picker.dateField({ value: '2026-11-12' });
    env.document.body.appendChild(f.el);

    const p = openPicker(env, f);
    const mini = p.querySelector('.picker-mini');
    mini.value = '不是日期';
    mini.dispatchEvent(new env.window.Event('keydown', { key: 'Enter', bubbles: true }));

    assert.equal(f.value, '2026-11-12', '非法输入不应改变原值');
  } finally {
    env.cleanup();
  }
});

test('picker：必填校验标红应同步到可见按钮', async () => {
  const env = await createSeededEnv();
  try {
    const f = env.Picker.timeField({ value: '' });
    env.document.body.appendChild(f.el);

    f.classList.add('input-invalid');
    assert.ok(f.classList.contains('input-invalid'), '内部 input 未标红');
    assert.ok(f.el.classList.contains('input-invalid'), '可见按钮未同步标红');

    f.classList.remove('input-invalid');
    assert.ok(!f.el.classList.contains('input-invalid'), '取消标红未同步');
  } finally {
    env.cleanup();
  }
});

test('picker：选择器应触发 input 事件，让既有联动逻辑生效', async () => {
  const env = await createSeededEnv();
  try {
    const f = env.Picker.timeField({ value: '09:00' });
    env.document.body.appendChild(f.el);

    let fired = 0;
    f.addEventListener('input', () => {
      fired++;
    });

    const p = openPicker(env, f);
    Array.from(p.querySelectorAll('.picker-chip')).find((c) => c.textContent === '10:00').click();

    assert.equal(fired, 1, '未触发 input 事件');
  } finally {
    env.cleanup();
  }
});

test('picker：Esc 只关闭选择面板，不应连带关闭外层弹窗', async () => {
  const env = await createSeededEnv();
  try {
    env.Tasks.openEditor(null);
    const modal = env.document.querySelector('#modal-host .panel');
    assert.ok(modal, '任务弹窗未打开');

    const startInput = modal.querySelector('input[type=time]');
    // 通过 picker 组件拿到触发按钮
    const trigger = modal.querySelectorAll('.picker-trigger')[1];
    assert.ok(trigger, '未找到时间选择触发按钮');
    trigger.click();
    assert.ok(panel(env), '时间面板未展开');

    env.document.dispatchEvent(
      new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );

    assert.equal(panel(env), null, 'Esc 未关闭选择面板');
    assert.ok(env.document.querySelector('#modal-host .panel'), 'Esc 连带关闭了任务弹窗');
    assert.equal(startInput.value, '09:00', 'Esc 不应改变已选值');
  } finally {
    env.cleanup();
  }
});

test('picker：点击面板外部应收起面板', async () => {
  const env = await createSeededEnv();
  try {
    const f = env.Picker.dateField({ value: '2026-11-12' });
    env.document.body.appendChild(f.el);

    openPicker(env, f);
    assert.ok(panel(env), '面板未展开');

    env.document.body.dispatchEvent(new env.window.MouseEvent('mousedown', { bubbles: true }));
    assert.equal(panel(env), null, '点击外部未收起面板');
  } finally {
    env.cleanup();
  }
});

test('picker：任务编辑弹窗应使用日期/时间选择控件', async () => {
  const env = await createSeededEnv();
  try {
    env.Tasks.openEditor(null);
    const modal = env.document.querySelector('#modal-host .panel');

    const triggers = modal.querySelectorAll('.picker-trigger');
    assert.equal(triggers.length, 3, `应有日期/开始/结束三个选择控件，实际 ${triggers.length}`);
    // 三个触发按钮都不是原生输入框，而是可点击的按钮
    triggers.forEach((t) => {
      assert.equal(t.tagName, 'BUTTON', '选择控件应为按钮');
      assert.equal(t.getAttribute('aria-haspopup'), 'dialog');
    });
    // 日期按钮应展示完整日期
    assert.ok(/\d{4}-\d{2}-\d{2}/.test(triggers[0].textContent), '日期按钮未展示日期');
  } finally {
    env.cleanup();
  }
});

test('picker：通过选择控件录入任务后，保存的日期与时间应正确', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.tasks.length;
    env.Tasks.openEditor(null);
    const modal = env.document.querySelector('#modal-host .panel');

    modal.querySelector('input[type=text]').value = '用选择器创建的任务';
    modal.querySelector('input[type=text]').dispatchEvent(
      new env.window.Event('input', { bubbles: true })
    );

    const triggers = modal.querySelectorAll('.picker-trigger');

    // 日期：用日历面板点选某一天
    triggers[0].click();
    let p = panel(env);
    const dayCell = Array.from(p.querySelectorAll('.picker-cell')).find(
      (c) => !c.classList.contains('is-out') && !c.classList.contains('is-sel') && !c.classList.contains('is-today')
    );
    const pickedDate = '2026-11-' + String(dayCell.textContent).padStart(2, '0');
    dayCell.click();

    // 开始时间：常用时段 09:00
    triggers[1].click();
    p = panel(env);
    Array.from(p.querySelectorAll('.picker-chip')).find((c) => c.textContent === '09:00').click();

    // 结束时间：基于开始时间 +1 小时
    triggers[2].click();
    p = panel(env);
    Array.from(p.querySelectorAll('.picker-chip')).find((c) => c.textContent === '+1小时').click();

    const saveBtn = Array.from(modal.querySelectorAll('button')).find((b) => /创建任务/.test(b.textContent));
    saveBtn.click();

    assert.equal(env.Store.state.tasks.length, before + 1, '任务未创建');
    const created = env.Store.state.tasks[env.Store.state.tasks.length - 1];
    assert.equal(created.date, pickedDate, `日期未正确保存: ${created.date}`);
    assert.equal(created.startTime, '09:00', `开始时间未正确保存: ${created.startTime}`);
    assert.equal(created.endTime, '10:00', `结束时间未正确保存: ${created.endTime}`);
  } finally {
    env.cleanup();
  }
});

test('picker：时间面板「清空」应允许留空，交由必填校验拦截', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.tasks.length;
    env.Tasks.openEditor(null);
    const modal = env.document.querySelector('#modal-host .panel');

    modal.querySelector('input[type=text]').value = '清空时间后应无法保存';
    modal.querySelector('input[type=text]').dispatchEvent(
      new env.window.Event('input', { bubbles: true })
    );

    const triggers = modal.querySelectorAll('.picker-trigger');
    triggers[1].click();
    const p = panel(env);
    Array.from(p.querySelectorAll('.picker-nav')).find((b) => b.textContent === '清空').click();

    const saveBtn = Array.from(modal.querySelectorAll('button')).find((b) => /创建任务/.test(b.textContent));
    saveBtn.click();

    assert.equal(env.Store.state.tasks.length, before, '时间为空仍创建了任务');
    assert.ok(env.document.querySelector('#modal-host .panel'), '弹窗被意外关闭');
  } finally {
    env.cleanup();
  }
});
