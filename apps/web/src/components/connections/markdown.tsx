import type { ReactNode } from 'react';

// Markdown mínimo para ler a documentação do projeto no painel: títulos, listas, tabelas, código e texto.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith('`')) out.push(<code key={k} className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]">{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) out.push(<strong key={k} className="font-semibold text-foreground">{t.slice(2, -2)}</strong>);
    else {
      const [, label, href] = t.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      const external = /^https?:/.test(href!);
      out.push(external ? <a key={k} href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">{label}</a> : <span key={k} className="text-foreground">{label}</span>);
    }
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const key = `b${i}`;
    if (line.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) body.push(lines[i++]!);
      i++;
      blocks.push(<pre key={key} className="overflow-x-auto rounded-md bg-background p-3 font-mono text-xs leading-relaxed text-foreground/90">{body.join('\n')}</pre>);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const level = h[1]!.length;
      const cls = level === 1 ? 'text-lg font-semibold' : level === 2 ? 'mt-2 text-base font-semibold' : 'text-sm font-semibold';
      blocks.push(<p key={key} className={`${cls} text-foreground`}>{inline(h[2]!, key)}</p>);
      i++;
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        const cells = lines[i]!.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key} className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-left">{head!.map((c, j) => <th key={j} className="px-2 py-1.5 font-medium text-foreground">{inline(c, `${key}h${j}`)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri} className="border-b border-border/60 align-top">{r.map((c, j) => <td key={j} className="px-2 py-1.5">{inline(c, `${key}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\./.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*([-*]|\d+\.)\s+/, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={key} className={`${ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>{items.map((t, j) => <li key={j}>{inline(t, `${key}l${j}`)}</li>)}</List>);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const para: string[] = [lines[i++]!];
    while (i < lines.length && lines[i]!.trim() && !/^(#|```|\s*\||\s*([-*]|\d+\.)\s)/.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(<p key={key}>{inline(para.join(' '), key)}</p>);
  }
  return <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{blocks}</div>;
}
