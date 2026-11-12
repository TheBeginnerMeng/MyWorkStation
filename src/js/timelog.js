/* ============================================================
   timelog.js — 时间分配流水账
   极简录入 + 自动时长计算 + 分类占比统计
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;
  var Store = global.OpsDesk.Store;
  var UI = global.OpsDesk.UI;

  var viewDate = null;
  var timerHandle = null;
  var timerStart = null;

  /* ---------------- 分类自动推断 ---------------- */

  var CATEGORY_RULES = [
    {
      key: 'debug',
      words: ['排查', '定位', '调试', 'debug', '复现', '根因', '故障', '异常', '报错', 'oom', '排查中', 'fix', '修复'],
    },
    {
      key: 'meeting',
      words: ['会议', '评审', '讨论', '同步', '对齐', '汇报', '晨会', '周会', '例会', 'meeting', '对齐会', '沟通'],
    },
    {
      key: 'ops',
      words: ['运维', '部署', '发布', '巡检', '上线', '切流', '扩容', '配置', '监控', '告警', '值守', '值班', '部署流水线', 'ops', 'devops'],
    },
    {
      key: 'dev',
      words: ['开发', '编写', '实现', '编码', '重构', '脚本', '代码', '设计', '开发联调', 'coding', '开发', '写代码', '接口'],
    },
  ];

  /** 根据描述自动推断分类 */
  function inferCategory(text) {
    var t = String(text || '').toLowerCase();
    if (!t.trim()) return 'dev';
    for (var i = 0; i < CATEGORY_RULES.length; i++) {
      var words = CATEGORY_RULES[i].words;
      for (var j = 0; j < words.length; j++) {
        if (t.indexOf(words[j]) >= 0) return CATEGORY_RULES[i].key;
      }
    }
    return 'dev';
  }

  /** 计算时长（分钟），处理跨天 —— 委托给统一口径 U.duration */
  function durationOf(start, end) {
    return U.duration(start, end);
  }

  /* ---------------- 录入弹窗 ---------------- */

  function openEditor(log) {
    var isEdit = !!log;
    var l = log
      ? U.clone(log)
      : { date: viewDate || U.today(), startTime: U.nowTime(), endTime: '', desc: '', category: 'dev', project: null };

    var fDesc = U.el('input', {
      class: 'input',
      type: 'text',
      value: l.desc,
      placeholder: '例如：14:00-16:00 编写 Spark 脚本',
    });
    var fDate = global.OpsDesk.Picker.dateField({ value: l.date });
    var fStart = global.OpsDesk.Picker.timeField({ value: l.startTime });
    var fEnd = global.OpsDesk.Picker.timeField({
      value: l.endTime,
      relatedStart: function () {
        return fStart.value;
      },
    });
    var fCategory = U.el('select', { class: 'input' });
    var fProject = global.OpsDesk.Projects.picker({
      value: l.project || '',
      allowEmpty: true,
      emptyLabel: '不关联项目',
    });

    Store.dict('timeCategory').forEach(function (d) {
      fCategory.appendChild(U.el('option', { value: d.key, text: d.label, selected: d.key === l.category }));
    });

    var durHint = U.el('div', { class: 'hint', text: '填写起止时间后自动计算时长' });

    // 描述输入时自动推荐分类
    var autoTag = U.el('span', { class: 'chip chip-active hidden', text: '自动分类' });
    fDesc.addEventListener('input', function () {
      var guess = inferCategory(fDesc.value);
      var label = Store.dictItem('timeCategory', guess).label;
      fCategory.value = guess;
      autoTag.classList.remove('hidden');
      autoTag.textContent = '自动分类：' + label;
      updateDur();
    });

    function updateDur() {
      if (!fStart.value || !fEnd.value) {
        durHint.className = 'hint';
        durHint.textContent = '填写起止时间后自动计算时长';
        return;
      }
      var d = durationOf(fStart.value, fEnd.value);
      durHint.className = 'hint';
      durHint.textContent = '本次时长 ' + U.fmtDur(d) + '（' + d + ' 分钟）';
    }
    fStart.addEventListener('input', updateDur);
    fEnd.addEventListener('input', updateDur);
    updateDur();

    var body = U.el('div', { class: 'space-y-4' }, [
      U.el('div', {}, [
        U.el('label', { class: 'label', text: '做了什么 *' }),
        U.el('div', { class: 'flex gap-2' }, [fDesc, autoTag]),
      ]),
      U.el('div', { class: 'grid grid-cols-2 gap-4 sm:grid-cols-4' }, [
        U.el('div', {}, [U.el('label', { class: 'label', text: '日期' }), fDate.el]),
        U.el('div', {}, [U.el('label', { class: 'label', text: '开始' }), fStart.el]),
        U.el('div', {}, [U.el('label', { class: 'label', text: '结束' }), fEnd.el]),
        U.el('div', {}, [U.el('label', { class: 'label', text: '分类' }), fCategory]),
      ]),
      durHint,
      U.el('div', {}, [U.el('label', { class: 'label', text: '关联项目' }), fProject.el]),
    ]);

    var saveBtn = U.el('button', {
      class: 'btn btn-primary btn-lg',
      onclick: function () {
        var desc = fDesc.value.trim();
        if (!desc) {
          fDesc.classList.add('input-invalid');
          U.toast('请填写工作内容', 'error');
          fDesc.focus();
          return;
        }
        if (!fStart.value || !fEnd.value) {
          U.toast('请填写开始与结束时间', 'error');
          (fStart.value ? fEnd : fStart).focus();
          return;
        }
        var payload = {
          date: fDate.value || U.today(),
          startTime: fStart.value,
          endTime: fEnd.value,
          category: fCategory.value,
          desc: desc,
          project: fProject.getValue() || null,
        };
        if (isEdit) {
          Store.mutate(function (s) {
            var t = s.timeLogs.filter(function (x) { return x.id === l.id; })[0];
            if (t) Object.assign(t, payload);
          }, 'timelog:update');
          U.toast('流水记录已更新', 'success');
        } else {
          Store.mutate(function (s) {
            s.timeLogs.push(
              Object.assign({ id: U.uid('tl'), createdAt: Date.now() }, payload)
            );
          }, 'timelog:create');
          U.toast('已记录 ' + U.fmtDur(durationOf(payload.startTime, payload.endTime)) + ' 工作时长', 'success');
        }
        m.close();
      },
    }, [isEdit ? '保存修改' : '记录']);

    var m = UI.modal({
      title: isEdit ? '编辑流水' : '记录时间段',
      subtitle: '填写描述后系统会自动归类',
      width: 'max-w-xl',
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

  /* ---------------- 渲染 ---------------- */

  function render(root) {
    if (!viewDate) viewDate = U.today();
    var cat = Store.categoryStats(viewDate);
    var logs = cat.logs.slice().sort(function (a, b) {
      return U.toMin(a.startTime) - U.toMin(b.startTime);
    });

    /* 顶部 */
    var head = U.el('div', { class: 'flex flex-wrap items-center gap-2' });
    head.appendChild(
      U.el('button', {
        class: 'btn btn-icon',
        onclick: function () {
          viewDate = U.ymd(U.addDays(U.parseYmd(viewDate), -1));
          global.OpsDesk.App.render();
        },
      }, ['‹'])
    );
    var viewPicker = global.OpsDesk.Picker.dateField({
      value: viewDate,
      className: 'w-[150px]',
    });
    viewPicker.addEventListener('change', function () {
      viewDate = viewPicker.value;
      global.OpsDesk.App.render();
    });
    head.appendChild(viewPicker.el);
    head.appendChild(
      U.el('button', {
        class: 'btn btn-icon',
        onclick: function () {
          viewDate = U.ymd(U.addDays(U.parseYmd(viewDate), 1));
          global.OpsDesk.App.render();
        },
      }, ['›'])
    );
    head.appendChild(
      U.el('button', {
        class: 'chip ' + (viewDate === U.today() ? 'chip-active' : ''),
        onclick: function () { viewDate = U.today(); global.OpsDesk.App.render(); },
      }, ['今天'])
    );
    head.appendChild(U.el('div', { class: 'flex-1' }));

    // 快速打卡输入行
    var quickDesc = U.el('input', {
      class: 'input w-full',
      type: 'text',
      placeholder: '快速记录：14:00-16:00 编写 Spark 脚本（回车保存）',
    });
    head.appendChild(
      U.el('div', { class: 'flex w-full items-center gap-2 lg:w-auto lg:flex-1' }, [
        quickDesc,
        U.el('button', {
          class: 'btn btn-primary shrink-0',
          onclick: function () {
            var v = quickDesc.value.trim();
            if (!v) { U.toast('请先输入工作内容', 'warn'); quickDesc.focus(); return; }
            var m = /^(\d{1,2})\s*[:：]\s*(\d{2})\s*[-~—至到]\s*(\d{1,2})\s*[:：]\s*(\d{2})/.exec(v);
            if (m) {
              var start = U.pad(+m[1]) + ':' + m[2];
              var end = U.pad(+m[3]) + ':' + m[4];
              var desc = v.slice(m[0].length).trim() || v;
              Store.mutate(function (s) {
                s.timeLogs.push({
                  id: U.uid('tl'),
                  date: viewDate,
                  startTime: start,
                  endTime: end,
                  category: inferCategory(desc),
                  desc: desc,
                  project: null,
                  createdAt: Date.now(),
                });
              }, 'timelog:create');
              quickDesc.value = '';
              U.toast('已记录 ' + U.fmtDur(durationOf(start, end)) + '（' + Store.dictItem('timeCategory', inferCategory(desc)).label + '）', 'success');
            } else {
              openEditor();
            }
          },
        }, ['⏱ 记录']),
      ])
    );

    /* 统计区 */
    var donutBox = U.el('div', { class: 'panel' });
    donutBox.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '当日时间分配' }),
        U.el('div', { class: 'num text-[11px] text-mute', text: U.friendlyDate(viewDate) + ' · ' + cat.logs.length + ' 条流水' }),
      ])
    );
    var donutBody = U.el('div', { class: 'px-5 py-4' });
    var chartWrap = U.el('div', { class: 'mx-auto w-[210px]' });
    chartWrap.appendChild(
      UI.donut(
        cat.buckets.map(function (b) {
          return { label: b.label, value: b.minutes, color: b.color };
        }),
        { size: 210, stroke: 24, centerLabel: '总时长' }
      )
    );
    donutBody.appendChild(chartWrap);

    var legend = U.el('div', { class: 'mt-4 space-y-2' });
    cat.buckets.forEach(function (b) {
      legend.appendChild(
        U.el('div', { class: 'flex items-center justify-between text-[11.5px]' }, [
          U.el('span', { class: 'flex items-center gap-1.5 text-dim' }, [
            U.el('span', { class: 'h-2 w-2 rounded-sm', style: { background: b.color } }),
            U.el('span', { text: b.label }),
            U.el('span', { class: 'text-mute', text: '(' + b.count + ')' }),
          ]),
          U.el('span', { class: 'num text-mute' }, [
            U.fmtDur(b.minutes) + ' · ' + b.pct + '%',
          ]),
        ])
      );
    });
    donutBody.appendChild(legend);
    donutBox.appendChild(donutBody);

    var barsBox = U.el('div', { class: 'panel' });
    barsBox.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '分类占比' }),
        U.el('div', { class: 'text-[11px] text-mute', text: '总计 ' + U.fmtDur(cat.total) }),
      ])
    );
    var barsBody = U.el('div', { class: 'px-5 py-4' });
    barsBody.appendChild(
      UI.bars(
        cat.buckets.map(function (b) {
          return { label: b.label, value: b.minutes, color: b.color };
        })
      )
    );
    barsBox.appendChild(barsBody);

    /* 流水列表 */
    var listBox = U.el('div', { class: 'panel' });
    listBox.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '流水明细' }),
        U.el('div', { class: 'text-[11px] text-mute', text: '共 ' + logs.length + ' 条' }),
      ])
    );
    var listBody = U.el('div', { class: 'divide-y divide-line/40' });
    if (!logs.length) {
      listBody.appendChild(
        U.el('div', { class: 'flex h-32 flex-col items-center justify-center gap-2 text-center' }, [
          U.el('div', { class: 'text-2xl opacity-40', text: '⏱' }),
          U.el('div', { class: 'text-[13px] text-mute', text: '这一天还没有时间记录' }),
        ])
      );
    }
    logs.forEach(function (l) {
      var c = Store.dictItem('timeCategory', l.category);
      var mins = durationOf(l.startTime, l.endTime);
      listBody.appendChild(
        U.el('div', { class: 'group relative flex items-center gap-3 px-4 py-2.5 row-hover' }, [
          U.el('div', { class: 'num w-[92px] shrink-0 text-[11px] text-mute' }, [
            U.el('span', { class: 'text-dim', text: l.startTime }),
            U.el('span', { class: 'mx-1', text: '–' }),
            U.el('span', { class: 'text-dim', text: l.endTime }),
          ]),
          U.el('span', {
            class: 'h-7 w-1 shrink-0 rounded-full',
            style: { background: c.color },
          }),
          U.el('div', { class: 'min-w-0 flex-[1_1_auto]' }, [
            U.el('div', { class: 'truncate text-[12.5px] text-ink', text: l.desc }),
            U.el('div', { class: 'mt-0.5 flex items-center gap-2 truncate text-[10.5px] text-mute' }, [
              U.el('span', { class: 'shrink-0', text: c.label }),
              l.project ? U.el('span', { class: 'truncate', text: '· ' + Store.projectName(l.project) }) : null,
            ]),
          ]),
          U.el('div', { class: 'num w-[46px] shrink-0 text-right text-[11.5px] font-semibold text-dim', text: U.fmtDur(mins) }),
          U.el('div', { class: 'absolute right-3 top-1/2 flex -translate-y-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100' }, [
            U.el('button', {
              class: 'btn btn-ghost btn-icon h-7 w-7 text-[11px]',
              title: '编辑',
              onclick: function () { openEditor(l); },
            }, ['✎']),
            U.el('button', {
              class: 'btn btn-ghost btn-icon h-7 w-7 text-[11px]',
              title: '删除',
              onclick: function () {
                Store.mutate(function (s) {
                  s.timeLogs = s.timeLogs.filter(function (x) { return x.id !== l.id; });
                }, 'timelog:delete');
                U.toast('记录已删除', 'success');
              },
            }, ['🗑']),
          ]),
        ])
      );
    });
    listBox.appendChild(listBody);

    root.innerHTML = '';
    root.appendChild(
      U.el('div', { class: 'space-y-4 animate-fade-up' }, [
        U.el('div', {}, [
          U.el('h2', { class: 'text-[15px] font-bold text-ink', text: '时间分配流水账' }),
          U.el('div', { class: 'mt-0.5 text-[11.5px] text-mute', text: '极简打卡 · 自动识别时长与分类 · 生成当日占比分布' }),
        ]),
        head,
        U.el('div', { class: 'auto-cols auto-cols-narrow' }, [
          U.el('div', { class: 'space-y-4' }, [donutBox, barsBox]),
          listBox,
        ]),
      ])
    );
  }

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.TimeLog = {
    render: render,
    openEditor: openEditor,
    inferCategory: inferCategory,
    durationOf: durationOf,
    get viewDate() { return viewDate; },
    /** 设置当前查看日期（供外部跳转/深链接使用） */
    setViewDate: function (d) {
      if (!d) return;
      viewDate = d;
    },
  };
})(window);
