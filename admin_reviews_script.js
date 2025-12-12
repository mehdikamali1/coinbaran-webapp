/* webapp/admin_reviews_script.js (v1.0 - Review Queue Manager) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;

    // متغیرهای وضعیت سراسری
    let currentTab = 'kyc_lite'; // 'kyc_lite', 'kyc_full', 'deposit', 'withdrawal'
    let currentQueueData = []; // داده‌های خام لیست فعلی
    let selectedRequest = null; // داده‌های درخواست در حال نمایش در مودال

    // المان‌های DOM
    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    const els = {
        tabs: document.getElementById('review-tabs'),
        listContainer: document.getElementById('review-list-container'),
        queueCount: document.getElementById('queue-count'),
        emptyMessage: document.getElementById('empty-queue-message'),
        modalBackdrop: document.getElementById('review-modal'),
        btnCloseModal: document.getElementById('btn-close-modal'),
        btnApprove: document.getElementById('btn-approve-review'),
        btnReject: document.getElementById('btn-reject-review'),
        detailUserName: document.getElementById('detail-user-name'),
        detailAmountLevel: document.getElementById('detail-amount-level'),
        detailTimestamp: document.getElementById('detail-timestamp'),
        filesSection: document.getElementById('files-section'),
        adminNotes: document.getElementById('admin-notes'),
        modalTitle: document.getElementById('modal-title')
    };

    // --- 1. Main Initialization & Event Setup ---
    window.onload = async function() {
        try {
            tg.ready();
            tg.expand();
            tg.setHeaderColor('#050505');
            tg.setBackgroundColor('#050505');

            // در حالت توسعه، اگر initData نبود، از ادمین تست استفاده کن
            if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE&user=%7B%22id%22%3A161180613%7D&hash=fake&ADMIN";

            setupEventListeners();
            
            // چک کردن query parameter برای تعیین تب پیش‌فرض (مثلاً /admin/reviews?type=deposit)
            const urlParams = new URLSearchParams(window.location.search);
            const initialTab = urlParams.get('type') || 'kyc_lite';
            switchTab(initialTab); 
            
            hideLoader();

        } catch (error) {
            console.error("Admin Reviews Init Error:", error);
            showError("خطای حیاتی: پنل بررسی بارگذاری نشد.");
            hideLoader();
        }
    };

    function setupEventListeners() {
        // مدیریت کلیک روی تب‌ها
        els.tabs.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
        });

        // مدیریت کلیک روی آیتم‌های لیست (باز کردن مودال)
        els.listContainer.addEventListener('click', handleListItemClick);

        // مدیریت دکمه‌های مودال
        els.btnCloseModal.addEventListener('click', closeModal);
        els.btnApprove.addEventListener('click', () => handleAction('approve'));
        els.btnReject.addEventListener('click', () => handleAction('reject'));
    }

    // --- 2. Tab Switching Logic ---
    function switchTab(tabKey) {
        currentTab = tabKey;
        
        // آپدیت ظاهر تب‌ها
        els.tabs.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabKey);
        });

        // بارگذاری داده‌های جدید
        fetchReviewQueue();
        tg.HapticFeedback.selectionChanged();
    }

    // --- 3. Data Fetching ---
    async function fetchReviewQueue() {
        // آدرس API بر اساس تب فعلی
        const endpoint = `/admin/reviews/${currentTab}/pending`; 
        
        els.listContainer.innerHTML = `<p class="text-muted" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> در حال بارگذاری صف ${currentTab}...</p>`;
        els.queueCount.innerText = '...';

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });

            if (response.status === 403) throw new Error("Admin Access Required");

            const data = await response.json();

            if (data.status === 'success') {
                currentQueueData = data.requests;
                renderReviewList(currentQueueData);
            } else {
                showError("خطا در دریافت لیست: " + (data.message || "پاسخ نامعتبر"));
            }

        } catch (error) {
            console.error(`Fetch ${currentTab} Error:`, error);
            els.listContainer.innerHTML = `<p class="text-muted" style="text-align: center; padding: 20px; color: var(--accent-red);">❌ خطا در اتصال به سرور بررسی‌ها.</p>`;
            els.queueCount.innerText = 'خطا';
        }
    }

    // --- 4. List Rendering ---
    function renderReviewList(requests) {
        els.listContainer.innerHTML = '';
        els.queueCount.innerText = requests.length;

        if (requests.length === 0) {
            els.emptyMessage.style.display = 'block';
            els.listContainer.appendChild(els.emptyMessage);
            return;
        } else {
            els.emptyMessage.style.display = 'none';
        }

        requests.forEach((req, index) => {
            const item = document.createElement('div');
            item.className = 'review-list-item ripple-btn';
            item.setAttribute('data-index', index);
            item.setAttribute('data-id', getRequestId(req));

            // تعیین عنوان و جزئیات بر اساس نوع درخواست
            let title, subtitle;
            if (currentTab.startsWith('kyc')) {
                title = `${req.submitted_full_name || 'KYC User'} (ID: ${req.user_id})`;
                subtitle = `سطح: ${currentTab === 'kyc_lite' ? 'L2 ویدیویی' : 'L3 کامل'}`;
            } else if (currentTab === 'deposit' || currentTab === 'withdrawal') {
                const amount = req.requested_amount_toman || req.amount_toman;
                const type = currentTab === 'deposit' ? 'واریز' : 'برداشت';
                title = `${type} مبلغ ${amount.toLocaleString()} تومان`;
                subtitle = `کاربر: ${req.user_id} | تاریخ: ${new Date(req.request_timestamp).toLocaleDateString('fa-IR')}`;
            } else {
                title = `سفارش ID: ${getRequestId(req)}`;
                subtitle = `وضعیت: ${req.status}`;
            }

            item.innerHTML = `
                <div class="review-info">
                    <h4>${title}</h4>
                    <span>${subtitle}</span>
                </div>
                <div class="status-badge status-pending">بررسی</div>
            `;
            els.listContainer.appendChild(item);
        });
    }

    // --- 5. Modal Management ---
    function handleListItemClick(e) {
        const item = e.target.closest('.review-list-item');
        if (!item) return;

        const index = parseInt(item.getAttribute('data-index'));
        selectedRequest = currentQueueData[index];

        if (!selectedRequest) return;

        // پر کردن مودال
        populateModal();
        
        // نمایش مودال
        els.modalBackdrop.classList.add('active');
        tg.HapticFeedback.notificationOccurred('success');
    }

    function populateModal() {
        // عنوان مودال
        els.modalTitle.innerHTML = `جزئیات ${getReviewTitle(currentTab)} (ID: <code>${getRequestId(selectedRequest)}</code>)`;
        
        // پاک کردن محتویات قدیمی
        els.filesSection.innerHTML = '';
        els.adminNotes.value = '';

        // پر کردن جزئیات عمومی
        const req = selectedRequest;
        const formattedDate = new Date(req.request_timestamp || req.timestamp).toLocaleString('fa-IR');
        
        els.detailUserName.innerHTML = `<code>${req.user_id}</code> (${req.submitted_full_name || req.user_first_name || 'N/A'})`;
        els.detailTimestamp.innerText = formattedDate;

        if (currentTab.startsWith('kyc')) {
            els.detailAmountLevel.innerText = `L${currentTab === 'kyc_lite' ? '2 (ویدیویی)' : '3 (کامل)'}`;
            displayKycFiles(req);
        } else if (currentTab === 'deposit') {
            els.detailAmountLevel.innerHTML = `${req.requested_amount_toman.toLocaleString()} T`;
            displayDepositFiles(req);
        } else if (currentTab === 'withdrawal') {
             els.detailAmountLevel.innerHTML = `${req.amount_toman.toLocaleString()} T (خالص)`;
             displayWithdrawalDetails(req);
        }
    }

    // --- 6. File Display Logic (Linking to /uploads) ---
    function createLink(fileName, label, fileType = 'image') {
        const url = `${API_BASE_URL}/uploads/${fileName}`;
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.className = 'file-link-container';
        
        let icon = `<i class="fas fa-file-image"></i>`;
        if (fileType === 'video') icon = `<i class="fas fa-video"></i>`;
        
        link.innerHTML = `${icon} ${label} (کلیک برای مشاهده)`;
        els.filesSection.appendChild(link);
    }
    
    function displayKycFiles(req) {
        els.modalTitle.style.borderBottomColor = 'var(--accent-blue)';
        if (currentTab === 'kyc_lite') {
            // KYC L2: ویدیو و کارت بانکی
            createLink(req.video_selfie_file_id, 'ویدیوی سلفی', 'video');
            createLink(req.bank_card_file_id, 'عکس کارت بانکی');
        } else if (currentTab === 'kyc_full') {
            // KYC L3: چند فایل تصویر
            createLink(req.id_front_file_id, 'روی کارت ملی');
            createLink(req.id_back_file_id, 'پشت کارت ملی');
            createLink(req.selfie_file_id, 'سلفی با مدارک');
        }
    }
    
    function displayDepositFiles(req) {
        els.modalTitle.style.borderBottomColor = 'var(--accent-green)';
        if (req.receipt_file_id) {
            createLink(req.receipt_file_id, 'تصویر فیش واریزی');
        }
    }

    function displayWithdrawalDetails(req) {
        els.modalTitle.style.borderBottomColor = 'var(--accent-red)';
        const info = req.destination_bank_info || 'اطلاعات مقصد نامشخص';
        els.filesSection.innerHTML = `<div class="detail-row"><span>مقصد:</span> <code>${info}</code></div>`;
    }

    function closeModal() {
        selectedRequest = null;
        els.modalBackdrop.classList.remove('active');
    }


    // --- 7. Action Handling (API Calls) ---
    async function handleAction(actionType) {
        if (!selectedRequest) return;
        
        // اگر رد درخواست بود و دلیل تایپ نشده بود، اجازه نده
        const notes = els.adminNotes.value.trim();
        if (actionType === 'reject' && !notes) {
            tg.showAlert("لطفاً دلیل رد درخواست را در باکس یادداشت ادمین وارد کنید.");
            return;
        }

        const endpoint = `/admin/reviews/${currentTab}/${actionType}`;
        const data = {
            initData: tg.initData,
            request_id: getRequestId(selectedRequest),
            user_id: selectedRequest.user_id, // برای KYC و مالی لازم است
            admin_notes: notes
            // برای Withdrawal/USDT/BTC Approval نیاز به TXID و Screenshot داریم که فعلاً در این UI نیستند.
            // در پیاده‌سازی نهایی باید مودال را تکمیل کنیم.
        };

        els.btnApprove.disabled = els.btnReject.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.status === 'success') {
                tg.showAlert(`✅ درخواست ${getRequestId(selectedRequest)} با موفقیت ${actionType === 'approve' ? 'تأیید' : 'رد'} شد.`);
                closeModal();
                fetchReviewQueue(); // رفرش لیست
            } else {
                tg.showAlert(`❌ خطا: ${result.message || "عملیات ناموفق بود."}`);
            }

        } catch (error) {
            console.error(`Action ${actionType} Error:`, error);
            tg.showAlert("❌ خطای ارتباط با سرور هنگام ارسال اقدام.");
        } finally {
            els.btnApprove.disabled = els.btnReject.disabled = false;
        }
    }


    // --- Helper Functions ---
    
    function getRequestId(req) {
        if (currentTab === 'kyc_lite') return req.lite_request_id;
        if (currentTab === 'kyc_full') return req.request_id;
        if (currentTab === 'deposit') return req.deposit_id;
        if (currentTab === 'withdrawal') return req.withdrawal_id;
        // ... اضافه کردن سایر انواع (USDT, BTC, Utopia) در صورت نیاز
        return req.id || 'N/A';
    }

    function getReviewTitle(tabKey) {
        const titles = {
            'kyc_lite': 'احراز هویت ویدیویی (L2)',
            'kyc_full': 'احراز هویت کامل (L3)',
            'deposit': 'واریز دستی',
            'withdrawal': 'برداشت وجه'
        };
        return titles[tabKey] || 'درخواست';
    }

    function hideLoader() {
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
                if (appContainer) {
                    appContainer.classList.remove('hidden-content');
                    appContainer.classList.add('fade-in-active');
                }
            }, 500); 
        }
    }

    function showError(msg) {
        // (همان منطق نمایش خطا در لودر)
    }

})();