module.exports.config = { maxDuration: 30 };

const AMAZON_BBOX = {
  type: 'Polygon',
  coordinates: [[[-73,-18],[-44,-18],[-44,5],[-73,5],[-73,-18]]]
};

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fallback() {
  return {
    source: 'GFW/UMD 2025 annual average (live API unavailable)',
    estimated_area_km2: parseFloat((21957 / 365).toFixed(2)),
    data_period: '2025 annual average'
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const apiKey = process.env.GFW_API_KEY;
  if (!apiKey) return res.status(200).json(fallback());

  try {
    const since = daysAgo(30);
    const body = JSON.stringify({
      sql: `SELECT SUM(area__ha) as total_ha FROM results WHERE gfw_integrated_alerts__date >= '${since}'`,
      geometry: AMAZON_BBOX
    });

    const response = await fetch('https://data-api.globalforestwatch.org/dataset/gfw_integrated_alerts/latest/query/json', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body,
      redirect: 'follow',
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) return res.status(200).json({ ...fallback(), gfw_status: response.status });

    const data = await response.json();
    if (!data.data?.[0]?.total_ha) return res.status(200).json(fallback());

    const totalKm2 = data.data[0].total_ha / 100;
    const dailyKm2 = totalKm2 / 30;

    return res.status(200).json({
      source: 'GFW Integrated Deforestation Alerts · Satellite data · 2–16 day lag',
      data_period: `${since} to today`,
      total_km2_30_days: parseFloat(totalKm2.toFixed(2)),
      estimated_area_km2: parseFloat(dailyKm2.toFixed(2))
    });

  } catch(e) {
    return res.status(200).json({ ...fallback(), error: e.message });
  }
};
