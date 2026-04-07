/* ─────────────────────────────────────────────
   TASK MANAGER — script.js
   Features: priorities, tags, search, filter,
   localStorage, delete modal, sort, resize,
   collapse, subtasks (3 levels), CSV export
───────────────────────────────────────────── */

const STORAGE_KEY = 'taskManager_v2';

let tasks         = [];
let collapsedSet  = new Set();
let currentFilter = 'all';
let searchQuery   = '';
let sortSettings  = { col: null, dir: 1 };
let pendingDelete = null;   // id to delete after confirmation
let newRowId      = null;   // used for flash animation

// ── STATUS CONFIG ──────────────────────────────

const STATUS_CONFIG = {
    'Not Started':      { bg: '#3e2723', color: '#d7ccc8' }, // Maro
    'ME: On going':     { bg: '#003366', color: '#99ccff' }, // Albastru deschis
    'Follow Up':        { bg: '#4a148c', color: '#f8bbd0' }, // Roz
    'Done':             { bg: '#1b5e20', color: '#a5d6a7' }, // Verde
    'Others: On going': { bg: '#311b92', color: '#b39ddb' }, // Mov
    'Delayed':          { bg: '#7f1d1d', color: '#fecaca' }  // Rosu
};

const PRIORITY_CONFIG = {
    'High':   { cls: 'prio-high',   label: '⬆ High' },
    'Medium': { cls: 'prio-medium', label: '➡ Medium' },
    'Low':    { cls: 'prio-low',    label: '⬇ Low' },
};

// ── INIT ──────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initSidebar();
    initResizers();
    initKeyboard();
    renderTasks();
    updateCounts();
});

// ── STORAGE ───────────────────────────────────

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        tasks = raw ? JSON.parse(raw) : [];
        // migrate old data that may lack new fields
        tasks.forEach(t => {
            if (!t.priority)    t.priority    = 'Medium';
            if (!t.status)      t.status      = t.responsible || 'Not Started';
            if (!t.hasOwnProperty('done')) t.done = t.status === 'Done';
        });
        // restore collapsed state
        tasks.forEach(t => { if (!t.parentId) collapsedSet.add(t.id); });
    } catch(e) {
        tasks = [];
    }
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function saveAndRender() {
    saveData();
    renderTasks();
    updateCounts();
}

// ── RENDER ────────────────────────────────────

function renderTasks() {
    const tbody = document.getElementById('taskBody');
    tbody.innerHTML = '';

    const visible = buildVisibleList();

    if (visible.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
    } else {
        document.getElementById('emptyState').style.display = 'none';
        visible.forEach(t => createRow(t, tbody));
    }

    // apply sort arrows to headers
    document.querySelectorAll('.sort-arrow').forEach(el => {
        el.className = 'sort-arrow';
        const col = parseInt(el.dataset.col);
        if (sortSettings.col === col) {
            el.classList.add(sortSettings.dir === 1 ? 'asc' : 'desc');
        }
    });

    // status bar
    const total   = tasks.length;
    const doneN   = tasks.filter(t => t.done).length;
    document.getElementById('statusText').textContent =
        `${total} task-uri · ${doneN} finalizate`;
}

function buildVisibleList() {
    const cols   = ['name','comment','priority','status','dueDate'];
    let topLevel = tasks.filter(t => !t.parentId);

    if (sortSettings.col !== null) {
        const key = cols[sortSettings.col];
        topLevel.sort((a,b) =>
            (a[key]||'').toString().toLowerCase()
            .localeCompare((b[key]||'').toString().toLowerCase()) * sortSettings.dir
        );
    }

    const result = [];

    topLevel.forEach(task => {
        if (!matchesFilter(task)) return;
        if (!matchesSearch(task)) {
            // still include if a child matches
            const children = getAllDescendants(task.id);
            const childMatch = children.some(c => matchesSearch(c));
            if (!childMatch) return;
        }
        result.push(task);

        if (!collapsedSet.has(task.id)) {
            let subs1 = tasks.filter(t => t.parentId === task.id);
            if (sortSettings.col !== null) {
                const key = cols[sortSettings.col];
                subs1.sort((a,b) =>
                    (a[key]||'').toString().toLowerCase()
                    .localeCompare((b[key]||'').toString().toLowerCase()) * sortSettings.dir
                );
            }
            subs1.forEach(s1 => {
                if (!matchesFilter(s1)) return;
                if (!matchesSearch(s1)) {
                    const children = getAllDescendants(s1.id);
                    if (!children.some(c => matchesSearch(c))) return;
                }
                result.push(s1);

                if (!collapsedSet.has(s1.id)) {
                    let subs2 = tasks.filter(t => t.parentId === s1.id);
                    if (sortSettings.col !== null) {
                        const key = cols[sortSettings.col];
                        subs2.sort((a,b) =>
                            (a[key]||'').toString().toLowerCase()
                            .localeCompare((b[key]||'').toString().toLowerCase()) * sortSettings.dir
                        );
                    }
                    subs2.forEach(s2 => {
                        if (!matchesFilter(s2)) return;
                        if (!matchesSearch(s2)) return;
                        result.push(s2);
                    });
                }
            });
        }
    });

    return result;
}

