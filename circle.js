// api/circle.js
// Serverless function — clips a circle to land boundaries server-side
// Called by frontend: /api/circle?lat=X&lng=Y&radius=Z

const https = require('https');

// Cache land data in memory between calls
let landCache = null;
let landLoading = false;
let landWaiters = [];

function fetchLand() {
  return new Promise((resolve) => {
    if (landCache) return resolve(landCache);
    if (landLoading) return landWaiters.push(resolve);

    landLoading = true;
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
          landWaiters.forEach(w => w(landCache));
          landWaiters = [];
          resolve(landCache);
        } catch(e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Simple great-circle point generation
function circlePoints(lng, lat, radiusKm, steps = 128) {
  const pts = [];
  const R = 6371; // Earth radius km
  const d = radiusKm / R;
  const latR = lat * Math.PI / 180;
  const lngR = lng * Math.PI / 180;

  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const pLat = Math.asin(
      Math.sin(latR) * Math.cos(d) +
      Math.cos(latR) * Math.sin(d) * Math.cos(bearing)
    );
    const pLng = lngR + Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(latR),
      Math.cos(d) - Math.sin(latR) * Math.sin(pLat)
    );
    pts.push([pLng * 180 / Math.PI, pLat * 180 / Math.PI]);
  }
  pts.push(pts[0]); // close ring
  return pts;
}

// Point-in-polygon test (ray casting)
function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Check if a circle point is on land
function isOnLand(lng, lat, landGeoJSON) {
  if (!landGeoJSON) return true; // fallback: assume land
  for (const feature of landGeoJSON.features) {
    const geom = feature.geometry;
    const polys = geom.type === 'Polygon'
      ? [geom.coordinates]
      : geom.type === 'MultiPolygon'
        ? geom.coordinates
        : [];

    for (const poly of polys) {
      if (pointInPolygon([lng, lat], poly[0])) {
        // Check holes
        let inHole = false;
        for (let h = 1; h < poly.length; h++) {
          if (pointInPolygon([lng, lat], poly[h])) { inHole = true; break; }
        }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

// Build a land-masked circle as GeoJSON
// Strategy: generate circle points, only include segments over land
function buildLandCircle(lng, lat, radiusKm, land) {
  const pts = circlePoints(lng, lat, radiusKm, 256);

  // Test each point
  const onLand = pts.map(p => isOnLand(p[0], p[1], land));

  // Also include the centre area that's on land
  // Build arcs — sequences of consecutive land points
  const arcs = [];
  let current = [];

  for (let i = 0; i < pts.length - 1; i++) {
    if (onLand[i]) {
      current.push(pts[i]);
    } else {
      if (current.length > 1) arcs.push(current);
      current = [];
    }
  }
  if (current.length > 1) arcs.push(current);

  if (!arcs.length) {
    // Entire circle is over ocean — return empty
    return { type: 'FeatureCollection', features: [] };
  }

  // If most of the circle is land, return as filled polygon with centre
  const landPoints = onLand.filter(Boolean).length;
  const landFraction = landPoints / pts.length;

  if (landFraction > 0.3) {
    // Build filled polygon — land points + centre
    const centre = [lng, lat];
    const features = arcs.map(arc => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[centre, ...arc, centre]]
      },
      properties: {}
    }));
    return { type: 'FeatureCollection', features };
  }

  return { type: 'FeatureCollection', features: [] };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600'); // cache for 1 hour

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius);

  if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
    res.status(400).json({ error: 'Missing lat, lng or radius' });
    return;
  }

  const land = await fetchLand();
  const geojson = buildLandCircle(lng, lat, radius, land);

  res.status(200).json({ geojson, radius, lat, lng });
};
