// Overview blocks read other blocks through their today/stats/dates hooks.
(function () {
  "use strict";
  var u = Pult.util;
  var D = u.D, h = u.h, esc = u.esc, setTxt = u.setTxt, emptyRow = u.emptyRow, dayKey = u.dayKey, plural = u.plural;

  function others(ctx) {
    return Pult.api.layout().filter(function (b) { return b.id !== ctx.id && Pult.types[b.type]; });
  }
  function safe(fn, fallback) { try { return fn(); } catch (e) { console.error(e); return fallback; } }

  /* =============================== today =============================== */

  Pult.register("today", {
    label: "Сегодня",
    global: true,
    empty: function () { return {}; },
    mount: function (ctx) { ctx.list = ctx.body.appendChild(h('<div class="td"></div>')); },
    collect: function (ctx, now) {
      var out = [];
      others(ctx).forEach(function (b) {
        var t = Pult.types[b.type];
        if (!t.today) return;
        var lines = safe(function () { return t.today(Pult.api.itemsOf(b), b, now) || []; }, []);
        if (lines.length) out.push({ title: b.title, lines: lines });
      });
      return out;
    },
    update: function (ctx) {
      var groups = Pult.types.today.collect(ctx, Date.now()), list = ctx.list;
      var sig = JSON.stringify(groups);
      if (sig === ctx.sig) return;
      ctx.sig = sig;
      list.innerHTML = "";
      if (!groups.length) { emptyRow(list, "На сегодня ничего срочного — хорошего дня!"); return; }
      groups.forEach(function (g) {
        var sec = h('<div class="td-g"><div class="td-h">' + esc(g.title) + "</div><ul></ul></div>");
        var ul = sec.querySelector("ul");
        g.lines.slice(0, 6).forEach(function (l) { var li = document.createElement("li"); li.textContent = l; ul.appendChild(li); });
        if (g.lines.length > 6) { var li = document.createElement("li"); li.className = "note"; li.textContent = "и ещё " + (g.lines.length - 6); ul.appendChild(li); }
        list.appendChild(sec);
      });
    },
    sub: function (ctx, now) {
      var n = Pult.types.today.collect(ctx, now).reduce(function (a, g) { return a + g.lines.length; }, 0);
      return n ? n + " " + plural(n, "пункт", "пункта", "пунктов") + " на сегодня" : "всё спокойно";
    },
    // refresh once a minute: deadlines and lessons move with time
    tick: function (ctx, now) {
      var m = Math.floor(now / 60000);
      if (ctx.min !== m) { ctx.min = m; Pult.types.today.update(ctx); }
    }
  });

  /* =============================== week stats =============================== */

  Pult.register("weekstats", {
    label: "Итоги недели",
    global: true,
    empty: function () { return {}; },
    mount: function (ctx) { ctx.list = ctx.body.appendChild(h('<div class="ws"></div>')); },
    update: function (ctx) {
      var now = Date.now(), ws = u.startOfWeek(now), list = ctx.list, rows = [];
      others(ctx).forEach(function (b) {
        var t = Pult.types[b.type];
        if (!t.stats) return;
        safe(function () { return t.stats(Pult.api.itemsOf(b), b, ws, now) || []; }, []).forEach(function (s) { rows.push({ block: b.title, label: s.label, value: s.value }); });
      });
      var sig = JSON.stringify(rows);
      if (sig === ctx.sig) return;
      ctx.sig = sig;
      list.innerHTML = "";
      if (!rows.length) { emptyRow(list, "Пока нечего считать — статистика появится по мере записей"); return; }
      rows.forEach(function (r) {
        list.appendChild(h('<div class="ws-i"><span class="lg mono">' + esc(String(r.value)) + '</span><span class="sm">' + esc(r.label) + '</span><span class="note">' + esc(r.block) + "</span></div>"));
      });
    },
    sub: function () { var ws = u.startOfWeek(Date.now()); return u.shortDate(ws) + " — " + u.shortDate(u.addDays(ws, 6)); },
    tick: function (ctx, now) { var m = Math.floor(now / 300000); if (ctx.min !== m) { ctx.min = m; Pult.types.weekstats.update(ctx); } }
  });

  /* =============================== calendar =============================== */

  Pult.register("calendar", {
    label: "Календарь",
    global: true,
    empty: function () { return {}; },
    mount: function (ctx) {
      var n = new Date();
      ctx.month = new Date(n.getFullYear(), n.getMonth(), 1).getTime();
      ctx.sel = dayKey(n);
      var nav = h('<div class="ex-nav"><button class="ebtn" type="button" aria-label="Предыдущий месяц">‹</button><span class="ex-month"></span>' +
        '<button class="ebtn" type="button" aria-label="Следующий месяц">›</button></div>');
      var shift = function (k) { var d = new Date(ctx.month); ctx.month = new Date(d.getFullYear(), d.getMonth() + k, 1).getTime(); ctx.sig = null; Pult.types.calendar.update(ctx); };
      nav.querySelectorAll("button")[0].addEventListener("click", function () { shift(-1); });
      nav.querySelectorAll("button")[1].addEventListener("click", function () { shift(1); });
      ctx.nav = ctx.body.appendChild(nav);
      ctx.grid = ctx.body.appendChild(h('<div class="cal" role="grid"></div>'));
      ctx.grid.addEventListener("click", function (e) {
        var c = e.target.closest(".cal-d");
        if (!c || !c.getAttribute("data-k")) return;
        ctx.sel = c.getAttribute("data-k");
        ctx.sig = null;
        Pult.types.calendar.update(ctx);
      });
      ctx.day = ctx.body.appendChild(h('<div class="cal-list"></div>'));
    },
    events: function (ctx) {
      var map = {};
      others(ctx).forEach(function (b) {
        var t = Pult.types[b.type];
        if (!t.dates) return;
        safe(function () { return t.dates(Pult.api.itemsOf(b), b) || []; }, []).forEach(function (e) {
          if (!e.at) return;
          var k = dayKey(e.at);
          (map[k] = map[k] || []).push({ title: e.title, block: b.title });
        });
      });
      return map;
    },
    update: function (ctx) {
      var ev = Pult.types.calendar.events(ctx), sig = JSON.stringify([ev, ctx.month, ctx.sel, dayKey(Date.now())]);
      if (sig === ctx.sig) return;
      ctx.sig = sig;
      var d0 = new Date(ctx.month), y = d0.getFullYear(), m = d0.getMonth();
      setTxt(ctx.nav.querySelector(".ex-month"), u.MONTHS_FULL[m] + " " + y);
      var lead = (d0.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), today = dayKey(Date.now());
      var html = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(function (x) { return '<div class="cal-w">' + x + "</div>"; }).join("");
      for (var i = 0; i < lead; i++) html += '<div class="cal-d empty"></div>';
      for (var d = 1; d <= days; d++) {
        var k = dayKey(new Date(y, m, d)), n = (ev[k] || []).length;
        html += '<button type="button" class="cal-d' + (k === today ? " today" : "") + (k === ctx.sel ? " sel" : "") + (n ? " has" : "") + '" data-k="' + k + '" aria-label="' + d + " " + u.MONTHS[m] + (n ? ", событий: " + n : "") + '">' +
          "<span>" + d + "</span>" + (n ? '<i class="cal-n">' + (n > 9 ? "9+" : n) + "</i>" : "") + "</button>";
      }
      ctx.grid.innerHTML = html;
      var list = ctx.day, items = ev[ctx.sel] || [], sd = u.parseDate(ctx.sel);
      list.innerHTML = '<div class="day-h"><span>' + esc(u.DAYS[new Date(sd).getDay()] + ", " + u.shortDate(sd)) + "</span></div>";
      if (!items.length) emptyRow(list, "Нет событий");
      items.forEach(function (e) {
        list.appendChild(h('<div class="row mv"><div class="nm">' + esc(e.title) + ' <span class="note">· ' + esc(e.block) + "</span></div></div>"));
      });
    },
    sub: function (ctx) {
      var ev = Pult.types.calendar.events(ctx), n = 0, now = Date.now();
      for (var i = 0; i < 7; i++) n += (ev[dayKey(u.addDays(now, i))] || []).length;
      return n ? n + " " + plural(n, "событие", "события", "событий") + " за 7 дней" : "на неделе событий нет";
    },
    tick: function (ctx, now) { var m = Math.floor(now / 60000); if (ctx.min !== m) { ctx.min = m; Pult.types.calendar.update(ctx); } }
  });

  [
    { group: "Обзор", type: "today", title: "Сегодня", desc: "Сводка дня из всех блоков: пары, дедлайны, платежи, привычки, события.", wide: true },
    { group: "Обзор", type: "weekstats", title: "Итоги недели", desc: "Закрытые задачи, отметки привычек, траты, часы работы.", wide: true },
    { group: "Обзор", type: "calendar", title: "Календарь месяца", desc: "Все даты из всех блоков на одной сетке." }
  ].forEach(Pult.preset);
})();
