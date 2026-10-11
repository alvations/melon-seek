// Synthetic Amazon and Meta boards (docs/process/amazon-meta-backend.md). NO NETWORK: the boards
// are built from the real probe records in test/fixtures/bigtech-{amazon,meta}.json and served
// by a fetch() stand-in that behaves like the endpoints recorded in docs/DATA_SOURCES.md §7e and
// §7g. Used by test/amazon-meta-*.test.js and, as a CLI, for the scale measurements:
//
//   node test/amazon-meta-synth.js --out DIR [--amazon 22415] [--meta 1143] [--seed 1]
//       crawls both synthetic boards with the real adapters, normalizer and scripts/snapshot.js
//       (fitSnapshot, the 40 MB beta budget), with the registry's `paused` lifted IN THIS PROCESS
//       ONLY, and writes DIR/<slug>.json exactly as the beta crawl job would; prints timings.
//
// What is recorded (§7e): 22,415 postings in 58 countries, 62 business categories, the US over
// the 10,000-hit cap, `hits` capped at 10,000 per query, 100 rows a page, the per-location pay
// table (annual, hourly, CAD), the older national sentence. The split of postings over countries
// and categories below is an ASSUMPTION (only those totals are recorded); the four category
// slugs seen in the fixtures (aws, fulfillment-ops, advertising, no-business-category) are real.
// Meta (§7g): 1,143 sitemap postings, the JSON-LD block, the page data after
// "apply_for_this_job_section" with public_compensation ("$173,000/year", "$7,313/month").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = (slug) => JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', `bigtech-${slug}.json`), 'utf8'));

/** Small seeded PRNG (mulberry32), so every run builds the same board. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (a) => a[Math.floor(next() * a.length)] };
  r.weighted = (pairs) => { let x = next() * pairs.reduce((s, p) => s + p[1], 0); for (const p of pairs) { x -= p[1]; if (x <= 0) return p[0]; } return pairs[pairs.length - 1][0]; };
  r.sample = (list, n) => { const c = [...list]; const out = []; while (out.length < n && c.length) out.push(c.splice(Math.floor(next() * c.length), 1)[0]); return out; };
  return r;
}

/* ================================================================ Amazon */

export const AMAZON_TOTAL = 22415;
export const AMAZON_CAP = 10000;

