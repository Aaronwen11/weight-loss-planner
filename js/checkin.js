'use strict';

showStorageWarning();
const user = requireUser();
const plan = requirePlan();
if (!user || !plan) { /* 已重定向 */ }

const root = el('checkin-content');
if (!root) throw new Error('缺少 checkin-content 容器');

/* ---------------- 数据读取 ---------------- */
function getCheckin() { return Store.get(KEYS.CHECKIN); }
function getWeightLog() { return Store.get(KEYS.WEIGHT_LOG) || { entries: [] }; }
function getSettings() {
  const s = Store.get(KEYS.SETTINGS) || {};
  return {
    reminderEnabled: !!s.reminderEnabled,
    reminderTime: s.reminderTime || '',
    lastReminderDate: s.lastReminderDate || '',
  };
}
function saveCheckin(c) { Store.set(KEYS.CHECKIN, c); }
function saveWeightLog(l) { Store.set(KEYS.WEIGHT_LOG, l); }
function saveSettings(s) { Store.set(KEYS.SETTINGS, s); }

const GOAL_LABEL = { fat_loss: '减脂', muscle_gain: '增肌', body_shape: '塑形', maintain: '保持健康' };
const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

/* ---------------- 日期工具 ---------------- */
function endDateOf(c) { return formatDate(addDays(parseDate(c.startDate), c.days - 1)); }
function formatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dayIndex(c, dateStr) {
  const idx = daysBetween(c.startDate, dateStr) + 1;
  return Math.min(Math.max(idx, 1), c.days);
}
function weekIdx(dateStr) { return (parseDate(dateStr).getDay() + 6) % 7; } // 周一=0

/* ---------------- 任务 ---------------- */
function tasksFor(dateStr) {
  const week = plan.exercise.week;
  const w = week[weekIdx(dateStr)] || week[0];
  return plan.dailyTasks.map(t => {
    if (t.id === 'exercise') {
      return Object.assign({}, t, { detail: w.focus + '：' + w.detail, type: w.type });
    }
    return Object.assign({}, t);
  });
}
function doneMap(c, dateStr) { return (c.completed && c.completed[dateStr]) || {}; }
function doneCount(c, dateStr, tasks) {
  const m = doneMap(c, dateStr);
  return tasks.filter(t => m[t.id]).length;
}
function isFullDone(c, dateStr, tasks) {
  return doneCount(c, dateStr, tasks) === tasks.length;
}

function streakOf(c) {
  const today = todayStr();
  let d = today;
  let cursor = parseDate(today);
  let count = 0;
  if (!isFullDone(c, d, tasksFor(d))) {
    cursor = addDays(cursor, -1);
    d = formatDate(cursor);
  }
  while (d >= c.startDate && d <= endDateOf(c) && isFullDone(c, d, tasksFor(d))) {
    count++;
    cursor = addDays(cursor, -1);
    d = formatDate(cursor);
  }
  return count;
}

/* ---------------- 渲染入口 ---------------- */
let selectedCalMonth = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); })();

function render() {
  const c = getCheckin();
  if (!c) { renderCreate(); return; }
  renderDashboard(c);
}

function planSummaryHtml() {
  const m = plan.metrics;
  return `
    <div class="mini-metrics">
      <div class="mini"><span>BMI</span><b>${m.bmi.toFixed(1)}</b></div>
      <div class="mini"><span>目标</span><b>${GOAL_LABEL[plan.user.goal]}</b></div>
      <div class="mini"><span>每日摄入</span><b>${m.calorieTarget} kcal</b></div>
      <div class="mini"><span>饮水</span><b>${m.water} ml</b></div>
      <div class="mini"><span>步数</span><b>${m.stepTarget}</b></div>
    </div>`;
}

