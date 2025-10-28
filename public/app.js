import {
  db, auth, googleProvider,
  collection, doc, addDoc, getDoc, setDoc, query, onSnapshot, collectionGroup,
  onAuthStateChanged, signInWithPopup, signOut,
  deleteDoc, getDocs // <-- Import deleteDoc and getDocs
} from './firebase.js';

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const signInBtn = document.getElementById('sign-in-btn');
const signOutBtn = document.getElementById('sign-out-btn');
const authError = document.getElementById('auth-error');
const userEmail = document.getElementById('user-email');

const contractListContainer = document.getElementById('contract-list');
const openCreateFormBtn = document.getElementById('open-create-form-btn');
const modal = document.getElementById('contract-form-modal');
const closeModalBtn = document.getElementById('close-form-btn');
const cancelModalBtn = document.getElementById('cancel-form-btn');
const saveContractBtn = document.getElementById('save-contract-btn');
const saveSpinner = document.getElementById('save-spinner');
const contractForm = document.getElementById('contract-form');
const contractFormTitle = document.getElementById('contract-form-title');

// Form Fields
const billingSameAsService = document.getElementById('billingSameAsService');
const billingAddressContainer = document.getElementById('billingAddressContainer');
const addSiteBtn = document.getElementById('add-site-btn');
const multiSiteContainer = document.getElementById('multi-site-container');
const installationScheduleInput = document.getElementById('installationSchedule');
const addOptionBtn = document.getElementById('add-option-btn');
const optionsContainer = document.getElementById('options-container');

// Toast
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Global state
let currentUserId = null;
let currentEditingContractId = null;

// Fixed text for installation schedule
const installationScheduleSuffix = "Special installations, ad hoc requests, or delays caused by the Customer's vendor may extend timelines and potentially incur additional costs.";

// --- AUTHENTICATION ---
onAuthStateChanged(auth, user => {
    if (user) {
        // User is signed in
        currentUserId = user.uid;
        userEmail.textContent = user.email;
        authScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        initApp();
    } else {
        // User is signed out
        currentUserId = null;
        authScreen.classList.remove('hidden');
        appScreen.classList.add('hidden');
    }
});

signInBtn.addEventListener('click', () => {
    authError.textContent = '';
    signInWithPopup(auth, googleProvider).catch(error => {
        authError.textContent = error.message;
    });
});

signOutBtn.addEventListener('click', () => {
    signOut(auth);
});

// --- APP INITIALIZATION ---
function initApp() {
    // Load contracts
    loadContracts();

    // Attach all event listeners
    openCreateFormBtn.addEventListener('click', showCreateForm);
    closeModalBtn.addEventListener('click', closeModal);
    cancelModalBtn.addEventListener('click', closeModal);

    // Form interactivity
    billingSameAsService.addEventListener('change', toggleBillingAddress);
    addSiteBtn.addEventListener('click', addSite);
    addOptionBtn.addEventListener('click', addOption);
    saveContractBtn.addEventListener('click', saveContract);

    // Use event delegation for dynamic elements
    modal.addEventListener('click', handleModalClick);
    modal.addEventListener('input', handleModalInput);
    contractListContainer.addEventListener('click', handleContractListClick);
}

// --- CONTRACT LISTING ---
// Helper function to calculate expiration date
function calculateExpirationDate(signedAtISO, termMonths) {
    if (!signedAtISO || !termMonths) return 'N/A';
    try {
        const signedDate = new Date(signedAtISO);
        // Add months, handle year rollovers correctly
        signedDate.setMonth(signedDate.getMonth() + termMonths);
        return signedDate.toLocaleDateString(); // Format as MM/DD/YYYY (or locale default)
    } catch (e) {
        console.error("Error calculating expiration date:", e);
        return 'Invalid Date';
    }
}

