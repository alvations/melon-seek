#!/usr/bin/env python3
"""Juice Score data probe (docs/process/juice-household.md).

Downloads official / open rent and household-spending datasets that the build
sandbox cannot reach, and PRINTS the few values the Juice Score needs to the job
log. Nothing is written back to the repository and no artifact is uploaded.

  python3 .github/scripts/juice-data-probe.py [section ...]   (default: all)

Sections: hud acs ons cso nsw vic cmhc zurich sg bls zillow mit
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


SECTIONS = {"hud": hud, "acs": acs, "ons": ons, "cso": cso, "nsw": nsw, "vic": vic, "cmhc": cmhc,
            "zurich": zurich, "sg": sg, "bls": bls, "zillow": zillow, "mit": mit}

if __name__ == "__main__":
    want = [a for a in sys.argv[1:] if a and a != "all"] or list(SECTIONS)
    for name in want:
        try:
            SECTIONS[name]()
        except Exception:
            print(f"  section {name} failed:")
            traceback.print_exc(file=sys.stdout)
