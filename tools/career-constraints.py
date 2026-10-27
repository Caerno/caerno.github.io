#!/usr/bin/env python3
"""Ограничения для «Кем быть»: вопросы (контекст, барьеры, условия), априорные P(ответ | пол, возраст), профессии
(барьеры, условия, путь). Источники — priors/ и llm/ в career_data и llm_out из tools/sources.json.
  python3 tools/career-constraints.py → data/career/constraints.json, data/career/ru-names.json"""
import json, os
from datetime import date
from sources import ROOT, src

V = src('career_data')
K = src('llm_out')
PR = json.load(open(V / 'priors/priors-2026-10-21.json'))
PS = json.load(open(V / 'priors/path-spec-2026-10-21.json'))
BV = {b['id']: b for b in json.load(open(V / 'llm/barrier-vars-2026-10-20.json'))}
VC = {c['id']: c for c in json.load(open(K / 'vocab.json'))['conditions']}
ED = json.load(open(K / 'edu_fields.json'))
VPO = json.load(open(V / 'priors/vpo1-graduates-by-ugsn-sex-2017-2025.json'))['2025']['by_ugsn']
SPO = {k: v for k, v in json.load(open(V / 'priors/spo1-graduates-by-ugs-sex-2025.json'))['by_ugs'].items() if ':' not in k}
AGES, SEX = PR['ages'], PR['sexes']
r4 = lambda x: round(x, 4)

# ВПН-2020: доля с высшим, с СПО; аспирантура/степень — из b_academic_degree
EDU = {'m': {'14-17': (0, 0), '18-24': (.10, .26), '25-34': (.33, .40), '35-44': (.31, .42), '45-54': (.26, .47), '55-64': (.21, .49), '65+': (.19, .48)},
       'f': {'14-17': (0, 0), '18-24': (.15, .22), '25-34': (.45, .32), '35-44': (.42, .36), '45-54': (.33, .44), '55-64': (.25, .49), '65+': (.21, .50)}}


def level_prior(s, a):
    hi, co = EDU[s][a]
    ad = PR['barriers']['b_academic_degree']['p'][s][a]; pg = ad['degree'] + ad['postgrad']
    return [max(0, 1 - hi - co), co, max(0, hi - pg), pg]   # school, college, university, postgrad


def dir_share(table, codes, s):
    w = lambda v: v['women'] if s == 'f' else v['total'] - v['women']
    return sum(w(table[c]) for c in codes if c in table)


DIRS = ED['directions']
DCODES = [[c.strip() for c in d['okso'].split(',') if c.strip()] for d in DIRS]


def dir_prior(table, s, level):
    """Доли направлений в выпуске данного пола. Общий код делится поровну между направлениями;
    31 (клиническая медицина) — в вузе врачам, в колледже — среднему медперсоналу (фельдшер)."""
    owners = {}
    for i, cs in enumerate(DCODES):
        for c in cs: owners.setdefault(c, []).append(i)
    if '31' in owners:
        ids = [d['id'] for d in DIRS]
        want = 'medicine' if level == 'university' else 'nursing'
        if want in ids: owners['31'] = [ids.index(want)]
    raw = [0.0] * len(DIRS)
    for c, own in owners.items():
        for i in own: raw[i] += dir_share(table, [c], s) / len(own)
    t = sum(raw) or 1
    return [r4(x / t) for x in raw]


Q = {}
Q['sex'] = {'kind': 'context', 'text': 'Ваш пол', 'states': SEX, 'labels': ['Мужской', 'Женский']}
Q['age'] = {'kind': 'context', 'text': 'Сколько вам лет?', 'states': AGES, 'labels': ['14–17', '18–24', '25–34', '35–44', '45–54', '55–64', '65 и старше']}
Q['level'] = {'kind': 'context', 'text': 'Какое у вас образование?', 'states': ['school', 'college', 'university', 'postgrad'],
              'labels': ['Школа (или ещё учусь)', 'Колледж, техникум', 'Вуз', 'Аспирантура или учёная степень'],
              'prior': {s: {a: [r4(x) for x in level_prior(s, a)] for a in AGES} for s in SEX}}
