# Amazon and Meta on the big-tech list

*Brief for the user, 2026-10-11. Data engineer: [process log](process/amazon-meta-data.md). The
quotes below come from the live pages, fetched on 2026-10-11. Their URLs, times and hashes are in
[data/alt/terms-2026-10-11.json](../data/alt/terms-2026-10-11.json). This is not legal advice.*

> [!NOTE]
> **Superseded by the [Decision](#decision-2026-10-11) below (2026-10-11).** The user chose to
> resume both; `paused` is gone from `server/companies.js`, and both boards are on `/beta/`
> since their first crawl on 2026-10-11 (2026-10-16: Amazon 22,179 postings, Meta 1,208). Since 2026-10-11 every Amazon posting is published, the whole board: the
> 5,000-posting budget (`maxPostings`) was removed when the user asked: "Why are you capping the no of posting we must present them as they are and not cut anything". The brief below is kept as it was written, before
> the decision.

**In one paragraph.** Amazon and Meta are missing for one reason only. On 2026-10-10 they were set
to "paused for terms of use", because both sites' terms forbid automated collection. Nothing is
broken. Both adapters crawled the whole boards cleanly that same day: Amazon gave 22,415
postings, 63% with pay, and Meta 1,143 postings, 79% with pay. The live pages confirm the terms
problem, and for Meta it is stronger than first noted: Meta's careers site's own robots.txt opens
with a notice that collection needs written permission. There is one route to Amazon and Meta
pay that is clearly allowed today: the pay these companies file with the US Department of Labor
(DOL) for visa cases. That data is public domain, and the code to collect it is ready. It needs
one workflow that you approve. Real postings need either the companies' permission or your
decision to accept a legal risk.

## 1. Why they are missing

| Check | Result |
|---|---|
| The code | `server/companies.js` gives both `paused: 'terms'`. `listCompanies()` drops paused boards, so the 6-hourly crawl matrix lists only `google, microsoft, apple, netflix, nvidia`. The build and the site leave them out too, and a link to `#c=amazon` says "roles are paused". |
| The history | `git log -S"paused: 'terms'"`: the pause was added in commit `3361c90` (2026-10-10 09:54 UTC, "pause Amazon and Meta (their terms bar automated collection)"). The three later commits that mention it (`063f5c2`, `4bd17f0`, `08e39cc`) are the playbook, an e2e test and a fix log; none changes it. The adapters were last changed in `dcea1db` (07:40), before the pause. |
| The adapters | Probe run 7 (38035822525, whole boards, finished 10:02 UTC on 2026-10-10). **Amazon:** 22,415 postings in 308 s, 302 requests, all HTTP 200, 14,123 with pay (63.0%), 0 critical vetting flags. **Meta:** 1,143 postings in 1,267 s, 1,146 requests, 906 with pay (79.3%), 0 critical flags. The unit tests pass too (36 of 36 in `test/bigtech-*.test.js`). |
| Probe run 38036154904 | It requested no job pages (`mode=full`, `companies=none`), only footers and terms pages. It found that the amazon.jobs footer's only legal link is "Legal disclosures and notices", and it quoted amazon.com's "data mining, robots" clause. It also found Meta's Automated Data Collection Terms (effective 7 October 2024), and the same kind of anti-robot wording in **Apple's** and **Netflix's** terms (see 2c). Its search for terms links missed links whose web address has no "terms" in it. One of those is amazon.jobs' "Conditions of use" link, which the fetch on 2026-10-11 found. |

One more fact for later: even unpaused, Amazon's board is too big for the site's 40 MB file limit
per company. Run 7 showed the saved file would keep 8,485 of the 22,415 postings (all of them
with pay; salaried postings go first, then the newest). That limit belongs to the backend
engineer.

## 2. What the terms and robots.txt say

### 2a. Amazon: www.amazon.jobs

- **robots.txt** ([amazon.jobs/robots.txt](https://www.amazon.jobs/robots.txt), fetched 2026-10-11
  11:41 UTC). It shuts out only one crawler (AhrefsBot) and the `/internal` pages. Job pages and
  the search the adapter uses are allowed, and the file has no notice about terms.
- **Which terms apply.** amazon.jobs has no terms page of its own. Its footer reads "Privacy ·
  Conditions of use · Cookie preferences · Legal disclosures and notices · Translation
  disclaimer · © 1996-2026, Amazon.com, Inc. or its affiliates". **"Conditions of use" links to
  amazon.com's Conditions of Use** (`nodeId=508088`, which redirects to the page below).
- **Conditions of Use** ([amazon.com](https://www.amazon.com/gp/help/customer/display.html?nodeId=GLSBYFE9MGKKQXXM),
  "Last updated: August 14, 2026", fetched 2026-10-11 11:41 UTC):
  > "By using the Amazon Services, you agree, on behalf of yourself and all members of your household [...] to the following conditions."

  > "Amazon or its content providers grant you a limited, non-exclusive, non-transferable, non-sublicensable license to access and make personal and non-commercial use of the Amazon Services. This license does not include any resale or commercial use of any Amazon Service, or its contents; any collection and use of any product listings, descriptions, or prices; any derivative use of any Amazon Service or its contents; [...] or any use of data mining, robots, or similar data gathering and extraction tools."

  > "No Amazon Service, nor any part of any Amazon Service or its contents, may be reproduced, duplicated, copied, sold, resold, visited, or otherwise exploited for any commercial purpose without express written consent of Amazon."

  The law of Washington State applies. Amazon's address is "Amazon.com, Inc. P.O. Box 81226 Seattle, WA 98108-1226".

**In plain words.** robots.txt lets crawlers in. The terms that amazon.jobs links to say a visitor
may not use robots or data-gathering tools. These are amazon.com's shopping terms, written for
shoppers, but Amazon points to them from the careers site.

### 2b. Meta: www.metacareers.com

- **robots.txt** ([metacareers.com/robots.txt](https://www.metacareers.com/robots.txt), fetched
  2026-10-11 11:41 UTC). The rules allow job pages and list the jobs sitemap. **But the file
  starts with this notice**:
  > "# Notice: Collection of data on Facebook through automated means is
  > # prohibited unless you have express written permission from Facebook
  > # and may only be conducted for the limited purpose contained in said
  > # permission.
  > # See: http://www.facebook.com/apps/site_scraping_tos_terms.php"

  The link in the notice now opens the Automated Data Collection Terms.
- **Automated Data Collection Terms** ([facebook.com/legal/automated_data_collection_terms](https://www.facebook.com/legal/automated_data_collection_terms),
  "Effective October 7, 2024", fetched 2026-10-11 11:46 UTC):
  > "2. You will not engage in Automated Data Collection without first obtaining Meta's express written permission or in any manner that is not explicitly authorized by Meta."

  > "3. [...] acceptance of these Terms alone does not constitute the required written permission to conduct Automated Data Collection; such permission must be obtained separately through Meta's formal authorization process."

  > "4. The Collected Data shall only be Used for the purpose of (i) providing results for your Search Engine, or (ii) displaying previews of Meta URLs to your users, and (iii) for other purposes for which you have received Meta's express written permission to Use Collected Data."

  The terms define "Automated Data Collection" as "the collection of data from Meta Company
  Products via the use of automated or programmatic tools [...] web scrapers, bots, robots,
  spiders, crawlers [...]". With permission, the collector must also follow robots.txt and "only
  use IP addresses, user-agent strings, and other identifiers that identify your services".
  The page names no form or address for the "formal authorization process".
- **Meta Terms of Service** ([facebook.com/legal/terms](https://www.facebook.com/legal/terms),
  "Effective January 1, 2025"). They cover "Facebook, Messenger, and the other products,
  websites, features, apps, services, technologies, and software we offer". Section 3.2 says:
  > "You may not access or collect data from our Products using automated means (without our prior permission) [...] regardless of whether such automated access or collection is undertaken while logged-in to a Facebook account."
- **Careers-specific terms.** None were found. The server-rendered privacy and cookie pages of
  metacareers.com link to the candidate privacy statements, not to any terms.

**In plain words.** Meta's careers site tells crawlers, in its own robots.txt, to get written
permission first. Meta's terms say the same thing three ways.

### 2c. The same wording at two boards that are live

Probe run 38036154904 (2026-10-10) found the same kind of clause at two boards that run today:

- **Apple** ([site terms](https://www.apple.com/legal/internet-services/terms/site.html)): "You may not use any "deep-link", "page-scrape", "robot", "spider" or other automatic device, program, algorithm or methodology [...] to access, acquire, copy or monitor any portion of the Site or any Content".
- **Netflix** ([terms of use](https://help.netflix.com/legal/termsofuse)): "(iv) use any robot, spider, scraper or other automated means to access the Netflix service". These terms cover the streaming service. The careers site runs on another company's platform (Eightfold).

docs/DATA_SOURCES.md says the other boards' terms "were not found to bar" this collection. That
is not right for Apple. If the rule is "pause any board whose terms forbid robots", Apple should
be paused too. The other choice is to say why it is different. Decision 6 below asks you to
choose.

### 2d. Court cases that bear on this (not legal advice)

These are public US rulings about collecting public pages while logged out. They are summarised
from law-firm notes and news reports, not from the opinions themselves.

- **hiQ Labs v. LinkedIn.** In April 2022 the 9th Circuit held, again, that collecting a public
  website likely does not break the federal anti-hacking law (the CFAA). Then, in November 2022,
  the lower court found that hiQ had **broken LinkedIn's User Agreement**, which hiQ had
  accepted; hiQ had also used fake accounts. The case ended in December 2022 with a $500,000
  judgment and a permanent injunction against hiQ.
  ([Morgan Lewis](https://www.morganlewis.com/blogs/sourcingatmorganlewis/2022/12/linkedin-v-hiq-landmark-data-scraping-suit-provides-guidance-to-data-scrapers-and-web-operators),
  [Proskauer](https://newmedialaw.proskauer.com/2022/12/08/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case/))
- **Meta Platforms v. Bright Data** (N.D. Cal., January 2024, Judge Chen). The court held that
  Meta's terms then in force **did not cover logged-out collection of public data**, because a
  logged-out visitor was not a "user". Meta then dropped its remaining claims, in February 2024.
  ([Quinn Emanuel](https://www.quinnemanuel.com/the-firm/news-events/client-alert-meta-v-bright-data-significant-decision-for-web-scraping-industry/),
  [Lowenstein](https://www.lowenstein.com/news-insights/publications/client-alerts/meta-v-bright-data-ruling-has-important-implications-for-webscraping-activities-by-investment-advisers-im))
  **Meta then rewrote its terms**: the current section 3.2 adds "regardless of whether [...] logged-in",
  and the Automated Data Collection Terms say they begin when someone "otherwise engage[s]" in
  collection. No court has yet ruled on these newer terms.
- **X Corp. v. Bright Data** (N.D. Cal., May 2024, Judge Alsup). The court dismissed X's claims
  over collecting public posts and said federal copyright law overrides contract claims of that
  kind. In November 2024, X was allowed to revive part of its case, about access to its servers.
  ([MediaPost](https://www.mediapost.com:443/publications/article/395944/judge-throws-out-xs-claims-against-data-scraper.html))
- **Whether footer terms bind a visitor.** In *Nguyen v. Barnes & Noble* (9th Cir. 2014), terms
  that a site only links in its footer did not bind a person who had no notice of them
  ([Proskauer](https://newmedialaw.proskauer.com/2014/09/08/browsewrap-agreement-held-unenforceable-against-consumer-due-to-insufficient-notice/)).
  But courts have held that a party who knows the terms and keeps visiting can be bound
  (*Register.com v. Verio*, 2d Cir. 2004; that summary was not re-checked here). melon-seek now
  knows both companies' terms: this page records them.

**What this means in practice.** The anti-hacking law is a small risk for public pages, as long
as the site has not told us to stop. If a company sends a cease-and-desist letter, that changes.
The real risk is a breach-of-terms claim, or being blocked. Meta is the company most likely to
act: it has its own collection terms and a robots.txt notice, and it sues collectors (Bright
Data, BrandTotal). Facts such as a job title, a pay range and a place are not
copyrighted. Long job descriptions are.

## 3. Every route to Amazon and Meta postings and pay

| # | Route | Postings | Pay | Places | Freshness | Effort | Cost | Risk |
|---|---|---|---|---|---|---|---|---|
| 1 | **DOL pay filings** (LCA and PERM disclosure files) | No: filings, not postings | Yes, the employer's offered wage for each position | US worksites (city, state) | Every quarter, about 5 to 6 weeks after it ends; the newest file covers 2025-10-01 to 2026-06-30 | Done: the script, tests and workflow patch are ready (3 requests to dol.gov per run) | Free | None: US government work in the public domain |
| 2 | **Written permission** from each company | Yes, all | Yes (Amazon 63%, Meta 79% in run 7) | All | Every 6 hours, like the other boards | Low for us (send 2 emails); the answer may be slow, or never come | Free | None once granted. Meta's terms add conditions such as audits and limits on use |
| 3 | **A feed** the company already sends to job boards (ask in the same email) | Yes | Usually | All | Daily | Medium, a new adapter | Free | None once granted |
| 4 | **Resume the Amazon crawl** without permission (your decision) | Yes: 22,415, with 8,485 kept under the file limit | 63% of postings | 58 countries | Every 6 hours | Very low: remove `paused` | Free | Breach-of-terms claim, blocking, a cease-and-desist letter. Lower than for Meta, still real |
| 5 | **Common Crawl** archive copies | Some: 634 good amazon.jobs job-page copies (about 3% of the 22,415 postings) and 730 metacareers.com ones (the board had 1,143) in the September 2026 crawl | As on the pages | As on the pages | Monthly, 2 to 6 weeks old | Medium: new parsers for the archived pages | Free | Unclear. Common Crawl's terms say the pages "may be subject to separate terms of use [...] from the owners", and the copyright in descriptions stays |
| 6 | **National Labor Exchange** (NLx) research data | Maybe: not confirmed that Amazon or Meta postings are in it | Sometimes | US | Daily | Medium: needs a data request and an agreement | Free for approved uses | Its request page, as search results quote it, allows state labour-market work and "discrete (not ongoing) nonprofit research projects". A public site would need a separate request |
| 7 | **Paid data** (pay or postings vendors) | Yes | Yes | All | Daily | Medium | Paid licence | Low, if licensed |
| 8 | **Resume the Meta crawl** without permission | Yes: 1,143 | 79% of postings (nearly all in the US) | US and abroad | Every 6 hours | Very low | Free | Highest: robots.txt notice, its own collection terms, and a record of suing collectors |

Not routes: no official public API was found for either careers site. The job boards that
repost these jobs (LinkedIn, Indeed) forbid collection in their own terms. State job banks have
their own terms. Google's job listings can't be re-used.

**Ranked:** 1 (now), 2 and 3 (start now, in one email per company), then your choice of 4 for
Amazon. After that come 5, 6 and 7, and 8 last.

## 4. The DOL route: ready, waiting for one workflow

- **What it is.** Two kinds of filing are published every quarter: Labor Condition Applications
  (H-1B, H-1B1 and E-3 visas) and permanent labor certifications (PERM, for green cards). Each
  row gives the employer's legal name, the job title, the worksite and the offered wage range.
  DOL says: "Materials created by the federal government are generally part of the public domain
  and may be used, reproduced and distributed without permission." We may not suggest that DOL
  endorses the site.
- **What we keep.** Only rows whose employer is an Amazon or Meta entity
  (`scripts/alt-data/employers.js`; for example Amazon.com Services LLC, Amazon Web Services,
  Inc., Amazon Development Center U.S., Inc., Meta Platforms, Inc., and Meta Platforms
  Technologies, LLC). Of those rows we keep only the job, place and wage columns. The columns
  with names, e-mails and phones of contacts, attorneys and preparers are never read.
- **What it produces.** `data/alt/dol-amazon-meta.json` (a few dozen KB). It gives counts, the
  matched entities, and the median annual offered wage with the 25th and 75th percentiles, by
  role family, by level, by title and by city. Families and levels use the site's own rules.
  Any name that only looks like Amazon or Meta ("Amazon Hose & Rubber Co.") is listed for a
  person to check, and never counted.
- **Why it isn't here yet.** The sandbox can't reach dol.gov. The newest file is 240 MB
  (1,032,735 filings), too big to bring in through a job log, and a workflow can only run code
  that has been pushed. The workflow is ready as
  [a patch](process/patches/amazon-meta-data-workflow.diff) (`.github/workflows/alt-data-dol.yml`,
  manual, read-only). The lead adds it, runs it, and commits the summary it prints.
- **How it could look** (your call; nothing is wired in). Add one row per company to the
  big-tech list, kept apart from the live boards, for example: **"Amazon: pay filed with the US
  Department of Labor (visa filings, Oct 2025 to Jun 2026), not job postings"**. It would show
  medians by role family and city, and link to the DOL source. It must never mix with posting
  pay. These filings lean towards engineering jobs, and they are offered wages for visa cases,
  not every job.

## 5. Recommendation

1. **Approve the DOL workflow today.** It is the only route to Amazon and Meta pay that is
   clearly allowed, and it costs nothing.
2. **Send both emails today** (drafts below). Ask for permission, or for the feed they already
   send to job boards.
3. **Keep Meta paused** until Meta says yes. Its robots.txt and its terms both say to ask first.
4. **Amazon: wait about two weeks for an answer**, then decide. If you want Amazon postings now,
   that is a choice to accept a risk. The site's linked terms forbid "robots, or similar data
   gathering and extraction tools", even though robots.txt allows the pages. No one on this team
   can make that risk go away.
5. **Treat Apple the same way**, whichever way you decide for Amazon.

## 6. What you need to decide or do

| # | Decision or action | Who | My suggestion |
|---|---|---|---|
| 1 | Approve adding `.github/workflows/alt-data-dol.yml` (from the patch) and running it | You approve, the lead applies | Yes |
| 2 | Whether and how DOL pay appears on `/beta/` | You | One clearly labelled row per company, apart from the postings |
| 3 | Send the two emails below, from your own address as the project owner | You | Yes, today |
| 4 | Amazon postings without permission: accept the risk, or wait | You | Wait about 2 weeks |
| 5 | Meta postings without permission | You | No |
| 6 | Apple, whose site terms have the same kind of clause: keep it, or pause it like Amazon | You | Decide with 4 |

## 7. Draft emails

There is **no published address for these requests** on either site. We checked the amazon.jobs
footer and legal page, amazon.com's Conditions of Use, and metacareers.com's robots.txt,
privacy and cookie pages. We also checked Meta's Terms and its Automated Data Collection Terms,
which mention a "formal authorization process" but give no way to start it. The best channels
found:

- **Amazon.** The address in the Conditions of Use: Amazon.com, Inc., Attn: Legal Department,
  P.O. Box 81226, Seattle, WA 98108-1226. Your best route is any contact you have in Amazon's
  recruiting or employer-brand team, because those teams run the job feeds. The only e-mail
  addresses on the pages we fetched are for other things: copyright@amazon.com (copyright
  claims) and hr-dsr-privacy@amazon.com (candidates' privacy requests).
- **Meta.** Meta Platforms, Inc., Attn: Legal Department, 1 Meta Way, Menlo Park, CA 94025.
  This is the main office address in Meta's annual report, as search results quoted it; it was
  not checked against the filing. Any contact in Meta's recruiting team is a good second route.

**To Amazon.** Subject: Permission request: listing amazon.jobs postings on melon-seek

> Hello,
>
> I run melon-seek (https://alvations.github.io/melon-seek/), a free, open-source site that
> charts the posted pay of public job postings by role, level and place. Each posting links
> back to the employer's own page for applying. We would like to include Amazon's public
> postings from www.amazon.jobs, and we are asking for your written permission first, because
> amazon.jobs links to the amazon.com Conditions of Use, which exclude "data mining, robots, or
> similar data gathering and extraction tools".
>
> What we would collect: for each public posting, the title, team or job category, locations,
> posted date, the posted pay range, and a link to the posting. We would also keep a trimmed
> description so people can search by skill. We collect no personal data, no applications, and
> nothing behind a login.
>
> How: the same JSON search that the amazon.jobs pages use (about 300 requests for the whole
> board), at most one request per second. Our software names itself honestly ("melon-seek/0.2
> (+https://alvations.github.io/melon-seek/ ...)"), checks robots.txt before every run, and
> stops on any error. How often: up to every 6 hours, or as rarely as you prefer, for example
> once a day.
>
> If you already send a job feed to job boards, we would gladly use that instead. We will
> follow any conditions you set (how often, attribution, removal on request). If the answer is
> no, we will not include Amazon postings.
>
> Thank you,
> [your name], melon-seek
> [your e-mail address]

**To Meta.** Subject: Request for written permission under Meta's Automated Data Collection
Terms: metacareers.com job postings

> Hello,
>
> I run melon-seek (https://alvations.github.io/melon-seek/), a free, open-source site that
> charts the posted pay of public job postings by role, level and place. Each posting links
> back to the employer's own page for applying. Under section 3 of Meta's Automated Data
> Collection Terms, and the notice in www.metacareers.com/robots.txt, I am asking for Meta's
> express written permission to include the public job postings of www.metacareers.com. Please
> point me to the formal authorization process if this is not the right channel.
>
> What we would collect: for each public posting in the jobs sitemap that robots.txt lists, the
> title, team, locations, posted date, the posted pay range ("public_compensation"), and a link
> back to the posting. We would also keep a trimmed description so people can search by skill.
> We collect no personal data, nothing behind a login, and nothing from Facebook, Instagram or
> any other Meta product.
>
> How: the jobs sitemap plus one request per posting page (about 1,150 requests for the whole
> board), at most one request per second, under an honest name ("melon-seek/0.2
> (+https://alvations.github.io/melon-seek/ ...)"), from GitHub's servers. We follow robots.txt
> on every run and stop on any error. How often: once a day, or as rarely as you prefer. We can
> also limit it to new postings only.
>
> Use: only to show the postings and their pay on melon-seek, with links back to metacareers.com.
> We would not sell, license or pass on the data. We will follow any conditions you set. If you
> prefer to provide a feed, we would use that instead. If the answer is no, we will not include
> Meta postings.
>
> Thank you,
> [your name], melon-seek
> [your e-mail address]

## Decision (2026-10-11)

The lead put the verified terms and the options above to the user, with the recommendation to ask
permission first. The user's answer, verbatim: **"Resume both now"** (the option "Accept the legal
risk for both companies. Not recommended for Meta, which has sued scrapers before."). For Apple,
whose site terms have a similar clause, the user chose **"Keep as is"**.

What resuming means here: the `paused` field is gone from both entries in `server/companies.js`, so
the 6-hourly beta crawl collects both with the same rules as every board: an honest User-Agent that
names the project, about one request per second, robots.txt checked first (Amazon's and Meta's both
allow the job pages), no login, no browser impersonation. Every Amazon posting is published (the
5,000-posting budget was removed on 2026-10-11 at the user's word: "Why are you capping the no of posting we must present them as they are and not cut anything"). The permission
emails above are still drafted, should the user want to send them; if either company objects, set
`paused: 'terms'` again and the crawl, build and list drop it on the next run.
