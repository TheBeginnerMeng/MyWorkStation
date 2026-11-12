/* ============================================================
   版本投产台账测试：
   - 投产内容类型字典（业务需求 / 技术优化 / 缺陷修复）
   - 数据模型归一化（脏数据清洗）
   - 统计口径（版本数 / 条目数 / 按类型 / 按开发人）
   - 版本与投产内容的必填校验、创建与编辑
   - 状态 / 类型 / 关键词筛选
   - 删除与复制
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createSeededEnv } = require('./harness');

/** 取最上层的弹窗（版本弹窗上还会叠一个「投产内容」弹窗） */
function topPanel(env) {
  const panels = env.document.querySelectorAll('#modal-host .panel');
  return panels[panels.length - 1] || null;
}

/** 在容器中按可见文本找到按钮并点击 */
function clickByText(root, matcher) {
  const btn = Array.from(root.querySelectorAll('button')).find((b) =>
    matcher.test(b.textContent.trim())
  );
  assert.ok(btn, `找不到按钮：${matcher}`);
  btn.click();
  return btn;
}

/** 版本弹窗里的文本输入框顺序：[版本号, 版本名称, 发布负责人] */
function versionInputs(modal) {
  return modal.querySelectorAll('input[type=text]');
}

/** 投产内容弹窗里的文本输入框顺序：[内容标题, 开发人] */
function itemInputs(modal) {
  return modal.querySelectorAll('input[type=text]');
}

/* ---------------- 数据模型 ---------------- */

test('版本投产：类型字典应包含业务需求 / 技术优化 / 缺陷修复', async () => {
  const env = await createSeededEnv();
  try {
    const labels = env.OpsDesk.DICT.releaseType.map((t) => t.label);
    assert.ok(labels.includes('业务需求'), '缺少「业务需求」类型');
    assert.ok(labels.includes('技术优化'), '缺少「技术优化」类型');
    assert.ok(labels.includes('缺陷修复'), '缺少「缺陷修复」类型');

    const statusLabels = env.OpsDesk.DICT.releaseStatus.map((s) => s.label);
    assert.ok(statusLabels.includes('已上线'), '缺少「已上线」状态');
    assert.ok(statusLabels.includes('待上线'), '缺少「待上线」状态');
  } finally {
    env.cleanup();
  }
});

test('版本投产：演示数据应包含版本与投产条目', async () => {
  const env = await createSeededEnv();
  try {
    const seed = env.Seed.build();
    assert.ok(Array.isArray(seed.releases), '演示数据缺少 releases');
    assert.ok(seed.releases.length > 0, '演示数据缺少版本记录');
    seed.releases.forEach((r) => {
      assert.ok(r.version, '版本缺少版本号');
      assert.ok(Array.isArray(r.items) && r.items.length > 0, '版本缺少投产内容');
      r.items.forEach((it) => {
        assert.ok(it.type, '投产内容缺少类型');
        assert.ok(it.dev, '投产内容缺少开发人');
      });
    });
  } finally {
    env.cleanup();
  }
});

test('版本投产：normalize 应清洗脏数据', async () => {
  const env = await createSeededEnv();
  try {
    const out = env.Seed.normalize({
      projects: [],
      tasks: [],
      incidents: [],
      timeLogs: [],
      releases: [
        { version: 'v1.0.0', status: 'weird-status', date: 'not-a-date', items: [
          { type: 'weird-type', title: '正常条目', dev: '张三' },
          { type: 'fix', title: '', dev: '李四' },
          { type: 'fix', title: '没有类型的条目' },
        ] },
        { version: '', items: [{ title: '没有版本号，应被丢弃' }] },
        { version: 'v2.0.0', items: [] },
      ],
    });

    assert.equal(out.releases.length, 2, '应保留 2 个有效版本');
    const v1 = out.releases.find((r) => r.version === 'v1.0.0');
    assert.equal(v1.status, 'planned', '非法状态应回落为「待上线」');
    assert.match(v1.date, /^\d{4}-\d{2}-\d{2}$/, '非法日期应回落为今天');
    assert.equal(v1.items.length, 2, '无标题的条目应被丢弃');
    assert.equal(v1.items[0].type, 'other', '非法类型应回落为「其他变更」');
    assert.equal(v1.items[1].dev, '', '缺失的开发人应归一为空串');
  } finally {
    env.cleanup();
  }
});

