# Your Thing · Кем быть

An adaptive career test that runs entirely in the browser. Three questionnaires feed one joint Bayesian profile, and the 923 occupations of O*NET 30.0 are placed in the same space. The Russian version also asks about working conditions, education, documents and health, and ranks occupations by interest, conditions and the time it takes to get in.

- English: https://caerno.github.io/your-thing/
- Русская версия: https://caerno.github.io/your-thing/ru/

## How it works

- **Instruments.** A 48-item RIASEC interest bank, the ten-item TIPI (Big Five) and the twenty forced-choice pairs of Klimov's DDO. The Russian version adds 30 questions on working conditions, 34 on what may keep a person out of an occupation (education, documents, health) and a short block about the person: sex, age, education and how long they are ready to study.
- **Model.** One joint Gaussian over eleven latent scales: six interests and five personality traits. Prior correlations and the RIASEC and TIPI item parameters are estimated on 107,256 people who took both tests (graded response model, coarse classical calibration). Each answer updates the whole profile by expectation propagation.
- **Next question.** English version: the item with the largest expected reduction of uncertainty in the six interest scales. Russian version: interest items and the other questions compete in one stream, and the question whose answer is expected to change the top 30 of the list the most is asked next. This search runs in a background thread.
- **Ranking.** English version: distance in the interest space, each axis weighted by how certain the estimate is. Russian version: interest fit × working conditions × whether the person can get in within the time they are ready to spend. A long path lowers an occupation and does not remove it. Questions not yet asked are filled with frequencies for the person's sex and age; occupations closed by health or law go to a separate folded list with the reason.
- **Marking occupations.** Swipe a row (touch screens) or use ✓ and ✕ (mouse): "mine", up to three, and "not for me". Marks are answers too: "mine" pulls the interest profile towards the occupation on every axis, "not for me" pushes it away along the direction to the occupation. Occupations marked "mine" stay in the list; "not for me" goes to a folded group at the end.
- **Sharing.** A picture with the occupations marked "mine", or the list as Markdown, HTML or JSON. Everything is generated in the page and copied to the clipboard.

## Occupation tabs

- **O*NET**: the description and a link to O*NET OnLine.
- **ESCO**: occupations of the European classification linked by the official ESCO → O*NET-SOC crosswalk.
- **Ministry of Labour directory** (Russian version): similar Russian occupations from the same ISCO group, matched automatically by title; they can be wrong.

## Limits

- DDO options are mapped onto RIASEC by content and are not calibrated.
- The Russian wording of the TIPI items is a working translation, not a validated adaptation.
- Requirements, working conditions and Russian occupation titles are drafted with a language model from O*NET data and have not yet been checked by people. Manual title matches take precedence where they exist.
- The weights of condition answers, the path length penalty and the strength of "mine" and "not for me" are estimates, not calibrated on data.

## Privacy

No backend and no analytics. Answers and marks are kept in the browser's local storage and are not sent anywhere.

## Sources

- RIASEC items and raw response data: openpsychometrics.org, collected 2015–2018; items after Liao, Armstrong & Rounds (2008).
- TIPI: Gosling, Rentfrow & Swann (2003).
- DDO: E. A. Klimov.
- ESCO classification, © European Union; crosswalk ESCO → O*NET-SOC 2019 by the O*NET Resource Center.
- Occupation directory of the Ministry of Labour and Social Protection of the Russian Federation (spravochnik.rosmintrud.ru).
- Frequencies by sex and age: Rosstat (2020 population census, "Healthcare in Russia"), Ministry of Science and Higher Education and Ministry of Education (VPO-1 and SPO-1 graduate statistics, 2025), FOM, VCIOM and SuperJob surveys.
- This page includes information from the O*NET 30.0 Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). Used under the CC BY 4.0 license.

## Contact

Profiles and comments are welcome at kirsanov.dima@gmail.com.
