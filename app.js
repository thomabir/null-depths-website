"use strict";

const DATA_URL = "data/null-depths.yaml";
const BAR_SAMPLES = 40;
const LABEL_GAP = 6; // px
const EXPORT_NAME = "null-depth-history";
const PNG_SCALE = 3;
const PDF_FONT_URL = "fonts/PlotSans-Regular.ttf";
const PDF_FONT_NAME = "PlotSans";
const LABEL_POSITIONS = {
  right: "middle right",
  left: "middle left",
  top: "top center",
  bottom: "bottom center",
};
const SETTINGS = ["on-sky", "testbed"];
const STATUSES = ["published", "in-preparation"];
const DEFAULT_RANGE = {
  linear: { x: [0, 18.5], y: [-7, -1] },
  log: { x: [Math.log10(0.5), Math.log10(20)], y: [-7, -1] },
};

// Plotly changes layout range arrays in place on zoom, so it must get copies.
function defaultRange() {
  const range = DEFAULT_RANGE[state.xScale];
  return { x: [...range.x], y: [...range.y] };
}

const GROUPS = [
  { id: "on-sky", name: "On-sky", colorVar: "--on-sky" },
  { id: "testbed", name: "Testbed", colorVar: "--testbed" },
  { id: "highlight", name: "This work", colorVar: "--this-work" },
];

const state = {
  xScale: "linear",
  grid: false,
  labels: true,
  labelSize: 11,
  barWidth: 6,
  dotSize: 8,
  dragMode: "zoom",
  sortKey: "wl1_um",
  sortDir: 1,
};

function fail(message) {
  throw new Error(`${DATA_URL}: ${message}`);
}

function validateResult(r, i) {
  const where = `results[${i}] (${r.label ?? "no label"})`;
  if (typeof r.label !== "string") fail(`${where}: label must be a string.`);
  if (r.plot_label !== undefined && typeof r.plot_label !== "string") fail(`${where}: plot_label must be a string.`);
  if (!SETTINGS.includes(r.setting)) fail(`${where}: setting must be one of ${SETTINGS.join(", ")}.`);
  if (!STATUSES.includes(r.status)) fail(`${where}: status must be one of ${STATUSES.join(", ")}.`);
  const wl = r.wavelength_um;
  if (!Array.isArray(wl) || wl.length < 1 || wl.length > 2 || !wl.every((w) => Number.isFinite(w) && w > 0)) {
    fail(`${where}: wavelength_um must be a list of one or two positive numbers.`);
  }
  if (wl.length === 2 && wl[0] > wl[1]) fail(`${where}: wavelength_um must be in increasing order.`);
  if (!Number.isFinite(r.null_depth) || r.null_depth <= 0) fail(`${where}: null_depth must be a positive number.`);
  const pos = r.label_position ?? "right";
  if (!(pos in LABEL_POSITIONS)) fail(`${where}: label_position must be one of ${Object.keys(LABEL_POSITIONS).join(", ")}.`);
}

function validateRequirement(req, i) {
  const where = `requirements[${i}] (${req.label ?? "no label"})`;
  if (typeof req.label !== "string") fail(`${where}: label must be a string.`);
  const ok = Array.isArray(req.curve) && req.curve.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  if (!ok) fail(`${where}: curve must be a list of [wavelength_um, null_depth] pairs.`);
}

function toEntry(r) {
  const wl = r.wavelength_um;
  return {
    plotLabel: r.plot_label ?? r.label,
    ref: r.label,
    url: r.url ?? null,
    group: r.highlight ? "highlight" : r.setting,
    status: r.status,
    wl1_um: wl[0],
    wl2_um: wl[wl.length - 1],
    isBand: wl.length === 2,
    nullDepth: r.null_depth,
    labelPosition: r.label_position ?? "right",
  };
}

async function loadData() {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`${DATA_URL}: HTTP ${response.status}`);
  const doc = jsyaml.load(await response.text());
  const results = doc.results ?? [];
  const requirements = doc.requirements ?? [];
  results.forEach(validateResult);
  requirements.forEach(validateRequirement);
  return { entries: results.map(toEntry), requirements };
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function formatWavelength(wl_um) {
  return String(Number(wl_um.toPrecision(4)));
}

function formatWavelengthRange(e) {
  return e.isBand ? `${formatWavelength(e.wl1_um)}–${formatWavelength(e.wl2_um)}` : formatWavelength(e.wl1_um);
}

