// api/circle.js
// Clips a circle to land boundaries using turf.js proper polygon intersection
// Called by frontend: /api/circle?lat=X&lng=Y&radius=Z

const https = require('https');
const turf = require('@turf/turf');

// Cache land data between serverless invocations
let landCache = null;

function fetchLand() {
  return new Promise((resolve) => {
    if (landCache) return resolve(landCache);
    const options = {
      hostname: 'raw.githubusercontent.com',
      path: '/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson',
      headers: { 'User-Agent': 'RunForestRun/1.0' }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          landCache = JSON.parse(data);
          resolve(landCache);
        } catch(e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const lat    = parseFloat(req.query.lat);
  const lng    = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius);

  if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
    return res.status(400).json({ error: 'Missing lat, lng or radius' });
  }

  const land = await fetchLand();

  if (!land) {
    // Land data unavailable — return unclipped circle as fallback
    const circle = turf.circle([lng, lat], radius, { steps: 128, units: 'kilometers' });
    return res.status(200).json({
      geojson: turf.featureCollection([circle]),
      clipped: false
    });
  }

  // Build the circle polygon
  const circle = turf.circle([lng, lat], radius, { steps: 128, units: 'kilometers' });

  // Intersect with every land feature
  const clipped = [];
  for (const feature of land.features) {
    try {
      const intersection = turf.intersect(circle, feature);
      if (intersection) clipped.push(intersection);
    } catch(e) {
      // Skip invalid geometries
    }
  }

  if (!clipped.length) {
    // No land intersection found — return empty
    return res.status(200).json({
      geojson: turf.featureCollection([]),
      clipped: true
    });
  }

  return res.status(200).json({
    geojson: turf.featureCollection(clipped),
    clipped: true
  });
};
