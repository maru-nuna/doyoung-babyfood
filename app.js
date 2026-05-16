// ====== Supabase Client ======
const supa = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ====== State ======
const state = {
  baby: null,
  meals: [], // all loaded meals (around the visible range)
  allKnownIngredients: new Set(), // for "new ingredient" detection
  currentDate: startOfDay(new Date()),
  viewMode: 'week', // 'month' | 'week'
  modal: null, // {type:'ingredient', date, mealNumber, kind:'base'|'toppings', editIndex} | {type:'mealActions', date, mealNumber}
};

function getStartDate() {
  return state.baby?.start_date ? parseDateISO(state.baby.start_date) : null;
}
function isBeforeStart(d) {
  const sd = getStartDate();
  return sd ? startOfDay(d) < startOfDay(sd) : false;
}
function isFuture(d) {
  return startOfDay(d) > startOfDay(new Date());
}
function startOfMonth(d) { const x = startOfDay(d); x.setDate(1); return x; }
function endOfMonth(d) { const x = startOfDay(d); x.setMonth(x.getMonth()+1, 0); return x; }
function formatYM(d) { return `${d.getFullYear()}년 ${d.getMonth()+1}월`; }

// ====== Date utilities ======
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function formatDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseDateISO(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function formatMD(d) { return `${d.getMonth()+1}/${d.getDate()}`; }
function daysSince(birth, d) {
  const a = startOfDay(birth).getTime();
  const b = startOfDay(d).getTime();
  return Math.floor((b - a) / 86400000);
}
function startOfWeek(d) {
  // 주 시작을 currentDate 기준으로 두지 말고, 도영이 이유식 시작일(아기 생일+이유식시작)부터의 7일 블록 기준으로 자를까 했지만,
  // 사용자가 자유롭게 주를 이동할 수 있도록 그냥 7일 윈도우(currentDate가 첫 칸)로 처리.
  // 더 자연스럽게: 월요일 시작 주로 정렬
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun..6=Sat
  const offset = (day === 0 ? -6 : 1 - day); // Monday as start
  return addDays(x, offset);
}

// ====== Data layer ======
async function loadBaby() {
  const { data, error } = await supa
    .from('babyfood_babies')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) { console.error(error); alert('아기 정보 로딩 실패: ' + error.message); return; }
  state.baby = data && data[0] || null;
}

async function saveBaby(name, birth_date, start_date) {
  const payload = { name, birth_date, start_date: start_date || null };
  if (state.baby) {
    const { data, error } = await supa
      .from('babyfood_babies')
      .update(payload)
      .eq('id', state.baby.id)
      .select().single();
    if (error) throw error;
    state.baby = data;
  } else {
    const { data, error } = await supa
      .from('babyfood_babies')
      .insert(payload)
      .select().single();
    if (error) throw error;
    state.baby = data;
  }
}

async function loadMealsRange(startISO, endISO) {
  const { data, error } = await supa
    .from('babyfood_meals')
    .select('*')
    .eq('baby_id', state.baby.id)
    .gte('date', startISO)
    .lte('date', endISO)
    .order('date', { ascending: true })
    .order('meal_number', { ascending: true });
  if (error) { console.error(error); alert('이유식 데이터 로딩 실패: ' + error.message); return; }
  state.meals = data || [];
}

async function loadAllIngredientsUntil(endISO) {
  // 새로 도입된 재료를 표시하기 위해, endISO 이전(포함)의 모든 meals를 훑어
  // 재료 이름 set을 만든다. 단, 이번 주 안에서 처음 등장하는 재료를 "new"로 표시할 것이므로,
  // 이번 주 시작일 이전까지의 재료들을 known으로 모은다.
  const { data, error } = await supa
    .from('babyfood_meals')
    .select('date, base, toppings')
    .eq('baby_id', state.baby.id)
    .lt('date', endISO)
    .order('date', { ascending: true });
  if (error) { console.error(error); return; }
  const known = new Set();
  (data || []).forEach(m => {
    (m.base || []).forEach(x => known.add(x.name));
    (m.toppings || []).forEach(x => known.add(x.name));
  });
  state.allKnownIngredients = known;
}

