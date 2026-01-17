// ============================================
// AERO AGENT SYSTEM - Professional Edition
// ============================================

import { firebase } from "firebase/app"
import "firebase/firestore"
import Papa from "papaparse"

document.addEventListener("DOMContentLoaded", () => {
  const firebaseConfig = {
    apiKey: "AIzaSyCiOVq6FSrrJEacCsBDOFxtMPkgTGFaSes",
    authDomain: "aero-user-agent-tool.firebaseapp.com",
    projectId: "aero-user-agent-tool",
    storageBucket: "aero-user-agent-tool.appspot.com",
    messagingSenderId: "292085315062",
    appId: "1:292085315062:web:74d8d8ff0782b9f81083d7",
    measurementId: "G-8XR5J0JK4Y",
  }

  // Initialize Firebase
  const app = firebase.initializeApp(firebaseConfig)
  const db = firebase.firestore(app)

  const ADMIN_PASSCODE = "123456789"

  function showNotification(message, type = "info") {
    const container = document.getElementById("notification-container")
    if (!container) return

    const toast = document.createElement("div")
    toast.className = `toast-notification ${type}`

    const iconMap = {
      success: "✓",
      error: "✕",
      warning: "!",
      info: "ℹ",
    }

    const icon = iconMap[type] || "i"
    toast.innerHTML = `<div class="icon">${icon}</div><div class="message">${message}</div>`

    container.appendChild(toast)

    // Auto-remove after 4 seconds
    setTimeout(() => {
      toast.style.animation = "slideOutRight 0.4s ease forwards"
      setTimeout(() => toast.remove(), 400)
    }, 4000)
  }

  // Theme Toggle Handler
  const themeToggle = document.getElementById("theme-toggle")
  const html = document.documentElement

  // Load saved theme preference
  const savedTheme = localStorage.getItem("theme") || "dark-mode"
  html.className = savedTheme

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const currentTheme = html.className
      const newTheme = currentTheme === "dark-mode" ? "light-mode" : "dark-mode"
      html.className = newTheme
      localStorage.setItem("theme", newTheme)
    })
  }

  // Route to appropriate page handler
  if (document.getElementById("request-btn")) {
    handleUserPage(db, showNotification)
  } else if (document.getElementById("upload-btn")) {
    handleAdminPage(db, ADMIN_PASSCODE, showNotification)
  }
})

// ============================================
// USER PAGE HANDLER
// ============================================
function handleUserPage(db, showNotification) {
  const statsCountEl = document.getElementById("stats-count")
  const requestBtn = document.getElementById("request-btn")
  const userAgentDisplayEl = document.getElementById("user-agent-display")
  const userAgentTextEl = document.getElementById("user-agent-text")
  const profileNameEl = document.getElementById("profile-name-text")
  const resolutionEl = document.getElementById("resolution-text")
  const osEl = document.getElementById("os-text")

  // Set up real-time listener for available agents count
  db.collection("user_agents")
    .where("status", "==", 0)
    .onSnapshot(
      (snapshot) => {
        statsCountEl.textContent = snapshot.size
      },
      (error) => {
        console.error("Firestore listener error:", error)
        statsCountEl.textContent = "0"
        showNotification("Unable to connect to database", "error")
      },
    )

  // Request Agent Button Handler
  requestBtn.addEventListener("click", async () => {
    if (requestBtn.disabled) return

    requestBtn.disabled = true
    const originalText = requestBtn.querySelector(".btn-text").textContent
    requestBtn.querySelector(".btn-text").textContent = "REQUESTING..."

    try {
      // Get first available agent
      const snapshot = await db.collection("user_agents").where("status", "==", 0).limit(1).get()

      if (snapshot.empty) {
        showNotification("No agents available. Please try again later.", "warning")
        requestBtn.disabled = false
        requestBtn.querySelector(".btn-text").textContent = originalText
        return
      }

      const agentDoc = snapshot.docs[0]
      const agentData = agentDoc.data()

      // Update document status to 1 (used)
      await db.collection("user_agents").doc(agentDoc.id).update({ status: 1 })

      // Update UI with new agent data
      userAgentTextEl.textContent = agentData.User_Agent || "N/A"
      profileNameEl.textContent = agentData.Profile_Name || "N/A"
      resolutionEl.textContent = agentData.Resolution || "N/A"
      osEl.textContent = agentData.OS || "N/A"

      showNotification("Agent received successfully!", "success")
    } catch (error) {
      console.error("Error requesting agent:", error)
      showNotification("Failed to request agent. Try again.", "error")
    } finally {
      requestBtn.disabled = false
      requestBtn.querySelector(".btn-text").textContent = originalText
    }
  })

  // Copy to Clipboard on User Agent Click
  userAgentDisplayEl.addEventListener("click", () => {
    const text = userAgentTextEl.textContent
    if (text && !text.startsWith("Request an agent")) {
      navigator.clipboard
        .writeText(text)
        .then(() => showNotification("User Agent copied to clipboard!", "success"))
        .catch(() => showNotification("Failed to copy. Try again.", "error"))
    }
  })
}

