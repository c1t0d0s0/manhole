#!/usr/bin/env python3
"""
update_csv.py - マンホールカード情報収集＆ジオコーディングスクリプト

下水道広報プラットホーム（GK-P）の全マンホールカード情報をスクレイピングし、
国土地理院ジオコーディングAPIを用いて緯度経度を付与し、manhole_cards.csv に保存します。
"""

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

GK_P_URL = "https://www.gk-p.jp/mhcard/?pref=zenkoku"
CSV_FILENAME = "manhole_cards.csv"
GEOCODE_THREADS = 10

# 日本の標準47都道府県一覧（北から南順）
JAPAN_PREFECTURES = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
]

PREF_CODE_MAP = {
    '01': '北海道', '02': '青森県', '03': '岩手県', '04': '宮城県', '05': '秋田県',
    '06': '山形県', '07': '福島県', '08': '茨城県', '09': '栃木県', '10': '群馬県',
    '11': '埼玉県', '12': '千葉県', '13': '東京都', '14': '神奈川県', '15': '新潟県',
    '16': '富山県', '17': '石川県', '18': '福井県', '19': '山梨県', '20': '長野県',
    '21': '岐阜県', '22': '静岡県', '23': '愛知県', '24': '三重県', '25': '滋賀県',
    '26': '京都府', '27': '大阪府', '28': '兵庫県', '29': '奈良県', '30': '和歌山県',
    '31': '鳥取県', '32': '島根県', '33': '岡山県', '34': '広島県', '35': '山口県',
    '36': '徳島県', '37': '香川県', '38': '愛媛県', '39': '高知県', '40': '福岡県',
    '41': '佐賀県', '42': '長崎県', '43': '熊本県', '44': '大分県', '45': '宮崎県',
    '46': '鹿児島県', '47': '沖縄県'
}


def normalize_pref(img_url, raw_pref, address, city):
    """画像URLの都道府県コードまたは住所から標準47都道府県名を特定"""
    m = re.search(r'/mhc/(\d{2})[-_]', img_url)
    if m:
        code = m.group(1)
        if code in PREF_CODE_MAP:
            return PREF_CODE_MAP[code]

    combined_text = f"{address} {city} {raw_pref}"
    for p in JAPAN_PREFECTURES:
        if p in combined_text:
            return p

    return "東京都"


def normalize_edition(edition_str):
    """弾数を2桁ゼロ埋め表記（例: 第2弾 -> 第02弾）に統一"""
    if not edition_str:
        return ""
    m = re.search(r"第(\d+)弾", edition_str)
    if m:
        num = int(m.group(1))
        return f"第{num:02d}弾"
    return edition_str


