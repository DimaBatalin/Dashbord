(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var MIN = 60000, H = 3600000, D = 86400000;
  var V1_KEYS = ["homework", "habits", "bills", "movies"];
  var userName = "";

  // Firebase config comes from firebase-config.js (not in the repo; generated on deploy).
  // Without it the app runs fully offline.
  var FIREBASE_CONFIG = window.FIREBASE_CONFIG || null;
  var FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.5/";

  /* =============================== helpers =============================== */

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
  function money(n) { return "₽" + Number(n || 0).toLocaleString("ru-RU"); }
  function dayKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseDue(v) { if (!v) return 0; var p = v.split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 23, 0, 0).getTime(); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function h(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function onEnter(input, fn) { input.addEventListener("keydown", function (e) { if (e.key === "Enter") fn(); }); }
  function onActivate(el, fn) {
    el.addEventListener("click", fn);
    el.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); fn(); } });
  }
  function setTxt(el, v) { if (el._v !== v) { el._v = v; el.textContent = v; } }
  function setW(el, v) { if (el._w !== v) { el._w = v; el.style.width = v; } }

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
  function streak(log) {
    if (!log) return 0;
    var d = new Date();
    if (!log[dayKey(d)]) d.setDate(d.getDate() - 1);
    var s = 0;
    while (log[dayKey(d)]) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }

  /* ================================ toast ================================ */

  var toastTimer = 0;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 3500);
  }
  function onSaveError(err) {
    console.error(err);
    toast(navigator.onLine === false ? "Нет сети — изменения сохранятся позже" : "Не удалось сохранить изменения");
  }

  /* ================================ theme ================================ */

  var root = document.documentElement;
  function sysDark() { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
  function isDark() { var t = root.getAttribute("data-theme"); return t ? t === "dark" : sysDark(); }
  function paintTheme() {
    $("themeIcon").textContent = isDark() ? "☾" : "☀";
    $("themeLbl").textContent = isDark() ? "Тёмная" : "Светлая";
  }
  $("themeBtn").addEventListener("click", function () {
    var t = isDark() ? "light" : "dark";
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("daydeck:theme", t); } catch (e) {}
    paintTheme();
  });
  if (window.matchMedia) {
    try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintTheme); } catch (e) {}
  }
  paintTheme();

  /* ================================ store ================================ */
  // Data is a flat object: { layout: [...blocks], "b_<blockId>": items, ... }.
  // A store exposes subscribe(cb) and set(patch); a null value in the patch deletes the key.

  function lsGet(k) { try { var v = localStorage.getItem("daydeck:" + k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } }
  function readLocal() {
    var d = {}, lay = lsGet("layout");
    if (Array.isArray(lay)) {
      d.layout = lay;
      lay.forEach(function (b) { var v = lsGet("b_" + b.id); if (v != null) d["b_" + b.id] = v; });
    }
    V1_KEYS.forEach(function (k) { var v = lsGet(k); if (v != null) d[k] = v; });
    return d;
  }

  function localStore() {
    var cb = null;
    return {
      mode: "local",
      subscribe: function (f) { cb = f; f(readLocal()); },
      set: function (patch) {
        try {
          for (var k in patch) {
            if (patch[k] == null) localStorage.removeItem("daydeck:" + k);
            else localStorage.setItem("daydeck:" + k, JSON.stringify(patch[k]));
          }
        } catch (e) { onSaveError(e); }
        if (cb) cb(readLocal());
      }
    };
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error(src)); };
      document.head.appendChild(s);
    });
  }
  function loadFirebase() {
    return loadScript(FIREBASE_SDK + "firebase-app-compat.js")
      .then(function () { return loadScript(FIREBASE_SDK + "firebase-auth-compat.js"); })
      .then(function () { return loadScript(FIREBASE_SDK + "firebase-firestore-compat.js"); });
  }

  // One Firestore document per user; each block is its own field, so edits
  // to different blocks from two devices don't overwrite each other.
  function fbStore(fs, uid) {
    var ref = fs.collection("users").doc(uid), cache = {}, cb = null, first = true, unsub = null;
    function emit() { if (cb) cb(clone(cache)); }
    var api = {
      mode: "firebase",
      subscribe: function (f) {
        cb = f;
        unsub = ref.onSnapshot(function (snap) {
          var d = snap.exists ? (snap.data() || {}) : {};
          if (first) {
            first = false;
            var cloudEmpty = !Array.isArray(d.layout) && !hasV1(d);
            var local = readLocal();
            if (cloudEmpty && (Array.isArray(local.layout) || hasV1(local))) {
              cache = d;
              api.set(local);
              toast("Локальные записи перенесены в аккаунт");
              return;
            }
          }
          cache = d;
          emit();
        }, function (err) {
          console.error(err);
          toast("Нет доступа к облаку — проверьте правила Firestore");
        });
      },
      set: function (patch) {
        var out = {};
        for (var k in patch) {
          if (patch[k] == null) { delete cache[k]; out[k] = firebase.firestore.FieldValue.delete(); }
          else { cache[k] = clone(patch[k]); out[k] = patch[k]; }
        }
        emit();
        ref.set(out, { merge: true }).catch(onSaveError);
      },
      stop: function () { if (unsub) unsub(); }
    };
    return api;
  }

  /* ============================ default layout ============================ */

  function hasV1(d) { return V1_KEYS.some(function (k) { return Array.isArray(d[k]); }); }
  function defaultLayout() {
    return [
      { id: newId(), type: "deadlines", title: "Дедлайны", wide: true },
      { id: newId(), type: "habits", title: "Привычки", wide: false },
      { id: newId(), type: "payments", title: "Финансы и подписки", wide: false },
      { id: newId(), type: "list", title: "Посмотреть", wide: true }
    ];
  }
  // Converts data from the fixed-panel version into blocks.
  function migrateV1(src) {
    var lay = defaultLayout(), patch = { layout: lay };
    lay.forEach(function (b, i) { patch["b_" + b.id] = ensureIds(src[V1_KEYS[i]]); });
    V1_KEYS.forEach(function (k) { patch[k] = null; });
    return patch;
  }

  /* ============================== block types ============================== */
  // mount(ctx) builds the block body once; update(ctx) redraws it from ctx.items();
  // sub(ctx, now) returns the caption under the title; tick(ctx, now) runs every second.

  function rowX(onClick) {
    var b = h('<button class="row-x" type="button" aria-label="Удалить">×</button>');
    b.addEventListener("click", onClick);
    return b;
  }
  function emptyRow(list, text) { var e = h('<div class="empty"></div>'); e.textContent = text || "Пока пусто"; list.appendChild(e); }

  var BLOCK_TYPES = {
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
          onActivate(r.querySelector(".box"), function () { ctx.patch(t.id, { done: !t.done }); });
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
          '<div><div class="lg mono"></div><div class="sm">не оплачено</div></div>' +
          '<div class="right"><div class="lg accent mono"></div><div class="sm"></div></div></div>'));
        var f = h('<div class="addf">' +
          '<input class="grow" type="text" placeholder="Платёж" aria-label="Название">' +
          '<input class="num" type="number" min="0" step="1" placeholder="₽" aria-label="Сумма">' +
          '<input type="date" aria-label="Дата списания">' +
          '<button class="addbtn" type="button">Добавить</button></div>');
        var inp = f.querySelectorAll("input");
        var add = function () {
          var name = inp[0].value.trim();
          if (!name) return;
          ctx.add({ name: name, amt: +inp[1].value || 0, due: parseDue(inp[2].value) || (Date.now() + D), paid: false });
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
            '<div><div class="nm">' + esc(b.name) + "</div>" + (b.note ? '<div class="note">' + esc(b.note) + "</div>" : "") + "</div>" +
            '<div class="amt">' + money(b.amt) + "</div>" +
            '<div class="due" data-due="' + esc(b.due) + '"></div></div>');
          onActivate(r.querySelector(".paybox"), function () { ctx.patch(b.id, { paid: !b.paid }); });
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
        var lg = ctx.summ.querySelectorAll(".lg"), sm = ctx.summ.querySelectorAll(".sm");
        setTxt(lg[0], money(sum));
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
      mount: function (ctx) { BLOCK_TYPES.list.mount(ctx); },
      update: function (ctx) {
        var list = ctx.list, items = ctx.items().slice();
        items.sort(function (a, b) { return (!!a.done - !!b.done); });
        list.innerHTML = "";
        if (!items.length) emptyRow(list);
        items.forEach(function (t) {
          var r = h('<div class="row ck' + (t.done ? " done" : "") + '">' +
            '<div class="box" role="button" tabindex="0" aria-label="Готово">' + (t.done ? "✓" : "") + "</div>" +
            '<div class="tt">' + esc(t.title) + "</div></div>");
          onActivate(r.querySelector(".box"), function () { ctx.patch(t.id, { done: !t.done }); });
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
          t.addEventListener("click", function () { ctx.day = String(d); BLOCK_TYPES.schedule.update(ctx); });
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
        BLOCK_TYPES.schedule.tick(ctx, Date.now());
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
      empty: function () { return []; },
      mount: function (ctx) {
        var f = h('<div class="addf">' +
          '<input class="grow" type="text" placeholder="Событие" aria-label="Событие">' +
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
        items.sort(function (a, b) { return ((a.at < now) - (b.at < now)) || (a.at < now ? b.at - a.at : a.at - b.at); });
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
        BLOCK_TYPES.countdown.tick(ctx, now);
      },
      sub: function (ctx, now) {
        var next = null;
        ctx.items().forEach(function (e) { if (e.at > now && (!next || e.at < next.at)) next = e; });
        return next ? "ближайшее: " + next.title : (ctx.items().length ? "все события прошли" : "нет событий");
      },
      tick: function (ctx, now) {
        Array.prototype.forEach.call(ctx.list.querySelectorAll(".cd"), function (c) {
          var left = +c.getAttribute("data-at") - now;
          setTxt(c, left > 0 ? humanCd(left) : "прошло");
          c.parentNode.classList.toggle("past", left <= 0);
        });
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
          BLOCK_TYPES.expenses.update(ctx);
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
        if (ctx.dirty && !ctx.wrap.contains(document.activeElement)) { ctx.dirty = false; BLOCK_TYPES.table.update(ctx); }
      }
    }
  };
  var TYPE_ORDER = ["deadlines", "habits", "payments", "list", "checklist", "note", "schedule", "countdown", "expenses", "table"];
  var DSHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  var MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  var MONTHS_FULL = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  var DEFAULT_CATS = ["Еда", "Транспорт", "Развлечения", "Покупки", "Связь", "Здоровье", "Другое"];
  function toMin(t) { var p = String(t || "0:0").split(":"); return (+p[0] || 0) * 60 + (+p[1] || 0); }
  function lessonsOf(ctx, day) {
    return ((ctx.items().days || {})[day] || []).slice().sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
  }
  function monthItems(v, monthStart) {
    var d = new Date(monthStart), end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    return (v.items || []).filter(function (x) { return x.at >= monthStart && x.at < end; });
  }

  /* ============================== layout ============================== */

  var store = null, data = {}, ctxs = {}, editing = false;
  var blocksEl = $("blocks");

  function layout() { return Array.isArray(data.layout) ? data.layout : []; }
  function saveLayout(lay) { store.set({ layout: lay }); }

  function makeCtx(b) {
    var type = BLOCK_TYPES[b.type], key = "b_" + b.id;
    var ctx = {
      id: b.id, type: b.type,
      items: function () { var v = data[key]; return v == null ? type.empty() : v; },
      save: function (v) { var p = {}; p[key] = v; store.set(p); },
      add: function (item) { ctx.save(ctx.items().concat([pMerge({ id: newId() }, item)])); },
      patch: function (itemId, p) {
        ctx.save(ctx.items().map(function (x) { return x.id === itemId ? pMerge(clone(x), p) : x; }));
      },
      remove: function (itemId) { ctx.save(ctx.items().filter(function (x) { return x.id !== itemId; })); }
    };

    var el = h('<section class="panel block">' +
      '<div class="p-head">' +
        '<div class="t"><h2></h2><span class="eyebrow"></span></div>' +
        '<div class="edit-tools">' +
          '<button class="ebtn drag" type="button" aria-label="Перетащить" title="Перетащить">⠿</button>' +
          '<button class="ebtn up" type="button" aria-label="Выше" title="Выше">↑</button>' +
          '<button class="ebtn down" type="button" aria-label="Ниже" title="Ниже">↓</button>' +
          '<button class="ebtn width" type="button" title="Ширина"></button>' +
          '<button class="ebtn del" type="button" aria-label="Удалить блок" title="Удалить блок">✕</button>' +
        "</div></div>" +
      '<div class="p-body"></div></section>');
    el.dataset.id = b.id;
    ctx.el = el;
    ctx.title = el.querySelector("h2");
    ctx.sub = el.querySelector(".eyebrow");
    ctx.body = el.querySelector(".p-body");
    ctx.widthBtn = el.querySelector(".width");

    ctx.title.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); ctx.title.blur(); } });
    ctx.title.addEventListener("blur", function () {
      if (!editing) return;
      var t = ctx.title.textContent.trim() || type.label;
      updateBlock(b.id, { title: t });
    });
    el.querySelector(".up").addEventListener("click", function () { moveBlock(b.id, -1); });
    el.querySelector(".down").addEventListener("click", function () { moveBlock(b.id, 1); });
    ctx.widthBtn.addEventListener("click", function () {
      var cur = layout().filter(function (x) { return x.id === b.id; })[0];
      updateBlock(b.id, { wide: !(cur && cur.wide) });
    });
    el.querySelector(".del").addEventListener("click", function () {
      var cur = layout().filter(function (x) { return x.id === b.id; })[0];
      if (!window.confirm("Удалить блок «" + (cur ? cur.title : "") + "» вместе с записями?")) return;
      var p = { layout: layout().filter(function (x) { return x.id !== b.id; }) };
      p[key] = null;
      store.set(p);
    });
    initDrag(el.querySelector(".drag"), el);

    type.mount(ctx);
    return ctx;
  }

  function updateBlock(id, p) {
    saveLayout(layout().map(function (x) { return x.id === id ? pMerge(clone(x), p) : x; }));
  }
  function moveBlock(id, dir) {
    var lay = layout().slice(), i = lay.findIndex(function (x) { return x.id === id; }), j = i + dir;
    if (i < 0 || j < 0 || j >= lay.length) return;
    var t = lay[i]; lay[i] = lay[j]; lay[j] = t;
    saveLayout(lay);
  }

  // Drag by the handle with Pointer Events (mouse and touch).
  function initDrag(handle, el) {
    handle.addEventListener("pointerdown", function (e) {
      if (!editing) return;
      e.preventDefault();
      el.classList.add("dragging");
      function move(ev) {
        var over = document.elementFromPoint(ev.clientX, ev.clientY);
        var target = over && over.closest ? over.closest(".block") : null;
        if (!target || target === el || target.parentNode !== blocksEl) return;
        var nodes = Array.prototype.slice.call(blocksEl.querySelectorAll(".block"));
        blocksEl.insertBefore(el, nodes.indexOf(target) > nodes.indexOf(el) ? target.nextSibling : target);
      }
      // Listen on window: moving the block in the DOM drops pointer capture on the handle.
      function up() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        el.classList.remove("dragging");
        var order = Array.prototype.map.call(blocksEl.querySelectorAll(".block"), function (n) { return n.dataset.id; });
        var byId = {};
        layout().forEach(function (x) { byId[x.id] = x; });
        var lay = order.map(function (id) { return byId[id]; }).filter(Boolean);
        if (lay.map(function (x) { return x.id; }).join() !== layout().map(function (x) { return x.id; }).join()) saveLayout(lay);
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
  }

  var addCard = h('<section class="panel add-card" aria-label="Новый блок">' +
    '<div class="p-head"><div class="t"><h2>Новый блок</h2></div></div>' +
    '<div class="p-body"><div class="addf">' +
      '<select aria-label="Тип блока"></select>' +
      '<input class="grow" type="text" placeholder="Название (необязательно)" aria-label="Название блока">' +
      '<button class="addbtn" type="button">Добавить блок</button>' +
    "</div></div></section>");
  (function () {
    var sel = addCard.querySelector("select"), inp = addCard.querySelector("input");
    TYPE_ORDER.forEach(function (t) { sel.appendChild(h('<option value="' + t + '">' + BLOCK_TYPES[t].label + "</option>")); });
    sel.value = "list";
    var add = function () {
      var type = sel.value;
      saveLayout(layout().concat([{ id: newId(), type: type, title: inp.value.trim() || BLOCK_TYPES[type].label, wide: false }]));
      inp.value = "";
    };
    addCard.querySelector("button").addEventListener("click", add);
    onEnter(inp, add);
  })();

  var prevJson = {};
  function render() {
    var lay = layout(), seen = {};
    lay.forEach(function (b) {
      if (!BLOCK_TYPES[b.type]) return;
      seen[b.id] = true;
      var ctx = ctxs[b.id];
      if (!ctx || ctx.type !== b.type) { if (ctx) ctx.el.remove(); ctx = ctxs[b.id] = makeCtx(b); prevJson[b.id] = undefined; }
      if (document.activeElement !== ctx.title) setTxt(ctx.title, b.title || BLOCK_TYPES[b.type].label);
      ctx.el.classList.toggle("wide", !!b.wide);
      ctx.widthBtn.textContent = b.wide ? "½" : "↔";
      ctx.widthBtn.setAttribute("aria-label", b.wide ? "Половина ширины" : "Вся ширина");
      blocksEl.appendChild(ctx.el);
      var j = JSON.stringify(data["b_" + b.id]);
      if (prevJson[b.id] !== j) { prevJson[b.id] = j; BLOCK_TYPES[b.type].update(ctx); }
    });
    Object.keys(ctxs).forEach(function (id) {
      if (!seen[id]) { ctxs[id].el.remove(); delete ctxs[id]; delete prevJson[id]; }
    });
    if (editing) blocksEl.appendChild(addCard); else addCard.remove();
    if (!lay.length && !editing) {
      if (!blocksEl.querySelector(".no-blocks")) blocksEl.appendChild(h('<div class="no-blocks">Блоков нет — нажмите «Настроить», чтобы добавить.</div>'));
    } else {
      var nb = blocksEl.querySelector(".no-blocks");
      if (nb) nb.remove();
    }
    tick();
  }

  function commitTitles() {
    var changed = false;
    var lay = layout().map(function (b) {
      var ctx = ctxs[b.id];
      if (!ctx) return b;
      var t = ctx.title.textContent.trim() || BLOCK_TYPES[b.type].label;
      if (t === b.title) return b;
      changed = true;
      return pMerge(clone(b), { title: t });
    });
    if (changed) saveLayout(lay);
  }

  function setEditing(on) {
    if (!on) commitTitles();
    editing = on;
    document.body.classList.toggle("editing", on);
    $("editBtn").textContent = on ? "Готово" : "Настроить";
    Object.keys(ctxs).forEach(function (id) { ctxs[id].title.contentEditable = on ? "true" : "false"; });
    render();
  }
  $("editBtn").addEventListener("click", function () { setEditing(!editing); });

  function onData(d) {
    data = d || {};
    if (!Array.isArray(data.layout)) {
      store.set(hasV1(data) ? migrateV1(data) : { layout: defaultLayout() });
      return;
    }
    render();
    if (editing) Object.keys(ctxs).forEach(function (id) { ctxs[id].title.contentEditable = "true"; });
  }

  function setStore(s) {
    if (store && store.stop) { try { store.stop(); } catch (e) {} }
    Object.keys(ctxs).forEach(function (id) { ctxs[id].el.remove(); });
    ctxs = {}; prevJson = {};
    store = s;
    store.subscribe(function (d) { if (store === s) onData(d); });
  }

  /* ============================== auth ============================== */

  function startFirebase() {
    loadFirebase().then(function () {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      var auth = firebase.auth(), fs = firebase.firestore(), authBtn = $("authBtn");
      authBtn.hidden = false;
      authBtn.addEventListener("click", function () {
        if (auth.currentUser) { auth.signOut(); return; }
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function (err) {
          if (err && err.code === "auth/popup-blocked") {
            auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());
          } else if (err && err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
            console.error(err);
            toast("Не удалось войти");
          }
        });
      });
      auth.onAuthStateChanged(function (user) {
        if (user) {
          authBtn.textContent = "Выйти";
          authBtn.title = user.email || "";
          userName = (user.displayName || "").trim().split(/\s+/)[0] || "";
          setStore(fbStore(fs, user.uid));
        } else {
          authBtn.textContent = "Войти через Google";
          authBtn.title = "Синхронизация между устройствами";
          userName = "";
          setStore(localStore());
        }
        paintGreeting();
      });
    }).catch(function (err) {
      console.error(err);
      setStore(localStore());
    });
  }

  /* ========================== export / import ========================== */

  $("expBtn").addEventListener("click", function () {
    var out = { layout: layout() };
    layout().forEach(function (b) { if (data["b_" + b.id] != null) out["b_" + b.id] = data["b_" + b.id]; });
    var file = { app: "pult-dnya", version: 2, exportedAt: new Date().toISOString(), data: out };
    var blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "pult-dnya-" + dayKey(new Date()) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  });
  $("impBtn").addEventListener("click", function () { $("impFile").click(); });
  $("impFile").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var o;
      try { o = JSON.parse(rd.result); } catch (err) { window.alert("Не удалось прочитать файл."); return; }
      var patch = null;
      if (o && o.version === 2 && o.data && Array.isArray(o.data.layout)) patch = clone(o.data);
      else if (o && hasV1(o)) patch = migrateV1(o);
      if (!patch) { window.alert("Это не похоже на файл резервной копии."); return; }
      if (!window.confirm("Заменить текущие блоки и записи данными из файла?")) return;
      layout().forEach(function (b) { if (!("b_" + b.id in patch)) patch["b_" + b.id] = null; });
      store.set(patch);
      toast("Данные импортированы");
    };
    rd.readAsText(f);
    e.target.value = "";
  });

  /* ============================== reminders ============================== */
  // Checked once a minute while the app is open (or minimised as an installed app).
  // Without a server nothing can fire when the app is fully closed.

  var notifyOn = false, audioCtx = null, lastCheck = 0, firstCheck = true;
  try { notifyOn = localStorage.getItem("daydeck:notify") === "on" && "Notification" in window && Notification.permission === "granted"; } catch (e) {}

  function paintNotify() { $("notifyBtn").textContent = notifyOn ? "🔔 Напоминания" : "🔕 Напоминания"; }
  $("notifyBtn").addEventListener("click", function () {
    if (!("Notification" in window)) { toast("Браузер не поддерживает уведомления"); return; }
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    if (notifyOn) {
      notifyOn = false;
      toast("Напоминания выключены");
    } else if (Notification.permission === "denied") {
      toast("Уведомления запрещены в настройках браузера для этого сайта");
    } else {
      Notification.requestPermission().then(function (p) {
        notifyOn = p === "granted";
        try { localStorage.setItem("daydeck:notify", notifyOn ? "on" : "off"); } catch (e) {}
        paintNotify();
        toast(notifyOn ? "Напоминания включены" : "Разрешение не получено");
        if (notifyOn) beep();
      });
      return;
    }
    try { localStorage.setItem("daydeck:notify", notifyOn ? "on" : "off"); } catch (e) {}
    paintNotify();
  });
  paintNotify();

  function beep() {
    if (!audioCtx || document.hidden) return;
    try {
      if (audioCtx.state === "suspended") audioCtx.resume();
      [[880, 0], [1320, 0.16]].forEach(function (n) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + n[1];
        o.type = "sine"; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t); o.stop(t + 0.25);
      });
    } catch (e) {}
  }

  function showSystem(title, body, tag) {
    var opts = { body: body, tag: tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png" };
    var fallback = function () { try { new Notification(title, opts); } catch (e) {} };
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg && reg.showNotification) reg.showNotification(title, opts).catch(fallback); else fallback();
      }).catch(fallback);
    } else fallback();
  }

  function collectReminders(nowMs) {
    var out = [], now = new Date(nowMs), today = dayKey(now), hr = now.getHours();
    var tomorrow = new Date(nowMs); tomorrow.setDate(tomorrow.getDate() + 1);
    var tmr = dayKey(tomorrow);
    layout().forEach(function (b) {
      var v = data["b_" + b.id];
      if (v == null) return;
      if (b.type === "deadlines") {
        v.forEach(function (t) {
          if (t.done) return;
          var left = t.due - nowMs, key = b.id + ":" + t.id + ":" + t.due + ":";
          if (left <= 0 && left > -D) out.push({ key: key + "over", text: "Просрочено: " + t.title });
          else if (left > 0 && left <= H) out.push({ key: key + "1h", text: "Меньше часа: " + t.title });
          else if (left > H && left <= D) out.push({ key: key + "24h", text: "Срок сегодня-завтра: " + t.title });
        });
      } else if (b.type === "payments") {
        if (hr < 9) return;
        v.forEach(function (x) {
          if (x.paid) return;
          var dk = dayKey(new Date(x.due)), key = b.id + ":" + x.id + ":" + x.due + ":";
          if (dk === today) out.push({ key: key + "day", text: "Оплатить сегодня: " + x.name + " · " + money(x.amt) });
          else if (dk === tmr) out.push({ key: key + "pre", text: "Завтра платёж: " + x.name + " · " + money(x.amt) });
        });
      } else if (b.type === "habits") {
        if (hr < 20 || !v.length) return;
        var left = v.filter(function (x) { return !(x.log && x.log[today]); });
        if (left.length) out.push({ key: b.id + ":habits:" + today, text: "Привычки на сегодня: " + left.map(function (x) { return x.name; }).join(", ") });
      } else if (b.type === "countdown") {
        v.forEach(function (e) {
          if (dayKey(new Date(e.at)) === today && e.at > nowMs - D) out.push({ key: b.id + ":" + e.id + ":" + e.at + ":day", text: "Сегодня: " + e.title });
        });
      }
    });
    return out;
  }

  function checkReminders(nowMs) {
    if (!store || !Array.isArray(data.layout)) return;
    if (nowMs - lastCheck < MIN && !firstCheck) return;
    lastCheck = nowMs;
    var sent = {};
    try { sent = JSON.parse(localStorage.getItem("daydeck:sent") || "{}") || {}; } catch (e) {}
    for (var k in sent) if (nowMs - sent[k] > 7 * D) delete sent[k];
    var fresh = collectReminders(nowMs).filter(function (r) { return !sent[r.key]; });
    var wasFirst = firstCheck;
    firstCheck = false;
    if (!fresh.length) return;
    fresh.forEach(function (r) { sent[r.key] = nowMs; });
    try { localStorage.setItem("daydeck:sent", JSON.stringify(sent)); } catch (e) {}

    var summary = fresh.length > 2 || wasFirst;
    var title = summary ? fresh.length + " " + plural(fresh.length, "напоминание", "напоминания", "напоминаний") : "Пульт дня";
    var body = fresh.map(function (r) { return r.text; }).join("\n");
    toast(summary ? title + ": " + fresh[0].text + (fresh.length > 1 ? " и ещё " + (fresh.length - 1) : "") : fresh[0].text);
    if (notifyOn) {
      if (summary) showSystem(title, body, "summary");
      else fresh.forEach(function (r) { showSystem("Пульт дня", r.text, r.key); });
      beep();
    }
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
  }

  /* ============================== greeting ============================== */

  function paintGreeting() {
    var hr = new Date().getHours();
    var part = hr < 5 ? "Доброй ночи" : hr < 12 ? "Доброе утро" : hr < 18 ? "Добрый день" : "Добрый вечер";
    setTxt($("greeting"), userName ? part + ", " + userName : part);
  }

  /* ============================== live tick ============================== */

  var days = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  var dshort = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  var months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  var E = {};
  ["clock", "sec", "dateline", "dayBar", "dayPct", "weekBar", "weekPct", "hwMeter", "hwMeta", "hwBar",
    "habMeter", "habMeta", "habBar"].forEach(function (k) { E[k] = $(k); });
  var clockTxt = E.clock.firstChild;

  function tick() {
    var now = new Date(), nowMs = now.getTime();
    setTxt(clockTxt, pad(now.getHours()) + ":" + pad(now.getMinutes()));
    setTxt(E.sec, pad(now.getSeconds()));
    setTxt(E.dateline, days[now.getDay()] + ", " + now.getDate() + " " + months[now.getMonth()] + " " + now.getFullYear());
    paintGreeting();

    var sod = new Date(now); sod.setHours(0, 0, 0, 0);
    var sodMs = sod.getTime(), dp = (nowMs - sodMs) / D;
    setW(E.dayBar, (dp * 100).toFixed(1) + "%");
    setTxt(E.dayPct, Math.round(dp * 100) + "%");
    var dow = (now.getDay() + 6) % 7, wp = (dow * D + (nowMs - sodMs)) / (7 * D);
    setW(E.weekBar, (wp * 100).toFixed(1) + "%");
    setTxt(E.weekPct, dshort[now.getDay()] + " · " + Math.round(wp * 100) + "%");

    var chips = document.querySelectorAll(".due[data-due]");
    for (var i = 0; i < chips.length; i++) {
      var c = chips[i], ms = +c.getAttribute("data-due");
      var off = c.parentNode.classList.contains("done") || c.parentNode.classList.contains("paid");
      var txt = off ? "—" : dueLabel(ms), cls = off ? "due" : "due " + dueClass(ms);
      if (c._v !== txt) { c._v = txt; c.textContent = txt; }
      if (c._c !== cls) { c._c = cls; c.className = cls; }
    }

    // per-block captions and live parts; aggregate meters across blocks
    var dl = { n: 0, open: 0, soon: 0, has: false }, hb = { n: 0, today: 0, has: false }, tk = dayKey(now);
    layout().forEach(function (b) {
      var ctx = ctxs[b.id], type = BLOCK_TYPES[b.type];
      if (!ctx) return;
      setTxt(ctx.sub, type.sub(ctx, nowMs));
      if (type.tick) type.tick(ctx, nowMs);
      if (b.type === "deadlines") {
        dl.has = true;
        ctx.items().forEach(function (t) { dl.n++; if (!t.done) { dl.open++; if (t.due - nowMs < 7 * D) dl.soon++; } });
      } else if (b.type === "habits") {
        hb.has = true;
        ctx.items().forEach(function (x) { hb.n++; if (x.log && x.log[tk]) hb.today++; });
      }
    });
    E.hwMeter.hidden = !dl.has;
    setTxt(E.hwMeta, dl.n ? dl.soon + " шт." : "—");
    setW(E.hwBar, (dl.n ? (dl.n - dl.open) / dl.n * 100 : 0) + "%");
    E.habMeter.hidden = !hb.has;
    setTxt(E.habMeta, hb.n ? hb.today + " / " + hb.n : "—");
    setW(E.habBar, (hb.n ? hb.today / hb.n * 100 : 0) + "%");
    checkReminders(nowMs);
  }

  /* ================================ boot ================================ */

  tick();
  setInterval(tick, 1000);
  if (FIREBASE_CONFIG) startFirebase(); else setStore(localStore());

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function (err) { console.error(err); });
    });
  }
})();
