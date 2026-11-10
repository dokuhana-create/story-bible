/* Story Bible on the phone. The bible lives only on this phone (IndexedDB); nothing is sent anywhere. The laptop
   writes "Story Bible (pocket).json" into OneDrive; Load / Update reads it through the Files app. A note goes to
   your Shortcut, which saves it in the inbox folder the laptop reads. */
(function () {
  "use strict";
  var APP = "story-bible-pocket";
  var VERSION = 5, BUILT = "9 November 2026";        /* (the same number ends sw.js's CACHE name) */
  var MARKS = { "Characters": "\u25cf", "Locations": "\u25b2", "Magic & Rules": "\u2726", "Factions": "\u25a0",
    "Items": "\u25c6", "Timeline": "\u25ac", "Never Contradict": "\u25cb", "Glossary": "\u2022" };
  var app = document.getElementById("app");
  var bible = null, byId = {}, anchors = {};

  /* ---------- storage: the bible in IndexedDB, small choices in localStorage ---------- */
  function db() {
    return new Promise(function (ok, no) {
      var r = indexedDB.open("storybible", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { no(r.error); };
    });
  }
  function dbGet(key) {
    return db().then(function (d) {
      return new Promise(function (ok, no) {
        var q = d.transaction("kv").objectStore("kv").get(key);
        q.onsuccess = function () { ok(q.result); };
        q.onerror = function () { no(q.error); };
      });
    });
  }
  function dbPut(key, value) {
    return db().then(function (d) {
      return new Promise(function (ok, no) {
        var t = d.transaction("kv", "readwrite");
        if (value === undefined) t.objectStore("kv").delete(key); else t.objectStore("kv").put(value, key);
        t.oncomplete = function () { ok(); };
        t.onerror = function () { no(t.error); };
      });
    });
  }
  function pref(key, fallback) {
    try { var v = localStorage.getItem("sb." + key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function setPref(key, value) {
    try { localStorage.setItem("sb." + key, JSON.stringify(value)); } catch (e) { /* (private mode: not kept) */ }
  }

  /* ---------- small helpers: elements are built with text only, never HTML ---------- */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "on") for (var ev in attrs.on) n.addEventListener(ev, attrs.on[ev]);
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function svgIcon(path) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("width", "20"); s.setAttribute("height", "20"); s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.8");
    s.setAttribute("aria-hidden", "true");
    path.split("|").forEach(function (d) {
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d); s.appendChild(p);
    });
    return s;
  }
  var ICON = { back: "M15 5l-7 7 7 7", pen: "M4 20h4L19 9l-4-4L4 16z|M14 6l4 4", gear: "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6|M12 2v3|M12 19v3|M2 12h3|M19 12h3|M5 5l2 2|M17 17l2 2|M5 19l2-2|M17 7l2-2", up: "M6 15l6-6 6 6" };
  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function mark(cat) { return MARKS[cat] || "\u25cf"; }
  function go(hash) { location.hash = hash; }
  function toast(text) {
    var t = el("div", { "class": "toast", role: "status", text: text });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function when(sec) {
    var d = new Date(sec * 1000), now = new Date();
    var time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return "today " + time;
    return d.toLocaleDateString([], { day: "numeric", month: "short" }) + " " + time;
  }

  /* ---------- the theme: as the phone is set, Pearl or Dark ---------- */
  function applyTheme() { document.documentElement.setAttribute("data-theme", pref("theme", "auto")); }

  /* ---------- loading a bible file from Files (OneDrive) ---------- */
  var fileInput = document.getElementById("file");
  function pickFile() { fileInput.value = ""; fileInput.click(); }
  fileInput.addEventListener("change", function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var data;
      try { data = JSON.parse(r.result); } catch (e) { data = null; }
      if (!data || data.app !== APP || !Array.isArray(data.entries)) {
        toast("That isn\u2019t a pocket file. Choose \u201c(pocket).json\u201d beside your bible.");
        return;
      }
      dbPut("bible", data).then(function () {
        use(data);
        toast("Loaded: " + data.entries.length + " entries, from " + when(data.made));
        go("#/");
        render();
      }, function () { toast("This phone wouldn\u2019t keep it (storage full?)."); });
    };
    r.onerror = function () { toast("The file couldn\u2019t be read. In Files, open it once so it downloads, then try again."); };
    r.readAsText(f);
  });
  function use(data) {
    bible = data; byId = {}; anchors = data.anchors || {}; markedCats = {};
    data.entries.forEach(function (e) { byId[e.id] = e; if (isMain(e)) markedCats[e.c] = true; });
  }

  /* ---------- Main only: as on the laptop, the marked stay in view; in a category with marks, the rest wait for a
     search. A category with nothing marked shows in full, and so does a file from before the marks came along. ---------- */
  var markedCats = {};
  function isMain(e) { return e.i === "main" || e.i === "major"; }
  function outOfView(e) { return pref("mainOnly", true) !== false && markedCats[e.c] && !isMain(e) && !e.pin; }

  /* ---------- search: the name itself, then names that start with it, other names, then mentions ---------- */
  function plain(e) {
    if (e._plain === undefined) e._plain = norm(e.b.map(function (p) { return typeof p === "string" ? p : p[0]; }).join(""));
    return e._plain;
  }
  function search(q) {
    var w = norm(q), hits = [];
    if (!w) return hits;
    bible.entries.forEach(function (e) {
      var t = norm(e.t), r = 0;
      if (t === w) r = 1;
      else if (t.indexOf(w) === 0) r = 2;
      else if (t.indexOf(w) >= 0) r = 3;
      else if ((e.a || []).some(function (a) { return norm(a).indexOf(w) >= 0; })) r = 4;
      else if ((e.g || []).some(function (g) { return norm(g) === w.replace(/^#/, ""); })) r = 4;
      else if (plain(e).indexOf(w) >= 0) r = 5;
      if (r) hits.push([r, e]);
    });
    hits.sort(function (a, b) { return a[0] - b[0] || a[1].t.localeCompare(b[1].t); });
    return hits.map(function (h) { return h[1]; });
  }
  function itemRow(e, sub) {
    return el("a", { "class": "item", href: "#/e/" + encodeURIComponent(e.id) }, [
      el("span", { "class": "mark", "aria-hidden": "true", text: mark(e.c) }),
      el("span", { "class": "t" }, [e.t, sub ? el("span", { "class": "s", text: sub }) : null]),
      el("span", { "class": "k", text: e.c })]);
  }

  /* ---------- the screens ---------- */
  function screenWelcome(update) {
    app.className = "welcome";
    var t = pref("theme", "auto");
    var dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    var book = el("img", { src: dark ? "book-dark.png" : "book-light.png", alt: "", width: "140", height: "102" });
    return [
      book,
      el("h1", { text: update ? "Update your bible" : "Your bible, in your pocket" }),
      el("p", { "class": "muted", text: "It lives only on this phone. Nothing about your story is sent anywhere." }),
      el("button", { "class": "primary", type: "button", on: { click: pickFile } },
        [update ? "Choose the newer file" : "Load my bible"]),
      el("div", { "class": "card steps" }, [
        el("strong", { text: "Where to find it" }),
        el("ol", {}, [
          el("li", {}, ["Tap ", el("b", { text: update ? "Choose the newer file" : "Load my bible" }), ", then ", el("b", { text: "Browse" }), "."]),
          el("li", { text: "OneDrive \u203a Documents \u203a Scrivener \u203a Story Bible." }),
          el("li", {}, ["Choose ", el("b", { text: "Story Bible (pocket).json" }), "."])])]),
      el("p", { "class": "muted small", text: "The laptop writes that file when you close the bible, with \u201cThe bible in your pocket\u201d on (Tools \u203a Files and backups \u203a Phone)." }),
      bible ? el("button", { "class": "soft", type: "button", on: { click: function () { go("#/"); } } }, ["Back"]) : null];
  }

  /* ---------- where you left off: the scene last written in, as the laptop knew it ---------- */
  function leftOffCard() {
    var n = bible.now;
    if (!n || !n.title || pref("leftOffHidden", 0) === bible.made) return null;
    var head = (n.chapter !== null && n.chapter !== undefined ? "Ch " + n.chapter + " · " : "") + n.title;
    var kids = [
      el("div", { "class": "row" }, [
        el("span", { "class": "cap", text: "Where you left off" + (n.t ? " · " + when(n.t) : "") }),
        el("span", { "class": "spacer" }),
        el("button", { "class": "plain", type: "button", "aria-label": "Hide until the next update",
          on: { click: function () { setPref("leftOffHidden", bible.made); render(); } } }, ["✕"])]),
      el("div", { "class": "serif now-title", text: head + (n.status ? "  " : "") },
        n.status ? [el("span", { "class": "small muted", text: n.status })] : [])];
    if (n.text) kids.push(el("p", { "class": "now-text muted", text: n.text }));
    var names = (n.names || []).filter(function (id) { return byId[id]; });
    if (names.length) kids.push(el("div", { "class": "now-names" }, names.map(function (id) {
      return el("a", { href: "#/e/" + encodeURIComponent(id), text: byId[id].t });
    })));
    return el("section", { "class": "card now", "aria-label": "Where you left off" }, kids);
  }

  function screenHome() {
    app.className = "";
    var q = el("input", { type: "search", id: "q", placeholder: "Search names, places, anything", autocomplete: "off",
      "aria-label": "Search your bible", enterkeyhint: "search" });
    q.value = pref("q", "");
    var results = el("div", {});
    var body = el("div", { style: "display:flex;flex-direction:column;gap:14px" });
    function fill() {
      setPref("q", q.value);
      results.textContent = "";
      var w = q.value.trim();
      body.style.display = w ? "none" : "flex";
      if (!w) return;
      var hits = search(w);
      if (!hits.length) { results.appendChild(el("p", { "class": "empty", text: "Nothing here answers to \u201c" + w + "\u201d yet." })); return; }
      results.appendChild(el("div", { "class": "list" }, hits.slice(0, 60).map(function (e) { return itemRow(e); })));
    }
    q.addEventListener("input", fill);
    var counts = {};
    bible.entries.forEach(function (e) { if (!outOfView(e)) counts[e.c] = (counts[e.c] || 0) + 1; });
    var tiles = bible.cats.map(function (c) {
      return el("a", { "class": "tile", href: "#/c/" + encodeURIComponent(c) }, [
        el("span", { "class": "mark", "aria-hidden": "true", text: mark(c) }),
        el("span", { "class": "name", text: c }), el("span", { "class": "n", text: String(counts[c] || 0) })]);
    });
    if (bible.drawn) tiles.push(el("a", { "class": "tile", href: "#/maps" }, [
      el("span", { "class": "mark", "aria-hidden": "true", text: "\u2756" }), el("span", { "class": "name", text: "Maps" })]));
    if (bible.outline) tiles.push(el("a", { "class": "tile", href: "#/outline" }, [
      el("span", { "class": "mark", "aria-hidden": "true", text: "\u2767" }), el("span", { "class": "name", text: "Outline" })]));
    var left = leftOffCard();
    if (left) body.appendChild(left);
    body.appendChild(el("div", { "class": "tiles" }, tiles));
    var recent = pref("recent", []).filter(function (id) { return byId[id]; }).slice(0, 6);
    if (recent.length) {
      body.appendChild(el("div", { "class": "cap", text: "Recently opened" }));
      body.appendChild(el("div", { "class": "list" }, recent.map(function (id) { return itemRow(byId[id]); })));
    }
    setTimeout(fill, 0);
    return [
      el("div", { "class": "row" }, [el("h1", { text: bible.title || "Story Bible" }), el("span", { "class": "spacer" }),
        noteButton(null)]),
      q, results, body,
      el("div", { "class": "foot" }, [
        el("span", { text: "From the laptop: " + when(bible.made) + (bible.safe ? " \u00b7 spoiler-safe" : "") }),
        el("span", { "class": "row" }, [
          el("button", { "class": "plain", type: "button", on: { click: function () { go("#/load"); } } }, ["Update"]),
          el("button", { "class": "plain", type: "button", "aria-label": "Settings", on: { click: function () { go("#/settings"); } } }, [svgIcon(ICON.gear)])])])];
  }

  function noteButton(e) {
    return el("button", { "class": "icon accent", type: "button", "aria-label": "Quick note",
      on: { click: function () { openNote(e); } } }, [svgIcon(ICON.pen)]);
  }
  function topBar(label) {
    return el("div", { "class": "top" }, [
      el("button", { "class": "plain", type: "button", "aria-label": "Back", on: { click: back } }, [svgIcon(ICON.back)]),
      el("span", { "class": "where", text: label || "" })]);
  }
  function back() { if (history.length > 1) history.back(); else go("#/"); }

  function screenCategory(cat, showAll) {
    app.className = "";
    var list = bible.entries.filter(function (e) { return e.c === cat; })
      .sort(function (a, b) { return a.t.localeCompare(b.t); });
    function rows(some) {
      return el("div", { "class": "list" }, some.map(function (e) { return itemRow(e, (e.a || []).length ? "also " + e.a.join(", ") : ""); }));
    }
    var head = [topBar(""), el("h1", {}, [el("span", { "aria-hidden": "true", style: "color:var(--link);font-family:var(--sans);font-size:22px;margin-right:8px", text: mark(cat) }), cat])];
    var inView = list.filter(function (e) { return !outOfView(e); });
    if (showAll || inView.length === list.length) {
      return head.concat([list.length ? rows(list) : el("p", { "class": "empty", text: "No " + cat + " yet." })]);
    }
    [["Main", function (e) { return e.i === "main"; }], ["Major", function (e) { return e.i === "major"; }],
      ["Pinned", function (e) { return !isMain(e); }]].forEach(function (group) {
      var some = inView.filter(group[1]);
      if (some.length) head.push(el("div", { "class": "cap", text: group[0] }), rows(some));
    });
    head.push(el("button", { "class": "soft", type: "button", on: { click: function () { go("#/c/" + encodeURIComponent(cat) + "/all"); } } }, ["Show all " + list.length]));
    return head;
  }

  function bodyNodes(e) {
    // the text with its links; a 'Label:' at the start of a line in bold
    var box = el("div", { "class": "body" }), atLine = true;
    e.b.forEach(function (p) {
      if (typeof p !== "string") {
        var t = p[1] && byId[p[1]];
        box.appendChild(t ? el("a", { href: "#/e/" + encodeURIComponent(t.id), text: p[0] })
          : el("a", { "class": "missing", text: p[0] }));
        atLine = false;
        return;
      }
      var re = /(^|\n)([^\n:\[\]]{1,40}:)/g, last = 0, m;
      while ((m = re.exec(p))) {
        var start = m.index + m[1].length;
        if (m[1] === "" && !(m.index === 0 && atLine)) continue;
        addText(box, p.slice(last, start));
        box.appendChild(el("b", { text: m[2] }));
        last = start + m[2].length;
      }
      addText(box, p.slice(last));
      atLine = /\n$/.test(p);
    });
    return box;
  }

  function addText(box, text) {
    // plain words, with web addresses you can tap (they open in Safari)
    var re = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g, last = 0, m;
    while ((m = re.exec(text))) {
      box.appendChild(document.createTextNode(text.slice(last, m.index)));
      box.appendChild(el("a", { href: m[0], target: "_blank", rel: "noopener noreferrer", text: m[0] }));
      last = m.index + m[0].length;
    }
    box.appendChild(document.createTextNode(text.slice(last)));
  }

  function region(e) {
    // where a place lies: its Region: link, then that one's ...
    var out = [], seen = {}, cur = e;
    while (cur && out.length < 5) {
      var found = null;
      for (var i = 0; i < cur.b.length - 1; i++) {
        var p = cur.b[i], n = cur.b[i + 1];
        if (typeof p === "string" && /(^|\n)\s*Region:\s*$/i.test(p) && typeof n !== "string" && n[1] && byId[n[1]]) { found = byId[n[1]]; break; }
      }
      if (!found || seen[found.id]) break;
      seen[found.id] = 1; out.unshift(found.t); cur = found;
    }
    return out.join(" \u203a ");
  }

  function screenEntry(id) {
    app.className = "";
    var e = byId[id];
    if (!e) return [topBar(""), el("p", { "class": "empty", text: "That entry isn\u2019t in this copy of your bible." })];
    var recent = pref("recent", []).filter(function (x) { return x !== id; });
    recent.unshift(id); setPref("recent", recent.slice(0, 12));
    var out = [topBar(region(e)),
      el("div", { "class": "row" }, [el("div", { "class": "kind" }, [
        el("span", { "aria-hidden": "true", style: "color:var(--link)", text: mark(e.c) }), e.c]),
        el("span", { "class": "spacer" }), noteButton(e)]),
      el("h1", { text: e.t })];
    if ((e.a || []).length) out.push(el("div", { "class": "aka", text: "also " + e.a.join(", ") }));
    if ((e.g || []).length) out.push(el("div", { "class": "tags" }, e.g.map(function (g) { return el("span", { text: "# " + g }); })));
    var card = el("div", { "class": "card" });
    if (e.p) card.appendChild(el("img", { "class": "face", alt: "", src: "data:image/jpeg;base64," + e.p }));
    card.appendChild(bodyNodes(e));
    out.push(card);
    (e.maps || []).forEach(function (m) {
      var box = el("div", { "class": "map" }, [el("img", { alt: "The map of " + e.t, src: "data:image/jpeg;base64," + m.img })]);
      m.pins.forEach(function (p) {
        var t = byId[p.id];
        if (!t) return;
        box.appendChild(el("button", { "class": "pin", type: "button", "aria-label": t.t,
          style: "left:" + (p.x * 100).toFixed(2) + "%;top:" + (p.y * 100).toFixed(2) + "%",
          on: { click: function () { go("#/e/" + encodeURIComponent(t.id)); } } }));
      });
      out.push(box);
    });
    var men = (e.m || []).map(function (x) { return byId[x]; }).filter(Boolean);
    if (men.length) {
      out.push(el("div", { "class": "cap", text: "Mentioned in " + men.length + (men.length === 1 ? " entry" : " entries") }));
      out.push(el("div", { "class": "list" }, men.map(function (x) { return itemRow(x); })));
    }
    return out;
  }

  function cleanSvg(text) {
    // the relationship map and family tree, drawn by the laptop: kept only as shapes, words and links
    var doc = new DOMParser().parseFromString(text, "image/svg+xml");
    var svg = doc.documentElement;
    if (!svg || svg.nodeName !== "svg") return null;
    var ok = { svg: 1, line: 1, circle: 1, text: 1, a: 1, g: 1, path: 1 };
    (function walk(n) {
      Array.prototype.slice.call(n.children).forEach(function (c) {
        if (!ok[c.nodeName]) { c.remove(); return; }
        Array.prototype.slice.call(c.attributes).forEach(function (a) {
          var name = a.name.toLowerCase();
          if (name.indexOf("on") === 0 || name === "style" || (name === "href" && !/^#e\d+$/.test(a.value))) c.removeAttribute(a.name);
        });
        walk(c);
      });
    })(svg);
    Array.prototype.slice.call(svg.attributes).forEach(function (a) { if (a.name.toLowerCase().indexOf("on") === 0) svg.removeAttribute(a.name); });
    return document.importNode(svg, true);
  }

  function screenMaps() {
    app.className = "";
    var out = [topBar(""), el("h1", { text: "Maps" })];
    (bible.drawn || []).forEach(function (d) {
      var svg = cleanSvg(d.svg);
      if (!svg) return;
      svg.addEventListener("click", function (ev) {
        var a = ev.target.closest("a");
        if (!a) return;
        ev.preventDefault();
        var id = anchors[(a.getAttribute("href") || "").slice(1)];
        if (id) go("#/e/" + encodeURIComponent(id));
      });
      out.push(el("h2", { text: d.name }), el("div", { "class": "drawn" }, [svg]));
    });
    out.push(el("p", { "class": "muted small", text: "Slide sideways to see all of it; tap a name to open it." }));
    return out;
  }

  function screenOutline() {
    app.className = "";
    var box = el("div", { "class": "ol" });
    (bible.outline || []).forEach(function (l) {
      var line = el("div", { "class": "l" + l.lv + (l.note ? " note" : "") }, [l.t, l.tp ? el("span", { "class": "tp", text: l.tp }) : null]);
      box.appendChild(line);
      if (l.n) box.appendChild(el("div", { "class": "sub l" + Math.min(l.lv + 1, 3), text: l.n }));
      (l.rv || []).forEach(function (r) { box.appendChild(el("div", { "class": "sub l" + Math.min(l.lv + 1, 3), text: "\u25c7 " + r })); });
      if ((l.w || []).length) {
        var w = el("div", { "class": "sub l" + Math.min(l.lv + 1, 3) });
        l.w.forEach(function (id, i) {
          if (!byId[id]) return;
          if (i) w.appendChild(document.createTextNode(" \u00b7 "));
          w.appendChild(el("a", { href: "#/e/" + encodeURIComponent(id), text: byId[id].t }));
        });
        box.appendChild(w);
      }
    });
    return [topBar(""), el("h1", { text: "Outline" }), box];
  }

  function screenSettings() {
    app.className = "";
    function seg(label, key, choices, fallback, after) {
      var cur = pref(key, fallback);
      var buttons = choices.map(function (c) {
        return el("button", { type: "button", "aria-pressed": String(cur === c[0]), on: { click: function () {
          setPref(key, c[0]); if (after) after(); render(); } } }, [c[1]]);
      });
      return [el("div", { "class": "cap", text: label }), el("div", { "class": "seg", role: "group", "aria-label": label }, buttons)];
    }
    var sc = el("input", { type: "text", id: "sc", value: pref("shortcut", "To my bible"), autocomplete: "off", autocapitalize: "off" });
    sc.addEventListener("change", function () { setPref("shortcut", sc.value.trim() || "To my bible"); toast("Saved"); });
    return [topBar(""), el("h1", { text: "Settings" })]
      .concat(seg("Theme", "theme", [["auto", "Auto"], ["light", "Pearl"], ["dark", "Dark"]], "auto", applyTheme))
      .concat(Object.keys(markedCats).length ? seg("Main only", "mainOnly", [[true, "On"], [false, "Off"]], true).concat([
        el("p", { "class": "muted small", text: "On: a category you have marked opens on its Main and Major entries. Search always covers everything." })]) : [])
      .concat([el("div", { "class": "cap" }, [el("label", { "for": "sc", text: "Your Shortcut for notes" })]), sc,
        el("p", { "class": "muted small", text: "Notes go to this Shortcut, which saves them in the Story Bible inbox folder. In it, set Ask for Input\u2019s Default Answer to Shortcut Input, so the note comes in already written." }),
        el("div", { "class": "cap", text: "Your bible on this phone" }),
        el("p", { "class": "muted", text: bible ? bible.entries.length + " entries, from the laptop " + when(bible.made) + (bible.safe ? " (spoiler-safe)" : "") : "None yet." }),
        el("button", { "class": "soft", type: "button", on: { click: function () { go("#/load"); } } }, ["Load a newer file"]),
        el("button", { "class": "soft", type: "button", on: { click: function () {
          if (!confirm("Remove your bible from this phone? The laptop and OneDrive keep theirs.")) return;
          dbPut("bible", undefined).then(function () { bible = null; byId = {}; setPref("recent", []); go("#/"); render(); });
        } } }, ["Remove it from this phone"]),
        el("div", { "class": "cap", text: "This app" }),
        el("p", { "class": "muted", text: "Version " + VERSION + " \u00b7 " + BUILT })]);
  }

  /* ---------- a quick note, through your Shortcut ---------- */
  var dlg = document.getElementById("note"), noteText = document.getElementById("note-text");
  function openNote(e) {
    dlg.dataset.about = e ? e.t : "";
    document.getElementById("note-about").textContent = e ? "About " + e.t + " (the entry you were reading)" : "What would you like to keep?";
    document.getElementById("note-help").textContent = "Your Shortcut \u201c" + pref("shortcut", "To my bible") +
      "\u201d saves it to the inbox folder in OneDrive; the laptop files it into the Inbox entry next time the bible is open.";
    noteText.value = pref("draft", "");
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    setTimeout(function () { noteText.focus(); }, 60);
  }
  noteText.addEventListener("input", function () { setPref("draft", noteText.value); });
  document.getElementById("note-cancel").addEventListener("click", function () { dlg.close(); });
  document.getElementById("note-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var text = noteText.value.trim();
    if (!text) { dlg.close(); return; }
    var about = dlg.dataset.about;
    // (the entry's name first, with a dash: the phone names the note's file after its first words, and OneDrive
    // refuses a file whose name has a colon)
    var note = about && norm(text).indexOf(norm(about)) < 0 ? about + " — " + text : text;
    setPref("draft", "");
    dlg.close();
    location.href = "shortcuts://run-shortcut?name=" + encodeURIComponent(pref("shortcut", "To my bible")) +
      "&input=text&text=" + encodeURIComponent(note);
  });

  /* ---------- routing ---------- */
  function render() {
    var h = location.hash.replace(/^#\/?/, ""), parts = h.split("/"), screen;
    if (!bible || parts[0] === "load") screen = screenWelcome(!!bible);
    else if (parts[0] === "e") screen = screenEntry(decodeURIComponent(parts[1] || ""));
    else if (parts[0] === "c") screen = screenCategory(decodeURIComponent(parts[1] || ""), parts[2] === "all");
    else if (parts[0] === "maps") screen = screenMaps();
    else if (parts[0] === "outline") screen = screenOutline();
    else if (parts[0] === "settings") screen = screenSettings();
    else screen = screenHome();
    app.textContent = "";
    screen.forEach(function (n) { if (n) app.appendChild(n); });
    if (parts[0] !== "") window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", render);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

  applyTheme();
  dbGet("bible").then(function (data) { if (data && data.app === APP) use(data); render(); }, function () { render(); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () { /* (offline copy not kept) */ });
})();
