// /api/gfw-history.js — field inspection version

const GFW_API_KEY = '9c287e9c-3ada-4a28-97be-b5c3017a2039';
const BASE = 'https://data-api.globalforestwatch.org';
const ORIGIN = 'https://runforestrun.earth';
const GEOSTORE_ID = 'd44bb24653ce755b02a2bacf49223e41';

const GFW_HEADERS = {
  'x-api-key': GFW_API_KEY,
  'Origin': ORIGIN,
  'Content-Type': 'application/json'
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  try {
    // Get dataset version
    const dsRes = await fetch(`${BASE}/dataset/umd_tree_cover_loss`, { headers: GFW_HEADERS });
    const dsJson = await dsRes.json();
    const version = (dsJson.data?.versions || []).slice(-1)[0];

    // Get available fields
    const fieldsRes = await fetch(`${BASE}/dataset/umd_tree_cover_loss/${version}/fields`, { headers: GFW_HEADERS });
    const fieldsJson = await fieldsRes.json();

    // Try a simple query with NO filters — just year and area — to see raw totals
    const sqlSimple = encodeURIComponent(
      `SELECT umd_tree_cover_loss__year, SUM(area__ha) AS loss_ha FROM data ` +
      `WHERE umd_tree_cover_loss__year = 2024 ` +
      `GROUP BY umd_tree_cover_loss__year`
    );

    const simpleRes = await fetch(
      `${BASE}/dataset/umd_tree_cover_loss/${version}/query/json?sql=${sqlSimple}&geostore_id=${GEOSTORE_ID}`,
      { headers: GFW_HEADERS }
    );
    const simpleJson = await simpleRes.json();

    // Try with just threshold filter
    const sqlThreshold = encodeURIComponent(
      `SELECT umd_tree_cover_loss__year, SUM(area__ha) AS loss_ha FROM data ` +
      `WHERE umd_tree_cover_loss__year = 2024 ` +
      `AND umd_tree_cover_density_2000__threshold = 30 ` +
      `GROUP BY umd_tree_cover_loss__year`
    );

    const threshRes = await fetch(
      `${BASE}/dataset/umd_tree_cover_loss/${version}/query/json?sql=${sqlThreshold}&geostore_id=${GEOSTORE_ID}`,
      { headers: GFW_HEADERS }
    );
    const threshJson = await threshRes.json();

    // Try with primary forest filter only
    const sqlPrimary = encodeURIComponent(
      `SELECT umd_tree_cover_loss__year, SUM(area__ha) AS loss_ha FROM data ` +
      `WHERE umd_tree_cover_loss__year = 2024 ` +
      `AND is__umd_regional_primary_forest_2001 = 'true' ` +
      `GROUP BY umd_tree_cover_loss__year`
    );

    const primaryRes = await fetch(
      `${BASE}/dataset/umd_tree_cover_loss/${version}/query/json?sql=${sqlPrimary}&geostore_id=${GEOSTORE_ID}`,
      { headers: GFW_HEADERS }
    );
    const primaryJson = await primaryRes.json();

    res.status(200).json({
      version,
      geostore_id: GEOSTORE_ID,
      fields_sample: fieldsJson.data?.slice(0, 20),
      query_2024_no_filter: simpleJson.data,
      query_2024_threshold_only: threshJson.data,
      query_2024_primary_only: primaryJson.data
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
