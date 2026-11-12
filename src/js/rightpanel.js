/* ============================================================
   rightpanel.js — 右侧生成结果面板
   随当前视图实时联动，展示生成结果摘要与关键指标
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;
  var Store = global.OpsDesk.Store;

  /* ---------------- 输出区：按当前视图给出摘要 ---------------- */

  function buildOutput() {
    var s = Store.state;
    var today = U.today();
    var st = Store.stats();

    switch (global.OpsDesk.App.activeView) {
      case 'tasks': {
        var tasks = s.tasks
          .filter(function (t) { return t.date === today; })
          .sort(function (a, b) { return U.toMin(a.startTime) - U.toMin(b.startTime); });
        var md = ['### 今日任务清单', ''];
        if (!tasks.length) md.push('- 暂无排期任务');
        tasks.forEach(function (t) {
          var d = Store.dictItem('taskStatus', t.status);
          md.push('- `' + t.startTime + '` ' + t.title + '（' + d.label + '）');
        });
        md.push('', '> 共 ' + tasks.length + ' 项，完成 ' + st.todayTaskDone + ' 项');
        return md.join('\n');
      }

      case 'incidents': {
        var list = s.incidents
          .slice()
          .sort(function (a, b) { return (b.date + b.occurredAt) < (a.date + a.occurredAt) ? -1 : 1; })
          .slice(0, 6);
        var md2 = ['### 生产问题动态', ''];
        if (!list.length) md2.push('- 暂无故障记录');
        list.forEach(function (i) {
          var stt = Store.dictItem('incidentStatus', i.status);
          md2.push('- ' + i.title + ' — ' + stt.label + '（' + i.date + '）');
        });
        md2.push('', '> 跟进中 ' + st.openIncidents + ' 起 / 累计 ' + st.totalIncidents + ' 起');
        return md2.join('\n');
      }

      case 'timelog': {
        var cat = Store.categoryStats(global.OpsDesk.TimeLog.viewDate || today);
        var md3 = ['### 当日时间分配', ''];
        cat.buckets.forEach(function (b) {
          md3.push('- **' + b.label + '** — ' + U.fmtDur(b.minutes) + '（' + b.pct + '%）');
        });
        md3.push('', '> 合计 ' + U.fmtDur(cat.total) + '，共 ' + cat.logs.length + ' 条流水');
        return md3.join('\n');
      }

      case 'releases': {
        var rels = (s.releases || []).slice().sort(function (a, b) {
          return (b.date || '') < (a.date || '') ? -1 : 1;
        });
        var rst = Store.releaseStats();
        var mdR = ['### 版本投产台账', ''];
        if (!rels.length) {
          mdR.push('- 暂无版本投产记录');
        }
        rels.slice(0, 5).forEach(function (r) {
          var rs = Store.dictItem('releaseStatus', r.status);
          mdR.push('- **' + r.version + '**（' + r.date + '） — ' + rs.label + ' · ' + (r.items || []).length + ' 条内容');
          (r.items || []).slice(0, 4).forEach(function (it) {
            var t = Store.dictItem('releaseType', it.type);
            mdR.push('  - `' + t.label + '` ' + it.title + ' — ' + (it.dev || '未填写'));
          });
        });
        mdR.push('', '> 共 ' + rst.total + ' 个版本 / ' + rst.items + ' 条投产内容');
        return mdR.join('\n');
      }

      case 'queries': {
        var qs = (s.queries || []).slice().sort(function (a, b) {
          return (b.requestDate || '') < (a.requestDate || '') ? -1 : 1;
        });
        var qst = Store.queryStats();
        var mdQ = ['### 取数登记台账', ''];
        if (!qs.length) {
          mdQ.push('- 暂无取数单记录');
        }
        qs.slice(0, 5).forEach(function (q) {
          var qs2 = Store.dictItem('queryStatus', q.status);
          mdQ.push('- **' + (q.code || '未编号') + '**（' + (q.requestDate || '未填日期') + '） — ' + qs2.label + ' · ' + (q.title || ''));
          (q.metrics || []).slice(0, 3).forEach(function (m) {
            mdQ.push('  - 口径 `' + m.name + '` — ' + U.trunc(m.definition || '', 40));
          });
          if ((q.caliberChanges || []).length) {
            mdQ.push('  - 口径变更 **' + q.caliberChanges.length + '** 次');
          }
        });
        mdQ.push('', '> 共 ' + qst.total + ' 单 / 进行中 ' + qst.inProgress + ' / 待核对 ' + qst.toCheck + ' / 已超期 ' + qst.overdue);
        return mdQ.join('\n');
      }

      case 'briefing': {
        var md4 = global.OpsDesk.Briefing.markdown;
        if (!md4) {
          return '### 尚未生成站会稿\n\n点击右上角 **「生成站会稿」** 按钮，系统会自动读取昨日产出、生产问题跟进与重点项目进展，生成 1-2 分钟念得完的精简稿。';
        }
        return md4;
      }

      default: {
        var md5 = ['### 今日速览', ''];
        md5.push('- 任务完成 **' + st.todayTaskDone + '/' + st.todayTaskTotal + '**（' + st.todayTaskRate + '%）');
        md5.push('- 跟进中故障 **' + st.openIncidents + '** 起');
        md5.push('- 今日工时 **' + U.fmtDur(st.todayMinutes) + '**');
        md5.push('- 重点/长线事项 **' + st.focusTasks + '** 项');
        md5.push('');
        md5.push('> 按 `B` 快速生成站会稿 · 按 `?` 查看全部快捷键');
        return md5.join('\n');
      }
    }
  }

  /* ---------------- 渲染 ---------------- */

  function render() {
    var out = document.getElementById('right-output');
    var stats = document.getElementById('right-stats');
    if (!out || !stats) return;

    out.innerHTML = U.mdToHtml(buildOutput());

    var st = Store.stats();
    var cat = Store.categoryStats(U.today());
    var items = [
      { label: '完成率', value: st.todayTaskRate + '%', color: 'var(--c-brand)' },
      { label: '待闭环', value: String(st.openIncidents), color: st.openIncidents ? 'var(--c-warn)' : 'var(--c-mute)' },
      { label: '今日工时', value: U.fmtDur(st.todayMinutes), color: 'var(--c-violet)' },
      { label: '流水条数', value: String(cat.logs.length), color: 'var(--c-ok)' },
    ];
    stats.innerHTML = '';
    items.forEach(function (i) {
      stats.appendChild(
        U.el('div', { class: 'rounded-lg border border-line/50 bg-raised/40 px-2.5 py-1.5' }, [
          U.el('div', { class: 'text-[10px] text-mute', text: i.label }),
          U.el('div', { class: 'num mt-0.5 text-[14px] font-bold', style: { color: i.color }, text: i.value }),
        ])
      );
    });
  }

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.RightPanel = { render: render };
})(window);
