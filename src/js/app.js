/* ============================================================
   app.js — 应用外壳：导航 / 视图路由 / 全局快捷键 / 主题 / 数据管理
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;
  var Store = global.OpsDesk.Store;
  var UI = global.OpsDesk.UI;

  var VIEWS = [
    { key: 'dashboard', label: '工作台总览', icon: '◈', shortcut: '1' },
    { key: 'tasks', label: '日程与任务', icon: '▤', shortcut: '2' },
    { key: 'incidents', label: '生产问题排查', icon: '⚠', shortcut: '3' },
    { key: 'timelog', label: '时间流水账', icon: '◷', shortcut: '4' },
    { key: 'releases', label: '版本投产', icon: '⧉', shortcut: '5' },
    { key: 'queries', label: '取数登记', icon: '⊞', shortcut: '6' },
    { key: 'briefing', label: '晨会汇报', icon: '✦', shortcut: '7' },
  ];

  var activeView = 'dashboard';
  var els = {};

  /* ---------------- 主题 ---------------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var btn = els.themeBtn;
    if (btn) {
      btn.textContent = theme === 'dark' ? '☾' : '☀';
      btn.title = theme === 'dark' ? '切换到浅色模式 (⌘/Ctrl + Shift + L)' : '切换到深色模式 (⌘/Ctrl + Shift + L)';
    }
  }

  function toggleTheme() {
    var next = Store.state.settings.theme === 'dark' ? 'light' : 'dark';
    Store.mutate(function (s) {
      s.settings.theme = next;
    }, 'theme');
    applyTheme(next);
    U.toast('已切换到' + (next === 'dark' ? '深色' : '浅色') + '模式', 'success', 1400);
  }

  /* ---------------- 视图渲染 ---------------- */

  var RENDERERS = {
    dashboard: function (root) { global.OpsDesk.Dashboard.render(root); },
    tasks: function (root) { global.OpsDesk.Tasks.render(root); },
    incidents: function (root) { global.OpsDesk.Incidents.render(root); },
    timelog: function (root) { global.OpsDesk.TimeLog.render(root); },
    releases: function (root) { global.OpsDesk.Releases.render(root); },
    queries: function (root) { global.OpsDesk.Queries.render(root); },
    briefing: function (root) { global.OpsDesk.Briefing.render(root); },
  };

  function go(view) {
    if (!RENDERERS[view]) view = 'dashboard';
    activeView = view;
    Store.mutate(function (s) {
      s.settings.activeView = view;
    }, 'view');
    render();
    els.main.scrollTop = 0;
  }

  var rendering = false;

  function render() {
    // 重入守卫：渲染过程中若又触发数据变更，不递归重绘
    if (rendering) return;
    rendering = true;
    try {
      var fn = RENDERERS[activeView] || RENDERERS.dashboard;
      fn(els.view);

      // 导航激活态
      U.$$('.nav-item', els.nav).forEach(function (b) {
        b.classList.toggle('nav-item-active', b.dataset.view === activeView);
      });

      // 侧栏统计
      renderSidebarStats();
      renderSaveIndicator();
      renderStorageInfo();

      // 右栏生成结果
      global.OpsDesk.RightPanel.render();
    } finally {
      rendering = false;
    }
  }

  /* ---------------- 侧栏 ---------------- */

  function buildNav() {
    els.nav.innerHTML = '';
    var main = U.el('div', { class: 'space-y-1' });
    VIEWS.forEach(function (v) {
      main.appendChild(
        U.el('button', {
          class: 'nav-item w-full',
          dataset: { view: v.key },
          onclick: function () { go(v.key); },
        }, [
          U.el('span', { class: 'nav-ico text-[13px]', text: v.icon }),
          U.el('span', { class: 'flex-1 text-left', text: v.label }),
          U.el('kbd', {
            class: 'num rounded border border-line/60 px-1 text-[9.5px] text-mute',
            text: v.shortcut,
          }),
        ])
      );
    });
    els.nav.appendChild(main);
  }

  function renderSidebarStats() {
    var st = Store.stats();
    var host = els.sideStats;
    if (!host) return;
    host.innerHTML = '';

    var items = [
      { label: '今日任务', value: st.todayTaskDone + ' / ' + st.todayTaskTotal, color: 'var(--c-brand)' },
      { label: '完成率', value: st.todayTaskRate + '%', color: 'var(--c-ok)' },
      { label: '跟进中故障', value: String(st.openIncidents), color: st.openIncidents ? 'var(--c-warn)' : 'var(--c-mute)' },
      { label: '今日工时', value: U.fmtDur(st.todayMinutes), color: 'var(--c-violet)' },
    ];

    items.forEach(function (i) {
      host.appendChild(
        U.el('div', { class: 'flex items-center justify-between rounded-lg border border-line/50 bg-raised/35 px-2.5 py-1.5' }, [
          U.el('span', { class: 'text-[11px] text-mute', text: i.label }),
          U.el('span', { class: 'num text-[12px] font-semibold', style: { color: i.color }, text: i.value }),
        ])
      );
    });
  }

  function renderSaveIndicator() {
    if (!els.saveDot) return;
    var ss = Store.saveStatus;
    var text = '已保存';
    var color = 'var(--c-ok)';
    if (ss.pending) {
      text = '保存中…';
      color = 'var(--c-warn)';
    } else if (ss.error) {
      text = '保存异常';
      color = 'var(--c-danger)';
    } else if (ss.degraded) {
      // 只写进了一侧：数据还在，但必须让用户知道有降级风险
      text = ss.idb ? '仅 IndexedDB' : '仅 localStorage';
      color = 'var(--c-warn)';
    }
    els.saveDot.style.background = color;
    els.saveText.textContent = text + ' · ' + (ss.lastSavedAt ? U.relTime(ss.lastSavedAt) : '本地');
  }

  /* ---------------- 数据管理 ---------------- */

  function exportData() {
    var json = global.OpsDesk.Storage.exportJSON(Store.state);
    var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = U.el('a', { href: url, download: 'opsdesk-backup-' + U.today() + '.json' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    U.toast('数据已导出为 JSON 备份', 'success');
  }

  function importData() {
    var input = U.el('input', { type: 'file', accept: 'application/json,.json' });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = global.OpsDesk.Storage.importJSON(String(reader.result));
          var normalized = global.OpsDesk.Seed.normalize(parsed);
          UI.confirm(
            '导入数据',
            '导入将覆盖当前全部本地数据（任务 ' + (parsed.tasks || []).length + ' 条 / 故障 ' + (parsed.incidents || []).length + ' 条 / 版本 ' + (parsed.releases || []).length + ' 个 / 取数单 ' + (parsed.queries || []).length + ' 单）。是否继续？',
            function () {
              Store.mutate(function () {
                // 整体替换
                Object.keys(Store.state).forEach(function (k) {
                  delete Store.state[k];
                });
                Object.assign(Store.state, normalized);
              }, 'import');
              applyTheme(Store.state.settings.theme);
              render();
              U.toast('数据导入成功', 'success');
            },
            true
          );
        } catch (err) {
          U.toast('导入失败：' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  /**
   * 追加演示数据：只新增演示记录，不动用户已有的真实数据
   * 演示数据全部带 demo 标记，可用「清除演示数据」一键移除
   */
  function loadDemo() {
    var added = Store.appendDemo();
    render();
    U.toast(
      '已载入演示数据：任务 ' + added.tasks + ' · 故障 ' + added.incidents +
      ' · 流水 ' + added.timeLogs + ' · 版本 ' + added.releases +
      ' · 取数单 ' + added.queries + '（可随时「清除演示数据」）',
      'success',
      4000
    );
  }

  /** 清除全部演示数据，保留用户自己的数据 */
  function purgeDemo() {
    var c = Store.demoStats();
    if (!c.total) {
      U.toast('当前没有演示数据', 'warn');
      return;
    }
    var detail = [];
    if (c.tasks) detail.push('任务 ' + c.tasks + ' 条');
    if (c.incidents) detail.push('故障 ' + c.incidents + ' 条');
    if (c.timeLogs) detail.push('流水 ' + c.timeLogs + ' 条');
    if (c.releases) detail.push('版本 ' + c.releases + ' 个');
    if (c.queries) detail.push('取数单 ' + c.queries + ' 单');
    if (c.projects) detail.push('演示项目 ' + c.projects + ' 个');
    UI.confirm(
      '清除演示数据',
      '将删除以下演示数据：' + detail.join(' / ') + '。你自己的数据不受影响，此操作不可撤销。',
      function () {
        var r = Store.purgeDemo();
        render();
        U.toast(
          '已清除演示数据：任务 ' + r.tasks + ' · 故障 ' + r.incidents +
          ' · 流水 ' + r.timeLogs + ' · 版本 ' + r.releases + ' · 取数单 ' + r.queries,
          'success'
        );
      },
      true
    );
  }

  /**
   * 侧栏存储空间指示
   * 数据存在「当前地址」对应的浏览器存储里，换浏览器 / 换端口 / 换目录就是另一个空间，
   * 把这里显示出来，用户才能判断「我的数据去哪了」
   */
  function renderStorageInfo() {
    var el = U.$('#storage-info');
    if (!el) return;
    var p = global.OpsDesk.Storage.probe();
    var origin = p.origin || '';
    if (!origin || origin === 'null') {
      origin = 'file:// 本地文件（按目录分区）';
    }
    var fb = Store.fileBackupState || {};
    var fbText = fb.supported
      ? (fb.lastOk === true ? '目录备份 ✓' : fb.lastOk === false ? '目录备份 ✗' : '目录备份 ·')
      : '目录备份不可用（未用本地服务启动）';

    if (!p.localStorage && !p.indexedDB) {
      el.className = 'mt-0.5 truncate text-[9.5px] text-danger';
      el.textContent = '⚠ 本地存储不可用，数据无法保存';
      el.title = 'localStorage 与 IndexedDB 都不可用，请检查浏览器隐私设置或站点数据权限';
      return;
    }
    el.className = 'mt-0.5 truncate text-[9.5px] text-mute/70';
    el.textContent = origin + ' · ' + fbText;
    el.title =
      '当前存储空间：' + origin +
      '\nlocalStorage ' + (p.localStorage ? '可用' : '不可用') +
      ' · IndexedDB ' + (p.indexedDB ? '可用' : '不可用') +
      ' · ' + fbText +
      '\n换浏览器 / 换端口 / 换目录都会变成另一个空间，数据不会互通';
  }

  /* ---------------- 存储与数据诊断 ---------------- */

  /**
   * 统计一个状态里的「真实记录」条数（排除演示数据与默认占位项目）
   */
  function countRealRecords(state) {
    if (!state || typeof state !== 'object') return 0;
    var keys = ['tasks', 'incidents', 'timeLogs', 'releases', 'queries'];
    var n = 0;
    for (var i = 0; i < keys.length; i++) {
      var arr = state[keys[i]];
      if (!Array.isArray(arr)) continue;
      for (var j = 0; j < arr.length; j++) {
        if (!arr[j] || arr[j].demo !== true) n++;
      }
    }
    return n;
  }

  /**
   * 打开「存储与数据诊断」面板
   * 目的：让用户自己一眼看清「数据在哪、有几份、会不会丢」，而不是靠猜。
   */
  function openDiagnostics() {
    var Storage = global.OpsDesk.Storage;
    var probe = Storage.probe();
    var origin = probe.origin || '（未知）';
    if (origin === 'null') origin = 'file:// 本地文件';

    var rows = [];

    function row(label, value, tone) {
      rows.push(U.el('div', { class: 'flex items-start justify-between gap-3 border-b border-line/40 py-2 last:border-b-0' }, [
        U.el('span', { class: 'text-[12px] text-dim', text: label }),
        U.el('span', {
          class: 'text-[12px] text-right',
          style: { color: tone || 'var(--c-text)', whiteSpace: 'pre-wrap' },
          text: value,
        }),
      ]));
    }

    row('当前存储空间', origin, probe.localStorage || probe.indexedDB ? 'var(--c-ok)' : 'var(--c-danger)');
    row('localStorage', probe.localStorage ? '可写' : '不可写', probe.localStorage ? 'var(--c-ok)' : 'var(--c-danger)');
    row('IndexedDB', probe.indexedDB ? '可用' : '不可用', probe.indexedDB ? 'var(--c-ok)' : 'var(--c-danger)');

    var s = Store.state;
    row('浏览器内记录数',
      (s.projects || []).length + ' 项目 / ' + (s.tasks || []).length + ' 任务 / ' +
      (s.incidents || []).length + ' 故障 / ' + (s.timeLogs || []).length + ' 流水 / ' +
      ((s.releases || []).length) + ' 投产 / ' + ((s.queries || []).length) + ' 取数单');

    var fbState = Store.fileBackupState || {};
    row('目录备份文件', fbState.supported
      ? (fbState.lastOk === true ? '已同步 ✓' : fbState.lastOk === false ? '同步失败 ✗' : '尚未同步')
      : '不可用（需用启动脚本 / 本地服务打开）',
      fbState.supported && fbState.lastOk !== false ? 'var(--c-ok)' : 'var(--c-warn)');

    var body = U.el('div', { class: 'text-[12px] leading-relaxed' }, rows);
    body.appendChild(U.el('p', {
      class: 'mt-3 text-[11px] leading-relaxed text-mute',
      text: '说明：浏览器存储按「地址」隔离 —— 换浏览器、换端口、换目录都会切到另一个空间。' +
        '程序目录里的 opsdesk-data.json 会跟着文件夹走，换电脑时连同文件夹一起拷贝即可带走数据。',
    }));

    var host = U.$('#modal-host');
    if (!host) return;
    host.innerHTML = '';
    var panel = U.el('div', { class: 'panel w-full overflow-hidden shadow-lift max-w-lg' }, [
      U.el('div', { class: 'panel-head bg-raised/40' }, [
        U.el('div', {}, [U.el('div', { class: 'panel-title', text: '存储与数据诊断' })]),
        U.el('button', { class: 'btn btn-ghost btn-icon', 'aria-label': '关闭', text: '✕', onclick: function () { host.innerHTML = ''; } }),
      ]),
      U.el('div', { class: 'px-4 py-3', style: { maxHeight: '62vh', overflowY: 'auto' } }, [body]),
      U.el('div', { class: 'flex items-center justify-end gap-2 border-t border-line/60 bg-raised/30 px-4 py-3' }, [
        U.el('button', {
          class: 'btn btn-lg',
          text: '导出诊断报告',
          onclick: function () {
            var report = {
              app: 'opsdesk',
              checkedAt: new Date().toISOString(),
              origin: origin,
              probe: probe,
              browserRecords: {
                projects: (s.projects || []).length,
                tasks: (s.tasks || []).length,
                incidents: (s.incidents || []).length,
                timeLogs: (s.timeLogs || []).length,
                releases: (s.releases || []).length,
                queries: (s.queries || []).length,
              },
              fileBackup: fbState,
            };
            var blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = U.el('a', { href: url, download: 'opsdesk-diagnostic-' + U.today() + '.json' });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            U.toast('诊断报告已导出', 'success');
          },
        }),
        U.el('button', {
          class: 'btn btn-lg',
          text: '检查目录备份',
          onclick: function () {
            Store.checkFileBackup().then(function (fb) {
              if (!fb || !fb.available) {
                U.toast(fb && fb.supported === false
                  ? '当前未通过本地服务打开，无法使用目录备份'
                  : '程序目录里还没有备份文件（首次保存后会自动生成）', 'warn', 4000);
                return;
              }
              UI.confirm(
                '目录备份文件',
                '程序目录里有一份备份：' + (fb.realRecords != null ? fb.realRecords : fb.records) + ' 条真实记录' +
                (fb.newerThanBrowser ? '，且比当前浏览器里的数据更新。' : '。') +
                '是否用它覆盖当前数据？',
                function () {
                  Store.restoreFromFileBackup(fb.state);
                  applyTheme(Store.state.settings.theme || 'dark');
                  render();
                  U.toast('已从目录备份恢复', 'success');
                },
                true,
                '恢复并覆盖'
              );
            });
          },
        }),
        U.el('button', { class: 'btn btn-primary btn-lg', text: '知道了', onclick: function () { host.innerHTML = ''; } }),
      ]),
    ]);
    host.appendChild(panel);
  }

  function showShortcuts() {
    var rows = [
      ['1 / 2 / 3 / 4 / 5 / 6 / 7', '快速切换视图'],
      ['N', '新建任务'],
      ['I', '录入生产问题'],
      ['T', '记录时间段'],
      ['V', '新建版本'],
      ['Q', '新建取数单'],
      ['B', '生成站会稿'],
      ['⌘/Ctrl + Enter', '弹窗内快速提交'],
      ['⌘/Ctrl + Shift + L', '切换深色 / 浅色主题'],
      ['⌘/Ctrl + S', '立即落盘保存'],
      ['Esc', '关闭当前弹窗'],
      ['?', '打开快捷键说明'],
    ];
    var body = U.el('div', { class: 'space-y-1.5' });
    rows.forEach(function (r) {
      body.appendChild(
        U.el('div', { class: 'flex items-center justify-between gap-4 rounded-lg border border-line/50 bg-raised/40 px-3 py-2' }, [
          U.el('kbd', { class: 'num rounded border border-line/70 bg-bg/60 px-1.5 py-0.5 text-[11px] text-brand', text: r[0] }),
          U.el('span', { class: 'text-[12px] text-dim', text: r[1] }),
        ])
      );
    });
    var m = UI.modal({
      title: '键盘快捷键',
      subtitle: '全局生效 · 提升日常操作效率',
      width: 'max-w-md',
      body: body,
      footer: [
        U.el('button', { class: 'btn btn-lg', onclick: function () { m.close(); } }, ['知道了']),
      ],
    });
  }

  /* ---------------- 全局快捷键 ---------------- */

  function bindShortcuts() {
    document.addEventListener('keydown', function (e) {
      // 判定是否处于输入态：既看事件源，也看当前焦点元素，
      // 避免事件 target 丢失时误触发全局快捷键
      var target = e.target;
      var tag = (target && target.tagName ? target.tagName : '').toLowerCase();
      var active = document.activeElement;
      var activeTag = (active && active.tagName ? active.tagName : '').toLowerCase();
      var typing =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        (target && target.isContentEditable) ||
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select' ||
        (active && active.isContentEditable);

      // ⌘/Ctrl + 组合键
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'Enter') return; // 交给弹窗处理
        if (e.shiftKey && (e.key === 'L' || e.key === 'l')) {
          e.preventDefault();
          toggleTheme();
          return;
        }
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          Store.persist();
          U.toast('已保存到本地存储', 'success', 1200);
          return;
        }
        if (e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          go('tasks');
          setTimeout(function () {
            var input = els.view.querySelector('input[type=search]');
            if (input) input.focus();
          }, 120);
          return;
        }
        return;
      }

      if (UI.hasModal()) {
        if (e.key === 'Escape') {
          e.preventDefault();
          UI.closeTopModal();
        }
        return;
      }

      if (typing) return;

      var map = { 1: 'dashboard', 2: 'tasks', 3: 'incidents', 4: 'timelog', 5: 'releases', 6: 'queries', 7: 'briefing' };
      if (map[e.key]) {
        e.preventDefault();
        go(map[e.key]);
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          global.OpsDesk.Tasks.openEditor(null);
          break;
        case 'i':
          e.preventDefault();
          global.OpsDesk.Incidents.openEditor(null);
          break;
        case 't':
          e.preventDefault();
          global.OpsDesk.TimeLog.openEditor(null);
          break;
        case 'v':
          e.preventDefault();
          global.OpsDesk.Releases.openEditor(null);
          break;
        case 'q':
          e.preventDefault();
          go('queries');
          global.OpsDesk.Queries.openEditor(null);
          break;
        case 'b':
          e.preventDefault();
          global.OpsDesk.Briefing.build();
          go('briefing');
          U.toast('站会稿已生成', 'success');
          break;
        case '?':
          e.preventDefault();
          showShortcuts();
          break;
        case 'escape':
          UI.closeTopModal();
          break;
      }
    });
  }

  /* ---------------- 启动 ---------------- */

  var booted = false;
  var readyResolve;
  var readyPromise = new Promise(function (r) {
    readyResolve = r;
  });

  function boot() {
    if (booted) return readyPromise;
    booted = true;

    els.nav = U.$('#nav');
    els.view = U.$('#view-root');
    els.main = U.$('#main-scroll');
    els.sideStats = U.$('#side-stats');
    els.saveDot = U.$('#save-dot');
    els.saveText = U.$('#save-text');
    els.themeBtn = U.$('#theme-toggle');

    buildNav();
    bindShortcuts();

    U.$('#theme-toggle').addEventListener('click', toggleTheme);
    U.$('#btn-briefing').addEventListener('click', function () {
      global.OpsDesk.Briefing.build();
      go('briefing');
      U.toast('站会稿已生成', 'success');
    });
    U.$('#btn-projects').addEventListener('click', function () {
      global.OpsDesk.Projects.openManager();
    });
    U.$('#btn-export').addEventListener('click', exportData);
    U.$('#btn-import').addEventListener('click', importData);
    U.$('#btn-demo').addEventListener('click', loadDemo);
    U.$('#btn-purge-demo').addEventListener('click', purgeDemo);
    U.$('#btn-shortcuts').addEventListener('click', showShortcuts);
    var btnDiag = U.$('#btn-diag');
    if (btnDiag) btnDiag.addEventListener('click', openDiagnostics);

    // 右栏：复制 / 重新生成
    U.$('#right-copy').addEventListener('click', function () {
      var md = global.OpsDesk.Briefing.markdown;
      if (!md) {
        md = global.OpsDesk.Briefing.build();
        global.OpsDesk.App.render();
      }
      U.copy(md).then(function (ok) {
        U.toast(ok ? '已复制站会稿到剪贴板' : '复制失败，请手动选择文本', ok ? 'success' : 'error');
      });
    });
    U.$('#right-regen').addEventListener('click', function () {
      global.OpsDesk.Briefing.build();
      global.OpsDesk.App.render();
      U.toast('已重新生成站会稿', 'success');
    });

    // 顶部快捷新建
    U.$('#top-new-task').addEventListener('click', function () { global.OpsDesk.Tasks.openEditor(null); });
    U.$('#top-new-incident').addEventListener('click', function () { global.OpsDesk.Incidents.openEditor(null); });
    U.$('#top-new-log').addEventListener('click', function () { global.OpsDesk.TimeLog.openEditor(null); });
    var topNewRelease = U.$('#top-new-release');
    if (topNewRelease) {
      topNewRelease.addEventListener('click', function () { global.OpsDesk.Releases.openEditor(null); });
    }
    var topNewQuery = U.$('#top-new-query');
    if (topNewQuery) {
      topNewQuery.addEventListener('click', function () { global.OpsDesk.Queries.openEditor(null); });
    }

    Store.init().then(function (res) {
      applyTheme(Store.state.settings.theme || 'dark');
      activeView = Store.state.settings.activeView || 'dashboard';
      if (!RENDERERS[activeView]) activeView = 'dashboard';
      render();

      // 空白启动提示（不再自动灌入演示数据）
      if (res.blank) {
        setTimeout(function () {
          U.toast(
            '已创建空白工作台（不含演示数据）。想先看示例？左下角点「⊞ 载入演示数据」',
            'warn',
            4200
          );
        }, 600);
      }

      // 本地数据损坏告警：绝不能让用户以为"数据被删了"，必须明确告知
      var diag = res.diagnostics || {};
      if (diag.localCorrupted) {
        setTimeout(function () {
          U.toast(
            '检测到本地数据读取异常，已把原始内容另存为副本（localStorage 的 opsdesk:corrupt:v1）' +
            (diag.corruptSaved ? '，可点「存储与数据诊断」导出抢救' : ''),
            'error',
            8000
          );
        }, 1000);
      }

      // 存储不可用告警：否则用户会以为数据已保存，下次打开全没了
      var probe = global.OpsDesk.Storage.probe();
      if (!probe.localStorage && !probe.indexedDB) {
        setTimeout(function () {
          U.toast('本地存储不可用，本次录入的数据不会被保存，请检查浏览器隐私设置', 'error', 6000);
        }, 1200);
      }

      // 目录级备份自检：浏览器存储被清 / 换了空间时，从同目录的备份文件恢复
      Store.checkFileBackup().then(function (fb) {
        renderStorageInfo();
        if (!fb || !fb.available || !fb.state) return;

        var browserReal = countRealRecords(Store.state);
        var fileReal = countRealRecords(fb.state);

        // 浏览器里没有真实数据（空 / 只剩演示数据），而目录备份里有真实数据
        // → 主动提示恢复。这正是「重启后数据被测试数据顶掉」的补救路径
        if (browserReal === 0 && fileReal > 0) {
          UI.confirm(
            '发现目录里的真实数据备份',
            '当前浏览器空间里没有你的真实记录' +
            (Store.demoStats().tasks ? '（只剩演示数据）' : '') +
            '，但程序目录里有一份含 ' + fileReal + ' 条真实记录的备份。' +
            '这通常是因为换了浏览器、换了端口或换了目录。是否用这份备份恢复？',
            function () {
              Store.restoreFromFileBackup(fb.state);
              applyTheme(Store.state.settings.theme || 'dark');
              render();
              U.toast('已从目录备份恢复 ' + fileReal + ' 条真实记录', 'success');
            },
            true,
            '恢复并覆盖'
          );
          return;
        }

        // 目录备份比浏览器里的新 → 提示可以取回更新的那份
        if (!res.blank && fb.newerThanBrowser) {
          setTimeout(function () {
            U.toast(
              '程序目录里有一份更新的数据备份，可点「存储与数据诊断」查看并取回',
              'warn',
              6000
            );
          }, 1500);
        }
      });

      // 跨天自动刷新
      var day = U.today();
      setInterval(function () {
        if (U.today() !== day) {
          day = U.today();
          render();
        }
      }, 60000);

      readyResolve();
    });

    // 订阅 store：
    //   persist:*  —— 只刷新保存状态指示器
    //   其它 reason —— 业务数据发生变化，重绘当前视图
    //     （否则新建/编辑/删除任务、故障、流水后界面不会刷新，
    //       用户会误以为没保存成功）
    Store.subscribe(function (s, reason) {
      if (reason === 'persist:done' || reason === 'persist:error' || reason === 'persist:start' ||
          reason === 'persist:degraded' || reason === 'filebackup:sync') {
        renderSaveIndicator();
        renderStorageInfo();
        return;
      }
      if (reason === 'view') return; // 切换视图由 go() 自行重绘
      render();
    });

    // 关闭前强制落盘
    window.addEventListener('beforeunload', function () {
      Store.persist();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') Store.persist();
    });
  }

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.App = {
    boot: boot,
    go: go,
    render: render,
    toggleTheme: toggleTheme,
    exportData: exportData,
    importData: importData,
    loadDemo: loadDemo,
    purgeDemo: purgeDemo,
    openDiagnostics: openDiagnostics,
    showShortcuts: showShortcuts,
    /** 初始化完成的 Promise（便于测试与外部集成等待） */
    ready: readyPromise,
    get activeView() { return activeView; },
  };

  // 支持通过 <body data-opsdesk-manual="1"> 关闭自动启动（供测试环境受控启动）
  var manualBoot =
    document.body && document.body.getAttribute('data-opsdesk-manual') === '1';

  if (!manualBoot) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(window);