def fetch_gk_p_html():
    """GK-Pサイトから全国マンホールカードのHTMLを取得"""
    print(f"Fetching data from {GK_P_URL} ...")
    req = urllib.request.Request(
        GK_P_URL,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_cards_from_html(html_content):
    """HTMLからマンホールカードデータを抽出"""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html_content, "html.parser")
    table = soup.find("table", class_="table1")
    if not table:
        raise ValueError("Could not find table.table1 in the HTML content.")

    rows = table.find_all("tr")
    records = []
    current_pref = "全国"

    for r in rows[1:]:  # ヘッダー行をスキップ
        ths = r.find_all("th")
        if ths:
            pref_candidate = ths[0].get_text(strip=True)
            if pref_candidate and pref_candidate != "全国":
                current_pref = pref_candidate

        tds = r.find_all("td")
        if len(tds) >= 7:
            city = tds[0].get_text(strip=True)
            img_tag = tds[1].find("img")
            img_url = img_tag["src"] if img_tag and "src" in img_tag.attrs else ""

            if img_url and not img_url.startswith("http"):
                img_url = "https://www.gk-p.jp" + img_url

            edition = tds[2].get_text(strip=True)
            release_date = tds[3].get_text(strip=True)

            loc_td = tds[4]
            loc_name = ""
            a_tag = loc_td.find("a")
            if a_tag:
                loc_name = a_tag.get_text(strip=True)

            td_copy = copy.copy(loc_td)
            for tag in td_copy.find_all(["br", "p", "div"]):
                tag.replace_with("\n" + tag.get_text())

            raw_lines = [line.strip() for line in td_copy.get_text().split("\n") if line.strip()]

            if not loc_name and raw_lines:
                loc_name = raw_lines[0]

            loc_name_clean = re.sub(r'^[【\(\[（].*?[】\)\]）]\s*', '', loc_name).strip()

            cleaned_lines = []
            for line in raw_lines:
                lc = re.sub(r'^[【\(\[（].*?[】\)\]）]\s*', '', line)
                lc = re.sub(r'^(住所|問合せ先|電話)[:：]\s*', '', lc)
                lc = re.sub(r'^[①②③④⑤※]\s*', '', lc).strip()
                if lc:
                    cleaned_lines.append((line, lc))

            address = ""
            phone = ""
            for l_orig, l_clean in cleaned_lines:
                if any(kw in l_clean.lower() for kw in ["電話", "tel", "問合せ先", "※"]) and not phone:
                    if "電話" in l_clean or "tel" in l_clean.lower():
                        phone = l_orig
                    continue

                is_pref_addr = any(p in l_clean for p in JAPAN_PREFECTURES)
                has_num = bool(re.search(r'\d|一|二|三|四|五|六|七|八|九|十|丁目|番地|号|地割|字', l_clean))
                has_admin_unit = bool(re.search(r'(市|区|町|村)', l_clean))
                is_facility_only = bool(re.search(r'(役所|役場|課|窓口|センター|館|公園|駅|事業団|協会|室|庁舎)$', l_clean))

                if not address:
                    if is_pref_addr:
                        address = l_clean
                    elif has_admin_unit and has_num and not is_facility_only:
                        address = l_clean

            if not address:
                for l_orig, l_clean in cleaned_lines:
                    if any(kw in l_clean.lower() for kw in ["電話", "tel", "問合せ先", "※"]):
                        continue
                    if re.search(r"(都|道|府|県|市|区|町|村)", l_clean) and l_clean != loc_name:
                        if not re.search(r"^[【※]", l_orig):
                            address = l_clean
                            break

            hours = tds[5].get_text(" ", strip=True)

            stock_a = tds[6].find("a")
            stock_url = stock_a["href"] if stock_a and "href" in stock_a.attrs else ""
            stock_text = tds[6].get_text(" ", strip=True)

            clean_pref = normalize_pref(img_url, current_pref, address, city)
            clean_edition = normalize_edition(edition)

            records.append({
                "pref": clean_pref,
                "city": city,
                "img_url": img_url,
                "edition": clean_edition,
                "release_date": release_date,
                "loc_name": loc_name_clean or loc_name,
                "address": address,
                "phone": phone,
                "hours": hours,
                "stock_text": stock_text,
                "stock_url": stock_url,
                "lat": "",
                "lng": ""
            })

    print(f"Extracted {len(records)} card records from table.")
    return records


def geocode_gsi(query, pref=None):
    """国土地理院 ジオコーディング API を呼び出す"""
    if not query:
        return None, None

    q_clean = re.sub(r"[【\(\[（].*?[】\)\]）]", "", query).strip()
    q_clean = re.sub(r"^(住所|問合せ先|電話)[:：]\s*", "", q_clean).strip()
    q_clean = re.sub(r"^[①②③④⑤※]\s*", "", q_clean).strip()

    m_addr = re.match(r"^(.*?\d+(?:-\d+)*)", q_clean)
    if m_addr and any(kw in q_clean for kw in ["市", "区", "町", "村", "丁目"]):
        q_clean = m_addr.group(1)

    if not q_clean:
        return None, None

    encoded = urllib.parse.quote(q_clean)
    gsi_url = f"https://msearch.gsi.go.jp/address-search/AddressSearch?q={encoded}"

    try:
        req = urllib.request.Request(
            gsi_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req, timeout=4) as res:
            data = json.loads(res.read().decode("utf-8"))
            if data and len(data) > 0:
                title = data[0]["properties"].get("title", "")
                if pref and (title == pref or title in JAPAN_PREFECTURES):
                    return None, None
                if not pref and title in JAPAN_PREFECTURES:
                    return None, None
                coords = data[0]["geometry"]["coordinates"]
                return coords[1], coords[0]  # lat, lng
    except Exception:
        pass

    return None, None


