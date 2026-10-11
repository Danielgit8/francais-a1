// Kleiner Markdown-Renderer für die Grammatik (Überschriften, Tabellen, Listen, Zitate, Inline-Formatierung).
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/~~(.+?)~~/g, '<del>$1</del>')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/\*(.+?)\*/g, '<i>$1</i>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));

export function md(src) {
  const L = src.split(/\r?\n/), out = [];
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    let m;
    if ((m = l.match(/^(#{1,4}) (.+)/))) out.push(`<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`);
    else if (l.startsWith('|')) {
      const rows = [];
      while (i < L.length && L[i].startsWith('|')) rows.push(L[i++]);
      i--;
      const head = rows.length > 1 && /^\|[\s\-|:]+\|$/.test(rows[1]);
      const body = rows.filter((_, k) => !(head && k === 1));
      out.push('<div class="tw"><table>' + body.map((r, k) => {
        const t = head && k === 0 ? 'th' : 'td';
        return '<tr>' + cells(r).map(c => `<${t}>${c}</${t}>`).join('') + '</tr>';
      }).join('') + '</table></div>');
    } else if (/^\s*- /.test(l)) {
      const items = [];
      while (i < L.length && /^\s*- /.test(L[i])) items.push(L[i++].replace(/^\s*- (\[[ x]\] )?/, ''));
      i--;
      out.push('<ul>' + items.map(t => `<li>${inline(t)}</li>`).join('') + '</ul>');
    } else if (/^\d+\. /.test(l)) {
      const items = [];
      while (i < L.length && /^\d+\. /.test(L[i])) items.push(L[i++].replace(/^\d+\. /, ''));
      i--;
      out.push('<ol>' + items.map(t => `<li>${inline(t)}</li>`).join('') + '</ol>');
    } else if (l.startsWith('>')) out.push(`<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`);
    else if (/^---+$/.test(l)) out.push('<hr>');
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return out.join('\n');
}
