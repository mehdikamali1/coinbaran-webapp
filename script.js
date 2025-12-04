/* webapp/script.js (v88.2 - Fixed Support Logic) */
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
                
                // لودینگ سریع‌تر برای چت
                await loadChatHistory();
                setupChatListeners();
                
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
    async function loadChatHistory() {
        if (!chatEls.container) return;
        
        // پاک کردن کامل کانتینر برای شروع تمیز
        chatEls.container.innerHTML = '<div class="date-separator">گفتگوی امن</div>';

        try {
            const response = await fetch(`${API_BASE_URL}/webapp/support/get_history`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.messages && data.messages.length > 0) {
                    data.messages.forEach(msg => renderMessage(msg));
                } else {
                    renderSystemMessage("هنوز پیامی ندارید. اولین پیام را ارسال کنید.");
                }
                scrollToBottom();
            }
        } catch (e) {
            renderSystemMessage("خطا در بارگذاری تاریخچه.");
        }
    }

    function setupChatListeners() {
        if (!chatEls.sendBtn || !chatEls.input) return;

        // حذف لیسنرهای قبلی (برای جلوگیری از تداخل)
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
        const text = chatEls.input.value.trim();
        if (!text) return;

        // غیرفعال کردن موقت دکمه تا زمان ارسال
        chatEls.sendBtn.disabled = true;

        // نمایش پیام در صفحه به صورت آنی
        renderMessage({
            sender: 'user',
            text: text,
            timestamp: '...',
            is_me: true
        });
        
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
            
            if (response.ok && result.status === 'success') {
                // موفقیت آمیز بود، لازم نیست کاری کنیم چون پیام نمایش داده شده
            } else {
                tg.showAlert("خطا در ارسال پیام: " + (result.message || "نامشخص"));
                chatEls.input.value = text; // برگرداندن متن در صورت خطا
            }
        } catch (e) {
            tg.showAlert("عدم اتصال به سرور");
            chatEls.input.value = text;
        } finally {
            chatEls.sendBtn.disabled = false;
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