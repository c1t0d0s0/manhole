/**
 * マンホールカード まっぷ！ - メインJavaScriptアプリケーション
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- 日本の標準47都道府県一覧（北から南の順） ---
    const JAPAN_PREFECTURES = [
        "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
        "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
        "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
        "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
        "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
        "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
        "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
    ];

    // --- Prefecture Order Mapping (北海道 -> 沖縄県) ---
    const PREF_ORDER_MAP = new Map(JAPAN_PREFECTURES.map((p, i) => [p, i]));

    // --- State Variables ---
    let cardsData = [];
    let map = null;
    let markerClusterGroup = null;
    let markersMap = new Map(); // cardIndex -> marker reference
    let activeCard = null;
    let todayOnlyFilter = false;
    let includeDiscontinued = false;
    let currentSortMode = "pref"; // "pref" (北海道〜沖縄) | "nearest" (近い順)
    let userLocation = null; // { lat: number, lng: number }
    let openedFromGallery = false;

    // --- DOM Elements ---
    const loadingOverlay = document.getElementById("loadingOverlay");
    const totalCardsCountEl = document.getElementById("totalCardsCount");
    const searchInput = document.getElementById("searchInput");
    const btnClearSearch = document.getElementById("btnClearSearch");
    const searchSuggestions = document.getElementById("searchSuggestions");

    // Select Dropdowns (Desktop & Mobile)
    const prefSelectDesktop = document.getElementById("prefSelectDesktop");
    const prefSelectMobile = document.getElementById("prefSelectMobile");
    const editionSelectDesktop = document.getElementById("editionSelectDesktop");
    const editionSelectMobile = document.getElementById("editionSelectMobile");
    const sortSelectMobile = document.getElementById("sortSelectMobile");

    // Buttons & Toggles
    const btnTodayFilter = document.getElementById("btnTodayFilter");
    const todayCheckMobile = document.getElementById("todayCheckMobile");
    const btnDiscontinuedFilter = document.getElementById("btnDiscontinuedFilter");
    const discontinuedCheckMobile = document.getElementById("discontinuedCheckMobile");
    const discontinuedCheckGallery = document.getElementById("discontinuedCheckGallery");
    const btnGeoLocation = document.getElementById("btnGeoLocation");
    const btnSortNearest = document.getElementById("btnSortNearest");
    const btnRandomCard = document.getElementById("btnRandomCard");
    const btnResetFilter = document.getElementById("btnResetFilter");
    const btnMobileFilterToggle = document.getElementById("btnMobileFilterToggle");

    // Drawer Elements
    const filterDrawer = document.getElementById("filterDrawer");
    const btnCloseDrawer = document.getElementById("btnCloseDrawer");
    const btnApplyDrawer = document.getElementById("btnApplyDrawer");

    // Modal elements
    const cardModal = document.getElementById("cardModal");
    const btnCloseModal = document.getElementById("btnCloseModal");
    const modalImg = document.getElementById("modalImg");
    const imageFrame = document.getElementById("imageFrame");
    const modalPref = document.getElementById("modalPref");
    const modalEdition = document.getElementById("modalEdition");
    const modalDate = document.getElementById("modalDate");
    const modalTodayStatus = document.getElementById("modalTodayStatus");
    const modalCity = document.getElementById("modalCity");
    const modalLocName = document.getElementById("modalLocName");
    const modalAddress = document.getElementById("modalAddress");
    const modalPhone = document.getElementById("modalPhone");
    const phoneContainer = document.getElementById("phoneContainer");
    const modalHours = document.getElementById("modalHours");
    const modalStock = document.getElementById("modalStock");
    const stockContainer = document.getElementById("stockContainer");
    const btnNavGoogle = document.getElementById("btnNavGoogle");

    // Lightbox elements
    const imageLightbox = document.getElementById("imageLightbox");
    const btnCloseLightbox = document.getElementById("btnCloseLightbox");
    const lightboxImg = document.getElementById("lightboxImg");
    const lightboxCaption = document.getElementById("lightboxCaption");

    // Gallery Elements
    const btnHeaderGallery = document.getElementById("btnHeaderGallery");
    const btnPillGallery = document.getElementById("btnPillGallery");
    const galleryModal = document.getElementById("galleryModal");
    const btnCloseGallery = document.getElementById("btnCloseGallery");
    const galleryPrefSelect = document.getElementById("galleryPrefSelect");
    const galleryEditionSelect = document.getElementById("galleryEditionSelect");
    const gallerySortSelect = document.getElementById("gallerySortSelect");
    const gallerySearchInput = document.getElementById("gallerySearchInput");
    const galleryGrid = document.getElementById("galleryGrid");
    const galleryEmpty = document.getElementById("galleryEmpty");
    const galleryCountBadge = document.getElementById("galleryCountBadge");

    // --- Initialize Application ---
    initMap();
    loadCSVData();

    // ----------------------------------------------------------------------
    // 1. Map Initialization
    // ----------------------------------------------------------------------
    function initMap() {
        // 日本全体を中心（金沢付近 [36.5, 137.0], zoom level 5）
        map = L.map("map", {
            zoomControl: false
        }).setView([36.5, 137.0], 5);

        // ズームコントロールを右下に設置
        L.control.zoom({ position: "bottomright" }).addTo(map);

        // OpenStreetMap タイルレイヤー
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18
        }).addTo(map);

        // MarkerClusterGroupの準備
        markerClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 40,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true
        });
        map.addLayer(markerClusterGroup);

        // 画面リサイズ時にマップサイズを再計算
        window.addEventListener("resize", () => {
            if (map) {
                map.invalidateSize();
            }
        });

        // 向き変更（スマホ回転時）にも対応
        window.addEventListener("orientationchange", () => {
            setTimeout(() => {
                if (map) {
                    map.invalidateSize();
                }
            }, 300);
        });
    }

    // ----------------------------------------------------------------------
    // 1.5. Distance & Sort Helper Functions
    // ----------------------------------------------------------------------
    function calculateDistanceKm(lat1, lon1, lat2, lon2) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function formatDistance(km) {
        if (km < 1) {
            return `${Math.round(km * 1000)}m`;
        }
        return `${km.toFixed(1)}km`;
    }

    function sortCardsDataByPref() {
        cardsData.sort((a, b) => {
            const orderA = PREF_ORDER_MAP.has(a.pref) ? PREF_ORDER_MAP.get(a.pref) : 999;
            const orderB = PREF_ORDER_MAP.has(b.pref) ? PREF_ORDER_MAP.get(b.pref) : 999;
            if (orderA !== orderB) return orderA - orderB;
            return (a.originalIndex || 0) - (b.originalIndex || 0);
        });
    }

    // ----------------------------------------------------------------------
    // 2. CSV Data Loading & Processing
    // ----------------------------------------------------------------------
    function loadCSVData() {
        Papa.parse("manhole_cards.csv", {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                cardsData = results.data.filter(item => item.lat && item.lng);
                cardsData.forEach((card, index) => {
                    card.originalIndex = index;
                    if (card.edition) {
                        const m = card.edition.match(/第(\d+)弾/);
                        if (m) {
                            const num = parseInt(m[1], 10);
                            card.edition = `第${String(num).padStart(2, '0')}弾`;
                        }
                    }
                });

                // デフォルトで北海道から沖縄の順にソート
                sortCardsDataByPref();

                console.log(`Loaded ${cardsData.length} cards with valid coordinates.`);

                populateFilterDropdowns();
                applyFilters();

                // ローディング解除
                loadingOverlay.classList.add("hidden");
                setTimeout(() => map.invalidateSize(), 200);
            },
            error: (err) => {
                console.error("CSV loading error:", err);
                alert("データの読み込みに失敗しました。ページを再読み込みしてください。");
                loadingOverlay.classList.add("hidden");
            }
        });
    }

    // 都道府県（北から順）および弾数ドロップダウンの作成
    function populateFilterDropdowns() {
        const prefOptionsHtml = '<option value="">すべての都道府県</option>' +
            JAPAN_PREFECTURES.map(p => `<option value="${p}">${p}</option>`).join('');

        if (prefSelectDesktop) prefSelectDesktop.innerHTML = prefOptionsHtml;
        if (prefSelectMobile) prefSelectMobile.innerHTML = prefOptionsHtml;
        if (galleryPrefSelect) galleryPrefSelect.innerHTML = prefOptionsHtml;

        // 弾数ソート
        const editionsSet = new Set();
        cardsData.forEach(card => {
            if (card.edition) editionsSet.add(card.edition);
        });

        const sortedEditions = Array.from(editionsSet).sort((a, b) => {
            const numA = parseInt(a.replace(/[^0-9]/g, "")) || 0;
            const numB = parseInt(b.replace(/[^0-9]/g, "")) || 0;
            return numA - numB;
        });

        const editionOptionsHtml = '<option value="">すべての弾数</option>' +
            sortedEditions.map(ed => `<option value="${ed}">${ed}</option>`).join('');

        if (editionSelectDesktop) editionSelectDesktop.innerHTML = editionOptionsHtml;
        if (editionSelectMobile) editionSelectMobile.innerHTML = editionOptionsHtml;
        if (galleryEditionSelect) galleryEditionSelect.innerHTML = editionOptionsHtml;
    }

    // ----------------------------------------------------------------------
    // 3. Authentic Pop Manhole Pin Marker Rendering
    // ----------------------------------------------------------------------
    function createCustomIcon() {
        const svgManholePin = `
            <div class="pop-manhole-marker" title="マンホールカード">
                <svg viewBox="0 0 40 50" width="40" height="50" xmlns="http://www.w3.org/2000/svg">
                    <!-- Drop Pin Frame -->
                    <path d="M20 50 C20 50 38 30 38 19 C38 8.5 30 0 20 0 C10 0 2 8.5 2 19 C2 30 20 50 20 50 Z" fill="#FB8500" stroke="#FFFFFF" stroke-width="2.5"/>
                    <!-- Metallic Manhole Cover Plate -->
                    <circle cx="20" cy="19" r="14" fill="#334155" stroke="#FFFFFF" stroke-width="1.5"/>
                    <!-- Concentric Waffle Grid Pattern -->
                    <circle cx="20" cy="19" r="10.5" fill="none" stroke="#94A3B8" stroke-width="1.5" stroke-dasharray="4 2"/>
                    <circle cx="20" cy="19" r="6" fill="none" stroke="#94A3B8" stroke-width="1.2"/>
                    <!-- Center Gold Hub -->
                    <circle cx="20" cy="19" r="3.5" fill="#FFB703"/>
                </svg>
            </div>
        `;

        return L.divIcon({
            className: "custom-pop-icon",
            html: svgManholePin,
            iconSize: [40, 50],
            iconAnchor: [20, 50],
            popupAnchor: [0, -45]
        });
    }

    function renderMarkers(dataList) {
        markerClusterGroup.clearLayers();
        markersMap.clear();

        const customIcon = createCustomIcon();

        dataList.forEach((card, index) => {
            const lat = parseFloat(card.lat);
            const lng = parseFloat(card.lng);

            if (isNaN(lat) || isNaN(lng)) return;

            const marker = L.marker([lat, lng], { icon: customIcon });

            // クリックで詳細モーダル表示
            marker.on("click", () => {
                openModal(card);
            });

            markerClusterGroup.addLayer(marker);
            markersMap.set(index, marker);
        });

        // マーカー件数表示更新
        const countText = dataList.length.toLocaleString() + (todayOnlyFilter ? " (本日配布中)" : "");
        totalCardsCountEl.textContent = countText;
    }

    // ----------------------------------------------------------------------
    // 3.5. Availability Engine & Holiday Helper
    // ----------------------------------------------------------------------
    function isJapaneseHoliday(date) {
        const month = date.getMonth() + 1; // 1-12
        const day = date.getDate();
        const dayOfWeek = date.getDay(); // 0:Sun, 1:Mon, ..., 6:Sat

        if (month === 1 && day === 1) return true; // 元日
        if (month === 1 && dayOfWeek === 1 && Math.ceil(day / 7) === 2) return true; // 成人の日
        if (month === 2 && day === 11) return true; // 建国記念の日
        if (month === 2 && day === 23) return true; // 天皇誕生日
        if (month === 3 && (day === 20 || day === 21)) return true; // 春分の日
        if (month === 4 && day === 29) return true; // 昭和の日
        if (month === 5 && (day === 3 || day === 4 || day === 5)) return true; // 憲法記念日, みどりの日, こどもの日
        if (month === 7 && dayOfWeek === 1 && Math.ceil(day / 7) === 3) return true; // 海の日
        if (month === 8 && day === 11) return true; // 山の日
        if (month === 9 && dayOfWeek === 1 && Math.ceil(day / 7) === 3) return true; // 敬老の日
        if (month === 9 && (day === 22 || day === 23)) return true; // 秋分の日
        if (month === 10 && dayOfWeek === 1 && Math.ceil(day / 7) === 2) return true; // スポーツの日
        if (month === 11 && day === 3) return true; // 文化の日
        if (month === 11 && day === 23) return true; // 勤労感謝の日

        // 振替休日（日曜日が祝日の場合）
        if (dayOfWeek === 1) {
            const yesterday = new Date(date);
            yesterday.setDate(date.getDate() - 1);
            if (isJapaneseHoliday(yesterday)) return true;
        }

        return false;
    }

    function parseNthWeeks(prefixText) {
        const numMap = { '1': 1, '１': 1, '一': 1, '2': 2, '２': 2, '二': 2, '3': 3, '３': 3, '三': 3, '4': 4, '４': 4, '四': 4, '5': 5, '５': 5, '五': 5 };
        const matches = prefixText.match(/第\s*([1-5１-５一-五1-5、・,＆＆\/・|または]+)/g);
        const weeks = new Set();
        if (matches) {
            for (const m of matches) {
                for (const ch of m) {
                    if (numMap[ch]) weeks.add(numMap[ch]);
                }
            }
        } else {
            const singleMatches = prefixText.match(/([1-5１-５一-五])/g);
            if (singleMatches) {
                for (const ch of singleMatches) {
                    if (numMap[ch]) weeks.add(numMap[ch]);
                }
            }
        }
        return Array.from(weeks);
    }

    function evaluateCardAvailability(hoursText, targetDate = new Date()) {
        if (!hoursText || (hoursText.includes("要確認") && hoursText.length < 5)) {
            return { isAvailable: true, label: "🟢 本日配布日", badgeClass: "badge-today-open" };
        }

        const month = targetDate.getMonth() + 1;
        const day = targetDate.getDate();
        const dayOfWeek = targetDate.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat
        const isHoliday = isJapaneseHoliday(targetDate);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isWeekendOrHoliday = isWeekend || isHoliday;
        const nthWeek = Math.ceil(day / 7);

        // 1. 年末年始判定 (12/29 - 1/3 など)
        if ((month === 12 && day >= 28) || (month === 1 && day <= 5)) {
            const yearEndMatch = hoursText.match(/12\s*[\/月]\s*(\d{1,2})\s*日?\s*[～~ー-]\s*1\s*[\/月]\s*(\d{1,2})\s*日?/);
            if (yearEndMatch) {
                const startDay = parseInt(yearEndMatch[1], 10);
                const endDay = parseInt(yearEndMatch[2], 10);
                if ((month === 12 && day >= startDay) || (month === 1 && day <= endDay)) {
                    return { isAvailable: false, label: "🔴 年末年始休止", badgeClass: "badge-today-closed" };
                }
            } else if ((month === 12 && day >= 29) || (month === 1 && day <= 3)) {
                if (/年末年始/.test(hoursText)) {
                    return { isAvailable: false, label: "🔴 年末年始休止", badgeClass: "badge-today-closed" };
                }
            }
        }

        // 2. 年中無休・無休フラグ
        const isNonStop = /年中無休|（無休）|【無休】/.test(hoursText);

        // 3. 配布継続フラグ（休館日でも別窓口/宿直室/役場等で配布している場合）
        const hasAlternativeWindowOnClosure = /休館日.*?配布|休み.*?配布|土日.*?配布|役場.*?配布|当直|宿直|警備員|守衛/.test(hoursText);

        if (!isNonStop && !hasAlternativeWindowOnClosure) {
            // Regex patterns for each day of week (0: Sun, 1: Mon, ..., 6: Sat)
            const dayPatterns = {
                0: /(?:第[1-5１-５一-五1-5、・,＆＆\/・|または]*|最終)?(?:毎週)?(?:日曜日|日曜(?![祝月火水木金土])|土日祝日?|土・日・祝|土・日|土日(?![祝月火水木金]))/,
                1: /(?:第[1-5１-５一-五1-5、・,＆＆\/・|または]*|最終)?(?:毎週)?(?:月曜日|月曜(?![祝火水木金土日])|月・火|月〜水)/,
                2: /(?:第[1-5１-５一-五1-5、・,＆＆\/・|または]*|最終)?(?:毎週)?(?:火曜日|火曜(?![祝月水木金土日])|火・水)/,
                3: /(?:第[1-5１-５一-五1-5、・,＆＆\/・|または]*|最終)?(?:毎週)?(?:水曜日|水曜(?![祝月火木金土日])|水・木)/,
                4: /(?:第[1-5１-５一-五1-5、・,＆＆\/・|または]*|最終)?(?:毎週)?(?:木曜日|木曜(?![祝月火水金土日])|木・金)/,
                5: /(?:第[1-5１-５一-五1-5、・,＆＆\/・|または]*|最終)?(?:毎週)?(?:金曜日|金曜(?![祝月火水木土日]))/,
                6: /(?:第[1-5１-５一-五1-5、・,＆＆\/・|または]*|最終)?(?:毎週)?(?:土曜日|土曜(?![祝日月火水木金])|土日祝日?|土・日・祝|土・日|土日(?![祝日月火水木]))/
            };

            // Normalize fullwidth colons and tildes
            const normHours = hoursText.replace(/[：]/g, ":").replace(/[～〜ー]/g, "～");

            // Split by major sentence delimiters (do not split by comma '、')
            const sentences = normHours.split(/[。\n※;；]|\s*(?=【|ただし|但し|なお|休館日|定休日)/);

            for (const sent of sentences) {
                const s = sent.trim();
                if (!s) continue;

                const isClosingSentence = /(お休み|定休|休館|休み|休止|休業|閉館|配布.*?なし|配布.*?行いません|配布.*?ありません|除き|除く)/.test(s);
                if (!isClosingSentence) continue;

                // Remove opening hours segments like 【土日祝】9:00～18:00 from this sentence
                const sWithoutOpeningSlots = s.replace(/【[^】]*】\s*\d{1,2}:\d{2}\s*～\s*\d{1,2}:\d{2}/g, "");

                if (/(お休み|定休|休館|休み|休止|休業|閉館|配布.*?なし|配布.*?行いません|配布.*?ありません|除き|除く)/.test(sWithoutOpeningSlots)) {
                    const dayPat = dayPatterns[dayOfWeek];
                    const match = sWithoutOpeningSlots.match(dayPat);

                    if (match) {
                        const matchedToken = match[0];

                        // Check for Nth week constraint
                        if (matchedToken.includes("第") || matchedToken.includes("最終")) {
                            if (matchedToken.includes("最終")) {
                                const lastDayOfMonth = new Date(targetDate.getFullYear(), month, 0).getDate();
                                if (day + 7 <= lastDayOfMonth) {
                                    continue; // Not last week
                                }
                            } else {
                                const specWeeks = parseNthWeeks(matchedToken);
                                if (specWeeks.length > 0 && !specWeeks.includes(nthWeek)) {
                                    continue; // Not today's Nth week
                                }
                            }
                        }

                        // Holiday exception check (e.g. 祝日の場合は開館 / 祝日の場合は翌日)
                        if (isHoliday && /(祝日|休日).*?(除く|翌日|開館|開園)/.test(sWithoutOpeningSlots)) {
                            return { isAvailable: true, label: "🟢 本日配布日", badgeClass: "badge-today-open" };
                        }

                        return { isAvailable: false, label: "🔴 本日定休", badgeClass: "badge-today-closed" };
                    }

                    // National holiday closure check
                    if (isHoliday) {
                        if (/(祝日|休日).*?(お休み|休館|休み|休業|閉館|配布.*?なし|除く|除き)/.test(sWithoutOpeningSlots)) {
                            if (!/(祝日|休日).*?(開館|開園|翌日)/.test(sWithoutOpeningSlots)) {
                                return { isAvailable: false, label: "🔴 本日定休", badgeClass: "badge-today-closed" };
                            }
                        }
                    }
                }
            }
        }

        // 4. 営業時間外（現在時刻との比較判定）
        let timeMatch = null;
        const normHours = hoursText.replace(/[：]/g, ":").replace(/[～〜ー]/g, "～");

        if (isWeekendOrHoliday) {
            timeMatch = normHours.match(/【(?:土日祝|休日|土・日・祝|土日|土・日|祝日|土日祝日|土日・祝日|土、日、祝日|土曜|日曜)】\s*(\d{1,2}):(\d{2})\s*～\s*(\d{1,2}):(\d{2})/);
        } else {
            timeMatch = normHours.match(/【(?:平日|月～金|月〜金|平日昼間)】\s*(\d{1,2}):(\d{2})\s*～\s*(\d{1,2}):(\d{2})/);
        }

        // Seasonal slots (e.g. 【4月～10月】9:00～19:00 【11月～3月】9:00～18:00)
        if (!timeMatch) {
            const seasonMatches = normHours.matchAll(/【(\d{1,2})月?\s*～\s*(\d{1,2})月?】\s*(\d{1,2}):(\d{2})\s*～\s*(\d{1,2}):(\d{2})/g);
            for (const sm of seasonMatches) {
                const startM = parseInt(sm[1], 10);
                const endM = parseInt(sm[2], 10);
                let inSeason = false;
                if (startM <= endM) {
                    inSeason = month >= startM && month <= endM;
                } else {
                    inSeason = month >= startM || month <= endM;
                }
                if (inSeason) {
                    timeMatch = [sm[0], sm[3], sm[4], sm[5], sm[6]];
                    break;
                }
            }
        }

        if (!timeMatch) {
            timeMatch = normHours.match(/(\d{1,2}):(\d{2})\s*～\s*(\d{1,2}):(\d{2})/);
        }

        if (timeMatch) {
            const startHour = parseInt(timeMatch[1], 10);
            const startMin = parseInt(timeMatch[2], 10);
            const endHour = parseInt(timeMatch[3], 10);
            const endMin = parseInt(timeMatch[4], 10);

            const currentHour = targetDate.getHours();
            const currentMin = targetDate.getMinutes();
            const currentTotalMin = currentHour * 60 + currentMin;
            const startTotalMin = startHour * 60 + startMin;
            const endTotalMin = endHour * 60 + endMin;

            if (currentTotalMin < startTotalMin || currentTotalMin > endTotalMin) {
                return { isAvailable: true, isOutsideHours: true, label: "⏰ 時間外 (本日配布日)", badgeClass: "badge-today-outside" };
            }
        }

        return { isAvailable: true, label: "🟢 本日配布日", badgeClass: "badge-today-open" };
    }

    // --- 配布終了・休止中カード判定ヘルパー ---
    function isDiscontinuedCard(card) {
        if (!card) return false;
        const text = `${card.stock_text || ""} ${card.hours || ""} ${card.loc_name || ""} ${card.city || ""}`;
        return /(配布終了|配付終了|一時中止|配布中止|配布を中止|配布休止|配布を休止|在庫なし|在庫切れ|完売|配布は終了|配付を終了|配布していません|配布を一時中止)/.test(text);
    }

    // ----------------------------------------------------------------------
    // 4. Filtering & Search Logic
    // ----------------------------------------------------------------------
    function getSelectedPref() {
        return (prefSelectMobile && prefSelectMobile.value) || (prefSelectDesktop && prefSelectDesktop.value) || "";
    }

    function getSelectedEdition() {
        return (editionSelectMobile && editionSelectMobile.value) || (editionSelectDesktop && editionSelectDesktop.value) || "";
    }

    function syncSelects(prefVal, edVal) {
        if (prefSelectDesktop) prefSelectDesktop.value = prefVal;
        if (prefSelectMobile) prefSelectMobile.value = prefVal;
        if (galleryPrefSelect) galleryPrefSelect.value = prefVal;
        if (editionSelectDesktop) editionSelectDesktop.value = edVal;
        if (editionSelectMobile) editionSelectMobile.value = edVal;
        if (galleryEditionSelect) galleryEditionSelect.value = edVal;
    }

    function syncTodayFilter(isActive) {
        todayOnlyFilter = isActive;
        if (btnTodayFilter) {
            btnTodayFilter.classList.toggle("active", isActive);
        }
        if (todayCheckMobile) {
            todayCheckMobile.checked = isActive;
        }
    }

    function syncDiscontinuedFilter(isActive) {
        includeDiscontinued = isActive;
        if (btnDiscontinuedFilter) {
            btnDiscontinuedFilter.classList.toggle("active", isActive);
        }
        if (discontinuedCheckMobile) {
            discontinuedCheckMobile.checked = isActive;
        }
        if (discontinuedCheckGallery) {
            discontinuedCheckGallery.checked = isActive;
        }
    }

    function syncSortMode(mode) {
        currentSortMode = mode;
        if (btnSortNearest) {
            btnSortNearest.classList.toggle("active", mode === "nearest");
        }
        if (gallerySortSelect) {
            gallerySortSelect.value = mode;
        }
        if (sortSelectMobile) {
            sortSelectMobile.value = mode;
        }
    }

    function getFilteredData() {
        const query = searchInput.value.trim().toLowerCase();
        const selectedPref = getSelectedPref();
        const selectedEdition = getSelectedEdition();

        const filtered = cardsData.filter(card => {
            // -1. Discontinued Filter (Default: exclude discontinued cards unless toggle is ON)
            if (!includeDiscontinued && isDiscontinuedCard(card)) {
                return false;
            }

            // 0. Today Available Filter
            if (todayOnlyFilter) {
                const avail = evaluateCardAvailability(card.hours);
                if (!avail.isAvailable) return false;
            }

            // 1. Search Query Match
            let matchQuery = true;
            if (query) {
                const targetText = [
                    card.city,
                    card.loc_name,
                    card.address,
                    card.pref,
                    card.edition
                ].join(" ").toLowerCase();
                matchQuery = targetText.includes(query);
            }

            // 2. Prefecture Match
            let matchPref = true;
            if (selectedPref) {
                matchPref = card.pref === selectedPref;
            }

            // 3. Edition Match
            let matchEdition = true;
            if (selectedEdition) {
                matchEdition = card.edition === selectedEdition;
            }

            return matchQuery && matchPref && matchEdition;
        });

        // ソート適用
        if (currentSortMode === "nearest" && userLocation) {
            filtered.forEach(card => {
                const cLat = parseFloat(card.lat);
                const cLng = parseFloat(card.lng);
                card._distance = (!isNaN(cLat) && !isNaN(cLng))
                    ? calculateDistanceKm(userLocation.lat, userLocation.lng, cLat, cLng)
                    : Infinity;
            });
            filtered.sort((a, b) => a._distance - b._distance);
        } else {
            // 都道府県順 (北海道→沖縄)
            filtered.sort((a, b) => {
                const orderA = PREF_ORDER_MAP.has(a.pref) ? PREF_ORDER_MAP.get(a.pref) : 999;
                const orderB = PREF_ORDER_MAP.has(b.pref) ? PREF_ORDER_MAP.get(b.pref) : 999;
                if (orderA !== orderB) return orderA - orderB;
                return (a.originalIndex || 0) - (b.originalIndex || 0);
            });
        }

        return filtered;
    }

    function applyFilters() {
        const filtered = getFilteredData();
        renderMarkers(filtered);

        if (filtered.length > 0 && filtered.length <= 50) {
            const bounds = L.latLngBounds(filtered.map(c => [parseFloat(c.lat), parseFloat(c.lng)]));
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        }
    }

    // リアルタイム検索補完
    function updateSearchSuggestions() {
        const query = searchInput.value.trim().toLowerCase();
        searchSuggestions.innerHTML = "";

        if (!query) {
            searchSuggestions.classList.add("hidden");
            btnClearSearch.classList.add("hidden");
            return;
        }

        btnClearSearch.classList.remove("hidden");

        const matches = cardsData.filter(card => {
            return card.city.toLowerCase().includes(query) ||
                   card.loc_name.toLowerCase().includes(query) ||
                   card.address.toLowerCase().includes(query);
        }).slice(0, 8);

        if (matches.length === 0) {
            searchSuggestions.classList.add("hidden");
            return;
        }

        matches.forEach(card => {
            const itemDiv = document.createElement("div");
            itemDiv.className = "suggestion-item";
            itemDiv.innerHTML = `
                <div>
                    <div class="suggestion-title">${escapeHTML(card.city)}</div>
                    <div class="suggestion-meta">${escapeHTML(card.loc_name)} (${escapeHTML(card.pref)})</div>
                </div>
                <span class="badge badge-edition" style="font-size: 11px;">${escapeHTML(card.edition)}</span>
            `;

            itemDiv.addEventListener("click", () => {
                searchInput.value = card.city;
                searchSuggestions.classList.add("hidden");
                
                const lat = parseFloat(card.lat);
                const lng = parseFloat(card.lng);
                map.flyTo([lat, lng], 15, { duration: 1.2 });
                
                openModal(card);
                applyFilters();
            });

            searchSuggestions.appendChild(itemDiv);
        });

        searchSuggestions.classList.remove("hidden");
    }

    // ----------------------------------------------------------------------
    // 5. Modal & Lightbox Logic
    // ----------------------------------------------------------------------
    function openModal(card, fromGallery = false) {
        activeCard = card;
        openedFromGallery = fromGallery;

        modalImg.src = card.img_url || "https://via.placeholder.com/300x420?text=No+Image";
        modalImg.alt = `${card.city} マンホールカード`;

        modalPref.textContent = card.pref || "日本";
        modalEdition.textContent = card.edition || "弾数不明";
        modalDate.textContent = card.release_date ? `発行: ${card.release_date}` : "";

        // 本日配布ステータスバッジの描画
        if (modalTodayStatus) {
            if (isDiscontinuedCard(card)) {
                modalTodayStatus.textContent = "🔴 配布終了 / 一時休止";
                modalTodayStatus.className = "badge badge-discontinued";
            } else {
                const todayStatus = evaluateCardAvailability(card.hours);
                modalTodayStatus.textContent = todayStatus.label;
                modalTodayStatus.className = `badge ${todayStatus.badgeClass}`;
            }
        }

        modalCity.textContent = card.city || "マンホールカード";
        modalLocName.textContent = card.loc_name || "配布場所名称なし";

        modalAddress.textContent = card.address || "住所情報なし";

        if (card.phone) {
            modalPhone.textContent = card.phone;
            phoneContainer.classList.remove("hidden");
        } else {
            phoneContainer.classList.add("hidden");
        }

        modalHours.textContent = card.hours || "要確認";

        if (card.stock_url) {
            modalStock.innerHTML = `<a href="${escapeHTML(card.stock_url)}" target="_blank" rel="noopener" style="color: var(--primary-blue); font-weight:700; text-decoration:underline;">${escapeHTML(card.stock_text || "公式在庫情報を確認")} <i class="fa-solid fa-arrow-up-right-from-square"></i></a>`;
            stockContainer.classList.remove("hidden");
        } else if (card.stock_text) {
            modalStock.textContent = card.stock_text;
            stockContainer.classList.remove("hidden");
        } else {
            stockContainer.classList.add("hidden");
        }

        const lat = card.lat;
        const lng = card.lng;
        btnNavGoogle.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

        cardModal.classList.remove("hidden");
    }

    function closeModal() {
        cardModal.classList.add("hidden");
        activeCard = null;

        if (openedFromGallery) {
            openedFromGallery = false;
            if (galleryModal) {
                galleryModal.classList.remove("hidden");
            }
        }
    }

    function openLightbox() {
        if (!activeCard) return;
        lightboxImg.src = activeCard.img_url;
        lightboxCaption.textContent = `${activeCard.city} （${activeCard.edition}） - ${activeCard.loc_name}`;
        imageLightbox.classList.remove("hidden");
    }

    function closeLightbox() {
        imageLightbox.classList.add("hidden");
    }

    // --- ギャラリー (一覧) 表示ロジック ---
    function renderGallery() {
        if (!galleryGrid) return;

        // getFilteredData() はすでにキーワード・都道府県・弾数・ソート順（北海道→沖縄 or 近い順）が適用されたデータを返す
        const filtered = getFilteredData();

        if (galleryCountBadge) {
            galleryCountBadge.textContent = `${filtered.length.toLocaleString()} 件`;
        }

        if (filtered.length === 0) {
            galleryGrid.innerHTML = "";
            if (galleryEmpty) galleryEmpty.classList.remove("hidden");
            return;
        }

        if (galleryEmpty) galleryEmpty.classList.add("hidden");

        galleryGrid.innerHTML = filtered.map((card, idx) => {
            const isDisc = isDiscontinuedCard(card);
            const discBadgeHtml = isDisc ? '<span class="badge badge-discontinued">配布終了・休止</span>' : '';
            
            let distBadgeHtml = '';
            if (userLocation && typeof card._distance === 'number' && isFinite(card._distance)) {
                distBadgeHtml = `<span class="badge badge-distance"><i class="fa-solid fa-location-arrow"></i> ${formatDistance(card._distance)}</span>`;
            }

            return `
                <div class="gallery-card-item" data-idx="${idx}">
                    <div class="gallery-img-wrapper">
                        <img src="${escapeHTML(card.img_url) || 'https://via.placeholder.com/300x420?text=No+Image'}" alt="${escapeHTML(card.city)}" class="gallery-card-img" loading="lazy" />
                    </div>
                    <div class="gallery-card-badges">
                        <span class="badge badge-pref">${escapeHTML(card.pref)}</span>
                        <span class="badge badge-edition">${escapeHTML(card.edition)}</span>
                        ${distBadgeHtml}
                        ${discBadgeHtml}
                    </div>
                    <div class="gallery-card-title">${escapeHTML(card.city)}</div>
                    <div class="gallery-card-loc"><i class="fa-solid fa-location-dot"></i> ${escapeHTML(card.loc_name)}</div>
                </div>
            `;
        }).join("");

        // クリックで該当カードの詳細モーダルを表示し、マップも移動
        const items = galleryGrid.querySelectorAll(".gallery-card-item");
        items.forEach((item, idx) => {
            item.addEventListener("click", () => {
                const targetCard = filtered[idx];
                if (!targetCard) return;

                closeGalleryModal();

                const lat = parseFloat(targetCard.lat);
                const lng = parseFloat(targetCard.lng);
                if (!isNaN(lat) && !isNaN(lng)) {
                    map.flyTo([lat, lng], 15, { duration: 1.2 });
                }

                openModal(targetCard, true);
            });
        });
    }

    function openGalleryModal() {
        if (!galleryModal) return;
        syncSelects(getSelectedPref(), getSelectedEdition());
        renderGallery();
        galleryModal.classList.remove("hidden");
    }

    function closeGalleryModal() {
        if (galleryModal) galleryModal.classList.add("hidden");
    }

    // ----------------------------------------------------------------------
    // 6. Special Actions (Random Card, Geolocation, Filter Drawer)
    // ----------------------------------------------------------------------
    function showRandomCard() {
        const filtered = getFilteredData();
        if (filtered.length === 0) return;

        const randomIndex = Math.floor(Math.random() * filtered.length);
        const randomCard = filtered[randomIndex];

        const lat = parseFloat(randomCard.lat);
        const lng = parseFloat(randomCard.lng);

        map.flyTo([lat, lng], 14, { duration: 1.5 });
        openModal(randomCard);
    }

    function locateUser(callback) {
        if (!navigator.geolocation) {
            alert("お使いのブラウザは現在地取得に対応していません。");
            if (typeof callback === "function") callback(false);
            return;
        }

        if (btnGeoLocation) btnGeoLocation.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                userLocation = { lat, lng };

                if (btnGeoLocation) btnGeoLocation.innerHTML = `<i class="fa-solid fa-crosshairs"></i> 現在地`;
                if (map) {
                    map.flyTo([lat, lng], 13, { duration: 1.5 });

                    L.circleMarker([lat, lng], {
                        radius: 10,
                        fillColor: "#0284C7",
                        color: "#FFFFFF",
                        weight: 3,
                        opacity: 1,
                        fillOpacity: 0.9
                    }).addTo(map).bindPopup("📍 あなたの現在地").openPopup();
                }

                if (typeof callback === "function") callback(true);
            },
            (err) => {
                if (btnGeoLocation) btnGeoLocation.innerHTML = `<i class="fa-solid fa-crosshairs"></i> 現在地`;
                alert("現在地を取得できませんでした。位置情報の利用を許可してください。");
                if (typeof callback === "function") callback(false);
            },
            { timeout: 10000, enableHighAccuracy: true }
        );
    }

    function toggleSortNearest() {
        if (currentSortMode === "nearest") {
            syncSortMode("pref");
            applyFilters();
            if (galleryModal && !galleryModal.classList.contains("hidden")) {
                renderGallery();
            }
            return;
        }

        if (userLocation) {
            syncSortMode("nearest");
            applyFilters();
            if (galleryModal && !galleryModal.classList.contains("hidden")) {
                renderGallery();
            }
        } else {
            locateUser((success) => {
                if (success) {
                    syncSortMode("nearest");
                    applyFilters();
                    if (galleryModal && !galleryModal.classList.contains("hidden")) {
                        renderGallery();
                    }
                }
            });
        }
    }

    function openDrawer() {
        if (filterDrawer) filterDrawer.classList.remove("hidden");
    }

    function closeDrawer() {
        if (filterDrawer) filterDrawer.classList.add("hidden");
    }

    // Helper: Escape HTML
    function escapeHTML(str) {
        if (!str) return "";
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    // ----------------------------------------------------------------------
    // 7. Event Listeners Attachments
    // ----------------------------------------------------------------------
    searchInput.addEventListener("input", () => {
        updateSearchSuggestions();
        applyFilters();
    });

    btnClearSearch.addEventListener("click", () => {
        searchInput.value = "";
        searchSuggestions.classList.add("hidden");
        btnClearSearch.classList.add("hidden");
        applyFilters();
    });

    if (prefSelectDesktop) {
        prefSelectDesktop.addEventListener("change", (e) => {
            syncSelects(e.target.value, getSelectedEdition());
            applyFilters();
        });
    }

    if (prefSelectMobile) {
        prefSelectMobile.addEventListener("change", (e) => {
            syncSelects(e.target.value, getSelectedEdition());
        });
    }

    if (editionSelectDesktop) {
        editionSelectDesktop.addEventListener("change", (e) => {
            syncSelects(getSelectedPref(), e.target.value);
            applyFilters();
        });
    }

    if (editionSelectMobile) {
        editionSelectMobile.addEventListener("change", (e) => {
            syncSelects(getSelectedPref(), e.target.value);
        });
    }

    if (btnTodayFilter) {
        btnTodayFilter.addEventListener("click", () => {
            syncTodayFilter(!todayOnlyFilter);
            applyFilters();
        });
    }

    if (todayCheckMobile) {
        todayCheckMobile.addEventListener("change", (e) => {
            syncTodayFilter(e.target.checked);
        });
    }

    if (btnDiscontinuedFilter) {
        btnDiscontinuedFilter.addEventListener("click", () => {
            syncDiscontinuedFilter(!includeDiscontinued);
            applyFilters();
            renderGallery();
        });
    }

    if (discontinuedCheckMobile) {
        discontinuedCheckMobile.addEventListener("change", (e) => {
            syncDiscontinuedFilter(e.target.checked);
        });
    }

    if (discontinuedCheckGallery) {
        discontinuedCheckGallery.addEventListener("change", (e) => {
            syncDiscontinuedFilter(e.target.checked);
            renderGallery();
            applyFilters();
        });
    }

    if (btnSortNearest) {
        btnSortNearest.addEventListener("click", toggleSortNearest);
    }

    if (gallerySortSelect) {
        gallerySortSelect.addEventListener("change", (e) => {
            const val = e.target.value;
            if (val === "nearest") {
                if (userLocation) {
                    syncSortMode("nearest");
                    applyFilters();
                    renderGallery();
                } else {
                    locateUser((success) => {
                        if (success) {
                            syncSortMode("nearest");
                        } else {
                            syncSortMode("pref");
                        }
                        applyFilters();
                        renderGallery();
                    });
                }
            } else {
                syncSortMode("pref");
                applyFilters();
                renderGallery();
            }
        });
    }

    if (sortSelectMobile) {
        sortSelectMobile.addEventListener("change", (e) => {
            const val = e.target.value;
            if (val === "nearest") {
                if (userLocation) {
                    syncSortMode("nearest");
                } else {
                    locateUser((success) => {
                        if (success) {
                            syncSortMode("nearest");
                        } else {
                            syncSortMode("pref");
                        }
                    });
                }
            } else {
                syncSortMode("pref");
            }
        });
    }

    if (btnResetFilter) {
        btnResetFilter.addEventListener("click", () => {
            searchInput.value = "";
            syncSelects("", "");
            syncTodayFilter(false);
            syncDiscontinuedFilter(false);
            syncSortMode("pref");
            searchSuggestions.classList.add("hidden");
            btnClearSearch.classList.add("hidden");
            applyFilters();
            renderGallery();
            map.flyTo([36.5, 137.0], 5);
        });
    }

    if (btnRandomCard) btnRandomCard.addEventListener("click", showRandomCard);
    btnGeoLocation.addEventListener("click", locateUser);

    if (btnMobileFilterToggle) btnMobileFilterToggle.addEventListener("click", openDrawer);
    if (btnCloseDrawer) btnCloseDrawer.addEventListener("click", closeDrawer);
    if (btnApplyDrawer) {
        btnApplyDrawer.addEventListener("click", () => {
            closeDrawer();
            applyFilters();
        });
    }
    if (filterDrawer) {
        filterDrawer.addEventListener("click", (e) => {
            if (e.target === filterDrawer) closeDrawer();
        });
    }

    btnCloseModal.addEventListener("click", closeModal);
    cardModal.addEventListener("click", (e) => {
        if (e.target === cardModal) closeModal();
    });

    imageFrame.addEventListener("click", openLightbox);
    btnCloseLightbox.addEventListener("click", closeLightbox);
    imageLightbox.addEventListener("click", (e) => {
        if (e.target === imageLightbox) closeLightbox();
    });

    if (btnHeaderGallery) btnHeaderGallery.addEventListener("click", openGalleryModal);
    if (btnPillGallery) btnPillGallery.addEventListener("click", openGalleryModal);
    if (btnCloseGallery) btnCloseGallery.addEventListener("click", closeGalleryModal);

    if (galleryModal) {
        galleryModal.addEventListener("click", (e) => {
            if (e.target === galleryModal) closeGalleryModal();
        });
    }

    if (galleryPrefSelect) {
        galleryPrefSelect.addEventListener("change", (e) => {
            syncSelects(e.target.value, getSelectedEdition());
            renderGallery();
            applyFilters();
        });
    }

    if (galleryEditionSelect) {
        galleryEditionSelect.addEventListener("change", (e) => {
            syncSelects(getSelectedPref(), e.target.value);
            renderGallery();
            applyFilters();
        });
    }

    if (gallerySearchInput) {
        gallerySearchInput.addEventListener("input", () => {
            renderGallery();
        });
    }

    // キーボードショートカット
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (imageLightbox && !imageLightbox.classList.contains("hidden")) {
                closeLightbox();
            } else if (cardModal && !cardModal.classList.contains("hidden")) {
                closeModal();
            } else if (filterDrawer && !filterDrawer.classList.contains("hidden")) {
                closeDrawer();
            } else if (galleryModal && !galleryModal.classList.contains("hidden")) {
                closeGalleryModal();
            }
            if (searchSuggestions) searchSuggestions.classList.add("hidden");
        }
    });
});
