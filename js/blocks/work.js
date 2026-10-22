// Work: time log with a timer and a copyable report; report by template with archive.
(function () {
  "use strict";
  var u = Pult.util;
  var D = u.D, MIN = u.MIN, h = u.h, esc = u.esc, clone = u.clone, newId = u.newId, dayKey = u.dayKey, num = u.num,
    setTxt = u.setTxt, rowX = u.rowX, emptyRow = u.emptyRow, hm = u.hm, pad = u.pad, shortDate = u.shortDate;

  /* ---------- periods ---------- */
  function period(kind, t) {
    var d = new Date(t), s, e, label;
    if (kind === "day") { s = u.startOfDay(t); e = s + D; label = u.DAYS[d.getDay()] + ", " + shortDate(s); }
    else if (kind === "month") { s = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); e = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); label = u.MONTHS_FULL[d.getMonth()] + " " + d.getFullYear(); }
    else { s = u.startOfWeek(t); e = u.addDays(s, 7); label = shortDate(s) + " — " + shortDate(e - D); }
    return { start: s, end: e, label: label, key: kind + ":" + dayKey(s) };
  }
  function shiftPeriod(kind, t, k) {
    if (kind === "day") return u.addDays(t, k);
    if (kind === "month") { var d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + k, 15).getTime(); }
    return u.addDays(t, 7 * k);
  }
  function navBar(onShift) {
    var nav = h('<div class="ex-nav"><button class="ebtn" type="button" aria-label="Назад">‹</button><span class="ex-month"></span>' +
      '<button class="ebtn" type="button" aria-label="Вперёд">›</button></div>');
    nav.querySelectorAll("button")[0].addEventListener("click", function () { onShift(-1); });
    nav.querySelectorAll("button")[1].addEventListener("click", function () { onShift(1); });
    return nav;
  }

  /* =============================== worklog =============================== */
  // data: { entries: [{id, at, project, text, mins}], timer: {start, project, text} | null }

  function hoursOf(entries) { return entries.reduce(function (a, x) { return a + (+x.mins || 0); }, 0); }
  function inRange(entries, p) { return entries.filter(function (x) { return x.at >= p.start && x.at < p.end; }); }

  function reportText(title, p, entries) {
    var byProj = {}, lines = [];
    entries.forEach(function (x) { var k = x.project || "Без проекта"; (byProj[k] = byProj[k] || []).push(x); });
    lines.push(title + " — " + p.label);
    lines.push("Всего: " + hm(hoursOf(entries)));
    Object.keys(byProj).sort(function (a, b) { return hoursOf(byProj[b]) - hoursOf(byProj[a]); }).forEach(function (k) {
      lines.push("");
      lines.push(k + " — " + hm(hoursOf(byProj[k])));
      byProj[k].slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (x) {
        lines.push("  • " + shortDate(x.at) + (x.text ? ": " + x.text : "") + " (" + hm(x.mins) + ")");
      });
    });
    return lines.join("\n");
  }

  Pult.register("worklog", {
    label: "Рабочий журнал",
    empty: function () { return { entries: [], timer: null }; },
    mount: function (ctx) {
      ctx.kind = "week";
      ctx.ref = Date.now();
      ctx.kpi = ctx.body.appendChild(h('<div class="wl-kpi">' +
        '<div><span class="lg mono"></span><span class="sm">сегодня</span></div>' +
        '<div><span class="lg mono"></span><span class="sm">неделя</span></div>' +
        '<div><span class="lg mono"></span><span class="sm">месяц</span></div></div>'));

      ctx.timerEl = ctx.body.appendChild(h('<div class="wl-timer" hidden><span class="wl-dot"></span><span class="wl-what"></span>' +
        '<span class="wl-time mono"></span><button class="addbtn" type="button">■ Стоп</button></div>'));
      ctx.timerEl.querySelector("button").addEventListener("click", function () {
        var v = clone(ctx.items()), t = v.timer;
        if (!t) return;
        var mins = Math.max(1, Math.round((Date.now() - t.start) / MIN));
        v.entries = (v.entries || []).concat([{ id: newId(), at: t.start, project: t.project, text: t.text, mins: mins }]);
        v.timer = null;
        ctx.save(v);
        u.toast("Записано " + hm(mins));
      });

      var f = u.form([
        { key: "project", placeholder: "Проект", cls: "subj-in", list: true, keep: true },
        { key: "text", placeholder: "Что сделано", cls: "grow" },
        { key: "hours", type: "number", placeholder: "Часы", cls: "num-s", step: "0.25", min: 0 },
        { key: "date", type: "date", placeholder: "Дата", value: function () { return u.dateInput(Date.now()); } }
      ], function (v) {
        if (!(v.hours > 0)) { u.toast("Укажите часы или запустите таймер"); return false; }
        var at = u.parseDate(v.date) || Date.now();
        var x = clone(ctx.items());
        x.entries = (x.entries || []).concat([{ id: newId(), at: at, project: v.project, text: v.text, mins: Math.round(v.hours * 60) }]);
        ctx.save(x);
      });
      var start = h('<button class="tbtn wl-start" type="button">▶ Таймер</button>');
      start.addEventListener("click", function () {
        var v = clone(ctx.items());
        if (v.timer) { u.toast("Таймер уже идёт"); return; }
        v.timer = { start: Date.now(), project: f.inputs.project.value.trim(), text: f.inputs.text.value.trim() };
        ctx.save(v);
        f.inputs.text.value = "";
      });
      f.appendChild(start);
      ctx.form = ctx.body.appendChild(f);

      var tabs = h('<div class="seg"><button type="button" data-k="week">Неделя</button><button type="button" data-k="month">Месяц</button>' +
        '<button type="button" data-k="day">День</button></div>');
      tabs.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        ctx.kind = b.getAttribute("data-k");
        Pult.types.worklog.update(ctx);
      });
      ctx.tabs = ctx.body.appendChild(tabs);
      ctx.nav = ctx.body.appendChild(navBar(function (k) { ctx.ref = shiftPeriod(ctx.kind, ctx.ref, k); Pult.types.worklog.update(ctx); }));
      ctx.proj = ctx.body.appendChild(h("<div></div>"));
      ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
      var tools = h('<div class="tbl-tools"><button class="tbtn" type="button">⧉ Скопировать отчёт</button><button class="tbtn" type="button">⎙ Печать / PDF</button></div>');
      tools.querySelectorAll("button")[0].addEventListener("click", function () {
        var p = period(ctx.kind, ctx.ref), e = inRange(ctx.items().entries || [], p);
        if (!e.length) { u.toast("За этот период записей нет"); return; }
        u.copyText(reportText("Отчёт", p, e));
      });
      tools.querySelectorAll("button")[1].addEventListener("click", function () {
        var p = period(ctx.kind, ctx.ref), e = inRange(ctx.items().entries || [], p);
        if (!e.length) { u.toast("За этот период записей нет"); return; }
        u.printText("Отчёт " + p.label, "<h1>Отчёт — " + esc(p.label) + "</h1><pre>" + esc(reportText("Отчёт", p, e).split("\n").slice(1).join("\n")) + "</pre>");
      });
      ctx.body.appendChild(tools);
    },
    update: function (ctx) {
      var v = ctx.items(), entries = v.entries || [], p = period(ctx.kind, ctx.ref);
      var seen = {};
      entries.forEach(function (x) { if (x.project) seen[x.project] = 1; });
      ctx.form.setList("project", Object.keys(seen));
      Array.prototype.forEach.call(ctx.tabs.children, function (b) { b.classList.toggle("on", b.getAttribute("data-k") === ctx.kind); });
      setTxt(ctx.nav.querySelector(".ex-month"), p.label);

      var mine = inRange(entries, p), byProj = {};
      mine.forEach(function (x) { var k = x.project || "Без проекта"; byProj[k] = (byProj[k] || 0) + (+x.mins || 0); });
      var rows = Object.keys(byProj).map(function (k) { return { label: k, value: byProj[k], text: hm(byProj[k]) }; }).sort(function (a, b) { return b.value - a.value; });
      ctx.proj.innerHTML = rows.length > 1 ? u.hbars(rows) : "";

      var list = ctx.list;
      list.innerHTML = "";
      if (!mine.length) emptyRow(list, "За период записей нет");
      var lastDay = "";
      mine.slice().sort(function (a, b) { return b.at - a.at; }).forEach(function (x) {
        var dk = dayKey(x.at);
        if (dk !== lastDay) {
          lastDay = dk;
          var dayMins = hoursOf(mine.filter(function (y) { return dayKey(y.at) === dk; }));
          list.appendChild(h('<div class="day-h"><span>' + esc(u.DAYS[new Date(x.at).getDay()] + ", " + shortDate(x.at)) + '</span><span class="mono">' + hm(dayMins) + "</span></div>"));
        }
        var r = h('<div class="row wl"><div>' + (x.project ? '<div class="subj">' + esc(x.project) + "</div>" : "") +
          '<div class="tt">' + esc(x.text || "—") + '</div></div><div class="amt">' + hm(x.mins) + "</div></div>");
        r.appendChild(rowX(function () {
          var nv = clone(ctx.items());
          nv.entries = (nv.entries || []).filter(function (y) { return y.id !== x.id; });
          ctx.save(nv);
        }));
        list.appendChild(r);
      });
      Pult.types.worklog.tick(ctx, Date.now());
    },
    sub: function (ctx, now) {
      var v = ctx.items();
      if (v.timer) return "идёт таймер · " + (v.timer.project || v.timer.text || "без названия");
      var w = inRange(v.entries || [], period("week", now));
      return "за неделю " + hm(hoursOf(w));
    },
    tick: function (ctx, now) {
      var v = ctx.items(), e = v.entries || [], t = v.timer;
      var lg = ctx.kpi.querySelectorAll(".lg"), run = t ? (now - t.start) / MIN : 0;
      var inc = function (p) { return hoursOf(inRange(e, p)) + (t && t.start >= p.start ? run : 0); };
      setTxt(lg[0], hm(inc(period("day", now))));
      setTxt(lg[1], hm(inc(period("week", now))));
      setTxt(lg[2], hm(inc(period("month", now))));
      ctx.timerEl.hidden = !t;
      if (t) {
        setTxt(ctx.timerEl.querySelector(".wl-what"), [t.project, t.text].filter(Boolean).join(" · ") || "Работа");
        var s = Math.floor((now - t.start) / 1000);
        setTxt(ctx.timerEl.querySelector(".wl-time"), pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60));
      }
    },
    today: function (items, b, now) {
      var m = hoursOf(inRange(items.entries || [], period("day", now)));
      return (m ? ["отработано " + hm(m)] : []).concat(items.timer ? ["идёт таймер: " + (items.timer.project || items.timer.text || "работа")] : []);
    },
    stats: function (items, b, ws, now) {
      return [{ label: "отработано", value: hm(hoursOf((items.entries || []).filter(function (x) { return x.at >= ws && x.at < u.addDays(ws, 7); }))) }];
    },
    dates: function () { return []; }
  });

  /* =============================== report =============================== */
  // config: { fields: [...], period: day|week|month }; data: { reports: { periodKey: [texts] } }

  Pult.register("report", {
    label: "Отчёт по шаблону",
    defaults: { fields: ["Сделано", "Планы", "Проблемы"], period: "week" },
    empty: function () { return { reports: {} }; },
    mount: function (ctx) {
      var cfg = ctx.config();
      ctx.ref = Date.now();
      // unsaved text is flushed to the current period before switching
      var flush = function () { (ctx.areas || []).forEach(function (ta) { if (ta._dirty) ta.dispatchEvent(new Event("blur")); }); };
      ctx.nav = ctx.body.appendChild(navBar(function (k) { flush(); ctx.ref = shiftPeriod(cfg.period, ctx.ref, k); Pult.types.report.update(ctx, true); }));
      ctx.areas = cfg.fields.map(function (name, i) {
        var wrap = h('<label class="rp-field"><span>' + esc(name) + '</span><textarea rows="3"></textarea></label>');
        var ta = wrap.querySelector("textarea"), timer = 0;
        var save = function () {
          var v = clone(ctx.items()), key = period(cfg.period, ctx.ref).key;
          v.reports = v.reports || {};
          var cur = (v.reports[key] || []).slice();
          ta._dirty = false;
          if ((cur[i] || "") === ta.value) return;
          cur[i] = ta.value;
          v.reports[key] = cur;
          if (!cur.some(function (x) { return x && x.trim(); })) delete v.reports[key];
          ctx.save(v);
        };
        ta.addEventListener("input", function () { ta._dirty = true; clearTimeout(timer); timer = setTimeout(save, 600); });
        ta.addEventListener("blur", function () { clearTimeout(timer); save(); });
        ctx.body.appendChild(wrap);
        return ta;
      });
      var tools = h('<div class="tbl-tools"><button class="tbtn" type="button">⧉ Скопировать</button><button class="tbtn" type="button">⎙ Печать / PDF</button></div>');
      var text = function () {
        var p = period(cfg.period, ctx.ref), r = (ctx.items().reports || {})[p.key] || [];
        return { p: p, parts: cfg.fields.map(function (f, i) { return { f: f, t: (r[i] || "").trim() }; }).filter(function (x) { return x.t; }) };
      };
      tools.querySelectorAll("button")[0].addEventListener("click", function () {
        var t = text();
        if (!t.parts.length) { u.toast("Отчёт пустой"); return; }
        u.copyText(ctx.block().title + " — " + t.p.label + "\n\n" + t.parts.map(function (x) { return x.f + ":\n" + x.t; }).join("\n\n"));
      });
      tools.querySelectorAll("button")[1].addEventListener("click", function () {
        var t = text();
        if (!t.parts.length) { u.toast("Отчёт пустой"); return; }
        u.printText(ctx.block().title, "<h1>" + esc(ctx.block().title) + " — " + esc(t.p.label) + "</h1>" +
          t.parts.map(function (x) { return "<h2>" + esc(x.f) + "</h2><pre>" + esc(x.t) + "</pre>"; }).join(""));
      });
      ctx.body.appendChild(tools);
      ctx.arch = ctx.body.appendChild(h('<details class="rp-arch"><summary>Архив</summary><div class="listwrap"></div></details>'));
    },
    update: function (ctx, force) {
      var cfg = ctx.config(), p = period(cfg.period, ctx.ref), r = (ctx.items().reports || {})[p.key] || [];
      setTxt(ctx.nav.querySelector(".ex-month"), p.label);
      // keep text that is being typed or not yet saved
      ctx.areas.forEach(function (ta, i) { if (force || (document.activeElement !== ta && !ta._dirty)) { ta.value = r[i] || ""; ta._dirty = false; } });
      var list = ctx.arch.querySelector(".listwrap"), keys = Object.keys(ctx.items().reports || {}).sort().reverse();
      ctx.arch.querySelector("summary").textContent = "Архив (" + keys.length + ")";
      list.innerHTML = "";
      if (!keys.length) emptyRow(list, "Отчётов пока нет");
      keys.forEach(function (k) {
        var t = u.parseDate(k.split(":")[1]), pp = period(cfg.period, t);
        var first = ((ctx.items().reports[k] || []).filter(function (x) { return x && x.trim(); })[0] || "").slice(0, 80);
        var row = h('<button class="row rp-row" type="button"><span class="nm">' + esc(pp.label) + '</span><span class="note">' + esc(first) + "</span></button>");
        row.addEventListener("click", function () {
          ctx.areas.forEach(function (ta) { if (ta._dirty) ta.dispatchEvent(new Event("blur")); });
          ctx.ref = t;
          Pult.types.report.update(ctx, true);
        });
        list.appendChild(row);
      });
    },
    sub: function (ctx) {
      var cfg = ctx.config(), p = period(cfg.period, Date.now()), r = (ctx.items().reports || {})[p.key];
      var names = { day: "сегодня", week: "на этой неделе", month: "в этом месяце" };
      return r ? "заполнен " + names[cfg.period] : "не заполнен " + names[cfg.period];
    },
    reminders: function (items, b, now) {
      var cfg = Object.assign({ period: "week" }, b.config), d = new Date(now), p = period(cfg.period, now);
      if ((items.reports || {})[p.key]) return [];
      var due = cfg.period === "day" ? d.getHours() >= 21 : cfg.period === "week" ? d.getDay() === 5 && d.getHours() >= 16 : u.addDays(now, 1) >= p.end && d.getHours() >= 12;
      return due ? [{ key: p.key, text: "Заполните: " + b.title }] : [];
    },
    settings: function (ctx) {
      var cfg = ctx.config();
      var fields = h('<input type="text" class="w-l">'), per = h('<select><option value="day">каждый день</option><option value="week">каждую неделю</option><option value="month">каждый месяц</option></select>');
      fields.value = cfg.fields.join(", "); per.value = cfg.period;
      var el = h('<div class="bset"><div class="bset-hint">Разделы отчёта через запятую. Тексты уже заполненных отчётов привязаны к порядку разделов.</div></div>');
      var l1 = h("<label>Разделы </label>"); l1.appendChild(fields);
      var l2 = h("<label>Период </label>"); l2.appendChild(per);
      var b = h('<button class="tbtn" type="button">Сохранить</button>');
      b.addEventListener("click", function () {
        var list = fields.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8);
        if (!list.length) { u.toast("Нужен хотя бы один раздел"); return; }
        ctx.setConfig({ fields: list, period: per.value });
      });
      el.appendChild(l1); el.appendChild(l2); el.appendChild(b);
      return el;
    }
  });

  [
    { group: "Работа", type: "worklog", title: "Рабочий журнал", desc: "Что сделано и сколько часов, таймер, итоги по проектам и кнопка «Скопировать отчёт».", wide: true },
    { group: "Работа", type: "report", title: "Еженедельный отчёт", desc: "Разделы «Сделано / Планы / Проблемы» на каждую неделю, архив, копирование и печать.", wide: true },
    { group: "Работа", type: "report", title: "Ежедневный отчёт", desc: "Короткий отчёт за день по шаблону.", config: { fields: ["Сделано сегодня", "Завтра", "Блокеры"], period: "day" } },
    { group: "Личное", type: "report", title: "Дневник благодарности", desc: "Три пункта за день и архив.", config: { fields: ["Первое", "Второе", "Третье"], period: "day" } }
  ].forEach(Pult.preset);
})();
