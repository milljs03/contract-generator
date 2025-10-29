/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// Import necessary modules
const { onCall, HttpsOptions } = require("firebase-functions/v2/https"); // Use v2 onCall
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const fetch = require("node-fetch"); // Make sure to install this!

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

// --- Configuration ---
// This is the Google Apps Script URL used for sending emails
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxdBbGvicm3MahVg6jIMHT6vLc0eGi6ahSyupDIuMfHXgIeFojWhnZAGo1mtdif_ZFz/exec"; // Replace if different
// Define CORS options - Allow requests from your local dev server and deployed site
const corsOptions = {
    cors: [
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://cfn-contract.web.app" // Replace with your actual deployed URL
        // Add any other origins if needed
    ],
};

// --- Helper Functions ---

/**
 * Helper function to send email via your Google Apps Script.
 * Includes hardcoded CCs.
 */
async function sendEmail(to, subject, htmlBody) {
  // Always send to these specific emails
  const alwaysSendTo = ['jmiller@nptel.com'];

  // Use a Set to avoid sending duplicate emails
  const recipients = new Set([...to, ...alwaysSendTo]);
  const finalRecipients = Array.from(recipients);

  if (!finalRecipients || finalRecipients.length === 0) {
    logger.log("No recipients, skipping email send.");
    return;
  }

  logger.log(`Sending email via Apps Script to: ${finalRecipients.join(", ")}`);

  try {
    await fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'cors', // Although calling from backend, keep mode consistent if script expects it
      credentials: 'omit',
      redirect: 'follow',
      body: JSON.stringify({
        to: finalRecipients.join(','),
        subject: subject,
        htmlBody: htmlBody,
      }),
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
    });
    logger.log("Email request sent successfully to Apps Script.");
  } catch (error) {
    logger.error("Error calling Google Apps Script:", error);
    // Decide if you want to throw the error to let the client know
    // throw new functions.https.HttpsError('internal', 'Failed to send email via Apps Script.');
  }
}

/**
 * Helper function to create a simple HTML table for line items.
 */
function createLineItemsHtmlTable(lineItems) {
    if (!lineItems || lineItems.length === 0) return '<p>No line items available.</p>';

    let tableRows = '';
    lineItems.forEach(item => {
        if (item.type === 'header') {
            tableRows += `<tr><td colspan="4" style="background-color: #f3f4f6; font-weight: bold; padding: 5px; border-top: 1px solid #ddd;">${item.value}</td></tr>`;
        } else if (item.type === 'item') {
            const mrc = typeof item.mrc === 'number' ? item.mrc.toFixed(2) : '0.00';
            const nrc = typeof item.nrc === 'number' ? item.nrc.toFixed(2) : '0.00';
            tableRows += `
                <tr>
                    <td style="padding: 5px; border-bottom: 1px solid #eee;">${item.description}</td>
                    <td style="padding: 5px; border-bottom: 1px solid #eee; text-align: center;">${item.qty}</td>
                    <td style="padding: 5px; border-bottom: 1px solid #eee; text-align: right;">$${mrc}</td>
                    <td style="padding: 5px; border-bottom: 1px solid #eee; text-align: right;">$${nrc}</td>
                </tr>`;
        }
    });

    return `
        <table style="width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 10px;">
            <thead style="background-color: #f9fafb;">
                <tr>
                    <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ccc;">Description</th>
                    <th style="text-align: center; padding: 8px; border-bottom: 2px solid #ccc;">Qty</th>
                    <th style="text-align: right; padding: 8px; border-bottom: 2px solid #ccc;">MRC</th>
                    <th style="text-align: right; padding: 8px; border-bottom: 2px solid #ccc;">NRC</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>`;
}


// --- Main Cloud Function ---

/**
 * This function sends a confirmation email after a contract is signed.
 * It's triggered via HTTPS call from the view.js script.
 * Includes CORS configuration.
 */
