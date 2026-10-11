<!-- description: How the Juice Score works: what's left of a salary after tax, rent and living costs in the job's city, scored from 0 to 100, and where each number comes from. -->

# How the Juice Score works

The Juice Score (🍉) estimates how much of a job's salary you would have left each year after tax, rent and everyday living costs in the job's city, and turns that into a score from 0 to 100 with a grade.

Think of the salary as a melon. Tax, rent and living costs are the rind; the Juice is what's left once the rind is peeled off.

For example, one person on {{value:example.gross}} a year in {{value:example.city}} keeps {{value:example.net}} once tax, rent and living costs are paid, which scores {{value:example.score}}: {{value:example.grade}}.

{{figure:waterfall}}

> [!IMPORTANT]
> **An estimate, not financial advice.** The Juice Score uses one simple model for every job so you can compare them side by side. It is not a payslip calculator.

## 1. The formula

{{figure:formula}}

Every amount is for a full year (the drawer can also show it per month), in US dollars, so jobs in different countries sit on the same scale.

- **Gross pay** is the middle of the job's posted base-pay range. Pay quoted by the hour or the month is turned into a yearly figure first, then converted to US dollars. When one posting gives a range for each of several places or levels, the middle is taken across all of them, from the lowest to the highest (the drawer lists each one). Part-time hourly pay is counted on the hours a week the posting states; with no hours stated there is no score. Pay for an internship or another fixed-term programme counts for that term only, so the drawer shows it per month and for the whole term. Pay posted for one country is never used for an office in another country.
- **Tax** is income tax at every level that has one (national, state or province, and city), plus the compulsory social insurance an employee pays, such as Social Security and Medicare in the US. It comes from each country's official tax rules and is worked out in the local currency, so a salary of £100,000 in London is taxed as £100,000.
- **Rent** is twelve months of rent for a home in the city centre, sized for your household. Most one-bedroom rents come from Numbeo, a crowd-sourced cost-of-living website. Two- and three-bedroom rents are usually estimated from the one-bedroom rent, using official data on how much rents rise with each extra bedroom in that city or country. So they carry two dates: the one-bedroom rents are from {{value:rent.asOf}}, and the bedroom data is from {{value:rent.bedrooms.us}} in US cities and {{value:rent.bedrooms.other}} elsewhere.
- **Living costs** are everyday spending other than rent: groceries, transport, utilities, eating out and leisure. They come from Numbeo's estimate of monthly costs for one person in that city, scaled up for couples and families.
- **Juice left** is gross pay minus the other three. It is the money for everything the living costs leave out, such as savings, health insurance, childcare and travel.

The job's drawer shows each line, and how much of your take-home pay (gross pay minus tax) goes on rent.