/* ---------------- 新建打卡项目 ---------------- */
function renderCreate() {
  const existing = getCheckin();
  const nameDefault = '我的' + (GOAL_LABEL[plan.user.goal] || '') + '打卡计划';
  root.innerHTML = `
    <section class="card">
      <div class="section-head"><h2>📝 新建打卡项目</h2><span class="pill">自定义周期</span></div>
      <p class="hint">你的专属方案已生成，认可后即可创建每日打卡项目。以下参数均可自定义。</p>
      ${planSummaryHtml()}
      ${existing ? `<div class="alert alert-warn">⚠️ 当前已有进行中的项目「${escapeHtml(existing.name)}」。创建新项目将替换它（已完成的任务记录会清空，体重记录保留）。</div>` : ''}
      <form id="create-form" class="form-card-inline" novalidate>
        <div class="form-row">
          <div class="form-group">
            <label for="p-name">项目名称</label>
            <input type="text" id="p-name" value="${escapeHtml(nameDefault)}" maxlength="30">
          </div>
          <div class="form-group">
            <label for="p-days">周期天数（天）<span class="req">*</span></label>
            <input type="number" id="p-days" min="1" max="365" step="1" placeholder="例如 30" required>
            <p class="field-error" id="err-p-days"></p>
          </div>
          <div class="form-group">
            <label for="p-start">开始日期</label>
            <input type="date" id="p-start" value="${todayStr()}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="p-time">每日提醒时间 <span class="req">*</span></label>
            <input type="time" id="p-time" required>
            <p class="field-error" id="err-p-time"></p>
            <p class="hint">到点后，网页打开时将通过浏览器通知 + 页面内提醒提示你打卡（浏览器关闭时无法推送）。</p>
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-lg">创建打卡项目 ✅</button>
        <a href="plan.html" class="btn btn-ghost">← 返回查看方案</a>
      </form>
    </section>`;

  el('create-form').addEventListener('submit', e => {
    e.preventDefault();
    const daysRaw = el('p-days').value.trim();
    const time = el('p-time').value.trim();
    const days = parseInt(daysRaw, 10);
    let ok = true;
    if (daysRaw === '' || isNaN(days) || days < 1 || days > 365) {
      el('err-p-days').textContent = '周期天数需为 1–365 的整数';
      ok = false;
    } else { el('err-p-days').textContent = ''; }
    if (!time) {
      el('err-p-time').textContent = '请设置每日提醒时间';
      ok = false;
    } else { el('err-p-time').textContent = ''; }
    if (!ok) return;

    const name = el('p-name').value.trim() || nameDefault;
    const checkin = {
      name,
      days,
      startDate: el('p-start').value || todayStr(),
      createdAt: new Date().toISOString(),
      completed: {},
    };
    saveCheckin(checkin);
    const s = getSettings();
    s.reminderEnabled = true;
    s.reminderTime = time;
    saveSettings(s);
    render();
  });
}

