#!/usr/bin/env python3
"""Juice Score data probe (docs/process/juice-household.md).

Downloads official / open rent and household-spending datasets that the build
sandbox cannot reach, and PRINTS the few values the Juice Score needs to the job
log. Nothing is written back to the repository and no artifact is uploaded.

  python3 .github/scripts/juice-data-probe.py [section ...]   (default: all)

Sections: hud4 hud3 statcan misc3 hud2 acs2 ons2 cso2 zurich2 sg2 olap cmhc2 hud acs ons cso nsw vic cmhc zurich sg bls zillow mit
Each section is independent: a failure is printed and the next one runs.
Needs openpyxl for .xlsx (the workflow pip-installs it on the runner only).
"""
import csv
import html
import io
import json
import re
import sys
import traceback
import urllib.parse
import urllib.request

UA = "melon-seek-juice-data-probe/1.0 (+https://github.com/alvations/melon-seek)"


def get(url, binary=False, timeout=150, data=None, headers=None):
    h = {"User-Agent": UA, "Accept": "*/*"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h, data=data)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
        print(f"  GET {url} -> {r.status} {len(body)} bytes")
        return body if binary else body.decode("utf-8", "replace")


def links(page_url, pattern):
    """Absolute links on a page whose href matches pattern (regex, case-insensitive)."""
    text = get(page_url)
    out = []
    for m in re.finditer(r'href="([^"]+)"', text):
        href = html.unescape(m.group(1))
        if re.search(pattern, href, re.I):
            u = urllib.parse.urljoin(page_url, href)
            if u not in out:
                out.append(u)
    return out


def xlsx_rows(blob, sheet=None):
    import openpyxl  # runner-only dependency
    wb = openpyxl.load_workbook(io.BytesIO(blob), read_only=True, data_only=True)
    names = wb.sheetnames
    for name in names if sheet is None else [sheet]:
        ws = wb[name]
        for row in ws.iter_rows(values_only=True):
            yield name, [("" if v is None else v) for v in row]


def norm(s):
    return re.sub(r"\s+", " ", str(s)).strip()


def section(name):
    print(f"\n========== {name} ==========")


# --------------------------------------------------------------------------- US: HUD
US_COUNTIES = {  # county FIPS (state+county) per dataset city
    "san-francisco": "06075", "new-york (Manhattan)": "36061", "seattle/bellevue/redmond": "53033",
    "boston": "25025", "cambridge-ma": "25017", "austin": "48453", "washington-dc": "11001",
    "los-angeles": "06037", "chicago": "17031", "denver": "08031", "atlanta": "13121", "columbus": "39049",
    "costa-mesa/irvine": "06059", "huntsville": "01089", "reston": "51059", "san-diego": "06073",
    "palo-alto/san-jose/sunnyvale/mountain-view": "06085", "menlo-park": "06081", "arlington-va": "51013",
    "dallas": "48113", "houston": "48201", "miami": "12086", "philadelphia": "42101", "pittsburgh": "42003",
    "raleigh": "37183", "portland-or": "41051", "salt-lake-city": "49035", "phoenix": "04013",
    "minneapolis": "27053", "baltimore": "24510", "colorado-springs": "08041", "boulder": "08013",
    "detroit": "26163", "nashville": "47037",
}
# Central ("downtown") ZIP codes per city, for Small Area FMRs.
US_ZIPS = {
    "san-francisco": ["94102", "94103", "94104", "94105", "94107", "94108", "94109", "94111", "94133", "94158"],
    "new-york": ["10001", "10003", "10010", "10011", "10016", "10017", "10018", "10019", "10022", "10036", "10038", "10004"],
    "seattle": ["98101", "98104", "98109", "98121", "98122"],
    "boston": ["02108", "02109", "02110", "02111", "02114", "02116", "02210"],
    "austin": ["78701", "78702", "78703", "78705"],
    "washington-dc": ["20001", "20005", "20009", "20036", "20037"],
    "los-angeles": ["90012", "90013", "90014", "90015", "90017", "90071"],
    "chicago": ["60601", "60602", "60603", "60604", "60605", "60606", "60607", "60610", "60611", "60654", "60661"],
    "denver": ["80202", "80203", "80204", "80205"],
    "atlanta": ["30303", "30308", "30309", "30313"],
    "columbus": ["43215"],
    "costa-mesa": ["92626", "92627"],
    "huntsville": ["35801"],
    "reston": ["20190", "20191"],
    "san-diego": ["92101"],
    "palo-alto": ["94301", "94306"],
    "san-jose": ["95110", "95112", "95113"],
    "sunnyvale": ["94085", "94086"],
    "mountain-view": ["94040", "94041", "94043"],
    "menlo-park": ["94025"],
    "bellevue": ["98004"],
    "redmond": ["98052"],
    "cambridge-ma": ["02138", "02139", "02141", "02142"],
    "arlington-va": ["22201", "22202", "22209"],
    "dallas": ["75201", "75202", "75204"],
    "houston": ["77002", "77010", "77019"],
    "miami": ["33130", "33131", "33132"],
    "philadelphia": ["19102", "19103", "19106", "19107"],
    "pittsburgh": ["15219", "15222"],
    "raleigh": ["27601", "27603"],
    "portland-or": ["97201", "97204", "97205", "97209"],
    "salt-lake-city": ["84101", "84111"],
    "phoenix": ["85003", "85004"],
    "minneapolis": ["55401", "55402", "55403", "55415"],
    "baltimore": ["21201", "21202"],
    "irvine": ["92612", "92614", "92618"],
    "colorado-springs": ["80903"],
    "boulder": ["80302"],
    "detroit": ["48226"],
    "nashville": ["37201", "37203", "37219"],
}