More detail: [the formula in the technical reference](reference/#1-the-formula).

## 2. Score and grades

{{figure:score-curve}}

The score turns Juice left into a number from 0 to 100. The scale is fixed: the same for every job, company, city and household, so a 70 means the same thing everywhere.

The first dollars count the most. {{value:score.k}} of Juice left scores 63, twice that scores 86, and the score keeps climbing more slowly after that. There is no cut-off below 100, so two very well-paid jobs still get different scores. A score shown as 100 needs at least {{value:score.fullGlass}} left a year. If nothing is left, the score is 0.

For the curious: score = 100 × (1 − e^(−Juice left ÷ {{value:score.k}})), rounded to a whole number.

{{figure:grades}}

The same grades colour the map and drive the Juice filter, where Rind jobs are listed under Dry.

More detail: [score curve and grades](reference/#score-curve-and-grades).

## 3. Tax model

{{figure:tax-split}}

Tax is what the law takes from your pay. The drawer splits it into three parts:

- **Income**: national income tax, including any surcharges on it.
- **Regional**: state, province, canton or city income tax, where there is one. Texas has none, for example, while New York City adds its own on top of New York State's.
- **Social**: compulsory public social insurance paid by the employee, such as Social Security and Medicare in the US, National Insurance in the UK, or pension, health and unemployment insurance in Germany.

How we work it out:

- For one person earning this salary and nothing else, under the latest official rules for that country, state and city.
- With the standard deduction or personal allowance everyone gets, plus the deductions any salaried renter can claim. In the US, state and local income tax (up to the federal cap) is deducted instead when that is larger. Deductions people choose to make, such as charity, are left out.
- Retirement savings that stay yours, such as a 401(k) or a workplace pension fund, are not counted as tax. They are not subtracted anywhere else either.
- We check each rule against official sources, such as tax authorities and the law itself (last checked {{value:tax.asOf}}). Where part of a rule couldn't be confirmed, or we simplify it, its results are rated less sure (see [6. How sure we are](#6-how-sure-we-are)).

For a Couple or a Family, we assume one person earns the whole salary. Where a country taxes couples or families together and we model its rules (the US, Germany and France, for example), tax goes down. Where each person is taxed separately (the UK, Canada and Australia, for example), the earner pays the same as a single person. A few places have family rules we don't model yet; there, the earner is taxed as a single person.

More detail: [tax model](reference/#3-tax-model) and [every tax source](reference/#tax-sources).

## 4. Households

{{figure:households}}

The **Just me · Couple · Family** switch in a job's drawer changes who the salary has to cover; a Family is two adults and two children under 14. Your choice applies across the site (cards, sorting, the Juice filter and the map) and is remembered in this browser.

- **Rent**: a bigger home in the city centre, with one, two or three bedrooms.
- **Living costs**: everyday costs for a couple are {{value:household.couple.scale}} times one person's, and for a family of four {{value:household.family.scale}} times (not two or four times), because people who live together share many costs. These multipliers come from an official scale the UK government uses to compare households of different sizes, in its version that leaves out housing. We checked them against US household spending data.
- **Tax**: lower where joint or family rules apply (see [3. Tax model](#3-tax-model)). There is always one earner.

The salary and the score scale stay the same. A family keeps less of the same salary, so its Juice is lower. That is the point of the switch. Childcare and school fees are not included, so add them yourself if they apply.

More detail: [households](reference/#households-just-me-couple-family).

## 5. Limitations

The Juice Score leaves some things out to stay simple and comparable. Keep them in mind before you decide.

**Pay it doesn't count**

- Equity, bonuses and other extras. Only the posted base pay counts.
- A second income. Couple and Family assume one earner.

**Costs it doesn't count**

- Health insurance, childcare, school fees, travel and savings. Juice left is the money for these.
- Retirement contributions, such as to a 401(k).

**Where it simplifies**

- **Tax** uses standard allowances. It ignores the deductions and credits you might claim, special schemes for people moving from abroad, and church tax. For typical salaries it is usually within a few percentage points of your real tax rate; it is less accurate for very high or very low pay, or a move partway through the year.
- **Rent** is for a city-centre home sized by household. Sharing, owning, living further out or a bigger family can change it a lot. Rents for small cities rest on few reports. Two- and three-bedroom rents are mostly estimates, and for some countries the bedroom data is borrowed from other countries.
- **Living costs** are a lean everyday basket, scaled up for bigger households. Some suburbs use the nearest big city's figure.
- **Pay ranges for several places or levels** are scored on their middle across all of them, not on the range for one place or one level.
- **Exchange rates** are a dated snapshot, so a big currency move takes a while to show. Pay in a currency we have no rate for (Romanian lei, for example) can't be converted, so it gets no score.
- **Coverage**: {{value:cities.count}} cities in {{value:countries.count}} countries. Remote-only jobs and locations outside the list get no score.

More detail: [limitations](reference/#5-limitations).

## 6. How sure we are

{{figure:confidence}}

Most rent and living-cost figures come from Numbeo today, which is why most results are medium or low. The technical reference has a plan to replace Numbeo with official and open sources.

> [!NOTE]
> **The ≈ sign.** A ≈ before a score means at least one of its inputs is an estimate: for example, a two-bedroom rent worked out from the one-bedroom rent, a suburb using its nearest big city's living costs, or one of the few tax schedules we estimate as a whole rather than compute rule by rule.

More detail: [confidence rules](reference/#guardrails-inputs-confidence-rent-override) and [estimates](reference/#estimates).

## 7. How often it's updated

{{figure:sources}}

Job postings and this page are rebuilt every day, so the examples and charts here always use the current numbers. On the beta site, the big-tech careers sites are re-read every 6 hours, and each job's drawer and the data badge say when its board was last read. Exchange rates are meant to be refreshed automatically each month; the table above gives their date and says when an update is due. The Numbeo figures are re-read by hand. Tax rules change when a country publishes a new tax year's rules: January in most countries, April or July where the tax year starts then.

More detail: [data sources](reference/#sources) and [refreshing](reference/#6-refreshing).

## 8. Questions

### Is Juice left the same as take-home pay?

No. Take-home pay is gross pay minus tax. Juice left also takes off rent and everyday living costs, so it is closer to what you would have for saving, travel and everything else.

### Why doesn't a big salary get 100?

The score rises fast at first and then levels off, so it can keep telling well-paid jobs apart instead of giving them all 100. A score shown as 100 needs at least {{value:score.fullGlass}} of Juice left a year.

### Are bonuses, equity or my 401(k) included?

No. Only the posted base pay counts. Bonuses and equity are left out even when the posting mentions them, and the drawer may note that it does. Retirement contributions such as a 401(k) are not subtracted either, so Juice left includes money you might choose to save there.

### Why does the score drop when I pick Couple or Family?

The salary stays the same, but now it pays for a bigger home and more people's everyday costs. Tax can fall where a country taxes families together and we model its rules. The score scale doesn't change, so the drop shows how much further the same salary has to stretch.

### My rent will be different. How much does that matter?

Every $100 a month less than our figure adds $1,200 a year to Juice left, and every $100 more takes $1,200 off. The drawer shows the rent we used and the home it is for, so you can compare it with your own.

### How is the posted pay read?

From the posting itself, or from the careers site's own pay field where there is one. Only base pay counts: a range that includes bonus, commission or equity is shown as such or left out. When a posting gives a range per level (Microsoft's "IC4" and "IC5", NVIDIA's "Level 4" and "Level 5", the company's own level names), the drawer lists each level's range under **Pay by level**, and the headline range runs from the lowest to the highest. Part-time hourly pay is also shown as a full-time year of 2,080 hours, for comparison only.

### Where does a pay estimate come from?

A pay estimate (on jobs with no posted pay, and in Insights) is worked out from the posted pay of the most similar roles at the same company and in the same country, weighted by how close each title and level is. "Typically within ±N%" is how far, in the middle case, the estimate was from the real posted pay when we tested it on postings whose pay we hid. It is an estimate, not a figure from the posting.

### Why do some jobs have no Juice Score?

A score needs a salary and a city. A job gets none when the posting has no pay range or one that failed our sanity checks, when it is remote-only, or when none of its locations is among the {{value:cities.count}} cities we cover.

### The job lists several cities. Which one is scored?

Each city is scored, and the card shows the best one. Open the drawer and use **Compare locations** to see the rest. When some of the locations use the pay range's currency, only those are scored, so a US-dollar range posted for San Francisco and London is scored for San Francisco only.

## 9. The full technical reference

This page is a summary. The [technical reference](reference/) has the full method: every formula, each country's tax rules and sources with the dates they were checked, how each city's figures were sourced and audited, and the plan for better data. It is the version we keep in step with the code, and the one our own tools work from.
