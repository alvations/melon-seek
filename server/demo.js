// Offline demo jobs: deterministic, company-flavored, clearly synthetic.
// Used when live fetch, caches and snapshots all fail (API reports mode:"demo").
//
//   demoJobs("anthropic", "Anthropic") -> RawJob[] (see docs/CONTRACT.md)

// ---------------------------------------------------------------------------
// Seeded PRNG
// ---------------------------------------------------------------------------

function hashString(str) {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seedStr) {
  const r = mulberry32(hashString(seedStr));
  const api = {
    next: r,
    int: (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)),
    range: (lo, hi) => lo + r() * (hi - lo),
    chance: (p) => r() < p,
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    weighted(items, key = 'w') {
      const total = items.reduce((s, x) => s + (x[key] ?? 1), 0);
      let t = r() * total;
      for (const x of items) {
        t -= x[key] ?? 1;
        if (t <= 0) return x;
      }
      return items[items.length - 1];
    },
    sample(arr, n) {
      const copy = arr.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, Math.max(0, Math.min(n, copy.length)));
    },
  };
  return api;
}

// ---------------------------------------------------------------------------
// Bullet pools by domain: resp (responsibilities), fit, bonus ("Strong
// candidates may also"), area (used in the years-of-experience bullet).
// ---------------------------------------------------------------------------

