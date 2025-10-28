import {
  db, auth, googleProvider,
  collection, doc, addDoc, getDoc, setDoc, query, onSnapshot, collectionGroup,
  onAuthStateChanged, signInWithPopup, signOut,
  deleteDoc, getDocs, updateDoc // <-- Import updateDoc
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
const businessNameInput = document.getElementById('businessName');
const agentBusinessNameInput = document.getElementById('agentBusinessName');
const customerEmailInput = document.getElementById('customerEmail');
const serviceAddressInput = document.getElementById('serviceAddress');
const billingSameAsService = document.getElementById('billingSameAsService');
const billingAddressContainer = document.getElementById('billingAddressContainer');
const billingAddressInput = document.getElementById('billingAddress');
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
let currentEditingContractId = null; // Used to track if we are editing

// Fixed text for installation schedule
const installationScheduleSuffix = " Special installations, ad hoc requests, or delays caused by the Customer's vendor may extend timelines and potentially incur additional costs.";

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

// Resets form, clears dynamic sections, sets defaults
function resetAndPrepareCreateForm() {
    // currentEditingContractId = null; // <-- REMOVED THIS LINE
    contractForm.reset(); // Resets input values
    optionsContainer.innerHTML = ''; // Clear dynamic options
    multiSiteContainer.innerHTML = ''; // Clear dynamic sites
    installationScheduleInput.value = ''; // Clear schedule text area
    billingAddressContainer.classList.add('hidden'); // Hide billing address
    billingSameAsService.checked = true; // Set checkbox default

    // Don't add a default option here, let populateFormForEdit handle options
    // addOption(); // <-- REMOVED THIS LINE

    contractFormTitle.textContent = 'Create New Contract';
    saveContractBtn.querySelector('span').textContent = 'Save Contract as Draft';
}


function showCreateForm() {
    currentEditingContractId = null; // Explicitly set to null for CREATE
    resetAndPrepareCreateForm();
    addOption(); // Add the default first option ONLY when creating
    modal.classList.remove('hidden');
}


function closeModal() {
    modal.classList.add('hidden');
    // Important: Reset editing state when closing
    currentEditingContractId = null;
}

function toggleBillingAddress() {
    billingAddressContainer.classList.toggle('hidden', billingSameAsService.checked);
}

// --- EDIT FUNCTIONALITY ---

async function showEditForm(contractId) {
    if (!contractId) return;
    // Set the ID *before* calling reset, so reset knows not to nullify it (although we removed that line)
    // currentEditingContractId = contractId; // This is now set inside populateFormForEdit

    try {
        // 1. Fetch main contract document
        const contractRef = doc(db, 'contracts', contractId);
        const contractSnap = await getDoc(contractRef);
        if (!contractSnap.exists()) {
            throw new Error("Contract not found.");
        }
        const contractData = contractSnap.data();

        // 2. Fetch options subcollection
        const optionsRef = collection(db, 'contracts', contractId, 'options');
        const optionsSnap = await getDocs(optionsRef);
        // Pass the actual contract ID when mapping
        const optionsData = optionsSnap.docs.map(doc => ({ id: doc.id, contractId: contractId, ...doc.data() }));


        // 3. Populate the form
        populateFormForEdit(contractData, optionsData, contractId); // Pass contractId

        // 4. Show modal
        modal.classList.remove('hidden');

    } catch (error) {
        console.error("Error loading contract for edit:", error);
        showToast(`Error loading contract: ${error.message}`, 'error');
        currentEditingContractId = null; // Reset on error
    }
}

// Populates the entire modal form with data for editing
function populateFormForEdit(contractData, optionsData, contractId) { // Receive contractId
    // Reset form first (clears sites, options)
    resetAndPrepareCreateForm();
    currentEditingContractId = contractId; // Set the editing ID *after* reset

    // Fill basic fields
    businessNameInput.value = contractData.businessName || '';
    agentBusinessNameInput.value = contractData.agentBusinessName || '';
    customerEmailInput.value = contractData.customerEmail || '';
    serviceAddressInput.value = contractData.serviceAddress || '';

    // Handle billing address
    billingSameAsService.checked = contractData.isBillingSameAsService ?? true; // Default to true if undefined
    billingAddressInput.value = contractData.billingAddress || '';
    toggleBillingAddress(); // Show/hide based on checkbox

    // Populate Installation Schedule (remove suffix)
    let scheduleText = contractData.installationScheduleText || '';
    if (scheduleText.endsWith(installationScheduleSuffix)) {
        scheduleText = scheduleText.substring(0, scheduleText.length - installationScheduleSuffix.length).trim();
    }
    installationScheduleInput.value = scheduleText;


    // Populate multi-site addresses (skip the first one, which is the main service address)
    multiSiteContainer.innerHTML = ''; // Clear default if any
    contractData.multiSiteAddresses?.slice(1).forEach(address => {
        addSite(address); // Pass address to pre-fill
    });

    // Populate options
    optionsContainer.innerHTML = ''; // Clear the default option added by reset
    if (optionsData && optionsData.length > 0) {
        optionsData.forEach(option => {
            addOption(option); // Pass option data to pre-fill
        });
    } else {
        addOption(); // Add a blank option if none exist
    }


    // Update modal title and button text
    contractFormTitle.textContent = 'Edit Contract';
    saveContractBtn.querySelector('span').textContent = 'Update Contract';
}


// --- DYNAMIC FORM BUILDERS ---

// Modified addSite to accept an optional address for pre-filling
function addSite(address = '') {
    const siteId = crypto.randomUUID();
    const siteEl = document.createElement('div');
    siteEl.id = `site-${siteId}`;
    siteEl.className = 'flex items-center space-x-2';
    siteEl.innerHTML = `
        <input type="text" class="form-input flex-grow site-address-input" placeholder="Enter additional service address" value="${address || ''}">
        <button type="button" class="delete-btn text-red-500" data-target="site-${siteId}">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
    `;
    multiSiteContainer.appendChild(siteEl);
}


// Modified addOption to accept optional data for pre-filling
function addOption(optionData = null) {
    // Use existing option ID if available (from editing), else generate new one
    const optionId = optionData?.id || crypto.randomUUID();
    // Keep track of the *original* option ID from Firestore if editing
    const originalOptionId = optionData?.id || null;

    const optionEl = document.createElement('div');
    optionEl.id = `option-${optionId}`; // Use consistent ID for element
    optionEl.className = 'option-card';
    // Store original ID for potential update logic later if needed
    if (originalOptionId) {
        optionEl.dataset.originalId = originalOptionId;
    }

    // Use data if provided, otherwise default values
    const title = optionData?.title || 'New Option';
    const term = optionData?.termMonths || 36;

    optionEl.innerHTML = `
        <div class="option-card-header">
            <h4 class="option-card-title">${title}</h4>
            <button type="button" class="delete-btn text-red-500 font-bold text-lg" data-target="option-${optionId}">Delete Option</button>
        </div>
        <div class="option-card-body">
            <!-- Option Title & Term -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="form-label">Option Title</label>
                    <input type="text" class="form-input option-title" placeholder="e.g., Gold Package" value="${title || ''}">
                </div>
                <div>
                    <label class="form-label">Term (Months)</label>
                    <input type="number" class="form-input option-term" value="${term || ''}">
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

    // Populate line items if editing
    if (optionData?.lineItems && Array.isArray(optionData.lineItems)) {
        optionData.lineItems.forEach(item => {
            addTableRow(`table-body-${optionId}`, item.type, item); // Pass item data
        });
    } else {
        // Add a default item row only if creating a new option (optionData is null)
        if (!optionData) {
             addTableRow(`table-body-${optionId}`, 'item');
        }
    }
    // Calculate totals after populating
    calculateTotals(optionEl);
}


// Modified addTableRow to accept optional data for pre-filling
function addTableRow(tableBodyId, type, itemData = null) {
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) return;

    const rowId = crypto.randomUUID();
    const row = document.createElement('tr');
    row.id = `row-${rowId}`;

    if (type === 'item') {
        const desc = itemData?.description || '';
        const qty = itemData?.qty || 1;
        // Use ?? 0 before toFixed to handle potential undefined/null values safely
        const mrc = (itemData?.mrc ?? 0).toFixed(2);
        const nrc = (itemData?.nrc ?? 0).toFixed(2);
        row.className = 'line-item-row';
        row.dataset.type = 'item';
        row.innerHTML = `
            <td><input type="text" class="form-input item-description" placeholder="Service Description" value="${desc || ''}"></td>
            <td><input type="number" class="form-input item-qty recalculate" value="${qty || ''}" min="1"></td>
            <td><input type="text" class="form-input item-mrc recalculate" placeholder="0.00" value="${mrc || ''}"></td>
            <td><input type="text" class="form-input item-nrc recalculate" placeholder="0.00" value="${nrc || ''}"></td>
            <td class="text-center"><button type="button" class="delete-row-btn" data-target="row-${rowId}">&times;</button></td>
        `;
    } else if (type === 'header') {
        const value = itemData?.value || '';
        row.className = 'table-header-row';
        row.dataset.type = 'header';
        row.innerHTML = `
            <td colspan="4"><input type="text" class="form-input item-header" placeholder="e.g., Monthly Services" value="${value || ''}"></td>
            <td class="text-center"><button type="button" class="delete-row-btn" data-target="row-${rowId}">&times;</button></td>
        `;
    }
    tableBody.appendChild(row);
}


function deleteElement(targetId) {
    const el = document.getElementById(targetId);
    if (el) {
        el.remove();
        // After deleting, recalculate if it was a table row within an option card
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
async function handleContractListClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return; // Exit if click wasn't on a button

    const shareId = btn.dataset.shareId;
    const contractId = btn.dataset.id;
    const contractName = btn.dataset.name; // Get name for confirmation

    // Handle Preview Button
    if (btn.classList.contains('preview-btn')) {
        if (shareId) {
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

    // --- UPDATED EDIT LOGIC ---
    if (btn.classList.contains('edit-btn')) {
        if (contractId) {
            // Check if contract is signed or locked - prevent editing
            const contractRef = doc(db, 'contracts', contractId);
            const contractSnap = await getDoc(contractRef);
            if (contractSnap.exists()) {
                const status = contractSnap.data().status;
                if (status === 'signed' || status === 'locked') {
                    // Consider allowing unlock here in the future
                    alert('Cannot edit a signed or locked contract.'); // Simplified message
                    return;
                }
            } else {
                 alert('Contract not found.'); // Handle case where doc might be deleted
                 return;
            }
            // Proceed to show edit form
            showEditForm(contractId);
        }
    }
    // --- END EDIT LOGIC UPDATE ---

    // Handle Delete Button
    if (btn.classList.contains('delete-btn')) {
        if (!contractId) return;

        if (confirm(`Are you sure you want to permanently delete the contract for "${contractName || 'this contract'}"? This action cannot be undone.`)) {
            btn.disabled = true;
            btn.textContent = 'Deleting...';
            try {
                // Delete subcollection options
                const optionsRef = collection(db, 'contracts', contractId, 'options');
                const optionsSnapshot = await getDocs(optionsRef);
                const deletePromises = optionsSnapshot.docs.map(optionDoc => deleteDoc(optionDoc.ref));
                await Promise.all(deletePromises);

                // Delete main document
                await deleteDoc(doc(db, 'contracts', contractId));

                showToast('Contract deleted successfully!', 'success');
                // No need to manually refresh list, onSnapshot handles it
            } catch (error) {
                console.error("Error deleting contract:", error);
                showToast(`Error deleting contract: ${error.message}`, 'error');
                // Re-enable button on error, only if it still exists in the DOM
                const stillExistsBtn = document.querySelector(`.delete-btn[data-id="${contractId}"]`);
                if(stillExistsBtn) {
                    stillExistsBtn.disabled = false;
                    stillExistsBtn.textContent = 'Delete';
                }
            }
        }
    }
}


function handleModalInput(e) {
    // Recalculate totals on input
    if (e.target.classList.contains('recalculate')) {
        const optionCard = e.target.closest('.option-card');
        if(optionCard) calculateTotals(optionCard); // Add null check
    }

    // Update option card title as user types
    if (e.target.classList.contains('option-title')) {
        const optionCard = e.target.closest('.option-card');
        if(optionCard) {
            const title = e.target.value.trim() || 'New Option';
            optionCard.querySelector('.option-card-title').textContent = title;
        }
    }

    // Auto-format currency on input
    if (e.target.classList.contains('item-mrc') || e.target.classList.contains('item-nrc')) {
        // Simple validation - allow numbers and one decimal
        e.target.value = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    }
}


// --- MATH & FORMATTING ---

function formatCurrency(value) {
    // This function seems less useful now with the input handler,
    // might be better used for display formatting if needed elsewhere.
    let num = value.replace(/[^0-9.]/g, '');
    let parts = num.split('.');
    if (parts.length > 2) {
        num = parts[0] + '.' + parts.slice(1).join('');
    }
    return num;
}


function parseCurrency(value) {
    // If value is already a number, return it, otherwise parse
    if (typeof value === 'number') return value;
    const num = parseFloat(String(value).replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : num;
}


function calculateTotals(optionCard) {
    if (!optionCard) return; // Add null check

    let totalMRC = 0;
    let totalNRC = 0;

    optionCard.querySelectorAll('.line-item-row').forEach(row => {
        const qty = parseInt(row.querySelector('.item-qty')?.value) || 1;
        const mrc = parseCurrency(row.querySelector('.item-mrc')?.value);
        const nrc = parseCurrency(row.querySelector('.item-nrc')?.value);

        totalMRC += qty * mrc;
        totalNRC += qty * nrc;
    });

    const mrcSpan = optionCard.querySelector('.total-mrc');
    const nrcSpan = optionCard.querySelector('.total-nrc');
    if (mrcSpan) mrcSpan.textContent = `$${totalMRC.toFixed(2)}`;
    if (nrcSpan) nrcSpan.textContent = `$${totalNRC.toFixed(2)}`;
}


// --- SAVE TO FIRESTORE (MODIFIED FOR CREATE/UPDATE) ---

async function saveContract() {
    saveSpinner.classList.remove('hidden');
    saveContractBtn.disabled = true;
    const isEditing = !!currentEditingContractId; // Check if we are editing

    try {
        // 1. Gather Global Contract Data
        const userInputSchedule = installationScheduleInput.value.trim();
        // Append suffix only if user provided input
        const fullInstallationSchedule = userInputSchedule ? `${userInputSchedule}${installationScheduleSuffix}` : '';

        const contractData = {
            businessName: businessNameInput.value.trim(),
            agentBusinessName: agentBusinessNameInput.value.trim(),
            customerEmail: customerEmailInput.value.trim(),
            serviceAddress: serviceAddressInput.value.trim(),
            isBillingSameAsService: billingSameAsService.checked,
            billingAddress: billingSameAsService.checked
                ? serviceAddressInput.value.trim() // Use trimmed service address
                : billingAddressInput.value.trim(), // Use trimmed billing address
            installationScheduleText: fullInstallationSchedule,
            // Don't update status, shareableId, createdAt when editing
            adminId: currentUserId,
            multiSiteAddresses: [
                serviceAddressInput.value.trim(), // Ensure first address is trimmed
                ...Array.from(document.querySelectorAll('.site-address-input'))
                         .map(input => input.value.trim()) // Trim all site addresses
                         .filter(Boolean) // Filter out empty strings
            ].filter((addr, index, self) => addr && self.indexOf(addr) === index) // Ensure unique and non-empty
        };

        // Validate required fields
        if (!contractData.businessName || !contractData.customerEmail || !contractData.serviceAddress) {
            throw new Error("Business Name, Customer Email, and Service Address are required.");
        }


        let contractDocRef;
        let contractId;

        if (isEditing) {
            // --- UPDATE LOGIC ---
            contractId = currentEditingContractId;
            contractDocRef = doc(db, 'contracts', contractId);
            // Don't update shareableId or createdAt on update
            // Status also shouldn't be reset to 'draft' here
            await updateDoc(contractDocRef, contractData);
            console.log(`Updated main contract doc: ${contractId}`);

            // Delete existing options before adding new/updated ones
            const optionsRef = collection(db, 'contracts', contractId, 'options');
            const optionsSnapshot = await getDocs(optionsRef);
            const deletePromises = optionsSnapshot.docs.map(optionDoc => deleteDoc(optionDoc.ref));
            await Promise.all(deletePromises);
            console.log(`Deleted ${optionsSnapshot.size} existing options for update.`);

        } else {
            // --- CREATE LOGIC ---
            contractData.status = 'draft'; // Set initial status
            contractData.shareableId = crypto.randomUUID().substring(0, 8); // Generate share ID
            contractData.createdAt = new Date().toISOString(); // Set creation time
            const addedDoc = await addDoc(collection(db, 'contracts'), contractData);
            contractId = addedDoc.id; // Get the ID of the newly created doc
            contractDocRef = doc(db, 'contracts', contractId); // Reference it for adding options
            console.log(`Created new contract doc: ${contractId}`);
        }

        // 3. Gather and Save Options Data (Works for both Create and Update)
        const optionCards = document.querySelectorAll('.option-card');
        if (optionCards.length === 0) {
            throw new Error("At least one contract option is required.");
        }

        for (const card of optionCards) {
            const lineItems = [];
            card.querySelectorAll('tbody tr').forEach(row => {
                const type = row.dataset.type;
                if (type === 'item') {
                    const description = row.querySelector('.item-description')?.value.trim();
                    if(!description) return; // Skip items without description
                    lineItems.push({
                        type: 'item',
                        description: description,
                        qty: parseInt(row.querySelector('.item-qty')?.value) || 1,
                        mrc: parseCurrency(row.querySelector('.item-mrc')?.value),
                        nrc: parseCurrency(row.querySelector('.item-nrc')?.value)
                    });
                } else if (type === 'header') {
                     const value = row.querySelector('.item-header')?.value.trim();
                     if(!value) return; // Skip empty headers
                    lineItems.push({
                        type: 'header',
                        value: value
                    });
                }
            });

            // Ensure at least one line item exists per option
            if (lineItems.length === 0) {
                 console.warn(`Skipping option "${card.querySelector('.option-title')?.value}" because it has no line items.`);
                 continue; // Don't save options without items
            }

            const optionData = {
                title: card.querySelector('.option-title')?.value.trim() || 'Untitled Option',
                termMonths: parseInt(card.querySelector('.option-term')?.value) || 36,
                totalMRC: parseCurrency(card.querySelector('.total-mrc')?.textContent),
                totalNRC: parseCurrency(card.querySelector('.total-nrc')?.textContent),
                lineItems: lineItems
            };

            // Add the option as a new document in the 'options' subcollection
            await addDoc(collection(contractDocRef, 'options'), optionData);
        }
        console.log(`Saved options for contract ${contractId}.`);

        showToast(`Contract ${isEditing ? 'updated' : 'saved'} successfully!`, 'success');
        closeModal(); // Also resets currentEditingContractId

    } catch (error) {
        console.error(`Error ${isEditing ? 'updating' : 'saving'} contract: `, error);
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        saveSpinner.classList.add('hidden');
        // Re-enable button regardless of success/error
        saveContractBtn.disabled = false;
        // Reset button text just in case
        saveContractBtn.querySelector('span').textContent = isEditing ? 'Update Contract' : 'Save Contract as Draft';
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

