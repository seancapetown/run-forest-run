// api/circle.js
// Server-side land clipping using turf.js
// Vercel installs dependencies from package.json automatically

const https = require('https');

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
        try { landCache = JSON.parse(data); resolve(landCache); }
        catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// Generate circle polygon points
function circleGeoJSON(lngC, latC, radiusKm, steps = 128) {
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const d = radiusKm / 6371;
    const latR = latC * Math.PI / 180;
    const lngR = lngC * Math.PI / 180;
    const pLat = Math.asin(Math.sin(latR)*Math.cos(d) + Math.cos(latR)*Math.sin(d)*Math.cos(bearing));
    const pLng = lngR + Math.atan2(Math.sin(bearing)*Math.sin(d)*Math.cos(latR), Math.cos(d)-Math.sin(latR)*Math.sin(pLat));
    coords.push([pLng*180/Math.PI, pLat*180/Math.PI]);
  }
  coords.push(coords[0]);
  return { type:'Feature', geometry:{ type:'Polygon', coordinates:[coords] }, properties:{} };
}

// Ray casting point-in-polygon
function pip(pt, ring) {
  const [x,y] = pt;
  let inside = false;
  for (let i=0,j=ring.length-1; i<ring.length; j=i++) {
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    if ((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}

function pointOnLand(lng, lat, land) {
  if (!land) return true;
  for (const f of land.features) {
    const g = f.geometry;
    const polys = g.type==='Polygon' ? [g.coordinates] : g.type==='MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      if (pip([lng,lat], poly[0])) {
        let inHole = false;
        for (let h=1;h<poly.length;h++) if(pip([lng,lat],poly[h])){ inHole=true; break; }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

// Clip circle to land by keeping only land-side arcs + centre fill
function clipCircleToLand(lngC, latC, radiusKm, land) {
  const steps = 256;
  const pts = [];
  for (let i=0; i<=steps; i++) {
    const bearing = (i/steps)*2*Math.PI;
    const d = radiusKm/6371;
    const latR = latC*Math.PI/180, lngR = lngC*Math.PI/180;
    const pLat = Math.asin(Math.sin(latR)*Math.cos(d)+Math.cos(latR)*Math.sin(d)*Math.cos(bearing));
    const pLng = lngR+Math.atan2(Math.sin(bearing)*Math.sin(d)*Math.cos(latR),Math.cos(d)-Math.sin(latR)*Math.sin(pLat));
    pts.push([pLng*180/Math.PI, pLat*180/Math.PI]);
  }

  const onLand = pts.map(p => pointOnLand(p[0], p[1], land));
  const landCount = onLand.filter(Boolean).length;
  const landFrac = landCount / pts.length;

  if (landFrac < 0.05) {
    return { type:'FeatureCollection', features:[] };
  }

  // Build filled polygons from land arcs connected through centre
  const centre = [lngC, latC];
  const features = [];
  let arc = [];

  for (let i=0; i<pts.length-1; i++) {
    if (onLand[i]) {
      arc.push(pts[i]);
    } else {
      if (arc.length >= 2) {
        const ring = [centre, ...arc, centre];
        features.push({
          type:'Feature',
          geometry:{ type:'Polygon', coordinates:[ring] },
          properties:{}
        });
      }
      arc = [];
    }
  }
  if (arc.length >= 2) {
    features.push({
      type:'Feature',
      geometry:{ type:'Polygon', coordinates:[[centre,...arc,centre]] },
      properties:{}
    });
  }

  return { type:'FeatureCollection', features };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=7200');

  const lat    = parseFloat(req.query.lat);
  const lng    = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius);

  if (isNaN(lat)||isNaN(lng)||isNaN(radius)) {
    return res.status(400).json({ error:'Missing params' });
  }

  const land    = await fetchLand();
  const geojson = clipCircleToLand(lng, lat, radius, land);

  res.status(200).json({ geojson, radius, lat, lng });
};