// [ISO3, ISO2, country name, postings (assumed), cities [city, region code, region name]]. The US
// count is whatever is left of AMAZON_TOTAL (12,600 here, over the cap, as recorded).
const US_CITIES = [
  ['Seattle', 'WA', 'Washington'], ['Bellevue', 'WA', 'Washington'], ['Arlington', 'VA', 'Virginia'], ['Herndon', 'VA', 'Virginia'],
  ['Austin', 'TX', 'Texas'], ['Sunnyvale', 'CA', 'California'], ['Santa Clara', 'CA', 'California'], ['East Palo Alto', 'CA', 'California'],
  ['San Francisco', 'CA', 'California'], ['New York', 'NY', 'New York'], ['Boston', 'MA', 'Massachusetts'], ['Nashville', 'TN', 'Tennessee'],
  ['Denver', 'CO', 'Colorado'], ['Atlanta', 'GA', 'Georgia'], ['Chicago', 'IL', 'Illinois'], ['Dallas', 'TX', 'Texas'],
  ['Phoenix', 'AZ', 'Arizona'], ['Culver City', 'CA', 'California'], ['San Diego', 'CA', 'California'], ['Irvine', 'CA', 'California'],
  ['Portland', 'OR', 'Oregon'], ['Detroit', 'MI', 'Michigan'], ['Stockton', 'CA', 'California'], ['Aldie', 'VA', 'Virginia'],
  ['Jacksonville', 'FL', 'Florida'], ['Columbus', 'OH', 'Ohio'], ['Minneapolis', 'MN', 'Minnesota'], ['Pittsburgh', 'PA', 'Pennsylvania'],
  ['Redmond', 'WA', 'Washington'], ['Washington', 'DC', 'District of Columbia'],
];
export const AMAZON_COUNTRIES = [
  ['USA', 'US', 'United States', null, US_CITIES],
  ['IND', 'IN', 'India', 2050, [['Bengaluru', 'KA', 'Karnataka'], ['Hyderabad', 'TS', 'Telangana'], ['Chennai', 'TN', 'Tamil Nadu'], ['Pune', 'MH', 'Maharashtra']]],
  ['DEU', 'DE', 'Germany', 820, [['Berlin', 'BE', 'Berlin'], ['Munich', 'BY', 'Bavaria'], ['Dresden', 'SN', 'Saxony']]],
  ['GBR', 'GB', 'United Kingdom', 800, [['London', 'LND', 'England'], ['Edinburgh', 'EDH', 'Scotland'], ['Manchester', 'MAN', 'England']]],
  ['CAN', 'CA', 'Canada', 760, [['Toronto', 'ON', 'Ontario'], ['Vancouver', 'BC', 'British Columbia'], ['Montreal', 'QC', 'Quebec']]],
  ['JPN', 'JP', 'Japan', 560, [['Tokyo', '13', 'Tokyo']]], ['IRL', 'IE', 'Ireland', 430, [['Dublin', 'D', 'Dublin']]],
  ['CHN', 'CN', "People's Republic of China", 380, [['Shanghai', '31', 'Shanghai'], ['Shenzhen', '44', 'Guangdong'], ['Beijing', '11', 'Beijing']]],
  ['ESP', 'ES', 'Spain', 340, [['Madrid', 'M', 'Madrid'], ['Barcelona', 'B', 'Catalonia']]], ['FRA', 'FR', 'France', 320, [['Paris', 'IDF', 'Ile-de-France']]],
  ['ITA', 'IT', 'Italy', 290, [['Milan', 'MI', 'Lombardy']]], ['LUX', 'LU', 'Luxembourg', 270, [['Luxembourg', 'LU', 'Luxembourg']]],
  ['POL', 'PL', 'Poland', 250, [['Gdansk', 'PM', 'Pomerania'], ['Warsaw', 'MZ', 'Masovia']]], ['AUS', 'AU', 'Australia', 240, [['Sydney', 'NSW', 'New South Wales'], ['Melbourne', 'VIC', 'Victoria']]],
  ['SGP', 'SG', 'Singapore', 220, [['Singapore', 'SG', 'Singapore']]], ['MEX', 'MX', 'Mexico', 210, [['Mexico City', 'DIF', 'Mexico City']]],
  ['BRA', 'BR', 'Brazil', 190, [['Sao Paulo', 'SP', 'Sao Paulo']]], ['NLD', 'NL', 'Netherlands', 170, [['Amsterdam', 'NH', 'North Holland']]],
  ['ISR', 'IL', 'Israel', 160, [['Tel Aviv', 'TA', 'Tel Aviv'], ['Haifa', 'HA', 'Haifa']]], ['ZAF', 'ZA', 'South Africa', 150, [['Cape Town', 'WC', 'Western Cape']]],
  ['CRI', 'CR', 'Costa Rica', 140, [['San Jose', 'SJ', 'San Jose']]], ['KOR', 'KR', 'Korea, Republic of', 130, [['Seoul', '11', 'Seoul']]],
  ['ROU', 'RO', 'Romania', 120, [['Bucharest', 'B', 'Bucharest'], ['Iasi', 'IS', 'Iasi']]], ['ARE', 'AE', 'United Arab Emirates', 110, [['Dubai', 'DU', 'Dubai']]],
  ['SAU', 'SA', 'Saudi Arabia', 100, [['Riyadh', '01', 'Riyadh']]], ['PHL', 'PH', 'Philippines', 95, [['Manila', 'NCR', 'Metro Manila']]],
  ['CZE', 'CZ', 'Czechia', 90, [['Prague', 'PR', 'Prague']]], ['SWE', 'SE', 'Sweden', 80, [['Stockholm', 'AB', 'Stockholm']]],
  ['BEL', 'BE', 'Belgium', 70, [['Brussels', 'BRU', 'Brussels']]], ['AUT', 'AT', 'Austria', 60, [['Vienna', '9', 'Vienna']]],
  ['CHE', 'CH', 'Switzerland', 60, [['Zurich', 'ZH', 'Zurich']]], ['TWN', 'TW', 'Taiwan', 55, [['Taipei', 'TPE', 'Taipei']]],
  ['IDN', 'ID', 'Indonesia', 50, [['Jakarta', 'JK', 'Jakarta']]], ['MYS', 'MY', 'Malaysia', 50, [['Kuala Lumpur', '14', 'Kuala Lumpur']]],
  ['VNM', 'VN', 'Vietnam', 45, [['Ho Chi Minh City', 'SG', 'Ho Chi Minh']]], ['TUR', 'TR', 'Turkey', 45, [['Istanbul', '34', 'Istanbul']]],
  ['EGY', 'EG', 'Egypt', 40, [['Cairo', 'C', 'Cairo']]], ['ARG', 'AR', 'Argentina', 40, [['Buenos Aires', 'C', 'Buenos Aires']]],
  ['CHL', 'CL', 'Chile', 38, [['Santiago', 'RM', 'Santiago']]], ['COL', 'CO', 'Colombia', 36, [['Bogota', 'DC', 'Bogota']]],
  ['NZL', 'NZ', 'New Zealand', 34, [['Auckland', 'AUK', 'Auckland']]], ['DNK', 'DK', 'Denmark', 32, [['Copenhagen', '84', 'Capital Region']]],
  ['FIN', 'FI', 'Finland', 30, [['Helsinki', '18', 'Uusimaa']]], ['NOR', 'NO', 'Norway', 28, [['Oslo', '03', 'Oslo']]],
  ['PRT', 'PT', 'Portugal', 28, [['Lisbon', '11', 'Lisbon']]], ['GRC', 'GR', 'Greece', 26, [['Athens', 'I', 'Attica']]],
  ['HUN', 'HU', 'Hungary', 24, [['Budapest', 'BU', 'Budapest']]], ['SVK', 'SK', 'Slovakia', 22, [['Bratislava', 'BL', 'Bratislava']]],
  ['BGR', 'BG', 'Bulgaria', 20, [['Sofia', '22', 'Sofia']]], ['HKG', 'HK', 'Hong Kong', 20, [['Hong Kong', 'HK', 'Hong Kong']]],
  ['THA', 'TH', 'Thailand', 18, [['Bangkok', '10', 'Bangkok']]], ['NGA', 'NG', 'Nigeria', 16, [['Lagos', 'LA', 'Lagos']]],
  ['KEN', 'KE', 'Kenya', 14, [['Nairobi', '30', 'Nairobi']]], ['PER', 'PE', 'Peru', 12, [['Lima', 'LIM', 'Lima']]],
  ['URY', 'UY', 'Uruguay', 10, [['Montevideo', 'MO', 'Montevideo']]], ['ISL', 'IS', 'Iceland', 8, [['Reykjavik', '1', 'Capital Region']]],
  ['MAR', 'MA', 'Morocco', 8, [['Casablanca', '06', 'Casablanca-Settat']]], ['PAK', 'PK', 'Pakistan', 6, [['Lahore', 'PB', 'Punjab']]],
];

// 62 business categories with assumed shares (the four slugs from the fixtures are real; the
// rest are stand-ins named after Amazon's public business units, or numbered).
const NAMED_CATEGORIES = [
  ['aws', 0.38], ['fulfillment-ops', 0.10], ['stores', 0.08], ['operations', 0.07], ['devices', 0.06], ['advertising', 0.05],
  ['no-business-category', 0.04], ['kuiper', 0.03], ['prime-video', 0.025], ['alexa', 0.02], ['pharmacy', 0.01], ['music', 0.01],
];
export const AMAZON_CATEGORIES = [
  ...NAMED_CATEGORIES,
  ...Array.from({ length: 50 }, (_, i) => [`category-${String(i + 1).padStart(2, '0')}`, (1 - NAMED_CATEGORIES.reduce((s, c) => s + c[1], 0)) * (0.93 ** i) * (1 - 0.93) / (1 - 0.93 ** 50)]),
];

