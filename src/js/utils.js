/* ============================================================
   utils.js — 通用工具
   ============================================================ */
(function (global) {
  'use strict';

  var U = {};

  /* ---------------- DOM ---------------- */

  U.$ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  U.$$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /** 创建元素：el('div', {class:'x'}, [child|string]) */
  U.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function')
          node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };

  /** HTML 转义，所有用户输入渲染前必须经过 */
  U.esc = function (str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /* ---------------- 日期时间 ---------------- */

  U.pad = function (n) {
    return n < 10 ? '0' + n : String(n);
  };

  /** Date -> 'YYYY-MM-DD' */
  U.ymd = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  };

  /** 'YYYY-MM-DD' -> Date（本地时区，避免 UTC 偏移） */
  U.parseYmd = function (s) {
    if (!s) return new Date();
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  };

  U.addDays = function (d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  };

  U.today = function () {
    return U.ymd(new Date());
  };

  U.yesterday = function () {
    return U.ymd(U.addDays(new Date(), -1));
  };

  U.tomorrow = function () {
    return U.ymd(U.addDays(new Date(), 1));
  };

  var WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
  U.weekCn = function (d) {
    return '周' + WEEK_CN[(d || new Date()).getDay()];
  };

  /** 友好日期：今天 / 昨天 / 明天 / MM-DD */
  U.friendlyDate = function (ymdStr) {
    var t = U.today();
    if (ymdStr === t) return '今天';
    if (ymdStr === U.yesterday()) return '昨天';
    if (ymdStr === U.tomorrow()) return '明天';
    var d = U.parseYmd(ymdStr);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  };

  U.friendlyFull = function (ymdStr) {
    var d = U.parseYmd(ymdStr);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + U.weekCn(d);
  };

  /** 紧凑日期：M月D日（站会稿标题用，省字数） */
  U.shortDate = function (ymdStr) {
    var d = U.parseYmd(ymdStr);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  };

  /** 截断到指定字数，超出以省略号收尾（连续空白压成单个空格） */
  U.trunc = function (str, n) {
    var s = String(str == null ? '' : str).replace(/\s+/g, ' ').trim();
    if (!n || n <= 0) return s;
    if (s.length <= n) return s;
    return s.slice(0, Math.max(1, n - 1)) + '…';
  };

  /**
   * 估算中文口播时长（秒）
   * 中文约 4.5 字/秒（含停顿），英文与数字按半字计；每行切换额外计 0.6 秒
   */
  U.speakSeconds = function (text) {
    var s = String(text || '');
    var cjk = (s.match(/[一-鿿　-〿＀-￯]/g) || []).length;
    var chars = cjk + (s.length - cjk) * 0.5;
    var lines = s.split('\n').filter(function (l) { return l.trim(); }).length;
    return Math.round(chars / 4.5 + lines * 0.6);
  };

  /** 秒 -> 「1 分 05 秒」/「45 秒」 */
  U.fmtSeconds = function (sec) {
    sec = Math.max(0, Math.round(sec || 0));
    if (sec < 60) return sec + ' 秒';
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return s ? m + ' 分 ' + U.pad(s) + ' 秒' : m + ' 分';
  };

  U.nowTime = function () {
    var d = new Date();
    return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  };

  /** 'HH:MM' -> 分钟数 */
  U.toMin = function (t) {
    if (!t) return 0;
    var p = String(t).split(':');
    return (+p[0] || 0) * 60 + (+p[1] || 0);
  };

  /** 分钟数 -> 'HH:MM' */
  U.fromMin = function (m) {
    m = Math.max(0, Math.round(m));
    return U.pad(Math.floor(m / 60) % 24) + ':' + U.pad(m % 60);
  };

  /**
   * 计算时间段时长（分钟）。
   * 结束时间早于开始时间时视为跨天，自动 +24h。
   * 这是全应用唯一权威的时长口径 —— 明细显示与占比统计必须一致。
   */
  U.duration = function (start, end) {
    var s = U.toMin(start);
    var e = U.toMin(end);
    if (!s && !e) return 0;
    if (e < s) e += 24 * 60;
    return e - s;
  };

  /** 时长（分钟）-> '1h30m' / '45m' */
  U.fmtDur = function (min) {
    min = Math.max(0, Math.round(min || 0));
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (h && m) return h + 'h' + m + 'm';
    if (h) return h + 'h';
    return m + 'm';
  };

  U.relTime = function (ts) {
    if (!ts) return '';
    var diff = Date.now() - ts;
    var min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    var h = Math.floor(min / 60);
    if (h < 24) return h + ' 小时前';
    var d = Math.floor(h / 24);
    if (d < 30) return d + ' 天前';
    return U.ymd(new Date(ts));
  };

  /* ---------------- 杂项 ---------------- */

  U.uid = function (prefix) {
    return (
      (prefix || 'id') +
      '_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 8)
    );
  };

  U.clone = function (o) {
    return JSON.parse(JSON.stringify(o));
  };

  U.debounce = function (fn, wait) {
    var t;
    return function () {
      var ctx = this;
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(ctx, args);
      }, wait || 200);
    };
  };

  U.clamp = function (n, min, max) {
    return Math.min(max, Math.max(min, n));
  };

  U.sum = function (arr, fn) {
    return arr.reduce(function (a, b) {
      return a + (fn ? fn(b) : b);
    }, 0);
  };

  /** 深色背景下按亮度决定文字颜色 */
  U.pickText = function (hex) {
    var c = String(hex || '').replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.slice(0, 2), 16);
    var g = parseInt(c.slice(2, 4), 16);
    var b = parseInt(c.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return '#0b1020';
    return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#0b1020' : '#f8fafc';
  };

  /** 十六进制色 -> rgba 字符串 */
  U.alpha = function (hex, a) {
    var c = String(hex || '').replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.slice(0, 2), 16);
    var g = parseInt(c.slice(2, 4), 16);
    var b = parseInt(c.slice(4, 6), 16);
    if (isNaN(r)) return 'rgba(56,189,248,' + a + ')';
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  };

  /* ---------------- Toast ---------------- */

  U.toast = function (msg, type, ms) {
    var host = document.getElementById('toast-host');
    if (!host) return;
    var tone =
      type === 'error' ? 'border-danger/60 text-danger'
      : type === 'warn' ? 'border-warn/60 text-warn'
      : type === 'success' ? 'border-ok/60 text-ok'
      : 'border-brand/60 text-brand';

    var t = U.el('div', {
      class: 'pointer-events-auto flex items-center gap-2 rounded-lg border glass-line px-3 py-2 text-[12px] shadow-lift backdrop-blur-xl animate-pop-in ' + tone,
    }, [
      U.el('span', { class: 'h-1.5 w-1.5 rounded-full bg-current' }),
      U.el('span', { class: 'text-ink', text: msg }),
    ]);
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .25s, transform .25s';
      t.style.opacity = '0';
      t.style.transform = 'translateY(-6px)';
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 260);
    }, ms || 2200);
  };

  /* ---------------- 剪贴板 ---------------- */

  U.copy = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return U.copyFallback(text);
        }
      );
    }
    return Promise.resolve(U.copyFallback(text));
  };

  U.copyFallback = function (text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  };

  /* ---------------- 极简 Markdown -> HTML ---------------- */

  U.mdToHtml = function (md) {
    var lines = String(md || '').split('\n');
    var html = [];
    var inList = false;

    function inline(s) {
      return U.esc(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/(^|\s)_([^_]+)_/g, '$1<em>$2</em>');
    }

    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      var isList = /^\s*[-*]\s+/.test(line);

      if (isList) {
        if (!inList) {
          html.push('<ul>');
          inList = true;
        }
        html.push('<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>');
        return;
      }
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      if (!line.trim()) return;
      if (/^###\s+/.test(line)) html.push('<h2>' + inline(line.replace(/^###\s+/, '')) + '</h2>');
      else if (/^##\s+/.test(line)) html.push('<h1>' + inline(line.replace(/^##\s+/, '')) + '</h1>');
      else if (/^#\s+/.test(line)) html.push('<h1>' + inline(line.replace(/^#\s+/, '')) + '</h1>');
      else if (/^>\s?/.test(line)) html.push('<p>' + inline(line.replace(/^>\s?/, '')) + '</p>');
      else if (/^---+$/.test(line)) html.push('<div class="divider my-3"></div>');
      else html.push('<p>' + inline(line) + '</p>');
    });
    if (inList) html.push('</ul>');
    return html.join('');
  };

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.Utils = U;
})(window);
