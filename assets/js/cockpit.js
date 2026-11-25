(function () {
  var root = document.querySelector(".cockpit");
  if (!root) return;

  var $ = function (sel) { return root.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };

  var frame = $(".cockpit-frame");
  var mapBase = root.dataset.mapBase;
  var mapOrigin = new URL(mapBase).origin;
  var indicatorSelect = $("[data-indicator]");
  var compareSelect = $("[data-compare]");
  var yearButtons = $$("[data-year]").filter(function (b) { return b.tagName === "BUTTON"; });
  var playButton = $("[data-play]");
  var radios = $$('input[name="variant"]');

  var params = new URLSearchParams(window.location.search);
  var state = {
    variant: params.get("variant") || root.dataset.variant,
    indicator: params.get("indicator") || root.dataset.indicator,
    year: params.get("jaar") || root.dataset.year,
    compare: params.get("vergelijk") || ""
  };

  var mapReady = false;
  var supportsReplace = false; // map-ready v2+: map-command understands "replace"
  var shown = { a: null, b: null }; // layer ids currently in the map

  function optionFor(select, value) {
    return Array.prototype.find.call(select.options, function (o) { return o.value === value; });
  }

  function yearsFor(indicator) {
    var opt = optionFor(indicatorSelect, indicator);
    return opt ? opt.dataset.years.split(" ") : [];
  }

  function variantLabel(id) {
    var r = radios.filter(function (x) { return x.value === id; })[0];
    return r ? r.dataset.label : id;
  }

  function yearLabel(key) {
    var b = yearButtons.filter(function (x) { return x.dataset.year === key; })[0];
    return b ? b.textContent.trim() : key;
  }

  function layerId(variant) {
    var years = yearsFor(state.indicator);
    var id = "nl2120_" + variant + "_" + state.indicator;
    return years.length > 1 ? id + "_" + state.year : id;
  }

  // Keep the state valid: unknown values fall back to the defaults, the year to one the indicator has.
  function normalise() {
    if (!optionFor(indicatorSelect, state.indicator)) state.indicator = root.dataset.indicator;
    if (!radios.some(function (r) { return r.value === state.variant; })) state.variant = root.dataset.variant;
    if (state.compare && (state.compare === state.variant || !optionFor(compareSelect, state.compare))) state.compare = "";
    var years = yearsFor(state.indicator);
    if (years.indexOf(state.year) < 0) state.year = years[years.length - 1];
  }

  function scenarioSummary() {
    return $$("[data-scenario]").map(function (g) {
      var on = g.querySelector('button[aria-pressed="true"]');
      if (!on) return "";
      var parts = on.dataset.summary.split(" – "); // "WLO 2025 – Hoog" → "WLO Hoog"
      return parts[0].split(" ")[0] + " " + parts[1].split(",")[0];
    }).filter(Boolean);
  }

  function render() {
    var years = yearsFor(state.indicator);
    indicatorSelect.value = state.indicator;
    compareSelect.value = state.compare;
    radios.forEach(function (r) { r.checked = r.value === state.variant; });
    Array.prototype.forEach.call(compareSelect.options, function (o) { o.disabled = o.value === state.variant; });

    var current = yearButtons.map(function (b) { return b.dataset.year; }).indexOf(state.year);
    yearButtons.forEach(function (b, i) {
      var available = years.indexOf(b.dataset.year) >= 0;
      b.disabled = !available;
      b.title = available ? "" : "Geen kaartlaag voor dit jaar";
      b.setAttribute("aria-pressed", String(b.dataset.year === state.year));
      b.parentNode.classList.toggle("past", i <= current);
    });
    $("[data-year-out]").textContent = yearLabel(state.year);
    $("[data-year-hint]").textContent = years.length > 1 ? "" : "Alleen eindbeeld " + yearLabel(years[0]);
    playButton.disabled = years.length < 2;

    $$("[data-for]").forEach(function (el) { el.hidden = el.dataset.for !== state.variant; });
    $("[data-variant-name]").textContent = variantLabel(state.variant);

    var label = optionFor(indicatorSelect, state.indicator).textContent;
    var chip = [label + " " + yearLabel(state.year), variantLabel(state.variant) + (state.compare ? " ↔ " + variantLabel(state.compare) : "")]
      .concat(scenarioSummary());
    $("[data-chip]").innerHTML = "";
    chip.forEach(function (t, i) {
      var s = document.createElement(i === 0 ? "strong" : "span");
      s.textContent = t;
      $("[data-chip]").appendChild(s);
    });

    var q = new URLSearchParams({ variant: state.variant, indicator: state.indicator, jaar: state.year });
    if (state.compare) q.set("vergelijk", state.compare);
    history.replaceState(null, "", window.location.pathname + "?" + q.toString());
  }

  function wanted() {
    return { a: layerId(state.variant), b: state.compare ? layerId(state.compare) : null };
  }

  function initialHash() {
    var w = wanted();
    var h = "zoom=" + root.dataset.zoom + "&center=" + root.dataset.center + "&cmd=add&map=a&layer=" + w.a;
    if (w.b) h += "&cmd=add&map=b&layer=" + w.b;
    shown = w;
    return h;
  }

  // Bring the map in line with the state: swap only the layers that changed.
  function syncMap() {
    var w = wanted();
    if (!mapReady) return;
    var commands = [];
    ["a", "b"].forEach(function (m) {
      if (shown[m] === w[m]) return;
      if (w[m] && shown[m] && supportsReplace) {
        // The map keeps the old layer until the new one has drawn: no flicker.
        commands.push({ cmd: "replace", map: m, layer: w[m], replaces: shown[m] });
        return;
      }
      // Older maps (map-ready v1): add + remove, which briefly shows the basemap.
      if (w[m]) commands.push({ cmd: "add", map: m, layer: w[m] });
      if (shown[m]) commands.push({ cmd: "remove", map: m, layer: shown[m] });
    });
    if (!commands.length) return;
    shown = w;
    frame.contentWindow.postMessage({ type: "map-command", commands: commands }, mapOrigin);
  }

  function update() {
    stopPlay();
    normalise();
    render();
    syncMap();
  }

  // Map handshake: hide the map's own navigation; the cockpit drives the layers.
  window.addEventListener("message", function (event) {
    if (event.source !== frame.contentWindow || event.origin !== mapOrigin) return;
    if (!event.data || event.data.type !== "map-ready") return;
    event.source.postMessage(
      { type: "map-config", navigation: false, searchbar: false, streetview: false, share: false, annotations: false },
      mapOrigin
    );
    mapReady = true;
    supportsReplace = (event.data.v || 1) >= 2;
    syncMap();
  });

  // Controls
  indicatorSelect.addEventListener("change", function () { state.indicator = this.value; update(); });
  compareSelect.addEventListener("change", function () {
    state.compare = this.value;
    // The second map brings its own legend in the lower right; make room for it.
    setCollapsed($(".panel-kenmerken"), !!state.compare);
    update();
  });
  radios.forEach(function (r) {
    r.addEventListener("change", function () { if (r.checked) { state.variant = r.value; update(); } });
  });
  yearButtons.forEach(function (b) {
    b.addEventListener("click", function () { state.year = b.dataset.year; update(); });
  });
  $$("[data-scenario]").forEach(function (g) {
    var out = g.querySelector("[data-summary-out]");
    g.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        g.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        out.textContent = b.dataset.summary;
        render();
      });
    });
  });

  // Play steps through the years the indicator has.
  var timer = null;
  function stopPlay() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    playButton.classList.remove("playing");
    playButton.setAttribute("aria-label", "Afspelen");
  }
  playButton.addEventListener("click", function () {
    if (timer) { stopPlay(); return; }
    playButton.classList.add("playing");
    playButton.setAttribute("aria-label", "Pauzeren");
    function step() {
      var years = yearsFor(state.indicator);
      state.year = years[(years.indexOf(state.year) + 1) % years.length];
      render();
      syncMap();
    }
    step();
    timer = setInterval(step, 2000);
  });

  // Collapsible panels
  function setCollapsed(panel, collapsed) {
    var b = panel.querySelector(".collapse");
    b.setAttribute("aria-expanded", String(!collapsed));
    b.setAttribute("aria-label", collapsed ? "Paneel uitklappen" : "Paneel inklappen");
    panel.classList.toggle("collapsed", collapsed);
  }
  $$(".panel .collapse").forEach(function (b) {
    b.addEventListener("click", function () {
      var panel = b.closest(".panel");
      setCollapsed(panel, !panel.classList.contains("collapsed"));
    });
  });

  normalise();
  if (state.compare) setCollapsed($(".panel-kenmerken"), true);
  render();
  frame.src = mapBase + "#" + initialHash();
})();
