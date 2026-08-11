#!/usr/bin/env python3
import sys
import os
import csv
import re
import json
import time
import copy
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

GK_P_URL = 'https://www.gk-p.jp/mhcard/?pref=zenkoku'
CSV_FILENAME = 'manhole_cards.csv'
GEOCODE_THREADS = 10

JAPAN_PREFECTURES = [
    '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
    '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
    '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
    '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
    '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
]

PREF_CODE_MAP = {
    '01':'北海道','02':'青森県','03':'岩手県','04':'宮城県','05':'秋田県',
    '06':'山形県','07':'福島県','08':'茨城県','09':'栃木県','10':'群馬県',
    '11':'埼玉県','12':'千葉県','13':'東京都','14':'神奈川県','15':'新潟県',
    '16':'富山県','17':'石川県','18':'福井県','19':'山梨県','20':'長野県',
    '21':'岐阜県','22':'静岡県','23':'愛知県','24':'三重県','25':'滋賀県',
    '26':'京都府','27':'大阪府','28':'兵庫県','29':'奈良県','30':'和歌山県',
    '31':'鳥取県','32':'島根県','33':'岡山県','34':'広島県','35':'山口県',
    '36':'徳島県','37':'香川県','38':'愛媛県','39':'高知県','40':'福岡県',
    '41':'佐賀県','42':'長崎県','43':'熊本県','44':'大分県','45':'宮崎県',
    '46':'鹿児島県','47':'沖縄県'
}

def normalize_pref(img_url, raw_pref, address, city):
    m = re.search(r'/mhc/(\d{2})[-_]', img_url)
    if m and m.group(1) in PREF_CODE_MAP:
        return PREF_CODE_MAP[m.group(1)]
    text = f'{address} {city} {raw_pref}'
    for p in JAPAN_PREFECTURES:
        if p in text:
            return p
    return '東京都'

def normalize_edition(ed):
    if not ed: return ''
    m = re.search(r'第(\d+)弾', ed)
    return f'第{int(m.group(1)):02d}弾' if m else ed

def fetch_gk_p_html():
    print(f'Fetching data from {GK_P_URL} ...')
    req = urllib.request.Request(GK_P_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as res:
        return res.read().decode('utf-8', errors='replace')

def parse_cards_from_html(html_content):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html_content, 'html.parser')
    table = soup.find('table', class_='table1')
    rows = table.find_all('tr')
    records = []
    curr_pref = '全国'
    for r in rows[1:]:
        ths = r.find_all('th')
        if ths and ths[0].get_text(strip=True) and ths[0].get_text(strip=True) != '全国':
            curr_pref = ths[0].get_text(strip=True)
        tds = r.find_all('td')
        if len(tds) >= 7:
            city = tds[0].get_text(strip=True)
            img_tag = tds[1].find('img')
            img_url = img_tag['src'] if img_tag and 'src' in img_tag.attrs else ''
            if img_url and not img_url.startswith('http'):
                img_url = 'https://www.gk-p.jp' + img_url
            edition = tds[2].get_text(strip=True)
            release_date = tds[3].get_text(strip=True)
            loc_td = tds[4]
            a_tag = loc_td.find('a')
            loc_name = a_tag.get_text(strip=True) if a_tag else ''
            td_copy = copy.copy(loc_td)
            for tag in td_copy.find_all(['br', 'p', 'div']):
                tag.replace_with('\n' + tag.get_text())
            raw_lines = [l.strip() for l in td_copy.get_text().split('\n') if l.strip()]
            if not loc_name and raw_lines:
                loc_name = raw_lines[0]
            loc_name_clean = re.sub(r'^[【\(\[（].*?[】\)\]）]\s*', '', loc_name).strip()
            cleaned_lines = []
            for l in raw_lines:
                lc = re.sub(r'^[【\(\[（].*?[】\)\]）]\s*', '', l)
                lc = re.sub(r'^(住所|問合せ先|電話)[:：]\s*', '', lc)
                lc = re.sub(r'^[①②③④⑤※]\s*', '', lc).strip()
                if lc:
                    cleaned_lines.append((l, lc))
            address, phone = '', ''
            for l_orig, l_clean in cleaned_lines:
                if any(kw in l_clean.lower() for kw in ['電話', 'tel', '問合せ先', '※']) and not phone:
                    if '電話' in l_clean or 'tel' in l_clean.lower():
                        phone = l_orig
                    continue
                is_pref = any(p in l_clean for p in JAPAN_PREFECTURES)
                has_num = bool(re.search(r'\d|一|二|三|四|五|六|七|八|九|十|丁目|番地|号|地割|字', l_clean))
                has_admin = bool(re.search(r'(市|区|町|村)', l_clean))
                is_fac = bool(re.search(r'(役所|役場|課|窓口|センター|館|公園|駅|事業団|協会|室|庁舎)$', l_clean))
                if not address:
                    if is_pref or (has_admin and has_num and not is_fac):
                        address = l_clean
            if not address:
                for l_orig, l_clean in cleaned_lines:
                    if any(kw in l_clean.lower() for kw in ['電話', 'tel', '問合せ先', '※']):
                        continue
                    if re.search(r'(都|道|府|県|市|区|町|村)', l_clean) and l_clean != loc_name and not re.search(r'^[【※]', l_orig):
                        address = l_clean
                        break
            hours = tds[5].get_text(' ', strip=True)
            stock_a = tds[6].find('a')
            stock_url = stock_a['href'] if stock_a and 'href' in stock_a.attrs else ''
            stock_text = tds[6].get_text(' ', strip=True)
            c_pref = normalize_pref(img_url, curr_pref, address, city)
            c_ed = normalize_edition(edition)
            records.append({
                'pref': c_pref, 'city': city, 'img_url': img_url,
                'edition': c_ed, 'release_date': release_date,
                'loc_name': loc_name_clean or loc_name, 'address': address,
                'phone': phone, 'hours': hours, 'stock_text': stock_text,
                'stock_url': stock_url, 'lat': '', 'lng': ''
            })
    print(f'Extracted {len(records)} card records from table.')
    return records

