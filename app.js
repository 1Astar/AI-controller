/* 原型演示：纯前端单页，不连后端 */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const fmtTime = (d = new Date()) => {
  const pad2 = (n) => String(n).padStart(2, "0");
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

const store = {
  load() {
    try {
      return JSON.parse(localStorage.getItem("pump_proto_state") || "null");
    } catch {
      return null;
    }
  },
  save(state) {
    localStorage.setItem("pump_proto_state", JSON.stringify(state));
  }
};

const State = (() => {
  // 每次启动强制清除旧缓存，避免旧告警/旧故障状态导致反复弹窗
  store.save(null);
  const seed = null;
  const devices =
    seed?.devices ??
    [
      {
        id: "dev_001",
        name: "1号工业园排污泵",
        code: "CLEDIC-6789123456",
        status: "stopped", // running | stopped | offline | fault
        metrics: {
          p: 0, q: 0, i: 0, v: 0,
          wlPct: 30, wlM: 1.2,
          rpm: 0, head: 0,
          vIn: 0, vOut: 0, iOut: 0,
          temp: 28,
          runSec: 2 * 3600 + 32 * 60,
          totalSec: 168 * 3600 + 18 * 60
        },
        ilimit: 8.0,
        mode: "auto",
        gear: 3
      },
      {
        id: "dev_002",
        name: "农田灌溉泵 2#",
        code: "CLEDIC-1359876420",
        status: "stopped",
        metrics: {
          p: 0.0,
          q: 0.0,
          i: 0.0,
          v: 0,
          wlPct: 52,
          wlM: 2.1,
          rpm: 0,
          head: 0,
          vIn: 0,
          vOut: 0,
          iOut: 0,
          temp: 28,
          runSec: 0,
          totalSec: 65 * 3600
        },
        ilimit: 7.2,
        mode: "timer",
        gear: 2
      }
    ];

  const alarms = seed?.alarms ?? [];

  const timers = seed?.timers ?? [
    // { id, deviceId, time, action, repeat, enabled, createdAt }
  ];

  const state = {
    currentDeviceId: seed?.currentDeviceId ?? devices[0].id,
    lastSync: seed?.lastSync ?? fmtTime(),
    devices,
    alarms,
    timers,
    cmdLog: seed?.cmdLog ?? []
  };

  state.persist = () => store.save(state);
  return state;
})();

function fmtDurationSec(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

let gaugeMode = "rpmHead"; // rpmHead | pQ | elec

function getCurrentDevice() {
  return State.devices.find((d) => d.id === State.currentDeviceId) || State.devices[0];
}

function setPill(el, kind, text) {
  el.classList.remove("pill--green", "pill--gray", "pill--red", "pill--orange");
  if (kind) el.classList.add(`pill--${kind}`);
  el.textContent = text;
}

function statusToDot(status) {
  if (status === "running") return { color: "var(--green)", pill: ["green", "运行中"] };
  if (status === "stopped") return { color: "var(--txt-3)", pill: ["gray", "停止"] };
  if (status === "offline") return { color: "var(--txt-3)", pill: ["gray", "离线"] };
  if (status === "fault") return { color: "var(--red)", pill: ["red", "故障"] };
  return { color: "var(--gray)", pill: ["gray", "未知"] };
}

function setBusy(el, text) {
  el.classList.remove("is-ok", "is-bad");
  el.classList.add("is-busy");
  el.textContent = text;
}
function setOk(el, text) {
  el.classList.remove("is-busy", "is-bad");
  el.classList.add("is-ok");
  el.textContent = text;
  window.setTimeout(() => (el.textContent = ""), 1600);
}
function setBad(el, text) {
  el.classList.remove("is-busy", "is-ok");
  el.classList.add("is-bad");
  el.textContent = text;
}

function logCmd(title, status, detail) {
  State.cmdLog.unshift({ at: Date.now(), title, status, detail });
  State.cmdLog = State.cmdLog.slice(0, 20);
  State.persist();
  renderCmdLog();
}

function showDialog(id) {
  const dlg = document.getElementById(id);
  if (!dlg) return;
  if (!dlg.open) dlg.showModal();
}
function closeDialog(id) {
  const dlg = document.getElementById(id);
  if (!dlg) return;
  dlg.close();
}

function setView(view) {
  $$(".view").forEach((v) => (v.hidden = v.dataset.view !== view));
  $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.nav === view));
}

function renderHeader() {
  const d = getCurrentDevice();
  $("#deviceName").textContent = d.name;
  const s = statusToDot(d.status);
  $("#deviceDot").style.background = s.color;

  const conn = $("#connPill");
  if (d.status === "offline") setPill(conn, "gray", "离线");
  else setPill(conn, "green", "在线");
  $("#lastSync").textContent = `最近同步：${State.lastSync}`;

  $("#offlineBanner").hidden = d.status !== "offline";

  const unread = State.alarms.filter((a) => a.unread).length;
  const badge = $("#alarmBadge");
  badge.hidden = unread === 0;
  badge.textContent = String(unread);
}

