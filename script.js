document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // == YOUR FIREBASE CONFIGURATION ==
    // =================================================================
    const firebaseConfig = {
      apiKey: "AIzaSyCiOVq6FSrrJEacCsBDOFxtMPkgTGFaSes",
      authDomain: "aero-user-agent-tool.firebaseapp.com",
      projectId: "aero-user-agent-tool",
      storageBucket: "aero-user-agent-tool.appspot.com", // Corrected domain
      messagingSenderId: "292085315062",
      appId: "1:292085315062:web:74d8d8ff0782b9f81083d7",
      measurementId: "G-8XR5J0JK4Y"
    };
    // =================================================================

    try {
        firebase.initializeApp(firebaseConfig);
    } catch (e) {
        console.error("Firebase initialization failed. Please check your config and HTML script tags.", e);
        const systemMessage = document.getElementById('system-message') || document.querySelector('.header p');
        if (systemMessage) {
            systemMessage.textContent = "FATAL ERROR: Could not connect to the database.";
            systemMessage.style.color = '#ff4757';
        }
        return; // Stop execution if Firebase fails
    }

    const db = firebase.firestore();
    const ADMIN_PASSCODE = "123456789"; // Your secret admin passcode

    // Reusable Notification Handler
    function showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '❌';
        toast.innerHTML = `<div class="icon">${icon}</div><div class="message">${message}</div>`;
        container.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 4500);
    }

    // --- Main Logic Router ---
    if (document.getElementById('request-btn')) {
        handleUserPage(db, showNotification);
    } else if (document.getElementById('upload-btn')) {
        handleAdminPage(db, ADMIN_PASSCODE, showNotification);
    }
});

// =================================================
// == USER PAGE LOGIC (FOR USER AGENTS)
// =================================================
function handleUserPage(db, showNotification) {
    const statsCountEl = document.getElementById('stats-count');
    const requestBtn = document.getElementById('request-btn');
    const userAgentDisplayEl = document.getElementById('user-agent-display');
    const userAgentTextEl = document.getElementById('user-agent-text');
    const profileNameEl = document.getElementById('profile-name-text');
    const resolutionEl = document.getElementById('resolution-text');
    const osEl = document.getElementById('os-text');

    // Real-time listener for stats
    db.collection('user_agents').where('status', '==', 0).onSnapshot(snapshot => {
        statsCountEl.textContent = snapshot.size;
    }, error => {
        console.error("Firestore listener error:", error);
        showNotification("DB connection issue for stats.", "error");
    });

    requestBtn.addEventListener('click', async () => {
        requestBtn.disabled = true;
        requestBtn.querySelector('.btn-text').textContent = 'REQUESTING...';
        showNotification("Requesting new agent...", "info");
        
        try {
            const query = db.collection('user_agents').where('status', '==', 0).limit(1);
            const snapshot = await query.get();
            if (snapshot.empty) throw new Error("SYSTEM EMPTY");

            const agentDoc = snapshot.docs[0];
            const agentData = agentDoc.data();
            
            await db.collection('user_agents').doc(agentDoc.id).update({ status: 1 });

            // Populate UI with all details
            userAgentTextEl.textContent = agentData.User_Agent;
            profileNameEl.textContent = agentData.Profile_Name || "N/A";
            resolutionEl.textContent = agentData.Resolution || "N/A";
            osEl.textContent = agentData.OS || "N/A";

            showNotification("New agent received!", "success");
        } catch (error) {
            showNotification(error.message, "error");
        } finally {
            requestBtn.disabled = false;
            requestBtn.querySelector('.btn-text').textContent = 'REQUEST AGENT';
        }
    });

    userAgentDisplayEl.addEventListener('click', () => {
        const text = userAgentTextEl.textContent;
        if (text && !text.startsWith("Request an agent")) {
            navigator.clipboard.writeText(text)
                .then(() => showNotification(`Copied User Agent!`, "success"))
                .catch(() => showNotification("Failed to copy.", "error"));
        }
    });
}

