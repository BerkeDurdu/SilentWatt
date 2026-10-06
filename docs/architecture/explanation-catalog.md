# Explanation catalog exp-0.1 (draft)

Açıklama kataloğu, kanıt sözleşmesi v0.1'deki kodlar için Türkçe ve İngilizce metinleri tutar:
vaka özeti, gerekçe cümleleri, ilk kontrol ve adımlar, standart sınırlamalar, insan kararı notu
ve yasak ifadeler. Metinler yalnız kanıttaki alanlarla doldurulur; sunucu kodu (`explainCase`)
backend sahibindedir.

Owner: Role C (Data & AI) writes the catalog content and reviews explanation wording in pull
requests. Role B (backend) writes the server code that uses it and may adapt the format.
Status: draft (Q-15), awaiting the backend owner's review.

| File | What it holds |
| --- | --- |
| [`shared/explanation-catalog.json`](../../shared/explanation-catalog.json) | The catalog: templates, formatting rules, limitations, human-decision note, forbidden terms |
| [`packages/ml/tests/test_explanation_catalog.py`](../../packages/ml/tests/test_explanation_catalog.py) | Content tests (stdlib `unittest`) |
| [evidence-contract.md](evidence-contract.md) | The evidence the templates bind to (rules 1–6, fields, codes) |

## Purpose

The evidence of contract v0.1 already carries the analytic part of an explanation: the case
kind, the reason codes with their values and the recommendation code. The catalog adds the text
side: one sentence per code in Turkish and English, the standard limitations, the
human-decision note and the list of forbidden wording. With it, every explanation is built
from evidence fields only. The product recommends an inspection; people decide (contract
rule 6).

## Ownership split (Q-15)

| Part | Owner | Where |
| --- | --- | --- |
| Which recommendation applies, reason codes and their values | C (ML) | Evidence files (`recommendation_code`, `reasons`, library `rec-0.1`) |
| Text catalog: templates, limitations, note, forbidden terms; wording review in PRs | C | `shared/explanation-catalog.json` |
| `explainCase(evidence, lang)`, the guard and the API response | B (backend) | `server/explain/index.ts` |
| Later LLM provider: prompt and wording guard / integration | C / B | Same interface, same catalog rules |

This is Yusuf's position of 2026-10-06. It is recorded in `second_brain/decisions.md` (Q-15)
and still waits for the backend owner's approval. The backend owner may change the format of
the catalog. The content rules below stay with C.

## How an explanation is assembled

The parts map one to one onto the `Explanation` shape in `server/explain/index.ts`. The same
order is written in the catalog under `assembly`.

| Explanation field | Catalog entry | Evidence it reads |
| --- | --- | --- |
| `summary` | `languages.<lang>.summary[kind][origin]` | `kind`, `origin` and the case placeholders |
| `reasons` | `languages.<lang>.reasons[code]`, one sentence per evidence reason, in evidence order | `reasons[].code`, `reasons[].value` |
| `recommendation.firstCheck`, `recommendation.steps` | `languages.<lang>.recommendations[recommendation_code]` | `recommendation_code` |
| `limitations` | `limitations.always`, then `limitations[kind]`, then `limitations.synthetic` for synthetic cases | `kind`, `origin` |
| `humanDecisionNote` | `languages.<lang>.human_decision_note` | none; always present and always the last text |

`provider` and `guard` are server fields. The catalog supplies what the guard checks (see
"Guard notes").

## Placeholders and the evidence fields they bind to

A placeholder is written `{name}`. Only the names below are allowed; the test checks that each
one names a field declared in `shared/evidence.ts`.

| Placeholder | Evidence field | Format | Used in |
| --- | --- | --- | --- |
| `{household_id}` | `household_id` | identifier | summaries |
| `{onset_local_date}` | `onset_local_date` (first flagged day) | date | summaries |
| `{detected_local_date}` | `detected_local_date` (day the rule was first met) | date | summaries |
| `{last_local_date}` | `last_local_date` | date | summaries |
| `{flagged_days}` | `flagged_days` | count | summaries |
| `{synthetic.start_local_date}` | `synthetic.start_local_date` | date | synthetic summaries only |
| `{synthetic.duration_days}` | `synthetic.duration_days` | count | synthetic summaries only |
| `{value}` | `reasons[].value` of the reason being written | per reason code | reason sentences only |

