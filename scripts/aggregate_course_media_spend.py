from pathlib import Path
import csv
import json
import re
import unicodedata

META_SOURCE = Path('/home/ubuntu/.mcp/tool-results/2026-09-18_17-12-00.232224339_windsor-ai_get_data_2b2d633f.json')
GOOGLE_SOURCE = Path('/home/ubuntu/.mcp/tool-results/2026-09-18_17-10-35.977150223_windsor-ai_get_data_315f2088.json')
OUT_JSON = Path('/home/ubuntu/entregas/apsy_investimento_por_curso_20260603_20260913.json')
OUT_CSV = Path('/home/ubuntu/entregas/APSY_Investimento_Meta_Google_por_Curso_20260603_20260913.csv')
OUT_MD = Path('/home/ubuntu/entregas/APSY_Investimento_por_Curso_Auditoria_20260918.md')


def load_mcp_rows(path: Path):
    wrapper = json.loads(path.read_text(encoding='utf-8'))
    content = wrapper.get('content')
    if isinstance(content, list) and content and isinstance(content[0], dict) and 'text' in content[0]:
        return json.loads(content[0]['text'])
    if isinstance(wrapper, list):
        return wrapper
    raise ValueError(f'Formato MCP não reconhecido: {path}')


def norm(value):
    text = '' if value is None else str(value)
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'\s+', ' ', text.lower()).strip()


def brl(value):
    return f"R$ {value:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')


def classify(text):
    if 'psicodinamica' in text:
        return 'Outros cursos'
    if 'avaliacao neuro' in text or 'neuropsic' in text or re.search(r'\bneuro\b', text):
        return 'Avaliação Neuropsicológica'
    if re.search(r'\btcc\b', text) or 'cristiano nabuco' in text or 'cristiano video' in text or 'psico evidencia' in text:
        return 'TCC — Modelos Contemporâneos'
    if 'terapia baseada em processo' in text or 'pos baseada em processos' in text or re.search(r'\btbp\b', text):
        return 'Terapia Baseada em Processos'
    return 'Institucional / multitema'


def summarize(platform, rows, fields):
    totals = {}
    details = []
    for row in rows:
        text = norm(' | '.join(str(row.get(field) or '') for field in fields))
        category = classify(text)
        spend = float(row.get('spend') or row.get('cost') or 0)
        totals[category] = totals.get(category, 0.0) + spend
        details.append({
            'plataforma': platform,
            'categoria': category,
            'campaign': row.get('campaign') or row.get('campaign_name') or '',
            'grupo_ou_conjunto': row.get('adset_name') or row.get('ad_group_name') or '',
            'anuncio': row.get('ad_name') or '',
            'investimento': round(spend, 4),
        })
    return totals, details


meta_rows = load_mcp_rows(META_SOURCE)
google_rows = load_mcp_rows(GOOGLE_SOURCE)
meta_totals, meta_details = summarize('Meta', meta_rows, ['campaign', 'adset_name', 'ad_name'])
google_totals, google_details = summarize('Google Ads', google_rows, ['campaign', 'ad_group_name'])

courses = [
    'Avaliação Neuropsicológica',
    'Terapia Baseada em Processos',
    'TCC — Modelos Contemporâneos',
    'Outros cursos',
    'Institucional / multitema',
]
rows = []
for course in courses:
    meta = meta_totals.get(course, 0.0)
    google = google_totals.get(course, 0.0)
    rows.append({
        'curso': course,
        'meta': round(meta, 2),
        'google_ads': round(google, 2),
        'total': round(meta + google, 2),
    })

total_meta = round(sum(meta_totals.values()), 2)
total_google = round(sum(google_totals.values()), 2)
allocated = round(sum(row['total'] for row in rows[:3]), 2)
media_total = round(total_meta + total_google, 2)
result = {
    'periodo': {'de': '2026-06-03', 'ate': '2026-09-13'},
    'contas': {'meta': '1977935416423618', 'google_ads': '933-247-0027'},
    'criterio': 'Classificação por nome explícito de campanha, conjunto, grupo ou anúncio. Verba institucional/multitema não é rateada entre cursos.',
    'resumo': rows,
    'totais': {
        'meta': total_meta,
        'google_ads': total_google,
        'meta_google': media_total,
        'identificado_nos_tres_cursos': allocated,
        'percentual_identificado_nos_tres_cursos': round(allocated / media_total * 100, 1) if media_total else 0,
    },
    'detalhes': meta_details + google_details,
}
OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')

with OUT_CSV.open('w', newline='', encoding='utf-8-sig') as handle:
    writer = csv.DictWriter(handle, fieldnames=['Curso / classificação', 'Meta (R$)', 'Google Ads (R$)', 'Total (R$)'])
    writer.writeheader()
    for row in rows:
        writer.writerow({
            'Curso / classificação': row['curso'],
            'Meta (R$)': f"{row['meta']:.2f}",
            'Google Ads (R$)': f"{row['google_ads']:.2f}",
            'Total (R$)': f"{row['total']:.2f}",
        })
    writer.writerow({
        'Curso / classificação': 'TOTAL META + GOOGLE',
        'Meta (R$)': f'{total_meta:.2f}',
        'Google Ads (R$)': f'{total_google:.2f}',
        'Total (R$)': f'{media_total:.2f}',
    })

lines = [
    '# APSY — investimento Meta e Google por curso',
    '',
    '**Período:** 03/06 a 13/09/2026  ',
    '**Contas:** Meta 1977935416423618; Google Ads 933-247-0027.',
    '',
    '| Curso / classificação | Meta | Google Ads | Total |',
    '|---|---:|---:|---:|',
]
for row in rows:
    lines.append(f"| {row['curso']} | {brl(row['meta'])} | {brl(row['google_ads'])} | {brl(row['total'])} |")
lines.extend([
    f"| **Total Meta + Google** | **{brl(total_meta)}** | **{brl(total_google)}** | **{brl(media_total)}** |",
    '',
    '> Critério: somente nomes com identificação explícita de Neuro, TBP ou TCC foram atribuídos aos cursos. Campanhas institucionais, criativos multitema e grupos genéricos não foram rateados artificialmente.',
    '',
    f"A verba identificada diretamente nos três cursos soma **{brl(allocated)}**, equivalente a **{result['totais']['percentual_identificado_nos_tres_cursos']:.1f}%** do investimento combinado de Meta e Google no período.".replace(f"{result['totais']['percentual_identificado_nos_tres_cursos']:.1f}", f"{result['totais']['percentual_identificado_nos_tres_cursos']:.1f}".replace('.', ',')),
])
OUT_MD.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(json.dumps(result['resumo'], ensure_ascii=False, indent=2))
print(json.dumps(result['totais'], ensure_ascii=False, indent=2))