def hud():
    section("HUD Fair Market Rents (huduser.gov)")
    found = []
    for page in ["https://www.huduser.gov/portal/datasets/fmr.html",
                 "https://www.huduser.gov/portal/datasets/fmr/smallarea/index.html"]:
        try:
            ls = links(page, r"\.xlsx?(\?|$)")
            print(f"  links on {page}:")
            for u in ls[:60]:
                print(f"    {u}")
            found += ls
        except Exception as e:
            print(f"  {page}: {e}")
    cands = [u for u in found if re.search(r"fy\s*_?20?2[67]|fmr202[67]", u, re.I)]
    for year in ("2027", "2026"):
        yy = year[2:]
        fmr = [u for u in cands if re.search(rf"FY{yy}_FMRs|fy{year}_fmrs|FY{yy}_4050|fmr{year}.*FMR", u, re.I) and not re.search(r"safmr|small", u, re.I)]
        fmr += [f"https://www.huduser.gov/portal/datasets/fmr/fmr{year}/FY{yy}_FMRs.xlsx",
                f"https://www.huduser.gov/portal/datasets/fmr/fmr{year}/FY{yy}_FMRs_revised.xlsx"]
        saf = [u for u in cands if re.search(rf"fy{year}_safmrs|FY{yy}_SAFMR", u, re.I)]
        saf += [f"https://www.huduser.gov/portal/datasets/fmr/fmr{year}/fy{year}_safmrs.xlsx",
                f"https://www.huduser.gov/portal/datasets/fmr/fmr{year}/fy{year}_safmrs_revised.xlsx"]
        hud_fmr(year, list(dict.fromkeys(fmr)))
        hud_safmr(year, list(dict.fromkeys(saf)))


def first_ok(urls):
    for u in urls:
        try:
            return u, get(u, binary=True, timeout=180)
        except Exception as e:
            print(f"  {u}: {e}")
    return None, None


def hud_fmr(year, urls):
    print(f"\n--- FY{year} FMR (county / metro) ---")
    u, blob = first_ok(urls)
    if not blob:
        return
    header = None
    seen = set()
    for sheet, row in xlsx_rows(blob):
        cells = [norm(c) for c in row]
        if header is None:
            if any(re.fullmatch(r"fmr_?1|fmr1", c, re.I) for c in cells) or any("hud_area_name" == c.lower() for c in cells):
                header = [c.lower() for c in cells]
                print(f"  sheet {sheet} header: {header}")
            continue
        rec = dict(zip(header, row))
        fips = str(rec.get("fips") or rec.get("fips2010") or "").zfill(10)
        for city, county in US_COUNTIES.items():
            if fips[:5] != county:
                continue
            area = norm(rec.get("hud_area_name", ""))
            town = norm(rec.get("county_town_name") or rec.get("countyname") or "")
            if county in ("25025", "25017") and not re.search(r"boston|cambridge", town, re.I):
                continue
            key = (city, area)
            if key in seen:
                continue
            seen.add(key)
            vals = [rec.get(k) for k in ("fmr_0", "fmr_1", "fmr_2", "fmr_3", "fmr_4")]
            print(f"  FMR{year} | {city} | {area} | {town} | 0BR..4BR = {vals}")
    print(f"  source: {u}")


def hud_safmr(year, urls):
    print(f"\n--- FY{year} Small Area FMR (ZIP) ---")
    u, blob = first_ok(urls)
    if not blob:
        return
    want = {z: c for c, zs in US_ZIPS.items() for z in zs}
    header = None
    for sheet, row in xlsx_rows(blob):
        cells = [norm(c) for c in row]
        if header is None:
            if any(re.search(r"zip", c, re.I) for c in cells) and any(re.search(r"1\s*BR", c, re.I) for c in cells):
                header = cells
                print(f"  sheet {sheet} header: {header}")
            continue
        rec = dict(zip(header, row))
        zc = next((k for k in header if re.search(r"zip", k, re.I)), None)
        z = str(rec.get(zc, "")).split(".")[0].zfill(5)
        if z not in want:
            continue
        area = next((rec[k] for k in header if re.search(r"area name", k, re.I)), "")
        vals = []
        for b in ("0", "1", "2", "3", "4"):
            k = next((k for k in header if re.fullmatch(rf"SAFMR {b}BR", k, re.I)), None)
            vals.append(rec.get(k) if k else None)
        print(f"  SAFMR{year} | {want[z]} | {z} | {norm(area)} | 0BR..4BR = {vals}")
    print(f"  source: {u}")


# --------------------------------------------------------------------------- US: Census ACS
ACS_PLACES = {
    "06": ["San Francisco city", "Los Angeles city", "San Diego city", "San Jose city", "Palo Alto city", "Sunnyvale city",
           "Mountain View city", "Menlo Park city", "Costa Mesa city", "Irvine city"],
    "36": ["New York city"], "53": ["Seattle city", "Bellevue city", "Redmond city"], "25": ["Boston city", "Cambridge city"],
    "48": ["Austin city", "Dallas city", "Houston city"], "11": ["Washington city"], "17": ["Chicago city"],
    "08": ["Denver city", "Boulder city", "Colorado Springs city"], "13": ["Atlanta city"], "39": ["Columbus city"],
    "01": ["Huntsville city"], "51": ["Reston CDP", "Arlington CDP"], "12": ["Miami city"],
    "42": ["Philadelphia city", "Pittsburgh city"], "37": ["Raleigh city"], "41": ["Portland city"],
    "49": ["Salt Lake City city"], "04": ["Phoenix city"], "27": ["Minneapolis city"], "24": ["Baltimore city"],
    "26": ["Detroit city"], "47": ["Nashville-Davidson metropolitan government (balance)"],
}


def acs():
    section("US Census ACS B25031 median gross rent by bedrooms")
    vars_ = ["B25031_001E", "B25031_002E", "B25031_003E", "B25031_004E", "B25031_005E", "B25031_006E"]
    for year in ("2025", "2024"):
        ok = False
        for st, names in ACS_PLACES.items():
            url = f"https://api.census.gov/data/{year}/acs/acs1?get=NAME,{','.join(vars_)}&for=place:*&in=state:{st}"
            try:
                rows = json.loads(get(url))
            except Exception as e:
                print(f"  ACS{year} state {st}: {e}")
                continue
            ok = True
            hdr = rows[0]
            for r in rows[1:]:
                rec = dict(zip(hdr, r))
                nm = rec["NAME"].split(",")[0]
                if nm in names:
                    print(f"  ACS1-{year} | {rec['NAME']} | all, studio, 1BR, 2BR, 3BR, 4BR = {[rec[v] for v in vars_]}")
        url = f"https://api.census.gov/data/{year}/acs/acs1?get=NAME,{','.join(vars_)}&for=county:061&in=state:36"
        try:
            rows = json.loads(get(url))
            print(f"  ACS1-{year} | {rows[1][0]} | {rows[1][1:7]}")
        except Exception as e:
            print(f"  ACS{year} Manhattan: {e}")
        if ok:
            print(f"  source: https://api.census.gov/data/{year}/acs/acs1 (table B25031)")
            break


