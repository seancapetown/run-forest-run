module.exports.config = { maxDuration: 30 };

const AMAZON_BBOX = {
  type: 'Polygon',
  coordinates: [[[-73,-18],[-44,-18],[-44,5],[-73,5],[-73,-18]]]
};

const ANNUAL_LOSS = {
  1972:11000,1973:11500,1974:12000,1975:13000,1976:14000,1977:15000,1978:16000,1979:17000,1980:18000,1981:20000,
  1982:21000,1983:22000,1984:27700,1985:25800,1986:22000,1987:28000,1988:21050,1989:17770,1990:13810,1991:11030,
  1992:13786,1993:14896,1994:14896,1995:29059,1996:18161,1997:13227,1998:17383,1999:17259,2000:18226,2001:18165,
  2002:21651,2003:25396,2004:27772,2005:19014,2006:14286,2007:11651,2008:12911,2009:7464,2010:7000,2011:6418,
  2012:4571,2013:5891,2014:5012,2015:6207,2016:7893,2017:6947,2018:7900,2019:10129,2020:11088,2021:13235,
  2022:11568,2023:9001,2024:9500,2025:9712
};

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fallback() {
  return {
    source: 'INPE/Imazon 2025-2026 annual average (GFW unavailable)',
    estimated_area_km2: 6.1,
    data_period: 'Aug 2025 - Mar 2026',
    annual_loss: ANNUAL_LOSS
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
      source: 'GFW Integrated Deforestation Alerts · Satellite data · 3-8 day lag',
      data_period: `${since} to today`,
      total_km2_30_days: parseFloat(totalKm2.toFixed(2)),
      estimated_area_km2: parseFloat(dailyKm2.toFixed(2)),
      annual_loss: ANNUAL_LOSS
    });

  } catch(e) {
    return res.status(200).json({ ...fallback(), error: e.message });
  }
};
