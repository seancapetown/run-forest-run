// /api/gfw-history.js
// One-time endpoint to fetch Amazon primary forest loss 2002-2025 from GFW Data API.
// Deploy to Vercel, hit the URL once, copy the numbers, then remove this file.

const GFW_API_KEY = '9c287e9c-3ada-4a28-97be-b5c3017a2039';
const BASE = 'https://data-api.globalforestwatch.org';
const ORIGIN = 'https://runforestrun.earth';
const AMAZON_GEOSTORE_ID = '972c8267ab2b54af4e7f01ac4ca00a09';

const GFW_HEADERS = {
  'x-api-key': GFW_API_KEY,
  'Origin': ORIGIN,
  'Content-Type': 'application/json'
};

async function getLatestVersion() {
  const res = await fetch(`${BASE}/dataset/umd_tree_cover_loss`, {
    headers: GFW_HEADERS
  });
  const json = await res.json();
  const versions = json.data?.versions || [];
  return versions[versions.length - 1];
}

async function queryYear(version, year) {
  const sql = encodeURIComponent(
    `SELECT SUM(area__ha) AS loss_ha FROM data ` +
    `WHERE umd_tree_cover_loss__year = ${year} ` +
    `AND umd_tree_cover_density_2000__threshold = 30 ` +
    `AND is__umd_regional_primary_forest_2001 = 'true'`
  );
  const url = `${BASE}/dataset/umd_tree_cover_loss/${version}/query/json?sql=${sql}&geostore_id=${AMAZON_GEOSTORE_ID}`;
  const res = await fetch(url, { headers: GFW_HEADERS });
  const json = await res.json();
  if (json.status === 'failed') throw new Error(json.message || 'Query failed');
  return json.data?.[0]?.loss_ha || 0;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const version = await getLatestVersion();
    if (!version) throw new Error('Could not determine dataset version');

    const years = Array.from({ length: 24 }, (_, i) => 2002 + i);
    const results = {};
    const errors = {};

    for (const year of years) {
      try {
        const ha = await queryYear(version, year);
        results[year] = { ha: Math.round(ha), km2: Math.round(ha / 100) };
      } catch (e) {
        errors[year] = e.message;
      }
    }

    const jsObject = '{\n  ' + Object.entries(results)
      .map(([yr, { km2 }]) => `${yr}:${km2}`)
      .join(',') + '\n}';

    res.status(200).json({
      version,
      geostore_id: AMAZON_GEOSTORE_ID,
      methodology: 'UMD primary forest loss · Amazon biome boundary (GFW geostore) · 30% canopy density',
      results,
      errors: Object.keys(errors).length ? errors : 'none',
      js_object: jsObject
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
