// Job families from a posting's title (google-grouping lane, 2026-10-11; docs/process/google-grouping.md).
//
// Google's posting record has no department, team or category field (D-24; server/sources/google.js
// lists its slots), and its careers search cannot be read in pages (robots.txt), so the board's
// own category facet cannot label the whole board. Every other big-tech board groups its postings
// by department or job family (Amazon "Software Development", Microsoft "Software Engineering",
// Apple "Hardware"). This module gives a Google posting the same kind of grouping from its title,
// deterministically, so its chart rows are comparable:
//   - FAMILIES are modelled on the job categories Google's careers site shows (Software
//     Engineering, Technical Program Management, Data Center Operations, Technical Solutions, …),
//     plus Research, Data Science and Analytics, Security and Privacy and Trust and Safety, which
//     the other boards name as departments of their own;
//   - the role noun is the part of the title before the first comma ("Account Manager, Retail"),
//     tried first; then the team part for a few team-only families ("Engineering Analyst, YouTube
//     Trust and Safety"); then the role rules on the team part ("Manager, Government Affairs");
//     then generic role words ("Analyst", "Engineer");
//   - a title none of the rules reads gets no family (null: "No department"), never a guess;
//   - common Japanese, Chinese, Vietnamese and French role words are read too (TRANSLATE).
// The result is labelled where it is shown ("Grouped by job title; Google doesn't publish
// departments"): Job.departmentBasis is 'title' (CONTRACT.md "google-grouping").
// Coverage and accuracy on the real snapshot are measured against a hand-labelled seeded sample
// (test/fixtures/google-families-sample.json; test/google-grouping.test.js).

export const FAMILIES = Object.freeze([
  'Software Engineering', 'Hardware Engineering', 'Research', 'Data Science and Analytics',
  'Technical Program Management', 'Program Management', 'Product Management',
  'User Experience and Design', 'Security and Privacy', 'Data Center Operations', 'Network Engineering',
  'Technical Solutions', 'Developer Relations', 'Technical Writing', 'Information Technology',
  'Sales', 'Partnerships and Business Development', 'Marketing and Communications',
  'Public Policy and Government Affairs', 'Trust and Safety', 'Business Strategy and Operations',
  'Manufacturing and Supply Chain', 'Real Estate and Workplace Services', 'Finance', 'Legal',
  'People Operations', 'Administrative',
]);

const F = Object.fromEntries(FAMILIES.map((f) => [f, f]));