const POOLS = {
  research: {
    area: 'machine learning research or research engineering',
    resp: [
      'Design and run experiments to improve the capabilities of large language models',
      'Develop novel post-training methods, including reinforcement learning from human feedback (RLHF)',
      'Build evals that measure model capabilities, safety properties and failure modes',
      'Scale promising research ideas from small experiments to frontier training runs',
      'Analyze model behavior with interpretability tools and write up findings for the team',
      'Collaborate with engineers to turn research prototypes into production systems',
      'Contribute to pretraining data pipelines and dataset quality analysis',
      'Investigate scaling laws and improve the compute efficiency of training',
      'Publish research and share results with the broader scientific community',
      'Mentor junior researchers and help shape the team research roadmap',
    ],
    fit: [
      'Have significant hands-on experience with PyTorch or JAX',
      'Have trained large neural networks and debugged the training process',
      'Are comfortable in ambiguous, open-ended research environments',
      'Have a track record of impactful research, such as publications at NeurIPS, ICML or ICLR',
      'Have a PhD in machine learning, computer science, physics or a related field, or equivalent research experience',
      'Write clean, well-tested Python and enjoy pair programming',
      'Care about the societal impacts of AI and AI safety',
      'Communicate clearly in writing and present results to technical audiences',
    ],
    bonus: [
      'Have experience with distributed training across thousands of GPUs or TPUs',
      'Be familiar with mechanistic interpretability',
      'Have worked on reinforcement learning or agents',
      'Have a background in statistics or causal inference',
      'Have contributed to open source ML libraries',
      'Have written CUDA or Triton kernels',
      'Have experience with multimodal or speech models',
    ],
  },
  mlinfra: {
    area: 'software engineering, with a focus on infrastructure or distributed systems',
    resp: [
      'Build and operate infrastructure for large-scale distributed training on GPU and TPU clusters',
      'Optimize inference latency and throughput for production model serving',
      'Write high-performance kernels in CUDA or Triton',
      'Design systems for scheduling, fault tolerance and observability across thousands of accelerators',
      'Improve developer tooling and CI/CD for research and product teams',
      'Participate in an on-call rotation to keep critical training and serving systems reliable',
      'Profile and debug performance bottlenecks across the hardware and software stack',
      'Partner closely with researchers to unblock frontier training runs',
      'Build storage systems and data pipelines that feed training at petabyte scale',
      'Automate cluster provisioning across multiple cloud providers and datacenters',
    ],
    fit: [
      'Have deep experience with distributed systems at scale',
      'Are proficient in Python and at least one of Rust, Go or C++',
      'Have experience with Kubernetes, Docker and cloud platforms such as AWS or GCP',
      'Have operated production services with high availability requirements',
      'Enjoy debugging hard problems that span hardware and software',
      'Take ownership of projects from design through deployment',
      'Have strong Linux and networking fundamentals',
    ],
    bonus: [
      'Have experience with JAX, XLA or MLIR compilers',
      'Have run workloads with Slurm or other HPC schedulers',
      'Have experience with RDMA or high-performance networking',
      'Be fluent in Terraform and infrastructure as code',
      'Have contributed to open source infrastructure projects',
      'Have experience with Kafka, Spark or other large data systems',
    ],
  },
  product: {
    area: 'software engineering on products used by real customers',
    resp: [
      'Build new product features end-to-end across web, desktop and API surfaces',
      'Design and ship user-facing experiences in React and TypeScript',
      'Develop backend services and REST APIs in Python or Go',
      'Work closely with product managers and designers to iterate quickly based on user feedback',
      'Improve reliability and performance of customer-facing systems',
      'Instrument features with metrics and run A/B tests to guide decisions',
      'Prototype new agentic workflows using the latest LLMs',
      'Scale systems to support rapid growth in usage',
    ],
    fit: [
      'Have experience building and shipping consumer or developer products',
      'Are proficient in TypeScript, JavaScript and React',
      'Have experience with Postgres, Redis and cloud infrastructure',
      'Care deeply about craft and the end-user experience',
      'Thrive in fast-paced environments and move quickly',
      'Collaborate well across product, design and research',
      'Are comfortable owning features from idea to production',
    ],
    bonus: [
      'Have experience with Next.js or Node.js',
      'Have built products with LLMs or AI agents',
      'Have shipped iOS or Android apps',
      'Have worked at an early-stage startup',
      'Have experience with GraphQL or gRPC',
    ],
  },
  security: {
    area: 'security engineering',
    resp: [
      'Threat model new systems and partner with engineering teams to mitigate risks',
      'Build detection engineering pipelines and respond to security incidents',
      'Harden cloud infrastructure across AWS and GCP using infrastructure as code',
      'Run red team exercises and penetration tests against critical systems',
      'Design identity and access management controls for internal tools',
      'Protect model weights and sensitive research assets',
      'Lead compliance work such as SOC 2 and FedRAMP audits',
    ],
    fit: [
      'Have experience in application security, cloud security or infrastructure security',
      'Are fluent in Python or Go for security automation',
      'Have a deep understanding of cryptography and secure system design',
      'Communicate risk clearly to technical and non-technical stakeholders',
      'Are comfortable participating in an on-call rotation',
    ],
    bonus: [
      'Have experience with vulnerability research or reverse engineering',
      'Be familiar with Kubernetes and container security',
      'Hold relevant certifications such as OSCP',
      'Have built security tooling used across a large engineering organization',
    ],
  },
  policy: {
    area: 'public policy, trust and safety, or national security',
    resp: [
      'Develop and enforce usage policies that reduce misuse of AI systems',
      'Analyze emerging risks and write policy recommendations for leadership',
      'Engage with government officials, policymakers and civil society on AI regulation',
      'Build evaluations for dangerous capabilities and harmful content',
      'Partner with research and product teams to design safeguards',
      'Draft public communications, whitepapers and blog posts',
      'Track legislation across the US, EU and UK and brief internal stakeholders',
    ],
    fit: [
      'Write clearly and persuasively for diverse audiences',
      'Have a strong interest in AI safety and the societal impacts of AI',
      'Are comfortable navigating ambiguity in a rapidly evolving field',
      'Have strong analytical skills and comfort with data analysis in SQL',
      'Build trusted relationships with external stakeholders',
    ],
    bonus: [
      'Have worked in government or at a regulator',
      "Have a law degree or a Master's in public policy",
      'Be familiar with how large language models are trained and deployed',
      'Have experience in trust and safety operations at a large platform',
    ],
  },
  sales: {
    area: 'enterprise software sales',
    resp: [
      'Own the full sales cycle for enterprise customers, from prospecting to close',
      'Develop go-to-market strategy for a new vertical or region',
      'Build relationships with executive stakeholders and negotiate complex contracts',
      'Partner with solutions architects to design customer deployments',
      'Forecast revenue and maintain pipeline hygiene in Salesforce',
      'Gather customer feedback and relay it to product teams',
      'Represent the company at industry events and customer briefings',
    ],
    fit: [
      'Have a track record of exceeding quota in enterprise software sales',
      'Have experience selling technical products to engineering buyers',
      'Are a strong communicator who can explain complex technology simply',
      'Are comfortable with ambiguity and building process at a startup',
      'Bring customer empathy and a consultative selling style',
    ],
    bonus: [
      'Have experience selling AI or machine learning products',
      'Have sold into the public sector or financial services',
      'Be willing to travel to customer sites regularly',
      'Have helped build a sales team from the ground up',
    ],
  },
  solutions: {
    area: 'a customer-facing technical role',
    resp: [
      'Help customers design and deploy applications built on large language models',
      'Build prototypes, demos and reference architectures',
      'Lead technical workshops and enablement sessions for customer teams',
      'Advise customers on prompt engineering, retrieval-augmented generation and evals',
      'Relay customer insights to product and research teams',
      'Partner with account executives on technical strategy for key deals',
    ],
    fit: [
      'Have experience as a solutions architect, sales engineer or forward deployed engineer',
      'Are proficient in Python and comfortable with REST APIs',
      'Communicate clearly with executives and engineers alike',
      'Are willing to travel to customer sites up to 25% of the time',
      'Enjoy learning new technology quickly',
    ],
    bonus: [
      'Have built production applications on top of LLMs',
      'Have experience with AWS, GCP or Azure architecture',
      'Have a background in data science or machine learning',
    ],
  },
  finance: {
    area: 'FP&A, strategic finance or business operations',
    resp: [
      'Build financial models and forecasts for compute spend and revenue',
      'Own parts of the monthly close process and partner with accounting',
      'Design scalable operational processes as the company grows',
      'Manage vendor relationships and procurement',
      'Create dashboards and analytics in SQL and Looker',
      'Support strategic planning with executive leadership',
    ],
    fit: [
      'Have experience in FP&A, investment banking or strategic finance',
      'Are an expert in Excel and financial modeling',
      'Have strong attention to detail and analytical rigor',
      'Thrive in a fast-paced, high-growth environment',
    ],
    bonus: ['Hold a CPA or an MBA', 'Have startup experience', 'Know SQL well enough to answer your own questions'],
  },
  recruiting: {
    area: 'technical recruiting',
    resp: [
      'Partner with hiring managers to build hiring plans and recruiting strategy',
      'Source candidates and manage the full interview process',
      'Improve candidate experience and interviewing processes',
      'Track recruiting metrics and report insights to leadership',
    ],
    fit: [
      'Have experience recruiting technical talent at a high-growth company',
      'Build strong relationships with candidates and stakeholders',
      'Are organized, detail-oriented and comfortable juggling priorities',
    ],
    bonus: ['Have experience with Greenhouse or Ashby', 'Have recruited research scientists or executives'],
  },
  design: {
    area: 'product design',
    resp: [
      'Design end-to-end user experiences from concept to launch',
      'Create prototypes in Figma and run usability studies',
      'Contribute to the design system and visual design language',
      'Partner with engineering and research to explore new interaction patterns for AI',
    ],
    fit: [
      'Have a strong portfolio of shipped product design work',
      'Are proficient in Figma and prototyping tools',
      'Have experience conducting user research',
      'Communicate design decisions clearly',
    ],
    bonus: ['Can write front-end code in React', 'Have designed developer tools or APIs'],
  },
  marketing: {
    area: 'product marketing at a technology company',
    resp: [
      'Plan and execute product launches and marketing campaigns',
      'Develop messaging and positioning for new products',
      'Build demand generation programs and measure pipeline impact',
      'Write compelling content for blogs, social media and events',
    ],
    fit: ['Are an excellent writer', 'Are data-driven and analytical', 'Collaborate well with product and sales'],
    bonus: ['Have marketed developer tools or APIs', 'Have experience with HubSpot or Salesforce'],
  },
  data: {
    area: 'data science or analytics',
    resp: [
      'Build data pipelines and analytics models in SQL and dbt',
      'Define metrics and build dashboards for product teams',
      'Run experiments and A/B tests to guide product decisions',
      'Develop machine learning models for forecasting and ranking',
    ],
    fit: ['Are proficient in SQL and Python', 'Have a strong foundation in statistics', 'Communicate insights clearly to stakeholders'],
    bonus: ['Have experience with Spark, Airflow or Snowflake', 'Have worked on recommender systems'],
  },
  // --- defense / hardware ---------------------------------------------------
  electrical: {
    area: 'electrical engineering',
    resp: [
      'Design schematics and PCB layouts for mission-critical electronics',
      'Bring up new hardware and debug boards in the lab',
      'Develop RF front-ends and antennas for communications and radar systems',
      'Integrate sensors and payloads into autonomous vehicles',
      'Support field testing and flight tests at remote test ranges',
      'Work with manufacturing to transition designs into production',
      'Design power electronics and battery systems for unmanned platforms',
    ],
    fit: [
      'Have a BS in Electrical Engineering or a related field',
      'Have hands-on experience with oscilloscopes, spectrum analyzers and other lab equipment',
      'Are proficient with Altium or similar schematic capture tools',
      'Have experience with power electronics and analog design',
      'Are willing to travel for field testing up to 20% of the time',
    ],
    bonus: [
      'Have experience with FPGA development in Verilog or VHDL',
      'Have experience with signal processing',
      'Have worked in the defense industry',
      'Hold an active Secret security clearance',
    ],
  },
  embedded: {
    area: 'embedded software development',
    resp: [
      'Write embedded software in C++ and Rust for autonomous systems',
      'Develop firmware and drivers for sensors and actuators',
      'Build software for real-time control on RTOS and embedded Linux targets',
      'Develop sensor fusion and state estimation algorithms',
      'Integrate with ROS 2 middleware and autonomy software',
      'Create hardware-in-the-loop test infrastructure',
    ],
    fit: [
      'Have strong programming skills in C++ or Rust',
      'Have experience with embedded Linux, RTOS and microcontrollers',
      'Are comfortable debugging hardware and software together',
      'Have a BS in Computer Engineering, Computer Science or a related field',
    ],
    bonus: [
      'Have experience with GNC or controls',
      'Have experience with robotics',
      'Be eligible to obtain and maintain a U.S. security clearance',
    ],
  },
  gnc: {
    area: 'guidance, navigation and control or autonomy',
    resp: [
      'Develop guidance, navigation and control algorithms for air and maritime vehicles',
      'Build high-fidelity simulations in MATLAB, Simulink and Python',
      'Tune flight controllers and analyze flight test data',
      'Design Kalman filters and sensor fusion pipelines',
      'Validate autonomy behaviors through simulation and field testing',
    ],
    fit: [
      'Have an MS or PhD in Aerospace Engineering, Mechanical Engineering or a related field',
      'Have experience with control theory and state estimation',
      'Are proficient in C++ and Python',
      'Have hands-on experience with flight testing',
    ],
    bonus: ['Have experience with computer vision', 'Have experience with propulsion or aerodynamics', 'Hold an active security clearance'],
  },
  defsw: {
    area: 'software engineering',
    resp: [
      'Build distributed systems that connect sensors, vehicles and operators',
      'Develop backend services in Go, Rust and Java',
      'Build operator interfaces in TypeScript and React',
      'Deploy software to edge devices and cloud environments with Kubernetes and Docker',
      'Develop computer vision and machine learning pipelines for perception',
      'Work directly with end users in the field to understand mission needs',
    ],
    fit: [
      'Have experience building production systems in Go, Java, C++ or Rust',
      'Have experience with distributed systems and networking',
      'Are mission-driven and excited to support national security',
      'Are able to obtain and maintain a U.S. security clearance',
    ],
    bonus: ['Have experience with Kafka or gRPC', 'Have worked in robotics or autonomy', 'Have deployed ML models to the edge'],
  },
  mechanical: {
    area: 'mechanical or aerospace engineering',
    resp: [
      'Design mechanical systems and mechanisms in SolidWorks or Siemens NX',
      'Perform FEA and thermal analysis on structural components',
      'Create drawings with GD&T and release designs to manufacturing',
      'Work with suppliers on machining, composites and injection molding',
      'Support assembly, integration and test of prototype vehicles',
    ],
    fit: [
      'Have a BS in Mechanical or Aerospace Engineering',
      'Have hands-on experience with CAD and rapid prototyping',
      'Understand DFM principles',
      'Are comfortable working in a fast-paced hardware environment',
    ],
    bonus: ['Have experience with composites', 'Have experience with propulsion systems', 'Have machining experience'],
  },
  manufacturing: {
    area: 'manufacturing engineering or production operations',
    resp: [
      'Scale production lines for new products from prototype to rate production',
      'Develop work instructions and quality processes for assembly',
      'Drive continuous improvement using lean manufacturing principles',
      'Manage suppliers and coordinate supply chain logistics',
      'Ensure compliance with ITAR and quality certifications such as AS9100',
    ],
    fit: [
      'Have experience with lean or Six Sigma methodologies',
      'Are detail-oriented and comfortable on the factory floor',
      'Have strong problem-solving skills',
      'Are a U.S. Person, as required by ITAR regulations',
    ],
    bonus: ['Have experience in aerospace manufacturing', 'Have experience with ERP or MES systems'],
  },
  bd: {
    area: 'business development or capture in the defense industry',
    resp: [
      'Develop capture strategies for new government programs',
      'Build relationships with DoD customers and program offices',
      'Lead proposal writing for RFPs and contract vehicles',
      'Partner with engineering to shape product roadmaps based on mission needs',
      'Negotiate contracts and teaming agreements',
      'Travel to customer sites and industry events',
    ],
    fit: [
      'Have a strong network across the Department of Defense',
      'Understand government contracting, FAR and DFARS',
      'Hold an active Top Secret security clearance',
      'Communicate clearly with senior military and civilian leaders',
    ],
    bonus: ['Have military service experience', 'Hold an MBA', 'Have worked with international defense customers'],
  },
  program: {
    area: 'program management on complex hardware or software programs',
    resp: [
      'Own program schedules, milestones and budgets from kickoff to delivery',
      'Coordinate cross-functional teams across engineering, manufacturing and supply chain',
      'Communicate program status and risks to customers and executive stakeholders',
      'Manage contract deliverables and compliance requirements',
    ],
    fit: [
      'Have experience managing defense or aerospace programs',
      'Are highly organized with strong attention to detail',
      'Communicate clearly in writing and in person',
      'Are able to obtain a U.S. security clearance',
    ],
    bonus: ['Hold a PMP certification', 'Have an engineering degree'],
  },
};