Summaries use only fields that are never null in the contract. Observed summaries never use
`synthetic.*`, because `synthetic` is null for observed cases. Recommendations, limitations,
the note and the label have no placeholders.

## Reason codes

Value meanings are those of the contract; the format turns the value into text.

| Code | Value (contract) | Format | The sentence says |
| --- | --- | --- | --- |
| `DAILY_EXCESS_Z` | largest daily z among flagged days | statistic | the largest daily z, and that z compares the daily difference from the model reference with June days |
| `UPPER_BOUND_EXCEEDANCE` | share of valid slots above the upper bound on flagged days | share | the share of valid quarter-hour readings above the upper bound of the prediction interval |
| `CONSECUTIVE_FLAGGED_DAYS` | number of consecutive flagged days | count | the number of consecutive days that met the detector condition |
| `PERSISTENT_CUSUM` | largest chronic statistic | statistic | the highest value of the persistence statistic (CUSUM), which grows as higher-than-expected days accumulate |
| `EXCESS_OVER_REFERENCE` | excess share over the model reference | signed_share | the difference between observed consumption and the model reference over the flagged days |
| `DAYS_NOT_SCORED` | days in the case window that could not be scored | count | how many days could not be assessed, and that they count as neither normal nor deviating |
| `MISSING_READINGS` | share of expected slots without a valid reading | share | the share of expected quarter-hour readings without a valid value |
| `FROZEN_READINGS` | slots in suspected freeze runs | count | the number of quarter-hour readings in suspected freeze runs |

## Recommendation codes (library `rec-0.1`)

| Code | First check (en) | Steps |
| --- | --- | --- |
| `HVAC_PERSISTENT_INCREASE` | Check the thermostat settings and usage changes; if there is no explanation, plan a technician inspection. | look for a recorded setting or usage change; look at the hours of the deviation and the daily highest temperatures in the chart; if nothing explains it, plan a technician inspection and record the outcome on the case |
| `DATA_SOURCE_CHECK` | Inspect the measurement and data source; this is not a device signal. | check for an interruption of the measurement hardware or data transfer; check for readings stuck at one value; if it continues, report it to whoever is responsible for the data source and do not interpret consumption on these days |

The first checks repeat the contract's code list word for word. The steps are written for the
maintenance team: they contain no electrical panel instruction (PRD v1.1 §13.2) and name no
physical cause (§9.5).

## Formatting rules

| Format | Rule | Turkish | English |
| --- | --- | --- | --- |
| identifier | as in the evidence, no thousands separator | 90001 | 90001 |
| count | whole number, no thousands separator | 3 | 3 |
| statistic | evidence number (at most 2 decimals), trailing zeros removed | 2,6 | 2.6 |
| share | value × 100, at most 2 decimals, trailing zeros removed | %41 · %12,78 | 41% · 12.78% |
| signed_share | like share, with `+` or `-` (0 has no sign) | +%18 | +18% |
| date | day (no leading zero), month name, year | 3 Temmuz 2018 | 3 July 2018 |
| unit_hours | evidence number (at most 3 decimals) and the unit-hours label | 33,984 kaynak birimi × saat | 33.984 source unit × hours |
| null (any format) | the null text, never 0 and never empty | hesaplanmadı | not computed |

Why:

- **Unit-hours as a share of the model reference (rule 1).** The source unit is unverified, so
  no energy unit appears. The templates show unit-hours only as `EXCESS_OVER_REFERENCE`, a
  signed share of the model reference. The `unit_hours` format is there for surfaces that show
  the daily unit-hours themselves. No v0.1 template uses it.
- **Two decimals for percentages.** The evidence rounds shares to 4 digits, so a percentage
  with at most 2 decimals is exactly the evidence value. Project documents already write
  "%12,78". A guard that formats the evidence with the same rules finds the number again.
- **Explicit sign on the excess share.** If an excess share is ever negative, it reads as "-%5"
  and never as an excess.
- **Null is not zero (rule 4).** A null value prints the null text. Every reason sentence ends
  with its value, so "... payı hesaplanmadı." and "... is not computed." are still sentences.
  The current writer never produces a null reason value, but the contract type allows one.
