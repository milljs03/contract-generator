import { db, collection, doc, getDoc, getDocs, setDoc, query, where } from './firebase.js';

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
// ADDED reference to the LI inside terms
const dynamicInstallationScheduleLi = document.getElementById('dynamic-installation-schedule');

// Options
const optionsViewContainer = document.getElementById('options-view-container');

// Signature Elements
// ... (rest of signature elements remain the same)
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

let signaturePad;
let currentContractId = null;
let selectedOptionId = null;
let selectedOptionData = null;
let isUsingTypedSignature = false;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Delay initialization slightly to ensure canvas is ready
    setTimeout(initializeSignaturePad, 100);
    window.addEventListener("resize", resizeCanvas);

    // Event listeners
    clearSignatureBtn.addEventListener('click', () => {
        if (signaturePad) { signaturePad.clear(); checkCanSign(); }
    });
    optionsViewContainer.addEventListener('change', handleOptionSelect);
    acceptContractBtn.addEventListener('click', signContract);
    signerNameInput.addEventListener('input', () => {
        updateTypedSignatureDisplay(); checkCanSign();
    });
    useTypedSignatureCheckbox.addEventListener('change', handleSignatureMethodChange);
    // Move endStroke listener setup inside initializeSignaturePad
    // signaturePadCanvas.addEventListener('mouseup', checkCanSign); // Not needed with endStroke
    // signaturePadCanvas.addEventListener('touchend', checkCanSign); // Not needed with endStroke

    // Load contract data
    loadContract();
});

function initializeSignaturePad() {
    // Check if canvas exists and is visible (not hidden by display:none)
    if (signaturePadCanvas && signaturePadCanvas.offsetParent !== null) {
        resizeCanvas(); // Ensure canvas size is correct before initializing
        signaturePad = new SignaturePad(signaturePadCanvas, {
             backgroundColor: 'rgb(249, 250, 251)', // Match bg-gray-50
             // minWidth: 0.5,
             // maxWidth: 2.5,
        });
        // Add listener *after* successful initialization
        signaturePad.addEventListener("endStroke", () => {
            checkCanSign();
        });
        console.log("SignaturePad initialized.");
    } else {
        console.warn("Signature pad canvas not ready or not visible on init.");
        // Optionally, try again later if needed
        // setTimeout(initializeSignaturePad, 300);
    }
}


function resizeCanvas() {
    if (!signaturePadCanvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    // Set display size
    signaturePadCanvas.style.width = '100%';
    signaturePadCanvas.style.height = '12rem'; // h-48
    // Set actual drawing size
    signaturePadCanvas.width = signaturePadCanvas.offsetWidth * ratio;
    signaturePadCanvas.height = signaturePadCanvas.offsetHeight * ratio;
    const ctx = signaturePadCanvas.getContext("2d");
    if (ctx) {
        ctx.scale(ratio, ratio);
        // Re-apply background color if needed after clearing
        if (signaturePad) {
             const data = signaturePad.toData(); // Store current drawing
             signaturePad.clear(); // Clears the drawing but also background if set via option
             signaturePad.backgroundColor = 'rgb(249, 250, 251)'; // Re-apply
             signaturePad.fromData(data); // Restore the drawing
        } else {
             ctx.fillStyle = 'rgb(249, 250, 251)';
             ctx.fillRect(0,0, signaturePadCanvas.width, signaturePadCanvas.height);
        }
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
        if (signaturePad) signaturePad.clear(); // Clear canvas when switching
    } else {
        signatureCanvasContainer.classList.remove('hidden');
        typedSignatureDisplay.classList.add('hidden');
        // Ensure signature pad is ready if switching back
        if (!signaturePad) { initializeSignaturePad(); }
        else { resizeCanvas(); } // Ensure canvas is correctly sized
    }
    checkCanSign(); // Update button state
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
        // If using typed signature, require a name to be entered
        hasSignature = hasName;
    } else {
        // If using drawn signature, check if pad exists and is not empty
        hasSignature = signaturePad && !signaturePad.isEmpty();
    }

    // Enable button only if all conditions met
    if (hasName && hasSignature && hasOption) {
        acceptContractBtn.disabled = false;
        acceptContractBtn.textContent = `Accept & Sign for ${selectedOptionData.title}`;
    } else {
        acceptContractBtn.disabled = true;
        // Provide more specific feedback
        if (!hasOption) { acceptContractBtn.textContent = 'Select an Option Above'; }
        else if (!hasName) { acceptContractBtn.textContent = 'Please Enter Printed Name'; }
        else if (!hasSignature && isUsingTypedSignature) { acceptContractBtn.textContent = 'Enter Name to Use Typed Signature'; }
        else if (!hasSignature && !isUsingTypedSignature) { acceptContractBtn.textContent = 'Please Provide Signature Below'; }
        else { acceptContractBtn.textContent = 'Complete Required Fields'; } // Fallback
    }
}


