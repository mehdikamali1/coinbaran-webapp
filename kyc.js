/* webapp/kyc.js (v71.0 - Hybrid Logic) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;

    // Elements
    const loader = document.getElementById('loader');
    const formContainer = document.getElementById('kyc-form-container');
    const form = document.getElementById('kyc-form');
    
    // Status Cards
    const cardVerified = document.getElementById('status-verified');
    const cardPending = document.getElementById('status-pending');

    // Inputs (Matches your original IDs)
    const inputs = {
        fullName: document.getElementById('full_name'),
        nationalId: document.getElementById('national_id'),
        birthDate: document.getElementById('birth_date'),
        phoneNumber: document.getElementById('phone_number'),
        cardNumber: document.getElementById('card_number'),
        idFront: document.getElementById('id_front_file'),
        idBack: document.getElementById('id_back_file'),
        bankCard: document.getElementById('bank_card_file'),
        selfie: document.getElementById('selfie_file')
    };

    window.onload = function() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#050505');
        tg.setBackgroundColor('#050505');

        // Setup Main Button
        tg.MainButton.setText("SUBMIT DOCUMENTS");
        tg.MainButton.setTextColor("#000000");
        tg.MainButton.setColor("#F0B90B"); // Gold
        tg.MainButton.hide(); 

        tg.MainButton.onClick(submitForm);

        // 1. Check User Status First (Improved UX)
        checkUserStatus();

        // 2. Setup Listeners
        setupFormListeners();
    };

    // --- New: Status Check Logic ---
    async function checkUserStatus() {
        if (!tg.initData) return; // Skip if dev mode without data
        
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await res.json();
            
            // Logic to handle status
            if (data.kyc_status_code === 'verified') {
                cardVerified.classList.add('visible');
                formContainer.style.display = 'none'; // Hide form
                tg.MainButton.hide();
            } else if (data.kyc_status_code === 'pending') {
                cardPending.classList.add('visible');
                formContainer.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">Your documents are currently under review.</div>';
                tg.MainButton.hide();
            } else {
                // Not verified, show form
                formContainer.style.opacity = '1';
            }
        } catch (e) {
            console.error("Status Check Error:", e);
        }
    }

    // --- Original Form Logic ---
    function setupFormListeners() {
        const textInputs = [inputs.fullName, inputs.nationalId, inputs.birthDate, inputs.phoneNumber, inputs.cardNumber];
        textInputs.forEach(input => {
            if(input) input.addEventListener('input', checkFormValidity);
        });

        const fileInputs = [inputs.idFront, inputs.idBack, inputs.bankCard, inputs.selfie];
        fileInputs.forEach(input => {
            if(input) {
                input.addEventListener('change', function() {
                    const wrapper = this.closest('.file-upload-wrapper');
                    const textEl = wrapper.querySelector('.file-upload-text');
                    const iconEl = wrapper.querySelector('.file-upload-icon');

                    if (this.files && this.files.length > 0) {
                        wrapper.classList.add('file-selected');
                        textEl.innerText = this.files[0].name;
                        // Use FontAwesome classes compatible with new design
                        iconEl.className = 'fas fa-check-circle file-upload-icon'; 
                        tg.HapticFeedback.selectionChanged();
                    } else {
                        wrapper.classList.remove('file-selected');
                        textEl.innerText = "Select File";
                        // Reset icon based on ID (simple logic)
                        if(this.id.includes('camera') || this.id.includes('selfie')) iconEl.className = 'fas fa-camera file-upload-icon';
                        else if(this.id.includes('bank')) iconEl.className = 'fas fa-credit-card file-upload-icon';
                        else iconEl.className = 'fas fa-id-card file-upload-icon';
                    }
                    checkFormValidity();
                });
            }
        });
    }

    function checkFormValidity() {
        let isValid = true;

        if (!inputs.fullName.value.trim()) isValid = false;
        if (inputs.nationalId.value.length < 10) isValid = false;
        if (!inputs.birthDate.value.trim()) isValid = false;
        if (inputs.phoneNumber.value.length < 10) isValid = false;
        if (inputs.cardNumber.value.length < 16) isValid = false;

        if (inputs.idFront.files.length === 0) isValid = false;
        if (inputs.idBack.files.length === 0) isValid = false;
        if (inputs.bankCard.files.length === 0) isValid = false;
        if (inputs.selfie.files.length === 0) isValid = false;

        if (isValid) {
            tg.MainButton.show();
            tg.MainButton.enable();
        } else {
            tg.MainButton.hide();
        }
    }

    async function submitForm() {
        tg.MainButton.showProgress();
        tg.MainButton.disable();
        
        if(loader) {
            loader.classList.remove('hidden');
            loader.style.display = 'flex'; // Ensure flex for centering
            if(formContainer) formContainer.style.opacity = '0.3';
        }

        const formData = new FormData();
        formData.append("initData", tg.initData || "");
        formData.append("full_name", inputs.fullName.value.trim());
        formData.append("national_id", inputs.nationalId.value.trim());
        formData.append("birth_date", inputs.birthDate.value.trim());
        formData.append("phone_number", inputs.phoneNumber.value.trim());
        formData.append("card_number", inputs.cardNumber.value.trim());

        formData.append("id_front_file", inputs.idFront.files[0]);
        formData.append("id_back_file", inputs.idBack.files[0]);
        formData.append("bank_card_file", inputs.bankCard.files[0]);
        formData.append("selfie_file", inputs.selfie.files[0]);

        try {
            const response = await fetch(`${API_BASE_URL}/webapp/submit_full_kyc`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                tg.HapticFeedback.notificationOccurred('success');
                tg.showAlert("✅ مدارک با موفقیت ارسال شد.\nنتیجه بررسی به شما اطلاع داده می‌شود.", function() {
                    tg.close();
                });
            } else {
                throw new Error(result.message || "Upload Failed");
            }

        } catch (error) {
            console.error("KYC Error:", error);
            tg.HapticFeedback.notificationOccurred('error');
            tg.showAlert("⛔️ " + error.message);
            
            tg.MainButton.hideProgress();
            tg.MainButton.enable();
            if(loader) {
                loader.classList.add('hidden');
                loader.style.display = 'none';
                if(formContainer) formContainer.style.opacity = '1';
            }
        }
    }

})();