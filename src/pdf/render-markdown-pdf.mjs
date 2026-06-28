import { readFileSync } from 'fs';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function markdownToHtml(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const body = [];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith('- ')) {
      if (!inList) {
        body.push('<ul>');
        inList = true;
      }
      body.push(`<li>${escapeHtml(line.slice(2))}</li>`);
      continue;
    }
    if (inList) {
      body.push('</ul>');
      inList = false;
    }
    if (line.startsWith('# ')) body.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    else if (line.startsWith('## ')) body.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    else if (line.startsWith('### ')) body.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    else if (line.trim()) body.push(`<p>${escapeHtml(line)}</p>`);
  }
  if (inList) body.push('</ul>');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; color: #111; line-height: 1.35; max-width: 780px; margin: 32px auto; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 18px; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 24px; }
    h3 { font-size: 15px; margin-top: 18px; }
    p, li { font-size: 11.5px; }
  </style>
</head>
<body>${body.join('\n')}</body>
</html>`;
}

export async function renderMarkdownFileToPdf(markdownPath, pdfPath) {
  const markdown = readFileSync(markdownPath, 'utf-8');
  const { renderHtmlToPdf } = await import('../../generate-pdf.mjs');
  await renderHtmlToPdf(markdownToHtml(markdown), pdfPath, { format: 'a4' });
  return pdfPath;
}

