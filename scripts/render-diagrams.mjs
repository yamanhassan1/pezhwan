import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const MMDC =
  'C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\mermaid-cli\\node_modules\\.bin\\mmdc.cmd';
const PUPPETEER_CONFIG =
  'C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\mermaid-cli\\puppeteer.config.json';
const WORK = 'C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\mermaid-cli\\work';
const DIAGRAM_DIR = 'docs/diagrams';
const THEME = 'default';

const DOCS = [
  'docs/architecture/architecture.md',
  'docs/architecture/data-flow.md',
  // Standalone diagram sources (each renders its mermaid block(s))
  'docs/diagrams/system-overview.md',
  'docs/diagrams/package-dependency.md',
  'docs/diagrams/auth-flow.md',
  'docs/diagrams/refresh-rotation.md',
  'docs/diagrams/oauth-flow.md',
  'docs/diagrams/data-model.md',
  'docs/diagrams/deployment.md',
  'docs/diagrams/security-layers.md',
  'docs/diagrams/caching-strategy.md',
  'docs/diagrams/middleware-pipeline.md',
  'docs/diagrams/mfa-flow.md',
  'docs/diagrams/observability.md',
];

mkdirSync(DIAGRAM_DIR, { recursive: true });
mkdirSync(WORK, { recursive: true });

let diagramIndex = 0;
const catalog = [];

for (const doc of DOCS) {
  const md = readFileSync(doc, 'utf8');
  const regex = /```mermaid\n([\s\S]*?)```/g;
  const blocks = [...md.matchAll(regex)].map((x) => x[1]);

  const docName = doc.replace(/\.md$/, '').replace(/[\\/]+/g, '-');

  for (let i = 0; i < blocks.length; i++) {
    diagramIndex++;
    const code = blocks[i];
    const stem = `${String(diagramIndex).padStart(2, '0')}-${docName}-${i + 1}`;
    const mmdFile = join(WORK, `${stem}.mmd`);
    const svgOut = join(DIAGRAM_DIR, `${stem}.svg`);
    const pngOut = join(DIAGRAM_DIR, `${stem}.png`);

    writeFileSync(mmdFile, code.trim() + '\n', 'utf8');

    try {
      // shell:true is required on Windows so .cmd shims execute (execFileSync
      // cannot run .cmd directly).
      execFileSync(MMDC, ['-p', PUPPETEER_CONFIG, '-i', mmdFile, '-o', svgOut, '--theme', THEME], {
        shell: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      execFileSync(MMDC, ['-p', PUPPETEER_CONFIG, '-i', mmdFile, '-o', pngOut, '--theme', THEME], {
        shell: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      const svg = readFileSync(svgOut, 'utf8');
      if (!svg.includes('<svg')) throw new Error('mmdc produced no <svg>');
      console.log(`  OK  ${stem}.svg (${svg.length} bytes)`);
      catalog.push({ doc, block: i + 1, file: `${stem}.svg` });
    } catch (e) {
      const msg = (e.stdout || '').toString() + (e.stderr || '').toString();
      console.log(` FAIL ${stem} — ${msg.slice(0, 140).replace(/\s+/g, ' ')}`);
    }
  }
}

console.log(`\nRendered ${catalog.length}/${diagramIndex} diagrams → ${DIAGRAM_DIR}/`);