function renderDashboard() {
  const d = getCurrentDevice();
  const running = State.devices.filter((x) => x.status === "running").length;
  const stopped = State.devices.filter((x) => x.status === "stopped").length;
  const offline = State.devices.filter((x) => x.status === "offline").length;
  const fault = State.devices.filter((x) => x.status === "fault").length;

  $("#statRunning").textContent = running;
  $("#statStopped").textContent = stopped;
  $("#statOffline").textContent = offline;
  $("#statFault").textContent = fault;

  const { p, q, i, v, wlPct, wlM, rpm, head, temp, runSec, totalSec } = d.metrics;
  $("#kpiP").textContent = p.toFixed(2);
  $("#kpiQ").textContent = q.toFixed(1);
  $("#kpiRpm").textContent = String(Math.round(rpm || 0));
  $("#kpiHead").textContent = String(Math.round(head || 0));
  $("#kpiI").textContent = i.toFixed(1);
  $("#kpiV").textContent = String(v);
  $("#wlPct").textContent = String(wlPct);
  $("#wlM").textContent = String(wlM.toFixed(1));
  $("#wlFill").style.width = `${Math.max(0, Math.min(100, wlPct))}%`;
  $("#kpiUpdatedAt").textContent = State.lastSync;

  // 圆形水波仪表：点击参数可切换显示组
  let g1Val;
  let g2Val;
  let g1Label;
  let g2Label;
  let pPct;
  let qPct;
  if (gaugeMode === "pQ") {
    g1Val = p.toFixed(2);
    g2Val = q.toFixed(1);
    g1Label = "压力 MPa";
    g2Label = "流量 m³/h";
    pPct = Math.max(0, Math.min(1, (p - 0.3) / 0.2 || 0));
    qPct = Math.max(0, Math.min(1, q / 30 || 0));
  } else if (gaugeMode === "elec") {
    g1Val = i.toFixed(1);
    g2Val = String(v);
    g1Label = "电流 A";
    g2Label = "电压 V";
    pPct = Math.max(0, Math.min(1, i / Math.max(1, d.ilimit) || 0));
    qPct = Math.max(0, Math.min(1, v / 240 || 0));
  } else {
    g1Val = String(Math.round(rpm || 0));
    g2Val = String(Math.round(head || 0));
    g1Label = "转速 RPM";
    g2Label = "扬程 m";
    pPct = Math.max(0, Math.min(1, (rpm || 0) / 3500));
    qPct = Math.max(0, Math.min(1, (head || 0) / 60));
  }

  $("#gaugePVal").textContent = g1Val;
  $("#gaugeQVal").textContent = g2Val;
  $("#gaugePLabel").textContent = g1Label;
  $("#gaugeQLabel").textContent = g2Label;
  $("#gaugeP").style.setProperty("--fill", `${20 + pPct * 60}%`);
  $("#gaugeQ").style.setProperty("--fill", `${20 + qPct * 60}%`);

  // 数据记录
  $("#recCode").textContent = d.code;
  $("#recName").textContent = d.name;
  $("#recRunNow").textContent = fmtDurationSec(runSec);
  $("#recRunTotal").textContent = fmtDurationSec(totalSec);
  const st = statusToDot(d.status);
  const recChip = $("#recRunState");
  recChip.classList.remove("chip--on", "chip--off");
  recChip.classList.add(d.status === "running" ? "chip--on" : "chip--off");
  recChip.textContent = st.pill[1];

  $("#monTemp").textContent = String(Math.round(temp || 0));
  const faultAlarm =
    [...State.alarms]
      .filter((a) => a.deviceId === d.id)
      .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
  $("#monFault").textContent = faultAlarm ? `${faultAlarm.code} ${faultAlarm.title}` : "无故障";

  // 运行状态在“实时核心数据”旁边展示
  const dot = statusToDot(d.status);
  setPill($("#runStateInline"), dot.pill[0], dot.pill[1]);

  // KPI 卡片故障高亮
  const kpiCard = $(".kpi-card");
  if (kpiCard) {
    kpiCard.style.borderColor = d.status === "fault" ? "rgba(255,77,106,.65)" : "";
    kpiCard.style.boxShadow = d.status === "fault" ? "0 0 24px rgba(255,77,106,.2), var(--shadow)" : "";
  }

  // 启动/停止按钮
  $("#btnStart").disabled = d.status === "offline" || d.status === "running";
  $("#btnStop").disabled = d.status === "offline" || d.status !== "running";

  // ticker: show latest alarm for current device if any; else global latest
  const alarm = [...State.alarms]
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((a) => a.deviceId === d.id) || [...State.alarms].sort((a, b) => b.createdAt - a.createdAt)[0];

  const tick = $("#alarmTickerItem");
  if (!alarm) {
    tick.textContent = "暂无告警";
  } else {
    const when = new Date(alarm.createdAt);
    tick.textContent = `${alarm.code} ${alarm.title} · ${when.toLocaleString()} · ${d.name}`;
  }

  // simulate button label
  $("#btnSimToggle").textContent = d.status === "offline" ? "模拟：离线" : "模拟：在线";
}

function renderControl() {
  const d = getCurrentDevice();
  // mode segment
  $$(".seg__btn[data-mode]").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === d.mode));

  $("#inputILimit").value = d.ilimit.toFixed(1);
  const shownGear = Number(d.pendingGear || d.gear || 1);
  $("#gearText").textContent = `${shownGear}档`;
  $$("#gearBtns .gear__btn").forEach((b) => b.classList.toggle("is-active", Number(b.dataset.gear) === shownGear));

  // params pill
  const pp = $("#paramsPill");
  if (d.status === "offline") setPill(pp, "gray", "离线不可下发");
  else setPill(pp, "orange", "可下发");

  // 控制中心启停按钮状态
  const bsc = $("#btnStartCtrl");
  const bsp = $("#btnStopCtrl");
  if (bsc) bsc.disabled = d.status === "offline" || d.status === "running";
  if (bsp) bsp.disabled = d.status === "offline" || d.status !== "running";

  renderTimers();
  renderCmdLog();
}

