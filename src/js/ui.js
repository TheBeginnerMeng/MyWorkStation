/* ============================================================
   ui.js — 通用 UI 组件：模态框 / 环形图 / 时间轴
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;
  var UI = {};

  /* ---------------- Modal ---------------- */

  var modalStack = [];

  /**
   * 打开模态框
   * @param {Object} cfg {title, subtitle, body(HTMLElement|string), footer(HTMLElement[]), width, onMount, onClose}
   */
  UI.modal = function (cfg) {
    cfg = cfg || {};
    var host = document.getElementById('modal-host');
    if (!host) return null;

    var overlay = U.el('div', {
      class: 'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 pt-[7vh] backdrop-blur-sm animate-fade-up',
    });

    var panel = U.el('div', {
      class: 'panel w-full overflow-hidden shadow-lift animate-pop-in ' + (cfg.width || 'max-w-2xl'),
    });

    var head = U.el('div', { class: 'panel-head bg-raised/40' }, [
      U.el('div', {}, [
        U.el('div', { class: 'panel-title', text: cfg.title || '' }),
        cfg.subtitle
          ? U.el('div', { class: 'mt-0.5 text-[11px] text-mute', text: cfg.subtitle })
          : null,
      ]),
      U.el('button', {
        class: 'btn btn-ghost btn-icon',
        'aria-label': '关闭',
        onclick: function () {
          close();
        },
      }, ['✕']),
    ]);

    var bodyWrap = U.el('div', { class: 'scroll-y max-h-[68vh] px-4 py-4' });
    if (typeof cfg.body === 'string') bodyWrap.innerHTML = cfg.body;
    else if (cfg.body) bodyWrap.appendChild(cfg.body);

    panel.appendChild(head);
    panel.appendChild(bodyWrap);

    if (cfg.footer && cfg.footer.length) {
      var foot = U.el('div', {
        class: 'flex items-center justify-end gap-2 border-t border-line/60 bg-raised/30 px-4 py-3',
      });
      cfg.footer.forEach(function (f) {
        foot.appendChild(f);
      });
      panel.appendChild(foot);
    }

    overlay.appendChild(panel);
    host.appendChild(overlay);

    function close() {
      var i = modalStack.indexOf(api);
      if (i >= 0) modalStack.splice(i, 1);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      // 关闭弹窗时一并收起可能悬空的日期/时间选择浮层
      if (global.OpsDesk && global.OpsDesk.Picker) global.OpsDesk.Picker.closeAll();
      if (cfg.onClose) cfg.onClose();
    }

    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) close();
    });

    var api = { overlay: overlay, panel: panel, body: bodyWrap, close: close };
    modalStack.push(api);

    if (cfg.onMount) cfg.onMount(api);

    // 自动聚焦第一个输入框（跳过日期/时间选择器的隐藏数据载体）
    setTimeout(function () {
      var first = bodyWrap.querySelector('input:not([type=hidden]):not([data-picker-native]), textarea, select');
      if (first) first.focus();
    }, 60);

    return api;
  }

  UI.closeTopModal = function () {
    if (modalStack.length) {
      modalStack[modalStack.length - 1].close();
      return true;
    }
    return false;
  };

  UI.hasModal = function () {
    return modalStack.length > 0;
  };

  /* ---------------- Confirm ---------------- */

  UI.confirm = function (title, message, onYes, danger) {
    var btn = U.el('button', {
      class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary') + ' btn-lg',
      onclick: function () {
        m.close();
        onYes && onYes();
      },
    }, [danger ? '确认删除' : '确认']);

    var m = UI.modal({
      title: title,
      width: 'max-w-md',
      body: U.el('p', { class: 'text-[13px] leading-relaxed text-dim', text: message }),
      footer: [
        U.el('button', {
          class: 'btn btn-lg',
          onclick: function () {
            m.close();
          },
        }, ['取消']),
        btn,
      ],
    });
    return m;
  };

  /* ---------------- Donut chart ---------------- */

  /**
   * 渲染 SVG 环形图
   * @param {Array} buckets [{label, value(minutes), color, pct}]
   */
  UI.donut = function (buckets, opts) {
    opts = opts || {};
    var size = opts.size || 200;
    var stroke = opts.stroke || 22;
    var total = U.sum(buckets, function (b) {
      return b.value;
    });
    var r = (size - stroke) / 2;
    var cx = size / 2;
    var cy = size / 2;
    var circ = 2 * Math.PI * r;

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    svg.setAttribute('class', 'w-full h-full');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '时间分配占比图');

    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);

    // 底环
    var bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('cx', cx);
    bg.setAttribute('cy', cy);
    bg.setAttribute('r', r);
    bg.setAttribute('fill', 'none');
    bg.setAttribute('stroke', 'rgb(var(--c-line) / 0.35)');
    bg.setAttribute('stroke-width', stroke);
    svg.appendChild(bg);

    if (total <= 0) {
      var empty = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      empty.setAttribute('x', cx);
      empty.setAttribute('y', cy + 5);
      empty.setAttribute('text-anchor', 'middle');
      empty.setAttribute('fill', 'rgb(var(--c-mute))');
      empty.setAttribute('font-size', '13');
      empty.textContent = '暂无记录';
      svg.appendChild(empty);
      return svg;
    }

    var offset = 0;
    buckets.forEach(function (b) {
      if (!b.value) return;
      var frac = b.value / total;
      var len = frac * circ;
      var arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      arc.setAttribute('cx', cx);
      arc.setAttribute('cy', cy);
      arc.setAttribute('r', r);
      arc.setAttribute('fill', 'none');
      arc.setAttribute('stroke', b.color);
      arc.setAttribute('stroke-width', stroke);
      arc.setAttribute('stroke-linecap', 'round');
      arc.setAttribute('stroke-dasharray', Math.max(0, len - 3) + ' ' + circ);
      arc.setAttribute('stroke-dashoffset', -offset);
      arc.setAttribute('transform', 'rotate(-90 ' + cx + ' ' + cy + ')');
      arc.style.transition = 'stroke-dasharray .5s cubic-bezier(.22,1,.36,1), stroke-dashoffset .5s';
      arc.style.cursor = 'pointer';
      arc.setAttribute('data-legend-hover', b.label);
      svg.appendChild(arc);
      offset += len;
    });

    // 中心文字
    var t1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t1.setAttribute('x', cx);
    t1.setAttribute('y', cy - 2);
    t1.setAttribute('text-anchor', 'middle');
    t1.setAttribute('fill', 'rgb(var(--c-ink))');
    t1.setAttribute('font-size', '24');
    t1.setAttribute('font-weight', '700');
    t1.setAttribute('class', 'num');
    t1.textContent = (total / 60).toFixed(1) + 'h';
    svg.appendChild(t1);

    var t2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t2.setAttribute('x', cx);
    t2.setAttribute('y', cy + 17);
    t2.setAttribute('text-anchor', 'middle');
    t2.setAttribute('fill', 'rgb(var(--c-mute))');
    t2.setAttribute('font-size', '11');
    t2.textContent = opts.centerLabel || '总时长';
    svg.appendChild(t2);

    return svg;
  };

  /* ---------------- Bar (横向占比条) ---------------- */

  UI.bars = function (buckets) {
    var wrap = U.el('div', { class: 'space-y-2.5' });
    var total = U.sum(buckets, function (b) {
      return b.value;
    });
    buckets.forEach(function (b) {
      var pct = total ? Math.round((b.value / total) * 100) : 0;
      var row = U.el('div', {});
      row.appendChild(
        U.el('div', { class: 'mb-1 flex items-center justify-between gap-2 text-[11px]' }, [
          U.el('span', { class: 'flex items-center gap-1.5 text-dim' }, [
            U.el('span', { class: 'h-2 w-2 rounded-sm', style: { background: b.color } }),
            U.el('span', { text: b.label }),
          ]),
          U.el('span', { class: 'num text-mute' }, [
            U.fmtDur(b.value) + ' · ' + pct + '%',
          ]),
        ])
      );
      var track = U.el('div', { class: 'h-1.5 w-full overflow-hidden rounded-full bg-line/40' });
      var fill = U.el('div', {
        class: 'h-full rounded-full transition-all duration-500',
        style: { width: pct + '%', background: b.color },
      });
      track.appendChild(fill);
      row.appendChild(track);
      wrap.appendChild(row);
    });
    return wrap;
  };

  /* ---------------- Timeline ---------------- */

  /**
   * 渲染单日时间轴
   * @param {Array} tasks 当日任务
   * @param {Object} opts {hourHeight, onClick, onMove}
   */
  UI.timeline = function (tasks, opts) {
    opts = opts || {};
    var hourH = opts.hourHeight || 62;
    var startHour = opts.startHour != null ? opts.startHour : 8;
    var endHour = opts.endHour != null ? opts.endHour : 21;

    var hours = [];
    for (var h = startHour; h <= endHour; h++) hours.push(h);

    var totalH = (endHour - startHour) * hourH;
    var frame = U.el('div', { class: 'relative' });

    // 小时刻度 + 网格
    hours.forEach(function (h, idx) {
      var top = idx * hourH;
      var row = U.el('div', {
        class: 'absolute inset-x-0 border-t border-line/45',
        style: { top: top + 'px' },
      });
      frame.appendChild(row);
      frame.appendChild(
        U.el('div', {
          class: 'absolute -translate-y-1/2 select-none pr-2 font-mono text-[10px] text-mute',
          style: { top: top + 'px', right: '100%' },
          text: U.pad(h) + ':00',
        })
      );
    });

    // 半小时线
    for (var i = 0; i < hours.length; i++) {
      frame.appendChild(
        U.el('div', {
          class: 'absolute inset-x-0 border-t border-dashed border-line/25',
          style: { top: i * hourH + hourH / 2 + 'px' },
        })
      );
    }

    var nowLine = null;
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    if (now.getHours() >= startHour && now.getHours() <= endHour) {
      var ny = ((nowMin - startHour * 60) / 60) * hourH;
      nowLine = U.el('div', {
        class: 'pointer-events-none absolute inset-x-0 z-20 flex items-center',
        style: { top: ny + 'px' },
      }, [
        U.el('span', { class: 'h-2 w-2 -translate-x-1 rounded-full bg-danger shadow-[0_0_10px_rgb(var(--c-danger))]' }),
        U.el('span', { class: 'h-px flex-1 bg-danger/60' }),
      ]);
      frame.appendChild(nowLine);
    }

    // 任务块 —— 采用泳道布局，重叠任务并排显示而非互相压盖
    var laid = tasks
      .map(function (t) {
        var s = U.toMin(t.startTime);
        var e = U.toMin(t.endTime);
        if (e <= s) e = s + 30;
        return { task: t, s: s, e: e };
      })
      .sort(function (a, b) {
        return a.s - b.s || a.e - b.e;
      });

    // 贪心分配泳道：与同泳道最后一个任务不重叠才可进入
    var laneEnds = [];
    laid.forEach(function (it) {
      var lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] > it.s) lane++;
      laneEnds[lane] = it.e;
      it.lane = lane;
    });
    var laneCount = Math.max(1, laneEnds.length);

    laid.forEach(function (it) {
      var t = it.task;
      var top = ((it.s - startHour * 60) / 60) * hourH;
      var height = Math.max(26, ((it.e - it.s) / 60) * hourH - 3);
      var color = global.OpsDesk.Store.dictItem('taskStatus', t.status).color;
      var projColor = global.OpsDesk.Store.projectColor(t.project);

      // 同一泳道内横向平分，多泳道时并排
      var laneWidth = 100 / laneCount;
      var left = it.lane * laneWidth;
      var width = laneWidth;
      if (laneCount > 1) width = laneWidth - 0.6;

      var block = U.el('div', {
        class: 'tl-block group cursor-pointer overflow-hidden',
        style: {
          top: top + 'px',
          height: height + 'px',
          left: 'calc(' + left + '% + 2px)',
          width: 'calc(' + width + '% - 4px)',
          background: U.alpha(color, 0.14),
          borderLeftColor: color,
          border: '1px solid ' + U.alpha(color, 0.3),
          borderLeftWidth: '3px',
        },
        title: t.title + '（' + t.startTime + '-' + t.endTime + '）',
        dataset: { taskId: t.id },
      });

      block.appendChild(
        U.el('div', { class: 'flex items-center gap-1.5 truncate text-[11px] font-semibold text-ink' }, [
          U.el('span', { class: 'h-1.5 w-1.5 shrink-0 rounded-full', style: { background: projColor } }),
          U.el('span', { class: 'truncate', text: t.title }),
        ])
      );
      if (height > 42) {
        block.appendChild(
          U.el('div', {
            class: 'num mt-0.5 truncate text-[10px] text-dim',
            text: t.startTime + ' - ' + t.endTime + ' · ' + global.OpsDesk.Store.projectName(t.project),
          })
        );
      }
      if (height > 66) {
        block.appendChild(
          U.el('div', { class: 'mt-1 truncate text-[10px] text-mute', text: t.note || '' })
        );
      }

      block.addEventListener('click', function () {
        opts.onClick && opts.onClick(t);
      });

      frame.appendChild(block);
    });

    var wrap = U.el('div', { class: 'relative' }, [frame]);
    wrap.style.minHeight = totalH + 'px';
    wrap.style.paddingLeft = '58px';
    return wrap;
  };

  global.OpsDesk.UI = UI;
})(window);
