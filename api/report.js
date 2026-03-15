/**
 * Vercel serverless: Bitrix24 ლისტის ელემენტების proxy (CORS-ის და 404-ის თავიდან ასაცილებლად)
 * GET /api/report?start=0
 */
const BITRIX_WEBHOOK = process.env.BITRIX_WEBHOOK_URL || 'https://crm.archi.ge/rest/1/0g8qitmb87y5jl7g';
const LIST_ID = 82;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const start = Math.max(0, parseInt(req.query.start, 10) || 0);

  const url = `${BITRIX_WEBHOOK}/lists.element.get.json?IBLOCK_TYPE_ID=lists&IBLOCK_ID=${LIST_ID}&NAV_START=${start}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) {
      res.status(400).json({ error: data.error_description || data.error });
      return;
    }
    const result = data.result;
    const list = Array.isArray(result) ? result : (result && result.elements) ? result.elements : [];
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.status(200).json(list);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Proxy error' });
  }
};
