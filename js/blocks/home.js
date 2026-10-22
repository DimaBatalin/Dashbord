// Home: shopping list by category, weekly menu that fills the shopping list.
(function () {
  "use strict";
  var u = Pult.util;
  var h = u.h, esc = u.esc, clone = u.clone, newId = u.newId, setTxt = u.setTxt, rowX = u.rowX, emptyRow = u.emptyRow;

  var SHOP_CATS = ["Продукты", "Овощи и фрукты", "Молочное", "Мясо и рыба", "Бытовая химия", "Аптека", "Для дома", "Другое"];

  /* =============================== shopping =============================== */

  Pult.register("shopping", {
    label: "Покупки",
    empty: function () { return []; },
    mount: function (ctx) {
      ctx.form = u.form([
        { key: "title", placeholder: "Что купить", cls: "grow", required: true },
        { key: "qty", placeholder: "Сколько", cls: "num-s" },
        { key: "cat", placeholder: "Категория", cls: "subj-in", list: true, keep: true }
      ], function (v) { ctx.add({ title: v.title, qty: v.qty, cat: v.cat || "Другое", done: false }); });
      ctx.body.appendChild(ctx.form);
      ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
      var clear = h('<button class="linkbtn" type="button">Убрать купленное</button>');
      clear.addEventListener("click", function () { ctx.save(ctx.items().filter(function (x) { return !x.done; })); });
      ctx.clear = ctx.body.appendChild(clear);
    },
    update: function (ctx) {
      var items = ctx.items(), cats = {};
      SHOP_CATS.forEach(function (c) { cats[c] = 1; });
      items.forEach(function (x) { cats[x.cat] = 1; });
      ctx.form.setList("cat", Object.keys(cats));
      var groups = {};
      items.forEach(function (x) { (groups[x.cat || "Другое"] = groups[x.cat || "Другое"] || []).push(x); });
      var order = Object.keys(groups).sort(function (a, b) {
        var ia = SHOP_CATS.indexOf(a), ib = SHOP_CATS.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      });
      var list = ctx.list;
      list.innerHTML = "";
      if (!items.length) emptyRow(list, "Список пуст");
      order.forEach(function (c) {
        var g = groups[c].slice().sort(function (a, b) { return a.done - b.done; });
        list.appendChild(h('<div class="day-h"><span>' + esc(c) + '</span><span class="mono">' + g.filter(function (x) { return !x.done; }).length + "</span></div>"));
        g.forEach(function (x) {
          var r = h('<div class="row ck' + (x.done ? " done" : "") + '"><div class="box" role="button" tabindex="0" aria-label="Куплено">' + (x.done ? "✓" : "") + "</div>" +
            '<div class="tt">' + esc(x.title) + (x.qty ? ' <span class="note">· ' + esc(x.qty) + "</span>" : "") + "</div></div>");
          u.onActivate(r.querySelector(".box"), function () { ctx.patch(x.id, { done: !x.done }); });
          r.appendChild(rowX(function () { ctx.remove(x.id); }));
          list.appendChild(r);
        });
      });
      ctx.clear.hidden = !items.some(function (x) { return x.done; });
    },
    sub: function (ctx) {
      var a = ctx.items(), left = a.filter(function (x) { return !x.done; }).length;
      return a.length ? "купить: " + left + " из " + a.length : "пусто";
    }
  });

  /* =============================== menu =============================== */
  // data: { days: { "1": [{id, meal, dish, ingredients}] } }

  var MEALS = ["Завтрак", "Обед", "Ужин", "Перекус"];

  Pult.register("menu", {
    label: "Меню на неделю",
    empty: function () { return { days: {} }; },
    mount: function (ctx) {
      ctx.body.appendChild(u.form([
        { key: "day", type: "select", placeholder: "День", options: [1, 2, 3, 4, 5, 6, 0].map(function (d) { return { value: String(d), label: u.DSHORT[d] }; }) },
        { key: "meal", type: "select", placeholder: "Приём пищи", options: MEALS },
        { key: "dish", placeholder: "Блюдо", cls: "grow", required: true },
        { key: "ingredients", placeholder: "Продукты через запятую", cls: "grow" }
      ], function (v) {
        var x = clone(ctx.items());
        x.days = x.days || {};
        x.days[v.day] = (x.days[v.day] || []).concat([{ id: newId(), meal: v.meal, dish: v.dish, ingredients: v.ingredients }]);
        ctx.save(x);
      }));
      ctx.grid = ctx.body.appendChild(h('<div class="menu-grid"></div>'));
      var tools = h('<div class="tbl-tools"><button class="tbtn" type="button">→ Продукты в «Покупки»</button><button class="tbtn" type="button">Очистить неделю</button></div>');
      tools.querySelectorAll("button")[0].addEventListener("click", function () { Pult.types.menu.toShopping(ctx); });
      tools.querySelectorAll("button")[1].addEventListener("click", function () {
        if (window.confirm("Очистить меню на неделю?")) ctx.save({ days: {} });
      });
      ctx.body.appendChild(tools);
    },
    toShopping: function (ctx) {
      var names = {};
      Object.keys(ctx.items().days || {}).forEach(function (d) {
        (ctx.items().days[d] || []).forEach(function (m) {
          String(m.ingredients || "").split(",").forEach(function (s) { s = s.trim(); if (s) names[s.toLowerCase()] = s; });
        });
      });
      var add = Object.keys(names).map(function (k) { return names[k]; });
      if (!add.length) { u.toast("В меню не указаны продукты"); return; }
      var target = Pult.api.blocksOfType("shopping")[0];
      if (!target) target = Pult.api.addBlock({ type: "shopping", title: "Покупки" });
      var cur = clone(Pult.api.itemsOf(target)) || [], have = {};
      cur.forEach(function (x) { if (!x.done) have[x.title.toLowerCase()] = 1; });
      var fresh = add.filter(function (s) { return !have[s.toLowerCase()]; });
      Pult.api.saveBlock(target.id, cur.concat(fresh.map(function (s) { return { id: newId(), title: s, cat: "Продукты", done: false }; })));
      u.toast(fresh.length ? "Добавлено в «" + target.title + "»: " + fresh.length : "Все продукты уже есть в списке");
    },
    update: function (ctx) {
      var days = ctx.items().days || {}, today = String(new Date().getDay()), grid = ctx.grid;
      grid.innerHTML = "";
      [1, 2, 3, 4, 5, 6, 0].forEach(function (d) {
        var meals = (days[String(d)] || []).slice().sort(function (a, b) { return MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal); });
        var col = h('<div class="menu-day' + (String(d) === today ? " today" : "") + '"><div class="menu-dh">' + u.DSHORT[d] + "</div></div>");
        if (!meals.length) col.appendChild(h('<div class="note">—</div>'));
        meals.forEach(function (m) {
          var r = h('<div class="menu-it"><span class="note">' + esc(m.meal) + '</span><span class="tt" title="' + esc(m.ingredients || "") + '">' + esc(m.dish) + "</span></div>");
          r.appendChild(rowX(function () {
            var x = clone(ctx.items());
            x.days[String(d)] = (x.days[String(d)] || []).filter(function (y) { return y.id !== m.id; });
            ctx.save(x);
          }));
          col.appendChild(r);
        });
        grid.appendChild(col);
      });
    },
    sub: function (ctx) {
      var t = (ctx.items().days || {})[String(new Date().getDay())] || [];
      return t.length ? "сегодня: " + t.map(function (m) { return m.dish; }).join(", ") : "на сегодня ничего не запланировано";
    },
    today: function (items, b, now) {
      var t = (items.days || {})[String(new Date(now).getDay())] || [];
      return t.map(function (m) { return m.meal + ": " + m.dish; });
    }
  });

  [
    { group: "Дом и быт", type: "shopping", title: "Покупки", desc: "Список по категориям: продукты, химия, аптека; купленное уходит вниз." },
    { group: "Дом и быт", type: "menu", title: "Меню на неделю", desc: "Что готовить по дням и кнопка «продукты в покупки».", wide: true }
  ].forEach(Pult.preset);
})();