# --------------------------------------------------------------------------- UK: ONS
ONS_AREAS = r"^(London|Inner London|Outer London|Westminster|Camden|Kensington and Chelsea|City of London|Islington|Tower Hamlets|Hackney|Southwark|Lambeth|Hammersmith and Fulham|Cambridge|Oxford|Manchester|City of Edinburgh|Edinburgh|England|Scotland|United Kingdom|Great Britain|East of England|North West|South East)$"


def ons():
    section("ONS Price Index of Private Rents (PIPR)")
    pages = ["https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics",
             "https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/pricesofprivaterentsbylocalauthorityandbedroomsuk"]
    for page in pages:
        try:
            ls = links(page, r"\.xlsx?(\?|$)")
        except Exception as e:
            print(f"  {page}: {e}")
            continue
        for u in ls[:6]:
            print(f"    {u}")
        if not ls:
            continue
        u = ls[0]
        try:
            blob = get(u, binary=True, timeout=180)
        except Exception as e:
            print(f"  {u}: {e}")
            continue
        headers = {}
        printed = 0
        for sheet, row in xlsx_rows(blob):
            cells = [norm(c) for c in row]
            if sheet not in headers and any(re.search(r"bed", c, re.I) for c in cells) and len([c for c in cells if c]) >= 4:
                headers[sheet] = cells
                print(f"  [{sheet}] header: {cells[:24]}")
                continue
            if any(re.match(ONS_AREAS, c, re.I) for c in cells[:4]) and printed < 250:
                printed += 1
                print(f"  [{sheet}] {cells[:24]}")
        print(f"  source: {u}")


# --------------------------------------------------------------------------- Ireland: CSO / RTB
def cso():
    section("CSO PxStat RIQ02 RTB average monthly rent (Ireland)")
    for tbl in ("RIQ02", "RIQ01"):
        url = f"https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/{tbl}/JSON-stat/2.0/en"
        try:
            d = json.loads(get(url, timeout=180))
        except Exception as e:
            print(f"  {tbl}: {e}")
            continue
        ids, size = d["id"], d["size"]
        dims = {i: d["dimension"][i] for i in ids}
        labels = {i: [dims[i]["category"]["label"][k] for k in sorted(dims[i]["category"]["index"], key=lambda k: dims[i]["category"]["index"][k])] for i in ids}
        print(f"  {tbl} {d.get('label')} | updated {d.get('updated')} | dims {[(i, dims[i].get('label'), size[n]) for n, i in enumerate(ids)]}")
        for i in ids:
            if len(labels[i]) < 12:
                print(f"    {i}: {labels[i]}")
        vals = d["value"]
        tid = next(i for i in ids if re.search(r"quarter|tlist", i, re.I))
        last_quarters = labels[tid][-4:]

        def at(idx):
            off, mul = 0, 1
            for n in reversed(range(len(ids))):
                off += idx[n] * mul
                mul *= size[n]
            return vals[off] if isinstance(vals, list) else vals.get(str(off))

        import itertools
        loc_id = next((i for i in ids if re.search(r"loc|lea|area", i, re.I) or re.search(r"location", dims[i].get("label", ""), re.I)), None)
        for combo in itertools.product(*[range(s) for s in size]):
            lab = {i: labels[i][combo[n]] for n, i in enumerate(ids)}
            if lab[tid] not in last_quarters:
                continue
            if loc_id and not re.search(r"^Dublin( City| 1| 2| 4| 8)?\b|^Dublin$|^Ireland$|Dublin City", lab[loc_id], re.I):
                continue
            v = at(combo)
            if v is None:
                continue
            print(f"    {' | '.join(lab[i] for i in ids)} = {v}")
        print(f"  source: {url}")
        break


# --------------------------------------------------------------------------- Australia
def nsw():
    section("NSW Rent and Sales Report (DCJ)")
    page = "https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html"
    try:
        ls = links(page, r"\.xlsx?(\?|$)")
    except Exception as e:
        print(f"  {page}: {e}")
        return
    for u in ls[:20]:
        print(f"    {u}")
    rent = [u for u in ls if re.search(r"rent", u, re.I) and not re.search(r"sales", u, re.I)] or ls
    if not rent:
        return
    u = rent[0]
    blob = get(u, binary=True, timeout=180)
    hdr = {}
    for sheet, row in xlsx_rows(blob):
        cells = [norm(c) for c in row]
        if sheet not in hdr and any(re.search(r"bedroom", c, re.I) for c in cells):
            hdr[sheet] = cells
            print(f"  [{sheet}] header: {cells[:16]}")
            continue
        if (sheet == "LGA" and len(cells) > 4 and cells[3] == "Sydney" and cells[2] == "Total") or (sheet == "Postcode" and cells[:1] in (["2000"], ["2000.0"])) or (sheet == "GMR" and "Greater Sydney" in cells[:2]):
            print(f"  [{sheet}] {cells[:16]}")
    print(f"  source: {u}")


def vic():
    section("Victoria Rental Report (DFFH)")
    page = "https://www.dffh.vic.gov.au/publications/rental-report"
    try:
        ls = links(page, r"\.xlsx?(\?|$)")
    except Exception as e:
        print(f"  {page}: {e}")
        return
    for u in ls[:20]:
        print(f"    {u}")
    mov = [u for u in ls if re.search(r"moving|suburb", u, re.I)] or ls
    if not mov:
        return
    u = mov[0]
    blob = get(u, binary=True, timeout=180)
    n = 0
    for sheet, row in xlsx_rows(blob):
        cells = [norm(c) for c in row]
        if n < 6:
            print(f"  [{sheet}] {cells[:6]} ... {cells[-6:]}")
            n += 1
        if any(re.search(r"Melbourne|Southbank|Docklands|Victoria$|Metro", c, re.I) for c in cells[:3]):
            print(f"  [{sheet}] {cells[:3]} ... last {cells[-4:]}")
    print(f"  source: {u}")