// Role words in the other languages Google posts in, read as their English role words.
const TRANSLATE = [
  [/カスタマー\s*エンジニア|客户工程师|客户工程/g, ' customer engineer '],
  [/フォワード\s*デプロイド\s*エンジニア/g, ' forward deployed engineer '],
  [/プロダクト\s*デプロイ\s*エンジニア/g, ' product deployment engineer '],
  [/ソリューション\s*エンジニア|解决方案架构师/g, ' solutions engineer '],
  [/テクニカル\s*(?:サクセス\s*)?アカウント\s*マネージャー/g, ' technical account manager '],
  [/テクニカル\s*セールス|技術営業/g, ' technical sales '],
  [/ソフトウェア\s*エンジニア|软件工程师|Développeur de logiciels?/gi, ' software engineer '],
  [/テクニカル\s*プログラム\s*マネージャー|Quản lý chương trình kỹ thuật/gi, ' technical program manager '],
  [/プログラム\s*マネージャー|项目经理|Quản lý chương trình/gi, ' program manager '],
  [/プロダクト\s*マーケティング|Quản lý tiếp thị sản phẩm/gi, ' product marketing '],
  [/プロダクト\s*マネージャー/g, ' product manager '],
  [/アカウント\s*ストラテジスト|客户策略|Chuyên viên phụ trách chiến lược tài khoản/gi, ' account strategist '],
  [/アカウント\s*(?:マネージャー|エグゼクティブ|リード)|客户经理|Quản lý Khách hàng/gi, ' account manager '],
  [/インダストリー\s*(?:マネージャー|リード)|行业经理|Quản lý ngành hàng/gi, ' industry manager '],
  [/セールス|営業|销售|ventes|bán hàng|Chuyên viên thương mại|顧客開拓/gi, ' sales '],
  [/アドミニストレイティブ/g, ' administrative '],
  [/リサーチ\s*(?:エンジニア|サイエンティスト)|recherche|chercheur/gi, ' research scientist '],
  [/ストラテジック\s*パートナー(?:シップ)?|战略合作伙伴|业务发展|ビジネス開発/g, ' strategic partner development '],
  [/パートナー\s*(?:セールス|フォワード)/g, ' partner sales '],
  [/ストラテジー\s*[＆&]\s*オペレーション|ストラテジーおよびプランニング/g, ' strategy and operations '],
  [/セキュリティ|Mandiant/g, ' security '],
  [/データセンター/g, ' data center '],
  [/政府対応|公共政策/g, ' government affairs '],
  [/カウンセル/g, ' counsel '],
  [/効果衡量|效果衡量|广告效果/g, ' measurement '],
  [/chất lượng sản phẩm|nhà cung cấp/gi, ' supplier quality '],
  [/độ tin cậy của phần cứng/gi, ' hardware reliability '],
  [/vật liệu/gi, ' materials program '],
  [/Kỹ sư/gi, ' engineer '],
  [/GTM\s*(?:セキュリティ\s*)?リード|GTM 公共部門リード|GTM\s*Lead/gi, ' sales lead '],
];