// Job families: titles, Amazon's job_category / job_family, USD annual base (or hourly), text pools.
const F = (o) => o;
const FAMILIES = {
  sde: F({ titles: ['Software Development Engineer', 'Software Development Engineer II', 'Senior Software Development Engineer', 'Software Development Engineer, AWS Lambda', 'Front-End Engineer', 'Systems Development Engineer', 'Software Development Manager'], category: 'Software Development', family: 'Software Development', pay: [129300, 223600],
    resp: ['Design, build and operate highly available distributed systems that serve millions of requests per second', 'Write high-quality, maintainable code in Java, Python or C++ and review the code of your peers', 'Own the operational health of your services, including on-call, alarms, dashboards and post-incident reviews', 'Work with product managers to turn ambiguous customer problems into well-scoped technical designs', 'Drive the architecture of new services on AWS (EC2, S3, DynamoDB, Lambda) with security and cost in mind', 'Mentor junior engineers and raise the bar for engineering excellence across the team', 'Improve build, test and deployment pipelines so that the team ships safely many times a day', 'Instrument services with metrics and tracing and use the data to find and remove bottlenecks', 'Partner with scientists to productionize machine learning models behind low-latency APIs', 'Lead design reviews and write documents that explain trade-offs to technical and non-technical readers', 'Automate manual operational work and reduce the cost to serve of existing systems', 'Contribute to the long-term roadmap of the platform together with senior engineers and managers'],
    basic: ['3+ years of non-internship professional software development experience', '3+ years of programming with at least one software programming language experience', '2+ years of experience designing or architecting new and existing systems (design patterns, reliability and scaling)', "Bachelor's degree in computer science or equivalent", 'Experience as a mentor, tech lead or leading an engineering team', 'Experience with full software development life cycle, including coding standards, code reviews, source control management, build processes, testing, and operations'],
    pref: ['Knowledge of computer architecture, operating systems, and parallel computing', 'Experience with distributed systems, consistency models and storage engines', 'Knowledge of professional software engineering & best practices for full software development life cycle', 'Experience with Kubernetes, containers and infrastructure as code', 'Experience building machine learning systems in production', "Master's degree in computer science or equivalent"] }),
  tpm: F({ titles: ['Technical Program Manager', 'Senior Technical Program Manager', 'Infrastructure TPM, Infra Capacity Delivery', 'Technical Program Manager, Data Center Delivery'], category: 'Project/Program/Product Management--Technical', family: 'Tech Infrastructure Prgrm Mgmt', pay: [127100, 171900],
    resp: ['Own end-to-end delivery of multi-team technical programs from planning through launch', 'Define program goals, milestones and success metrics and report status to senior leadership', 'Identify risks and dependencies early and drive mitigation plans across engineering teams', 'Build mechanisms such as weekly business reviews, dashboards and runbooks that scale the program', 'Work with suppliers and construction partners to deliver data center capacity on schedule', 'Translate business requirements into technical requirements together with engineers', 'Drive decisions on scope, schedule and cost trade-offs with clear written proposals', 'Improve processes for capacity forecasting, procurement and deployment'],
    basic: ['3+ years of technical product or program management experience', '3+ years of working directly with engineering teams experience', 'Experience managing programs across cross functional teams, building processes and coordinating release schedules', "Bachelor's degree in engineering, computer science or a related field"],
    pref: ['Experience in data center construction, networking or hardware supply chain', 'Project Management Professional (PMP) or similar certification', 'Experience using SQL or Python to analyze program data', 'Experience with Lean or Six Sigma process improvement'] }),
  sa: F({ titles: ['Solutions Architect', 'Senior Solutions Architect', 'Specialist Solutions Architect, Generative AI', 'Partner Solutions Architect'], category: 'Solutions Architect', family: 'Solutions Architect', pay: [138200, 239000],
    resp: ['Act as a trusted technical advisor to customers building on AWS', 'Design reference architectures for migration, analytics and generative AI workloads', 'Run workshops, proofs of concept and architecture reviews with customer engineering teams', 'Capture customer feedback and share it with AWS service teams to shape the roadmap', 'Write blog posts, whitepapers and sample code that help customers adopt AWS services', 'Work with account managers to grow adoption across a portfolio of strategic customers', 'Present at conferences, meetups and AWS Summits'],
    basic: ['5+ years of experience in cloud architecture and implementation', '5+ years of design, implementation, or consulting in applications and infrastructures experience', "Bachelor's degree in computer science, engineering, math or a related field", '10+ years of IT development or implementation/consulting in the software or Internet industries experience'],
    pref: ['Experience with machine learning frameworks such as PyTorch or TensorFlow', 'AWS Professional certification', 'Experience migrating or transforming legacy customer solutions to the cloud', 'Experience with security and compliance frameworks'] }),
  ops: F({ titles: ['Area Manager II', 'Operations Manager', 'Senior Operations Manager', 'Area Manager, Night Shift', 'Shift Manager, Sort Center'], category: 'Fulfillment & Operations Management', family: 'Fulfillment Center', pay: [72500, 125000],
    resp: ['Lead a team of 50 to 150 associates in a fast-paced fulfillment center', 'Own safety, quality and productivity metrics for your area and shift', 'Use Lean and Kaizen tools to find and remove waste in operational processes', 'Coach, develop and engage associates and front-line leaders', 'Plan labor and staffing against volume forecasts with the site leadership team', 'Analyze operational data in Excel and SQL to drive daily decisions', 'Partner with HR, safety, loss prevention and engineering teams on site initiatives', 'Drive a culture of safety and continuous improvement on the floor'],
    basic: ['1+ years of people management experience', 'Experience in Microsoft Office products and applications', "Bachelor's degree or 2+ years of experience in operations, manufacturing or logistics", 'Experience working in a fast-paced environment with changing priorities'],
    pref: ['Experience with Lean, Six Sigma or Kaizen', 'Experience managing teams of 20 people or more', 'Experience in retail, hospitality, healthcare or customer-facing environments', 'Experience using SQL or data visualization tools'] }),
  hourly: F({ titles: ['Data Center Technician', 'Maintenance Technician', 'Robotics Technician', 'Fulfillment Center Associate'], category: 'Facilities, Maintenance, & Real Estate', family: 'Maintenance', hourly: [18.5, 48.99],
    resp: ['Install, troubleshoot and repair servers, network equipment and cabling', 'Perform preventive maintenance on conveyors, robotics and material handling equipment', 'Follow safety procedures and standard work in a regulated environment', 'Document work orders and parts usage in the maintenance system', 'Work rotating shifts, including nights, weekends and holidays', 'Lift up to 50 pounds and work on your feet for long periods'],
    basic: ['High school or equivalent diploma', '1+ years of experience in an electrical, mechanical or IT technician role', 'Ability to work 10-hour shifts and a flexible schedule'],
    pref: ['Associate degree in a technical field', 'CompTIA A+, Network+ or similar certification', 'Experience with PLCs and industrial controls'] }),
  sales: F({ titles: ['Account Manager', 'Advertising Account Manager', 'Sales Specialist', 'Business Development Manager', 'Enterprise Account Manager'], category: 'Sales, Advertising, & Account Management', family: 'Account Management', pay: [96000, 165000],
    resp: ['Own a portfolio of advertising customers and grow their investment with Amazon Ads', 'Build annual business plans with customers and agencies and track them against goals', 'Analyze campaign performance and recommend optimizations based on data', 'Negotiate and close new business with senior decision makers', 'Partner with product, marketing and solutions teams to bring new products to customers', 'Forecast revenue accurately and manage a healthy pipeline in Salesforce'],
    basic: ['3+ years of sales or account management experience', 'Experience with annual brand and media planning', 'Experience building relationships with senior business leaders', "Bachelor's degree"],
    pref: ['Experience in digital advertising, programmatic or retail media', 'Experience using data and analytics to drive customer decisions', 'Fluency in a second language'] }),
  bie: F({ titles: ['Business Intelligence Engineer', 'Data Engineer', 'Data Scientist', 'Applied Scientist', 'Senior Applied Scientist'], category: 'Business Intelligence', family: 'Business Intel Engineer', pay: [118900, 203000],
    resp: ['Build and maintain data pipelines and data models in Redshift, Spark and S3', 'Design dashboards in QuickSight or Tableau that leaders use to run the business', 'Develop statistical and machine learning models for forecasting and optimization', 'Define metrics and run experiments to measure the impact of new features', 'Write clear analyses that turn data into decisions for business partners', 'Improve data quality, lineage and documentation across the team'],
    basic: ['3+ years of analyzing and interpreting data with Redshift, Oracle, NoSQL etc. experience', 'Experience with data visualization using Tableau, Quicksight, or similar tools', 'Experience with one or more industry analytics visualization tools (e.g. Excel, Tableau, QuickSight, MicroStrategy, PowerBI) and statistical methods (e.g. t-test, Chi-squared)', 'Experience with scripting language (e.g., Python, Java, or R)'],
    pref: ['Experience with AWS solutions such as EC2, DynamoDB, S3, and Redshift', 'Experience in data mining, ETL, etc. and using databases in a business environment with large-scale, complex datasets', 'Experience with forecasting and statistical analysis', "Master's degree or PhD in a quantitative field"] }),
  pm: F({ titles: ['Product Manager - Technical', 'Senior Product Manager', 'Vendor Manager', 'Senior Program Manager', 'Brand Specialist'], category: 'Project/Program/Product Management--Non-Tech', family: 'Product Management', pay: [105000, 195000],
    resp: ['Own the product vision, roadmap and requirements for a customer-facing experience', 'Work backwards from customers with press releases and FAQs', 'Prioritize features with engineering and design based on data and customer insight', 'Manage relationships with vendors and selling partners to grow selection and improve pricing', 'Define and track key performance indicators and run weekly business reviews', 'Launch features globally and work with marketplace teams on localization'],
    basic: ['5+ years of product or program management experience', 'Experience owning and driving roadmap strategy and definition', 'Experience with end to end product delivery', "Bachelor's degree"],
    pref: ['MBA', 'Experience in e-commerce, retail or consumer technology', 'Experience using SQL to analyze product data'] }),
};
const CATEGORY_FAMILIES = {
  aws: [['sde', 0.45], ['sa', 0.2], ['tpm', 0.12], ['bie', 0.1], ['sales', 0.08], ['hourly', 0.05]],
  'fulfillment-ops': [['ops', 0.6], ['hourly', 0.3], ['tpm', 0.05], ['bie', 0.05]],
  operations: [['ops', 0.5], ['hourly', 0.2], ['tpm', 0.15], ['bie', 0.15]],
  advertising: [['sales', 0.5], ['sde', 0.25], ['bie', 0.15], ['pm', 0.1]],
  stores: [['pm', 0.35], ['sde', 0.3], ['bie', 0.15], ['sales', 0.2]],
};
const DEFAULT_FAMILIES = [['sde', 0.35], ['pm', 0.2], ['bie', 0.15], ['tpm', 0.1], ['sales', 0.1], ['ops', 0.1]];

