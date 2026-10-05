(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var MIN = 60000, H = 3600000, D = 86400000;
  var V1_KEYS = ["homework", "habits", "bills", "movies"];
  var userName = "";

  // Firebase web config is public by design; access is enforced by firestore.rules.
  // Set to null to run fully offline.
  var FIREBASE_CONFIG = {
    apiKey: "***",
    authDomain: "***.firebaseapp.com",
    projectId: "***",
    storageBucket: "***.firebasestorage.app",
    messagingSenderId: "***",
    appId: "1:***:web:46fe821fb90f25c8b710cd"
  };
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
  function emptyRow(list) { list.appendChild(h('<div class="empty">Пока пусто</div>')); }

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
    }
  };
  var TYPE_ORDER = ["deadlines", "habits", "payments", "list", "checklist", "note"];

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