Q['direction'] = {'kind': 'context', 'text': 'В какой области ваше образование?', 'states': [d['id'] for d in DIRS], 'labels': [d['name'] for d in DIRS],
                  'needs': {'level': ['college', 'university', 'postgrad']},
                  'prior_by_level': {'college': {s: dir_prior(SPO, s, 'college') for s in SEX}, 'university': {s: dir_prior(VPO, s, 'university') for s in SEX}}}
Q['horizon'] = {'kind': 'context', 'text': 'Сколько времени вы готовы учиться новой профессии?', 'states': list(PS['constants']['HORIZON']),
                'labels': [PS['constants']['HORIZON_TEXT'][k] for k in PS['constants']['HORIZON']], 'years': list(PS['constants']['HORIZON'].values()),
                'prior': {s: {a: PS['constants']['HORIZON_PRIOR'][a] for a in AGES} for s in SEX}}
# состояние барьера требует уровня образования не ниже (для согласования с ответом «образование»)
NEED = {'doctor_residency': 'university', 'doctor_no_residency': 'university', 'clinical': 'university', 'other_psy': 'university', 'law': 'university',
        'university': 'university', 'natural': 'university', 'humanities': 'university', 'other': 'university', 'degree': 'postgrad', 'postgrad': 'postgrad',
        'strong': 'university', 'med_college': 'college', 'college': 'college', 'pedagogy': 'college', 'defectology': 'college'}
for bid, b in PR['barriers'].items():
    bv = BV[bid]; lab = {a['code']: a['text'] for a in bv['answers']}
    q = {'kind': 'barrier', 'text': next((x for x in [bv.get('ask')] if x), None), 'states': b['states'], 'labels': [lab.get(s, s) for s in b['states']],
         'sensitive': bv['sensitive'], 'min_age': bv['min_age'], 'род': bv['kind'],
         'prior': {s: {a: [r4(b['p'][s][a][st]) for st in b['states']] for a in AGES} for s in SEX}}
    need = {st: NEED[st] for st in b['states'] if st in NEED and bid != 'b_math_level' or (bid == 'b_math_level' and st == 'strong')}
    if bid == 'b_econ_diploma': need = {'yes': 'university'}
    if need: q['need_level'] = need
    Q[bid] = q
for cid, c in PR['conditions'].items():
    # порядок кнопок — как в словаре: «Да» / середина / «Нет»; состояния выстроены в том же порядке
    st = ['yes', 'some', 'no'] if len(c['answers']) == 3 else ['yes', 'no']
    assert set(st) == set(c['states']), cid
    Q[cid] = {'kind': 'condition', 'text': VC[cid]['ask'], 'states': st, 'labels': c['answers'],
              'prior': {s: {a: [r4(c['p'][s][a][x]) for x in st] for a in AGES} for s in SEX}}
for k, v in Q.items():  # каждая подпись кнопки стоит против своего состояния
    assert len(v['labels']) == len(v['states']), k
# текст вопроса барьера — из словаря разметки (llm_out/vocab.json)
for b in json.load(open(K / 'vocab.json'))['barriers']:
    if b['id'] in Q and not Q[b['id']]['text']: Q[b['id']]['text'] = b['ask']
missing = [k for k, v in Q.items() if not v.get('text')]
assert not missing, missing

# «закон» — только где закон требует диплом, удостоверение, лицензию, допуск (разметка языковой моделью по регулируемым профессиям); медосмотры и инструктажи — нет
LAW = json.load(open(V / 'llm/law-strict-2026-10-21.json'))
EP = ['открытый', 'курсы', 'диплом', 'портфолио', 'лестница', 'отбор']
OCC = {}
for code, o in PS['professions'].items():
    b = {}
    for bid, v in o['barriers'].items():
        if bid not in Q and bid != 'b_age': continue
        e = {}
        if v['closes']: e['cl'] = v['closes']
        if v['lowers']: e['lo'] = {k: r4(x) for k, x in v['lowers'].items()}
        if v['path']: e['p'] = {k: r4(x) for k, x in v['path'].items()}
        if e: b[bid] = e
    lw = LAW.get(code, {'law': False, 'what': ''})
    OCC[code] = {'T0': o['T0'], 'ep': o['entry_path'], 'reg': lw['law'], **({'regw': lw['what']} if lw['law'] else {}), 'lvl': o['education_min'], 'dirs': o['directions'], 'dip': o['diploma_by_barriers'],
                 'b': b, 'c': [c for c in o['conditions'] if c in Q], 'k': len(set(o['core_skills'])), 'kl': o['skill_learn_avg']}