function renderData() {
  const d = getCurrentDevice();
  const hours = Math.round((d.metrics.q * 8 + (d.status === "running" ? 120 : 50)) * 10) / 10;
  $("#runHours").textContent = String(hours);

  const maintEvery = 500;
  const pct = Math.max(0, Math.min(100, (hours / maintEvery) * 100));
  $("#maintBar").style.width = `${pct}%`;
  const remain = Math.max(0, Math.round(maintEvery - hours));
  $("#maintTip").textContent = `距离下次维保还差 ${remain} 小时（阈值 ${maintEvery}h）`;
  setPill($("#maintPill"), pct > 90 ? "orange" : "green", pct > 90 ? "临近维保" : "正常");

  // placeholder charts (svg)
  $("#chartEnergy").innerHTML = chartSvg("能耗曲线占位", 12, "#2f7cff");
  $("#chartPQ").innerHTML = chartSvg("压力/流量双折线占位", 18, "#22c55e", true);

  setPill($("#energySummary"), "gray", "今日 3.2 kWh（示例）");

  // 异常统计
  const rangeBtn = $$("#view-data .seg__btn").find(b => b.classList.contains("is-active"));
  const range = rangeBtn?.dataset.range || "today";
  const now = Date.now();
  const rangeMs = range === "today" ? 86400000 : range === "7d" ? 7 * 86400000 : 30 * 86400000;
  const allAlarms = State.alarms.filter((a) => a.deviceId === d.id);
  const rangedAlarms = allAlarms.filter((a) => now - a.createdAt < rangeMs);

  // 按类型汇总
  const byType = {};
  rangedAlarms.forEach((a) => {
    const key = `${a.code} ${a.title}`;
    byType[key] = (byType[key] || 0) + 1;
  });
  const totalFaults = rangedAlarms.length;
  const faultTotalPill = $("#faultTotalPill");
  if (faultTotalPill) {
    setPill(faultTotalPill, totalFaults > 0 ? "red" : "green", totalFaults > 0 ? `共 ${totalFaults} 条` : "无异常");
  }

  const statGrid = $("#faultStatGrid");
  if (statGrid) {
    const typeEntries = Object.entries(byType).slice(0, 6);
    if (typeEntries.length === 0) {
      statGrid.innerHTML = `<div class="subtle" style="grid-column:1/-1;padding:6px 0;">该时段暂无异常记录</div>`;
    } else {
      statGrid.innerHTML = typeEntries.map(([k, v]) => `
        <div class="fault-stat">
          <div class="fault-stat__n">${v}</div>
          <div class="fault-stat__k">${k}</div>
        </div>`).join("");
    }
  }

  // 异常趋势：按时间段分桶，画真实柱状图
  const chartFault = $("#chartFault");
  if (chartFault) {
    const buckets = range === "today" ? 24 : range === "7d" ? 7 : 30;
    const bucketMs = rangeMs / buckets;
    const counts = Array(buckets).fill(0);
    rangedAlarms.forEach((a) => {
      const idx = Math.min(buckets - 1, Math.floor((now - rangeMs + (a.createdAt - (now - rangeMs))) / bucketMs));
      if (idx >= 0) counts[idx]++;
    });
    // 加一些模拟数据让图表更好看（原型）
    if (totalFaults === 0) {
      [2,0,1,0,3,1,0,0,2,0,1,0].forEach((v,i) => { if(i < buckets) counts[i] = v; });
    }
    const maxC = Math.max(1, ...counts);
    const w = 360, h = 150, padX = 14, padY = 14, barW = Math.max(2, (w - padX*2) / buckets - 2);
    const labels = range === "today"
      ? Array.from({length: buckets}, (_, i) => i % 6 === 0 ? `${i}时` : "")
      : range === "7d"
      ? ["日","一","二","三","四","五","六"].slice(0, buckets)
      : Array.from({length: buckets}, (_, i) => (i+1) % 5 === 0 ? `${i+1}日` : "");

    const bars = counts.map((c, i) => {
      const x = padX + i * ((w - padX*2) / buckets);
      const barH = c === 0 ? 2 : Math.max(4, ((c / maxC) * (h - padY*2 - 16)));
      const y = h - padY - 16 - barH;
      const col = c === 0 ? "rgba(255,77,106,.15)" : c >= 3 ? "#ff4d6a" : "rgba(255,77,106,.7)";
      const label = labels[i] ? `<text x="${x + barW/2}" y="${h - 2}" font-size="9" fill="rgba(155,176,197,.8)" text-anchor="middle">${labels[i]}</text>` : "";
      return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${col}"/>${label}`;
    }).join("");

    chartFault.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="异常频次趋势">
        <rect x="0" y="0" width="${w}" height="${h}" fill="rgba(15,23,42,.02)"/>
        ${[1,2,3].map(i => {
          const y = padY + (h - padY*2 - 16) * i / 3;
          return `<line x1="${padX}" y1="${y}" x2="${w-padX}" y2="${y}" stroke="rgba(255,77,106,.12)" stroke-width="1"/>
                  <text x="${padX-2}" y="${y+3}" font-size="9" fill="rgba(155,176,197,.6)" text-anchor="end">${Math.round(maxC*(3-i)/3)}</text>`;
        }).join("")}
        ${bars}
        <text x="${padX}" y="${padY - 3}" font-size="11" fill="rgba(255,128,150,1)" font-weight="700">异常频次（${range === "today" ? "今日/时" : range === "7d" ? "近7天/日" : "本月/日"}）</text>
      </svg>`;
  }

  // 异常日志列表
  const faultLogList = $("#faultLogList");
  const faultLogEmpty = $("#faultLogEmpty");
  if (faultLogList) {
    const sorted = [...allAlarms].sort((a, b) => b.createdAt - a.createdAt);
    faultLogEmpty.hidden = sorted.length > 0;
    faultLogList.innerHTML = "";
    sorted.forEach((a) => {
      const item = document.createElement("div");
      item.className = "list-item";
      if (a.unread) item.style.borderColor = "rgba(255,77,106,.45)";
      item.style.cursor = "pointer";
      item.innerHTML = `
        <div class="list-item__main">
          <div class="list-item__title" style="color:${a.level === "high" ? "#ff8096" : "#ffe0a8"}">${a.code} ${a.title}</div>
          <div class="list-item__sub">${new Date(a.createdAt).toLocaleString()} · ${a.detail}</div>
        </div>
        <div class="chip" style="${a.unread ? "border-color:rgba(255,77,106,.7);background:rgba(255,77,106,.18);color:#ffb3be" : "border-color:rgba(55,65,81,.8);background:rgba(55,65,81,.4);color:#d1d5db"}">${a.unread ? "未处理" : "已处理"}</div>
      `;
      item.addEventListener("click", () => openAlarmDetail(a.id));
      faultLogList.appendChild(item);
    });
  }
}

function renderMe() {
  renderDeviceList();
}

function chartSvg(label, points, color, dual = false) {
  const w = 360;
  const h = 170;
  const pad = 18;
  const mk = (seed, scale) => {
    const arr = [];
    let v = seed;
    for (let i = 0; i < points; i++) {
      v = Math.max(8, Math.min(92, v + (Math.random() * 18 - 9)));
      arr.push(v * scale);
    }
    return arr;
  };
  const xs = Array.from({ length: points }, (_, i) => pad + (i * (w - pad * 2)) / (points - 1));
  const ys1 = mk(55, (h - pad * 2) / 100);
  const ys2 = mk(35, (h - pad * 2) / 100);

  const path = (ys) =>
    xs
      .map((x, i) => {
        const y = h - pad - ys[i];
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  const gridLines = Array.from({ length: 4 }, (_, i) => {
    const y = pad + ((h - pad * 2) * (i + 1)) / 5;
    return `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="rgba(15,23,42,.10)" stroke-width="1" />`;
  }).join("");

  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${label}">
      <rect x="0" y="0" width="${w}" height="${h}" fill="rgba(15,23,42,.02)"></rect>
      ${gridLines}
      <path d="${path(ys1)}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"></path>
      ${
        dual
          ? `<path d="${path(ys2)}" fill="none" stroke="#2f7cff" stroke-width="3" stroke-linecap="round" opacity=".85"></path>`
          : ""
      }
      <text x="${pad}" y="${pad - 4}" font-size="12" fill="rgba(107,114,128,1)" font-weight="700">${label}</text>
    </svg>
  `;
}

function renderDevicePicker() {
  const list = $("#devicePickerList");
  list.innerHTML = "";
  State.devices.forEach((d) => {
    const s = statusToDot(d.status);
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div class="list-item__main">
        <div class="list-item__title">${d.name}</div>
        <div class="list-item__sub">${d.code}</div>
      </div>
      <div class="chip chip--${d.status === "running" ? "on" : "off"}">${s.pill[1]}</div>
    `;
    item.style.cursor = "pointer";
    item.addEventListener("click", () => {
      State.currentDeviceId = d.id;
      State.lastSync = fmtTime();
      State.persist();
      closeDialog("dlgDevices");
      renderAll();
    });
    list.appendChild(item);
  });
}

function renderDeviceList() {
  const list = $("#deviceList");
  list.innerHTML = "";
  State.devices.forEach((d) => {
    const s = statusToDot(d.status);
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div class="list-item__main">
        <div class="list-item__title">${d.name}</div>
        <div class="list-item__sub">${d.code} · 最后同步 ${State.lastSync}</div>
      </div>
      <div class="chip chip--${d.status === "running" ? "on" : "off"}">${s.pill[1]}</div>
    `;
    list.appendChild(item);
  });
}

function renderTimers() {
  const d = getCurrentDevice();
  const list = $("#timerList");
  const empty = $("#timerEmpty");
  const timers = State.timers.filter((t) => t.deviceId === d.id);
  list.innerHTML = "";
  empty.hidden = timers.length !== 0;
  timers.forEach((t) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div class="list-item__main">
        <div class="list-item__title">${t.time} · ${t.action}</div>
        <div class="list-item__sub">${t.repeat} · 创建 ${new Date(t.createdAt).toLocaleString()}</div>
      </div>
      <button class="chip ${t.enabled ? "chip--on" : "chip--off"}" data-timer="${t.id}">
        ${t.enabled ? "已启用" : "已停用"}
      </button>
    `;
    item.querySelector("[data-timer]").addEventListener("click", (e) => {
      e.stopPropagation();
      t.enabled = !t.enabled;
      State.persist();
      renderTimers();
      logCmd("定时任务", "OK", `${t.time} ${t.action} → ${t.enabled ? "启用" : "停用"}`);
    });
    list.appendChild(item);
  });
}

function renderCmdLog() {
  const box = $("#cmdLog");
  if (!box) return;
  box.innerHTML = "";
  const rows = State.cmdLog || [];
  if (rows.length === 0) {
    const div = document.createElement("div");
    div.className = "subtle";
    div.textContent = "暂无日志（点击启动/停止、下发参数、定时开关等会生成）。";
    box.appendChild(div);
    return;
  }
  rows.forEach((r) => {
    const item = document.createElement("div");
    item.className = "log-item";
    item.innerHTML = `
      <div class="log-item__t">${r.title} · ${r.status}</div>
      <div class="log-item__s">${new Date(r.at).toLocaleString()} · ${r.detail}</div>
    `;
    box.appendChild(item);
  });
}

function renderAlarms() {
  const list = $("#alarmList");
  list.innerHTML = "";
  const alarms = [...State.alarms].sort((a, b) => b.createdAt - a.createdAt);
  if (alarms.length === 0) {
    const div = document.createElement("div");
    div.className = "subtle";
    div.textContent = "暂无告警";
    list.appendChild(div);
    return;
  }
  alarms.forEach((a) => {
    const d = State.devices.find((x) => x.id === a.deviceId);
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div class="list-item__main">
        <div class="list-item__title">${a.code} ${a.title} ${a.unread ? "（未读）" : ""}</div>
        <div class="list-item__sub">${d?.name ?? "未知设备"} · ${new Date(a.createdAt).toLocaleString()}</div>
      </div>
      <div class="chip ${a.level === "high" ? "chip--on" : "chip--off"}">${a.level === "high" ? "高" : "中/低"}</div>
    `;
    item.style.cursor = "pointer";
    item.addEventListener("click", () => openAlarmDetail(a.id));
    list.appendChild(item);
  });
}

