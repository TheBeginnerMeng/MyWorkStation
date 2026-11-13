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
    if (!p.localStorage && !p.indexedDB) {
      el.className = 'mt-0.5 truncate text-[9.5px] text-danger';
      el.textContent = '⚠ 本地存储不可用，数据无法保存';
      el.title = 'localStorage 与 IndexedDB 都不可用，请检查浏览器隐私设置或站点数据权限';
      return;
    }
    el.className = 'mt-0.5 truncate text-[9.5px] text-mute/70';
    el.textContent = origin;
    el.title =
      '当前存储空间：' + origin +
      '\nlocalStorage ' + (p.localStorage ? '可用' : '不可用') +
      ' · IndexedDB ' + (p.indexedDB ? '可用' : '不可用') +
      '\n换浏览器 / 换端口 / 换目录都会变成另一个空间，数据不会互通';
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

      // 存储不可用告警：否则用户会以为数据已保存，下次打开全没了
      var probe = global.OpsDesk.Storage.probe();
      if (!probe.localStorage && !probe.indexedDB) {
        setTimeout(function () {
          U.toast('本地存储不可用，本次录入的数据不会被保存，请检查浏览器隐私设置', 'error', 6000);
        }, 1200);
      }

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
      if (reason === 'persist:done' || reason === 'persist:error' || reason === 'persist:start') {
        renderSaveIndicator();
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