const INTROS = [
  'Amazon is looking for builders who are passionate about customers and want to work on problems at a scale few companies can offer. You will join a team that owns services used by millions of customers every day, and you will have the freedom to invent and simplify while learning from some of the most experienced engineers and leaders in the industry.',
  'Do you want to help shape the future of how customers shop, watch, listen and run their businesses? Our team moves fast, works backwards from customers and measures success by the outcomes we deliver for them. We are hiring people who like ownership, write clearly and want to grow their careers in a high-impact organization.',
  'This role sits at the center of a global organization that is still in its early days. You will work with partners across engineering, science, finance and operations, and you will be expected to bring structure to ambiguous problems, make data-driven decisions and deliver results with a high bar for quality.',
];
const TEAMS = [
  'About the team<br/>Our team is made up of engineers, scientists and program managers spread across several time zones. We value mentorship, operational excellence and a healthy work-life balance, and we invest in each other through design reviews, pairing and regular career conversations.',
  'About the team<br/>Diverse experiences: Amazon values diverse experiences. Even if you do not meet all of the qualifications and skills listed in the job description, we encourage candidates to apply. Mentorship and career growth: we are continually raising our performance bar as we strive to become Earth’s best employer.',
];
const DAY = [
  'A day in the life<br/>You start the day with a short stand-up, then spend focused time on design and code. In the afternoon you might join a customer call, review a document written by a peer, or dive into a metric that moved overnight. Every week you present progress in a business review, and every quarter you help plan what the team builds next.',
  'A day in the life<br/>No two days are the same. Some days are spent with partner teams working through a launch plan, others in deep analysis of operational data or in conversations with customers about what they need next. You will have the support of a manager who invests in your growth and peers who will challenge your thinking.',
];
const EEO = 'Amazon is an equal opportunity employer and does not discriminate on the basis of protected veteran status, disability, or other legally protected status.';
// Public boilerplate on US postings (the fixture rows carry its first words before the trim).
const LA_COUNTY = 'Los Angeles County applicants: Job duties for this position include: work safely and cooperatively with other employees, supervisors, and staff; adhere to standards of excellence despite stressful conditions; communicate effectively and respectfully with employees, supervisors, and staff to ensure exceptional customer service; and follow all federal, state, and local laws and Company policies. Criminal history may have a direct, adverse, and negative relationship with some of the material job duties of this position. These include the duties and responsibilities listed above, as well as the abilities to adhere to company policies, exercise sound judgment, effectively manage stress and work safely and respectfully with others, exhibit trustworthiness and professionalism, and safeguard business operations and the Company’s reputation. Pursuant to the Los Angeles County Fair Chance Ordinance, we will consider for employment qualified applicants with arrest and conviction records.';
const ACCOMMODATION = 'Our inclusive culture empowers Amazonians to deliver the best results for our customers. If you have a disability and need a workplace accommodation or adjustment during the application and hiring process, including support for the interview or onboarding process, please visit <a href="https://amazon.jobs/content/en/how-we-hire/accommodations">https://amazon.jobs/content/en/how-we-hire/accommodations</a> for more information. If the country/region you’re applying in isn’t listed, please contact your Recruiting Partner.';
const PAY_INTRO = '<p><span style="color: rgb(35, 47, 62)" class="ProseMirror-FontColor">The base salary range for this position is listed below. Your Amazon package will include sign-on payments and restricted stock units (RSUs). Final compensation will be determined based on factors including experience, qualifications, and location. Amazon also offers comprehensive benefits including health insurance (medical, dental, vision, prescription, Basic Life &amp; AD&amp;D insurance and option for Supplemental life plans, EAP, Mental Health Support, Medical Advice Line, Flexible Spending Accounts, Adoption and Surrogacy Reimbursement coverage), 401(k) matching, paid time off, and parental leave. Learn more about our benefits at </span><a target="_blank" rel="noopener noreferrer nofollow" href="https://amazon.jobs/en/benefits"><span style="color: rgb(35, 47, 62)" class="ProseMirror-FontColor">https://amazon.jobs/en/benefits</span></a><span style="color: rgb(35, 47, 62)" class="ProseMirror-FontColor">.</span></p>';
const NATIONAL = (lo, hi) => `Our compensation reflects the cost of labor across several US geographic markets. The base pay for this position ranges from $${lo.toLocaleString('en-US')}/year in our lowest geographic market up to $${hi.toLocaleString('en-US')}/year in our highest geographic market. Pay is based on a number of factors including market location and may vary depending on job-related knowledge, skills, and experience.`;
const HUBS = new Set(['San Francisco', 'Sunnyvale', 'Santa Clara', 'East Palo Alto', 'New York', 'Seattle', 'Bellevue', 'Redmond']);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const money = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The country list scaled to `total` postings (the US gets the remainder), as [{ iso3, iso2, name, count, cities }]. */
export function amazonCountryPlan(total = AMAZON_TOTAL) {
  const others = AMAZON_COUNTRIES.filter((c) => c[3] != null);
  const scale = total / AMAZON_TOTAL;
  const plan = others.map(([iso3, iso2, name, n, cities]) => ({ iso3, iso2, name, count: Math.max(1, Math.round(n * scale)), cities }));
  const us = AMAZON_COUNTRIES[0];
  plan.unshift({ iso3: us[0], iso2: us[1], name: us[2], count: Math.max(1, total - plan.reduce((s, c) => s + c.count, 0)), cities: us[4] });
  return plan;
}

