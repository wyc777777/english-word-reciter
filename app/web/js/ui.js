// ==================== DOM 小工具 ====================
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

const UI = {
  show(el) { if (el) el.classList.remove('hidden'); },
  hide(el) { if (el) el.classList.add('hidden'); },
  toggle(el, on) { if (!el) return; on ? el.classList.remove('hidden') : el.classList.add('hidden'); },

  toast(msg, isErr) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(UI._tt);
    UI._tt = setTimeout(() => { t.className = 'toast' + (isErr ? ' err' : ''); }, 2600);
  },

  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  // 词根片段渲染
  //  link 片段 = 本地词根库没释义的字母串：查过的直接显示含义（绿），没查过的提示去问 AI（灰）
  rootPieces(parts) {
    if (!parts || !parts.length) return '';
    return parts.map(p => {
      if (p.type === 'link') {
        const known = (typeof Roots !== 'undefined' && Roots.PieceArchive) ? Roots.PieceArchive.get(p.text) : null;
        if (known) {
          const m = String(known.meaning || '');
          const short = m.length > 14 ? m.slice(0, 14) + '…' : m;
          return `<span class="root-piece link known" data-piece="${UI.esc(p.text)}">${UI.esc(p.text)}<small>${UI.esc(short || '已收录')}</small></span>`;
        }
        return `<span class="root-piece link clickable" data-piece="${UI.esc(p.text)}">${UI.esc(p.text)}<small>点我问 AI</small></span>`;
      }
      const cls = p.type === 'prefix' ? 'prefix' : p.type === 'suffix' ? 'suffix' : '';
      const tip = p.meaning ? `<small>${UI.esc(p.meaning)}</small>` : '';
      return `<span class="root-piece ${cls}">${UI.esc(p.text)}${tip}</span>`;
    }).join('');
  },

  // 释义文本（用于传给 AI / 展示）
  meaningText(item) {
    if (!item || !item.tr) return '';
    return item.tr.map(t => (t.p ? t.p + '. ' : '') + t.c).join('；');
  },

  // 检测一段点评是否泄露了答案：与正确释义存在 ≥3 字的连续中文重合
  // （AI 偶尔会忍不住"解释答案"，这里作为最后一道保险）
  leaksAnswer(text, meaningText) {
    const grab = s => (String(s || '').match(/[\u4e00-\u9fa5]+/g) || []).join('');
    const a = grab(text);
    const b = grab(meaningText);
    if (a.length < 3 || b.length < 3) return false;
    let best = 0;
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        let k = 0;
        while (a[i + k] && a[i + k] === b[j + k]) {
          k++;
          if (k > best) best = k;
        }
      }
    }
    return best >= 3;
  },

  // 分数 -> 颜色/评价
  verdict(score) {
    if (score >= 90) return { cls: 'hot', text: '几乎就是它！' };
    if (score >= 85) return { cls: 'hot', text: '答对了！' };
    if (score >= 70) return { cls: 'mid', text: '很接近了，方向对' };
    if (score >= 50) return { cls: 'mid', text: '沾点边，再想想' };
    if (score >= 30) return { cls: 'cold', text: '有点远' };
    return { cls: 'cold', text: '方向偏了' };
  }
};
