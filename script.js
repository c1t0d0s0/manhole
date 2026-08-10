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

    // --- State Variables ---
    let cardsData = [];
    let map = null;
    let markerClusterGroup = null;
    let markersMap = new Map(); // cardIndex -> marker reference
    let activeCard = null;

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

    // Buttons
    const btnGeoLocation = document.getElementById("btnGeoLocation");
    const btnResetFilter = document.getElementById("btnResetFilter");
    const btnRandomCard = document.getElementById("btnRandomCard");
    const btnRandomCardDesktop = document.getElementById("btnRandomCardDesktop");
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
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | GKP マンホールカードデータ',
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
    // 2. CSV Data Loading & Processing
    // ----------------------------------------------------------------------
    function loadCSVData() {
        Papa.parse("manhole_cards.csv", {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                cardsData = results.data.filter(item => item.lat && item.lng);
                console.log(`Loaded ${cardsData.length} cards with valid coordinates.`);
                
                totalCardsCountEl.textContent = cardsData.length.toLocaleString();

                populateFilterDropdowns();
                renderMarkers(cardsData);

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
        totalCardsCountEl.textContent = dataList.length.toLocaleString();
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
        if (editionSelectDesktop) editionSelectDesktop.value = edVal;
        if (editionSelectMobile) editionSelectMobile.value = edVal;
    }

    function getFilteredData() {
        const query = searchInput.value.trim().toLowerCase();
        const selectedPref = getSelectedPref();
        const selectedEdition = getSelectedEdition();

        return cardsData.filter(card => {
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
    function openModal(card) {
        activeCard = card;

        modalImg.src = card.img_url || "https://via.placeholder.com/300x420?text=No+Image";
        modalImg.alt = `${card.city} マンホールカード`;

        modalPref.textContent = card.pref || "日本";
        modalEdition.textContent = card.edition || "弾数不明";
        modalDate.textContent = card.release_date ? `発行: ${card.release_date}` : "";

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

    function locateUser() {
        if (!navigator.geolocation) {
            alert("お使いのブラウザは現在地取得に対応していません。");
            return;
        }

        btnGeoLocation.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;

                btnGeoLocation.innerHTML = `<i class="fa-solid fa-crosshairs"></i> 現在地`;
                map.flyTo([lat, lng], 13, { duration: 1.5 });

                L.circleMarker([lat, lng], {
                    radius: 10,
                    fillColor: "#0284C7",
                    color: "#FFFFFF",
                    weight: 3,
                    opacity: 1,
                    fillOpacity: 0.9
                }).addTo(map).bindPopup("📍 あなたの現在地").openPopup();
            },
            (err) => {
                btnGeoLocation.innerHTML = `<i class="fa-solid fa-crosshairs"></i> 現在地`;
                alert("現在地を取得できませんでした。位置情報の利用を許可してください。");
            },
            { timeout: 10000, enableHighAccuracy: true }
        );
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

    btnResetFilter.addEventListener("click", () => {
        searchInput.value = "";
        syncSelects("", "");
        searchSuggestions.classList.add("hidden");
        btnClearSearch.classList.add("hidden");
        applyFilters();
        map.flyTo([36.5, 137.0], 5);
    });

    if (btnRandomCard) btnRandomCard.addEventListener("click", showRandomCard);
    if (btnRandomCardDesktop) btnRandomCardDesktop.addEventListener("click", showRandomCard);
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

    // キーボードショートカット
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeLightbox();
            closeModal();
            closeDrawer();
            searchSuggestions.classList.add("hidden");
        }
    });
});
