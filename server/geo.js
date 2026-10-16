// Location string -> coordinates, using a built-in gazetteer (no network).
//
//   splitLocations("San Francisco, CA | New York City, NY") -> ["San Francisco, CA", "New York City, NY"]
//   geocode("London, UK") -> [{ name, city, region, country, lat, lng, remote }]

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

export function normKey(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// US states (+ DC, PR): abbr | name | lat | lng
// ---------------------------------------------------------------------------

const US_STATES_RAW = `
AL|Alabama|32.81|-86.79
AK|Alaska|61.37|-152.40
AZ|Arizona|33.73|-111.43
AR|Arkansas|34.97|-92.37
CA|California|36.12|-119.68
CO|Colorado|39.06|-105.31
CT|Connecticut|41.60|-72.76
DE|Delaware|39.32|-75.51
DC|District of Columbia|38.90|-77.03
FL|Florida|27.77|-81.69
GA|Georgia|33.04|-83.64
HI|Hawaii|21.09|-157.50
ID|Idaho|44.24|-114.48
IL|Illinois|40.35|-88.99
IN|Indiana|39.85|-86.26
IA|Iowa|42.01|-93.21
KS|Kansas|38.53|-96.73
KY|Kentucky|37.67|-84.67
LA|Louisiana|31.17|-91.87
ME|Maine|44.69|-69.38
MD|Maryland|39.06|-76.80
MA|Massachusetts|42.23|-71.53
MI|Michigan|43.33|-84.54
MN|Minnesota|45.69|-93.90
MS|Mississippi|32.74|-89.68
MO|Missouri|38.46|-92.29
MT|Montana|46.92|-110.45
NE|Nebraska|41.13|-98.27
NV|Nevada|38.31|-117.06
NH|New Hampshire|43.45|-71.56
NJ|New Jersey|40.30|-74.52
NM|New Mexico|34.84|-106.25
NY|New York|42.17|-74.95
NC|North Carolina|35.63|-79.81
ND|North Dakota|47.53|-99.78
OH|Ohio|40.39|-82.76
OK|Oklahoma|35.57|-96.93
OR|Oregon|44.57|-122.07
PA|Pennsylvania|40.59|-77.21
RI|Rhode Island|41.68|-71.51
SC|South Carolina|33.86|-80.95
SD|South Dakota|44.30|-99.44
TN|Tennessee|35.75|-86.69
TX|Texas|31.05|-97.56
UT|Utah|40.15|-111.86
VT|Vermont|44.05|-72.71
VA|Virginia|37.77|-78.17
WA|Washington|47.40|-121.49
WV|West Virginia|38.49|-80.95
WI|Wisconsin|44.27|-89.62
WY|Wyoming|42.76|-107.30
PR|Puerto Rico|18.22|-66.59
`;

// Non-US first-level regions useful for disambiguation: code | name | country | lat | lng | aliases
const OTHER_REGIONS_RAW = `
ON|Ontario|CA|50.00|-85.00|
QC|Quebec|CA|52.94|-73.55|Québec
BC|British Columbia|CA|53.73|-127.65|
AB|Alberta|CA|53.93|-116.58|
MB|Manitoba|CA|53.76|-98.81|
SK|Saskatchewan|CA|52.94|-106.45|
NS|Nova Scotia|CA|44.68|-63.74|
NB|New Brunswick|CA|46.57|-66.46|
NSW|New South Wales|AU|-31.84|145.61|
VIC|Victoria|AU|-36.85|144.28|
QLD|Queensland|AU|-20.92|142.70|
ACT|Australian Capital Territory|AU|-35.47|149.01|
TAS|Tasmania|AU|-42.04|146.81|
England|England|GB|52.36|-1.17|
Scotland|Scotland|GB|56.49|-4.20|
Wales|Wales|GB|52.13|-3.78|
Northern Ireland|Northern Ireland|GB|54.79|-6.49|
Bavaria|Bavaria|DE|48.79|11.50|Bayern
Ile-de-France|Île-de-France|FR|48.85|2.64|Ile de France
CT|Catalonia|ES|41.59|1.52|Cataluña;Catalunya
MD|Community of Madrid|ES|40.42|-3.70|Comunidad de Madrid
AR|Aragon|ES|41.60|-0.88|Aragón
SP|São Paulo State|BR|-22.19|-48.79|
BG|Belgrade|RS|44.79|20.45|Beograd
`;

// ---------------------------------------------------------------------------
// Countries: ISO2 | name | lat | lng | aliases (;-separated)
// fix6-fresh-data (2026-10-16): Bahrain and Jordan, at the centroids of Google's canonical
// countries.csv (developers.google.com/public-data/docs/canonical/countries_csv), the table the
// rows above were rounded from. Microsoft lists a posting at a bare "JO" and Amazon at "Manama,
// BHR"; a country missing here showed its raw code in the Location filter (D-23). A code still
// missing is named by countryName() below, so a new country never shows as a bare code.
// ---------------------------------------------------------------------------

const COUNTRIES_RAW = `
US|United States|39.83|-98.58|USA;U.S.;U.S.A.;United States of America;America;US
CA|Canada|56.13|-106.35|CAN
MX|Mexico|23.63|-102.55|México;MEX
CR|Costa Rica|9.75|-83.75|
BR|Brazil|-14.24|-51.93|Brasil;BRA
AR|Argentina|-38.42|-63.62|
CL|Chile|-35.68|-71.54|
CO|Colombia|4.57|-74.30|
PE|Peru|-9.19|-75.02|
UY|Uruguay|-32.52|-55.77|
GB|United Kingdom|54.00|-2.00|UK;U.K.;Great Britain;Britain;GB;GBR
IE|Ireland|53.41|-8.24|Republic of Ireland;IE;IRL
FR|France|46.23|2.21|FR;FRA
DE|Germany|51.17|10.45|Deutschland;DEU
NL|Netherlands|52.13|5.29|The Netherlands;Holland;NL;NLD
BE|Belgium|50.50|4.47|
LU|Luxembourg|49.82|6.13|
CH|Switzerland|46.82|8.23|CH;Schweiz;Suisse;CHE
AT|Austria|47.52|14.55|
IT|Italy|41.87|12.57|Italia;ITA
ES|Spain|40.46|-3.75|España;ESP
PT|Portugal|39.40|-8.22|
SE|Sweden|60.13|18.64|SE;SWE
NO|Norway|60.47|8.47|
DK|Denmark|56.26|9.50|DK
FI|Finland|61.92|25.75|FI
IS|Iceland|64.96|-19.02|
EE|Estonia|58.60|25.01|EE
LV|Latvia|56.88|24.60|
LT|Lithuania|55.17|23.88|
PL|Poland|51.92|19.15|PL;POL
CZ|Czechia|49.82|15.47|Czech Republic;CZ
HU|Hungary|47.16|19.50|HU
RO|Romania|45.94|24.97|RO
BG|Bulgaria|42.73|25.49|BG
RS|Serbia|44.02|21.01|RS
HR|Croatia|45.10|15.20|
SK|Slovakia|48.67|19.70|Slovak Republic
SI|Slovenia|46.15|14.99|
GR|Greece|39.07|21.82|GR
TR|Turkey|38.96|35.24|Türkiye;Turkiye;TR
UA|Ukraine|48.38|31.17|UA
AM|Armenia|40.07|45.04|
IL|Israel|31.05|34.85|ISR
KW|Kuwait|29.31|47.48|
BH|Bahrain|25.93|50.64|
JO|Jordan|30.59|36.24|
PS|Palestine|31.95|35.23|State of Palestine;Palestinian Territories
AE|United Arab Emirates|23.42|53.85|UAE;U.A.E.;AE;ARE
SA|Saudi Arabia|23.89|45.08|KSA;Kingdom of Saudi Arabia
QA|Qatar|25.35|51.18|QA
EG|Egypt|26.82|30.80|EG
NG|Nigeria|9.08|8.68|NG
GH|Ghana|7.95|-1.02|
KE|Kenya|-0.02|37.91|KE
ZA|South Africa|-30.56|22.94|ZA
IN|India|20.59|78.96|IND
PK|Pakistan|30.38|69.35|PK
MV|Maldives|3.20|73.22|
JP|Japan|36.20|138.25|JP;JPN
KR|South Korea|35.91|127.77|Korea;Republic of Korea;KR;KOR
CN|China|35.86|104.20|CN;PRC
HK|Hong Kong|22.32|114.17|HK;Hong Kong SAR
MO|Macao|22.20|113.55|Macau;Macao SAR
TW|Taiwan|23.70|120.96|TW
SG|Singapore|1.35|103.82|SG;SGP
MY|Malaysia|4.21|101.98|MY
ID|Indonesia|-0.79|113.92|
PH|Philippines|12.88|121.77|PH
TH|Thailand|15.87|100.99|TH
VN|Vietnam|14.06|108.28|Viet Nam;VN
AU|Australia|-25.27|133.78|AU;AUS
NZ|New Zealand|-40.90|174.89|NZ
`;

// ---------------------------------------------------------------------------
// Cities: name | region | country | lat | lng | aliases (;-separated)
// BP-15 (fix wave 3): Apple names some stores instead of their city ("Piazza Liberty, Italy" is
// Apple Piazza Liberty in Milan, "Via del Corso" Rome, "Shinsaibashi" and "Umeda" Osaka, "Rosny 2"
// Rosny-sous-Bois by Paris, "Campania" the Centro Campania mall in Marcianise by Naples, "Polo
// Park" Winnipeg, "Coquitlam Centre" and "Guildford Town Centre" Metro Vancouver, "Place
// Ste-Foy" Québec City, "The Dubai Mall", "Morumbi" São Paulo, "Jungfernstieg" Hamburg, "Eldon
// Square" Newcastle, "Akasya" Istanbul, "Emporia" Malmö), and Google writes Dublin in Lithuanian
// ("Dublinas"). Each is an alias of its city; a name that is also a place elsewhere is aliased
// only with its country ("Campania, Italy", "Emporia, Sweden"), so "Salerno, Campania" and
// "Emporia, KS" are not moved.
// Fix wave 4 (D-32) adds the 12 store names still listed on 2026-10-11: "Champs Élysées",
// "Opéra" and "Parly 2" (Le Chesnay) Paris, "Sainte-Catherine" Bordeaux, "Highcross" Leicester,
// "Touchwood Centre" Solihull, "Richmond Centre" Metro Vancouver, "Southgate Centre" Edmonton,
// "Grosse Bockenheimer Strasse" Frankfurt, "Fukuoka Tenjin" Fukuoka, "Antara" Mexico City and
// "VillageMall" Rio de Janeiro. D-36 adds two Google data-centre towns: Moncks Corner, SC and
// Pryor Creek, OK, which Google also writes "Pryor, OK".
// A name prefixed with "!" becomes the default for an ambiguous name.
// ---------------------------------------------------------------------------

const CITIES_RAW = `
San Francisco|CA|US|37.7749|-122.4194|SF;S.F.;San Francisco Bay Area;San Francisco Bay;SF Bay Area;Bay Area;San Francisco HQ
New York|NY|US|40.7128|-74.0060|New York City;NYC;NY City;Manhattan;New York Metro
Brooklyn|NY|US|40.6782|-73.9442|
Seattle|WA|US|47.6062|-122.3321|Greater Seattle
Bellevue|WA|US|47.6101|-122.2015|
Redmond|WA|US|47.6740|-122.1215|
Kirkland|WA|US|47.6815|-122.2087|
Tacoma|WA|US|47.2529|-122.4443|
Everett|WA|US|47.9790|-122.2021|
Spokane|WA|US|47.6588|-117.4260|
Boston|MA|US|42.3601|-71.0589|Greater Boston
Cambridge|MA|US|42.3736|-71.1097|
Burlington|MA|US|42.5048|-71.1956|
Waltham|MA|US|42.3765|-71.2356|
Quincy|MA|US|42.2529|-71.0023|
Westford|MA|US|42.5793|-71.4378|
Lexington|MA|US|42.4473|-71.2245|
Andover|MA|US|42.6583|-71.1368|
Nashua|NH|US|42.7654|-71.4676|
Providence|RI|US|41.8240|-71.4128|
Newport|RI|US|41.4901|-71.3128|
Quonset|RI|US|41.5876|-71.4137|Quonset Point
Hartford|CT|US|41.7658|-72.6734|
New Haven|CT|US|41.3083|-72.9279|
Stamford|CT|US|41.0534|-73.5387|
Groton|CT|US|41.3501|-72.0784|
Newark|NJ|US|40.7357|-74.1724|
Jersey City|NJ|US|40.7178|-74.0431|
Princeton|NJ|US|40.3573|-74.6672|
Philadelphia|PA|US|39.9526|-75.1652|
Pittsburgh|PA|US|40.4406|-79.9959|
Rochester|NY|US|43.1566|-77.6088|
Buffalo|NY|US|42.8864|-78.8784|
Syracuse|NY|US|43.0481|-76.1474|
Austin|TX|US|30.2672|-97.7431|
Dallas|TX|US|32.7767|-96.7970|Dallas-Fort Worth;DFW
Fort Worth|TX|US|32.7555|-97.3308|
Plano|TX|US|33.0198|-96.6989|
Addison|TX|US|32.9618|-96.8292|
Irving|TX|US|32.8140|-96.9489|
Houston|TX|US|29.7604|-95.3698|
San Antonio|TX|US|29.4241|-98.4936|
El Paso|TX|US|31.7619|-106.4850|
Arlington|VA|US|38.8816|-77.0910|
Arlington|TX|US|32.7357|-97.1081|
Los Angeles|CA|US|34.0522|-118.2437|LA;L.A.;Greater Los Angeles
Santa Monica|CA|US|34.0195|-118.4912|
Culver City|CA|US|34.0211|-118.3965|
Foothill Ranch|CA|US|33.6864|-117.6609|
Victorville|CA|US|34.5362|-117.2928|
El Segundo|CA|US|33.9192|-118.4165|
Hawthorne|CA|US|33.9164|-118.3526|
Torrance|CA|US|33.8358|-118.3406|
Long Beach|CA|US|33.7701|-118.1937|
Irvine|CA|US|33.6846|-117.8265|
Costa Mesa|CA|US|33.6411|-117.9187|
Santa Ana|CA|US|33.7455|-117.8677|
Anaheim|CA|US|33.8366|-117.9143|
San Diego|CA|US|32.7157|-117.1611|
Carlsbad|CA|US|33.1581|-117.3506|
Palmdale|CA|US|34.5794|-118.1165|
Mojave|CA|US|35.0525|-118.1739|
Ridgecrest|CA|US|35.6225|-117.6709|
Santa Barbara|CA|US|34.4208|-119.6982|
Goleta|CA|US|34.4358|-119.8276|
Lompoc|CA|US|34.6391|-120.4579|
Vandenberg|CA|US|34.7420|-120.5724|Vandenberg SFB;Vandenberg AFB
San Luis Obispo|CA|US|35.2828|-120.6596|
Palo Alto|CA|US|37.4419|-122.1430|
Mountain View|CA|US|37.3861|-122.0839|
Menlo Park|CA|US|37.4530|-122.1817|
Sunnyvale|CA|US|37.3688|-122.0363|
San Jose|CA|US|37.3382|-121.8863|
Santa Clara|CA|US|37.3541|-121.9552|
Cupertino|CA|US|37.3230|-122.0322|
Los Gatos|CA|US|37.2358|-121.9624|
San Bruno|CA|US|37.6305|-122.4111|
Santa Cruz|CA|US|36.9741|-122.0308|
Elk Grove|CA|US|38.4088|-121.3716|
Redwood City|CA|US|37.4852|-122.2364|
San Mateo|CA|US|37.5630|-122.3255|
South San Francisco|CA|US|37.6547|-122.4077|
Oakland|CA|US|37.8044|-122.2712|
Berkeley|CA|US|37.8715|-122.2730|
Emeryville|CA|US|37.8313|-122.2852|
Fremont|CA|US|37.5485|-121.9886|
Pleasanton|CA|US|37.6624|-121.8747|
Livermore|CA|US|37.6819|-121.7680|
Sacramento|CA|US|38.5816|-121.4944|
Washington|DC|US|38.9072|-77.0369|Washington DC;Washington D.C.;DC;D.C.;Washington, D.C.;Washington, DC;DC Metro;DMV;National Capital Region
Reston|VA|US|38.9586|-77.3570|
McLean|VA|US|38.9339|-77.1773|
Herndon|VA|US|38.9696|-77.3861|
Chantilly|VA|US|38.8943|-77.4311|
Alexandria|VA|US|38.8048|-77.0469|
Fairfax|VA|US|38.8462|-77.3064|
Tysons|VA|US|38.9187|-77.2311|Tysons Corner
Sterling|VA|US|39.0062|-77.4286|
Dulles|VA|US|38.9531|-77.4565|
Springfield|VA|US|38.7893|-77.1872|
Dahlgren|VA|US|38.3318|-77.0510|
Quantico|VA|US|38.5221|-77.2930|
Richmond|VA|US|37.5407|-77.4360|
Norfolk|VA|US|36.8508|-76.2859|
Virginia Beach|VA|US|36.8529|-75.9780|
Hampton|VA|US|37.0299|-76.3452|
Bethesda|MD|US|38.9807|-77.1003|
Columbia|MD|US|39.2037|-76.8610|
Annapolis Junction|MD|US|39.1190|-76.7980|
Fort Meade|MD|US|39.1080|-76.7430|
Baltimore|MD|US|39.2904|-76.6122|
Huntsville|AL|US|34.7304|-86.5861|
Colorado Springs|CO|US|38.8339|-104.8214|
Denver|CO|US|39.7392|-104.9903|
Boulder|CO|US|40.0150|-105.2705|
Broomfield|CO|US|39.9205|-105.0867|
Fort Collins|CO|US|40.5853|-105.0844|
Thornton|CO|US|39.8680|-104.9719|
Aurora|CO|US|39.7294|-104.8319|
Chicago|IL|US|41.8781|-87.6298|
Columbus|OH|US|39.9612|-82.9988|
Ashville|OH|US|39.7156|-82.9530|
Dayton|OH|US|39.7589|-84.1916|
Cleveland|OH|US|41.4993|-81.6944|
Cincinnati|OH|US|39.1031|-84.5120|
Mesa|AZ|US|33.4152|-111.8315|
Phoenix|AZ|US|33.4484|-112.0740|
Tempe|AZ|US|33.4255|-111.9400|
Scottsdale|AZ|US|33.4942|-111.9261|
Chandler|AZ|US|33.3062|-111.8413|
Tucson|AZ|US|32.2226|-110.9747|
Portland|OR|US|45.5152|-122.6784|
Hillsboro|OR|US|45.5229|-122.9898|
Beaverton|OR|US|45.4871|-122.8037|
Prineville|OR|US|44.2999|-120.8345|
Salt Lake City|UT|US|40.7608|-111.8910|SLC
Lehi|UT|US|40.3916|-111.8508|
Las Vegas|NV|US|36.1699|-115.1398|
Reno|NV|US|39.5296|-119.8138|
Sparks|NV|US|39.5349|-119.7527|
Albuquerque|NM|US|35.0844|-106.6504|
Boise|ID|US|43.6150|-116.2023|
Miami|FL|US|25.7617|-80.1918|
Miami Beach|FL|US|25.7907|-80.1300|
Orlando|FL|US|28.5383|-81.3792|
Tampa|FL|US|27.9506|-82.4572|
Jacksonville|FL|US|30.3322|-81.6557|
Melbourne|FL|US|28.0836|-80.6081|
Cape Canaveral|FL|US|28.3922|-80.6077|
Atlanta|GA|US|33.7490|-84.3880|
Raleigh|NC|US|35.7796|-78.6382|
Cary|NC|US|35.7915|-78.7811|
Morrisville|NC|US|35.8235|-78.8256|
Maiden|NC|US|35.5757|-81.2118|
Durham|NC|US|35.9940|-78.8986|
Charlotte|NC|US|35.2271|-80.8431|
Charleston|SC|US|32.7765|-79.9311|
Moncks Corner|SC|US|33.1960|-80.0131|
Nashville|TN|US|36.1627|-86.7816|
Memphis|TN|US|35.1495|-90.0490|
Clarksville|TN|US|36.5298|-87.3595|
Southaven|MS|US|34.9890|-90.0126|
McHenry|MS|US|30.7113|-89.1336|
Minneapolis|MN|US|44.9778|-93.2650|
Detroit|MI|US|42.3314|-83.0458|
Ann Arbor|MI|US|42.2808|-83.7430|
St. Louis|MO|US|38.6270|-90.1994|Saint Louis;St Louis
Kansas City|MO|US|39.0997|-94.5786|
Indianapolis|IN|US|39.7684|-86.1581|
Madison|WI|US|43.0731|-89.4012|
Milwaukee|WI|US|43.0389|-87.9065|
Omaha|NE|US|41.2565|-95.9345|
Lincoln|NE|US|40.8136|-96.7026|
Council Bluffs|IA|US|41.2619|-95.8608|
Waukee|IA|US|41.6117|-93.8852|
Cedar Rapids|IA|US|41.9779|-91.6656|
Fargo|ND|US|46.8772|-96.7898|
Cheyenne|WY|US|41.1400|-104.8202|
Wichita|KS|US|37.6872|-97.3301|
Oklahoma City|OK|US|35.4676|-97.5164|
Pryor Creek|OK|US|36.3084|-95.3169|Pryor
Honolulu|HI|US|21.3069|-157.8583|
Anchorage|AK|US|61.2181|-149.9003|
London|England|GB|51.5074|-0.1278|Greater London;London UK;City of London
!Cambridge|England|GB|52.2053|0.1218|
Oxford|England|GB|51.7520|-1.2577|
Manchester|England|GB|53.4808|-2.2426|
Newcastle upon Tyne|England|GB|54.9783|-1.6178|Eldon Square
Leicester|England|GB|52.6369|-1.1398|Highcross
Solihull|England|GB|52.4118|-1.7776|Touchwood Centre;Touchwood
Bordeaux||FR|44.8378|-0.5792|Sainte-Catherine, France
Bristol|England|GB|51.4545|-2.5879|
Reading|England|GB|51.4543|-0.9781|
Edinburgh|Scotland|GB|55.9533|-3.1883|
Belfast|Northern Ireland|GB|54.5973|-5.9301|
Dublin||IE|53.3498|-6.2603|Dublinas
Cork||IE|51.8985|-8.4756|
Zurich||CH|47.3769|8.5417|Zürich;Zuerich
Geneva||CH|46.2044|6.1432|Genève;Geneve
Lausanne||CH|46.5197|6.6323|
Paris|Ile-de-France|FR|48.8566|2.3522|Courbevoie;La Défense;La Defense;Rosny 2;Rosny-sous-Bois;Champs Élysées;Champs-Élysées;Opéra, France;Parly 2;Le Chesnay
Berlin||DE|52.5200|13.4050|
Munich|Bavaria|DE|48.1351|11.5820|München;Muenchen
Hamburg||DE|53.5511|9.9937|Jungfernstieg
Frankfurt||DE|50.1109|8.6821|Frankfurt am Main;Grosse Bockenheimer Strasse;Große Bockenheimer Straße
Cologne||DE|50.9375|6.9603|Köln;Koeln
Stuttgart||DE|48.7758|9.1829|
Amsterdam||NL|52.3676|4.9041|Schiphol
Eindhoven||NL|51.4416|5.4697|
Brussels||BE|50.8503|4.3517|Bruxelles;Zaventem
Saint-Ghislain||BE|50.4469|3.8186|
Madrid||ES|40.4168|-3.7038|
Barcelona||ES|41.3874|2.1686|
Zaragoza||ES|41.6488|-0.8891|
Lisbon||PT|38.7223|-9.1393|Lisboa
Milan||IT|45.4642|9.1900|Milano;Piazza Liberty
!Rome||IT|41.9028|12.4964|Roma;Via del Corso
Naples||IT|40.8518|14.2681|Napoli;Marcianise;Campania, Italy
Vienna||AT|48.2082|16.3738|Wien
Linz||AT|48.3069|14.2858|
Prague||CZ|50.0755|14.4378|Praha
Bratislava||SK|48.1486|17.1077|
Warsaw||PL|52.2297|21.0122|Warszawa
Krakow||PL|50.0647|19.9450|Kraków
Stockholm||SE|59.3293|18.0686|
Malmö||SE|55.6050|13.0038|Malmo;Emporia, Sweden
Gävle||SE|60.6749|17.1413|Gavle
Copenhagen||DK|55.6761|12.5683|København
Oslo||NO|59.9139|10.7522|
Stavanger||NO|58.9700|5.7331|
Zagreb||HR|45.8150|15.9819|
Belgrade||RS|44.7866|20.4489|Beograd
Helsinki||FI|60.1699|24.9384|HKI
Vaasa||FI|63.0960|21.6158|
Hamina||FI|60.5697|27.1981|
Tallinn||EE|59.4370|24.7536|
Bucharest||RO|44.4268|26.1025|
Athens||GR|37.9838|23.7275|
Istanbul||TR|41.0082|28.9784|Akasya
Kyiv||UA|50.4501|30.5234|Kiev
Lviv||UA|49.8397|24.0297|Lvov;Lwów
The Hague||NL|52.0705|4.3007|Den Haag
Tel Aviv||IL|32.0853|34.7818|Tel Aviv-Yafo;Tel-Aviv
Herzliya||IL|32.1663|34.8433|Herzliya Pituah
Ra'anana||IL|32.1848|34.8713|Raanana
Yokneam||IL|32.6593|35.1052|Yokne'am Illit;Yokneam Illit;Yokne'am
Beersheba||IL|31.2518|34.7913|Be'er Sheva;Beer Sheva
Haifa||IL|32.7940|34.9896|
Jerusalem||IL|31.7683|35.2137|
Rawabi||PS|32.0094|35.1886|
Dubai||AE|25.2048|55.2708|Dubai Mall;The Dubai Mall
Abu Dhabi||AE|24.4539|54.3773|
Riyadh||SA|24.7136|46.6753|
Jeddah||SA|21.4858|39.1925|Jiddah
Dammam||SA|26.4207|50.0888|Dhahran;Khobar;Al Khobar
Kuwait City||KW|29.3759|47.9774|
Yerevan||AM|40.1792|44.4991|
Doha||QA|25.2854|51.5310|
Tokyo||JP|35.6762|139.6503|Minato;Minato City;Minato-ku;Shibuya;Chiyoda
Osaka||JP|34.6937|135.5023|Shinsaibashi;Umeda
Fukuoka||JP|33.5902|130.4017|Fukuoka Tenjin;Tenjin, Japan
Yokohama||JP|35.4437|139.6380|
Seoul||KR|37.5665|126.9780|
Beijing||CN|39.9042|116.4074|
Shanghai||CN|31.2304|121.4737|
Shenzhen||CN|22.5431|114.0579|
Suzhou||CN|31.2989|120.5853|
Chengdu||CN|30.5728|104.0668|
Xi'an||CN|34.3416|108.9398|Xian
Hong Kong||HK|22.3193|114.1694|Hong Kong Island
Macao||MO|22.1987|113.5439|Macau
Taipei||TW|25.0330|121.5654|Taipei City
New Taipei||TW|25.0120|121.4657|New Taipei City
Hsinchu||TW|24.8138|120.9675|
Singapore||SG|1.3521|103.8198|
Kuala Lumpur||MY|3.1390|101.6869|Klang Valley
Johor Bahru||MY|1.4927|103.7414|
Jakarta||ID|-6.2088|106.8456|
Manila||PH|14.5995|120.9842|
Bangkok||TH|13.7563|100.5018|
Ho Chi Minh City||VN|10.8231|106.6297|Saigon
Hanoi||VN|21.0278|105.8342|
Bengaluru||IN|12.9716|77.5946|Bangalore
Hyderabad||IN|17.3850|78.4867|
Mumbai||IN|19.0760|72.8777|Bombay;BKC;Bandra Kurla Complex
Pune||IN|18.5204|73.8567|
New Delhi||IN|28.6139|77.2090|Delhi
Gurugram||IN|28.4595|77.0266|Gurgaon
Noida||IN|28.5355|77.3910|
Chennai||IN|13.0827|80.2707|
Sydney|NSW|AU|-33.8688|151.2093|Alexandria;Penrith;North Sydney;Parramatta
!Melbourne|VIC|AU|-37.8136|144.9631|
Brisbane|QLD|AU|-27.4698|153.0251|
Canberra|ACT|AU|-35.2809|149.1300|Belconnen
Adelaide||AU|-34.9285|138.6007|
Perth||AU|-31.9505|115.8605|
Hobart|TAS|AU|-42.8821|147.3272|
Wollongong|NSW|AU|-34.4278|150.8931|
Auckland||NZ|-36.8485|174.7633|
Wellington||NZ|-41.2865|174.7762|
Toronto|ON|CA|43.6532|-79.3832|
Waterloo|ON|CA|43.4643|-80.5204|
Ottawa|ON|CA|45.4215|-75.6972|
Montreal|QC|CA|45.5017|-73.5673|Montréal
Vancouver|BC|CA|49.2827|-123.1207|Coquitlam;Coquitlam Centre;Guildford Town Centre;Richmond Centre
Victoria|BC|CA|48.4284|-123.3656|
Calgary|AB|CA|51.0447|-114.0719|
Edmonton|AB|CA|53.5461|-113.4938|Southgate Centre
Winnipeg|MB|CA|49.8951|-97.1384|Polo Park
Halifax|NS|CA|44.6488|-63.5752|
Quebec City|QC|CA|46.8139|-71.2080|Québec City;Ville de Québec;Place Ste-Foy;Sainte-Foy
Kitchener|ON|CA|43.4516|-80.4925|Kitchener-Waterloo
Saskatoon|SK|CA|52.1332|-106.6700|
Regina|SK|CA|50.4452|-104.6189|
Mexico City||MX|19.4326|-99.1332|CDMX;Ciudad de México;Antara, Mexico;Antara Polanco
Guadalajara||MX|20.6597|-103.3496|
Sao Paulo||BR|-23.5505|-46.6333|São Paulo;Morumbi
Rio de Janeiro||BR|-22.9068|-43.1729|VillageMall;Village Mall
Brasília||BR|-15.7939|-47.8828|Brasilia
Belo Horizonte||BR|-19.9167|-43.9345|
Buenos Aires||AR|-34.6037|-58.3816|
Bogota||CO|4.7110|-74.0721|Bogotá
Santiago||CL|-33.4489|-70.6693|
Lima||PE|-12.0464|-77.0428|
San José||CR|9.9281|-84.0907|San Jose
Cape Town||ZA|-33.9249|18.4241|
Johannesburg||ZA|-26.2041|28.0473|
Nairobi||KE|-1.2921|36.8219|
Lagos||NG|6.5244|3.3792|
Accra||GH|5.6037|-0.1870|
Cairo||EG|30.0444|31.2357|
`;

// ---------------------------------------------------------------------------
// Build indexes
// ---------------------------------------------------------------------------

const STATES = new Map(); // key (abbr lower or name) -> state
const STATE_BY_ABBR = new Map();
for (const line of US_STATES_RAW.trim().split('\n')) {
  const [abbr, name, lat, lng] = line.split('|');
  const st = { abbr, name, country: 'US', lat: +lat, lng: +lng };
  STATE_BY_ABBR.set(abbr, st);
  STATES.set(normKey(name), st);
}
STATES.set('washington state', STATE_BY_ABBR.get('WA'));
STATES.set('washington dc', STATE_BY_ABBR.get('DC'));

const REGIONS = new Map(); // non-US regions: key -> region
const REGION_BY_CODE = new Map();
const REGION_BY_CODE_COUNTRY = new Map(); // "CT|ES" -> Catalonia (codes repeat across countries)
for (const line of OTHER_REGIONS_RAW.trim().split('\n')) {
  const [code, name, country, lat, lng, aliases] = line.split('|');
  const r = { abbr: code, name, country, lat: +lat, lng: +lng };
  REGION_BY_CODE.set(code, r);
  REGION_BY_CODE_COUNTRY.set(`${code}|${country}`, r);
  for (const k of [code, name, ...(aliases ? aliases.split(';') : [])]) REGIONS.set(normKey(k), r);
}

const COUNTRIES = new Map(); // key -> country
const COUNTRY_BY_CODE = new Map();
// DQ-40 (fix wave 5): ISO 3166 alpha-3 codes as Amazon writes them at the end of a place
// ("Bratislava, Bratislavský kraj, SVK", "Enns, Upper Austria, AUT"). Read only when written in
// capitals (a lower-case "can" or "per" is a word, not a country).
const ISO3_TO_ISO2 = Object.freeze(Object.fromEntries(`USA US|CAN CA|MEX MX|CRI CR|BRA BR|ARG AR|CHL CL|COL CO|PER PE|URY UY|GBR GB|IRL IE|FRA FR|DEU DE|NLD NL|BEL BE|LUX LU|CHE CH|AUT AT|ITA IT|ESP ES|PRT PT|SWE SE|NOR NO|DNK DK|FIN FI|ISL IS|EST EE|LVA LV|LTU LT|POL PL|CZE CZ|HUN HU|ROU RO|BGR BG|SRB RS|HRV HR|SVK SK|SVN SI|GRC GR|TUR TR|UKR UA|ARM AM|ISR IL|KWT KW|BHR BH|JOR JO|ARE AE|SAU SA|QAT QA|EGY EG|NGA NG|GHA GH|KEN KE|ZAF ZA|IND IN|PAK PK|JPN JP|KOR KR|CHN CN|HKG HK|MAC MO|TWN TW|SGP SG|MYS MY|IDN ID|PHL PH|THA TH|VNM VN|AUS AU|NZL NZ`.split('|').map((x) => x.split(' '))));
for (const line of COUNTRIES_RAW.trim().split('\n')) {
  const [code, name, lat, lng, aliases] = line.split('|');
  const c = { code, name, lat: +lat, lng: +lng };
  COUNTRY_BY_CODE.set(code, c);
  COUNTRIES.set(normKey(name), c);
  for (const a of aliases ? aliases.split(';') : []) COUNTRIES.set(normKey(a), c);
}
// Amazon writes Puerto Rico's alpha-3 code as a place of its own ("San Juan, Puerto Rico" next to
// "PRI"); the gazetteer keeps Puerto Rico with the US states (fix6-fresh-data).
const ISO3_US_TERRITORY = Object.freeze({ PRI: 'PR' });

// fix6-fresh-data (D-23): the English name of an ISO 3166-1 alpha-2 code the table above lacks,
// from the runtime's own region names (Intl.DisplayNames, as public/app.js names countries), so a
// country new to a board reads "Jordan", not "JO". User-assigned and grouping codes ("ZZ" is
// "Unknown Region", "EU", "UN", "QO") are not countries; XK (Kosovo) is.
const NOT_A_COUNTRY_RE = /^(?:AA|Q[M-Z]|X[A-JL-Z]|ZZ|EU|EZ|UN|UK)$/;
let regionNames;
/** English name of an ISO2 country code: the gazetteer's, else the runtime's; null if none. */
export function countryName(code) {
  const c = String(code || '');
  if (COUNTRY_BY_CODE.has(c)) return COUNTRY_BY_CODE.get(c).name;
  if (!/^[A-Z]{2}$/.test(c) || NOT_A_COUNTRY_RE.test(c)) return null;
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    const n = regionNames.of(c);
    return n && n !== c ? n : null;
  } catch {
    return null; // a runtime without Intl.DisplayNames
  }
}

