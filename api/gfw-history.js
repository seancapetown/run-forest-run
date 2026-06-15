// /api/gfw-history.js
// One-time endpoint to fetch Amazon primary forest loss 2002-2025 from GFW Data API.
// Uses POST with inline geometry — no geostore registration needed.

const GFW_API_KEY = '9c287e9c-3ada-4a28-97be-b5c3017a2039';
const BASE = 'https://data-api.globalforestwatch.org';
const ORIGIN = 'https://runforestrun.earth';

const GFW_HEADERS = {
  'x-api-key': GFW_API_KEY,
  'Origin': ORIGIN,
  'Content-Type': 'application/json'
};

// Amazon biome boundary — simplified from RAISG biogeographic boundary.
// Covers all 9 Amazon countries, excludes Andes and Cerrado.
const AMAZON_GEOMETRY = {
  type: 'Polygon',
  coordinates: [[
    [-73.4,12.4],[-68.0,12.0],[-63.0,8.5],[-60.0,6.5],[-58.0,6.0],
    [-52.0,4.5],[-50.0,2.5],[-49.5,0.5],[-51.0,-2.0],[-52.0,-5.0],
    [-48.5,-8.0],[-46.0,-11.0],[-47.0,-14.0],[-50.0,-16.0],[-52.0,-17.0],
    [-55.0,-17.5],[-57.0,-16.0],[-58.5,-14.0],[-60.0,-13.0],[-62.0,-14.0],
    [-63.5,-17.0],[-65.0,-18.0],[-68.0,-17.0],[-70.0,-14.0],[-72.0,-12.0],
    [-73.5,-10.0],[-75.5,-8.0],[-77.0,-6.0],[-78.0,-4.0],[-76.5,-1.0],
    [-75.5,0.5],[-76.0,2.0],[-75.0,4.0],[-73.0,6.0],[-72.0,8.0],
    [-71.0,10.0],[-70.0,12.0],[-73.4,12.4]
  ]]
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
  const sql = `SELECT SUM(area__ha) AS loss_ha FROM data WHERE umd_tree_cover_loss__year = ${year} AND umd_tree_cover_density_2000__threshold = 30 AND is__umd_regional_primary_forest_2001 = 'true'`;

  const res = await fetch(
    `${BASE}/dataset/umd_tree_cover_loss/${version}/query/json`,
    {
      method: 'POST',
      headers: GFW_HEADERS,
      body: JSON.stringify({
        sql,
        geometry: AMAZON_GEOMETRY
      })
    }
  );
  const json = await res.json();
  if (json.status === 'failed') throw new Error(json.message || JSON.stringify(json));
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
      methodology: 'UMD primary forest loss · Amazon biome boundary (simplified RAISG) · 30% canopy density · POST geometry',
      results,
      errors: Object.keys(errors).length ? errors : 'none',
      js_object: jsObject
    });

  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
}