- **Dates with month names.** The month names live in the catalog, so the server and the test
  produce the same text without depending on a locale library.

## Wording rules and why

- **Product language.** The texts say "air1 kanal sapması" / "air1 channel deviation" and
  "inceleme önerisi" / "inspection recommendation", and they end with "Bu bir inceleme
  önerisidir; karar ekibindir." / "This is an inspection recommendation; the decision rests
  with the team." (rule 6). The Turkish is plain and calm. There is no diagnosis, only what was
  measured and what to check.
- **No fault talk (rule 2).** The texts never use "arıza" or "fault". The forbidden list holds
  the contract's examples ("arıza doğrulandı", "fault confirmed", "kesin arıza") and also the
  bare words "arıza" and "fault". So "%90 arızalı" or "filtre arızası kesin" (PRD v1.1 §13.2)
  cannot slip through either. Probability words ("olasılık", "ihtimal", "probability",
  "likelihood") are forbidden too.
- **No unit, savings or money claims (rule 1).** The list forbids "kW" (which also catches
  kWh), "kilovat", "kilowatt", "tasarruf", "saving", and currency words and signs ("TL", "₺",
  "$", "€", "maliyet", "fatura", "cost", "bill", "price", ...).
- **How a forbidden term matches.** Matching ignores case and treats Turkish ı/I and i/İ as one
  letter, so "ARIZA DOĞRULANDI" is caught. A term matches where a word starts and may continue
  into a longer word: "tasarruf" catches "tasarrufu", "kW" catches "kWh" and "5kW", but "kw"
  inside "backward" is not a match. Every text is checked against the terms of both languages,
  so a Turkish text cannot carry "kWh" either.
- **Every number comes from the evidence.** Static text contains no digit except the channel
  name `air1`. That is why the texts say "çeyrek saatlik" / "quarter-hour" rather than "15
  dakikalık". It is also why detector thresholds never appear: they are in `index.json`
  (`run.detector`), not in the case file that `explainCase` receives.
- **Synthetic cases stay labelled (rule 3).** Synthetic summaries start with "Sentetik deney." /
  "Synthetic experiment.". They end with a sentence saying the case is not a real event and
  when and for how long the scenario was applied (`synthetic.start_local_date`,
  `synthetic.duration_days`). Synthetic cases also get the limitation that they are not counted
  in real case statistics. Observed summaries never contain the label.
- **Turkish suffixes.** No suffix is attached to a placeholder ("{value}'lik" would need vowel
  harmony with a number that is unknown in advance). Values stand alone: "payı %41", "7 günlük"
  (the suffix is on "gün").
- **English plurals.** Counts are written as "number of ... is N" or "a N-day scenario", so
  "1 days" can never appear.
- **Data issues are not device signals.** A data issue summary says that consumption could not
  be assessed. The limitation says it tells nothing about the device. The deviation wording
  ("air1 kanal sapması") is not used for data issues.

## Guard notes for the server

The guard is the backend owner's code. The catalog gives it what to check:

1. No term of either language's `forbidden_terms` occurs, using the matching rule in
   `forbidden_terms_matching`.
2. Every number in the text equals an evidence value written with the catalog's formats. In
   template texts this holds by construction; it matters for a later LLM provider.
3. `human_decision_note` is present and is the last text.
4. If any check fails, fall back to the template text (contract, "Explanation interface").

## Examples rendered from the fixtures

These are generated from the committed fixtures (made-up households 90001–90004) with
catalog exp-0.1. The tests render all four cases in both languages.

### `SW-HVAC-90003-20180703-ACU` (observed, acute)

Evidence: onset 2018-07-03, rule met 2018-07-04, last day 2018-07-05, 3 flagged days; reasons
`DAILY_EXCESS_Z` 2.6, `UPPER_BOUND_EXCEEDANCE` 0.41, `CONSECUTIVE_FLAGGED_DAYS` 3,
`EXCESS_OVER_REFERENCE` 0.18; recommendation `HVAC_PERSISTENT_INCREASE`.

