(function () {
    const tg = window.Telegram.WebApp;
    
    // ------------------------------------------------------------------------
    // ⚠️ آدرس Cloudflare شما باید در اینجا صحیح باشد
    // ------------------------------------------------------------------------
    const API_BASE_URL = "https://overcome-bugs-commentary-broader.trycloudflare.com"; // <-- ❗️❗️❗️ مطمئن شوید این آدرس درست است

    // --- عناصر DOM ---
    const formContainer = document.getElementById('kyc-form-container');
    const loader = document.getElementById('loader');
    const form = document.getElementById('kyc-form');
    
    // --- لیست تمام فیلدهای ورودی (متنی و فایل) ---
    const inputs = {
        full_name: document.getElementById('full_name'),
        national_id: document.getElementById('national_id'),
        birth_date: document.getElementById('birth_date'),
        phone_number: document.getElementById('phone_number'),
        card_number: document.getElementById('card_number'),
        id_front_file: document.getElementById('id_front_file'),
        id_back_file: document.getElementById('id_back_file'),
        bank_card_file: document.getElementById('bank_card_file'),
        selfie_file: document.getElementById('selfie_file')
    };

    /**
     * بررسی می‌کند که آیا تمام فیلدهای فرم (متنی و فایل) پر شده‌اند یا خیر.
     */
    function validateForm() {
        // 1. بررسی فیلدهای متنی
        const textInputs = ['full_name', 'national_id', 'birth_date', 'phone_number', 'card_number'];
        for (const key of textInputs) {
            if (!inputs[key].value || inputs[key].value.trim() === '') {
                return false;
            }
        }
        
        // --- <<< شروع تغییر: اعتبارسنجی تاریخ انعطاف‌پذیر >>> ---
        // Regex for YYYY/MM/DD OR YYYY-MM-DD
        const birthDateRegex = /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/;
        if (!birthDateRegex.test(inputs.birth_date.value.trim())) {
            return false;
        }
        // --- <<< پایان تغییر >>> ---

        if (inputs.national_id.value.length !== 10 || !/^\d+$/.test(inputs.national_id.value)) return false;
        if (inputs.card_number.value.length !== 16 || !/^\d+$/.test(inputs.card_number.value)) return false;
        if (inputs.phone_number.value.length !== 11 || !inputs.phone_number.value.startsWith('09')) return false;

        // 3. بررسی انتخاب شدن تمام فایل‌ها
        const fileInputs = ['id_front_file', 'id_back_file', 'bank_card_file', 'selfie_file'];
        for (const key of fileInputs) {
            if (inputs[key].files.length === 0) {
                return false;
            }
        }
        
        return true; // همه فیلدها معتبر هستند
    }

    /**
     * وضعیت دکمه اصلی تلگرام را بر اساس اعتبار فرم، به‌روزرسانی می‌کند.
     */
    function updateMainButtonState() {
        if (validateForm()) {
            tg.MainButton.setText("✅ تایید و ارسال نهایی مدارک");
            tg.MainButton.enable();
            tg.MainButton.show();
        } else {
            tg.MainButton.setText("لطفاً تمام فیلدها را کامل کنید");
            tg.MainButton.disable();
            tg.MainButton.show();
        }
    }

    /**
     * اطلاعات فرم و فایل‌ها را به سرور (FastAPI) ارسال می‌کند.
     */
    async function submitKycData() {
        if (!validateForm()) {
            tg.showAlert("لطفاً تمام فیلدها را به درستی پر کنید (مخصوصاً فرمت تاریخ تولد YYYY/MM/DD).");
            return;
        }

        formContainer.classList.add('hidden');
        loader.classList.remove('hidden');
        tg.MainButton.showProgress();

        const formData = new FormData();
        formData.append("initData", tg.initData);
        
        // افزودن داده‌های متنی
        formData.append("full_name", inputs.full_name.value.trim());
        formData.append("national_id", inputs.national_id.value.trim());
        formData.append("birth_date", inputs.birth_date.value.trim());
        formData.append("phone_number", inputs.phone_number.value.trim());
        formData.append("card_number", inputs.card_number.value.trim().replace(/\s/g, ''));
        
        // افزودن فایل‌ها
        formData.append("id_front_file", inputs.id_front_file.files[0]);
        formData.append("id_back_file", inputs.id_back_file.files[0]);
        formData.append("bank_card_file", inputs.bank_card_file.files[0]);
        formData.append("selfie_file", inputs.selfie_file.files[0]);

        try {
            const response = await fetch(`${API_BASE_URL}/webapp/submit_full_kyc`, {
                method: 'POST',
                body: formData 
            });

            const result = await response.json();

            if (response.ok && result.status === "success") {
                tg.showAlert("✅ احراز هویت شما با موفقیت برای بررسی ارسال شد. لطفاً منتظر تایید ادمین بمانید.");
                tg.close();
            } else {
                const errorMessage = result.message || (result.detail || "خطای ناشناخته از سرور.");
                tg.showAlert(`⚠️ خطا: ${errorMessage}`);
                loader.classList.add('hidden');
                formContainer.classList.remove('hidden');
                tg.MainButton.hideProgress();
            }

        } catch (error) {
            console.error("Failed to submit KYC data:", error);
            tg.showAlert("❌ خطایی در ارتباط با سرور رخ داد. لطفاً دوباره تلاش کنید.");
            loader.classList.add('hidden');
            formContainer.classList.remove('hidden');
            tg.MainButton.hideProgress();
        }
    }

    /**
     * به فیلدهای آپلود فایل، بازخورد بصری اضافه می‌کند.
     */
    function addFileListeners() {
        const fileWrappers = document.querySelectorAll('.file-upload-wrapper');
        fileWrappers.forEach(wrapper => {
            const input = wrapper.querySelector('input[type="file"]');
            const textElement = wrapper.querySelector('.file-upload-text');
            
            input.addEventListener('change', () => {
                if (input.files.length > 0) {
                    wrapper.classList.add('file-selected');
                    textElement.textContent = input.files[0].name; 
                } else {
                    wrapper.classList.remove('file-selected');
                    textElement.textContent = "برای آپلود کلیک کنید";
                }
                updateMainButtonState(); 
            });
        });
    }

    /**
     * راه‌اندازی اولیه صفحه
     */
    function init() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('secondary_bg_color');
        tg.setBackgroundColor('bg_color');

        tg.MainButton.setParams({
            is_active: false,
            is_visible: true,
            text: "لطفاً تمام فیلدها را کامل کنید"
        });

        tg.MainButton.onClick(submitKycData);

        // افزودن لیسنر به فیلدهای متنی
        Object.values(inputs).forEach(input => {
            if (input.type === 'text' || input.type === 'tel') {
                input.addEventListener('input', updateMainButtonState);
            }
        });
        
        addFileListeners();
        updateMainButtonState();
    }

    // --- Entry Point ---
    document.addEventListener("DOMContentLoaded", init);

})();