/**
 * Synthetic amazon.jobs search.json rows (the whole posting is in the row, §7e), newest first.
 * Built from the fixture rows' shape and texts; `total` postings over the country plan.
 */
export function amazonRows({ total = AMAZON_TOTAL, seed = 1, today = Date.UTC(2026, 9, 10) } = {}) {
  const R = rng(seed);
  const base = fixture('amazon').records[0];
  const plan = amazonCountryPlan(total);
  const rows = [];
  let id = 10575400;
  for (const c of plan) {
    for (let k = 0; k < c.count; k++) {
      const cat = R.weighted(AMAZON_CATEGORIES);
      const fam = FAMILIES[R.weighted(CATEGORY_FAMILIES[cat] || DEFAULT_FAMILIES)];
      const title = R.pick(fam.titles);
      // Locations: one place for most postings, up to 10 for pipeline requisitions.
      const nLoc = R.weighted([[1, 0.65], [2, 0.12], [3, 0.08], [R.int(4, 10), 0.15]]);
      const places = R.sample(c.cities, Math.min(nLoc, c.cities.length));
      const prim = places[0];
      const locations = places.map(([city, rc, rn]) => JSON.stringify({
        normalizedStateName: rn, normalizedCountryCode: c.iso3, city, countryIso3a: c.iso3, countryIso2a: c.iso2,
        locationNonStemming: `${c.name}, ${rc}, ${city}`, type: 'ONSITE', normalizedCountryName: c.name,
        normalizedLocation: `${city}, ${rn}, ${c.iso3}`, location: `${c.iso2}, ${rc}, ${city}`, region: rc, normalizedCityName: city,
      }));
      // Text: an intro, responsibilities, the team; basic and preferred qualifications.
      // Calibrated to the ~9 KB per normalized posting measured on real rows (docs/process/bigtech-data.md).
      const resp = R.sample(fam.resp, R.int(Math.min(6, fam.resp.length), fam.resp.length));
      const intro = R.sample(INTROS, R.int(1, 2)).join('<br/><br/>');
      const description = [intro, `Key job responsibilities<br/>${resp.map((x) => `- ${x}`).join('<br/>')}`, R.pick(DAY), R.pick(TEAMS)].join('<br/><br/>');
      const basic = R.sample(fam.basic, R.int(Math.min(3, fam.basic.length), fam.basic.length)).map((x) => `- ${x}`).join('<br/>');
      let pref = `${R.sample(fam.pref, R.int(Math.min(3, fam.pref.length), fam.pref.length)).map((x) => `- ${x}`).join('<br/>')}<br/><br/>${EEO}`;
      if (c.iso3 === 'USA') pref += `<br/><br/>${LA_COUNTY}`;
      // Pay: the US and Canada publish it (the per-location table; 5% of US postings use the older
      // national sentence); elsewhere the accommodation paragraph only.
      const lvl = /Senior|Manager|Principal|II\b/.test(title) ? 1.18 : 1;
      if (c.iso3 === 'USA' && R.next() < 0.05 && !fam.hourly) {
        pref += `<br/><br/>${NATIONAL(Math.round(fam.pay[0] * lvl / 100) * 100, Math.round(fam.pay[1] * lvl / 100) * 100)}`;
      } else if (c.iso3 === 'USA' || (c.iso3 === 'CAN' && R.next() < 0.8)) {
        const rowsTxt = places.map(([city, rc]) => {
          const f = (HUBS.has(city) ? 1 : 0.87) * (c.iso3 === 'CAN' ? (fam.hourly ? 1.15 : 0.8) : 1) * lvl;
          const cur = c.iso3 === 'CAN' ? 'CAD' : 'USD';
          if (fam.hourly) return `${c.iso3}, ${rc}, ${city} - ${money(Math.round(fam.hourly[0] * f * 100) / 100)} - ${money(Math.round(fam.hourly[1] * f * 100) / 100)} ${cur} hourly`;
          return `${c.iso3}, ${rc}, ${city} - ${money(Math.round(fam.pay[0] * f / 100) * 100)} - ${money(Math.round(fam.pay[1] * f / 100) * 100)} ${cur} annually`;
        });
        pref += `<br/><br/>${ACCOMMODATION}<br/><br/>${PAY_INTRO}<br/>${rowsTxt.join('<br/>')}`;
      } else {
        pref += `<br/><br/>${ACCOMMODATION}`;
      }
      // Newest first (sort=recent): ages grow along the list, most within the last 90 days.
      const age = Math.floor((rows.length / Math.max(1, total)) * 120 * R.next() + R.int(0, 30) * R.next());
      const d = new Date(today - age * 864e5);
      const day = d.getUTCDate();
      rows.push({
        ...base,
        id: `synthetic-${id}`, id_icims: String(id), title, job_path: `/en/jobs/${id}/${slug(title)}`,
        description, basic_qualifications: basic, preferred_qualifications: pref,
        description_short: description.slice(0, 300),
        job_category: fam.category, job_family: fam.family, business_category: cat,
        job_schedule_type: fam.hourly && R.next() < 0.3 ? 'part-time' : 'full-time',
        city: prim[0], state: prim[1], country_code: c.iso3,
        location: `${c.iso2}, ${prim[1]}, ${prim[0]}`, normalized_location: `${prim[0]}, ${prim[2]}, ${c.iso3}`,
        locations, posted_date: `${MONTHS[d.getUTCMonth()]} ${day < 10 ? ` ${day}` : day}, ${d.getUTCFullYear()}`,
        updated_time: `${R.int(1, 23)} hours`, primary_search_label: `${cat}.team-${slug(fam.family)}`,
        url_next_step: `https://account.amazon.jobs/jobs/${id}/apply`,
      });
      id--;
    }
  }
  rows.sort((a, b) => Date.parse(b.posted_date) - Date.parse(a.posted_date) || Number(b.id_icims) - Number(a.id_icims));
  return rows;
}

