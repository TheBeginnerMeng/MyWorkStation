/* ============================================================
   picker.js — 日期 / 时间选择控件
   目的：国产系统与部分精简浏览器里，原生 <input type="date"> /
        <input type="time"> 会退化成纯文本框，只能手敲；
        这里提供自绘面板，点选即可完成录入。
   设计：
     · 数据真源仍是隐藏的原生 input（type=date / type=time），
       既保持既有取值 / 校验逻辑，也保留系统控件作为兜底。
     · 组件对外伪装成 input：.value / .classList / .addEventListener /
       .focus() 全部代理到内部原生 input，调用方几乎无需改动。
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;
  var P = {};

  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  // 工作日常用时段（一次点击即可命中绝大多数场景）
  var COMMON_TIMES = [
    '08:30', '09:00', '09:30', '10:00', '10:30', '11:00',
    '13:30', '14:00', '14:30', '15:00', '16:00', '18:00',
    '19:00', '19:30', '20:00', '21:00',
  ];

  // 结束时间相对开始时间的快捷（单位：分钟）
  var RELATIVE = [
    { label: '+30分', min: 30 },
    { label: '+1小时', min: 60 },
    { label: '+1.5小时', min: 90 },
    { label: '+2小时', min: 120 },
    { label: '+半天', min: 240 },
  ];

  /* ---------------- 浮层管理 ---------------- */

  var layer = null; // { panel, anchor }

  function isOpen() {
    return !!layer;
  }

  function closeLayer() {
    if (!layer) return;
    var l = layer;
    layer = null;
    if (l.panel && l.panel.parentNode) l.panel.parentNode.removeChild(l.panel);
    document.removeEventListener('mousedown', onDocMouseDown, true);
    document.removeEventListener('keydown', onDocKeyDown, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
    if (l.anchor) l.anchor.setAttribute('aria-expanded', 'false');
  }

  function onDocMouseDown(e) {
    if (!layer) return;
    var t = e.target;
    if (layer.panel && layer.panel.contains(t)) return;
    if (layer.anchor && layer.anchor.contains(t)) return; // 交给 trigger 的 toggle 处理
    closeLayer();
  }

  function onDocKeyDown(e) {
    if (!layer) return;
    if (e.key !== 'Escape') return;
    // 捕获阶段拦截：只关闭选择面板，避免连带关闭外层弹窗
    e.preventDefault();
    e.stopPropagation();
    closeLayer();
  }

  function onScroll() {
    if (layer) place(layer.anchor, layer.panel);
  }

  function onResize() {
    if (layer) place(layer.anchor, layer.panel);
  }

  /** 把浮层贴到锚点下方，空间不足则翻到上方 */
  function place(anchor, panel) {
    if (!anchor || !anchor.getBoundingClientRect) return;
    // 锚点已被视图重绘移除时，收起浮层，避免出现悬空面板
    if (anchor.isConnected === false) {
      closeLayer();
      return;
    }
    var r = anchor.getBoundingClientRect();
    var vw = window.innerWidth || 1200;
    var vh = window.innerHeight || 800;
    var w = panel.offsetWidth || 300;
    var h = panel.offsetHeight || 320;

    var left = Math.round(r.left);
    if (left + w > vw - 8) left = Math.max(8, vw - w - 8);
    panel.style.left = left + 'px';

    var top = r.bottom + 6;
    if (top + h > vh - 8) {
      var above = r.top - h - 6;
      top = above >= 8 ? above : Math.max(8, vh - h - 8);
    }
    panel.style.top = Math.round(top) + 'px';
    panel.style.maxHeight = Math.max(160, vh - 16) + 'px';
  }

  function openLayer(anchor, panel) {
    closeLayer();
    document.body.appendChild(panel);
    layer = { panel: panel, anchor: anchor };
    anchor.setAttribute('aria-expanded', 'true');
    place(anchor, panel);
    document.addEventListener('mousedown', onDocMouseDown, true);
    document.addEventListener('keydown', onDocKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
  }

  /* ---------------- 事件工具 ---------------- */

  function fireInput(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ---------------- 面板：日期 ---------------- */

  function buildDatePanel(input, ctx) {
    var panel = U.el('div', {
      class: 'picker-panel picker-date',
      role: 'dialog',
      'aria-label': '选择日期',
    });

    var cur = input.value || U.today();
    var vd = U.parseYmd(cur);
    var vy = vd.getFullYear();
    var vm = vd.getMonth();

    function setVal(ymd) {
      input.value = ymd;
      ctx.syncText();
      fireInput(input);
    }

    function shift(n) {
      var d = new Date(vy, vm + n, 1);
      vy = d.getFullYear();
      vm = d.getMonth();
      render();
    }

    function render() {
      panel.innerHTML = '';

      panel.appendChild(
        U.el('div', { class: 'picker-head' }, [
          U.el('button', {
            type: 'button', class: 'picker-nav', title: '上一月',
            onclick: function () { shift(-1); },
          }, ['‹']),
          U.el('div', { class: 'picker-title', text: vy + '年' + (vm + 1) + '月' }),
          U.el('button', {
            type: 'button', class: 'picker-nav', title: '下一月',
            onclick: function () { shift(1); },
          }, ['›']),
        ])
      );

      var week = U.el('div', { class: 'picker-week' });
      WEEK.forEach(function (w) {
        week.appendChild(U.el('div', { class: 'picker-wd', text: w }));
      });
      panel.appendChild(week);

      var grid = U.el('div', { class: 'picker-grid' });
      var first = new Date(vy, vm, 1);
      var offset = first.getDay();
      var start = new Date(vy, vm, 1 - offset);
      for (var i = 0; i < 42; i++) {
        var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        var ymd = U.ymd(d);
        var cls = 'picker-cell';
        if (d.getMonth() !== vm) cls += ' is-out';
        if (ymd === U.today()) cls += ' is-today';
        if (ymd === input.value) cls += ' is-sel';
        grid.appendChild(
          U.el('button', {
            type: 'button',
            class: cls,
            text: String(d.getDate()),
            title: ymd + ' ' + U.weekCn(d),
            onclick: (function (v, dd) {
              return function () {
                if (dd.getMonth() !== vm) { vy = dd.getFullYear(); vm = dd.getMonth(); }
                setVal(v);
                closeLayer();
              };
            })(ymd, d),
          })
        );
      }
      panel.appendChild(grid);

      var quick = U.el('div', { class: 'picker-quick' });
      quick.appendChild(U.el('div', { class: 'picker-sec', text: '快捷' }));
      [
        ['昨天', U.yesterday()],
        ['今天', U.today()],
        ['明天', U.tomorrow()],
      ].forEach(function (q) {
        quick.appendChild(
          U.el('button', {
            type: 'button', class: 'picker-chip',
            onclick: function () { setVal(q[1]); closeLayer(); },
          }, [q[0]])
        );
      });
      quick.appendChild(
        miniInput('手动输入 YYYY-MM-DD', input.value, function (v) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { setVal(v); closeLayer(); }
        })
      );
      panel.appendChild(quick);
    }

    render();
    return panel;
  }

  /* ---------------- 面板：时间 ---------------- */

  function buildTimePanel(input, ctx) {
    var panel = U.el('div', {
      class: 'picker-panel picker-time',
      role: 'dialog',
      'aria-label': '选择时间',
    });

    var parts = String(input.value || '').split(':');
    var selHour = +parts[0];
    var selMin = +parts[1];
    if (isNaN(selHour)) selHour = 9;
    if (isNaN(selMin)) selMin = 0;

    function setVal(t) {
      input.value = t;
      ctx.syncText();
      fireInput(input);
    }

    function current() {
      return U.pad(selHour) + ':' + U.pad(selMin);
    }

    function render() {
      panel.innerHTML = '';

      panel.appendChild(
        U.el('div', { class: 'picker-head' }, [
          U.el('div', { class: 'picker-title', text: '选择时间' }),
          U.el('button', {
            type: 'button', class: 'picker-nav picker-nav-text', title: '清空时间',
            onclick: function () {
              input.value = '';
              ctx.syncText();
              fireInput(input);
              closeLayer();
            },
          }, ['清空']),
        ])
      );

      // 相对开始时间的快捷（结束时间等场景传入 relatedStart）
      if (typeof ctx.relatedStart === 'function') {
        var base = ctx.relatedStart();
        if (base) {
          var rel = U.el('div', { class: 'picker-quick' });
          rel.appendChild(U.el('div', { class: 'picker-sec', text: '基于开始时间 ' + base }));
          RELATIVE.forEach(function (r) {
            rel.appendChild(
              U.el('button', {
                type: 'button', class: 'picker-chip',
                title: U.fromMin(U.toMin(base) + r.min),
                onclick: function () {
                  setVal(U.fromMin(U.toMin(base) + r.min));
                  closeLayer();
                },
              }, [r.label])
            );
          });
          panel.appendChild(rel);
        }
      }

      var com = U.el('div', { class: 'picker-quick' });
      com.appendChild(U.el('div', { class: 'picker-sec', text: '常用时段' }));
      COMMON_TIMES.forEach(function (t) {
        com.appendChild(
          U.el('button', {
            type: 'button', class: 'picker-chip' + (t === input.value ? ' is-sel' : ''),
            onclick: function () { setVal(t); closeLayer(); },
          }, [t])
        );
      });
      panel.appendChild(com);

      panel.appendChild(U.el('div', { class: 'picker-sec', text: '小时' }));
      var hg = U.el('div', { class: 'picker-grid picker-grid-6' });
      for (var h = 0; h < 24; h++) {
        (function (hh) {
          hg.appendChild(
            U.el('button', {
              type: 'button',
              class: 'picker-cell' + (hh === selHour ? ' is-sel' : ''),
              text: U.pad(hh),
              onclick: function () { selHour = hh; render(); },
            })
          );
        })(h);
      }
      panel.appendChild(hg);

      panel.appendChild(U.el('div', { class: 'picker-sec', text: '分钟' }));
      var mg = U.el('div', { class: 'picker-grid picker-grid-6' });
      for (var m = 0; m < 60; m += 5) {
        (function (mm) {
          mg.appendChild(
            U.el('button', {
              type: 'button',
              class: 'picker-cell' + (mm === selMin ? ' is-sel' : ''),
              text: U.pad(mm),
              onclick: function () { selMin = mm; setVal(current()); closeLayer(); },
            })
          );
        })(m);
      }
      panel.appendChild(mg);

      var foot = U.el('div', { class: 'picker-foot' });
      foot.appendChild(
        miniInput('手动输入 HH:MM', input.value, function (v) {
          if (/^\d{1,2}:\d{2}$/.test(v)) {
            var p = v.split(':');
            setVal(U.pad(+p[0]) + ':' + U.pad(+p[1]));
            closeLayer();
          }
        })
      );
      foot.appendChild(
        U.el('button', {
          type: 'button', class: 'btn h-7 px-2.5 text-[11px]',
          onclick: function () { setVal(current()); closeLayer(); },
        }, ['确定'])
      );
      panel.appendChild(foot);
    }

    render();
    return panel;
  }

  /** 面板底部的手动微调输入（兜底路径，不作为主交互） */
  function miniInput(placeholder, value, onOk) {
    var inp = U.el('input', {
      class: 'picker-mini',
      type: 'text',
      placeholder: placeholder,
      value: value || '',
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onOk(inp.value.trim());
      }
    });
    return U.el('div', { class: 'picker-mini-wrap' }, [
      inp,
      U.el('button', {
        type: 'button', class: 'picker-mini-ok', title: '应用',
        onclick: function () { onOk(inp.value.trim()); },
      }, ['↵']),
    ]);
  }

  /* ---------------- 字段工厂 ---------------- */

  /**
   * 生成一个日期 / 时间字段
   * @param {Object} opts
   *   value        {string}   初始值
   *   type         {string}   'date' | 'time'
   *   placeholder  {string}   触发按钮上的占位文案
   *   relatedStart {Function} 返回基准时间（相对快捷用，仅 time）
   * @returns {Object} 代理对象：el / input / value / classList / addEventListener / focus ...
   */
  function field(opts) {
    opts = opts || {};
    var type = opts.type === 'time' ? 'time' : 'date';

    var input = U.el('input', {
      class: 'picker-native',
      type: type,
      step: type === 'time' ? '300' : null,
      value: opts.value || '',
      tabindex: '-1',
      'aria-hidden': 'true',
      'data-picker-native': '1',
    });

    var text = U.el('span', { class: 'picker-text' });
    var trigger = U.el('button', {
      type: 'button',
      class: 'input picker-trigger',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'aria-label': type === 'date' ? '选择日期' : '选择时间',
    }, [
      text,
      U.el('span', { class: 'picker-ico', text: type === 'date' ? '📅' : '⏱' }),
    ]);

    var wrap = U.el('div', {
      class: 'picker-field' + (opts.className ? ' ' + opts.className : ''),
    }, [input, trigger]);

    function display() {
      var v = input.value;
      if (!v) return opts.placeholder || (type === 'date' ? '选择日期' : '选择时间');
      if (type === 'date') return v + ' ' + U.weekCn(U.parseYmd(v));
      return v;
    }

    function syncText() {
      text.textContent = display();
    }

    var ctx = {
      syncText: syncText,
      relatedStart: opts.relatedStart,
    };

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (layer && layer.anchor === trigger) {
        closeLayer();
        return;
      }
      var panel = type === 'date' ? buildDatePanel(input, ctx) : buildTimePanel(input, ctx);
      openLayer(trigger, panel);
    });

    // 原生 input 变化时（例如系统控件回填）同步按钮文案
    input.addEventListener('change', syncText);
    syncText();

    // 必填校验标红（input-invalid）同步到可见按钮
    function syncInvalid() {
      wrap.classList.toggle('input-invalid', input.classList.contains('input-invalid'));
    }
    if (global.MutationObserver) {
      var mo = new MutationObserver(syncInvalid);
      mo.observe(input, { attributes: true, attributeFilter: ['class'] });
    }

    /**
     * classList 门面：既操作内部原生 input（保持既有校验逻辑），
     * 也同步到外层包裹元素，让「标红」立刻反映到可见按钮上
     */
    var classList = {
      add: function () {
        input.classList.add.apply(input.classList, arguments);
        syncInvalid();
      },
      remove: function () {
        input.classList.remove.apply(input.classList, arguments);
        syncInvalid();
      },
      toggle: function (name, force) {
        var r = input.classList.toggle(name, force);
        syncInvalid();
        return r;
      },
      contains: function (name) {
        return input.classList.contains(name);
      },
    };

    return {
      el: wrap,
      input: input,
      trigger: trigger,
      get value() { return input.value; },
      set value(v) {
        input.value = v == null ? '' : v;
        syncText();
      },
      classList: classList,
      addEventListener: function (t, fn, o) { input.addEventListener(t, fn, o); },
      removeEventListener: function (t, fn, o) { input.removeEventListener(t, fn, o); },
      dispatchEvent: function (e) { return input.dispatchEvent(e); },
      focus: function () { trigger.focus(); },
    };
  }

  P.dateField = function (opts) {
    return field(Object.assign({}, opts || {}, { type: 'date' }));
  };

  P.timeField = function (opts) {
    return field(Object.assign({}, opts || {}, { type: 'time' }));
  };

  P.closeAll = function () {
    closeLayer();
  };

  P.isOpen = isOpen;
  P.COMMON_TIMES = COMMON_TIMES;

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.Picker = P;
})(window);
