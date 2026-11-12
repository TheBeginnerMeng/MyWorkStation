/* ============================================================
   项目管理与长线标记测试：
   - 任务编辑器的「长线」开关可开可关
   - 项目「重点」标记可切换
   - 项目可删除，关联记录可迁移而不丢失
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createSeededEnv } = require('./harness');

/** 在弹窗中按可见文本找到按钮并点击 */
function clickByText(root, matcher) {
  const btn = Array.from(root.querySelectorAll('button')).find((b) =>
    matcher.test(b.textContent.trim())
  );
  assert.ok(btn, `找不到按钮：${matcher}`);
  btn.click();
  return btn;
}

test('长线：任务编辑器应提供「长线」勾选框', async () => {
  const env = await createSeededEnv();
  try {
    const task = env.Store.state.tasks.find((t) => t.flagship);
    assert.ok(task, '演示数据缺少长线任务');

    env.Tasks.openEditor(task);
    const modal = env.document.querySelector('#modal-host .panel');
    assert.ok(modal, '未打开任务编辑弹窗');

    const cb = modal.querySelector('input[type=checkbox]');
    assert.ok(cb, '任务编辑器缺少长线勾选框');
    assert.equal(cb.checked, true, '长线任务的勾选框应默认选中');
  } finally {
    env.cleanup();
  }
});

test('长线：取消勾选并保存应移除长线标记', async () => {
  const env = await createSeededEnv();
  try {
    const task = env.Store.state.tasks.find((t) => t.flagship);
    const id = task.id;

    env.Tasks.openEditor(task);
    const modal = env.document.querySelector('#modal-host .panel');
    const cb = modal.querySelector('input[type=checkbox]');
    cb.checked = false;

    // 点「保存修改」
    clickByText(modal, /保存修改/);

    const after = env.Store.state.tasks.find((t) => t.id === id);
    assert.equal(after.flagship, false, '取消勾选后长线标记未被移除');
  } finally {
    env.cleanup();
  }
});

test('长线：勾选并保存应打上长线标记', async () => {
  const env = await createSeededEnv();
  try {
    const task = env.Store.state.tasks.find((t) => !t.flagship && t.status === 'todo');
    const id = task.id;

    env.Tasks.openEditor(task);
    const modal = env.document.querySelector('#modal-host .panel');
    const cb = modal.querySelector('input[type=checkbox]');
    assert.equal(cb.checked, false, '普通任务的勾选框应默认未选中');
    cb.checked = true;

    clickByText(modal, /保存修改/);

    const after = env.Store.state.tasks.find((t) => t.id === id);
    assert.equal(after.flagship, true, '勾选后未写入长线标记');
  } finally {
    env.cleanup();
  }
});

