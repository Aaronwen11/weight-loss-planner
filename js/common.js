/* ============================================================
 * common.js —— 存储、算法、方案生成（三个页面共用）
 * ============================================================ */
'use strict';

/* ---------------- 存储键 ---------------- */
const KEYS = {
  USER: 'zhi_wlp_user',
  PLAN: 'zhi_wlp_plan',
  CHECKIN: 'zhi_wlp_checkin',
  WEIGHT_LOG: 'zhi_wlp_weight_log',
  SETTINGS: 'zhi_wlp_settings',
};

/* ---------------- 存储封装（localStorage，file:// 不可用时降级内存） ---------------- */
const Store = (() => {
  let memory = {};
  let available = true;
  try {
    const t = '__zhi_wlp_probe__';
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
  } catch (e) {
    available = false;
  }
  return {
    available: () => available,
    get(key) {
      try {
        if (!available) return (key in memory) ? memory[key] : null;
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return (key in memory) ? memory[key] : null;
      }
    },
    set(key, val) {
      memory[key] = val;
      if (available) {
        try { window.localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 忽略 */ }
      }
    },
    remove(key) {
      delete memory[key];
      if (available) {
        try { window.localStorage.removeItem(key); } catch (e) { /* 忽略 */ }
      }
    },
  };
})();

/* ---------------- 常量定义 ---------------- */
const OCCUPATIONS = {
  sedentary: { label: '久坐办公', activity: 1.2, steps: 8000, tip: '每小时起身活动 3–5 分钟，久坐 45 分钟后建议站起来走动、拉伸肩颈。' },
  standing:   { label: '站立工作', activity: 1.3, steps: 9000, tip: '站立较多，注意间歇性走动，睡前做小腿和足底放松，预防下肢浮肿。' },
  student:    { label: '学生',     activity: 1.3, steps: 9000, tip: '学业紧张时容易久坐，课间多走动，尽量保证 7–8 小时睡眠。' },
  retired:    { label: '退休',     activity: 1.2, steps: 7000, tip: '以低冲击运动为主，注意运动前热身和关节保护，量力而行。' },
  physical:   { label: '体力劳动', activity: 1.5, steps: 10000, tip: '工作本身消耗大，注意蛋白质摄入与充分休息，避免训练过度。' },
};

const EXERCISE_FREQS = {
  none:    { label: '几乎不运动', factor: 1.00 },
  rare:    { label: '每周 1–2 次', factor: 1.10 },
  regular: { label: '每周 3–4 次', factor: 1.20 },
  high:    { label: '每周 5 次以上', factor: 1.30 },
};

const GOALS = {
  fat_loss:   { label: '减脂' },
  muscle_gain:{ label: '增肌' },
  body_shape: { label: '塑形' },
  maintain:   { label: '保持健康' },
};

const BMI_CATEGORIES = [
  { key: 'underweight', label: '偏瘦', min: 0,    max: 18.5, color: '#4aa3c2' },
  { key: 'normal',      label: '正常', min: 18.5, max: 24,   color: '#3aa76d' },
  { key: 'overweight',  label: '超重', min: 24,   max: 28,   color: '#e8a13a' },
  { key: 'obese',       label: '肥胖', min: 28,   max: 99,   color: '#e0604f' },
];

/* ---------------- 基础算法 ---------------- */
function calcBMI(weightKg, heightCm) {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

function bmiCategory(bmi) {
  for (const c of BMI_CATEGORIES) {
    if (bmi >= c.min && bmi < c.max) return c;
  }
  return BMI_CATEGORIES[3];
}

function calcBMR(gender, weightKg, heightCm, age) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return gender === 'male' ? base + 5 : base - 161;
}

function calcActivity(occKey, freqKey) {
  const occ = OCCUPATIONS[occKey] || OCCUPATIONS.sedentary;
  const freq = EXERCISE_FREQS[freqKey] || EXERCISE_FREQS.none;
  const v = occ.activity * freq.factor;
  return Math.min(2.0, Math.max(1.2, Math.round(v * 100) / 100));
}

function calorieTarget(goal, tdee, gender, bmi) {
  const floor = gender === 'male' ? 1500 : 1200;
  if (goal === 'fat_loss') {
    const deficit = bmi >= 28 ? 500 : 400;
    return Math.max(floor, Math.round(tdee - deficit));
  }
  if (goal === 'muscle_gain') return Math.round(tdee + 300);
  if (goal === 'body_shape') return Math.max(floor, Math.round(tdee - 100));
  return Math.round(tdee);
}

function proteinPerKg(goal) {
  if (goal === 'fat_loss') return 1.4;
  if (goal === 'muscle_gain') return 1.8;
  if (goal === 'body_shape') return 1.5;
  return 1.2;
}

function waterTarget(weightKg) {
  const v = Math.round((weightKg * 35) / 100) * 100;
  return Math.max(1500, v);
}

function weeklyRateText(goal) {
  if (goal === 'fat_loss') return '每周减重约 0.5–1 kg（安全速率）';
  if (goal === 'muscle_gain') return '每周增重约 0.25–0.5 kg';
  if (goal === 'body_shape') return '体重以稳定为主，重点改善体脂与线条';
  return '维持当前体重';
}

/* ---------------- 饮食方案数据 ---------------- */
function zhMeals(goal) {
  const fat = goal === 'fat_loss';
  const gain = goal === 'muscle_gain';
  return [
    {
      id: 'breakfast', name: '早餐', image: 'assets/images/food-zh-breakfast.svg',
      items: fat
        ? ['杂粮粥 250g（或无糖豆浆 300ml）', '水煮蛋 1 个（约 50g）', '全麦馒头 70g / 蒸玉米 150g']
        : gain
          ? ['燕麦 60g + 牛奶 300ml', '鸡蛋 2 个（约 100g）', '香蕉 1 根（约 120g）']
          : ['小米粥 250g / 无糖豆浆 300ml', '鸡蛋 1 个（约 50g）', '全麦面包 70g / 包子 100g'],
      tip: fat ? '早餐吃够蛋白质，饱腹感更持久。' : gain ? '早餐碳水充足，为训练供能。' : '按时吃早餐，唤醒代谢。',
    },
    {
      id: 'lunch', name: '午餐', image: 'assets/images/food-zh-lunch.svg',
      items: fat
        ? ['杂粮饭 150g（熟重）', '清蒸鱼 / 鸡胸肉 120g', '西兰花 150g + 木耳 30g + 时蔬 100g']
        : gain
          ? ['米饭 300g（熟重）', '牛肉 / 鸡肉 180g', '蔬菜 200g + 豆腐 150g']
          : ['米饭 200g（熟重）', '瘦肉 / 鱼虾 120g', '两道蔬菜 共 250g'],
      tip: fat ? '主食减半、荤素搭配，先吃菜和肉再吃主食。' : gain ? '午餐是全天最大一餐，保证蛋白质与碳水。' : '七分饱即可，细嚼慢咽。',
    },
    {
      id: 'dinner', name: '晚餐', image: 'assets/images/food-zh-dinner.svg',
      items: fat
        ? ['南瓜 / 红薯 200g', '凉拌豆腐 150g / 虾仁 100g', '清炒时蔬 250g']
        : gain
          ? ['米饭 250g（熟重）', '鱼 / 蛋 150g', '蔬菜汤 300ml + 时蔬 200g']
          : ['杂粮饭 100g（熟重）', '清蒸鱼 / 蛋 100g', '蔬菜 300g'],
      tip: fat ? '晚餐清淡、少油少盐，睡前 3 小时完成进食。' : gain ? '晚餐不宜过晚，保证睡前不饿即可。' : '睡前 3 小时完成晚餐。',
    },
    {
      id: 'snack', name: '加餐', image: 'assets/images/food-zh-snack.svg',
      items: fat
        ? ['无糖酸奶 150g', '或应季水果 150g', '或原味坚果 15g（约一小把）']
        : gain
          ? ['全麦面包 70g + 花生酱 15g', '或牛奶 300ml + 香蕉 1 根（约 120g）', '或酸奶 200g + 坚果 20g']
          : ['水果 150g', '或原味坚果 15g', '或酸奶 150g'],
      tip: fat ? '两餐之间饿时再吃，不要过量。' : gain ? '训练后 1 小时内补充蛋白质 + 碳水效果最佳。' : '加餐热量控制在 150 kcal 以内。',
    },
  ];
}

