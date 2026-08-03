# Investor portal translation review

The Amharic (`am.ts`) and Afaan Oromoo (`om.ts`) files are **unreviewed machine
drafts**. Nobody on the Frank side can verify them. This document exists so a
native reviewer can correct them efficiently, starting with the terms that carry
the most risk.

**Any key can be deleted.** A missing key falls back to the English string, so
removing a line you are unsure about is always safer than leaving a bad guess in
place. Nothing breaks.

## Scope and standing decisions

- **Amharic is the active language.** Afaan Oromoo stays selectable in the
  switcher, but it is not being extended for now — as new keys are added, `om`
  falls back to English and the portal becomes progressively more English in
  that language. This is expected, not a bug.
- **Investor portal only.** The broker and admin portals are not translated and
  there is no plan to translate them.
- **Demo scaffolding and the desktop marketing panel stay in English.** The whole
  left-hand desktop story panel (`story.badge`, `story.headline`,
  `story.welcomeFallback`, `story.cta`, `story.risk`), the "Platform demo" / 
  "PLATFORM DEMO" labels (`entry.brand`), and the "Demo only" onboarding card
  (`onboarding.demoOnly`, `onboarding.demoOnlyNote`) are deliberately English —
  they frame the demo rather than being product UI a real investor uses. These
  keys are simply **absent from `am.ts`** so the English-fallback layer renders
  them; the English source still lives in `en.ts`. Do not re-add them to `am.ts`.
- **Transliteration over guessing.** Where a term has no settled Amharic
  equivalent, the English word is written in Fidel rather than translated:
  ብሮከር (broker), ኦርደር (order), ሆልዲንግ (holdings), ፖርትፎሊዮ (portfolio),
  ኢንስትሩመንት (instrument), ኩፖን (coupon), ዲቪደንድ (dividend). This matches how
  Ethiopian finance actually speaks and removes the plausible-but-wrong risk.
- **Market data and chart labels are NOT translated.** Indicator and metric
  labels stay in English: P/E, Dividend yield, YTD, Day range, Volume, Open,
  Revenue, Sector, Next dividend, Best buyer / Best seller / Difference, the
  chart range tabs (1W/1M/3M/1Y/All), the bond quote (Price / Yield to maturity)
  and bond Key facts, YOUR POSITION, and the portfolio stat block (Total value,
  Cost basis, Unrealized gain, Dividends this year, Today) plus the allocation
  and chart legends. They are left as whole blocks so a card never reads
  half-translated.
- **Chart *descriptions* ARE translated, unlike chart *labels*.** The `chart.*`
  keys are `aria-label` text read aloud by screen readers, never shown on screen
  (`chart.sparkline`, `chart.priceChart`, `chart.portfolio`,
  `chart.onboardingStep`). A screen-reader user in Amharic should not hit an
  English wall, and translating them cannot affect the visual design.
- **Order fees and costs ARE translated — a deliberate exception.** The fee
  breakdown on the order sheet (Gross consideration, Brokerage, Total estimated
  fees, Total order cost, Net proceeds) is not a market-data indicator: it is the
  cost disclosure an investor reads before authorising money to move. Leaving it
  in English would defeat the point of an Amharic portal at the one screen where
  comprehension matters most. Regulator acronyms stay in Latin script inside the
  Amharic phrase — የECMA ክፍያ, የESX ክፍያ, የCSD ክፍያ.
  **If you disagree with this call, these keys are `order.*` and `bond.*` and can
  be deleted to fall back to English.**

---

## 1. Read this first: the glossary

Fix these ~20 terms before touching full sentences. They repeat across the whole
portal, so getting them right once makes everything else consistent — and they
are where a wrong word does real damage with ESX/ECMA-literate users.

The question for each is not "is this a valid translation?" but **"is this what
an Ethiopian broker or investor actually says?"** Where the industry code-switches
to English, keeping the English word is the correct answer, not a failure.