const CITIES = []; // all entries
const CITY_INDEX = new Map(); // key -> [entries], default first
for (const line of CITIES_RAW.trim().split('\n')) {
  const [rawName, region, country, lat, lng, aliases] = line.split('|');
  const preferred = rawName.startsWith('!');
  const name = preferred ? rawName.slice(1) : rawName;
  const c = { city: name, region: region || null, country, lat: +lat, lng: +lng };
  CITIES.push(c);
  for (const k of [name, ...(aliases ? aliases.split(';') : [])]) {
    const key = normKey(k);
    if (!key) continue;
    const list = CITY_INDEX.get(key) || [];
    if (preferred) list.unshift(c);
    else list.push(c);
    CITY_INDEX.set(key, list);
  }
}
// Keys sorted longest-first for substring scanning.
const CITY_KEYS_BY_LENGTH = [...CITY_INDEX.keys()].filter((k) => k.length >= 4).sort((a, b) => b.length - a.length);

/** Number of distinct gazetteer cities (for tests / diagnostics). */
export const GAZETTEER_SIZE = { cities: CITIES.length, states: STATE_BY_ABBR.size, countries: COUNTRY_BY_CODE.size };

// ---------------------------------------------------------------------------
// Token classification
// ---------------------------------------------------------------------------

const REMOTE_RE = /\b(remote|anywhere|work from home|wfh|distributed|virtual)\b/i;

