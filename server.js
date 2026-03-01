const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const BOOKS_ROOT = process.env.BOOKS_ROOT || path.join(__dirname, 'books');
const FORCE_HOST = process.env.HOST || '';

app.use(cors());
app.use(express.json());

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function listFiles(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name);
}

function listDirs(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
}

function prettify(name) {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function resolveBaseUrl(req) {
  const queryBase = typeof req.query.baseUrl === 'string' ? req.query.baseUrl : '';
  if (queryBase) return queryBase.replace(/\/+$/, '');
  if (FORCE_HOST) return FORCE_HOST.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

function buildCatalog(baseUrl) {
  const classMap = [
    { classLevel: 4, folder: '4th' },
    { classLevel: 6, folder: '6th' }
  ];

  const items = [];

  for (const classEntry of classMap) {
    const classDir = path.join(BOOKS_ROOT, classEntry.folder);
    const subjects = listDirs(classDir);

    for (const subjectName of subjects) {
      const subjectDir = path.join(classDir, subjectName);
      const files = listFiles(subjectDir);
      const pdfs = files.filter((f) => f.toLowerCase().endsWith('.pdf')).sort();

      for (const pdfFile of pdfs) {
        const base = pdfFile.substring(0, pdfFile.length - 4);
        const htmlByLevel = {
          easy: `${base}_easy.html`,
          moderate: `${base}_moderate.html`,
          hard: `${base}_hard.html`,
          supernatural: `${base}_supernatural.html`,
          superantural: `${base}_superantural.html`
        };

        const makeUrl = (fileName) => `${baseUrl}/books/${encodeURIComponent(classEntry.folder)}/${encodeURIComponent(subjectName)}/${encodeURIComponent(fileName)}`;

        const quiz = {
          easy: files.includes(htmlByLevel.easy) ? makeUrl(htmlByLevel.easy) : null,
          moderate: files.includes(htmlByLevel.moderate) ? makeUrl(htmlByLevel.moderate) : null,
          hard: files.includes(htmlByLevel.hard) ? makeUrl(htmlByLevel.hard) : null,
          supernatural: files.includes(htmlByLevel.supernatural)
            ? makeUrl(htmlByLevel.supernatural)
            : (files.includes(htmlByLevel.superantural) ? makeUrl(htmlByLevel.superantural) : null)
        };

        items.push({
          classLevel: classEntry.classLevel,
          subjectName,
          chapterCode: base,
          chapterTitle: prettify(base),
          pdfUrl: makeUrl(pdfFile),
          quiz
        });
      }
    }
  }

  return { items, generatedAt: new Date().toISOString() };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, booksRoot: BOOKS_ROOT });
});

app.get('/api/catalog', (req, res) => {
  const baseUrl = resolveBaseUrl(req);
  res.json(buildCatalog(baseUrl));
});

app.use('/books', express.static(BOOKS_ROOT));

app.listen(PORT, () => {
  console.log(`LearningTV backend running on port ${PORT}`);
  if (FORCE_HOST) {
    console.log(`Using forced HOST base URL: ${FORCE_HOST}`);
  } else {
    console.log('Using request host for generated URLs');
  }
  console.log(`Serving books from: ${BOOKS_ROOT}`);
});
