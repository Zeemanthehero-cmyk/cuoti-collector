'use strict';

const STORAGE_KEY = 'cuoti.items.v1';
const MASTERY = ['未掌握', '模糊', '基本掌握', '掌握', '熟练'];
const MASTERY_COLORS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#15803d'];
const INTERVALS = [1, 2, 4, 7, 15, 30, 60]; // 复习间隔（天），按复习次数递增
const PRESET_SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治', '其他'];

// ===== 状态 =====
let items = load();
let filters = { search: '', subject: '', mastery: '', due: false, starred: false };
let editingId = null;
let pendingImage = null; // 当前表单里暂存的图片 dataURL

// ===== DOM =====
const $ = (id) => document.getElementById(id);
const listEl = $('list');
const emptyEl = $('empty');
const modal = $('modal');
const form = $('form');
const viewer = $('viewer');
const imageDrop = $('image-drop');
const imagePreview = $('image-preview');
const btnOcr = $('btn-ocr');

// ===== 工具 =====
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function todayStr() {
  const d = new Date();
  return toDateStr(d);
}
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toDateStr(dt);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ===== 存储 =====
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ===== 渲染 =====
function render() {
  renderStats();
  renderSubjectFilter();
  renderList();
}

function renderStats() {
  const today = todayStr();
  const due = items.filter((it) => it.nextReviewDate && it.nextReviewDate <= today).length;
  const notMastered = items.filter((it) => (it.mastery ?? 0) < 3).length;
  $('stats').innerHTML =
    `共 <b>${items.length}</b> 题 · 今日待复习 <b>${due}</b> · 未掌握 <b>${notMastered}</b>`;
}

function renderSubjectFilter() {
  const sel = $('filter-subject');
  const subjects = [...new Set([
    ...PRESET_SUBJECTS,
    ...items.map((it) => it.subject).filter(Boolean),
  ])].sort();
  const current = sel.value;
  sel.innerHTML = '<option value="">全部科目</option>' +
    subjects.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  sel.value = current;
  $('subject-list').innerHTML = subjects
    .map((s) => `<option value="${escapeHtml(s)}"></option>`).join('');
}