// ============================================
// ADMIN PAGE HANDLER
// ============================================
function handleAdminPage(db, ADMIN_PASSCODE, showNotification) {
  const uploadBtn = document.getElementById("upload-btn")
  const fileInput = document.getElementById("csv-file-input")
  const passcodeInput = document.getElementById("passcode-input")
  const fileNameDisplay = document.getElementById("file-name-display")
  const batchListEl = document.getElementById("batch-list")

  let fileToUpload = null

  // File Input Change Handler
  fileInput.addEventListener("change", (event) => {
    fileToUpload = event.target.files[0]
    if (fileToUpload) {
      if (!fileToUpload.name.endsWith(".csv")) {
        showNotification("Please select a valid CSV file", "error")
        fileToUpload = null
        fileInput.value = ""
        fileNameDisplay.textContent = "Click to select a .csv file"
        return
      }
      fileNameDisplay.textContent = fileToUpload.name
    }
  })

  // Upload Button Handler
  uploadBtn.addEventListener("click", async () => {
    // Validation
    if (passcodeInput.value !== ADMIN_PASSCODE) {
      showNotification("Invalid passcode!", "error")
      passcodeInput.focus()
      return
    }

    if (!fileToUpload) {
      showNotification("Please select a CSV file first", "error")
      fileInput.click()
      return
    }

    // Start upload process
    uploadBtn.disabled = true
    const originalText = uploadBtn.querySelector(".btn-text").textContent
    uploadBtn.querySelector(".btn-text").textContent = "PARSING..."

    // Parse CSV using PapaParse
    Papa.parse(fileToUpload, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: async (results) => {
        const records = results.data.filter((r) => r.User_Agent && r.User_Agent.trim())

        if (records.length === 0) {
          showNotification("CSV file is empty or invalid", "error")
          uploadBtn.disabled = false
          uploadBtn.querySelector(".btn-text").textContent = originalText
          return
        }

        uploadBtn.querySelector(".btn-text").textContent = "UPLOADING..."
        showNotification(`Processing ${records.length} records...`, "info")

        const batchId = Date.now().toString()

        try {
          // Upload records in batches
          const chunkSize = 100
          let uploadedCount = 0

          for (let i = 0; i < records.length; i += chunkSize) {
            const chunk = records.slice(i, i + chunkSize)
            const batch = db.batch()

            chunk.forEach((record) => {
              const docRef = db.collection("user_agents").doc()
              batch.set(docRef, {
                Profile_Name: record.Profile_Name || "N/A",
                User_Agent: record.User_Agent.trim(),
                Resolution: record.Resolution || "N/A",
                OS: record.OS || "N/A",
                status: 0,
                batch_id: batchId,
                created_at: new Date(),
              })
              uploadedCount++
            })

            await batch.commit()
          }

          showNotification(`Successfully uploaded ${uploadedCount} agents!`, "success")
          await loadBatches()

          // Reset form
          fileInput.value = ""
          passcodeInput.value = ""
          fileToUpload = null
          fileNameDisplay.textContent = "Click to select a .csv file"
        } catch (error) {
          console.error("Upload error:", error)
          showNotification(`Upload failed: ${error.message}`, "error")
        } finally {
          uploadBtn.disabled = false
          uploadBtn.querySelector(".btn-text").textContent = originalText
        }
      },
      error: (error) => {
        console.error("Parse error:", error)
        showNotification("Failed to parse CSV file", "error")
        uploadBtn.disabled = false
        uploadBtn.querySelector(".btn-text").textContent = originalText
      },
    })
  })

  // Load Batches Function
  async function loadBatches() {
    try {
      batchListEl.innerHTML = '<li class="history-placeholder">Loading...</li>'

      const snapshot = await db.collection("user_agents").get()
      const batches = {}

      // Group by batch_id and count
      snapshot.forEach((doc) => {
        const batchId = doc.data().batch_id
        if (batchId) {
          if (!batches[batchId]) batches[batchId] = 0
          batches[batchId]++
        }
      })

      const sortedBatchIds = Object.keys(batches).sort((a, b) => b - a)

      if (sortedBatchIds.length === 0) {
        batchListEl.innerHTML = '<li class="history-placeholder">No batches found</li>'
        return
      }

      batchListEl.innerHTML = ""

      sortedBatchIds.forEach((batchId) => {
        const date = new Date(Number.parseInt(batchId)).toLocaleString()
        const count = batches[batchId]

        const item = document.createElement("li")
        item.className = "batch-item"
        item.innerHTML = `
          <p>
            <strong>${date}</strong>
            <br>
            <span style="font-size: 0.85rem; color: var(--text-secondary);">${count} agent${count !== 1 ? "s" : ""}</span>
          </p>
          <button class="delete-btn" data-batch-id="${batchId}" aria-label="Delete batch">Delete</button>
        `
        batchListEl.appendChild(item)
      })
    } catch (error) {
      console.error("Error loading batches:", error)
      batchListEl.innerHTML = '<li class="history-placeholder">Error loading batches</li>'
    }
  }

  // Delete Batch Handler
  batchListEl.addEventListener("click", async (e) => {
    if (e.target.classList.contains("delete-btn")) {
      const batchId = e.target.dataset.batchId
      const deleteBtn = e.target

      if (!confirm("Delete this batch? This action cannot be undone.")) {
        return
      }

      deleteBtn.disabled = true
      const originalText = deleteBtn.textContent
      deleteBtn.textContent = "Deleting..."

      try {
        const snapshot = await db.collection("user_agents").where("batch_id", "==", batchId).get()

        if (snapshot.empty) {
          showNotification("Batch not found", "warning")
          await loadBatches()
          return
        }

        // Delete in chunks
        const chunkSize = 100
        for (let i = 0; i < snapshot.docs.length; i += chunkSize) {
          const chunk = snapshot.docs.slice(i, i + chunkSize)
          const batch = db.batch()

          chunk.forEach((doc) => {
            batch.delete(doc.ref)
          })

          await batch.commit()
        }

        showNotification("Batch deleted successfully", "success")
        await loadBatches()
      } catch (error) {
        console.error("Delete error:", error)
        showNotification("Failed to delete batch", "error")
        deleteBtn.disabled = false
        deleteBtn.textContent = originalText
      }
    }
  })

  // Load batches on page load
  loadBatches()
}