/* ---------------- 打卡主面板 ---------------- */
function renderDashboard(c) {
  const today = todayStr();
  const end = endDateOf(c);
  const idx = dayIndex(c, today);
  const finished = today > end;
  const notStarted = today < c.startDate;
  const tasks = tasksFor(today);
  const done = doneCount(c, today, tasks);
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const streak = streakOf(c);
  const weightLog = getWeightLog();

  root.innerHTML = `
    <section class="card project-head">
      <div class="project-title">
        <h2>📆 ${escapeHtml(c.name)}</h2>
        <div class="pill">第 ${notStarted ? 0 : idx} / ${c.days} 天</div>
        <div class="pill pill-orange">连续打卡 ${streak} 天 🔥</div>
      </div>
      <p class="hint">
        周期：${fmtDateCN(c.startDate)} 至 ${fmtDateCN(end)}
        ${finished ? '' : ' · 剩余 ' + Math.max(0, daysBetween(today, end)) + ' 天'}
      </p>
      <p class="hint saved-note">💾 打卡与体重记录已自动保存在本机浏览器，下次打开自动恢复，无需重新填写问卷。</p>
      <div class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-label">今日完成 ${done}/${total}（${pct}%）</div>
      </div>
      ${finished ? '<div class="alert alert-success">🎉 打卡项目已全部完成！可以新建新项目继续坚持。</div>' : ''}
      ${notStarted ? '<div class="alert alert-warn">⏳ 项目尚未开始，开始日期为 ' + fmtDateCN(c.startDate) + '。</div>' : ''}
    </section>

    ${!finished && !notStarted ? `
    <section class="card">
      <div class="section-head"><h2>✅ 今日任务（${fmtDateCN(today)}）</h2>
        ${pct === 100 ? '<span class="pill pill-green">全部完成 🎉</span>' : `<span class="pill">还有 ${total - done} 项未完成</span>`}
      </div>
      <div class="task-list">
        ${tasks.map(t => {
          const checked = !!doneMap(c, today)[t.id];
          return `
          <label class="task-item ${checked ? 'task-done' : ''}">
            <input type="checkbox" data-task="${t.id}" ${checked ? 'checked' : ''}>
            <span class="task-icon">${t.icon}</span>
            <span class="task-body">
              <span class="task-label">${escapeHtml(t.label)}</span>
              <span class="task-detail">${escapeHtml(t.detail)}</span>
            </span>
            <span class="task-check">${checked ? '✓' : ''}</span>
          </label>`;
        }).join('')}
      </div>
    </section>

        <section class="card">
      <div class="section-head"><h2>⚖️ 体重记录与目标</h2></div>
      <div class="weight-row">
        <div class="form-group">
          <label for="w-input">今天体重（kg）</label>
          <input type="number" id="w-input" min="20" max="300" step="0.1" placeholder="例如 69.5">
          <p class="field-error" id="err-weight"></p>
        </div>
        <button id="w-save" class="btn btn-primary">记录体重</button>
        <div class="form-group">
          <label for="w-target">目标体重（kg）</label>
          <input type="number" id="w-target" min="20" max="300" step="0.1" placeholder="${c.targetWeight ? c.targetWeight : '例如 65'}">
          <p class="field-error" id="err-target"></p>
        </div>
        <button id="w-target-save" class="btn btn-ghost">${c.targetWeight ? '更新目标' : '设定目标'}</button>
      </div>
      ${goalProgressHtml(c, weightLog)}
      ${renderChart(weightLog)}
    </section>

    ` : ''}

    <section class="card">
      <div class="section-head"><h2>🗓 打卡日历</h2></div>
      ${renderCalendar(c)}
    </section>

    <section class="card">
      <div class="section-head"><h2>🔔 每日提醒</h2></div>
      ${renderReminderCard(c)}
    </section>

    <section class="card action-card">
      <h3>项目管理</h3>
      <div class="btn-row">
        <a href="plan.html" class="btn btn-ghost">查看方案</a>
        <a href="index.html" class="btn btn-ghost">重新填写数据</a>
        <button id="btn-new" class="btn btn-primary">新建 / 续期项目</button>
        <button id="btn-reset" class="btn btn-danger">清空打卡记录</button>
      </div>
      <p class="form-note">${escapeHtml(plan.disclaimer)}</p>
    </section>`;

  /* 事件绑定 */
  root.querySelectorAll('input[data-task]').forEach(cb => {
    cb.addEventListener('change', () => {
      const ck = getCheckin();
      if (!ck) return;
      const date = todayStr();
      const tasks = tasksFor(date);
      const wasFull = isFullDone(ck, date, tasks);
      const m = Object.assign({}, doneMap(ck, date));
      if (cb.checked) m[cb.dataset.task] = true; else delete m[cb.dataset.task];
      ck.completed = Object.assign({}, ck.completed, { [date]: m });
      saveCheckin(ck);
      render();
      const nowFull = isFullDone(getCheckin(), date, tasks);
      if (!wasFull && nowFull) launchConfetti();
    });
  });

  const wSave = el('w-save');
  if (wSave) wSave.addEventListener('click', () => {
    const v = parseFloat(el('w-input').value);
    if (isNaN(v) || v < 20 || v > 300) { el('err-weight').textContent = '请输入 20–300 之间的体重'; return; }
    el('err-weight').textContent = '';
    const log = getWeightLog();
    const others = log.entries.filter(x => x.date !== today);
    others.push({ date: today, weight: Math.round(v * 10) / 10 });
    others.sort((a, b) => a.date < b.date ? -1 : 1);
    saveWeightLog({ entries: others });
    render();
  });

  const targetSave = el('w-target-save');
  if (targetSave) targetSave.addEventListener('click', () => {
    const v = parseFloat(el('w-target').value);
    if (isNaN(v) || v < 20 || v > 300) { el('err-target').textContent = '请输入 20–300 之间的目标体重'; return; }
    el('err-target').textContent = '';
    const ck = getCheckin();
    ck.targetWeight = Math.round(v * 10) / 10;
    saveCheckin(ck);
    render();
  });

  const btnNew = el('btn-new');
  if (btnNew) btnNew.addEventListener('click', () => {
    const ck = getCheckin();
    if (ck && window.confirm('新建项目将替换当前项目（任务记录清空，体重记录保留）。确定继续？')) {
      Store.remove(KEYS.CHECKIN);
      render();
    } else if (!ck) { render(); }
  });
  const btnReset = el('btn-reset');
  if (btnReset) btnReset.addEventListener('click', () => {
    if (window.confirm('确定清空所有数据（打卡记录、体重记录、提醒设置）？此操作不可恢复。')) {
      Store.remove(KEYS.CHECKIN);
      Store.remove(KEYS.WEIGHT_LOG);
      Store.remove(KEYS.SETTINGS);
      render();
    }
  });

  /* 日历点击 */
  root.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      const detailBox = el('cal-detail');
      if (!detailBox) return;
      const t = tasksFor(date);
      const m = doneMap(c, date);
      const doneN = t.filter(x => m[x.id]).length;
      const past = date < today && date >= c.startDate;
      const future = date > today;
      let status = '未开始';
      if (date < c.startDate) status = '项目外';
      else if (future) status = '未来';
      else if (doneN === t.length) status = '✅ 全部完成';
      else if (doneN > 0) status = '🟡 部分完成';
      else status = '❌ 未打卡';
      detailBox.innerHTML = `
        <h4>${fmtDateCN(date)} · ${status}</h4>
        <ul class="meal-items">
          ${t.map(x => '<li>' + (m[x.id] ? '✅' : '⬜') + ' ' + escapeHtml(x.label) + '：' + escapeHtml(x.detail) + '</li>').join('')}
        </ul>`;
    });
  });

  bindReminder();
}