| English | Amharic draft | Afaan Oromoo draft | Reviewer decision |
| --- | --- | --- | --- |
| broker | **ብሮከር** (transliterated) | daldalaa | Was `ደላላ`, which colloquially means middleman/fixer. Now transliterated. Confirm ብሮከር is what licensed firms use. (`daldalaa` means *trader/merchant* and is probably wrong, but Afaan Oromoo is parked.) |
| order (trading) | **ኦርደር** (transliterated) | ajaja | Was `ትዕዛዝ`, which also means *command*. Now transliterated. |
| holdings | **ሆልዲንግ** (transliterated) | qabeenya | Was `ንብረቶች` (*property* broadly). Now transliterated. |
| portfolio | **ፖርትፎሊዮ** (transliterated) | — | Confirm. |
| instrument | **ኢንስትሩመንት** (transliterated) | — | No natural Amharic equivalent; `መሣሪያ` would read as *tool*. |
| coupon (bond) | **ኩፖን** (transliterated) | — | Confirm. |
| investor | ባለሀብት | invastara | ⚠️ **Kept translated.** `ባለሀብት` is standard in Ethiopian business usage but can imply *capitalist / wealthy person* rather than a retail investor. If it reads wrong, transliterate to ኢንቨስተር. |
| share / stock | አክሲዮን | aksiyoona | Established borrowing. Confirm this is ESX's term. |
| bond | ቦንድ | boondii | Borrowed. Confirm vs. any official term. |
| trading | ግብይት | daldala | `ግብይት` also means *transaction/commerce* generally. |
| account | ሒሳብ | herrega | `ሒሳብ` also means *arithmetic/bill*. Confirm it reads as a securities account. |
| settlement | — | — | Not yet used in translated strings. Agree a term before it appears. |
| deposit | ተቀማጭ | kuusaa maallaqaa | Confirm banking usage. |
| withdrawal | ወጪ | baasii | ⚠️ `ወጪ` also means *expense*. Standard in Ethiopian banking, but confirm. |
| cash | ገንዘብ | maallaqa | Generic *money*; may be acceptable. |
| approval | ማጽደቅ | mirkaneessa | Confirm. |
| verification code / OTP | የማረጋገጫ ኮድ | koodii mirkaneessaa | Reasonable. |
| brokerage agreement | የብሮከር ስምምነት | waliigaltee daldalummaa | Follows the `broker` decision above. |
| KYC | KYC (untranslated) | KYC (untranslated) | Left in Latin script deliberately. Confirm that is right. |
| restricted | የተገደበ | daangeffame | Confirm tone — should read procedural, not punitive. |
| platform | መድረክ | pilaatfoormii | `መድረክ` also means *stage/forum*. |
| demo | ማሳያ | agarsiisa | Confirm. |
| application (to open an account) | ማመልከቻ | iyyannoo | Confirm both are the standard term. |

---

## 2. Register and tone

**Amharic — please confirm the politeness level.** The draft uses the polite/formal
form throughout (`ይክፈቱ`, `ይምረጡ`, `ይመልከቱ`) rather than the familiar imperative
(`ክፈት`, `ምረጥ`). This was a deliberate choice for a regulated financial product,
but it makes buttons longer. If the reviewer prefers the shorter familiar forms
for buttons, that is a valid trade and helps the layout — but it must be applied
**consistently**, not mixed.

**Afaan Oromoo — same question, and additionally:** the draft mixes plural/polite
imperatives (`banaa`, `filadhaa`) with singular forms in a few messages
(`herregni kee` = *your account*, familiar). This inconsistency is a known defect
in the draft and needs a single consistent choice.

---

## 3. Known low-confidence strings

Beyond the glossary, these specific strings are flagged as likely wrong:

