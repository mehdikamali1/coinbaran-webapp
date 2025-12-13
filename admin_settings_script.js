/* webapp/admin_settings_script.js (v1.0 - System Settings Manager Logic) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;

    // --- وضعیت سراسری ---
    let currentSettings = {};

    // المان‌های DOM
    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    const els = {
        tabs: document.getElementById('settings-tabs'),
        contentContainer: document.getElementById('settings-content'),
        btnSave: document.getElementById('btn-save-settings'),
        maintenanceStatusLabel: document.getElementById('maintenance-status-label'),
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
            await fetchAndRenderSettings();
            
            hideLoader();

        } catch (error) {
            console.error("Admin Settings Init Error:", error);
            showError("خطای حیاتی: پنل تنظیمات بارگذاری نشد.");
            hideLoader();
        }
    };

    function setupEventListeners() {
        // مدیریت کلیک روی تب‌ها
        els.tabs.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
        });
        
        // مدیریت کلیک دکمه ذخیره
        els.btnSave.addEventListener('click', handleSaveSettings);
        
        // مدیریت کلیک دکمه اعمال قیمت پیشنهادی
        document.getElementById('btn-apply-utopia-suggestion').addEventListener('click', handleApplySuggestion);

        // مدیریت تغییر وضعیت دکمه Maintenance
        const maintenanceToggle = document.getElementById('maintenance_mode_enabled');
        maintenanceToggle.addEventListener('change', updateMaintenanceLabel);
    }
    
    // --- 2. Tab Switching Logic ---
    function switchTab(tabKey) {
        // آپدیت ظاهر تب‌ها
        els.tabs.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabKey);
        });

        // نمایش محتوای تب صحیح
        els.contentContainer.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('hidden', content.id !== `tab-${tabKey}`);
            content.classList.toggle('active', content.id === `tab-${tabKey}`);
        });

        tg.HapticFeedback.selectionChanged();
    }
    
    // --- 3. Fetching Data & Rendering ---
    
    async function fetchAndRenderSettings() {
        try {
            const response = await fetch(`${API_BASE_URL}/admin/settings/get_all`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });

            if (response.status === 403) throw new Error("Admin Access Required");

            const data = await response.json();

            if (data.status === 'success') {
                currentSettings = data.settings || {};
                fillFormWithSettings(currentSettings);
            } else {
                tg.showAlert("خطا در دریافت تنظیمات: " + (data.message || "پاسخ نامعتبر"));
            }

        } catch (error) {
            console.error("Settings Fetch Error:", error);
            showError("❌ خطای اتصال به API تنظیمات.");
        }
    }

    function fillFormWithSettings(settings) {
        // پر کردن فیلدهای عددی و متنی
        for (const key in settings) {
            const el = document.getElementById(key);
            if (!el) continue;

            const value = settings[key];

            if (el.type === 'checkbox') {
                // چک باکس
                el.checked = String(value).toLowerCase() === 'true';
                if (key === 'maintenance_mode_enabled') {
                    updateMaintenanceLabel(el);
                }
            } else if (el.type === 'number' || el.type === 'text' || el.tagName === 'TEXTAREA') {
                // فیلد متنی و عددی
                el.value = value;
            }
        }
        
        // پر کردن فیلدهای ReadOnly (Wallet Tab)
        document.getElementById('asset_bank_balance').value = (settings.asset_bank_balance || 0).toLocaleString() + ' T';
        document.getElementById('asset_usdt_inventory').value = (settings.asset_usdt_inventory || 0).toLocaleString() + ' USDT';
    }

    function updateMaintenanceLabel(element) {
        const isChecked = element.target ? element.target.checked : element.checked;
        if (isChecked) {
            els.maintenanceStatusLabel.innerText = "وضعیت: فعال (ربات خاموش است)";
            els.maintenanceStatusLabel.style.color = 'var(--accent-red)';
        } else {
            els.maintenanceStatusLabel.innerText = "وضعیت: غیرفعال";
            els.maintenanceStatusLabel.style.color = 'var(--accent-green)';
        }
    }

    // --- 4. Saving Data ---

    function getSettingsFromForm() {
        const newSettings = {};
        const inputs = els.contentContainer.querySelectorAll('input, textarea');
        
        inputs.forEach(el => {
            if (el.id) {
                if (el.type === 'checkbox') {
                    newSettings[el.id] = el.checked ? 'True' : 'False';
                } else if (el.type === 'number') {
                    newSettings[el.id] = parseFloat(el.value);
                } else {
                    newSettings[el.id] = el.value;
                }
            }
        });
        // فیلدهای ReadOnly را حذف کنید
        delete newSettings.asset_bank_balance;
        delete newSettings.asset_usdt_inventory;

        return newSettings;
    }
    
    async function handleSaveSettings() {
        if (!confirm("آیا مطمئنید می‌خواهید تنظیمات را ذخیره کنید؟ (این تغییرات بلافاصله اعمال می‌شوند)")) return;

        const settingsToSave = getSettingsFromForm();
        els.btnSave.disabled = true;
        els.btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ذخیره...';

        try {
            const response = await fetch(`${API_BASE_URL}/admin/settings/save_all`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    initData: tg.initData, 
                    settings: settingsToSave
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                tg.showAlert("✅ تنظیمات با موفقیت ذخیره شد و در سیستم اعمال گردید.");
                currentSettings = data.new_settings;
                fillFormWithSettings(currentSettings); // رفرش UI
            } else {
                tg.showAlert(`❌ خطا در ذخیره تنظیمات: ${data.message || 'پاسخ نامعتبر.'}`);
            }

        } catch (error) {
            console.error("Save Settings Error:", error);
            tg.showAlert("❌ خطای شبکه در هنگام ذخیره تنظیمات.");
        } finally {
            els.btnSave.disabled = false;
            els.btnSave.innerHTML = '<i class="fas fa-save"></i> ذخیره تمام تنظیمات';
        }
    }
    
    // --- 5. Apply Suggestion Handler (Utopia Price) ---
    async function handleApplySuggestion() {
        els.btnSave.disabled = true;
        els.btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال محاسبه...';
        
        try {
            const response = await fetch(`${API_BASE_URL}/admin/settings/get_utopia_suggestion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });

            const data = await response.json();

            if (data.status === 'success' && data.suggestion) {
                document.getElementById('utopia_voucher_buy_price').value = data.suggestion.buy_price;
                document.getElementById('utopia_voucher_sell_price').value = data.suggestion.sell_price;
                tg.showAlert("✅ قیمت‌های پیشنهادی هوشمند برای یوتوپیا اعمال شد.");
            } else {
                tg.showAlert(`⚠️ خطا در محاسبه: ${data.message || 'قیمت پیشنهادی موجود نیست.'}`);
            }

        } catch (error) {
            console.error("Suggestion Error:", error);
            tg.showAlert("❌ خطای شبکه در هنگام دریافت پیشنهاد قیمت.");
        } finally {
            els.btnSave.disabled = false;
            els.btnSave.innerHTML = '<i class="fas fa-save"></i> ذخیره تمام تنظیمات';
        }
    }

    // --- Helper Functions ---
    
    function hideLoader() {
        // (همان منطق)
        const l = document.getElementById('loader');
        const a = document.getElementById('app-container');
        if (l) { l.style.opacity = '0'; setTimeout(() => { l.style.display = 'none'; a.classList.remove('hidden-content'); a.classList.add('fade-in-active'); }, 500); }
    }

    function showError(msg) {
        // (همان منطق)
        const l = document.getElementById('loader');
        if (l) {
            l.style.opacity = '1';
            l.style.display = 'flex';
            l.innerHTML = `<div class="loader-content" style="padding:20px; text-align:center;">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem; color:var(--accent-red); margin-bottom:15px;"></i>
                <p style="color:var(--accent-red); font-size:1rem;">${msg}</p>
                </div>`;
        }
    }

})();