# --------------------------------------------------------------------------- Canada
def cmhc():
    section("CMHC Rental Market Survey data tables")
    pages = ["https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables",
             "https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market"]
    ls = []
    for page in pages:
        try:
            ls += links(page, r"\.xlsx?(\?|$)")
        except Exception as e:
            print(f"  {page}: {e}")
    for u in ls[:40]:
        print(f"    {u}")
    for city in ("toronto", "vancouver", "montreal", "ottawa"):
        cand = [u for u in ls if city in u.lower()]
        if not cand:
            continue
        u = cand[0]
        try:
            blob = get(u, binary=True, timeout=180)
        except Exception as e:
            print(f"  {u}: {e}")
            continue
        printing = 0
        for sheet, row in xlsx_rows(blob):
            cells = [norm(c) for c in row]
            line = " | ".join(c for c in cells if c)
            if re.search(r"average rent", line, re.I) and re.search(r"bedroom", line, re.I):
                printing = 40
                print(f"  [{city}:{sheet}] {line[:200]}")
                continue
            if printing and line:
                printing -= 1
                print(f"  [{city}:{sheet}] {line[:200]}")
        print(f"  source: {u}")


# --------------------------------------------------------------------------- Switzerland: Zurich
def zurich():
    section("Stadt Zuerich open data: rents by number of rooms")
    api = "https://data.stadt-zuerich.ch/api/3/action/package_search?q=mietpreis&rows=20"
    try:
        res = json.loads(get(api))["result"]["results"]
    except Exception as e:
        print(f"  {api}: {e}")
        return
    csvs = []
    for p in res:
        print(f"  pkg {p['name']}: {p.get('title')}")
        for r in p.get("resources", []):
            if str(r.get("format", "")).lower() == "csv":
                print(f"    csv {r['url']}")
                csvs.append((p["name"], r["url"]))
    for name, u in csvs[:1]:
        try:
            text = get(u, timeout=120)
        except Exception as e:
            print(f"  {u}: {e}")
            continue
        rows = list(csv.reader(io.StringIO(text.lstrip("\ufeff"))))
        hdr = [h.strip('"') for h in rows[0]]
        print(f"  {name} header: {hdr}")
        recs = [dict(zip(hdr, r)) for r in rows[1:] if r]
        years = sorted({r["StichtagDatJahr"] for r in recs})
        print(f"  years: {years}")
        print(f"  Raumeinheit: {sorted({r['RaumeinheitLang'] for r in recs})}")
        print(f"  Gliederung: {sorted({r['GliederungLang'] for r in recs})}")
        for yr in years[-2:]:
            for r in recs:
                if r["StichtagDatJahr"] != yr or r["EinheitLang"] != "Wohnung" or r["GemeinnuetzigLang"] != "Nicht gemeinnützig":
                    continue
                if r["GliederungLang"] not in ("Neubezug bis 2 Jahre", "Ganze Stadt"):
                    continue
                print(f"    {yr} | {r['RaumeinheitLang']} | {r['GliederungLang']} | {r['ZimmerLang']} | {r['PreisartLang']} | mean {r['mean']} | median {r['qu50']} | q25 {r['qu25']} | q75 {r['qu75']} | n {r.get('Sample1')}")


# --------------------------------------------------------------------------- Singapore
def sg():
    section("Singapore data.gov.sg: HDB median rent by town and flat type")
    for q in ("median rent by town and flat type", "renting out of flats"):
        url = "https://api-production.data.gov.sg/v2/public/api/datasets?" + urllib.parse.urlencode({"query": q})
        try:
            d = json.loads(get(url))
            for ds in (d.get("data", {}).get("datasets") or [])[:10]:
                print(f"  dataset {ds.get('datasetId')}: {ds.get('name')} (updated {ds.get('lastUpdatedAt')})")
        except Exception as e:
            print(f"  {url}: {e}")
    rid = "d_23000a00c52996c55106084ed0339566"
    recs, offset = [], 0
    while True:
        url = f"https://data.gov.sg/api/action/datastore_search?resource_id={rid}&limit=5000&offset={offset}"
        try:
            d = json.loads(get(url))
        except Exception as e:
            print(f"  {url}: {e}")
            break
        batch = d["result"]["records"]
        recs += batch
        offset += len(batch)
        if not batch or offset >= int(d["result"].get("total", 0)):
            break
    qs = sorted({r.get("quarter") for r in recs})
    print(f"  {len(recs)} records, quarters {qs[:1]}..{qs[-1:]}")
    for r in recs:
        if r.get("quarter") in qs[-2:] and re.search(r"CENTRAL|BUKIT MERAH|QUEENSTOWN|KALLANG", str(r.get("town")), re.I):
            print(f"    {r.get('quarter')} | {r.get('town')} | {r.get('flat_type')} | {r.get('median_rent')}")


# --------------------------------------------------------------------------- US: BLS CE by household size
def bls():
    section("BLS Consumer Expenditure Survey by consumer-unit size (API v1, no key)")
    items = ["TOTALEXP", "HOUSING", "SHELTER", "PERINSUR", "PERSINS", "INSPENSN", "CASHCONT", "FOODTOTL", "FOODHOME", "FOODAWAY", "TRANS", "HEALTH", "ENTRTAIN", "UTILS", "APPAREL", "EDUCATN", "PERSCARE", "MISC", "ALCBEVG", "READING", "TOBACCO", "HHOPER", "HKPGSUPP", "HOUSEQ", "INCAFTTX", "PERSONS", "EARNERS", "AGE"]
    sizes = {"02": "one person", "04": "two persons", "05": "three persons", "06": "four persons", "07": "five or more"}
    series = [f"CXU{it}LB05{s}M" for it in items for s in sizes]
    out = {}
    for i in range(0, len(series), 25):
        chunk = series[i:i + 25]
        body = json.dumps({"seriesid": chunk, "startyear": "2023", "endyear": "2025"}).encode()
        try:
            d = json.loads(get("https://api.bls.gov/publicAPI/v1/timeseries/data/", data=body, headers={"Content-Type": "application/json"}))
        except Exception as e:
            print(f"  BLS chunk {i}: {e}")
            continue
        if d.get("status") != "REQUEST_SUCCEEDED":
            print(f"  BLS chunk {i}: {d.get('status')} {d.get('message')}")
        for s in d.get("Results", {}).get("series", []):
            pts = {p["year"]: p["value"] for p in s.get("data", [])}
            if pts:
                out[s["seriesID"]] = pts
    for it in items:
        row = []
        for s in sizes:
            pts = out.get(f"CXU{it}LB05{s}M") or {}
            yr = max(pts) if pts else None
            row.append(f"{pts[yr]}@{yr}" if yr else "-")
        print(f"  CE {it:11s} 1p,2p,3p,4p,5+p: {row}")
    print("  source: https://api.bls.gov/publicAPI/v1/timeseries/data/ (CX series, demographic LB05 size of consumer unit)")