async function upsertMeal(meal) {
  const payload = {
    baby_id: state.baby.id,
    date: meal.date,
    meal_number: meal.meal_number,
    base: meal.base || [],
    toppings: meal.toppings || [],
    actual_eaten: meal.actual_eaten ?? null,
    memo: meal.memo || '',
    updated_at: new Date().toISOString(),
  };
  if (meal.id) {
    const { data, error } = await supa
      .from('babyfood_meals')
      .update(payload).eq('id', meal.id)
      .select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supa
      .from('babyfood_meals')
      .insert(payload)
      .select().single();
    if (error) throw error;
    return data;
  }
}

async function deleteMeal(id) {
  const { error } = await supa.from('babyfood_meals').delete().eq('id', id);
  if (error) throw error;
}

// ====== Helpers ======
function mealTotalPlanned(meal) {
  const base = (meal.base || []).reduce((s, x) => s + (Number(x.planned) || 0), 0);
  const top = (meal.toppings || []).reduce((s, x) => s + (Number(x.planned) || 0), 0);
  return base + top;
}
function dayMealsFor(dateISO) {
  return state.meals.filter(m => m.date === dateISO);
}
function dayTotalPlanned(dateISO) {
  return dayMealsFor(dateISO).reduce((s, m) => s + mealTotalPlanned(m), 0);
}
function dayTotalEaten(dateISO) {
  return dayMealsFor(dateISO).reduce((s, m) => s + (Number(m.actual_eaten) || 0), 0);
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function pct(actual, planned) {
  if (!planned) return '';
  return Math.round((actual / planned) * 100) + '%';
}

// ====== Render ======
function render() {
  const app = document.getElementById('app');
  if (!state.baby) {
    app.innerHTML = renderSetup();
    bindSetup();
    return;
  }
  const body = state.viewMode === 'month' ? renderMonthView() : renderWeekView();
  app.innerHTML = `
    ${renderHeader()}
    ${renderTabs()}
    ${body}
    ${renderModal()}
  `;
  bindGlobal();
  if (state.viewMode === 'month') bindMonthView();
  else bindWeekView();
  if (state.modal) bindModal();
}

function renderSetup() {
  const isEdit = !!state.baby;
  const today = formatDateISO(new Date());
  return `
    <div class="setup">
      <h2>${isEdit ? '아기 정보 수정' : '도영이 이유식 시작하기'}</h2>
      <p class="desc">아기 정보를 입력하면 D+일수가 자동으로 계산돼요.</p>
      <div class="form-group">
        <label>아기 이름</label>
        <input type="text" id="setup-name" value="${escapeHtml(state.baby?.name || '도영')}" />
      </div>
      <div class="form-group">
        <label>생년월일</label>
        <input type="date" id="setup-birth" value="${state.baby?.birth_date || ''}" max="${today}" />
      </div>
      <div class="form-group">
        <label>이유식 시작일</label>
        <input type="date" id="setup-start" value="${state.baby?.start_date || ''}" />
        <p class="desc" style="margin:4px 0 0;font-size:11px;">이 날짜 이전 주는 비활성화돼요</p>
      </div>
      <button id="setup-save">저장</button>
      ${isEdit ? `<button class="btn ghost" id="setup-cancel" style="margin-top:8px;width:100%;">취소</button>` : ''}
    </div>
  `;
}

function bindSetup() {
  document.getElementById('setup-save').onclick = async () => {
    const name = document.getElementById('setup-name').value.trim();
    const birth = document.getElementById('setup-birth').value;
    const start = document.getElementById('setup-start').value || null;
    if (!name || !birth) { alert('이름과 생년월일을 모두 입력해주세요.'); return; }
    try {
      await saveBaby(name, birth, start);
      // 시작일이 있고 현재 날짜가 이전이면 시작일이 포함된 주로 이동
      if (start) {
        const sd = parseDateISO(start);
        if (state.currentDate < sd) state.currentDate = sd;
      }
      await refresh();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    }
  };
  const cancel = document.getElementById('setup-cancel');
  if (cancel) cancel.onclick = () => render();
}

function renderHeader() {
  const today = new Date();
  const dPlus = daysSince(parseDateISO(state.baby.birth_date), today);
  return `
    <div class="app-header">
      <div class="app-title">
        ${escapeHtml(state.baby.name)}이 이유식
        <span class="sub">오늘 D+${dPlus} · ${formatMD(today)}</span>
      </div>
      <button class="icon-btn" id="btn-settings" title="설정">⚙️</button>
    </div>
  `;
}

function renderTabs() {
  return `
    <div class="tabs">
      <button class="tab ${state.viewMode==='month'?'active':''}" data-view="month">월간</button>
      <button class="tab ${state.viewMode==='week'?'active':''}" data-view="week">주간</button>
    </div>
  `;
}

function bindGlobal() {
  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => { state.viewMode = t.dataset.view; refresh(); };
  });
  document.getElementById('btn-settings').onclick = () => {
    // 설정 화면 = setup 재사용
    document.getElementById('app').innerHTML = renderSetup();
    bindSetup();
  };
}