async function loadContracts() {
    const q = query(collection(db, 'contracts')); // Later, add orderBy, etc.

    onSnapshot(q, async (snapshot) => { // Make the callback async
        if (snapshot.empty) {
            contractListContainer.innerHTML = '<p class="text-gray-500">No contracts found. Create one to get started!</p>';
            return;
        }

        contractListContainer.innerHTML = '<p class="text-gray-500">Loading contract details...</p>'; // Temp message

        // Use Promise.all to fetch option data concurrently if needed
        const contractPromises = snapshot.docs.map(async (docSnap) => {
            const contract = docSnap.data();
            const contractId = docSnap.id;
            let optionTitle = 'N/A';
            let signedDateStr = 'N/A';
            let expirationDateStr = 'N/A';
            let optionTerm = 0; // Store term for calculation

            // If signed, fetch the selected option details
            if ((contract.status === 'signed' || contract.status === 'locked') && contract.selectedOptionId) {
                try {
                    const optionRef = doc(db, 'contracts', contractId, 'options', contract.selectedOptionId);
                    const optionSnap = await getDoc(optionRef);
                    if (optionSnap.exists()) {
                        const optionData = optionSnap.data();
                        optionTitle = optionData.title || 'Unknown Option';
                        optionTerm = optionData.termMonths || 0;
                    }
                } catch (error) {
                    console.error(`Error fetching option ${contract.selectedOptionId} for contract ${contractId}:`, error);
                    optionTitle = 'Error loading option';
                }
            }

            // Format dates if available
            if (contract.signature && contract.signature.signedAt) {
                 try {
                     signedDateStr = new Date(contract.signature.signedAt).toLocaleDateString();
                     // Calculate expiration only if we have a term and signed date
                     if (optionTerm > 0) {
                         expirationDateStr = calculateExpirationDate(contract.signature.signedAt, optionTerm);
                     }
                 } catch (e) {
                     console.error("Error formatting date:", e);
                     signedDateStr = 'Invalid Date';
                 }
            }


            // Build HTML for this contract
            return `
                <div class="contract-list-item">
                    <div class="contract-details">
                        <h3 class="font-semibold text-gray-900">${contract.businessName}</h3>
                        <p class="text-sm text-gray-500">Service Addr: ${contract.serviceAddress}</p>
                        ${(contract.status === 'signed' || contract.status === 'locked') ? `
                        <p class="text-xs text-gray-500 mt-1">Option: <span class="font-medium text-gray-700">${optionTitle}</span></p>
                        <p class="text-xs text-gray-500">Signed: <span class="font-medium text-gray-700">${signedDateStr}</span> | Expires: <span class="font-medium text-gray-700">${expirationDateStr}</span></p>
                        ` : ''}
                    </div>
                    <div class="contract-actions">
                        <span class="contract-status-badge status-${contract.status}">${contract.status}</span>
                        <button class="btn btn-secondary-outline text-sm edit-btn" data-id="${contractId}">Edit</button>
                        <button class="btn btn-secondary-outline text-sm preview-btn" data-share-id="${contract.shareableId}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            Preview
                        </button>
                        <button class="btn btn-secondary-outline text-sm copy-link-btn" data-share-id="${contract.shareableId}">Copy Link</button>
                        <!-- ADDED DELETE BUTTON -->
                        <button class="btn btn-danger-outline text-sm delete-btn" data-id="${contractId}" data-name="${contract.businessName}">Delete</button>
                    </div>
                </div>
            `;
        });

        // Wait for all promises to resolve and then update the UI
        const contractHtmlElements = await Promise.all(contractPromises);
        contractListContainer.innerHTML = contractHtmlElements.join('');

    });
}


// --- MODAL & FORM CONTROLS ---

function showCreateForm() {
    currentEditingContractId = null;
    contractForm.reset();
    optionsContainer.innerHTML = '';
    multiSiteContainer.innerHTML = '';
    installationScheduleInput.value = '';
    billingAddressContainer.classList.add('hidden');
    billingSameAsService.checked = true;

    // Add one default option
    addOption();

    contractFormTitle.textContent = 'Create New Contract';
    saveContractBtn.querySelector('span').textContent = 'Save Contract as Draft';
    modal.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
}

function toggleBillingAddress() {
    billingAddressContainer.classList.toggle('hidden', billingSameAsService.checked);
}

// --- DYNAMIC FORM BUILDERS ---