# --------------------------------------------------------------------------- Zillow ZORI (cross-check)
ZORI_CITIES = {"San Francisco": "CA", "New York": "NY", "Seattle": "WA", "Boston": "MA", "Austin": "TX", "Washington": "DC",
               "Los Angeles": "CA", "Chicago": "IL", "Denver": "CO", "Atlanta": "GA", "San Jose": "CA", "San Diego": "CA"}


def zillow():
    section("Zillow ZORI (cross-check only)")
    for kind in ("City_zori_uc_sfrcondomfr_sm_month.csv", "City_zori_uc_mfr_sm_month.csv"):
        url = f"https://files.zillowstatic.com/research/public_csvs/zori/{kind}"
        try:
            text = get(url, timeout=180)
        except Exception as e:
            print(f"  {url}: {e}")
            continue
        rows = list(csv.reader(io.StringIO(text)))
        hdr = rows[0]
        for r in rows[1:]:
            rec = dict(zip(hdr, r))
            if ZORI_CITIES.get(rec.get("RegionName")) == rec.get("State"):
                print(f"  {kind} | {rec['RegionName']}, {rec['State']} | {hdr[-1]} = {r[-1]} | {hdr[-13]} = {r[-13]}")


# --------------------------------------------------------------------------- MIT Living Wage (cross-check)
def mit():
    section("MIT Living Wage Calculator (cross-check only)")
    for name, fips in (("San Francisco", "06075"), ("New York County", "36061"), ("King County", "53033"), ("Travis County", "48453")):
        url = f"https://livingwage.mit.edu/counties/{fips}"
        try:
            text = get(url)
        except Exception as e:
            print(f"  {url}: {e}")
            continue
        t = re.sub(r"<[^>]+>", " ", text)
        t = html.unescape(re.sub(r"\s+", " ", t))
        i = t.find("Typical Expenses")
        print(f"  {name}: {t[i:i + 2600] if i >= 0 else t[:400]}")


# --------------------------------------------------------------------------- round 2
HUD_ARCGIS = "https://services.arcgis.com/VTyQ9soqVukalItT/ArcGIS/rest/services"


def arcgis_query(service, where, fields="*", layer=0, n=2000):
    q = urllib.parse.urlencode({"where": where, "outFields": fields, "returnGeometry": "false", "f": "json", "resultRecordCount": n})
    return json.loads(get(f"{HUD_ARCGIS}/{service}/FeatureServer/{layer}/query?{q}"))


def hud2():
    section("HUD FMR / SAFMR via HUD's ArcGIS feature services")
    try:
        d = json.loads(get(f"{HUD_ARCGIS}?f=json"))
        for sv in d.get("services", []):
            if re.search(r"fmr|fair|rent", sv.get("name", ""), re.I):
                print(f"  service {sv['name']} ({sv.get('type')})")
    except Exception as e:
        print(f"  services list: {e}")
    for svc in ("Fair_Market_Rents", "HUD_PDR_Small_Area_Fair_Market_Rents"):
        try:
            meta = json.loads(get(f"{HUD_ARCGIS}/{svc}/FeatureServer/0?f=json"))
            print(f"  {svc}: name={meta.get('name')} | fields={[f['name'] for f in meta.get('fields', [])]}")
            print(f"    description: {re.sub(r'<[^>]+>', ' ', str(meta.get('description')))[:700]}")
            print(f"    copyright: {meta.get('copyrightText')} | edited: {meta.get('editingInfo', {}).get('lastEditDate')}")
        except Exception as e:
            print(f"  {svc} meta: {e}")
            continue
        fields = [f["name"] for f in meta.get("fields", [])]
        if svc == "Fair_Market_Rents":
            fips_f = next((f for f in fields if re.search(r"fips", f, re.I)), None)
            print(f"    county field: {fips_f}")
            for city, county in US_COUNTIES.items():
                try:
                    where = f"{fips_f} LIKE '{county}%'" if fips_f else "1=1"
                    res = arcgis_query(svc, where, n=40)
                except Exception as e:
                    print(f"    {city}: {e}")
                    continue
                seen = set()
                for ft in res.get("features", [])[:40]:
                    a = ft["attributes"]
                    vals = {k: v for k, v in a.items() if re.search(r"fmr|area|name|town|fips|year|fy", k, re.I)}
                    key = json.dumps({k: v for k, v in vals.items() if re.search(r"fmr", k, re.I)}, sort_keys=True)
                    if key in seen:
                        continue
                    seen.add(key)
                    print(f"    FMR | {city} | {vals}")
        else:
            zf = next((f for f in fields if re.search(r"zcta|zip", f, re.I)), None)
            print(f"    zip field: {zf}")
            zips = sorted({z for zs in US_ZIPS.values() for z in zs})
            for i in range(0, len(zips), 40):
                chunk = zips[i:i + 40]
                try:
                    res = arcgis_query(svc, f"{zf} IN ({','.join(repr(z) for z in chunk)})", n=200)
                except Exception as e:
                    print(f"    zips {chunk[0]}..: {e}")
                    continue
                if res.get("error"):
                    print(f"    error {res['error']}")
                for ft in res.get("features", []):
                    a = ft["attributes"]
                    z = str(a.get(zf))
                    city = next((c for c, zs in US_ZIPS.items() if z in zs), "?")
                    vals = {k: v for k, v in a.items() if re.search(r"safmr|fmr|area|name|fy|year", k, re.I)}
                    print(f"    SAFMR | {city} | {z} | {vals}")


def acs2():
    section("Census ACS (debug the response)")
    url = "https://api.census.gov/data/2024/acs/acs1?get=NAME,B25031_001E,B25031_003E,B25031_004E,B25031_005E&for=place:67000&in=state:06"
    try:
        t = get(url)
        print(f"  body: {re.sub(r'<[^>]+>', ' ', t)[:600]}")
    except Exception as e:
        print(f"  {url}: {e}")


ONS_TARGETS = ["London", "Inner London", "Westminster", "Camden", "Kensington and Chelsea", "City of London", "Islington",
               "Tower Hamlets", "Southwark", "Hackney", "Lambeth", "Cambridge", "Oxford", "Manchester", "City of Edinburgh",
               "Edinburgh", "England", "United Kingdom", "Scotland"]


