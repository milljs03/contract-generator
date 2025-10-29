import { db, collection, doc, getDoc, getDocs, setDoc, query, where } from './firebase.js';
// Import functions for triggering Cloud Function
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Initialize Firebase Functions
const functions = getFunctions();
// Rename function reference for clarity
const sendSignedConfirmationEmail = httpsCallable(functions, 'sendSignedConfirmationEmail'); // Name of NEW Cloud Function

// DOM Elements
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const contractView = document.getElementById('contract-view');

// Contract Details
const viewBusinessName = document.getElementById('view-business-name');
const detailBusinessName = document.getElementById('detail-business-name');
const detailAgentName = document.getElementById('detail-agent-name');
const detailCustomerEmail = document.getElementById('detail-customer-email');
const detailServiceAddresses = document.getElementById('detail-service-addresses');
const detailBillingAddress = document.getElementById('detail-billing-address');
const dynamicInstallationScheduleLi = document.getElementById('dynamic-installation-schedule');

// Options
const optionsSection = document.getElementById('options-section');
const optionsViewContainer = document.getElementById('options-view-container');

// Signature Elements
const signatureSection = document.getElementById('signature-section');
const thankYouState = document.getElementById('thank-you-state');
const selectedOptionTitle = document.getElementById('selected-option-title');
const signerNameInput = document.getElementById('signer-name');
const useTypedSignatureCheckbox = document.getElementById('use-typed-signature');
const signatureCanvasContainer = document.getElementById('signature-canvas-container');
const typedSignatureDisplay = document.getElementById('typed-signature-display');
const typedSignatureText = document.getElementById('typed-signature-text');
const signaturePadCanvas = document.getElementById('signature-pad');
const clearSignatureBtn = document.getElementById('clear-signature-btn');
const acceptContractBtn = document.getElementById('accept-contract-btn');
const signedByName = document.getElementById('signed-by-name');
const signedOnDate = document.getElementById('signed-on-date');
const finalSignatureDisplay = document.getElementById('final-signature-display');
const chosenOptionDisplay = document.getElementById('chosen-option-display');

// Post-Sign Elements
const postSignActions = document.getElementById('post-sign-actions');
const printContractBtn = document.getElementById('print-contract-btn');
// Updated ID reference
const emailSummaryBtn = document.getElementById('email-summary-btn');
const emailConfirmationSection = document.getElementById('email-confirmation-section');
// Updated ID reference
const summaryEmailInput = document.getElementById('summary-email-input');
const confirmEmailBtn = document.getElementById('confirm-email-btn');
const cancelEmailBtn = document.getElementById('cancel-email-btn');
const emailStatusMessage = document.getElementById('email-status-message');


let signaturePad;
let currentContractId = null;
let currentContractData = null;
let selectedOptionId = null;
let selectedOptionData = null;
let chosenOptionData = null;
let isUsingTypedSignature = false;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeSignaturePad, 100);
    window.addEventListener("resize", resizeCanvas);

    clearSignatureBtn.addEventListener('click', () => {
        if (signaturePad) { signaturePad.clear(); checkCanSign(); }
    });
    optionsViewContainer.addEventListener('change', handleOptionSelect);
    acceptContractBtn.addEventListener('click', signContract);
    signerNameInput.addEventListener('input', () => {
        updateTypedSignatureDisplay(); checkCanSign();
    });
    useTypedSignatureCheckbox.addEventListener('change', handleSignatureMethodChange);

    // Updated Post-Sign Action Listeners
    printContractBtn.addEventListener('click', printContract);
    emailSummaryBtn.addEventListener('click', showEmailModal); // Updated ID
    cancelEmailBtn.addEventListener('click', hideEmailModal);
    confirmEmailBtn.addEventListener('click', handleSendEmail);

    loadContract();
});

