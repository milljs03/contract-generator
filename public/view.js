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

// Options
const optionsViewContainer = document.getElementById('options-view-container');

// Signature
const signatureSection = document.getElementById('signature-section');
const thankYouState = document.getElementById('thank-you-state');
const selectedOptionTitle = document.getElementById('selected-option-title');
const signerNameInput = document.getElementById('signer-name');
const signaturePadCanvas = document.getElementById('signature-pad');
const clearSignatureBtn = document.getElementById('clear-signature-btn');
const acceptContractBtn = document.getElementById('accept-contract-btn');
const signedByName = document.getElementById('signed-by-name');
const signedOnDate = document.getElementById('signed-on-date');

let signaturePad;
let currentContractId = null;
let selectedOptionId = null;
let selectedOptionData = null;

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    // Initialize signature pad
    signaturePad = new SignaturePad(signaturePadCanvas);
    clearSignatureBtn.addEventListener('click', () => signaturePad.clear());
    
    // Add listener for selecting an option
    optionsViewContainer.addEventListener('change', handleOptionSelect);
    
    // Add listener for signing
    acceptContractBtn.addEventListener('click', signContract);
    
    // Check for signer name input
    signerNameInput.addEventListener('input', checkCanSign);
    signaturePadCanvas.addEventListener('mouseup', checkCanSign); // Use mouseup as 'end'
    signaturePadCanvas.addEventListener('touchend', checkCanSign);
    
    // Load the contract
    loadContract();
});

function checkCanSign() {
    const hasName = signerNameInput.value.trim() !== '';
    const hasSignature = !signaturePad.isEmpty();
    const hasOption = !!selectedOptionId;

    if (hasName && hasSignature && hasOption) {
        acceptContractBtn.disabled = false;
        acceptContractBtn.textContent = `Accept & Sign for ${selectedOptionData.title}`;
    } else {
        acceptContractBtn.disabled = true;
        if (!hasOption) {
            acceptContractBtn.textContent = 'Select an Option to Sign';
        } else if (!hasName) {
            acceptContractBtn.textContent = 'Please enter your name';
        } else {
            acceptContractBtn.textContent = 'Please provide a signature';
        }
    }
}

async function loadContract() {
    try {
        // 1. Get shareableId from URL
        const params = new URLSearchParams(window.location.search);
        const shareableId = params.get('id');
        
        if (!shareableId) {
            showError("No contract ID provided.");
            return;
        }

        // 2. Find the contract with that shareableId
        const q = query(collection(db, 'contracts'), where("shareableId", "==", shareableId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showError("Contract not found.");
            return;
        }
        
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
        
        // Populate service addresses
        detailServiceAddresses.innerHTML = '';
        contract.multiSiteAddresses.forEach(address => {
            const li = document.createElement('li');
            li.textContent = address;
            detailServiceAddresses.appendChild(li);
        });

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

async function loadOptions(contractId) {
    const optionsSnapshot = await getDocs(collection(db, 'contracts', contractId, 'options'));
    
    optionsViewContainer.innerHTML = '';
    optionsSnapshot.forEach(doc => {
        const option = doc.data();
        const optionId = doc.id;
        const optionEl = document.createElement('div');
        optionEl.className = 'view-option-card';
        
        // Build the pricing table HTML
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
                    ${option.lineItems.map(item => {
                        if (item.type === 'header') {
                            return `<tr class="table-header-row"><td colspan="4">${item.value}</td></tr>`;
                        }
                        if (item.type === 'item') {
                            return `
                                <tr>
                                    <td>${item.description}</td>
                                    <td class="text-center">${item.qty}</td>
                                    <td>$${item.mrc.toFixed(2)}</td>
                                    <td>$${item.nrc.toFixed(2)}</td>
                                </tr>`;
                        }
                        return '';
                    }).join('')}
                </tbody>
            </table>
        `;
        
        optionEl.innerHTML = `
            <div class="view-option-header">
                <input type="radio" name="contract-option" id="${optionId}" value="${optionId}" class="form-radio">
                <label for="${optionId}" class="flex-grow">
                    <span class="view-option-title">${option.title}</span>
                    <span class="view-option-term">${option.termMonths} Month Term</span>
                </label>
                <div class="view-option-totals">
                    <div>Total MRC: <strong>$${option.totalMRC.toFixed(2)}</strong></div>
                    <div>Total NRC: <strong>$${option.totalNRC.toFixed(2)}</strong></div>
                </div>
            </div>
            <div class="view-option-body">
                ${tableHtml}
            </div>
        `;
        optionsViewContainer.appendChild(optionEl);
    });
}

function handleOptionSelect(e) {
    if (e.target.name === 'contract-option') {
        selectedOptionId = e.target.value;
        // Find the title
        const label = e.target.closest('.view-option-header').querySelector('label');
        const title = label.querySelector('.view-option-title').textContent;
        const term = label.querySelector('.view-option-term').textContent;
        
        selectedOptionData = { id: selectedOptionId, title: `${title} (${term})` };
        selectedOptionTitle.textContent = selectedOptionData.title;
        
        checkCanSign();
    }
}

async function signContract() {
    const signerName = signerNameInput.value.trim();
    if (!selectedOptionId || !signerName || signaturePad.isEmpty()) {
        alert("Please select an option, enter your name, and provide a signature.");
        return;
    }
    
    acceptContractBtn.disabled = true;
    acceptContractBtn.textContent = 'Saving...';
    
    try {
        const signatureDataURL = signaturePad.toDataURL(); // Save as PNG
        
        // Update the main contract doc
        const contractRef = doc(db, 'contracts', currentContractId);
        await setDoc(contractRef, {
            status: 'signed',
            selectedOptionId: selectedOptionId,
            signature: {
                signerName: signerName,
                signedAt: new Date().toISOString(),
                signatureData: signatureDataURL
            }
        }, { merge: true });
        
        // Show the locked view
        showLockedView({
            signature: {
                signerName: signerName,
                signedAt: new Date().toISOString()
            }
        });
        
    } catch (err) {
        console.error("Error signing contract: ", err);
        alert(`Error: ${err.message}`);
        acceptContractBtn.disabled = false;
        checkCanSign();
    }
}

function showLockedView(contract) {
    // Hide options and signature pad
    optionsViewContainer.innerHTML = '<p class="text-gray-700 font-medium">This contract has already been signed and is now locked.</p>';
    signatureSection.classList.add('hidden');
    
    // Show thank you message
    signedByName.textContent = contract.signature.signerName;
    signedOnDate.textContent = new Date(contract.signature.signedAt).toLocaleString();
    thankYouState.classList.remove('hidden');
}

function showError(message) {
    console.error(message);
    loadingState.classList.add('hidden');
    contractView.classList.add('hidden');
    errorState.classList.remove('hidden');
}