function matchesFilter(task) {
    switch (currentFilter) {
        case 'all':     return true;
        case 'todo':    return !task.done;
        case 'done':    return task.done;
        case 'overdue': {
            if (!task.dueDate || task.done) return false;
            const today = new Date(); today.setHours(0,0,0,0);
            return new Date(task.dueDate) < today;
        }
        case 'high':    return task.priority === 'High';
        case 'medium':  return task.priority === 'Medium';
        case 'low':     return task.priority === 'Low';
        default: return true;
    }
}

function matchesSearch(task) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (task.name    || '').toLowerCase().includes(q) ||
           (task.comment || '').toLowerCase().includes(q);
}

function getAllDescendants(id) {
    const result = [];
    const children = tasks.filter(t => t.parentId === id);
    children.forEach(c => {
        result.push(c);
        result.push(...getAllDescendants(c.id));
    });
    return result;
}

// ── CREATE ROW ────────────────────────────────

function createRow(task, tbody) {
    const tr = document.createElement('tr');

    const levelClass = ['row-task','row-sub1','row-sub2'][task.level] || 'row-sub2';
    tr.className = levelClass;
    if (task.done) tr.classList.add('row-done');
    if (task.id === newRowId) { tr.classList.add('row-new'); newRowId = null; }

    const indent = task.level * 24;
    const hasChildren = tasks.some(t => t.parentId === task.id);
    const isCollapsed = collapsedSet.has(task.id);
    const canHaveChildren = task.level < 2;

    // ── NAME CELL ──
    const tdName = document.createElement('td');
    tdName.innerHTML = `
        <div class="cell-name">
            <div class="check-box ${task.done ? 'checked' : ''}" onclick="toggleDone(${task.id})" title="Marchează ca finalizat"></div>
            ${canHaveChildren
                ? `<button class="toggle-btn" onclick="toggleCollapse(${task.id})" title="${isCollapsed ? 'Extinde' : 'Restrânge'}">${isCollapsed ? '+' : '−'}</button>`
                : `<span style="width:18px;flex-shrink:0"></span>`
            }
            <div class="name-wrap" style="padding-left:${indent}px">
                <textarea class="name-area"
                    rows="1"
                    placeholder="${task.level === 0 ? 'Nume task...' : 'Sub-task...'}"
                    onchange="updateField(${task.id},'name',this.value)"
                    oninput="autoResize(this)"
                >${escHtml(task.name)}</textarea>
            </div>
            ${canHaveChildren
                ? `<button class="btn-add-child" onclick="addChild(${task.id},${task.level})" title="Adaugă sub-task">+</button>`
                : ''
            }
        </div>`;

    // ── COMMENT CELL ──
    const tdComment = document.createElement('td');
    tdComment.innerHTML = `<textarea class="comment-area"
        rows="1"
        placeholder="Comentariu..."
        onchange="updateField(${task.id},'comment',this.value)"
        oninput="autoResize(this)"
    >${escHtml(task.comment)}</textarea>`;

    // ── PRIORITY CELL ──
    const prioConf = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG['Medium'];
    const tdPrio = document.createElement('td');
    tdPrio.innerHTML = `
        <select class="prio-select ${prioConf.cls}"
            onchange="updateField(${task.id},'priority',this.value); applyPrioClass(this)">
            ${Object.entries(PRIORITY_CONFIG).map(([v,c]) =>
                `<option value="${v}" ${task.priority===v?'selected':''}>${c.label}</option>`
            ).join('')}
        </select>`;

    // ── STATUS CELL ──
    const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG['Not Started'];
    const tdStatus = document.createElement('td');
    tdStatus.innerHTML = `
        <select class="status-select"
            style="background:${sc.bg}; color:${sc.color}"
            onchange="updateStatus(${task.id},this)">
            ${Object.entries(STATUS_CONFIG).map(([v,c]) =>
                `<option value="${v}" ${task.status===v?'selected':''}>${v}</option>`
            ).join('')}
        </select>`;

    // ── DATE CELL ──
    const tdDate = document.createElement('td');
    tdDate.innerHTML = `<input type="date" class="date-input"
        value="${task.dueDate || ''}"
        onchange="updateField(${task.id},'dueDate',this.value)"
        title="Setează deadline">`;

    // ── TIME LEFT CELL ──
    const tdTime = document.createElement('td');
    tdTime.innerHTML = `<div class="time-cell">${getTimeLeft(task.dueDate, task.done)}</div>`;

    // ── DELETE CELL ──
    const tdDel = document.createElement('td');
    tdDel.innerHTML = `<button class="btn-delete" onclick="confirmDelete(${task.id})" title="Șterge">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 2a1 1 0 0 0-1 1v.5H2a.5.5 0 0 0 0 1h.5l.5 9A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5l.5-9H14a.5.5 0 0 0 0-1h-3V3a1 1 0 0 0-1-1H6zm1 1h2v.5H7V3zm-2.5 2h7l-.5 8.5a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5L4.5 5z"/>
        </svg>
    </button>`;

    [tdName, tdComment, tdPrio, tdStatus, tdDate, tdTime, tdDel].forEach(td => tr.appendChild(td));
    tbody.appendChild(tr);

    // auto-resize textareas after insert
    tr.querySelectorAll('textarea').forEach(autoResize);
}

