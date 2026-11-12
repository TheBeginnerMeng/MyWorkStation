/* ============================================================
   queries.js — 取数登记台账
   把业务取数需求的全链路留痕沉淀下来：
     指标口径   —— 指标是否可取、口径如何定义、由谁确认
     取数 SQL   —— 脚本文本 + 代码仓存放路径 + 涉及表 + 执行环境
     取数结果   —— 结果文件路径 + 结果摘要 + 数据行数
     沟通留痕   —— 邮件 / 会议 / 即时沟通
     核对记录   —— 与产品逐条核对的结论与差异
     口径变更   —— 口径改过几次、为什么改、谁改的
   目的是让历史口径可追溯，业务与数据侧都有据可依。
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;
  var Store = global.OpsDesk.Store;
  var UI = global.OpsDesk.UI;

  var filter = {
    status: 'all',
    priority: 'all',
    range: 'all',
    keyword: '',
  };

  /** 时间范围筛选口径 */
  var RANGES = [
    { key: 'all', label: '全部时间', days: 0 },
    { key: 'month', label: '近 30 天', days: 30 },
    { key: 'quarter', label: '近 90 天', days: 90 },
    { key: 'year', label: '近一年', days: 365 },
  ];

  /** SQL 执行环境 */
  var SQL_ENVS = ['生产', '预发', '测试'];

  /** 取数单编辑弹窗的分区 */
  var TABS = [
    { key: 'basic', label: '需求信息' },
    { key: 'metric', label: '指标口径' },
    { key: 'sql', label: 'SQL 与结果' },
    { key: 'channel', label: '沟通留痕' },
    { key: 'check', label: '核对与变更' },
  ];

  /* ---------------- 基础工具 ---------------- */

  function allQueries() {
    return Store.state.queries || [];
  }

  function statusOf(key) {
    return Store.dictItem('queryStatus', key);
  }

  function priorityOf(key) {
    return Store.dictItem('queryPriority', key);
  }

  function channelTypeOf(key) {
    return Store.dictItem('channelType', key);
  }

  function field(label, control, hint) {
    var wrap = U.el('div', {});
    wrap.appendChild(U.el('label', { class: 'label', text: label }));
    wrap.appendChild(control);
    if (hint) wrap.appendChild(U.el('div', { class: 'hint', text: hint }));
    return wrap;
  }

  /**
   * 生成下一个取数编号：QS + YYYYMMDD + 当日 2 位序号。
   * 沿用既有 Excel 台账的编号格式，便于与历史台账对齐。
   */
  function nextCode(dateStr) {
    var ymd = String(dateStr || '').replace(/-/g, '');
    if (!/^\d{8}$/.test(ymd)) ymd = U.today().replace(/-/g, '');
    var prefix = 'QS' + ymd;
    var max = 0;
    allQueries().forEach(function (q) {
      var c = String(q.code || '');
      if (c.indexOf(prefix) !== 0) return;
      var n = parseInt(c.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return prefix + U.pad(max + 1);
  }

  function rangeStart(key) {
    var r = RANGES.filter(function (x) {
      return x.key === key;
    })[0];
    if (!r || !r.days) return '';
    return U.ymd(U.addDays(new Date(), -r.days));
  }

  /** 当前筛选条件下是否保留这张取数单 */
  function matchQuery(q) {
    if (filter.status !== 'all' && q.status !== filter.status) return false;
    if (filter.priority !== 'all' && q.priority !== filter.priority) return false;

    var start = rangeStart(filter.range);
    if (start) {
      var d = q.requestDate || '';
      if (!d || d < start) return false;
    }

    if (filter.keyword) {
      var kw = filter.keyword.toLowerCase();
      var hay = [q.code, q.title, q.requester, q.pm, q.owner, q.executor, q.note]
        .join(' ')
        .toLowerCase();
      if (hay.indexOf(kw) < 0) return false;
    }
    return true;
  }

  /** 列表排序：需求日期倒序，同日按编号倒序 */
  function cmpQueryDesc(a, b) {
    var da = a.requestDate || '';
    var db = b.requestDate || '';
    if (da !== db) return da < db ? 1 : -1;
    var ca = String(a.code || '');
    var cb = String(b.code || '');
    if (ca !== cb) return ca < cb ? 1 : -1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  }

  function hasFilter() {
    return (
      filter.status !== 'all' ||
      filter.priority !== 'all' ||
      filter.range !== 'all' ||
      !!filter.keyword
    );
  }

  function resetFilter() {
    filter.status = 'all';
    filter.priority = 'all';
    filter.range = 'all';
    filter.keyword = '';
  }

  /* ---------------- 通用展示片段 ---------------- */

  function subRow(opts) {
    return U.el(
      'div',
      {
        class:
          'group flex cursor-pointer items-start gap-2.5 rounded-lg border border-line/50 bg-raised/30 px-3 py-2 transition hover:border-brand/40 hover:bg-raised/60',
        title: opts.hint || '点击编辑',
        onclick: opts.onclick,
      },
      [
        opts.icon ? U.el('span', { class: 'mt-0.5 text-[12px]', text: opts.icon }) : null,
        U.el('div', { class: 'min-w-0 flex-1' }, [
          U.el('div', { class: 'truncate text-[12.5px] text-ink', text: opts.title }),
          opts.meta
            ? U.el('div', { class: 'mt-0.5 truncate text-[10.5px] text-mute', text: opts.meta })
            : null,
        ]),
        opts.badge || null,
      ]
    );
  }

  function sectionHead(title, count, onAdd) {
    return U.el('div', { class: 'flex items-center gap-2' }, [
      U.el('span', { class: 'kicker', text: title }),
      count != null
        ? U.el('span', {
            class: 'num rounded-md bg-line/30 px-1.5 text-[10px] text-mute',
            text: String(count),
          })
        : null,
      U.el('div', { class: 'flex-1' }),
      onAdd
        ? U.el(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost h-6 rounded-md px-2 text-[11px]',
              title: '添加',
              onclick: onAdd,
            },
            ['＋ 添加']
          )
        : null,
    ]);
  }

  function emptyBlock(text) {
    return U.el('div', {
      class: 'rounded-lg border border-dashed border-line/60 px-3 py-4 text-center text-[11.5px] text-mute',
      text: text,
    });
  }

  /**
   * 带「实时计数」的分区标题。
   * 弹窗内增删子记录时计数要跟着变，所以把计数节点单独交出去。
   */
  function liveSectionHead(title) {
    var countEl = U.el('span', {
      class: 'num rounded-md bg-line/30 px-1.5 text-[10px] text-mute',
      text: '0',
    });
    var el = U.el('div', { class: 'flex items-center gap-2' }, [
      U.el('span', { class: 'kicker', text: title }),
      countEl,
    ]);
    return {
      el: el,
      countEl: countEl,
      setCount: function (n) {
        countEl.textContent = String(n);
      },
    };
  }

  /* ---------------- 草稿列表工厂 ---------------- */

  /**
   * 弹窗内的子记录草稿列表。
   * cfg = { host, items, row(item), open(item, onSave, onDelete), addLabel, emptyText }
   * 打开弹窗期间的增删改只落在内存草稿里，点「保存取数单」才落库。
   */
  function createDraftList(cfg) {
    var items = cfg.items;

    function refresh() {
      cfg.host.innerHTML = '';
      if (!items.length) {
        cfg.host.appendChild(emptyBlock(cfg.emptyText));
      } else {
        items.forEach(function (it) {
          cfg.host.appendChild(cfg.row(it));
        });
      }
      cfg.host.appendChild(
        U.el(
          'button',
          {
            type: 'button',
            class: 'btn w-full border-dashed text-[11.5px]',
            onclick: add,
          },
          ['＋ ' + cfg.addLabel]
        )
      );
      if (cfg.onChange) cfg.onChange(items.length);
    }

    function add() {
      cfg.open(null, function (payload) {
        items.push(payload);
        refresh();
      });
    }

    function edit(item) {
      cfg.open(
        item,
        function (payload) {
          var t = items.filter(function (x) {
            return x.id === item.id;
          })[0];
          if (t) Object.assign(t, payload);
          refresh();
        },
        function (target) {
          for (var i = 0; i < items.length; i++) {
            if (items[i].id === target.id) {
              items.splice(i, 1);
              break;
            }
          }
          refresh();
        }
      );
    }

    refresh();

    return {
      refresh: refresh,
      edit: edit,
      add: add,
      items: items,
    };
  }

  /* ---------------- 指标口径编辑弹窗 ---------------- */

  /**
   * 打开「指标口径」编辑弹窗
   * @param {Object} opts {metric, onSave(payload), onDelete(metric)}
   */
  function openMetricEditor(opts) {
    opts = opts || {};
    var isEdit = !!opts.metric;
    var mt = opts.metric || {
      name: '',
      definition: '',
      dims: '',
      filters: '',
      confirmedBy: '',
      confirmedAt: '',
    };

    var fName = U.el('input', {
      class: 'input',
      type: 'text',
      value: mt.name || '',
      placeholder: '例如：年度信息安全培训次数',
    });
    var fDef = U.el('textarea', {
      class: 'input',
      placeholder: '这个指标到底怎么算？写清楚统计对象、时间口径、分子分母……',
    });
    fDef.value = mt.definition || '';
    var fDims = U.el('input', {
      class: 'input',
      type: 'text',
      value: mt.dims || '',
      placeholder: '例如：年份 × 参训范围（全体职工 / 本年新入职）',
    });
    var fFilters = U.el('textarea', {
      class: 'input',
      placeholder: '过滤条件、关键词命中规则、排除项……',
    });
    fFilters.value = mt.filters || '';
    var fBy = U.el('input', {
      class: 'input',
      type: 'text',
      value: mt.confirmedBy || '',
      placeholder: '例如：产品一组 · 乙同学',
    });
    var fAt = global.OpsDesk.Picker.dateField({ value: mt.confirmedAt || '' });

    var err = U.el('div', { class: 'hint hint-error hidden' });

    function setErr(msg) {
      if (msg) {
        err.textContent = msg;
        err.classList.remove('hidden');
      } else {
        err.textContent = '';
        err.classList.add('hidden');
      }
    }

    function validate(silent) {
      var name = fName.value.trim();
      var def = fDef.value.trim();
      fName.classList.toggle('input-invalid', !name);
      fDef.classList.toggle('input-invalid', !def);
      if (!name) {
        setErr('请填写指标名称');
        if (!silent) fName.focus();
        return false;
      }
      if (!def) {
        setErr('请填写口径定义 —— 这正是后续追溯时最需要的内容');
        if (!silent) fDef.focus();
        return false;
      }
      setErr(null);
      return true;
    }

    fName.addEventListener('input', function () {
      validate(true);
    });
    fDef.addEventListener('input', function () {
      validate(true);
    });

    var saveBtn = U.el('button', {
      class: 'btn btn-primary btn-lg',
      onclick: function () {
        if (!validate()) return;
        opts.onSave({
          id: isEdit ? mt.id : U.uid('qmt'),
          name: fName.value.trim(),
          definition: fDef.value.trim(),
          dims: fDims.value.trim(),
          filters: fFilters.value.trim(),
          confirmedBy: fBy.value.trim(),
          confirmedAt: fAt.value || '',
        });
        m.close();
      },
    }, [isEdit ? '保存口径' : '添加口径']);

    var footer = [
      U.el('button', {
        class: 'btn btn-lg',
        onclick: function () {
          m.close();
        },
      }, ['取消']),
    ];
    if (isEdit && opts.onDelete) {
      footer.unshift(
        U.el('button', {
          class: 'btn btn-danger btn-lg',
          onclick: function () {
            m.close();
            opts.onDelete(mt);
          },
        }, ['删除口径'])
      );
    }
    footer.push(saveBtn);

    var m = UI.modal({
      title: isEdit ? '编辑指标口径' : '添加指标口径',
      subtitle: '指标名称与口径定义为必填项',
      width: 'max-w-2xl',
      body: U.el('div', { class: 'space-y-4' }, [
        field('指标名称 *', fName),
        field('口径定义 *', fDef, '写清楚统计对象、时间范围、分子分母，避免事后各说各话'),
        field('统计维度', fDims),
        field('过滤条件', fFilters),
        U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-2' }, [
          field('口径确认人', fBy),
          field('确认日期', fAt.el),
        ]),
        err,
      ]),
      footer: footer,
    });

    m.overlay.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    });
    return m;
  }

  /* ---------------- 沟通留痕编辑弹窗 ---------------- */

  function openChannelEditor(opts) {
    opts = opts || {};
    var isEdit = !!opts.channel;
    var ch = opts.channel || {
      type: 'email',
      date: U.today(),
      subject: '',
      from: '',
      to: '',
      cc: '',
      content: '',
    };

    var fType = U.el('select', { class: 'input' });
    Store.dict('channelType').forEach(function (d) {
      fType.appendChild(
        U.el('option', { value: d.key, text: d.icon + ' ' + d.label, selected: d.key === ch.type })
      );
    });
    var fDate = global.OpsDesk.Picker.dateField({ value: ch.date || U.today() });
    var fSubject = U.el('input', {
      class: 'input',
      type: 'text',
      value: ch.subject || '',
      placeholder: '例如：【取数需求】职工安全培训学时与参训人次统计',
    });
    var fFrom = U.el('input', {
      class: 'input',
      type: 'text',
      value: ch.from || '',
      placeholder: '发件 / 发起人，例如：人力资源部 · 丙同学',
    });
    var fTo = U.el('input', {
      class: 'input',
      type: 'text',
      value: ch.to || '',
      placeholder: '收件 / 对接人，例如：产品一组 · 乙同学',
    });
    var fCc = U.el('input', {
      class: 'input',
      type: 'text',
      value: ch.cc || '',
      placeholder: '抄送人，例如：数据侧 · 甲同学',
    });
    var fContent = U.el('textarea', {
      class: 'input',
      placeholder: '邮件正文 / 会议结论 / 沟通要点的摘要，保留关键口径表述',
    });
    fContent.value = ch.content || '';

    var err = U.el('div', { class: 'hint hint-error hidden' });

    function setErr(msg) {
      if (msg) {
        err.textContent = msg;
        err.classList.remove('hidden');
      } else {
        err.textContent = '';
        err.classList.add('hidden');
      }
    }

    function validate(silent) {
      var subject = fSubject.value.trim();
      fSubject.classList.toggle('input-invalid', !subject);
      if (!subject) {
        setErr('请填写沟通主题');
        if (!silent) fSubject.focus();
        return false;
      }
      setErr(null);
      return true;
    }

    fSubject.addEventListener('input', function () {
      validate(true);
    });

    var saveBtn = U.el('button', {
      class: 'btn btn-primary btn-lg',
      onclick: function () {
        if (!validate()) return;
        opts.onSave({
          id: isEdit ? ch.id : U.uid('qch'),
          type: fType.value,
          date: fDate.value || U.today(),
          subject: fSubject.value.trim(),
          from: fFrom.value.trim(),
          to: fTo.value.trim(),
          cc: fCc.value.trim(),
          content: fContent.value.trim(),
        });
        m.close();
      },
    }, [isEdit ? '保存记录' : '添加记录']);

    var footer = [
      U.el('button', {
        class: 'btn btn-lg',
        onclick: function () {
          m.close();
        },
      }, ['取消']),
    ];
    if (isEdit && opts.onDelete) {
      footer.unshift(
        U.el('button', {
          class: 'btn btn-danger btn-lg',
          onclick: function () {
            m.close();
            opts.onDelete(ch);
          },
        }, ['删除记录'])
      );
    }
    footer.push(saveBtn);

    var m = UI.modal({
      title: isEdit ? '编辑沟通留痕' : '添加沟通留痕',
      subtitle: '邮件、会议、IM 的关键结论都留一份底',
      width: 'max-w-2xl',
      body: U.el('div', { class: 'space-y-4' }, [
        U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-2' }, [
          field('沟通类型', fType),
          field('沟通日期 *', fDate.el),
        ]),
        field('主题 *', fSubject),
        U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-3' }, [
          field('发件 / 发起', fFrom),
          field('收件 / 对接', fTo),
          field('抄送', fCc),
        ]),
        field('内容摘要', fContent),
        err,
      ]),
      footer: footer,
    });

    m.overlay.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    });
    return m;
  }

  /* ---------------- 核对记录编辑弹窗 ---------------- */

  function openCheckEditor(opts) {
    opts = opts || {};
    var isEdit = !!opts.check;
    var ck = opts.check || { date: U.today(), withWho: '', result: '', diff: '', note: '' };

    var fDate = global.OpsDesk.Picker.dateField({ value: ck.date || U.today() });
    var fWith = U.el('input', {
      class: 'input',
      type: 'text',
      value: ck.withWho || '',
      placeholder: '与谁核对，例如：产品一组 · 乙同学',
    });
    var fResult = U.el('input', {
      class: 'input',
      type: 'text',
      value: ck.result || '',
      placeholder: '例如：双方核对一致 / 存在差异已修正 / 待二次核对',
    });
    var fDiff = U.el('textarea', {
      class: 'input',
      placeholder: '差异在哪里？差异多少？是否已修正',
    });
    fDiff.value = ck.diff || '';
    var fNote = U.el('textarea', { class: 'input', placeholder: '核对方式、抽样范围、遗留问题…' });
    fNote.value = ck.note || '';

    var err = U.el('div', { class: 'hint hint-error hidden' });

    function setErr(msg) {
      if (msg) {
        err.textContent = msg;
        err.classList.remove('hidden');
      } else {
        err.textContent = '';
        err.classList.add('hidden');
      }
    }

    function validate(silent) {
      var res = fResult.value.trim();
      fResult.classList.toggle('input-invalid', !res);
      if (!res) {
        setErr('请填写核对结论');
        if (!silent) fResult.focus();
        return false;
      }
      setErr(null);
      return true;
    }

    fResult.addEventListener('input', function () {
      validate(true);
    });

    var saveBtn = U.el('button', {
      class: 'btn btn-primary btn-lg',
      onclick: function () {
        if (!validate()) return;
        opts.onSave({
          id: isEdit ? ck.id : U.uid('qck'),
          date: fDate.value || U.today(),
          withWho: fWith.value.trim(),
          result: fResult.value.trim(),
          diff: fDiff.value.trim(),
          note: fNote.value.trim(),
        });
        m.close();
      },
    }, [isEdit ? '保存核对记录' : '添加核对记录']);

    var footer = [
      U.el('button', {
        class: 'btn btn-lg',
        onclick: function () {
          m.close();
        },
      }, ['取消']),
    ];
    if (isEdit && opts.onDelete) {
      footer.unshift(
        U.el('button', {
          class: 'btn btn-danger btn-lg',
          onclick: function () {
            m.close();
            opts.onDelete(ck);
          },
        }, ['删除记录'])
      );
    }
    footer.push(saveBtn);

    var m = UI.modal({
      title: isEdit ? '编辑核对记录' : '添加核对记录',
      subtitle: '与产品核对数据的过程与结论都要留痕',
      width: 'max-w-lg',
      body: U.el('div', { class: 'space-y-4' }, [
        U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-2' }, [
          field('核对日期 *', fDate.el),
          field('核对对象', fWith),
        ]),
        field('核对结论 *', fResult),
        field('差异说明', fDiff),
        field('备注', fNote),
        err,
      ]),
      footer: footer,
    });

    m.overlay.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    });
    return m;
  }

  /* ---------------- 口径变更编辑弹窗 ---------------- */

  function openCaliberEditor(opts) {
    opts = opts || {};
    var isEdit = !!opts.change;
    var cc = opts.change || { date: U.today(), from: '', to: '', reason: '', by: '' };

    var fDate = global.OpsDesk.Picker.dateField({ value: cc.date || U.today() });
    var fFrom = U.el('textarea', { class: 'input', placeholder: '原来的口径是什么' });
    fFrom.value = cc.from || '';
    var fTo = U.el('textarea', { class: 'input', placeholder: '改成了什么口径' });
    fTo.value = cc.to || '';
    var fReason = U.el('textarea', {
      class: 'input',
      placeholder: '为什么改？业务诉求变了还是历史口径有误',
    });
    fReason.value = cc.reason || '';
    var fBy = U.el('input', {
      class: 'input',
      type: 'text',
      value: cc.by || '',
      placeholder: '变更人，例如：数据侧 · 甲同学',
    });

    var err = U.el('div', { class: 'hint hint-error hidden' });

    function setErr(msg) {
      if (msg) {
        err.textContent = msg;
        err.classList.remove('hidden');
      } else {
        err.textContent = '';
        err.classList.add('hidden');
      }
    }

    function validate(silent) {
      var from = fFrom.value.trim();
      var to = fTo.value.trim();
      fFrom.classList.toggle('input-invalid', !from);
      fTo.classList.toggle('input-invalid', !to);
      if (!from) {
        setErr('请填写变更前的口径');
        if (!silent) fFrom.focus();
        return false;
      }
      if (!to) {
        setErr('请填写变更后的口径');
        if (!silent) fTo.focus();
        return false;
      }
      setErr(null);
      return true;
    }

    fFrom.addEventListener('input', function () {
      validate(true);
    });
    fTo.addEventListener('input', function () {
      validate(true);
    });

    var saveBtn = U.el('button', {
      class: 'btn btn-primary btn-lg',
      onclick: function () {
        if (!validate()) return;
        opts.onSave({
          id: isEdit ? cc.id : U.uid('qcc'),
          date: fDate.value || U.today(),
          from: fFrom.value.trim(),
          to: fTo.value.trim(),
          reason: fReason.value.trim(),
          by: fBy.value.trim(),
        });
        m.close();
      },
    }, [isEdit ? '保存变更记录' : '添加变更记录']);

    var footer = [
      U.el('button', {
        class: 'btn btn-lg',
        onclick: function () {
          m.close();
        },
      }, ['取消']),
    ];
    if (isEdit && opts.onDelete) {
      footer.unshift(
        U.el('button', {
          class: 'btn btn-danger btn-lg',
          onclick: function () {
            m.close();
            opts.onDelete(cc);
          },
        }, ['删除记录'])
      );
    }
    footer.push(saveBtn);

    var m = UI.modal({
      title: isEdit ? '编辑口径变更' : '添加口径变更',
      subtitle: '口径改过几次、为什么改，都要能查得到',
      width: 'max-w-lg',
      body: U.el('div', { class: 'space-y-4' }, [
        field('变更日期 *', fDate.el),
        field('变更前口径 *', fFrom),
        field('变更后口径 *', fTo),
        field('变更原因', fReason),
        field('变更人', fBy),
        err,
      ]),
      footer: footer,
    });

    m.overlay.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    });
    return m;
  }

  /* ---------------- 已保存取数单上的子记录增删改 ---------------- */

  /** 统一的子记录写入：把 payload 写进取数单的某个子数组 */
  function patchSub(query, key, payload, mode, targetId) {
    Store.mutate(function (s) {
      var q = (s.queries || []).filter(function (x) {
        return x.id === query.id;
      })[0];
      if (!q) return;
      if (!Array.isArray(q[key])) q[key] = [];
      if (mode === 'create') {
        q[key].push(payload);
      } else if (mode === 'update') {
        var it = q[key].filter(function (x) {
          return x.id === targetId;
        })[0];
        if (it) Object.assign(it, payload);
      } else if (mode === 'delete') {
        q[key] = q[key].filter(function (x) {
          return x.id !== targetId;
        });
      }
      q.updatedAt = Date.now();
    }, 'query:' + key + ':' + mode);
  }

  function addMetricTo(query) {
    openMetricEditor({
      metric: null,
      onSave: function (payload) {
        patchSub(query, 'metrics', payload, 'create');
        U.toast('指标口径已添加', 'success');
      },
    });
  }

  function editMetricOf(query, metric) {
    openMetricEditor({
      metric: metric,
      onSave: function (payload) {
        patchSub(query, 'metrics', payload, 'update', metric.id);
        U.toast('指标口径已更新', 'success');
      },
      onDelete: function (target) {
        patchSub(query, 'metrics', null, 'delete', target.id);
        U.toast('指标口径已删除', 'success');
      },
    });
  }

  function addChannelTo(query) {
    openChannelEditor({
      channel: null,
      onSave: function (payload) {
        patchSub(query, 'channels', payload, 'create');
        U.toast('沟通留痕已添加', 'success');
      },
    });
  }

  function editChannelOf(query, channel) {
    openChannelEditor({
      channel: channel,
      onSave: function (payload) {
        patchSub(query, 'channels', payload, 'update', channel.id);
        U.toast('沟通留痕已更新', 'success');
      },
      onDelete: function (target) {
        patchSub(query, 'channels', null, 'delete', target.id);
        U.toast('沟通留痕已删除', 'success');
      },
    });
  }

  function addCheckTo(query) {
    openCheckEditor({
      check: null,
      onSave: function (payload) {
        patchSub(query, 'checks', payload, 'create');
        U.toast('核对记录已添加', 'success');
      },
    });
  }

  function editCheckOf(query, check) {
    openCheckEditor({
      check: check,
      onSave: function (payload) {
        patchSub(query, 'checks', payload, 'update', check.id);
        U.toast('核对记录已更新', 'success');
      },
      onDelete: function (target) {
        patchSub(query, 'checks', null, 'delete', target.id);
        U.toast('核对记录已删除', 'success');
      },
    });
  }

  function addCaliberTo(query) {
    openCaliberEditor({
      change: null,
      onSave: function (payload) {
        patchSub(query, 'caliberChanges', payload, 'create');
        U.toast('口径变更已添加', 'success');
      },
    });
  }

  function editCaliberOf(query, change) {
    openCaliberEditor({
      change: change,
      onSave: function (payload) {
        patchSub(query, 'caliberChanges', payload, 'update', change.id);
        U.toast('口径变更已更新', 'success');
      },
      onDelete: function (target) {
        patchSub(query, 'caliberChanges', null, 'delete', target.id);
        U.toast('口径变更已删除', 'success');
      },
    });
  }

  /* ---------------- 取数单主弹窗 ---------------- */

  /**
   * 打开取数单编辑弹窗
   * @param {Object|null} query 传入为编辑，null 为新建
   * @param {Object} opts {asNew:true} 即使传了对象也按新建处理
   */
  function openEditor(query, opts) {
    opts = opts || {};
    var isEdit = !!query && !opts.asNew;
    var q = query
      ? U.clone(query)
      : {
          code: '',
          title: '',
          requester: '',
          pm: '',
          owner: '',
          executor: '',
          requestDate: U.today(),
          periodStart: '',
          periodEnd: '',
          dueDate: '',
          priority: 'P2',
          status: 'pending_eval',
          metrics: [],
          sqlText: '',
          sqlPath: '',
          sqlTables: '',
          sqlEnv: '生产',
          executedAt: '',
          rowCount: 0,
          resultPath: '',
          resultSummary: '',
          channels: [],
          checks: [],
          caliberChanges: [],
          note: '',
        };

    // 弹窗打开期间的子记录增删改先落在草稿里，点「保存取数单」才落库
    var draftMetrics = (q.metrics || []).slice();
    var draftChannels = (q.channels || []).slice();
    var draftChecks = (q.checks || []).slice();
    var draftCalibers = (q.caliberChanges || []).slice();

    /* ---- 基本信息控件 ---- */
    var fCode = U.el('input', {
      class: 'input num',
      type: 'text',
      value: isEdit ? q.code : nextCode(q.requestDate),
      readonly: true,
    });
    var fTitle = U.el('input', {
      class: 'input',
      type: 'text',
      value: q.title || '',
      placeholder: '例如：职工安全培训学时与参训人次取数',
    });
    var fRequester = U.el('input', {
      class: 'input',
      type: 'text',
      value: q.requester || '',
      placeholder: '业务需求方，例如：人力资源部（业务方）',
    });
    var fPm = U.el('input', {
      class: 'input',
      type: 'text',
      value: q.pm || '',
      placeholder: '对接产品经理，例如：产品一组 · 乙同学',
    });
    var fOwner = U.el('input', {
      class: 'input',
      type: 'text',
      value: q.owner || '',
      placeholder: '数据侧对接人，例如：数据侧 · 甲同学',
    });
    var fExecutor = U.el('input', {
      class: 'input',
      type: 'text',
      value: q.executor || '',
      placeholder: '取数 SQL 执行人，例如：数据开发 · 我',
    });
    var fRequestDate = global.OpsDesk.Picker.dateField({ value: q.requestDate || U.today() });
    var fPeriodStart = global.OpsDesk.Picker.dateField({ value: q.periodStart || '' });
    var fPeriodEnd = global.OpsDesk.Picker.dateField({ value: q.periodEnd || '' });
    var fDueDate = global.OpsDesk.Picker.dateField({ value: q.dueDate || '' });
    var fPriority = U.el('select', { class: 'input' });
    var fStatus = U.el('select', { class: 'input' });

    Store.dict('queryPriority').forEach(function (d) {
      fPriority.appendChild(
        U.el('option', { value: d.key, text: d.label, selected: d.key === q.priority })
      );
    });
    Store.dict('queryStatus').forEach(function (d) {
      fStatus.appendChild(
        U.el('option', { value: d.key, text: d.label, selected: d.key === q.status })
      );
    });

    // 新建时改需求日期，编号跟着变（编号按需求日期生成）
    if (!isEdit) {
      fRequestDate.addEventListener('change', function () {
        fCode.value = nextCode(fRequestDate.value);
      });
    }

    /* ---- SQL 与结果控件 ---- */
    var fSqlText = U.el('textarea', {
      class: 'input font-mono text-[11.5px]',
      placeholder: 'SELECT ...\n把当次执行的 SQL 原样贴进来，方便事后复核',
      style: { minHeight: '160px' },
    });
    fSqlText.value = q.sqlText || '';
    var fSqlPath = U.el('input', {
      class: 'input',
      type: 'text',
      value: q.sqlPath || '',
      placeholder: '例如：/data/query/用户域/QS2026010601',
    });
    var fSqlTables = U.el('input', {
      class: 'input',
      type: 'text',
      value: q.sqlTables || '',
      placeholder: '涉及表，逗号分隔，例如：dwd_employee_training_detail',
    });
    var fSqlEnv = U.el('select', { class: 'input' });
    SQL_ENVS.forEach(function (env) {
      fSqlEnv.appendChild(
        U.el('option', { value: env, text: env, selected: env === (q.sqlEnv || '生产') })
      );
    });
    var fExecutedAt = global.OpsDesk.Picker.dateField({ value: q.executedAt || '' });
    var fRowCount = U.el('input', {
      class: 'input num',
      type: 'number',
      value: String(q.rowCount == null ? 0 : q.rowCount),
      placeholder: '0',
    });
    var fResultPath = U.el('input', {
      class: 'input',
      type: 'text',
      value: q.resultPath || '',
      placeholder: '结果文件存放路径，例如：/home/xxx/下载/20260106-取数',
    });
    var fResultSummary = U.el('textarea', {
      class: 'input',
      placeholder: '结果摘要：关键数字、抽样自查结论、口径注意事项…',
    });
    fResultSummary.value = q.resultSummary || '';

    var fNote = U.el('textarea', {
      class: 'input',
      placeholder: '整体备注：复用提示、遗留问题、注意事项…',
    });
    fNote.value = q.note || '';

    /* ---- 分区切换 ---- */
    var tabBtns = {};
    var tabPanels = {};

    function showTab(key) {
      Object.keys(tabPanels).forEach(function (k) {
        tabPanels[k].classList.toggle('hidden', k !== key);
      });
      Object.keys(tabBtns).forEach(function (k) {
        tabBtns[k].classList.toggle('chip-active', k === key);
      });
    }

    var tabBar = U.el('div', { class: 'flex flex-wrap gap-1.5' });
    TABS.forEach(function (t) {
      var b = U.el(
        'button',
        {
          type: 'button',
          class: 'chip',
          onclick: function () {
            showTab(t.key);
          },
        },
        [t.label]
      );
      tabBtns[t.key] = b;
      tabBar.appendChild(b);
    });

    /* ---- 草稿列表宿主 ---- */
    var metricHost = U.el('div', { class: 'space-y-2' });
    var channelHost = U.el('div', { class: 'space-y-2' });
    var checkHost = U.el('div', { class: 'space-y-2' });
    var caliberHost = U.el('div', { class: 'space-y-2' });

    // 分区标题的计数随弹窗内子记录增删实时更新
    var metricHead = liveSectionHead('指标口径');
    var channelHead = liveSectionHead('沟通留痕');
    var checkHead = liveSectionHead('核对记录');
    var caliberHead = liveSectionHead('口径变更历史');

    var metricList = createDraftList({
      host: metricHost,
      items: draftMetrics,
      addLabel: '添加指标口径',
      emptyText: '还没有指标口径，点击下方「＋ 添加指标口径」登记',
      onChange: function (n) {
        metricHead.setCount(n);
      },
      row: function (mt) {
        return subRow({
          icon: '📐',
          title: mt.name || '（未命名指标）',
          meta: U.trunc(mt.definition || '', 60),
          hint: '点击编辑这条指标口径',
          onclick: function () {
            metricList.edit(mt);
          },
        });
      },
      open: function (item, onSave, onDelete) {
        openMetricEditor({
          metric: item,
          onSave: onSave,
          onDelete: onDelete,
        });
      },
    });

    var channelList = createDraftList({
      host: channelHost,
      items: draftChannels,
      addLabel: '添加沟通记录',
      emptyText: '还没有沟通留痕，点击下方「＋ 添加沟通记录」登记',
      onChange: function (n) {
        channelHead.setCount(n);
      },
      row: function (ch) {
        var t = channelTypeOf(ch.type);
        var who = [ch.from, ch.to ? '→ ' + ch.to : '', ch.cc ? '抄送 ' + ch.cc : '']
          .filter(Boolean)
          .join(' · ');
        return subRow({
          icon: t.icon,
          title: ch.subject || '（无主题）',
          meta: U.trunc((ch.date ? ch.date + ' · ' : '') + who + (ch.content ? ' · ' + ch.content : ''), 90),
          badge: U.el('span', {
            class: 'badge shrink-0',
            style: { background: U.alpha(t.color, 0.16), color: t.color },
            text: t.label,
          }),
          hint: '点击编辑这条沟通留痕',
          onclick: function () {
            channelList.edit(ch);
          },
        });
      },
      open: function (item, onSave, onDelete) {
        openChannelEditor({
          channel: item,
          onSave: onSave,
          onDelete: onDelete,
        });
      },
    });

    var checkList = createDraftList({
      host: checkHost,
      items: draftChecks,
      addLabel: '添加核对记录',
      emptyText: '还没有核对记录，点击下方「＋ 添加核对记录」登记',
      onChange: function (n) {
        checkHead.setCount(n);
      },
      row: function (ck) {
        return subRow({
          icon: '✅',
          title: ck.result || '（无结论）',
          meta: U.trunc(
            (ck.date ? ck.date + ' · ' : '') +
              (ck.withWho ? '与 ' + ck.withWho + ' 核对' : '') +
              (ck.diff ? ' · 差异：' + ck.diff : ''),
            90
          ),
          hint: '点击编辑这条核对记录',
          onclick: function () {
            checkList.edit(ck);
          },
        });
      },
      open: function (item, onSave, onDelete) {
        openCheckEditor({
          check: item,
          onSave: onSave,
          onDelete: onDelete,
        });
      },
    });

    var caliberList = createDraftList({
      host: caliberHost,
      items: draftCalibers,
      addLabel: '添加变更记录',
      emptyText: '口径未变更过，点击下方「＋ 添加变更记录」登记',
      onChange: function (n) {
        caliberHead.setCount(n);
      },
      row: function (cc) {
        return subRow({
          icon: '🔀',
          title: (cc.from || '（原口径）') + ' → ' + (cc.to || '（新口径）'),
          meta: U.trunc((cc.date ? cc.date + ' · ' : '') + (cc.by ? cc.by + ' · ' : '') + (cc.reason || ''), 90),
          hint: '点击编辑这条口径变更',
          onclick: function () {
            caliberList.edit(cc);
          },
        });
      },
      open: function (item, onSave, onDelete) {
        openCaliberEditor({
          change: item,
          onSave: onSave,
          onDelete: onDelete,
        });
      },
    });

    /* ---- 校验 ---- */
    var err = U.el('div', { class: 'hint hint-error hidden' });

    function setErr(msg) {
      if (msg) {
        err.textContent = msg;
        err.classList.remove('hidden');
      } else {
        err.textContent = '';
        err.classList.add('hidden');
      }
    }

    function validate(silent) {
      var title = fTitle.value.trim();
      fTitle.classList.toggle('input-invalid', !title);
      if (!title) {
        setErr('请填写取数内容');
        if (!silent) fTitle.focus();
        return false;
      }
      var ps = fPeriodStart.value;
      var pe = fPeriodEnd.value;
      if (ps && pe && pe < ps) {
        setErr('数据周期结束日期不能早于开始日期');
        if (!silent) fPeriodEnd.focus();
        return false;
      }
      setErr(null);
      return true;
    }

    fTitle.addEventListener('input', function () {
      validate(true);
    });

    /* ---- 保存 ---- */
    var saveBtn = U.el('button', {
      class: 'btn btn-primary btn-lg',
      onclick: function () {
        if (!validate()) return;
        var payload = {
          code: fCode.value.trim(),
          title: fTitle.value.trim(),
          requester: fRequester.value.trim(),
          pm: fPm.value.trim(),
          owner: fOwner.value.trim(),
          executor: fExecutor.value.trim(),
          requestDate: fRequestDate.value || U.today(),
          periodStart: fPeriodStart.value || '',
          periodEnd: fPeriodEnd.value || '',
          dueDate: fDueDate.value || '',
          priority: fPriority.value,
          status: fStatus.value,
          metrics: draftMetrics.slice(),
          sqlText: fSqlText.value,
          sqlPath: fSqlPath.value.trim(),
          sqlTables: fSqlTables.value.trim(),
          sqlEnv: fSqlEnv.value,
          executedAt: fExecutedAt.value || '',
          rowCount: Math.max(0, parseInt(fRowCount.value, 10) || 0),
          resultPath: fResultPath.value.trim(),
          resultSummary: fResultSummary.value.trim(),
          channels: draftChannels.slice(),
          checks: draftChecks.slice(),
          caliberChanges: draftCalibers.slice(),
          note: fNote.value.trim(),
        };

        if (isEdit) {
          Store.mutate(function (s) {
            var target = (s.queries || []).filter(function (x) {
              return x.id === query.id;
            })[0];
            if (target) Object.assign(target, payload, { updatedAt: Date.now() });
          }, 'query:update');
          U.toast('取数单「' + payload.code + '」已更新', 'success');
        } else {
          Store.mutate(function (s) {
            if (!Array.isArray(s.queries)) s.queries = [];
            s.queries.push(
              Object.assign(
                {
                  id: U.uid('qry'),
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
                payload
              )
            );
          }, 'query:create');
          U.toast('取数单「' + payload.code + '」已创建', 'success');
        }
        m.close();
      },
    }, [isEdit ? '保存取数单' : '创建取数单']);

    /* ---- 面板组装 ---- */
    var basicPanel = U.el('div', { class: 'space-y-4' }, [
      U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-3' }, [
        field('取数编号', fCode, 'QS + 需求日期 + 当日序号，自动生成'),
        field('取数内容 *', fTitle),
        field('优先级', fPriority),
      ]),
      U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-3' }, [
        field('业务需求方', fRequester),
        field('对接产品经理', fPm),
        field('数据侧对接人', fOwner),
      ]),
      U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-2' }, [
        field('取数执行人', fExecutor),
        field('当前状态', fStatus, '标准流程：待评估 → 口径已确认 → 开发中 → 已交付 → 已核对归档'),
      ]),
      U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-2' }, [
        field('需求日期', fRequestDate.el),
        field('交付期限', fDueDate.el),
      ]),
      U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-2' }, [
        field('数据周期起', fPeriodStart.el),
        field('数据周期止', fPeriodEnd.el),
      ]),
      field('备注', fNote),
    ]);

    var sqlPanel = U.el('div', { class: 'space-y-4' }, [
      field('取数 SQL', fSqlText, '把当次执行的 SQL 原样留档，后续复现与核对都靠它'),
      U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-2' }, [
        field('脚本存放路径', fSqlPath, '例如：/data/query/用户域/QS2026010601'),
        field('涉及表', fSqlTables),
      ]),
      U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-3' }, [
        field('执行环境', fSqlEnv),
        field('执行日期', fExecutedAt.el),
        field('结果行数', fRowCount),
      ]),
      field('结果文件路径', fResultPath),
      field('结果摘要', fResultSummary),
    ]);

    var metricPanel = U.el('div', { class: 'space-y-3' }, [
      U.el('div', {
        class: 'rounded-lg border border-line/50 bg-raised/30 px-3 py-2 text-[11.5px] leading-relaxed text-dim',
        text:
          '口径是追溯的核心。指标名称、口径定义、统计维度、过滤条件都要写清，并由产品确认后回填确认人与日期。',
      }),
      metricHead.el,
      metricHost,
    ]);

    var channelPanel = U.el('div', { class: 'space-y-3' }, [
      U.el('div', {
        class: 'rounded-lg border border-line/50 bg-raised/30 px-3 py-2 text-[11.5px] leading-relaxed text-dim',
        text:
          '把业务发来的邮件、口径对齐会议纪要、IM 上的关键结论都留一份底，日后扯皮时这是「当时就是这么说的」的证据。',
      }),
      channelHead.el,
      channelHost,
    ]);

    var checkPanel = U.el('div', { class: 'space-y-4' }, [
      U.el('div', { class: 'space-y-2' }, [checkHead.el, checkHost]),
      U.el('div', { class: 'space-y-2' }, [caliberHead.el, caliberHost]),
    ]);

    tabPanels.basic = basicPanel;
    tabPanels.metric = metricPanel;
    tabPanels.sql = sqlPanel;
    tabPanels.channel = channelPanel;
    tabPanels.check = checkPanel;

    var body = U.el('div', { class: 'space-y-4' }, [
      tabBar,
      err,
      U.el('div', { class: 'relative' }, [
        basicPanel,
        metricPanel,
        sqlPanel,
        channelPanel,
        checkPanel,
      ]),
    ]);

    var m = UI.modal({
      title: isEdit ? '编辑取数单' : '新建取数单',
      subtitle: '取数内容与口径必填 · 编号自动生成',
      width: 'max-w-3xl',
      body: body,
      footer: [
        U.el('button', {
          class: 'btn btn-lg',
          onclick: function () {
            m.close();
          },
        }, ['取消']),
        saveBtn,
      ],
    });

    showTab('basic');

    m.overlay.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    });
    return m;
  }

  /* ---------------- 取数单删除 ---------------- */

  function removeQuery(query) {
    var n =
      (query.metrics || []).length +
      (query.channels || []).length +
      (query.checks || []).length +
      (query.caliberChanges || []).length;
    UI.confirm(
      '删除取数单',
      '确认删除取数单「' +
        (query.code || query.title) +
        '」？其下 ' +
        n +
        ' 条口径 / 沟通 / 核对 / 变更记录会一并删除，此操作不可撤销。',
      function () {
        Store.mutate(function (s) {
          s.queries = (s.queries || []).filter(function (x) {
            return x.id !== query.id;
          });
        }, 'query:delete');
        U.toast('取数单已删除', 'success');
      },
      true
    );
  }

  /* ---------------- 视图渲染 ---------------- */

  function metricBlock(query, mt) {
    var rows = [];
    if (mt.definition) rows.push('口径：' + mt.definition);
    if (mt.dims) rows.push('维度：' + mt.dims);
    if (mt.filters) rows.push('过滤：' + mt.filters);
    if (mt.confirmedBy || mt.confirmedAt) {
      rows.push('确认：' + (mt.confirmedBy || '未填写') + (mt.confirmedAt ? ' · ' + mt.confirmedAt : ''));
    }
    return subRow({
      icon: '📐',
      title: mt.name || '（未命名指标）',
      meta: U.trunc(rows.join(' / '), 100),
      badge: mt.confirmedBy
        ? U.el('span', { class: 'badge shrink-0 bg-raised/60 text-mute', text: '口径已确认' })
        : U.el('span', {
            class: 'badge shrink-0',
            style: { background: U.alpha('#f87171', 0.16), color: '#f87171' },
            text: '待确认',
          }),
      hint: '点击编辑这条指标口径',
      onclick: function () {
        editMetricOf(query, mt);
      },
    });
  }

  function channelBlock(query, ch) {
    var t = channelTypeOf(ch.type);
    var who = [ch.from, ch.to ? '→ ' + ch.to : '', ch.cc ? '抄送 ' + ch.cc : '']
      .filter(Boolean)
      .join(' · ');
    return subRow({
      icon: t.icon,
      title: ch.subject || '（无主题）',
      meta: U.trunc((ch.date ? ch.date + ' · ' : '') + who + (ch.content ? ' · ' + ch.content : ''), 110),
      badge: U.el('span', {
        class: 'badge shrink-0',
        style: { background: U.alpha(t.color, 0.16), color: t.color },
        text: t.label,
      }),
      hint: '点击编辑这条沟通留痕',
      onclick: function () {
        editChannelOf(query, ch);
      },
    });
  }

  function checkBlock(query, ck) {
    return subRow({
      icon: '✅',
      title: ck.result || '（无结论）',
      meta: U.trunc(
        (ck.date ? ck.date + ' · ' : '') +
          (ck.withWho ? '与 ' + ck.withWho + ' 核对' : '') +
          (ck.diff ? ' · 差异：' + ck.diff : '') +
          (ck.note ? ' · ' + ck.note : ''),
        110
      ),
      hint: '点击编辑这条核对记录',
      onclick: function () {
        editCheckOf(query, ck);
      },
    });
  }

  function caliberBlock(query, cc) {
    return subRow({
      icon: '🔀',
      title: (cc.from || '（原口径）') + ' → ' + (cc.to || '（新口径）'),
      meta: U.trunc(
        (cc.date ? cc.date + ' · ' : '') + (cc.by ? cc.by + ' · ' : '') + (cc.reason || ''),
        110
      ),
      hint: '点击编辑这条口径变更',
      onclick: function () {
        editCaliberOf(query, cc);
      },
    });
  }

  function queryCard(query) {
    var stt = statusOf(query.status);
    var pri = priorityOf(query.priority);
    var card = U.el('div', { class: 'panel overflow-hidden' });

    var overdue =
      query.dueDate &&
      query.dueDate < U.today() &&
      ['checked', 'cancelled'].indexOf(query.status) < 0;

    /* ---- 头部 ---- */
    card.appendChild(
      U.el('div', {
        class: 'flex flex-wrap items-center gap-2.5 border-b border-line/60 bg-raised/30 px-4 py-3',
      }, [
        U.el('span', { class: 'num text-[15px] font-bold text-ink', text: query.code || '未编号' }),
        U.el('span', {
          class: 'badge',
          style: { background: U.alpha(stt.color, 0.16), color: stt.color },
          text: stt.label,
        }),
        U.el('span', {
          class: 'badge',
          style: { background: U.alpha(pri.color, 0.16), color: pri.color },
          text: pri.label,
        }),
        overdue
          ? U.el('span', {
              class: 'badge',
              style: { background: U.alpha('#f87171', 0.16), color: '#f87171' },
              text: '已超期',
            })
          : null,
        U.el('span', {
          class: 'min-w-0 flex-1 truncate text-[12.5px] text-dim',
          text: query.title || '',
        }),
        U.el('button', {
          class: 'btn btn-ghost btn-icon h-7 w-7 text-[11px]',
          title: '编辑取数单',
          onclick: function () {
            openEditor(query);
          },
        }, ['✎']),
        U.el('button', {
          class: 'btn btn-ghost btn-icon h-7 w-7 text-[11px] text-danger',
          title: '删除取数单',
          onclick: function () {
            removeQuery(query);
          },
        }, ['🗑']),
      ])
    );

    var body = U.el('div', { class: 'space-y-4 px-4 py-3' });

    /* ---- 基础信息条 ---- */
    var infos = [];
    if (query.requester) infos.push('需求方 ' + query.requester);
    if (query.pm) infos.push('产品 ' + query.pm);
    if (query.owner) infos.push('数据侧 ' + query.owner);
    if (query.executor) infos.push('执行 ' + query.executor);
    infos.push('需求日期 ' + (query.requestDate || '未填'));
    if (query.periodStart || query.periodEnd) {
      infos.push('数据周期 ' + (query.periodStart || '?') + ' ~ ' + (query.periodEnd || '?'));
    }
    if (query.dueDate) infos.push('交付期限 ' + query.dueDate);

    body.appendChild(
      U.el(
        'div',
        { class: 'flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-mute' },
        infos.map(function (t) {
          return U.el('span', { class: 'num', text: t });
        })
      )
    );

    if (query.note) {
      body.appendChild(
        U.el('div', {
          class: 'rounded-lg border border-line/50 bg-raised/25 px-3 py-2 text-[11.5px] leading-relaxed text-dim',
          text: query.note,
        })
      );
    }

    /* ---- 指标口径 ---- */
    var metrics = query.metrics || [];
    body.appendChild(
      sectionHead('指标口径', metrics.length, function () {
        addMetricTo(query);
      })
    );
    if (!metrics.length) {
      body.appendChild(emptyBlock('尚未登记指标口径 —— 口径是事后追溯的第一依据'));
    } else {
      metrics.forEach(function (mt) {
        body.appendChild(metricBlock(query, mt));
      });
    }

    /* ---- 取数 SQL ---- */
    body.appendChild(sectionHead('取数 SQL', null, null));
    if (query.sqlText) {
      body.appendChild(
        U.el('pre', {
          class:
            'num overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-line/50 bg-raised/30 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-dim',
          text: query.sqlText,
        })
      );
    }
    var sqlMeta = [];
    if (query.sqlPath) sqlMeta.push('脚本路径 ' + query.sqlPath);
    if (query.sqlTables) sqlMeta.push('涉及表 ' + query.sqlTables);
    if (query.sqlEnv) sqlMeta.push('环境 ' + query.sqlEnv);
    if (query.executedAt) sqlMeta.push('执行日期 ' + query.executedAt);
    if (query.rowCount) sqlMeta.push(query.rowCount + ' 行');
    if (!query.sqlText && !sqlMeta.length) {
      body.appendChild(emptyBlock('尚未登记取数 SQL'));
    } else if (sqlMeta.length) {
      body.appendChild(
        U.el(
          'div',
          { class: 'flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-mute' },
          sqlMeta.map(function (t) {
            return U.el('span', { class: 'num', text: t });
          })
        )
      );
    }

    /* ---- 取数结果 ---- */
    body.appendChild(sectionHead('取数结果', null, null));
    if (query.resultPath || query.resultSummary) {
      if (query.resultPath) {
        body.appendChild(
          U.el('div', {
            class: 'flex items-center gap-2 rounded-lg border border-line/50 bg-raised/25 px-3 py-2 text-[11px] text-dim',
          }, [
            U.el('span', { class: 'shrink-0 text-mute', text: '结果文件' }),
            U.el('span', { class: 'num min-w-0 flex-1 truncate', text: query.resultPath }),
            U.el('button', {
              class: 'btn btn-ghost h-6 shrink-0 rounded-md px-2 text-[10.5px]',
              onclick: function () {
                U.copy(query.resultPath).then(function (ok) {
                  U.toast(ok ? '路径已复制' : '复制失败，请手动选择文本', ok ? 'success' : 'error');
                });
              },
            }, ['复制']),
          ])
        );
      }
      if (query.resultSummary) {
        body.appendChild(
          U.el('div', {
            class: 'rounded-lg border border-line/50 bg-raised/25 px-3 py-2 text-[11.5px] leading-relaxed text-dim',
            text: query.resultSummary,
          })
        );
      }
    } else {
      body.appendChild(emptyBlock('尚未登记取数结果'));
    }

    /* ---- 沟通留痕 ---- */
    var channels = query.channels || [];
    body.appendChild(
      sectionHead('沟通留痕', channels.length, function () {
        addChannelTo(query);
      })
    );
    if (!channels.length) {
      body.appendChild(emptyBlock('尚未留存邮件 / 会议 / IM 记录'));
    } else {
      channels.forEach(function (ch) {
        body.appendChild(channelBlock(query, ch));
      });
    }

    /* ---- 核对记录 ---- */
    var checks = query.checks || [];
    body.appendChild(
      sectionHead('核对记录', checks.length, function () {
        addCheckTo(query);
      })
    );
    if (!checks.length) {
      body.appendChild(emptyBlock('尚未登记与产品的核对记录'));
    } else {
      checks.forEach(function (ck) {
        body.appendChild(checkBlock(query, ck));
      });
    }

    /* ---- 口径变更历史 ---- */
    var calibers = query.caliberChanges || [];
    body.appendChild(
      sectionHead('口径变更历史', calibers.length, function () {
        addCaliberTo(query);
      })
    );
    if (!calibers.length) {
      body.appendChild(emptyBlock('口径未变更过'));
    } else {
      calibers.forEach(function (cc) {
        body.appendChild(caliberBlock(query, cc));
      });
    }

    card.appendChild(body);
    return card;
  }

  function miniStat(label, value, unit, color) {
    return U.el('div', { class: 'panel px-3.5 py-3' }, [
      U.el('div', { class: 'kicker', text: label }),
      U.el('div', { class: 'mt-1 flex items-baseline gap-1' }, [
        U.el('span', { class: 'num text-[22px] font-bold leading-none text-ink', text: String(value) }),
        unit ? U.el('span', { class: 'text-[11px] text-mute', text: unit }) : null,
      ]),
      U.el('div', { class: 'mt-2 h-0.5 w-full overflow-hidden rounded-full bg-line/40' }, [
        U.el('div', { class: 'h-full rounded-full', style: { width: '100%', background: color, opacity: 0.55 } }),
      ]),
    ]);
  }

  function render(root) {
    var st = Store.queryStats();
    var list = allQueries().slice().sort(cmpQueryDesc);
    var shown = list.filter(matchQuery);

    /* ---- 工具条 ---- */
    var toolbar = U.el('div', { class: 'flex flex-wrap items-center gap-2' });

    var stSel = U.el('select', {
      class: 'input h-[30px] w-auto py-0 text-[12px]',
      onchange: function (e) {
        filter.status = e.target.value;
        global.OpsDesk.App.render();
      },
    });
    stSel.appendChild(U.el('option', { value: 'all', text: '全部状态', selected: filter.status === 'all' }));
    Store.dict('queryStatus').forEach(function (d) {
      stSel.appendChild(U.el('option', { value: d.key, text: d.label, selected: filter.status === d.key }));
    });
    toolbar.appendChild(stSel);

    var priSel = U.el('select', {
      class: 'input h-[30px] w-auto py-0 text-[12px]',
      onchange: function (e) {
        filter.priority = e.target.value;
        global.OpsDesk.App.render();
      },
    });
    priSel.appendChild(U.el('option', { value: 'all', text: '全部优先级', selected: filter.priority === 'all' }));
    Store.dict('queryPriority').forEach(function (d) {
      priSel.appendChild(U.el('option', { value: d.key, text: d.label, selected: filter.priority === d.key }));
    });
    toolbar.appendChild(priSel);

    var rangeSel = U.el('select', {
      class: 'input h-[30px] w-auto py-0 text-[12px]',
      onchange: function (e) {
        filter.range = e.target.value;
        global.OpsDesk.App.render();
      },
    });
    RANGES.forEach(function (r) {
      rangeSel.appendChild(
        U.el('option', { value: r.key, text: r.label, selected: filter.range === r.key })
      );
    });
    toolbar.appendChild(rangeSel);

    toolbar.appendChild(
      U.el('input', {
        class: 'input h-[30px] w-[200px] py-0 text-[12px]',
        type: 'search',
        placeholder: '搜索编号 / 内容 / 需求方…',
        value: filter.keyword,
        oninput: U.debounce(function (e) {
          filter.keyword = e.target.value.trim();
          global.OpsDesk.App.render();
        }, 220),
      })
    );

    toolbar.appendChild(U.el('div', { class: 'flex-1' }));
    toolbar.appendChild(
      U.el('button', {
        class: 'btn btn-primary',
        onclick: function () {
          openEditor(null);
        },
      }, ['＋ 新建取数单'])
    );

    /* ---- 统计条 ---- */
    var statStrip = U.el('div', { class: 'grid grid-cols-2 gap-3 sm:grid-cols-4' }, [
      miniStat('取数单总数', st.total, '单', 'var(--c-brand)'),
      miniStat('进行中', st.inProgress, '单', 'var(--c-violet)'),
      miniStat('待核对', st.toCheck, '单', 'var(--c-warn)'),
      miniStat('已核对归档', st.checked, '单', 'var(--c-ok)'),
    ]);

    /* ---- 分布面板 ---- */
    var distPanel = U.el('div', { class: 'panel' });
    distPanel.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '取数分布' }),
        U.el('div', { class: 'text-[11px] text-mute', text: '按状态与优先级统计' }),
      ])
    );
    var distBody = U.el('div', { class: 'space-y-4 px-4 py-3' });
    distBody.appendChild(
      U.el('div', {}, [
        U.el('div', { class: 'kicker mb-2', text: '按状态' }),
        UI.bars(
          st.byStatus.map(function (b) {
            return { label: b.label, value: b.count, color: b.color };
          }),
          { unit: 'count' }
        ),
      ])
    );
    distBody.appendChild(
      U.el('div', {}, [
        U.el('div', { class: 'kicker mb-2', text: '按优先级' }),
        UI.bars(
          st.byPriority.map(function (b) {
            return { label: b.label, value: b.count, color: b.color };
          }),
          { unit: 'count' }
        ),
      ])
    );
    distBody.appendChild(
      U.el('div', { class: 'grid grid-cols-2 gap-2' }, [
        U.el('div', {
          class: 'rounded-lg border border-line/50 bg-raised/30 px-2.5 py-2 text-[11px] text-dim',
        }, [
          U.el('span', { class: 'text-mute', text: '已超期' }),
          U.el('span', { class: 'num float-right font-semibold', text: String(st.overdue) }),
        ]),
        U.el('div', {
          class: 'rounded-lg border border-line/50 bg-raised/30 px-2.5 py-2 text-[11px] text-dim',
        }, [
          U.el('span', { class: 'text-mute', text: '口径变更' }),
          U.el('span', { class: 'num float-right font-semibold', text: String(st.caliberChanges) }),
        ]),
      ])
    );
    distPanel.appendChild(distBody);

    /* ---- 取数单列表 ---- */
    var listPanel = U.el('div', { class: 'panel' });
    listPanel.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '取数台账' }),
        U.el('div', { class: 'flex items-center gap-2 text-[11px] text-mute' }, [
          U.el('span', { text: shown.length + ' / ' + list.length + ' 单' }),
          hasFilter()
            ? U.el('button', {
                class: 'chip chip-active',
                onclick: function () {
                  resetFilter();
                  global.OpsDesk.App.render();
                },
              }, ['清除筛选'])
            : null,
        ]),
      ])
    );

    var listBody = U.el('div', { class: 'space-y-3 px-4 py-3' });
    if (!shown.length) {
      listBody.appendChild(
        U.el('div', { class: 'flex flex-col items-center justify-center gap-2 py-10 text-center' }, [
          U.el('div', { class: 'text-2xl opacity-40', text: list.length ? '🔍' : '🗂️' }),
          U.el('div', {
            class: 'text-[13px] text-mute',
            text: list.length ? '当前筛选条件下没有匹配的取数单' : '还没有取数单记录',
          }),
          list.length
            ? U.el('button', {
                class: 'btn mt-1',
                onclick: function () {
                  resetFilter();
                  global.OpsDesk.App.render();
                },
              }, ['清除筛选条件'])
            : U.el('button', {
                class: 'btn btn-primary mt-1',
                onclick: function () {
                  openEditor(null);
                },
              }, ['＋ 新建取数单']),
        ])
      );
    } else {
      shown.forEach(function (q) {
        listBody.appendChild(queryCard(q));
      });
    }
    listPanel.appendChild(listBody);

    root.innerHTML = '';
    root.appendChild(
      U.el('div', { class: 'space-y-4 animate-fade-up' }, [
        U.el('div', { class: 'flex flex-wrap items-center gap-2' }, [
          U.el('div', {}, [
            U.el('h2', { class: 'text-[15px] font-bold text-ink', text: '取数登记' }),
            U.el('div', {
              class: 'mt-0.5 text-[11.5px] text-mute',
              text: '口径 / SQL / 结果 / 沟通 / 核对 / 口径变更 全链路留痕 · 历史口径随时可追溯',
            }),
          ]),
        ]),
        statStrip,
        toolbar,
        U.el('div', { class: 'auto-cols auto-cols-wide' }, [
          U.el('div', { class: 'space-y-4' }, [listPanel]),
          U.el('div', { class: 'space-y-4' }, [distPanel]),
        ]),
      ])
    );
  }

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.Queries = {
    render: render,
    openEditor: openEditor,
    openMetricEditor: openMetricEditor,
    openChannelEditor: openChannelEditor,
    openCheckEditor: openCheckEditor,
    openCaliberEditor: openCaliberEditor,
    addMetricTo: addMetricTo,
    editMetricOf: editMetricOf,
    addChannelTo: addChannelTo,
    editChannelOf: editChannelOf,
    addCheckTo: addCheckTo,
    editCheckOf: editCheckOf,
    addCaliberTo: addCaliberTo,
    editCaliberOf: editCaliberOf,
    removeQuery: removeQuery,
    nextCode: nextCode,
    filter: filter,
  };
})(window);