function openAlarmDetail(alarmId) {
  const a = State.alarms.find((x) => x.id === alarmId);
  if (!a) return;
  const d = State.devices.find((x) => x.id === a.deviceId);
  a.unread = false;
  State.persist();
  renderHeader();

  $("#alarmDetailBox").innerHTML = `
    <div style="font-weight:1000; margin-bottom:6px;">${a.code} ${a.title}</div>
    <div class="subtle">设备：${d?.name ?? "未知"}（${d?.code ?? "-"}）</div>
    <div class="subtle">时间：${new Date(a.createdAt).toLocaleString()}</div>
    <div style="margin-top:8px;">${a.detail}</div>
    <div class="subtle" style="margin-top:8px;">建议：先远程复位；若多次复现请联系维修。</div>
  `;
  showDialog("dlgAlarmDetail");
}

function renderAll() {
  renderHeader();
  renderDevicePicker();
  renderDashboard();
  renderControl();
  renderData();
  renderMe();
}

// ----- Interactions -----
function wireNav() {
  $$(".tab").forEach((b) =>
    b.addEventListener("click", () => {
      setView(b.dataset.nav);
      renderAll();
    })
  );
  const go = $("#btnGoControlBig");
  if (go) {
    go.addEventListener("click", () => {
      setView("control");
      renderAll();
    });
  }
}

