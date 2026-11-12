/* ============================================================
   incidents.js — 生产问题排查看板
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;
  var Store = global.OpsDesk.Store;
  var UI = global.OpsDesk.UI;

  var filter = { status: 'all', project: 'all', keyword: '', sort: 'desc' };

  /* ---------------- 录入表单 ---------------- */

  function openEditor(incident) {
    var isEdit = !!incident;
    var it = incident
      ? U.clone(incident)
      : {
          title: '',
          project: Store.state.projects[0] ? Store.state.projects[0].id : '',
          severity: 'P2',
          status: 'tracking',
          date: U.today(),
          occurredAt: U.nowTime(),
          symptom: '',
          impact: '',
          diagnosis: '',
          solution: '',
        };

    var fTitle = U.el('input', { class: 'input', type: 'text', value: it.title, placeholder: '例如：HDFS 节点 OOM 告警' });
    var fProject = global.OpsDesk.Projects.picker({ value: it.project });
    var fSeverity = U.el('select', { class: 'input' });
    var fStatus = U.el('select', { class: 'input' });
    var fDate = global.OpsDesk.Picker.dateField({ value: it.date });
    var fTime = global.OpsDesk.Picker.timeField({ value: it.occurredAt });
    var fSymptom = U.el('textarea', { class: 'input', placeholder: '告警内容、错误日志、复现条件…' });
    var fImpact = U.el('textarea', { class: 'input', placeholder: '影响范围、持续时长、业务受损程度…' });
    var fDiagnosis = U.el('textarea', { class: 'input', placeholder: '排查步骤、根因分析、验证过程…' });
    var fSolution = U.el('textarea', { class: 'input', placeholder: '处置动作、修复方案、后续预防措施…' });
    fSymptom.value = it.symptom || '';
    fImpact.value = it.impact || '';
    fDiagnosis.value = it.diagnosis || '';
    fSolution.value = it.solution || '';

    Store.dict('severity').forEach(function (d) {
      fSeverity.appendChild(U.el('option', { value: d.key, text: d.label, selected: d.key === it.severity }));
    });
    Store.dict('incidentStatus').forEach(function (d) {
      fStatus.appendChild(U.el('option', { value: d.key, text: d.label, selected: d.key === it.status }));
    });

    function lab(text, ctl) {
      return U.el('div', {}, [U.el('label', { class: 'label', text: text }), ctl]);
    }

    var body = U.el('div', { class: 'space-y-4' }, [
      lab('故障 / 现象标题 *', fTitle),
      lab('所属项目', fProject.el),
      U.el('div', { class: 'grid grid-cols-2 gap-4 sm:grid-cols-3' }, [
        lab('严重级别', fSeverity),
        lab('发生日期', fDate.el),
        lab('发生时间', fTime.el),
      ]),
      U.el('div', { class: 'grid grid-cols-1 gap-4 lg:grid-cols-2' }, [
        lab('故障 / 现象', fSymptom),
        lab('影响范围', fImpact),
        lab('排查与定位过程', fDiagnosis),
        lab('解决方案', fSolution),
      ]),
      lab('解决方案 / 状态', fStatus),
    ]);

    var saveBtn = U.el('button', {
      class: 'btn btn-primary btn-lg',
      onclick: function () {
        var title = fTitle.value.trim();
        if (!title) {
          fTitle.classList.add('input-invalid');
          U.toast('请填写故障现象标题', 'error');
          fTitle.focus();
          return;
        }
        var payload = {
          title: title,
          project: fProject.getValue(),
          severity: fSeverity.value,
          status: fStatus.value,
          date: fDate.value || U.today(),
          occurredAt: fTime.value || '00:00',
          symptom: fSymptom.value.trim(),
          impact: fImpact.value.trim(),
          diagnosis: fDiagnosis.value.trim(),
          solution: fSolution.value.trim(),
        };

        if (isEdit) {
          Store.mutate(function (s) {
            var t = s.incidents.filter(function (x) {
              return x.id === it.id;
            })[0];
            if (t) Object.assign(t, payload, { updatedAt: Date.now() });
          }, 'incident:update');
          U.toast('故障记录已更新', 'success');
        } else {
          Store.mutate(function (s) {
            s.incidents.unshift(
              Object.assign(
                { id: U.uid('inc'), owner: '我', createdAt: Date.now(), updatedAt: Date.now() },
                payload
              )
            );
          }, 'incident:create');
          U.toast('故障记录已入库', 'success');
        }
        m.close();
      },
    }, [isEdit ? '保存修改' : '录入故障']);

    var m = UI.modal({
      title: isEdit ? '编辑故障记录' : '录入生产问题',
      subtitle: '结构化留痕 · 便于复盘追溯',
      width: 'max-w-4xl',
      body: body,
      footer: [
        U.el('button', { class: 'btn btn-lg', onclick: function () { m.close(); } }, ['取消']),
        saveBtn,
      ],
    });

    m.overlay.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    });
    return m;
  }

  /* ---------------- 记录卡片 ---------------- */

  function incidentCard(it) {
    var st = Store.dictItem('incidentStatus', it.status);
    var sev = Store.dictItem('severity', it.severity);
    var pcolor = Store.projectColor(it.project);

    var card = U.el('div', {
      class: 'panel group overflow-hidden transition-all hover:border-brand/35 hover:shadow-lift',
    });

    var head = U.el('div', { class: 'flex items-start gap-3 px-4 py-3' }, [
      U.el('span', {
        class: 'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
        style: { background: sev.color, boxShadow: '0 0 10px ' + U.alpha(sev.color, 0.7) },
      }),
      U.el('div', { class: 'min-w-0 flex-1' }, [
        U.el('div', { class: 'flex flex-wrap items-center gap-2' }, [
          U.el('span', { class: 'text-[13.5px] font-semibold text-ink', text: it.title }),
          U.el('span', { class: 'badge badge-' + it.status, text: st.label }),
          U.el('span', {
            class: 'badge',
            style: { background: U.alpha(sev.color, 0.15), color: sev.color },
            text: sev.label,
          }),
          U.el('span', { class: 'chip', text: Store.projectName(it.project) }),
        ]),
        U.el('div', { class: 'num mt-1 text-[11px] text-mute', text: it.date + ' ' + it.occurredAt + ' · ' + (it.owner || '我') }),
      ]),
      U.el('div', { class: 'flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100' }, [
        U.el('button', {
          class: 'btn btn-ghost btn-icon h-7 w-7 text-[11px]',
          title: '编辑',
          onclick: function () { openEditor(it); },
        }, ['✎']),
        U.el('button', {
          class: 'btn btn-ghost btn-icon h-7 w-7 text-[11px]',
          title: '删除',
          onclick: function () {
            UI.confirm('删除记录', '确认删除故障记录「' + it.title + '」？', function () {
              Store.mutate(function (s) {
                s.incidents = s.incidents.filter(function (x) { return x.id !== it.id; });
              }, 'incident:delete');
              U.toast('记录已删除', 'success');
            }, true);
          },
        }, ['🗑']),
      ]),
    ]);
    card.appendChild(head);

    // 摘要区
    var summary = U.el('div', { class: 'grid grid-cols-1 gap-px border-t border-line/50 bg-line/30 md:grid-cols-2' });
    [
      ['故障 / 现象', it.symptom],
      ['影响范围', it.impact],
      ['排查与定位过程', it.diagnosis],
      ['解决方案', it.solution],
    ].forEach(function (pair) {
      var box = U.el('div', { class: 'bg-surface/60 px-4 py-2.5' }, [
        U.el('div', { class: 'kicker mb-1', text: pair[0] }),
        U.el('div', {
          class: 'whitespace-pre-line text-[12px] leading-relaxed text-dim',
          text: pair[1] || '—',
        }),
      ]);
      summary.appendChild(box);
    });
    card.appendChild(summary);

    // 状态切换
    var foot = U.el('div', { class: 'flex items-center justify-between gap-2 border-t border-line/50 bg-raised/30 px-4 py-2' });
    foot.appendChild(U.el('div', { class: 'text-[11px] text-mute', text: '更新于 ' + U.relTime(it.updatedAt) }));
    var toggle = U.el('div', { class: 'flex gap-1' });
    Store.dict('incidentStatus').forEach(function (d) {
      toggle.appendChild(
        U.el('button', {
          class: 'btn h-7 px-2.5 text-[11px] ' + (d.key === it.status ? 'btn-primary' : ''),
          onclick: function () {
            Store.mutate(function (s) {
              var t = s.incidents.filter(function (x) { return x.id === it.id; })[0];
              if (t) { t.status = d.key; t.updatedAt = Date.now(); }
            }, 'incident:status');
            U.toast('状态已更新为「' + d.label + '」', 'success', 1400);
          },
        }, [d.label])
      );
    });
    foot.appendChild(toggle);
    card.appendChild(foot);

    return card;
  }

  /* ---------------- 渲染 ---------------- */

  function render(root) {
    var s = Store.state;
    var list = s.incidents.slice();

    if (filter.status !== 'all') {
      list = list.filter(function (i) { return i.status === filter.status; });
    }
    if (filter.project !== 'all') {
      list = list.filter(function (i) { return i.project === filter.project; });
    }
    if (filter.keyword) {
      var kw = filter.keyword.toLowerCase();
      list = list.filter(function (i) {
        return (
          i.title.toLowerCase().indexOf(kw) >= 0 ||
          (i.symptom || '').toLowerCase().indexOf(kw) >= 0 ||
          (i.impact || '').toLowerCase().indexOf(kw) >= 0 ||
          (i.diagnosis || '').toLowerCase().indexOf(kw) >= 0 ||
          (i.solution || '').toLowerCase().indexOf(kw) >= 0
        );
      });
    }

    list.sort(function (a, b) {
      var av = a.date + ' ' + a.occurredAt;
      var bv = b.date + ' ' + b.occurredAt;
      return filter.sort === 'desc' ? (bv < av ? -1 : bv > av ? 1 : 0) : av < bv ? -1 : av > bv ? 1 : 0;
    });

    /* 工具条 */
    var bar = U.el('div', { class: 'flex flex-wrap items-center gap-2' });

    var statusChips = U.el('div', { class: 'flex gap-1 rounded-lg border border-line/60 bg-raised/40 p-0.5' });
    [{ key: 'all', label: '全部' }].concat(Store.dict('incidentStatus')).forEach(function (d) {
      var count = d.key === 'all'
        ? s.incidents.length
        : s.incidents.filter(function (i) { return i.status === d.key; }).length;
      statusChips.appendChild(
        U.el('button', {
          class: 'chip border-0 ' + (filter.status === d.key ? 'chip-active' : ''),
          onclick: function () {
            filter.status = d.key;
            global.OpsDesk.App.render();
          },
        }, [d.label + ' ', U.el('span', { class: 'num opacity-70', text: String(count) })])
      );
    });
    bar.appendChild(statusChips);

    var projSel = U.el('select', {
      class: 'input h-[30px] w-auto py-0 text-[12px]',
      onchange: function (e) { filter.project = e.target.value; global.OpsDesk.App.render(); },
    });
    projSel.appendChild(U.el('option', { value: 'all', text: '全部项目', selected: filter.project === 'all' }));
    s.projects.forEach(function (p) {
      projSel.appendChild(U.el('option', { value: p.id, text: p.name, selected: filter.project === p.id }));
    });
    bar.appendChild(projSel);

    bar.appendChild(
      U.el('select', {
        class: 'input h-[30px] w-auto py-0 text-[12px]',
        onchange: function (e) { filter.sort = e.target.value; global.OpsDesk.App.render(); },
      }, [
        U.el('option', { value: 'desc', text: '按时间倒序', selected: filter.sort === 'desc' }),
        U.el('option', { value: 'asc', text: '按时间正序', selected: filter.sort === 'asc' }),
      ])
    );

    bar.appendChild(
      U.el('input', {
        class: 'input h-[30px] w-[190px] py-0 text-[12px]',
        type: 'search',
        placeholder: '检索现象 / 影响 / 方案…',
        value: filter.keyword,
        oninput: U.debounce(function (e) {
          filter.keyword = e.target.value.trim();
          global.OpsDesk.App.render();
        }, 220),
      })
    );

    bar.appendChild(U.el('div', { class: 'flex-1' }));
    bar.appendChild(
      U.el('button', {
        class: 'btn btn-primary',
        onclick: function () { openEditor(null); },
      }, ['＋ 录入故障'])
    );

    /* 统计 */
    var tracking = s.incidents.filter(function (i) { return i.status === 'tracking'; });
    var resolved = s.incidents.filter(function (i) { return i.status === 'resolved'; });
    var resolveRate = s.incidents.length ? Math.round((resolved.length / s.incidents.length) * 100) : 0;

    var statRow = U.el('div', { class: 'grid grid-cols-2 gap-3 lg:grid-cols-4' }, [
      statCard('故障总数', s.incidents.length, '条'),
      statCard('跟进中', tracking.length, '条', 'var(--c-warn)'),
      statCard('已解决', resolved.length, '条', 'var(--c-ok)'),
      statCard('闭环率', resolveRate, '%', 'var(--c-brand)'),
    ]);

    root.innerHTML = '';
    root.appendChild(
      U.el('div', { class: 'space-y-4 animate-fade-up' }, [
        U.el('div', {}, [
          U.el('h2', { class: 'text-[15px] font-bold text-ink', text: '生产问题排查看板' }),
          U.el('div', { class: 'mt-0.5 text-[11.5px] text-mute', text: '结构化留痕 · 按时间与状态检索 · 支持复盘追溯' }),
        ]),
        statRow,
        bar,
        list.length
          ? U.el('div', { class: 'space-y-3' }, list.map(incidentCard))
          : U.el('div', { class: 'panel flex h-40 flex-col items-center justify-center gap-2' }, [
              U.el('div', { class: 'text-2xl opacity-40', text: '🛠' }),
              U.el('div', { class: 'text-[13px] text-mute', text: '没有匹配的故障记录' }),
            ]),
      ])
    );
  }

  function statCard(label, value, unit, color) {
    return U.el('div', { class: 'panel px-3.5 py-3' }, [
      U.el('div', { class: 'kicker', text: label }),
      U.el('div', { class: 'mt-1 flex items-baseline gap-1' }, [
        U.el('span', { class: 'num text-[22px] font-bold leading-none', style: { color: color || 'rgb(var(--c-ink))' }, text: String(value) }),
        U.el('span', { class: 'text-[11px] text-mute', text: unit || '' }),
      ]),
    ]);
  }

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.Incidents = { render: render, openEditor: openEditor, filter: filter };
})(window);
