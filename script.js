/* webapp/script.js (v95.0 - Final Fix: BFCache & Navigation) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // تنظیم زمان اسپلش اسکرین
    let MIN_SPLASH_TIME = 3500; 

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    
    const isDashboard = !!document.getElementById('toman-balance');
    const isSupportPage = !!document.getElementById('messages-container');

    let chatPollInterval = null;
    let lastMessageCount = 0;
    let isSending = false;

    // المنت‌های اصلی داشبورد
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

    // المنت‌های صفحه چت
    const chatEls = {
        container: document.getElementById('messages-container'),
        input: document.getElementById('message-input'),
        sendBtn: document.getElementById('send-btn'),
        optionsBtn: document.getElementById('chat-options-btn'),
        fileInput: document.getElementById('file-input'),
        attachBtn: document.getElementById('attach-btn')
    };

    // ==========================================
    // 1. GLOBAL FIX: BFCache Handler (The Magic Fix)
    // ==========================================
    // این رویداد همیشه اجرا می‌شود، حتی اگر دکمه برگشت زده شود و صفحه از کش بیاید
    window.addEventListener('pageshow', function(event) {
        // اگر صفحه از کش لود شده باشد (Back زدن کاربر)
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            console.log("Restored from cache - Forcing loader hide");
            forceHideLoader();
            // بازگرداندن اسکرول به حالت طبیعی
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
            
            // تنظیمات ظاهری تلگرام
            if (isDashboard) {
                tg.setHeaderColor('#000000'); 
                tg.setBackgroundColor('#000000');
                tg.BackButton.hide(); // مخفی کردن دکمه بک در خانه
            } else {
                tg.setHeaderColor('#1a1a1a');
                tg.setBackgroundColor('#000000');
                // نمایش دکمه بک و مدیریت بازگشت
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

            // --- منطق لودینگ داشبورد ---
            if (isDashboard) {
                if (hasSeenSplash) {
                    // *** بازگشت مجدد به داشبورد (سریع) ***
                    loadFromCache();
                    forceHideLoader(); // حذف فوری لودر
                    
                    setTimeout(() => {
                        init3DCardEffect();
                        initHapticFeedback();
                    }, 50);

                    // آپدیت دیتا در پس‌زمینه
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
                    // *** ورود اول (با انیمیشن) ***
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
                        // اگر دیتا فچ نشد، باز هم باز شود
                        forceHideLoader();
                    }
                }
                
                // تثبیت رنگ هدر نهایی
                tg.setHeaderColor('#050505');
                tg.setBackgroundColor('#050505');

            } else if (isSupportPage) {
                // --- منطق صفحه پشتیبانی ---
                forceHideLoader(); // در صفحات داخلی لودر نیاز نیست
                setupChatListeners();
                await loadChatHistory(true); 
                startChatPolling();
                initHapticFeedback();
            } else {
                // --- سایر صفحات ---
                forceHideLoader();
                tg.BackButton.show();
                tg.BackButton.onClick(() => window.location.href = 'dashboard.html');
            }

        } catch (error) {
            console.error("Critical Init Error:", error);
            forceHideLoader(); // fail-safe
        }
    };

    // ==========================================
    // Caching Logic
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

    // ==========================================
    // Loader Functions (Optimized)
    // ==========================================
    function forceHideLoader() {
        document.body.classList.remove('loading-active'); // حذف کلاس از بادی
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

    // ==========================================
    // Data Fetching
    // ==========================================
    async function fetchDashboardData() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            if (!response.ok) throw new Error("Server Error");
            const data = await response.json();
            if(data.status === 'success') saveToCache(data);
            return data;
        } catch (error) { return null; }
    }

    async function fetchMarketRates() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/market/rates`);
            if (!response.ok) return null;
            return await response.json();
        } catch (e) { return null; }
    }

    // ==========================================
    // UI Updaters
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
        const loopRates = [...rates, ...rates, ...rates]; 
        loopRates.forEach(rate => {
            const changeClass = rate.change >= 0 ? 'up' : 'down';
            const arrow = rate.change > 0 ? '▲' : (rate.change < 0 ? '▼' : '');
            const colorClass = rate.change === 0 ? '' : changeClass;
            html += `<div class="ticker-item">${rate.symbol} <span class="${colorClass}">${rate.price} ${arrow} <small>(${rate.change}%)</small></span></div>`;
        });
        els.ticker.innerHTML = html;
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
        let strokeColor = '#FFD700'; let fillUrl = 'url(#gradNeutral)';
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
    // Effects & Interactions
    // ==========================================
    function init3DCardEffect() {
        const card = document.querySelector('.premium-card');
        const container = document.querySelector('.main-content');
        if (!card) return;
        if (container) {
            container.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const cardCenterX = rect.left + rect.width / 2;
                const cardCenterY = rect.top + rect.height / 2;
                const mouseX = e.clientX - cardCenterX;
                const mouseY = e.clientY - cardCenterY;
                const rotateX = (mouseY / rect.height) * -15;
                const rotateY = (mouseX / rect.width) * 15;
                card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            });
            container.addEventListener('mouseleave', () => { card.style.transform = `rotateX(0deg) rotateY(0deg)`; });
        }
        if (window.DeviceOrientationEvent) {
            window.addEventListener("deviceorientation", (event) => {
                if (!event.gamma && !event.beta) return;
                let rotateY = event.gamma; let rotateX = event.beta;  
                if (rotateY > 20) rotateY = 20; if (rotateY < -20) rotateY = -20;
                if (rotateX > 40) rotateX = 40; if (rotateX < -40) rotateX = -40;
                rotateX = rotateX - 30; 
                card.style.transform = `rotateX(${-rotateX}deg) rotateY(${rotateY}deg)`;
            });
        }
    }

    function initHapticFeedback() {
        const interactives = document.querySelectorAll('.ripple-btn, .glass-btn, .service-card, .game-banner, .action-icon-btn, .attach-btn, .send-btn');
        interactives.forEach(el => {
            el.addEventListener('touchstart', () => { tg.HapticFeedback.impactOccurred('light'); }, {passive: true});
            el.addEventListener('click', () => { if(tg.platform !== 'tdesktop' && tg.platform !== 'macos') { tg.HapticFeedback.impactOccurred('light'); } });
        });
    }

    function updateKycBadge(status) {
        if (!els.kycText) return;
        let text = "Guest", color = "#848E9C", bg = "rgba(255,255,255,0.05)", border = "rgba(255,255,255,0.1)";
        if (status === 'verified') { text = "Verified ✅"; color = "#0ECB81"; bg = "rgba(14, 203, 129, 0.1)"; border = "rgba(14, 203, 129, 0.3)"; }
        else if (status === 'pending') { text = "Pending ⏳"; color = "#F0B90B"; bg = "rgba(240, 185, 11, 0.1)"; border = "rgba(240, 185, 11, 0.3)"; }
        else if (status === 'rejected') { text = "Action Req ❌"; color = "#F6465D"; bg = "rgba(246, 70, 93, 0.1)"; border = "rgba(246, 70, 93, 0.3)"; }
        els.kycText.innerText = text; els.kycText.style.color = color; els.kycText.style.background = bg; els.kycText.style.borderColor = border;
    }

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

    // ==========================================
    // Chat Functions
    // ==========================================
    function startChatPolling() {
        if (chatPollInterval) clearInterval(chatPollInterval);
        chatPollInterval = setInterval(() => loadChatHistory(false), 3000);
    }
    
    async function loadChatHistory(isFirstLoad = false) {
        if (!chatEls.container) return;
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/support/get_history`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            if (response.ok) {
                const data = await response.json();
                if (isFirstLoad) {
                    chatEls.container.innerHTML = '<div class="date-separator">گفتگوی امن</div>';
                    lastMessageCount = 0;
                }
                const messages = data.messages || [];
                if (messages.length > lastMessageCount) {
                    const newMessages = messages.slice(lastMessageCount);
                    newMessages.forEach(msg => renderMessage(msg));
                    lastMessageCount = messages.length;
                    scrollToBottom();
                } else if (messages.length === 0 && isFirstLoad) {
                    renderSystemMessage("هنوز پیامی ندارید. اولین پیام را ارسال کنید.");
                }
            }
        } catch (e) {
            if (isFirstLoad) renderSystemMessage("خطا در بارگذاری تاریخچه.");
        }
    }

    function setupChatListeners() {
        if (!chatEls.sendBtn || !chatEls.input) return;
        const newSendBtn = chatEls.sendBtn.cloneNode(true);
        chatEls.sendBtn.parentNode.replaceChild(newSendBtn, chatEls.sendBtn);
        chatEls.sendBtn = newSendBtn;
        chatEls.sendBtn.addEventListener('click', sendMessage);
        chatEls.input.addEventListener('keypress', function (e) { if (e.key === 'Enter') sendMessage(); });
        if (chatEls.attachBtn && chatEls.fileInput) {
            chatEls.attachBtn.addEventListener('click', () => { chatEls.fileInput.click(); });
            chatEls.fileInput.addEventListener('change', handleFileUpload);
        }
        if (chatEls.optionsBtn) {
            chatEls.optionsBtn.addEventListener('click', () => {
                tg.showPopup({ title: 'پشتیبانی', message: 'آیا می‌خواهید تیکت را ببندید؟', buttons: [{id: 'close', type: 'destructive', text: 'بله'}, {type: 'cancel'}] }, (btnId) => { if (btnId === 'close') tg.close(); });
            });
        }
    }

    async function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { tg.showAlert("حجم فایل نباید بیشتر از ۵ مگابایت باشد."); chatEls.fileInput.value = ''; return; }
        renderMessage({ sender: 'user', text: '📷 در حال آپلود تصویر...', is_me: true, type: 'text' });
        scrollToBottom();
        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('file', file);
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/support/upload_file`, { method: 'POST', body: formData });
            const result = await response.json();
            if (response.ok && result.status === 'success') { chatEls.fileInput.value = ''; await loadChatHistory(false); } 
            else { tg.showAlert("خطا در آپلود: " + (result.message || "نامشخص")); chatEls.fileInput.value = ''; }
        } catch (e) { tg.showAlert("عدم اتصال به سرور."); chatEls.fileInput.value = ''; }
    }

    async function sendMessage() {
        if (isSending) return;
        const text = chatEls.input.value.trim();
        if (!text) return;
        isSending = true;
        chatEls.sendBtn.style.opacity = '0.5';
        renderMessage({ sender: 'user', text: text, timestamp: '...', is_me: true });
        lastMessageCount++;
        chatEls.input.value = '';
        scrollToBottom();
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/support/send_message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData, message: text, type: 'text' })
            });
            const result = await response.json();
            if (!response.ok || result.status !== 'success') throw new Error(result.message || "خطا");
            await loadChatHistory(false);
        } catch (e) {
            tg.showAlert("خطا در ارسال پیام.");
            chatEls.input.value = text;
            lastMessageCount--;
            const bubbles = document.querySelectorAll('.message-wrapper');
            if(bubbles.length > 0) bubbles[bubbles.length - 1].remove();
        } finally {
            isSending = false;
            chatEls.sendBtn.style.opacity = '1';
            chatEls.input.focus();
        }
    }

    function renderMessage(msg) {
        const isUser = msg.sender === 'user' || msg.is_me; 
        const wrapperClass = isUser ? 'msg-user' : 'msg-admin';
        const checkIcon = isUser ? '<i class="fas fa-check msg-status-icon"></i>' : '';
        let contentHtml = '';
        if (msg.type === 'photo' && msg.file_url) { contentHtml = `<img src="${msg.file_url}" style="max-width: 100%; border-radius: 12px; margin-bottom: 5px; display: block;" alt="Photo">`; if (msg.text) contentHtml += `<span>${escapeHtml(msg.text)}</span>`; } 
        else { contentHtml = escapeHtml(msg.text); }
        const html = `<div class="message-wrapper ${wrapperClass}"><div class="bubble">${contentHtml}</div><div class="msg-meta"><span>${msg.timestamp || ''}</span>${checkIcon}</div></div>`;
        chatEls.container.insertAdjacentHTML('beforeend', html);
    }

    function renderSystemMessage(text) {
        const html = `<div style="text-align:center; font-size:0.75rem; color:#666; margin:15px 0; background:rgba(255,255,255,0.05); padding:5px; border-radius:10px; display:inline-block; margin-left:auto; margin-right:auto;">${text}</div>`;
        const wrapper = document.createElement('div');
        wrapper.style.textAlign = 'center';
        wrapper.innerHTML = html;
        chatEls.container.appendChild(wrapper);
    }

    function scrollToBottom() { if (chatEls.container) chatEls.container.scrollTop = chatEls.container.scrollHeight; }
    function escapeHtml(text) { if (!text) return ""; return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    function showError(msg) { if (loader) { loader.style.opacity = '1'; loader.style.display = 'flex'; loader.innerHTML = `<div class="loader-content"><p style="color:#F6465D;">${msg}</p><button onclick="window.location.reload()">تلاش مجدد</button></div>`; } }
})();