function wireDialogs() {
  // generic close buttons
  $$("[data-close]").forEach((b) =>
    b.addEventListener("click", () => closeDialog(b.getAttribute("data-close")))
  );
  $("#btnDevicePicker").addEventListener("click", () => showDialog("dlgDevices"));
  $("#btnAlarmCenter").addEventListener("click", () => {
    renderAlarms();
    showDialog("dlgAlarms");
  });
  $("#btnViewAlarms").addEventListener("click", () => {
    renderAlarms();
    showDialog("dlgAlarms");
  });
}

function wireGaugeParams() {
  $$("#view-dashboard .kpi[data-param]").forEach((kpi) =>
    kpi.addEventListener("click", () => {
      const type = kpi.dataset.param;
      gaugeMode = type === "pQ" ? "pQ" : type === "elec" ? "elec" : "rpmHead";
      renderDashboard();
    })
  );
}

function wireDashboardControls() {
  $("#btnSimToggle").addEventListener("click", () => {
    const d = getCurrentDevice();
    d.status = d.status === "offline" ? "stopped" : "offline";
    if (d.status === "offline") {
      d.metrics = { ...d.metrics, p: 0, q: 0, i: 0, v: 0, rpm: 0, head: 0, vIn: 0, vOut: 0, iOut: 0 };
    }
    State.lastSync = fmtTime();
    State.persist();
    renderAll();
  });

  const btnStart = $("#btnStart");
  const btnStop = $("#btnStop");

  function confirmAndRun(title, applyFn) {
    $("#confirmTitle").textContent = `确认${title}？`;
    $("#confirmText").textContent = "将向设备发送远程指令，请确认现场安全。";
    showDialog("dlgConfirm");
    $("#btnConfirmOk").onclick = async () => {
      closeDialog("dlgConfirm");
      await runCommandFlow(title, applyFn, {
        stateEl: $("#commandState"),
        buttons: [btnStart, btnStop]
      });
    };
  }

  btnStart.addEventListener("click", () => {
    const d = getCurrentDevice();
    if (d.status === "offline" || d.status === "running") return;
    confirmAndRun("启动", async () => {
      d.status = "running";
      d.metrics.v = 220;
      d.metrics.i = Math.max(0.2, d.metrics.i || 6.2);
      d.metrics.p = Math.max(0.32, d.metrics.p || 0.38);
      d.metrics.q = Math.max(6, d.metrics.q || 12.4);
      d.metrics.rpm = Math.max(1200, d.metrics.rpm || 2600);
      d.metrics.head = Math.max(10, d.metrics.head || 30);
      State.lastSync = fmtTime();
    });
  });

  btnStop.addEventListener("click", () => {
    const d = getCurrentDevice();
    if (d.status === "offline" || d.status !== "running") return;
    confirmAndRun("停止", async () => {
      d.status = "stopped";
      d.metrics.p = 0;
      d.metrics.q = 0;
      d.metrics.i = 0;
      d.metrics.v = 0;
      d.metrics.rpm = 0;
      d.metrics.head = 0;
      State.lastSync = fmtTime();
    });
  });
}

