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
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() || (d.isSymbolicLink() && fs.statSync(path.join(dir, d.name)).isFile()))
      .map((d) => d.name);
  } catch (e) {
    console.error(`Error listing files in ${dir}:`, e.message);
    return [];
  }
}

function listDirs(dir) {
  if (!exists(dir)) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() || (d.isSymbolicLink() && fs.statSync(path.join(dir, d.name)).isDirectory()))
      .map((d) => d.name);
  } catch (e) {
    console.error(`Error listing directories in ${dir}:`, e.message);
    return [];
  }
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
  console.log(`Building catalog using base: ${baseUrl}, BOOKS_ROOT: ${BOOKS_ROOT}`);

  for (const classEntry of classMap) {
    const classDir = path.join(BOOKS_ROOT, classEntry.folder);
    const subjects = listDirs(classDir);
    if (subjects.length === 0) {
      console.warn(`No subjects found in ${classDir}`);
    }

    for (const subjectName of subjects) {
      const subjectDir = path.join(classDir, subjectName);
      const files = listFiles(subjectDir);
      const makeUrl = (fileName) =>
        `${baseUrl}/books/${encodeURIComponent(classEntry.folder)}/${encodeURIComponent(subjectName)}/${encodeURIComponent(fileName)}`;

      // Build fast lookup for case-insensitive filename matching.
      const byLower = new Map();
      for (const fileName of files) {
        byLower.set(fileName.toLowerCase(), fileName);
      }

      const chapterMap = new Map();
      const pdfNames = files
        .filter((f) => f.toLowerCase().endsWith('.pdf'))
        .sort((a, b) => a.localeCompare(b));

      for (const pdfName of pdfNames) {
        const base = pdfName.replace(/\.pdf$/i, '');
        if (!chapterMap.has(base)) {
          chapterMap.set(base, {
            chapterCode: base,
            pdfFile: pdfName,
            easy: null,
            moderate: null,
            hard: null,
            supernatural: null
          });
        } else {
          chapterMap.get(base).pdfFile = pdfName;
        }
      }

      const htmlRegex = /^(.+?)_(easy|moderate|hard|supernatural|superantural)\.html$/i;
      for (const fileName of files) {
        const match = fileName.match(htmlRegex);
        if (!match) continue;

        const base = match[1];
        const rawLevel = match[2].toLowerCase();
        const level = rawLevel === 'superantural' ? 'supernatural' : rawLevel;

        if (!chapterMap.has(base)) {
          const exactPdf = byLower.get(`${base}.pdf`.toLowerCase()) || null;
          chapterMap.set(base, {
            chapterCode: base,
            pdfFile: exactPdf,
            easy: null,
            moderate: null,
            hard: null,
            supernatural: null
          });
        }

        chapterMap.get(base)[level] = fileName;
      }

      const chapters = Array.from(chapterMap.values())
        .filter((chapter) => chapter.pdfFile) // Reading requires PDF.
        .sort((a, b) => a.chapterCode.localeCompare(b.chapterCode, undefined, { numeric: true, sensitivity: 'base' }));

      for (const chapter of chapters) {
        items.push({
          classLevel: classEntry.classLevel,
          subjectName,
          chapterCode: chapter.chapterCode,
          chapterTitle: prettify(chapter.chapterCode),
          pdfUrl: makeUrl(chapter.pdfFile),
          quiz: {
            easy: chapter.easy ? makeUrl(chapter.easy) : null,
            moderate: chapter.moderate ? makeUrl(chapter.moderate) : null,
            hard: chapter.hard ? makeUrl(chapter.hard) : null,
            supernatural: chapter.supernatural ? makeUrl(chapter.supernatural) : null
          }
        });
      }
    }
  }

  console.log(`Catalog built with ${items.length} items`);
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LearningTV backend running on port ${PORT}`);
  if (FORCE_HOST) {
    console.log(`Using forced HOST base URL: ${FORCE_HOST}`);
  } else {
    console.log('Using request host for generated URLs');
  }
  console.log(`Serving books from: ${BOOKS_ROOT}`);
});