// Generic "fit" bullets mixed into every role.
const COMMON_FIT = [
  'Are excited to work in a fast-paced, collaborative environment',
  'Take ownership and work independently with minimal oversight',
  'Have excellent written and verbal communication skills',
  'Learn quickly and are eager to pick up new tools',
  'Bring a pragmatic, get-things-done attitude',
  "It's a bonus if you have contributed to open source",
];

// F2 demo: compensation extras phrasing per catalog. Positive and negative
// senses both appear so extractCompExtras is exercised in demo mode.
const DEI_LINE = 'We are committed to pay equity and to diversity, equity and inclusion across every team.';
const EXTRAS = {
  anthropic: { equity: 0.35, equityLine: 'Total compensation for full-time roles includes equity.', salesOTE: true, bonus: 0.08, bonusLine: 'This role is eligible for an annual performance bonus.' },
  anduril: { equity: 0.9, equityLine: 'Highly competitive equity grants are part of most full-time offers.', bonus: 0.06, bonusLine: 'A signing bonus may be offered.' },
  openai: { summary: true, bonus: 0, bonusLine: '' },
  generic: { equity: 0.45, equityLine: 'Offer package: base salary + bonus + benefits + equity.', equityImpliesBonus: true, bonus: 0.1, bonusLine: 'Sales roles earn uncapped commission.' },
};

