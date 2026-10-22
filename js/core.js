// Shared helpers and the block registry. Loaded first; block files register into Pult.types.
(function () {
  "use strict";

  var MIN = 60000, H = 3600000, D = 86400000;
  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };

  function pMerge(t, s) {
    for (var k in s) {
      if (s[k] && typeof s[k] === "object" && !Array.isArray(s[k])) {
        t[k] = pMerge(typeof t[k] === "object" && t[k] ? t[k] : {}, s[k]);
      } else {
        t[k] = s[k];
      }
    }
    return t;
  }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function newId() { return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function ensureIds(arr) { return (arr || []).map(function (x) { return x && x.id ? x : pMerge({ id: newId() }, x); }); }
  function money(n) { return "₽" + Number(n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 }); }
  function num(n, digits) { return Number(n || 0).toLocaleString("ru-RU", { maximumFractionDigits: digits == null ? 1 : digits }); }
  function dayKey(d) { d = d instanceof Date ? d : new Date(d); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function startOfWeek(t) { var s = startOfDay(t), dow = (new Date(s).getDay() + 6) % 7; return s - dow * D; }
  function addDays(t, n) { var d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
  function parseDue(v) { if (!v) return 0; var p = v.split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 23, 0, 0).getTime(); }
  function parseDate(v) { if (!v) return 0; var p = v.split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0).getTime(); }
  function dateInput(t) { var d = new Date(t); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function h(html) {
    var t = document.createElement("template");
    html = html.trim();
    if (/^<(tr|td|th)[\s>]/i.test(html)) {
      t.innerHTML = "<table><tbody>" + html + "</tbody></table>";
      return t.content.querySelector(html.charAt(2).toLowerCase() === "r" ? "tr" : html.slice(1, 3).toLowerCase());
    }
    t.innerHTML = html;
    return t.content.firstChild;
  }
  function onEnter(input, fn) { input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.isComposing) fn(); }); }
  function onActivate(el, fn) {
    el.addEventListener("click", fn);
    el.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); fn(); } });
  }
  function setTxt(el, v) { if (el._v !== v) { el._v = v; el.textContent = v; } }
  function setW(el, v) { if (el._w !== v) { el._w = v; el.style.width = v; } }
  function plural(n, one, few, many) {
    var m10 = Math.abs(n) % 10, m100 = Math.abs(n) % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
  }
  function toMin(t) { var p = String(t || "0:0").split(":"); return (+p[0] || 0) * 60 + (+p[1] || 0); }
  function hm(mins) { mins = Math.round(mins); var hh = Math.floor(mins / 60), m = mins % 60; return hh ? hh + "ч" + (m ? " " + m + "м" : "") : m + "м"; }

  function dueClass(ms) { var d = ms - Date.now(); if (d < 24 * H) return "crit"; if (d < 3 * D) return "warn"; return "good"; }
  function dueLabel(ms) {
    var diff = ms - Date.now(), past = diff < 0, a = Math.abs(diff);
    var days = Math.floor(a / D), hrs = Math.floor((a % D) / H);
    if (past) return days >= 1 ? "просрочено " + days + "д" : (hrs >= 1 ? "просрочено " + hrs + "ч" : "просрочено");
    if (days >= 1) return "через " + days + "д";
    if (hrs >= 1) return "сегодня · " + hrs + "ч";
    return "сегодня";
  }
  function humanCd(ms) {
    if (ms <= 0) return "сейчас";
    var d = Math.floor(ms / D), hh = Math.floor((ms % D) / H), m = Math.floor((ms % H) / MIN), s = Math.floor((ms % MIN) / 1000);
    if (d > 0) return d + "д " + hh + "ч";
    if (hh > 0) return hh + "ч " + pad(m) + "м";
    if (m > 0) return m + "м " + pad(s) + "с";
    return s + "с";
  }
  function daysWord(n) { return n + " " + plural(n, "день", "дня", "дней"); }
  function streak(log) {
    if (!log) return 0;
    var d = new Date();
    if (!log[dayKey(d)]) d.setDate(d.getDate() - 1);
    var s = 0;
    while (log[dayKey(d)]) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }

  var DSHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  var DAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  var MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  var MONTHS_FULL = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  function shortDate(t) { var d = new Date(t); return d.getDate() + " " + MONTHS[d.getMonth()]; }

  /* ---------- toast ---------- */
  var toastTimer = 0;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 3500);
  }

  /* ---------- small UI pieces ---------- */
  function rowX(onClick, label) {
    var b = h('<button class="row-x" type="button" aria-label="' + esc(label || "Удалить") + '">×</button>');
    b.addEventListener("click", onClick);
    return b;
  }
  function emptyRow(list, text) { var e = h('<div class="empty"></div>'); e.textContent = text || "Пока пусто"; list.appendChild(e); }

  // Builds an add-form from a field list and wires Enter/clear/focus.
  // field: { key, type: text|number|date|time|select, placeholder, cls, value, options, list, required, keep }
  function form(fields, onAdd, btnText) {
    var f = h('<div class="addf"></div>'), inputs = {};
    fields.forEach(function (fd) {
      var el;
      if (fd.type === "select") {
        el = h('<select aria-label="' + esc(fd.placeholder || fd.key) + '"></select>');
        (fd.options || []).forEach(function (o) {
          var v = typeof o === "string" ? o : o.value, l = typeof o === "string" ? o : o.label;
          el.appendChild(h('<option value="' + esc(v) + '">' + esc(l) + "</option>"));
        });
      } else {
        el = h('<input type="' + (fd.type || "text") + '" aria-label="' + esc(fd.placeholder || fd.key) + '">');
        if (fd.placeholder) el.placeholder = fd.placeholder;
        if (fd.type === "number") { el.step = fd.step || "any"; el.min = fd.min != null ? fd.min : ""; }
        if (fd.list) {
          var lid = "dl" + newId();
          el.setAttribute("list", lid);
          fd.datalist = h('<datalist id="' + lid + '"></datalist>');
          f.appendChild(fd.datalist);
        }
      }
      if (fd.cls) el.className = fd.cls;
      if (fd.value != null) el.value = typeof fd.value === "function" ? fd.value() : fd.value;
      inputs[fd.key] = el;
      fd.el = el;
      f.appendChild(el);
    });
    var btn = h('<button class="addbtn" type="button">' + esc(btnText || "Добавить") + "</button>");
    f.appendChild(btn);
    function submit() {
      var vals = {};
      for (var i = 0; i < fields.length; i++) {
        var fd = fields[i], v = fd.el.value;
        if (fd.type !== "select" && fd.type !== "date" && fd.type !== "time") v = v.trim();
        if (fd.required && !v) { fd.el.focus(); return; }
        vals[fd.key] = fd.type === "number" ? (v === "" ? null : +v) : v;
      }
      if (onAdd(vals) === false) return;
      fields.forEach(function (fd) {
        if (fd.keep || fd.type === "select") return;
        fd.el.value = fd.value != null ? (typeof fd.value === "function" ? fd.value() : fd.value) : "";
      });
      var first = fields.filter(function (fd) { return fd.required; })[0] || fields[0];
      if (first) first.el.focus();
    }
    btn.addEventListener("click", submit);
    fields.forEach(function (fd) { if (fd.type !== "select") onEnter(fd.el, submit); });
    f.inputs = inputs;
    f.setList = function (key, values) {
      var fd = fields.filter(function (x) { return x.key === key; })[0];
      if (fd && fd.datalist) fd.datalist.innerHTML = values.map(function (v) { return '<option value="' + esc(v) + '">'; }).join("");
    };
    return f;
  }

  /* ---------- charts (plain HTML/SVG, themed by CSS tokens) ---------- */
  // Horizontal bars: [{label, value, text}] sorted by caller.
  function hbars(rows) {
    var max = rows.reduce(function (m, r) { return Math.max(m, r.value); }, 0) || 1;
    return '<div class="hbars">' + rows.map(function (r) {
      return '<div class="hbar"><span class="hbar-l" title="' + esc(r.label) + '">' + esc(r.label) + '</span>' +
        '<span class="hbar-t"><i style="width:' + (Math.max(0, r.value) / max * 100).toFixed(1) + '%"></i></span>' +
        '<span class="hbar-v mono">' + esc(r.text != null ? r.text : num(r.value)) + "</span></div>";
    }).join("") + "</div>";
  }
  // Line chart for a time series: points [{x, y}] (x ascending). Returns SVG markup.
  function lineChart(points, opts) {
    opts = opts || {};
    if (points.length < 2) return '<div class="chart-empty">Нужно хотя бы 2 записи для графика</div>';
    var W = 320, Hh = 90, P = 6;
    var xs = points.map(function (p) { return p.x; }), ys = points.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var lo = y0, hi = y1;
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    if (x0 === x1) x1 = x0 + 1;
    var sx = function (x) { return P + (x - x0) / (x1 - x0) * (W - 2 * P); };
    var sy = function (y) { return Hh - P - (y - y0) / (y1 - y0) * (Hh - 2 * P); };
    var d = points.map(function (p, i) { return (i ? "L" : "M") + sx(p.x).toFixed(1) + " " + sy(p.y).toFixed(1); }).join(" ");
    var last = points[points.length - 1];
    var title = points.map(function (p) { return shortDate(p.x) + ": " + num(p.y); }).join(", ");
    return '<figure class="chart"><svg viewBox="0 0 ' + W + " " + Hh + '" preserveAspectRatio="none" role="img" aria-label="' + esc(opts.label || "График") + '">' +
      "<title>" + esc(title) + "</title>" +
      '<path class="chart-line" d="' + d + '"/>' +
      '<circle class="chart-dot" cx="' + sx(last.x).toFixed(1) + '" cy="' + sy(last.y).toFixed(1) + '" r="3"/></svg>' +
      '<figcaption class="chart-cap mono"><span>' + num(lo) + " – " + num(hi) + (opts.unit ? " " + esc(opts.unit) : "") +
      "</span><span>" + shortDate(x0) + " — " + shortDate(x1) + "</span></figcaption></figure>";
  }
  // 7 small columns for the last 7 days: values [{label, value}].
  function weekBars(values, goal) {
    var max = Math.max(goal || 0, values.reduce(function (m, v) { return Math.max(m, v.value); }, 0)) || 1;
    return '<div class="wbars">' + values.map(function (v) {
      return '<div class="wbar' + (goal && v.value >= goal ? " ok" : "") + '" title="' + esc(v.label + ": " + num(v.value)) + '">' +
        '<span class="wbar-c"><i style="height:' + (v.value / max * 100).toFixed(0) + '%"></i></span><span class="wbar-l">' + esc(v.label) + "</span></div>";
    }).join("") + "</div>";
  }

  /* ---------- misc ---------- */
  function copyText(text) {
    var done = function () { toast("Скопировано в буфер обмена"); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
  }
  function printText(title, html) {
    var w = window.open("", "_blank");
    if (!w) { toast("Разрешите всплывающие окна для печати"); return; }
    w.document.write('<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
      '<style>body{font:15px/1.55 system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#111}h1{font-size:22px}h2{font-size:16px;margin-top:20px}pre{white-space:pre-wrap;font:inherit}</style>' +
      "</head><body>" + html + "<script>window.onload=function(){window.print()}<\/script></body></html>");
    w.document.close();
  }
  var scripts = {};
  function loadScript(src) {
    if (scripts[src]) return scripts[src];
    scripts[src] = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.onload = res;
      s.onerror = function () { delete scripts[src]; rej(new Error(src)); };
      document.head.appendChild(s);
    });
    return scripts[src];
  }
  // Only http(s) links are allowed, so stored data can never run script.
  function safeUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
    try { var p = new URL(u); return p.protocol === "http:" || p.protocol === "https:" ? p.href : ""; } catch (e) { return ""; }
  }
  function hash(s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return Math.abs(x); }

  /* ---------- registry ---------- */
  // Block type contract:
  //   label, group, empty(), mount(ctx), update(ctx), sub(ctx, now)
  //   optional: tick(ctx, now), settings(ctx) -> element shown in customize mode,
  //   reminders(items, block, now) -> [{key, text}], dates(items, block) -> [{at, title}],
  //   today(items, block, now) -> [text], stats(items, block, weekStart, now) -> [{label, value}]
  var types = {}, presets = [];
  function register(key, def) { types[key] = def; }
  // Preset = an entry in the "new block" menu: a type plus a title and optional config.
  function preset(p) { presets.push(p); }

  window.Pult = {
    types: types,
    presets: presets,
    register: register,
    preset: preset,
    // set by app.js
    api: {},
    util: {
      MIN: MIN, H: H, D: D, $: $, pad: pad, pMerge: pMerge, clone: clone, newId: newId, ensureIds: ensureIds,
      money: money, num: num, dayKey: dayKey, startOfDay: startOfDay, startOfWeek: startOfWeek, addDays: addDays,
      parseDue: parseDue, parseDate: parseDate, dateInput: dateInput, esc: esc, h: h, onEnter: onEnter, onActivate: onActivate,
      setTxt: setTxt, setW: setW, plural: plural, toMin: toMin, hm: hm, dueClass: dueClass, dueLabel: dueLabel,
      humanCd: humanCd, daysWord: daysWord, streak: streak, DSHORT: DSHORT, DAYS: DAYS, MONTHS: MONTHS, MONTHS_FULL: MONTHS_FULL,
      shortDate: shortDate, toast: toast, rowX: rowX, emptyRow: emptyRow, form: form, hbars: hbars, lineChart: lineChart,
      weekBars: weekBars, copyText: copyText, printText: printText, loadScript: loadScript, safeUrl: safeUrl, hash: hash
    }
  };
})();