def geocode_gsi(query, pref=None):
    if not query:
        return None, None, False
    q_clean = re.sub(r'[【\(\[（].*?[】\)\]）]', '', query).strip()
    q_clean = re.sub(r'^(住所|問合せ先|電話)[:：]\s*', '', q_clean).strip()
    q_clean = re.sub(r'^[①②③④⑤※]\s*', '', q_clean).strip()
    if not q_clean:
        return None, None, False
    encoded = urllib.parse.quote(q_clean)
    url = f'https://msearch.gsi.go.jp/address-search/AddressSearch?q={encoded}'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=4) as res:
            data = json.loads(res.read().decode('utf-8'))
            if data and len(data) > 0:
                kw_list = ['公園', '駅', '館', '案内所', '役所', '役場', 'センター', '資料館', '美術館', '博物館', '庁舎', '球場', 'グランド', '広場']
                for item in data:
                    title = item['properties'].get('title', '')
                    coords = item['geometry']['coordinates']
                    lat, lng = coords[1], coords[0]
                    if pref and (title == pref or title in JAPAN_PREFECTURES):
                        continue
                    if not pref and title in JAPAN_PREFECTURES:
                        continue
                    if q_clean == title or (len(q_clean) >= 3 and q_clean in title):
                        return lat, lng, True
                    if any(kw in title for kw in kw_list) and any(kw in q_clean for kw in kw_list):
                        return lat, lng, True

                title = data[0]['properties'].get('title', '')
                if pref and (title == pref or title in JAPAN_PREFECTURES):
                    return None, None, False
                if not pref and title in JAPAN_PREFECTURES:
                    return None, None, False

                coords = data[0]['geometry']['coordinates']
                lat, lng = coords[1], coords[0]
                has_num = bool(re.search(r'\d|丁目|番地|号', title))
                has_lm = any(kw in title for kw in kw_list)
                return lat, lng, (has_num or has_lm)
    except Exception:
        pass
    return None, None, False

