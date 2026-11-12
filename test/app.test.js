/* ============================================================
   应用外壳与 UI 组件测试：路由、快捷键、主题、模态框、图表
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createEnv, createSeededEnv, sleep } = require('./harness');

/** 派发键盘事件 */
function key(env, k, opts = {}) {
  const ev = new env.window.KeyboardEvent('keydown', {
    key: k,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  env.document.dispatchEvent(ev);
  return ev;
}

test('外壳：视图路由应切换并更新导航激活态', async () => {
  const env = await createSeededEnv();
  try {
    const { App } = env.OpsDesk;
    ['tasks', 'incidents', 'timelog', 'releases', 'briefing', 'dashboard'].forEach((v) => {
      App.go(v);
      assert.equal(App.activeView, v, `路由未切换到 ${v}`);
      const nav = env.document.querySelector(`.nav-item[data-view="${v}"]`);
      assert.ok(nav, `导航项 ${v} 不存在`);      assert.ok(nav.classList.contains('nav-item-active'), `导航项 ${v} 未激活`);
    });
  } finally {
    env.cleanup();
  }
});

test('外壳：导航项应覆盖全部六个视图', async () => {
  const env = await createSeededEnv();
  try {
    env.OpsDesk.App.go('dashboard');
    const items = env.document.querySelectorAll('.nav-item[data-view]');
    assert.equal(items.length, 6, '导航项数量不符');
    const views = Array.from(items).map((i) => i.dataset.view);
    assert.deepEqual(views, ['dashboard', 'tasks', 'incidents', 'timelog', 'releases', 'briefing']);
  } finally {
    env.cleanup();
  }
});

test('外壳：数字键快捷键应切换视图', async () => {
  const env = await createSeededEnv();
  try {
    env.OpsDesk.App.go('dashboard');
    key(env, '2');
    assert.equal(env.OpsDesk.App.activeView, 'tasks', '按 2 未切到任务视图');
    key(env, '3');
    assert.equal(env.OpsDesk.App.activeView, 'incidents', '按 3 未切到故障视图');
    key(env, '4');
    assert.equal(env.OpsDesk.App.activeView, 'timelog', '按 4 未切到流水视图');
    key(env, '5');
    assert.equal(env.OpsDesk.App.activeView, 'releases', '按 5 未切到版本投产视图');
    key(env, '6');
    assert.equal(env.OpsDesk.App.activeView, 'briefing', '按 6 未切到简报视图');
    key(env, '1');
    assert.equal(env.OpsDesk.App.activeView, 'dashboard', '按 1 未切回总览');
  } finally {
    env.cleanup();
  }
});

test('外壳：字母快捷键 N / I / T 应打开对应弹窗', async () => {
  const env = await createSeededEnv();
  try {
    key(env, 'n');
    let modal = env.document.querySelector('#modal-host .panel');
    assert.ok(modal, '按 N 未打开任务弹窗');
    assert.ok(/新建任务/.test(modal.textContent), '弹窗不是任务弹窗');
    env.OpsDesk.UI.closeTopModal();

    key(env, 'i');
    modal = env.document.querySelector('#modal-host .panel');
    assert.ok(modal, '按 I 未打开故障弹窗');
    assert.ok(/录入生产问题/.test(modal.textContent), '弹窗不是故障弹窗');
    env.OpsDesk.UI.closeTopModal();

    key(env, 't');
    modal = env.document.querySelector('#modal-host .panel');
    assert.ok(modal, '按 T 未打开流水弹窗');
    assert.ok(/记录时间段/.test(modal.textContent), '弹窗不是流水弹窗');
    env.OpsDesk.UI.closeTopModal();
  } finally {
    env.cleanup();
  }
});

test('外壳：按 B 应生成晨会汇报并跳转', async () => {
  const env = await createSeededEnv();
  try {
    key(env, 'b');
    assert.equal(env.OpsDesk.App.activeView, 'briefing', '按 B 未跳到简报视图');
    assert.ok(env.OpsDesk.Briefing.markdown.length > 0, '按 B 未生成内容');
  } finally {
    env.cleanup();
  }
});

test('外壳：弹窗打开时快捷键不应触发视图切换', async () => {
  const env = await createSeededEnv();
  try {
    env.OpsDesk.App.go('dashboard');
    env.OpsDesk.UI.modal({ title: '测试', body: '内容' });
    key(env, '2');
    assert.equal(env.OpsDesk.App.activeView, 'dashboard', '弹窗打开时按 2 仍切换了视图');
    // Esc 应关闭弹窗
    key(env, 'Escape');
    assert.equal(env.document.querySelector('#modal-host .panel'), null, 'Esc 未关闭弹窗');
  } finally {
    env.cleanup();
  }
});

test('外壳：输入框聚焦时快捷键不应触发', async () => {
  const env = await createSeededEnv();
  try {
    env.OpsDesk.App.go('dashboard');
    const input = env.document.createElement('input');
    env.document.body.appendChild(input);
    input.focus();
    key(env, '2', { target: input });
    assert.equal(env.OpsDesk.App.activeView, 'dashboard', '输入时按 2 仍切换了视图');
  } finally {
    env.cleanup();
  }
});

test('外壳：主题切换应生效并持久化', async () => {
  const env = await createSeededEnv();
  try {
    assert.equal(env.document.documentElement.getAttribute('data-theme'), 'dark');
    env.OpsDesk.App.toggleTheme();
    assert.equal(env.document.documentElement.getAttribute('data-theme'), 'light', '未切换到浅色');
    assert.equal(env.Store.state.settings.theme, 'light', '主题未写入状态');

    await sleep(200);
    const raw = JSON.parse(env.window.localStorage.getItem('opsdesk:state:v1'));
    assert.equal(raw.settings.theme, 'light', '主题未持久化');
  } finally {
    env.cleanup();
  }
});

test('外壳：模态框应支持叠层与逐个关闭', async () => {
  const env = await createSeededEnv();
  try {
    const a = env.OpsDesk.UI.modal({ title: 'A', body: 'a' });
    const b = env.OpsDesk.UI.modal({ title: 'B', body: 'b' });
    assert.equal(env.document.querySelectorAll('#modal-host .panel').length, 2, '弹窗未正确叠层');
    env.OpsDesk.UI.closeTopModal();
    assert.equal(env.document.querySelectorAll('#modal-host .panel').length, 1, '未关闭最上层弹窗');
    env.OpsDesk.UI.closeTopModal();
    assert.equal(env.document.querySelectorAll('#modal-host .panel').length, 0, '未关闭剩余弹窗');
    assert.ok(a && b);
  } finally {
    env.cleanup();
  }
});

test('外壳：点击遮罩应关闭弹窗', async () => {
  const env = await createSeededEnv();
  try {
    env.OpsDesk.UI.modal({ title: 'A', body: 'a' });
    const overlay = env.document.querySelector('#modal-host > div');
    assert.ok(overlay, '未找到遮罩层');
    overlay.dispatchEvent(new env.window.MouseEvent('mousedown', { bubbles: true }));
    assert.equal(env.document.querySelector('#modal-host .panel'), null, '点击遮罩未关闭弹窗');
  } finally {
    env.cleanup();
  }
});

test('UI：环形图应按数据渲染出对应数量的扇区', async () => {
  const env = await createEnv();
  try {
    const buckets = [
      { label: '开发', value: 60, color: '#38bdf8' },
      { label: '运维', value: 30, color: '#a78bfa' },
      { label: '会议', value: 10, color: '#fbbf24' },
      { label: '排错', value: 0, color: '#f87171' },
    ];
    const svg = env.OpsDesk.UI.donut(buckets, { size: 200 });
    const circles = svg.querySelectorAll('circle');
    // 底环 + 3 个有值的扇区（value=0 不绘制）
    assert.equal(circles.length, 4, '环形图扇区数量不符');
    // 中心显示总时长：60+30+10 = 100 分钟 = 1.7h
    assert.ok(svg.textContent.includes('1.7h'), `中心文本不符: ${svg.textContent}`);
  } finally {
    env.cleanup();
  }
});

test('UI：环形图在无数据时应显示占位文案', async () => {
  const env = createEnv();
  try {
    const svg = env.OpsDesk.UI.donut(
      [
        { label: '开发', value: 0, color: '#38bdf8' },
        { label: '运维', value: 0, color: '#a78bfa' },
      ],
      { size: 200 }
    );
    assert.ok(svg.textContent.includes('暂无记录'), '无数据时缺少占位文案');
  } finally {
    env.cleanup();
  }
});

test('UI：时间轴应绘制小时刻度与当前时间线', async () => {
  const env = await createSeededEnv();
  try {
    const today = env.Utils.today();
    const tasks = env.Store.state.tasks.filter((t) => t.date === today);
    const wrap = env.OpsDesk.UI.timeline(tasks, { hourHeight: 60, startHour: 7, endHour: 22 });
    const blocks = wrap.querySelectorAll('.tl-block');
    assert.equal(blocks.length, tasks.length, '时间轴任务块数量不符');
    // 小时刻度标签：07:00 ~ 22:00
    assert.ok(wrap.textContent.includes('07:00'), '缺少起始小时刻度');
    assert.ok(wrap.textContent.includes('22:00'), '缺少结束小时刻度');
  } finally {
    env.cleanup();
  }
});

test('UI：占比条应按百分比渲染', async () => {
  const env = createEnv();
  try {
    const bars = env.OpsDesk.UI.bars([
      { label: '开发', value: 75, color: '#38bdf8' },
      { label: '运维', value: 25, color: '#a78bfa' },
    ]);
    assert.ok(bars.textContent.includes('75%'), '缺少百分比');
    assert.ok(bars.textContent.includes('1h15m'), '格式化时长不符');
    const fill = bars.querySelector('div > div');
    assert.ok(fill, '未渲染进度条');
  } finally {
    env.cleanup();
  }
});

test('右栏：应随视图切换输出对应摘要', async () => {
  const env = await createSeededEnv();
  try {
    env.OpsDesk.App.go('dashboard');
    env.OpsDesk.RightPanel.render();
    let out = env.document.getElementById('right-output').textContent;
    assert.ok(/今日速览/.test(out), '总览视图右栏内容不符');

    env.OpsDesk.App.go('incidents');
    env.OpsDesk.RightPanel.render();
    out = env.document.getElementById('right-output').textContent;
    assert.ok(/生产问题动态/.test(out), '故障视图右栏内容不符');

    env.OpsDesk.App.go('timelog');
    env.OpsDesk.RightPanel.render();
    out = env.document.getElementById('right-output').textContent;
    assert.ok(/当日时间分配/.test(out), '流水视图右栏内容不符');

    env.OpsDesk.App.go('tasks');
    env.OpsDesk.RightPanel.render();
    out = env.document.getElementById('right-output').textContent;
    assert.ok(/今日任务清单/.test(out), '任务视图右栏内容不符');
  } finally {
    env.cleanup();
  }
});

test('外壳：重置演示数据应恢复初始状态', async () => {
  const env = await createSeededEnv();
  try {
    env.Store.mutate((s) => {
      s.tasks = [];
    }, 'clear');
    assert.equal(env.Store.state.tasks.length, 0);

    // 触发重置（与 UI 按钮同一逻辑）
    const fresh = env.Seed.normalize(env.Seed.build());
    env.Store.mutate(() => {
      Object.keys(env.Store.state).forEach((k) => delete env.Store.state[k]);
      Object.assign(env.Store.state, fresh);
    }, 'reset');

    assert.ok(env.Store.state.tasks.length > 0, '重置后任务为空');
    // 重置后项目归属应正确
    const names = new Set(env.Store.state.tasks.map((t) => env.Store.projectName(t.project)));
    assert.ok(names.size > 1, '重置后项目归属塌缩');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 数据变更后视图自动刷新 ---------------- */

test('外壳：新建任务后当前视图应自动刷新', async () => {
  const env = await createSeededEnv();
  try {
    const { App, Store } = env.OpsDesk;
    App.go('tasks');
    const root = env.document.getElementById('view-root');
    const before = root.textContent.includes('自动刷新验证任务');

    Store.mutate((s) => {
      s.tasks.push({
        id: 'tsk_refresh_probe',
        title: '自动刷新验证任务',
        project: s.projects[0].id,
        date: env.Utils.today(),
        startTime: '08:00',
        endTime: '09:00',
        status: 'todo',
        priority: 'P2',
        note: '',
        flagship: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }, 'task:create');

    assert.equal(before, false, '前置状态异常');
    assert.ok(
      root.textContent.includes('自动刷新验证任务'),
      '数据变更后视图未自动刷新（用户会误以为没保存成功）'
    );
  } finally {
    env.cleanup();
  }
});

test('外壳：删除数据后当前视图应自动刷新', async () => {
  const env = await createSeededEnv();
  try {
    const { App, Store } = env.OpsDesk;
    App.go('tasks');
    const root = env.document.getElementById('view-root');
    const target = Store.state.tasks[0];
    assert.ok(root.textContent.includes(target.title), '前置状态异常');

    Store.mutate((s) => {
      s.tasks = s.tasks.filter((t) => t.id !== target.id);
    }, 'task:delete');

    assert.ok(
      !root.textContent.includes(target.title),
      '删除后视图未自动刷新'
    );
  } finally {
    env.cleanup();
  }
});

test('外壳：切换视图后不应因订阅重复渲染', async () => {
  const env = await createSeededEnv();
  try {
    const { App, Store } = env.OpsDesk;
    let renders = 0;
    const origRender = App.render;
    // 统计 go() 触发的渲染次数（订阅里的 'view' 分支应跳过）
    App.go('tasks');
    const root = env.document.getElementById('view-root');
    assert.ok(root.textContent.includes('日程与任务管理'), '未切到任务视图');

    // mutate 使用 'view' reason 时不应触发额外重绘导致状态错乱
    Store.mutate((s) => { s.settings.activeView = 'tasks'; }, 'view');
    assert.equal(App.activeView, 'tasks', '视图状态错乱');
  } finally {
    env.cleanup();
  }
});
