// Personal & planning: media tracker, quote of the day, goals, kanban, flashcards.
(function () {
  "use strict";
  var u = Pult.util;
  var D = u.D, MIN = u.MIN, h = u.h, esc = u.esc, clone = u.clone, newId = u.newId, setTxt = u.setTxt, rowX = u.rowX,
    emptyRow = u.emptyRow, plural = u.plural, dayKey = u.dayKey, num = u.num;

  /* =============================== media =============================== */

  var STATUS = [{ k: "want", l: "Хочу" }, { k: "doing", l: "В процессе" }, { k: "done", l: "Готово" }];
  var KINDS = ["Фильм", "Сериал", "Книга", "Игра", "Аниме", "Подкаст"];

  Pult.register("media", {
    label: "Книги, фильмы, игры",
    empty: function () { return []; },
    mount: function (ctx) {
      ctx.filter = "want";
      ctx.body.appendChild(u.form([
        { key: "title", placeholder: "Название", cls: "grow", required: true },
        { key: "kind", type: "select", placeholder: "Тип", options: KINDS },
        { key: "status", type: "select", placeholder: "Статус", options: STATUS.map(function (s) { return { value: s.k, label: s.l }; }) }
      ], function (v) { ctx.add({ title: v.title, kind: v.kind, status: v.status, rating: 0, at: Date.now() }); ctx.filter = v.status; }));
      ctx.tabs = ctx.body.appendChild(h('<div class="seg">' + STATUS.map(function (s) { return '<button type="button" data-k="' + s.k + '"></button>'; }).join("") + "</div>"));
      ctx.tabs.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (b) { ctx.filter = b.getAttribute("data-k"); Pult.types.media.update(ctx); }
      });
      ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
    },
    update: function (ctx) {
      var all = ctx.items();
      Array.prototype.forEach.call(ctx.tabs.children, function (b) {
        var k = b.getAttribute("data-k"), n = all.filter(function (x) { return x.status === k; }).length;
        b.textContent = STATUS.filter(function (s) { return s.k === k; })[0].l + (n ? " · " + n : "");
        b.classList.toggle("on", k === ctx.filter);
      });
      var items = all.filter(function (x) { return x.status === ctx.filter; }).sort(function (a, b) { return (b.rating || 0) - (a.rating || 0) || b.at - a.at; });
      var list = ctx.list;
      list.innerHTML = "";
      if (!items.length) emptyRow(list);
      items.forEach(function (x) {
        var stars = "";
        for (var i = 1; i <= 5; i++) stars += '<button type="button" class="star' + (i <= (x.rating || 0) ? " on" : "") + '" data-r="' + i + '" aria-label="Оценка ' + i + '">★</button>';
        var idx = STATUS.map(function (s) { return s.k; }).indexOf(x.status), next = STATUS[(idx + 1) % 3];
        var r = h('<div class="row md"><div><div class="nm">' + esc(x.title) + '</div><div class="note">' + esc(x.kind || "") + "</div></div>" +
          '<div class="stars">' + stars + '</div><button class="tbtn md-next" type="button" title="Перенести">→ ' + esc(next.l) + "</button></div>");
        r.querySelector(".stars").addEventListener("click", function (e) {
          var s = e.target.closest(".star");
          if (s) { var v = +s.getAttribute("data-r"); ctx.patch(x.id, { rating: v === x.rating ? 0 : v }); }
        });
        r.querySelector(".md-next").addEventListener("click", function () { ctx.patch(x.id, { status: next.k }); });
        r.appendChild(rowX(function () { ctx.remove(x.id); }));
        list.appendChild(r);
      });
    },
    sub: function (ctx) {
      var a = ctx.items(), w = a.filter(function (x) { return x.status === "want"; }).length, d = a.filter(function (x) { return x.status === "done"; }).length;
      return a.length ? "в планах " + w + " · готово " + d : "пусто";
    }
  });

  /* =============================== quote =============================== */

  Pult.register("quote", {
    label: "Фраза дня",
    empty: function () { return []; },
    mount: function (ctx) {
      ctx.q = ctx.body.appendChild(h('<blockquote class="qd"><p></p><cite></cite></blockquote>'));
      var more = h('<details class="rp-arch"><summary>Все фразы</summary></details>');
      more.appendChild(u.form([
        { key: "text", placeholder: "Фраза", cls: "grow", required: true },
        { key: "author", placeholder: "Автор", cls: "subj-in" }
      ], function (v) { ctx.add({ text: v.text, author: v.author }); }));
      ctx.list = more.appendChild(h('<div class="listwrap"></div>'));
      ctx.more = ctx.body.appendChild(more);
    },
    update: function (ctx) {
      var a = ctx.items();
      if (!a.length) {
        setTxt(ctx.q.querySelector("p"), "Добавьте свои любимые фразы — каждый день будет показываться одна из них.");
        setTxt(ctx.q.querySelector("cite"), "");
        ctx.more.open = true;
      } else {
        var x = a[u.hash(dayKey(new Date()) + ctx.id) % a.length];
        setTxt(ctx.q.querySelector("p"), x.text);
        setTxt(ctx.q.querySelector("cite"), x.author ? "— " + x.author : "");
      }
      ctx.more.querySelector("summary").textContent = "Все фразы (" + a.length + ")";
      var list = ctx.list;
      list.innerHTML = "";
      a.forEach(function (x) {
        var r = h('<div class="row mv"><div class="nm">' + esc(x.text) + (x.author ? ' <span class="note">— ' + esc(x.author) + "</span>" : "") + "</div></div>");
        r.appendChild(rowX(function () { ctx.remove(x.id); }));
        list.appendChild(r);
      });
    },
    sub: function (ctx) { var n = ctx.items().length; return n ? n + " " + plural(n, "фраза", "фразы", "фраз") : "пусто"; },
    tick: function (ctx, now) { var k = dayKey(now); if (ctx.dayShown !== k) { ctx.dayShown = k; Pult.types.quote.update(ctx); } }
  });

  /* =============================== goals =============================== */
  // goal: {id, title, target, current, unit, subs:[{id,title,done}], deadline}

  function goalPct(g) {
    if (g.subs && g.subs.length) return g.subs.filter(function (s) { return s.done; }).length / g.subs.length;
    if (g.target) return Math.min(1, (g.current || 0) / g.target);
    return g.done ? 1 : 0;
  }

  Pult.register("goals", {
    label: "Цели",
    empty: function () { return []; },
    mount: function (ctx) {
      ctx.body.appendChild(u.form([
        { key: "title", placeholder: "Цель", cls: "grow", required: true },
        { key: "target", type: "number", placeholder: "Число (необяз.)", cls: "num", min: 0 },
        { key: "unit", placeholder: "Ед.", cls: "num-s" },
        { key: "deadline", type: "date", placeholder: "Срок" }
      ], function (v) {
        ctx.add({ title: v.title, target: v.target || 0, current: 0, unit: v.unit, deadline: v.deadline ? u.parseDue(v.deadline) : 0, subs: [] });
      }));
      ctx.list = ctx.body.appendChild(h('<div class="goals"></div>'));
    },
    update: function (ctx) {
      var list = ctx.list, items = ctx.items().slice().sort(function (a, b) { return goalPct(a) - goalPct(b); });
      var open = {};
      Array.prototype.forEach.call(list.querySelectorAll("details[open]"), function (d) { open[d.getAttribute("data-id")] = 1; });
      list.innerHTML = "";
      if (!items.length) emptyRow(list, "Поставьте первую цель");
      items.forEach(function (g) {
        var pct = goalPct(g), subs = g.subs || [];
        var card = h('<details class="goal' + (pct >= 1 ? " done" : "") + '" data-id="' + esc(g.id) + '">' +
          '<summary><span class="nm">' + esc(g.title) + '</span><span class="mono goal-p">' +
          (subs.length ? subs.filter(function (s) { return s.done; }).length + "/" + subs.length : g.target ? num(g.current || 0) + "/" + num(g.target) + (g.unit ? " " + esc(g.unit) : "") : Math.round(pct * 100) + "%") +
          '</span><span class="track"><i style="width:' + (pct * 100).toFixed(1) + '%"></i></span>' +
          (g.deadline ? '<span class="note">до ' + u.shortDate(g.deadline) + "</span>" : "") + "</summary>" +
          '<div class="goal-body"></div></details>');
        if (open[g.id]) card.open = true;
        var body = card.querySelector(".goal-body");
        if (g.target && !subs.length) {
          var stepper = h('<div class="goal-step"><button class="ctr-btn sm" type="button">−</button><input class="num" type="number" step="any" aria-label="Текущее значение"><button class="ctr-btn sm plus" type="button">+</button></div>');
          var inp = stepper.querySelector("input");
          inp.value = g.current || 0;
          stepper.querySelectorAll("button")[0].addEventListener("click", function () { ctx.patch(g.id, { current: Math.max(0, (g.current || 0) - 1) }); });
          stepper.querySelectorAll("button")[1].addEventListener("click", function () { ctx.patch(g.id, { current: (g.current || 0) + 1 }); });
          inp.addEventListener("change", function () { ctx.patch(g.id, { current: Math.max(0, +inp.value || 0) }); });
          body.appendChild(stepper);
        }
        subs.forEach(function (s) {
          var r = h('<div class="row ck' + (s.done ? " done" : "") + '"><div class="box" role="button" tabindex="0" aria-label="Готово">' + (s.done ? "✓" : "") + '</div><div class="tt">' + esc(s.title) + "</div></div>");
          u.onActivate(r.querySelector(".box"), function () {
            ctx.patch(g.id, { subs: subs.map(function (x) { return x.id === s.id ? { id: x.id, title: x.title, done: !x.done } : x; }) });
          });
          r.appendChild(rowX(function () { ctx.patch(g.id, { subs: subs.filter(function (x) { return x.id !== s.id; }) }); }));
          body.appendChild(r);
        });
        body.appendChild(u.form([{ key: "t", placeholder: "Подзадача", cls: "grow", required: true }], function (v) {
          ctx.patch(g.id, { subs: subs.concat([{ id: newId(), title: v.t, done: false }]) });
        }, "+ шаг"));
        var del = h('<button class="linkbtn danger" type="button">Удалить цель</button>');
        del.addEventListener("click", function () { if (window.confirm("Удалить цель «" + g.title + "»?")) ctx.remove(g.id); });
        body.appendChild(del);
        list.appendChild(card);
      });
    },
    sub: function (ctx) {
      var a = ctx.items(), d = a.filter(function (g) { return goalPct(g) >= 1; }).length;
      return a.length ? "достигнуто " + d + " из " + a.length : "нет целей";
    },
    dates: function (items) { return items.filter(function (g) { return g.deadline && goalPct(g) < 1; }).map(function (g) { return { at: g.deadline, title: "Цель: " + g.title }; }); }
  });

  /* =============================== kanban =============================== */

  Pult.register("kanban", {
    label: "Канбан",
    defaults: { cols: ["Надо", "В работе", "Готово"] },
    empty: function () { return []; },
    mount: function (ctx) {
      var cfg = ctx.config();
      ctx.body.appendChild(u.form([{ key: "title", placeholder: "Новая задача", cls: "grow", required: true }], function (v) {
        ctx.add({ title: v.title, col: 0, at: Date.now() });
      }));
      ctx.board = ctx.body.appendChild(h('<div class="kb" style="--kb-cols:' + cfg.cols.length + '"></div>'));
    },
    update: function (ctx) {
      var cfg = ctx.config(), items = ctx.items(), board = ctx.board, last = cfg.cols.length - 1;
      board.innerHTML = "";
      cfg.cols.forEach(function (name, ci) {
        var cards = items.filter(function (x) { return Math.min(x.col || 0, last) === ci; });
        var col = h('<div class="kb-col"><div class="kb-h"><span>' + esc(name) + '</span><span class="mono">' + cards.length + "</span></div></div>");
        cards.forEach(function (x) {
          var c = h('<div class="kb-card' + (ci === last ? " done" : "") + '"><div class="tt">' + esc(x.title) + '</div><div class="kb-act">' +
            (ci > 0 ? '<button class="ebtn" type="button" aria-label="Влево">←</button>' : "") +
            (ci < last ? '<button class="ebtn" type="button" aria-label="Вправо">→</button>' : "") + "</div></div>");
          var bs = c.querySelectorAll(".kb-act .ebtn");
          Array.prototype.forEach.call(bs, function (b) {
            b.addEventListener("click", function () {
              var to = ci + (b.getAttribute("aria-label") === "Влево" ? -1 : 1);
              ctx.patch(x.id, { col: to, doneAt: to === last ? Date.now() : null });
            });
          });
          c.querySelector(".kb-act").appendChild(rowX(function () { ctx.remove(x.id); }));
          col.appendChild(c);
        });
        board.appendChild(col);
      });
    },
    sub: function (ctx) {
      var cfg = ctx.config(), a = ctx.items(), last = cfg.cols.length - 1;
      var inWork = a.filter(function (x) { return (x.col || 0) > 0 && (x.col || 0) < last; }).length;
      return a.length ? "в работе " + inWork + " · всего " + a.length : "пусто";
    },
    stats: function (items, b, ws) {
      var n = items.filter(function (x) { return x.doneAt && x.doneAt >= ws; }).length;
      return n ? [{ label: "карточек готово", value: n }] : [];
    },
    settings: function (ctx) {
      var inp = h('<input type="text" class="w-l">');
      inp.value = ctx.config().cols.join(", ");
      var el = h('<div class="bset"><label>Колонки через запятую </label><button class="tbtn" type="button">Сохранить</button></div>');
      el.querySelector("label").appendChild(inp);
      el.querySelector("button").addEventListener("click", function () {
        var cols = inp.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 6);
        if (cols.length < 2) { u.toast("Нужно хотя бы 2 колонки"); return; }
        ctx.setConfig({ cols: cols });
      });
      return el;
    }
  });

  /* =============================== flashcards =============================== */
  // Leitner boxes: a remembered card moves to the next box and comes back later.

  var BOX_DAYS = [0, 1, 3, 7, 14, 30, 60];

  Pult.register("flashcards", {
    label: "Карточки",
    empty: function () { return []; },
    mount: function (ctx) {
      ctx.review = ctx.body.appendChild(h('<div class="fc"></div>'));
      var more = h('<details class="rp-arch"><summary>Все карточки</summary></details>');
      more.appendChild(u.form([
        { key: "front", placeholder: "Вопрос / слово", cls: "grow", required: true },
        { key: "back", placeholder: "Ответ / перевод", cls: "grow", required: true }
      ], function (v) { ctx.add({ front: v.front, back: v.back, box: 0, due: Date.now() }); }));
      ctx.list = more.appendChild(h('<div class="listwrap"></div>'));
      ctx.more = ctx.body.appendChild(more);
    },
    due: function (ctx) { var now = Date.now(); return ctx.items().filter(function (c) { return (c.due || 0) <= now; }); },
    update: function (ctx) {
      var all = ctx.items(), due = Pult.types.flashcards.due(ctx), fc = ctx.review;
      fc.innerHTML = "";
      if (!all.length) { fc.appendChild(h('<div class="empty">Добавьте карточки ниже — блок будет показывать те, что пора повторить.</div>')); ctx.more.open = true; }
      else if (!due.length) fc.appendChild(h('<div class="fc-done">На сегодня всё повторено ✓</div>'));
      else {
        var c = due[0];
        var card = h('<div class="fc-card"><div class="fc-front"></div><div class="fc-back" hidden></div>' +
          '<div class="fc-act"><button class="addbtn" type="button">Показать ответ</button></div><div class="note fc-left"></div></div>');
        card.querySelector(".fc-front").textContent = c.front;
        card.querySelector(".fc-back").textContent = c.back;
        card.querySelector(".fc-left").textContent = "осталось " + due.length;
        var act = card.querySelector(".fc-act");
        act.querySelector("button").addEventListener("click", function () {
          card.querySelector(".fc-back").hidden = false;
          act.innerHTML = '<button class="tbtn fc-no" type="button">Не помню</button><button class="addbtn" type="button">Помню</button>';
          act.querySelector(".fc-no").addEventListener("click", function () { ctx.patch(c.id, { box: 0, due: Date.now() + 10 * MIN }); });
          act.querySelector(".addbtn").addEventListener("click", function () {
            var box = Math.min(BOX_DAYS.length - 1, (c.box || 0) + 1);
            ctx.patch(c.id, { box: box, due: u.startOfDay(u.addDays(Date.now(), BOX_DAYS[box])) + 4 * 3600000 });
          });
        });
        fc.appendChild(card);
      }
      ctx.more.querySelector("summary").textContent = "Все карточки (" + all.length + ")";
      var list = ctx.list;
      list.innerHTML = "";
      all.forEach(function (c) {
        var r = h('<div class="row mv"><div class="nm">' + esc(c.front) + ' <span class="note">— ' + esc(c.back) + " · ур. " + (c.box || 0) + "</span></div></div>");
        r.appendChild(rowX(function () { ctx.remove(c.id); }));
        list.appendChild(r);
      });
    },
    sub: function (ctx) {
      var n = Pult.types.flashcards.due(ctx).length, all = ctx.items().length;
      return all ? (n ? "повторить: " + n : "всё повторено") + " · всего " + all : "нет карточек";
    },
    tick: function (ctx, now) {
      // cards become due over time
      var n = Pult.types.flashcards.due(ctx).length;
      if (ctx.dueShown !== n && !ctx.review.querySelector(".fc-back:not([hidden])")) { ctx.dueShown = n; Pult.types.flashcards.update(ctx); }
    },
    reminders: function (items, b, now) {
      if (new Date(now).getHours() < 18) return [];
      var n = items.filter(function (c) { return (c.due || 0) <= now; }).length;
      return n >= 5 ? [{ key: "fc:" + dayKey(now), text: "Пора повторить карточки: " + n }] : [];
    },
    today: function (items, b, now) {
      var n = items.filter(function (c) { return (c.due || 0) <= now; }).length;
      return n ? ["повторить карточек: " + n] : [];
    }
  });

  [
    { group: "Личное", type: "media", title: "Книги, фильмы, игры", desc: "Хочу / в процессе / готово и оценка 1–5.", wide: true },
    { group: "Личное", type: "quote", title: "Фраза дня", desc: "Ваш список фраз, каждый день — новая." },
    { group: "Личное", type: "goals", title: "Цели на год", desc: "Крупные цели с подзадачами или числовым прогрессом." },
    { group: "Задачи и время", type: "goals", title: "Цели с прогрессом", desc: "«Прочитать 20 книг: 7/20» — полоса прогресса." },
    { group: "Задачи и время", type: "kanban", title: "Канбан", desc: "Колонки «Надо / В работе / Готово».", wide: true },
    { group: "Учёба", type: "flashcards", title: "Карточки для запоминания", desc: "Слова и термины с интервальным повторением." }
  ].forEach(Pult.preset);
})();