// --- Signature Pad & Canvas Logic ---
function initializeSignaturePad() {
    if (signaturePadCanvas && signaturePadCanvas.offsetParent !== null) {
        resizeCanvas();
        signaturePad = new SignaturePad(signaturePadCanvas, {
             backgroundColor: 'rgb(249, 250, 251)',
        });
        signaturePad.addEventListener("endStroke", () => {
            checkCanSign();
        });
        console.log("SignaturePad initialized.");
    } else {
        console.warn("Signature pad canvas not ready or not visible on init.");
    }
}

function resizeCanvas() {
    if (!signaturePadCanvas || signaturePadCanvas.offsetParent === null) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    signaturePadCanvas.style.width = '100%';
    signaturePadCanvas.style.height = '12rem';
    signaturePadCanvas.width = signaturePadCanvas.offsetWidth * ratio;
    signaturePadCanvas.height = signaturePadCanvas.offsetHeight * ratio;
    const ctx = signaturePadCanvas.getContext("2d");
    if (ctx) {
        ctx.scale(ratio, ratio);
        const data = signaturePad ? signaturePad.toData() : null;
        signaturePad?.clear();
        ctx.fillStyle = 'rgb(249, 250, 251)';
        ctx.fillRect(0,0, signaturePadCanvas.width, signaturePadCanvas.height);
        if(data) signaturePad?.fromData(data);
        console.log("Canvas resized.");
    } else {
        console.error("Could not get 2D context for signature canvas.");
    }
}

// --- Signature Method Handling ---
function handleSignatureMethodChange() {
    isUsingTypedSignature = useTypedSignatureCheckbox.checked;
    if (isUsingTypedSignature) {
        signatureCanvasContainer.classList.add('hidden');
        typedSignatureDisplay.classList.remove('hidden');
        updateTypedSignatureDisplay();
        if (signaturePad) signaturePad.clear();
    } else {
        signatureCanvasContainer.classList.remove('hidden');
        typedSignatureDisplay.classList.add('hidden');
        if (!signaturePad) { initializeSignaturePad(); }
        else { resizeCanvas(); }
    }
    checkCanSign();
}

function updateTypedSignatureDisplay() {
    if (isUsingTypedSignature) {
        typedSignatureText.textContent = signerNameInput.value.trim() || 'Your Name Here';
    }
}

// --- Enable/Disable Signing Button Logic ---
function checkCanSign() {
    const hasName = signerNameInput.value.trim() !== '';
    const hasOption = !!selectedOptionId;
    let hasSignature = false;

    if (isUsingTypedSignature) {
        hasSignature = hasName;
    } else {
        hasSignature = signaturePad && !signaturePad.isEmpty();
    }

    if (hasName && hasSignature && hasOption) {
        acceptContractBtn.disabled = false;
        acceptContractBtn.textContent = `Accept & Sign for ${selectedOptionData?.title || 'Selected Option'}`;
    } else {
        acceptContractBtn.disabled = true;
        if (!hasOption) { acceptContractBtn.textContent = 'Select an Option Above'; }
        else if (!hasName) { acceptContractBtn.textContent = 'Please Enter Printed Name'; }
        else if (!hasSignature && isUsingTypedSignature) { acceptContractBtn.textContent = 'Enter Name to Use Typed Signature'; }
        else if (!hasSignature && !isUsingTypedSignature) { acceptContractBtn.textContent = 'Please Provide Signature Below'; }
        else { acceptContractBtn.textContent = 'Complete Required Fields'; }
    }
}


