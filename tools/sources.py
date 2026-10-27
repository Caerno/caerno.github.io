"""Где лежат исходные данные для скриптов tools/: файл tools/sources.json (на каждой машине свой, в git не входит),
образец — tools/sources.example.json. Ключи:
  openpsychometrics — папка RIASEC_data12Dec2018 (data.csv, codebook.txt) с openpsychometrics.org;
  onet              — папка с файлами O*NET 30.0: onet-30-occupations.txt, onet-30-interests.txt;
  career_data       — папка сырья профессий: banks/, priors/, llm/, partner-professions-*.json;
  llm_out           — выход разметки профессий языковой моделью (vocab.json, edu_fields.json);
  embed_cache       — файл кэша эмбеддингов названий (.jsonl).
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def src(key):
    """Путь к источнику key из tools/sources.json."""
    f = HERE / 'sources.json'
    if not f.exists():
        raise SystemExit(f'нет tools/{f.name}: скопируйте tools/sources.example.json в tools/sources.json и впишите пути')
    paths = json.loads(f.read_text(encoding='utf-8'))
    if key not in paths:
        raise SystemExit(f'tools/{f.name}: нет ключа {key!r} (см. tools/sources.example.json)')
    return Path(paths[key]).expanduser()
