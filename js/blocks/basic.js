// Basic blocks: deadlines, habits, payments, lists, notes, schedule, countdown, expenses, table.
(function () {
  "use strict";
  var u = Pult.util;
  var MIN = u.MIN, H = u.H, D = u.D, pad = u.pad, pMerge = u.pMerge, clone = u.clone, newId = u.newId, money = u.money,
    dayKey = u.dayKey, parseDue = u.parseDue, esc = u.esc, h = u.h, onEnter = u.onEnter, onActivate = u.onActivate,
    setTxt = u.setTxt, humanCd = u.humanCd, streak = u.streak, plural = u.plural, toMin = u.toMin, toast = u.toast,
    rowX = u.rowX, emptyRow = u.emptyRow, DSHORT = u.DSHORT, MONTHS = u.MONTHS, MONTHS_FULL = u.MONTHS_FULL;

  /* ============================== block types ============================== */
  // mount(ctx) builds the block body once; update(ctx) redraws it from ctx.items();
  // sub(ctx, now) returns the caption under the title; tick(ctx, now) runs every second.

  var T = {
    deadlines: {
      label: "Дедлайны",
      empty: function () { return []; },
      mount: function (ctx) {
        var f = h('<div class="addf">' +
          '<input class="subj-in" type="text" placeholder="Категория" aria-label="Категория">' +
          '<input class="grow" type="text" placeholder="Что сделать" aria-label="Задача">' +
          '<input type="date" aria-label="Срок">' +
          '<button class="addbtn" type="button">Добавить</button></div>');
        var inp = f.querySelectorAll("input");
        var add = function () {
          var title = inp[1].value.trim();
          if (!title) return;
          ctx.add({ subj: inp[0].value.trim(), title: title, due: parseDue(inp[2].value) || (Date.now() + D), done: false });
          inp[0].value = ""; inp[1].value = ""; inp[2].value = "";
          inp[1].focus();
        };
        f.querySelector("button").addEventListener("click", add);
        onEnter(inp[0], add); onEnter(inp[1], add);
        ctx.body.appendChild(f);
        ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
      },
      update: function (ctx) {
        var list = ctx.list, items = ctx.items().slice();
        items.sort(function (a, b) { return (a.done - b.done) || (a.due - b.due); });
        list.innerHTML = "";
        if (!items.length) emptyRow(list);
        items.forEach(function (t) {
          var r = h('<div class="row hw' + (t.done ? " done" : "") + '">' +
            '<div class="box" role="button" tabindex="0" aria-label="Выполнено">' + (t.done ? "✓" : "") + "</div>" +
            "<div>" + (t.subj ? '<div class="subj">' + esc(t.subj) + "</div>" : "") + '<div class="tt">' + esc(t.title) + "</div></div>" +
            '<div class="due" data-due="' + esc(t.due) + '"></div></div>');
          onActivate(r.querySelector(".box"), function () { ctx.patch(t.id, { done: !t.done, doneAt: t.done ? null : Date.now() }); });
          r.appendChild(rowX(function () { ctx.remove(t.id); }));
          list.appendChild(r);
        });
      },
      sub: function (ctx, now) {
        var a = ctx.items(), open = 0, over = 0;
        a.forEach(function (t) { if (!t.done) { open++; if (t.due < now) over++; } });
        return a.length ? open + " активн." + (over ? " · " + over + " просроч." : "") : "нет задач";
      }
    },

    habits: {
      label: "Привычки",
      empty: function () { return []; },
      mount: function (ctx) {
        var f = h('<div class="addf">' +
          '<input class="emo-in" type="text" placeholder="🏃" aria-label="Значок" maxlength="2">' +
          '<input class="grow" type="text" placeholder="Новая привычка" aria-label="Название привычки">' +
          '<button class="addbtn" type="button">Добавить</button></div>');
        var inp = f.querySelectorAll("input");
        var add = function () {
          var name = inp[1].value.trim();
          if (!name) return;
          ctx.add({ emo: inp[0].value.trim() || "✅", name: name, log: {} });
          inp[0].value = ""; inp[1].value = "";
          inp[1].focus();
        };
        f.querySelector("button").addEventListener("click", add);
        onEnter(inp[1], add);
        ctx.body.appendChild(f);
        ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
      },
      update: function (ctx) {
        var list = ctx.list, items = ctx.items(), tk = dayKey(new Date());
        list.innerHTML = "";
        if (!items.length) emptyRow(list);
        items.forEach(function (it) {
          var log = it.log || {}, onToday = !!log[tk];
          var dots = "", d = new Date();
          d.setDate(d.getDate() - 6);
          for (var i = 0; i < 7; i++) { dots += '<i class="' + (log[dayKey(d)] ? "on" : "") + '"></i>'; d.setDate(d.getDate() + 1); }
          var r = h('<div class="row hb">' +
            '<div class="emo">' + esc(it.emo || "•") + "</div>" +
            '<div><div class="nm">' + esc(it.name) + "</div></div>" +
            '<div class="dots">' + dots + "</div>" +
            '<div class="streak">серия <b>' + streak(log) + "</b></div>" +
            '<button class="today' + (onToday ? " on" : "") + '" type="button">' + (onToday ? "✓ сегодня" : "сегодня") + "</button></div>");
          r.querySelector(".today").addEventListener("click", function () {
            var p = { log: {} };
            p.log[tk] = !onToday;
            ctx.patch(it.id, p);
          });
          r.appendChild(rowX(function () { ctx.remove(it.id); }));
          list.appendChild(r);
        });
      },
      sub: function (ctx) {
        var a = ctx.items(), tk = dayKey(new Date()), n = 0;
        a.forEach(function (x) { if (x.log && x.log[tk]) n++; });
        return a.length ? a.length + " привыч. · сегодня " + n : "нет привычек";
      }
    },

    payments: {
      label: "Платежи",
      empty: function () { return []; },
      mount: function (ctx) {
        ctx.summ = ctx.body.appendChild(h('<div class="summ">' +
          '<div><div class="lg mono"></div><div class="sm">не оплачено</div><div class="sm subs"></div></div>' +
          '<div class="right"><div class="lg accent mono"></div><div class="sm"></div></div></div>'));
        var f = h('<div class="addf">' +
          '<input class="grow" type="text" placeholder="Платёж" aria-label="Название">' +
          '<input class="num" type="number" min="0" step="1" placeholder="₽" aria-label="Сумма">' +
          '<input type="date" aria-label="Дата списания">' +
          '<select class="rep-in" aria-label="Повтор"><option value="">разово</option><option value="month">каждый месяц</option><option value="year">каждый год</option></select>' +
          '<button class="addbtn" type="button">Добавить</button></div>');
        var inp = f.querySelectorAll("input"), rep = f.querySelector("select");
        var add = function () {
          var name = inp[0].value.trim();
          if (!name) return;
          ctx.add({ name: name, amt: +inp[1].value || 0, due: parseDue(inp[2].value) || (Date.now() + D), paid: false, repeat: rep.value || null });
          inp[0].value = ""; inp[1].value = ""; inp[2].value = "";
          inp[0].focus();
        };
        f.querySelector("button").addEventListener("click", add);
        onEnter(inp[0], add); onEnter(inp[1], add);
        ctx.body.appendChild(f);
        ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
      },
      update: function (ctx) {
        var list = ctx.list, items = ctx.items().slice();
        items.sort(function (a, b) { return (a.paid - b.paid) || (a.due - b.due); });
        list.innerHTML = "";
        if (!items.length) emptyRow(list);
        items.forEach(function (b) {
          var r = h('<div class="row bl' + (b.paid ? " paid" : "") + '">' +
            '<div class="paybox" role="button" tabindex="0" aria-label="Оплачено">' + (b.paid ? "✓" : "") + "</div>" +
            '<div><div class="nm">' + esc(b.name) + "</div>" + (b.repeat || b.note ? '<div class="note">' + esc(b.repeat ? (b.repeat === "year" ? "каждый год" : "каждый месяц") + (b.lastPaid ? " · оплачено " + u.shortDate(b.lastPaid) : "") : b.note) + "</div>" : "") + "</div>" +
            '<div class="amt">' + money(b.amt) + "</div>" +
            '<div class="due" data-due="' + esc(b.due) + '"></div></div>');
          onActivate(r.querySelector(".paybox"), function () {
            // a recurring payment moves to the next period instead of staying "paid"
            if (b.repeat && !b.paid) {
              var d = new Date(b.due);
              if (b.repeat === "year") d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
              ctx.patch(b.id, { due: d.getTime(), lastPaid: Date.now() });
              toast("Оплачено · следующий платёж " + u.shortDate(d));
            } else ctx.patch(b.id, { paid: !b.paid });
          });
          r.appendChild(rowX(function () { ctx.remove(b.id); }));
          list.appendChild(r);
        });
      },
      sub: function (ctx, now) {
        var a = ctx.items(), unpaid = 0, over = 0;
        a.forEach(function (x) { if (!x.paid) { unpaid++; if (x.due < now) over++; } });
        return a.length ? unpaid + " не оплачено" + (over ? " · " + over + " просроч." : "") : "нет платежей";
      },
      tick: function (ctx, now) {
        var a = ctx.items(), sum = 0, next = null;
        a.forEach(function (x) { if (!x.paid) { sum += (+x.amt || 0); if (!next || x.due < next.due) next = x; } });
        var lg = ctx.summ.querySelectorAll(".lg"), sm = [null, ctx.summ.querySelector(".right .sm")];
        setTxt(lg[0], money(sum));
        var mon = 0;
        a.forEach(function (x) { if (x.repeat === "month") mon += +x.amt || 0; else if (x.repeat === "year") mon += (+x.amt || 0) / 12; });
        setTxt(ctx.summ.querySelector(".subs"), mon ? "подписки ≈ " + money(Math.round(mon)) + "/мес · " + money(Math.round(mon * 12)) + "/год" : "");
        if (next) { setTxt(lg[1], humanCd(next.due - now)); setTxt(sm[1], next.name + " · " + money(next.amt)); }
        else { setTxt(lg[1], a.length ? "✓" : "—"); setTxt(sm[1], a.length ? "всё оплачено" : "нет платежей"); }
      }
    },

    list: {
      label: "Список",
      empty: function () { return []; },
      mount: function (ctx) {
        var f = h('<div class="addf"><input class="grow" type="text" placeholder="Добавить пункт" aria-label="Пункт">' +
          '<button class="addbtn" type="button">Добавить</button></div>');
        var inp = f.querySelector("input");
        var add = function () {
          var title = inp.value.trim();
          if (!title) return;
          ctx.add({ title: title });
          inp.value = "";
          inp.focus();
        };
        f.querySelector("button").addEventListener("click", add);
        onEnter(inp, add);
        ctx.body.appendChild(f);
        ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
      },
      update: function (ctx) {
        var list = ctx.list, items = ctx.items().slice().reverse();
        list.innerHTML = "";
        if (!items.length) emptyRow(list);
        items.forEach(function (m) {
          var r = h('<div class="row mv"><div class="nm">' + esc(m.title) + "</div></div>");
          r.appendChild(rowX(function () { ctx.remove(m.id); }));
          list.appendChild(r);
        });
      },
      sub: function (ctx) { var n = ctx.items().length; return n ? n + " в списке" : "пусто"; }
    },

    checklist: {
      label: "Чек-лист",
      empty: function () { return []; },
      mount: function (ctx) { T.list.mount(ctx); },
      update: function (ctx) {
        var list = ctx.list, items = ctx.items().slice();
        items.sort(function (a, b) { return (!!a.done - !!b.done); });
        list.innerHTML = "";
        if (!items.length) emptyRow(list);
        items.forEach(function (t) {
          var r = h('<div class="row ck' + (t.done ? " done" : "") + '">' +
            '<div class="box" role="button" tabindex="0" aria-label="Готово">' + (t.done ? "✓" : "") + "</div>" +
            '<div class="tt">' + esc(t.title) + "</div></div>");
          onActivate(r.querySelector(".box"), function () { ctx.patch(t.id, { done: !t.done, doneAt: t.done ? null : Date.now() }); });
          r.appendChild(rowX(function () { ctx.remove(t.id); }));
          list.appendChild(r);
        });
      },
      sub: function (ctx) {
        var a = ctx.items(), d = a.filter(function (x) { return x.done; }).length;
        return a.length ? d + " из " + a.length : "пусто";
      }
    },

    note: {
      label: "Заметка",
      empty: function () { return { text: "" }; },
      mount: function (ctx) {
        var ta = h('<textarea class="note-ta" rows="6" placeholder="Пишите здесь…" aria-label="Заметка"></textarea>');
        var timer = 0;
        ta.addEventListener("input", function () {
          clearTimeout(timer);
          timer = setTimeout(function () { ctx.save({ text: ta.value }); }, 600);
        });
        ta.addEventListener("blur", function () {
          clearTimeout(timer);
          if (ta.value !== (ctx.items().text || "")) ctx.save({ text: ta.value });
        });
        ctx.ta = ctx.body.appendChild(ta);
      },
      update: function (ctx) {
        if (document.activeElement !== ctx.ta) ctx.ta.value = ctx.items().text || "";
      },
      sub: function (ctx) {
        var t = (ctx.items().text || "").trim();
        return t ? t.split(/\s+/).length + " сл." : "пусто";
      }
    },

    schedule: {
      label: "Расписание",
      empty: function () { return { days: {} }; },
      mount: function (ctx) {
        ctx.day = String(new Date().getDay());
        var tabs = h('<div class="tabs" role="tablist"></div>');
        [1, 2, 3, 4, 5, 6, 0].forEach(function (d) {
          var t = h('<button class="tab" type="button" role="tab" data-day="' + d + '">' + DSHORT[d] + "</button>");
          t.addEventListener("click", function () { ctx.day = String(d); T.schedule.update(ctx); });
          tabs.appendChild(t);
        });
        ctx.tabs = ctx.body.appendChild(tabs);
        var f = h('<div class="addf">' +
          '<input class="time-in" type="time" aria-label="Начало" value="09:00">' +
          '<input class="time-in" type="time" aria-label="Конец" value="10:30">' +
          '<input class="grow" type="text" placeholder="Предмет" aria-label="Предмет">' +
          '<input class="room-in" type="text" placeholder="Ауд." aria-label="Аудитория">' +
          '<button class="addbtn" type="button">Добавить</button></div>');
        var inp = f.querySelectorAll("input");
        var add = function () {
          var title = inp[2].value.trim();
          if (!title || !inp[0].value) return;
          var v = clone(ctx.items());
          v.days = v.days || {};
          v.days[ctx.day] = (v.days[ctx.day] || []).concat([{ id: newId(), start: inp[0].value, end: inp[1].value || inp[0].value, title: title, room: inp[3].value.trim() }]);
          ctx.save(v);
          inp[2].value = ""; inp[3].value = "";
          inp[2].focus();
        };
        f.querySelector("button").addEventListener("click", add);
        onEnter(inp[2], add); onEnter(inp[3], add);
        ctx.body.appendChild(f);
        ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
      },
      update: function (ctx) {
        var today = String(new Date().getDay());
        Array.prototype.forEach.call(ctx.tabs.children, function (t) {
          var d = t.getAttribute("data-day"), n = ((ctx.items().days || {})[d] || []).length;
          t.classList.toggle("on", d === ctx.day);
          t.classList.toggle("today", d === today);
          t.classList.toggle("has", n > 0);
          t.setAttribute("aria-selected", d === ctx.day ? "true" : "false");
        });
        var list = ctx.list, lessons = lessonsOf(ctx, ctx.day);
        list.innerHTML = "";
        if (!lessons.length) emptyRow(list, "Пар нет");
        lessons.forEach(function (l) {
          var r = h('<div class="row sc" data-start="' + esc(l.start) + '" data-end="' + esc(l.end) + '">' +
            '<div class="sc-time mono">' + esc(l.start) + "–" + esc(l.end) + "</div>" +
            '<div><div class="nm">' + esc(l.title) + "</div>" + (l.room ? '<div class="note">' + esc(l.room) + "</div>" : "") + "</div></div>");
          r.appendChild(rowX(function () {
            var v = clone(ctx.items());
            v.days[ctx.day] = (v.days[ctx.day] || []).filter(function (x) { return x.id !== l.id; });
            ctx.save(v);
          }));
          list.appendChild(r);
        });
        T.schedule.tick(ctx, Date.now());
      },
      sub: function (ctx, now) {
        var d = new Date(now), m = d.getHours() * 60 + d.getMinutes();
        var ls = lessonsOf(ctx, String(d.getDay()));
        if (!ls.length) return "сегодня пар нет";
        for (var i = 0; i < ls.length; i++) {
          var s = toMin(ls[i].start), e = toMin(ls[i].end);
          if (m >= s && m < e) return "сейчас: " + ls[i].title + " · до " + ls[i].end;
          if (m < s) return "далее: " + ls[i].title + " через " + humanCd((s - m) * MIN);
        }
        return "пары на сегодня закончились";
      },
      tick: function (ctx, now) {
        var d = new Date(now), m = d.getHours() * 60 + d.getMinutes(), isToday = ctx.day === String(d.getDay()), nextMarked = false;
        Array.prototype.forEach.call(ctx.list.querySelectorAll(".sc"), function (r) {
          var s = toMin(r.getAttribute("data-start")), e = toMin(r.getAttribute("data-end"));
          var cur = isToday && m >= s && m < e, next = isToday && !nextMarked && m < s;
          if (next) nextMarked = true;
          r.classList.toggle("now", cur);
          r.classList.toggle("next", next);
          r.classList.toggle("past", isToday && m >= e);
        });
      }
    },

    countdown: {
      label: "Обратный отсчёт",
      // mode "expiry": items are expiry/warranty dates, highlighted when close
      defaults: { mode: "event", warnDays: 30 },
      empty: function () { return []; },
      mount: function (ctx) {
        var expiry = ctx.config().mode === "expiry";
        var f = h('<div class="addf">' +
          '<input class="grow" type="text" placeholder="' + (expiry ? "Что (продукт, гарантия, документ)" : "Событие") + '" aria-label="Название">' +
          '<input type="date" aria-label="Дата">' +
          '<input class="time-in" type="time" aria-label="Время">' +
          '<button class="addbtn" type="button">Добавить</button></div>');
        var inp = f.querySelectorAll("input");
        var add = function () {
          var title = inp[0].value.trim();
          if (!title || !inp[1].value) return;
          var p = inp[1].value.split("-"), t = (inp[2].value || "00:00").split(":");
          ctx.add({ title: title, at: new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]).getTime() });
          inp[0].value = ""; inp[1].value = ""; inp[2].value = "";
          inp[0].focus();
        };
        f.querySelector("button").addEventListener("click", add);
        onEnter(inp[0], add);
        ctx.body.appendChild(f);
        ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
      },
      update: function (ctx) {
        var now = Date.now(), items = ctx.items().slice();
        if (ctx.config().mode === "expiry") items.sort(function (a, b) { return a.at - b.at; });
        else items.sort(function (a, b) { return ((a.at < now) - (b.at < now)) || (a.at < now ? b.at - a.at : a.at - b.at); });
        var list = ctx.list;
        list.innerHTML = "";
        if (!items.length) emptyRow(list);
        items.forEach(function (ev) {
          var d = new Date(ev.at);
          var r = h('<div class="row cd-row">' +
            '<div><div class="nm">' + esc(ev.title) + '</div><div class="note">' + d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() +
            (d.getHours() || d.getMinutes() ? ", " + pad(d.getHours()) + ":" + pad(d.getMinutes()) : "") + "</div></div>" +
            '<div class="cd mono" data-at="' + esc(ev.at) + '"></div></div>');
          r.appendChild(rowX(function () { ctx.remove(ev.id); }));
          list.appendChild(r);
        });
        T.countdown.tick(ctx, now);
      },
      sub: function (ctx, now) {
        var next = null;
        ctx.items().forEach(function (e) { if (e.at > now && (!next || e.at < next.at)) next = e; });
        if (ctx.config().mode === "expiry") {
          var cfg = ctx.config(), exp = 0, soon = 0;
          ctx.items().forEach(function (e) { if (e.at <= now) exp++; else if (e.at - now < cfg.warnDays * D) soon++; });
          return ctx.items().length ? (exp ? exp + " истекло · " : "") + soon + " скоро истекает" : "нет записей";
        }
        return next ? "ближайшее: " + next.title : (ctx.items().length ? "все события прошли" : "нет событий");
      },
      tick: function (ctx, now) {
        var cfg = ctx.config(), expiry = cfg.mode === "expiry";
        Array.prototype.forEach.call(ctx.list.querySelectorAll(".cd"), function (c) {
          var left = +c.getAttribute("data-at") - now;
          if (expiry) {
            setTxt(c, left > 0 ? "ещё " + humanCd(left) : "истёк");
            c.parentNode.classList.toggle("exp-crit", left <= 7 * D);
            c.parentNode.classList.toggle("exp-warn", left > 7 * D && left <= cfg.warnDays * D);
          } else {
            setTxt(c, left > 0 ? humanCd(left) : "прошло");
            c.parentNode.classList.toggle("past", left <= 0);
          }
        });
      },
      settings: function (ctx) {
        var cfg = ctx.config();
        var el = h('<div class="bset"><label>Режим <select><option value="event">события</option><option value="expiry">сроки годности / гарантии</option></select></label>' +
          '<label>Предупреждать за, дней <input type="number" min="1" step="1"></label><button class="tbtn" type="button">Сохранить</button></div>');
        var sel = el.querySelector("select"), inp = el.querySelector("input");
        sel.value = cfg.mode; inp.value = cfg.warnDays;
        el.querySelector("button").addEventListener("click", function () { ctx.setConfig({ mode: sel.value, warnDays: Math.max(1, +inp.value || 30) }); });
        return el;
      }
    },

    expenses: {
      label: "Расходы",
      empty: function () { return { limit: 0, items: [] }; },
      mount: function (ctx) {
        var n = new Date();
        ctx.month = new Date(n.getFullYear(), n.getMonth(), 1).getTime();
        var nav = h('<div class="ex-nav"><button class="ebtn" type="button" aria-label="Предыдущий месяц">‹</button>' +
          '<span class="ex-month"></span><button class="ebtn" type="button" aria-label="Следующий месяц">›</button></div>');
        var shift = function (k) {
          var d = new Date(ctx.month);
          ctx.month = new Date(d.getFullYear(), d.getMonth() + k, 1).getTime();
          T.expenses.update(ctx);
        };
        nav.querySelectorAll("button")[0].addEventListener("click", function () { shift(-1); });
        nav.querySelectorAll("button")[1].addEventListener("click", function () { shift(1); });
        ctx.nav = ctx.body.appendChild(nav);
        ctx.summ = ctx.body.appendChild(h('<div class="ex-summ">' +
          '<div class="m-top"><span class="lg mono"></span><label class="ex-limit">лимит <input class="num" type="number" min="0" step="100" placeholder="—" aria-label="Лимит на месяц"></label></div>' +
          '<div class="track"><i></i></div></div>'));
        var lim = ctx.summ.querySelector("input");
        lim.addEventListener("change", function () {
          var v = clone(ctx.items());
          v.limit = Math.max(0, +lim.value || 0);
          ctx.save(v);
        });
        var f = h('<div class="addf">' +
          '<input class="num" type="number" min="0" step="1" placeholder="₽" aria-label="Сумма">' +
          '<input class="grow" type="text" placeholder="Категория" aria-label="Категория" list="' + ctx.id + '-cats">' +
          '<datalist id="' + ctx.id + '-cats"></datalist>' +
          '<button class="addbtn" type="button">Добавить</button></div>');
        var inp = f.querySelectorAll("input");
        var add = function () {
          var amt = +inp[0].value;
          if (!(amt > 0)) return;
          var v = clone(ctx.items()), d = new Date(ctx.month), now = new Date();
          var at = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() ? now.getTime() : d.getTime() + 12 * H;
          v.items = (v.items || []).concat([{ id: newId(), amt: amt, cat: inp[1].value.trim() || "Другое", at: at }]);
          ctx.save(v);
          inp[0].value = ""; inp[1].value = "";
          inp[0].focus();
        };
        f.querySelector("button").addEventListener("click", add);
        onEnter(inp[0], add); onEnter(inp[1], add);
        ctx.cats = f.querySelector("datalist");
        ctx.body.appendChild(f);
        ctx.chart = ctx.body.appendChild(h('<div class="ex-chart"></div>'));
        ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
      },
      update: function (ctx) {
        var v = ctx.items(), d = new Date(ctx.month);
        setTxt(ctx.nav.querySelector(".ex-month"), MONTHS_FULL[d.getMonth()] + " " + d.getFullYear());
        var mine = monthItems(v, ctx.month), total = 0, byCat = {}, allCats = {};
        (v.items || []).forEach(function (x) { allCats[x.cat] = true; });
        DEFAULT_CATS.forEach(function (c) { allCats[c] = true; });
        ctx.cats.innerHTML = Object.keys(allCats).map(function (c) { return '<option value="' + esc(c) + '">'; }).join("");
        mine.forEach(function (x) { total += x.amt; byCat[x.cat] = (byCat[x.cat] || 0) + x.amt; });

        var lim = ctx.summ.querySelector("input");
        if (document.activeElement !== lim) lim.value = v.limit || "";
        setTxt(ctx.summ.querySelector(".lg"), money(total));
        ctx.summ.querySelector(".track > i").style.width = (v.limit ? Math.min(100, total / v.limit * 100) : 0) + "%";
        ctx.summ.querySelector(".track").hidden = !v.limit;
        ctx.summ.classList.toggle("over", !!v.limit && total > v.limit);

        var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; }), max = cats.length ? byCat[cats[0]] : 0;
        ctx.chart.innerHTML = cats.map(function (c) {
          return '<div class="ex-bar"><span class="ex-cat">' + esc(c) + '</span><span class="ex-track"><i style="width:' + (byCat[c] / max * 100).toFixed(1) + '%"></i></span>' +
            '<span class="ex-val mono">' + money(byCat[c]) + "</span></div>";
        }).join("");

        var list = ctx.list;
        list.innerHTML = "";
        if (!mine.length) emptyRow(list, "Трат за месяц нет");
        mine.slice().sort(function (a, b) { return b.at - a.at; }).forEach(function (x) {
          var dt = new Date(x.at);
          var r = h('<div class="row ex"><div class="note mono">' + pad(dt.getDate()) + "." + pad(dt.getMonth() + 1) + "</div>" +
            '<div class="nm">' + esc(x.cat) + '</div><div class="amt">' + money(x.amt) + "</div></div>");
          r.appendChild(rowX(function () {
            var nv = clone(ctx.items());
            nv.items = (nv.items || []).filter(function (y) { return y.id !== x.id; });
            ctx.save(nv);
          }));
          list.appendChild(r);
        });
      },
      sub: function (ctx) {
        var n = new Date(), v = ctx.items(), t = 0;
        monthItems(v, new Date(n.getFullYear(), n.getMonth(), 1).getTime()).forEach(function (x) { t += x.amt; });
        return money(t) + " в этом месяце" + (v.limit ? " · лимит " + money(v.limit) : "");
      }
    },

    table: {
      label: "Таблица",
      empty: function () { return { cols: ["Колонка 1", "Колонка 2"], rows: [] }; },
      mount: function (ctx) {
        ctx.wrap = ctx.body.appendChild(h('<div class="tbl-wrap"><table class="tbl"><thead></thead><tbody></tbody></table></div>'));
        var bar = h('<div class="tbl-tools">' +
          '<button class="tbtn" type="button">+ строка</button>' +
          '<button class="tbtn" type="button">+ столбец</button>' +
          '<button class="tbtn" type="button">− столбец</button></div>');
        var b = bar.querySelectorAll("button");
        b[0].addEventListener("click", function () {
          var v = clone(ctx.items());
          v.rows.push({ id: newId(), cells: v.cols.map(function () { return ""; }) });
          ctx.save(v);
        });
        b[1].addEventListener("click", function () {
          var v = clone(ctx.items());
          if (v.cols.length >= 8) { toast("Не больше 8 столбцов"); return; }
          v.cols.push("Колонка " + (v.cols.length + 1));
          v.rows.forEach(function (r) { r.cells.push(""); });
          ctx.save(v);
        });
        b[2].addEventListener("click", function () {
          var v = clone(ctx.items());
          if (v.cols.length <= 1) return;
          var last = v.cols.length - 1;
          if (v.rows.some(function (r) { return (r.cells[last] || "").trim(); }) &&
              !window.confirm("Удалить столбец «" + v.cols[last] + "» вместе с данными?")) return;
          v.cols.pop();
          v.rows.forEach(function (r) { r.cells.length = v.cols.length; });
          ctx.save(v);
        });
        ctx.body.appendChild(bar);

        // Cells save on blur; Enter finishes editing.
        ctx.wrap.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); }
        });
        ctx.wrap.addEventListener("focusout", function (e) {
          var el = e.target;
          if (!el.isContentEditable) return;
          var v = clone(ctx.items()), val = el.textContent.trim(), c = +el.getAttribute("data-c");
          if (el.tagName === "TH") {
            if (v.cols[c] === val) return;
            v.cols[c] = val || "Колонка " + (c + 1);
          } else {
            var row = v.rows.filter(function (r) { return r.id === el.getAttribute("data-r"); })[0];
            if (!row || (row.cells[c] || "") === val) return;
            row.cells[c] = val;
          }
          ctx.save(v);
        });
      },
      update: function (ctx) {
        if (ctx.wrap.contains(document.activeElement)) { ctx.dirty = true; return; }
        var v = ctx.items();
        ctx.wrap.querySelector("thead").innerHTML = "<tr>" + v.cols.map(function (c, i) {
          return '<th contenteditable="true" data-c="' + i + '">' + esc(c) + "</th>";
        }).join("") + '<th class="tbl-x"></th></tr>';
        var tb = ctx.wrap.querySelector("tbody");
        tb.innerHTML = "";
        v.rows.forEach(function (r) {
          var tr = h("<table><tbody><tr>" + v.cols.map(function (_, i) {
            return '<td contenteditable="true" data-r="' + esc(r.id) + '" data-c="' + i + '">' + esc(r.cells[i] || "") + "</td>";
          }).join("") + '<td class="tbl-x"></td></tr></tbody></table>').querySelector("tr");
          tr.lastChild.appendChild(rowX(function () {
            var nv = clone(ctx.items());
            nv.rows = nv.rows.filter(function (x) { return x.id !== r.id; });
            ctx.save(nv);
          }));
          tb.appendChild(tr);
        });
        if (!v.rows.length) {
          tb.appendChild(h('<table><tbody><tr><td class="empty" colspan="' + (v.cols.length + 1) + '">Пока пусто — нажмите «+ строка»</td></tr></tbody></table>').querySelector("tr"));
        }
      },
      sub: function (ctx) { var v = ctx.items(); return v.rows.length ? v.rows.length + " " + plural(v.rows.length, "строка", "строки", "строк") + " · " + v.cols.length + " " + plural(v.cols.length, "столбец", "столбца", "столбцов") : "пусто"; },
      tick: function (ctx) {
        if (ctx.dirty && !ctx.wrap.contains(document.activeElement)) { ctx.dirty = false; T.table.update(ctx); }
      }
    }
  };
  var DEFAULT_CATS = ["Еда", "Транспорт", "Развлечения", "Покупки", "Связь", "Здоровье", "Другое"];
  function lessonsOf(ctx, day) {
    return ((ctx.items().days || {})[day] || []).slice().sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
  }
  function monthItems(v, monthStart) {
    var d = new Date(monthStart), end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    return (v.items || []).filter(function (x) { return x.at >= monthStart && x.at < end; });
  }

  /* ---------- reminders / calendar / today / stats ---------- */

  var tomorrowKey = function (now) { return dayKey(u.addDays(now, 1)); };

  T.deadlines.reminders = function (items, b, now) {
    var out = [];
    items.forEach(function (t) {
      if (t.done) return;
      var left = t.due - now, key = t.id + ":" + t.due + ":";
      if (left <= 0 && left > -D) out.push({ key: key + "over", text: "Просрочено: " + t.title });
      else if (left > 0 && left <= H) out.push({ key: key + "1h", text: "Меньше часа: " + t.title });
      else if (left > H && left <= D) out.push({ key: key + "24h", text: "Срок сегодня-завтра: " + t.title });
    });
    return out;
  };
  T.deadlines.dates = function (items) { return items.filter(function (t) { return !t.done; }).map(function (t) { return { at: t.due, title: t.title }; }); };
  T.deadlines.today = function (items, b, now) {
    return items.filter(function (t) { return !t.done && t.due < now + D; }).map(function (t) { return (t.due < now ? "просрочено: " : "до завтра: ") + t.title; });
  };
  T.deadlines.stats = function (items, b, ws) {
    var n = items.filter(function (t) { return t.done && t.doneAt >= ws; }).length;
    return [{ label: "закрыто задач", value: n }];
  };

  T.habits.reminders = function (items, b, now) {
    var d = new Date(now), today = dayKey(d);
    if (d.getHours() < 20 || !items.length) return [];
    var left = items.filter(function (x) { return !(x.log && x.log[today]); });
    return left.length ? [{ key: "habits:" + today, text: "Привычки на сегодня: " + left.map(function (x) { return x.name; }).join(", ") }] : [];
  };
  T.habits.today = function (items, b, now) {
    var today = dayKey(now), left = items.filter(function (x) { return !(x.log && x.log[today]); });
    return left.length ? ["не отмечено: " + left.map(function (x) { return (x.emo ? x.emo + " " : "") + x.name; }).join(", ")] : [];
  };
  T.habits.stats = function (items, b, ws, now) {
    var done = 0, days = Math.floor((u.startOfDay(now) - ws) / D) + 1;
    items.forEach(function (x) { for (var i = 0; i < days; i++) if (x.log && x.log[dayKey(u.addDays(ws, i))]) done++; });
    return items.length ? [{ label: "отметок привычек", value: done + " из " + items.length * days }] : [];
  };

  T.payments.reminders = function (items, b, now) {
    if (new Date(now).getHours() < 9) return [];
    var out = [], today = dayKey(now), tmr = tomorrowKey(now);
    items.forEach(function (x) {
      if (x.paid) return;
      var dk = dayKey(x.due), key = x.id + ":" + x.due + ":";
      if (dk === today) out.push({ key: key + "day", text: "Оплатить сегодня: " + x.name + " · " + money(x.amt) });
      else if (dk === tmr) out.push({ key: key + "pre", text: "Завтра платёж: " + x.name + " · " + money(x.amt) });
    });
    return out;
  };
  T.payments.dates = function (items) { return items.filter(function (x) { return !x.paid; }).map(function (x) { return { at: x.due, title: x.name + " · " + money(x.amt) }; }); };
  T.payments.today = function (items, b, now) {
    var tmr = tomorrowKey(now);
    return items.filter(function (x) { return !x.paid && (x.due < now || dayKey(x.due) === dayKey(now) || dayKey(x.due) === tmr); })
      .map(function (x) { return "оплатить " + (dayKey(x.due) === tmr ? "завтра" : "сегодня") + ": " + x.name + " · " + money(x.amt); });
  };

  T.checklist.stats = function (items, b, ws) {
    var n = items.filter(function (t) { return t.done && t.doneAt >= ws; }).length;
    return n ? [{ label: "пунктов отмечено", value: n }] : [];
  };

  T.schedule.today = function (items, b, now) {
    var d = new Date(now), m = d.getHours() * 60 + d.getMinutes();
    var ls = ((items.days || {})[String(d.getDay())] || []).filter(function (l) { return toMin(l.end) > m; })
      .sort(function (a, c) { return toMin(a.start) - toMin(c.start); });
    return ls.map(function (l) { return l.start + "–" + l.end + " " + l.title + (l.room ? " (" + l.room + ")" : ""); });
  };

  T.countdown.reminders = function (items, b, now) {
    var out = [], today = dayKey(now), cfg = b.config || {};
    items.forEach(function (e) {
      if (cfg.mode === "expiry") {
        var left = e.at - now;
        if (left <= 0 && left > -D) out.push({ key: e.id + ":" + e.at + ":exp", text: "Истёк срок: " + e.title });
        else if (left > 0 && left <= 7 * D) out.push({ key: e.id + ":" + e.at + ":7d", text: "Скоро истекает: " + e.title + " (" + u.shortDate(e.at) + ")" });
      } else if (dayKey(e.at) === today && e.at > now - D) out.push({ key: e.id + ":" + e.at + ":day", text: "Сегодня: " + e.title });
    });
    return out;
  };
  T.countdown.dates = function (items) { return items.map(function (e) { return { at: e.at, title: e.title }; }); };
  T.countdown.today = function (items, b, now) {
    var cfg = b.config || {};
    if (cfg.mode === "expiry") return items.filter(function (e) { return e.at - now < 7 * D; }).map(function (e) { return (e.at <= now ? "истёк: " : "истекает " + u.shortDate(e.at) + ": ") + e.title; });
    return items.filter(function (e) { return dayKey(e.at) === dayKey(now); }).map(function (e) { return "сегодня: " + e.title; });
  };

  T.expenses.stats = function (items, b, ws) {
    var t = 0;
    (items.items || []).forEach(function (x) { if (x.at >= ws) t += x.amt; });
    return [{ label: "потрачено", value: money(t) }];
  };
  T.expenses.today = function (items, b, now) {
    var t = 0, sod = u.startOfDay(now);
    (items.items || []).forEach(function (x) { if (x.at >= sod) t += x.amt; });
    return t ? ["потрачено сегодня " + money(t)] : [];
  };

  /* ---------- presets for the "new block" menu ---------- */

  [
    { group: "Задачи и время", type: "deadlines", title: "Дедлайны", desc: "Задачи со сроком: подсветка срочных и просроченных, напоминания.", wide: true },
    { group: "Задачи и время", type: "checklist", title: "Чек-лист", desc: "Пункты с галочкой." },
    { group: "Задачи и время", type: "list", title: "Список", desc: "Простой список: название и крестик." },
    { group: "Задачи и время", type: "countdown", title: "Обратный отсчёт", desc: "Сколько осталось до события." },
    { group: "Учёба", type: "schedule", title: "Расписание пар", desc: "Пары по дням недели, подсветка текущей и следующей.", wide: true },
    { group: "Здоровье и привычки", type: "habits", title: "Привычки", desc: "Отметка за день, последние 7 дней и серия." },
    { group: "Деньги", type: "payments", title: "Платежи и подписки", desc: "Сроки оплаты; подписки «каждый месяц/год» сами переходят на следующий период." },
    { group: "Деньги", type: "expenses", title: "Расходы за месяц", desc: "Траты по категориям, лимит и диаграмма." },
    { group: "Дом и быт", type: "countdown", title: "Сроки годности и гарантии", desc: "Предупреждает, когда срок подходит к концу.", config: { mode: "expiry", warnDays: 30 } },
    { group: "Личное", type: "list", title: "Посмотреть", desc: "Фильмы и сериалы, которые хочется посмотреть." },
    { group: "Инструменты", type: "note", title: "Заметка", desc: "Свободный текст, сохраняется сам." },
    { group: "Инструменты", type: "table", title: "Таблица", desc: "Редактируемая таблица до 8 столбцов.", wide: true }
  ].forEach(Pult.preset);

  Object.keys(T).forEach(function (k) { Pult.register(k, T[k]); });
})();