function enMeals(goal) {
  const fat = goal === 'fat_loss';
  const gain = goal === 'muscle_gain';
  return [
    {
      id: 'breakfast', name: '早餐', image: 'assets/images/food-en-breakfast.svg',
      items: fat
        ? ['燕麦片 40g + 低脂牛奶 250ml', '水煮蛋 / 煎蛋 1 个（约 50g）', '蓝莓 / 草莓 100g']
        : gain
          ? ['燕麦 60g + 全脂牛奶 300ml', '鸡蛋 2 个（约 100g）+ 全麦吐司 70g', '香蕉 1 根（约 120g）']
          : ['全麦吐司 70g + 牛油果 60g', '煎蛋 / 鸡蛋 1 个（约 50g）', '牛奶 250ml / 黑咖啡 200ml'],
      tip: fat ? '燕麦选无糖款，牛奶选低脂，蛋白质充足更抗饿。' : gain ? '早餐吃足碳水，为训练储备能量。' : '搭配均衡，开启元气一天。',
    },
    {
      id: 'lunch', name: '午餐', image: 'assets/images/food-en-lunch.svg',
      items: fat
        ? ['鸡胸肉 150g', '生菜 / 番茄 / 黄瓜 沙拉 250g', '全麦面包 70g + 橄榄油 10ml']
        : gain
          ? ['烤鸡腿 / 牛排 180g', '土豆 / 全麦意面 250g', '时蔬沙拉 250g']
          : ['三文鱼 / 鸡胸肉 120g', '藜麦 60g（熟约 180g）', '蔬菜沙拉 250g'],
      tip: fat ? '沙拉酱选油醋汁，避开千岛酱、蛋黄酱等高热量酱料。' : gain ? '午餐主食充足，训练日可多加一份碳水。' : '蔬菜打底，蛋白质为主。',
    },
    {
      id: 'dinner', name: '晚餐', image: 'assets/images/food-en-dinner.svg',
      items: fat
        ? ['烤三文鱼 / 白身鱼 150g', '烤芦笋 / 彩椒 250g', '藜麦 60g（熟约 180g）']
        : gain
          ? ['煎鸡胸 / 牛肉 180g', '土豆泥 / 意面 250g', '烤蔬菜 200g']
          : ['煎鱼 / 鸡蛋 100g', '红薯 200g / 玉米 1 根（约 200g）', '蔬菜沙拉 250g'],
      tip: fat ? '晚餐用烤、蒸代替油炸，控制在睡前 3 小时前完成。' : gain ? '晚餐保证蛋白质，睡前 2 小时完成。' : '清淡收尾，睡得更安稳。',
    },
    {
      id: 'snack', name: '加餐', image: 'assets/images/food-en-snack.svg',
      items: fat
        ? ['希腊酸奶 150g', '或蛋白棒 1 根（约 60g）', '或坚果 15g']
        : gain
          ? ['花生酱全麦吐司（面包 70g + 花生酱 20g）', '或香蕉 1 根（约 120g）+ 牛奶 300ml', '或蛋白奶昔 300ml']
          : ['水果 150g', '或希腊酸奶 150g', '或坚果 15g'],
      tip: fat ? '选高蛋白低糖加餐，避免甜点饮料。' : gain ? '训练后加餐是增肌关键一餐。' : '加餐热量控制在 150 kcal 以内。',
    },
  ];
}

function goalAdvice(goal, user, plan) {
  if (goal === 'fat_loss') {
    return [
      '制造热量缺口：每日摄入比消耗低 300–500 kcal，已按你的数据计算为约 ' + plan.calorieTarget + ' kcal/天，不低于安全下限。',
      '蛋白质充足：每天 ' + plan.protein.toFixed(1) + ' g（约 ' + plan.proteinPerKg + ' g/kg 体重），分配到三餐，保留肌肉、增强饱腹。',
      '主食粗细搭配：用杂粮、燕麦、红薯等替代部分精米白面，平稳血糖。',
      '控制油盐糖：多蒸煮炖、少煎炸；少喝甜饮料，少吃糕点与加工食品。',
      '调整进餐顺序：先喝汤/吃蔬菜 → 再吃肉蛋 → 最后吃主食，更容易控制食量。',
      '每天饮水 ' + plan.water + ' ml，饭前喝一杯水可增强饱腹感。',
      '规律三餐、不节食；每周可安排 1 次「自由餐」，避免长期压抑后暴食。',
    ];
  }
  if (goal === 'muscle_gain') {
    return [
      '热量盈余：每日摄入比消耗高约 300 kcal（建议约 ' + plan.calorieTarget + ' kcal/天）。',
      '蛋白质每天 ' + plan.protein.toFixed(1) + ' g（约 ' + plan.proteinPerKg + ' g/kg 体重），训练后 1 小时内补充蛋白质 + 碳水。',
      '保证 7–8 小时睡眠，肌肉在休息中生长。',
      '每周至少 3 次力量训练，逐步增加负重（渐进超负荷）。',
    ];
  }
  if (goal === 'body_shape') {
    return [
      '轻微热量缺口（建议约 ' + plan.calorieTarget + ' kcal/天），重点降低体脂、塑造线条。',
      '蛋白质每天 ' + plan.protein.toFixed(1) + ' g（约 ' + plan.proteinPerKg + ' g/kg 体重），配合力量训练。',
      '每周 2–3 次力量 + 2 次有氧，训练后充分拉伸。',
    ];
  }
  return [
    '保持均衡饮食：主食、蛋白质、蔬菜、水果、奶类都要有。',
    '每日摄入约 ' + plan.calorieTarget + ' kcal，与消耗基本持平。',
    '每周 150 分钟中等强度运动，保持良好作息。',
  ];
}

