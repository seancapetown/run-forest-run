// /api/gfw-history.js
// Fetches Amazon primary forest loss 2002-2025 from GFW Data API.
// Uses registered RAISG geostore ID + primary forest filter (no threshold).
// Remove this file after running once and copying the js_object.

const GFW_API_KEY = '9c287e9c-3ada-4a28-97be-b5c3017a2039';
const BASE = 'https://data-api.globalforestwatch.org';
const ORIGIN = 'https://runforestrun.earth';

// Pre-registered RAISG Amazon biome geostore (6,752,028 km²)
const GEOSTORE_ID = 'd44bb24653ce755b02a2bacf49223e41';

const GFW_HEADERS = {
  'x-api-key': GFW_API_KEY,
  'Origin': ORIGIN,
  'Content-Type': 'application/json'
};

async function getLatestVersion() {
  const res = await fetch(`${BASE}/dataset/umd_tree_cover_loss`, { headers: GFW_HEADERS });
  const json = await res.json();
  return (json.data?.versions || []).slice(-1)[0];
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const version = await getLatestVersion();
    if (!version) throw new Error('Could not determine dataset version');

    // Primary forest loss only — no threshold filter (threshold filter
    // selects exact bucket, not >=30%, which destroys the results)
    const sql = encodeURIComponent(
      `SELECT umd_tree_cover_loss__year, SUM(area__ha) AS loss_ha FROM data ` +
      `WHERE is__umd_regional_primary_forest_2001 = 'true' ` +
      `AND umd_tree_cover_loss__year >= 2002 ` +
      `GROUP BY umd_tree_cover_loss__year ` +
      `ORDER BY umd_tree_cover_loss__year`
    );

    const apiRes = await fetch(
      `${BASE}/dataset/umd_tree_cover_loss/${version}/query/json?sql=${sql}&geostore_id=${GEOSTORE_ID}`,
      { headers: GFW_HEADERS }
    );

    const json = await apiRes.json();
    if (json.status === 'failed') throw new Error(json.message || JSON.stringify(json));

    const results = {};
    for (const row of (json.data || [])) {
      const yr = row.umd_tree_cover_loss__year;
      const ha = Math.round(row.loss_ha || 0);
      results[yr] = { ha, km2: Math.round(ha / 100) };
    }

    const jsObject = '{\n  ' + Object.entries(results)
      .map(([yr, { km2 }]) => `${yr}:${km2}`)
      .join(',') + '\n}';

    res.status(200).json({
      version,
      geostore_id: GEOSTORE_ID,
      boundary: 'RAISG Amazon biome (6,752,028 km²)',
      methodology: 'UMD primary forest loss · is__umd_regional_primary_forest_2001 · no threshold filter · all 9 Amazon countries',
      row_count: json.data?.length,
      results,
      js_object: jsObject
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
