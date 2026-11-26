/* ============================================================
   임마누엘컴퍼니 AI 오피스 — app.js
   정적 페이지. 상태는 office-state.json 에서 읽습니다.
   ============================================================ */
(function () {
  'use strict';

  var STATE_URL = 'office-state.json';
  var GRID = { w: 12, d: 9 };
  var U = 38;
  var C30 = Math.cos(Math.PI / 6);
  var S30 = 0.5;
  var WALL_H = 3.05;
  var SLAB = 0.55;

  var STATUS = {
    working:  { label: '작업중',  color: '#4f8ef7', soft: '#e6efff', bucket: 'work' },
    ok:       { label: '정상',    color: '#1fae7c', soft: '#e2f7ef', bucket: 'work' },
    waiting:  { label: '대기',    color: '#e3a13a', soft: '#fdf2de', bucket: 'wait' },
    approval: { label: '결재필요', color: '#e8657f', soft: '#fde8ed', bucket: 'appr' },
    blocked:  { label: '막힘',    color: '#d9503f', soft: '#fbe5e1', bucket: 'block' },
    paused:   { label: '보류',    color: '#8a7bee', soft: '#eeebfe', bucket: 'wait' }
  };
  var STATUS_ORDER = ['working', 'ok', 'waiting', 'approval', 'blocked', 'paused'];

  var state = null;
  var ui = { floorId: 'f5', staffId: null, tab: 'status', approvalFilter: 'all', options: {}, draft: null };

  /* ---------- 작은 도구들 ---------- */

  function n(v) { return Math.round(v * 10) / 10; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function hex2rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function rgb2hex(a) {
    return '#' + a.map(function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length < 2 ? '0' + s : s;
    }).join('');
  }
  function mix(a, b, t) {
    var A = hex2rgb(a), B = hex2rgb(b);
    return rgb2hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
  }
  function tint(h, t) { return mix(h, '#ffffff', t); }
  function shade(h, t) { return mix(h, '#1a1f33', t); }
  function matOf(hex) {
    return { top: tint(hex, 0.82), right: shade(hex, 0.18), left: tint(hex, 0.55), stroke: shade(hex, 0.34) };
  }

  var DESK = matOf('#e8cba8');
  var WHITE = matOf('#e9edf5');
  var METAL = matOf('#dde3ee');
  var DARK = { top: '#5b6584', right: '#2c3448', left: '#3d465e', stroke: '#232a3c' };
  var BOOKS = ['#f3b7c4', '#bcd0f7', '#bfe6d5', '#f7dcae', '#d7c8f5', '#a8dcef'];

  /* ---------- 등각 투영 기하 ---------- */

  function P(x, y, z) {
    return [(x - y) * C30 * U, (x + y) * S30 * U - (z || 0) * U];
  }
  function poly(pts, fill, extra) {
    var d = 'M';
    for (var i = 0; i < pts.length; i++) {
      var p = (pts[i].length === 3) ? P(pts[i][0], pts[i][1], pts[i][2]) : pts[i];
      d += (i ? 'L' : '') + n(p[0]) + ' ' + n(p[1]);
    }
    return '<path d="' + d + 'Z" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function L3(a, b, color, w, op) {
    var A = P(a[0], a[1], a[2]), B = P(b[0], b[1], b[2]);
    return '<path d="M' + n(A[0]) + ' ' + n(A[1]) + 'L' + n(B[0]) + ' ' + n(B[1]) +
      '" stroke="' + color + '" stroke-width="' + w + '" fill="none"' +
      (op ? ' opacity="' + op + '"' : '') + ' stroke-linecap="round"/>';
  }
  function box(x, y, z, w, d, h, mat, extra) {
    var top = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
    var right = [[x + w, y, z + h], [x + w, y + d, z + h], [x + w, y + d, z], [x + w, y, z]];
    var left = [[x, y + d, z + h], [x + w, y + d, z + h], [x + w, y + d, z], [x, y + d, z]];
    return poly(left, mat.left, extra) + poly(right, mat.right) +
      poly(top, mat.top, ' stroke="' + mat.stroke + '" stroke-width="0.8"' + (extra || ''));
  }
  function faceQuad(x0, x1, y, z0, z1, fill, extra) {
    return poly([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], fill, extra);
  }
  function backPanel(from, to, z0, z1, fill, stroke, extra) {
    return poly([[from, 0, z0], [to, 0, z0], [to, 0, z1], [from, 0, z1]], fill,
      ' stroke="' + stroke + '" stroke-width="1.4"' + (extra || ''));
  }
  function westPanel(y0, y1, z0, z1, fill, stroke, extra) {
    return poly([[0, y0, z0], [0, y1, z0], [0, y1, z1], [0, y0, z1]], fill,
      ' stroke="' + stroke + '" stroke-width="1.4"' + (extra || ''));
  }

  /* ---------- 벽 · 바닥 ---------- */

  function slabAndWalls(theme) {
    var acc = theme.accent, fcol = theme.floor;
    var s = '';
    var c = P(GRID.w / 2, GRID.d / 2, 0);
    s += '<ellipse cx="' + n(c[0]) + '" cy="' + n(c[1] + SLAB * U) + '" rx="' + n((GRID.w + GRID.d) * C30 * U * 0.42) +
      '" ry="' + n((GRID.w + GRID.d) * S30 * U * 0.36) + '" fill="#28324c" opacity="0.07" filter="url(#soft)"/>';

    /* 바닥 두께 */
    s += poly([[0, GRID.d, 0], [GRID.w, GRID.d, 0], [GRID.w, GRID.d, -SLAB], [0, GRID.d, -SLAB]], shade(fcol, 0.14));
    s += poly([[GRID.w, 0, 0], [GRID.w, GRID.d, 0], [GRID.w, GRID.d, -SLAB], [GRID.w, 0, -SLAB]], shade(fcol, 0.24));
    /* 바닥 */
    s += poly([[0, 0, 0], [GRID.w, 0, 0], [GRID.w, GRID.d, 0], [0, GRID.d, 0]], shade(fcol, 0.085));
    s += poly([[0, 0, 0], [GRID.w, 0, 0], [GRID.w, GRID.d, 0], [0, GRID.d, 0]], 'none',
      ' stroke="' + shade(fcol, 0.26) + '" stroke-width="1.2"');

    /* 벽 */
    s += poly([[0, 0, 0], [GRID.w, 0, 0], [GRID.w, 0, WALL_H], [0, 0, WALL_H]], tint(acc, 0.93));
    s += poly([[0, 0, 0], [0, GRID.d, 0], [0, GRID.d, WALL_H], [0, 0, WALL_H]], tint(acc, 0.86));
    s += poly([[0, 0, 0.26], [GRID.w, 0, 0.26], [GRID.w, 0, 1.15], [0, 0, 1.15]], tint(acc, 0.86), ' opacity="0.5"');
    s += poly([[0, 0, 0.26], [0, GRID.d, 0.26], [0, GRID.d, 1.15], [0, 0, 1.15]], tint(acc, 0.8), ' opacity="0.5"');

    /* 걸레받이 */
    s += poly([[0, 0, 0], [GRID.w, 0, 0], [GRID.w, 0, 0.26], [0, 0, 0.26]], tint(acc, 0.7));
    s += poly([[0, 0, 0], [0, GRID.d, 0], [0, GRID.d, 0.26], [0, 0, 0.26]], tint(acc, 0.62));

    /* 벽 상단 모서리 */
    s += L3([0, 0, WALL_H], [GRID.w, 0, WALL_H], shade(acc, 0.1), 2, 0.22);
    s += L3([0, 0, WALL_H], [0, GRID.d, WALL_H], shade(acc, 0.1), 2, 0.16);
    s += L3([0, 0, 0], [0, 0, WALL_H], tint(acc, 0.5), 2, 0.7);
    return s;
  }

  /* ---------- 벽에 붙는 것들 ---------- */

  function windowBack(from, to, z0, z1, acc) {
    var s = backPanel(from, to, z0, z1, '#eaf5ff', tint(acc, 0.58));
    s += backPanel(from + 0.08, to - 0.08, z0 + 0.1, z0 + (z1 - z0) * 0.42, '#f8fcff', '#f8fcff', ' opacity="0.85"');
    var mid = (from + to) / 2, hz = (z0 + z1) / 2;
    s += L3([mid, 0, z0], [mid, 0, z1], tint(acc, 0.6), 1.2, 0.9);
    s += L3([from, 0, hz], [to, 0, hz], tint(acc, 0.6), 1.2, 0.9);
    s += poly([[from - 0.12, 0, z0], [to + 0.12, 0, z0], [to + 0.12, 0, z0 - 0.1], [from - 0.12, 0, z0 - 0.1]], tint(acc, 0.7));
    return s;
  }

  function wallScreen(from, to, z0, z1, acc) {
    var s = backPanel(from, to, z0, z1, '#22304a', '#1a2537');
    var pts = [[from + 0.35, z0 + 0.35], [from + 1.15, z0 + 0.95], [from + 1.95, z0 + 0.6],
               [from + 2.75, z0 + 1.15], [from + 3.55, z0 + 0.9]];
    var d = 'M';
    for (var i = 0; i < pts.length; i++) {
      var p = P(pts[i][0], 0, pts[i][1]);
      d += (i ? 'L' : '') + n(p[0]) + ' ' + n(p[1]);
    }
    s += '<path d="' + d + '" stroke="#5fd8b4" stroke-width="2" fill="none" stroke-linejoin="round"/>';
    s += poly([[from + 0.4, 0, z0 + 0.25], [from + 0.7, 0, z0 + 0.25], [from + 0.7, 0, z0 + 0.7], [from + 0.4, 0, z0 + 0.7]], '#4f8ef7', ' opacity="0.55"');
    s += poly([[from + 0.85, 0, z0 + 0.25], [from + 1.15, 0, z0 + 0.25], [from + 1.15, 0, z0 + 0.5], [from + 0.85, 0, z0 + 0.5]], '#e8657f', ' opacity="0.55"');
    s += backPanel(from + 0.25, to - 0.3, z0 + 1.55, z0 + 1.62, tint(acc, 0.7), tint(acc, 0.7), ' opacity="0.6"');
    return s;
  }

  function boardWest(y0, y1, z0, z1, acc) {
    var s = westPanel(y0, y1, z0, z1, '#ffffff', tint(acc, 0.55));
    var notes = [[y0 + 0.25, 0.25, '#f9dca8'], [y0 + 0.85, 0.3, '#c6dcf9'], [y0 + 0.25, 0.95, '#c9ecd8'], [y0 + 0.85, 1.0, '#f8c9d6']];
    for (var i = 0; i < notes.length; i++) {
      var ny = notes[i][0], nz = z0 + 0.2 + notes[i][1];
      s += poly([[0, ny, nz], [0, ny + 0.45, nz], [0, ny + 0.45, nz + 0.45], [0, ny, nz + 0.45]], notes[i][2], ' opacity="0.95"');
    }
    return s;
  }

  function whiteboardBack(from, to, z0, z1, acc) {
    var s = backPanel(from, to, z0, z1, '#ffffff', tint(acc, 0.5));
    s += L3([from + 0.3, 0, z1 - 0.35], [to - 0.6, 0, z1 - 0.35], tint(acc, 0.45), 1.6, 0.85);
    s += L3([from + 0.3, 0, z1 - 0.65], [to - 1.1, 0, z1 - 0.65], tint(acc, 0.55), 1.6, 0.8);
    s += L3([from + 0.3, 0, z1 - 0.95], [from + 1.8, 0, z1 - 0.95], tint(acc, 0.65), 1.6, 0.7);
    s += poly([[from + 0.35, 0, z0 + 0.3], [from + 1.15, 0, z0 + 0.3], [from + 1.15, 0, z0 + 0.85], [from + 0.35, 0, z0 + 0.85]], tint(acc, 0.6), ' opacity="0.45"');
    return s;
  }

  /* ---------- 가구 ---------- */

  function fRug(p, theme) {
    var s = poly([[p.x, p.y, 0.02], [p.x + p.w, p.y, 0.02], [p.x + p.w, p.y + p.d, 0.02], [p.x, p.y + p.d, 0.02]], tint(theme.accent, 0.84));
    var i0 = 0.35;
    s += poly([[p.x + i0, p.y + i0, 0.025], [p.x + p.w - i0, p.y + i0, 0.025],
               [p.x + p.w - i0, p.y + p.d - i0, 0.025], [p.x + i0, p.y + p.d - i0, 0.025]], 'none',
      ' stroke="' + theme.accent + '" stroke-width="1.2" stroke-dasharray="7 5" opacity="0.28"');
    return { d: -2, s: s };
  }

  function fShelf(p, theme) {
    var h = p.h || 2.2, s = box(p.x, p.y, 0, p.w, p.d, h, WHITE);
    var yf = p.y + p.d + 0.01;
    for (var k = 1; k <= 3; k++) {
      var z = h * k / 4;
      s += faceQuad(p.x + 0.06, p.x + p.w - 0.06, yf, z - 0.05, z, tint(theme.accent, 0.72));
      var bx = p.x + 0.14;
      var cnt = 0;
      while (bx < p.x + p.w - 0.3 && cnt < 5) {
        var bw = 0.13 + ((cnt * 7 + k * 3) % 4) * 0.02;
        s += faceQuad(bx, bx + bw, yf, z + ((cnt % 2) ? 0.1 : 0.05), z + 0.4, BOOKS[(cnt + k) % BOOKS.length], ' opacity="0.9"');
        bx += bw + 0.05;
        cnt++;
      }
    }
    return { d: p.x + p.w + p.y + p.d, s: s };
  }

  function fPlant(p, theme) {
    var k = p.s || 1;
    var s = box(p.x, p.y, 0, 0.6, 0.6, 0.42, matOf('#e3b98f'));
    var c = P(p.x + 0.3, p.y + 0.3, 0.42);
    s += '<circle cx="' + n(c[0] - 6 * k) + '" cy="' + n(c[1] - 9 * k) + '" r="' + n(9 * k) + '" fill="#8fd3a8"/>';
    s += '<circle cx="' + n(c[0] + 6 * k) + '" cy="' + n(c[1] - 7 * k) + '" r="' + n(8 * k) + '" fill="#a7e0bc"/>';
    s += '<circle cx="' + n(c[0]) + '" cy="' + n(c[1] - 15 * k) + '" r="' + n(8.5 * k) + '" fill="#74c193"/>';
    return { d: p.x + 0.6 + p.y + 0.6, s: s };
  }

  function fSofa(p, theme) {
    var m = matOf(tint(theme.accent, 0.68));
    var s = box(p.x, p.y, 0, p.w, 0.42, 0.98, m);
    s += box(p.x, p.y + 0.42, 0, p.w, p.d - 0.42, 0.46, m);
    s += box(p.x, p.y, 0, 0.28, p.d, 0.7, m);
    s += box(p.x + p.w - 0.28, p.y, 0, 0.28, p.d, 0.7, m);
    var cm = matOf(tint(theme.accent, 0.34));
    s += box(p.x + 0.5, p.y + 0.5, 0.46, 0.75, 0.5, 0.2, cm);
    s += box(p.x + p.w - 1.25, p.y + 0.5, 0.46, 0.75, 0.5, 0.2, cm);
    return { d: p.x + p.w + p.y + p.d, s: s };
  }

  function fTable(p, theme) {
    var h = p.h || 0.45;
    var s = box(p.x + 0.2, p.y + 0.2, 0, p.w - 0.4, p.d - 0.4, h - 0.12, METAL);
    s += box(p.x, p.y, h - 0.12, p.w, p.d, 0.12, matOf('#f2e2cf'));
    return { d: p.x + p.w + p.y + p.d, s: s };
  }

  function fChair(p, theme) {
    var m = matOf(theme.accent);
    var s = box(p.x + 0.1, p.y + 0.1, 0, 0.62, 0.62, 0.44, METAL);
    s += box(p.x + 0.08, p.y + 0.05, 0.44, 0.66, 0.14, 0.5, m);
    return { d: p.x + 0.7 + p.y + 0.7, s: s };
  }

  function fBoxes(p, theme) {
    var s = '', k = p.n || 2;
    var m = matOf('#dcc39f');
    for (var i = 0; i < k; i++) {
      var ox = (i % 2) * 0.12, oy = (i % 3) * 0.1;
      s += box(p.x + ox, p.y + oy, i * 0.5, 0.95, 0.85, 0.48, m);
      s += faceQuad(p.x + ox + 0.42, p.x + ox + 0.53, p.y + oy + 0.855, i * 0.5 + 0.02, i * 0.5 + 0.44, '#f7f2e6', ' opacity="0.9"');
    }
    return { d: p.x + 1.4 + p.y + 1.2, s: s };
  }

  function fDogbed(p, theme) {
    var m = matOf(tint(theme.accent, 0.4));
    var s = box(p.x, p.y, 0, p.w, p.d, 0.22, m);
    s += box(p.x + 0.18, p.y + 0.16, 0.22, p.w - 0.36, p.d - 0.32, 0.12, matOf(tint(theme.accent, 0.72)));
    return { d: p.x + p.w + p.y + p.d, s: s };
  }

  function fPartition(p, theme) {
    var s = box(p.x, p.y, 0, p.w, p.d, 1.1, matOf(theme.accent));
    s += box(p.x, p.y, 1.1, p.w, p.d, 1.2, { top: '#e9f4ff', right: '#cfe2f4', left: '#dfeefb', stroke: '#c3d6ea' }, ' opacity="0.55"');
    return { d: p.x + p.w + p.y + p.d, s: s };
  }

  function fTripod(p, theme) {
    var s = box(p.x, p.y, 0, 0.13, 0.13, 1.5, METAL);
    s += box(p.x - 0.34, p.y - 0.1, 1.5, 0.72, 0.2, 0.92, matOf('#f6f3ec'));
    s += faceQuad(p.x - 0.28, p.x + 0.32, p.y + 0.11, 1.56, 2.34, '#fff6d6');
    var c = P(p.x + 0.03, p.y + 0.1, 1.95);
    s += '<circle cx="' + n(c[0]) + '" cy="' + n(c[1]) + '" r="13" fill="#ffe9a8" opacity="0.35"/>';
    return { d: p.x + 0.5 + p.y + 0.5, s: s };
  }

  function fLamp(p, theme) {
    var s = box(p.x, p.y, 0, 0.34, 0.34, 0.07, METAL);
    s += box(p.x + 0.11, p.y + 0.11, 0.07, 0.12, 0.12, 1.0, METAL);
    s += box(p.x - 0.16, p.y - 0.16, 1.07, 0.66, 0.66, 0.26, matOf(tint(theme.accent, 0.34)));
    var c = P(p.x + 0.17, p.y + 0.17, 1.0);
    s += '<circle cx="' + n(c[0]) + '" cy="' + n(c[1]) + '" r="19" fill="#fff0c9" opacity="0.35"/>';
    return { d: p.x + 0.3 + p.y + 0.3, s: s };
  }

  function fCooler(p, theme) {
    var s = box(p.x, p.y, 0, 0.62, 0.62, 1.0, WHITE);
    s += box(p.x + 0.1, p.y + 0.1, 1.0, 0.42, 0.42, 0.55, matOf('#bcdff2'));
    s += faceQuad(p.x + 0.55, p.x + 0.62, p.y + 0.35, 0.55, 0.75, tint(theme.accent, 0.5));
    return { d: p.x + 0.62 + p.y + 0.62, s: s };
  }

  function fDesk(p, theme) {
    var s = box(p.x, p.y, 0, p.w, p.d, 0.72, DESK);
    s += box(p.x + 0.18, p.y + p.d - 0.58, 0.72, 0.52, 0.34, 0.05, matOf('#ffffff'));
    s += box(p.x + p.w - 0.52, p.y + 0.22, 0.72, 0.26, 0.26, 0.26, matOf(theme.accent));
    return { d: p.x + p.w + p.y + p.d, s: s };
  }

  function fNameplate(p, theme) {
    var s = box(p.x, p.y, 0, 1.4, 0.42, 0.1, matOf('#f0e6d8'));
    var c = P(p.x + 0.7, p.y + 0.42, 0.1);
    s += '<g><rect x="' + n(c[0] - 34) + '" y="' + n(c[1] - 26) + '" width="68" height="17" rx="8.5" fill="#fff" opacity="0.9"/>' +
      '<text x="' + n(c[0]) + '" y="' + n(c[1] - 14) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#8a8397">' +
      esc(p.text || '') + '</text></g>';
    return { d: p.x + 1.4 + p.y + 0.42, s: s };
  }

  var FURNITURE = {
    rug: fRug, shelf: fShelf, plant: fPlant, sofa: fSofa, table: fTable, desk: fDesk,
    chair: fChair, boxes: fBoxes, dogbed: fDogbed, partition: fPartition,
    tripod: fTripod, lamp: fLamp, cooler: fCooler, nameplate: fNameplate
  };

  /* ---------- 책상 · 모니터 ---------- */

  function monitor(cx, cy, z, w) {
    var x = cx - w / 2, y = cy - 0.04;
    var s = box(cx - 0.09, cy - 0.02, z, 0.18, 0.18, 0.22, METAL);
    var h = w * 0.62;
    s += box(x, y, z + 0.2, w, 0.13, h, DARK);
    var yf = y + 0.14, zt = z + 0.2 + h;
    s += faceQuad(x + 0.07, x + w - 0.07, yf, z + 0.27, zt - 0.06, '#bcd3f7');
    s += L3([x + 0.16, yf, zt - 0.16], [x + w - 0.2, yf, zt - 0.16], '#ffffff', 1.6, 0.8);
    s += L3([x + 0.16, yf, zt - 0.28], [x + w - 0.42, yf, zt - 0.28], '#ffffff', 1.6, 0.55);
    return s;
  }

  function laptop(cx, cy, z) {
    var x = cx - 0.55, y = cy - 0.3;
    var s = box(x, y, z, 1.1, 0.85, 0.08, METAL);
    s += box(x + 0.06, y + 0.72, z, 1.0, 0.1, 0.62, DARK);
    s += faceQuad(x + 0.12, x + 0.94, y + 0.83, z + 0.1, z + 0.56, '#c3d8f8');
    return s;
  }

  function deskGroup(m, theme) {
    if (!m.desk) { return { d: 0, s: '' }; }
    var dk = m.desk, s = '';
    var ghost = m.placeholder
      ? poly([[dk.x, dk.y, 0.72], [dk.x + dk.w, dk.y, 0.72], [dk.x + dk.w, dk.y + dk.d, 0.72], [dk.x, dk.y + dk.d, 0.72]],
             'none', ' stroke="' + shade(theme.accent, 0.2) + '" stroke-width="1.6" stroke-dasharray="6 5"')
      : '';
    s += box(dk.x, dk.y, 0, dk.w, dk.d, 0.72, DESK, m.placeholder ? ' opacity="0.75"' : '');
    s += ghost;
    var cx = dk.x + dk.w / 2, cy = dk.y + 0.2;
    if (m.id === 'market') {
      s += monitor(cx - 0.55, cy, 0.72, 0.9);
      s += monitor(cx + 0.55, cy, 0.72, 0.9);
    } else if (m.id === 'adsense' || m.id === 'branch') {
      s += laptop(cx, cy + 0.1, 0.72);
    } else if (m.avatar === 'chief') {
      s += monitor(cx, cy, 0.72, 1.1);
    } else {
      s += monitor(cx, cy, 0.72, 0.95);
    }
    /* 서류 · 머그 */
    s += box(dk.x + 0.14, dk.y + dk.d - 0.52, 0.72, 0.44, 0.32, 0.05, matOf('#ffffff'));
    s += box(dk.x + dk.w - 0.42, dk.y + dk.d - 0.44, 0.72, 0.24, 0.24, 0.24, matOf(theme.accent));
    return { d: dk.x + dk.w + dk.y + dk.d, s: s };
  }

  /* ---------- 캐릭터 ---------- */

  function bodyPath(cx, cy, fill, extra) {
    var d = 'M' + n(cx - 9) + ' ' + n(cy - 4) +
      ' L' + n(cx - 7.5) + ' ' + n(cy - 25) +
      ' Q' + n(cx) + ' ' + n(cy - 31) + ' ' + n(cx + 7.5) + ' ' + n(cy - 25) +
      ' L' + n(cx + 9) + ' ' + n(cy - 4) +
      ' Q' + n(cx) + ' ' + n(cy + 1) + ' ' + n(cx - 9) + ' ' + n(cy - 4) + 'Z';
    return '<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>';
  }

  function characterSVG(m, theme, selected) {
    var st = STATUS[m.status] || STATUS.waiting;
    var acc = theme.accent;
    var body = m.color || acc;
    var p = P(m.stand.x, m.stand.y, 0);
    var cx = p[0], cy = p[1];
    var hair = m.hair || '#4a3f3c';
    var g = '<g class="member avatar-' + (m.avatar || 'person') +
      (selected ? ' is-selected' : '') + (m.placeholder ? ' is-ghost' : '') +
      '" data-staff="' + esc(m.id) + '" tabindex="0" role="button" aria-label="' + esc(m.name) + ' ' + esc(st.label) + '">';
    g += '<title>' + esc(m.name) + ' · ' + esc(st.label) + '</title>';
    g += '<ellipse cx="' + n(cx) + '" cy="' + n(cy) + '" rx="16" ry="7" fill="#202a45" opacity="0.14"/>';
    if (selected) {
      g += '<ellipse cx="' + n(cx) + '" cy="' + n(cy) + '" rx="23" ry="10.5" fill="none" stroke="' + acc +
        '" stroke-width="2" stroke-dasharray="5 4" opacity="0.9"/>';
    }
    g += '<g class="figure">';

    if (m.avatar === 'dog') {
      g += '<path d="M' + n(cx + 12) + ' ' + n(cy - 13) + ' q 9 -3 7 -11" stroke="#e2c9ae" stroke-width="3" fill="none" stroke-linecap="round"/>';
      g += '<ellipse cx="' + n(cx) + '" cy="' + n(cy - 11) + '" rx="13" ry="9" fill="#fff8ee" stroke="#e6d3bd" stroke-width="1.4"/>';
      g += '<circle cx="' + n(cx + 10) + '" cy="' + n(cy - 20) + '" r="8.5" fill="#fff8ee" stroke="#e6d3bd" stroke-width="1.4"/>';
      g += '<ellipse cx="' + n(cx + 4) + '" cy="' + n(cy - 27) + '" rx="3.4" ry="4.4" fill="#e8cbb0"/>';
      g += '<ellipse cx="' + n(cx + 15) + '" cy="' + n(cy - 26) + '" rx="3.4" ry="4.4" fill="#e8cbb0"/>';
      g += '<circle cx="' + n(cx + 8) + '" cy="' + n(cy - 21) + '" r="1.4" fill="#4a3f3c"/>';
      g += '<circle cx="' + n(cx + 13) + '" cy="' + n(cy - 21) + '" r="1.4" fill="#4a3f3c"/>';
      g += '<circle cx="' + n(cx + 10.5) + '" cy="' + n(cy - 17) + '" r="1.6" fill="#6b5a4d"/>';
    } else if (m.avatar === 'chief') {
      g += bodyPath(cx, cy, body, ' opacity="0.95"');
      g += '<circle cx="' + n(cx) + '" cy="' + n(cy - 41) + '" r="12.5" fill="#ffffff" stroke="' + body + '" stroke-width="2.2"/>';
      g += '<text x="' + n(cx) + '" y="' + n(cy - 36) + '" text-anchor="middle" font-size="14" font-weight="800" fill="' + body + '">ㅊ</text>';
      g += '<path d="M' + n(cx) + ' ' + n(cy - 53) + ' L' + n(cx) + ' ' + n(cy - 61) + '" stroke="' + body + '" stroke-width="1.8"/>';
      g += '<circle cx="' + n(cx) + '" cy="' + n(cy - 63) + '" r="3.2" fill="' + body + '"/>';
      g += '<circle cx="' + n(cx - 4.5) + '" cy="' + n(cy - 38) + '" r="1.5" fill="#4a3f3c"/>';
      g += '<circle cx="' + n(cx + 4.5) + '" cy="' + n(cy - 38) + '" r="1.5" fill="#4a3f3c"/>';
    } else if (m.avatar === 'ghost') {
      g += bodyPath(cx, cy, '#ffffff', ' opacity="0.65" stroke="' + acc + '" stroke-width="1.4" stroke-dasharray="5 4"');
      g += '<circle cx="' + n(cx) + '" cy="' + n(cy - 41) + '" r="11.5" fill="#ffffff" opacity="0.75" stroke="' + acc +
        '" stroke-width="1.4" stroke-dasharray="5 4"/>';
      g += '<text x="' + n(cx) + '" y="' + n(cy - 37) + '" text-anchor="middle" font-size="13" font-weight="700" fill="' + shade(acc, 0.1) + '">?</text>';
    } else {
      g += bodyPath(cx, cy, body, ' opacity="0.95"');
      g += '<circle cx="' + n(cx) + '" cy="' + n(cy - 41) + '" r="11.5" fill="#ffe3d3" stroke="#e8c2ad" stroke-width="1.2"/>';
      g += '<path d="M' + n(cx - 11.5) + ' ' + n(cy - 41) + ' a 11.5 11.5 0 0 1 23 0 z" fill="' + hair + '"/>';
      g += '<circle cx="' + n(cx - 4.2) + '" cy="' + n(cy - 39) + '" r="1.5" fill="#3a3346"/>';
      g += '<circle cx="' + n(cx + 4.2) + '" cy="' + n(cy - 39) + '" r="1.5" fill="#3a3346"/>';
      g += '<path d="M' + n(cx - 3) + ' ' + n(cy - 34.5) + ' q 3 2.6 6 0" stroke="#c98a7a" stroke-width="1.3" fill="none" stroke-linecap="round"/>';
      g += '<ellipse cx="' + n(cx - 7.5) + '" cy="' + n(cy - 36) + '" rx="2.4" ry="1.6" fill="#f6b3b3" opacity="0.55"/>';
      g += '<ellipse cx="' + n(cx + 7.5) + '" cy="' + n(cy - 36) + '" rx="2.4" ry="1.6" fill="#f6b3b3" opacity="0.55"/>';
    }
    g += '</g>';

    /* 상태 점 */
    g += '<circle cx="' + n(cx + 13) + '" cy="' + n(cy - 50) + '" r="6.6" fill="#ffffff"/>';
    g += '<circle class="dot" cx="' + n(cx + 13) + '" cy="' + n(cy - 50) + '" r="4.6" fill="' + st.color + '"/>';

    /* 이름표 */
    var label = m.placeholder ? '연동 준비중' : (m.pill || m.name);
    var w = Math.max(34, label.length * 10 + 14);
    g += '<rect x="' + n(cx - w / 2) + '" y="' + n(cy + 11) + '" width="' + w + '" height="17" rx="8.5" fill="#ffffff" opacity="0.95" stroke="' +
      tint(acc, 0.5) + '" stroke-width="1"/>';
    g += '<text x="' + n(cx) + '" y="' + n(cy + 23) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#3b3752">' +
      esc(label) + '</text>';

    g += '</g>';
    return g;
  }

  /* ---------- 방 라벨 ---------- */

  function roomLabel(l, theme) {
    var p = P(l.x, l.y, 0);
    var w = Math.max(50, l.text.length * 11 + 18);
    return '<g class="room-label" transform="translate(' + n(p[0]) + ',' + n(p[1]) + ')">' +
      '<path d="M0 -8L0 -34" stroke="' + theme.accent + '" stroke-width="1" opacity="0.4" stroke-dasharray="3 3" fill="none"/>' +
      '<circle cx="0" cy="0" r="3" fill="' + theme.accent + '" opacity="0.6"/>' +
      '<rect x="' + n(-w / 2) + '" y="-56" width="' + w + '" height="19" rx="9.5" fill="#ffffff" opacity="0.97" stroke="' +
      tint(theme.accent, 0.55) + '" stroke-width="1"/>' +
      '<text x="0" y="-42.5" text-anchor="middle" font-size="10.5" font-weight="700" letter-spacing="0.4" fill="' +
      shade(theme.accent, 0.2) + '">' + esc(l.text) + '</text></g>';
  }

  /* ---------- 층 하나 그리기 ---------- */

  function buildFloorSVG(floor, selectedId) {
    if (!floor) { return ''; }
    var theme = floor.theme || { accent: '#6f86d8', soft: '#eef1fb', floor: '#f7f8fc' };
    var acc = theme.accent;

    var defs = '<defs>' +
      '<filter id="soft" x="-30%" y="-30%" width="160%" height="160%">' +
      '<feGaussianBlur stdDeviation="10"/></filter></defs>';

    var out = defs + slabAndWalls(theme);

    /* 벽에 붙는 것 */
    var fur = floor.furniture || [];
    for (var i = 0; i < fur.length; i++) {
      var f = fur[i];
      if (f.t === 'window') { out += windowBack(f.from, f.to, f.z0 || 1.0, f.z1 || 2.5, acc); }
      else if (f.t === 'screen') { out += wallScreen(f.from, f.to, f.z0 || 0.9, f.z1 || 2.4, acc); }
      else if (f.t === 'board') { out += boardWest(f.y0, f.y1, f.z0 || 1.1, f.z1 || 2.4, acc); }
      else if (f.t === 'whiteboard') { out += whiteboardBack(f.from, f.to, f.z0 || 1.0, f.z1 || 2.4, acc); }
    }

    /* 가구 + 사람 (깊이 순) */
    var items = [];
    for (var j = 0; j < fur.length; j++) {
      var fn = FURNITURE[fur[j].t];
      if (fn) { items.push(fn(fur[j], theme)); }
    }
    var staff = floor.staff || [];
    for (var k = 0; k < staff.length; k++) {
      items.push(deskGroup(staff[k], theme));
    }
    for (var q = 0; q < staff.length; q++) {
      var m = staff[q];
      var svg = characterSVG(m, theme, m.id === selectedId);
      items.push({ d: m.stand.x + m.stand.y + 1.2, s: svg });
    }
    items.sort(function (a, b) { return a.d - b.d; });
    for (var r = 0; r < items.length; r++) { out += items[r].s; }

    /* 방 라벨 */
    var labels = floor.labels || [];
    for (var t = 0; t < labels.length; t++) { out += roomLabel(labels[t], theme); }

    var minX = -GRID.d * C30 * U - 42;
    var maxX = GRID.w * C30 * U + 42;
    var minY = -WALL_H * U - 34;
    var maxY = (GRID.w + GRID.d) * S30 * U + SLAB * U + 52;
    var vb = n(minX) + ' ' + n(minY) + ' ' + n(maxX - minX) + ' ' + n(maxY - minY);

    return '<svg class="office-svg" viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" ' +
      'role="group" aria-label="' + esc(floor.level + ' ' + floor.name) + ' 사무실 지도">' + out + '</svg>';
  }

  /* ---------- 상태 계산 ---------- */

  function counts() {
    var c = { work: 0, wait: 0, block: 0, approval: 0, staff: 0 };
    if (!state) { return c; }
    var floors = state.floors || [];
    for (var i = 0; i < floors.length; i++) {
      var st = floors[i].staff || [];
      for (var j = 0; j < st.length; j++) {
        var meta = STATUS[st[j].status] || STATUS.waiting;
        c.staff++;
        if (meta.bucket === 'work') { c.work++; }
        else if (meta.bucket === 'wait') { c.wait++; }
        else if (meta.bucket === 'block') { c.block++; }
      }
    }
    c.approval = (state.approvals || []).length;
    return c;
  }

  function currentFloor() {
    if (!state) { return null; }
    var floors = state.floors || [];
    for (var i = 0; i < floors.length; i++) {
      if (floors[i].id === ui.floorId) { return floors[i]; }
    }
    return floors[0] || null;
  }

  function findStaff(floor, id) {
    if (!floor || !id) { return null; }
    var st = floor.staff || [];
    for (var i = 0; i < st.length; i++) { if (st[i].id === id) { return st[i]; } }
    return null;
  }

  function chip(status, text) {
    var m = STATUS[status] || STATUS.waiting;
    return '<span class="chip" style="color:' + m.color + ';background:' + m.soft + '">' +
      '<i style="background:' + m.color + '"></i>' + esc(text || m.label) + '</span>';
  }

  /* ---------- 화면 그리기 ---------- */

  function render() {
    if (!state) { return; }
    var c = counts();
    document.getElementById('counts').innerHTML =
      '<span class="count"><i class="c-work"></i>작업 <b>' + c.work + '</b></span>' +
      '<span class="count"><i class="c-wait"></i>대기 <b>' + c.wait + '</b></span>' +
      '<span class="count"><i class="c-block"></i>막힘 <b>' + c.block + '</b></span>' +
      '<span class="count"><i class="c-appr"></i>결재 <b>' + c.approval + '</b></span>';
    document.getElementById('tabApprovalCount').textContent = String(c.approval);
    renderFloorList();
    renderStage();
    renderPanel();
  }

  function renderFloorList() {
    var floors = state.floors || [];
    var html = '';
    for (var i = 0; i < floors.length; i++) {
      var f = floors[i];
      var block = 0, appr = 0;
      var st = f.staff || [];
      for (var j = 0; j < st.length; j++) {
        if (st[j].status === 'blocked') { block++; }
        if (st[j].status === 'approval') { appr++; }
      }
      var apr = state.approvals || [];
      for (var k = 0; k < apr.length; k++) { if (apr[k].floorId === f.id) { appr++; } }
      html += '<button class="floor-item' + (f.id === ui.floorId ? ' is-active' : '') + '" data-floor="' + f.id +
        '" type="button" style="--acc:' + f.theme.accent + ';--soft:' + f.theme.soft + '">' +
        '<span class="fi-level">' + esc(f.level) + '</span>' +
        '<span class="fi-body"><span class="fi-name">' + esc(f.name) + '</span>' +
        '<span class="fi-role">' + esc(f.role) + '</span></span>' +
        '<span class="fi-badges">' +
        (block ? '<span class="mini mini-block" title="막힘">' + block + '</span>' : '') +
        (appr ? '<span class="mini mini-appr" title="결재·요청">' + appr + '</span>' : '') +
        '</span></button>';
    }
    document.getElementById('floorList').innerHTML = html;

    var f2 = currentFloor();
    if (!f2) { return; }
    var staff = f2.staff || [];
    var work = 0, wait = 0, block = 0;
    for (var a = 0; a < staff.length; a++) {
      var b = (STATUS[staff[a].status] || STATUS.waiting).bucket;
      if (b === 'work') { work++; } else if (b === 'wait') { wait++; } else if (b === 'block') { block++; }
    }
    var routines = 0;
    for (var d = 0; d < staff.length; d++) { routines += (staff[d].routines || []).length; }
    document.getElementById('floorCard').innerHTML =
      '<div class="fc-head" style="--acc:' + f2.theme.accent + '">' +
      '<span class="fc-lev">' + esc(f2.level) + '</span>' +
      '<b>' + esc(f2.name) + '</b></div>' +
      '<p class="fc-sum">' + esc(f2.summary) + '</p>' +
      '<div class="fc-grid">' +
      '<span><b>' + staff.length + '</b>담당</span>' +
      '<span><b>' + routines + '</b>루틴</span>' +
      '<span><b>' + work + '</b>작업</span>' +
      '<span><b>' + wait + '</b>대기</span>' +
      (block ? '<span class="danger"><b>' + block + '</b>막힘</span>' : '') +
      '</div>';
  }

  function renderStage() {
    var f = currentFloor();
    if (!f) { return; }
    document.getElementById('stageLevel').textContent = f.level;
    document.getElementById('stageName').textContent = f.name;
    document.getElementById('stageLine').textContent = f.today || '';
    var html = '';
    for (var i = 0; i < STATUS_ORDER.length; i++) {
      var m = STATUS[STATUS_ORDER[i]];
      html += '<span class="lg"><i style="background:' + m.color + '"></i>' + m.label + '</span>';
    }
    document.getElementById('legend').innerHTML = html;
    document.getElementById('mapCanvas').innerHTML = buildFloorSVG(f, ui.staffId);
    var cb = document.getElementById('clearSelect');
    if (cb) { cb.hidden = !ui.staffId; }
    document.getElementById('footSource').textContent =
      (state.site.title || 'AI 오피스') + ' · ' + (state.updatedSource || '');
  }

  function renderPanel(keepScroll) {
    var body = document.getElementById('panelBody');
    if (!state) { return; }
    var prevTop = (keepScroll && body) ? body.scrollTop : 0;
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-tab') === ui.tab;
      tabs[i].classList.toggle('is-active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    if (ui.tab === 'approvals') { body.innerHTML = panelApprovals(); }
    else if (ui.tab === 'draft') { body.innerHTML = panelDraft(); }
    else { body.innerHTML = panelStatus(); }
    body.scrollTop = prevTop;
  }

  function statRow(f) {
    var staff = f.staff || [], work = 0, wait = 0, block = 0, routines = 0, appr = 0;
    for (var i = 0; i < staff.length; i++) {
      var b = (STATUS[staff[i].status] || STATUS.waiting).bucket;
      if (b === 'work') { work++; } else if (b === 'wait') { wait++; } else if (b === 'block') { block++; }
      routines += (staff[i].routines || []).length;
    }
    var apr = state.approvals || [];
    for (var j = 0; j < apr.length; j++) { if (apr[j].floorId === f.id) { appr++; } }
    return '<div class="stat-row">' +
      '<div class="stat"><b>' + routines + '</b><span>진행 루틴</span></div>' +
      '<div class="stat"><b>' + work + '</b><span>작업중</span></div>' +
      '<div class="stat warn"><b>' + wait + '</b><span>대기</span></div>' +
      '<div class="stat appr"><b>' + appr + '</b><span>결재·요청</span></div>' +
      (block ? '<div class="stat danger"><b>' + block + '</b><span>막힘</span></div>' : '') +
      '</div>';
  }

  function routineRow(r) {
    var st = STATUS[r.state] || STATUS.waiting;
    return '<li class="routine">' +
      '<span class="rt-top"><b>' + esc(r.name) + '</b>' +
      '<span class="chip small" style="color:' + st.color + ';background:' + st.soft + '">' + esc(r.stateLabel || st.label) + '</span></span>' +
      '<span class="rt-meta">' + esc(r.when) + ' · 최근 ' + esc(r.last) + ' · 다음 ' + esc(r.next) + '</span></li>';
  }

  function panelStatus() {
    var f = currentFloor();
    if (!f) { return '<p class="empty">상태 파일을 불러오지 못했어요.</p>'; }
    var m = findStaff(f, ui.staffId);
    if (m) { return staffDetail(f, m); }

    var html = '<div class="panel-head"><span class="pc-level" style="background:' + f.theme.soft + ';color:' +
      shade(f.theme.accent, 0.15) + '">' + esc(f.level) + '</span><div><h3>' + esc(f.name) + '</h3>' +
      '<p>' + esc(f.summary) + '</p></div></div>' + statRow(f);

    html += '<h4 class="sec-title">이 층의 담당</h4><div class="staff-list">';
    var staff = f.staff || [];
    for (var i = 0; i < staff.length; i++) {
      var s = staff[i];
      var meta = STATUS[s.status] || STATUS.waiting;
      html += '<button class="staff-card" data-staff="' + s.id + '" type="button">' +
        '<span class="avatar-dot" style="background:' + meta.soft + ';color:' + meta.color + '">' +
        '<i style="background:' + meta.color + '"></i></span>' +
        '<span class="sc-main"><span class="sc-top"><b>' + esc(s.name) + '</b>' +
        chip(s.status) + '</span>' +
        '<span class="sc-role">' + esc(s.role) + '</span>' +
        '<span class="sc-note">' + esc(s.note) + '</span></span></button>';
    }
    html += '</div>';

    var allRoutines = [];
    for (var j = 0; j < staff.length; j++) {
      var rs = staff[j].routines || [];
      for (var k = 0; k < rs.length; k++) {
        allRoutines.push({ r: rs[k], who: staff[j].name });
      }
    }
    if (allRoutines.length) {
      html += '<h4 class="sec-title">진행 중 루틴</h4><ul class="routines">';
      for (var q = 0; q < allRoutines.length; q++) {
        html += routineRow(allRoutines[q].r).replace('<li class="routine">',
          '<li class="routine"><span class="rt-who">' + esc(allRoutines[q].who) + '</span>');
      }
      html += '</ul>';
    }

    var recent = [];
    for (var a = 0; a < staff.length; a++) {
      var rc = staff[a].recent || [];
      for (var b = 0; b < rc.length; b++) { recent.push({ t: rc[b].time, x: rc[b].text, who: staff[a].name }); }
    }
    if (recent.length) {
      html += '<h4 class="sec-title">최근 완료</h4><ul class="timeline">';
      for (var c2 = 0; c2 < recent.length; c2++) {
        html += '<li><span class="tl-time">' + esc(recent[c2].t) + '</span>' +
          '<span class="tl-text">' + esc(recent[c2].x) + '<em>' + esc(recent[c2].who) + '</em></span></li>';
      }
      html += '</ul>';
    }

    var nexts = [];
    for (var d = 0; d < staff.length; d++) {
      var nx = staff[d].next || [];
      for (var e = 0; e < nx.length; e++) { nexts.push({ t: nx[e].time, x: nx[e].text, who: staff[d].name }); }
    }
    if (nexts.length) {
      html += '<h4 class="sec-title">다음 예정</h4><ul class="timeline next">';
      for (var g = 0; g < nexts.length; g++) {
        html += '<li><span class="tl-time">' + esc(nexts[g].t) + '</span>' +
          '<span class="tl-text">' + esc(nexts[g].x) + '<em>' + esc(nexts[g].who) + '</em></span></li>';
      }
      html += '</ul>';
    }
    return html;
  }

  function staffDetail(f, m) {
    var meta = STATUS[m.status] || STATUS.waiting;
    var html = '<button class="back-btn" data-clear="1" type="button">← ' + esc(f.name) + ' 전체 보기</button>';
    html += '<div class="detail-head"><span class="pc-level" style="background:' + meta.soft + ';color:' + meta.color + '">' +
      (m.placeholder ? '준비중' : '담당') + '</span><div><h3>' + esc(m.name) + '</h3>' +
      '<p>' + esc(m.role) + ' · ' + esc(f.level) + ' ' + esc(f.name) + '</p></div></div>';
    html += '<p class="detail-note">' + chip(m.status) + '<span>' + esc(m.note) + '</span></p>';

    var rs = m.routines || [];
    if (rs.length) {
      html += '<h4 class="sec-title">진행 중 루틴</h4><ul class="routines">';
      for (var i = 0; i < rs.length; i++) { html += routineRow(rs[i]); }
      html += '</ul>';
    }
    var rc = m.recent || [];
    if (rc.length) {
      html += '<h4 class="sec-title">최근 완료</h4><ul class="timeline">';
      for (var j = 0; j < rc.length; j++) {
        html += '<li><span class="tl-time">' + esc(rc[j].time) + '</span><span class="tl-text">' + esc(rc[j].text) + '</span></li>';
      }
      html += '</ul>';
    }
    var nx = m.next || [];
    if (nx.length) {
      html += '<h4 class="sec-title">다음 예정</h4><ul class="timeline next">';
      for (var k = 0; k < nx.length; k++) {
        html += '<li><span class="tl-time">' + esc(nx[k].time) + '</span><span class="tl-text">' + esc(nx[k].text) + '</span></li>';
      }
      html += '</ul>';
    }
    var msg = m.name + ' 쪽 지금 상태 확인해서 알려줘.';
    html += '<div class="detail-actions">' +
      '<button class="btn-copy wide" type="button" data-copy="' + esc(msg) + '">이 자리 상태 확인 지시 복사</button>' +
      '</div>';
    return html;
  }

  function panelApprovals() {
    var apr = state.approvals || [];
    var floors = state.floors || [];
    var html = '<div class="panel-head slim"><div><h3>결재 · 요청</h3>' +
      '<p>대표님 결정이나 확인이 필요한 안건 ' + apr.length + '건이에요. 문구를 복사해 채팅에 붙여넣으면 바로 지시가 돼요.</p></div></div>';

    html += '<div class="filters"><button class="filter' + (ui.approvalFilter === 'all' ? ' is-on' : '') +
      '" data-filter="all" type="button">전체</button>';
    for (var i = 0; i < floors.length; i++) {
      html += '<button class="filter' + (ui.approvalFilter === floors[i].id ? ' is-on' : '') +
        '" data-filter="' + floors[i].id + '" type="button">' + esc(floors[i].level) + '</button>';
    }
    html += '</div>';

    var shown = 0;
    for (var j = 0; j < apr.length; j++) {
      var a = apr[j];
      if (ui.approvalFilter !== 'all' && a.floorId !== ui.approvalFilter) { continue; }
      shown++;
      var fl = null;
      for (var k = 0; k < floors.length; k++) { if (floors[k].id === a.floorId) { fl = floors[k]; } }
      var sel = ui.options[a.id] || 0;
      var opt = (a.options || [])[sel] || { text: '' };
      html += '<article class="appr" data-appr="' + a.id + '">' +
        '<div class="appr-top"><span class="appr-team">' + esc(fl ? fl.level + ' ' + a.team : a.team) + '</span>' +
        '<span class="appr-tone">' + esc(a.tone || '') + '</span></div>' +
        '<h4>' + esc(a.title) + '</h4>' +
        '<p class="appr-why">' + esc(a.why) + '</p>' +
        (a.due ? '<p class="appr-due">⏱ ' + esc(a.due) + '</p>' : '') +
        '<div class="appr-opts">';
      var opts = a.options || [];
      for (var o = 0; o < opts.length; o++) {
        html += '<button class="opt' + (o === sel ? ' is-on' : '') + '" type="button" data-appr="' + a.id +
          '" data-opt="' + o + '">' + esc(opts[o].label) + '</button>';
      }
      html += '</div><div class="appr-copy"><code>' + esc(opt.text) + '</code>' +
        '<button class="btn-copy" type="button" data-copy="' + esc(opt.text) + '">복사</button></div></article>';
    }
    if (!shown) { html += '<p class="empty">이 층에 걸린 결재는 지금 없어요.</p>'; }
    return html;
  }

  var DRAFT_KINDS = [
    { id: 'check', label: '상태 확인' },
    { id: 'run', label: '실행 요청' },
    { id: 'hold', label: '보류 · 중단' },
    { id: 'routine', label: '새 루틴 등록' },
    { id: 'report', label: '보고 방식 변경' }
  ];

  function draftTarget() {
    var f = currentFloor();
    var m = findStaff(f, ui.staffId);
    return { floor: f, staff: m };
  }

  function buildDraft() {
    var d = ui.draft || {};
    var floors = state.floors || [];
    var floor = null, staff = null;
    for (var i = 0; i < floors.length; i++) { if (floors[i].id === (d.floorId || ui.floorId)) { floor = floors[i]; } }
    if (!floor) { floor = currentFloor(); }
    if (floor) { staff = findStaff(floor, d.staffId || ui.staffId); }
    var target = (floor ? floor.level + ' ' + floor.name : '오피스') + (staff ? ' ' + staff.name : '');
    var body = (d.text || '').trim();
    var kind = d.kind || 'check';
    var t = body ? '"' + body + '"' : '';
    if (kind === 'run') {
      return target + ', ' + (t || '"맡은 일"') + ' 진행해줘. 승인 필요한 부분은 먼저 물어봐.';
    }
    if (kind === 'hold') {
      return target + '에서 ' + (t || '"진행 중인 일"') + ' 건은 지금은 보류해줘. 재개 조건이 생기면 알려줘.';
    }
    if (kind === 'routine') {
      return target + '에 새 루틴으로 ' + (t || '"새 루틴"') + ' 등록해줘. 실행 시간은 정해서 알려줘.';
    }
    if (kind === 'report') {
      return target + ' 보고 방식 바꿔줘. ' + (t || '"핵심만"') + ' 위주로 짧게 알려줘.';
    }
    return target + ', 지금 상태 확인해서 알려줘.' + (body ? ' 특히 ' + t + ' 부분.' : '');
  }

  function panelDraft() {
    var floors = state.floors || [];
    if (!ui.draft) {
      ui.draft = { floorId: ui.floorId, staffId: ui.staffId, kind: 'check', text: '' };
    }
    var d = ui.draft;
    var floor = null;
    for (var i = 0; i < floors.length; i++) { if (floors[i].id === d.floorId) { floor = floors[i]; } }
    if (!floor) { floor = currentFloor(); d.floorId = floor ? floor.id : ''; }

    var html = '<div class="panel-head slim"><div><h3>지시 초안 만들기</h3>' +
      '<p>층과 담당을 고르고 요청을 적으면, 채팅에 붙여넣을 문장으로 만들어 드려요.</p></div></div>';
    html += '<div class="form">';
    html += '<label class="field"><span>층</span><select id="draftFloor">';
    for (var j = 0; j < floors.length; j++) {
      html += '<option value="' + floors[j].id + '"' + (floors[j].id === d.floorId ? ' selected' : '') + '>' +
        esc(floors[j].level + ' ' + floors[j].name) + '</option>';
    }
    html += '</select></label>';

    html += '<label class="field"><span>담당</span><select id="draftStaff">' +
      '<option value=""' + (!d.staffId ? ' selected' : '') + '>층 전체</option>';
    var st = floor.staff || [];
    for (var k = 0; k < st.length; k++) {
      html += '<option value="' + st[k].id + '"' + (st[k].id === d.staffId ? ' selected' : '') + '>' +
        esc(st[k].name) + '</option>';
    }
    html += '</select></label>';

    html += '<label class="field"><span>요청 종류</span><select id="draftKind">';
    for (var q = 0; q < DRAFT_KINDS.length; q++) {
      html += '<option value="' + DRAFT_KINDS[q].id + '"' + (DRAFT_KINDS[q].id === d.kind ? ' selected' : '') + '>' +
        DRAFT_KINDS[q].label + '</option>';
    }
    html += '</select></label>';

    html += '<label class="field"><span>내용 <em>짧게 적어 주세요</em></span>' +
      '<input id="draftText" type="text" maxlength="120" placeholder="예: 이번 주 마감 건 먼저" value="' +
      esc(d.text || '') + '" /></label>';
    html += '</div>';

    var msg = buildDraft();
    html += '<div class="draft-out"><span class="draft-label">이렇게 보내요</span>' +
      '<p id="draftPreview">' + esc(msg) + '</p>' +
      '<div class="draft-actions">' +
      '<button class="btn-copy wide" type="button" data-copy="' + esc(msg) + '">문구 복사</button>' +
      '<button class="btn-ghost" type="button" data-draft-reset="1">비우기</button></div></div>';
    return html;
  }

  /* ---------- 복사 · 토스트 ---------- */

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) { return; }
    el.textContent = msg;
    el.classList.add('is-on');
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2400);
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      toast(ok ? '복사했어요. 채팅에 붙여넣으세요.' : '복사가 안 됐어요. 문구를 길게 눌러 복사해 주세요.');
    } catch (e) {
      toast('복사가 안 됐어요. 문구를 길게 눌러 복사해 주세요.');
    }
  }

  function copyText(text) {
    if (!text) { return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('복사했어요. 채팅에 붙여넣으세요.');
      }, function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  /* ---------- 이벤트 ---------- */

  function selectFloor(id) {
    ui.floorId = id;
    ui.staffId = null;
    if (ui.draft) { ui.draft.floorId = id; ui.draft.staffId = null; }
    try { if (window.history && window.history.replaceState) { window.history.replaceState(null, '', '#' + id); } } catch (e) {}
    renderFloorList();
    renderStage();
    renderPanel();
  }

  function selectStaff(id) {
    ui.staffId = (ui.staffId === id) ? null : id;
    if (ui.tab !== 'status') { ui.tab = 'status'; }
    if (ui.draft) { ui.draft.staffId = ui.staffId; }
    renderStage();
    renderPanel();
  }

  function bind() {
    var floorList = document.getElementById('floorList');
    if (floorList) {
      floorList.addEventListener('click', function (ev) {
        var btn = ev.target.closest ? ev.target.closest('[data-floor]') : null;
        if (btn) { selectFloor(btn.getAttribute('data-floor')); }
      });
    }

    var map = document.getElementById('mapCanvas');
    if (map) {
      map.addEventListener('click', function (ev) {
        var g = ev.target.closest ? ev.target.closest('[data-staff]') : null;
        if (g) { selectStaff(g.getAttribute('data-staff')); }
      });
      map.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.key !== ' ') { return; }
        var g = ev.target.closest ? ev.target.closest('[data-staff]') : null;
        if (g) { ev.preventDefault(); selectStaff(g.getAttribute('data-staff')); }
      });
    }

    var tabs = document.querySelector('.tabs');
    if (tabs) {
      tabs.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('[data-tab]') : null;
        if (!b) { return; }
        ui.tab = b.getAttribute('data-tab');
        renderPanel();
      });
    }

    var open = document.getElementById('openApprovals');
    if (open) {
      open.addEventListener('click', function () {
        ui.tab = 'approvals';
        renderPanel();
        var panel = document.querySelector('.panel');
        if (panel && window.innerWidth < 1180) { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
    }

    var clear = document.getElementById('clearSelect');
    if (clear) {
      clear.addEventListener('click', function () { ui.staffId = null; renderStage(); renderPanel(); });
    }

    var body = document.getElementById('panelBody');
    if (body) {
      body.addEventListener('click', function (ev) {
        var t = ev.target;
        var copy = t.closest ? t.closest('[data-copy]') : null;
        if (copy) { copyText(copy.getAttribute('data-copy')); return; }
        var clearBtn = t.closest ? t.closest('[data-clear]') : null;
        if (clearBtn) { ui.staffId = null; renderStage(); renderPanel(); return; }
        var card = t.closest ? t.closest('.staff-card') : null;
        if (card) { selectStaff(card.getAttribute('data-staff')); return; }
        var filter = t.closest ? t.closest('[data-filter]') : null;
        if (filter) { ui.approvalFilter = filter.getAttribute('data-filter'); renderPanel(); return; }
        var opt = t.closest ? t.closest('[data-opt]') : null;
        if (opt) {
          ui.options[opt.getAttribute('data-appr')] = parseInt(opt.getAttribute('data-opt'), 10) || 0;
          renderPanel(true);
          return;
        }
        var reset = t.closest ? t.closest('[data-draft-reset]') : null;
        if (reset) {
          ui.draft = { floorId: ui.floorId, staffId: ui.staffId, kind: 'check', text: '' };
          renderPanel();
        }
      });

      body.addEventListener('change', function (ev) {
        var id = ev.target && ev.target.id;
        if (!ui.draft) { return; }
        if (id === 'draftFloor') {
          ui.draft.floorId = ev.target.value;
          ui.draft.staffId = null;
          renderPanel();
        } else if (id === 'draftStaff') {
          ui.draft.staffId = ev.target.value || null;
          renderPanel();
        } else if (id === 'draftKind') {
          ui.draft.kind = ev.target.value;
          renderPanel();
        }
      });

      body.addEventListener('input', function (ev) {
        if (ev.target && ev.target.id === 'draftText') {
          if (!ui.draft) { return; }
          ui.draft.text = ev.target.value;
          var prev = document.getElementById('draftPreview');
          if (prev) { prev.textContent = buildDraft(); }
          var cbtn = body.querySelector('.draft-actions [data-copy]');
          if (cbtn) { cbtn.setAttribute('data-copy', buildDraft()); }
        }
      });

      body.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && ev.target && ev.target.id === 'draftText') {
          ev.preventDefault();
          copyText(buildDraft());
        }
      });
    }

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && ui.staffId) { ui.staffId = null; renderStage(); renderPanel(); }
    });
  }

  /* ---------- 시작 ---------- */

  function loadState() {
    var url = STATE_URL + '?v=' + (new Date().getTime());
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    });
  }

  function start() {
    document.getElementById('stateLabel').textContent = '';
    loadState().then(function (data) {
      state = data;
      var site = state.site || {};
      document.title = site.title || '임마누엘컴퍼니 AI 오피스';
      var sl = document.getElementById('stateLabel');
      if (sl) { sl.textContent = site.stateLabel || '관측됨'; }
      var badge = document.getElementById('stateBadge');
      if (badge && site.stateHint) { badge.setAttribute('title', site.stateHint); }
      var ul = document.getElementById('updatedLabel');
      if (ul) { ul.textContent = '마지막 업데이트 ' + (state.updatedLabel || state.updatedAt || '—'); }
      var hash = (window.location.hash || '').replace('#', '');
      if (hash && state.floors) {
        for (var i = 0; i < state.floors.length; i++) {
          if (state.floors[i].id === hash) { ui.floorId = hash; }
        }
      }
      bind();
      render();
    }).catch(function (err) {
      var body = document.getElementById('panelBody');
      if (body) {
        body.innerHTML = '<div class="panel-head slim"><div><h3>상태 파일을 불러오지 못했어요</h3>' +
          '<p><code>office-state.json</code> 을 읽을 수 없습니다. GitHub Pages 주소로 열면 정상으로 보여요.</p>' +
          '<p class="muted">' + esc(String(err && err.message ? err.message : err)) + '</p></div></div>';
      }
    });
  }

  /* 테스트용 노출 (브라우저 동작에는 영향 없음) */
  if (typeof window !== 'undefined') {
    window.AIOffice = {
      buildFloorSVG: buildFloorSVG,
      setState: function (s) { state = s; },
      getState: function () { return state; },
      setUI: function (patch) {
        if (!patch) { return; }
        for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) { ui[k] = patch[k]; } }
      },
      counts: counts,
      panelStatus: panelStatus,
      panelApprovals: panelApprovals,
      panelDraft: panelDraft,
      buildDraft: buildDraft
    };
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }
})();
