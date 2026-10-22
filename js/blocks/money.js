// Money: savings goal, debts, currency rates with a converter.
(function () {
  "use strict";
  var u = Pult.util;
  var D = u.D, H = u.H, h = u.h, esc = u.esc, clone = u.clone, newId = u.newId, money = u.money, num = u.num,
    setTxt = u.setTxt, rowX = u.rowX, emptyRow = u.emptyRow, shortDate = u.shortDate, plural = u.plural;

  /* =============================== savings =============================== */
  // data: { goal, deadline, items: [{id, amt, at, note}] }  (negative amt = withdrawal)

  function saved(v) { return (v.items || []).reduce(function (a, x) { return a + (+x.amt || 0); }, 0); }
  function monthsLeft(deadline, now) {
    var a = new Date(now), b = new Date(deadline);
    return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + (b.getDate() >= a.getDate() ? 0 : -1)) || 0;
  }

  Pult.register("savings", {
    label: "Копилка",
    empty: function () { return { goal: 0, deadline: 0, items: [] }; },
    mount: function (ctx) {
      ctx.top = ctx.body.appendChild(h('<div class="sv">' +
        '<div class="sv-row"><span class="lg mono"></span><span class="sm"></span></div>' +
        '<div class="track"><i></i></div><div class="sm sv-hint"></div></div>'));
      var goalForm = h('<div class="addf sv-goal"><label class="ex-limit">цель <input class="num" type="number" min="0" step="100" placeholder="₽"></label>' +
        '<label class="ex-limit">к дате <input type="date"></label></div>');
      var gi = goalForm.querySelectorAll("input");
      var saveGoal = function () { var v = clone(ctx.items()); v.goal = Math.max(0, +gi[0].value || 0); v.deadline = u.parseDate(gi[1].value) || 0; ctx.save(v); };
      gi[0].addEventListener("change", saveGoal); gi[1].addEventListener("change", saveGoal);
      ctx.goalForm = ctx.body.appendChild(goalForm);
      var f = u.form([
        { key: "amt", type: "number", placeholder: "Сумма ₽", cls: "num", required: true },
        { key: "note", placeholder: "Комментарий", cls: "grow" }
      ], function (v) {
        if (!v.amt) return false;
        var x = clone(ctx.items());
        x.items = (x.items || []).concat([{ id: newId(), amt: v.amt, note: v.note, at: Date.now() }]);
        ctx.save(x);
      }, "Отложить");
      var take = h('<button class="tbtn" type="button">Снять</button>');
      take.addEventListener("click", function () {
        var a = +f.inputs.amt.value;
        if (!(a > 0)) { f.inputs.amt.focus(); return; }
        var x = clone(ctx.items());
        x.items = (x.items || []).concat([{ id: newId(), amt: -a, note: f.inputs.note.value.trim(), at: Date.now() }]);
        ctx.save(x);
        f.inputs.amt.value = ""; f.inputs.note.value = "";
      });
      f.appendChild(take);
      ctx.body.appendChild(f);
      ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
    },
    update: function (ctx) {
      var v = ctx.items(), s = saved(v), now = Date.now();
      var gi = ctx.goalForm.querySelectorAll("input");
      if (document.activeElement !== gi[0]) gi[0].value = v.goal || "";
      if (document.activeElement !== gi[1]) gi[1].value = v.deadline ? u.dateInput(v.deadline) : "";
      setTxt(ctx.top.querySelector(".lg"), money(s));
      setTxt(ctx.top.querySelector(".sm"), v.goal ? "из " + money(v.goal) + " · " + Math.min(100, Math.round(s / v.goal * 100)) + "%" : "накоплено");
      ctx.top.querySelector(".track").hidden = !v.goal;
      ctx.top.querySelector(".track > i").style.width = (v.goal ? Math.min(100, s / v.goal * 100) : 0) + "%";
      var hint = "";
      if (v.goal && s >= v.goal) hint = "Цель достигнута 🎉";
      else if (v.goal && v.deadline) {
        var m = monthsLeft(v.deadline, now);
        hint = m > 0 ? "Откладывайте по " + money(Math.ceil((v.goal - s) / m)) + " в месяц, чтобы успеть к " + shortDate(v.deadline)
          : "До срока меньше месяца: осталось " + money(v.goal - s);
      }
      setTxt(ctx.top.querySelector(".sv-hint"), hint);
      var list = ctx.list;
      list.innerHTML = "";
      var items = (v.items || []).slice().sort(function (a, b) { return b.at - a.at; });
      if (!items.length) emptyRow(list, "Пополнений пока нет");
      items.slice(0, 20).forEach(function (x) {
        var r = h('<div class="row ex"><div class="note mono">' + shortDate(x.at) + '</div><div class="nm">' + esc(x.note || (x.amt < 0 ? "Снятие" : "Пополнение")) +
          '</div><div class="amt ' + (x.amt < 0 ? "neg" : "pos") + '">' + (x.amt < 0 ? "−" : "+") + money(Math.abs(x.amt)) + "</div></div>");
        r.appendChild(rowX(function () { var nv = clone(ctx.items()); nv.items = nv.items.filter(function (y) { return y.id !== x.id; }); ctx.save(nv); }));
        list.appendChild(r);
      });
    },
    sub: function (ctx) { var v = ctx.items(), s = saved(v); return money(s) + (v.goal ? " из " + money(v.goal) : ""); },
    stats: function (items, b, ws) {
      var t = (items.items || []).filter(function (x) { return x.at >= ws; }).reduce(function (a, x) { return a + x.amt; }, 0);
      return t ? [{ label: "отложено", value: money(t) }] : [];
    },
    dates: function (items, b) { return items.deadline ? [{ at: items.deadline, title: "Цель копилки: " + b.title }] : []; }
  });

  /* =============================== debts =============================== */

  Pult.register("debts", {
    label: "Долги",
    empty: function () { return []; },
    mount: function (ctx) {
      ctx.top = ctx.body.appendChild(h('<div class="summ"><div><div class="lg mono pos"></div><div class="sm">мне должны</div></div>' +
        '<div class="right"><div class="lg mono neg"></div><div class="sm">я должен</div></div></div>'));
      ctx.body.appendChild(u.form([
        { key: "who", placeholder: "Кто", cls: "grow", required: true, list: true },
        { key: "amt", type: "number", placeholder: "₽", cls: "num", min: 0 },
        { key: "dir", type: "select", placeholder: "Направление", options: [{ value: "them", label: "мне должны" }, { value: "me", label: "я должен" }] },
        { key: "note", placeholder: "За что", cls: "grow" },
        { key: "due", type: "date", placeholder: "Вернуть до" }
      ], function (v) {
        ctx.add({ who: v.who, amt: v.amt || 0, dir: v.dir, note: v.note, due: v.due ? u.parseDue(v.due) : 0, done: false, at: Date.now() });
      }));
      ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
    },
    update: function (ctx) {
      var items = ctx.items().slice(), them = 0, me = 0;
      items.forEach(function (x) { if (!x.done) { if (x.dir === "me") me += +x.amt || 0; else them += +x.amt || 0; } });
      setTxt(ctx.top.querySelectorAll(".lg")[0], money(them));
      setTxt(ctx.top.querySelectorAll(".lg")[1], money(me));
      items.sort(function (a, b) { return (a.done - b.done) || (b.at - a.at); });
      var list = ctx.list;
      list.innerHTML = "";
      if (!items.length) emptyRow(list, "Долгов нет");
      items.forEach(function (x) {
        var r = h('<div class="row bl' + (x.done ? " paid" : "") + '">' +
          '<div class="paybox" role="button" tabindex="0" aria-label="Вернули">' + (x.done ? "✓" : "") + "</div>" +
          '<div><div class="nm">' + esc(x.who) + '</div><div class="note">' + esc((x.dir === "me" ? "я должен" : "должен мне") + (x.note ? " · " + x.note : "") + (x.due && !x.done ? " · до " + shortDate(x.due) : "")) + "</div></div>" +
          '<div class="amt ' + (x.dir === "me" ? "neg" : "pos") + '">' + money(x.amt) + "</div></div>");
        u.onActivate(r.querySelector(".paybox"), function () { ctx.patch(x.id, { done: !x.done }); });
        r.appendChild(rowX(function () { ctx.remove(x.id); }));
        list.appendChild(r);
      });
    },
    sub: function (ctx) {
      var n = ctx.items().filter(function (x) { return !x.done; }).length;
      return n ? n + " " + plural(n, "открытый долг", "открытых долга", "открытых долгов") : "все долги закрыты";
    },
    reminders: function (items, b, now) {
      if (new Date(now).getHours() < 9) return [];
      return items.filter(function (x) { return !x.done && x.due && u.dayKey(x.due) === u.dayKey(now); }).map(function (x) {
        return { key: x.id + ":" + x.due, text: (x.dir === "me" ? "Вернуть сегодня: " : "Сегодня должны вернуть: ") + x.who + " · " + money(x.amt) };
      });
    },
    dates: function (items) { return items.filter(function (x) { return !x.done && x.due; }).map(function (x) { return { at: x.due, title: "Долг: " + x.who }; }); }
  });

  /* =============================== rates =============================== */
  // Rates of the Central Bank of Russia via cbr-xml-daily.ru (free, no key). Cached for 3 hours.

  var RATES_URL = "https://www.cbr-xml-daily.ru/daily_json.js";
  var ratesCache = null, ratesLoading = null;
  function loadRates() {
    if (ratesCache && Date.now() - ratesCache.fetched < 3 * H) return Promise.resolve(ratesCache);
    try {
      var saved = JSON.parse(localStorage.getItem("daydeck:rates") || "null");
      if (saved && Date.now() - saved.fetched < 3 * H) { ratesCache = saved; return Promise.resolve(saved); }
    } catch (e) {}
    if (ratesLoading) return ratesLoading;
    ratesLoading = fetch(RATES_URL).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
      ratesCache = { fetched: Date.now(), date: j.Date, valute: j.Valute };
      try { localStorage.setItem("daydeck:rates", JSON.stringify(ratesCache)); } catch (e) {}
      ratesLoading = null;
      return ratesCache;
    }, function (err) { ratesLoading = null; throw err; });
    return ratesLoading;
  }
  function perUnit(v) { return v.Value / v.Nominal; }

  Pult.register("rates", {
    label: "Курсы валют",
    defaults: { codes: ["USD", "EUR", "CNY"] },
    empty: function () { return {}; },
    mount: function (ctx) {
      ctx.tbl = ctx.body.appendChild(h('<div class="rates"></div>'));
      ctx.conv = ctx.body.appendChild(h('<div class="addf conv"><input class="num" type="number" min="0" step="any" value="100" aria-label="Сумма">' +
        '<select aria-label="Из"></select><span class="conv-eq">=</span><span class="conv-out mono"></span></div>'));
      ctx.foot = ctx.body.appendChild(h('<div class="note src-note"></div>'));
      var recalc = function () { Pult.types.rates.paintConv(ctx); };
      ctx.conv.querySelector("input").addEventListener("input", recalc);
      ctx.conv.querySelector("select").addEventListener("change", recalc);
      Pult.types.rates.refresh(ctx);
    },
    refresh: function (ctx) {
      setTxt(ctx.foot, "Загрузка курсов…");
      loadRates().then(function (r) { ctx.rates = r; Pult.types.rates.update(ctx); }, function () {
        setTxt(ctx.foot, "Не удалось загрузить курсы — проверьте интернет");
      });
    },
    update: function (ctx) {
      var r = ctx.rates;
      if (!r) return;
      var cfg = ctx.config(), codes = cfg.codes.filter(function (c) { return r.valute[c]; });
      ctx.tbl.innerHTML = codes.map(function (c) {
        var v = r.valute[c], cur = perUnit(v), diff = cur - v.Previous / v.Nominal;
        return '<div class="rate"><span class="rate-c mono">' + esc(c) + '</span><span class="rate-n">' + esc(v.Name) + '</span>' +
          '<span class="rate-v mono">' + num(cur, 4) + ' ₽</span><span class="rate-d mono ' + (diff >= 0 ? "pos" : "neg") + '">' + (diff >= 0 ? "▲" : "▼") + num(Math.abs(diff), 4) + "</span></div>";
      }).join("");
      var sel = ctx.conv.querySelector("select"), keep = sel.value;
      sel.innerHTML = Object.keys(r.valute).sort(function (a, b) { return codes.indexOf(b) - codes.indexOf(a) || a.localeCompare(b); })
        .map(function (c) { return '<option value="' + c + '">' + c + "</option>"; }).join("");
      sel.value = keep || codes[0] || "USD";
      setTxt(ctx.foot, "ЦБ РФ на " + new Date(r.date).toLocaleDateString("ru-RU"));
      Pult.types.rates.paintConv(ctx);
    },
    paintConv: function (ctx) {
      var r = ctx.rates;
      if (!r) return;
      var a = +ctx.conv.querySelector("input").value || 0, c = ctx.conv.querySelector("select").value, v = r.valute[c];
      setTxt(ctx.conv.querySelector(".conv-out"), v ? money(Math.round(a * perUnit(v) * 100) / 100) : "—");
    },
    sub: function (ctx) {
      var r = ctx.rates, c = ctx.config().codes[0];
      return r && r.valute[c] ? c + " " + num(perUnit(r.valute[c]), 2) + " ₽" : "курсы ЦБ РФ";
    },
    tick: function (ctx, now) {
      if (ctx.rates && now - ctx.rates.fetched > 3 * H && !ctx.reloading) {
        ctx.reloading = true;
        loadRates().then(function (r) { ctx.rates = r; ctx.reloading = false; Pult.types.rates.update(ctx); }, function () { ctx.reloading = false; });
      }
    },
    settings: function (ctx) {
      var inp = h('<input type="text" class="w-m">');
      inp.value = ctx.config().codes.join(", ");
      var el = h('<div class="bset"><label>Валюты (коды через запятую) </label><button class="tbtn" type="button">Сохранить</button></div>');
      el.querySelector("label").appendChild(inp);
      el.querySelector("button").addEventListener("click", function () {
        var codes = inp.value.toUpperCase().split(/[\s,;]+/).filter(function (c) { return /^[A-Z]{3}$/.test(c); }).slice(0, 10);
        if (!codes.length) { u.toast("Например: USD, EUR, CNY"); return; }
        ctx.setConfig({ codes: codes });
      });
      return el;
    }
  });

  [
    { group: "Деньги", type: "savings", title: "Копилка", desc: "Цель, сколько накоплено и сколько откладывать в месяц." },
    { group: "Деньги", type: "debts", title: "Долги", desc: "Кто кому и сколько должен, отметка «вернул»." },
    { group: "Деньги", type: "rates", title: "Курсы валют", desc: "Курсы ЦБ РФ и конвертер в рубли." }
  ].forEach(Pult.preset);
})();