def geocode_record(record):
    """多段階フォールバックで緯度経度を取得（都道府県名を補完）"""
    city = record.get("city", "")
    loc_name = record.get("loc_name", "")
    pref = record.get("pref", "")
    address = record.get("address", "")
    city_clean = re.sub(r"[\(（].*?[\)）]", "", city).strip()

    # 1. 住所で検索
    if address:
        query = address if pref in address else f"{pref} {address}"
        lat, lng = geocode_gsi(query, pref)
        if lat is not None:
            record["lat"] = f"{lat:.6f}"
            record["lng"] = f"{lng:.6f}"
            return record

    # 2. 配布場所名称で検索
    if loc_name:
        query = loc_name if pref in loc_name else f"{pref} {loc_name}"
        lat, lng = geocode_gsi(query, pref)
        if lat is not None:
            record["lat"] = f"{lat:.6f}"
            record["lng"] = f"{lng:.6f}"
            return record

        # 2b. 部署名・課名を取り除いて施設名で再検索
        loc_sub = re.sub(
            r"\s*(地域振興課|総務部|区政推進課|生活環境課|上下水道局|上下水道部|上下水道課|下水道局|下水道課|商工振興課|産業連携担当|経営総務課|管理担当|総務課|経営企画課|お客さまセンター|業務担当窓口|当直室|宿直室|守衛室|窓口|広報課|観光課|産業振興課|環境課|都市計画課|建設課|維持課|管理課|市民課|窓口課).*$",
            "",
            loc_name
        ).strip()
        if loc_sub and loc_sub != loc_name:
            query = loc_sub if pref in loc_sub else f"{pref} {loc_sub}"
            lat, lng = geocode_gsi(query, pref)
            if lat is not None:
                record["lat"] = f"{lat:.6f}"
                record["lng"] = f"{lng:.6f}"
                return record

    # 3. 市町村名で検索
    if city_clean:
        query = city_clean if pref in city_clean else f"{pref} {city_clean}"
        lat, lng = geocode_gsi(query, pref)
        if lat is not None:
            record["lat"] = f"{lat:.6f}"
            record["lng"] = f"{lng:.6f}"
            return record

    return record


def main():
    start_time = time.time()

    html = fetch_gk_p_html()
    records = parse_cards_from_html(html)

    print(f"Geocoding {len(records)} records using {GEOCODE_THREADS} threads...")
    geocoded_records = []
    with ThreadPoolExecutor(max_workers=GEOCODE_THREADS) as executor:
        geocoded_records = list(executor.map(geocode_record, records))

    success_count = sum(1 for r in geocoded_records if r["lat"] and r["lng"])
    print(f"Geocoding completed: {success_count} / {len(records)} ({success_count/len(records)*100:.1f}%)")

    fieldnames = [
        "pref", "city", "img_url", "edition", "release_date",
        "loc_name", "address", "phone", "hours", "stock_text",
        "stock_url", "lat", "lng"
    ]

    csv_path = os.path.join(os.path.dirname(__file__), CSV_FILENAME)
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(geocoded_records)

    elapsed = time.time() - start_time
    print(f"Successfully saved {len(geocoded_records)} records to {CSV_FILENAME} in {elapsed:.2f} seconds!")


if __name__ == "__main__":
    main()