// ---------------------------------------------------------------------------
// Company catalogs
// ---------------------------------------------------------------------------

// Role: dept, title (with {team}), teams, pool, base [min,max] in $K for a
// mid-level hire, ic (gets level prefixes), level (fixed level), w (weight).
const IC_LEVELS = [
  { prefix: '', mult: 0.82, years: 1, w: 0.7, label: 'entry' },
  { prefix: '', mult: 1, years: 3, w: 5 },
  { prefix: 'Senior ', mult: 1.2, years: 5, w: 3 },
  { prefix: 'Staff ', mult: 1.45, years: 8, w: 1.2 },
  { prefix: 'Principal ', mult: 1.7, years: 10, w: 0.4 },
];

const CATALOGS = {
  anthropic: {
    board: 'https://job-boards.greenhouse.io/anthropic',
    reqIds: true,
    salaryRange: [150, 690],
    count: [110, 140],
    style: 'h2',
    salaryLabel: 'Annual Salary:',
    blurb: 'is building reliable, interpretable and steerable AI systems',
    locations: [
      { text: 'San Francisco, CA', w: 6 },
      { text: 'New York City, NY', w: 2.5 },
      { text: 'Seattle, WA', w: 2 },
      { text: 'London, UK', w: 1.6, currency: 'GBP' },
      { text: 'Dublin, IE', w: 0.8, currency: 'EUR' },
      { text: 'Zürich, CH', w: 0.5, salary: false },
      { text: 'Tokyo, Japan', w: 0.5, salary: false },
      { text: 'Remote-Friendly (Travel-Required)', w: 0.6, remote: true },
    ],
    multiUS: ['San Francisco, CA', 'New York City, NY', 'Seattle, WA'],
    roles: [
      { dept: 'AI Research & Engineering', title: 'Research Engineer, {team}', teams: ['Pretraining', 'Interpretability', 'Reinforcement Learning', 'Alignment Science', 'Frontier Red Team', 'Model Evaluations'], pool: 'research', base: [300, 405], ic: false, w: 6, evergreen: true },
      { dept: 'AI Research & Engineering', title: 'Research Scientist, {team}', teams: ['Interpretability', 'Alignment Science', 'Societal Impacts', 'Multimodal'], pool: 'research', base: [315, 560], ic: false, w: 3 },
      { dept: 'AI Research & Engineering', title: 'Research Manager, {team}', teams: ['Interpretability', 'Post-Training', 'Model Evaluations'], pool: 'research', base: [400, 690], level: 'manager', w: 1 },
      { dept: 'Engineering & Design - Product', title: 'Software Engineer, {team}', teams: ['Inference', 'Cloud Inference', 'Infrastructure', 'Sandboxing', 'Developer Productivity', 'Accelerator Performance'], pool: 'mlinfra', base: [300, 405], ic: true, w: 6 },
      { dept: 'Engineering & Design - Product', title: 'Software Engineer, {team}', teams: ['Consumer Apps', 'API', 'Developer Tools', 'Enterprise'], pool: 'product', base: [280, 370], ic: true, w: 4 },
      { dept: 'Engineering & Design - Product', title: 'Engineering Manager, {team}', teams: ['Inference', 'Product Infrastructure', 'API'], pool: 'mlinfra', base: [405, 560], level: 'manager', w: 1.5 },
      { dept: 'Engineering & Design - Product', title: 'Product Designer, {team}', teams: ['Consumer Apps', 'Developer Platform'], pool: 'design', base: [240, 320], ic: true, w: 1 },
      { dept: 'Security', title: 'Security Engineer, {team}', teams: ['Detection & Response', 'Cloud Security', 'Application Security'], pool: 'security', base: [280, 405], ic: true, w: 2.5 },
      { dept: 'Safeguards (Trust & Safety)', title: 'Policy Analyst, {team}', teams: ['Usage Policy', 'Safeguards', 'Child Safety'], pool: 'policy', base: [190, 260], w: 1.5 },
      { dept: 'Public Policy', title: 'Policy Lead, {team}', teams: ['National Security', 'EU Policy', 'Asia Pacific'], pool: 'policy', base: [250, 340], w: 1 },
      { dept: 'Sales', title: 'Account Executive, {team}', teams: ['Enterprise', 'Startups', 'Public Sector', 'Financial Services'], pool: 'sales', base: [200, 300], w: 3 },
      { dept: 'Sales', title: 'Solutions Architect, {team}', teams: ['Applied AI', 'Enterprise', 'Industries'], pool: 'solutions', base: [220, 330], w: 2 },
      { dept: 'Marketing & Brand', title: 'Product Marketing Manager, {team}', teams: ['Developer Platform', 'Enterprise'], pool: 'marketing', base: [200, 280], w: 1 },
      { dept: 'Finance', title: 'Strategic Finance Lead, {team}', teams: ['Compute', 'Revenue'], pool: 'finance', base: [220, 300], w: 1 },
      { dept: 'People', title: 'Technical Recruiter, {team}', teams: ['Research', 'Engineering', 'Go-To-Market'], pool: 'recruiting', base: [150, 230], w: 1.5 },
      { dept: 'Operations', title: 'Head of {team}', teams: ['Business Operations', 'Compute Strategy'], pool: 'finance', base: [400, 600], level: 'director', w: 0.4 },
      { dept: 'AI Research & Engineering', title: 'AI Safety Fellowship', teams: ['Fellows Program'], pool: 'research', level: 'intern', w: 0.6 },
    ],
  },
  anduril: {
    board: 'https://job-boards.greenhouse.io/andurilindustries',
    reqIds: true,
    salaryRange: [90, 350],
    count: [100, 135],
    style: 'strong',
    salaryLabel: 'US Salary Range',
    visa: 0,
    blurb: 'is a defense technology company building autonomous systems',
    locations: [
      { text: 'Costa Mesa, California, United States', w: 7 },
      { text: 'Atlanta, Georgia, United States', w: 1.2 },
      { text: 'Seattle, Washington, United States', w: 1.5 },
      { text: 'Washington, District of Columbia, United States', w: 1.5 },
      { text: 'Huntsville, Alabama, United States', w: 1 },
      { text: 'Columbus, Ohio, United States', w: 1.2 },
      { text: 'Boston, Massachusetts, United States', w: 0.6 },
      { text: 'Reston, Virginia, United States', w: 0.6 },
      { text: 'London, England, United Kingdom', w: 0.8, currency: 'GBP' },
      { text: 'Sydney, New South Wales, Australia', w: 0.6, salary: false },
    ],
    extraUS: ['Costa Mesa, California, United States', 'Seattle, Washington, United States', 'Atlanta, Georgia, United States'],
    roles: [
      { dept: 'Engineering', title: 'Electrical Engineer, {team}', teams: ['RF', 'Power Systems', 'Hardware', 'Space'], pool: 'electrical', base: [140, 200], ic: true, w: 4 },
      { dept: 'Engineering', title: 'Embedded Software Engineer, {team}', teams: ['Air Defense', 'Maritime', 'Space', 'Counter-UAS'], pool: 'embedded', base: [145, 210], ic: true, w: 4 },
      { dept: 'Engineering', title: 'GNC Engineer, {team}', teams: ['Air Vehicles', 'Undersea', 'Munitions'], pool: 'gnc', base: [150, 220], ic: true, w: 2 },
      { dept: 'Engineering', title: 'Software Engineer, {team}', teams: ['Perception', 'Command & Control', 'Edge Platform', 'Mission Autonomy'], pool: 'defsw', base: [150, 220], ic: true, w: 5 },
      { dept: 'Engineering', title: 'Mechanical Engineer, {team}', teams: ['Structures', 'Mechanisms', 'Propulsion', 'Thermal'], pool: 'mechanical', base: [120, 180], ic: true, w: 3 },
      { dept: 'Engineering', title: 'Engineering Manager, {team}', teams: ['Autonomy', 'Embedded Systems', 'Hardware'], pool: 'defsw', base: [220, 320], level: 'manager', w: 1 },
      { dept: 'Manufacturing', title: 'Manufacturing Engineer, {team}', teams: ['Final Assembly', 'Electronics', 'Composites'], pool: 'manufacturing', base: [110, 160], ic: true, w: 3 },
      { dept: 'Manufacturing', title: 'Production Technician, {team}', teams: ['Assembly', 'Test'], pool: 'manufacturing', base: [90, 115], w: 2, evergreen: true },
      { dept: 'Supply Chain', title: 'Supply Chain Manager, {team}', teams: ['Electronics', 'Propulsion'], pool: 'manufacturing', base: [130, 190], w: 1 },
      { dept: 'Business Development', title: 'Business Development Executive, {team}', teams: ['Air Dominance', 'Maritime', 'Space', 'International'], pool: 'bd', base: [170, 260], w: 2 },
      { dept: 'Business Development', title: 'Director, Business Development, {team}', teams: ['Army', 'Navy', 'Air Force'], pool: 'bd', base: [240, 350], level: 'director', w: 0.7 },
      { dept: 'Program Management', title: 'Program Manager, {team}', teams: ['Air Defense', 'Maritime', 'Space'], pool: 'program', base: [140, 200], w: 2 },
      { dept: 'Security', title: 'Security Engineer, {team}', teams: ['Product Security', 'Infrastructure'], pool: 'security', base: [150, 220], ic: true, w: 1 },
      { dept: 'People', title: 'Technical Recruiter, {team}', teams: ['Engineering', 'Manufacturing'], pool: 'recruiting', base: [100, 150], w: 1 },
      { dept: 'Engineering', title: 'Software Engineering Intern, {team}', teams: ['Autonomy', 'Hardware'], pool: 'defsw', level: 'intern', w: 0.6 },
    ],
  },
  openai: {
    board: 'https://jobs.ashbyhq.com/openai',
    salaryRange: [150, 600],
    count: [105, 140],
    style: 'b',
    salaryLabel: 'Compensation',
    salaryFormat: 'k',
    structuredSalary: true,
    blurb: 'is an AI research and deployment company',
    locations: [
      { text: 'San Francisco', w: 7 },
      { text: 'New York City', w: 1.5 },
      { text: 'Seattle', w: 1.2 },
      { text: 'London, UK', w: 1.2, currency: 'GBP' },
      { text: 'Dublin, Ireland', w: 0.6, currency: 'EUR' },
      { text: 'Tokyo, Japan', w: 0.4, salary: false },
      { text: 'Singapore', w: 0.4, salary: false },
      { text: 'Remote - US', w: 0.4, remote: true },
    ],
    multiUS: ['San Francisco', 'New York City', 'Seattle'],
    roles: [
      { dept: 'Research', title: 'Research Scientist, {team}', teams: ['Reasoning', 'Post-Training', 'Multimodal', 'Safety Systems'], pool: 'research', base: [310, 560], w: 4 },
      { dept: 'Research', title: 'Research Engineer, {team}', teams: ['Pretraining Data', 'Evaluations', 'Post-Training', 'Robotics'], pool: 'research', base: [295, 445], w: 5, evergreen: true },
      { dept: 'Applied AI', title: 'Software Engineer, {team}', teams: ['Consumer Apps', 'API Platform', 'Agents', 'Enterprise'], pool: 'product', base: [255, 385], ic: true, w: 6 },
      { dept: 'Scaling', title: 'Software Engineer, {team}', teams: ['Supercomputing', 'Inference', 'Infrastructure', 'Data Platform'], pool: 'mlinfra', base: [295, 445], ic: true, w: 6 },
      { dept: 'Scaling', title: 'Engineering Manager, {team}', teams: ['Inference', 'Infrastructure'], pool: 'mlinfra', base: [400, 600], level: 'manager', w: 1.2 },
      { dept: 'Security', title: 'Security Engineer, {team}', teams: ['Detection & Response', 'Infrastructure Security', 'Privacy'], pool: 'security', base: [260, 385], ic: true, w: 2 },
      { dept: 'Safety Systems', title: 'Policy Researcher, {team}', teams: ['Model Policy', 'Trust & Safety'], pool: 'policy', base: [200, 300], w: 1.5 },
      { dept: 'Go To Market', title: 'Account Executive, {team}', teams: ['Enterprise', 'Startups', 'Public Sector'], pool: 'sales', base: [190, 300], w: 3 },
      { dept: 'Go To Market', title: 'Solutions Engineer, {team}', teams: ['Enterprise', 'Digital Natives', 'Japan'], pool: 'solutions', base: [200, 310], w: 2 },
      { dept: 'Design', title: 'Product Designer, {team}', teams: ['Consumer Apps', 'Developer Platform'], pool: 'design', base: [260, 350], ic: true, w: 1 },
      { dept: 'Finance', title: 'Finance Manager, {team}', teams: ['Compute', 'FP&A'], pool: 'finance', base: [180, 260], w: 1 },
      { dept: 'People', title: 'Recruiter, {team}', teams: ['Research', 'Engineering', 'GTM'], pool: 'recruiting', base: [150, 230], w: 1 },
      { dept: 'Research', title: 'Residency, {team}', teams: ['Research'], pool: 'research', level: 'intern', w: 0.5 },
    ],
  },
  generic: {
    board: null,
    salaryRange: [70, 320],
    count: [60, 100],
    style: 'h3',
    salaryLabel: 'Salary range:',
    blurb: 'is hiring across engineering, product and go-to-market',
    locations: [
      { text: 'San Francisco, CA', w: 3 },
      { text: 'New York, NY', w: 2.5 },
      { text: 'Austin, TX', w: 1.2 },
      { text: 'Chicago, IL', w: 1 },
      { text: 'Seattle, WA', w: 1 },
      { text: 'Denver, CO', w: 0.6 },
      { text: 'Toronto, ON', w: 0.6, salary: false },
      { text: 'London, UK', w: 0.8, currency: 'GBP' },
      { text: 'Remote (US)', w: 1.5, remote: true },
    ],
    multiUS: ['San Francisco, CA', 'New York, NY', 'Remote (US)'],
    roles: [
      { dept: 'Engineering', title: 'Software Engineer, {team}', teams: ['Backend', 'Frontend', 'Mobile', 'Payments', 'Growth'], pool: 'product', base: [150, 210], ic: true, w: 6, evergreen: true },
      { dept: 'Engineering', title: 'Site Reliability Engineer, {team}', teams: ['Platform', 'Infrastructure'], pool: 'mlinfra', base: [160, 220], ic: true, w: 2 },
      { dept: 'Engineering', title: 'Engineering Manager, {team}', teams: ['Platform', 'Product'], pool: 'product', base: [210, 290], level: 'manager', w: 1 },
      { dept: 'Data', title: 'Data Scientist, {team}', teams: ['Product', 'Growth', 'Risk'], pool: 'data', base: [140, 200], ic: true, w: 2 },
      { dept: 'Product', title: 'Product Manager, {team}', teams: ['Core Experience', 'Growth', 'Platform'], pool: 'product', base: [160, 230], ic: true, w: 2 },
      { dept: 'Design', title: 'Product Designer, {team}', teams: ['Core Experience', 'Brand'], pool: 'design', base: [130, 190], ic: true, w: 1.5 },
      { dept: 'Security', title: 'Security Engineer, {team}', teams: ['Application Security', 'Corporate Security'], pool: 'security', base: [160, 220], ic: true, w: 1 },
      { dept: 'Sales', title: 'Account Executive, {team}', teams: ['Mid-Market', 'Enterprise'], pool: 'sales', base: [110, 180], w: 2.5 },
      { dept: 'Marketing', title: 'Marketing Manager, {team}', teams: ['Lifecycle', 'Product Marketing'], pool: 'marketing', base: [110, 160], w: 1.5 },
      { dept: 'Finance', title: 'Financial Analyst, {team}', teams: ['FP&A'], pool: 'finance', base: [90, 130], w: 1 },
      { dept: 'People', title: 'Recruiter, {team}', teams: ['Technical', 'Business'], pool: 'recruiting', base: [90, 140], w: 1 },
      { dept: 'Engineering', title: 'Software Engineering Intern, {team}', teams: ['Summer'], pool: 'product', level: 'intern', w: 0.6 },
    ],
  },
};

