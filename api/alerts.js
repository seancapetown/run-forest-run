const https = require('https');

const ANNUAL_LOSS = {
  1972:11000,1973:11500,1974:12000,1975:13000,1976:14000,1977:15000,1978:16000,1979:17000,1980:18000,1981:20000,
  1982:21000,1983:22000,1984:27700,1985:25800,1986:22000,1987:28000,1988:21050,1989:17770,1990:13810,1991:11030,
  1992:13786,1993:14896,1994:14896,1995:29059,1996:18161,1997:13227,1998:17383,1999:17259,2000:18226,2001:18165,
  2002:21651,2003:25396,2004:27772,2005:19014,2006:14286,2007:11651,2008:12911,2009:7464,2010:7000,2011:6418,
  2012:4571,2013:5891,2014:5012,2015:6207,2016:7893,2017:6947,2018:7900,2019:10129,2020:11088,2021:13235,
  2022:11568,2023:9001,2024:9500,2025:9712
};

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function getRegion(lng, lat) {
  if (lat < -10 && lng > -55)              return 'Mato Grosso';
  if (lat < -8  && lng > -65 && lng < -55) return 'Pará';
  if (lat < -8  && lng < -65)              return 'Rondônia';
  if (lat > -5  && lng < -60)              return 'Amazonas';
  if (lng < -68)                            return 'Acre';
  return 'Amazon Basin';
}

// Get today's version string e.g. v20260601
function getTodayVersion() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `v${y}${m}${day}`;
}

function gfwQuery(apiKey, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'data-api.globalforestwatch.org',
      path,
      headers: {
        'x-api-key': apiKey,
        'User-Agent': 'RunForestRun/1.0',
        'Accept': 'application/json'
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });
}

function getFallback() {
  const hotspots = [
    {lat:-8.5, lng:-55.2, r:'Pará',       w:0.30},
    {lat:-10.2,lng:-63.8, r:'Rondônia',    w:0.20},
    {lat:-12.5,lng:-52.0, r:'Mato Grosso', w:0.25},
    {lat:-5.8, lng:-57.5, r:'Amazonas',    w:0.15},
    {lat:-9.8, lng:-67.2, r:'Acre',        w:0.10},
  ];
  const confs = ['high','high','nominal','nominal','low'];
  const alerts = [];
  for (let i = 0; i < 45; i++) {
    const rnd = Math.random(); let cum = 0; let hs = hotspots[0];
    for (const h of hotspots) { cum += h.w; if (rnd < cum) { hs = h; break; } }
    const d = new Date(); d.setDate(d.getDate() - Math.floor(Math.random() * 30));
    alerts.push({
      lat:        hs.lat + (Math.random() - .5) * 2.5,
      lng:        hs.lng + (Math.random() - .5) * 2.5,
      date:       d.toISOString().slice(0, 10),
      confidence: confs[Math.floor(Math.random() * 5)],
      intensity:  Math.floor(20 + Math.random() * 80),
      region:     hs.r
    });
  }
  return { source: 'Simulated (GFW unavailable)', estimated_area_km2: 28.4, alerts };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const apiKey = process.env.GFW_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ ...getFallback(), annual_loss: ANNUAL_LOSS });
  }

  try {
    const sql = `SELECT latitude, longitude, umd_glad_landsat_alerts__confidence AS confidence, alert__date, alert__count FROM gfw_integrated_alerts WHERE alert__date >= '${getDateDaysAgo(30)}' LIMIT 100`;

    // Use the correct endpoint: /query/json with today's version
    const version = getTodayVersion();
    const finalPath = `/dataset/gfw_integrated_alerts/${version}/query/json?sql=${encodeURIComponent(sql)}`;
    const step2 = await gfwQuery(apiKey, finalPath);

    if (step2.status !== 200) {
      return res.status(200).json({ ...getFallback(), annual_loss: ANNUAL_LOSS, gfw_status: step2.status, gfw_path: finalPath });
    }

    const parsed = JSON.parse(step2.body);
    return buildResponse(res, parsed.data || []);

  } catch(e) {
    return res.status(200).json({ ...getFallback(), annual_loss: ANNUAL_LOSS, error: e.message });
  }
};

function buildResponse(res, rows) {
  if (!rows.length) {
    const fb = getFallback();
    return res.status(200).json({ ...fb, annual_loss: ANNUAL_LOSS });
  }

  const alerts = rows.map(row => ({
    lat:        row.latitude,
    lng:        row.longitude,
    date:       row.alert__date,
    confidence: row.confidence || 'nominal',
    intensity:  Math.min(100, (row.alert__count || 1) * 10),
    region:     getRegion(row.longitude, row.latitude)
  })).filter(a => a.lat && a.lng);

  const estimatedKm2 = Math.max(20, Math.min(40, alerts.length * 0.28 + 5));

  return res.status(200).json({
    source:             'GFW Integrated Deforestation Alerts',
    estimated_area_km2: parseFloat(estimatedKm2.toFixed(2)),
    total_alerts:       alerts.length,
    alerts:             alerts.slice(0, 60),
    annual_loss:        ANNUAL_LOSS
  });
}
