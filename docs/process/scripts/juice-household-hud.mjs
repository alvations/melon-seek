// HUD Fair Market Rents by bedroom count for the HUD areas of the 40 US cities in data/cities.json,
// used for their 2- and 3-bedroom ratios (docs/LIVABILITY.md §4.2). Read on 2026-10-10 from HUD's
// own eGIS feature service (Fair_Market_Rents, last edited 2025-09-30, i.e. the FY2026 FMRs in effect
// from 2025-10-01; its bedroom ratios match HUD's FY2026 Small Area FMRs for San Francisco ZIPs
// 94109 and 94129). huduser.gov answers scripted downloads with an HTTP 202 challenge, so the FY2027
// tables (Federal Register 2026-17891, 2026-09-01) could not be read; the service has not been updated.
const SERVICE = 'https://services.arcgis.com/VTyQ9soqVukalItT/ArcGIS/rest/services/Fair_Market_Rents/FeatureServer/0';

// HUD area -> [0BR, 1BR, 2BR, 3BR, 4BR] monthly FMR (USD, gross rent incl. utilities, 40th percentile).
export const FMR = {
  'San Francisco, CA HUD Metro FMR Area': [2485, 2977, 3604, 4604, 4772],
  'New York, NY HUD Metro FMR Area': [2529, 2655, 2910, 3644, 3959],
  'Seattle-Bellevue, WA HUD Metro FMR Area': [2074, 2146, 2501, 3272, 3847],
  'Boston-Cambridge-Quincy, MA-NH HUD Metro FMR Area': [2359, 2476, 2941, 3526, 3894],
  'Austin-Round Rock-San Marcos, TX MSA': [1474, 1562, 1852, 2347, 2760],
  'Washington-Arlington-Alexandria, DC-VA-MD HUD Metro FMR Area': [1953, 2015, 2246, 2835, 3332],
  'Los Angeles-Long Beach-Glendale, CA HUD Metro FMR Area': [1863, 2085, 2601, 3298, 3672],
  'Chicago-Joliet-Naperville, IL HUD Metro FMR Area': [1480, 1581, 1781, 2294, 2653],
  'Denver-Aurora-Centennial, CO MSA': [1643, 1754, 2089, 2734, 3049],
  'Atlanta-Sandy Springs-Roswell, GA HUD Metro FMR Area': [1585, 1660, 1820, 2182, 2605],
  'Columbus, OH HUD Metro FMR Area': [1111, 1194, 1430, 1715, 1927],
  'Santa Ana-Anaheim-Irvine, CA HUD Metro FMR Area': [2682, 2746, 3236, 4393, 5246],
  'Huntsville, AL MSA': [1030, 1136, 1310, 1690, 2109],
  'San Diego-Chula Vista-Carlsbad, CA MSA': [2288, 2459, 3001, 3998, 4845],
  'San Jose-Sunnyvale-Santa Clara, CA HUD Metro FMR Area': [2621, 2982, 3483, 4602, 5010],
  'Dallas, TX HUD Metro FMR Area': [1582, 1648, 1931, 2431, 3091],
  'Houston-The Woodlands-Sugar Land, TX HUD Metro FMR Area': [1280, 1323, 1573, 2116, 2639],
  'Miami-Miami Beach-Kendall, FL HUD Metro FMR Area': [1828, 1995, 2436, 3127, 3613],
  'Philadelphia-Camden-Wilmington, PA-NJ-DE-MD MSA': [1397, 1520, 1810, 2170, 2423],
  'Pittsburgh, PA HUD Metro FMR Area': [1001, 1077, 1299, 1661, 1789],
  'Portland-Vancouver-Hillsboro, OR-WA MSA': [1570, 1677, 1922, 2619, 3109],
  'Salt Lake City, UT HUD Metro FMR Area': [1259, 1456, 1747, 2333, 2666],
  'Phoenix-Mesa-Chandler, AZ MSA': [1457, 1583, 1839, 2452, 2720],
  'Minneapolis-St. Paul-Bloomington, MN-WI HUD Metro FMR Area': [1242, 1405, 1709, 2262, 2531],
  'Baltimore-Columbia-Towson, MD MSA': [1362, 1511, 1857, 2358, 2611],
  'Colorado Springs, CO HUD Metro FMR Area': [1196, 1464, 1735, 2413, 2744],
  'Boulder, CO MSA': [1553, 1795, 2124, 2820, 3239],
  'Detroit-Warren-Livonia, MI HUD Metro FMR Area': [1009, 1122, 1411, 1724, 1868],
  'Nashville-Davidson--Murfreesboro--Franklin, TN HUD Metro FMR Area': [1507, 1578, 1730, 2211, 2696],
  'Raleigh-Cary, NC MSA': [1524, 1596, 1750, 2196, 2936],
};