// --- Load Contract Data ---
async function loadContract() {
    try {
        // 1. Get shareableId from URL
        const params = new URLSearchParams(window.location.search);
        const shareableId = params.get('id');
        if (!shareableId) { showError("No contract ID provided."); return; }

        // 2. Find the contract with that shareableId
        const q = query(collection(db, 'contracts'), where("shareableId", "==", shareableId));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) { showError("Contract not found."); return; }

        const contractDoc = querySnapshot.docs[0];
        currentContractId = contractDoc.id;
        const contract = contractDoc.data();

        // 3. Populate Contract Details
        viewBusinessName.textContent = contract.businessName;
        detailBusinessName.textContent = contract.businessName;
        detailCustomerEmail.textContent = contract.customerEmail;
        detailBillingAddress.textContent = contract.billingAddress;
        if (contract.agentBusinessName) {
            detailAgentName.textContent = `On behalf of: ${contract.agentBusinessName}`;
            detailAgentName.classList.remove('hidden');
        }
        detailServiceAddresses.innerHTML = ''; // Clear existing
        contract.multiSiteAddresses.forEach(address => {
            const li = document.createElement('li');
            li.textContent = address;
            detailServiceAddresses.appendChild(li);
        });

        // --- UPDATED THIS BLOCK ---
        // Populate Installation Schedule (now inside terms)
        if (contract.installationScheduleText && dynamicInstallationScheduleLi) {
            dynamicInstallationScheduleLi.textContent = contract.installationScheduleText;
        } else if (dynamicInstallationScheduleLi) {
             dynamicInstallationScheduleLi.textContent = "Installation schedule details not provided."; // Fallback text
        }
        // --- END OF UPDATE ---

        // 4. Check if contract is already signed/locked
        if (contract.status === 'signed' || contract.status === 'locked') {
            showLockedView(contract);
        } else {
            // 5. Load Options (if not locked)
            await loadOptions(currentContractId);
        }

        // 6. Show the contract
        loadingState.classList.add('hidden');
        contractView.classList.remove('hidden');

    } catch (err) {
        console.error("Error loading contract:", err);
        showError(err.message);
    }
}