// =================================================
// == ADMIN PAGE LOGIC (FOR CSV UPLOAD & DELETE)
// =================================================
function handleAdminPage(db, ADMIN_PASSCODE, showNotification) {
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('csv-file-input');
    const passcode_input = document.getElementById('passcode-input');
    const fileNameDisplay = document.getElementById('file-name-display');
    const batchListEl = document.getElementById('batch-list');
    let fileToUpload = null;

    fileInput.addEventListener('change', (event) => {
        fileToUpload = event.target.files[0];
        fileNameDisplay.textContent = fileToUpload ? fileToUpload.name : "Click to select a .csv file";
    });

    uploadBtn.addEventListener('click', () => {
        if (passcode_input.value !== ADMIN_PASSCODE) { showNotification('Invalid Passcode!', 'error'); return; }
        if (!fileToUpload) { showNotification('Please select a CSV file first.', 'error'); return; }

        uploadBtn.disabled = true;
        uploadBtn.querySelector('.btn-text').textContent = 'PARSING...';

        Papa.parse(fileToUpload, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const records = results.data;
                const batchId = Date.now().toString();

                if (records.length === 0) {
                    showNotification('CSV is empty or invalid.', 'error');
                    uploadBtn.disabled = false; return;
                }
                
                uploadBtn.querySelector('.btn-text').textContent = 'UPLOADING...';
                showNotification(`Uploading ${records.length} records...`, 'info');

                const chunks = [];
                for (let i = 0; i < records.length; i += 499) { chunks.push(records.slice(i, i + 499)); }

                try {
                    for (const chunk of chunks) {
                        const batch = db.batch();
                        chunk.forEach(record => {
                            if (record.User_Agent) {
                                const docRef = db.collection('user_agents').doc();
                                batch.set(docRef, {
                                    Profile_Name: record.Profile_Name || "N/A",
                                    User_Agent: record.User_Agent,
                                    Resolution: record.Resolution || "N/A",
                                    OS: record.OS || "N/A",
                                    status: 0,
                                    batch_id: batchId
                                });
                            }
                        });
                        await batch.commit();
                    }
                    showNotification(`Successfully uploaded ${records.length} records!`, 'success');
                    loadBatches();
                } catch (error) {
                    showNotification(`Upload Error: ${error.message}`, 'error');
                } finally {
                    uploadBtn.disabled = false;
                    uploadBtn.querySelector('.btn-text').textContent = 'UPLOAD AGENTS';
                    fileInput.value = '';
                    fileNameDisplay.textContent = "Click to select a .csv file";
                    fileToUpload = null;
                }
            }
        });
    });

    async function loadBatches() {
        batchListEl.innerHTML = '<li class="history-placeholder">Loading...</li>';
        const snapshot = await db.collection('user_agents').get();
        const batches = {};

        snapshot.forEach(doc => {
            const batchId = doc.data().batch_id;
            if (batchId) {
                if (!batches[batchId]) batches[batchId] = 0;
                batches[batchId]++;
            }
        });
        
        batchListEl.innerHTML = '';
        const sortedBatchIds = Object.keys(batches).sort((a, b) => b - a); // Sort newest first

        if(sortedBatchIds.length === 0) {
            batchListEl.innerHTML = '<li class="history-placeholder">No batches found.</li>'; return;
        }

        sortedBatchIds.forEach(batchId => {
            const date = new Date(parseInt(batchId)).toLocaleString();
            const count = batches[batchId];
            const item = document.createElement('li');
            item.className = 'batch-item';
            item.innerHTML = `<p><strong>${date}</strong> (${count} agents)</p><button class="delete-btn" data-batch-id="${batchId}">Delete</button>`;
            batchListEl.appendChild(item);
        });
    }
    
    batchListEl.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const batchId = e.target.dataset.batchId;
            if (confirm(`Delete this entire batch? This cannot be undone.`)) {
                showNotification(`Deleting batch ${batchId}...`, 'info');
                e.target.disabled = true;
                e.target.textContent = 'Deleting...';
                
                const query = db.collection('user_agents').where('batch_id', '==', batchId);
                const snapshot = await query.get();
                
                const chunks = [];
                for (let i = 0; i < snapshot.docs.length; i += 499) {
                    chunks.push(snapshot.docs.slice(i, i + 499));
                }
                
                for (const chunk of chunks) {
                    const batch = db.batch();
                    chunk.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                }
                
                showNotification(`Batch deleted successfully!`, 'success');
                loadBatches();
            }
        }
    });

    loadBatches();
}