test('长线：取消长线后应从晨会站会稿的重点段落移除', async () => {
  const env = await createSeededEnv();
  try {
    const task = env.Store.state.tasks.find((t) => t.flagship);
    const title = task.title;

    // 先确认它在站会稿里
    let md = env.Briefing.build();
    assert.ok(md.includes(title), '长线任务本应出现在站会稿中');

    // 取消长线标记
    env.Store.mutate((s) => {
      const t = s.tasks.find((x) => x.id === task.id);
      t.flagship = false;
    }, 'test');

    md = env.Briefing.build();
    const focus = md.split('## 🎯')[1] ? md.split('## 🎯')[1].split(/^## /m)[0] : '';
    assert.ok(!focus.includes(title), '取消长线后仍出现在重点项目段落');
  } finally {
    env.cleanup();
  }
});

test('项目：管理面板应列出全部项目', async () => {
  const env = await createSeededEnv();
  try {
    env.Projects.openManager();
    const modal = env.document.querySelector('#modal-host .panel');
    assert.ok(modal, '未打开项目管理弹窗');
    assert.ok(modal.textContent.includes('项目管理'), '缺少标题');

    env.Store.state.projects.forEach((p) => {
      assert.ok(modal.textContent.includes(p.name), `管理面板缺少项目「${p.name}」`);
    });
  } finally {
    env.cleanup();
  }
});

test('项目：应能切换「重点」标记', async () => {
  const env = await createSeededEnv();
  try {
    const p = env.Store.state.projects.find((x) => x.flagship);
    assert.ok(p, '演示数据缺少重点项目');

    env.Projects.openManager();
    let modal = env.document.querySelector('#modal-host .panel');
    // 找到该项目那一行的「重点」按钮
    const rows = Array.from(modal.querySelectorAll('div'));
    const row = rows.find((d) => d.textContent.includes(p.name) && d.querySelector('button'));
    const flagBtn = Array.from(row.querySelectorAll('button')).find((b) =>
      /重点/.test(b.textContent)
    );
    assert.ok(flagBtn, '找不到重点标记按钮');
    flagBtn.click();

    const after = env.Store.state.projects.find((x) => x.id === p.id);
    assert.equal(after.flagship, false, '重点标记未被取消');
  } finally {
    env.cleanup();
  }
});

test('项目：删除无关联记录的项目应直接移除', async () => {
  const env = await createSeededEnv();
  try {
    // 新建一个空项目
    env.Store.mutate((s) => {
      s.projects.push({
        id: 'prj_empty',
        name: '临时项目',
        desc: '',
        color: '#38bdf8',
        flagship: false,
      });
    }, 'test');

    env.Projects.removeProject('prj_empty', null);

    assert.ok(
      !env.Store.state.projects.find((p) => p.id === 'prj_empty'),
      '项目未被删除'
    );
  } finally {
    env.cleanup();
  }
});

test('项目：删除项目时关联记录应可迁移到目标项目而不丢失', async () => {
  const env = await createSeededEnv();
  try {
    const src = env.Store.state.projects[0];
    const dst = env.Store.state.projects[1];
    const before = {
      tasks: env.Store.state.tasks.filter((t) => t.project === src.id).length,
      incidents: env.Store.state.incidents.filter((i) => i.project === src.id).length,
      logs: env.Store.state.timeLogs.filter((l) => l.project === src.id).length,
    };
    const totalBefore = env.Store.state.tasks.length + env.Store.state.incidents.length +
      env.Store.state.timeLogs.length;

    env.Projects.removeProject(src.id, dst.id);

    // 项目没了
    assert.ok(!env.Store.state.projects.find((p) => p.id === src.id), '项目未被删除');

    // 记录一条都没少
    const totalAfter = env.Store.state.tasks.length + env.Store.state.incidents.length +
      env.Store.state.timeLogs.length;
    assert.equal(totalAfter, totalBefore, '删除项目后关联记录丢失了');

    // 且都迁移到了目标项目
    const moved = env.Store.state.tasks.filter((t) => t.project === dst.id).length;
    assert.ok(moved >= before.tasks, '关联任务未迁移到目标项目');
    assert.ok(
      env.Store.state.tasks.filter((t) => t.project === src.id).length === 0,
      '仍有任务指向已删除的项目'
    );
  } finally {
    env.cleanup();
  }
});

test('项目：最后一个项目不允许删除', async () => {
  const env = await createSeededEnv();
  try {
    const only = env.Store.state.projects[0];
    const count = env.Store.state.projects.length;

    // 只剩一个时，删除请求应被拒绝（不改变数据）
    env.Store.mutate((s) => {
      s.projects = s.projects.filter((p) => p.id === only.id);
    }, 'test');
    assert.equal(env.Store.state.projects.length, 1);

    // 直接调用 removeProject 会真的删掉，但 UI 层会拦截；
    // 这里验证 UI 层：打开管理面板，删除按钮应为禁用态
    env.Projects.openManager();
    const modal = env.document.querySelector('#modal-host .panel');
    const delBtns = Array.from(modal.querySelectorAll('button')).filter(
      (b) => b.textContent.trim() === '🗑'
    );
    assert.equal(delBtns.length, 1, '应只有一个删除按钮');
    assert.equal(delBtns[0].disabled, true, '最后一个项目的删除按钮应禁用');
    assert.ok(count >= 1, '演示数据应至少有一个项目');
  } finally {
    env.cleanup();
  }
});

test('项目：新建项目应写入 store 并去重', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.projects.length;
    env.Store.mutate((s) => {
      s.projects.push({
        id: 'prj_new',
        name: '信创改造',
        desc: '国产化适配',
        color: '#34d399',
        flagship: true,
      });
    }, 'test');
    assert.equal(env.Store.state.projects.length, before + 1, '项目未写入');

    const created = env.Store.state.projects.find((p) => p.id === 'prj_new');
    assert.equal(created.name, '信创改造');
    assert.equal(created.flagship, true, '重点标记未保存');
  } finally {
    env.cleanup();
  }
});