# короткие подписи условий для выдачи («вы против: …»)
CSHORT = {'c_night_shifts': 'ночные смены', 'c_evenings_weekends': 'вечера и выходные', 'c_outdoor_weather': 'улица в любую погоду',
          'c_on_feet': 'весь день на ногах', 'c_heavy_lifting': 'тяжести', 'c_heights': 'высота', 'c_sitting_computer': 'весь день за компьютером',
          'c_noise_dust': 'шум, пыль, химия', 'c_dirt_smells': 'грязь и запахи', 'c_heat_cold_rooms': 'жара или холод', 'c_confined_underground': 'теснота, под землёй',
          'c_dangerous_work': 'риск для жизни', 'c_blood_infections': 'кровь и раны', 'c_illness_death': 'тяжелобольные', 'c_aggression_risk': 'агрессивные люди',
          'c_difficult_clients': 'недовольные клиенты', 'c_business_trips': 'командировки', 'c_long_away': 'вахта, долгие отъезды', 'c_unstable_income': 'нестабильный доход',
          'c_sales_targets': 'план продаж', 'c_monotony': 'однообразие', 'c_fine_work_eyes': 'мелкая работа для глаз', 'c_deadlines_crunch': 'авралы',
          'c_on_call': 'вызовы в нерабочее время', 'c_high_stakes': 'цена ошибки', 'c_low_pay_start': 'невысокий заработок на старте',
          'c_academic_publishing': 'научные статьи', 'c_public_speaking': 'выступления', 'c_animals': 'работа с животными', 'c_strict_regime': 'строгий режим'}
for cid, short in CSHORT.items(): Q[cid]['short'] = short
assert all('short' in v for v in Q.values() if v['kind'] == 'condition')
# Источник вопроса (тег справа сверху): условия — из рабочей среды O*NET; барьеры — по подвиду
SRC = {'образование': ['b_med_diploma', 'b_pedagogy_diploma', 'b_psychology_diploma', 'b_law_diploma', 'b_econ_diploma', 'b_tech_diploma',
                       'b_science_diploma', 'b_academic_degree', 'b_math_level', 'b_transport_training', 'b_arts_training', 'b_english'],
       'опыт': ['b_management_experience', 'b_sport_background'],
       'документы': ['b_driving_license', 'b_tractor_license', 'b_criminal_record', 'b_credit_history', 'b_citizenship', 'b_travel_abroad', 'b_state_secret'],
       'здоровье': ['b_color_vision', 'b_near_vision_hands', 'b_vision_hearing_limits', 'b_heights', 'b_heavy_work', 'b_allergy_lungs_skin', 'b_animal_allergy',
                    'b_medbook_health', 'b_confined_underground', 'b_driving_contraindications', 'b_psych_registry', 'b_speech_defects'],
       'готовность': ['b_dead_bodies']}
for src, ids in SRC.items():
    for i in ids: Q[i]['src'] = src
for v in Q.values():
    if v['kind'] == 'condition': v['src'] = 'O*NET'
assert all(v.get('src') for v in Q.values() if v['kind'] == 'barrier'), [k for k, v in Q.items() if v['kind'] == 'barrier' and not v.get('src')]
# Теги требований под профессией: что нужно иметь (по состоянию ответа) и что проверяют (для закрывающих барьеров)
TAG = {'b_med_diploma': {'doctor_residency': 'врач + ординатура', 'doctor_no_residency': 'диплом врача', 'med_college': 'медколледж'},
       'b_pedagogy_diploma': {'pedagogy': 'педагогическое', 'defectology': 'дефектолог'},
       'b_psychology_diploma': {'clinical': 'клиническая психология', 'other_psy': 'диплом психолога'},
       'b_law_diploma': {'law': 'юридическое'}, 'b_econ_diploma': {'yes': 'экономическое'},
       'b_tech_diploma': {'university': 'технический вуз', 'college': 'техникум'},
       'b_science_diploma': {'natural': 'естественнонаучное', 'humanities': 'гуманитарное', 'other': 'вуз'},
       'b_academic_degree': {'degree': 'учёная степень', 'postgrad': 'аспирантура'}, 'b_math_level': {'strong': 'сильная математика', 'basic': 'математика'},
       'b_transport_training': {'aviation': 'авиационная подготовка', 'marine': 'морская подготовка', 'rail': 'ж/д подготовка'},
       'b_arts_training': {'music': 'музыкальное', 'dance': 'хореография', 'acting': 'актёрское'},
       'b_sport_background': {'ranked': 'спортивный разряд', 'amateur': 'спорт'},
       'b_driving_license': {'cat_b': 'права B', 'cat_c': 'права C', 'cat_d': 'права D'}, 'b_tractor_license': {'has': 'тракторист'},
       'b_english': {'fluent': 'свободный английский', 'working': 'английский'},
       'b_management_experience': {'yes': 'опыт руководства', 'less_3': 'опыт руководства'}}
