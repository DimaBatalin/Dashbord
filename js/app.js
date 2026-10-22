// App shell: theme, storage, layout editor, auth, export/import, reminders, live tick.
(function () {
  "use strict";

  var u = Pult.util;
  var $ = u.$, pad = u.pad, MIN = u.MIN, D = u.D, pMerge = u.pMerge, clone = u.clone, newId = u.newId,
    ensureIds = u.ensureIds, dayKey = u.dayKey, h = u.h, esc = u.esc, onEnter = u.onEnter, setTxt = u.setTxt, setW = u.setW,
    toast = u.toast, plural = u.plural, dueLabel = u.dueLabel, dueClass = u.dueClass;
  var TYPES = Pult.types;

  var V1_KEYS = ["homework", "habits", "bills", "movies"];
  var userName = "";

  // Firebase config comes from firebase-config.js (not in the repo; generated on deploy).
  // Without it the app runs fully offline.
  var FIREBASE_CONFIG = window.FIREBASE_CONFIG || null;
  var FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.5/";

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

  function loadFirebase() {
    return u.loadScript(FIREBASE_SDK + "firebase-app-compat.js")
      .then(function () { return u.loadScript(FIREBASE_SDK + "firebase-auth-compat.js"); })
      .then(function () { return u.loadScript(FIREBASE_SDK + "firebase-firestore-compat.js"); });
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
      { id: newId(), type: "today", title: "Сегодня", wide: true },
      { id: newId(), type: "deadlines", title: "Дедлайны", wide: true },
      { id: newId(), type: "habits", title: "Привычки", wide: false },
      { id: newId(), type: "payments", title: "Финансы и подписки", wide: false },
      { id: newId(), type: "list", title: "Посмотреть", wide: true }
    ];
  }
  // Converts data from the fixed-panel version into blocks.
  function migrateV1(src) {
    var lay = defaultLayout().filter(function (b) { return b.type !== "today"; }), patch = { layout: lay };
    lay.forEach(function (b, i) { patch["b_" + b.id] = ensureIds(src[V1_KEYS[i]]); });
    V1_KEYS.forEach(function (k) { patch[k] = null; });
    return patch;
  }

  /* ============================== layout ============================== */

  var store = null, data = {}, ctxs = {}, editing = false;
  var blocksEl = $("blocks");

  function layout() { return Array.isArray(data.layout) ? data.layout : []; }
  function saveLayout(lay) { store.set({ layout: lay }); }
  function findBlock(id) { return layout().filter(function (x) { return x.id === id; })[0]; }
  function itemsOf(b) { var v = data["b_" + b.id]; return v == null ? TYPES[b.type].empty() : v; }

  function makeCtx(b) {
    var type = TYPES[b.type], key = "b_" + b.id;
    var ctx = {
      id: b.id, type: b.type,
      block: function () { return findBlock(b.id) || b; },
      config: function () { return pMerge(clone(type.defaults || {}), (findBlock(b.id) || b).config || {}); },
      setConfig: function (p) { var cur = findBlock(b.id); updateBlock(b.id, { config: pMerge(clone((cur && cur.config) || {}), p) }); },
      items: function () { var v = data[key]; return v == null ? type.empty() : v; },
      save: function (v) { var p = {}; p[key] = v; store.set(p); },
      add: function (item) { ctx.save(ctx.items().concat([pMerge({ id: newId() }, item)])); },
      patch: function (itemId, p) {
        ctx.save(ctx.items().map(function (x) { return x.id === itemId ? pMerge(clone(x), p) : x; }));
      },
      remove: function (itemId) { ctx.save(ctx.items().filter(function (x) { return x.id !== itemId; })); }
    };

    var el = h('<section class="panel block" data-type="' + esc(b.type) + '">' +
      '<div class="p-head">' +
        '<div class="t"><h2></h2><span class="eyebrow"></span></div>' +
        '<div class="edit-tools">' +
          '<button class="ebtn drag" type="button" aria-label="Перетащить" title="Перетащить">⠿</button>' +
          '<button class="ebtn up" type="button" aria-label="Выше" title="Выше">↑</button>' +
          '<button class="ebtn down" type="button" aria-label="Ниже" title="Ниже">↓</button>' +
          '<button class="ebtn width" type="button" title="Ширина"></button>' +
          '<button class="ebtn del" type="button" aria-label="Удалить блок" title="Удалить блок">✕</button>' +
        "</div></div>" +
      '<div class="block-settings"></div>' +
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
      updateBlock(b.id, { title: ctx.title.textContent.trim() || type.label });
    });
    el.querySelector(".up").addEventListener("click", function () { moveBlock(b.id, -1); });
    el.querySelector(".down").addEventListener("click", function () { moveBlock(b.id, 1); });
    ctx.widthBtn.addEventListener("click", function () {
      var cur = findBlock(b.id);
      updateBlock(b.id, { wide: !(cur && cur.wide) });
    });
    el.querySelector(".del").addEventListener("click", function () {
      var cur = findBlock(b.id);
      if (!window.confirm("Удалить блок «" + (cur ? cur.title : "") + "» вместе с записями?")) return;
      var p = { layout: layout().filter(function (x) { return x.id !== b.id; }) };
      p[key] = null;
      store.set(p);
    });
    initDrag(el.querySelector(".drag"), el);

    if (type.settings) {
      var st = type.settings(ctx);
      if (st) el.querySelector(".block-settings").appendChild(st);
    }
    type.mount(ctx);
    if (editing) ctx.title.contentEditable = "true";
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

  /* ---------- "new block" card ---------- */

  var addCard = h('<section class="panel add-card" aria-label="Новый блок">' +
    '<div class="p-head"><div class="t"><h2>Новый блок</h2><span class="eyebrow">выберите готовый вариант</span></div></div>' +
    '<div class="p-body"><div class="addf">' +
      '<select class="preset-sel" aria-label="Вид блока"></select>' +
      '<input class="grow" type="text" placeholder="Название (необязательно)" aria-label="Название блока">' +
      '<button class="addbtn" type="button">Добавить блок</button>' +
    '</div><div class="preset-desc"></div></div></section>');
  (function () {
    var sel = addCard.querySelector("select"), inp = addCard.querySelector("input"), desc = addCard.querySelector(".preset-desc");
    var ORDER = ["Обзор", "Работа", "Задачи и время", "Учёба", "Здоровье и привычки", "Деньги", "Дом и быт", "Личное", "Инструменты", "Свой блок"];
    var groups = {};
    Pult.presets.forEach(function (p, i) {
      if (!TYPES[p.type]) return;
      var g = p.group || "Другое";
      (groups[g] = groups[g] || []).push('<option value="' + i + '">' + esc(p.title) + "</option>");
    });
    Object.keys(groups).sort(function (a, b) {
      var ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    }).forEach(function (g) {
      var og = h('<optgroup label="' + esc(g) + '"></optgroup>');
      og.innerHTML = groups[g].join("");
      sel.appendChild(og);
    });
    var paintDesc = function () { var p = Pult.presets[+sel.value]; desc.textContent = p && p.desc ? p.desc : ""; };
    sel.addEventListener("change", paintDesc);
    paintDesc();
    var add = function () {
      var p = Pult.presets[+sel.value];
      if (!p) return;
      var b = { id: newId(), type: p.type, title: inp.value.trim() || p.title, wide: !!p.wide };
      if (p.config) b.config = clone(p.config);
      saveLayout(layout().concat([b]));
      inp.value = "";
      toast("Блок «" + b.title + "» добавлен в конец");
    };
    addCard.querySelector("button").addEventListener("click", add);
    onEnter(inp, add);
  })();

  /* ---------- render ---------- */

  var prevJson = {}, prevCfg = {};
  function render() {
    var lay = layout(), seen = {};
    lay.forEach(function (b) {
      var type = TYPES[b.type];
      if (!type) return;
      seen[b.id] = true;
      var ctx = ctxs[b.id], cfg = JSON.stringify(b.config || null);
      // a changed config (e.g. journal columns) rebuilds the block
      if (ctx && (ctx.type !== b.type || prevCfg[b.id] !== cfg)) { ctx.el.remove(); ctx = null; }
      if (!ctx) { ctx = ctxs[b.id] = makeCtx(b); prevJson[b.id] = undefined; prevCfg[b.id] = cfg; }
      if (document.activeElement !== ctx.title) setTxt(ctx.title, b.title || type.label);
      ctx.el.classList.toggle("wide", !!b.wide);
      ctx.widthBtn.textContent = b.wide ? "½" : "↔";
      ctx.widthBtn.setAttribute("aria-label", b.wide ? "Половина ширины" : "Вся ширина");
      var j = JSON.stringify(data["b_" + b.id]);
      // overview blocks read other blocks, so they redraw on any change
      if (prevJson[b.id] !== j || type.global) { prevJson[b.id] = j; type.update(ctx); }
    });
    Object.keys(ctxs).forEach(function (id) {
      if (!seen[id]) { ctxs[id].el.remove(); delete ctxs[id]; delete prevJson[id]; delete prevCfg[id]; }
    });
    // Re-order DOM only when needed: moving a node would steal focus from inputs inside it.
    var want = lay.filter(function (b) { return ctxs[b.id]; }).map(function (b) { return ctxs[b.id].el; });
    var have = Array.prototype.filter.call(blocksEl.children, function (n) { return n.classList.contains("block"); });
    if (want.length !== have.length || want.some(function (el, i) { return have[i] !== el; })) {
      want.forEach(function (el) { blocksEl.appendChild(el); });
    }
    if (editing) blocksEl.appendChild(addCard); else addCard.remove();
    var nb = blocksEl.querySelector(".no-blocks");
    if (!lay.length && !editing) {
      if (!nb) blocksEl.appendChild(h('<div class="no-blocks">Блоков нет — нажмите «Настроить», чтобы добавить.</div>'));
    } else if (nb) nb.remove();
    tick();
  }

  function commitTitles() {
    var changed = false;
    var lay = layout().map(function (b) {
      var ctx = ctxs[b.id];
      if (!ctx) return b;
      var t = ctx.title.textContent.trim() || TYPES[b.type].label;
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
    if (on) toast("Перетаскивайте блоки за ⠿, нажмите на заголовок, чтобы переименовать");
  }
  $("editBtn").addEventListener("click", function () { setEditing(!editing); });

  function onData(d) {
    data = d || {};
    if (!Array.isArray(data.layout)) {
      store.set(hasV1(data) ? migrateV1(data) : { layout: defaultLayout() });
      return;
    }
    render();
  }

  function setStore(s) {
    if (store && store.stop) { try { store.stop(); } catch (e) {} }
    Object.keys(ctxs).forEach(function (id) { ctxs[id].el.remove(); });
    ctxs = {}; prevJson = {}; prevCfg = {};
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
  function unlockAudio() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  document.addEventListener("pointerdown", unlockAudio, { once: true });
  $("notifyBtn").addEventListener("click", function () {
    if (!("Notification" in window)) { toast("Браузер не поддерживает уведомления"); return; }
    unlockAudio();
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

  // Immediate notice from a block (e.g. pomodoro phase end).
  function notify(text, tag) {
    toast(text);
    if (notifyOn) showSystem("Пульт дня", text, tag || "notice");
    beep();
  }

  function collectReminders(nowMs) {
    var out = [];
    layout().forEach(function (b) {
      var type = TYPES[b.type];
      if (!type || !type.reminders) return;
      (type.reminders(itemsOf(b), b, nowMs) || []).forEach(function (r) {
        out.push({ key: b.id + ":" + r.key, text: r.text });
      });
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

  /* ============================ block API ============================ */
  // What blocks may use to read or change other blocks (overview, menu → shopping).

  Pult.api = {
    layout: layout,
    itemsOf: itemsOf,
    findBlock: findBlock,
    blocksOfType: function (type) { return layout().filter(function (b) { return b.type === type; }); },
    saveBlock: function (id, v) { var p = {}; p["b_" + id] = v; store.set(p); },
    addBlock: function (b) { var nb = pMerge({ id: newId(), wide: false }, b); saveLayout(layout().concat([nb])); return nb; },
    notify: notify
  };

  /* ============================== greeting ============================== */

  function paintGreeting() {
    var hr = new Date().getHours();
    var part = hr < 5 ? "Доброй ночи" : hr < 12 ? "Доброе утро" : hr < 18 ? "Добрый день" : "Добрый вечер";
    setTxt($("greeting"), userName ? part + ", " + userName : part);
  }

  /* ============================== live tick ============================== */

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
    setTxt(E.dateline, u.DAYS[now.getDay()] + ", " + now.getDate() + " " + months[now.getMonth()] + " " + now.getFullYear());
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
      var ctx = ctxs[b.id], type = TYPES[b.type];
      if (!ctx) return;
      try {
        setTxt(ctx.sub, type.sub(ctx, nowMs));
        if (type.tick) type.tick(ctx, nowMs);
      } catch (err) { console.error(b.type, err); }
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