exports.sendSignedConfirmationEmail = onCall(corsOptions, async (request) => {
    const data = request.data;
    logger.log("Received request to send confirmation email with data:", data);

    // Validate incoming data
    if (!data.toEmail || !data.contractId || !data.optionTitle || !data.selectedOptionId) {
        logger.error("Missing required data (toEmail, contractId, optionTitle, selectedOptionId).");
        // Throwing an HttpsError automatically sends a structured error back to the client
        throw new functions.https.HttpsError('invalid-argument', 'Missing required data.');
    }

    // Fetch line items for the chosen option to include in email
    let lineItemsHtml = '<p>(Line item details could not be loaded.)</p>'; // Default/Fallback
    try {
        const optionRef = db.doc(`contracts/${data.contractId}/options/${data.selectedOptionId}`);
        const optionSnap = await optionRef.get();
        // --- THIS IS THE FIX ---
        if (optionSnap.exists) { // Check if the document exists using the exists *property*
             const optionData = optionSnap.data();
             // Check if optionData actually has a lineItems property before creating table
             if (optionData && optionData.lineItems) {
                lineItemsHtml = createLineItemsHtmlTable(optionData.lineItems);
             } else {
                 logger.warn(`Option document ${data.selectedOptionId} exists but contains no lineItems field.`);
                 lineItemsHtml = '<p>(Option selected, but no line item details were saved.)</p>';
             }
        // --- END OF FIX ---
        } else {
             logger.warn(`Option document ${data.selectedOptionId} not found for contract ${data.contractId}.`);
        }
    } catch(err) {
        logger.error(`Error fetching line items for option ${data.selectedOptionId}: ${err.message}`);
        // Continue without line items, but log the error
    }


    // Construct the Email Body
    const subject = `Contract Signed Confirmation: ${data.businessName} - ${data.optionTitle}`;
    const body = `
        <html><body>
        <p>Hello ${data.signerName || 'Customer'},</p>
        <p>Thank you for signing the Service Agreement with Community Fiber Network (CFN) for <strong>${data.businessName}</strong>.</p>
        <p>This email confirms your selection and signing details:</p>
        <div style="background-color: #f9f9f9; border: 1px solid #eee; padding: 15px; margin: 15px 0;">
            <h3 style="margin-top: 0;">Selected Option:</h3>
            <ul>
                <li><strong>Title:</strong> ${data.optionTitle}</li>
                <li><strong>Term:</strong> ${data.optionTerm} Months</li>
                <li><strong>Total Monthly Recurring Charge (MRC):</strong> $${data.optionMRC}</li>
                <li><strong>Total Non-Recurring Charge (NRC):</strong> $${data.optionNRC}</li>
            </ul>

            <!-- Include Line Item Table -->
            <div style="margin-top: 15px;">
                <h4 style="margin-bottom: 5px;">Line Item Summary:</h4>
                ${lineItemsHtml}
            </div>
        </div>

        <p><strong>Signed By:</strong> ${data.signerName || 'N/A'}</p>
        <p><strong>Date Signed:</strong> ${data.signedDate || 'N/A'}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p>You can view the full signed contract details online at any time by visiting the link below:</p>
        <p><a href="${data.contractLink}" style="color: #2563EB; text-decoration: none;">View Signed Contract</a></p>
        <p style="margin-top: 20px;">If you have any questions, please contact your CFN representative.</p>
        <br>
        <p>Sincerely,</p>
        <p>The Community Fiber Network Team</p>
        </body></html>
    `;

    // Send the email using your helper
    try {
        // Pass only the customer email here. The helper adds admins.
        await sendEmail([data.toEmail], subject, body);
        logger.log(`Confirmation email request successfully sent for ${data.toEmail}`);
        // Return success status to the client
        return { success: true };
    } catch (error) {
        // Error is already logged in sendEmail helper, just return failure status
        logger.error("Failed to complete sendSignedConfirmationEmail function.");
        // Throwing error sends structured response back to client's catch block
        throw new functions.https.HttpsError('internal', 'Failed to send confirmation email.');
    }
});