function addSite() {
    const siteId = crypto.randomUUID();
    const siteEl = document.createElement('div');
    siteEl.id = `site-${siteId}`;
    siteEl.className = 'flex items-center space-x-2';
    siteEl.innerHTML = `
        <input type="text" class="form-input flex-grow site-address-input" placeholder="Enter additional service address">
        <button type="button" class="delete-btn text-red-500" data-target="site-${siteId}">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
    `;
    multiSiteContainer.appendChild(siteEl);
}

function addOption() {
    const optionId = crypto.randomUUID();
    const optionEl = document.createElement('div');
    optionEl.id = `option-${optionId}`;
    optionEl.className = 'option-card';
    optionEl.innerHTML = `
        <div class="option-card-header">
            <h4 class="option-card-title">New Option</h4>
            <button type="button" class="delete-btn text-red-500 font-bold text-lg" data-target="option-${optionId}">Delete Option</button>
        </div>
        <div class="option-card-body">
            <!-- Option Title & Term -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="form-label">Option Title</label>
                    <input type="text" class="form-input option-title" placeholder="e.g., Gold Package">
                </div>
                <div>
                    <label class="form-label">Term (Months)</label>
                    <input type="number" class="form-input option-term" value="36">
                </div>
            </div>

            <!-- Pricing Table -->
            <table class="pricing-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th class="w-20">Qty</th>
                        <th class="w-28">Monthly (MRC)</th>
                        <th class="w-28">One-Time (NRC)</th>
                        <th class="w-12"></th>
                    </tr>
                </thead>
                <tbody id="table-body-${optionId}">
                    <!-- JS adds rows here -->
                </tbody>
            </table>

            <!-- Add Row Buttons -->
            <div class="flex space-x-2 mt-2">
                <button type="button" class="btn btn-secondary-outline add-item-btn" data-target-table="table-body-${optionId}" data-type="item">
                    + Add Item
                </button>
                <button type="button" class="btn btn-secondary-outline add-item-btn" data-target-table="table-body-${optionId}" data-type="header">
                    + Add Header
                </button>
            </div>

            <!-- Totals Display -->
            <div class="option-card-totals mt-4">
                <div>Total MRC: <span class="total-mrc">$0.00</span></div>
                <div>Total NRC: <span class="total-nrc">$0.00</span></div>
            </div>
        </div>
    `;
    optionsContainer.appendChild(optionEl);

    // Add a default item row
    addTableRow(`table-body-${optionId}`, 'item');
}

function addTableRow(tableBodyId, type) {
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) return;

    const rowId = crypto.randomUUID();
    const row = document.createElement('tr');
    row.id = `row-${rowId}`;

    if (type === 'item') {
        row.className = 'line-item-row';
        row.dataset.type = 'item';
        row.innerHTML = `
            <td><input type="text" class="form-input item-description" placeholder="Service Description"></td>
            <td><input type="number" class="form-input item-qty recalculate" value="1" min="1"></td>
            <td><input type="text" class="form-input item-mrc recalculate" placeholder="0.00"></td>
            <td><input type="text" class="form-input item-nrc recalculate" placeholder="0.00"></td>
            <td class="text-center"><button type="button" class="delete-row-btn" data-target="row-${rowId}">&times;</button></td>
        `;
    } else if (type === 'header') {
        row.className = 'table-header-row';
        row.dataset.type = 'header';
        row.innerHTML = `
            <td colspan="4"><input type="text" class="form-input item-header" placeholder="e.g., Monthly Services"></td>
            <td class="text-center"><button type="button" class="delete-row-btn" data-target="row-${rowId}">&times;</button></td>
        `;
    }
    tableBody.appendChild(row);
}

function deleteElement(targetId) {
    const el = document.getElementById(targetId);
    if (el) {
        el.remove();
        // After deleting, recalculate if it was a table row
        const parentCard = el.closest('.option-card');
        if (parentCard) {
            calculateTotals(parentCard);
        }
    }
}