/* ---------------- 运动方案数据 ---------------- */
function exerciseWeek(catKey, goal, occKey) {
  const isObese = catKey === 'obese';
  const isThin = catKey === 'underweight';
  const gain = goal === 'muscle_gain';
  const loss = goal === 'fat_loss';

  if (isObese) {
    return [
      { day: '周一', focus: '低冲击有氧', detail: '快走 / 游泳 / 水中行走 20–30 分钟，微微出汗即可', type: 'cardio', duration: '25分钟' },
      { day: '周二', focus: '全身轻力量', detail: '坐姿抬腿、靠墙静蹲、臀桥、墙壁俯卧撑 各 2 组×12 次', type: 'strength', duration: '20分钟' },
      { day: '周三', focus: '低冲击有氧', detail: '快走 / 骑行（平路） 25–35 分钟，保持能说话的强度', type: 'cardio', duration: '30分钟' },
      { day: '周四', focus: '全身轻力量', detail: '弹力带划船、沙发深蹲、站姿提踵、平板支撑 30 秒', type: 'strength', duration: '20分钟' },
      { day: '周五', focus: '低冲击有氧', detail: '游泳 / 椭圆机 / 快走 25–35 分钟', type: 'cardio', duration: '30分钟' },
      { day: '周六', focus: '拉伸放松', detail: '全身静态拉伸 15 分钟 + 轻松散步 20 分钟', type: 'stretch', duration: '35分钟' },
      { day: '周日', focus: '休息', detail: '休息为主，可散步 20 分钟，早点休息', type: 'rest', duration: '—' },
    ];
  }
  if (isThin && gain) {
    return [
      { day: '周一', focus: '力量·下肢', detail: '深蹲、弓步蹲、臀桥 各 3 组×12 次，哑铃负重循序渐进', type: 'strength', duration: '40分钟' },
      { day: '周二', focus: '轻松有氧', detail: '慢跑 / 快走 20 分钟（低强度，不消耗过多热量）', type: 'cardio', duration: '20分钟' },
      { day: '周三', focus: '力量·上肢', detail: '俯卧撑、哑铃推举、划船 各 3 组×10–12 次', type: 'strength', duration: '40分钟' },
      { day: '周四', focus: '休息 / 拉伸', detail: '全身拉伸 15 分钟，保证充足睡眠', type: 'stretch', duration: '15分钟' },
      { day: '周五', focus: '力量·全身', detail: '硬拉（轻重量）、卧推、引体（或弹力带） 各 3 组×8–10 次', type: 'strength', duration: '45分钟' },
      { day: '周六', focus: '核心训练', detail: '平板支撑、卷腹、死虫式 各 3 组 + 拉伸', type: 'strength', duration: '30分钟' },
      { day: '周日', focus: '休息', detail: '充分休息与进食，为下一周训练做准备', type: 'rest', duration: '—' },
    ];
  }
  if (loss) {
    return [
      { day: '周一', focus: '有氧', detail: '快走 / 慢跑 / 跳绳 30–40 分钟（强度：微喘但能说话）', type: 'cardio', duration: '35分钟' },
      { day: '周二', focus: '全身力量', detail: '深蹲、俯卧撑、臀桥、平板支撑 各 3 组×12–15 次', type: 'strength', duration: '30分钟' },
      { day: '周三', focus: '有氧', detail: '快走 / 骑行 / 游泳 30–40 分钟', type: 'cardio', duration: '35分钟' },
      { day: '周四', focus: '上肢 + 核心', detail: '哑铃划船、推举、卷腹、侧平板 各 3 组×12 次', type: 'strength', duration: '30分钟' },
      { day: '周五', focus: '有氧', detail: '慢跑 / 跳绳 / 游泳 30–40 分钟', type: 'cardio', duration: '35分钟' },
      { day: '周六', focus: '拉伸放松', detail: '全身拉伸 20 分钟 + 轻松散步 30 分钟', type: 'stretch', duration: '50分钟' },
      { day: '周日', focus: '休息', detail: '休息或轻松散步，恢复体力', type: 'rest', duration: '—' },
    ];
  }
  // 正常 / 塑形 / 保持 的均衡安排
  return [
    { day: '周一', focus: '力量·全身', detail: '深蹲、俯卧撑、臀桥、划船 各 3 组×12 次', type: 'strength', duration: '35分钟' },
    { day: '周二', focus: '有氧', detail: '慢跑 / 快走 / 骑行 30 分钟', type: 'cardio', duration: '30分钟' },
    { day: '周三', focus: '力量·上肢核心', detail: '哑铃推举、划船、平板支撑、卷腹 各 3 组×12 次', type: 'strength', duration: '35分钟' },
    { day: '周四', focus: '有氧', detail: '游泳 / 跳绳 / 快走 30 分钟', type: 'cardio', duration: '30分钟' },
    { day: '周五', focus: '力量·下肢', detail: '深蹲、弓步蹲、提踵、臀桥 各 3 组×12 次', type: 'strength', duration: '35分钟' },
    { day: '周六', focus: '拉伸 / 户外', detail: '全身拉伸 20 分钟，或户外徒步 / 球类 40 分钟', type: 'stretch', duration: '40分钟' },
    { day: '周日', focus: '休息', detail: '休息为主，可轻松散步', type: 'rest', duration: '—' },
  ];
}

function exerciseTips(catKey, goal, occKey) {
  const tips = [
    '运动前热身 5–10 分钟（原地慢跑、关节环绕），运动后拉伸 10 分钟，减少受伤。',
    '每周安排 1–2 个完整休息日，给身体恢复时间，避免过度训练。',
  ];
  if (catKey === 'obese') {
    tips.unshift('体重基数较大：优先选择快走、游泳、骑车等低冲击运动，保护膝关节；循序渐进，每次以「微微出汗、能说话」为准。');
  }
  if (catKey === 'underweight') {
    tips.unshift('偏瘦人群以力量训练为主，有氧适量即可，配合足量进食帮助增重增肌。');
  }
  if (catKey === 'overweight') {
    tips.unshift('超重人群以中低强度有氧为主、力量为辅，注意控制运动时长递增幅度。');
  }
  tips.push(OCCUPATIONS[occKey] ? OCCUPATIONS[occKey].tip : OCCUPATIONS.sedentary.tip);
  return tips;
}

