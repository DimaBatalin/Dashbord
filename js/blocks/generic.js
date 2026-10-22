// Configurable engines: counter with a daily goal, journal with custom fields, recurring tasks/dates.
(function () {
  "use strict";
  var u = Pult.util;
  var D = u.D, H = u.H, h = u.h, esc = u.esc, clone = u.clone, newId = u.newId, dayKey = u.dayKey, num = u.num,
    setTxt = u.setTxt, rowX = u.rowX, emptyRow = u.emptyRow, plural = u.plural, toMin = u.toMin, shortDate = u.shortDate;

  function settingsBox(rows, onSave) {
    var el = h('<div class="bset"></div>');
    rows.forEach(function (r) { el.appendChild(r); });
    var b = h('<button class="tbtn" type="button">Сохранить</button>');
    b.addEventListener("click", onSave);
    el.appendChild(b);
    return el;
  }
  function field(label, input) { var l = h("<label>" + esc(label) + " </label>"); l.appendChild(input); return l; }

  /* =============================== counter =============================== */

  Pult.register("counter", {
    label: "Счётчик",
    defaults: { unit: "", goal: 0, step: 1 },
    empty: function () { return { log: {} }; },
    mount: function (ctx) {
      var cfg = ctx.config();
      var el = h('<div class="ctr">' +
        '<button class="ctr-btn" type="button" aria-label="Меньше">−</button>' +
        '<div class="ctr-mid"><div class="ctr-val mono"></div><div class="ctr-goal"></div></div>' +
        '<button class="ctr-btn plus" type="button" aria-label="Больше">+' + (cfg.step !== 1 ? esc(num(cfg.step)) : "") + "</button></div>");
      var change = function (k) {
        var v = clone(ctx.items()), tk = dayKey(new Date());
        v.log = v.log || {};
        v.log[tk] = Math.max(0, Math.round(((v.log[tk] || 0) + k * cfg.step) * 100) / 100);
        ctx.save(v);
      };
      el.querySelectorAll("button")[0].addEventListener("click", function () { change(-1); });
      el.querySelectorAll("button")[1].addEventListener("click", function () { change(1); });
      ctx.ctr = ctx.body.appendChild(el);
      ctx.track = ctx.body.appendChild(h('<div class="track ctr-track"><i></i></div>'));
      ctx.week = ctx.body.appendChild(h("<div></div>"));
    },
    update: function (ctx) {
      var cfg = ctx.config(), log = ctx.items().log || {}, v = log[dayKey(new Date())] || 0;
      setTxt(ctx.ctr.querySelector(".ctr-val"), num(v));
      setTxt(ctx.ctr.querySelector(".ctr-goal"), cfg.goal ? "из " + num(cfg.goal) + (cfg.unit ? " " + cfg.unit : "") : cfg.unit || "сегодня");
      ctx.track.hidden = !cfg.goal;
      ctx.track.firstChild.style.width = (cfg.goal ? Math.min(100, v / cfg.goal * 100) : 0) + "%";
      ctx.ctr.classList.toggle("ok", !!cfg.goal && v >= cfg.goal);
      var vals = [];
      for (var i = 6; i >= 0; i--) { var t = u.addDays(Date.now(), -i); vals.push({ label: u.DSHORT[new Date(t).getDay()], value: log[dayKey(t)] || 0 }); }
      ctx.week.innerHTML = u.weekBars(vals, cfg.goal);
    },
    sub: function (ctx) {
      var cfg = ctx.config(), v = (ctx.items().log || {})[dayKey(new Date())] || 0;
      return "сегодня " + num(v) + (cfg.goal ? " из " + num(cfg.goal) : "") + (cfg.unit ? " " + cfg.unit : "");
    },
    tick: function (ctx, now) {
      // a new day starts from zero
      var k = dayKey(now);
      if (ctx.dayShown !== k) { ctx.dayShown = k; Pult.types.counter.update(ctx); }
    },
    today: function (items, b, now) {
      var cfg = Object.assign({ goal: 0, unit: "" }, b.config), v = (items.log || {})[dayKey(now)] || 0;
      return cfg.goal && v < cfg.goal ? [num(v) + " из " + num(cfg.goal) + (cfg.unit ? " " + cfg.unit : "")] : [];
    },
    stats: function (items, b, ws, now) {
      var t = 0, n = 0, cfg = b.config || {};
      for (var d = ws; d <= now; d = u.addDays(d, 1)) { t += (items.log || {})[dayKey(d)] || 0; n++; }
      return [{ label: "в среднем в день", value: num(t / Math.max(1, n)) + (cfg.unit ? " " + cfg.unit : "") }];
    },
    settings: function (ctx) {
      var cfg = ctx.config();
      var unit = h('<input type="text" class="w-s">'), goal = h('<input type="number" min="0" step="any" class="w-s">'), step = h('<input type="number" min="0.01" step="any" class="w-s">');
      unit.value = cfg.unit; goal.value = cfg.goal || ""; step.value = cfg.step;
      return settingsBox([field("Единица", unit), field("Цель в день", goal), field("Шаг", step)], function () {
        ctx.setConfig({ unit: unit.value.trim(), goal: Math.max(0, +goal.value || 0), step: Math.max(0.01, +step.value || 1) });
      });
    }
  });

  /* =============================== journal =============================== */
  // Columns are described in plain text: "Дата:дата, Упражнение:текст, Вес:число, Тип:выбор(а|б)".

  var TYPE_NAMES = { text: "текст", number: "число", date: "дата", check: "галочка", select: "выбор" };
  function parseCols(spec) {
    return String(spec || "").split(",").map(function (p) {
      p = p.trim();
      if (!p) return null;
      var m = p.match(/^(.+?)\s*:\s*(текст|число|дата|галочка|выбор)\s*(?:\((.*)\))?$/i);
      if (!m) return { name: p, type: "text" };
      var t = { "текст": "text", "число": "number", "дата": "date", "галочка": "check", "выбор": "select" }[m[2].toLowerCase()];
      var col = { name: m[1].trim(), type: t };
      if (t === "select") col.options = (m[3] || "").split("|").map(function (s) { return s.trim(); }).filter(Boolean);
      return col;
    }).filter(Boolean).slice(0, 8);
  }
  function colsSpec(cols) {
    return cols.map(function (c) { return c.name + ":" + TYPE_NAMES[c.type] + (c.type === "select" ? "(" + (c.options || []).join("|") + ")" : ""); }).join(", ");
  }
  function colIndex(cols, name) { name = String(name || "").trim().toLowerCase(); for (var i = 0; i < cols.length; i++) if (cols[i].name.toLowerCase() === name) return i; return -1; }
  function dateCol(cols) { for (var i = 0; i < cols.length; i++) if (cols[i].type === "date") return i; return -1; }
  function numVal(v) { var n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; }
  function agg(vals, how) {
    vals = vals.filter(function (v) { return v != null; });
    if (!vals.length) return null;
    if (how === "sum") return vals.reduce(function (a, b) { return a + b; }, 0);
    if (how === "last") return vals[vals.length - 1];
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }
  var AGG_NAMES = { avg: "среднее", sum: "всего", last: "последнее" };
  function sorted(items) { return items.slice().sort(function (a, b) { return a.at - b.at; }); }
  function cellText(c, v) {
    if (v == null || v === "") return "";
    if (c.type === "check") return v ? "✓ " + c.name : "";
    if (c.type === "date") return shortDate(v);
    if (c.type === "number") return c.name + " " + num(v, 2);
    return String(v);
  }

  Pult.register("journal", {
    label: "Журнал",
    defaults: { cols: [{ name: "Дата", type: "date" }, { name: "Запись", type: "text" }], chart: "", agg: "avg", groupBy: "", unit: "" },
    empty: function () { return []; },
    mount: function (ctx) {
      var cfg = ctx.config(), cols = cfg.cols;
      var fields = cols.map(function (c, i) {
        var f = { key: "c" + i, placeholder: c.name };
        if (c.type === "number") { f.type = "number"; f.cls = "num"; }
        else if (c.type === "date") { f.type = "date"; f.value = function () { return u.dateInput(Date.now()); }; }
        else if (c.type === "check") { f.type = "select"; f.options = [{ value: "", label: c.name + ": нет" }, { value: "1", label: c.name + ": да" }]; }
        else if (c.type === "select") { f.type = "select"; f.options = (c.options && c.options.length ? c.options : ["—"]).map(function (o) { return { value: o, label: c.name + ": " + o }; }); }
        else { f.cls = "grow"; f.list = true; }
        return f;
      });
      var firstText = fields.filter(function (f) { return !f.type || f.type === "number"; })[0];
      if (firstText) firstText.required = true;
      var di = dateCol(cols);
      ctx.form = u.form(fields, function (vals) {
        var v = cols.map(function (c, i) {
          var x = vals["c" + i];
          if (c.type === "date") return u.parseDate(x) || u.startOfDay(Date.now()) + 12 * H;
          if (c.type === "check") return !!x;
          return x;
        });
        ctx.add({ at: di >= 0 ? v[di] : Date.now(), v: v });
      });
      ctx.body.appendChild(ctx.form);
      ctx.summ = ctx.body.appendChild(h('<div class="jr-summ"></div>'));
      ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
      ctx.more = ctx.body.appendChild(h('<button class="linkbtn" type="button" hidden></button>'));
      ctx.more.addEventListener("click", function () { ctx.showAll = !ctx.showAll; Pult.types.journal.update(ctx); });
    },
    update: function (ctx) {
      var cfg = ctx.config(), cols = cfg.cols, items = sorted(ctx.items());
      // suggestions for text fields from earlier entries
      cols.forEach(function (c, i) {
        if (c.type !== "text") return;
        var seen = {};
        items.forEach(function (x) { if (x.v && x.v[i]) seen[x.v[i]] = 1; });
        ctx.form.setList("c" + i, Object.keys(seen).slice(-30));
      });

      var ci = colIndex(cols, cfg.chart), gi = colIndex(cols, cfg.groupBy), html = "";
      if (ci >= 0) {
        var series = items.map(function (x) { return { x: x.at, y: numVal(x.v[ci]) }; }).filter(function (p) { return p.y != null; });
        var ms = new Date(); ms = new Date(ms.getFullYear(), ms.getMonth(), 1).getTime();
        var month = agg(series.filter(function (p) { return p.x >= ms; }).map(function (p) { return p.y; }), cfg.agg);
        html += '<div class="jr-kpi"><span class="lg mono">' + (month == null ? "—" : num(month, 2)) + (cfg.unit ? " " + esc(cfg.unit) : "") + "</span>" +
          '<span class="sm">' + AGG_NAMES[cfg.agg] + " за месяц · " + esc(cols[ci].name) + "</span></div>";
        if (gi < 0) html += u.lineChart(series.slice(-60), { label: cols[ci].name, unit: cfg.unit });
      }
      if (gi >= 0 && ci >= 0) {
        var groups = {};
        items.forEach(function (x) { var g = x.v[gi] || "—", y = numVal(x.v[ci]); if (y == null) return; (groups[g] = groups[g] || []).push(y); });
        var rows = Object.keys(groups).map(function (g) { var a = agg(groups[g], cfg.agg); return { label: g, value: a, text: num(a, 2) }; })
          .sort(function (a, b) { return b.value - a.value; });
        if (rows.length) html += u.hbars(rows);
      }
      ctx.summ.innerHTML = html;

      var list = ctx.list, all = items.slice().reverse(), shown = ctx.showAll ? all : all.slice(0, 12);
      list.innerHTML = "";
      if (!all.length) emptyRow(list);
      var di = dateCol(cols);
      shown.forEach(function (x) {
        var parts = cols.map(function (c, i) { return i === di ? "" : cellText(c, x.v[i]); }).filter(Boolean);
        var r = h('<div class="row jr"><div class="note mono">' + esc(shortDate(x.at)) + '</div><div class="tt">' + esc(parts.join(" · ")) + "</div></div>");
        r.appendChild(rowX(function () { ctx.remove(x.id); }));
        list.appendChild(r);
      });
      ctx.more.hidden = all.length <= 12;
      ctx.more.textContent = ctx.showAll ? "Свернуть" : "Показать все (" + all.length + ")";
    },
    sub: function (ctx) {
      var n = ctx.items().length;
      return n ? n + " " + plural(n, "запись", "записи", "записей") : "нет записей";
    },
    stats: function (items, b, ws) {
      var cfg = Object.assign({ cols: [], agg: "avg" }, b.config), ci = colIndex(cfg.cols, cfg.chart);
      var week = items.filter(function (x) { return x.at >= ws; });
      var out = [{ label: "записей", value: week.length }];
      if (ci >= 0) {
        var a = agg(week.map(function (x) { return numVal(x.v[ci]); }), cfg.agg);
        if (a != null) out.push({ label: cfg.cols[ci].name + " (" + AGG_NAMES[cfg.agg] + ")", value: num(a, 2) + (cfg.unit ? " " + cfg.unit : "") });
      }
      return week.length ? out : [];
    },
    settings: function (ctx) {
      var cfg = ctx.config();
      var spec = h('<input type="text" class="w-l">'), chart = h('<input type="text" class="w-m">'), group = h('<input type="text" class="w-m">'),
        how = h('<select><option value="avg">среднее</option><option value="sum">сумма</option><option value="last">последнее</option></select>'),
        unit = h('<input type="text" class="w-s">');
      spec.value = colsSpec(cfg.cols); chart.value = cfg.chart || ""; group.value = cfg.groupBy || ""; how.value = cfg.agg; unit.value = cfg.unit || "";
      var hint = h('<div class="bset-hint">Поля через запятую в виде «Название:тип». Типы: текст, число, дата, галочка, выбор(а|б|в). ' +
        "График строится по числовому полю; «группировать» — например, средняя оценка по каждому предмету. Старые записи сохраняются по порядку полей.</div>");
      return settingsBox([hint, field("Поля", spec), field("График по полю", chart), field("Итог", how), field("Группировать по", group), field("Единица", unit)], function () {
        var cols = parseCols(spec.value);
        if (!cols.length) { u.toast("Укажите хотя бы одно поле"); return; }
        ctx.setConfig({ cols: cols, chart: chart.value.trim(), agg: how.value, groupBy: group.value.trim(), unit: unit.value.trim() });
      });
    }
  });

  /* =============================== recurring =============================== */
  // mode "task": repeats every N days/weeks/months/years and is marked done (plants, meds);
  // mode "date": a yearly date such as a birthday.

  var UNITS = { day: ["день", "дня", "дней"], week: ["неделю", "недели", "недель"], month: ["месяц", "месяца", "месяцев"], year: ["год", "года", "лет"] };
  function addUnit(t, n, unit) {
    var d = new Date(t);
    if (unit === "week") d.setDate(d.getDate() + 7 * n);
    else if (unit === "month") d.setMonth(d.getMonth() + n);
    else if (unit === "year") d.setFullYear(d.getFullYear() + n);
    else d.setDate(d.getDate() + n);
    return d.getTime();
  }
  function everyText(x) {
    var n = +x.every || 1;
    return (n === 1 ? (x.unit === "week" ? "каждую " : "каждый ") + UNITS[x.unit || "day"][0] : "каждые " + n + " " + plural(n, UNITS[x.unit || "day"][0], UNITS[x.unit || "day"][1], UNITS[x.unit || "day"][2])) +
      (x.time ? " в " + x.time : "");
  }
  // next due day (start of day) for a task
  function nextTask(x) { return u.startOfDay(x.last ? addUnit(u.startOfDay(x.last), +x.every || 1, x.unit) : x.start); }
  function nextYearly(x, now) {
    var d = new Date(x.date), t = new Date(new Date(now).getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (t < u.startOfDay(now)) t = new Date(new Date(now).getFullYear() + 1, d.getMonth(), d.getDate()).getTime();
    return t;
  }
  function daysUntil(t, now) { return Math.round((u.startOfDay(t) - u.startOfDay(now)) / D); }
  function whenText(n) { return n === 0 ? "сегодня" : n === 1 ? "завтра" : n < 0 ? "просрочено " + u.daysWord(-n) : "через " + u.daysWord(n); }

  Pult.register("recurring", {
    label: "Повторяющиеся дела",
    defaults: { mode: "task", showAge: false },
    empty: function () { return []; },
    mount: function (ctx) {
      var cfg = ctx.config();
      var f = cfg.mode === "date"
        ? u.form([
            { key: "title", placeholder: "Имя", cls: "grow", required: true },
            { key: "date", type: "date", placeholder: "Дата" }
          ], function (v) {
            if (!v.date) { u.toast("Укажите дату"); return false; }
            ctx.add({ title: v.title, date: u.parseDate(v.date) });
          })
        : u.form([
            { key: "title", placeholder: "Что делать", cls: "grow", required: true },
            { key: "every", type: "number", placeholder: "Раз в", cls: "num-s", value: "1", min: 1, step: 1 },
            { key: "unit", type: "select", placeholder: "Период", options: [{ value: "day", label: "дн." }, { value: "week", label: "нед." }, { value: "month", label: "мес." }, { value: "year", label: "лет" }] },
            { key: "start", type: "date", placeholder: "Начиная с", value: function () { return u.dateInput(Date.now()); } },
            { key: "time", type: "time", placeholder: "Время", cls: "time-in" }
          ], function (v) {
            ctx.add({ title: v.title, every: Math.max(1, Math.round(v.every || 1)), unit: v.unit, start: u.parseDate(v.start) || Date.now(), time: v.time || "" });
          });
      ctx.body.appendChild(f);
      ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
    },
    update: function (ctx) {
      var cfg = ctx.config(), now = Date.now(), list = ctx.list;
      var items = ctx.items().map(function (x) { return { x: x, next: cfg.mode === "date" ? nextYearly(x, now) : nextTask(x) }; })
        .sort(function (a, b) { return a.next - b.next; });
      list.innerHTML = "";
      if (!items.length) emptyRow(list);
      items.forEach(function (it) {
        var x = it.x, n = daysUntil(it.next, now), r;
        if (cfg.mode === "date") {
          var bd = new Date(x.date), age = new Date(it.next).getFullYear() - bd.getFullYear();
          r = h('<div class="row rc' + (n <= 3 ? " soon" : "") + '"><div><div class="nm">' + esc(x.title) + '</div><div class="note">' +
            bd.getDate() + " " + u.MONTHS[bd.getMonth()] + (cfg.showAge && age > 0 && age < 130 ? " · исполнится " + age : "") + "</div></div>" +
            '<div class="rc-when">' + esc(whenText(n)) + "</div></div>");
        } else {
          var doneToday = x.last && u.startOfDay(x.last) === u.startOfDay(now);
          r = h('<div class="row rc' + (n < 0 ? " over" : n === 0 && !doneToday ? " soon" : "") + (doneToday ? " done" : "") + '">' +
            '<div><div class="nm">' + esc(x.title) + '</div><div class="note">' + esc(everyText(x)) + (x.last ? " · было " + shortDate(x.last) : "") + "</div></div>" +
            '<div class="rc-when">' + esc(doneToday ? "сделано" : whenText(n)) + "</div>" +
            '<button class="today' + (doneToday ? " on" : "") + '" type="button">' + (doneToday ? "✓" : "сделано") + "</button></div>");
          r.querySelector(".today").addEventListener("click", function () {
            if (doneToday) ctx.patch(x.id, { last: x.prev || null, prev: null });
            else ctx.patch(x.id, { last: Date.now(), prev: x.last || null });
          });
        }
        r.appendChild(rowX(function () { ctx.remove(x.id); }));
        list.appendChild(r);
      });
    },
    sub: function (ctx) {
      var cfg = ctx.config(), now = Date.now(), items = ctx.items();
      if (!items.length) return "пусто";
      if (cfg.mode === "date") {
        var nx = items.map(function (x) { return { t: x.title, n: daysUntil(nextYearly(x, now), now) }; }).sort(function (a, b) { return a.n - b.n; })[0];
        return "ближайший: " + nx.t + ", " + whenText(nx.n);
      }
      var due = items.filter(function (x) { return nextTask(x) <= u.startOfDay(now) && !(x.last && u.startOfDay(x.last) === u.startOfDay(now)); }).length;
      return due ? "на сегодня: " + due : "на сегодня всё сделано";
    },
    tick: function (ctx, now) {
      var k = dayKey(now);
      if (ctx.dayShown !== k) { ctx.dayShown = k; Pult.types.recurring.update(ctx); }
    },
    reminders: function (items, b, now) {
      var cfg = b.config || {}, d = new Date(now), m = d.getHours() * 60 + d.getMinutes(), today = dayKey(now), out = [];
      items.forEach(function (x) {
        if (cfg.mode === "date") {
          if (d.getHours() < 9) return;
          var n = daysUntil(nextYearly(x, now), now);
          if (n === 0) out.push({ key: x.id + ":" + today + ":day", text: "Сегодня: " + x.title });
          else if (n === 3) out.push({ key: x.id + ":" + today + ":3d", text: "Через 3 дня: " + x.title });
          return;
        }
        var next = nextTask(x), doneToday = x.last && u.startOfDay(x.last) === u.startOfDay(now);
        if (doneToday || next > u.startOfDay(now)) return;
        var at = x.time ? toMin(x.time) : 9 * 60;
        if (m >= at) out.push({ key: x.id + ":" + today, text: (next < u.startOfDay(now) ? "Пропущено: " : "Пора: ") + x.title + (x.time ? " (" + x.time + ")" : "") });
      });
      return out;
    },
    dates: function (items, b) {
      var cfg = b.config || {}, now = Date.now();
      return items.map(function (x) { return { at: cfg.mode === "date" ? nextYearly(x, now) : nextTask(x), title: x.title }; });
    },
    today: function (items, b, now) {
      var cfg = b.config || {};
      return items.map(function (x) {
        if (cfg.mode === "date") { var n = daysUntil(nextYearly(x, now), now); return n <= 3 ? x.title + " — " + whenText(n) : ""; }
        var doneToday = x.last && u.startOfDay(x.last) === u.startOfDay(now);
        return !doneToday && nextTask(x) <= u.startOfDay(now) ? x.title + (x.time ? " в " + x.time : "") : "";
      }).filter(Boolean);
    },
    settings: function (ctx) {
      var cfg = ctx.config();
      if (cfg.mode !== "date") return null;
      var age = h('<select><option value="">не показывать возраст</option><option value="1">показывать возраст</option></select>');
      age.value = cfg.showAge ? "1" : "";
      return settingsBox([field("Возраст", age)], function () { ctx.setConfig({ showAge: !!age.value }); });
    }
  });

  /* =============================== presets =============================== */

  [
    { group: "Здоровье и привычки", type: "counter", title: "Вода", desc: "Стаканы воды за день с целью.", config: { unit: "стак.", goal: 8, step: 1 } },
    { group: "Здоровье и привычки", type: "journal", title: "Сон", desc: "Сколько спали, средняя длительность и график.",
      config: { cols: [{ name: "Дата", type: "date" }, { name: "Часы", type: "number" }, { name: "Заметка", type: "text" }], chart: "Часы", agg: "avg", unit: "ч" } },
    { group: "Здоровье и привычки", type: "journal", title: "Вес и замеры", desc: "Вес раз в неделю и график динамики.",
      config: { cols: [{ name: "Дата", type: "date" }, { name: "Вес", type: "number" }, { name: "Талия", type: "number" }], chart: "Вес", agg: "last", unit: "кг" } },
    { group: "Здоровье и привычки", type: "journal", title: "Тренировки", desc: "Упражнения, подходы и вес; прогресс по упражнениям.", wide: true,
      config: { cols: [{ name: "Дата", type: "date" }, { name: "Упражнение", type: "text" }, { name: "Подходы", type: "number" }, { name: "Повторы", type: "number" }, { name: "Вес", type: "number" }], chart: "Вес", agg: "last", groupBy: "Упражнение", unit: "кг" } },
    { group: "Здоровье и привычки", type: "recurring", title: "Лекарства", desc: "Расписание приёма с напоминанием и отметкой «принял».", config: { mode: "task" } },
    { group: "Личное", type: "journal", title: "Дневник настроения", desc: "Оценка дня 1–5 и пара слов, график за месяц.",
      config: { cols: [{ name: "Дата", type: "date" }, { name: "Настроение", type: "select", options: ["5", "4", "3", "2", "1"] }, { name: "Что было", type: "text" }], chart: "Настроение", agg: "avg" } },
    { group: "Учёба", type: "journal", title: "Оценки и средний балл", desc: "Оценки по предметам и средний балл по каждому.",
      config: { cols: [{ name: "Предмет", type: "text" }, { name: "Оценка", type: "number" }, { name: "Дата", type: "date" }, { name: "За что", type: "text" }], chart: "Оценка", agg: "avg", groupBy: "Предмет" } },
    { group: "Личное", type: "recurring", title: "Дни рождения", desc: "Ежегодные даты, «через 5 дней» и напоминание.", config: { mode: "date", showAge: true } },
    { group: "Дом и быт", type: "recurring", title: "Растения и питомцы", desc: "«Полить раз в 3 дня», «прививка раз в год» с напоминаниями.", config: { mode: "task" } },
    { group: "Свой блок", type: "counter", title: "Счётчик с целью", desc: "Что угодно за день: страницы, шаги, звонки. Единица и цель — в «Настроить»." },
    { group: "Свой блок", type: "journal", title: "Журнал (свои поля)", desc: "Сами задаёте поля: текст, число, дата, галочка, выбор. График и итоги — в «Настроить».", wide: true },
    { group: "Свой блок", type: "recurring", title: "Повторяющиеся дела", desc: "Дела, которые повторяются раз в N дней, недель, месяцев." }
  ].forEach(Pult.preset);
})();
