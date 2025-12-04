/* webapp/script.js (v89.0 - Auto-Sync & Robust Chat) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // حداقل زمان نمایش لودینگ فقط برای داشبورد
    const MIN_SPLASH_TIME = 9000; 

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    
    // تشخیص اینکه در کدام صفحه هستیم
    const isDashboard = !!document.getElementById('toman-balance');
    const isSupportPage = !!document.getElementById('messages-container');

    // متغیرهای چت
    let chatPollInterval = null;
    let lastMessageCount = 0;
    let isSending = false;

    // عناصر صفحه داشبورد
    const els = {
        welcomeName: document.getElementById('welcome-name'),
        tomanBalance: document.getElementById('toman-balance'),
        uusdBalance: document.getElementById('uusd-balance'),
        xpBalance: document.getElementById('xp-balance'),
        kycText: document.getElementById('kyc-text'),
        avatar: document.querySelector('.avatar-img'),
        supportNotif: document.getElementById('support-notif')
    };

    // عناصر صفحه پشتیبانی
    const chatEls = {
        container: document.getElementById('messages-container'),
        input: document.getElementById('message-input'),
        sendBtn: document.getElementById('send-btn'),
        optionsBtn: document.getElementById('chat-options-btn')
    };

    window.onload = async function() {
        try {
            tg.ready();
            tg.expand();
            
            tg.setHeaderColor('#000000'); 
            tg.setBackgroundColor('#000000');

            if (!tg.initData) {
                console.warn("Using Test Data");
                tg.initData = "query_id=TEST_DEV_MODE"; 
            }

            // --- سناریوی ۱: صفحه داشبورد ---
            if (isDashboard) {
                const splashTimer = new Promise(resolve => setTimeout(resolve, MIN_SPLASH_TIME));
                const dataFetch = fetchDashboardData();
                const [dataResult] = await Promise.all([dataFetch, splashTimer]);

                if (dataResult) {
                    updateDashboardUI(dataResult);
                    checkUnreadSupportMessages(); 
                    hideLoader();
                    tg.setHeaderColor('#050505');
                    tg.setBackgroundColor('#050505');
                }
            }
            
            // --- سناریوی ۲: صفحه پشتیبانی ---
            else if (isSupportPage) {
                tg.setHeaderColor('#1a1a1a');
                
                setupChatListeners();
                
                // اولین دریافت پیام‌ها
                await loadChatHistory(true); 
                
                // شروع رفرش خودکار (هر 3 ثانیه)
                startChatPolling();
                
                hideLoader();
            }

        } catch (error) {
            console.error("Critical Init Error:", error);
            showError("خطا در راه‌اندازی برنامه.");
        }
    };

    // ==========================================
    // بخش توابع داشبورد
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
            if (data.status === 'error') return null;
            return data;
        } catch (error) {
            return null;
        }
    }

    function updateDashboardUI(data) {
        if (els.welcomeName) els.welcomeName.innerText = data.first_name || "کاربر گرامی";
        if (els.tomanBalance) els.tomanBalance.innerText = data.toman_balance; 
        if (els.uusdBalance) els.uusdBalance.innerHTML = `${data.uusd_balance} <small>دلار</small>`;
        if (els.xpBalance) els.xpBalance.innerHTML = `${data.xp_balance} <small>XP</small>`;
        if (tg.initDataUnsafe?.user?.photo_url && els.avatar) els.avatar.src = tg.initDataUnsafe.user.photo_url;
        updateKycBadge(data.kyc_status_code);
    }

    function updateKycBadge(status) {
        if (!els.kycText) return;
        let text = "سطح برنزی", color = "#848E9C", bg = "rgba(255,255,255,0.05)", border = "rgba(255,255,255,0.1)";
        if (status === 'verified') { text = "کاربر تایید شده ✅"; color = "#0ECB81"; bg = "rgba(14, 203, 129, 0.1)"; border = "rgba(14, 203, 129, 0.3)"; }
        else if (status === 'pending') { text = "در حال بررسی ⏳"; color = "#F0B90B"; bg = "rgba(240, 185, 11, 0.1)"; border = "rgba(240, 185, 11, 0.3)"; }
        else if (status === 'rejected') { text = "نیاز به اصلاح ❌"; color = "#F6465D"; bg = "rgba(246, 70, 93, 0.1)"; border = "rgba(246, 70, 93, 0.3)"; }
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
    // بخش توابع چت پشتیبانی (Logic اصلی تیکتینگ)
    // ==========================================
    
    function startChatPolling() {
        if (chatPollInterval) clearInterval(chatPollInterval);
        // هر 3 ثانیه پیام‌های جدید را چک کن
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
                
                // اگر اولین بار است، تاریخچه را خالی کن
                if (isFirstLoad) {
                    chatEls.container.innerHTML = '<div class="date-separator">گفتگوی امن</div>';
                    lastMessageCount = 0;
                }

                const messages = data.messages || [];
                
                // فقط اگر پیام جدیدی اضافه شده بود، رندر کن
                if (messages.length > lastMessageCount) {
                    // فقط پیام‌های جدید را بگیر
                    const newMessages = messages.slice(lastMessageCount);
                    newMessages.forEach(msg => renderMessage(msg));
                    
                    lastMessageCount = messages.length;
                    scrollToBottom();
                } else if (messages.length === 0 && isFirstLoad) {
                    renderSystemMessage("هنوز پیامی ندارید. اولین پیام را ارسال کنید.");
                }
            }
        } catch (e) {
            console.error("Polling error:", e);
            if (isFirstLoad) renderSystemMessage("خطا در بارگذاری تاریخچه.");
        }
    }

    function setupChatListeners() {
        if (!chatEls.sendBtn || !chatEls.input) return;

        // کلون کردن دکمه برای حذف ایونت‌های قبلی
        const newSendBtn = chatEls.sendBtn.cloneNode(true);
        chatEls.sendBtn.parentNode.replaceChild(newSendBtn, chatEls.sendBtn);
        chatEls.sendBtn = newSendBtn;

        chatEls.sendBtn.addEventListener('click', sendMessage);

        chatEls.input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') sendMessage();
        });

        if (chatEls.optionsBtn) {
            chatEls.optionsBtn.addEventListener('click', () => {
                tg.showPopup({
                    title: 'پشتیبانی',
                    message: 'آیا می‌خواهید تیکت را ببندید؟',
                    buttons: [{id: 'close', type: 'destructive', text: 'بله'}, {type: 'cancel'}]
                }, (btnId) => {
                    if (btnId === 'close') tg.close();
                });
            });
        }
    }

    async function sendMessage() {
        if (isSending) return; // جلوگیری از ارسال رگباری

        const text = chatEls.input.value.trim();
        if (!text) return;

        isSending = true;
        chatEls.sendBtn.style.opacity = '0.5'; // گرافیک دکمه غیرفعال

        // 1. نمایش آنی (Optimistic UI)
        // ما پیام را دستی اضافه میکنیم و کانتر را یکی بالا میبریم تا در پولینگ بعدی تکراری نیاید
        renderMessage({
            sender: 'user',
            text: text,
            timestamp: '...', // تایم سرور بعدا میاد
            is_me: true
        });
        lastMessageCount++; // افزایش دستی کانتر
        
        chatEls.input.value = '';
        scrollToBottom();

        try {
            const response = await fetch(`${API_BASE_URL}/webapp/support/send_message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    initData: tg.initData,
                    message: text,
                    type: 'text'
                })
            });

            const result = await response.json();
            
            if (!response.ok || result.status !== 'success') {
                throw new Error(result.message || "خطا");
            }
            
            // موفقیت: فورس رفرش برای گرفتن ساعت دقیق و وضعیت
            await loadChatHistory(false);

        } catch (e) {
            tg.showAlert("خطا در ارسال پیام. اینترنت خود را چک کنید.");
            chatEls.input.value = text; // برگرداندن متن به اینپوت
            lastMessageCount--; // کاهش کانتر چون پیام نرفت
            // حذف حباب پیام (آخرین پیام)
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

        const html = `
            <div class="message-wrapper ${wrapperClass}">
                <div class="bubble">
                    ${escapeHtml(msg.text)}
                </div>
                <div class="msg-meta">
                    <span>${msg.timestamp || ''}</span>
                    ${checkIcon}
                </div>
            </div>
        `;
        chatEls.container.insertAdjacentHTML('beforeend', html);
    }

    function renderSystemMessage(text) {
        const html = `<div style="text-align:center; font-size:0.75rem; color:#666; margin:15px 0; background:rgba(255,255,255,0.05); padding:5px; border-radius:10px; display:inline-block; margin-left:auto; margin-right:auto;">${text}</div>`;
        const wrapper = document.createElement('div');
        wrapper.style.textAlign = 'center';
        wrapper.innerHTML = html;
        chatEls.container.appendChild(wrapper);
    }

    function scrollToBottom() {
        if (chatEls.container) chatEls.container.scrollTop = chatEls.container.scrollHeight;
    }

    function escapeHtml(text) {
        if (!text) return "";
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function hideLoader() {
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

    function showError(msg) {
        if (loader) {
            loader.style.opacity = '1'; loader.style.display = 'flex';
            loader.innerHTML = `<div class="loader-content"><p style="color:#F6465D;">${msg}</p><button onclick="window.location.reload()">تلاش مجدد</button></div>`;
        }
    }
})();