function formatNull(x) {
  const [mantissa, exponent] = x.toExponential(2).split("e");
  const m = String(Number(mantissa));
  const exp = Number(exponent);
  return m === "1" ? `10<sup>${exp}</sup>` : `${m} × 10<sup>${exp}</sup>`;
}

function hoverData(e) {
  return [e.ref, formatWavelengthRange(e), formatNull(e.nullDepth), e.url ?? ""];
}

const HOVER_TEMPLATE = "<b>%{customdata[0]}</b><br>λ = %{customdata[1]} µm<br>Null depth = %{customdata[2]}<extra></extra>";

function sampleBand(e) {
  const xs = [];
  for (let i = 0; i < BAR_SAMPLES; i++) {
    const t = i / (BAR_SAMPLES - 1);
    xs.push(state.xScale === "log" ? e.wl1_um * Math.pow(e.wl2_um / e.wl1_um, t) : e.wl1_um + t * (e.wl2_um - e.wl1_um));
  }
  return xs;
}

function labelAnchor(e) {
  if (!e.isBand) return e.wl1_um;
  if (e.labelPosition === "right") return e.wl2_um;
  if (e.labelPosition === "left") return e.wl1_um;
  return state.xScale === "log" ? Math.sqrt(e.wl1_um * e.wl2_um) : (e.wl1_um + e.wl2_um) / 2;
}

function groupTraces(group, entries) {
  const color = cssVar(group.colorVar);
  const bands = entries.filter((e) => e.isBand);
  const points = entries.filter((e) => !e.isBand);
  const isHighlight = group.id === "highlight";
  const traces = [];

  const bar = { x: [], y: [], customdata: [] };
  for (const e of bands) {
    for (const x of sampleBand(e)) {
      bar.x.push(x);
      bar.y.push(e.nullDepth);
      bar.customdata.push(hoverData(e));
    }
    bar.x.push(null);
    bar.y.push(null);
    bar.customdata.push(null);
  }
  if (bands.length) {
    traces.push({
      ...bar,
      type: "scatter",
      mode: "lines",
      name: group.name,
      legendgroup: group.id,
      showlegend: true,
      line: { color, width: state.barWidth },
      hovertemplate: HOVER_TEMPLATE,
    });
  }

  if (points.length) {
    traces.push({
      type: "scatter",
      mode: "markers",
      x: points.map((e) => e.wl1_um),
      y: points.map((e) => e.nullDepth),
      customdata: points.map(hoverData),
      name: group.name,
      legendgroup: group.id,
      showlegend: bands.length === 0,
      marker: { color, size: state.dotSize },
      hovertemplate: HOVER_TEMPLATE,
    });
  }

  if (state.labels) {
    for (const [position, plotlyPosition] of Object.entries(LABEL_POSITIONS)) {
      const subset = entries.filter((e) => e.labelPosition === position);
      if (!subset.length) continue;
      traces.push({
        type: "scatter",
        mode: "markers+text",
        x: subset.map(labelAnchor),
        y: subset.map((e) => e.nullDepth),
        text: subset.map((e) => e.plotLabel.replaceAll("\n", "<br>")),
        customdata: subset.map(hoverData),
        textposition: plotlyPosition,
        marker: { size: Math.max(state.barWidth, state.dotSize) + LABEL_GAP, opacity: 0 },
        textfont: {
          size: isHighlight ? state.labelSize + 2 : state.labelSize,
          color: isHighlight ? color : cssVar("--fg"),
        },
        cliponaxis: false,
        legendgroup: group.id,
        showlegend: false,
        hovertemplate: HOVER_TEMPLATE,
      });
    }
  }
  return traces;
}

function requirementTraces(requirements) {
  return requirements.map((req) => ({
    type: "scatter",
    mode: "lines",
    x: req.curve.map((p) => p[0]),
    y: req.curve.map((p) => p[1]),
    name: req.label,
    legendgroup: `req-${req.label}`,
    line: { color: cssVar("--requirement"), width: state.barWidth + 4, shape: "spline" },
    hovertemplate: `<b>${req.label}</b><br>λ = %{x:.3g} µm<br>Null depth = %{y:.2e}<extra></extra>`,
  }));
}