/* ---------------- 方案生成 ---------------- */
function buildPlan(user) {
  const { gender, weightKg, heightCm, age, occupation, exerciseFreq, goal, dietStyle, chronic } = user;
  const bmi = calcBMI(weightKg, heightCm);
  const cat = bmiCategory(bmi);
  const bmr = calcBMR(gender, weightKg, heightCm, age);
  const activity = calcActivity(occupation, exerciseFreq);
  const tdee = Math.round(bmr * activity);
  const cal = calorieTarget(goal, tdee, gender, bmi);
  const protein = proteinPerKg(goal) * weightKg;
  const water = waterTarget(weightKg);
  const meals = dietStyle === 'en' ? enMeals(goal) : zhMeals(goal);
  const week = exerciseWeek(cat.key, goal, occupation);
  const stepTarget = cat.key === 'obese' ? 6000 : OCCUPATIONS[occupation].steps;

  const medical = bmi >= 32 || (Array.isArray(chronic) && chronic.length > 0);
  const medicalMsg = [];
  if (bmi >= 32) medicalMsg.push('你的 BMI 已达到 ' + bmi.toFixed(1) + '，属于较高水平，建议先咨询医生或注册营养师，制定安全减重计划。');
  if (Array.isArray(chronic)) {
    if (chronic.indexOf('hypertension') >= 0) medicalMsg.push('你勾选了高血压：饮食请严格控盐（每日 <5g），运动循序渐进，避免憋气发力。');
    if (chronic.indexOf('diabetes') >= 0) medicalMsg.push('你勾选了糖尿病：请选择低 GI 主食、规律进餐，运动前注意血糖监测，避免低血糖。');
    if (chronic.indexOf('gout') >= 0) medicalMsg.push('你勾选了痛风：控制嘌呤摄入（少喝肉汤、少吃动物内脏与海鲜），多饮水帮助尿酸排出。');
  }
  const veryThin = bmi < 16.5;
  if (veryThin) medicalMsg.push('你的 BMI 低于 16.5，属于明显偏瘦，建议先就医排查原因，再在医生指导下增重。');

  const dailyTasks = [
    { id: 'water', icon: '💧', label: '饮水', detail: '达到 ' + water + ' ml' },
    { id: 'steps', icon: '👣', label: '步数', detail: '达到 ' + stepTarget + ' 步' },
    { id: 'breakfast', icon: '🍳', label: '早餐', detail: '按方案完成健康早餐' },
    { id: 'lunch', icon: '🍱', label: '午餐', detail: '按方案完成健康午餐' },
    { id: 'dinner', icon: '🥗', label: '晚餐', detail: '按方案完成健康晚餐' },
    { id: 'exercise', icon: '🏃', label: '当日运动', detail: '按今日计划完成运动' },
  ];

  return {
    generatedAt: new Date().toISOString(),
    user: Object.assign({}, user),
    metrics: {
      bmi: Math.round(bmi * 10) / 10,
      bmiCategory: cat.label,
      bmiCategoryKey: cat.key,
      bmiColor: cat.color,
      bmr: Math.round(bmr),
      activity,
      tdee,
      calorieTarget: cal,
      protein: Math.round(protein * 10) / 10,
      proteinPerKg: proteinPerKg(goal),
      water,
      stepTarget,
      weeklyRate: weeklyRateText(goal),
    },
    diet: (() => {
      const diet = {
        style: dietStyle,
        meals,
        week: generateDietWeek(dietStyle, goal),
        advice: goalAdvice(goal, user, {
          calorieTarget: cal,
          protein: Math.round(protein * 10) / 10,
          proteinPerKg: proteinPerKg(goal),
          water,
        }),
      };
      if (user.occupation === 'student') diet.schoolGuide = SCHOOL_GUIDE;
      if (user.canCook === 'no') diet.takeoutGuide = TAKEOUT_GUIDE;
      return diet;
    })(),
    exercise: { week, tips: exerciseTips(cat.key, goal, occupation) },
    dailyTasks,
    warnings: {
      medical,
      messages: medicalMsg,
    },
    disclaimer: '本方案为通用健康参考，不构成医疗建议。如有慢性病或特殊身体状况，请以医生或注册营养师的指导为准。',
  };
}