// ---------- Week View (spreadsheet style) ----------
function renderIngredientCell(meal, kind, dateISO, mealNumber) {
  const arr = (meal && meal[kind]) || [];
  const lines = arr.map((x, idx) => {
    const isNew = !state.allKnownIngredients.has(x.name);
    return `<div class="line ${isNew?'new':''} ing-line"
      data-date="${dateISO}" data-meal="${mealNumber}" data-kind="${kind}" data-idx="${idx}"
      title="클릭하여 수정/삭제">
      <span class="name">${escapeHtml(x.name)}</span><span class="amt">${x.planned}g</span>
    </div>`;
  }).join('');
  return `${lines}<button class="add-pill" data-date="${dateISO}" data-meal="${mealNumber}" data-kind="${kind}">+ 추가</button>`;
}

function renderWeekView() {
  const weekStart = startOfWeek(state.currentDate);
  const days = Array.from({length: 7}, (_,i) => addDays(weekStart, i));
  const dayISOs = days.map(formatDateISO);
  const birth = parseDateISO(state.baby.birth_date);
  const sd = getStartDate();
  const prevDisabled = sd ? weekStart <= startOfWeek(sd) : false;

  // 끼니 번호 수집
  const mealNumbersSet = new Set();
  days.forEach(d => dayMealsFor(formatDateISO(d)).forEach(m => mealNumbersSet.add(m.meal_number)));
  if (mealNumbersSet.size === 0) mealNumbersSet.add(1);
  const mealNumbers = [...mealNumbersSet].sort((a,b)=>a-b);
  const nextMealNumber = Math.max(...mealNumbers, 0) + 1;

  const validDaysInWeek = days.filter(d => !isBeforeStart(d)).length;

  let html = `
    <div class="nav-bar">
      <button class="nav-btn" id="week-prev" ${prevDisabled?'disabled':''}>‹ 이전 주</button>
      <div>
        <span class="nav-label">${formatMD(days[0])} ~ ${formatMD(days[6])}</span>
        <span class="nav-sub">D+${daysSince(birth, days[0])} ~ D+${daysSince(birth, days[6])}</span>
      </div>
      <div>
        <button class="nav-btn today" id="week-today">오늘</button>
        <button class="nav-btn" id="week-next">다음 주 ›</button>
      </div>
    </div>
    ${validDaysInWeek > 0 ? `
    <div class="toolbar">
      <button class="btn primary" id="week-add-meal">+ ${nextMealNumber}끼 추가 (이번 주 ${validDaysInWeek}일)</button>
    </div>` : ''}
    <div class="week-wrap">
      <table class="week-table">
        <thead>
          <tr>
            <th class="row-label corner" colspan="2">끼니 / 항목</th>
            ${days.map(d => {
              const cls = [];
              if (isBeforeStart(d)) cls.push('col-past');
              else if (isFuture(d)) cls.push('col-future');
              return `<th class="${cls.join(' ')}">
                <div>${formatMD(d)}</div>
                <div class="day-sub">D+${daysSince(birth, d)}</div>
              </th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
  `;

  mealNumbers.forEach(mn => {
    // 베이스
    html += `<tr>
      <td class="row-label meal-label" rowspan="4" data-meal="${mn}" title="클릭하여 끼니 관리">${mn}끼</td>
      <td class="row-label sub-label">베이스</td>
      ${dayISOs.map((iso, i) => {
        if (isBeforeStart(days[i])) return `<td class="cell-blocked"></td>`;
        const meal = dayMealsFor(iso).find(m => m.meal_number === mn);
        const dim = isFuture(days[i]) ? ' cell-dim' : '';
        return `<td class="cell-ingredients${dim}">${renderIngredientCell(meal, 'base', iso, mn)}</td>`;
      }).join('')}
    </tr>`;
    // 토핑
    html += `<tr>
      <td class="row-label sub-label">토핑</td>
      ${dayISOs.map((iso, i) => {
        if (isBeforeStart(days[i])) return `<td class="cell-blocked"></td>`;
        const meal = dayMealsFor(iso).find(m => m.meal_number === mn);
        const dim = isFuture(days[i]) ? ' cell-dim' : '';
        return `<td class="cell-ingredients${dim}">${renderIngredientCell(meal, 'toppings', iso, mn)}</td>`;
      }).join('')}
    </tr>`;
    // 양
    html += `<tr>
      <td class="row-label sub-label">양</td>
      ${dayISOs.map((iso, i) => {
        if (isBeforeStart(days[i])) return `<td class="cell-blocked"></td>`;
        const meal = dayMealsFor(iso).find(m => m.meal_number === mn);
        const planned = meal ? mealTotalPlanned(meal) : 0;
        const eaten = meal?.actual_eaten;
        const dim = isFuture(days[i]) ? ' cell-dim' : '';
        return `<td class="cell-total${dim}">
          <div class="planned-line"><span class="lbl">총량</span><span class="v">${planned ? planned + 'g' : '-'}</span></div>
          <div class="eaten-line">
            <span class="lbl">먹은</span>
            <input type="number" class="cell-eat-input" inputmode="numeric"
              data-date="${iso}" data-meal="${mn}"
              placeholder="-" value="${eaten ?? ''}" /><span class="unit-g">g</span>
          </div>
          ${eaten != null && planned ? `<div class="pct">${pct(eaten, planned)}</div>` : ''}
        </td>`;
      }).join('')}
    </tr>`;
    // 메모
    html += `<tr>
      <td class="row-label sub-label">메모</td>
      ${dayISOs.map((iso, i) => {
        if (isBeforeStart(days[i])) return `<td class="cell-blocked"></td>`;
        const meal = dayMealsFor(iso).find(m => m.meal_number === mn);
        const dim = isFuture(days[i]) ? ' cell-dim' : '';
        return `<td class="cell-memo${dim}">
          <input type="text" class="memo-cell-input"
            data-date="${iso}" data-meal="${mn}"
            placeholder="-" value="${escapeHtml(meal?.memo || '')}" />
        </td>`;
      }).join('')}
    </tr>`;
  });

  // 일 총량 행
  html += `<tr class="day-total-row">
    <td class="row-label" colspan="2">일 총량</td>
    ${dayISOs.map((iso, i) => {
      if (isBeforeStart(days[i])) return `<td class="cell-blocked"></td>`;
      const planned = dayTotalPlanned(iso);
      const eaten = dayTotalEaten(iso);
      const has = dayMealsFor(iso).some(m => m.actual_eaten != null);
      const dim = isFuture(days[i]) ? ' cell-dim' : '';
      return `<td class="cell-total${dim}">
        <div class="planned-line"><span class="lbl">계획</span><span class="v">${planned ? planned + 'g' : '-'}</span></div>
        <div class="eaten-line"><span class="lbl">먹은</span><span class="v ${has?'':'empty'}">${has ? eaten + 'g' : '-'}</span></div>
        ${has && planned ? `<div class="pct">${pct(eaten, planned)}</div>` : ''}
      </td>`;
    }).join('')}
  </tr>`;

  html += `</tbody></table></div>`;

  // 주간 합계
  const validISOs = dayISOs.filter((_, i) => !isBeforeStart(days[i]));
  const weekPlanned = validISOs.reduce((s, iso) => s + dayTotalPlanned(iso), 0);
  const weekEaten = validISOs.reduce((s, iso) => s + dayTotalEaten(iso), 0);
  html += `
    <div class="week-total-foot">
      <div class="label">주간 총량</div>
      <div>
        <span class="value">먹은량 ${weekEaten}g / 계획 ${weekPlanned}g</span>
        ${weekPlanned ? `<span class="pct">(${pct(weekEaten, weekPlanned)})</span>` : ''}
      </div>
    </div>
  `;
  return html;
}

function bindWeekView() {
  const prevBtn = document.getElementById('week-prev');
  if (prevBtn && !prevBtn.disabled) prevBtn.onclick = () => { state.currentDate = addDays(state.currentDate, -7); refresh(); };
  document.getElementById('week-next').onclick = () => { state.currentDate = addDays(state.currentDate, 7); refresh(); };
  document.getElementById('week-today').onclick = () => { state.currentDate = startOfDay(new Date()); refresh(); };

  const addBtn = document.getElementById('week-add-meal');
  if (addBtn) addBtn.onclick = (e) => {
    e.stopPropagation();
    queueMicrotask(async () => {
      const weekStart = startOfWeek(state.currentDate);
      const days = Array.from({length: 7}, (_,i) => addDays(weekStart, i));
      const validDays = days.filter(d => !isBeforeStart(d));
      if (validDays.length === 0) return;
      const mealNumbersSet = new Set();
      days.forEach(d => dayMealsFor(formatDateISO(d)).forEach(m => mealNumbersSet.add(m.meal_number)));
      const next = Math.max(...mealNumbersSet, 0) + 1;
      try {
        for (const d of validDays) {
          const dateISO = formatDateISO(d);
          const exists = dayMealsFor(dateISO).some(m => m.meal_number === next);
          if (exists) continue;
          const created = await upsertMeal({
            date: dateISO, meal_number: next,
            base: [], toppings: [], actual_eaten: null, memo: ''
          });
          state.meals.push(created);
        }
        refresh();
      } catch (err) { alert('끼니 추가 실패: ' + err.message); }
    });
  };

  document.querySelectorAll('.cell-eat-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const date = e.target.dataset.date;
      const mealNumber = Number(e.target.dataset.meal);
      const v = e.target.value === '' ? null : Number(e.target.value);
      let meal = dayMealsFor(date).find(m => m.meal_number === mealNumber);
      try {
        if (!meal) {
          const created = await upsertMeal({
            date, meal_number: mealNumber, base: [], toppings: [], actual_eaten: v, memo: ''
          });
          state.meals.push(created);
        } else {
          const updated = await upsertMeal({ ...meal, actual_eaten: v });
          Object.assign(meal, updated);
        }
        refresh();
      } catch (err) { alert('저장 실패: ' + err.message); }
    });
  });

  document.querySelectorAll('.memo-cell-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const date = e.target.dataset.date;
      const mealNumber = Number(e.target.dataset.meal);
      const v = e.target.value;
      let meal = dayMealsFor(date).find(m => m.meal_number === mealNumber);
      try {
        if (!meal) {
          if (!v) return;
          const created = await upsertMeal({
            date, meal_number: mealNumber, base: [], toppings: [], actual_eaten: null, memo: v
          });
          state.meals.push(created);
        } else {
          const updated = await upsertMeal({ ...meal, memo: v });
          Object.assign(meal, updated);
        }
      } catch (err) { alert('저장 실패: ' + err.message); }
    });
  });

  // 재료 라인 클릭 → 수정/삭제 모달
  document.querySelectorAll('.ing-line').forEach(line => {
    line.onclick = () => {
      state.modal = {
        type: 'ingredient',
        date: line.dataset.date,
        mealNumber: Number(line.dataset.meal),
        kind: line.dataset.kind,
        editIndex: Number(line.dataset.idx),
      };
      render();
    };
  });

  // + 추가 버튼 → 신규 추가 모달
  document.querySelectorAll('.add-pill').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      state.modal = {
        type: 'ingredient',
        date: btn.dataset.date,
        mealNumber: Number(btn.dataset.meal),
        kind: btn.dataset.kind,
        editIndex: null,
      };
      render();
    };
  });

  // 끼니 라벨 클릭 → 끼니 삭제 옵션
  document.querySelectorAll('.meal-label[data-meal]').forEach(label => {
    label.onclick = () => {
      state.modal = {
        type: 'mealActions',
        mealNumber: Number(label.dataset.meal),
      };
      render();
    };
  });
}

// ---------- Month View ----------
function renderMonthView() {
  const monthStart = startOfMonth(state.currentDate);
  const monthEnd = endOfMonth(state.currentDate);
  const gridStart = startOfWeek(monthStart);
  const birth = parseDateISO(state.baby.birth_date);
  const sd = getStartDate();
  const prevDisabled = sd ? monthStart <= startOfMonth(sd) : false;

  // 6주 그리드, 마지막 주가 다음 달이면 잘라냄
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    if (i >= 28 && d > monthEnd && d.getDay() === 1) break;
    cells.push(d);
  }

  let html = `
    <div class="nav-bar">
      <button class="nav-btn" id="month-prev" ${prevDisabled?'disabled':''}>‹ 이전 달</button>
      <div><span class="nav-label">${formatYM(monthStart)}</span></div>
      <div>
        <button class="nav-btn today" id="month-today">오늘</button>
        <button class="nav-btn" id="month-next">다음 달 ›</button>
      </div>
    </div>
    <div class="month-wrap">
      <div class="month-grid-head">
        <div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div><div class="weekend">일</div>
      </div>
      <div class="month-grid">
  `;

  const todayISO = formatDateISO(new Date());
  cells.forEach(d => {
    const iso = formatDateISO(d);
    const inMonth = d.getMonth() === monthStart.getMonth();
    const before = isBeforeStart(d);
    const fut = isFuture(d);
    const today = iso === todayISO;
    const planned = dayTotalPlanned(iso);
    const eaten = dayTotalEaten(iso);
    const has = dayMealsFor(iso).some(m => m.actual_eaten != null);
    const ratio = planned ? Math.min(1.2, eaten / planned) : 0;
    let bgStyle = '';
    if (has) {
      const alpha = Math.max(0.15, ratio * 0.6);
      bgStyle = `background: rgba(74,144,226,${alpha});`;
    }
    const classes = ['month-cell'];
    if (!inMonth) classes.push('out-month');
    if (before) classes.push('past-start');
    if (fut && !before) classes.push('future');
    if (today) classes.push('today');
    if (before) {
      html += `<div class="${classes.join(' ')}"></div>`;
      return;
    }
    html += `<div class="${classes.join(' ')}" style="${bgStyle}" data-date="${iso}">
      <div class="date-num">${d.getDate()}</div>
      <div class="d-plus">D+${daysSince(birth, d)}</div>
      ${has ? `<div class="eaten-mini">${eaten}g</div>` : (planned ? `<div class="planned-mini">계획 ${planned}g</div>` : '<div class="empty-mini">-</div>')}
      ${has && planned ? `<div class="pct-mini">${pct(eaten, planned)}</div>` : ''}
    </div>`;
  });

  html += `</div></div>`;

  // 월 합계
  let monthPlanned = 0, monthEaten = 0;
  for (let d = new Date(monthStart); d <= monthEnd; d = addDays(d, 1)) {
    if (isBeforeStart(d)) continue;
    const iso = formatDateISO(d);
    monthPlanned += dayTotalPlanned(iso);
    monthEaten += dayTotalEaten(iso);
  }
  html += `
    <div class="week-total-foot">
      <div class="label">${formatYM(monthStart)} 총량</div>
      <div>
        <span class="value">먹은량 ${monthEaten}g / 계획 ${monthPlanned}g</span>
        ${monthPlanned ? `<span class="pct">(${pct(monthEaten, monthPlanned)})</span>` : ''}
      </div>
    </div>
  `;
  return html;
}

function bindMonthView() {
  const prevBtn = document.getElementById('month-prev');
  if (prevBtn && !prevBtn.disabled) prevBtn.onclick = () => {
    state.currentDate = addDays(startOfMonth(state.currentDate), -1);
    refresh();
  };
  document.getElementById('month-next').onclick = () => {
    state.currentDate = addDays(endOfMonth(state.currentDate), 1);
    refresh();
  };
  document.getElementById('month-today').onclick = () => {
    state.currentDate = startOfDay(new Date()); refresh();
  };
  document.querySelectorAll('.month-cell[data-date]').forEach(cell => {
    cell.onclick = () => {
      state.currentDate = parseDateISO(cell.dataset.date);
      state.viewMode = 'week';
      refresh();
    };
  });
}


// ====== Modal ======
function closeModal() { state.modal = null; render(); }

function renderModal() {
  if (!state.modal) return '';
  if (state.modal.type === 'ingredient') return renderIngredientModal();
  if (state.modal.type === 'mealActions') return renderMealActionsModal();
  return '';
}

function renderIngredientModal() {
  const { date, mealNumber, kind, editIndex, confirmingDelete } = state.modal;
  const meal = dayMealsFor(date).find(m => m.meal_number === mealNumber);
  const editing = editIndex != null && meal;
  const cur = editing ? (meal[kind] || [])[editIndex] : null;
  const kindLabel = kind === 'base' ? '베이스' : '토핑';
  const d = parseDateISO(date);
  const deleteBtn = editing
    ? (confirmingDelete
        ? `<button class="btn danger" id="modal-ing-delete-confirm">정말 삭제하시겠어요?</button>`
        : `<button class="btn danger" id="modal-ing-delete">삭제</button>`)
    : '';
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>${formatMD(d)} · ${mealNumber}끼 · ${kindLabel} ${editing ? '수정' : '추가'}</h3>
        <div class="form-group">
          <label>재료명</label>
          <input id="modal-ing-name" type="text" value="${escapeHtml(cur?.name || '')}" placeholder="${kind==='base'?'예: 쌀, 오트밀':'예: 소고기, 애호박'}" />
        </div>
        <div class="form-group">
          <label>양 (g)</label>
          <input id="modal-ing-amt" type="number" inputmode="numeric" value="${cur?.planned ?? ''}" placeholder="예: 30" />
        </div>
        <div class="modal-actions">
          ${deleteBtn}
          <button class="btn ghost" id="modal-close">취소</button>
          <button class="btn primary" id="modal-ing-save">${editing ? '저장' : '추가'}</button>
        </div>
      </div>
    </div>
  `;
}