// Role rules, in order: the first family whose pattern matches wins. Tried on the role part first.
const ROLE = [
  [F['Technical Program Management'], /\btechnical program(?:me)? manag|\btpm\b|\btechnical program management/],
  [F['Data Center Operations'], /\bdata ?cent(?:er|re)s?\b|\bdatacenter/],
  [F['Developer Relations'], /\bdeveloper (?:relations|advocate|advocacy)|\bdevrel\b/],
  [F['Technical Writing'], /\btechnical (?:writ|curriculum)|\bdocumentation (?:engineer|writer)/],
  [F['User Experience and Design'], /\bux\b|\buser experience|\binteraction design|\bvisual design|\bdesigner\b|\bdesign (?:lead|manager|director)\b|\bcontent design|\bux research|\bresearcher, ux/],
  [F['Technical Solutions'], /\bcustomer (?:engineer|engineering|success engineer)|\btechnical account manag|\bforward deployed|\bdeployment engineer|\bsolutions? (?:engineer|consultant|architect|specialist|builder)|\btechnical solutions?\b|\bfield application|\boutcome (?:customer )?engineer|\bcloud ai engineer|\b(?:product|technical|customer) support|\bsupport (?:engineer|manager|specialist|lead)|\bsupportability|\bimplementation (?:engineer|specialist|consultant|lead|expert)|\bmeasurement implementation|\bprofessional services|\bdelivery (?:manager|lead|executive)|\btechnical (?:trainer|instructor|consultant)|\bremediation|\bweb solutions|\bgtech\b|\bpartner technology manag|\bproduct technology manag|\btechnical onboarding|\bconsulting (?:lead|manager|director)\b/],
  [F['Sales'], /\bsales\b|\bsales(?:person|people)\b|\baccount (?:strategist|manager|executive|lead|director|planner)|\bindustry (?:manager|head|lead|director)|\bagency (?:manager|lead|development)|\bcustomer (?:growth|success|onboarding|acquisition)|\bgrowth (?:consultant|manager|associate|specialist|lead)|\bbusiness acquisition|\bpursuit\b|\bkey account|\btop partner|\bchannel (?:manager|partner manager|lead)|\bpartner (?:sales|account)|\bclient (?:partner|lead|manager|director)|\bmedia (?:manager|specialist)|\bsearch (?:expert|specialist)|\bdigital strategy (?:associate|lead)|\b(?:head|lead) of industry|\bgo-?to-?market (?:lead|director|manager)|\bgtm (?:lead|director|manager)|\baccount representative|\bresponsable de compte|\baccelerated growth|\bbusiness development consultant|\benablement lead/],
  [F['Security and Privacy'], /\bsecurity\b|\bprivacy\b|\bincident response|\bthreat\b|\boffensive|\bred team|\bforensic|\bmalware|\bintelligence (?:analyst|specialist|lead|manager)|\bopen source intelligence|\bdetection and response|\bvulnerabil|\bcyber|\bcryptograph/],
  [F['Product Management'], /\bproduct manag|\bproduct (?:lead|owner|director)\b|\bgroup product|\bgpm\b/],
  [F['Data Science and Analytics'], /\bdata scien|\bdata analys|\banalytics\b|\bbusiness intelligence|\bdata engineer|\bmarketing science|\bmeasurement\b|\bstatistic|\bquantitative (?:analyst|researcher)|\banalytical (?:lead|consultant|specialist)|\binsights? (?:lead|analyst|manager)|\beconomist/],
  [F['Marketing and Communications'], /\bmarketing\b|\bbrand (?:manager|lead|strategist)|\bcommunications?\b|\bcomms\b|\bpublic relations|\bpr (?:manager|lead)|\bsocial media|\bcreative (?:director|lead|strategist)|\bcopywrit|\bcontent (?:strategist|marketing|lead|producer|manager)|\bevents? (?:manager|lead)|\bcampaign|\beditorial|\bcreator (?:lead|partner|manager)|\bvideo producer/],
  [F['Public Policy and Government Affairs'], /\bpublic policy|\bgovernment (?:affairs|and strategic|relations|engagement)|\bpublic affairs|\bcommunity (?:development|engagement|relations|affairs)|\bregulatory affairs|\bpolicy (?:manager|lead|counsel|director)\b/],
  [F['Trust and Safety'], /\btrust (?:and|&) safety|\bcontent (?:moderat|review|policy)|\bmarket responsibility|\bresponsible ai|\bchild safety|\babuse\b|\benforcement (?:specialist|lead|analyst)/],
  [F['Legal'], /\bcounsel\b|\battorney|\blawyer|\bparalegal|\blegal\b|\bpatent (?:agent|counsel|attorney)|\bsolicitor|\bavocat|\babogad|\banwalt/],
  [F['Finance'], /\bfinanc|\baccountant|\baccounting|\baudit|\btax\b|\btreasury|\bcontroller|\bfp&a\b|\bcollections|\bbilling|\bpayroll|\bpricing|\bcredit (?:analyst|manager)|\binvestment|\bequity (?:analyst|administrator)|\border to cash|\bprocure to pay|\bstock (?:plan|administrat)/],
  [F['People Operations'], /\bpeople (?:partner|consultant|operations|services|programs?|analyst|ops|business partner|lead|manager|specialist)|\brecruit|\bsourcer|\btalent (?:partner|acquisition|lead|manager|specialist)|\bhr\b|\bhuman resources|\bcompensation|\bbenefits (?:partner|manager|specialist)|\blearning (?:and|&) development|\bstaffing|\bemployee (?:relations|experience)|\bpeople\b/],
  [F['Real Estate and Workplace Services'], /\bfacilit(?:y|ies)|\bworkplace|\breal estate|\bconstruction|\bland (?:development|acquisition)|\behs\b|\benvironmental,? health|\bhealth (?:and|&) safety|\bsite (?:selection|acquisition)|\bcost (?:lead|manager|estimator)|\bfood (?:program|service)|\bhospitality|\bculinary|\bchef\b|\bsustainability (?:manager|lead|program)/],
  [F['Administrative'], /\badministrative|\bexecutive (?:assistant|business partner)|\boffice (?:manager|assistant|coordinator)|\breceptionist|\badmin\b/],
  [F['Information Technology'], /\bit (?:support|infrastructure|technician|specialist|engineer|manager|analyst|operations|systems)|\binformation technology|\btechstop|\bcorporate engineer|\bdesktop support|\bsystems? administrator|\bit-infrastruktur/],
  [F['Network Engineering'], /\bnetwork (?:engineer|implementation|deployment|architect|operations|capacity|planner|planning|program|development|acquisition|infrastructure|manager|lead)|\bnetwork engineering|\boptical network|\bsubsea|\bfiber (?:engineer|deployment|network)|\boutside plant/],
  [F['Manufacturing and Supply Chain'], /\bsupply chain|\bsupplier|\bcommodity|\bprocurement|\bsourcing (?:manager|lead|specialist)|\bpurchasing|\bbuyer\b|\bcategory manag|\bspend manag|\bnegotiat|\blogistics|\bmanufactur(?!ing test)|\bnpi\b|\bproduct quality|\bquality engineer|\bdemand (?:plan|manag)|\bmaterials? (?:manager|program|planner)|\binventory|\bwarehouse|\bfulfillment|\btrade compliance|\bcustoms|\bdepot|\breverse logistics|\bgpo\b/],
  [F['Software Engineering'], /\bsoftware\b|\bswe\b|\bdeveloper\b|\bprogrammer|\bfull[- ]?stack|\bfront[- ]?end|\bback[- ]?end|\bmobile (?:engineer|developer)|\bios (?:engineer|developer)|\bandroid (?:engineer|developer)|\bsite reliability|\bsre\b|\btech(?:nical)? lead(?: manager)?\b|\btlm\b|\bengineering manager|\bengineering director|\bfirmware|\bmachine learning engineer|\bml engineer|\bai engineer|\bresearch software/],
  [F['Hardware Engineering'], /\bhardware|\bsilicon|\basic\b|\brtl\b|\bsoc\b|\bcpu\b|\bgpu\b|\btpu\b|\bdesign verification|\bformal verification|\bphysical design|\bdft\b|\bverification (?:engineer|lead|manager)|\bvalidation (?:engineer|lead|manager)|\bserdes|\banalog|\bmixed[- ]signal|\bcad\b|\bmechanical|\belectrical engineer|\bthermal|\boptical engineer|\boptics|\bphotonic|\brf\b|\bantenna|\bpower (?:integrity|engineer|architect)|\bsignal integrity|\bpackaging (?:engineer|architect)|\breliability engineer|\btest (?:development )?engineer|\bmanufacturing test|\bproduct (?:design )?engineer|\bsystem modeling|\bsignal processor|\belectrostatic|\besd\b|\bemc\b|\bcamera (?:engineer|hardware)|\bdisplay (?:engineer|architect)|\baudio engineer|\bacoustic|\bbattery|\bmaterials engineer|\bchip|\bnpu\b|\barchitect, (?:machine learning|ml) hardware|\bhardware architect|\bembedded systems engineer|\bsystems? engineer/],
  [F['Research'], /\bresearch (?:scientist|engineer|intern|lead|director|manager|developer|associate)|\bresearcher|\bscientist|\bbiologist|\bchemist\b|\bpost-?doc|\bstudent research|\bresearch\b/],
  [F['Program Management'], /\bprogram(?:me)? manag|\bprogram(?:me)? lead|\bproject manag|\bprogram(?:me)? (?:director|specialist|coordinator)|\bchief of staff|\bpmo\b/],
  [F['Partnerships and Business Development'], /\bpartner(?:ship)?s? (?:manager|development|lead|director|principal|onboarding)|\bstrategic partner|\bbusiness development|\balliances?\b|\becosystem (?:lead|manager)|\bpartner (?:manager|lead)|\bpartnerships\b/],
  [F['Business Strategy and Operations'], /\bstrategy (?:and|&) operations|\bbusiness operations|\bstrategy (?:lead|manager|principal|associate|analyst)|\boperations (?:manager|lead|analyst|associate|specialist|principal)|\bbusiness (?:analyst|manager|lead|planning)|\btransformation|\binnovation (?:lead|manager)|\bplanning (?:lead|manager|analyst)|\bvendor operations|\blaunch (?:manager|lead)|\bstrategist\b|\bhead of business/],
];