// --- DYNAMIC EVENT HANDLERS ---
function handleModalClick(e) {
    // Delete buttons (for sites, options, table rows)
    if (e.target.closest('.delete-btn')) {
        const targetId = e.target.closest('.delete-btn').dataset.target;
        deleteElement(targetId);
    }

    if (e.target.closest('.delete-row-btn')) {
        const targetId = e.target.closest('.delete-row-btn').dataset.target;
        deleteElement(targetId);
    }

    // Add table row buttons (item or header)
    if (e.target.closest('.add-item-btn')) {
        const btn = e.target.closest('.add-item-btn');
        const tableId = btn.dataset.targetTable;
        const type = btn.dataset.type;
        addTableRow(tableId, type);
    }
}

// Handles clicks on the main contract list
async function handleContractListClick(e) { // <-- Make async
    const btn = e.target.closest('button');
    if (!btn) return; // Exit if click wasn't on a button

    const shareId = btn.dataset.shareId;
    const contractId = btn.dataset.id;
    const contractName = btn.dataset.name; // Get name for confirmation

    // Handle Preview Button
    if (btn.classList.contains('preview-btn')) {
        if (shareId) {
            // Open the customer-facing view page in a new tab
            window.open(`view.html?id=${shareId}`, '_blank');
        } else {
            showToast('Contract does not have a shareable ID.', 'error');
        }
    }

    // Handle Copy Link Button
    if (btn.classList.contains('copy-link-btn')) {
        if (shareId) {
            const url = `${window.location.origin}/view.html?id=${shareId}`;
            navigator.clipboard.writeText(url).then(() => {
                showToast('Shareable link copied to clipboard!', 'success');
            }).catch(err => {
                console.error('Failed to copy: ', err);
                showToast('Failed to copy link.', 'error');
            });
        }
    }

    // Handle Edit Button
    if (btn.classList.contains('edit-btn')) {
        // TODO: Implement edit functionality
        showToast('Edit functionality is not yet implemented.', 'error');
    }

    // --- ADDED DELETE LOGIC ---
    if (btn.classList.contains('delete-btn')) {
        if (!contractId) return;

        // Use confirm() for simplicity, replace with custom modal later if desired
        if (confirm(`Are you sure you want to permanently delete the contract for "${contractName}"? This action cannot be undone.`)) {
            btn.disabled = true; // Disable button during deletion
            btn.textContent = 'Deleting...';
            try {
                // 1. Delete all options in the subcollection first
                const optionsRef = collection(db, 'contracts', contractId, 'options');
                const optionsSnapshot = await getDocs(optionsRef);
                const deletePromises = optionsSnapshot.docs.map(optionDoc => deleteDoc(optionDoc.ref));
                await Promise.all(deletePromises);
                console.log(`Deleted ${optionsSnapshot.size} options for contract ${contractId}`);

                // 2. Delete the main contract document
                await deleteDoc(doc(db, 'contracts', contractId));
                console.log(`Deleted contract ${contractId}`);
                showToast('Contract deleted successfully!', 'success');
                // The onSnapshot listener will automatically refresh the list

            } catch (error) {
                console.error("Error deleting contract:", error);
                showToast(`Error deleting contract: ${error.message}`, 'error');
                btn.disabled = false; // Re-enable button on error
                btn.textContent = 'Delete';
            }
        }
    }
    // --- END OF DELETE LOGIC ---
}


function handleModalInput(e) {
    // Recalculate totals on input
    if (e.target.classList.contains('recalculate')) {
        const optionCard = e.target.closest('.option-card');
        calculateTotals(optionCard);
    }

    // Update option card title as user types
    if (e.target.classList.contains('option-title')) {
        const optionCard = e.target.closest('.option-card');
        const title = e.target.value.trim() || 'New Option';
        optionCard.querySelector('.option-card-title').textContent = title;
    }

    // Auto-format currency
    if (e.target.classList.contains('item-mrc') || e.target.classList.contains('item-nrc')) {
        e.target.value = formatCurrency(e.target.value);
    }
}

// --- MATH & FORMATTING ---

function formatCurrency(value) {
    // Remove non-numeric characters except for one decimal point
    let num = value.replace(/[^0-9.]/g, '');
    let parts = num.split('.');
    if (parts.length > 2) {
        num = parts[0] + '.' + parts.slice(1).join('');
    }
    return num;
}

