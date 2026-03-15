/**
 * ლისტი 82-დან მონაცემების წამოღება და რეპორტის გენერაცია:
 * პროექტები x სერვის მენეჯერები, სართულების მიხედვით.
 * API არ გაჭედება: გვერდებად წამოღება + დაყოვნება.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const config = require('./config.js');

const PAGE_SIZE = config.pageSize ?? 50;
const DELAY_MS = config.delayBetweenRequestsMs ?? 400;
const MAX_RECORDS = config.maxRecords ?? null;
const API_BASE = config.apiBase;
const LIST_ID = config.listId;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getQueryString(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

/**
 * Bitrix24 lists.element.get - ერთი გვერდი
 * @param {number} start - NAV_START (0, 50, 100, ...)
 */
function fetchPage(start) {
  const url = new URL(API_BASE + '/' + config.method + '.json');
  const params = {
    IBLOCK_TYPE_ID: 'lists',
    IBLOCK_ID: LIST_ID,
    NAV_START: start,
  };
  url.search = getQueryString(params);

  return new Promise((resolve, reject) => {
    const req = https.get(url.toString(), (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error_description || json.error));
            return;
          }
          const result = json.result;
          const list = Array.isArray(result) ? result : (result && result.elements) ? result.elements : [];
          resolve(list);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * ჩანაწერების წამოღება გვერდებად, დაყოვნებით (maxRecords ლიმიტით)
 */
async function fetchAllElements() {
  const all = [];
  let start = 0;
  let page = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await fetchPage(start);
    if (batch.length === 0) break;

    const need = MAX_RECORDS == null ? batch.length : Math.min(batch.length, MAX_RECORDS - all.length);
    all.push(...batch.slice(0, need));
    console.log(`გვერდი ${page}: ${batch.length} ჩანაწერი (სულ: ${all.length})`);
    if (batch.length < PAGE_SIZE || (MAX_RECORDS != null && all.length >= MAX_RECORDS)) break;
    start += PAGE_SIZE;
    page++;
    await delay(DELAY_MS);
  }

  return all;
}

/**
 * ელემენტიდან ველების ამოღება (PROPERTY_XXX ან ბრტყელი ველები)
 */
function getField(element, key) {
  if (element[key] != null) return element[key];
  const k = config.fields[key];
  if (k && element[k] != null) return element[k];
  return null;
}

/**
 * პროექტი, სართულები და პასუხისმგებელი ობიექტიდან
 */
function parseElement(el) {
  let project = getField(el, 'project') ?? getField(el, 'NAME') ?? '';
  if (project && typeof project === 'object') project = project.name ?? project.title ?? project.value ?? project.NAME ?? '';
  const floorFrom = parseInt(getField(el, 'floorFrom'), 10);
  const floorTo = parseInt(getField(el, 'floorTo'), 10);
  let responsible = getField(el, 'responsible') ?? '';

  if (responsible && typeof responsible === 'object') {
    responsible = responsible.title || responsible.value || responsible.NAME || JSON.stringify(responsible);
  }

  const fromOk = Number.isFinite(floorFrom);
  const toOk = Number.isFinite(floorTo);
  let floorRange = '';
  if (fromOk && toOk) {
    floorRange = floorFrom === floorTo ? String(floorFrom) : `${floorFrom}-${floorTo}`;
  } else if (fromOk) floorRange = String(floorFrom);
  else if (toOk) floorRange = String(floorTo);

  return { project: String(project).trim(), floorFrom, floorTo, floorRange, responsible: String(responsible).trim() };
}

/**
 * უნიკალური მენეჯერები და პროექტები, პივოტი: project -> manager -> [ floor ranges ]
 */
function buildPivot(elements) {
  const byProject = new Map();
  const managersSet = new Set();

  for (const el of elements) {
    const { project, floorRange, responsible } = parseElement(el);
    if (!project || !floorRange) continue;

    managersSet.add(responsible || '—');

    if (!byProject.has(project)) byProject.set(project, new Map());
    const managers = byProject.get(project);
    if (!managers.has(responsible || '—')) managers.set(responsible || '—', []);
    managers.get(responsible || '—').push(floorRange);
  }

  const managers = Array.from(managersSet).sort((a, b) => a.localeCompare(b, 'ka'));
  const projects = Array.from(byProject.keys()).sort((a, b) => a.localeCompare(b, 'ka'));

  const pivot = { projects, managers, byProject };
  return pivot;
}

/**
 * რამდენიმე range-ის გაერთიანება ტექსტად (მაგ. "1-7, 10-20")
 */
function mergeRanges(ranges) {
  const normalized = [...new Set(ranges)].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return normalized.join(', ');
}

/**
 * HTML ცხრილი: პროექტები რიგებში, მენეჯერები სვეტებში
 */
function buildHtml(pivot) {
  const { projects, managers, byProject } = pivot;

  const headCells = managers
    .map(
      (m) =>
        `<th scope="col" style="padding:8px 10px; border:1px solid #ddd;">${escapeHtml(m)}</th>`
    )
    .join('');

  const rows = projects.map((project) => {
    const managerCells = managers.map((manager) => {
      const ranges = byProject.get(project)?.get(manager) ?? [];
      const text = mergeRanges(ranges);
      return `<td style="padding:8px 10px; border:1px solid #ddd; background:${text ? '#e3f2fd' : 'transparent'}">${escapeHtml(text)}</td>`;
    });
    return `
      <tr>
        <th scope="row" style="padding:8px 10px; border:1px solid #ddd; background:#1565c0; color:#fff;">${escapeHtml(project)}</th>
        ${managerCells.join('')}
      </tr>`;
  });

  return `<!DOCTYPE html>
<html lang="ka">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>სერვის მენეჯერები პროექტებისა და სართულების მიხედვით</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; }
    thead th { background: #1565c0; color: #fff; padding: 10px; text-align: left; }
    tbody tr:nth-child(even) { background: #f5f5f5; }
    tbody tr:nth-child(odd) { background: #fff; }
  </style>
</head>
<body>
  <h1>პროექტების მიხედვით სართულებზე მომაგრებული სერვის მენეჯერები</h1>
  <p>განახლება: ${new Date().toLocaleString('ka-GE')}</p>
  <table>
    <thead>
      <tr>
        <th scope="col" style="padding:8px 10px;">პროექტი</th>
        ${headCells}
      </tr>
    </thead>
    <tbody>
      ${rows.join('')}
    </tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main() {
  console.log('იწყება მონაცემების წამოღება (ლისტი 82)...');
  console.log('გვერდის ზომა:', PAGE_SIZE, ', დაყოვნება:', DELAY_MS, 'ms', MAX_RECORDS ? `, ლიმიტი: ${MAX_RECORDS} ჩანაწერი` : '', '\n');

  let elements;
  try {
    elements = await fetchAllElements();
  } catch (err) {
    console.error('API შეცდომა:', err.message);
    if (elements === undefined && err.message.includes('IBLOCK')) {
      console.log('\nშეგიძლიათ config.js-ში შეცვალოთ IBLOCK_ID / LIST_ID ან ველების სახელები.');
      console.log('პირველი ჩანაწერის სტრუქტურის სანახავად გამოიყენეთ: node fetch-report.js --debug');
    }
    process.exit(1);
  }

  if (elements.length === 0) {
    console.log('ჩანაწერი არ მოიძებნა.');
    process.exit(0);
  }

  if (process.argv.includes('--debug')) {
    console.log('\nპირველი ჩანაწერის ველები:', JSON.stringify(elements[0], null, 2));
  }

  const pivot = buildPivot(elements);
  const html = buildHtml(pivot);

  const outPath = path.join(__dirname, 'report.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log('\nრეპორტი შენახულია:', outPath);
  console.log('პროექტები:', pivot.projects.length, ', მენეჯერები:', pivot.managers.length);
}

main();