function renderList() {
  const today = todayStr();
  const kw = filters.search.trim().toLowerCase();

  let list = items.filter((it) => {
    if (filters.subject && it.subject !== filters.subject) return false;
    if (filters.mastery !== '' && String(it.mastery ?? 0) !== filters.mastery) return false;
    if (filters.due && !(it.nextReviewDate && it.nextReviewDate <= today)) return false;
    if (filters.starred && !it.starred) return false;
    if (kw) {
      const hay = [it.subject, it.question, it.answer, it.note, (it.tags || []).join(' ')]
        .join(' ').toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  if (filters.due) {
    list = list.slice().sort((a, b) => (a.nextReviewDate || '').localeCompare(b.nextReviewDate || ''));
  } else {
    list = list.slice().sort((a, b) =>
      ((b.starred ? 1 : 0) - (a.starred ? 1 : 0)) ||
      ((b.createdAt || 0) - (a.createdAt || 0))
    );
  }

  listEl.innerHTML = '';
  emptyEl.hidden = list.length > 0;

  for (const it of list) {
    listEl.appendChild(buildCard(it));
  }
}

function buildCard(it) {
  const today = todayStr();
  const card = document.createElement('div');
  card.className = 'card' + (it.starred ? ' starred' : '');

  // 顶部徽章
  const top = document.createElement('div');
  top.className = 'card-top';
  if (it.subject) {
    top.appendChild(mkBadge(it.subject, 'subject'));
  }
  const m = it.mastery ?? 0;
  top.appendChild(mkBadge(MASTERY[m] || MASTERY[0], 'mastery', MASTERY_COLORS[m] || MASTERY_COLORS[0]));

  const isDue = it.nextReviewDate && it.nextReviewDate <= today;
  if (isDue) top.appendChild(mkBadge('待复习', 'due'));
  else if (it.nextReviewDate) top.appendChild(mkBadge('下次复习 ' + it.nextReviewDate, 'review'));
  else top.appendChild(mkBadge('未排复习', 'review'));

  const reviewCount = it.reviewCount || 0;
  if (reviewCount > 0) top.appendChild(mkBadge(`已复习 ${reviewCount} 次`, 'review'));
  if (it.starred) top.appendChild(mkBadge('⭐ 重点', 'star'));

  card.appendChild(top);

  // 标签
  if (Array.isArray(it.tags) && it.tags.length) {
    const tagBox = document.createElement('div');
    for (const t of it.tags) {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = t;
      tagBox.appendChild(span);
    }
    card.appendChild(tagBox);
  }

  // 题目
  const q = document.createElement('div');
  q.className = 'question';
  q.textContent = it.question || '';
  card.appendChild(q);

  // 答案（折叠）
  if (it.answer) {
    const det = document.createElement('details');
    det.className = 'answer';
    const sum = document.createElement('summary');
    sum.textContent = '查看答案';
    const body = document.createElement('div');
    body.className = 'answer-body';
    body.textContent = it.answer;
    det.appendChild(sum);
    det.appendChild(body);
    card.appendChild(det);
  }

  // 错因
  if (it.reason || it.note) {
    const r = document.createElement('div');
    r.className = 'reason';
    let txt = '';
    if (it.reason) txt += `错因：<span class="why">${escapeHtml(it.reason)}</span>`;
    if (it.note) txt += (txt ? '　·　' : '') + escapeHtml(it.note);
    r.innerHTML = txt;
    card.appendChild(r);
  }

  // 截图缩略图
  if (it.image) {
    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = it.image;
    img.alt = '题目截图';
    img.addEventListener('click', () => openViewer(it.image));
    card.appendChild(img);
  }

  // 底部操作
  const foot = document.createElement('div');
  foot.className = 'card-foot';

  const meta = document.createElement('span');
  meta.textContent = '记录于 ' + (it.createdAt ? toDateStr(new Date(it.createdAt)) : '—');
  foot.appendChild(meta);

  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  foot.appendChild(spacer);

  const btnStar = mkBtn(it.starred ? '★ 取消重点' : '☆ 标重点', it.starred ? 'star active' : 'star');
  btnStar.addEventListener('click', () => toggleStar(it.id));
  foot.appendChild(btnStar);

  const btnReview = mkBtn('复习', 'primary');
  btnReview.addEventListener('click', () => reviewItem(it.id));
  foot.appendChild(btnReview);

  const btnEdit = mkBtn('编辑', 'ghost');
  btnEdit.addEventListener('click', () => openEdit(it.id));
  foot.appendChild(btnEdit);

  const btnDel = mkBtn('删除', 'ghost danger');
  btnDel.addEventListener('click', () => removeItem(it.id));
  foot.appendChild(btnDel);

  card.appendChild(foot);
  return card;
}

function mkBadge(text, cls, bg) {
  const b = document.createElement('span');
  b.className = 'badge ' + cls;
  if (bg) b.style.background = bg;
  b.textContent = text;
  return b;
}
function mkBtn(text, cls) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn ' + cls;
  b.textContent = text;
  return b;
}

// ===== 数据操作 =====
function addItem(data) {
  items.unshift({
    id: uid(),
    subject: data.subject.trim(),
    question: data.question.trim(),
    answer: data.answer.trim(),
    reason: data.reason,
    note: data.note.trim(),
    tags: data.tags,
    mastery: data.mastery,
    image: data.image || null,
    starred: false,
    createdAt: Date.now(),
    reviewCount: 0,
    nextReviewDate: todayStr(),
    lastReviewedAt: null,
  });
  save();
  render();
}

function updateItem(id, data) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  Object.assign(it, {
    subject: data.subject.trim(),
    question: data.question.trim(),
    answer: data.answer.trim(),
    reason: data.reason,
    note: data.note.trim(),
    tags: data.tags,
    mastery: data.mastery,
    image: data.image || null,
  });
  save();
  render();
}

function removeItem(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  if (!confirm(`确定删除这道「${(it.subject || '')}」错题吗？此操作不可撤销。`)) return;
  items = items.filter((x) => x.id !== id);
  save();
  render();
}

function reviewItem(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  const n = it.reviewCount || 0;
  const interval = INTERVALS[Math.min(n, INTERVALS.length - 1)];
  it.reviewCount = n + 1;
  it.lastReviewedAt = Date.now();
  it.nextReviewDate = addDays(todayStr(), interval);
  save();
  render();
}

function toggleStar(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  it.starred = !it.starred;
  save();
  render();
}

// ===== 弹窗：新增 / 编辑 =====
function openAdd() {
  editingId = null;
  pendingImage = null;
  form.reset();
  $('modal-title').textContent = '新增错题';
  $('f-mastery').value = '0';
  $('f-reason').value = '';
  imagePreview.hidden = true;
  imagePreview.src = '';
  $('btn-clear-image').hidden = true;
  btnOcr.hidden = true;
  showModal(true);
  $('f-subject').focus();
}

function openEdit(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  editingId = id;
  pendingImage = it.image || null;
  $('modal-title').textContent = '编辑错题';
  $('f-subject').value = it.subject || '';
  $('f-reason').value = it.reason || '';
  $('f-question').value = it.question || '';
  $('f-answer').value = it.answer || '';
  $('f-note').value = it.note || '';
  $('f-mastery').value = String(it.mastery ?? 0);
  $('f-tags').value = (it.tags || []).join(', ');
  if (it.image) {
    imagePreview.src = it.image;
    imagePreview.hidden = false;
    $('btn-clear-image').hidden = false;
    btnOcr.hidden = false;
  } else {
    imagePreview.hidden = true;
    imagePreview.src = '';
    $('btn-clear-image').hidden = true;
    btnOcr.hidden = true;
  }
  showModal(true);
}

function showModal(show) {
  modal.hidden = !show;
}

function parseTags(str) {
  return [...new Set(str.split(/[,，、]/).map((s) => s.trim()).filter(Boolean))];
}

function collectForm() {
  return {
    subject: $('f-subject').value,
    question: $('f-question').value,
    answer: $('f-answer').value,
    reason: $('f-reason').value,
    note: $('f-note').value,
    tags: parseTags($('f-tags').value),
    mastery: Number($('f-mastery').value),
    image: pendingImage,
  };
}

// ===== 图片处理 =====
function setImage(file) {
  if (!file) return;
  processImageFile(file).then((dataUrl) => {
    pendingImage = dataUrl;
    imagePreview.src = dataUrl;
    imagePreview.hidden = false;
    $('btn-clear-image').hidden = false;
    btnOcr.hidden = false;
  }).catch(() => alert('图片处理失败，请重试。'));
}

function processImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 900;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function openViewer(src) {
  $('viewer-img').src = src;
  viewer.hidden = false;
}

// ===== OCR：从截图识别题目 =====
let ocrBusy = false;

function loadTesseract() {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('OCR 库加载失败，请检查网络'));
    document.head.appendChild(s);
  });
}