// --- Load Contract Data ---
async function loadContract() {
    try {
        const params = new URLSearchParams(window.location.search);
        const shareableId = params.get('id');
        if (!shareableId) { showError("No contract ID provided."); return; }

        const q = query(collection(db, 'contracts'), where("shareableId", "==", shareableId));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) { showError("Contract not found."); return; }

        const contractDoc = querySnapshot.docs[0];
        currentContractId = contractDoc.id;
        currentContractData = contractDoc.data();

        // Populate Details
        viewBusinessName.textContent = currentContractData.businessName;
        detailBusinessName.textContent = currentContractData.businessName;
        detailCustomerEmail.textContent = currentContractData.customerEmail;
        detailBillingAddress.textContent = currentContractData.billingAddress;
        if (currentContractData.agentBusinessName) {
            detailAgentName.textContent = `On behalf of: ${currentContractData.agentBusinessName}`;
            detailAgentName.classList.remove('hidden');
        }
        detailServiceAddresses.innerHTML = '';
        currentContractData.multiSiteAddresses.forEach((address, index) => {
             detailServiceAddresses.appendChild(document.createTextNode(address));
             if (index < currentContractData.multiSiteAddresses.length - 1) {
                 detailServiceAddresses.appendChild(document.createElement('br'));
             }
         });
        if (currentContractData.installationScheduleText && dynamicInstallationScheduleLi) {
            dynamicInstallationScheduleLi.textContent = currentContractData.installationScheduleText;
        } else if (dynamicInstallationScheduleLi) {
             dynamicInstallationScheduleLi.textContent = "Installation schedule details default to standard terms.";
        }

        // Check Status
        if (currentContractData.status === 'signed' || currentContractData.status === 'locked') {
             if (currentContractData.selectedOptionId) {
                 const optionRef = doc(db, 'contracts', currentContractId, 'options', currentContractData.selectedOptionId);
                 const optionSnap = await getDoc(optionRef);
                 if (optionSnap.exists()) {
                     chosenOptionData = optionSnap.data();
                 } else { console.warn(`Selected option ${currentContractData.selectedOptionId} not found.`); }
             } else { console.warn("Contract is signed but selectedOptionId is missing."); }
            showLockedView(currentContractData);
        } else {
            await loadOptions(currentContractId);
        }

        loadingState.classList.add('hidden');
        contractView.classList.remove('hidden');

    } catch (err) {
        console.error("Error loading contract:", err);
        showError(err.message);
    }
}


// --- Load Options for Selection ---
async function loadOptions(contractId) {
    const optionsSnapshot = await getDocs(collection(db, 'contracts', contractId, 'options'));

    optionsViewContainer.innerHTML = '';
    optionsSnapshot.forEach(doc => {
        const option = doc.data();
        const optionId = doc.id;
        const optionEl = createOptionElement(option, optionId, true);
        optionsViewContainer.appendChild(optionEl);
    });
}

// --- Helper to Create Option HTML ---
function createOptionElement(option, optionId, includeRadioButton = false) {
    const optionEl = document.createElement('div');
    optionEl.className = includeRadioButton ? 'view-option-card' : 'view-option-card-locked border border-gray-300 rounded-lg overflow-hidden';

    let itemCounter = 0;
    const tableBodyHtml = option.lineItems.map(item => {
        if (item.type === 'header') {
            return `<tr class="table-header-row"><td colspan="4">${item.value}</td></tr>`;
        }
        if (item.type === 'item') {
            itemCounter++;
            const rowClass = (itemCounter % 2 === 0) ? 'table-item-row-even' : 'table-item-row-odd';
            const mrc = typeof item.mrc === 'number' ? item.mrc : 0;
            const nrc = typeof item.nrc === 'number' ? item.nrc : 0;
            return `
                <tr class="${rowClass}">
                    <td>${item.description}</td>
                    <td class="text-center">${item.qty}</td>
                    <td>$${mrc.toFixed(2)}</td>
                    <td>$${nrc.toFixed(2)}</td>
                </tr>`;
        }
        return '';
    }).join('');

    const totalMRC = typeof option.totalMRC === 'number' ? option.totalMRC : 0;
    const totalNRC = typeof option.totalNRC === 'number' ? option.totalNRC : 0;
    const tableFooterHtml = `
        <tfoot>
            <tr class="table-subtotal-row">
                <td colspan="2">Totals</td>
                <td>$${totalMRC.toFixed(2)}</td>
                <td>$${totalNRC.toFixed(2)}</td>
            </tr>
        </tfoot>
    `;

    const tableHtml = `
        <table class="pricing-table-view">
            <thead>
                <tr>
                    <th>Description</th>
                    <th class="w-20 text-right">Qty</th>
                    <th class="w-28 text-right">Monthly (MRC)</th>
                    <th class="w-28 text-right">One-Time (NRC)</th>
                </tr>
            </thead>
            <tbody> ${tableBodyHtml} </tbody>
            ${tableFooterHtml}
        </table>
    `;

    const headerHtml = `
        <div class="view-option-header ${includeRadioButton ? '' : 'justify-between'}">
            ${includeRadioButton ? `
            <input type="radio" name="contract-option" id="${optionId}" value="${optionId}" class="form-radio">
            <label for="${optionId}" class="flex-grow">
                <span class="view-option-title">${option.title}</span>
                <span class="view-option-term">${option.termMonths} Month Term</span>
            </label>
            ` : `
            <span class="view-option-title">${option.title}</span>
            <span class="view-option-term">${option.termMonths} Month Term</span>
            `}
        </div>
    `;

    optionEl.innerHTML = ` ${headerHtml} <div class="view-option-body"> ${tableHtml} </div> `;
    return optionEl;
}