// Team parts that name a family whatever the role word ("Engineering Analyst, YouTube Trust and Safety").
const TEAM = [
  [F['Trust and Safety'], /\btrust (?:and|&) safety|\bt&s\b/],
  [F['Data Center Operations'], /\bdata ?cent(?:er|re)s?\b(?!.*\b(?:financ|analyst|negotiat))/],
  [F['Public Policy and Government Affairs'], /\bgovernment affairs|\bpublic policy|\bpublic affairs/],
];

// Generic role words, last ("Director, Engineering, …" reads its team part's first word).
const LEAD_WORD = [[F['Software Engineering'], /^engineering\b/]];
const WEAK = [
  [F['Technical Solutions'], /\barchitect\b/],
  [F['Data Science and Analytics'], /\banalyst\b/],
  [F['Hardware Engineering'], /\bengineer\b.*\b(?:silicon|hardware|devices?|pixel|wearables?|fitbit|nest|chromebook)\b/],
  [F['Software Engineering'], /\bengineer(?:ing)?\b/],
  [F['Business Strategy and Operations'], /\bstrategy\b|\boperations\b/],
];

function prep(title) {
  // S-10: real titles are under 200 characters; the cap and the bounded bracket group keep an unclosed "(" run
  // linear (64 KB of "(" took 9 s). Brackets are dropped innermost first, as real titles never nest them.
  let t = String(title || '').slice(0, 500);
  for (const [re, en] of TRANSLATE) t = t.replace(re, en);
  return t.replace(/[（(][^（(）)]{0,200}[）)]/g, ' ').replace(/\s+/g, ' ').trim();
}