| Field | Türkçe |
| --- | --- |
| summary | Hane 90003 için air1 kanal sapması. 3 Temmuz 2018 ile 5 Temmuz 2018 arasında tüketim, sıcaklık ve saate göre beklenenden yüksek seyretti. Dedektör kuralı ilk kez 4 Temmuz 2018 tarihinde karşılandı; günlük koşulu karşılayan (işaretli) gün sayısı 3. |
| reasons | İşaretli günlerdeki en yüksek günlük z değeri 2,6; bu değer, gözlenen tüketim ile model referansı arasındaki günlük farkın Haziran günlerindeki farklara göre ne kadar büyük olduğunu gösterir. |
| | İşaretli günlerde modelin tahmin aralığının üst sınırını aşan geçerli çeyrek saatlik ölçümlerin payı %41. |
| | Dedektör koşulunu art arda karşılayan gün sayısı 3. |
| | İşaretli günlerin toplamında gözlenen tüketimin model referansına (sıcaklık ve saate göre beklenen tüketim) göre farkı +%18. |
| firstCheck | Termostat ayarlarını ve kullanım değişikliklerini kontrol edin; açıklama bulunmazsa teknisyen incelemesi planlayın. |
| steps | Vaka tarihlerinde termostat ayarında ya da kullanım düzeninde bir değişiklik kaydı olup olmadığına bakın. |
| | Grafikte sapmanın hangi saatlerde yoğunlaştığını ve günlerin en yüksek sıcaklıklarını inceleyin. |
| | Bir açıklama bulunmazsa teknisyen incelemesi planlayın ve inceleme sonucunu vakaya kaydedin. |
| limitations | Değerler doğrulanmamış kaynak birimindedir; bu yüzden fiziksel bir enerji birimiyle gösterilmez. |
| | Model referansı ve tahmin aralığı, hanenin geçmiş verisinden sıcaklık ve saate göre öğrenilmiş beklentilerdir; cihazın sağlıklı çalıştığını gösteren sınırlar değildir. |
| | Değerlendirilemeyen günler (eğitimde görülmemiş sıcaklık, eksik ya da donmuş veri) ne normal ne de sapmalı sayılır. |
| | Dedektör eşikleri gerçek saha sonuçlarıyla doğrulanmadı; doğru ve yanlış uyarı oranları henüz bilinmiyor. |
| | Vaka geçmiş verinin yeniden oynatılmasından üretildi; canlı bir izleme sonucu değildir. |
| | Sapmanın nedeni (kullanım, ayar, hava koşulları ya da cihaz) veriden belirlenemez; bu açıklama bir teşhis değildir. |
| humanDecisionNote | Bu bir inceleme önerisidir; karar ekibindir. |

| Field | English |
| --- | --- |
| summary | Household 90003: air1 channel deviation. Between 3 July 2018 and 5 July 2018, consumption was higher than expected for the temperature and time of day. The detector rule was first met on 4 July 2018; number of days that met the daily condition (flagged days): 3. |
| reasons | The largest daily z on the flagged days is 2.6; it shows how large the daily difference between observed consumption and the model reference is compared with the differences on June days. |
| | On the flagged days, the share of valid quarter-hour readings above the upper bound of the model's prediction interval is 41%. |
| | The number of consecutive days that met the detector condition is 3. |
| | Over the flagged days, the difference between observed consumption and the model reference (the expected consumption for the temperature and time of day) is +18%. |
| firstCheck | Check the thermostat settings and usage changes; if there is no explanation, plan a technician inspection. |
| steps | Check whether a change in the thermostat setting or the usage pattern was recorded on the case dates. |
| | In the chart, look at the hours where the deviation concentrates and at the highest temperatures of the days. |
| | If no explanation is found, plan a technician inspection and record its outcome on the case. |
| limitations | Values are in an unverified source unit, so they are not shown in a physical energy unit. |
| | The model reference and the prediction interval are expectations learned from the household's past data for the temperature and time of day; they are not limits that show the device works properly. |
| | Days that could not be assessed (a temperature not seen in training, missing or frozen data) count as neither normal nor deviating. |
| | The detector thresholds have not been validated against real field outcomes; the rates of correct and false alerts are not yet known. |
| | The case comes from a replay of past data; it is not a live monitoring result. |
| | The cause of the deviation (usage, settings, weather or the device) cannot be determined from the data; this explanation is not a diagnosis. |
| humanDecisionNote | This is an inspection recommendation; the decision rests with the team. |

### `SW-SYN-HVAC-90004-20180724-DQ` (synthetic, data issue)