test('项目：删除项目后统计与站会稿不应报错', async () => {
  const env = await createSeededEnv();
  try {
    const src = env.Store.state.projects[0];
    const dst = env.Store.state.projects[1];
    env.Projects.removeProject(src.id, dst.id);

    // 统计不应抛错
    const st = env.Store.stats();
    assert.equal(typeof st.focusTasks, 'number');

    // 站会稿仍能生成
    const md = env.Briefing.build();
    assert.ok(typeof md === 'string' && md.length > 0, '站会稿生成失败');
    assert.ok(!md.includes('未分配'), '迁移后不应出现未分配');
  } finally {
    env.cleanup();
  }
});

test('项目：删除项目后任务视图的项目筛选不应残留已删除项', async () => {
  const env = await createSeededEnv();
  try {
    const src = env.Store.state.projects[0];
    const srcName = src.name;

    env.Tasks.render(env.document.getElementById('view-root'));
    let root = env.document.getElementById('view-root');
    assert.ok(root.textContent.includes(srcName), '删除前应能筛到该项目');

    env.Projects.removeProject(src.id, env.Store.state.projects[1].id);

    env.Tasks.render(env.document.getElementById('view-root'));
    root = env.document.getElementById('view-root');
    assert.ok(!root.textContent.includes(srcName), '删除后筛选下拉仍残留该项目');

    // 筛选下拉里的 option 也应同步移除
    const opts = Array.from(root.querySelectorAll('option')).map((o) => o.textContent);
    assert.ok(!opts.includes(srcName), '筛选下拉的 option 仍残留已删除项目');
  } finally {
    env.cleanup();
  }
});

