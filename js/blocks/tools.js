// Tools: world clocks, sticky notes, calculator & unit converter, QR code, random picker,
// pomodoro, links, weather.
(function () {
  "use strict";
  var u = Pult.util;
  var D = u.D, H = u.H, MIN = u.MIN, h = u.h, esc = u.esc, clone = u.clone, newId = u.newId, setTxt = u.setTxt,
    rowX = u.rowX, emptyRow = u.emptyRow, plural = u.plural, dayKey = u.dayKey, num = u.num, pad = u.pad;

  /* =============================== clocks =============================== */

  var CITIES = [
    ["Москва", "Europe/Moscow"], ["Калининград", "Europe/Kaliningrad"], ["Самара", "Europe/Samara"], ["Екатеринбург", "Asia/Yekaterinburg"],
    ["Омск", "Asia/Omsk"], ["Новосибирск", "Asia/Novosibirsk"], ["Красноярск", "Asia/Krasnoyarsk"], ["Иркутск", "Asia/Irkutsk"],
    ["Владивосток", "Asia/Vladivostok"], ["Минск", "Europe/Minsk"], ["Киев", "Europe/Kyiv"], ["Алматы", "Asia/Almaty"], ["Ташкент", "Asia/Tashkent"],
    ["Тбилиси", "Asia/Tbilisi"], ["Ереван", "Asia/Yerevan"], ["Стамбул", "Europe/Istanbul"], ["Дубай", "Asia/Dubai"], ["Лондон", "Europe/London"],
    ["Берлин", "Europe/Berlin"], ["Париж", "Europe/Paris"], ["Нью-Йорк", "America/New_York"], ["Лос-Анджелес", "America/Los_Angeles"],
    ["Пекин", "Asia/Shanghai"], ["Токио", "Asia/Tokyo"], ["Сеул", "Asia/Seoul"], ["Бангкок", "Asia/Bangkok"], ["Дели", "Asia/Kolkata"], ["Сидней", "Australia/Sydney"]
  ];
  function tzParts(tz, now) {
    try {
      var f = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, day: "numeric", month: "numeric", year: "numeric" });
      var p = {};
      f.formatToParts(new Date(now)).forEach(function (x) { p[x.type] = x.value; });
      return p;
    } catch (e) { return null; }
  }

  Pult.register("clocks", {
    label: "Мировые часы",
    empty: function () { return []; },
    mount: function (ctx) {
      ctx.body.appendChild(u.form([
        { key: "tz", type: "select", placeholder: "Город", options: CITIES.map(function (c) { return { value: c[1] + "|" + c[0], label: c[0] }; }) },
        { key: "name", placeholder: "Подпись (необяз.)", cls: "grow" }
      ], function (v) { var p = v.tz.split("|"); ctx.add({ tz: p[0], name: v.name || p[1] }); }));
      ctx.list = ctx.body.appendChild(h('<div class="clocks"></div>'));
    },
    update: function (ctx) {
      var list = ctx.list;
      list.innerHTML = "";
      if (!ctx.items().length) emptyRow(list, "Добавьте город");
      ctx.items().forEach(function (c) {
        var r = h('<div class="clk" data-tz="' + esc(c.tz) + '"><div class="nm">' + esc(c.name) + '</div><div class="clk-t mono"></div><div class="note clk-d"></div></div>');
        r.appendChild(rowX(function () { ctx.remove(c.id); }));
        list.appendChild(r);
      });
      Pult.types.clocks.tick(ctx, Date.now());
    },
    tick: function (ctx, now) {
      var here = tzParts(Intl.DateTimeFormat().resolvedOptions().timeZone, now);
      Array.prototype.forEach.call(ctx.list.querySelectorAll(".clk"), function (el) {
        var p = tzParts(el.getAttribute("data-tz"), now);
        if (!p) { setTxt(el.querySelector(".clk-t"), "—"); return; }
        setTxt(el.querySelector(".clk-t"), pad(+p.hour % 24) + ":" + p.minute);
        var dd = here ? Math.round((Date.UTC(+p.year, +p.month - 1, +p.day) - Date.UTC(+here.year, +here.month - 1, +here.day)) / D) : 0;
        var diffH = here ? ((+p.hour % 24) * 60 + +p.minute - ((+here.hour % 24) * 60 + +here.minute) + dd * 1440) / 60 : 0;
        setTxt(el.querySelector(".clk-d"), (dd ? (dd > 0 ? "завтра · " : "вчера · ") : "") + (diffH === 0 ? "как у вас" : (diffH > 0 ? "+" : "−") + num(Math.abs(diffH)) + " ч"));
      });
    },
    sub: function (ctx) { var n = ctx.items().length; return n ? n + " " + plural(n, "город", "города", "городов") : "нет городов"; }
  });

  /* =============================== stickies =============================== */

  var COLORS = ["yellow", "green", "blue", "pink", "gray"];

  Pult.register("stickies", {
    label: "Стикеры",
    empty: function () { return []; },
    mount: function (ctx) {
      var add = h('<button class="tbtn" type="button">+ Стикер</button>');
      add.addEventListener("click", function () { ctx.add({ text: "", color: COLORS[ctx.items().length % COLORS.length], at: Date.now() }); ctx.focusNew = true; });
      ctx.body.appendChild(h('<div class="tbl-tools"></div>')).appendChild(add);
      ctx.grid = ctx.body.appendChild(h('<div class="sticks"></div>'));
      ctx.grid.addEventListener("focusout", function (e) {
        var el = e.target.closest(".stick-t");
        if (!el) return;
        var id = el.parentNode.getAttribute("data-id"), x = ctx.items().filter(function (s) { return s.id === id; })[0];
        if (x && x.text !== el.innerText.trim()) ctx.patch(id, { text: el.innerText.trim() });
      });
    },
    update: function (ctx) {
      // don't redraw under the caret; colour changes are applied right away
      var ae = document.activeElement;
      if (ae && ae.classList && ae.classList.contains("stick-t") && ctx.grid.contains(ae)) {
        ctx.dirty = true;
        ctx.items().forEach(function (s) {
          var el = ctx.grid.querySelector('.stick[data-id="' + s.id + '"]');
          if (el) el.className = "stick c-" + (COLORS.indexOf(s.color) >= 0 ? s.color : "yellow");
        });
        return;
      }
      var grid = ctx.grid, items = ctx.items();
      grid.innerHTML = "";
      if (!items.length) emptyRow(grid, "Нажмите «+ Стикер»");
      items.forEach(function (s) {
        var el = h('<div class="stick c-' + (COLORS.indexOf(s.color) >= 0 ? s.color : "yellow") + '" data-id="' + esc(s.id) + '"><div class="stick-t" contenteditable="true" aria-label="Текст стикера"></div>' +
          '<div class="stick-b">' + COLORS.map(function (c) { return '<button type="button" class="dot c-' + c + '" data-c="' + c + '" aria-label="Цвет"></button>'; }).join("") + "</div></div>");
        el.querySelector(".stick-t").textContent = s.text || "";
        el.querySelector(".stick-b").addEventListener("click", function (e) {
          var b = e.target.closest(".dot");
          if (b) ctx.patch(s.id, { color: b.getAttribute("data-c") });
        });
        el.querySelector(".stick-b").appendChild(rowX(function () { ctx.remove(s.id); }));
        grid.appendChild(el);
      });
      if (ctx.focusNew) { ctx.focusNew = false; var last = grid.querySelector(".stick:last-child .stick-t"); if (last) last.focus(); }
    },
    tick: function (ctx) {
      var ae = document.activeElement;
      if (ctx.dirty && !(ae && ae.classList && ae.classList.contains("stick-t") && ctx.grid.contains(ae))) { ctx.dirty = false; Pult.types.stickies.update(ctx); }
    },
    sub: function (ctx) { var n = ctx.items().length; return n ? n + " " + plural(n, "стикер", "стикера", "стикеров") : "пусто"; }
  });

  /* =============================== calculator =============================== */

  // Safe arithmetic: only numbers, + - * / ^ % and brackets; parsed by hand, never eval.
  function calc(expr) {
    var s = String(expr).replace(/\s+/g, "").replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-"), i = 0;
    function peek() { return s.charAt(i); }
    function number() {
      var m = s.slice(i).match(/^\d*\.?\d+(e[+-]?\d+)?/i);
      if (!m) throw new Error("num");
      i += m[0].length;
      return parseFloat(m[0]);
    }
    function factor() {
      var c = peek();
      if (c === "-") { i++; return -factor(); }
      if (c === "+") { i++; return factor(); }
      var v;
      if (c === "(") { i++; v = expr0(); if (peek() !== ")") throw new Error(")"); i++; }
      else v = number();
      if (peek() === "%") { i++; v = v / 100; }
      if (peek() === "^") { i++; v = Math.pow(v, factor()); }
      return v;
    }
    function term() {
      var v = factor();
      while (peek() === "*" || peek() === "/") { var op = s.charAt(i++), r = factor(); v = op === "*" ? v * r : v / r; }
      return v;
    }
    function expr0() {
      var v = term();
      while (peek() === "+" || peek() === "-") { var op = s.charAt(i++), r = term(); v = op === "+" ? v + r : v - r; }
      return v;
    }
    var v = expr0();
    if (i !== s.length) throw new Error("tail");
    return v;
  }
  var UNITS = {
    "Длина": { "мм": 0.001, "см": 0.01, "м": 1, "км": 1000, "дюйм": 0.0254, "фут": 0.3048, "ярд": 0.9144, "миля": 1609.344 },
    "Масса": { "г": 0.001, "кг": 1, "т": 1000, "унция": 0.0283495, "фунт": 0.453592 },
    "Объём": { "мл": 0.001, "л": 1, "м³": 1000, "галлон (США)": 3.78541, "чашка": 0.24 },
    "Площадь": { "см²": 0.0001, "м²": 1, "сотка": 100, "га": 10000, "км²": 1e6 },
    "Скорость": { "км/ч": 1 / 3.6, "м/с": 1, "миль/ч": 0.44704, "узел": 0.514444 },
    "Температура": { "°C": "c", "°F": "f", "K": "k" },
    "Данные": { "КБ": 1024, "МБ": 1048576, "ГБ": 1073741824, "ТБ": 1099511627776 }
  };
  function convert(cat, v, a, b) {
    var t = UNITS[cat];
    if (cat === "Температура") {
      var c = a === "°C" ? v : a === "°F" ? (v - 32) * 5 / 9 : v - 273.15;
      return b === "°C" ? c : b === "°F" ? c * 9 / 5 + 32 : c + 273.15;
    }
    return v * t[a] / t[b];
  }

  Pult.register("calc", {
    label: "Калькулятор и конвертер",
    empty: function () { return {}; },
    mount: function (ctx) {
      var c = h('<div class="calc"><input class="calc-in mono" type="text" inputmode="decimal" placeholder="Например: (1200 + 350) * 12%" aria-label="Выражение">' +
        '<div class="calc-out mono" aria-live="polite"></div></div>');
      var inp = c.querySelector("input"), out = c.querySelector(".calc-out");
      inp.addEventListener("input", function () {
        if (!inp.value.trim()) { out.textContent = ""; return; }
        try { var v = calc(inp.value); out.textContent = isFinite(v) ? "= " + num(v, 10) : "= ∞"; out.classList.remove("err"); }
        catch (e) { out.textContent = "…"; out.classList.add("err"); }
      });
      ctx.body.appendChild(c);
      var cv = h('<div class="conv-box"><div class="addf"><select class="cv-cat" aria-label="Величина"></select></div>' +
        '<div class="addf"><input class="num cv-v" type="number" step="any" value="1" aria-label="Значение"><select class="cv-a" aria-label="Из"></select>' +
        '<span class="conv-eq">→</span><select class="cv-b" aria-label="В"></select><span class="conv-out mono"></span></div></div>');
      var cat = cv.querySelector(".cv-cat"), a = cv.querySelector(".cv-a"), b = cv.querySelector(".cv-b"), v = cv.querySelector(".cv-v"), o = cv.querySelector(".conv-out");
      Object.keys(UNITS).forEach(function (k) { cat.appendChild(h('<option value="' + k + '">' + k + "</option>")); });
      var fill = function () {
        var keys = Object.keys(UNITS[cat.value]);
        a.innerHTML = b.innerHTML = keys.map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + "</option>"; }).join("");
        b.selectedIndex = Math.min(1, keys.length - 1);
        go();
      };
      var go = function () { setTxt(o, num(convert(cat.value, +v.value || 0, a.value, b.value), 6) + " " + b.value); };
      cat.addEventListener("change", fill);
      [a, b].forEach(function (s) { s.addEventListener("change", go); });
      v.addEventListener("input", go);
      fill();
      ctx.body.appendChild(cv);
    },
    update: function () {},
    sub: function () { return "считает без интернета"; }
  });

  /* =============================== QR =============================== */

  var QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";

  Pult.register("qr", {
    label: "QR-код",
    empty: function () { return { text: "" }; },
    mount: function (ctx) {
      var w = h('<div class="qr"><textarea rows="2" placeholder="Ссылка или текст" aria-label="Текст для QR-кода"></textarea>' +
        '<div class="qr-img" aria-label="QR-код"></div><div class="tbl-tools"><button class="tbtn" type="button">⤓ Скачать PNG</button></div></div>');
      ctx.ta = w.querySelector("textarea");
      ctx.img = w.querySelector(".qr-img");
      var timer = 0;
      ctx.ta.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { ctx.save({ text: ctx.ta.value }); }, 500);
        Pult.types.qr.draw(ctx, ctx.ta.value);
      });
      w.querySelector("button").addEventListener("click", function () {
        var cv = ctx.img.querySelector("canvas"), im = ctx.img.querySelector("img");
        var src = cv ? cv.toDataURL("image/png") : im && im.src;
        if (!src || !ctx.ta.value.trim()) { u.toast("Сначала введите текст"); return; }
        var a = document.createElement("a");
        a.href = src; a.download = "qr.png";
        document.body.appendChild(a); a.click(); a.remove();
      });
      ctx.body.appendChild(w);
    },
    draw: function (ctx, text) {
      ctx.img.innerHTML = "";
      if (!text.trim()) return;
      u.loadScript(QR_LIB).then(function () {
        ctx.img.innerHTML = "";
        // eslint-disable-next-line no-new
        new window.QRCode(ctx.img, { text: text, width: 180, height: 180, colorDark: "#111111", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.M });
      }, function () { ctx.img.textContent = "Не удалось загрузить генератор QR — нужен интернет"; });
    },
    update: function (ctx) {
      var t = ctx.items().text || "";
      if (document.activeElement !== ctx.ta && ctx.ta.value !== t) { ctx.ta.value = t; Pult.types.qr.draw(ctx, t); }
      else if (!ctx.drawn) { ctx.drawn = true; Pult.types.qr.draw(ctx, t); }
    },
    sub: function (ctx) { var t = ctx.items().text || ""; return t ? t.slice(0, 40) : "введите текст"; }
  });

  /* =============================== random =============================== */

  function rnd(n) {
    if (window.crypto && window.crypto.getRandomValues) { var a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0] % n; }
    return Math.floor(Math.random() * n);
  }

  Pult.register("random", {
    label: "Случайный выбор",
    empty: function () { return { options: "" }; },
    mount: function (ctx) {
      var w = h('<div class="rnd"><div class="rnd-out mono" aria-live="polite">?</div>' +
        '<div class="rnd-btns"><button class="tbtn" type="button" data-m="dice">🎲 Кубик</button><button class="tbtn" type="button" data-m="coin">🪙 Монетка</button>' +
        '<button class="tbtn" type="button" data-m="num">Число</button><button class="addbtn" type="button" data-m="list">Выбрать из списка</button></div>' +
        '<div class="addf"><label class="ex-limit">от <input class="num-s" type="number" value="1"></label><label class="ex-limit">до <input class="num-s" type="number" value="100"></label></div>' +
        '<textarea rows="3" placeholder="Варианты, каждый с новой строки" aria-label="Варианты"></textarea></div>');
      ctx.out = w.querySelector(".rnd-out");
      ctx.ta = w.querySelector("textarea");
      var range = w.querySelectorAll(".addf input");
      ctx.ta.addEventListener("change", function () { ctx.save({ options: ctx.ta.value }); });
      w.querySelector(".rnd-btns").addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        var m = b.getAttribute("data-m"), res;
        if (m === "dice") res = "🎲 " + (rnd(6) + 1);
        else if (m === "coin") res = rnd(2) ? "Орёл" : "Решка";
        else if (m === "num") {
          var lo = Math.round(+range[0].value || 0), hi = Math.round(+range[1].value || 0);
          if (hi < lo) { var t = lo; lo = hi; hi = t; }
          res = String(lo + rnd(hi - lo + 1));
        } else {
          var opts = ctx.ta.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
          if (opts.length < 2) { u.toast("Впишите хотя бы 2 варианта"); return; }
          res = opts[rnd(opts.length)];
        }
        ctx.out.classList.remove("pop"); void ctx.out.offsetWidth; ctx.out.classList.add("pop");
        ctx.out.textContent = res;
      });
      ctx.body.appendChild(w);
    },
    update: function (ctx) { if (document.activeElement !== ctx.ta) ctx.ta.value = ctx.items().options || ""; },
    sub: function () { return "кубик, монетка, число, список"; }
  });

  /* =============================== pomodoro =============================== */
  // data: { log: {dayKey: n}, run: {phase: work|short|long, endsAt, pausedLeft} | null, round }

  var PHASE = { work: "Работа", short: "Перерыв", long: "Длинный перерыв" };

  Pult.register("pomodoro", {
    label: "Помодоро",
    defaults: { work: 25, short: 5, long: 15, every: 4 },
    empty: function () { return { log: {}, run: null, round: 0 }; },
    mount: function (ctx) {
      var w = h('<div class="pomo"><div class="pomo-ph"></div><div class="pomo-t mono">--:--</div>' +
        '<div class="track"><i></i></div>' +
        '<div class="pomo-btns"><button class="addbtn" type="button" data-a="start"></button><button class="tbtn" type="button" data-a="skip">Пропустить</button>' +
        '<button class="tbtn" type="button" data-a="reset">Сброс</button></div><div class="pomo-week"></div></div>');
      ctx.w = ctx.body.appendChild(w);
      w.querySelector(".pomo-btns").addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (b) Pult.types.pomodoro.act(ctx, b.getAttribute("data-a"));
      });
    },
    len: function (cfg, ph) { return (ph === "work" ? cfg.work : ph === "short" ? cfg.short : cfg.long) * MIN; },
    act: function (ctx, a) {
      var cfg = ctx.config(), v = clone(ctx.items()), now = Date.now();
      v.log = v.log || {};
      if (a === "start") {
        if (!v.run) v.run = { phase: "work", endsAt: now + this.len(cfg, "work") };
        else if (v.run.pausedLeft) { v.run.endsAt = now + v.run.pausedLeft; delete v.run.pausedLeft; }
        else { v.run.pausedLeft = Math.max(0, v.run.endsAt - now); }
      } else if (a === "skip") {
        if (!v.run) return;
        this.next(v, cfg, now, false);
      } else if (a === "reset") { v.run = null; v.round = 0; }
      ctx.save(v);
    },
    next: function (v, cfg, now, finished) {
      var ph = v.run.phase, nx;
      if (ph === "work") {
        if (finished) { var k = dayKey(now); v.log[k] = (v.log[k] || 0) + 1; }
        v.round = (v.round || 0) + 1;
        nx = v.round % cfg.every === 0 ? "long" : "short";
      } else nx = "work";
      v.run = { phase: nx, endsAt: now + this.len(cfg, nx) };
      return nx;
    },
    update: function (ctx) { this.tick(ctx, Date.now()); },
    tick: function (ctx, now) {
      var self = Pult.types.pomodoro, cfg = ctx.config(), v = ctx.items(), run = v.run, w = ctx.w;
      if (run && !run.pausedLeft && run.endsAt <= now && !ctx.advancing) {
        ctx.advancing = true;
        var nv = clone(v);
        nv.log = nv.log || {};
        var was = run.phase, nx = self.next(nv, cfg, now, true);
        ctx.save(nv);
        ctx.advancing = false;
        Pult.api.notify(was === "work" ? "Помидор готов! Время для перерыва" : "Перерыв окончен — за работу", "pomodoro");
        return;
      }
      var left = run ? (run.pausedLeft || Math.max(0, run.endsAt - now)) : self.len(cfg, "work"), total = run ? self.len(cfg, run.phase) : self.len(cfg, "work");
      var s = Math.ceil(left / 1000);
      setTxt(w.querySelector(".pomo-t"), pad(Math.floor(s / 60)) + ":" + pad(s % 60));
      setTxt(w.querySelector(".pomo-ph"), run ? PHASE[run.phase] + (run.pausedLeft ? " · пауза" : "") : "Готов начать");
      w.querySelector(".track > i").style.width = (run ? (1 - left / total) * 100 : 0) + "%";
      w.classList.toggle("rest", !!run && run.phase !== "work");
      setTxt(w.querySelector("[data-a=start]"), !run ? "▶ Старт" : run.pausedLeft ? "▶ Продолжить" : "❚❚ Пауза");
      var k = dayKey(now);
      if (ctx.weekKey !== k + JSON.stringify(v.log)) {
        ctx.weekKey = k + JSON.stringify(v.log);
        var vals = [];
        for (var i = 6; i >= 0; i--) { var t = u.addDays(now, -i); vals.push({ label: u.DSHORT[new Date(t).getDay()], value: (v.log || {})[dayKey(t)] || 0 }); }
        w.querySelector(".pomo-week").innerHTML = u.weekBars(vals);
      }
    },
    sub: function (ctx) { var n = (ctx.items().log || {})[dayKey(new Date())] || 0; return "сегодня " + n + " " + plural(n, "помидор", "помидора", "помидоров"); },
    stats: function (items, b, ws, now) {
      var t = 0;
      for (var d = ws; d <= now; d = u.addDays(d, 1)) t += (items.log || {})[dayKey(d)] || 0;
      return [{ label: "помидоров", value: t }];
    },
    settings: function (ctx) {
      var cfg = ctx.config(), ins = {};
      var el = h('<div class="bset"></div>');
      [["work", "Работа, мин"], ["short", "Перерыв, мин"], ["long", "Длинный, мин"], ["every", "Длинный каждые"]].forEach(function (p) {
        var l = h("<label>" + p[1] + ' <input class="w-s" type="number" min="1" step="1"></label>');
        ins[p[0]] = l.querySelector("input");
        ins[p[0]].value = cfg[p[0]];
        el.appendChild(l);
      });
      var b = h('<button class="tbtn" type="button">Сохранить</button>');
      b.addEventListener("click", function () {
        var o = {};
        Object.keys(ins).forEach(function (k) { o[k] = Math.max(1, Math.round(+ins[k].value || cfg[k])); });
        ctx.setConfig(o);
      });
      el.appendChild(b);
      return el;
    }
  });

  /* =============================== links =============================== */

  Pult.register("links", {
    label: "Ссылки",
    empty: function () { return []; },
    mount: function (ctx) {
      ctx.form = u.form([
        { key: "url", placeholder: "Ссылка", cls: "grow", required: true },
        { key: "title", placeholder: "Название", cls: "grow" },
        { key: "group", placeholder: "Группа", cls: "subj-in", list: true, keep: true }
      ], function (v) {
        var url = u.safeUrl(v.url);
        if (!url) { u.toast("Нужна ссылка вида https://…"); return false; }
        ctx.add({ url: url, title: v.title || new URL(url).hostname.replace(/^www\./, ""), group: v.group });
      });
      ctx.body.appendChild(ctx.form);
      ctx.list = ctx.body.appendChild(h('<div class="listwrap"></div>'));
    },
    update: function (ctx) {
      var items = ctx.items(), groups = {};
      items.forEach(function (x) { (groups[x.group || ""] = groups[x.group || ""] || []).push(x); });
      ctx.form.setList("group", Object.keys(groups).filter(Boolean));
      var list = ctx.list;
      list.innerHTML = "";
      if (!items.length) emptyRow(list);
      Object.keys(groups).sort().forEach(function (g) {
        if (g) list.appendChild(h('<div class="day-h"><span>' + esc(g) + "</span></div>"));
        groups[g].forEach(function (x) {
          var url = u.safeUrl(x.url);
          var r = h('<div class="row lk"><span class="lk-ic" aria-hidden="true">' + esc((x.title || "?").charAt(0).toUpperCase()) + "</span>" +
            '<a class="nm" target="_blank" rel="noopener noreferrer"></a></div>');
          var a = r.querySelector("a");
          a.textContent = x.title;
          a.title = url;
          if (url) a.href = url;
          r.appendChild(rowX(function () { ctx.remove(x.id); }));
          list.appendChild(r);
        });
      });
    },
    sub: function (ctx) { var n = ctx.items().length; return n ? n + " " + plural(n, "ссылка", "ссылки", "ссылок") : "пусто"; }
  });

  /* =============================== weather =============================== */
  // Open-Meteo (free, no key). The city name is sent to its geocoding service when you set it.

  var WMO = {
    0: ["☀️", "ясно"], 1: ["🌤", "в основном ясно"], 2: ["⛅", "переменная облачность"], 3: ["☁️", "пасмурно"], 45: ["🌫", "туман"], 48: ["🌫", "изморозь"],
    51: ["🌦", "морось"], 53: ["🌦", "морось"], 55: ["🌦", "сильная морось"], 56: ["🌧", "ледяная морось"], 57: ["🌧", "ледяная морось"],
    61: ["🌧", "небольшой дождь"], 63: ["🌧", "дождь"], 65: ["🌧", "ливень"], 66: ["🌧", "ледяной дождь"], 67: ["🌧", "ледяной дождь"],
    71: ["🌨", "небольшой снег"], 73: ["🌨", "снег"], 75: ["❄️", "сильный снег"], 77: ["🌨", "снежная крупа"], 80: ["🌦", "ливень"], 81: ["🌧", "ливень"],
    82: ["⛈", "сильный ливень"], 85: ["🌨", "снегопад"], 86: ["❄️", "сильный снегопад"], 95: ["⛈", "гроза"], 96: ["⛈", "гроза с градом"], 99: ["⛈", "гроза с градом"]
  };
  function wmo(c) { return WMO[c] || ["🌡", ""]; }

  Pult.register("weather", {
    label: "Погода",
    defaults: { city: "", lat: null, lon: null },
    empty: function () { return {}; },
    mount: function (ctx) {
      ctx.box = ctx.body.appendChild(h('<div class="wx"></div>'));
      if (ctx.config().lat == null) {
        ctx.box.appendChild(h('<div class="empty">Укажите город в «Настроить» → поле «Город».</div>'));
        return;
      }
      Pult.types.weather.load(ctx);
    },
    load: function (ctx) {
      var cfg = ctx.config();
      var url = "https://api.open-meteo.com/v1/forecast?latitude=" + cfg.lat + "&longitude=" + cfg.lon +
        "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
        "&timezone=auto&forecast_days=5&wind_speed_unit=ms";
      ctx.loadedAt = Date.now();
      fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
        ctx.wx = j;
        Pult.types.weather.paint(ctx);
      }).catch(function () { ctx.box.innerHTML = '<div class="empty">Не удалось загрузить погоду — проверьте интернет</div>'; });
    },
    paint: function (ctx) {
      var j = ctx.wx, c = j.current, d = j.daily, w = wmo(c.weather_code);
      var days = d.time.map(function (t, i) {
        var dt = new Date(t + "T12:00:00");
        return '<div class="wx-d"><span>' + (i === 0 ? "сег." : u.DSHORT[dt.getDay()]) + '</span><span class="wx-i">' + wmo(d.weather_code[i])[0] + '</span><span class="mono">' +
          Math.round(d.temperature_2m_max[i]) + "° / " + Math.round(d.temperature_2m_min[i]) + "°</span>" +
          (d.precipitation_probability_max && d.precipitation_probability_max[i] != null ? '<span class="note">💧' + d.precipitation_probability_max[i] + "%</span>" : "") + "</div>";
      }).join("");
      ctx.box.innerHTML = '<div class="wx-now"><span class="wx-big">' + w[0] + '</span><span class="lg mono">' + Math.round(c.temperature_2m) + "°</span>" +
        '<span class="sm">' + esc(w[1]) + " · ощущается " + Math.round(c.apparent_temperature) + "° · ветер " + num(c.wind_speed_10m) + " м/с</span></div>" +
        '<div class="wx-days">' + days + "</div>";
    },
    update: function () {},
    tick: function (ctx, now) { if (ctx.config().lat != null && ctx.loadedAt && now - ctx.loadedAt > 30 * MIN) Pult.types.weather.load(ctx); },
    sub: function (ctx) {
      var cfg = ctx.config();
      if (!ctx.wx) return cfg.city || "город не выбран";
      return cfg.city + " · " + Math.round(ctx.wx.current.temperature_2m) + "° " + wmo(ctx.wx.current.weather_code)[1];
    },
    today: function () { return []; },
    settings: function (ctx) {
      var inp = h('<input type="text" class="w-m" placeholder="Например, Екатеринбург">');
      inp.value = ctx.config().city || "";
      var el = h('<div class="bset"><label>Город </label><button class="tbtn" type="button">Найти и сохранить</button></div>');
      el.querySelector("label").appendChild(inp);
      el.querySelector("button").addEventListener("click", function () {
        var q = inp.value.trim();
        if (!q) return;
        fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&name=" + encodeURIComponent(q))
          .then(function (r) { return r.json(); })
          .then(function (j) {
            var r = j.results && j.results[0];
            if (!r) { u.toast("Город не найден"); return; }
            ctx.setConfig({ city: r.name, lat: Math.round(r.latitude * 100) / 100, lon: Math.round(r.longitude * 100) / 100 });
            u.toast("Город: " + r.name + (r.country ? ", " + r.country : ""));
          }).catch(function () { u.toast("Нет связи с сервисом погоды"); });
      });
      return el;
    }
  });

  [
    { group: "Инструменты", type: "clocks", title: "Мировые часы", desc: "Время в других городах — удобно для созвонов." },
    { group: "Инструменты", type: "stickies", title: "Стикеры", desc: "Цветные карточки для быстрых заметок.", wide: true },
    { group: "Инструменты", type: "calc", title: "Калькулятор и конвертер", desc: "Выражения с процентами и перевод единиц." },
    { group: "Инструменты", type: "qr", title: "QR-код", desc: "Ссылка или текст → QR-код, можно скачать." },
    { group: "Инструменты", type: "random", title: "Случайный выбор", desc: "Кубик, монетка, число или вариант из списка." },
    { group: "Инструменты", type: "weather", title: "Погода", desc: "Сейчас и на 5 дней (Open-Meteo, без ключа)." },
    { group: "Учёба", type: "pomodoro", title: "Помодоро", desc: "Таймер 25/5 со звуком и счётчиком за день." },
    { group: "Учёба", type: "links", title: "Материалы по предметам", desc: "Ссылки на лекции, файлы и записи, по группам." },
    { group: "Инструменты", type: "links", title: "Ссылки", desc: "Закладки с названиями и группами." }
  ].forEach(Pult.preset);
})();