def ons2():
    section("ONS PIPR Table 1: latest month by bedrooms")
    u = "https://www.ons.gov.uk/file?uri=/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics/16september2026/priceindexofprivaterentsukmonthlypricestatistics.xlsx"
    blob = get(u, binary=True, timeout=240)
    hdr = None
    latest = {}
    sheets = set()
    for sheet, row in xlsx_rows(blob):
        sheets.add(sheet)
        if sheet != "Table 1":
            continue
        cells = [norm(c) for c in row]
        if hdr is None:
            if "Area name" in cells:
                hdr = cells
                print(f"  header: {hdr}")
            continue
        rec = dict(zip(hdr, cells))
        name = rec.get("Area name")
        if name in ONS_TARGETS:
            if name not in latest or rec["Time period"] > latest[name]["Time period"]:
                latest[name] = rec
    print(f"  sheets: {sorted(sheets)}")
    for name in ONS_TARGETS:
        r = latest.get(name)
        if r:
            print(f"  {r['Time period'][:10]} | {name} | all {r.get('Rental price')} | 1 bed {r.get('Rental price one bed')} | 2 bed {r.get('Rental price two bed')} | 3 bed {r.get('Rental price three bed')} | 4+ {r.get('Rental price four or more bed')} | annual change {r.get('Annual change')}")
    print(f"  source: {u}")


def cso2():
    section("CSO PxStat RIQ02 RTB average monthly rent (Ireland), latest quarter")
    url = "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/RIQ02/JSON-stat/2.0/en"
    d = json.loads(get(url, timeout=240))
    ids, size = d["id"], d["size"]
    print(f"  {d.get('label')} | updated {d.get('updated')} | ids {ids} sizes {size}")

    def cats(i):
        c = d["dimension"][i]["category"]
        idx = c["index"]
        order = idx if isinstance(idx, list) else sorted(idx, key=lambda k: idx[k])
        lab = c.get("label", {})
        return [lab.get(k, k) for k in order]

    labels = {i: cats(i) for i in ids}
    for i in ids:
        print(f"    {i} ({d['dimension'][i].get('label')}): {len(labels[i])} e.g. {labels[i][:8]} ... {labels[i][-3:]}")
    vals = d["value"]
    tid = next((i for i in ids if re.search(r"quarter|tlist", i, re.I)), ids[-1])
    lastq = labels[tid][-2:]
    import itertools
    strides = [1] * len(ids)
    for n in range(len(ids) - 2, -1, -1):
        strides[n] = strides[n + 1] * size[n + 1]
    loc = next((i for i in ids if any(re.search(r"Dublin", x) for x in labels[i])), None)
    for combo in itertools.product(*[range(x) for x in size]):
        lab = {i: labels[i][combo[n]] for n, i in enumerate(ids)}
        if lab[tid] not in lastq:
            continue
        if loc and not re.search(r"^(Dublin City|Dublin 1|Dublin 2|Dublin 4|Dublin|Ireland|State)$", lab[loc]):
            continue
        off = sum(c * st for c, st in zip(combo, strides))
        v = vals[off] if isinstance(vals, list) else vals.get(str(off))
        if v is None:
            continue
        print(f"    {' | '.join(lab[i] for i in ids)} = {v}")
    print(f"  source: {url}")


def zurich2():
    section("Stadt Zuerich rents: city districts (Kreis 1, 2, 4, 5, 6, 8), private, latest year")
    u = "https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161/download/BAU516OD5161.csv"
    text = get(u, timeout=120)
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    hdr = [h.strip('"') for h in rows[0]]
    recs = [dict(zip(hdr, r)) for r in rows[1:] if r]
    for r in recs:
        if r["StichtagDatJahr"] != "2026" or r["EinheitLang"] != "Wohnung" or r["GemeinnuetzigLang"] != "Nicht gemeinnützig" or r["PreisartLang"] != "netto":
            continue
        if r["RaumeinheitLang"] == "Stadtkreise" and re.search(r"Kreis (1|2|3|4|5|6|7|8)\)", r["GliederungLang"]):
            print(f"    2026 | {r['GliederungLang']} | {r['ZimmerLang']} | mean {r['mean']} | median {r['qu50']} | q25 {r['qu25']} | q75 {r['qu75']} | n {r.get('Sample1')}")
    print(f"  source: {u}")


def sg2():
    section("Singapore HDB median rent (latest quarters, sorted)")
    rid = "d_23000a00c52996c55106084ed0339566"
    url = f"https://data.gov.sg/api/action/datastore_search?resource_id={rid}&limit=400&sort=quarter%20desc"
    try:
        d = json.loads(get(url))
        recs = d["result"]["records"]
        qs = sorted({r.get("quarter") for r in recs})
        print(f"  total {d['result'].get('total')} | quarters in page {qs[0]}..{qs[-1]}")
        for r in recs:
            if r.get("quarter") in qs[-2:] and re.search(r"CENTRAL|BUKIT MERAH|QUEENSTOWN|KALLANG", str(r.get("town")), re.I):
                print(f"    {r.get('quarter')} | {r.get('town')} | {r.get('flat_type')} | {r.get('median_rent')}")
    except Exception as e:
        print(f"  {url}: {e}")


def olap():
    section("France: observatoires locaux des loyers (data.gouv.fr), Paris by number of rooms")
    api = "https://www.data.gouv.fr/api/1/datasets/?q=observatoires%20locaux%20des%20loyers&page_size=10"
    try:
        d = json.loads(get(api))
    except Exception as e:
        print(f"  {api}: {e}")
        return
    res = []
    for ds in d.get("data", []):
        print(f"  dataset {ds.get('slug')}: {ds.get('title')} | org {ds.get('organization', {}).get('name') if ds.get('organization') else None} | license {ds.get('license')}")
        for r in ds.get("resources", [])[:12]:
            print(f"    {r.get('format')} {r.get('title')} {r.get('url')}")
            if str(r.get("format", "")).lower() == "csv":
                res.append(r.get("url"))
    for u in res[:3]:
        try:
            t = get(u, timeout=180)
        except Exception as e:
            print(f"  {u}: {e}")
            continue
        lines = t.splitlines()
        print(f"  {u} header: {lines[0][:400]}")
        n = 0
        for ln in lines[1:]:
            if re.search(r"L7500|Paris", ln) and n < 60:
                print(f"    {ln[:300]}")
                n += 1


def cmhc2():
    section("CMHC: link patterns on the data tables pages")
    for page in ["https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables"]:
        text = get(page)
        hrefs = sorted(set(re.findall(r'href="([^"]+)"', text)))
        for h_ in hrefs:
            if re.search(r"rental|rmr|xlsx|media", h_, re.I):
                print(f"    {h_[:220]}")