/* ---------------- 通用 UI 辅助 ---------------- */
function el(id) { return document.getElementById(id); }

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function parseDate(s) {
  const p = s.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function daysBetween(a, b) { // b - a（天数）
  const A = parseDate(a), B = parseDate(b);
  return Math.round((B - A) / 86400000);
}

function fmtDateCN(s) {
  const p = s.split('-').map(Number);
  return p[0] + ' 年 ' + p[1] + ' 月 ' + p[2] + ' 日';
}

function showStorageWarning() {
  const w = el('storage-warning');
  if (w) {
    if (!Store.available()) {
      w.style.display = 'block';
    } else {
      w.style.display = 'none';
    }
  }
}

function requireUser() {
  const user = Store.get(KEYS.USER);
  if (!user) {
    window.location.href = 'index.html';
    return null;
  }
  return user;
}

function requirePlan() {
  const plan = Store.get(KEYS.PLAN);
  if (!plan) {
    window.location.href = 'index.html';
    return null;
  }
  return plan;
}

/* ---------------- 目标自动调整（保持健康 + 超重/肥胖 → 减脂） ---------------- */
function maybeAdjustGoal(user) {
  const adjusted = Object.assign({}, user);
  let reason = null;
  const bmi = calcBMI(user.weightKg, user.heightCm);
  const cat = bmiCategory(bmi);
  if (user.goal === 'maintain' && (cat.key === 'overweight' || cat.key === 'obese')) {
    adjusted.goal = 'fat_loss';
    adjusted.goalAdjustedFrom = 'maintain';
    reason = '你的 BMI 为 ' + bmi.toFixed(1) + '（' + cat.label + '），已自动将「保持健康」目标调整为「减脂」，以便更有效地管理体重。';
    adjusted.goalAdjustReason = reason;
  } else {
    delete adjusted.goalAdjustedFrom;
    delete adjusted.goalAdjustReason;
  }
  return { user: adjusted, reason, bmi, category: cat };
}

/* ---------------- 体重目标进度 ---------------- */
/* start 起始体重 / current 当前体重 / target 目标体重；返回 0~1.2 的进度（null 表示数据不足） */
function weightProgress(start, current, target) {
  if (start == null || current == null || target == null) return null;
  const diff = target - start;
  if (diff === 0) return 1;
  const done = (current - start) / diff;
  return Math.min(1.2, Math.max(0, done));
}

/* ---------------- 专业动作库（附教学视频） ---------------- */
const EXERCISE_CATEGORIES = [
  { key: 'cardio', label: '有氧训练' },
  { key: 'chest', label: '胸部' },
  { key: 'back', label: '背部' },
  { key: 'legs', label: '腿部' },
  { key: 'shoulders', label: '肩部' },
  { key: 'core', label: '核心' },
  { key: 'stretch', label: '拉伸放松' },
];

const EXERCISE_LIBRARY = [
  /* 有氧 */
  { id: 'brisk-walk', name: '快走', category: 'cardio', target: '心肺耐力 · 全身', points: '步幅略大于日常，摆臂自然，心率达到微喘但能说话的程度。', video: '快走 正确姿势 教学' },
  { id: 'jogging', name: '慢跑', category: 'cardio', target: '心肺耐力 · 燃脂', points: '前脚掌/全脚掌着地，躯干微前倾，步频 170 左右更护膝。', video: '慢跑 正确姿势 教学' },
  { id: 'swimming', name: '游泳', category: 'cardio', target: '全身 · 低冲击', points: '对膝盖最友好；自由泳/蛙泳交替，注意呼吸节奏与核心收紧。', video: '游泳 自由泳 教学' },
  { id: 'cycling', name: '骑行', category: 'cardio', target: '下肢 · 心肺', points: '坐垫高度调整到踩到底时膝盖微屈，保持踏频 70–90。', video: '骑行 正确姿势 教学' },
  { id: 'jump-rope', name: '跳绳', category: 'cardio', target: '全身 · 燃脂效率高', points: '前脚掌着地、手腕发力摇绳，膝盖微屈缓冲，落地轻。', video: '跳绳 正确姿势 教学' },
  /* 胸部 */
  { id: 'push-up', name: '俯卧撑', category: 'chest', target: '胸大肌 · 肱三头 · 核心', points: '身体成直线，下降时肘部约 45°，胸部接近地面后推起。', video: '俯卧撑 标准动作 教学' },
  { id: 'bench-press', name: '杠铃卧推', category: 'chest', target: '胸大肌 · 肱三头 · 前束', points: '肩胛后缩下沉，杠铃下落至胸部中缝，推起时不完全锁死肘。', video: '杠铃卧推 标准动作 教学' },
  { id: 'dumbbell-fly', name: '哑铃飞鸟', category: 'chest', target: '胸大肌（中缝）', points: '肘微屈固定角度，双臂如抱大树打开，感受胸部拉伸再合拢。', video: '哑铃飞鸟 标准动作 教学' },
  { id: 'incline-press', name: '上斜卧推', category: 'chest', target: '胸大肌上束', points: '凳角约 30–45°，杠铃下落至锁骨下方，避免耸肩。', video: '上斜卧推 标准动作 教学' },
  /* 背部 */
  { id: 'seated-row', name: '坐姿划船', category: 'back', target: '背阔肌 · 斜方肌中束', points: '挺胸收腹，肩胛先内收再拉肘，还原时控制离心。', video: '坐姿划船 标准动作 教学' },
  { id: 'barbell-row', name: '杠铃划船', category: 'back', target: '背阔肌 · 竖脊肌', points: '俯身约 45°，核心收紧，杠铃沿大腿拉向腹部，不要借腰。', video: '杠铃划船 标准动作 教学' },
  { id: 'lat-pulldown', name: '高位下拉', category: 'back', target: '背阔肌', points: '握距略宽于肩，下拉至锁骨位置，挺胸，肘部向下向后。', video: '高位下拉 标准动作 教学' },
  { id: 'pull-up', name: '引体向上', category: 'back', target: '背阔肌 · 二头', points: '肩胛下沉启动，下巴过杠即可；力量不足可用弹力带辅助。', video: '引体向上 标准动作 教学' },
  /* 腿部 */
  { id: 'squat', name: '深蹲', category: 'legs', target: '股四头 · 臀大肌', points: '双脚与肩同宽，膝盖与脚尖同向，下蹲到大腿平行地面，腰背挺直。', video: '深蹲 标准动作 教学' },
  { id: 'lunge', name: '弓步蹲', category: 'legs', target: '股四头 · 臀大肌', points: '前腿膝盖不超过脚尖，后腿膝盖接近地面，躯干直立。', video: '弓步蹲 标准动作 教学' },
  { id: 'leg-press', name: '倒蹬（腿举）', category: 'legs', target: '股四头 · 臀大肌', points: '器械上调整靠背角度，膝盖不要完全锁死，下放至大腿接近 90°。', video: '倒蹬 腿举 标准动作 教学' },
  { id: 'hip-thrust', name: '臀桥', category: 'legs', target: '臀大肌 · 腘绳肌', points: '肩胛靠凳，髋部向上顶至身体成直线，顶端夹紧臀部 1–2 秒。', video: '臀桥 标准动作 教学' },
  { id: 'romanian-deadlift', name: '罗马尼亚硬拉', category: 'legs', target: '腘绳肌 · 臀大肌', points: '杠铃贴近大腿下放，髋向后折叠，背部平直，感受大腿后侧拉伸。', video: '罗马尼亚硬拉 标准动作 教学' },
  { id: 'calf-raise', name: '站姿提踵', category: 'legs', target: '小腿三头肌', points: '前脚掌踩踏，脚跟尽量抬高，顶端停顿 1 秒再缓慢下落。', video: '站姿提踵 标准动作 教学' },
  /* 肩部 */
  { id: 'shoulder-press', name: '哑铃推举', category: 'shoulders', target: '三角肌前束 · 中束', points: '坐姿靠背，哑铃推至头顶上方，避免腰部过度反弓。', video: '哑铃推举 标准动作 教学' },
  { id: 'lateral-raise', name: '侧平举', category: 'shoulders', target: '三角肌中束', points: '肘微屈，向两侧抬至与肩同高，控制下放，不要耸肩借力。', video: '哑铃侧平举 标准动作 教学' },
  /* 核心 */
  { id: 'plank', name: '平板支撑', category: 'core', target: '腹横肌 · 核心稳定', points: '肘撑地，身体成一条直线，收紧腹部与臀部，不要塌腰。', video: '平板支撑 标准动作 教学' },
  { id: 'crunch', name: '卷腹', category: 'core', target: '腹直肌', points: '下背贴地，用腹部卷起上背，颈部放松，不要用手拉头。', video: '卷腹 标准动作 教学' },
  { id: 'dead-bug', name: '死虫式', category: 'core', target: '核心抗伸展', points: '仰卧，对侧手脚同时缓慢伸展，腰部始终贴地。', video: '死虫式 标准动作 教学' },
  { id: 'russian-twist', name: '俄罗斯转体', category: 'core', target: '腹斜肌', points: '坐姿上身后倾，双脚离地，双手左右转体，感受侧腹发力。', video: '俄罗斯转体 标准动作 教学' },
  /* 拉伸 */
  { id: 'full-stretch', name: '全身静态拉伸', category: 'stretch', target: '全身放松', points: '每个动作保持 20–30 秒，均匀呼吸，不要弹振式拉伸。', video: '全身拉伸 教学' },
  { id: 'foam-roll', name: '泡沫轴放松', category: 'stretch', target: '肌筋膜放松', points: '在酸痛肌肉上缓慢滚动，遇到痛点停留 20–30 秒。', video: '泡沫轴 放松 教学' },
  { id: 'neck-stretch', name: '肩颈拉伸', category: 'stretch', target: '斜方肌 · 颈部', points: '久坐人群常做：头向一侧倾斜，手轻压，感受对侧拉伸。', video: '肩颈拉伸 教学' },
];

function exerciseVideoUrl(keyword) {
  return 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(keyword);
}
/* ---------------- 多样化食材池（7 天轮换，口味丰富，含具体克数） ---------------- */
const ZH_POOL = {
  breakfast: [
    { name: '小米粥 + 水煮蛋 + 凉拌黄瓜', items: {
      fat: ['小米粥 250g', '水煮蛋 1 个（约 50g）', '凉拌黄瓜 100g'],
      gain: ['小米粥 300g', '鸡蛋 2 个（约 100g）', '全麦馒头 70g'],
      mid: ['小米粥 250g', '鸡蛋 1 个（约 50g）', '全麦馒头 70g'] } },
    { name: '无糖豆浆 + 茶叶蛋 + 蒸红薯', items: {
      fat: ['无糖豆浆 300ml', '茶叶蛋 1 个（约 50g）', '蒸红薯 150g'],
      gain: ['豆浆 350ml', '茶叶蛋 2 个（约 100g）', '蒸红薯 200g'],
      mid: ['无糖豆浆 300ml', '茶叶蛋 1 个（约 50g）', '蒸红薯 150g'] } },
    { name: '燕麦牛奶 + 鸡蛋 + 香蕉', items: {
      fat: ['燕麦 40g + 低脂牛奶 250ml', '鸡蛋 1 个（约 50g）', '香蕉 1 根（约 120g）'],
      gain: ['燕麦 60g + 全脂牛奶 300ml', '鸡蛋 2 个（约 100g）', '香蕉 1 根（约 120g）'],
      mid: ['燕麦 50g + 牛奶 250ml', '鸡蛋 1 个（约 50g）', '苹果 1 个（约 200g）'] } },
    { name: '全麦馒头 + 豆腐脑 + 小番茄', items: {
      fat: ['全麦馒头 70g', '豆腐脑 250g（少卤）', '小番茄 150g'],
      gain: ['全麦馒头 110g', '豆腐脑 300g', '小番茄 150g'],
      mid: ['全麦馒头 90g', '豆腐脑 250g', '小番茄 150g'] } },
    { name: '皮蛋瘦肉粥（瘦）+ 水煮蛋 + 凉拌菠菜', items: {
      fat: ['皮蛋瘦肉粥 300g（少米多菜）', '水煮蛋 1 个（约 50g）', '凉拌菠菜 100g'],
      gain: ['皮蛋瘦肉粥 350g', '鸡蛋 2 个（约 100g）', '蒸玉米 150g'],
      mid: ['皮蛋瘦肉粥 300g', '鸡蛋 1 个（约 50g）', '蒸玉米 100g'] } },
  ],
  lunch: [
    { name: '杂粮饭 + 清蒸鲈鱼 + 蒜蓉西兰花', items: {
      fat: ['杂粮饭 150g（熟重）', '清蒸鲈鱼 150g', '蒜蓉西兰花 200g'],
      gain: ['杂粮饭 300g（熟重）', '清蒸鲈鱼 200g', '蒜蓉西兰花 250g'],
      mid: ['杂粮饭 200g（熟重）', '清蒸鲈鱼 150g', '蒜蓉西兰花 200g'] } },
    { name: '米饭 + 宫保鸡丁 + 清炒油麦菜', items: {
      fat: ['米饭 150g（熟重）', '宫保鸡丁 150g（少油）', '清炒油麦菜 200g'],
      gain: ['米饭 300g（熟重）', '宫保鸡丁 200g', '清炒油麦菜 250g'],
      mid: ['米饭 200g（熟重）', '宫保鸡丁 150g', '清炒油麦菜 200g'] } },
    { name: '荞麦面 + 番茄牛腩 + 凉拌黄瓜', items: {
      fat: ['荞麦面（熟）250g', '番茄牛腩 150g（去油）', '凉拌黄瓜 150g'],
      gain: ['荞麦面（熟）350g', '番茄牛腩 200g', '凉拌黄瓜 200g'],
      mid: ['荞麦面（熟）300g', '番茄牛腩 150g', '凉拌黄瓜 150g'] } },
    { name: '糙米饭 + 香煎鸡胸 + 蒜蓉空心菜', items: {
      fat: ['糙米饭 150g（熟重）', '香煎鸡胸肉 130g', '蒜蓉空心菜 250g'],
      gain: ['糙米饭 300g（熟重）', '香煎鸡胸肉 180g', '蒜蓉空心菜 300g'],
      mid: ['糙米饭 200g（熟重）', '香煎鸡胸肉 150g', '蒜蓉空心菜 250g'] } },
    { name: '米饭 + 番茄炒蛋 + 香菇青菜', items: {
      fat: ['米饭 150g（熟重）', '番茄炒蛋 200g（少油）', '香菇青菜 200g'],
      gain: ['米饭 300g（熟重）', '番茄炒蛋 250g', '香菇青菜 250g'],
      mid: ['米饭 200g（熟重）', '番茄炒蛋 200g', '香菇青菜 200g'] } },
    { name: '杂粮饭 + 红烧豆腐 + 白灼虾', items: {
      fat: ['杂粮饭 150g（熟重）', '红烧豆腐 200g', '白灼虾 120g'],
      gain: ['杂粮饭 300g（熟重）', '红烧豆腐 250g', '白灼虾 180g'],
      mid: ['杂粮饭 200g（熟重）', '红烧豆腐 200g', '白灼虾 150g'] } },
  ],
  dinner: [
    { name: '蒸南瓜 + 凉拌鸡丝 + 清炒西葫芦', items: {
      fat: ['蒸南瓜 200g', '凉拌鸡丝 120g', '清炒西葫芦 250g'],
      gain: ['米饭 250g（熟重）', '凉拌鸡丝 180g', '清炒西葫芦 300g'],
      mid: ['蒸南瓜 200g + 米饭 100g', '凉拌鸡丝 150g', '清炒西葫芦 250g'] } },
    { name: '蒸玉米 + 虾仁蒸蛋 + 白灼菜心', items: {
      fat: ['蒸玉米 1 根（约 200g）', '虾仁蒸蛋 200g', '白灼菜心 250g'],
      gain: ['米饭 250g（熟重）', '虾仁蒸蛋 250g', '白灼菜心 300g'],
      mid: ['蒸玉米 1 根 + 杂粮饭 100g', '虾仁蒸蛋 200g', '白灼菜心 250g'] } },
    { name: '蒸红薯 + 清蒸豆腐 + 蒜蓉菠菜', items: {
      fat: ['蒸红薯 200g', '清蒸豆腐 200g', '蒜蓉菠菜 250g'],
      gain: ['米饭 250g（熟重）', '清蒸豆腐 250g + 瘦牛肉 100g', '蒜蓉菠菜 300g'],
      mid: ['蒸红薯 150g + 杂粮饭 100g', '清蒸豆腐 200g', '蒜蓉菠菜 250g'] } },
    { name: '燕麦粥 + 香菇蒸鸡 + 凉拌莴笋', items: {
      fat: ['燕麦粥 250g', '香菇蒸鸡 150g（去皮）', '凉拌莴笋 200g'],
      gain: ['米饭 250g（熟重）', '香菇蒸鸡 200g', '凉拌莴笋 250g'],
      mid: ['燕麦粥 250g + 杂粮饭 100g', '香菇蒸鸡 150g', '凉拌莴笋 200g'] } },
    { name: '杂粮饭 + 蒜蓉粉丝蒸虾 + 清炒荷兰豆', items: {
      fat: ['杂粮饭 100g（熟重）', '蒜蓉粉丝蒸虾 150g', '清炒荷兰豆 200g'],
      gain: ['杂粮饭 250g（熟重）', '蒜蓉粉丝蒸虾 200g', '清炒荷兰豆 250g'],
      mid: ['杂粮饭 150g（熟重）', '蒜蓉粉丝蒸虾 150g', '清炒荷兰豆 200g'] } },
    { name: '玉米糊 + 凉拌木耳 + 香煎豆腐', items: {
      fat: ['玉米糊 250g', '凉拌木耳 150g', '香煎豆腐 150g（少油）'],
      gain: ['米饭 250g（熟重）', '凉拌木耳 200g', '香煎豆腐 200g + 鸡蛋 1 个'],
      mid: ['玉米糊 250g + 杂粮饭 100g', '凉拌木耳 150g', '香煎豆腐 150g'] } },
  ],
  snack: [
    { name: '无糖酸奶 + 莓果', items: {
      fat: ['无糖酸奶 150g', '蓝莓 / 草莓 100g'],
      gain: ['全脂酸奶 200g', '香蕉 1 根（约 120g）', '坚果 15g'],
      mid: ['酸奶 150g', '水果 150g'] } },
    { name: '应季水果', items: {
      fat: ['应季水果 150g（苹果 / 梨 / 柚子）'],
      gain: ['牛奶 300ml + 香蕉 1 根（约 120g）'],
      mid: ['应季水果 200g'] } },
    { name: '坚果 + 无糖豆浆', items: {
      fat: ['原味坚果 15g', '无糖豆浆 200ml'],
      gain: ['全麦面包 70g + 花生酱 20g'],
      mid: ['原味坚果 15g', '牛奶 250ml'] } },
    { name: '黄瓜 / 小番茄 + 水煮蛋', items: {
      fat: ['黄瓜 / 小番茄 200g', '水煮蛋 1 个（约 50g）'],
      gain: ['蛋白奶昔 300ml', '坚果 20g'],
      mid: ['黄瓜 / 小番茄 200g', '酸奶 100g'] } },
  ],
};

const EN_POOL = {
  breakfast: [
    { name: '燕麦碗 + 鸡蛋 + 莓果', items: {
      fat: ['燕麦 40g + 低脂牛奶 250ml', '水煮蛋 1 个（约 50g）', '蓝莓 / 草莓 100g'],
      gain: ['燕麦 60g + 全脂牛奶 300ml', '鸡蛋 2 个（约 100g）', '香蕉 1 根（约 120g）'],
      mid: ['燕麦 50g + 牛奶 250ml', '鸡蛋 1 个（约 50g）', '莓果 100g'] } },
    { name: '全麦吐司 + 牛油果 + 煎蛋', items: {
      fat: ['全麦吐司 70g', '牛油果 60g', '煎蛋 1 个（约 50g）'],
      gain: ['全麦吐司 110g', '牛油果 80g', '煎蛋 2 个（约 100g）'],
      mid: ['全麦吐司 70g', '牛油果 60g', '煎蛋 1 个（约 50g）'] } },
    { name: '希腊酸奶 + 燕麦脆 + 水果', items: {
      fat: ['希腊酸奶 150g', '燕麦脆 20g', '蓝莓 100g'],
      gain: ['希腊酸奶 200g', '燕麦脆 40g', '香蕉 1 根（约 120g）'],
      mid: ['希腊酸奶 180g', '燕麦脆 25g', '水果 100g'] } },
    { name: '全麦煎饼 + 火腿 + 小番茄', items: {
      fat: ['全麦煎饼 1 张（约 60g）', '低脂火腿 40g', '小番茄 150g'],
      gain: ['全麦煎饼 2 张（约 120g）', '火腿 60g', '小番茄 150g'],
      mid: ['全麦煎饼 1 张（约 60g）', '鸡蛋 1 个（约 50g）', '小番茄 150g'] } },
    { name: '香蕉花生酱吐司 + 牛奶', items: {
      fat: ['全麦吐司 70g', '花生酱 10g', '香蕉 半根（约 60g）+ 牛奶 250ml'],
      gain: ['全麦吐司 110g', '花生酱 25g', '香蕉 1 根（约 120g）+ 牛奶 300ml'],
      mid: ['全麦吐司 70g', '花生酱 15g', '香蕉 1 根（约 120g）'] } },
  ],
  lunch: [
    { name: '鸡胸肉沙拉 + 全麦面包', items: {
      fat: ['鸡胸肉 150g', '生菜 / 番茄 / 黄瓜 沙拉 250g', '全麦面包 70g'],
      gain: ['鸡胸肉 200g', '沙拉 300g', '全麦面包 140g（2 片）'],
      mid: ['鸡胸肉 150g', '沙拉 250g', '全麦面包 70g'] } },
    { name: '烤三文鱼 + 藜麦 + 烤蔬菜', items: {
      fat: ['烤三文鱼 150g', '藜麦 60g（熟约 180g）', '烤蔬菜 200g'],
      gain: ['烤三文鱼 200g', '藜麦 90g（熟约 270g）', '烤蔬菜 250g'],
      mid: ['烤三文鱼 150g', '藜麦 70g（熟约 210g）', '烤蔬菜 200g'] } },
    { name: '瘦牛肉糙米饭 + 西兰花', items: {
      fat: ['瘦牛肉 120g', '糙米饭 150g（熟重）', '西兰花 200g'],
      gain: ['瘦牛肉 180g', '糙米饭 300g（熟重）', '西兰花 250g'],
      mid: ['瘦牛肉 150g', '糙米饭 200g（熟重）', '西兰花 200g'] } },
    { name: '全麦意面 + 鸡肉丸 + 番茄酱', items: {
      fat: ['全麦意面（熟）200g', '鸡肉丸 120g', '番茄酱汁 50g'],
      gain: ['全麦意面（熟）300g', '鸡肉丸 180g', '番茄酱汁 60g'],
      mid: ['全麦意面（熟）250g', '鸡肉丸 150g', '番茄酱汁 50g'] } },
    { name: '金枪鱼三明治 + 蔬菜汤', items: {
      fat: ['全麦面包 70g', '水浸金枪鱼 120g', '蔬菜汤 300ml'],
      gain: ['全麦面包 140g', '水浸金枪鱼 180g', '蔬菜汤 350ml'],
      mid: ['全麦面包 70g', '水浸金枪鱼 150g', '蔬菜汤 300ml'] } },
    { name: '豆腐藜麦碗 + 鹰嘴豆', items: {
      fat: ['老豆腐 200g', '藜麦 60g（熟约 180g）', '鹰嘴豆 80g + 蔬菜 200g'],
      gain: ['老豆腐 250g', '藜麦 90g（熟约 270g）', '鹰嘴豆 100g + 蔬菜 250g'],
      mid: ['老豆腐 200g', '藜麦 70g（熟约 210g）', '鹰嘴豆 80g + 蔬菜 200g'] } },
  ],
  dinner: [
    { name: '香煎鸡胸 + 烤芦笋 + 蒸红薯', items: {
      fat: ['香煎鸡胸 150g', '烤芦笋 200g', '蒸红薯 150g'],
      gain: ['香煎鸡胸 200g', '烤芦笋 250g', '蒸红薯 250g'],
      mid: ['香煎鸡胸 150g', '烤芦笋 200g', '蒸红薯 180g'] } },
    { name: '白身鱼 + 藜麦 + 烤彩椒', items: {
      fat: ['白身鱼（鳕鱼 / 龙利鱼）150g', '藜麦 60g（熟约 180g）', '烤彩椒 200g'],
      gain: ['白身鱼 200g', '藜麦 90g（熟约 270g）', '烤彩椒 250g'],
      mid: ['白身鱼 150g', '藜麦 70g（熟约 210g）', '烤彩椒 200g'] } },
    { name: '虾仁蔬菜炒藜麦', items: {
      fat: ['虾仁 150g', '藜麦 60g（熟约 180g）', '混合蔬菜 250g'],
      gain: ['虾仁 200g', '藜麦 90g（熟约 270g）', '混合蔬菜 300g'],
      mid: ['虾仁 150g', '藜麦 70g（熟约 210g）', '混合蔬菜 250g'] } },
    { name: '烤鸡腿（去皮）+ 沙拉 + 玉米', items: {
      fat: ['烤鸡腿去皮 150g', '蔬菜沙拉 250g', '玉米粒 80g'],
      gain: ['烤鸡腿 200g', '蔬菜沙拉 300g', '玉米粒 150g + 土豆泥 150g'],
      mid: ['烤鸡腿去皮 150g', '蔬菜沙拉 250g', '玉米粒 100g'] } },
    { name: '番茄蔬菜汤 + 全麦面包 + 鸡蛋', items: {
      fat: ['番茄蔬菜汤 350ml', '全麦面包 70g', '水煮蛋 1 个（约 50g）'],
      gain: ['番茄蔬菜汤 400ml', '全麦面包 140g', '鸡蛋 2 个（约 100g）'],
      mid: ['番茄蔬菜汤 350ml', '全麦面包 70g', '鸡蛋 1 个（约 50g）'] } },
    { name: '三文鱼牛油果碗', items: {
      fat: ['烤三文鱼 130g', '牛油果 60g', '黄瓜 / 生菜 200g'],
      gain: ['烤三文鱼 180g', '牛油果 80g', '米饭 200g（熟重）'],
      mid: ['烤三文鱼 150g', '牛油果 60g', '黄瓜 / 生菜 200g'] } },
  ],
  snack: [
    { name: '希腊酸奶 + 莓果', items: {
      fat: ['希腊酸奶 150g', '蓝莓 80g'],
      gain: ['希腊酸奶 200g', '坚果 20g', '香蕉 1 根（约 120g）'],
      mid: ['希腊酸奶 150g', '水果 100g'] } },
    { name: '蛋白棒 + 牛奶', items: {
      fat: ['蛋白棒 1 根（约 60g）'],
      gain: ['蛋白奶昔 300ml', '全麦饼干 30g'],
      mid: ['蛋白棒 1 根（约 60g）', '牛奶 200ml'] } },
    { name: '苹果 + 坚果', items: {
      fat: ['苹果 1 个（约 200g）', '无糖杏仁奶 200ml'],
      gain: ['花生酱全麦吐司（面包 70g + 花生酱 20g）'],
      mid: ['苹果 1 个（约 200g）', '原味坚果 10g'] } },
    { name: '小番茄 + 水煮蛋', items: {
      fat: ['小番茄 / 黄瓜 200g', '水煮蛋 1 个（约 50g）'],
      gain: ['牛奶 300ml + 香蕉 1 根（约 120g）'],
      mid: ['小番茄 200g', '希腊酸奶 100g'] } },
  ],
};

/* 放纵日说明（按目标） */
const CHEAT_DAY_INFO = {
  fat: { title: '🎉 放纵餐（减脂推荐）', text: '每周安排 1 次放纵餐：建议选午餐或晚餐其中一餐自由吃（火锅、烤肉、甜品都可以），其余两餐保持清淡。当天多喝水，第二天恢复正常饮食，不要连续两天放纵。' },
  gain: { title: '🎉 放纵日（增肌可适当）', text: '每周可安排 1 天放纵日，帮助补充热量与缓解心理压力；建议吃到 8 分饱，训练日放在放纵日前一天更佳。' },
  mid: { title: '🎉 放纵日', text: '每周安排 1 天放纵日，8 分饱即可；注意不是连续多次，保持整体饮食均衡。' },
};

/* 生成 7 天轮换食谱（每天不重样尽量丰富，周日为放纵日） */
function generateDietWeek(style, goal) {
  const pool = style === 'en' ? EN_POOL : ZH_POOL;
  const mode = goal === 'fat_loss' ? 'fat' : goal === 'muscle_gain' ? 'gain' : 'mid';
  const pick = (arr, prev) => {
    const candidates = arr.filter(x => x !== prev);
    return candidates[Math.floor(Math.random() * candidates.length)];
  };
  const days = [];
  let pB, pL, pD, pS;
  for (let i = 0; i < 7; i++) {
    pB = pick(pool.breakfast, pB);
    pL = pick(pool.lunch, pL);
    pD = pick(pool.dinner, pD);
    pS = pick(pool.snack, pS);
    days.push({ breakfast: pB, lunch: pL, dinner: pD, snack: pS });
  }
  return {
    days,
    mode,
    cheatDayIndex: 6, // 周日
    cheat: CHEAT_DAY_INFO[mode],
  };
}

/* ---------------- 学生食堂 / 宿舍饮食指南 ---------------- */
const SCHOOL_GUIDE = {
  title: '🎓 学生食堂 / 宿舍饮食指南',
  can: [
    '早餐：水煮蛋 / 茶叶蛋 1 个、无糖豆浆 300ml、小米粥 250g、玉米 / 红薯 150g、杂粮 / 全麦馒头 70g',
    '午 / 晚餐：食堂选「一荤一素一主食」，优先清蒸、水煮、凉拌窗口（清蒸鱼、白灼虾、蒸蛋羹、凉拌菜），米饭要半份或换杂粮',
    '加餐：宿舍常备牛奶 250ml、无糖酸奶 150g、苹果 / 香蕉 / 圣女果 150g、原味坚果 15g、即食鸡胸肉 1 袋',
    '宿舍快手：热水泡燕麦 40g、即食鸡胸 + 黄瓜番茄、宿舍小锅煮蛋 / 蒸玉米',
  ],
  cannot: [
    '油炸窗口：炸鸡排、炸串、油条、炸酱面——热量高且营养单一',
    '高糖饮品：奶茶、含糖饮料、蛋糕甜点——糖分超标，换成水或无糖豆浆',
    '高盐高钠：咸菜、腌制品、方便面——钠含量高、营养单一',
    '浓油酱汁菜：糖醋排骨、鱼香肉丝、食堂版宫保鸡丁——油糖重，想吃就少淋汁、多配菜',
    '深夜泡面 / 零食夜宵——尽量 21 点后不再进食',
  ],
};

/* ---------------- 健康外卖点餐指南 ---------------- */
const TAKEOUT_GUIDE = {
  title: '🥡 健康外卖点餐指南（不会做饭也能吃得健康）',
  can: [
    '轻食沙拉：鸡胸 / 牛肉沙拉，酱汁另放、少放一半',
    '麻辣烫：选清汤 / 骨汤，多蔬菜、豆制品、瘦肉，少丸子少油炸，不喝汤',
    '黄焖鸡 / 鸡公煲：去皮吃，少用汤汁拌饭',
    '沙县小吃：鸡腿饭去皮、加一份拌青菜、蒸饺',
    '粥铺：皮蛋瘦肉粥 + 水煮蛋 + 白灼菜心',
    '蒸菜快餐：蒸鱼、蒸蛋、蒸时蔬 + 杂粮饭',
    '日式定食 / 三明治：全麦面包、多蔬菜、酱料选低脂',
  ],
  cannot: [
    '油炸类：炸鸡、汉堡炸物套餐、烧烤——油多热量高',
    '盖浇饭 / 炒饭炒面：酱汁和油都重，容易热量超标',
    '麻辣香锅 / 水煮鱼：油大盐重，偶尔吃也要少油少汤',
    '奶茶、甜点、含糖饮料——换无糖茶或水',
  ],
  tips: [
    '下单备注「少油少盐、酱汁另放、主食减半」',
    '一餐搭配原则：一荤一素一主食，蛋白质优先',
    '外卖蔬菜少就自己加一份水果或小番茄',
  ],
};

/* ---------------- PWA：Service Worker 注册（支持安装为 App） ---------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* file:// 或受限环境静默失败 */ });
  });
}