function buildLayout() {
  const fg = cssVar("--fg");
  const grid = cssVar("--grid");
  const range = defaultRange();
  const axisCommon = {
    showline: true,
    linecolor: fg,
    mirror: true,
    ticks: "outside",
    tickcolor: fg,
    showgrid: state.grid,
    gridcolor: grid,
    zeroline: false,
  };
  return {
    uirevision: state.xScale,
    autosize: true,
    font: { family: "Fira Sans, system-ui, sans-serif", color: fg, size: 13 },
    paper_bgcolor: cssVar("--surface"),
    plot_bgcolor: cssVar("--surface"),
    margin: { l: 72, r: 24, t: 40, b: 64 },
    hovermode: "closest",
    hoverlabel: { font: { family: "Fira Sans, system-ui, sans-serif" } },
    dragmode: state.dragMode,
    xaxis: {
      ...axisCommon,
      type: state.xScale,
      range: range.x,
      title: { text: "Wavelength (µm)" },
      ...(state.xScale === "linear" ? { dtick: 2, minor: { dtick: 1, ticks: "outside", tickcolor: fg, showgrid: false } } : {}),
    },
    yaxis: {
      ...axisCommon,
      type: "log",
      range: range.y,
      title: { text: "Best achieved raw null depth" },
      exponentformat: "power",
      dtick: 1,
    },
    legend: {
      orientation: "h",
      x: 0,
      y: 1,
      xanchor: "left",
      yanchor: "bottom",
      bgcolor: "rgba(0, 0, 0, 0)",
    },
  };
}

function buildConfig() {
  return {
    responsive: true,
    scrollZoom: true,
    displayModeBar: false,
  };
}

function render(data) {
  const traces = [...requirementTraces(data.requirements)];
  for (const group of GROUPS) {
    const entries = data.entries.filter((e) => e.group === group.id);
    if (entries.length) traces.push(...groupTraces(group, entries));
  }
  return Plotly.react("plot", traces, buildLayout(), buildConfig());
}

function renderTable(data) {
  const tbody = document.querySelector("#table tbody");
  const groupName = Object.fromEntries(GROUPS.map((g) => [g.id, g.name]));
  const groupColor = Object.fromEntries(GROUPS.map((g) => [g.id, cssVar(g.colorVar)]));
  const rows = [...data.entries].sort((a, b) => {
    const va = state.sortKey === "group" ? groupName[a.group] : a[state.sortKey];
    const vb = state.sortKey === "group" ? groupName[b.group] : b[state.sortKey];
    if (typeof va === "string") return state.sortDir * va.localeCompare(vb);
    return state.sortDir * (va - vb);
  });
  tbody.replaceChildren(
    ...rows.map((e) => {
      const tr = document.createElement("tr");
      const ref = document.createElement("td");
      if (e.url) {
        const a = document.createElement("a");
        a.href = e.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = e.ref;
        ref.append(a);
      } else {
        ref.textContent = e.ref;
      }
      const type = document.createElement("td");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = groupColor[e.group];
      type.append(swatch, groupName[e.group] + (e.status === "in-preparation" ? " (in preparation)" : ""));
      const wl = document.createElement("td");
      wl.className = "num";
      wl.textContent = formatWavelengthRange(e);
      const nd = document.createElement("td");
      nd.className = "num";
      nd.innerHTML = formatNull(e.nullDepth);
      tr.append(ref, type, wl, nd);
      return tr;
    }),
  );
  for (const th of document.querySelectorAll("#table th")) {
    th.setAttribute("aria-sort", th.dataset.key === state.sortKey ? (state.sortDir > 0 ? "ascending" : "descending") : "none");
  }
}

function bindControls(data) {
  const rerender = () => render(data);
  const bindRange = (id, key) => {
    const input = document.getElementById(id);
    const output = document.getElementById(`${id}-value`);
    input.value = state[key];
    output.textContent = `${state[key]} px`;
    input.addEventListener("input", () => {
      state[key] = Number(input.value);
      output.textContent = `${state[key]} px`;
      rerender();
    });
  };
  const bindCheck = (id, key) => {
    const input = document.getElementById(id);
    input.checked = state[key];
    input.addEventListener("change", () => {
      state[key] = input.checked;
      rerender();
    });
  };
  const bindSegmented = (group) => {
    const key = group.dataset.state;
    const buttons = [...group.querySelectorAll("button")];
    const update = () => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === state[key])));
    update();
    for (const button of buttons) {
      button.addEventListener("click", () => {
        state[key] = button.dataset.value;
        update();
        rerender();
      });
    }
  };

  document.querySelectorAll(".segmented[data-state]").forEach(bindSegmented);
  bindCheck("grid", "grid");
  bindCheck("labels", "labels");
  bindRange("label-size", "labelSize");
  bindRange("bar-width", "barWidth");
  bindRange("dot-size", "dotSize");

  document.getElementById("reset").addEventListener("click", () => {
    const range = defaultRange();
    Plotly.relayout("plot", { "xaxis.range": range.x, "yaxis.range": range.y });
  });
  for (const button of document.querySelectorAll("button[data-export]")) {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await exportImage(data, button.dataset.export);
      } catch (err) {
        console.error(err);
        alert(`Export failed: ${err.message}`);
      } finally {
        button.disabled = false;
      }
    });
  }
  for (const th of document.querySelectorAll("#table th")) {
    th.addEventListener("click", () => {
      state.sortDir = th.dataset.key === state.sortKey ? -state.sortDir : 1;
      state.sortKey = th.dataset.key;
      renderTable(data);
    });
  }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    rerender();
    renderTable(data);
  });
}