# --------------------------------------------------------------------------- round 3
HUD_AREAS = ["San Francisco, CA", "New York, NY", "Seattle-Bellevue", "Boston-Cambridge-Quincy", "Austin-Round Rock",
             "Washington-Arlington-Alexandria", "Los Angeles-Long Beach", "Chicago-Joliet", "Denver-Aurora", "Atlanta-Sandy Springs",
             "Columbus, OH", "Santa Ana-Anaheim", "Huntsville, AL", "San Diego", "San Jose-Sunnyvale", "Dallas, TX", "Houston-The Woodlands",
             "Miami-Miami Beach", "Philadelphia-Camden", "Pittsburgh, PA", "Raleigh, NC", "Portland-Vancouver", "Salt Lake City, UT",
             "Phoenix-Mesa", "Minneapolis-St. Paul", "Baltimore-Columbia", "Colorado Springs", "Boulder, CO", "Detroit-Warren", "Nashville-Davidson"]


def hud3():
    section("HUD FMR (ArcGIS Fair_Market_Rents) by metro name; SAFMR layers")
    try:
        meta = json.loads(get(f"{HUD_ARCGIS}/Fair_Market_Rents/FeatureServer/0?f=json"))
        desc = re.sub(r"<[^>]+>", " ", str(meta.get("description")))
        print(f"  description (FY mentions): {re.findall(r'FY ?20[0-9][0-9][^.]{0,80}', desc)[:6]}")
        print(f"  serviceItemId {meta.get('serviceItemId')} | lastEdit {meta.get('editingInfo', {}).get('lastEditDate')}")
    except Exception as e:
        print(f"  meta: {e}")
    for nm in HUD_AREAS:
        try:
            res = arcgis_query("Fair_Market_Rents", f"FMR_AREANAME LIKE '{nm}%'", fields="FMR_CODE,FMR_AREANAME,FMR_0BDR,FMR_1BDR,FMR_2BDR,FMR_3BDR,FMR_4BDR", n=5)
            for ft in res.get("features", [])[:3]:
                a = ft["attributes"]
                print(f"    FMR | {a['FMR_AREANAME']} | {a['FMR_CODE']} | 0-4BR {a['FMR_0BDR']} {a['FMR_1BDR']} {a['FMR_2BDR']} {a['FMR_3BDR']} {a['FMR_4BDR']}")
            if res.get("error"):
                print(f"    {nm}: {res['error']}")
        except Exception as e:
            print(f"    {nm}: {e}")
    for svc in ("HUD_PDR_Small_Area_Fair_Market_Rents", "SAFMR_Year", "SAFMR_Ratio_Point"):
        try:
            root = json.loads(get(f"{HUD_ARCGIS}/{svc}/FeatureServer?f=json"))
            items = [(l["id"], l["name"], "layer") for l in root.get("layers", [])] + [(t["id"], t["name"], "table") for t in root.get("tables", [])]
            print(f"  {svc}: {items} | {re.sub(r'<[^>]+>', ' ', str(root.get('serviceDescription')))[:300]}")
            for lid, lname, kind in items:
                m = json.loads(get(f"{HUD_ARCGIS}/{svc}/FeatureServer/{lid}?f=json"))
                fields = [f["name"] for f in m.get("fields", [])]
                print(f"    [{lid}] {lname} ({kind}) fields: {fields}")
                zf = next((f for f in fields if re.search(r"zcta|zip", f, re.I)), None)
                if zf:
                    zips = sorted({z for zs in US_ZIPS.values() for z in zs})
                    for i in range(0, len(zips), 50):
                        chunk = zips[i:i + 50]
                        q = arcgis_query(f"{svc}", f"{zf} IN ({','.join(repr(z) for z in chunk)})", fields="*", layer=lid, n=400)
                        for ft in q.get("features", []):
                            a = {k: v for k, v in ft["attributes"].items() if not re.search(r"shape|objectid|aland|awater|intpt|mtfcc|classfp|funcstat", k, re.I)}
                            z = str(a.get(zf))
                            city = next((c for c, zs in US_ZIPS.items() if z in zs), "?")
                            print(f"      {svc}[{lid}] | {city} | {a}")
                        if q.get("error"):
                            print(f"      error {q['error']}")
        except Exception as e:
            print(f"  {svc}: {e}")


def statcan():
    section("Statistics Canada: CMHC average rents (34-10-0133) and quarterly asking rents (46-10-0092)")
    import zipfile
    for pid in ("34100133", "46100092"):
        url = f"https://www150.statcan.gc.ca/n1/tbl/csv/{pid}-eng.zip"
        try:
            blob = get(url, binary=True, timeout=240)
        except Exception as e:
            print(f"  {url}: {e}")
            continue
        z = zipfile.ZipFile(io.BytesIO(blob))
        name = next(n for n in z.namelist() if n.endswith(".csv") and "MetaData" not in n)
        text = z.read(name).decode("utf-8-sig", "replace")
        rows = list(csv.reader(io.StringIO(text)))
        hdr = rows[0]
        print(f"  {pid} {name} header: {hdr}")
        gi = hdr.index("GEO")
        ri = hdr.index("REF_DATE")
        vi = hdr.index("VALUE")
        recs = [r for r in rows[1:] if len(r) > vi and re.search(r"Toronto|Vancouver|Montr|Ottawa", r[gi])]
        dates = sorted({r[ri] for r in recs})
        print(f"  dates {dates[:2]}..{dates[-3:]} | geos {sorted({r[gi] for r in recs})[:12]}")
        for r in recs:
            if r[ri] in dates[-2:]:
                print(f"    {' | '.join(c for i, c in enumerate(r) if i not in (hdr.index('DGUID') if 'DGUID' in hdr else -1,) and c and len(c) < 80)}")