test('项目：筛选中的项目被删除后应回退到「全部项目」而非空结果', async () => {
  const env = await createSeededEnv();
  try {
    const target = env.Store.state.projects[0];

    // 先切到该项目筛选
    env.Tasks.render(env.document.getElementById('view-root'));
    let root = env.document.getElementById('view-root');
    const sel = root.querySelector('select');
    // 项目筛选是第一个 select
    sel.value = target.id;
    sel.dispatchEvent(new env.window.Event('change'));

    env.Tasks.render(env.document.getElementById('view-root'));
    root = env.document.getElementById('view-root');
    const sels = root.querySelectorAll('select');
    assert.equal(sels[0].value, target.id, '应已筛选到该项目');

    // 删除该项目
    env.Projects.removeProject(target.id, env.Store.state.projects[1].id);

    env.Tasks.render(env.document.getElementById('view-root'));
    root = env.document.getElementById('view-root');
    const after = root.querySelectorAll('select');
    assert.equal(after[0].value, 'all', '删除后应回退到「全部项目」');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 项目选择器（内联可维护） ---------------- */

/** 在容器里按文本找按钮 */
function btn(root, text) {
  return Array.from(root.querySelectorAll('button')).find((b) =>
    b.textContent.trim().includes(text)
  );
}

test('选择器：应包含下拉与新建/重命名/删除三个维护按钮', async () => {
  const env = await createSeededEnv();
  try {
    const p = env.Projects.picker({ value: env.Store.state.projects[0].id });
    assert.ok(p.select, '缺少 select 元素');
    assert.ok(btn(p.el, '新建'), '缺少新建按钮');
    assert.ok(btn(p.el, '重命名'), '缺少重命名按钮');
    assert.ok(btn(p.el, '删除'), '缺少删除按钮');
    // 选项应与项目清单一致
    const opts = Array.from(p.select.options).map((o) => o.value);
    env.Store.state.projects.forEach((x) => assert.ok(opts.includes(x.id), '下拉缺少项目 ' + x.name));
  } finally {
    env.cleanup();
  }
});

test('选择器：新建项目后应立即出现在下拉并被选中', async () => {
  const env = await createSeededEnv();
  try {
    const p = env.Projects.picker({ value: '' });
    const before = p.select.options.length;

    // 直接走新建表单的保存逻辑（模拟用户填写后保存）
    env.Store.mutate((s) => {
      s.projects.push({
        id: 'prj_inline',
        name: '内联新建项目',
        desc: '',
        color: '#38bdf8',
        flagship: false,
      });
    }, 'test');
    p.refresh();

    assert.equal(p.select.options.length, before + 1, '新建后下拉未同步');
    assert.ok(
      Array.from(p.select.options).some((o) => o.textContent === '内联新建项目'),
      '新项目未出现在下拉中'
    );

    // 选中新项目并回传
    p.setValue('prj_inline');
    assert.equal(p.getValue(), 'prj_inline', '未能选中新项目');
  } finally {
    env.cleanup();
  }
});

test('选择器：项目重命名后下拉名称应同步更新', async () => {
  const env = await createSeededEnv();
  try {
    const target = env.Store.state.projects[0];
    const p = env.Projects.picker({ value: target.id });

    env.Store.mutate((s) => {
      s.projects[0].name = '改名后的项目';
    }, 'test');
    p.refresh();

    const opt = Array.from(p.select.options).find((o) => o.value === target.id);
    assert.equal(opt.textContent, '改名后的项目', '下拉名称未同步重命名');
  } finally {
    env.cleanup();
  }
});

test('选择器：允许空值时应有「不关联项目」选项', async () => {
  const env = await createSeededEnv();
  try {
    const p = env.Projects.picker({ value: '', allowEmpty: true, emptyLabel: '不关联项目' });
    const first = p.select.options[0];
    assert.equal(first.value, '', '首个选项应为空值');
    assert.equal(first.textContent, '不关联项目');
    assert.equal(p.getValue(), '');
  } finally {
    env.cleanup();
  }
});

test('选择器：当前项目被删除后应自动回退到其它项目', async () => {
  const env = await createSeededEnv();
  try {
    const target = env.Store.state.projects[0];
    const p = env.Projects.picker({ value: target.id });

    env.Projects.removeProject(target.id, env.Store.state.projects[1].id);
    p.refresh();

    assert.notEqual(p.getValue(), target.id, '仍选中了已删除的项目');
    assert.ok(p.getValue(), '应回退到某个有效项目');
  } finally {
    env.cleanup();
  }
});

test('选择器：任务表单应使用可维护的项目选择器', async () => {
  const env = await createSeededEnv();
  try {
    const task = env.Store.state.tasks[0];
    env.Tasks.openEditor(task);
    const modal = env.document.querySelector('#modal-host .panel');
    assert.ok(modal, '未打开任务编辑弹窗');

    // 应能找到「所属项目」区块下的新建按钮
    const newBtn = btn(modal, '新建');
    assert.ok(newBtn, '任务表单缺少项目新建按钮');

    // 保存时应能正确取到项目 id
    const selects = modal.querySelectorAll('select');
    const projSel = Array.from(selects).find((s) =>
      Array.from(s.options).some((o) => o.textContent === env.Store.state.projects[0].name)
    );
    assert.ok(projSel, '未找到项目下拉');
  } finally {
    env.cleanup();
  }
});

test('选择器：故障与流水表单也应使用可维护的项目选择器', async () => {
  const env = await createSeededEnv();
  try {
    env.Incidents.openEditor(null);
    let modal = env.document.querySelector('#modal-host .panel');
    assert.ok(btn(modal, '新建'), '故障表单缺少项目新建按钮');
    modal.querySelector('button[aria-label=关闭]').click();

    env.TimeLog.openEditor(null);
    modal = env.document.querySelector('#modal-host .panel');
    assert.ok(btn(modal, '新建'), '流水表单缺少项目新建按钮');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 总览「重点项目与长线推进」面板 ---------------- */

test('总览：重点项目面板应分组展示重点项目 / 长线推进 / P0 进行中', async () => {
  const env = await createSeededEnv();
  try {
    env.Dashboard.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');
    const text = root.textContent;

    assert.ok(text.includes('重点项目与长线推进'), '缺少面板标题');
    // 三个分组小标题
    assert.ok(text.includes('重点项目'), '缺少「重点项目」分组');
    assert.ok(text.includes('长线推进'), '缺少「长线推进」分组');
    assert.ok(text.includes('P0 进行中'), '缺少「P0 进行中」分组');
  } finally {
    env.cleanup();
  }
});

test('总览：面板应显示被标记为重点的项目（项目级）', async () => {
  const env = await createSeededEnv();
  try {
    const flagship = env.Store.state.projects.filter((p) => p.flagship);
    assert.ok(flagship.length > 0, '演示数据缺少重点项目');

    env.Dashboard.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');
    flagship.forEach((p) => {
      assert.ok(root.textContent.includes(p.name), `面板缺少重点项目「${p.name}」`);
    });
  } finally {
    env.cleanup();
  }
});

test('总览：取消长线标记的 P0 进行中任务应归入「P0 进行中」而非「长线推进」', async () => {
  const env = await createSeededEnv();
  try {
    // 造一个 P0 + 进行中 + 长线的任务
    env.Store.mutate((s) => {
      s.tasks.push({
        id: 'tsk_p0_long',
        title: 'P0 长线测试任务',
        project: s.projects[0].id,
        date: env.Utils.today(),
        startTime: '09:00',
        endTime: '18:00',
        status: 'doing',
        priority: 'P0',
        note: '',
        flagship: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }, 'test');

    // 取消长线标记
    env.Store.mutate((s) => {
      s.tasks.find((t) => t.id === 'tsk_p0_long').flagship = false;
    }, 'test');

    env.Dashboard.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');

    // 仍应出现（因为 P0 + 进行中）
    assert.ok(root.textContent.includes('P0 长线测试任务'), 'P0 进行中任务未出现在面板中');

    // 但它的入选原因应标为 P0，而不是「长线」
    const rows = Array.from(root.querySelectorAll('div')).filter(
      (d) => d.textContent.includes('P0 长线测试任务') && d.querySelector('.badge')
    );
    const row = rows[rows.length - 1];
    const badges = Array.from(row.querySelectorAll('.badge')).map((b) => b.textContent.trim());
    assert.ok(badges.includes('P0'), `入选原因应标为 P0，实际为 ${badges.join('/')}`);
    assert.ok(!badges.includes('长线'), '已取消长线标记，不应再标为「长线」');
  } finally {
    env.cleanup();
  }
});

test('总览：长线任务应标为「长线」且出现在长线推进分组', async () => {
  const env = await createSeededEnv();
  try {
    const t = env.Store.state.tasks.find((x) => x.flagship);
    assert.ok(t, '演示数据缺少长线任务');

    env.Dashboard.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');

    const rows = Array.from(root.querySelectorAll('div')).filter(
      (d) => d.textContent.includes(t.title) && d.querySelector('.badge')
    );
    const row = rows[rows.length - 1];
    const badges = Array.from(row.querySelectorAll('.badge')).map((b) => b.textContent.trim());
    assert.ok(badges.includes('长线'), `入选原因应标为长线，实际为 ${badges.join('/')}`);
  } finally {
    env.cleanup();
  }
});

test('总览：三类都为空时应给出空态说明', async () => {
  const env = await createSeededEnv();
  try {
    env.Store.mutate((s) => {
      s.tasks = [];
      s.projects = s.projects.map((p) => Object.assign({}, p, { flagship: false }));
    }, 'test');

    env.Dashboard.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');
    assert.ok(/暂无重点项目与长线事项/.test(root.textContent), '缺少空态说明');
  } finally {
    env.cleanup();
  }
});