function renderMealActionsModal() {
  const { mealNumber, confirmingDelete } = state.modal;
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>${mealNumber}끼 관리</h3>
        <p style="color:var(--text-sub);font-size:13px;margin-bottom:12px;">
          이번 주 모든 날의 <b>${mealNumber}끼</b>를 한 번에 삭제합니다.<br>
          (입력된 재료·먹은량·메모 모두 사라져요)
        </p>
        <div class="modal-actions">
          <button class="btn ghost" id="modal-close">취소</button>
          ${confirmingDelete
            ? `<button class="btn danger" id="modal-meal-delete-confirm">정말 삭제하시겠어요?</button>`
            : `<button class="btn danger" id="modal-meal-delete">이번 주 ${mealNumber}끼 전체 삭제</button>`}
        </div>
      </div>
    </div>
  `;
}

function bindModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (!backdrop) return;
  backdrop.onclick = closeModal;
  const closeBtn = document.getElementById('modal-close');
  if (closeBtn) closeBtn.onclick = (e) => { e.stopPropagation(); closeModal(); };

  if (state.modal.type === 'ingredient') bindIngredientModal();
  else if (state.modal.type === 'mealActions') bindMealActionsModal();

  const esc = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', esc);
    }
  };
  document.addEventListener('keydown', esc);
}

function bindIngredientModal() {
  const nameEl = document.getElementById('modal-ing-name');
  const amtEl = document.getElementById('modal-ing-amt');
  nameEl.focus();
  if (nameEl.value) nameEl.select();

  const save = () => {
    const name = nameEl.value.trim();
    const amt = Number(amtEl.value);
    if (!name) { nameEl.focus(); return; }
    if (!amt || amt <= 0) { amtEl.focus(); return; }
    queueMicrotask(async () => {
      try { await saveIngredientFromModal(name, amt); }
      catch (e) { alert('저장 실패: ' + e.message); }
    });
  };

  document.getElementById('modal-ing-save').onclick = (e) => { e.stopPropagation(); save(); };
  [nameEl, amtEl].forEach(i => i.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.stopPropagation(); save(); }
  }));

  const delBtn = document.getElementById('modal-ing-delete');
  if (delBtn) delBtn.onclick = (e) => {
    e.stopPropagation();
    state.modal.confirmingDelete = true;
    render();
  };
  const delConfirmBtn = document.getElementById('modal-ing-delete-confirm');
  if (delConfirmBtn) delConfirmBtn.onclick = (e) => {
    e.stopPropagation();
    // 비동기 작업을 다음 틱으로 넘겨 핸들러를 즉시 종료 → INP 개선
    queueMicrotask(async () => {
      try { await deleteIngredientFromModal(); }
      catch (err) { alert('삭제 실패: ' + err.message); }
    });
  };
}

async function saveIngredientFromModal(name, amount) {
  const { date, mealNumber, kind, editIndex } = state.modal;
  let meal = dayMealsFor(date).find(m => m.meal_number === mealNumber);
  if (meal) {
    const arr = [...(meal[kind] || [])];
    if (editIndex != null) arr[editIndex] = { name, planned: amount };
    else arr.push({ name, planned: amount });
    const updated = await upsertMeal({ ...meal, [kind]: arr });
    Object.assign(meal, updated);
  } else {
    const newMeal = {
      date, meal_number: mealNumber,
      base: kind === 'base' ? [{ name, planned: amount }] : [],
      toppings: kind === 'toppings' ? [{ name, planned: amount }] : [],
      actual_eaten: null, memo: ''
    };
    const created = await upsertMeal(newMeal);
    state.meals.push(created);
  }
  state.modal = null;
  await refresh();
}

async function deleteIngredientFromModal() {
  const { date, mealNumber, kind, editIndex } = state.modal;
  const meal = dayMealsFor(date).find(m => m.meal_number === mealNumber);
  if (!meal) { state.modal = null; render(); return; }
  const arr = [...(meal[kind] || [])];
  arr.splice(editIndex, 1);
  const updated = await upsertMeal({ ...meal, [kind]: arr });
  Object.assign(meal, updated);
  state.modal = null;
  await refresh();
}

function bindMealActionsModal() {
  const delBtn = document.getElementById('modal-meal-delete');
  if (delBtn) delBtn.onclick = (e) => {
    e.stopPropagation();
    state.modal.confirmingDelete = true;
    render();
  };
  const confirmBtn = document.getElementById('modal-meal-delete-confirm');
  if (confirmBtn) confirmBtn.onclick = (e) => {
    e.stopPropagation();
    queueMicrotask(async () => {
      const { mealNumber } = state.modal;
      const weekStart = startOfWeek(state.currentDate);
      const days = Array.from({length:7}, (_,i) => addDays(weekStart, i));
      const targets = [];
      days.forEach(d => {
        const iso = formatDateISO(d);
        const m = dayMealsFor(iso).find(m => m.meal_number === mealNumber);
        if (m) targets.push(m);
      });
      if (targets.length === 0) { state.modal = null; render(); return; }
      try {
        for (const m of targets) {
          await deleteMeal(m.id);
          state.meals = state.meals.filter(x => x.id !== m.id);
        }
        state.modal = null;
        refresh();
      } catch (err) { alert('삭제 실패: ' + err.message); }
    });
  };
}

// ====== Refresh (load data + render) ======
async function refresh() {
  let rangeStart, rangeEnd;
  if (state.viewMode === 'month') {
    const monthStart = startOfMonth(state.currentDate);
    const monthEnd = endOfMonth(state.currentDate);
    rangeStart = startOfWeek(monthStart);
    rangeEnd = addDays(rangeStart, 41);
    if (rangeEnd < monthEnd) rangeEnd = addDays(monthEnd, 7);
  } else if (state.viewMode === 'week') {
    rangeStart = startOfWeek(state.currentDate);
    rangeEnd = addDays(rangeStart, 6);
  } else {
    rangeStart = addDays(state.currentDate, -3);
    rangeEnd = addDays(state.currentDate, 3);
  }
  const startISO = formatDateISO(rangeStart);
  const endISO = formatDateISO(rangeEnd);
  await loadMealsRange(startISO, endISO);
  await loadAllIngredientsUntil(startISO);
  render();
}

// ====== Init ======
(async function init() {
  try {
    await loadBaby();
    if (state.baby) await refresh();
    else render();
  } catch (e) {
    console.error(e);
    document.getElementById('app').innerHTML = `<div class="empty-state">
      <div class="icon">⚠️</div>
      <div>초기화 실패: ${escapeHtml(e.message)}</div>
      <div style="margin-top:8px;font-size:12px;">Supabase에서 SQL을 먼저 실행했는지 확인해주세요.</div>
    </div>`;
  }
})();
