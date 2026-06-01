const https = require('https');

const ANNUAL_LOSS = {
  1972:11000,1973:11500,1974:12000,1975:13000,1976:14000,1977:15000,1978:16000,1979:17000,1980:18000,1981:20000,
  1982:21000,1983:22000,1984:27700,1985:25800,1986:22000,1987:28000,1988:21050,1989:17770,1990:13810,1991:11030,
  1992:13786,1993:14896,1994:14896,1995:29059,1996:18161,1997:13227,1998:17383,1999:17259,2000:18226,2001:18165,
  2002:21651,2003:25396,2004:27772,2005:19014,2006:14286,2007:11651,2008:12911,2009:7464,2010:7000,2011:6418,
  2012:4571,2013:5891,2014:5012,2015:6207,2016:7893,2017:6947,2018:7900,2019:10129,2020:11088,2021:13235,
  2022:11568,2023:9001,2024:9500,2025:9712
};

// Amazon bounding box
const AMAZON_GEOMETRY = {
  type: 'Polygon',
  coordinates: [[[-73,-18],[-44,-18],[-44,5],[-73,5],[-73,-18]]]
};

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function queryGFW(apiKey, sql, geometry) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ sql, geometry });
    const options = {
      hostname: 'data-api.globalforestwatch.org',
      path: '/dataset/gfw_integrated_alerts/latest/query/json',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'RunForestRun/1.0'
      }
    };

    const req = https.request(options, (res) => {
      // Follow redirect if needed
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location) {
        const redirectPath = res.headers.location;
        const redirectOptions = {
          hostname: 'data-api.globalforestwatch.org',
          path: redirectPath,
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': 'RunForestRun/1.0'
          }
        };
        const req2 = https.request(redirectOptions, (res2) => {
          let data = '';
          res2.on('data', c => data += c);
          res2.on('end', () => {
            try { resolve({ status: res2.statusCode, body: JSON.parse(data) }); }
            catch(e) { reject(new Error('Parse error: ' + data.slice(0,200))); }
          });
        });
        req2.on('error', reject);
        req2.write(body);
        req2.end();
        return;
      }

      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { reject(new Error('Parse error: ' + data.slice(0,200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getFallback() {
  // Based on Aug 2025-Mar 2026 INPE/Imazon data: 1,460 km² over 8 months
  return {
    source: 'INPE/Imazon 2025-2026 annual average (GFW unavailable)',
    estimated_area_km2: 6.1,
    data_period: 'Aug 2025 - Mar 2026',
    alerts: []
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600'); // cache for 1 hour

  const apiKey = process.env.GFW_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ ...getFallback(), annual_loss: ANNUAL_LOSS });
  }

  try {
    // Query total hectares cleared in the last 30 days over the Amazon
    const since = getDateDaysAgo(30);
    const sql = `SELECT SUM(area__ha) as total_ha FROM results WHERE gfw_integrated_alerts__date >= '${since}'`;

    const { status, body } = await queryGFW(apiKey, sql, AMAZON_GEOMETRY);

    if (status !== 200 || !body.data || !body.data[0]) {
      return res.status(200).json({ ...getFallback(), annual_loss: ANNUAL_LOSS, gfw_status: status });
    }

    const totalHa = body.data[0].total_ha || 0;
    const totalKm2 = totalHa / 100; // hectares to km²
    const dailyKm2 = totalKm2 / 30; // average daily over the period

    return res.status(200).json({
      source: 'GFW Integrated Deforestation Alerts · Satellite data · 3-8 day lag',
      data_period: `${since} to today`,
      total_km2_30_days: parseFloat(totalKm2.toFixed(2)),
      estimated_area_km2: parseFloat(dailyKm2.toFixed(2)),
      annual_loss: ANNUAL_LOSS
    });

  } catch(e) {
    return res.status(200).json({ ...getFallback(), annual_loss: ANNUAL_LOSS, error: e.message });
  }
};