/**
 * Classify a single token as a region/country context.
 * Returns { region, country, lat, lng, kind } or null.
 * Two-letter uppercase tokens resolve to US states before country codes
 * ("CA" = California, "IN" = Indiana, ...).
 */
function regionInfo(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const compact = raw.replace(/\./g, '');
  if (/^[A-Z]{2}$/.test(compact) && STATE_BY_ABBR.has(compact)) {
    const s = STATE_BY_ABBR.get(compact);
    return { kind: 'state', region: s.abbr, country: 'US', lat: s.lat, lng: s.lng };
  }
  const key = normKey(raw);
  if (!key) return null;
  if (STATES.has(key)) {
    const s = STATES.get(key);
    return { kind: 'state', region: s.abbr, country: 'US', lat: s.lat, lng: s.lng };
  }
  if (ISO3_US_TERRITORY[compact]) { // capitals only, as for the alpha-3 countries below
    const s = STATE_BY_ABBR.get(ISO3_US_TERRITORY[compact]);
    return { kind: 'state', region: s.abbr, country: 'US', lat: s.lat, lng: s.lng };
  }
  if (/^[A-Z]{3}$/.test(compact) && ISO3_TO_ISO2[compact] && COUNTRY_BY_CODE.has(ISO3_TO_ISO2[compact])) {
    const c = COUNTRY_BY_CODE.get(ISO3_TO_ISO2[compact]);
    return { kind: 'country', region: null, country: c.code, lat: c.lat, lng: c.lng };
  }
  if (COUNTRIES.has(key)) {
    // A bare 2-letter alias like "us" only counts when written in caps.
    if (key.length === 2 && !/^[A-Z]{2}$/.test(compact)) return null;
    const c = COUNTRIES.get(key);
    return { kind: 'country', region: null, country: c.code, lat: c.lat, lng: c.lng };
  }
  if (REGIONS.has(key)) {
    const r = REGIONS.get(key);
    if (r.abbr.length <= 3 && !/^[A-Z]{2,3}$/.test(compact) && key.length <= 3) return null;
    return { kind: 'region', region: r.abbr, country: r.country, lat: r.lat, lng: r.lng };
  }
  return null;
}