test('版本投产：统计口径应正确', async () => {
  const env = await createSeededEnv();
  try {
    env.Store.mutate((s) => {
      s.releases = [
        {
          id: 'rel_a', version: 'v1.0.0', date: '2026-01-01', status: 'released',
          items: [
            { id: 'i1', type: 'feature', title: '需求一', dev: '张三' },
            { id: 'i2', type: 'fix', title: '修复一', dev: '张三' },
          ],
        },
        {
          id: 'rel_b', version: 'v1.1.0', date: '2026-01-02', status: 'planned',
          items: [{ id: 'i3', type: 'fix', title: '修复二', dev: '李四' }],
        },
        { id: 'rel_c', version: 'v1.2.0', date: '2026-01-03', status: 'planned', items: [] },
      ];
    });

    const st = env.Store.releaseStats();
    assert.equal(st.total, 3, '版本总数不符');
    assert.equal(st.released, 1, '已上线版本数不符');
    assert.equal(st.planned, 2, '待上线版本数不符');
    assert.equal(st.items, 3, '投产条目总数不符');

    const feat = st.byType.find((b) => b.key === 'feature');
    const fix = st.byType.find((b) => b.key === 'fix');
    assert.equal(feat.count, 1, '业务需求计数不符');
    assert.equal(fix.count, 2, '缺陷修复计数不符');

    assert.deepEqual(st.byDev.map((d) => d.name), ['张三', '李四'], '开发人统计顺序不符');
    assert.equal(st.byDev[0].count, 2, '开发人条数不符');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 视图渲染 ---------------- */

test('版本投产：视图应渲染版本卡片并按类型分组', async () => {
  const env = await createSeededEnv();
  try {
    env.OpsDesk.App.go('releases');
    const root = env.document.getElementById('view-root');
    const text = root.textContent;

    assert.ok(text.includes('版本投产'), '视图标题不符');
    const rel = env.Store.state.releases[0];
    assert.ok(text.includes(rel.version), '未渲染版本号');
    assert.ok(text.includes('业务需求'), '未渲染业务需求分组');
    assert.ok(text.includes('技术优化'), '未渲染技术优化分组');
    assert.ok(text.includes('缺陷修复'), '未渲染缺陷修复分组');
    assert.ok(text.includes(rel.items[0].dev), '未渲染开发人');
  } finally {
    env.cleanup();
  }
});

test('版本投产：数据变更后视图应自动刷新', async () => {
  const env = await createSeededEnv();
  try {
    env.OpsDesk.App.go('releases');
    env.Store.mutate((s) => {
      s.releases.push({
        id: 'rel_auto', version: 'v9.9.9', title: '自动刷新验证', date: '2026-01-01',
        status: 'released', owner: '', note: '', items: [],
        createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    const root = env.document.getElementById('view-root');
    assert.ok(root.textContent.includes('v9.9.9'), '数据变更后版本视图未自动刷新');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 版本录入校验 ---------------- */

test('版本投产：版本号为空应被拦截', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.releases.length;
    env.Releases.openEditor(null);
    const modal = topPanel(env);
    assert.ok(modal, '未打开版本弹窗');

    clickByText(modal, /创建版本/);

    assert.equal(env.Store.state.releases.length, before, '版本号为空时不应创建版本');
    assert.ok(topPanel(env), '校验失败时弹窗不应关闭');
    assert.ok(modal.textContent.includes('请填写版本号'), '缺少版本号必填提示');
  } finally {
    env.cleanup();
  }
});

test('版本投产：填写版本号后错误提示应自动消除', async () => {
  const env = await createSeededEnv();
  try {
    env.Releases.openEditor(null);
    const modal = topPanel(env);
    clickByText(modal, /创建版本/);
    assert.ok(modal.textContent.includes('请填写版本号'), '应先出现版本号必填提示');

    const input = versionInputs(modal)[0];
    input.value = 'v3.3.3';
    input.dispatchEvent(new env.window.Event('input', { bubbles: true }));

    assert.ok(!modal.textContent.includes('请填写版本号'), '填写后错误提示未消除');
  } finally {
    env.cleanup();
  }
});

test('版本投产：投产内容填写完整后错误提示应自动消除', async () => {
  const env = await createSeededEnv();
  try {
    env.Releases.openEditor(null);
    const modal = topPanel(env);
    clickByText(modal, /添加投产内容/);
    const itemModal = topPanel(env);

    const itemF = itemInputs(itemModal);
    itemF[0].value = '有标题';
    itemF[0].dispatchEvent(new env.window.Event('input', { bubbles: true }));
    assert.ok(itemModal.textContent.includes('请填写开发人'), '应提示补填开发人');

    itemF[1].value = '张三';
    itemF[1].dispatchEvent(new env.window.Event('input', { bubbles: true }));
    assert.ok(!itemModal.textContent.includes('请填写开发人'), '填写后错误提示未消除');
  } finally {
    env.cleanup();
  }
});

test('版本投产：版本号重复应被拦截', async () => {  const env = await createSeededEnv();
  try {
    const exist = env.Store.state.releases[0].version;
    const before = env.Store.state.releases.length;

    env.Releases.openEditor(null);
    const modal = topPanel(env);
    const inputs = versionInputs(modal);
    inputs[0].value = exist;
    clickByText(modal, /创建版本/);

    assert.equal(env.Store.state.releases.length, before, '重复版本号不应创建新版本');
    assert.ok(modal.textContent.includes('已存在版本号'), '缺少重复版本号提示');
  } finally {
    env.cleanup();
  }
});

test('版本投产：应能创建带投产内容的版本', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.releases.length;

    env.Releases.openEditor(null);
    const modal = topPanel(env);

    const inputs = versionInputs(modal);
    inputs[0].value = 'v2.0.0';
    inputs[1].value = '春节保障版';
    inputs[2].value = '张三';
    modal.querySelector('select').value = 'released';

    // 添加一条投产内容
    clickByText(modal, /添加投产内容/);
    const itemModal = topPanel(env);
    assert.ok(itemModal, '未打开投产内容弹窗');
    const itemF = itemInputs(itemModal);
    itemF[0].value = '新增统一调度接口';
    itemF[1].value = '李四';
    itemModal.querySelector('select').value = 'feature';
    clickByText(itemModal, /添加条目/);

    // 回到版本弹窗保存
    const versionModal = topPanel(env);
    assert.ok(
      versionModal.textContent.includes('新增统一调度接口'),
      '投产内容未进入版本草稿'
    );
    clickByText(versionModal, /创建版本/);

    const after = env.Store.state.releases;
    assert.equal(after.length, before + 1, '版本未创建');
    const created = after[after.length - 1];
    assert.equal(created.version, 'v2.0.0', '版本号未写入');
    assert.equal(created.title, '春节保障版', '版本名称未写入');
    assert.equal(created.owner, '张三', '发布负责人未写入');
    assert.equal(created.status, 'released', '上线状态未写入');
    assert.equal(created.items.length, 1, '投产内容未写入');
    assert.equal(created.items[0].dev, '李四', '开发人未写入');
    assert.equal(created.items[0].type, 'feature', '内容类型未写入');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 投产内容校验 ---------------- */

test('版本投产：投产内容缺少开发人应被拦截', async () => {
  const env = await createSeededEnv();
  try {
    env.Releases.openEditor(null);
    const modal = topPanel(env);
    clickByText(modal, /添加投产内容/);

    const itemModal = topPanel(env);
    const itemF = itemInputs(itemModal);
    itemF[0].value = '有标题但没有开发人';
    clickByText(itemModal, /添加条目/);

    assert.ok(itemModal.textContent.includes('请填写开发人'), '缺少开发人必填提示');
    assert.ok(topPanel(env), '校验失败时条目弹窗不应关闭');
  } finally {
    env.cleanup();
  }
});

test('版本投产：投产内容缺少标题应被拦截', async () => {
  const env = await createSeededEnv();
  try {
    env.Releases.openEditor(null);
    const modal = topPanel(env);
    clickByText(modal, /添加投产内容/);

    const itemModal = topPanel(env);
    const itemF = itemInputs(itemModal);
    itemF[1].value = '张三';
    clickByText(itemModal, /添加条目/);

    assert.ok(itemModal.textContent.includes('请填写投产内容标题'), '缺少标题必填提示');
  } finally {
    env.cleanup();
  }
});

test('版本投产：编辑已保存版本的条目应落库', async () => {
  const env = await createSeededEnv();
  try {
    const rel = env.Store.state.releases[0];
    const itemId = rel.items[0].id;

    env.Releases.editItemOf(rel, rel.items[0]);
    const itemModal = topPanel(env);
    const itemF = itemInputs(itemModal);
    itemF[0].value = '改过的投产内容';
    clickByText(itemModal, /保存条目/);

    const after = env.Store.state.releases.find((r) => r.id === rel.id);
    const it = after.items.find((x) => x.id === itemId);
    assert.ok(it, '条目丢失');
    assert.equal(it.title, '改过的投产内容', '条目标题未更新');
  } finally {
    env.cleanup();
  }
});

test('版本投产：删除条目应同步移除', async () => {
  const env = await createSeededEnv();
  try {
    const rel = env.Store.state.releases[0];
    const itemId = rel.items[0].id;
    const before = rel.items.length;

    env.Releases.editItemOf(rel, rel.items[0]);
    const itemModal = topPanel(env);
    clickByText(itemModal, /删除条目/);

    const after = env.Store.state.releases.find((r) => r.id === rel.id);
    assert.equal(after.items.length, before - 1, '条目未被删除');
    assert.ok(!after.items.find((x) => x.id === itemId), '被删除的条目仍在');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 筛选 ---------------- */

test('版本投产：按类型筛选应只显示对应条目', async () => {
  const env = await createSeededEnv();
  try {
    env.Store.mutate((s) => {
      s.releases = [
        {
          id: 'rel_f', version: 'v1.0.0', date: '2026-01-01', status: 'released', items: [
            { id: 'i1', type: 'feature', title: '需求条目', dev: '张三' },
          ],
        },
        {
          id: 'rel_x', version: 'v1.1.0', date: '2026-01-02', status: 'released', items: [
            { id: 'i2', type: 'fix', title: '修复条目', dev: '李四' },
          ],
        },
      ];
    });

    env.Releases.filter.type = 'fix';
    env.OpsDesk.App.go('releases');
    let text = env.document.getElementById('view-root').textContent;
    assert.ok(text.includes('修复条目'), '类型筛选后未显示对应条目');
    assert.ok(!text.includes('需求条目'), '类型筛选后仍显示了其它类型的条目');

    env.Releases.filter.type = 'all';
  } finally {
    env.cleanup();
  }
});

test('版本投产：按状态筛选应只显示对应版本', async () => {
  const env = await createSeededEnv();
  try {
    env.Store.mutate((s) => {
      s.releases = [
        { id: 'rel_p', version: 'v1.0.0', date: '2026-01-01', status: 'planned', items: [] },
        { id: 'rel_r', version: 'v1.1.0', date: '2026-01-02', status: 'released', items: [] },
      ];
    });

    env.Releases.filter.status = 'planned';
    env.OpsDesk.App.go('releases');
    let text = env.document.getElementById('view-root').textContent;
    assert.ok(text.includes('v1.0.0'), '状态筛选后未显示待上线版本');
    assert.ok(!text.includes('v1.1.0'), '状态筛选后仍显示了其它状态的版本');

    env.Releases.filter.status = 'all';
  } finally {
    env.cleanup();
  }
});

test('版本投产：关键词搜索应命中开发人', async () => {
  const env = await createSeededEnv();
  try {
    env.Store.mutate((s) => {
      s.releases = [
        { id: 'rel_1', version: 'v1.0.0', date: '2026-01-01', status: 'released', items: [
          { id: 'i1', type: 'feature', title: '统一调度接口', dev: '王五' },
        ] },
        { id: 'rel_2', version: 'v1.1.0', date: '2026-01-02', status: 'released', items: [
          { id: 'i2', type: 'feature', title: '报表中心', dev: '赵六' },
        ] },
      ];
    });

    env.Releases.filter.keyword = '王五';
    env.OpsDesk.App.go('releases');
    let text = env.document.getElementById('view-root').textContent;
    assert.ok(text.includes('统一调度接口'), '按开发人搜索未命中');
    assert.ok(!text.includes('报表中心'), '按开发人搜索仍显示了无关内容');

    env.Releases.filter.keyword = '';
  } finally {
    env.cleanup();
  }
});

/* ---------------- 删除与复制 ---------------- */

test('版本投产：删除版本应连带删除条目', async () => {
  const env = await createSeededEnv();
  try {
    const rel = env.Store.state.releases[0];
    const before = env.Store.state.releases.length;

    env.Releases.removeRelease(rel);
    const confirm = topPanel(env);
    assert.ok(confirm, '未弹出删除确认');
    clickByText(confirm, /确认删除/);

    const after = env.Store.state.releases;
    assert.equal(after.length, before - 1, '版本未被删除');
    assert.ok(!after.find((r) => r.id === rel.id), '被删除的版本仍在');
  } finally {
    env.cleanup();
  }
});

test('版本投产：复制版本应以新建模式打开且版本号留空', async () => {
  const env = await createSeededEnv();
  try {
    const rel = env.Store.state.releases[0];
    env.Releases.copyRelease(rel);

    const modal = topPanel(env);
    assert.ok(modal, '未打开版本弹窗');
    assert.ok(modal.textContent.includes('创建版本'), '复制版本应走新建流程');

    const inputs = versionInputs(modal);
    assert.equal(inputs[0].value, '', '复制后版本号应留空待填');
    assert.ok(inputs[1].value.includes('副本'), '复制后版本名称应标注副本');
    assert.ok(
      modal.textContent.includes(rel.items[0].title),
      '复制后应带上原版本的投产内容'
    );
  } finally {
    env.cleanup();
  }
});

/* ---------------- 数据导出 ---------------- */

test('版本投产：导出备份应包含版本数据', async () => {
  const env = await createSeededEnv();
  try {
    const json = env.Storage.exportJSON(env.Store.state);
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed.state.releases), '备份中缺少 releases');
    assert.equal(parsed.state.releases.length, env.Store.state.releases.length, '备份版本数不符');
  } finally {
    env.cleanup();
  }
});
