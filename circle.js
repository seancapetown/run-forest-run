const https = require('https');

let landCache = null;
let turfCache = null;

async function getTurf() {
  if (turfCache) return turfCache;
  turfCache = await import('@turf/turf');
  return turfCache;
}

function fetchLand() {
  return new Promise((resolve) => {
    if (landCache) return resolve(landCache);
    const options = {
      hostname: 'raw.githubusercontent.com',
      path: '/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson',
      headers: { 'User-Agent': 'RunForestRun/1.0' }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { landCache = JSON.parse(data); resolve(landCache); }
        catch(e) { resolve(null); }
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
    return res.status(400).json({ error: 'Missing params' });
  }

  const [land, turf] = await Promise.all([fetchLand(), getTurf()]);
  const circ = turf.circle([lng, lat], radius, { steps: 128, units: 'kilometers' });

  if (!land) {
    return res.status(200).json({ geojson: turf.featureCollection([circ]), clipped: false });
  }

  const clipped = [];
  for (const feature of land.features) {
    try {
      const ix = turf.intersect(circ, feature);
      if (ix) clipped.push(ix);
    } catch(e) {}
  }

  return res.status(200).json({
    geojson: turf.featureCollection(clipped.length ? clipped : [circ]),
    clipped: clipped.length > 0
  });
};
