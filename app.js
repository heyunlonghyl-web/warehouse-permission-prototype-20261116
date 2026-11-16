'use strict';

const LINE_NAMES = {
  electronics: '3C数码', apparel: '服装', home: '家居', light: '轻小件',
  bulky: '大件', bags: '箱包', outdoor: '户外', beauty: '美妆',
  auto: '汽配', tools: '工具', toys: '玩具'
};
const BASIC = ['electronics', 'apparel', 'home', 'light', 'bags', 'outdoor', 'beauty', 'toys'];
function country(id, name, english, cities) {
  return { id, name, english, warehouses: cities.map((entry, i) => ({
    id: `${id}-${String(i + 1).padStart(3, '0')}`,
    name: typeof entry === 'string' ? entry : entry[0],
    lines: typeof entry === 'string' ? [...BASIC] : entry[1], countryId: id
  })) };
}
const COUNTRIES = [
  country('PH', '菲律宾', 'Philippines', [
    '马尼拉一号仓', ['马尼拉二号仓', ['electronics', 'home', 'light', 'bulky', 'auto', 'tools']],
    ['宿务仓', ['electronics', 'apparel', 'home', 'light', 'bags', 'beauty']],
    ['达沃仓', ['apparel', 'home', 'light', 'outdoor', 'toys']],
    ['克拉克仓', ['electronics', 'home', 'bulky', 'auto', 'tools']],
    ['马尼拉退货仓', ['electronics', 'apparel', 'home', 'light']]
  ]),
  country('US', '美国', 'United States', ['洛杉矶一号仓', ['洛杉矶二号仓', ['home', 'bulky', 'auto', 'tools']], '新泽西仓', '休斯顿仓']),
  country('TH', '泰国', 'Thailand', ['曼谷一号仓', '曼谷二号仓', '春武里仓', ['清迈仓', ['apparel', 'light', 'bags', 'beauty']]]),
  country('VN', '越南', 'Vietnam', ['河内一号仓', '河内二号仓', '胡志明仓', '平阳仓']),
  country('MY', '马来西亚', 'Malaysia', ['吉隆坡仓', '巴生仓', '柔佛仓']),
  country('ID', '印度尼西亚', 'Indonesia', ['雅加达仓', '泗水仓', '万隆仓']),
  country('CN', '中国', 'China', ['深圳仓', '义乌仓', '广州仓']),
  country('BR', '巴西', 'Brazil', ['圣保罗一号仓', '圣保罗二号仓', '里约仓']),
  country('CA', '加拿大', 'Canada', ['多伦多仓', '温哥华仓']),
  country('MX', '墨西哥', 'Mexico', ['墨西哥城仓', '蒙特雷仓', '瓜达拉哈拉仓']),
  country('RU', '俄罗斯', 'Russia', ['莫斯科仓', '圣彼得堡仓']),
  country('PK', '巴基斯坦', 'Pakistan', ['卡拉奇仓', '拉合尔仓'])
];
const WAREHOUSES = COUNTRIES.flatMap(c => c.warehouses);
const WAREHOUSE_BY_ID = Object.fromEntries(WAREHOUSES.map(w => [w.id, w]));
const STORAGE_KEY = 'warehouse-business-permissions-v1';
const DEFAULT_STATE = {
  code: 'DEMO001', mode: 'partial',
  selected: { 'PH-001': ['electronics', 'apparel', 'home'], 'PH-003': ['apparel', 'light'], 'US-001': ['electronics', 'home'] }
};
let state = structuredClone(DEFAULT_STATE);
let activeCountry = 'PH';
let activeWarehouse = 'PH-001';
let dirty = false;
let savedAt = '';
let toastTimer;
let undoAction;
let batchPlan;
const $ = selector => document.querySelector(selector);
const escapeHTML = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hasSelection = id => Object.prototype.hasOwnProperty.call(state.selected, id);
const currentCountry = () => COUNTRIES.find(c => c.id === activeCountry);
const countrySelected = id => COUNTRIES.find(c => c.id === id).warehouses.filter(w => hasSelection(w.id));
const pendingWarehouses = () => WAREHOUSES.filter(w => hasSelection(w.id) && !state.selected[w.id].length);
const tags = lines => lines.map(l => `<span class="mini-tag">${LINE_NAMES[l]}</span>`).join('');
function effectiveSelection() {
  return state.mode === 'all' ? Object.fromEntries(WAREHOUSES.map(w => [w.id, [...w.lines]])) : state.selected;
}
function stats() {
  const selected = effectiveSelection();
  const ids = Object.keys(selected);
  return { countries: new Set(ids.map(id => WAREHOUSE_BY_ID[id].countryId)).size,
    warehouses: ids.length, permissions: Object.values(selected).reduce((sum, lines) => sum + lines.length, 0),
    pending: state.mode === 'all' ? 0 : pendingWarehouses().length };
}
function markDirty() { dirty = true; }
function normalizeActive() {
  if (!hasSelection(activeWarehouse) || WAREHOUSE_BY_ID[activeWarehouse]?.countryId !== activeCountry) {
    activeWarehouse = countrySelected(activeCountry)[0]?.id || null;
  }
}
function loadSaved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || parsed.version !== 1 || !parsed.selected || typeof parsed.code !== 'string') return;
    if (!/^[A-Za-z0-9]{1,8}$/.test(parsed.code) || !['partial', 'all'].includes(parsed.mode)) return;
    const valid = {};
    for (const [id, lines] of Object.entries(parsed.selected)) {
      const warehouse = WAREHOUSE_BY_ID[id];
      if (warehouse && Array.isArray(lines)) valid[id] = [...new Set(lines.filter(line => warehouse.lines.includes(line)))];
    }
    state = { code: parsed.code, mode: parsed.mode, selected: valid };
    savedAt = typeof parsed.savedAt === 'string' ? parsed.savedAt : '';
  } catch { /* Storage can be unavailable in a private browser session. */ }
}