async function loadPdfFont() {
  const response = await fetch(PDF_FONT_URL);
  if (!response.ok) throw new Error(`${PDF_FONT_URL}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function plotSize() {
  const layout = document.getElementById("plot")._fullLayout;
  return { width: layout.width, height: layout.height };
}

// Renders the plot with the light palette, calls fn, then restores the page palette.
async function withLightPalette(data, fn) {
  const root = document.documentElement;
  root.classList.add("force-light");
  await render(data);
  try {
    return await fn();
  } finally {
    root.classList.remove("force-light");
    await render(data);
  }
}

// svg2pdf does not resolve percent font sizes and em offsets on tspan elements, which Plotly uses for exponents.
function resolveRelativeTextUnits(svg) {
  for (const tspan of svg.querySelectorAll("text tspan")) {
    const parentSize = parseFloat(tspan.closest("text").style.fontSize);
    const percent = /font-size:\s*([\d.]+)%/.exec(tspan.getAttribute("style") ?? "");
    const size = percent ? (parentSize * Number(percent[1])) / 100 : parentSize;
    if (percent) tspan.style.fontSize = `${size}px`;
    const dy = tspan.getAttribute("dy");
    if (dy?.endsWith("em")) tspan.setAttribute("dy", String(parseFloat(dy) * size));
  }
  const walker = document.createTreeWalker(svg, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    node.nodeValue = node.nodeValue.replaceAll("​", "");
  }
}

async function buildPdf(data) {
  const { width, height } = plotSize();
  const svgUrl = await withLightPalette(data, () => Plotly.toImage("plot", { format: "svg", width, height }));
  const svgText = decodeURIComponent(svgUrl.replace(/^data:image\/svg\+xml,/, ""));
  const svg = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;
  for (const el of svg.querySelectorAll("[style*='font-family']")) el.style.fontFamily = PDF_FONT_NAME;
  for (const el of svg.querySelectorAll("[font-family]")) el.setAttribute("font-family", PDF_FONT_NAME);
  resolveRelativeTextUnits(svg);

  const doc = new jspdf.jsPDF({ orientation: width > height ? "landscape" : "portrait", unit: "pt", format: [width, height] });
  doc.addFileToVFS(`${PDF_FONT_NAME}.ttf`, await loadPdfFont());
  doc.addFont(`${PDF_FONT_NAME}.ttf`, PDF_FONT_NAME, "normal");
  doc.setFont(PDF_FONT_NAME);

  // svg2pdf reads computed styles, so the SVG must be in the document.
  const holder = document.createElement("div");
  holder.style.cssText = "position:absolute;left:-10000px;top:0;";
  holder.append(svg);
  document.body.append(holder);
  try {
    await doc.svg(svg, { x: 0, y: 0, width, height });
  } finally {
    holder.remove();
  }
  return doc;
}

async function exportImage(data, format) {
  if (format === "pdf") {
    const doc = await buildPdf(data);
    doc.save(`${EXPORT_NAME}.pdf`);
    return;
  }
  const { width, height } = plotSize();
  await withLightPalette(data, () => Plotly.downloadImage("plot", { format, filename: EXPORT_NAME, width, height, scale: PNG_SCALE }));
}

function bindPlotClicks() {
  document.getElementById("plot").on("plotly_click", (event) => {
    const url = event.points[0]?.customdata?.[3];
    if (url) window.open(url, "_blank", "noopener");
  });
}

async function main() {
  try {
    const data = await loadData();
    await render(data);
    renderTable(data);
    bindControls(data);
    bindPlotClicks();
  } catch (err) {
    const plot = document.getElementById("plot");
    plot.textContent = `Error: ${err.message}`;
    console.error(err);
  }
}

window.appReady = main();
