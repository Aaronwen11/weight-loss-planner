'use strict';

showStorageWarning();
const user = requireUser();
let plan = requirePlan();
if (!user || !plan) { /* 已重定向 */ }

const root = el('plan-content');
if (!root) throw new Error('缺少 plan-content 容器');

const EXERCISE_IMG = {
  cardio: 'assets/images/exercise-cardio.svg',
  strength: 'assets/images/exercise-strength.svg',
  stretch: 'assets/images/exercise-stretch.svg',
  rest: 'assets/images/exercise-stretch.svg',
};
const TYPE_LABEL = { cardio: '有氧', strength: '力量', stretch: '拉伸', rest: '休息' };
const TYPE_BADGE = { cardio: 'badge-blue', strength: 'badge-orange', stretch: 'badge-green', rest: 'badge-gray' };
const DIET_STYLE_LABEL = { zh: '🍚 中式家常', en: '🥗 西式健身餐' };
const GOAL_LABEL = { fat_loss: '减脂', muscle_gain: '增肌', body_shape: '塑形', maintain: '保持健康' };

function metricsHtml() {
  const m = plan.metrics;
  const u = plan.user;
  const badges = {
    underweight: ['偏瘦', '#4aa3c2'], normal: ['正常', '#3aa76d'],
    overweight: ['超重', '#e8a13a'], obese: ['肥胖', '#e0604f'],
  };
  const [catLabel, catColor] = badges[m.bmiCategoryKey] || ['—', '#888'];
  const cards = [
    { label: 'BMI 指数', value: m.bmi.toFixed(1), sub: '中国标准：' + catLabel, color: catColor },
    { label: '基础代谢 BMR', value: m.bmr + ' kcal', sub: '身体静息消耗' },
    { label: '活动系数', value: m.activity.toFixed(2), sub: '由职业 + 运动频率得出' },
    { label: '每日消耗 TDEE', value: m.tdee + ' kcal', sub: 'BMR × 活动系数' },
    { label: '建议每日摄入', value: m.calorieTarget + ' kcal', sub: GOAL_LABEL[u.goal] + '目标下的推荐值', color: '#e8862d' },
    { label: '每周体重变化', value: m.weeklyRate.replace('（安全速率）', ''), sub: '安全健康的减重速率' },
  ];
  return `
    <section class="card">
      <div class="section-head"><h2>📊 你的身体数据解读</h2>
        <span class="pill">目标：${GOAL_LABEL[u.goal]}</span>
        <span class="pill">BMI 分类：<b style="color:${catColor}">${catLabel}</b></span>
      </div>
      <div class="metric-grid">
        ${cards.map(c => `
          <div class="metric-card">
            <div class="metric-label">${escapeHtml(c.label)}</div>
            <div class="metric-value" ${c.color ? 'style="color:' + c.color + '"' : ''}>${escapeHtml(c.value)}</div>
            <div class="metric-sub">${escapeHtml(c.sub)}</div>
          </div>`).join('')}
      </div>
      ${plan.warnings.medical ? `
        <div class="alert alert-danger">
          <b>⚠️ 重要提示：</b>
          <ul>${plan.warnings.messages.map(x => '<li>' + escapeHtml(x) + '</li>').join('')}</ul>
        </div>` : ''}
      ${user.other ? `<div class="hint">补充说明：${escapeHtml(user.other)}</div>` : ''}
    </section>`;
}

function dietHtml() {
  const d = plan.diet;
  const isFatLoss = plan.user.goal === 'fat_loss';
  return `
    <section class="card">
      <div class="section-head"><h2>🍽️ 饮食方案</h2>
        <span class="pill">${DIET_STYLE_LABEL[d.style] || '中餐'}</span>
        <span class="pill">${GOAL_LABEL[plan.user.goal]}</span>
      </div>

      ${isFatLoss ? `
        <div class="advice-panel">
          <h3>🔥 减脂人群 · 专业饮食建议</h3>
          <ol class="advice-list">
            ${d.advice.map(x => '<li>' + escapeHtml(x) + '</li>').join('')}
          </ol>
        </div>` : `
        <div class="advice-panel advice-panel-plain">
          <h3>💡 ${GOAL_LABEL[plan.user.goal]}饮食要点</h3>
          <ol class="advice-list">
            ${d.advice.map(x => '<li>' + escapeHtml(x) + '</li>').join('')}
          </ol>
        </div>`}

      ${d.schoolGuide ? dietGuideHtml(d.schoolGuide) : ''}
      ${d.takeoutGuide ? dietGuideHtml(d.takeoutGuide) : ''}

      ${weeklyDietHtml()}

      <h3 class="sub-title">🍽️ 基础搭配参考（配图）</h3>
      <div class="meal-grid">
        ${d.meals.map(m => `
          <div class="meal-card">
            <img src="${m.image}" alt="${escapeHtml(m.name)}配图" loading="lazy">
            <div class="meal-body">
              <h4>${escapeHtml(m.name)}</h4>
              <ul class="meal-items">
                ${m.items.map(i => '<li>' + escapeHtml(i) + '</li>').join('')}
              </ul>
              <p class="meal-tip">💡 ${escapeHtml(m.tip)}</p>
            </div>
          </div>`).join('')}
      </div>
    </section>`;
}