Evidence: synthetic `data_fault` / `outage` from 2018-07-24 for 3 days; onset 2018-07-24, rule
met 2018-07-25, last day 2018-07-26; reason `MISSING_READINGS` 0.58; recommendation
`DATA_SOURCE_CHECK`. The always-limitations are the same as above and are not repeated.

| Field | Türkçe |
| --- | --- |
| summary | Sentetik deney. Hane 90004 için air1 kanalında veri sorunu. 24 Temmuz 2018 ile 26 Temmuz 2018 arasında ölçümler günlük veri kalitesi kontrolünden geçemedi; bu günlerde tüketim değerlendirilemedi. Veri sorunu kuralı ilk kez 25 Temmuz 2018 tarihinde karşılandı; kontrolden geçemeyen gün sayısı 3. Bu vaka gerçek bir olay değildir: ölçülmüş air1 verisine 24 Temmuz 2018 tarihinden başlayarak 3 günlük bir senaryo uygulandı. |
| reasons | Vaka günlerinde beklenen çeyrek saatlik ölçümlerden geçerli değeri olmayanların payı %58. |
| firstCheck | Ölçüm ve veri kaynağını inceleyin; bu bir cihaz sinyali değildir. |
| steps | Vaka günlerinde ölçüm donanımında ya da veri aktarımında bir kesinti olup olmadığını kontrol edin. |
| | Okumaların uzun süre aynı değerde kalıp kalmadığına (donma şüphesi) bakın. |
| | Sorun sürerse veri kaynağının sorumlusuna bildirin; veri düzelmeden bu günlerin tüketimini yorumlamayın. |
| limitations (after the five always-limitations) | Veri sorunu ölçümle ya da veri aktarımıyla ilgilidir; cihazın durumu hakkında bilgi vermez. |
| | Sentetik vakalar dedektörü sınamak için üretilir; gerçek vaka sayılarına ve istatistiklerine katılmaz. |
| humanDecisionNote | Bu bir inceleme önerisidir; karar ekibindir. |

| Field | English |
| --- | --- |
| summary | Synthetic experiment. Household 90004: data issue on the air1 channel. Between 24 July 2018 and 26 July 2018, the readings did not pass the daily data quality check, so consumption could not be assessed on these days. The data issue rule was first met on 25 July 2018; number of days that failed the check: 3. This case is not a real event: a 3-day scenario was applied to measured air1 data starting on 24 July 2018. |
| reasons | On the case days, the share of expected quarter-hour readings without a valid value is 58%. |
| firstCheck | Inspect the measurement and data source; this is not a device signal. |
| steps | Check whether the measurement hardware or the data transfer was interrupted on the case days. |
| | Check whether readings stayed at the same value for a long time (suspected freeze). |
| | If the problem continues, report it to whoever is responsible for the data source; do not interpret consumption on these days until the data is fixed. |
| limitations (after the five always-limitations) | A data issue concerns the measurement or the data transfer; it says nothing about the condition of the device. |
| | Synthetic cases are generated to test the detector; they are not counted in real case numbers or statistics. |
| humanDecisionNote | This is an inspection recommendation; the decision rests with the team. |

### `SW-SYN-HVAC-90002-20180722-CHR` (synthetic, chronic): summary and reasons

Evidence: synthetic `ramp_increase` from 2018-07-18 for 14 days; onset 2018-07-22, rule met
2018-07-27, last day 2018-07-31, 10 flagged days; reasons `PERSISTENT_CUSUM` 6.1,
`UPPER_BOUND_EXCEEDANCE` 0.41, `EXCESS_OVER_REFERENCE` 0.12, `DAYS_NOT_SCORED` 3.

