/* webapp/script.js (v105.0 - PRODUCTION READY - NO SUMMARIZATION) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    // آدرس پایه برای روت‌های کاربر
    const API_BASE_URL = window.location.origin + "/api/webapp"; 
    
    let MIN_SPLASH_TIME = 3500; 

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    
    const isDashboard = !!document.getElementById('toman-balance');
    const isSupportPage = !!document.getElementById('messages-container');

    let chatPollInterval = null;
    let lastMessageCount = 0;
    let isSending = false;

    const els = {
        welcomeName: document.getElementById('welcome-name'),
        tomanBalance: document.getElementById('toman-balance'),
        uusdBalance: document.getElementById('uusd-balance'),
        xpBalance: document.getElementById('xp-balance'),
        kycText: document.getElementById('kyc-text'),
        avatar: document.querySelector('.avatar-img'),
        supportNotif: document.getElementById('support-notif'),
        ticker: document.getElementById('price-ticker'),
        xpFill: document.getElementById('xp-progress-fill'),
        levelBadge: document.getElementById('level-badge'),
        nextLevelText: document.getElementById('next-level-text')
    };

    const chatEls = {
        container: document.getElementById('messages-container'),
        input: document.getElementById('message-input'),
        sendBtn: document.getElementById('send-btn'),
        optionsBtn: document.getElementById('chat-options-btn'),
        fileInput: document.getElementById('file-input'),
        attachBtn: document.getElementById('attach-btn')
    };

    // ==========================================
    // 1. GLOBAL FIX: BFCache Handler
    // ==========================================
    window.addEventListener('pageshow', function(event) {
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            console.log("Restored from cache - Forcing loader hide");
            forceHideLoader();
            document.body.style.overflow = 'auto';
        }
    });

    // ==========================================
    // 2. MAIN INITIALIZATION
    // ==========================================
    window.onload = async function() {
        try {
            tg.ready();
            tg.expand();
            
            if (isDashboard) {
                tg.setHeaderColor('#000000'); 
                tg.setBackgroundColor('#000000');
                tg.BackButton.hide();
            } else {
                tg.setHeaderColor('#1a1a1a');
                tg.setBackgroundColor('#000000');
                tg.BackButton.show();
                tg.BackButton.onClick(function() {
                    window.location.href = 'dashboard.html';
                });
            }

            if (!tg.initData) {
                console.warn("Using Test Data");
                tg.initData = "query_id=TEST_DEV_MODE"; 
            }

            const hasSeenSplash = sessionStorage.getItem('splash_shown');

            if (isDashboard) {
                if (hasSeenSplash) {
                    loadFromCache();
                    forceHideLoader();
                    
                    setTimeout(() => {
                        init3DCardEffect();
                        initHapticFeedback();
                    }, 50);

                    fetchDashboardData().then(data => { if(data) updateDashboardUI(data); });
                    fetchMarketRates().then(res => {
                        if(res && res.status === 'success') {
                            updateTickerUI(res.rates);
                            const usdt = res.rates.find(r => r.symbol === 'USDT');
                            if(usdt) renderSmartChart(usdt.change);
                        }
                    });
                    checkUnreadSupportMessages();

                } else {
                    sessionStorage.setItem('splash_shown', 'true');
                    const splashTimer = new Promise(resolve => setTimeout(resolve, MIN_SPLASH_TIME));
                    const dataFetch = fetchDashboardData();
                    const ratesFetch = fetchMarketRates(); 

                    const [dataResult, ratesResult] = await Promise.all([dataFetch, ratesFetch, splashTimer]);

                    if (dataResult) {
                        updateDashboardUI(dataResult);
                        checkUnreadSupportMessages();
                        
                        if (ratesResult && ratesResult.status === 'success') {
                            updateTickerUI(ratesResult.rates);
                            const usdt = ratesResult.rates.find(r => r.symbol === 'USDT');
                            if(usdt) renderSmartChart(usdt.change);
                        } else {
                            renderSmartChart(0);
                        }
                        
                        hideLoaderWithAnimation();
                        
                        setTimeout(() => {
                            init3DCardEffect();
                            initHapticFeedback();
                        }, 100);
                    } else {
                        forceHideLoader();
                    }
                }
            } else if (isSupportPage) {
                forceHideLoader();
                setupChatListeners();
                await loadChatHistory(true); 
                startChatPolling();
                initHapticFeedback();
            } else {
                forceHideLoader();
            }

        } catch (error) {
            console.error("Critical Init Error:", error);
            forceHideLoader();
        }
    };

    // ==========================================
    // Caching & Data Logic
    // ==========================================
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

    function forceHideLoader() {
        document.body.classList.remove('loading-active');
        if (loader) {
            loader.style.display = 'none';
            loader.style.opacity = '0';
        }
        if (appContainer) {
            appContainer.classList.remove('hidden-content');
            appContainer.style.opacity = '1';
            appContainer.style.transform = 'translateY(0)';
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
            }, 800); 
        }
    }

    async function fetchDashboardData() {
        try {
            const response = await fetch(`${API_BASE_URL}/get_user_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();
            if(data.status === 'success') saveToCache(data);
            return data;
        } catch (error) { return null; }
    }

    async function fetchMarketRates() {
        try {
            const response = await fetch(`${API_BASE_URL}/market/rates`);
            return await response.json();
        } catch (e) { return null; }
    }

    // ==========================================
    // UI Updaters (Fixed Percentages & Colors)
    // ==========================================
    function updateDashboardUI(data, saveCache = true) {
        if (!data || data.status === 'error') return;
        if(saveCache) saveToCache(data);

        if (els.welcomeName) els.welcomeName.innerText = data.first_name || "کاربر گرامی";
        if (els.tomanBalance) els.tomanBalance.innerText = data.toman_balance; 
        if (els.uusdBalance) els.uusdBalance.innerHTML = `${data.uusd_balance} <small>$</small>`;
        if (els.xpBalance) els.xpBalance.innerHTML = `${data.xp_balance} <small>XP</small>`;

        updateLevelProgress(parseInt((data.xp_balance || "0").replace(/,/g, '')) || 0);

        if (tg.initDataUnsafe?.user?.photo_url && els.avatar) {
            els.avatar.src = tg.initDataUnsafe.user.photo_url;
        }
        updateKycBadge(data.kyc_status_code);
    }

    function updateLevelProgress(xp) {
        if (!els.xpFill || !els.levelBadge) return;
        const levels = [0, 500, 1500, 3500, 7000, 15000, 30000]; 
        let currentLevel = 1; let prevThreshold = 0; let nextThreshold = 500;
        for (let i = 0; i < levels.length; i++) {
            if (xp >= levels[i]) { currentLevel = i + 1; prevThreshold = levels[i]; nextThreshold = levels[i+1] || (levels[i] * 2); } else { break; }
        }
        let percentage = 0;
        if (nextThreshold > prevThreshold) percentage = ((xp - prevThreshold) / (nextThreshold - prevThreshold)) * 100;
        percentage = Math.min(100, Math.max(0, percentage));
        els.xpFill.style.width = `${percentage}%`;
        els.levelBadge.innerText = `VIP ${currentLevel}`;
        if (els.nextLevelText) els.nextLevelText.innerText = `${Math.floor(percentage)}%`;
    }

    function updateTickerUI(rates) {
        if (!els.ticker || !rates || rates.length === 0) return;
        let html = '';
        // تکرار برای انیمیشن بی‌پایان
        const loopRates = [...rates, ...rates, ...rates]; 
        loopRates.forEach(rate => {
            // استفاده از منطق عددی برای تعیین کلاس رنگ
            const isUp = rate.change >= 0;
            const colorClass = isUp ? 'up-color' : 'down-color';
            const arrow = isUp ? '▲' : '▼';
            
            // نمایش نماد ارز، قیمت و درصد واقعی (غیر صفر)
            html += `
                <div class="ticker-item">
                    ${rate.symbol}: 
                    <span style="color: #fff; margin-right: 5px;">${rate.price}</span>
                    <span class="${colorClass}">${arrow} ${rate.display_change}</span>
                </div>`;
        });
        els.ticker.innerHTML = html;
    }

    function renderSmartChart(changePercent) {
        const svg = document.getElementById('sparkline-svg');
        const path = document.getElementById('sparkline-path');
        if (!svg || !path) return;
        
        const width = 300; const height = 50; const pointsCount = 20; 
        const points = []; const trendFactor = changePercent * 2; 
        
        for (let i = 0; i <= pointsCount; i++) {
            const x = (i / pointsCount) * width;
            const noise = (Math.random() - 0.5) * 12;
            const trend = (i / pointsCount) * -trendFactor; 
            let y = (height / 2) + trend + noise;
            y = Math.max(5, Math.min(height - 5, y));
            points.push({x, y});
        }
        
        let d = `M ${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) { d += ` L ${points[i].x},${points[i].y}`; }
        
        path.setAttribute("d", d);
        path.setAttribute("stroke", changePercent >= 0 ? '#0ECB81' : '#F6465D');
    }

    // ==========================================
    // Interactions & Support
    // ==========================================
    function init3DCardEffect() {
        const card = document.querySelector('.premium-card');
        if (!card) return;
        document.addEventListener('mousemove', (e) => {
            const x = (window.innerWidth / 2 - e.pageX) / 30;
            const y = (window.innerHeight / 2 - e.pageY) / 30;
            card.style.transform = `rotateY(${x}deg) rotateX(${y}deg)`;
        });
    }

    function initHapticFeedback() {
        const interactives = document.querySelectorAll('.ripple-btn, .glass-btn, .service-card, .game-banner, .action-icon-btn, .send-btn');
        interactives.forEach(el => {
            el.addEventListener('click', () => { tg.HapticFeedback.impactOccurred('light'); });
        });
    }

    function updateKycBadge(status) {
        if (!els.kycText) return;
        let text = "Guest", color = "#848E9C";
        if (status === 'verified') { text = "Verified ✅"; color = "#0ECB81"; }
        else if (status === 'pending') { text = "Pending ⏳"; color = "#F0B90B"; }
        els.kycText.innerText = text; els.kycText.style.color = color;
    }

    async function checkUnreadSupportMessages() {
        if (!els.supportNotif) return;
        try {
            const response = await fetch(`${API_BASE_URL}/support/check_unread`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();
            els.supportNotif.style.display = data.has_unread ? 'block' : 'none';
        } catch (e) {}
    }

    // ==========================================
    // Support Chat Engine (Full Version)
    // ==========================================
    function startChatPolling() {
        if (chatPollInterval) clearInterval(chatPollInterval);
        chatPollInterval = setInterval(() => loadChatHistory(false), 3000);
    }
    
    async function loadChatHistory(isFirstLoad = false) {
        if (!chatEls.container) return;
        try {
            const response = await fetch(`${API_BASE_URL}/support/get_history`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            if (response.ok) {
                const data = await response.json();
                const messages = data.messages || [];
                if (isFirstLoad || messages.length > lastMessageCount) {
                    if (isFirstLoad) chatEls.container.innerHTML = '';
                    const newMessages = messages.slice(isFirstLoad ? 0 : lastMessageCount);
                    newMessages.forEach(msg => renderMessage(msg));
                    lastMessageCount = messages.length;
                    scrollToBottom();
                }
            }
        } catch (e) { console.error("Chat Load Error", e); }
    }

    function setupChatListeners() {
        if (!chatEls.sendBtn || !chatEls.input) return;
        chatEls.sendBtn.onclick = sendMessage;
        chatEls.input.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
        if (chatEls.attachBtn && chatEls.fileInput) {
            chatEls.attachBtn.onclick = () => chatEls.fileInput.click();
            chatEls.fileInput.onchange = handleFileUpload;
        }
    }

    async function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('file', file);
        try {
            const response = await fetch(`${API_BASE_URL}/support/upload_file`, { method: 'POST', body: formData });
            if (response.ok) loadChatHistory(false);
        } catch (e) { tg.showAlert("خطا در آپلود"); }
    }

    async function sendMessage() {
        if (isSending) return;
        const text = chatEls.input.value.trim();
        if (!text) return;
        isSending = true;
        try {
            const response = await fetch(`${API_BASE_URL}/support/send_message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData, message: text })
            });
            if (response.ok) {
                chatEls.input.value = '';
                loadChatHistory(false);
            }
        } catch (e) { tg.showAlert("خطا در ارسال"); }
        finally { isSending = false; }
    }

    function renderMessage(msg) {
        const isUser = msg.sender === 'user';
        const html = `
            <div class="message-wrapper ${isUser ? 'msg-user' : 'msg-admin'}">
                <div class="bubble">${msg.type === 'photo' ? `<img src="${msg.file_url}" style="width:100%; border-radius:10px;">` : msg.text}</div>
                <div class="msg-meta">${msg.timestamp}</div>
            </div>`;
        chatEls.container.insertAdjacentHTML('beforeend', html);
    }

    function scrollToBottom() { if (chatEls.container) chatEls.container.scrollTop = chatEls.container.scrollHeight; }
})();