async function runCommandFlow(title, applyFn, opts = {}) {
  const d = getCurrentDevice();
  const state = opts.stateEl || $("#commandState");
  const buttons = (opts.buttons || []).filter(Boolean);
  buttons.forEach((b) => (b.disabled = true));
  setBusy(state, `${title}：指令发送中...`);
  logCmd(title, "SENT", "指令已发送（原型模拟）");

  // 模拟网络发送
  await wait(900);

  setBusy(state, `${title}：等待设备确认回执...`);
  logCmd(title, "WAIT_ACK", "等待控制器确认报文");

  // 离线/故障模拟：如果当前告警为高且电流超阈值，给个失败分支（原型）
  const shouldFail =
    d.status === "offline" ||
    (State.alarms.some((a) => a.deviceId === d.id && a.code === "E01" && a.level === "high" && a.unread) &&
      title === "启动" &&
      d.metrics.i > d.ilimit);

  await wait(900);

  if (shouldFail) {
    setBad(state, `${title}失败：设备离线或保护触发（示例）`);
    logCmd(title, "FAIL", "设备离线/保护触发导致失败");
    buttons.forEach((b) => (b.disabled = d.status === "offline"));
    return;
  }

  await applyFn();
  State.persist();
  setOk(state, `${title}成功：已收到设备确认`);
  logCmd(title, "OK", "已收到控制器确认报文，状态已更新");
  buttons.forEach((b) => (b.disabled = d.status === "offline"));
  renderAll();
}

function wireControlPage() {
  // 控制中心启动/停止
  const btnStartCtrl = $("#btnStartCtrl");
  const btnStopCtrl = $("#btnStopCtrl");

  function confirmAndRunCtrl(title, applyFn) {
    $("#confirmTitle").textContent = `确认${title}？`;
    $("#confirmText").textContent = "将向设备发送远程指令，请确认现场安全。";
    showDialog("dlgConfirm");
    $("#btnConfirmOk").onclick = async () => {
      closeDialog("dlgConfirm");
      await runCommandFlow(title, applyFn, {
        stateEl: $("#paramsState"),
        buttons: [btnStartCtrl, btnStopCtrl]
      });
    };
  }

  btnStartCtrl.addEventListener("click", () => {
    const d = getCurrentDevice();
    if (d.status === "offline" || d.status === "running") return;
    confirmAndRunCtrl("启动", async () => {
      d.status = "running";
      d.metrics.v = 220;
      d.metrics.i = Math.max(0.2, d.metrics.i || 6.2);
      d.metrics.p = Math.max(0.32, d.metrics.p || 0.38);
      d.metrics.q = Math.max(6, d.metrics.q || 12.4);
      d.metrics.rpm = Math.max(1200, d.metrics.rpm || 2600);
      d.metrics.head = Math.max(10, d.metrics.head || 30);
      State.lastSync = fmtTime();
    });
  });

  btnStopCtrl.addEventListener("click", () => {
    const d = getCurrentDevice();
    if (d.status === "offline" || d.status !== "running") return;
    confirmAndRunCtrl("停止", async () => {
      d.status = "stopped";
      d.metrics.p = 0; d.metrics.q = 0; d.metrics.i = 0;
      d.metrics.v = 0; d.metrics.rpm = 0; d.metrics.head = 0;
      State.lastSync = fmtTime();
    });
  });

  // 自动模式：五档选择
  $$("#gearBtns .gear__btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const d = getCurrentDevice();
      const g = Number(btn.dataset.gear) || 1;
      d.pendingGear = g;
      State.persist();
      renderControl();
    })
  );

  $("#btnSendGear").addEventListener("click", async () => {
    const d = getCurrentDevice();
    const box = $("#paramsState");
    if (d.status === "offline") return setBad(box, "下发失败：设备离线");
    const next = Number(d.pendingGear || d.gear || 1);

    setBusy(box, "档位下发：指令发送中...");
    logCmd("档位下发", "SENT", `设置为 ${next}档`);
    await wait(900);
    setBusy(box, "档位下发：等待设备确认回执...");
    await wait(900);

    d.gear = next;
    delete d.pendingGear;
    State.lastSync = fmtTime();
    State.persist();
    setOk(box, "档位下发成功：已确认");
    logCmd("档位下发", "OK", `已生效：${next}档`);
    renderAll();
  });

  $("#btnResetFault").addEventListener("click", () => {
    const d = getCurrentDevice();
    if (d.status === "offline") return;
    $("#confirmTitle").textContent = "故障复位确认";
    $("#confirmText").textContent = "将尝试清除故障并恢复运行条件。确定继续？";
    showDialog("dlgConfirm");
    $("#btnConfirmOk").onclick = async () => {
      closeDialog("dlgConfirm");
      await runCommandFlow("故障复位", async () => {
        // 清掉当前设备告警（原型）
        State.alarms.forEach((a) => {
          if (a.deviceId === d.id) a.unread = false;
        });
        if (d.status === "fault") d.status = "stopped";
        State.lastSync = fmtTime();
      }, { stateEl: $("#paramsState") });
    };
  });

  $("#btnIRecommend").addEventListener("click", () => {
    $("#inputILimit").value = "8.0";
    setOk($("#protectState"), "已恢复推荐值（示例）");
    logCmd("保护参数", "OK", "恢复 I_limit 推荐值 8.0A");
  });
}

