/* webapp/script.js (v114.0 - FULL WebSocket Integration & XP Luxury) */
(function () {
    'use strict';

    // --- GLOBAL VARIABLES & CONFIG ---
    const tg = window.Telegram.WebApp;
    // تغییر آدرس اتصال برای WebSocket (اگر از http استفاده شود، ws و اگر از https استفاده شود، wss)
    const API_BASE_URL = window.location.origin;
    const WS_BASE_URL = API_BASE_URL.replace('http', 'ws');
    
    let MIN_SPLASH_TIME = 1500; 

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    
    const isDashboard = !!document.getElementById('toman-balance');
    const isSupportPage = !!document.getElementById('messages-container');
    
    let chatPollInterval = null;
    let lastMessageCount = 0;
    let isSending = false;
    let currentUUSDBalance = 0; // استفاده از UUSD به جای تومان برای بازی

    // --- WebSocket State ---
    let gameWebSocket = null;
    let wsConnectAttempt = 0;

    // المنت‌های اصلی داشبورد
    const els = {
        welcomeName: document.getElementById('welcome-name'),
        tomanBalance: document.getElementById('toman-balance'),
        uusdBalance: document.getElementById('uusd-balance'),
        xpBalance: document.getElementById('xp-balance'),
        avatar: document.querySelector('.avatar-img'),
        supportNotif: document.getElementById('support-notif'),
        ticker: document.getElementById('price-ticker'),
        
        // XP Luxury Elements
        xpFill: document.getElementById('xp-progress-fill'),
        levelBadge: document.getElementById('level-badge'),
        nextLevelText: document.getElementById('next-level-text'),
        levelRingFill: document.getElementById('level-ring-fill'), // NEW
        currentXPText: document.getElementById('current-xp-text'), // NEW

        premiumCard: document.querySelector('.premium-card'),
        mainContent: document.querySelector('.main-content'),
        
        // Game Price Display (NEW - برای نمایش قیمت لحظه‌ای در داشبورد)
        gamePriceDisplay: document.getElementById('game-price-display'), // فرض می‌کنیم در داشبورد نیز المان قیمت نمایش داده شود
        gameTimer: document.getElementById('game-timer'), 
    };

    // المنت‌های صفحه چت
    const chatEls = {
        container: document.getElementById('messages-container'),
        input: document.getElementById('message-input'),
        sendBtn: document.getElementById('send-btn'),
        optionsBtn: document.getElementById('chat-options-btn'),
        fileInput: document.getElementById('file-input'),
        attachBtn: document.getElementById('attach-btn')
    };

    // --- LOGO MAPPING (برای بهینه سازی تیکر) ---
    const logoMap = {
        'USDT': { icon: '<i class="fas fa-dollar-sign"></i>', color: '#0ECB81' },
        'BTC': { icon: '<i class="fab fa-btc"></i>', color: '#F7931A' },
        'ETH': { icon: '<i class="fab fa-ethereum"></i>', color: '#627EEA' },
        'TON': { icon: '💎', color: '#0098EA' },
        'NOT': { icon: '⭐', color: '#FFCC00' },
        'DEFAULT': { icon: '', color: '#fff' }
    };
    
    // --- XP LEVEL CONFIG (از config.py برداشته شده برای منطق کلاینت) ---
    const LEVEL_THRESHOLDS = [0, 500, 1500, 3500, 7000, 15000, 30000];
    const LEVEL_NAMES = ["GUEST", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "LEGEND"];


    // ==========================================
    // 1. GLOBAL FIX: BFCache Handler 
    // ==========================================
    window.addEventListener('pageshow', function(event) {
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            console.log("Restored from cache - Forcing loader hide");
            forceHideLoader();
            document.body.style.overflow = 'auto';
            if (isDashboard) {
                // ری‌کانکت کردن WebSocket در صورت بازگشت از کش
                initWebSocket(); 
            }
        }
    });
    
    // --- UTILITIES ---

    function formatNumber(num, decimals) {
        if (num === null || num === undefined) return '0';
        
        let numStr = String(num);
        numStr = numStr.replace(/,/g, ''); 
        
        const numFloat = parseFloat(numStr);

        if (isNaN(numFloat)) return '0';
        
        // استفاده از فرمت‌دهی محلی برای کاما
        const formatted = numFloat.toLocaleString('en-US', { 
            minimumFractionDigits: decimals, 
            maximumFractionDigits: decimals 
        });

        return formatted;
    }
    
    // ==========================================
    // 2. MAIN INITIALIZATION
    // ==========================================
    window.onload = async function() {
        try {
            tg.ready();
            tg.expand();
            setupTelegramUI();

            if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE"; 
            const hasSeenSplash = sessionStorage.getItem('splash_shown');

            if (isDashboard) {
                if (hasSeenSplash) {
                    loadFromCache();
                    forceHideLoader(); 
                    initDashboardEffects();
                    // در داشبورد، ابتدا داده‌های اولیه را می‌گیریم
                    fetchDashboardData().then(data => { if(data) updateDashboardUI(data); });
                    fetchMarketRates().then(handleMarketData);
                    checkUnreadSupportMessages();
                    // سپس WebSocket را برای داده‌های Real-time بازی وصل می‌کنیم
                    initWebSocket(); 
                } else {
                    sessionStorage.setItem('splash_shown', 'true');
                    const splashTimer = new Promise(resolve => setTimeout(resolve, MIN_SPLASH_TIME));
                    const dataFetch = fetchDashboardData();
                    const ratesFetch = fetchMarketRates(); 

                    const [dataResult, ratesResult] = await Promise.allSettled([dataFetch, ratesFetch, splashTimer]); 
                    
                    updateDashboardUI(dataResult.value);
                    handleMarketData(ratesResult.value);
                    
                    hideLoaderWithAnimation();
                    setTimeout(initDashboardEffects, 800); 
                    
                    // اتصال WebSocket پس از نمایش اولیه
                    initWebSocket();
                }
            } else if (isSupportPage) {
                forceHideLoader(); 
                setupChatListeners();
                await loadChatHistory(true); 
                startChatPolling();
                initHapticFeedback();
            } else {
                forceHideLoader();
                initHapticFeedback();
            }

        } catch (error) { 
            console.error("Critical Init Error:", error);
            forceHideLoader(); 
        }
    };
    
    function setupTelegramUI() {
        tg.setHeaderColor('#050505');
        tg.setBackgroundColor('#000000');
        
        if (isDashboard) {
            tg.BackButton.hide();
        } else {
            tg.BackButton.show();
            tg.BackButton.onClick(function() {
                window.history.back(); // بازگشت به صفحه قبل (داشبورد)
            });
        }
    }

    function initDashboardEffects() {
        if(els.premiumCard) init3DCardEffect();
        initHapticFeedback();
    }
    
    function handleMarketData(ratesResult) {
        if(ratesResult && ratesResult.status === 'success') {
            updateTickerUI(ratesResult.rates);
            const usdt = ratesResult.rates.find(r => r.symbol === 'USDT');
            if(usdt) renderSmartChart(parseFloat(usdt.change));
        } else {
            renderSmartChart(0);
        }
    }

    // ==========================================
    // 3. Loader Functions (Critical Fix applied here)
    // (توابع لودر بدون تغییر باقی می‌مانند)
    // ==========================================
    function forceHideLoader() {
        document.body.classList.remove('loading-active'); 
        if (loader) {
            loader.style.display = 'none';
        }
        if (appContainer) {
            appContainer.classList.remove('hidden-content');
            appContainer.classList.add('fade-in-active'); 
            appContainer.style.opacity = '1';
            appContainer.style.transform = 'translateY(0)';
            document.body.style.overflow = 'auto'; // مهم
        }
    }

    function hideLoaderWithAnimation() {
        document.body.classList.remove('loading-active');
        if (loader) {
            loader.style.opacity = '0';
            loader.style.pointerEvents = 'none';
            setTimeout(() => {
                loader.style.display = 'none';
                if (appContainer) {
                    appContainer.classList.remove('hidden-content');
                    appContainer.classList.add('fade-in-active');
                }
            }, 500); 
        }
    }

    // ==========================================
    // 4. WebSocket & Real-time Game Logic (NEW)
    // ==========================================

    function initWebSocket() {
        if (gameWebSocket && gameWebSocket.readyState === WebSocket.OPEN) return;
        
        const url = `${WS_BASE_URL}/ws/game?init_data=${encodeURIComponent(tg.initData)}`;
        gameWebSocket = new WebSocket(url);

        gameWebSocket.onopen = () => {
            console.log("WebSocket connected.");
            wsConnectAttempt = 0; // ریست کردن تلاش‌ها
        };

        gameWebSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (e) {
                console.error("Failed to parse WS message:", e);
            }
        };

        gameWebSocket.onclose = () => {
            console.log("WebSocket disconnected. Retrying...");
            gameWebSocket = null;
            if (wsConnectAttempt < 5) {
                wsConnectAttempt++;
                setTimeout(initWebSocket, 2000 * wsConnectAttempt); // تلاش مجدد با تأخیر تصاعدی
            } else {
                console.error("Max WebSocket retries reached.");
            }
        };

        gameWebSocket.onerror = (error) => {
            console.error("WebSocket error:", error);
            gameWebSocket.close(); 
        };
    }
    
    function handleWebSocketMessage(data) {
        if (!isDashboard) return;

        if (data.type === 'GAME_UPDATE') {
            // آپدیت عمومی بازی (قیمت و زمان)
            updateGameUI(data);

            // آپدیت بالانس و نتیجه شخصی (فقط در صورتی که در پیام باشد)
            if (data.user_balance !== undefined) {
                 // به‌روزرسانی بالانس UUSD و XP در زمان واقعی
                const balanceData = {
                    toman_balance: currentTomanBalance, // تومان از API اصلی می‌آید
                    uusd_balance: data.user_balance,
                    xp_balance: data.user_xp || els.xpBalance.innerText.replace(/\D/g, '') // اگر XP در پیام نبود، از مقدار فعلی استفاده کن
                };
                updateDashboardUI({ status: 'success', ...balanceData }, true);
            }

            // نمایش نتیجه شرط‌بندی قبلی
            if (data.last_result && data.last_result.round_id) {
                showGameResult(data.last_result);
                // پس از نمایش، XP و بالانس به‌روزرسانی می‌شود (توسط فیدبک Real-time)
            }
        }
    }

    function updateGameUI(data) {
        // --- Game Price/Timer (در صورت وجود المنت‌های مربوط به بازی در داشبورد) ---
        if (els.gamePriceDisplay) {
            els.gamePriceDisplay.innerText = formatNumber(data.current_price, 2) + " $";
        }
        
        // --- Game Timer ---
        if (els.gameTimer) {
            els.gameTimer.innerText = data.round.time_left;
        }

        // --- History / Chart Update ---
        if (data.history && data.history.length > 0) {
            // رندر چارت کوچک با استفاده از داده‌های تاریخچه
            // (ما از نرخ‌های Wallex استفاده می‌کردیم، اما برای لاکچری‌سازی بهتر است از تاریخچه بازی استفاده کنیم)
            const lastPrice = data.history[data.history.length - 1].end_price;
            const secondLastPrice = data.history.length > 1 ? data.history[data.history.length - 2].end_price : lastPrice;
            const change = ((lastPrice - secondLastPrice) / secondLastPrice) * 100;
            renderSmartChart(change);
        }
    }

    function showGameResult(result) {
        let title, message, color;

        if (result.status === 'WIN') {
            title = '🎉 شرط شما برنده شد!';
            message = `شما ${formatNumber(result.payout, 2)}$ بردید و ${result.xp_reward} XP جایزه گرفتید.`;
            color = tg.themeParams.buttonColor || '#0ECB81'; // سبز
            try { tg.HapticFeedback.notificationOccurred('success'); } catch(e){}
        } else {
            title = '❌ شرط شما باخت';
            message = `مبلغ ${formatNumber(result.bet_amount, 2)}$ از دست رفت.`;
            color = tg.themeParams.secondaryBackgroundColor || '#F6465D'; // قرمز
            try { tg.HapticFeedback.notificationOccurred('error'); } catch(e){}
        }
        
        tg.showPopup({
            title: title,
            message: message,
            buttons: [{id: 'ok', type: 'ok', text: 'باشه'}]
        }, (btnId) => {
            // می‌توانیم اکشن‌های بعد از بستن پاپ‌آپ را اینجا هندل کنیم
        });
    }

    // ==========================================
    // 5. Data Fetching (Reduced usage)
    // ==========================================
    async function fetchDashboardData() {
        // این تابع فقط برای بارگذاری اولیه استفاده می‌شود (Toman Balance و XP/UUSD اولیه)
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                body: JSON.stringify({ initData: tg.initData })
            });
            if (!response.ok) throw new Error("Server Error");
            const data = await response.json();
            if(data.status === 'success') saveToCache(data);
            return data;
        } catch (error) { 
            console.error("fetchDashboardData failed:", error);
            return null; 
        }
    }

    async function fetchMarketRates() {
        // این تابع برای تیکر بالا و چارت استفاده می‌شود
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/market/rates`, {
                headers: { 'ngrok-skip-browser-warning': 'true' }
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (e) { return null; }
    }

    // ==========================================
    // 6. UI Updaters (Refined)
    // ==========================================
    function updateDashboardUI(data, saveCache = true) {
        if (!data || data.status === 'error') {
             if (els.welcomeName) els.welcomeName.innerText = "کاربر عزیز";
             return; 
        }

        if(saveCache) saveToCache(data);

        // --- Balances ---
        const tomanStr = data.toman_balance || 0;
        const uusdStr = data.uusd_balance || 0;
        const xpStr = data.xp_balance || 0;

        currentUUSDBalance = parseFloat(String(uusdStr).replace(/,/g, '') || 0);
        
        // نمایش وضعیت KYC
        if (document.getElementById('kyc-status-display')) {
             document.getElementById('kyc-status-display').innerText = `KYC LVL ${data.kyc_level || 1} (${data.kyc_status_code || 'NONE'})`;
        }

        if (els.welcomeName) els.welcomeName.innerText = data.first_name || "کاربر گرامی";
        
        if (els.tomanBalance) {
            els.tomanBalance.innerText = formatNumber(tomanStr, 0); 
        }

        if (els.uusdBalance) {
            els.uusdBalance.innerHTML = `${formatNumber(uusdStr, 2)} <small>$</small>`;
        }
        
        if (els.xpBalance) {
            els.xpBalance.innerHTML = `${formatNumber(xpStr, 0)} <small>XP</small>`;
        }

        updateLevelProgress(parseFloat(String(xpStr).replace(/,/g, '') || 0));

        if (tg.initDataUnsafe?.user?.photo_url && els.avatar) {
            els.avatar.src = tg.initDataUnsafe.user.photo_url;
        }
    }

    function updateLevelProgress(xp) {
        if (!els.xpFill || !els.levelBadge) return;

        let currentLevelIndex = 0; 
        for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
            if (xp >= LEVEL_THRESHOLDS[i]) { currentLevelIndex = i; } else { break; }
        }

        const currentThreshold = LEVEL_THRESHOLDS[currentLevelIndex];
        const nextThreshold = LEVEL_THRESHOLDS[currentLevelIndex + 1];
        
        let percentage = 0;
        if (nextThreshold) {
            percentage = ((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
        } else {
            percentage = 100;
        }

        percentage = Math.min(100, Math.max(0, percentage));

        // --- XP Bar and Text ---
        els.xpFill.style.width = `${percentage}%`;
        els.levelBadge.innerText = `VIP ${currentLevelIndex + 1}`; 
        if (els.currentXPText) els.currentXPText.innerText = `${formatNumber(xp, 0)} XP`; // NEW

        // --- XP Ring (Luxury) ---
        if (els.levelRingFill) {
            // از percentage برای fill-arc استفاده می‌کنیم
            els.levelRingFill.style.background = `conic-gradient(var(--xp-color) ${percentage}%, #555 ${percentage}%)`;
        }
        
        if (els.nextLevelText) {
            if (nextThreshold) {
                 els.nextLevelText.innerText = `NEXT: ${LEVEL_NAMES[currentLevelIndex + 1]} (${Math.ceil(nextThreshold - xp).toLocaleString()} XP)`;
            } else {
                els.nextLevelText.innerText = "MAX LEVEL";
            }
        }
    }
    
    // (توابع updateTickerUI و renderSmartChart بدون تغییر باقی می‌مانند)
    function updateTickerUI(rates) {
        if (!els.ticker || !rates || rates.length === 0) return;
        
        let html = '';
        const loopRates = [...rates, ...rates, ...rates, ...rates]; 
        loopRates.forEach(rate => {
            const change = parseFloat(rate.change);
            const changeClass = change >= 0 ? 'up' : 'down';
            const arrow = change > 0 ? '▲' : (change < 0 ? '▼' : '');
            const colorClass = change === 0 ? '' : changeClass;
            const assetInfo = logoMap[rate.symbol] || logoMap['DEFAULT'];
            const icon = assetInfo.icon;
            
            html += `<div class="ticker-item">${rate.symbol} ${icon} <span class="${colorClass}">${rate.price} ${arrow} <small>(${rate.change}%)</small></span></div>`;
        });
        els.ticker.innerHTML = html;
        els.ticker.style.animation = 'none';
        void els.ticker.offsetWidth;
        els.ticker.style.animation = 'ticker 25s linear infinite';
    }

    function renderSmartChart(changePercent) {
        const svg = document.getElementById('sparkline-svg');
        if (!svg) return;
        const existingPaths = svg.querySelectorAll('path');
        existingPaths.forEach(p => p.remove());
        const width = 300; const height = 50; const pointsCount = 20; 
        const points = []; const trendFactor = changePercent * 2; 
        
        for (let i = 0; i <= pointsCount; i++) {
            const x = (i / pointsCount) * width;
            const noise = (Math.random() - 0.5) * 15;
            const trend = (i / pointsCount) * -trendFactor; 
            let y = (height / 2) + trend + noise;
            y = Math.max(5, Math.min(height - 5, y));
            points.push({x, y});
        }
        
        let d = `M ${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) { d += ` L ${points[i].x},${points[i].y}`; }
        
        let strokeColor = '#FFCC00'; let fillUrl = 'url(#gradNeutral)';
        if (changePercent > 0) { strokeColor = '#0ECB81'; fillUrl = 'url(#gradUp)'; } 
        else if (changePercent < 0) { strokeColor = '#F6465D'; fillUrl = 'url(#gradDown)'; }
        
        const pathLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathLine.setAttribute("d", d); pathLine.setAttribute("fill", "none"); pathLine.setAttribute("stroke", strokeColor); pathLine.setAttribute("stroke-width", "2"); pathLine.setAttribute("stroke-linecap", "round"); pathLine.setAttribute("stroke-linejoin", "round");
        
        const dFill = d + ` V ${height} H 0 Z`;
        const pathFill = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathFill.setAttribute("d", dFill); pathFill.setAttribute("fill", fillUrl); pathFill.setAttribute("stroke", "none"); pathFill.style.opacity = "0.5";
        
        svg.appendChild(pathFill); svg.appendChild(pathLine);
    }

    // ==========================================
    // 7. Effects & Interactions (Parallax)
    // (توابع افکت‌ها بدون تغییر باقی می‌مانند)
    // ==========================================
    function init3DCardEffect() {
        const card = els.premiumCard;
        const container = els.mainContent;
        const cardShine = document.querySelector('.card-shine');

        if (!card || !container) return;

        function handleMove(e) {
            const rect = card.getBoundingClientRect();
            const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : undefined);
            const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : undefined);

            if (clientX === undefined || clientY === undefined) return;

            const cardCenterX = rect.left + rect.width / 2;
            const cardCenterY = rect.top + rect.height / 2;
            
            const mouseX = clientX - cardCenterX;
            const mouseY = clientY - cardCenterY;
            
            const rotateX = (mouseY / rect.height) * -8;
            const rotateY = (mouseX / rect.width) * 8;
            
            const shineX = (mouseX / rect.width * 50) + 50;
            const shineY = (mouseY / rect.height * 50) + 50;

            card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            if (cardShine) {
                cardShine.style.setProperty('--shine-x', `${shineX}%`);
                cardShine.style.setProperty('--shine-y', `${shineY}%`);
            }
        }

        function handleLeave() { 
            card.style.transform = `rotateX(0deg) rotateY(0deg)`; 
            if (cardShine) {
                cardShine.style.setProperty('--shine-x', `50%`);
                cardShine.style.setProperty('--shine-y', `50%`);
            }
        }

        container.addEventListener('mousemove', handleMove);
        container.addEventListener('mouseleave', handleLeave);
        container.addEventListener('touchmove', handleMove, {passive: true});
        container.addEventListener('touchend', handleLeave);
    }

    function initHapticFeedback() {
        const interactives = document.querySelectorAll('.ripple-btn, .glass-btn, .service-card, .game-banner, .action-icon-btn');
        interactives.forEach(el => {
            el.addEventListener('touchstart', () => { 
                try { tg.HapticFeedback.impactOccurred('light'); } catch(e){} 
            }, {passive: true});
        });
    }

    // --- Caching ---
    function saveToCache(data) {
        try { localStorage.setItem('dashboard_cache', JSON.stringify(data)); } catch (e) {}
    }

    function loadFromCache() {
        try {
            const cached = localStorage.getItem('dashboard_cache');
            if (cached) {
                const data = JSON.parse(cached);
                updateDashboardUI(data, false);
            }
        } catch (e) {}
    }
    
    // --- Unread Support Check ---
    async function checkUnreadSupportMessages() {
        if (!els.supportNotif) return;
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/support/check_unread`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();
            if (data.has_unread) els.supportNotif.style.display = 'block';
        } catch (e) {}
    }
    
    // --- Chat Functions (برای کامل بودن فایل) ---
    // ... (توابع چت: loadChatHistory, setupChatListeners, renderMessage و ...)
    // این توابع برای حفظ حجم پیام در چت اصلی حذف می‌شوند، اما باید در فایل واقعی شما وجود داشته باشند.
    
})();