def clean_facility_name(name):
    prev = None
    curr = name
    while curr != prev:
        prev = curr
        curr = re.sub(r'\s*(地域振興課|総務部|区政推進課|生活環境課|上下水道局|上下水道部|上下水道課|下水道局|下水道課|商工振興課|産業連携担当|経営総務課|管理担当|総務課|経営企画課|お客さまセンター|業務担当窓口|当直室|宿直室|守衛室|窓口|広報課|観光課|産業振興課|環境課|都市計画課|建設課|維持課|管理課|市民課|窓口課|管理事務所|事務所|分館|本館|受付|体育館|資料館|博物館|図書館|文化会館|案内所|情報館|物産館|伝承館|センター|ビル|号館|内|横|隣|前).*$', '', curr).strip()
    return curr

def clean_landmark(text):
    m = re.search(r'(.*?[駅港島橋城園役庁署宮局場])', text)
    if m: return m.group(1).strip()
    return text.strip()

def extract_paren_queries(text):
    queries = []
    if not text: return queries
    matches = re.findall(r'[\(（](.*?)[\)）]', text)
    for m in matches:
        p = m.strip()
        if p:
            queries.append(p)
            c = clean_facility_name(p)
            if c and c != p: queries.append(c)
            m_st = re.search(r'(.*?[役庁所館所場社庁場館宮院校局駅署])', p)
            if m_st:
                c_st = clean_facility_name(m_st.group(1))
                if c_st: queries.append(c_st)
    return queries

def geocode_record(record):
    pref = record.get('pref', '')
    city = record.get('city', '')
    loc_name = record.get('loc_name', '')
    address = record.get('address', '')
    city_clean = re.sub(r'[\(（].*?[\)）]', '', city).strip()

    address_cand = None
    if address:
        q = address if pref in address else f'{pref} {address}'
        lat, lng, is_exact = geocode_gsi(q, pref)
        if lat is not None:
            if is_exact:
                record['lat'], record['lng'] = f'{lat:.6f}', f'{lng:.6f}'
                return record
            else:
                address_cand = (f'{lat:.6f}', f'{lng:.6f}')

    queries = []
    queries.extend(extract_paren_queries(loc_name))
    queries.extend(extract_paren_queries(address))

    if loc_name:
        queries.append(loc_name)
        c_name = clean_facility_name(loc_name)
        if c_name and c_name != loc_name:
            queries.append(c_name)

    for q in queries:
        if not q: continue
        lat, lng, is_exact = geocode_gsi(q, pref)
        if lat is not None and is_exact:
            record['lat'], record['lng'] = f'{lat:.6f}', f'{lng:.6f}'
            return record
        q_full = q if pref in q else f'{pref} {q}'
        lat, lng, is_exact = geocode_gsi(q_full, pref)
        if lat is not None and is_exact:
            record['lat'], record['lng'] = f'{lat:.6f}', f'{lng:.6f}'
            return record

    if address_cand:
        record['lat'], record['lng'] = address_cand
        return record

    if city_clean:
        q = city_clean if pref in city_clean else f'{pref} {city_clean}'
        lat, lng, _ = geocode_gsi(q, pref)
        if lat is not None:
            record['lat'], record['lng'] = f'{lat:.6f}', f'{lng:.6f}'
            return record

    return record

def main():
    start_time = time.time()
    html = fetch_gk_p_html()
    records = parse_cards_from_html(html)
    print(f'Geocoding {len(records)} records using {GEOCODE_THREADS} threads...')
    with ThreadPoolExecutor(max_workers=GEOCODE_THREADS) as executor:
        geocoded = list(executor.map(geocode_record, records))
    success = sum(1 for r in geocoded if r['lat'] and r['lng'])
    print(f'Geocoding completed: {success} / {len(records)} ({success/len(records)*100:.1f}%)')
    fieldnames = ['pref','city','img_url','edition','release_date','loc_name','address','phone','hours','stock_text','stock_url','lat','lng']
    csv_path = os.path.join(os.path.dirname(__file__), CSV_FILENAME)
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(geocoded)
    print(f'Successfully saved {len(geocoded)} records to {CSV_FILENAME} in {time.time()-start_time:.2f} seconds!')

if __name__ == '__main__':
    main()