function wireTimers() {
  $("#btnAddTimer").addEventListener("click", () => showDialog("dlgTimer"));
  $("#btnTimerSave").addEventListener("click", () => {
    const d = getCurrentDevice();
    const time = $("#timerTime").value.trim() || "08:30";
    const action = $("#timerAction").value;
    const repeat = $("#timerRepeat").value;
    const t = {
      id: `tm_${Math.random().toString(16).slice(2, 9)}`,
      deviceId: d.id,
      time,
      action,
      repeat,
      enabled: true,
      createdAt: Date.now()
    };
    State.timers.unshift(t);
    State.persist();
    closeDialog("dlgTimer");
    renderTimers();
    logCmd("定时任务", "OK", `新增：${time} ${action}（${repeat}）`);
  });
}

function wireDataPage() {
  // time range segment (reuse seg__btn in data view, but without data-mode attribute)
  $$("#view-data .seg__btn").forEach((b) =>
    b.addEventListener("click", () => {
      $$("#view-data .seg__btn").forEach((x) => x.classList.toggle("is-active", x === b));
      renderData();
    })
  );
  $("#btnExplainPQ").addEventListener("click", () => {
    alert("判读提示（原型）：\n- 压力长期下降 + 流量上升：可能漏水\n- 压力上升 + 流量下降：可能堵塞\n- 波动异常：检查阀门/传感器/电源");
  });
}

function wireMePage() {
  $("#btnOnboarding").addEventListener("click", () => {
    resetOnboarding();
    showDialog("dlgOnboarding");
  });
  $("#btnShare").addEventListener("click", () => {
    alert("分享设备（原型占位）：\n- 生成分享码/二维码\n- 权限：只读/可控\n- 需后端鉴权");
  });
  $("#btnCheckOta").addEventListener("click", async () => {
    const box = $("#otaState");
    setBusy(box, "检查更新中...");
    await wait(700);
    setBusy(box, "发现新版本 v1.2.4，准备升级（原型）...");
    await wait(900);
    setOk(box, "升级完成（原型演示）");
    $("#otaPill").textContent = "当前 v1.2.4";
    logCmd("OTA", "OK", "升级至 v1.2.4（原型）");
  });
  $("#btnService").addEventListener("click", () => {
    alert("客服/报修（原型占位）：\n- 电话\n- 工单\n- 图片/视频上传");
  });
}

function resetOnboarding() {
  setStep(1);
  $("#wiz1").hidden = false;
  $("#wiz2").hidden = true;
  $("#wiz3").hidden = true;
  $("#onbBar").style.width = "20%";
  $("#linkTypeText").textContent = "4G 云连接中…";
}

function setStep(n) {
  $$("#dlgOnboarding .step").forEach((s) => s.classList.toggle("is-active", Number(s.dataset.step) === n));
}

function wireOnboarding() {
  $("#btnMockScan").addEventListener("click", () => {
    setStep(2);
    $("#wiz1").hidden = true;
    $("#wiz2").hidden = false;
    // fake progress（默认 4G）
    (async () => {
      $("#onbBar").style.width = "35%";
      await wait(500);
      $("#onbBar").style.width = "65%";
      await wait(700);
      $("#onbBar").style.width = "100%";
      await wait(300);
      setStep(3);
      $("#wiz2").hidden = true;
      $("#wiz3").hidden = false;
    })();
  });

  $("#btnOnbDone").addEventListener("click", () => {
    const name = $("#onbName").value.trim() || "新水泵设备";
    const code = `CLEDIC-${Math.floor(Math.random() * 9e9 + 1e9)}`;
    const device = {
      id: `dev_${Math.random().toString(16).slice(2, 8)}`,
      name,
      code,
      status: "stopped",
      metrics: {
        p: 0,
        q: 0,
        i: 0,
        v: 0,
        wlPct: 40,
        wlM: 1.6,
        rpm: 0,
        head: 0,
        vIn: 0,
        vOut: 0,
        iOut: 0,
        temp: 26,
        runSec: 0,
        totalSec: 0
      },
      ilimit: 8.0,
      mode: "auto",
      gear: 3
    };
    State.devices.unshift(device);
    State.currentDeviceId = device.id;
    State.lastSync = fmtTime();
    State.persist();
    closeDialog("dlgOnboarding");
    renderAll();
    alert(`已添加设备：${name}\n编码：${code}\n（原型演示）`);
  });
}