async function runOCR() {
  if (ocrBusy) return;
  const src = pendingImage;
  if (!src) return;
  ocrBusy = true;
  const btn = $('btn-ocr');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '加载识别引擎…';
  let worker;
  try {
    await loadTesseract();
    btn.textContent = '下载中文模型…（首次较慢）';
    let lastLog = 0;
    const logger = (m) => {
      if (m && typeof m.progress === 'number') {
        const now = Date.now();
        if (now - lastLog > 150) {
          lastLog = now;
          btn.textContent = '识别中 ' + Math.round(m.progress * 100) + '%';
        }
      }
    };
    // cacheMethod: 'none' 跳过 IndexedDB 缓存写入，避免 tesseract.js 缓存损坏导致的卡死
    worker = await withTimeout(
      Tesseract.createWorker('chi_sim', 1, { cacheMethod: 'none', logger }),
      180000, '创建识别引擎超时'
    );
    const { data } = await withTimeout(worker.recognize(src), 120000, '识别超时');
    const text = (data && data.text ? data.text : '').trim();
    if (text) fillQuestion(text);
    else alert('未识别到文字，请确认图片清晰、且题目是印刷体。手写和复杂公式识别效果有限。');
  } catch (e) {
    alert('识别失败：' + (e && e.message ? e.message : e));
  } finally {
    if (worker) { try { await worker.terminate(); } catch (_) {} }
    ocrBusy = false;
    btn.disabled = false;
    btn.textContent = original;
  }
}