// --- Option Selection ---
function handleOptionSelect(e) {
    if (e.target.name === 'contract-option') {
        selectedOptionId = e.target.value;
        const label = e.target.closest('.view-option-header').querySelector('label');
        const title = label.querySelector('.view-option-title').textContent;
        const term = label.querySelector('.view-option-term').textContent;

        selectedOptionData = { id: selectedOptionId, title: `${title} (${term})` };
        selectedOptionTitle.textContent = selectedOptionData.title;

        checkCanSign();
    }
}


// --- Sign Contract Logic ---
async function signContract() {
    const signerName = signerNameInput.value.trim();

    if (!selectedOptionId || !signerName || (isUsingTypedSignature ? false : !signaturePad || signaturePad.isEmpty())) {
        alert("Please ensure an option is selected, your name is entered, and a signature is provided.");
        return;
    }

    acceptContractBtn.disabled = true;
    acceptContractBtn.textContent = 'Saving...';

    try {
        let signatureDataObject = {
            signerName: signerName,
            signedAt: new Date().toISOString()
        };

        if (isUsingTypedSignature) {
            signatureDataObject.signatureType = 'typed';
            signatureDataObject.signatureData = signerName;
        } else {
             signatureDataObject.signatureType = 'drawn';
             if (!signaturePad || signaturePad.isEmpty()) { throw new Error("Signature cannot be empty."); }
             signatureDataObject.signatureData = signaturePad.toDataURL();
        }

        const contractRef = doc(db, 'contracts', currentContractId);
        await setDoc(contractRef, {
            status: 'signed',
            selectedOptionId: selectedOptionId,
            signature: signatureDataObject
        }, { merge: true });

        // Update local state
        currentContractData.status = 'signed';
        currentContractData.selectedOptionId = selectedOptionId;
        currentContractData.signature = signatureDataObject;

        // Fetch chosen option data NOW
        if (currentContractData.selectedOptionId) {
             const optionRef = doc(db, 'contracts', currentContractId, 'options', currentContractData.selectedOptionId);
             const optionSnap = await getDoc(optionRef);
             if (optionSnap.exists()) {
                 chosenOptionData = optionSnap.data();
             }
        }

        showLockedView(currentContractData);

    } catch (err) {
        console.error("Error signing contract: ", err);
        alert(`Error signing contract: ${err.message}`);
        acceptContractBtn.disabled = false;
        checkCanSign();
    }
}