TAGC = {'b_medbook_health': 'медкнижка', 'b_criminal_record': 'несудимость', 'b_citizenship': 'гражданство', 'b_psych_registry': 'медкомиссия',
        'b_driving_contraindications': 'медкомиссия', 'b_vision_hearing_limits': 'зрение и слух', 'b_color_vision': 'цветовое зрение',
        'b_near_vision_hands': 'зрение вблизи, твёрдая рука', 'b_heavy_work': 'физическая нагрузка', 'b_allergy_lungs_skin': 'без аллергии',
        'b_animal_allergy': 'без аллергии на животных', 'b_travel_abroad': 'выезд за рубеж', 'b_state_secret': 'допуск к гостайне',
        'b_speech_defects': 'чёткая речь', 'b_heights': 'высота', 'b_confined_underground': 'теснота', 'b_dead_bodies': 'работа с умершими',
        'b_credit_history': 'кредитная история', 'b_tractor_license': 'тракторист'}
# Порядок кнопок — естественный, как в исходном списке ответов («Да» первым у вопросов «Можете ли / Готовы ли / Различаете ли»),
# а не порядок состояний приора
for bid in PR['barriers']:
    codes = [a['code'] for a in BV[bid]['answers']]
    st = Q[bid]['states']; order = sorted(range(len(st)), key=lambda i: codes.index(st[i]) if st[i] in codes else 99)
    if order != list(range(len(st))): Q[bid]['order'] = order
Q['b_criminal_record']['text'] = 'Есть или была ли у вас судимость?'
for b, t in TAG.items(): Q[b]['tag'] = t
for b, t in TAGC.items(): Q[b]['tagc'] = t
# Область образования — два шага: грубая область (9), затем уточнение внутри неё, если модель сочтёт нужным.
AREAS = [('med', 'Медицина и фармация', ['medicine', 'nursing', 'pharmacy']),
         ('sci', 'Естественные науки и математика', ['bio', 'chem', 'physmath', 'geo']),
         ('it', 'ИТ и электроника', ['it', 'electronics']),
         ('eng', 'Инженерия, производство, транспорт', ['energy', 'mech', 'construction', 'mining', 'transport', 'ecosafety', 'light']),
         ('econlaw', 'Экономика и право', ['economics', 'law']),
         ('people', 'Педагогика, психология, общество', ['education', 'psych', 'social']),
         ('hum', 'Гуманитарные науки и медиа', ['humanities', 'media']),
         ('artsport', 'Искусство и спорт', ['arts', 'sport']),
         ('agroserv', 'Сельское хозяйство, питание, сервис', ['agro', 'food', 'service'])]
SHORT_DIR = {'medicine': 'Врач', 'nursing': 'Среднее медицинское (медсестра, фельдшер)', 'pharmacy': 'Фармация', 'bio': 'Биология', 'chem': 'Химия',
             'physmath': 'Математика и физика', 'geo': 'Геология, география', 'it': 'Информатика и ИТ', 'electronics': 'Электроника и связь',
             'energy': 'Энергетика', 'mech': 'Машиностроение и металлургия', 'construction': 'Строительство и архитектура', 'mining': 'Горное и нефтегазовое дело',
             'transport': 'Транспорт', 'ecosafety': 'Экология и безопасность труда', 'light': 'Лёгкая промышленность', 'economics': 'Экономика и управление',
             'law': 'Юриспруденция', 'psych': 'Психология', 'social': 'Социальные науки', 'education': 'Педагогика', 'humanities': 'Филология, история, философия',
             'media': 'Журналистика и реклама', 'arts': 'Искусство и дизайн', 'sport': 'Физкультура и спорт', 'agro': 'Сельское хозяйство и ветеринария',
             'food': 'Пищевые технологии и общепит', 'service': 'Сервис и туризм'}