function withTimeout(promise, ms, msg) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg || '操作超时')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

function fillQuestion(text) {
  const q = $('f-question');
  if (q.value.trim()) q.value = q.value.trim() + '\n' + text;
  else q.value = text;
}

// ===== 导入 / 导出 =====
function exportData() {
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `错题本备份-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const arr = JSON.parse(e.target.result);
      if (!Array.isArray(arr)) throw new Error('格式错误');
      const existing = new Set(items.map((it) => it.id));
      let added = 0;
      for (const it of arr) {
        if (it && it.id && !existing.has(it.id)) {
          items.push(it);
          added++;
        }
      }
      save();
      render();
      alert(`导入完成：新增 ${added} 道错题，跳过 ${arr.length - added} 道重复。`);
    } catch (err) {
      alert('导入失败：文件格式不正确。');
    }
  };
  reader.readAsText(file);
}

// ===== 事件绑定 =====
$('btn-add').addEventListener('click', openAdd);
$('btn-close').addEventListener('click', () => showModal(false));
$('btn-cancel').addEventListener('click', () => showModal(false));
$('btn-clear-image').addEventListener('click', () => {
  pendingImage = null;
  imagePreview.hidden = true;
  imagePreview.src = '';
  $('btn-clear-image').hidden = true;
  btnOcr.hidden = true;
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = collectForm();
  if (!data.question.trim()) {
    alert('请填写题目内容。');
    $('f-question').focus();
    return;
  }
  if (editingId) updateItem(editingId, data);
  else addItem(data);
  showModal(false);
});

// 关闭弹窗：点遮罩
modal.addEventListener('click', (e) => {
  if (e.target === modal) showModal(false);
});

// 图片：上传 / 拖拽 / 粘贴
$('btn-upload').addEventListener('click', () => $('file-input').click());
btnOcr.addEventListener('click', runOCR);
$('file-input').addEventListener('change', (e) => {
  if (e.target.files[0]) setImage(e.target.files[0]);
  e.target.value = '';
});
['dragover', 'dragenter'].forEach((ev) =>
  imageDrop.addEventListener(ev, (e) => { e.preventDefault(); imageDrop.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) =>
  imageDrop.addEventListener(ev, (e) => { e.preventDefault(); imageDrop.classList.remove('drag'); }));
imageDrop.addEventListener('drop', (e) => {
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) setImage(f);
});

// 弹窗内 Ctrl/Cmd+V 粘贴截图（不劫持输入框里的文字粘贴）
document.addEventListener('paste', (e) => {
  if (modal.hidden) return;
  const t = e.target;
  if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
  const cip = e.clipboardData && e.clipboardData.items;
  if (!cip) return;
  for (const it of cip) {
    if (it.type && it.type.startsWith('image/')) {
      setImage(it.getAsFile());
      e.preventDefault();
      break;
    }
  }
});

// 大图查看
$('viewer-close').addEventListener('click', () => (viewer.hidden = true));
viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.hidden = true; });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!viewer.hidden) viewer.hidden = true;
    else if (!modal.hidden) showModal(false);
  }
});

// 搜索 / 筛选
$('search').addEventListener('input', (e) => {
  filters.search = e.target.value;
  renderList();
});
$('filter-subject').addEventListener('change', (e) => {
  filters.subject = e.target.value;
  renderList();
});
$('filter-mastery').addEventListener('change', (e) => {
  filters.mastery = e.target.value;
  renderList();
});
$('filter-due').addEventListener('click', () => {
  filters.due = !filters.due;
  $('filter-due').classList.toggle('active', filters.due);
  renderList();
});
$('filter-starred').addEventListener('click', () => {
  filters.starred = !filters.starred;
  $('filter-starred').classList.toggle('active', filters.starred);
  renderList();
});

// 导入 / 导出
$('btn-export').addEventListener('click', exportData);
$('btn-import').addEventListener('click', () => $('import-input').click());
$('import-input').addEventListener('change', (e) => {
  if (e.target.files[0]) importData(e.target.files[0]);
  e.target.value = '';
});

// ===== 启动 =====
render();