function parseCurrency(value) {
    const num = parseFloat(value.replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : num;
}

function calculateTotals(optionCard) {
    let totalMRC = 0;
    let totalNRC = 0;

    optionCard.querySelectorAll('.line-item-row').forEach(row => {
        const qty = parseInt(row.querySelector('.item-qty')?.value) || 1;
        const mrc = parseCurrency(row.querySelector('.item-mrc')?.value);
        const nrc = parseCurrency(row.querySelector('.item-nrc')?.value);

        totalMRC += qty * mrc;
        totalNRC += qty * nrc;
    });

    optionCard.querySelector('.total-mrc').textContent = `$${totalMRC.toFixed(2)}`;
    optionCard.querySelector('.total-nrc').textContent = `$${totalNRC.toFixed(2)}`;
}

// --- SAVE TO FIRESTORE ---

async function saveContract() {
    saveSpinner.classList.remove('hidden');
    saveContractBtn.disabled = true;

    try {
        // 1. Gather Global Contract Data
        const userInputSchedule = installationScheduleInput.value.trim();
        const fullInstallationSchedule = userInputSchedule ? `${userInputSchedule} ${installationScheduleSuffix}` : installationScheduleSuffix;

        const contractData = {
            businessName: document.getElementById('businessName').value,
            agentBusinessName: document.getElementById('agentBusinessName').value,
            customerEmail: document.getElementById('customerEmail').value,
            serviceAddress: document.getElementById('serviceAddress').value,
            isBillingSameAsService: billingSameAsService.checked,
            billingAddress: billingSameAsService.checked
                ? document.getElementById('serviceAddress').value
                : document.getElementById('billingAddress').value,
            installationScheduleText: fullInstallationSchedule,
            status: 'draft',
            shareableId: crypto.randomUUID().substring(0, 8),
            createdAt: new Date().toISOString(),
            adminId: currentUserId,
            multiSiteAddresses: [
                document.getElementById('serviceAddress').value,
                ...Array.from(document.querySelectorAll('.site-address-input'))
                         .map(input => input.value.trim())
                         .filter(Boolean)
            ]
        };

        // 2. Create the main contract document in Firestore
        // TODO: Add logic here to UPDATE if currentEditingContractId exists
        const contractDocRef = await addDoc(collection(db, 'contracts'), contractData);

        // 3. Gather and Save Options Data (as sub-collection documents)
        const optionCards = document.querySelectorAll('.option-card');

        for (const card of optionCards) {
            // Gather line items for this specific option
            const lineItems = [];
            card.querySelectorAll('tbody tr').forEach(row => {
                const type = row.dataset.type;
                if (type === 'item') {
                    lineItems.push({
                        type: 'item',
                        description: row.querySelector('.item-description').value,
                        qty: parseInt(row.querySelector('.item-qty').value) || 1,
                        mrc: parseCurrency(row.querySelector('.item-mrc').value),
                        nrc: parseCurrency(row.querySelector('.item-nrc').value)
                    });
                } else if (type === 'header') {
                    lineItems.push({
                        type: 'header',
                        value: row.querySelector('.item-header').value
                    });
                }
            });

            // Build the option data object
            const optionData = {
                title: card.querySelector('.option-title').value,
                termMonths: parseInt(card.querySelector('.option-term').value) || 36,
                totalMRC: parseCurrency(card.querySelector('.total-mrc').textContent),
                totalNRC: parseCurrency(card.querySelector('.total-nrc').textContent),
                lineItems: lineItems // Save the array of items/headers
            };

            // Save this option data as a new document in the 'options' sub-collection
            await addDoc(collection(db, 'contracts', contractDocRef.id, 'options'), optionData);
        }

        showToast('Contract saved successfully!', 'success');
        closeModal();

    } catch (error) {
        console.error("Error saving contract: ", error);
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        saveSpinner.classList.add('hidden');
        saveContractBtn.disabled = false;
    }
}


// --- UTILITIES ---
function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    toast.className = 'toast-notification'; // Reset classes

    if (type === 'error') {
        toast.classList.add('error');
    }

    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

