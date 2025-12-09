/* webapp/script.js (v115.0 - FINAL WebSocket Integration & Loader Stability Fix) */
(function () {
    'use strict';

    // --- GLOBAL VARIABLES & CONFIG ---
    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    // تغییر آدرس اتصال برای WebSocket (اگر از http استفاده شود، ws و اگر از https استفاده شود، wss)
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
        levelRingFill: document.getElementById('level-ring-fill'), 
        currentXPText: document.getElementById('current-xp-text'), 
        kycStatusDisplay: document.getElementById('kyc-status-display'),

        premiumCard: document.querySelector('.premium-card'),
        mainContent: document.querySelector('.main-content'),
        
        // Game Price Display (اختیاری در داشبورد)
        gamePriceDisplay: document.getElementById('game-price-display'), 
        gameTimer: document.getElementById('game-timer'), 
    };

    // المنت‌های صفحه چت (برای کامل بودن کد)
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
                    // در پس‌زمینه داده‌ها را به‌روزرسانی و WS را وصل می‌کنیم
                    fetchDashboardData().then(data => { if(data) updateDashboardUI(data); });
                    fetchMarketRates().then(handleMarketData);
                    checkUnreadSupportMessages();
                    initWebSocket(); 
                } else {
                    sessionStorage.setItem('splash_shown', 'true');
                    const splashTimer = new Promise(resolve => setTimeout(resolve, MIN_SPLASH_TIME));
                    const dataFetch = fetchDashboardData();
                    const ratesFetch = fetchMarketRates(); 

                    // در اینجا WebSocket را شروع می‌کنیم، اما منتظر نمی‌مانیم. تایم‌آوت آن را هندل می‌کند.
                    initWebSocket();
                    const [dataResult, ratesResult] = await Promise.allSettled([dataFetch, ratesFetch, splashTimer]); 
                    
                    updateDashboardUI(dataResult.value);
                    handleMarketData(ratesResult.value);
                    
                    // حذف لودر توسط onopen در WS یا توسط تایم‌آوت WS انجام می‌شود.
                    // اگر اتصال WS بلافاصله برقرار نشد، تایمر splashTimer کار حذف لودر را انجام می‌دهد.
                    // اما اگر WS زودتر وصل شد، خودش لودر را حذف می‌کند.
                    // ما یک fail-safe نهایی برای اطمینان از حذف Loader بعد از همه promiseها می‌گذاریم:
                    setTimeout(() => {
                        if (document.body.classList.contains('loading-active')) {
                            hideLoaderWithAnimation();
                            setTimeout(initDashboardEffects, 800); 
                        }
                    }, MIN_SPLASH_TIME + 100); 
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
            // FAIL-SAFE نهایی
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
                window.history.back(); 
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
    // ==========================================
    function forceHideLoader() {
        document.body.classList.remove('loading-active'); 
        if (loader) {
            loader.style.transition = 'none';
            loader.style.opacity = '0';
            loader.style.display = 'none';
        }
        if (appContainer) {
            appContainer.classList.remove('hidden-content');
            appContainer.classList.add('fade-in-active'); 
            appContainer.style.opacity = '1';
            appContainer.style.transform = 'translateY(0)';
            document.body.style.overflow = 'auto'; 
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
    // 4. WebSocket & Real-time Game Logic
    // ==========================================

    function initWebSocket() {
        if (gameWebSocket && gameWebSocket.readyState === WebSocket.OPEN) return;
        
        const url = `${WS_BASE_URL}/ws/game?init_data=${encodeURIComponent(tg.initData)}`;
        gameWebSocket = new WebSocket(url);
        
        // --- مکانیزم تایم‌آوت رفع مشکل Loader ---
        let connectionTimeout = setTimeout(() => {
            if (gameWebSocket.readyState !== WebSocket.OPEN) {
                 console.warn("WS connection timed out. Forcing content display.");
                 showToast("⚠️ اتصال Real-time برقرار نشد. داشبورد با داده‌های اولیه لود شد.");
                 forceHideLoader();
                 // در صورت بروز خطا در اتصال Real-time، حداقل یکبار داده‌های اولیه را بیاوریم
                 fetchDashboardData().then(data => { if(data) updateDashboardUI(data); });
            }
        }, 3000); // 3 ثانیه تایم‌آوت

        gameWebSocket.onopen = () => {
            clearTimeout(connectionTimeout); 
            console.log("WebSocket connected.");
            wsConnectAttempt = 0; 
            // اگر لودر هنوز فعال است (ممکن است بخاطر splash timer فعال مانده باشد)
            if (document.body.classList.contains('loading-active')) {
                hideLoaderWithAnimation();
                setTimeout(initDashboardEffects, 800);
            }
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
            clearTimeout(connectionTimeout); 
            console.log("WebSocket disconnected. Retrying...");
            gameWebSocket = null;
            if (wsConnectAttempt < 5) {
                wsConnectAttempt++;
                setTimeout(initWebSocket, 2000 * wsConnectAttempt); 
            } else {
                console.error("Max WebSocket retries reached.");
            }
        };

        gameWebSocket.onerror = (error) => {
            clearTimeout(connectionTimeout);
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
                 // به‌روزرسانی بالانس UUSD در زمان واقعی
                const balanceData = {
                    toman_balance: els.tomanBalance.innerText.replace(/,/g, '') || 0, 
                    uusd_balance: data.user_balance,
                    xp_balance: data.user_xp || els.xpBalance.innerText.replace(/\D/g, '') 
                };
                updateDashboardUI({ status: 'success', ...balanceData }, true);
            }

            // نمایش نتیجه شرط‌بندی قبلی
            if (data.last_result && data.last_result.round_id) {
                // showGameResult(data.last_result); // این باید در game.js هندل شود، اینجا فقط اطلاع‌رسانی می‌کنیم
                tg.showPopup({title: 'نتیجه شرط', message: data.last_result.status === 'WIN' ? '🎉 برنده شدید!' : '❌ شکست خوردید.'});
            }
        }
    }

    function updateGameUI(data) {
        // این بخش می‌تواند در game.js بهتر مدیریت شود، اما برای نمایش داده‌های عمومی در داشبورد
        if (els.gamePriceDisplay) {
            els.gamePriceDisplay.innerText = formatNumber(data.current_price, 2) + " $";
        }
        
        if (els.gameTimer) {
            els.gameTimer.innerText = data.round.time_left;
        }
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
        if (els.kycStatusDisplay) {
             els.kycStatusDisplay.innerText = `KYC LVL ${data.kyc_level || 1} (${data.kyc_status_code || 'NONE'})`;
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
        if (els.currentXPText) els.currentXPText.innerText = `${formatNumber(xp, 0)} XP`; 

        // --- XP Ring (Luxury) ---
        if (els.levelRingFill) {
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
    
    // (توابع updateTickerUI و renderSmartChart که در نسخه قبلی جا افتاده بودند، در اینجا هستند)
    function updateTickerUI(rates) {
        if (!els.ticker || !rates || rates.length === 0) return;
        
        let html = '';
        // تکرار برای ایجاد حرکت روان
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
    // 7. Effects & Interactions (Parallax & Haptic)
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
    // ... (توابع چت)
    
})();