// City key -> HUD area (county-based: San Mateo County, i.e. Menlo Park, is in the San Francisco area).
export const AREA_OF = {
  'san-francisco-ca-us': 'San Francisco, CA HUD Metro FMR Area',
  'menlo-park-ca-us': 'San Francisco, CA HUD Metro FMR Area',
  'new-york-ny-us': 'New York, NY HUD Metro FMR Area',
  'seattle-wa-us': 'Seattle-Bellevue, WA HUD Metro FMR Area',
  'bellevue-wa-us': 'Seattle-Bellevue, WA HUD Metro FMR Area',
  'redmond-wa-us': 'Seattle-Bellevue, WA HUD Metro FMR Area',
  'boston-ma-us': 'Boston-Cambridge-Quincy, MA-NH HUD Metro FMR Area',
  'cambridge-ma-us': 'Boston-Cambridge-Quincy, MA-NH HUD Metro FMR Area',
  'austin-tx-us': 'Austin-Round Rock-San Marcos, TX MSA',
  'washington-dc-us': 'Washington-Arlington-Alexandria, DC-VA-MD HUD Metro FMR Area',
  'reston-va-us': 'Washington-Arlington-Alexandria, DC-VA-MD HUD Metro FMR Area',
  'arlington-va-us': 'Washington-Arlington-Alexandria, DC-VA-MD HUD Metro FMR Area',
  'los-angeles-ca-us': 'Los Angeles-Long Beach-Glendale, CA HUD Metro FMR Area',
  'chicago-il-us': 'Chicago-Joliet-Naperville, IL HUD Metro FMR Area',
  'denver-co-us': 'Denver-Aurora-Centennial, CO MSA',
  'atlanta-ga-us': 'Atlanta-Sandy Springs-Roswell, GA HUD Metro FMR Area',
  'columbus-oh-us': 'Columbus, OH HUD Metro FMR Area',
  'costa-mesa-ca-us': 'Santa Ana-Anaheim-Irvine, CA HUD Metro FMR Area',
  'irvine-ca-us': 'Santa Ana-Anaheim-Irvine, CA HUD Metro FMR Area',
  'huntsville-al-us': 'Huntsville, AL MSA',
  'san-diego-ca-us': 'San Diego-Chula Vista-Carlsbad, CA MSA',
  'palo-alto-ca-us': 'San Jose-Sunnyvale-Santa Clara, CA HUD Metro FMR Area',
  'san-jose-ca-us': 'San Jose-Sunnyvale-Santa Clara, CA HUD Metro FMR Area',
  'sunnyvale-ca-us': 'San Jose-Sunnyvale-Santa Clara, CA HUD Metro FMR Area',
  'mountain-view-ca-us': 'San Jose-Sunnyvale-Santa Clara, CA HUD Metro FMR Area',
  'dallas-tx-us': 'Dallas, TX HUD Metro FMR Area',
  'houston-tx-us': 'Houston-The Woodlands-Sugar Land, TX HUD Metro FMR Area',
  'miami-fl-us': 'Miami-Miami Beach-Kendall, FL HUD Metro FMR Area',
  'philadelphia-pa-us': 'Philadelphia-Camden-Wilmington, PA-NJ-DE-MD MSA',
  'pittsburgh-pa-us': 'Pittsburgh, PA HUD Metro FMR Area',
  'raleigh-nc-us': 'Raleigh-Cary, NC MSA',
  'portland-or-us': 'Portland-Vancouver-Hillsboro, OR-WA MSA',
  'salt-lake-city-ut-us': 'Salt Lake City, UT HUD Metro FMR Area',
  'phoenix-az-us': 'Phoenix-Mesa-Chandler, AZ MSA',
  'minneapolis-mn-us': 'Minneapolis-St. Paul-Bloomington, MN-WI HUD Metro FMR Area',
  'baltimore-md-us': 'Baltimore-Columbia-Towson, MD MSA',
  'colorado-springs-co-us': 'Colorado Springs, CO HUD Metro FMR Area',
  'boulder-co-us': 'Boulder, CO MSA',
  'detroit-mi-us': 'Detroit-Warren-Livonia, MI HUD Metro FMR Area',
  'nashville-tn-us': 'Nashville-Davidson--Murfreesboro--Franklin, TN HUD Metro FMR Area',
};

const fmt = (n) => `$${n.toLocaleString('en-US')}`;
/** City key -> { r: [2br/1br, 3br/1br], src } for juice-household-rents.mjs. */
export const US_RATIOS = Object.fromEntries(Object.entries(AREA_OF).filter(([, a]) => FMR[a]).map(([key, area]) => {
  const [, b1, b2, b3] = FMR[area];
  return [key, {
    area,
    r: [b2 / b1, b3 / b1],
    src: {
      name: `HUD Fair Market Rents FY2026 (40th-percentile gross rent incl. utilities), ${area}: 1 bedroom ${fmt(b1)}, 2 bedrooms ${fmt(b2)}, 3 bedrooms ${fmt(b3)}`,
      url: 'https://www.huduser.gov/portal/datasets/fmr.html',
      via: SERVICE,
      asOf: '2025-10',
      license: 'US government work (public domain)',
    },
  }];
}));
