import type { Dictionary } from "./en";

/**
 * Afaan Oromoo (Qubee/Latin script) — UNREVIEWED MACHINE DRAFT, LOWER CONFIDENCE
 * THAN THE AMHARIC FILE.
 *
 * This needs a native Afaan Oromoo reviewer before it is shown to real users.
 * Financial vocabulary in particular is likely to be borrowed or invented here
 * rather than idiomatic. See `lib/i18n/REVIEW.md`.
 *
 * Any key left out of this file renders the English string instead, so deleting
 * a line you are unsure about is safer than shipping a bad guess.
 */
export const om: Dictionary = {
  "story.badge": "Agarsiisa pilaatfoormii",
  "story.headline": "Qooda guddina Itoophiyaa qabaadhaa",
  "story.welcomeFallback": "Aksiyoonota Itoophiyaa fi boondii mootummaa pilaatfoormii salphaa tokkoon argadhaa.",
  "story.cta": "Imala agarsiisaa",
  "story.risk": "Gatiin ni jijjiirama. Maallaqa dhiyootti hin barbaachifne invastii godhaa. Daataa agarsiisaa qofa.",
  "app.frameLabel": "Aappii invastaraa Frank Money",

  "restricted.title": "Seensa daangeffame",
  "restricted.resolve": "Furaa",
  "restricted.view": "Ilaalaa",
  "restricted.reasonFallback": "Herrega kanaaf daldalli yookaan sochiin maallaqaa hin argamu.",
  "restricted.scopeBoth": "Daldallii fi sochiin maallaqaa hin argaman.",
  "restricted.scopeTrading": "Daldalli hin argamu.",
  "restricted.scopeCash": "Sochiin maallaqaa hin argamu.",
  "restricted.cashFallback": "Seensi maallaqaa daangeffameera.",

  "entry.brand": "AGARSIISA PILAATFOORMII",
  "entry.eyebrow": "KARRA INVASTARAA",
  "entry.title": "Akkamitti jalqabuu barbaaddu?",
  "entry.subtitle": "Herrega agarsiisaa socho'aa ta'een itti fufaa yookaan iyyannoo invastaraa haaraa guutaa.",
  "entry.existingTitle": "Herrega jiruun fayyadamaa",
  "entry.existingDetail": "Akka invastara mirkanaa'eetti Selam yookaan Blue Nile banaa.",
  "entry.newTitle": "Herrega haaraa banaa",
  "entry.newDetail": "Adeemsa galmee guutuu fi mirkaneessa daldalaa xumuraa.",
  "entry.note": "Iyyannoowwan haaraan hanga daldalaan mirkaneessa xumurutti daangeffamanii turu.",

  "personas.backLabel": "Gara filannoo herregaatti deebi'aa",
  "personas.eyebrow": "HERREGA JIRUUN FAYYADAMAA",
  "personas.title": "Invastara filadhaa",
  "personas.subtitle": "Invastaroonni agarsiisaa lamaanuu mirkanaa'anii herrega daldalaa socho'aa qabu.",
  "personas.open": "Banaa",
  "personas.opening": "Banaa jira",
  "personas.individualType": "Invastara dhuunfaa",
  "personas.individualDetail": "Herrega socho'aa qabeenya, ajaja fi seenaa deeggarsaa qabu",
  "personas.corporateType": "Invastara dhaabbataa",
  "personas.corporateDetail": "Herrega dhaabbataa socho'aa hafiinsaa fi qabeenya guddaa qabu",

  "notifications.label": "Beeksisawwan",
  "notifications.title": "Beeksisawwan",
  "notifications.markAllRead": "Hunda akka dubbifametti mallattoo godhaa",
  "notifications.empty": "Amma wanti haaraan hin jiru.",
  "promotion.active": "Ajajoota hanga {date}tti galchitaniif komishiniin daldalaa irraa haqameera.",
  "promotion.marketFees": "Kaffaltiin ECMA, ESX fi CSD amma illee ni jira.",

  "toast.subtitle": "Adeemsi hojii waliinii haaromfameera.",

  "language.label": "Afaan",
  "language.change": "Afaan jijjiiraa",

  "msg.openDemoFailed": "Herrega agarsiisaa kana banuun hin danda'amne.",
  "msg.connectDatabase": "Iyyannoo galchuu dura kuusaa daataa agarsiisaa walqabsiisaa.",
  "msg.verifyBeforeSubmit": "Iyyannoo galchuu dura lakkoofsa bilbilaa mirkaneessaa.",
  "msg.submitOnboardingFailed": "Galmee galchuun hin danda'amne.",
  "msg.missingClientReference": "Iyyannoon wabii maamilaa malee galeera.",
  "msg.awaitingApproval": "Herregni kee mirkaneessa daldalaa eeggachaa jira.",
  "msg.otpCreateFailed": "Koodiin mirkaneessaa uumamuu hin dandeenye.",
  "msg.otpNewFailed": "Koodiin mirkaneessaa haaraan uumamuu hin dandeenye.",
  "msg.otpSendFailed": "Koodiin haaraan ergamuu hin dandeenye.",
  "msg.otpRejected": "Koodiin mirkaneessaa fudhatama hin arganne.",
  "msg.verifyMobileFailed": "Lakkoofsa bilbilaa mirkaneessuun hin danda'amne.",
  "msg.mobileVerified": "Lakkoofsi bilbilaa mirkanaa'eera.",
  "msg.linkBankFailed": "Herrega baankii walqabsiisuun hin danda'amne.",
  "msg.bankSentForReview": "Herregni baankii gamaaggamaaf ergameera.",
  "msg.removeBankFailed": "Herrega baankii balleessuun hin danda'amne.",
  "msg.bankRemoved": "Herregni baankii walqabsiifame haqameera.",
  "msg.approvalRequiredForOrder": "Ajaja galchuu dura mirkaneessi daldalaa barbaachisa.",
  "msg.authCodeRequestFailed": "Koodiin eeyyamaa gaafatamuu hin dandeenye.",
  "msg.orderSubmitFailed": "Ajajni galchamuu hin dandeenye.",
  "msg.updateAccountFailed": "Herrega invastaraa haaromsuun hin danda'amne.",
  "msg.messageSent": "Ergaan gara daldalaa keetiitti ergameera.",
  "msg.messageSendFailed": "Ergaan kee ergamuu hin dandeenye.",
  "msg.requestSent": "Gaaffiin ergameera. Daldalaan kee asitti deebii kenna.",
  "msg.requestSendFailed": "Gaaffiin kee ergamuu hin dandeenye.",
  "msg.serviceRequestSent": "Gaaffiin gamaaggama to'annoof gara daldalaa keetiitti ergameera.",
  "msg.serviceRequestFailed": "Gaaffii galchuun hin danda'amne.",
  "msg.depositSent": "Kaffaltiin jalqabameera. Erga mirkanaa'ee hafni keessan ni haaromfama.",
  "msg.withdrawalSent": "Baasiin qabamee mirkaneessa daldalaaf ergameera.",
  "msg.cashSubmitFailed": "Qajeelfama maallaqaa galchuun hin danda'amne.",
  "msg.noAgreement": "Waliigalteen daldalummaa maxxanfame hin jiru.",
  "msg.kycUpdateFailed": "Sanadoota KYC haaromsuun hin danda'amne.",
  "msg.kycSent": "Sanadoonni KYC gamaaggamaaf gara daldalaa keetiitti ergamaniiru.",

  "request.discrepancyDescription": "Maaloo {orderId} irratti ragaa mirkaneessaa fi raawwii gamaaggamaa.",
  "request.closureDescription": "Maaloo herrega koo cufuuf gamaaggamaatii hafiinsi, qabeenyi yookaan qajeelfamni banaa kamtu qulqullaa'uu qabu natti himaa.",
  "request.correctionDescription": "Maaloo eenyummaa, gibiraa yookaan odeeffannoo quunnamtii koo gamaaggamuu fi sirreessuuf na quunnamaa.",
  "request.discrepancySubject": "Garaagarummaa ajajaa · {orderId}",
  "request.closureSubject": "Gaaffii herrega cufuu",
  "request.correctionSubject": "Gaaffii sirreeffama piroofaayilii",

  "msg.applicationSubmitted": "{clientCode} gamaaggama daldalaaf galeera.",
  "msg.termsAccepted": "Waliigalteen daldalummaa lakkoofsi {version} fudhatameera.",
  "msg.mobileEnding": "bilbila {digits}n xumuramu",
  "msg.registeredMobile": "bilbila kee galmaa'e",
  "msg.registeredEmail": "imeelii kee galmaa'e",
};