function isKnownCity(token) {
  return CITY_INDEX.has(normKey(token));
}

/** ISO2 code for a country name, alias or code ("United States of America" -> "US"), or null. */
export function countryCode(name) {
  const raw = String(name || '').trim();
  if (/^[A-Z]{2}$/.test(raw) && COUNTRY_BY_CODE.has(raw)) return raw;
  const c = COUNTRIES.get(normKey(raw));
  return c ? c.code : null;
}

// The tail of an inverted ISO country name, "Korea, Republic of" (Apple and Netflix write "Seoul,
// Korea, Republic of"; DQ-10). It belongs to the country before it and is never a place itself.
const INVERTED_TAIL_RE = /^(?:the\s+)?(?:(?:islamic|united|democratic|people[’']?s|bolivarian|federal|arab|socialist|plurinational|federated|former\s+yugoslav)\s+)*(?:republic|state|states|province|kingdom)\s+of(?:\s+the)?$/i;

// Place names in a local script, or local abbreviations, that boards write instead of the English
// name (D-23: NVIDIA and Microsoft "ב"ש, South District, IL"; "กทม, Bangkok, TH"). normKey drops
// non-Latin letters, so these are matched on the exact token.
const LOCAL_NAMES = new Map([
  ['ב"ש', 'Beersheba'], ['באר שבע', 'Beersheba'], ['תל אביב', 'Tel Aviv'], ['תל אביב-יפו', 'Tel Aviv'],
  ['חיפה', 'Haifa'], ['ירושלים', 'Jerusalem'], ['יקנעם', 'Yokneam'], ['יקנעם עילית', 'Yokneam'],
  ['רעננה', "Ra'anana"], ['הרצליה', 'Herzliya'], ['กทม', 'Bangkok'], ['กรุงเทพมหานคร', 'Bangkok'],
]);
const localName = (t) => LOCAL_NAMES.get(String(t || '').trim().replace(/[״“”]/g, '"')) || null;
// Approximate centres of the districts the Eightfold boards name next to an unreadable city.
const DISTRICT_CENTRES = {
  'IL|haifa district': [32.62, 35.05], 'IL|north district': [32.95, 35.45], 'IL|center district': [32.0, 34.9],
  'IL|tel aviv district': [32.08, 34.8], 'IL|south district': [30.85, 34.8], 'IL|jerusalem district': [31.75, 35.05],
};
/** A token with no Latin letter or digit ("ק"א"): a local-script name the gazetteer cannot read. */
const unreadable = (t) => !!String(t || '').trim() && !/[A-Za-z0-9]/.test(String(t));

// ---------------------------------------------------------------------------
// splitLocations
// ---------------------------------------------------------------------------

/** Split on a regex but never inside parentheses/brackets. */
function splitTopLevel(str, re) {
  const holes = [];
  const masked = str.replace(/\([^()]*\)|\[[^\[\]]*\]/g, (m) => {
    holes.push(m);
    return `\u0000${holes.length - 1}\u0000`;
  });
  return masked
    .split(re)
    .map((p) => p.replace(/\u0000(\d+)\u0000/g, (_, i) => holes[+i]))
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Group "City, ST, City2, ST2" style comma lists into separate locations. */
function splitCommaGroups(part) {
  const tokens = splitTopLevel(part, /\s*,\s*/);
  if (tokens.length <= 1) return tokens;
  const groups = [];
  let cur = null;
  for (const tok of tokens) {
    const isRemote = REMOTE_RE.test(tok);
    const reg = regionInfo(tok);
    if (!cur) {
      cur = { toks: [tok], hasRegion: false, remote: isRemote };
      continue;
    }
    if (INVERTED_TAIL_RE.test(tok)) { cur.toks.push(tok); continue; } // "Seoul, Korea, Republic of"
    if (reg && !isRemote && !(isKnownCity(tok) && cur.hasRegion)) {
      cur.toks.push(tok);
      cur.hasRegion = true;
      continue;
    }
    if (isRemote && !cur.remote) {
      groups.push(cur);
      cur = { toks: [tok], hasRegion: false, remote: true };
      continue;
    }
    // A new city starts a new group when the current one is already complete
    // (has a region) or when both are known cities ("San Francisco, Seattle").
    const curIsCity = isKnownCity(cur.toks[0]);
    if (isKnownCity(tok) && (cur.hasRegion || curIsCity || cur.remote)) {
      groups.push(cur);
      cur = { toks: [tok], hasRegion: false, remote: false };
      continue;
    }
    if (cur.hasRegion && !reg) {
      groups.push(cur);
      cur = { toks: [tok], hasRegion: false, remote: isRemote };
      continue;
    }
    cur.toks.push(tok);
  }
  if (cur) groups.push(cur);
  return groups.map((g) => g.toks.join(', '));
}

/**
 * Split a raw multi-location string into individual location strings.
 * Separators: "|", ";", newline, " / ", " or ", "&", and comma lists like
 * "San Francisco, CA, New York, NY".
 */
export function splitLocations(str) {
  if (str == null) return [];
  if (Array.isArray(str)) return dedupe(str.flatMap((s) => splitLocations(s)));
  const s = String(str).replace(/\s+/g, ' ').trim();
  if (!s) return [];
  const coarse = splitTopLevel(s, /\s*[|;\n•]\s*|\s+\/\s+|\s+or\s+|\s*&\s*|\s+and\s+(?=[A-Z])/);
  const out = [];
  for (const part of coarse) {
    for (const p of splitCommaGroups(part)) {
      const t = p.replace(/^[\s,\-–—]+|[\s,\-–—]+$/g, '');
      if (t) out.push(t);
    }
  }
  return dedupe(out);
}

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = normKey(x) || x;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

// ---------------------------------------------------------------------------
// geocode
// ---------------------------------------------------------------------------

const NOISE_RE = /\b(prefecture|metropolis|province|hybrid|on-?site|in-?office|office|offices|hq|headquarters|campus|metro(politan)?( area)?|area|greater|region|based|only|preferred)\b/gi;

function cleanPlace(s) {
  return s
    .replace(/\([^()]*\)/g, ' ')
    .replace(/\[[^[\]]*\]/g, ' ')
    .replace(NOISE_RE, ' ')
    .replace(/\s+[-–—]\s+/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
}

function parens(s) {
  return [...s.matchAll(/\(([^()]*)\)/g)].flatMap((m) => m[1].split(/\s*[,/]\s*/)).filter(Boolean);
}

function pickCity(cands, ctx) {
  if (!cands || !cands.length) return null;
  if (!ctx.length) return cands[0];
  const regions = ctx.map((c) => c.region).filter(Boolean);
  const countries = ctx.map((c) => c.country).filter(Boolean);
  const byRegion = cands.find((c) => c.region && regions.includes(c.region));
  if (byRegion) return byRegion;
  // A country match only when the context names no state or region in that country:
  // "Springfield, IL" is not Springfield, VA (P-9, norm-6).
  const stated = new Set(ctx.filter((c) => c.region && c.kind !== 'country').map((c) => c.country));
  const byCountry = cands.find((c) => countries.includes(c.country) && !stated.has(c.country));
  if (byCountry) return byCountry;
  return null; // known name but context says elsewhere
}

function fromCity(name, c, remote = false) {
  return { name, city: c.city, region: c.region, country: c.country, lat: c.lat, lng: c.lng, remote };
}

function fromRegion(name, r, city = null, remote = false) {
  return { name, city, region: r.region, country: r.country, lat: r.lat, lng: r.lng, remote };
}

function unknown(name, remote = false) {
  return { name, city: null, region: null, country: null, lat: null, lng: null, remote };
}

/**
 * The readings of a bare place name that has no context of its own, default first:
 * its gazetteer cities, then a non-US region of the same name ("Victoria" is a city in
 * British Columbia and a state of Australia; "Melbourne" is in Australia and Florida).
 * More than one country means the job's other locations decide (geocodeMany).
 */
function bareReadings(cleaned, cities) {
  const out = cities.map((c) => ({ country: c.country, city: c }));
  const key = normKey(cleaned);
  const r = REGIONS.get(key);
  if (r && !STATES.has(key) && key.length > 3) out.push({ country: r.country, region: { kind: 'region', region: r.abbr, country: r.country, lat: r.lat, lng: r.lng } });
  return out;
}

/**
 * Resolve a non-remote place string to a Location. `countries`: the countries of the
 * job's other locations (P-9), used only for a bare name with readings in several
 * countries. Returns { loc, ambiguous }.
 */
function resolvePlaceIn(name, countries = []) {
  const cleaned = cleanPlace(name);
  const extra = parens(name).map(regionInfo).filter(Boolean);
  if (!cleaned) return { loc: extra.length ? fromRegion(name, extra[0]) : unknown(name), ambiguous: false };

  // Whole-string alias ("Washington, D.C.", "New York City", "Bay Area").
  const whole = CITY_INDEX.get(normKey(name.replace(/\([^()]*\)/g, ' '))) || CITY_INDEX.get(normKey(cleaned));
  if (whole) {
    if (!extra.length && !cleaned.includes(',')) {
      const readings = bareReadings(cleaned, whole);
      if (new Set(readings.map((r) => r.country)).size > 1) {
        const pick = readings.find((r) => countries.includes(r.country)) || readings[0];
        return { loc: pick.city ? fromCity(name, pick.city) : fromRegion(name, pick.region), ambiguous: true };
      }
    }
    const c = pickCity(whole, extra) || whole[0];
    return { loc: fromCity(name, c), ambiguous: false };
  }
  return { loc: resolvePlaceTokens(name, cleaned, extra), ambiguous: false };
}

// The final token of "City, Region, CC" read as an ISO country code (DQ-1, P-9). Eightfold
// boards (Microsoft, NVIDIA) write "Bengaluru, KA, IN", "Tel Aviv-Yafo, Tel Aviv District, IL",
// "Munich, BY, DE", "Jakarta, ID", "San José, San José Province, CR" and "Stavanger, Rogaland,
// NO"; before norm-6 a code that is also a US state (IN Indiana, IL Illinois, DE Delaware, ID
// Idaho, CA California) was always the state, and a code with no alias (NO, BR, SA, BE) was
// nothing. A US "City, ST" string ("Boise, ID", "Columbus, IN", "Aliso Viejo, CA") keeps its
// state: the code is a country only when the shape says so (a known city in that country, a
// non-US subdivision before it, or a third part), never for a city the gazetteer knows elsewhere.
const NON_US_SUBDIVISION_RE = /\b(?:district|province|prefecture|governorate|oblast|state of|region|county)\b/i;
function finalCountry(token, cands, tokens) {
  const t = String(token || '').replace(/\./g, '');
  if (!/^[A-Z]{2}$/.test(t) || !COUNTRY_BY_CODE.has(t)) return null;
  const plain = regionInfo(t);
  if (plain && plain.kind === 'country') return null; // "UK", "NL", "FR": regionInfo already says so
  const c = COUNTRY_BY_CODE.get(t);
  const asCountry = { kind: 'country', region: null, country: c.code, lat: c.lat, lng: c.lng };
  const known = cands || [];
  if (known.some((k) => k.country === c.code)) return asCountry; // Bengaluru is in India, Jakarta in Indonesia
  if (!plain) return tokens.length > 2 || !known.length ? asCountry : null; // "Stavanger, Rogaland, NO"; not "Adelaide, SA"
  if (known.some((k) => k.country === plain.country)) return null; // "Columbus, IN" is Indiana, "Boise, ID" Idaho
  const middle = tokens.slice(1, -1);
  if (middle.some((m) => (NON_US_SUBDIVISION_RE.test(m) && !/\bcounty\b/i.test(m)) || (/^[A-Z]{2,3}$/.test(m) && !STATE_BY_ABBR.has(m)))) return asCountry; // "North District", "KA"
  const lead = tokens.length > 1 ? regionInfo(tokens[0]) : null;
  if (lead && lead.kind === 'region' && lead.country === c.code) return asCountry; // "ON, CA", "Bavaria, DE"
  return null;
}

const US_ZIP_RE = /^([A-Z]{2})\s+\d{5}(?:-\d{4})?$/;

/** "City, Region" / "City, Country" / "Region" / unknown-city fallbacks of resolvePlaceIn. */
function resolvePlaceTokens(name, cleaned, extra) {
  let tokens = cleaned.split(/\s*,\s*/).filter(Boolean);
  // "Seoul, Korea, Republic of": the tail adds nothing to the country before it (DQ-10).
  if (tokens.length > 1) tokens = tokens.filter((t, i) => i === 0 || !INVERTED_TAIL_RE.test(t));
  // Apple's "City-CC" names ("Klang Valley-MY, Malaysia", "Xi’an-CN, China", "Riyadh-SA, Saudi
  // Arabia"): the suffix is the country's ISO code, not part of the name (DQ-10).
  const cc = /^(.*\S)-([A-Z]{2})$/.exec(tokens[0] || '');
  if (cc && COUNTRY_BY_CODE.has(cc[2])) {
    const stated = tokens.slice(1).map(countryCode).filter(Boolean);
    if (!stated.length || stated.includes(cc[2])) tokens = [cc[1], ...tokens.slice(1)];
  }
  // A local-script name or abbreviation with a known English name ("ב"ש" is Be'er Sheva).
  tokens = tokens.map((t) => localName(t) || t);
  // DQ-31: a US state with its ZIP code ("Moncks Corner, SC 29461, USA") is the state.
  tokens = tokens.map((t) => { const z = US_ZIP_RE.exec(t); return z && STATE_BY_ABBR.has(z[1]) ? z[1] : t; });
  // A bare ISO code is a country, even one that is also a US state's code: Eightfold lists
  // "DE", "IN", "IL", "CA" for postings in Germany, India, Israel and Canada (DQ-1). No other
  // board in the 13 snapshots writes a bare two-letter location.
  if (tokens.length === 1 && /^[A-Z]{2}$/.test(tokens[0]) && COUNTRY_BY_CODE.has(tokens[0])) {
    const c = COUNTRY_BY_CODE.get(tokens[0]);
    return fromRegion(name, { region: null, country: c.code, lat: c.lat, lng: c.lng });
  }
  // A bare code of a country the gazetteer lacks, and nothing else ("WA", "ON" and "MD" are
  // regions first): that country by name, with no coordinates (D-23, fix6-fresh-data).
  if (tokens.length === 1 && /^[A-Z]{2}$/.test(tokens[0]) && !regionInfo(tokens[0]) && countryName(tokens[0])) {
    return fromRegion(name, { region: null, country: tokens[0], lat: null, lng: null });
  }
  // "Seattle WA" / "Austin TX" / "Sydney NSW, Australia" without comma.
  const m = tokens[0].match(/^(.*\S)\s+([A-Z]{2,3}|[A-Z]\.[A-Z]\.)$/);
  if (m && regionInfo(m[2]) && isKnownCity(m[1])) tokens = [m[1], m[2], ...tokens.slice(1)];
  const [first, ...rest] = tokens;
  const cands = CITY_INDEX.get(normKey(first));
  const lastToken = rest.length ? rest[rest.length - 1] : null;
  // "BG, RS": a city's own subdivision code before its country (Microsoft writes Belgrade so).
  if (!cands && rest.length === 1 && /^[A-Z]{2,3}$/.test(first)) {
    const country = countryCode(rest[0]);
    const r = country && REGION_BY_CODE_COUNTRY.get(`${first}|${country}`);
    const city = r && (CITY_INDEX.get(normKey(r.name)) || []).find((c) => c.country === country);
    if (city) return fromCity(name, city);
  }
  const final = lastToken ? finalCountry(lastToken, cands, tokens) || regionInfo(lastToken) : null;
  let ctx = [...rest.slice(0, -1).map(regionInfo), final].filter(Boolean);
  // A stated non-US country overrides US-state readings of the parts before it:
  // "Middenmeer, NH, NL" is North Holland, not New Hampshire.
  if (final && final.kind === 'country' && final.country !== 'US') ctx = ctx.filter((c) => c.kind !== 'state');
  ctx = [...ctx, ...extra];

  if (cands) {
    const c = pickCity(cands, ctx);
    if (c) return fromCity(name, c);
    // "Barcelona, CT", "Madrid, MD", "Zaragoza, AR": a city the gazetteer knows only outside
    // the US, with its own region's ISO 3166-2 code, which is also a US state's (Catalonia,
    // Madrid, Aragon). "Dublin, CA" and "Vienna, VA" stay in the US: CA and VA are not Irish or
    // Austrian region codes.
    if (rest.length === 1 && !cands.some((k) => k.country === 'US')) {
      const code = rest[0].replace(/\./g, '');
      const local = cands.find((k) => REGION_BY_CODE_COUNTRY.has(`${code}|${k.country}`) && (!k.region || k.region === code));
      if (local) return fromCity(name, local);
    }
  }
  // "กทม, Bangkok, TH": the city is a later token (never a region or country token).
  for (const t of rest) {
    if (regionInfo(t)) continue;
    const later = CITY_INDEX.get(normKey(t));
    const c = later && ctx.length && pickCity(later, ctx);
    if (c) return fromCity(name, c);
  }
  const firstAsRegion = regionInfo(first);
  // "California, United States" / "UK" / "Germany"; and "Victoria, Australia", where the
  // name is also a city elsewhere (Victoria, BC) but the context is the region's country.
  // Not when a different country is stated: "BG, RS" is Belgrade, Serbia, not Bulgaria.
  const otherCountry = ctx.some((c) => c.kind === 'country') && !ctx.some((c) => firstAsRegion && c.country === firstAsRegion.country);
  if (firstAsRegion && !otherCountry && (!cands || ctx.some((c) => c.country === firstAsRegion.country))) {
    return fromRegion(name, firstAsRegion);
  }
  // Unknown city with a known region/country -> region centroid (approximate).
  if (ctx.length) {
    const best = ctx.find((c) => c.kind === 'state' || c.kind === 'region') || ctx[0];
    // A local-script name the gazetteer cannot read ("ק"א, Haifa District, IL") is not shown as
    // a city: the place is the district the posting names, in that country (D-23).
    if (unreadable(first)) {
      const district = rest.slice(0, -1).find((t) => NON_US_SUBDIVISION_RE.test(t) && !regionInfo(t));
      if (!district || best.kind !== 'country') return fromRegion(name, best);
      const [lat, lng] = DISTRICT_CENTRES[`${best.country}|${normKey(district)}`] || [best.lat, best.lng];
      return { ...fromRegion(name, best), region: district, lat, lng };
    }
    return fromRegion(name, best, first);
  }
  // Last resort: look for a known city name inside the string.
  const key = ` ${normKey(cleaned)} `;
  for (const k of CITY_KEYS_BY_LENGTH) {
    if (key.includes(` ${k} `)) return fromCity(name, CITY_INDEX.get(k)[0]);
  }
  return unknown(name);
}

/** Resolve a remote-ish string ("Remote (US)", "Remote-Friendly", "US Remote"). */
function resolveRemote(name) {
  const stripped = name
    .replace(/\b(remote|friendly|first|anywhere|work from home|wfh|distributed|virtual|travel|required|optional|eligible|only|based|within|in|the|hybrid|or)\b/gi, ' ')
    .replace(/[()[\]\-–—:/]+/g, ' , ')
    .replace(/\s+/g, ' ');
  const pieces = stripped.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
  for (const p of pieces) {
    const r = regionInfo(p);
    if (r) {
      const country = COUNTRY_BY_CODE.get(r.country);
      return {
        name, city: null, region: r.kind === 'country' ? null : r.region, country: r.country,
        lat: country ? country.lat : null, lng: country ? country.lng : null, remote: true,
      };
    }
    const cands = CITY_INDEX.get(normKey(p));
    if (cands) {
      const c = cands[0];
      const country = COUNTRY_BY_CODE.get(c.country);
      return { name, city: null, region: null, country: c.country, lat: country ? country.lat : null, lng: country ? country.lng : null, remote: true };
    }
  }
  return unknown(name, true);
}

/**
 * Geocode a raw (possibly multi-) location string into Location objects:
 * { name, city, region, country, lat, lng, remote }.
 * Unknown places keep their name with lat/lng null.
 */
const COUNTRY_LABEL = { GB: 'UK', US: 'US' };
const countryLabel = (code) => COUNTRY_LABEL[code] || countryName(code) || code;
function regionLabel(region, country) {
  if (country === 'US' && STATE_BY_ABBR.has(region)) return STATE_BY_ABBR.get(region).name;
  const r = REGION_BY_CODE.get(region);
  return r ? r.name : region;
}

/**
 * Canonical display name (UX-3) so one place is one filter entry:
 * remote -> "Remote" / "Remote (US)" / "Remote (Canada)"; city -> "San Francisco, CA" (US) or
 * "Tokyo, Japan" / "London, UK"; region only -> "Ontario, Canada";
 * country only -> "Germany"; unknown -> the raw string, trimmed.
 */
export function canonicalName(loc) {
  if (!loc) return '';
  if (loc.remote) return loc.country ? `Remote (${countryLabel(loc.country)})` : 'Remote'; // "Remote (Canada)", not the ambiguous "(CA)"
  if (loc.city && loc.country) {
    if (loc.country === 'US') return loc.region ? `${loc.city}, ${loc.region}` : loc.city;
    const cl = countryLabel(loc.country);
    return normKey(cl) === normKey(loc.city) ? loc.city : `${loc.city}, ${cl}`; // city-states: "Singapore"
  }
  if (loc.region && loc.country) return `${regionLabel(loc.region, loc.country)}, ${countryLabel(loc.country)}`;
  if (loc.country && (loc.lat != null || !COUNTRY_BY_CODE.has(loc.country))) return countryName(loc.country) || loc.country;
  return String(loc.rawName || loc.name || '').replace(/\s+/g, ' ').trim();
}

/**
 * How precisely a Location is placed (diagnostics, P-9): 'city' (a gazetteer city's own
 * coordinates), 'centroid' (a named place the gazetteer does not know, put at its
 * region's or country's centre: the "Alexandria, New South Wales" case), 'region' or
 * 'country' (the string names only that), 'remote', or 'unknown' (no coordinates).
 */
export function locationPrecision(loc) {
  if (!loc) return 'unknown';
  if (loc.remote) return 'remote';
  if (loc.lat == null || loc.lng == null) return 'unknown';
  if (loc.city) {
    const known = (CITY_INDEX.get(normKey(loc.city)) || []).some((c) => c.country === loc.country && c.lat === loc.lat && c.lng === loc.lng);
    return known ? 'city' : 'centroid';
  }
  return loc.region ? 'region' : 'country';
}

const finish = (loc) => {
  const rawName = loc.name;
  return { ...loc, name: canonicalName({ ...loc, rawName }), rawName };
};

/**
 * Geocode all of one job's location strings together (P-9). Each part is resolved on
 * its own first; a bare name with readings in several countries ("Victoria": British
 * Columbia or Australia) then takes the reading in a country the job's other locations
 * name ("Canada | Calgary | Toronto | Victoria" -> Victoria, BC), else its default.
 * Returns the parts' Locations in order (not deduped).
 */
export function geocodeMany(inputs) {
  const parts = [];
  // A dangling "Republic of" (a stored location split from "Seoul, Korea, Republic of" before
  // norm-6) belongs to the country before it (DQ-10).
  for (const s of Array.isArray(inputs) ? inputs : [inputs]) {
    for (const part of splitLocations(s)) if (!(parts.length && INVERTED_TAIL_RE.test(part))) parts.push(part);
  }
  const first = parts.map((part) => (REMOTE_RE.test(part) ? { loc: resolveRemote(part), ambiguous: false } : resolvePlaceIn(part)));
  const sure = [...new Set(first.filter((r) => !r.ambiguous && r.loc.country).map((r) => r.loc.country))];
  return first.map((r, i) => {
    if (!r.ambiguous) return finish(r.loc);
    // No unambiguous neighbour ("Melbourne | Victoria"): the other bare names' defaults.
    const ctx = sure.length ? sure : first.filter((o, k) => k !== i && o.ambiguous && o.loc.country).map((o) => o.loc.country);
    return finish(ctx.length ? resolvePlaceIn(parts[i], ctx).loc : r.loc);
  });
}

/** Geocode one location string; its own parts are each other's context ("Toronto | Victoria"). */
export function geocode(str) {
  return geocodeMany([str]);
}