// --- Load Options ---
async function loadOptions(contractId) {
    const optionsSnapshot = await getDocs(collection(db, 'contracts', contractId, 'options'));

    optionsViewContainer.innerHTML = ''; // Clear previous options
    optionsSnapshot.forEach(doc => {
        const option = doc.data();
        const optionId = doc.id;
        const optionEl = document.createElement('div');
        optionEl.className = 'view-option-card';

        // --- Build Table Body ---
        let itemCounter = 0; // Counter for alternating rows
        const tableBodyHtml = option.lineItems.map(item => {
            if (item.type === 'header') {
                // Reset counter for headers? Optional.
                return `<tr class="table-header-row"><td colspan="4">${item.value}</td></tr>`;
            }
            if (item.type === 'item') {
                itemCounter++;
                const rowClass = (itemCounter % 2 === 0) ? 'table-item-row-even' : 'table-item-row-odd';
                // Ensure values are numbers before toFixed
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
            return ''; // Handle potential unexpected types
        }).join('');

        // --- Build Table Footer ---
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

        // --- Assemble Full Option Card ---
        const tableHtml = `
            <table class="pricing-table-view">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th class="w-20">Qty</th>
                        <th class="w-28">Monthly (MRC)</th>
                        <th class="w-28">One-Time (NRC)</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableBodyHtml}
                </tbody>
                ${tableFooterHtml}
            </table>
        `;

        optionEl.innerHTML = `
            <div class="view-option-header">
                <input type="radio" name="contract-option" id="${optionId}" value="${optionId}" class="form-radio">
                <label for="${optionId}" class="flex-grow">
                    <span class="view-option-title">${option.title}</span>
                    <span class="view-option-term">${option.termMonths} Month Term</span>
                </label>
                <!-- Totals are now in the table footer -->
            </div>
            <div class="view-option-body">
                ${tableHtml}
            </div>
        `;
        optionsViewContainer.appendChild(optionEl);
    });
}


// --- Option Selection ---
function handleOptionSelect(e) {
    if (e.target.name === 'contract-option') {
        selectedOptionId = e.target.value;
        // Find the title from the label associated with the radio button
        const label = e.target.closest('.view-option-header').querySelector('label');
        const title = label.querySelector('.view-option-title').textContent;
        const term = label.querySelector('.view-option-term').textContent;

        selectedOptionData = { id: selectedOptionId, title: `${title} (${term})` };
        selectedOptionTitle.textContent = selectedOptionData.title; // Update display

        checkCanSign(); // Update button state
    }
}


// --- Sign Contract Logic ---
async function signContract() {
    const signerName = signerNameInput.value.trim();

    // Updated validation check
    if (!selectedOptionId || !signerName || (isUsingTypedSignature ? false : !signaturePad || signaturePad.isEmpty())) {
        alert("Please ensure an option is selected, your name is entered, and a signature is provided (either drawn or by typing your name if the checkbox is selected).");
        return;
    }

    acceptContractBtn.disabled = true;
    acceptContractBtn.textContent = 'Saving...';

    try {
        // Prepare signature data based on the selected method
        let signatureDataObject = {
            signerName: signerName,
            signedAt: new Date().toISOString() // Use ISO string for consistency
        };

        if (isUsingTypedSignature) {
            signatureDataObject.signatureType = 'typed';
            signatureDataObject.signatureData = signerName; // Store the name itself
        } else {
             signatureDataObject.signatureType = 'drawn';
             if (!signaturePad) { throw new Error("Signature Pad is not initialized."); }
             // Check if pad is empty again just before saving
             if (signaturePad.isEmpty()) { throw new Error("Signature cannot be empty."); }
             signatureDataObject.signatureData = signaturePad.toDataURL(); // Save drawn signature as PNG Data URL
        }

        // Update the main contract document in Firestore
        const contractRef = doc(db, 'contracts', currentContractId);
        await setDoc(contractRef, {
            status: 'signed',
            selectedOptionId: selectedOptionId,
            signature: signatureDataObject
        }, { merge: true }); // Use merge:true to avoid overwriting other fields

        // Show the locked view with the saved signature data
        showLockedView({ signature: signatureDataObject });

    } catch (err) {
        console.error("Error signing contract: ", err);
        alert(`Error signing contract: ${err.message}`);
        // Re-enable button on error
        acceptContractBtn.disabled = false;
        checkCanSign(); // Reset button text/state
    }
}


// --- Show Locked View ---
function showLockedView(contract) {
    // Hide options and signature pad sections
    optionsViewContainer.innerHTML = '<p class="text-gray-700 font-medium">This contract has already been signed and is now locked.</p>';
    signatureSection.classList.add('hidden');

    // Populate "Thank You" message
    signedByName.textContent = contract.signature?.signerName || 'N/A';
    signedOnDate.textContent = contract.signature?.signedAt ? new Date(contract.signature.signedAt).toLocaleString() : 'N/A';

    // Display the saved signature (typed or drawn)
    finalSignatureDisplay.innerHTML = '<h4 class="font-medium text-gray-700 mb-1">Signature Provided:</h4>';
    if (contract.signature && contract.signature.signatureType === 'typed') {
        const typedSig = document.createElement('span');
        typedSig.className = 'typed-signature-font text-xl'; // Apply cursive style
        typedSig.textContent = contract.signature.signatureData; // Display the saved name
        finalSignatureDisplay.appendChild(typedSig);
    } else if (contract.signature && contract.signature.signatureType === 'drawn' && contract.signature.signatureData) {
        const sigImage = document.createElement('img');
        sigImage.src = contract.signature.signatureData; // Display the saved image
        sigImage.alt = "Signature";
        // Add some basic styling if needed
        sigImage.style.maxWidth = '200px';
        sigImage.style.maxHeight = '80px';
        sigImage.style.border = '1px solid #ccc';
        finalSignatureDisplay.appendChild(sigImage);
    } else {
        // Fallback if signature data is missing or type is unknown
        finalSignatureDisplay.innerHTML += '<p class="text-sm text-gray-500">Signature data not available.</p>';
    }

    // Show the "Thank You" state
    thankYouState.classList.remove('hidden');
}


// --- Error Handling ---
function showError(message) {
    console.error(message);
    loadingState.classList.add('hidden');
    contractView.classList.add('hidden');
    errorState.classList.remove('hidden');
    // Maybe display the specific message in errorState?
    // errorState.querySelector('p').textContent = message; // If you add a <p> in the error div
}

