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

function fetchGFW(apiKey) {
  return new Promise((resolve, reject) => {
    const sql = encodeURIComponent(
      `SELECT latitude, longitude, umd_glad_landsat_alerts__confidence AS confidence,
       alert__date, alert__count
       FROM gfw_integrated_alerts
       WHERE alert__date >= '${getDateDaysAgo(30)}'
       LIMIT 100`
    );

    const options = {
      hostname: 'data-api.globalforestwatch.org',
      path: `/dataset/gfw_integrated_alerts/latest/query?sql=${sql}`,
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'User-Agent': 'RunForestRun/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        // Return raw response for debugging
        resolve({ status: res.statusCode, raw: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.GFW_API_KEY;

  if (!apiKey) {
    return res.status(200).json({ error: 'No API key configured' });
  }

  try {
    const { status, raw } = await fetchGFW(apiKey);
    // Return raw response so we can see exactly what GFW says
    return res.status(200).json({
      gfw_status: status,
      gfw_raw: raw.slice(0, 2000), // first 2000 chars
      annual_loss: ANNUAL_LOSS
    });
  } catch(e) {
    return res.status(200).json({ error: e.message });
  }
};