// --- Show Locked View ---
function showLockedView(contract) {
    optionsSection.classList.add('hidden');
    signatureSection.classList.add('hidden');

    signedByName.textContent = contract.signature?.signerName || 'N/A';
    signedOnDate.textContent = contract.signature?.signedAt ? new Date(contract.signature.signedAt).toLocaleString() : 'N/A';

    finalSignatureDisplay.innerHTML = '<h4 class="font-medium text-gray-700 mb-1">Signature Provided:</h4>';
    if (contract.signature?.signatureType === 'typed') {
        const typedSig = document.createElement('span');
        typedSig.className = 'typed-signature-font text-xl';
        typedSig.textContent = contract.signature.signatureData || '[Typed Name]';
        finalSignatureDisplay.appendChild(typedSig);
    } else if (contract.signature?.signatureType === 'drawn' && contract.signature.signatureData) {
        const sigImage = document.createElement('img');
        sigImage.src = contract.signature.signatureData;
        sigImage.alt = "Signature";
        finalSignatureDisplay.appendChild(sigImage);
    } else {
        finalSignatureDisplay.innerHTML += '<p class="text-sm text-gray-500">Signature data not available.</p>';
    }

    chosenOptionDisplay.innerHTML = '<h3 class="text-xl font-semibold text-gray-800 mb-4">Selected Option Details:</h3>';
    if (chosenOptionData) {
        const chosenOptionEl = createOptionElement(chosenOptionData, contract.selectedOptionId, false);
        chosenOptionDisplay.appendChild(chosenOptionEl);
    } else {
        chosenOptionDisplay.innerHTML += '<p class="text-gray-500">Could not load details for the selected option.</p>';
    }

    thankYouState.classList.remove('hidden');
    postSignActions.classList.remove('hidden');
}


// --- Error Handling ---
function showError(message) {
    console.error(message);
    loadingState.classList.add('hidden');
    contractView.classList.add('hidden');
    errorState.classList.remove('hidden');
}

// --- Post-Sign Actions ---

function printContract() {
    window.print();
}

function showEmailModal() {
    summaryEmailInput.value = currentContractData?.customerEmail || ''; // Pre-fill
    emailStatusMessage.textContent = '';
    emailStatusMessage.className = 'text-sm mt-2';
    emailConfirmationSection.classList.remove('hidden');
}

function hideEmailModal() {
    emailConfirmationSection.classList.add('hidden');
}

// Updated Function to Send Summary Data
async function handleSendEmail() {
    const email = summaryEmailInput.value.trim();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
        emailStatusMessage.textContent = 'Please enter a valid email address.';
        emailStatusMessage.className = 'text-sm mt-2 error';
        return;
    }

    if (!currentContractData || !chosenOptionData) {
         emailStatusMessage.textContent = 'Contract or option data is missing.';
         emailStatusMessage.className = 'text-sm mt-2 error';
         return;
    }

    confirmEmailBtn.disabled = true;
    confirmEmailBtn.textContent = 'Sending...';
    emailStatusMessage.textContent = 'Preparing email summary...';
    emailStatusMessage.className = 'text-sm mt-2';

    // --- Prepare Data for Cloud Function ---
    const emailData = {
        toEmail: email,
        contractId: currentContractId,
        businessName: currentContractData.businessName,
        signerName: currentContractData.signature?.signerName,
        signedDate: currentContractData.signature?.signedAt ? new Date(currentContractData.signature.signedAt).toLocaleString() : 'N/A',
        optionTitle: chosenOptionData.title,
        optionTerm: chosenOptionData.termMonths,
        optionMRC: chosenOptionData.totalMRC.toFixed(2),
        optionNRC: chosenOptionData.totalNRC.toFixed(2),
        contractLink: window.location.href, // Send the current page link
        selectedOptionId: currentContractData.selectedOptionId // Pass option ID
    };

    console.log("Data prepared for Cloud Function:", emailData);

    // --- Trigger Cloud Function ---
    try {
        // Use the renamed function reference
        const result = await sendSignedConfirmationEmail(emailData);
        console.log('Cloud Function result:', result);

        // Check result from Cloud Function
        if (result.data?.success) {
            emailStatusMessage.textContent = 'Confirmation email sent successfully!';
            emailStatusMessage.className = 'text-sm mt-2 success';
            setTimeout(hideEmailModal, 3000);
        } else {
             throw new Error(result.data?.message || 'Cloud function reported an error.');
        }

    } catch (error) {
        console.error('Error triggering email function:', error);
        emailStatusMessage.textContent = `Error: Could not send email. ${error.message}`;
        emailStatusMessage.className = 'text-sm mt-2 error';
    } finally {
        confirmEmailBtn.disabled = false;
        confirmEmailBtn.textContent = 'Send Email';
    }
}