// ── TASK ACTIONS ──────────────────────────────

document.getElementById('addTaskBtn').addEventListener('click', () => {
    const id = Date.now();
    newRowId = id;
    tasks.push({
        id, parentId: null, level: 0,
        name: '', comment: '', priority: 'Medium',
        status: 'Not Started', dueDate: '', done: false
    });
    saveAndRender();
    // focus the new textarea
    setTimeout(() => {
        const trs = document.querySelectorAll('#taskBody tr');
        if (trs.length > 0) {
            const last = trs[trs.length - 1];
            const ta = last.querySelector('textarea.name-area');
            if (ta) { ta.focus(); ta.select(); }
        }
    }, 50);
});

function addChild(parentId, parentLevel) {
    const id = Date.now();
    newRowId = id;
    tasks.push({
        id, parentId, level: parentLevel + 1,
        name: '', comment: '', priority: 'Medium',
        status: 'Not Started', dueDate: '', done: false
    });
    collapsedSet.delete(parentId);
    saveAndRender();
    setTimeout(() => {
        const row = document.querySelector(`[data-id="${id}"]`) ||
            [...document.querySelectorAll('#taskBody tr')].pop();
        if (row) { const ta = row.querySelector('textarea'); if (ta) { ta.focus(); ta.select(); } }
    }, 50);
}

function toggleDone(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    task.done = !task.done;
    task.status = task.done ? 'Done' : 'Not Started';
    saveAndRender();
}

function updateField(id, field, value) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    task[field] = value;
    saveData();
    if (field === 'dueDate') renderTasks(); // refresh time-left
    updateCounts();
}

function updateStatus(id, selectEl) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    task.status = selectEl.value;
    task.done   = selectEl.value === 'Done';
    const sc    = STATUS_CONFIG[selectEl.value] || STATUS_CONFIG['Not Started'];
    selectEl.style.background = sc.bg;
    selectEl.style.color      = sc.color;
    // update done class on row
    const tr = selectEl.closest('tr');
    if (tr) tr.classList.toggle('row-done', task.done);
    // update checkbox
    const cb = tr?.querySelector('.check-box');
    if (cb) cb.classList.toggle('checked', task.done);
    saveData();
    updateCounts();
}

function applyPrioClass(selectEl) {
    selectEl.className = 'prio-select';
    const prioConf = PRIORITY_CONFIG[selectEl.value];
    if (prioConf) selectEl.classList.add(prioConf.cls);
}

// ── DELETE ────────────────────────────────────

function confirmDelete(id) {
    pendingDelete = id;
    document.getElementById('confirmModal').style.display = 'flex';
    document.getElementById('confirmDeleteBtn').focus();
}

function closeModal() {
    pendingDelete = null;
    document.getElementById('confirmModal').style.display = 'none';
}

document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
    if (pendingDelete !== null) {
        deleteTaskDeep(pendingDelete);
        closeModal();
    }
});

// Close modal on overlay click
document.getElementById('confirmModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('confirmModal')) closeModal();
});