const first = (rules, s) => {
  if (!s) return null;
  for (const [fam, re] of rules) if (re.test(s)) return fam;
  return null;
};

/**
 * A posting title -> its job family (one of FAMILIES), or null when the title does not say.
 * Pure and deterministic. `role` is the title before its first comma ("Account Manager" in
 * "Account Manager, Retail"); the rest is the team part.
 */
export function familyOfTitle(title) {
  const t = prep(title);
  if (!t) return null;
  const parts = t.split(/\s*[,，、]\s*|\s+-\s+|\s+\|\s+/);
  const role = (parts[0] || '').toLowerCase();
  const rest = parts.slice(1).join(', ').toLowerCase();
  return first(ROLE, role) ?? first(TEAM, rest) ?? first(ROLE, rest) ?? first(LEAD_WORD, rest) ?? first(WEAK, role);
}

// ---------------------------------------------------------------------------
// Department display names (UX-32, fix-data-3)
// ---------------------------------------------------------------------------
// NVIDIA names its departments as inverted job families ("Engineer, ASIC", "Management, Product Development",
// "Program Manager, Technical", plain "Intern"), and Amazon writes a qualifier after "--"
// ("Project/Program/Product Management--Technical" and "--Non-Tech"). departmentDisplayName writes them the
// way Microsoft names its own departments ("Software Engineering", "Technical Program Management"): the
// specialty first, then the discipline: "ASIC Engineering", "Product Development Management", "Technical
// Program Management", "Internships", "Technical Project, Program and Product Management" and "Non-Technical
// Project, Program and Product Management" (the qualifier that tells Amazon's two apart comes first, so a cut
// label still shows it, UX-38). Every other name is returned unchanged. The board's own name is kept on the job
// (departmentPosted), searchable and reachable; old links with it still find the department (public/app.js).
// The mapping is one to one on each board's departments (test/fix-data-3.test.js), so no two departments merge.
const DISCIPLINE = Object.freeze({
  Engineer: 'Engineering', Architect: 'Architecture', Management: 'Management', Manager: 'Management',
  'Program Manager': 'Program Management', 'Account Manager': 'Account Management', Analyst: 'Analysis',
  Planner: 'Planning', Designer: 'Design', Accountant: 'Accounting', Administrator: 'Administration',
  'Systems Administrator': 'Systems Administration', Specialist: 'Specialists', Representative: 'Representatives',
});
// A role noun as a department of its own.
const BARE = Object.freeze({
  Intern: 'Internships', Architect: 'Architecture', 'Account Manager': 'Account Management', Accountant: 'Accounting',
  Technician: 'Technicians', 'Data Scientist': 'Data Science', 'Attorney, General': 'Legal',
});
// A specialty that ends in a role noun, as a discipline ("Management, Solutions Architect": Solutions Architecture).
const TRAILING_ROLE = [[/\bData Scientist$/, 'Data Science'], [/\bArchitect$/, 'Architecture'], [/\bEngineer$/, 'Engineering']];
const AMAZON_QUALIFIER = Object.freeze({ technical: 'Technical', tech: 'Technical', 'non-tech': 'Non-Technical', 'non-technical': 'Non-Technical', nontech: 'Non-Technical' });

