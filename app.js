/* 임마누엘컴퍼니 · 송블리 본부 — office dashboard */
(function () {
  'use strict';

  var MOTION_KEY = 'immanuel.motion.v1';
  var MEMO_KEY = 'immanuel.memos.v1';
  var state = null;

  var el = {
    app: document.getElementById('app'),
    brandSub: document.getElementById('brandSub'),
    workspaceTitle: document.getElementById('workspaceTitle'),
    workspaceText: document.getElementById('workspaceText'),
    chips: document.getElementById('chips'),
    motionToggle: document.getElementById('motionToggle'),
    motionLabel: document.getElementById('motionLabel'),
    map: document.getElementById('map'),
    mapImage: document.getElementById('mapImage'),
    pins: document.getElementById('pins'),
    approvalList: document.getElementById('approvalList'),
    routineList: document.getElementById('routineList'),
    statGrid: document.getElementById('statGrid'),
    updateList: document.getElementById('updateList'),
    scheduleList: document.getElementById('scheduleList'),
    updatedLine: document.getElementById('updatedLine'),
    footNote: document.getElementById('footNote'),
    memoInput: document.getElementById('memoInput'),
    memoCopy: document.getElementById('memoCopy'),
    memoSave: document.getElementById('memoSave'),
    memoList: document.getElementById('memoList'),
    sheet: document.getElementById('sheet'),
    sheetBackdrop: document.getElementById('sheetBackdrop'),
    sheetRole: document.getElementById('sheetRole'),
    sheetTitle: document.getElementById('sheetTitle'),
    sheetBody: document.getElementById('sheetBody'),
    sheetClose: document.getElementById('sheetClose'),
    toast: document.getElementById('toast')
  };

  /* ---------- helpers ---------- */

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var toastTimer = null;
  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('is-visible'); }, 2200);
  }

  function copyText(text, okMessage) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var done = false;
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      document.body.removeChild(ta);
      toast(done ? (okMessage || '복사했어요') : '복사가 안 됐어요. 길게 눌러 복사해 주세요.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast(okMessage || '복사했어요');
      }, fallback);
    } else {
      fallback();
    }
  }

  function stateClass(tone) {
    switch (tone) {
      case 'ok': case 'live': case 'done': return 'ok';
      case 'block': case 'miss': return 'block';
      case 'idle': return 'idle';
      default: return 'wait';
    }
  }

  /* ---------- render: header + workspace ---------- */

  function renderSite() {
    var site = state.site || {};
    if (site.subtitle) el.brandSub.textContent = site.subtitle;
    if (site.workspaceTitle) el.workspaceTitle.textContent = site.workspaceTitle;
    if (site.workspaceText) el.workspaceText.textContent = site.workspaceText;
    if (site.updatedLabel) el.updatedLine.textContent = site.updatedLabel;
    if (site.privacyNote) el.footNote.textContent = site.privacyNote;
    document.title = (site.title || '임마누엘컴퍼니') + ' · 송블리 본부';

    var parts = state.spots.filter(function (s) { return s.part; }).length;

    // chips: keep motion toggle, rebuild the rest
    var chips = ['가동 ' + parts + '파트', '송블리'];
    Array.prototype.slice.call(el.chips.querySelectorAll('.chip:not(#motionToggle)'))
      .forEach(function (node) { node.remove(); });
    chips.forEach(function (label) {
      var span = document.createElement('span');
      span.className = 'chip';
      span.textContent = label;
      el.chips.appendChild(span);
    });

    var src = (state.map && state.map.image) || 'assets/office-3d.png';
    el.mapImage.src = src;
    if (state.map && state.map.alt) el.mapImage.alt = state.map.alt;
  }

  /* ---------- render: pins ---------- */

  function renderPins() {
    el.pins.innerHTML = '';
    state.spots.forEach(function (spot, index) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pin';
      btn.style.left = spot.x + '%';
      btn.style.top = spot.y + '%';
      btn.style.setProperty('--delay', (index * 0.42).toFixed(2) + 's');
      btn.dataset.id = spot.id;
      btn.setAttribute('aria-label', spot.name + ' 상세 보기');
      btn.textContent = spot.pin;
      btn.addEventListener('click', function () { openSheet(spot.id); });
      el.pins.appendChild(btn);
    });
  }

  /* ---------- render: meeting / approvals ---------- */

  function renderApprovals() {
    el.approvalList.innerHTML = '';
    (state.approvals || []).forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'card approval';
      card.innerHTML =
        '<div class="approval-top">' +
          '<span class="approval-team">' + esc(item.team) + '</span>' +
          '<span class="approval-due">' + esc(item.tone || '') + '</span>' +
        '</div>' +
        '<h3>' + esc(item.title) + '</h3>' +
        '<p>' + esc(item.why) + '</p>' +
        '<div class="options" role="group" aria-label="지시 문장 복사"></div>';

      var holder = card.querySelector('.options');
      (item.options || []).forEach(function (option) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option';
        btn.textContent = option.label;
        btn.title = option.text;
        btn.addEventListener('click', function () {
          copyText(option.text, '지시 문장을 복사했어요');
        });
        holder.appendChild(btn);
      });

      el.approvalList.appendChild(card);
    });
  }

  /* ---------- render: work / routines ---------- */

  function renderRoutines() {
    el.routineList.innerHTML = '';
    (state.routines || []).forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'row';
      row.innerHTML =
        '<div class="row-time">' + esc(item.time) + '</div>' +
        '<div class="row-main">' +
          '<div class="row-title">' + esc(item.name) + '</div>' +
          '<div class="row-sub">' + esc(item.last || '') +
            (item.next ? ' · 다음 ' + esc(item.next) : '') + '</div>' +
        '</div>' +
        '<span class="state ' + stateClass(item.state) + '">' + esc(item.stateLabel) + '</span>';
      el.routineList.appendChild(row);
    });
  }

  /* ---------- render: status ---------- */

  function renderStatus() {
    var parts = state.spots.filter(function (s) { return s.part; });
    var acts = [
      { label: '가동 파트', value: parts.length, unit: '개' },
      { label: '결재 대기', value: (state.approvals || []).length, unit: '건' },
      { label: '자동 루틴', value: (state.routines || []).length, unit: '개' },
      { label: '오늘 기록', value: (state.updates || []).length, unit: '건' }
    ];
    el.statGrid.innerHTML = acts.map(function (a) {
      return '<dl class="stat"><dt>' + esc(a.label) + '</dt>' +
        '<dd>' + esc(a.value) + '<small>' + esc(a.unit) + '</small></dd></dl>';
    }).join('');

    el.updateList.innerHTML = '';
    (state.updates || []).forEach(function (item, index) {
      var row = document.createElement('div');
      row.className = 'tl-row' + (index === 0 ? ' is-latest' : '');
      row.innerHTML =
        '<div class="tl-time">' + esc(item.time) + '</div>' +
        '<div><div class="tl-text">' + esc(item.text) + '</div>' +
          '<span class="row-part">' + esc(item.part) + '</span></div>';
      el.updateList.appendChild(row);
    });

    el.scheduleList.innerHTML = '';
    (state.schedule || []).forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'row';
      row.innerHTML =
        '<div class="row-time">' + esc(item.time) + '</div>' +
        '<div class="row-main"><div class="row-title">' + esc(item.text) + '</div>' +
          '<div class="row-sub"><span class="row-part">' + esc(item.part) + '</span></div></div>';
      el.scheduleList.appendChild(row);
    });
  }

  /* ---------- sheet ---------- */

  function openSheet(id) {
    var spot = (state.spots || []).filter(function (s) { return s.id === id; })[0];
    if (!spot) return;

    el.sheetRole.textContent = spot.role || '';
    el.sheetTitle.textContent = spot.name || spot.pin;

    var tasks = (spot.tasks || []).map(function (task) {
      return '<div class="task">' +
        '<div class="task-main">' +
          '<div class="task-title">' + esc(task.title) + '</div>' +
          '<div class="task-note">' + esc(task.when || '') +
            (task.note ? ' · ' + esc(task.note) : '') + '</div>' +
        '</div>' +
        '<span class="state ' + stateClass(task.state) + '">' + esc(task.stateLabel) + '</span>' +
      '</div>';
    }).join('');

    var recent = (spot.recent || []).map(function (item) {
      return '<li><span class="t">' + esc(item.time) + '</span><span>' + esc(item.text) + '</span></li>';
    }).join('');

    var next = (spot.next || []).map(function (item) {
      return '<li><span class="t">' + esc(item.time) + '</span><span>' + esc(item.text) + '</span></li>';
    }).join('');

    var prompts = (spot.prompts || []).map(function (prompt) {
      return '<button class="sheet-prompt" type="button" data-copy="' + esc(prompt.text) + '">' +
        '<span>' + esc(prompt.label) + '</span><span class="hint">피클에 지시 복사</span></button>';
    }).join('');

    el.sheetBody.innerHTML =
      '<span class="sheet-status state ' + stateClass(spot.tone) + '">' + esc(spot.statusLabel) + '</span>' +
      '<p class="sheet-summary">' + esc(spot.summary) + '</p>' +
      (spot.headline ? '<p class="sheet-headline">' + esc(spot.headline) + '</p>' : '') +
      '<div class="sheet-block"><h3>지금 하는 일</h3>' + tasks + '</div>' +
      (recent ? '<div class="sheet-block"><h3>최근 기록</h3><ul class="sheet-list">' + recent + '</ul></div>' : '') +
      (next ? '<div class="sheet-block"><h3>다음</h3><ul class="sheet-list">' + next + '</ul></div>' : '') +
      (prompts ? '<div class="sheet-block">' + prompts + '</div>' : '');

    Array.prototype.forEach.call(el.sheetBody.querySelectorAll('[data-copy]'), function (btn) {
      btn.addEventListener('click', function () {
        copyText(btn.getAttribute('data-copy'), '지시 문장을 복사했어요');
      });
    });

    el.sheet.hidden = false;
    el.sheetBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    var panel = el.sheet.querySelector('.sheet-panel');
    if (panel) panel.scrollTop = 0;
    el.sheetClose.focus({ preventScroll: true });
  }

  function closeSheet() {
    el.sheet.hidden = true;
    el.sheetBackdrop.hidden = true;
    document.body.style.overflow = '';
  }

  el.sheetClose.addEventListener('click', closeSheet);
  el.sheetBackdrop.addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !el.sheet.hidden) closeSheet();
  });

  /* ---------- tabs ---------- */

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var views = Array.prototype.slice.call(document.querySelectorAll('.view'));

  function activate(viewName, push) {
    var found = false;
    tabs.forEach(function (tab) {
      var on = tab.dataset.view === viewName;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) found = true;
    });
    if (!found) return;
    views.forEach(function (view) {
      var on = view.id === 'view-' + viewName;
      view.classList.toggle('is-active', on);
      view.hidden = !on;
    });
    if (push && history.replaceState) {
      history.replaceState(null, '', '#' + viewName);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { activate(tab.dataset.view, true); });
  });

  var initial = (location.hash || '').replace('#', '');
  if (initial && document.getElementById('view-' + initial)) activate(initial, false);

  /* ---------- motion toggle ---------- */

  function applyMotion(on) {
    el.app.classList.toggle('motion', on);
    el.motionToggle.classList.toggle('is-off', !on);
    el.motionToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.motionLabel.textContent = on ? '모션 ON' : '모션 OFF';
  }

  var motionOn = localStorage.getItem(MOTION_KEY) !== 'off';
  applyMotion(motionOn);
  el.motionToggle.addEventListener('click', function () {
    motionOn = !el.app.classList.contains('motion');
    applyMotion(motionOn);
    try { localStorage.setItem(MOTION_KEY, motionOn ? 'on' : 'off'); } catch (e) {}
  });

  /* ---------- memo ---------- */

  function readMemos() {
    try {
      var raw = localStorage.getItem(MEMO_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function writeMemos(list) {
    try { localStorage.setItem(MEMO_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function renderMemos() {
    var list = readMemos();
    el.memoList.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'card empty';
      empty.textContent = '아직 저장한 메모가 없어요.';
      el.memoList.appendChild(empty);
      return;
    }
    list.forEach(function (memo) {
      var card = document.createElement('div');
      card.className = 'card memo-item';
      card.innerHTML = '<p>' + esc(memo.text) + '</p>' +
        '<div class="memo-meta"><time>' + esc(memo.label) + '</time>' +
        '<div class="mini-actions">' +
          '<button class="mini" type="button" data-act="copy">복사</button>' +
          '<button class="mini" type="button" data-act="del">삭제</button>' +
        '</div></div>';
      card.querySelector('[data-act="copy"]').addEventListener('click', function () {
        copyText(memo.text, '메모를 복사했어요');
      });
      card.querySelector('[data-act="del"]').addEventListener('click', function () {
        writeMemos(readMemos().filter(function (m) { return m.id !== memo.id; }));
        renderMemos();
        toast('메모를 지웠어요');
      });
      el.memoList.appendChild(card);
    });
  }

  function stamp() {
    var d = new Date();
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return {
      label: (d.getMonth() + 1) + '/' + d.getDate() + ' ' + two(d.getHours()) + ':' + two(d.getMinutes())
    };
  }

  function saveMemo(silent) {
    var text = el.memoInput.value.trim();
    if (!text) {
      toast('보낼 내용을 먼저 적어 주세요');
      el.memoInput.focus();
      return false;
    }
    var list = readMemos();
    list.unshift({ id: 'm' + Date.now(), text: text, label: stamp().label });
    writeMemos(list);
    renderMemos();
    if (!silent) toast('메모를 저장했어요');
    return true;
  }

  el.memoSave.addEventListener('click', function () { saveMemo(false); });

  el.memoCopy.addEventListener('click', function () {
    var text = el.memoInput.value.trim();
    if (!text) {
      toast('보낼 내용을 먼저 적어 주세요');
      el.memoInput.focus();
      return;
    }
    copyText(text, '메모를 복사했어요 — 대화창에 붙여 넣으세요');
    if (saveMemo(true)) el.memoInput.value = '';
  });

  /* ---------- boot ---------- */

  function boot() {
    fetch('office-state.json', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('state ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state = data;
        renderSite();
        renderPins();
        renderApprovals();
        renderRoutines();
        renderStatus();
        renderMemos();
      })
      .catch(function (error) {
        el.workspaceText.textContent = '현황 파일을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.';
        el.pins.innerHTML = '';
        console.error('[office] state load failed', error);
      });
  }

  renderMemos();
  boot();
})();