const AMAZON_ROBOTS = 'User-agent: AhrefsBot\nDisallow: /\n\nUser-agent: *\nDisallow: /internal\nDisallow: /*/internal\n';

/**
 * A stand-in for www.amazon.jobs: /robots.txt and /en/search.json as recorded in §7e (filters
 * normalized_country_code[] and business_category[], `hits` capped at 10,000, nothing past
 * offset 9,900, at most 100 rows a page, facets on request). Returns (url, init) => Response | null.
 */
export function amazonSite(rows, { cap = AMAZON_CAP, onSearch } = {}) {
  const facet = (list, key) => {
    const m = new Map();
    for (const r of list) m.set(r[key], (m.get(r[key]) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ [k]: n }));
  };
  const countryKey = 'country_code';
  return (url) => {
    const u = new URL(url);
    if (u.host !== 'www.amazon.jobs') return null;
    if (u.pathname === '/robots.txt') return new Response(AMAZON_ROBOTS, { status: 200, headers: { 'content-type': 'text/plain' } });
    if (u.pathname !== '/en/search.json') return new Response('not found', { status: 404 });
    const q = u.searchParams;
    const cc = q.get('normalized_country_code[]');
    const bc = q.get('business_category[]');
    const list = rows.filter((r) => (!cc || r[countryKey] === cc) && (!bc || r.business_category === bc));
    const offset = Number(q.get('offset')) || 0;
    const limit = Math.min(100, Number(q.get('result_limit')) || 10);
    if (onSearch) onSearch({ cc, bc, offset });
    const facets = {};
    for (const f of q.getAll('facets[]')) facets[`${f}_facet`] = facet(list, f === 'normalized_country_code' ? countryKey : f);
    const jobs = offset < cap ? list.slice(offset, Math.min(offset + limit, cap)) : [];
    return new Response(JSON.stringify({ error: null, hits: Math.min(list.length, cap), facets, jobs }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

/* ================================================================== Meta */

export const META_TOTAL = 1143;

const META_FAMILIES = [
  { w: 0.38, dept: 'Engineering', team: 'Software Engineering', titles: ['Software Engineer, Infrastructure', 'Software Engineer, Product', 'Software Engineer, Machine Learning', 'Production Engineer', 'Software Engineer, iOS'], pay: [183997, 257000] },
  { w: 0.12, dept: 'Research', team: 'Artificial Intelligence', titles: ['Research Scientist, Generative AI', 'Research Engineer, Llama', 'Applied Research Scientist'], pay: [177000, 251000] },
  { w: 0.1, dept: 'Engineering', team: 'Security', titles: ['Security Engineer - Applied AI', 'Security Engineer, Detection and Response'], pay: [173000, 245000] },
  { w: 0.1, dept: 'Data Science', team: 'Data & Analytics', titles: ['Data Scientist, Product Analytics', 'Data Engineer, Analytics'], pay: [150000, 220000] },
  { w: 0.08, dept: 'Product Management', team: 'Product Management', titles: ['Product Manager, Reality Labs', 'Technical Program Manager'], pay: [166000, 238000] },
  { w: 0.08, dept: 'Reality Labs', team: 'Hardware Engineering', titles: ['Optical Engineer', 'Hardware Engineer, Silicon', 'Display Systems Engineer'], pay: [156000, 219000] },
  { w: 0.07, dept: 'Sales', team: 'Advertising Sales', titles: ['Client Partner', 'Account Manager, Global Business Group'], pay: [118000, 175000] },
  { w: 0.07, dept: 'Research', team: 'Internship - PhD', titles: ['Research Scientist Intern, Optical System Design (PhD)', 'Software Engineer Intern', 'Research Scientist Intern, AI (PhD)'], monthly: [7313, 12667], intern: true },
];
const META_US = [['Menlo Park, CA', 'Menlo Park', 'California'], ['Sunnyvale, CA', 'Sunnyvale', 'California'], ['Redmond, WA', 'Redmond', 'Washington'], ['Seattle, WA', 'Seattle', 'Washington'], ['New York, NY', 'New York', 'New York'], ['Burlingame, CA', 'Burlingame', 'California'], ['Boston, MA', 'Boston', 'Massachusetts'], ['Austin, TX', 'Austin', 'Texas'], ['Washington, DC', 'Washington', 'District of Columbia'], ['Remote, US', 'Remote', null]];
const META_INTL = [['London, UK', 'GB'], ['Dublin, Ireland', 'IE'], ['Singapore', 'SG'], ['Tel Aviv, Israel', 'IL'], ['Zurich, Switzerland', 'CH'], ['Toronto, ON', 'CA']];

/**
 * Synthetic Meta job records, in extractMetaPage's shape (the fixture's), `total` of them.
 * About 70% US with public_compensation (annual; interns monthly; 3% hourly), the rest abroad
 * without a published range (as the London fixture). `ldOnly` share of pages carry only JSON-LD.
 */
export function metaRecords({ total = META_TOTAL, seed = 1, ldOnly = 0.02, today = Date.UTC(2026, 9, 10) } = {}) {
  const R = rng(seed);
  const fx = fixture('meta').records;
  const out = [];
  for (let i = 0; i < total; i++) {
    const fam = R.weighted(META_FAMILIES.map((f) => [f, f.w]));
    const seedRec = fx[fam.intern ? 2 : fam.team === 'Security' ? 1 : 0];
    const us = R.next() < 0.7 || fam.intern;
    const n = us ? R.weighted([[1, 0.55], [2, 0.2], [R.int(3, 10), 0.25]]) : 1;
    const places = us ? R.sample(META_US, n) : [R.pick(META_INTL)];
    const id = String(2486789151600000 + i * 7919);
    const title = R.pick(fam.titles);
    let comp = [];
    if (us) {
      const lvl = 0.85 + 0.3 * R.next();
      const fmt = (v, unit) => `$${Math.round(v).toLocaleString('en-US')}/${unit}`;
      if (fam.monthly) comp = [{ error_apology_note: '', has_bonus: false, has_equity: false, compensation_amount_minimum: fmt(fam.monthly[0], 'month'), compensation_amount_maximum: fmt(fam.monthly[1], 'month'), country_code: 'US' }];
      else if (R.next() < 0.03) comp = [{ error_apology_note: '', has_bonus: false, has_equity: false, compensation_amount_minimum: '$56.25/hour', compensation_amount_maximum: '$78.37/hour', country_code: 'US' }];
      else comp = [{ error_apology_note: '', has_bonus: true, has_equity: true, compensation_amount_minimum: fmt(Math.round(fam.pay[0] * lvl / 1000) * 1000, 'year'), compensation_amount_maximum: fmt(Math.round(fam.pay[1] * lvl / 1000) * 1000, 'year'), country_code: 'US' }];
    }
    const posted = new Date(today - Math.floor(R.next() * R.next() * 400) * 864e5).toISOString().replace('.000Z', '-07:00');
    const jobLocation = places.map((p) => (us
      ? { name: p[0], address: { '@type': 'PostalAddress', addressLocality: p[1], ...(p[2] ? { addressRegion: p[2] } : {}), addressCountry: 'US' } }
      : { name: p[0], address: { '@type': 'PostalAddress', addressLocality: p[0].split(',')[0], addressCountry: p[1] } }));
    out.push({
      id, title, locations: places.map((p) => p[0]), departments: [fam.team], internal_departments: [fam.dept],
      description_html: seedRec.description_html, responsibilities: R.sample(seedRec.responsibilities, Math.max(3, seedRec.responsibilities.length - R.int(0, 2))),
      minimum_qualifications: seedRec.minimum_qualifications, preferred_qualifications: seedRec.preferred_qualifications, public_compensation: comp,
      ld: { title, description: seedRec.ld.description, datePosted: posted, employmentType: fam.intern ? 'INTERN' : 'FULL_TIME', jobLocation },
      ldOnly: R.next() < ldOnly,
    });
  }
  return out;
}

/**
 * A job page as metacareers.com serves it, reduced to what matters (§7g): the JSON-LD block,
 * a decoy block with its own "title" and "locations" keys (the site's navigation), then the
 * page data after "apply_for_this_job_section". `p.ldOnly` pages have no page data.
 */
export function metaPageHtml(p) {
  const ld = { '@context': 'https://schema.org', '@type': 'JobPosting', title: p.ld.title, description: p.ld.description, datePosted: p.ld.datePosted, employmentType: p.ld.employmentType, jobLocation: p.ld.jobLocation };
  const decoy = { title: 'Meta Careers', locations: ['Menlo Park, CA', 'London, UK', 'Singapore', 'Remote, US'], description: 'Find your next job at Meta.' };
  const data = {
    apply_for_this_job_section: { title: 'Apply for this job', description: 'Take the first step toward a rewarding career at Meta.' },
    requisition_id: p.id, title: p.title, locations: p.locations, departments: p.departments, internal_departments: p.internal_departments,
    description: JSON.stringify({ __html: p.description_html }), responsibilities: p.responsibilities.map((item) => ({ item })),
    minimum_qualifications: p.minimum_qualifications.map((item) => ({ item })), preferred_qualifications: p.preferred_qualifications.map((item) => ({ item })),
    public_compensation: p.public_compensation,
  };
  const esc = (o) => JSON.stringify(o).replace(/\//g, '\\/');
  return `<!DOCTYPE html><html><head><title>${p.title} | Meta Careers</title><script type="application/ld+json" nonce="x">${esc(ld)}</script></head><body>`
    + `<script>require(["nav"],{"props":${esc(decoy)}})</script>`
    + (p.ldOnly ? `<script>require(["x"],{"props":${esc({ public_compensation: p.public_compensation })}})</script>` : `<script>require(["x"],{"props":${esc(data)}})</script>`)
    + '</body></html>';
}

const META_ROBOTS = 'User-agent: *\nDisallow: /ajax/\nDisallow: /tealium/\nDisallow: /intern/\nDisallow: /internal/\nDisallow: /login/\nDisallow: /oidc/callback/\nDisallow: /signup/\nDisallow: /resume/\nSitemap: https://www.metacareers.com/jobsearch/sitemap.xml\n';

/**
 * A stand-in for www.metacareers.com: robots.txt, the jobs sitemap and one page per record.
 * `gone` ids are in the sitemap but answer 404 (closed since the sitemap was built).
 */
export function metaSite(records, { gone = [], status = () => 200 } = {}) {
  const byId = new Map(records.map((p) => [p.id, p]));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...records.map((p) => p.id), ...gone].map((id) => `<url><loc>https://www.metacareers.com/profile/job_details/${id}/</loc></url>`).join('')}</urlset>`;
  return (url) => {
    const u = new URL(url);
    if (u.host !== 'www.metacareers.com') return null;
    if (u.pathname === '/robots.txt') return new Response(META_ROBOTS, { status: 200, headers: { 'content-type': 'text/plain' } });
    if (u.pathname === '/jobsearch/sitemap.xml') return new Response(sitemap, { status: 200, headers: { 'content-type': 'text/xml' } });
    const id = (/^\/profile\/job_details\/(\d+)\/$/.exec(u.pathname) || [])[1];
    const p = id && byId.get(id);
    if (!p) return new Response('<html>This job is no longer available</html>', { status: 404, headers: { 'content-type': 'text/html' } });
    const st = status(id);
    if (st !== 200) return new Response('error', { status: st, headers: { 'content-type': 'text/html' } });
    return new Response(metaPageHtml(p), { status: 200, headers: { 'content-type': 'text/html' } });
  };
}

/* ================================================================ fetch */

/**
 * Replace globalThis.fetch with the given site handlers. Any URL no handler serves throws (no
 * network in tests). Returns { calls: [url], hosts: { host: n }, restore() }.
 */
export function installFetch(...sites) {
  const real = globalThis.fetch;
  const calls = [];
  const hosts = {};
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push(u);
    const h = new URL(u).host;
    hosts[h] = (hosts[h] || 0) + 1;
    for (const s of sites) { const r = s(u, init); if (r) return r; }
    throw new TypeError(`fetch failed: no network in this test (${u})`);
  };
  return { calls, hosts, restore: () => { globalThis.fetch = real; } };
}

/* ================================================================== CLI */

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const out = path.resolve(arg('out', 'synthetic-snapshots'));
  const nA = Number(arg('amazon', AMAZON_TOTAL));
  const nM = Number(arg('meta', META_TOTAL));
  const seed = Number(arg('seed', 1));
  const { COMPANIES } = await import('../server/companies.js');
  const { setMinInterval } = await import('../server/sources/polite.js');
  const { runSnapshot } = await import('../scripts/snapshot.js');
  // Lift the pause IN THIS PROCESS ONLY (the registry file is untouched); every request below is
  // served by the stand-ins, and anything else throws.
  for (const c of COMPANIES) if (c.slug === 'amazon' || c.slug === 'meta') delete c.paused;
  setMinInterval(0);
  const t0 = Date.now();
  const rowsA = nA ? amazonRows({ total: nA, seed }) : [];
  const recsM = nM ? metaRecords({ total: nM, seed }) : [];
  console.log(`built ${rowsA.length} Amazon rows and ${recsM.length} Meta records in ${Date.now() - t0} ms`);
  const net = installFetch(amazonSite(rowsA), metaSite(recsM));
  const targets = [nA ? 'amazon' : null, nM ? 'meta' : null].filter(Boolean);
  const hist = path.join(out, '.history-scratch');
  const t1 = Date.now();
  const rss = { max: 0 };
  const timer = setInterval(() => { rss.max = Math.max(rss.max, process.memoryUsage().rss); }, 200);
  const r = await runSnapshot(targets, { outDir: out, historyDir: hist, parallelBeta: false });
  clearInterval(timer);
  net.restore();
  console.log(JSON.stringify({ seconds: (Date.now() - t1) / 1000, peakRssMB: Math.round(rss.max / 1048576), requests: net.hosts, results: r.results.map(({ file, history, ...x }) => x) }, null, 1));
  process.exit(r.failed ? 1 : 0);
}