const FIXED_LEVELS = {
  manager: { prefix: '', mult: 1, years: 6 },
  director: { prefix: '', mult: 1, years: 10 },
  intern: { prefix: '', mult: 1, years: 0 },
};

const FX = { USD: 1, GBP: 0.78, EUR: 0.9 };
const SYMBOL = { USD: '$', GBP: '£', EUR: '€' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function stripTags(html) {
  return html
    .replace(/<\/(p|li|h[1-6]|ul|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

const round5k = (n) => Math.round(n / 5000) * 5000;
const fmtFull = (n) => n.toLocaleString('en-US');

function boardRootFor(slug, opts) {
  if (opts && opts.url) return opts.url;
  const source = opts && opts.source;
  const board = (opts && opts.board) || null;
  const roots = {
    greenhouse: (b) => `https://job-boards.greenhouse.io/${b}`,
    ashby: (b) => `https://jobs.ashbyhq.com/${b}`,
    lever: (b) => `https://jobs.lever.co/${b}`,
  };
  if (source && board && roots[source]) return roots[source](encodeURIComponent(board));
  // Custom-board slugs look like "greenhouse-stripe".
  const m = /^(greenhouse|ashby|lever)-(.+)$/.exec(slug || '');
  if (m) return roots[m[1]](encodeURIComponent(m[2]));
  return null;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function yearsBullet(rng, years, area) {
  if (!years) return null;
  const style = rng.int(0, 3);
  if (style === 0 && years <= 10) return `Have at least ${NUMBER_WORDS[years]} years of experience in ${area}`;
  if (style === 1) return `Have ${years}+ years of industry experience in ${area}`;
  return `Have ${years}+ years of experience in ${area}`;
}

function headingHtml(style, text) {
  switch (style) {
    case 'strong': return `<p><strong>${escapeHtml(text)}</strong></p>`;
    case 'b': return `<p><b>${escapeHtml(text)}</b></p>`;
    case 'h3': return `<h3>${escapeHtml(text)}</h3>`;
    default: return `<h2>${escapeHtml(text)}</h2>`;
  }
}

const ul = (items) => `<ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;

function salaryFor(rng, cat, role, level, loc) {
  if (loc.salary === false) return null;
  if (rng.chance(0.06)) return null;
  const currency = loc.currency || 'USD';
  if (level === FIXED_LEVELS.intern) {
    const hourly = rng.int(45, 70);
    const sym = SYMBOL[currency];
    return { min: hourly, max: hourly, currency, interval: 'hour', text: `${sym}${hourly}/hr` };
  }
  const [lo, hi] = cat.salaryRange;
  const [bmin, bmax] = role.base;
  const jitter = rng.range(0.93, 1.07);
  let min = bmin * 1000 * level.mult * jitter;
  let max = bmax * 1000 * level.mult * jitter;
  min = Math.max(lo * 1000, Math.min(min, hi * 1000 * 0.85));
  max = Math.max(min * 1.12, Math.min(max, hi * 1000));
  min = round5k(min * FX[currency]);
  max = round5k(max * FX[currency]);
  if (max <= min) max = min + 10000;
  const sym = SYMBOL[currency];
  // F2: ~15% of US salaried roles list two pay zones (location tiers).
  const zoned = currency === 'USD' && rng.chance(0.15);
  const z2 = zoned ? { min: round5k(min * 0.85), max: round5k(max * 0.85) } : null;
  const k = (n) => `${sym}${Math.round(n / 1000)}K`;
  let text;
  if (cat.salaryFormat === 'k') {
    text = zoned ? `${k(z2.min)} – ${k(max)}` : `${k(min)} – ${k(max)}`;
  } else {
    text = `${sym}${fmtFull(min)}—${sym}${fmtFull(max)} ${currency}`;
  }
  const out = { min, max, currency, interval: 'year', text };
  if (zoned) {
    out.zones = 2;
    out.zoneText = [
      `Zone 1 (SF Bay Area, NYC, Seattle): ${sym}${fmtFull(min)}—${sym}${fmtFull(max)} ${currency}`,
      `Zone 2 (all other US locations): ${sym}${fmtFull(z2.min)}—${sym}${fmtFull(z2.max)} ${currency}`,
    ];
    out.tiers = [
      { min, max, currency, interval: 'year', label: 'Zone 1' },
      { min: z2.min, max: z2.max, currency, interval: 'year', label: 'Zone 2' },
    ];
    if (cat.salaryFormat === 'k') { out.min = z2.min; }
  }
  return out;
}

const DAY_MS = 86400000;
// F4: listing age in days. Buckets match the contract's freshness bands
// (new <=7, active 8-59, stale 60-179, evergreen >=180), spread 1-400.
const AGE_BUCKETS = [
  { lo: 1, hi: 7, w: 15 },
  { lo: 8, hi: 59, w: 45 },
  { lo: 60, hi: 179, w: 27 },
  { lo: 180, hi: 400, w: 13 },
];
function listingAgeDays(rng, role) {
  if (role.evergreen && rng.chance(0.6)) return rng.int(180, 400);
  const b = rng.weighted(AGE_BUCKETS);
  return rng.int(b.lo, b.hi);
}

// ---------------------------------------------------------------------------
// demoJobs
// ---------------------------------------------------------------------------

/**
 * Deterministic, company-flavored synthetic postings (RawJob[]).
 * @param {string} companySlug  e.g. "anthropic", "anduril", "openai", or any custom slug
 * @param {string} [companyName]
 * @param {{source?:string, board?:string, url?:string}} [opts]  used to build the board root URL for custom boards
 */
export function demoJobs(companySlug, companyName, opts = {}) {
  const slug = String(companySlug || 'demo').toLowerCase();
  const name = companyName || slug.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  const cat = CATALOGS[slug] || CATALOGS.generic;
  const rng = makeRng(`melon-seek:${slug}`);
  const url = cat.board || boardRootFor(slug, opts);
  const count = rng.int(cat.count[0], cat.count[1]);
  const baseTime = Date.UTC(2026, 8, 30, 12, 0, 0);
  const jobs = [];

  for (let i = 0; i < count; i++) {
    const role = rng.weighted(cat.roles);
    const team = rng.pick(role.teams);
    const level = role.level ? FIXED_LEVELS[role.level] : role.ic ? rng.weighted(IC_LEVELS) : IC_LEVELS[1 + (rng.chance(0.3) ? 1 : 0)];
    let title = role.title.replace('{team}', team);
    if (role.ic && level.prefix) title = level.prefix + title;
    if (level.label === 'entry') title = `${title} (New Grad)`;

    // Location(s)
    const primary = rng.weighted(cat.locations);
    let locationText = primary.text;
    let extraLocations = [];
    if (!primary.currency && primary.salary !== false && !primary.remote) {
      if (cat.multiUS && rng.chance(0.35)) {
        const others = rng.sample(cat.multiUS.filter((l) => l !== primary.text), rng.int(1, 2));
        locationText = [primary.text, ...others].join(' | ');
      } else if (cat.extraUS && rng.chance(0.25)) {
        extraLocations = rng.sample(cat.extraUS.filter((l) => l !== primary.text), rng.int(1, 2));
      }
    }
    if (primary.remote && cat.multiUS && rng.chance(0.7)) locationText = `${primary.text} | ${cat.multiUS[0]}`;
    const remote = !!primary.remote;

    // Bullets
    const pool = POOLS[role.pool];
    const resp = rng.sample(pool.resp, rng.int(4, Math.min(6, pool.resp.length)));
    const fit = [];
    const yb = yearsBullet(rng, level.years, pool.area);
    if (yb) fit.push(yb);
    fit.push(...rng.sample(pool.fit, rng.int(3, Math.min(5, pool.fit.length))));
    fit.push(...rng.sample(COMMON_FIT, rng.int(0, 2)));
    const bonus = rng.chance(0.75) ? rng.sample(pool.bonus, rng.int(2, Math.min(4, pool.bonus.length))) : [];

    const salary = salaryFor(rng, cat, role, level, primary);
    const ex = EXTRAS[slug] || EXTRAS.generic;
    const isIntern = level === FIXED_LEVELS.intern;
    const isSales = role.pool === 'sales';
    const compNotes = [];
    let summary = null;
    if (ex.summary) {
      // Ashby-style compensation summary ("$310K – $460K • Offers Equity • Offers Commission").
      if (salary) {
        const parts = [salary.text];
        if (!isIntern && rng.chance(0.95)) parts.push('Offers Equity');
        if (isSales) parts.push('Offers Commission');
        if (salary.zones > 1) parts.push('Multiple Ranges');
        summary = parts.join(' • ');
      }
    } else {
      if (rng.chance(ex.equity)) compNotes.push(ex.equityLine);
      if (ex.salesOTE) compNotes.push('For sales roles, the range shown is on-target earnings (OTE) and includes commission.');
      if (rng.chance(ex.bonus)) compNotes.push(ex.bonusLine);
    }
    const salaryLines = salary
      ? `<p>The expected base pay for this position is below.${compNotes.length ? ' ' + escapeHtml(compNotes.join(' ')) : ''}</p>`
        + (salary.zoneText
          ? `<p>${escapeHtml(cat.salaryLabel)}</p>${salary.zoneText.map((z) => `<p>${escapeHtml(z)}</p>`).join('')}`
          : `<p>${escapeHtml(cat.salaryLabel)} ${escapeHtml(summary || salary.text)}</p>`)
      : '';
    const eeo = rng.chance(0.25) ? `<p>${DEI_LINE}</p>` : '';

    const html = [
      `<p><em>Demo posting generated offline by melon-seek. This is not a real job listing.</em></p>`,
      headingHtml(cat.style, 'About the role'),
      `<p>${escapeHtml(name)} ${escapeHtml(cat.blurb)}. The ${escapeHtml(team)} team is looking for a ${escapeHtml(title.replace(/,.*$/, ''))} to help us move faster on our most important problems. This role sits within ${escapeHtml(role.dept)}.</p>`,
      headingHtml(cat.style, 'Responsibilities:'),
      ul(resp),
      headingHtml(cat.style, 'You may be a good fit if you:'),
      ul(fit),
      bonus.length ? headingHtml(cat.style, 'Strong candidates may also:') + ul(bonus) : '',
      salary ? headingHtml(cat.style, 'Compensation') + salaryLines : '',
      headingHtml(cat.style, 'Logistics'),
      `<p>Location: ${escapeHtml([locationText, ...extraLocations].join(' | '))}.${rng.chance(cat.visa ?? 0.3) ? ' We sponsor visas where possible and offer relocation support.' : ''}</p>`,
      eeo,
    ].join('');

    const ageDays = listingAgeDays(rng, role);
    const posted = new Date(baseTime - ageDays * DAY_MS - rng.int(0, 23) * 3600000);
    const updated = new Date(Math.min(baseTime, posted.getTime() + rng.int(0, Math.min(ageDays, 90)) * DAY_MS));
    const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const greenhouseLike = cat.reqIds || /^greenhouse-/.test(slug) || opts.source === 'greenhouse';
    let rawSalary = null;
    if (cat.structuredSalary && salary) {
      rawSalary = { min: salary.min, max: salary.max, currency: salary.currency, interval: salary.interval, text: summary || salary.text };
      if (salary.zones) rawSalary.zones = salary.zones;
    }

    jobs.push({
      sourceId: `demo-${slug}-${String(i + 1).padStart(3, '0')}`,
      title,
      department: role.dept,
      team,
      employmentType: level === FIXED_LEVELS.intern ? 'Internship' : 'Full-time',
      locationText,
      extraLocations,
      remote,
      html,
      text: stripTags(html),
      url,
      updatedAt: iso(updated),
      postedAt: iso(posted),
      reqId: greenhouseLike ? `DEMO-${slug.toUpperCase().slice(0, 12)}-${String(1000 + i)}` : null,
      salary: rawSalary,
      ...(summary ? { compensationSummary: summary } : {}),
      ...(rawSalary && salary.tiers ? { payRanges: salary.tiers } : {}),
    });
  }
  return jobs;
}

/** Slugs with a dedicated, company-flavored catalog. */
export const DEMO_CATALOGS = Object.keys(CATALOGS).filter((k) => k !== 'generic');