function wireAlarms() {
  $("#alarmTicker").addEventListener("click", () => {
    renderAlarms();
    showDialog("dlgAlarms");
  });
  $("#btnAlarmReset").addEventListener("click", async () => {
    const d = getCurrentDevice();
    $("#confirmTitle").textContent = "远程复位确认";
    $("#confirmText").textContent = "将尝试清除故障并恢复运行条件。确定继续？";
    showDialog("dlgConfirm");
    $("#btnConfirmOk").onclick = async () => {
      closeDialog("dlgConfirm");
      const box = $("#commandState");
      setBusy(box, "故障复位：发送中...");
      logCmd("故障复位", "SENT", "指令发送（原型）");
      await wait(800);
      setBusy(box, "故障复位：等待回执...");
      await wait(900);

      // 清掉当前设备的未读告警
      State.alarms.forEach((a) => {
        if (a.deviceId === d.id) a.unread = false;
      });
      if (d.status === "fault") d.status = "stopped";
      State.lastSync = fmtTime();
      State.persist();
      setOk(box, "复位成功：已确认");
      logCmd("故障复位", "OK", "告警已清除（原型）");
      closeDialog("dlgAlarmDetail");
      renderAll();
    };
  });
  $("#btnAlarmService").addEventListener("click", () => alert("联系维修（原型占位）：拨号/工单/定位/图片上传"));
}


function showFaultAlertIfNeeded() {}



function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// periodic metric jitter when running & online (prototype feel)
function startSimulationLoop() {
  window.setInterval(() => {
    const d = getCurrentDevice();
    if (d.status !== "running") return;
    // don't update when offline (shouldn't happen), just in case
    if (d.status === "offline") return;
    const jitter = (v, a, b) => Math.max(a, Math.min(b, v + (Math.random() * 2 - 1) * (b - a) * 0.03));
    d.metrics.p = jitter(d.metrics.p, 0.30, 0.50);
    d.metrics.q = jitter(d.metrics.q, 4, 26);
    d.metrics.i = jitter(d.metrics.i, 3.5, d.ilimit * 0.88); // 保持在限值以下，避免频繁告警
    d.metrics.v = Math.round(jitter(d.metrics.v, 210, 240));
    d.metrics.wlPct = Math.round(jitter(d.metrics.wlPct, 10, 95));
    d.metrics.wlM = +(d.metrics.wlPct / 100 * 4).toFixed(1);
    d.metrics.rpm = Math.round(jitter(d.metrics.rpm || 2600, 1800, 3200));
    d.metrics.head = Math.round(jitter(d.metrics.head || 32, 20, 50));
    d.metrics.vIn = d.metrics.v;
    d.metrics.vOut = Math.max(0, d.metrics.v - 2);
    d.metrics.iOut = +(d.metrics.i || 0).toFixed(1);
    d.metrics.temp = Math.round(jitter(d.metrics.temp || 40, 30, 70));
    d.metrics.runSec = (d.metrics.runSec || 0) + 3;
    d.metrics.totalSec = (d.metrics.totalSec || 0) + 3;

    // if current exceeds limit -> create alarm + mark fault
    if (d.metrics.i > d.ilimit) {
      d.status = "fault";
      const id = `a_${Math.random().toString(16).slice(2, 8)}`;
      State.alarms.unshift({
        id,
        deviceId: d.id,
        level: "high",
        code: "E01",
        title: "过流告警",
        detail: `电流异常：I=${d.metrics.i.toFixed(1)}A > I_limit=${d.ilimit.toFixed(1)}A`,
        createdAt: Date.now(),
        unread: true
      });
      logCmd("告警触发", "ALARM", "E01 过流（原型模拟）");
      showFaultAlertIfNeeded();
    }

    State.lastSync = fmtTime();
    State.persist();
    renderAll();
  }, 2500);
}

function boot() {
  // tab default
  setView("dashboard");

  wireNav();
  wireDialogs();
  wireGaugeParams();
  wireDashboardControls();
  wireControlPage();
  wireTimers();
  wireDataPage();
  wireMePage();
  wireOnboarding();
  wireAlarms();

  $("#btnClearLog").addEventListener("click", () => {
    State.cmdLog = [];
    State.persist();
    renderCmdLog();
  });

  const btnFaultDetail = $("#btnFaultDetail");
  if (btnFaultDetail) {
    btnFaultDetail.addEventListener("click", () => {
      renderAlarms();
      showDialog("dlgAlarms");
    });
  }

  const btnClearFaultLog = $("#btnClearFaultLog");
  if (btnClearFaultLog) {
    btnClearFaultLog.addEventListener("click", () => {
      const d = getCurrentDevice();
      State.alarms = State.alarms.filter((a) => a.deviceId !== d.id);
      State.persist();
      renderAll();
    });
  }

  // 模拟异常按钮（演示用）
  const btnTriggerFaultTest = $("#btnTriggerFaultTest");
  if (btnTriggerFaultTest) {
    btnTriggerFaultTest.addEventListener("click", () => {
      const d = getCurrentDevice();
      const codes = [
        { code: "E01", title: "过流告警", detail: `电流异常：I=${(d.ilimit + 1.2).toFixed(1)}A > I_limit=${d.ilimit.toFixed(1)}A` },
        { code: "E03", title: "缺水保护", detail: "水位传感器检测到水位过低，已触发缺水保护停机" },
        { code: "E12", title: "欠压保护", detail: "电压波动导致欠压保护触发，请检查供电线路" },
      ];
      const pick = codes[Math.floor(Math.random() * codes.length)];
      const alarm = {
        id: `a_test_${Math.random().toString(16).slice(2, 8)}`,
        deviceId: d.id,
        level: "high",
        ...pick,
        createdAt: Date.now(),
        unread: true
      };
      State.alarms.unshift(alarm);
      State.persist();
      renderAll();
      showFaultAlertIfNeeded();
    });
  }

  renderAll();
  // 启动时：将所有已存在告警标记为已读并记录，避免刷新页面反复弹窗
  State.alarms.forEach((a) => {
    a.unread = false;
  });
  State.persist();
  startSimulationLoop();
}

boot();