function dietGuideHtml(g) {
  return `
    <div class="advice-panel diet-guide">
      <h3>${escapeHtml(g.title)}</h3>
      <div class="guide-cols">
        <div class="guide-col">
          <div class="guide-col-title guide-ok">✅ 能吃 / 推荐</div>
          <ul class="advice-list">${g.can.map(x => '<li>' + escapeHtml(x) + '</li>').join('')}</ul>
        </div>
        <div class="guide-col">
          <div class="guide-col-title guide-no">⛔ 不能吃 / 少吃</div>
          <ul class="advice-list">${g.cannot.map(x => '<li>' + escapeHtml(x) + '</li>').join('')}</ul>
        </div>
      </div>
      ${g.tips ? '<div class="guide-tips">💡 ' + g.tips.map(escapeHtml).join(' · ') + '</div>' : ''}
    </div>`;
}

let weekDay = (new Date().getDay() + 6) % 7; // 周一=0 … 周日=6，打开时自动定位到今天

function weeklyDietHtml() {
  const w = plan.diet.week;
  const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const dayChips = ['一', '二', '三', '四', '五', '六', '日'];
  const mealKeys = [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐'], ['snack', '加餐']];
  const todayIdx = (new Date().getDay() + 6) % 7;
  const d = w.days[weekDay];
  const isCheat = weekDay === w.cheatDayIndex;
  return `
    <div class="weekdiet-card weekdiet-today">
      <div class="weekdiet-head">
        <b>📅 本周食谱 · ${dayLabels[weekDay]}${weekDay === todayIdx ? '（今日）' : ''}</b>
        <div class="weekdiet-nav">
          <button id="week-prev" class="btn btn-mini" title="前一天">◀</button>
          <div class="weekdiet-chips">
            ${w.days.map((_, i) => `
              <button class="weekdiet-chip ${i === weekDay ? 'active' : ''} ${i === w.cheatDayIndex ? 'cheat' : ''} ${i === todayIdx ? 'today' : ''}" data-day="${i}" title="${dayLabels[i]}${i === w.cheatDayIndex ? '（放纵日）' : ''}">${dayChips[i]}</button>`).join('')}
          </div>
          <button id="week-next" class="btn btn-mini" title="后一天">▶</button>
        </div>
      </div>

      ${isCheat ? `
        <div class="weekdiet-cheat">
          <div class="pill pill-orange">${w.cheat.title}</div>
          <p class="weekdiet-cheat-text">${escapeHtml(w.cheat.text)}</p>
        </div>` : `
        <div class="weekdiet-meals">
          ${mealKeys.map(mk => `
            <div class="weekdiet-meal">
              <div class="weekdiet-meal-name">${mk[1]}</div>
              <div class="weekdiet-meal-items">${d[mk[0]].items[w.mode].map(escapeHtml).join(' · ')}</div>
            </div>`).join('')}
        </div>`}

      <div class="weekdiet-foot">
        <span class="hint">💡 自动显示当天食谱，点击右上角日期切换；周日为放纵日。</span>
        <button id="diet-shuffle" class="btn btn-mini btn-ghost">🔄 换一批</button>
      </div>
    </div>`;
}


function exerciseHtml() {
  const ex = plan.exercise;
  return `
    <section class="card">
      <div class="section-head"><h2>🏃 每周运动安排</h2>
        <span class="pill">${plan.metrics.bmiCategory}</span>
      </div>

      <div class="exercise-legend">
        ${Object.keys(TYPE_LABEL).map(k => `
          <span class="badge ${TYPE_BADGE[k]}">${TYPE_LABEL[k]}</span>`).join('')}
      </div>

      <div class="week-grid">
        ${ex.week.map(w => `
          <div class="day-card">
            <div class="day-head">
              <span class="day-name">${escapeHtml(w.day)}</span>
              <span class="badge ${TYPE_BADGE[w.type]}">${TYPE_LABEL[w.type]}</span>
            </div>
            <div class="day-focus">${escapeHtml(w.focus)}</div>
            <div class="day-detail">${escapeHtml(w.detail)}</div>
            <div class="day-duration">⏱ ${escapeHtml(w.duration)}</div>
          </div>`).join('')}
      </div>

      <h3 class="sub-title">运动配图参考</h3>
      <div class="meal-grid exercise-img-grid">
        <div class="meal-card">
          <img src="${EXERCISE_IMG.cardio}" alt="有氧运动配图">
          <div class="meal-body"><h4>有氧训练</h4><p class="meal-tip">快走、慢跑、游泳、骑行、跳绳</p></div>
        </div>
        <div class="meal-card">
          <img src="${EXERCISE_IMG.strength}" alt="力量训练配图">
          <div class="meal-body"><h4>力量训练</h4><p class="meal-tip">深蹲、俯卧撑、哑铃、弹力带</p></div>
        </div>
        <div class="meal-card">
          <img src="${EXERCISE_IMG.stretch}" alt="拉伸放松配图">
          <div class="meal-body"><h4>拉伸放松</h4><p class="meal-tip">运动后静态拉伸，减少酸痛</p></div>
        </div>
      </div>

      <h3 class="sub-title">运动注意事项</h3>
      <ul class="advice-list">
        ${ex.tips.map(t => '<li>' + escapeHtml(t) + '</li>').join('')}
      </ul>
    </section>`;
}

function actionHtml() {
  return `
    <section class="card action-card">
      <h2>✅ 认可这份方案吗？</h2>
      <p>认可后即可创建每日打卡项目，记录体重变化，并获得每日提醒。</p>
      <button id="go-checkin" class="btn btn-primary btn-lg">认可方案，开始打卡 →</button>
      <a href="index.html" class="btn btn-ghost">不满意，重新填写数据</a>
      <p class="form-note">${escapeHtml(plan.disclaimer)}</p>
    </section>`;
}


function goalNoticeHtml() {
  if (!plan.user.goalAdjustReason) return '';
  return `
    <section class="card">
      <div class="alert alert-info">🎯 ${escapeHtml(plan.user.goalAdjustReason)}</div>
    </section>`;
}

function exerciseLibraryHtml() {
  const byCat = {};
  EXERCISE_LIBRARY.forEach(e => { (byCat[e.category] = byCat[e.category] || []).push(e); });
  return `
    <section class="card">
      <div class="section-head"><h2>🏋️ 专业动作库</h2>
        <span class="pill pill-blue">${EXERCISE_LIBRARY.length} 个动作</span>
      </div>
      <details class="exlib-details">
        <summary class="exlib-summary">
          <span class="exlib-summary-text">📂 专业动作库文件夹 — 点击展开 / 收起（${EXERCISE_LIBRARY.length} 个动作，含教学视频）</span>
          <span class="exlib-chevron">▾</span>
        </summary>
        <div class="exlib-content">
          <p class="hint">包含划船、倒蹬、飞鸟、卧推等专业动作要点，每个动作附 B 站教学视频链接（点击跳转搜索对应教学）。</p>
          ${EXERCISE_CATEGORIES.map(cat => {
        const items = byCat[cat.key] || [];
        if (!items.length) return '';
        return `
          <h3 class="sub-title">${escapeHtml(cat.label)}</h3>
          <div class="exlib-grid">
            ${items.map(e => `
              <div class="exlib-card">
                <div class="exlib-head">
                  <b>${escapeHtml(e.name)}</b>
                  <a class="btn btn-mini btn-ghost" href="${exerciseVideoUrl(e.video)}" target="_blank" rel="noopener">📺 教学视频</a>
                </div>
                <div class="exlib-target">🎯 ${escapeHtml(e.target)}</div>
                <p class="exlib-points">${escapeHtml(e.points)}</p>
              </div>`).join('')}
          </div>`;
      }).join('')}
        </div>
      </details>
    </section>`;
}

function renderPlan() {
  plan = Store.get(KEYS.PLAN);
  if (!plan) return;
  root.innerHTML = metricsHtml() + goalNoticeHtml() + dietHtml() + exerciseHtml() + exerciseLibraryHtml() + actionHtml();

  const goBtn = el('go-checkin');
  if (goBtn) goBtn.addEventListener('click', () => { window.location.href = 'checkin.html'; });

  const shuffleBtn = el('diet-shuffle');
  if (shuffleBtn) shuffleBtn.addEventListener('click', () => {
    plan.diet.week = generateDietWeek(plan.diet.style, plan.user.goal);
    Store.set(KEYS.PLAN, plan);
    renderPlan();
  });

  const prevBtn = el('week-prev');
  if (prevBtn) prevBtn.addEventListener('click', () => { weekDay = (weekDay + 6) % 7; renderPlan(); });
  const nextBtn = el('week-next');
  if (nextBtn) nextBtn.addEventListener('click', () => { weekDay = (weekDay + 1) % 7; renderPlan(); });
  root.querySelectorAll('.weekdiet-chip').forEach(chip => {
    chip.addEventListener('click', () => { weekDay = parseInt(chip.dataset.day, 10); renderPlan(); });
  });
}

if (user && plan) {
  renderPlan();
}