function renderCountries() {
  const query = $('#country-search').value.trim().toLowerCase();
  const matches = COUNTRIES.filter(c => `${c.name} ${c.english} ${c.id}`.toLowerCase().includes(query));
  $('#country-total').textContent = `${COUNTRIES.length} 个`;
  $('#country-list').innerHTML = matches.length ? matches.map(c => {
    const count = countrySelected(c.id).length;
    return `<button class="country-button ${c.id === activeCountry ? 'active' : ''}" data-country="${c.id}" aria-pressed="${c.id === activeCountry}" aria-label="${c.name}${count ? `，已选 ${count} 个海外仓` : ''}"><span class="country-code">${c.id}</span><span class="country-name">${c.name}</span>${count ? `<span class="country-badge">${count}</span>` : ''}${c.id === activeCountry ? '<span class="country-chevron" aria-hidden="true">›</span>' : ''}</button>`;
  }).join('') : '<div class="empty-search">未找到匹配国家</div>';
}
function visibleWarehouses() {
  const query = $('#warehouse-search').value.trim().toLowerCase();
  return currentCountry().warehouses.filter(w => `${w.name} ${w.id}`.toLowerCase().includes(query) && (!$('#only-selected').checked || hasSelection(w.id)));
}
function renderWarehouses() {
  const c = currentCountry();
  const selected = countrySelected(c.id);
  const visible = visibleWarehouses();
  $('#warehouse-total').textContent = `${c.warehouses.length} 个`;
  $('#current-country').textContent = `${c.name} · ${c.english}`;
  $('#warehouse-selection-count').textContent = `已选 ${selected.length} / ${c.warehouses.length}`;
  $('#select-visible-label').textContent = `全选当前结果 (${visible.length})`;
  const selectedVisible = visible.filter(w => hasSelection(w.id)).length;
  $('#select-visible').checked = visible.length > 0 && selectedVisible === visible.length;
  $('#select-visible').indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
  $('#select-visible').disabled = visible.length === 0;
  $('#warehouse-list').innerHTML = visible.length ? visible.map(w => {
    const selected = hasSelection(w.id);
    const lines = state.selected[w.id] || [];
    return `<div class="warehouse-row ${selected ? 'selected' : ''} ${activeWarehouse === w.id ? 'active' : ''}"><input type="checkbox" data-warehouse-check="${w.id}" aria-label="选择${w.name}" ${selected ? 'checked' : ''}><button class="warehouse-info" data-warehouse="${w.id}" aria-label="${selected ? '配置' : '选择并配置'}${w.name}的业务线" ${activeWarehouse === w.id ? 'aria-current="true"' : ''}><span class="warehouse-name">${w.name}</span><span class="warehouse-meta"><span>${w.id}</span><span class="meta-divider">·</span>${selected ? `<span class="${lines.length ? 'configured' : 'pending'}">${lines.length ? `已选 ${lines.length} 条业务线` : '待选择业务线'}</span>` : `<span>${w.lines.length} 条可用业务线</span>`}</span></button>${activeWarehouse === w.id ? '<span class="warehouse-arrow" aria-hidden="true">›</span>' : ''}</div>`;
  }).join('') : `<div class="empty-search">${$('#only-selected').checked ? '当前条件下暂无已选海外仓' : '未找到匹配海外仓'}</div>`;
}
function renderBusiness() {
  const w = WAREHOUSE_BY_ID[activeWarehouse];
  if (!w || !hasSelection(w.id)) {
    $('#business-content').innerHTML = `<div class="empty-state"><div class="empty-illustration" aria-hidden="true">▤</div><h4>先选择一个海外仓</h4><p>勾选左侧的海外仓<br>即可在这里配置它的业务线</p></div>`;
    return;
  }
  const lines = state.selected[w.id];
  const selected = countrySelected(activeCountry);
  $('#business-content').innerHTML = `
    <div class="current-warehouse"><div class="warehouse-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 21V8l9-5 9 5v13M1 21h22M7 21V11h10v10M7 15h10M7 18h10"/></svg></div><div><h4>${w.name}</h4><p>${currentCountry().name} <span aria-hidden="true">/</span> ${w.id}</p></div><span class="state-pill ${lines.length ? '' : 'pending'}">${lines.length ? '已配置' : '待配置'}</span></div>
    <div class="business-title"><div><strong>可用业务线</strong><small>可多选</small></div><label class="checkbox-label muted"><input type="checkbox" id="select-all-lines" ${lines.length === w.lines.length ? 'checked' : ''}>全选 (${w.lines.length})</label></div>
    <div class="business-grid">${w.lines.map(line => `<label class="business-option ${lines.includes(line) ? 'checked' : ''}"><input type="checkbox" data-line="${line}" aria-label="${w.name}：${LINE_NAMES[line]}" ${lines.includes(line) ? 'checked' : ''}><span>${LINE_NAMES[line]}</span></label>`).join('')}</div>
    <p class="business-note">仅展示该海外仓已关联的业务线，至少选择 1 条才可保存。</p>
    <div class="business-actionbar"><span>已选 <strong>${lines.length}</strong> 条业务线，形成 <strong>${lines.length}</strong> 项权限</span><button class="link-btn" id="batch-open" ${!lines.length || selected.length < 2 ? 'disabled' : ''} title="将当前业务线追加到本国其他已选海外仓">追加到本国其他已选仓 →</button></div>
    <div class="country-configurations"><div class="configuration-heading"><strong>${currentCountry().name} · 已选海外仓</strong><span>${selected.length} 个海外仓</span></div>${selected.map(item => `<div class="configuration-row"><span class="configuration-name" title="${item.name}">${item.name}</span><div class="configuration-tags">${state.selected[item.id].length ? tags(state.selected[item.id]) : '<span class="pending-text">待选择业务线</span>'}</div><button class="link-btn" data-configure="${item.id}">${item.id === activeWarehouse ? '当前' : '配置'}</button></div>`).join('')}</div>`;
  $('#select-all-lines').indeterminate = lines.length > 0 && lines.length < w.lines.length;
}
function renderAll() {
  $('#all-workspace').innerHTML = `<div class="all-banner"><div class="all-icon" aria-hidden="true">✓</div><h3>已授权全部仓库及业务线</h3><p>覆盖全部国家的海外仓和业务线，后续新增的仓库及业务线也将自动纳入权限。</p></div><div class="all-countries">${COUNTRIES.map(c => `<div class="all-country"><span class="country-code">${c.id}</span><div><strong>${c.name}</strong><p>${c.warehouses.length} 个海外仓 · 全部业务线</p></div><span class="all-check" aria-hidden="true">✓</span></div>`).join('')}</div><p class="all-note">切回「配置部分仓库」后，将恢复之前的手动选择。</p>`;
}
function renderSummary() {
  const s = stats();
  $('#global-summary').innerHTML = `<span>${state.mode === 'all' ? '全部授权' : '已选择'}</span><strong>${s.countries}</strong><span>个国家</span><strong>${s.warehouses}</strong><span>个海外仓</span><span class="summary-divider"></span><strong class="summary-permissions">${s.permissions}</strong><span>项权限</span>${s.pending ? `<button id="go-pending" class="pending-summary">${s.pending} 个仓待配置 →</button>` : ''}`;
  $('#save-state').textContent = dirty ? '有未保存的修改' : savedAt ? '✓ 已保存到本机' : '示例配置';
  $('#save-state').classList.toggle('saved', !dirty && Boolean(savedAt));
}
function render() {
  const focused = document.activeElement;
  let focusSelector = focused?.id ? `#${focused.id}` : null;
  if (!focusSelector && focused?.dataset) {
    for (const attr of ['country', 'warehouseCheck', 'warehouse', 'line', 'configure']) {
      if (focused.dataset[attr]) {
        const kebab = attr.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
        focusSelector = `[data-${kebab}="${focused.dataset[attr]}"]`;
        break;
      }
    }
  }
  normalizeActive();
  $('#partial-workspace').hidden = state.mode === 'all';
  $('#all-workspace').hidden = state.mode !== 'all';
  $('#scope-tip').textContent = state.mode === 'all' ? '包含全部国家及后续新增的仓库、业务线' : '仅授权已选择的海外仓及业务线';
  document.querySelectorAll('input[name=scope]').forEach(input => { input.checked = input.value === state.mode; });
  renderCountries(); renderWarehouses(); renderBusiness(); renderAll(); renderSummary();
  if (focusSelector) $(focusSelector)?.focus({ preventScroll: true });
}
function notify(message, undo) {
  clearTimeout(toastTimer);
  $('#toast-text').textContent = message;
  $('#toast').hidden = false;
  undoAction = undo;
  $('#toast-undo').hidden = !undo;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; undoAction = null; }, undo ? 12000 : 5500);
}
function selectCountry(id) {
  activeCountry = id;
  activeWarehouse = countrySelected(id)[0]?.id || null;
  $('#warehouse-search').value = '';
  $('#only-selected').checked = false;
  render();
  $('#warehouse-list').scrollTop = 0;
  $('#business-content').scrollTop = 0;
}
function toggleWarehouse(id, checked) {
  if (checked) {
    state.selected[id] = state.selected[id] || [];
    activeWarehouse = id;
  } else {
    const previous = [...state.selected[id]];
    delete state.selected[id];
    notify(`已移除${WAREHOUSE_BY_ID[id].name}及其 ${previous.length} 项权限`, () => {
      state.selected[id] = previous;
      activeCountry = WAREHOUSE_BY_ID[id].countryId;
      activeWarehouse = id;
      $('#warehouse-search').value = '';
      markDirty(); render();
    });
  }
  markDirty(); render();
}
function goToWarehouse(id) {
  activeCountry = WAREHOUSE_BY_ID[id].countryId;
  activeWarehouse = id;
  $('#warehouse-search').value = '';
  $('#only-selected').checked = false;
  $('#country-search').value = '';
  render();
  $(`[data-warehouse="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  $('#business-content').scrollTop = 0;
  const first = $('#business-content input[data-line]');
  first?.focus({ preventScroll: true });
  if (window.innerWidth <= 720) $('#business-heading').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function openPreview() {
  const s = stats();
  const selection = effectiveSelection();
  $('#preview-description').textContent = `开发员 ${state.code || '未填写'} · ${s.countries} 个国家 / ${s.warehouses} 个海外仓 / ${s.permissions} 项权限${s.pending ? ` · ${s.pending} 个海外仓待配置` : ''}`;
  $('#preview-body').innerHTML = `${state.mode === 'all' ? '<p class="batch-warning">已配置全部仓库，后续新增的海外仓及业务线也会自动授权。以下为当前已有配置。</p>' : ''}${s.warehouses ? COUNTRIES.map(c => {
    const selected = c.warehouses.filter(w => Object.prototype.hasOwnProperty.call(selection, w.id));
    if (!selected.length) return '';
    return `<section class="preview-country"><h3><span class="country-code">${c.id}</span>${c.name}<small>${selected.length} 个海外仓</small></h3><table class="preview-table"><thead><tr><th>海外仓</th><th>业务线</th><th>权限数</th></tr></thead><tbody>${selected.map(w => `<tr><td>${w.name}<span class="preview-id">${w.id}</span></td><td><div class="configuration-tags">${selection[w.id].length ? tags(selection[w.id]) : `<button class="link-btn" data-preview-configure="${w.id}">待配置 · 去选择业务线 →</button>`}</div></td><td>${selection[w.id].length}</td></tr>`).join('')}</tbody></table></section>`;
  }).join('') : '<div class="empty-state"><div class="empty-illustration">▤</div><h4>尚未选择海外仓</h4><p>当前没有任何仓库访问权限。</p></div>'}`;
  $('#preview-dialog').showModal();
}
function openBatch() {
  const source = WAREHOUSE_BY_ID[activeWarehouse];
  const sourceLines = [...state.selected[source.id]];
  const targets = countrySelected(activeCountry).filter(w => w.id !== source.id);
  if (!sourceLines.length || !targets.length) return;
  batchPlan = { sourceId: source.id, sourceLines, targets: targets.map(w => w.id) };
  $('#batch-description').textContent = `将${source.name}已选业务线追加到${currentCountry().name}的其他 ${targets.length} 个已选仓。`;
  $('#batch-body').innerHTML = `<div class="muted">本次追加业务线</div><div class="batch-lines">${tags(sourceLines)}</div>${targets.map(w => {
    const compatible = sourceLines.filter(line => w.lines.includes(line));
    const skipped = sourceLines.length - compatible.length;
    const added = compatible.filter(line => !state.selected[w.id].includes(line)).length;
    return `<div class="batch-target"><span>${w.name}</span><small>新增 ${added} 条${skipped ? ` · ${skipped} 条不适用，将跳过` : ' · 全部适用'}</small></div>`;
  }).join('')}<div class="batch-warning">保留各仓已选业务线，仅追加该仓支持的业务线。未勾选的海外仓及其他国家不受影响。</div>`;
  $('#batch-dialog').showModal();
}
function save() {
  state.code = $('#developer-code').value.trim();
  if (!/^[A-Za-z0-9]{1,8}$/.test(state.code)) {
    $('#code-error').textContent = '请输入 1–8 位字母或数字';
    $('#developer-code').setAttribute('aria-invalid', 'true');
    $('#developer-code').focus();
    return;
  }
  if (state.mode === 'partial' && pendingWarehouses().length) {
    const pending = pendingWarehouses();
    goToWarehouse(pending[0].id);
    notify(`还有 ${pending.length} 个海外仓未选择业务线，请先完成配置`);
    return;
  }
  try {
    const time = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...state, savedAt: time }));
    savedAt = time;
    dirty = false;
    $('#developer-code').value = state.code;
    renderSummary();
    notify(`已保存到当前浏览器，共 ${stats().permissions} 项仓库权限`);
  } catch {
    notify('浏览器暂不支持本地保存，当前编辑内容仍保留在页面中');
  }
}

$('#country-list').addEventListener('click', event => {
  const button = event.target.closest('[data-country]');
  if (button) selectCountry(button.dataset.country);
});
$('#country-search').addEventListener('input', renderCountries);
$('#warehouse-search').addEventListener('input', renderWarehouses);
$('#only-selected').addEventListener('change', renderWarehouses);
$('#warehouse-list').addEventListener('change', event => {
  if (event.target.matches('[data-warehouse-check]')) toggleWarehouse(event.target.dataset.warehouseCheck, event.target.checked);
});
$('#warehouse-list').addEventListener('click', event => {
  const button = event.target.closest('[data-warehouse]');
  if (!button) return;
  const id = button.dataset.warehouse;
  if (!hasSelection(id)) { state.selected[id] = []; markDirty(); }
  activeWarehouse = id;
  render();
  $('#business-content').scrollTop = 0;
});
$('#select-visible').addEventListener('change', event => {
  const visible = visibleWarehouses();
  if (event.target.checked) {
    visible.forEach(w => { if (!hasSelection(w.id)) state.selected[w.id] = []; });
    if (!activeWarehouse) activeWarehouse = visible[0]?.id || null;
  } else {
    const removed = Object.fromEntries(visible.filter(w => hasSelection(w.id)).map(w => [w.id, [...state.selected[w.id]]]));
    visible.forEach(w => { delete state.selected[w.id]; });
    notify(`已移除当前结果中的 ${Object.keys(removed).length} 个海外仓`, () => {
      Object.assign(state.selected, removed); markDirty(); render();
    });
  }
  markDirty(); render();
});
$('#business-content').addEventListener('change', event => {
  const w = WAREHOUSE_BY_ID[activeWarehouse];
  if (!w) return;
  if (event.target.matches('[data-line]')) {
    const line = event.target.dataset.line;
    state.selected[w.id] = event.target.checked ? [...new Set([...state.selected[w.id], line])] : state.selected[w.id].filter(l => l !== line);
  } else if (event.target.id === 'select-all-lines') {
    state.selected[w.id] = event.target.checked ? [...w.lines] : [];
  } else return;
  markDirty(); render();
});
$('#business-content').addEventListener('click', event => {
  const configure = event.target.closest('[data-configure]');
  if (configure) { activeWarehouse = configure.dataset.configure; render(); $('#business-content').scrollTop = 0; }
  if (event.target.closest('#batch-open')) openBatch();
});
document.querySelectorAll('input[name=scope]').forEach(input => input.addEventListener('change', event => {
  state.mode = event.target.value; markDirty(); render();
}));
$('#developer-code').addEventListener('input', event => {
  state.code = event.target.value;
  $('#code-error').textContent = '';
  $('#developer-code').removeAttribute('aria-invalid');
  markDirty(); renderSummary();
});
$('#global-summary').addEventListener('click', event => {
  if (event.target.closest('#go-pending')) goToWarehouse(pendingWarehouses()[0].id);
});
$('#preview-top').addEventListener('click', openPreview);
$('#preview-bottom').addEventListener('click', openPreview);
$('#save-button').addEventListener('click', save);
$('#preview-body').addEventListener('click', event => {
  const button = event.target.closest('[data-preview-configure]');
  if (button) { $('#preview-dialog').close(); goToWarehouse(button.dataset.previewConfigure); }
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
$('#confirm-batch').addEventListener('click', () => {
  if (!batchPlan) return;
  let added = 0;
  let skipped = 0;
  for (const id of batchPlan.targets) {
    if (!hasSelection(id)) continue;
    const warehouse = WAREHOUSE_BY_ID[id];
    for (const line of batchPlan.sourceLines) {
      if (!warehouse.lines.includes(line)) { skipped++; continue; }
      if (!state.selected[id].includes(line)) { state.selected[id].push(line); added++; }
    }
  }
  batchPlan = null;
  $('#batch-dialog').close();
  if (added) markDirty();
  render();
  notify(`批量追加完成，新增 ${added} 项权限${skipped ? `，跳过 ${skipped} 项不适用组合` : ''}`);
});
$('#restore-demo').addEventListener('click', () => $('#reset-dialog').showModal());
$('#confirm-reset').addEventListener('click', () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* Current page can still be reset. */ }
  state = structuredClone(DEFAULT_STATE);
  activeCountry = 'PH'; activeWarehouse = 'PH-001'; dirty = false; savedAt = '';
  $('#developer-code').value = state.code;
  $('#code-error').textContent = '';
  $('#developer-code').removeAttribute('aria-invalid');
  $('#country-search').value = ''; $('#warehouse-search').value = ''; $('#only-selected').checked = false;
  $('#reset-dialog').close(); render(); notify('已恢复示例配置');
});
$('#toast-undo').addEventListener('click', () => {
  const action = undoAction; undoAction = null;
  if (action) { action(); notify('已撤销移除操作'); }
});
$('#toast-close').addEventListener('click', () => { clearTimeout(toastTimer); $('#toast').hidden = true; undoAction = null; });
window.addEventListener('beforeunload', event => {
  if (dirty) { event.preventDefault(); event.returnValue = ''; }
});
loadSaved();
$('#developer-code').value = state.code;
normalizeActive();
render();