/** "Hardware (Engineering)" -> "Hardware Engineering"; "Program Management (Technical)" -> "Technical Program Management". */
function specialty(y) {
  let s = String(y).replace(/\b(\w+) \(\1 \(([^()]+)\)\)/, '$1 ($2)'); // "Returns (Returns (RMA))" -> "Returns (RMA)"
  s = s.replace(/^(.*\S)\s*\((Technical|Non-Technical)\)$/, '$2 $1');
  s = s.replace(/^(.*\S)\s*\((Engineering)\)$/, '$1 $2');
  return s.trim();
}

/**
 * A board's department name as a natural group name (UX-32), or the name unchanged when it reads as one already.
 * Pure and deterministic; null and '' pass through.
 */
export function departmentDisplayName(name) {
  if (typeof name !== 'string' || !name.trim()) return name;
  const n = name.replace(/\s+/g, ' ').trim();
  if (BARE[n]) return BARE[n];
  // Amazon: "Project/Program/Product Management--Technical".
  const q = /^(.*\S)\s*--\s*([A-Za-z-]+)$/.exec(n);
  if (q && AMAZON_QUALIFIER[q[2].toLowerCase()]) {
    const base = q[1].replace(/^(\w+)\/(\w+)\/(\w+)(?= )/, '$1, $2 and $3');
    return `${AMAZON_QUALIFIER[q[2].toLowerCase()]} ${base}`;
  }
  // NVIDIA: "Engineer, ASIC", "Management, Hardware (Engineering)".
  const m = /^([A-Z][A-Za-z]*(?: [A-Z][a-z]+)?), (.+)$/.exec(n);
  if (!m || !DISCIPLINE[m[1]]) return n;
  const field = DISCIPLINE[m[1]];
  let y = specialty(m[2]);
  // "Management, Field Applications Engineering (Sales)": the bracket stays last.
  const tail = /^(.*\S)\s*(\([^()]+\))$/.exec(y);
  const bracket = tail ? ` ${tail[2]}` : '';
  if (tail) y = tail[1];
  if (field === 'Management') for (const [re, to] of TRAILING_ROLE) y = y.replace(re, to);
  // "Management, Product Management" is the managers of product management, not "Product Management Management".
  if (field === 'Management' && /\bManagement$/.test(y)) return `${y} (Managers)${bracket}`;
  return `${y} ${field}${bracket}`;
}