def misc3():
    section("Zurich combos, RTB Dublin LEAs, HDB latest, OLAP header, Victoria via data.vic")
    u = "https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161/download/BAU516OD5161.csv"
    try:
        text = get(u, timeout=120)
        rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
        hdr = [h.strip('"') for h in rows[0]]
        recs = [dict(zip(hdr, r)) for r in rows[1:] if r]
        combos = sorted({(r["RaumeinheitLang"], r["GemeinnuetzigLang"], r["PreisartLang"], r["EinheitLang"]) for r in recs if r["StichtagDatJahr"] == "2026"})
        print(f"  zurich combos 2026: {combos}")
        for r in recs:
            if r["StichtagDatJahr"] == "2026" and re.search(r"Kreis 1\)|Kreis 2\)|Kreis 4\)|Kreis 5\)|Kreis 6\)|Kreis 8\)", r["GliederungLang"]) and r["EinheitLang"] == "Wohnung" and r["PreisartLang"] == "netto":
                print(f"    {r['RaumeinheitLang']} | {r['GliederungLang']} | {r['GemeinnuetzigLang']} | {r['ZimmerLang']} | mean {r['mean']} | median {r['qu50']} | n {r.get('Sample1')}")
    except Exception as e:
        print(f"  zurich: {e}")
    try:
        url = "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/RIQ02/JSON-stat/2.0/en"
        d = json.loads(get(url, timeout=240))
        ids, size = d["id"], d["size"]

        def cats(i):
            c = d["dimension"][i]["category"]
            idx = c["index"]
            order = idx if isinstance(idx, list) else sorted(idx, key=lambda k: idx[k])
            return [c.get("label", {}).get(k, k) for k in order]
        labels = {i: cats(i) for i in ids}
        loc = ids[-1]
        dub = [x for x in labels[loc] if re.search(r"Dublin", x)]
        print(f"  RTB Dublin locations: {dub}")
        strides = [1] * len(ids)
        for n in range(len(ids) - 2, -1, -1):
            strides[n] = strides[n + 1] * size[n + 1]
        q = len(labels[ids[1]]) - 1
        for li, lname in enumerate(labels[loc]):
            if lname not in dub:
                continue
            for bi, bname in enumerate(labels[ids[2]]):
                if bname not in ("One bed", "Two bed", "Three bed", "All bedrooms"):
                    continue
                for pi_, pname in enumerate(labels[ids[3]]):
                    if pname not in ("All property types", "Apartment"):
                        continue
                    off = 0 * strides[0] + q * strides[1] + bi * strides[2] + pi_ * strides[3] + li * strides[4]
                    v = d["value"][off] if isinstance(d["value"], list) else d["value"].get(str(off))
                    print(f"    RTB {labels[ids[1]][q]} | {lname} | {bname} | {pname} = {v}")
    except Exception as e:
        print(f"  rtb: {e}")
    try:
        rid = "d_23000a00c52996c55106084ed0339566"
        d = json.loads(get(f"https://data.gov.sg/api/action/datastore_search?resource_id={rid}&limit=1"))
        total = int(d["result"]["total"])
        d = json.loads(get(f"https://data.gov.sg/api/action/datastore_search?resource_id={rid}&limit=300&offset={max(0, total - 300)}"))
        recs = d["result"]["records"]
        qs = sorted({r.get("quarter") for r in recs})
        for r in recs:
            if r.get("quarter") == qs[-1] and re.search(r"CENTRAL|BUKIT MERAH|QUEENSTOWN|KALLANG", str(r.get("town")), re.I):
                print(f"    HDB {r.get('quarter')} | {r.get('town')} | {r.get('flat_type')} | {r.get('median_rent')}")
    except Exception as e:
        print(f"  hdb: {e}")
    try:
        t = get("https://www.observatoires-des-loyers.org/datagouv/2025/Base_OP_2025_Nationale.csv", timeout=180)
        print(f"  OLAP header: {t.splitlines()[0]}")
    except Exception as e:
        print(f"  olap: {e}")
    try:
        d = json.loads(get("https://discover.data.vic.gov.au/api/3/action/package_search?q=rental%20report%20moving%20annual%20rents&rows=5"))
        for p_ in d["result"]["results"]:
            print(f"  vic pkg {p_['name']}: {p_.get('title')} | {p_.get('license_title')}")
            for r in p_.get("resources", [])[:6]:
                print(f"    {r.get('format')} {r.get('name')} {r.get('url')}")
        res = [r for p_ in d["result"]["results"] for r in p_.get("resources", []) if str(r.get("format", "")).lower() in ("xlsx", "xls") and re.search(r"moving|suburb", f"{r.get('name')} {r.get('url')}", re.I)]
        if res:
            u = res[0]["url"]
            blob = get(u, binary=True, timeout=180)
            n = 0
            for sheet, row in xlsx_rows(blob):
                cells = [norm(c) for c in row]
                if n < 4 or any(re.search(r"^(Melbourne|Southbank|Docklands|Carlton|East Melbourne|Group Total)$", c) for c in cells[:3]):
                    print(f"    [{sheet}] {cells[:3]} ... {cells[-6:]}")
                    n += 1
            print(f"  source: {u}")
    except Exception as e:
        print(f"  vic: {e}")


def hud4():
    section("HUD FMR: remaining metros (LIKE '%name%')")
    for nm in ("Raleigh", "Durham", "Cary"):
        res = arcgis_query("Fair_Market_Rents", f"FMR_AREANAME LIKE '%{nm}%'", fields="FMR_CODE,FMR_AREANAME,FMR_0BDR,FMR_1BDR,FMR_2BDR,FMR_3BDR,FMR_4BDR", n=10)
        for ft in res.get("features", []):
            a = ft["attributes"]
            print(f"    FMR | {a['FMR_AREANAME']} | {a['FMR_CODE']} | 0-4BR {a['FMR_0BDR']} {a['FMR_1BDR']} {a['FMR_2BDR']} {a['FMR_3BDR']} {a['FMR_4BDR']}")
    res = arcgis_query("HUD_PDR_Small_Area_Fair_Market_Rents", "FMR_NAME LIKE 'San Francisco%'", fields="*", layer=1, n=5)
    for ft in res.get("features", [])[:5]:
        print(f"    SAFMR_table | {ft['attributes']}")


SECTIONS = {"hud4": hud4, "hud3": hud3, "statcan": statcan, "misc3": misc3, "hud2": hud2, "acs2": acs2, "ons2": ons2, "cso2": cso2, "zurich2": zurich2, "sg2": sg2, "olap": olap, "cmhc2": cmhc2,
            "hud": hud, "acs": acs, "ons": ons, "cso": cso, "nsw": nsw, "vic": vic, "cmhc": cmhc,
            "zurich": zurich, "sg": sg, "bls": bls, "zillow": zillow, "mit": mit}

if __name__ == "__main__":
    want = [a for a in sys.argv[1:] if a and a != "all"] or list(SECTIONS)
    for name in want:
        try:
            SECTIONS[name]()
        except Exception:
            print(f"  section {name} failed:")
            traceback.print_exc(file=sys.stdout)