/* ---------------- 体重趋势图 ---------------- */
function renderChart(log) {
  const entries = (log.entries || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  if (entries.length < 2) {
    const hint = entries.length === 0
      ? '每天记录体重，记录 2 天后即可看到趋势图 📈'
      : '已记录 1 天，再记录 1 天即可看到趋势图 📈';
    return `<div class="hint">${hint}</div>`;
  }
  const W = 680, H = 240, PAD = { l: 52, r: 20, t: 24, b: 34 };
  const ws = entries.map(x => x.weight);
  let min = Math.min.apply(null, ws), max = Math.max.apply(null, ws);
  const span = Math.max(max - min, 1);
  min = Math.floor(min - span * 0.15);
  max = Math.ceil(max + span * 0.15);
  const x = i => entries.length === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + ((W - PAD.l - PAD.r) * i) / (entries.length - 1);
  const y = v => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - min) / (max - min));
  const grid = [];
  for (let g = 0; g <= 4; g++) {
    const val = min + ((max - min) * g) / 4;
    const gy = y(val);
    grid.push(`<line x1="${PAD.l}" y1="${gy}" x2="${W - PAD.r}" y2="${gy}" class="chart-grid"/>`);
    grid.push(`<text x="${PAD.l - 8}" y="${gy + 4}" class="chart-y">${val.toFixed(1)}</text>`);
  }
  const tickEvery = Math.max(1, Math.ceil(entries.length / 6));
  const xlabels = entries.map((e, i) => {
    const mm = e.date.slice(5).replace('-', '/');
    if (i % tickEvery !== 0 && i !== entries.length - 1) return '';
    return `<text x="${x(i)}" y="${H - 10}" class="chart-x" text-anchor="middle">${mm}</text>`;
  }).join('');
  const pts = entries.map((e, i) => `${x(i)},${y(e.weight)}`).join(' ');
  const firstW = entries[0].weight;
  const last = entries[entries.length - 1];
  const diff = last.weight - firstW;
  const diffText = (diff > 0 ? '+' : '') + diff.toFixed(1);
  const points = entries.map((e, i) =>
    `<circle cx="${x(i)}" cy="${y(e.weight)}" r="4" class="chart-dot ${i === entries.length - 1 ? 'chart-dot-last' : ''}"/>`).join('');
  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="体重趋势图">
        ${grid.join('')}
        <line x1="${PAD.l}" y1="${y(firstW)}" x2="${W - PAD.r}" y2="${y(firstW)}" class="chart-ref"/>
        <text x="${W - PAD.r - 4}" y="${y(firstW) - 6}" class="chart-ref-label" text-anchor="end">起始 ${firstW.toFixed(1)}</text>
        <polyline points="${pts}" class="chart-line"/>
        ${points}
        <text x="${W - PAD.r}" y="${PAD.t - 6}" class="chart-title" text-anchor="end">最新 ${last.weight.toFixed(1)} kg（较起始 ${diffText}）</text>
        ${xlabels}
      </svg>
    </div>`;
}

/* ---------------- 打卡日历 ---------------- */
function renderCalendar(c) {
  const year = selectedCalMonth.getFullYear();
  const month = selectedCalMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 0=周日
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();
  const end = endDateOf(c);

  let cells = '';
  for (let i = 0; i < startWeekday; i++) cells += '<div class="cal-cell cal-empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = formatDate(new Date(year, month, d));
    let cls = 'cal-cell';
    let badge = '';
    if (ds === today) cls += ' cal-today';
    if (ds < c.startDate || ds > end) {
      cls += ' cal-out';
    } else if (ds > today) {
      cls += ' cal-future';
    } else {
      const t = tasksFor(ds);
      const m = doneMap(c, ds);
      const n = t.filter(x => m[x.id]).length;
      if (n === t.length) { cls += ' cal-done'; badge = '✓'; }
      else if (n > 0) { cls += ' cal-partial'; badge = n + '/' + t.length; }
      else { cls += ' cal-miss'; badge = '✗'; }
    }
    cells += `<div class="${cls}" data-date="${ds}"><span class="cal-num">${d}</span>${badge ? `<span class="cal-badge">${badge}</span>` : ''}</div>`;
  }
  const prevDisabled = month === 0 && year < parseDate(c.startDate).getFullYear() - 1;
  return `
    <div class="calendar">
      <div class="cal-head">
        <button id="cal-prev" class="btn btn-mini" ${prevDisabled ? 'disabled' : ''}>‹ 上月</button>
        <span class="cal-title">${year} 年 ${month + 1} 月</span>
        <button id="cal-next" class="btn btn-mini">下月 ›</button>
      </div>
      <div class="cal-weekdays">${DAY_NAMES.map(x => '<span>周' + x + '</span>').join('')}</div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-legend">
        <span><i class="dot dot-done"></i>全部完成</span>
        <span><i class="dot dot-partial"></i>部分完成</span>
        <span><i class="dot dot-miss"></i>未打卡</span>
        <span><i class="dot dot-today"></i>今天</span>
      </div>
      <div id="cal-detail" class="cal-detail"><p class="hint">点击任意日期查看当天任务详情。</p></div>
    </div>`;

  // 注意：事件绑定在 renderDashboard 中通过 .cal-cell 处理
}

/* ---------------- 提醒 ---------------- */
function renderReminderCard(c) {
  const s = getSettings();
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const enabled = s.reminderEnabled;
  let permText = '';
  if (perm === 'unsupported') permText = '<p class="hint">当前浏览器不支持系统通知，仍可使用页面内提醒。</p>';
  else if (perm === 'denied') permText = '<p class="hint">浏览器通知已被拒绝，可在浏览器设置中重新允许；页面内提醒仍可用。</p>';

  return `
    <div class="reminder-card">
      <div class="form-row">
        <div class="form-group">
          <label>每日提醒时间</label>
          <input type="time" id="r-time" value="${escapeHtml(s.reminderTime)}" ${enabled ? '' : 'disabled'}>
        </div>
        <div class="form-group">
          <label>状态</label>
          <div class="btn-row">
            <button id="r-toggle" class="btn ${enabled ? 'btn-danger' : 'btn-primary'}">${enabled ? '关闭提醒' : '开启提醒'}</button>
            <button id="r-save" class="btn btn-ghost" ${enabled ? '' : 'disabled'}>保存时间</button>
          </div>
        </div>
      </div>
      <div id="countdown" class="countdown"></div>
      ${permText}
      <p class="hint">⚠️ 说明：浏览器通知需要本网页保持打开（可切到后台标签页）。浏览器或页面完全关闭后无法推送。页面内提醒条会在到点时出现。</p>
    </div>`;

  // 事件在 bindReminder 中绑定
}

function bindReminder() {
  const s = getSettings();
  const toggle = el('r-toggle');
  const saveBtn = el('r-save');
  const timeInput = el('r-time');
  const countdown = el('countdown');

  if (toggle) toggle.addEventListener('click', () => {
    const st = getSettings();
    if (!st.reminderEnabled) {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      if (!st.reminderTime) {
        alert('请先设置每日提醒时间');
        return;
      }
      st.reminderEnabled = true;
      saveSettings(st);
    } else {
      st.reminderEnabled = false;
      saveSettings(st);
    }
    render();
  });

  if (saveBtn) saveBtn.addEventListener('click', () => {
    const t = timeInput.value.trim();
    if (!t) { alert('请选择提醒时间'); return; }
    const st = getSettings();
    st.reminderTime = t;
    st.lastReminderDate = '';
    saveSettings(st);
    render();
  });

  if (countdown) tickCountdown();
}

let tickTimer = null;
function tickCountdown() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(updateCountdown, 1000);
  updateCountdown();
}

function updateCountdown() {
  const cd = el('countdown');
  if (!cd) { if (tickTimer) clearInterval(tickTimer); return; }
  const s = getSettings();
  const now = new Date();
  const today = todayStr();
  if (!s.reminderEnabled || !s.reminderTime) {
    cd.textContent = '提醒未开启';
    return;
  }
  const [hh, mm] = s.reminderTime.split(':').map(Number);
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
  if (s.lastReminderDate === today) {
    cd.textContent = '✅ 今日提醒已于 ' + s.reminderTime + ' 触发';
    return;
  }
  if (now >= target) {
    cd.textContent = '⏰ 已到提醒时间，记得完成今日打卡！';
    return;
  }
  const diff = target - now;
  const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
  const sec = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
  cd.textContent = '⏳ 距今日提醒还有 ' + h + ':' + m + ':' + sec;
}

/* ---------------- 提醒调度 ---------------- */
function fireNotify(msg) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification('🍃 轻计划打卡提醒', { body: msg }); } catch (e) { /* 忽略 */ }
  }
  showBanner('⏰ ' + msg, 'info');
}
function maybeFireReminder() {
  const s = getSettings();
  if (!s.reminderEnabled || !s.reminderTime) return;
  const now = new Date();
  const today = todayStr();
  const [hh, mm] = s.reminderTime.split(':').map(Number);
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
  if (s.lastReminderDate === today || now < target) return;

  const c = getCheckin();
  if (!c) {
    const msg = '还没有进行中的打卡项目，去新建一个吧！';
    fireNotify(msg);
    s.lastReminderDate = today;
    saveSettings(s);
    return;
  }
  const tasks = tasksFor(today);
  const done = doneCount(c, today, tasks);
  const remain = Math.max(0, tasks.length - done);
  const msg = remain > 0
    ? '该打卡啦！今日还有 ' + remain + ' 项任务未完成。'
    : '今日任务已全部完成，继续保持！';
  fireNotify(msg);
  s.lastReminderDate = today;
  saveSettings(s);
}

function showBanner(text, kind) {
  const b = el('reminder-banner');
  if (!b) return;
  b.textContent = text;
  b.className = 'banner ' + (kind === 'info' ? 'banner-info' : 'banner-warn');
  b.style.display = 'block';
  const close = document.createElement('button');
  close.textContent = '✕';
  close.className = 'banner-close';
  close.addEventListener('click', () => { b.style.display = 'none'; });
  b.appendChild(close);
  setTimeout(() => { if (b.style.display !== 'none') b.style.display = 'none'; }, 10000);
}

/* ---------------- 日历月份导航 ---------------- */
document.addEventListener('click', e => {
  if (e.target && e.target.id === 'cal-prev') {
    selectedCalMonth = new Date(selectedCalMonth.getFullYear(), selectedCalMonth.getMonth() - 1, 1);
    render();
  }
  if (e.target && e.target.id === 'cal-next') {
    selectedCalMonth = new Date(selectedCalMonth.getFullYear(), selectedCalMonth.getMonth() + 1, 1);
    render();
  }
});

/* ---------------- 启动 ---------------- */
if (user && plan) {
  render();
  setInterval(maybeFireReminder, 20000);
  maybeFireReminder();
}

/* ---------------- 体重目标进度与特效 ---------------- */
function getLatestWeight(log) {
  const entries = (log.entries || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  return entries.length ? entries[entries.length - 1].weight : null;
}

function goalProgressHtml(c, log) {
  const start = plan.user.weightKg;
  const target = c.targetWeight;
  const latest = getLatestWeight(log);
  const prog = weightProgress(start, latest, target);
  if (prog === null) {
    return '<div class="hint">💡 设定「目标体重」后，这里会显示达成进度条；进度接近 100% 时会有火焰特效 🔥。</div>';
  }
  const pct = Math.min(100, Math.round(prog * 100));
  const dir = target >= start ? '增' : '减';
  const diff = Math.abs(latest - start);
  const toGo = Math.abs(latest - target);
  let flames = '';
  if (pct >= 85 && pct < 100) {
    flames = '<div class="flame-row"><span class="flame">🔥</span><span class="flame" style="animation-delay:.12s">🔥</span><span class="flame" style="animation-delay:.24s">🔥</span><b>即将达成目标，坚持就是胜利！</b></div>';
  } else if (pct >= 100) {
    flames = '<div class="flame-row"><span class="flame">🔥</span><span class="flame" style="animation-delay:.12s">🔥</span><span class="flame" style="animation-delay:.24s">🔥</span><b>🎉 目标已达成，太棒了！</b></div>';
  }
  return '<div class="goal-progress">' +
    '<div class="goal-head"><span>起始 ' + start.toFixed(1) + ' kg</span><span>当前 ' + latest.toFixed(1) + ' kg</span><span>目标 ' + target.toFixed(1) + ' kg</span><span class="goal-pct">' + pct + '%</span></div>' +
    '<div class="progress-bar goal-bar"><div class="progress-fill' + (pct >= 100 ? ' progress-done' : '') + '" style="width:' + pct + '%"></div></div>' +
    '<div class="goal-meta">已' + dir + ' ' + diff.toFixed(1) + ' kg · 距目标还' + dir + ' ' + toGo.toFixed(1) + ' kg</div>' +
    flames + '</div>';
}

function launchConfetti() {
  const colors = ['#3aa76d', '#e8862d', '#e0604f', '#4aa3c2', '#f6c84b', '#9b5de5', '#2c8c63'];
  for (let i = 0; i < 100; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
    piece.style.animationDuration = (2.2 + Math.random() * 2).toFixed(2) + 's';
    piece.style.width = (6 + Math.random() * 7).toFixed(0) + 'px';
    piece.style.height = (10 + Math.random() * 8).toFixed(0) + 'px';
    if (i % 3 === 0) piece.style.borderRadius = '50%';
    document.body.appendChild(piece);
    setTimeout(() => { try { piece.remove(); } catch (e) { /* 忽略 */ } }, 6000);
  }
}