| Key | Issue |
| --- | --- |
| `toast.subtitle` | English source ("Shared tenant workflow updated.") is internal engineering jargon that should probably not be user-facing **in any language**. Consider rewriting the English first. |
| `entry.existingDetail` | Contains the proper names Selam / Blue Nile. Confirm they are transliterated or left in Latin script appropriately. |
| `msg.depositSent` | "independent bank verification" is a compliance concept; the draft may not convey *independent*. |
| `msg.serviceRequestSent` | "controlled review" is compliance language; the draft likely loses the specific meaning. |
| `request.closureDescription` | Long compound sentence, written in first person by the investor. Most likely to read awkwardly. |
| `restricted.*` | These appear when an account is frozen — the highest-stakes moment for tone. Must be clear and non-alarming. |
| `msg.mobileEnding` | Word order around the `{digits}` placeholder may be wrong in both languages. |
| `onboarding.pep*` | The PEP declaration is a **regulatory** question. If the Amharic wording changes what a person thinks they are declaring, that is a compliance problem, not a copy problem. Review these with the same care as the agreement itself. |
| `onboarding.consent*` | Consent checkboxes are legally operative text. The Amharic must not broaden or narrow what the investor agrees to. |
| `onboarding.detailsReadyNote` | Long sentence about what is and is not yet connected. Easy to lose the "not yet live" caveat in translation — that caveat must survive. |
| `strategy.q3` | Contains ETB figures inside the question. Check number formatting reads naturally in Amharic. |
| `strategy.introTitleLine*` | Split across two lines to preserve a `<br />`. Amharic word order was reversed so the break still falls sensibly — confirm it reads correctly. |
| `onboarding.fileChosen` | "Choose a different file" follows a KB size. Check the unit placement. |
| `order.disclosure` / `bond.disclosure` | ⚠️ **Highest priority after the glossary.** This is the authorisation an investor gives before money moves. The Amharic must cover exactly the same things as the English (instrument, quantity, order type, estimated value, fee breakdown, execution risk) — no more, no less. |
| `order.typeMarket` / `typeLimit` / `typeStopLoss` | Transliterated to ማርኬት / ሊሚት / ስቶፕ-ሎስ rather than translated. Mistranslating an order type has direct financial consequences, so a borrowing is safer. Confirm Ethiopian brokers use these. |
| `order.hintStopLoss` | Must clearly convey that the final price **may be worse** than the trigger. If that warning weakens in Amharic, that is a mis-selling risk. |
| `order.confirmPrefix*` / `confirmSubject` / `confirmSuffix*` | The sentence is assembled from three fragments so the `<b>` bold survives. English puts the verb first; Amharic puts it last, so the English prefixes are **intentionally empty** in `am.ts` and the verb lives in the suffix. Review the three fragments together, not separately. |
| `bond.confirmPrefix` / `confirmSubject*` / `confirmSuffix` | Same three-fragment pattern as above. |
| `order.grossConsideration` | "Gross consideration" is technical. Drafted as ጠቅላላ ዋጋ (total value) — confirm that is how the fee is understood. |
| `detail.franksTake` | Product voice ("FRANK'S TAKE"). Decide whether it should be translated at all or kept as branding. |
| `cash.withdrawalNote` | Describes reserve → review → debit, and that rejection releases the reservation. The sequence and the release guarantee must both survive translation — this is what stops an investor thinking money already left. |
| `cash.useInvestorName` | Deposit reference instruction. If this is unclear the broker cannot match the incoming transfer, so the deposit stalls. |
| `cash.noApprovedBankNote` | References the "You" tab by name. If `nav.profile` is retranslated, this sentence must follow. Currently uses «እርስዎ». |
| `status.*` | Short labels shown against real money movements. `status.notApproved` covers both `rejected` and `validation_failed` — keep it neutral, it is not always the investor's fault. |
| `learn.orders.*` | The Learn lesson says **Stop-limit**, while the order sheet offers **Stop-loss**. These are genuinely different order types — do not unify them. |
| `learn.dividends.notPromisedText` | "A company can lower, delay, or stop a dividend." This is an expectation-setting statement; it must not soften. |
| `learn.disclaimer` | States external resources are not investment advice. Regulatory-adjacent — must not weaken. |
| `otp.safety` | "Frank will never ask you to share this code…" — an anti-fraud warning. It must stay unambiguous; this is the line that protects against social engineering. |
| `otp.introPrefix` / `introSuffix*` | Three-fragment sentence so the destination stays bold. English prefix carries the channel; the Amharic suffix carries the verb. Review together. |
| `outcome.heldNext` / `outcome.uncertainNext` | Both say **do not resubmit / check first**. If that instruction weakens, an investor may place a duplicate order. Highest-risk strings in the outcome set. |
| `outcome.submittedNext` | Must preserve "Submission does not mean the order has executed." Removing that caveat creates a false expectation of execution. |
| `agreement.consent` | Legally operative — the investor accepting the brokerage agreement. |
| `profile.license` | Licensing/membership disclaimer. Regulatory-adjacent; must not weaken. |
| `profile.helpAmharic` | The menu item literally reads "Help in Amharic". Once the portal *is* in Amharic this label may need rethinking in **English** first. |
| `banks.confirmRemove` | Rendered through `window.confirm`, which cannot be styled — check it reads well as a plain browser dialog. |
| `activity.typeStopLoss` | "Stop-Loss" (capital L) on the activity screen vs `order.typeStopLoss` "Stop-loss" on the order sheet. This mismatch is pre-existing English, preserved deliberately. |