| Field | Türkçe | English |
| --- | --- | --- |
| summary | Sentetik deney. Hane 90002 için air1 kanal sapması. 22 Temmuz 2018 ile 31 Temmuz 2018 arasında tüketim, sıcaklık ve saate göre beklenenden yüksek seyretti. Dedektör kuralı ilk kez 27 Temmuz 2018 tarihinde karşılandı; günlük koşulu karşılayan (işaretli) gün sayısı 10. Bu vaka gerçek bir olay değildir: ölçülmüş air1 verisine 18 Temmuz 2018 tarihinden başlayarak 14 günlük bir senaryo uygulandı. | Synthetic experiment. Household 90002: air1 channel deviation. Between 22 July 2018 and 31 July 2018, consumption was higher than expected for the temperature and time of day. The detector rule was first met on 27 July 2018; number of days that met the daily condition (flagged days): 10. This case is not a real event: a 14-day scenario was applied to measured air1 data starting on 18 July 2018. |
| reasons | Kalıcılık göstergesinin (birikimli toplam, CUSUM) vaka boyunca ulaştığı en yüksek değer 6,1; bu gösterge, beklenenden yüksek tüketimli günler biriktikçe büyür. | The highest value the persistence statistic (cumulative sum, CUSUM) reached during the case is 6.1; it grows as days with higher than expected consumption accumulate. |
| | İşaretli günlerde modelin tahmin aralığının üst sınırını aşan geçerli çeyrek saatlik ölçümlerin payı %41. | On the flagged days, the share of valid quarter-hour readings above the upper bound of the model's prediction interval is 41%. |
| | İşaretli günlerin toplamında gözlenen tüketimin model referansına (sıcaklık ve saate göre beklenen tüketim) göre farkı +%12. | Over the flagged days, the difference between observed consumption and the model reference (the expected consumption for the temperature and time of day) is +12%. |
| | Vaka penceresinde değerlendirilemeyen gün sayısı 3; bu günler (örneğin eğitimde görülmemiş bir sıcaklık ya da eksik veri yüzünden) ne normal ne de sapmalı sayıldı. | The number of days in the case window that could not be assessed is 3; these days (for example because of a temperature not seen in training or missing data) count as neither normal nor deviating. |

## Verification

```bash
PYTHONPATH=packages/ml/src python -m unittest discover -s packages/ml/tests -p 'test_explanation_catalog.py' -v
```

The tests read the code lists from `shared/evidence.ts` and from
`silentwatt_ml.detection.evidence`, and check that both list the same codes. They then check:

- every code, kind and origin has texts in both languages;
- placeholders name contract fields;
- static text has no digits;
- no forbidden term appears in any text;
- the four fixture cases render with no unresolved placeholder and end with the
  human-decision note;
- synthetic cases carry the label;
- the formatted numbers and dates match the evidence (hand-written expectations).

`FROZEN_READINGS` is not in the fixtures; every reason code is also rendered with a sample value
and with null. The renderer in the test file is a test helper, not a second server
implementation.

## Known gaps and open points

1. **Single-day cases.** If onset and last day coincide, the summary reads "3 Temmuz 2018 ile 3
   Temmuz 2018 arasında". The sentence is correct but clumsy. A single-day variant would be a
   catalog addition.
2. **No thresholds in the text.** `explainCase` receives only the case file. The detector
   thresholds are in `index.json`. Saying "above the threshold" would need the server to pass
   `run.detector` (an interface decision for B) and new placeholders.
3. **`DAYS_NOT_SCORED` window.** The contract says "days in the case window". The writer
   (`evidence.py`) counts unscored days from three days before onset to the last day. The
   templates follow the contract wording; the contract should define the window or the count
   should change (owner decision).
4. **Fixture value.** In `SW-SYN-HVAC-90002-20180722-CHR`, `DAYS_NOT_SCORED` is 3. The fixture's
   own daily rows give 2 under the writer's window and 0 within onset–last. The fixtures are
   made up, so the tests are not affected, but a demo on fixtures would show a number the
   chart does not.
5. **"Measured data" in synthetic summaries.** This is true for real runs. The committed
   fixtures are made up throughout (`fixture: true`), so the console should keep showing that.
6. **Scenario type not named.** The text does not say step, ramp or data fault. The console can
   show `synthetic.scenario` directly; labels for scenarios would be a catalog addition.

## Versioning

exp-0.1 targets evidence contract `silentwatt.evidence/0.1` and recommendation library
`rec-0.1`. The catalog records both. While the catalog is a draft, wording changes inside a
sentence keep exp-0.1 and are reviewed in the pull request. These changes create exp-0.2:

- a new placeholder;
- a change to a format or to the assembly order;
- a new code.

A new reason code or field in the contract (v0.2) needs a catalog update in the same change.
The tests fail until every code has texts in both languages.