dq = Q['direction']
assert sorted(sum((m for _, _, m in AREAS), [])) == sorted(dq['states']) and set(SHORT_DIR) == set(dq['states'])
AREA_OF = {d: a for a, _, ms in AREAS for d in ms}
Q['area'] = {'kind': 'context', 'text': 'В какой области ваше образование?', 'states': [a for a, _, _ in AREAS], 'labels': [l for _, l, _ in AREAS],
             'needs': {'level': ['college', 'university', 'postgrad']}}
dq['text'] = 'Уточните направление'; dq['labels'] = [SHORT_DIR[x] for x in dq['states']]; dq['area_of'] = AREA_OF
# Вопросы о дипломе, которые выводятся из ответа «В какой области ваше образование?» (вуз и выше) — их тогда не задаём.
# Подписи «области диплома» — явно, что куда: экономика и право — «другая».
sd = Q['b_science_diploma']; lab = dict(zip(sd['states'], sd['labels']))
lab['humanities'] = 'Гуманитарные и социальные (история, филология, социология, психология, журналистика)'
lab['other'] = 'Другая область (экономика, право, инженерия, медицина, педагогика, искусство…)'
sd['labels'] = [lab[x] for x in sd['states']]
DIR_IDS = [d['id'] for d in DIRS]
FROM_DIR = {'b_science_diploma': ({'bio': 'natural', 'chem': 'natural', 'physmath': 'natural', 'geo': 'natural',
                                    'psych': 'humanities', 'social': 'humanities', 'media': 'humanities', 'humanities': 'humanities'}, 'other'),
            'b_econ_diploma': ({'economics': 'yes'}, 'none'), 'b_law_diploma': ({'law': 'law'}, 'none')}
FROM_AREA = {'b_science_diploma': {'med': 'other', 'sci': 'natural', 'it': 'other', 'eng': 'other', 'econlaw': 'other', 'hum': 'humanities',
                                   'artsport': 'other', 'agroserv': 'other'},          # people: педагогика — другая, психология — гуманитарная → уточнять
             'b_econ_diploma': {a: 'none' for a, _, _ in AREAS if a != 'econlaw'}, 'b_law_diploma': {a: 'none' for a, _, _ in AREAS if a != 'econlaw'}}
for b, mp in FROM_AREA.items(): Q[b]['from_area'] = mp
for b, (mp, dflt) in FROM_DIR.items():
    assert set(mp) <= set(DIR_IDS), set(mp) - set(DIR_IDS)
    assert set(mp.values()) | {dflt} <= set(Q[b]['states']), b
    Q[b]['from_direction'] = mp; Q[b]['from_direction_default'] = dflt
# «Не хочу отвечать» — у пола и деликатных
Q['sex']['skip'] = True
for v in Q.values():
    if v.get('sensitive'): v['skip'] = True
# сила ответа на условие: «нет» × 0,5, «иногда» × 0,75 (оценка, не калибрована)
out = {'built': date.today().isoformat(), 'ages': AGES, 'sexes': SEX, 'demo': PR['demographics_default'], 'consts': PS['constants'],
       'cond_factor': {'no': 0.5, 'some': 0.75, 'yes': 1.0}, 'q': Q, 'occ': OCC}
# русские названия профессий (разметка языковой моделью) — для /ru/; ручные привязки в xwalk.json главнее
names = {r['code']: r['ru_name'] for r in json.load(open(V / 'llm/professions-2026-10-20.json'))}
names['27-3043.00'] = 'Писатель'   # обе модели дали «Копирайтер» — копирайтер лишь один из синонимов O*NET
json.dump(names, open(os.path.join(ROOT, 'data', 'career', 'ru-names.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
p = os.path.join(ROOT, 'data', 'career', 'constraints.json')
json.dump(out, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))
print('questions', len(Q), {k: sum(1 for v in Q.values() if v['kind'] == k) for k in ('context', 'barrier', 'condition')},
      'occupations', len(OCC), 'bytes', os.path.getsize(p))