function deleteTaskDeep(id) {
    // recursively collect all descendant ids
    const toDelete = new Set();
    const collect = (tid) => {
        toDelete.add(tid);
        tasks.filter(t => t.parentId === tid).forEach(c => collect(c.id));
    };
    collect(id);
    tasks = tasks.filter(t => !toDelete.has(t.id));
    collapsedSet.delete(id);
    saveAndRender();
}

// ── COLLAPSE ──────────────────────────────────

function toggleCollapse(id) {
    if (collapsedSet.has(id)) collapsedSet.delete(id);
    else collapsedSet.add(id);
    renderTasks();
}

// ── SORT ──────────────────────────────────────

function handleSort(col) {
    if (sortSettings.col === col) sortSettings.dir *= -1;
    else { sortSettings.col = col; sortSettings.dir = 1; }
    renderTasks();
}

// ── FILTER (SIDEBAR) ──────────────────────────

function initSidebar() {
    document.querySelectorAll('.nav-item[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;

            const labels = {
                all: 'Toate task-urile', todo: 'În lucru',
                done: 'Finalizate', overdue: 'Întârziate',
                high: 'Prioritate High', medium: 'Prioritate Medium', low: 'Prioritate Low'
            };
            document.getElementById('pageSubtitle').textContent = labels[currentFilter] || '';
            renderTasks();
        });
    });
}

// ── SEARCH ───────────────────────────────────

function handleSearch(val) {
    searchQuery = val.trim();
    document.getElementById('searchClear').style.display = searchQuery ? 'block' : 'none';
    renderTasks();
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    handleSearch('');
    document.getElementById('searchInput').focus();
}

// ── COUNTS ───────────────────────────────────

function updateCounts() {
    const today = new Date(); today.setHours(0,0,0,0);
    document.getElementById('countAll').textContent    = tasks.length;
    document.getElementById('countTodo').textContent   = tasks.filter(t => !t.done).length;
    document.getElementById('countDone').textContent   = tasks.filter(t => t.done).length;
    document.getElementById('countOverdue').textContent = tasks.filter(t => {
        if (!t.dueDate || t.done) return false;
        return new Date(t.dueDate) < today;
    }).length;
}

// ── TIME LEFT ────────────────────────────────

function getTimeLeft(dateStr, done) {
    if (!dateStr) return '<span style="color:var(--text-3)">—</span>';
    if (done)     return '<span class="time-ok">✓</span>';
    const today = new Date(); today.setHours(0,0,0,0);
    const due   = new Date(dateStr);
    const diff  = Math.ceil((due - today) / 86400000);
    if (diff < 0)  return `<span class="time-late">−${Math.abs(diff)}z</span>`;
    if (diff === 0) return `<span class="time-today">Azi</span>`;
    if (diff <= 3) return `<span class="time-warn">${diff}z</span>`;
    return `<span class="time-ok">${diff}z</span>`;
}

// ── RESIZE ───────────────────────────────────

function initResizers() {
    document.querySelectorAll('th.resizable').forEach(th => {
        const resizer = th.querySelector('.resizer');
        if (!resizer) return;
        resizer.addEventListener('mousedown', e => {
            e.preventDefault();
            const startX = e.pageX;
            const startW = th.offsetWidth;
            const onMove = e => { th.style.width = Math.max(80, startW + e.pageX - startX) + 'px'; };
            const onUp   = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    });
}

// ── KEYBOARD SHORTCUTS ────────────────────────

function initKeyboard() {
    document.addEventListener('keydown', e => {
        // Escape closes modal
        if (e.key === 'Escape') {
            if (document.getElementById('confirmModal').style.display !== 'none') {
                closeModal();
                return;
            }
        }
        // Ctrl/Cmd + K focuses search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
            document.getElementById('searchInput').select();
        }
        // Ctrl/Cmd + Enter adds new task
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('addTaskBtn').click();
        }
    });
}

// ── HELPERS ───────────────────────────────────

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight) + 'px';
}

function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── EXPORT CSV ────────────────────────────────

function exportCSV() {
    const headers = ['Nivel','Nume','Comentariu','Prioritate','Status','Deadline','Finalizat'];
    const rows = tasks.map(t => [
        t.level,
        `"${(t.name    ||'').replace(/"/g,'""')}"`,
        `"${(t.comment ||'').replace(/"/g,'""')}"`,
        t.priority || '',
        t.status   || '',
        t.dueDate  || '',
        t.done ? 'Da' : 'Nu'
    ].join(','));

    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `tasks_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