---

## 3b. Values that must never be translated

Some English strings in the components are **stored data**, not display copy. They
are sent to the API or compared against saved records, so translating them would
silently break the form. They are already separated from their labels in code:

- `Drivers License`, `Kebele ID`, `Business license` — proof-of-address types
- `not_declared`, `not_pep`, `pep`, `related_to_pep` — PEP answers
- `grow`, `big`, `income`, `learn`, `short`, `mid`, `long`, `sell`, `wait`, `buy`
  — strategy questionnaire answers
- `Steady`, `Growth`, `Balanced` — computed strategy names
- `All`, `Banks`, `Telecom`, `Stocks`, `Bonds` — market filters
- `Market`, `Limit`, `Stop-loss` — **order types submitted to the API**
- `deposit`, `withdrawal` — **cash movement types submitted to the API**
- `approved`, `pending`, `settled`, `validation_failed`, … — internal status
  values; only their labels are translated, via `lib/i18n/status.ts`
- `investing`, `orders`, `dividends`, `risk` — Learn lesson ids (accordion state)
- `all`, `orders`, `trades`, `money` — activity filters
- `general`, `order`, `cash`, `kyc`, `portfolio`, `call_request`, `complaint`,
  `other` — **support request categories submitted to the API**
- `Buy`, `Sell` — the order side
- `order-v1` — the disclosure version recorded with each order
- bank names, tickers, and client names

If you add a key, never translate a value that the code compares or submits.

---

## 4. Rules for editing these files

1. **Keep `{placeholders}` exactly as written** — `{orderId}`, `{version}`,
   `{clientCode}`, `{digits}`. They are replaced with live values at runtime.
   They may be **moved** within the sentence, but not renamed or translated.
2. **Do not translate proper nouns**: Frank, Frank Money, Selam Mekonnen,
   Blue Nile Trading PLC, ESX, KYC, ETB.
3. **Delete rather than guess.** A deleted key renders English.
4. Do not add keys that are not in `en.ts`.

---

## 4b. A known, accepted mixed-language seam

`thread.statusLabel` in the support list comes from the API (`lib/crm/status.ts`),
so it renders **English** — while the same phrase ("Waiting for broker") renders
**Amharic** in Cash and Activity, where it is generated client-side. An investor
therefore sees the same status in two languages on different screens.

**This is accepted for now and deliberately not fixed.** Resolving it means
translating the CRM status labels server-side, which is part of the wider
"translate API content" work that is out of scope. Do not patch it client-side —
that would put the same label in two places and let them drift.

---

## 5. What is deliberately NOT translated

The portal shows text that comes from the API, not the code. It stays English
regardless of the selected language:

- the tenant welcome message on the desktop panel
- notification titles and bodies
- support conversation messages
- the brokerage agreement (title, summary, content)
- account restriction reasons written by the broker

Translating these means storing per-language versions server-side — a separate
piece of work. Until then the portal is **mixed-language** for these surfaces,
which is visible on the entry screen.

---

## 6. Layout stress test

Visit `/investor?pseudo=1` to render every translated string padded ~40% longer
with accented characters. Use it to find layout breakage without needing any real
translation. `/investor?pseudo=0` turns it off.

Anything that appears **without** surrounding brackets in that mode is a string
still hardcoded in the JSX and not yet extracted.
