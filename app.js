// ============================
// KONFIGURASI API BACKEND - INVMANAGE
// ============================
console.log('🚀 InvManage Frontend v2.0 - Loaded at:', new Date().toISOString());
const BACKEND_URL = 'http://127.0.0.1:8001';
const API_BASE = `${BACKEND_URL}/api`;

// Configuration for better error handling
const API_CONFIG = {
  timeout: 10000, // 10 seconds
  retries: 3,
  retryDelay: 1000, // 1 second
  timezone: 'Asia/Jakarta' // UTC+7
};

// CSRF Token Management
let csrfToken = null;

async function getCsrfToken() {
  if (csrfToken) return csrfToken;

  try {
    // Get CSRF token from cookies or fetch from server
    const cookies = document.cookie.split(';');
    const csrfCookie = cookies.find(cookie => cookie.trim().startsWith('csrftoken='));

    if (csrfCookie) {
      csrfToken = csrfCookie.split('=')[1];
      return csrfToken;
    }

    // If no CSRF cookie, try to get one by making a GET request first
    const response = await fetch(`${API_BASE}/users/`, {
      method: 'GET',
      credentials: 'include'
    });

    // Check cookies again after the request
    const updatedCookies = document.cookie.split(';');
    const updatedCsrfCookie = updatedCookies.find(cookie => cookie.trim().startsWith('csrftoken='));

    if (updatedCsrfCookie) {
      csrfToken = updatedCsrfCookie.split('=')[1];
      return csrfToken;
    }

    console.warn('CSRF token not found in cookies');
    return null;
  } catch (error) {
    console.error('Failed to get CSRF token:', error);
    return null;
  }
}

// Enhanced API call function with retry logic and CSRF support
async function apiCall(url, options = {}, retryCount = 0) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

    // Prepare headers with CSRF token for state-changing operations
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Add CSRF token for POST, PUT, DELETE, PATCH requests
    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const token = await getCsrfToken();
      if (token) {
        headers['X-CSRFToken'] = token;
      }
    }

    const response = await fetch(url, {
      ...options,
      method: method,
      signal: controller.signal,
      credentials: 'include', // Include cookies for session management
      headers: headers
    });

    clearTimeout(timeoutId);

    // Handle different response types
    if (response.status === 204) {
      // No Content - successful DELETE
      return response;
    }

    if (!response.ok) {
      // Try to parse error response
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        } else if (typeof errorData === 'object') {
          // Handle field errors
          const fieldErrors = Object.entries(errorData)
            .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
            .join('; ');
          errorMessage = fieldErrors || errorMessage;
        }
      } catch (parseError) {
        // If we can't parse error response, use default message
        console.warn('Could not parse error response:', parseError);
      }

      const error = new Error(errorMessage);
      error.status = response.status;
      error.response = response;
      throw error;
    }

    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - server tidak merespons');
    }

    // Don't retry on client errors (4xx) except 408, 429
    const isRetryableStatus = error.status && (
      error.status >= 500 || // Server errors
      error.status === 408 || // Request timeout
      error.status === 429 || // Too many requests
      !error.status // Network errors
    );

    if (retryCount < API_CONFIG.retries && (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      (isRetryableStatus && !error.message.includes('timeout'))
    )) {
      console.warn(`API call failed, retrying (${retryCount + 1}/${API_CONFIG.retries}):`, error.message);
      await new Promise(resolve => setTimeout(resolve, API_CONFIG.retryDelay));
      return apiCall(url, options, retryCount + 1);
    }

    throw error;
  }
}

// Check if backend is available
async function checkBackendHealth() {
  try {
    // Try to access the users endpoint which should exist and return data
    const res = await fetch(`${API_BASE}/users/`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      mode: 'cors',
      credentials: 'include'
    });
    return res.ok; // Backend is healthy if we get a successful response
  } catch (err) {
    console.warn("Backend health check failed:", err);
    // If it's a CORS error, the backend might still be running
    if (err.name === 'TypeError' && err.message.includes('CORS')) {
      console.warn("CORS error detected, but backend might still be accessible");
      return true; // Assume backend is available if CORS is the only issue
    }
    return false;
  }
}

const $ = (sel) => document.querySelector(sel);

// ============================
// ENTERPRISE UI ENHANCEMENTS
// ============================

// API Response Caching System
class ApiCache {
  constructor(ttl = 300000) { // 5 minutes default
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, data) {
    this.cache.set(key, {
      data: JSON.parse(JSON.stringify(data)), // Deep clone
      timestamp: Date.now()
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (item && (Date.now() - item.timestamp) < this.ttl) {
      return JSON.parse(JSON.stringify(item.data)); // Return clone
    }
    this.cache.delete(key);
    return null;
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// Global cache instance
const apiCache = new ApiCache();

// Input Sanitization & Validation
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/[<>]/g, '').trim();
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateRequired(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function validateNumber(value, min = 0) {
  const num = Number(value);
  return !isNaN(num) && num >= min;
}

// Debounce utility
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Loading Overlay Management with skeleton support
function showLoading(message = "Memproses...", showSkeleton = false) {
  let overlay = $("#loading-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "loading-overlay";
    overlay.className = "loading-overlay";
    overlay.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p style="margin: 0; color: #64748b; font-weight: 500;">${message}</p>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = "flex";

  // Show skeleton if requested
  if (showSkeleton) {
    const tables = document.querySelectorAll('table tbody');
    tables.forEach(table => {
      if (!table.querySelector('.skeleton-loader')) {
        const skeletonRow = document.createElement('tr');
        skeletonRow.className = 'skeleton-loader';
        skeletonRow.innerHTML = `
          <td colspan="10">
            <div class="skeleton">
              <div class="skeleton-line"></div>
              <div class="skeleton-line short"></div>
              <div class="skeleton-line"></div>
            </div>
          </td>
        `;
        table.appendChild(skeletonRow);
      }
    });
  }
}

function hideLoading() {
  const overlay = $("#loading-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }

  // Remove skeleton loaders
  const skeletons = document.querySelectorAll('.skeleton-loader');
  skeletons.forEach(skeleton => skeleton.remove());
}

// Professional Notification System with accessibility
function showNotification(message, type = "success", duration = 4000) {
  // Sanitize message
  const safeMessage = sanitizeInput(message);

  // Remove existing notifications
  const existing = document.querySelectorAll(".notification");
  existing.forEach(notif => notif.remove());

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.setAttribute('role', 'alert');
  notification.setAttribute('aria-live', 'assertive');
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="font-size: 20px;" aria-hidden="true">
        ${type === "success" ? "✅" : type === "error" ? "❌" : "⚠️"}
      </div>
      <div>
        <p style="margin: 0; font-weight: 600; color: #1e293b;">${safeMessage}</p>
      </div>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()" aria-label="Tutup notifikasi">
        ✕
      </button>
    </div>
  `;

  document.body.appendChild(notification);

  // Auto remove after duration
  const timeoutId = setTimeout(() => {
    if (notification.parentElement) {
      notification.classList.add("fade-out");
      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
        }
      }, 500);
    }
  }, duration);

  // Store timeout ID for potential clearing
  notification.dataset.timeoutId = timeoutId;
}

// Enhanced Button Loading States
function setButtonLoading(button, loading = true, text = "Memproses...") {
  if (loading) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 8px;">
        <div style="width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: enterpriseSpin 1s linear infinite;"></div>
        ${text}
      </span>
    `;
    button.classList.add("loading");
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalText;
    button.classList.remove("loading");
  }
}

// Page Transition Effects
function transitionToPage(callback) {
  const mainContent = $(".main-content");
  if (mainContent) {
    mainContent.classList.add("page-transition");
    mainContent.classList.remove("active");

    setTimeout(() => {
      callback();
      mainContent.classList.add("active");
    }, 200);
  } else {
    callback();
  }
}

// Enhanced Error Handling
function handleApiError(error, context = "") {
  console.error(`API Error ${context}:`, error);

  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    showNotification("Backend server tidak tersedia. Pastikan Django server berjalan di http://127.0.0.1:8001", "error");
  } else if (error.status === 400) {
    showNotification("Data yang dimasukkan tidak valid. Periksa kembali input Anda.", "error");
  } else if (error.status === 401) {
    showNotification("Sesi telah berakhir. Silakan login kembali.", "warning");
    const currentUser = getCurrentUser();
    setTimeout(() => {
      if (currentUser && currentUser.accessLevel === 'admin') {
        window.location.href = "admin-login.html";
      } else {
        window.location.href = "index.html";
      }
    }, 2000);
  } else if (error.status === 403) {
    showNotification("Akses ditolak. Anda tidak memiliki izin untuk melakukan tindakan ini.", "error");
  } else if (error.status === 404) {
    showNotification("Endpoint API tidak ditemukan. Periksa konfigurasi backend.", "error");
  } else if (error.status === 429) {
    showNotification("Terlalu banyak permintaan. Coba lagi dalam beberapa saat.", "warning");
  } else if (error.status >= 500) {
    showNotification("Server mengalami masalah internal. Periksa log Django.", "error");
  } else if (error.status) {
    showNotification(`Error ${error.status}: ${error.statusText}`, "error");
  } else {
    showNotification("Terjadi kesalahan jaringan. Periksa koneksi internet.", "error");
  }
}

// ============================
// AUTH - LOGIN & REGISTER
// ============================

function getCurrentUser() {
  const userData = localStorage.getItem("currentUser");
  return userData ? JSON.parse(userData) : null;
}

function setCurrentUser(user) {
  localStorage.setItem("currentUser", JSON.stringify(user));
}

function clearCurrentUser() {
  localStorage.removeItem("currentUser");
}

// Role-based login is now handled in index.html
// This function is kept for backward compatibility but role validation is done in the HTML version

// Check if user is logged in and has correct access level
function checkAuth(requiredRole = null) {
  const user = getCurrentUser();
  if (!user) {
    console.warn('No user found, redirecting to login');
    // Redirect to appropriate login page based on current page context
    const currentPath = window.location.pathname;
    if (currentPath.includes('admin') || currentPath.includes('dashboard') || currentPath.includes('profil') || currentPath.includes('feedback') || currentPath.includes('riwayat') || currentPath.includes('laporan')) {
      window.location.href = "admin-login.html";
    } else {
      window.location.href = "index.html";
    }
    return false;
  }
  if (requiredRole && user.role !== requiredRole) {
    console.warn(`Access denied: required ${requiredRole}, user has ${user.role}`);
    showNotification("Anda tidak memiliki akses ke halaman ini", "error");
    setTimeout(() => {
      window.location.href = user.role === 'admin' ? "dashboard.html" : "user-dashboard.html";
    }, 2000);
    return false;
  }
  return true;
}

async function doLogin() {
    // Only run if we're on a page that has the correct elements
    const loginEmail = $("#loginEmail");
    const loginUsername = $("#loginUsername");
    if (!loginEmail && !loginUsername) return; // Not on a login page that uses this function

    const identifier = loginEmail?.value?.trim() || loginUsername?.value?.trim();
    const password = $("#loginPassword")?.value;
    const loginBtn = $("#loginForm")?.querySelector("button.primary");

    if (!identifier || !password) {
      showNotification("Username/email dan password wajib diisi", "warning");
      return;
    }

    // Show loading state
    if (loginBtn) setButtonLoading(loginBtn, true, "Masuk...");
    showLoading("Sedang masuk...");

    try {
      const response = await apiCall(`${API_BASE}/login/`, {
        method: "POST",
        body: JSON.stringify({
          identifier: identifier,
          password: password
        }),
      });

      const data = await response.json();

      hideLoading();
      if (loginBtn) setButtonLoading(loginBtn, false);

      // Store user data
      setCurrentUser(data.user);

      showNotification(`Selamat datang, ${data.user.nama}!`, "success");

      // Redirect based on role
      setTimeout(() => {
        if (data.user.role === 'admin') {
          window.location.href = "dashboard.html";
        } else {
          window.location.href = "user-dashboard.html";
        }
      }, 1500);

    } catch (err) {
      hideLoading();
      if (loginBtn) setButtonLoading(loginBtn, false);
      handleApiError(err, "Login");
    }
}

// REMOVED: Old doAdminLogin function that used email field
// The correct function is now in admin-login.html using username field

async function doRegister() {
    const nama = $("#registerUsername")?.value?.trim();
    const email = $("#registerEmail")?.value?.trim();
    const password = $("#registerPassword")?.value;
    const registerBtn = $("#registerForm")?.querySelector("button.primary");

    if (!nama || !email || !password) {
      showNotification("Nama, email, dan password wajib diisi", "warning");
      return;
    }

    // Show loading state
    if (registerBtn) setButtonLoading(registerBtn, true, "Mendaftarkan...");
    showLoading("Membuat akun baru...");

    try {
      const response = await apiCall(`${API_BASE}/register/`, {
        method: "POST",
        body: JSON.stringify({
          nama: nama,
          email: email,
          password: password
        }),
      });

      const data = await response.json();

      hideLoading();
      if (registerBtn) setButtonLoading(registerBtn, false);

      showNotification("Registrasi berhasil! Mengalihkan ke login...", "success");

      // Clear form
      if ($("#registerUsername")) $("#registerUsername").value = "";
      if ($("#registerEmail")) $("#registerEmail").value = "";
      if ($("#registerPassword")) $("#registerPassword").value = "";

      // Smooth transition to login tab
      setTimeout(() => {
        if ($("#tabLogin")) $("#tabLogin").click();
      }, 1500);

    } catch (err) {
      hideLoading();
      if (registerBtn) setButtonLoading(registerBtn, false);
      handleApiError(err, "Register");
    }
}

// ============================
// DASHBOARD / BARANG - OPTIMIZED CRUD
// ============================

let barangCache = [];
let barangFormMode = "add";
let barangFormId = null;
let deleteBarangId = null;
let isOperationInProgress = false; // Prevent multiple simultaneous operations

// Offline queue for operations when backend is unavailable
let offlineQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');

// Save offline queue to localStorage
function saveOfflineQueue() {
  localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
}

// Add operation to offline queue
function addToOfflineQueue(operation) {
  operation.id = Date.now() + Math.random();
  operation.timestamp = new Date().toISOString();
  offlineQueue.push(operation);
  saveOfflineQueue();
  updateOfflineQueueIndicator();
  console.log('Added to offline queue:', operation);
}

// Update offline queue indicator
function updateOfflineQueueIndicator() {
  let indicator = document.getElementById('offline-queue-indicator');

  if (offlineQueue.length > 0) {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'offline-queue-indicator';
      indicator.className = 'offline-queue-indicator';
      indicator.onclick = () => {
        const action = confirm(`Ada ${offlineQueue.length} operasi yang menunggu sinkronisasi. Sinkronkan sekarang?`);
        if (action) {
          processOfflineQueue();
        }
      };
      document.body.appendChild(indicator);
    }

    indicator.innerHTML = `
      <span class="queue-icon">🔄</span>
      <span>${offlineQueue.length} operasi pending</span>
      <span class="queue-count">${offlineQueue.length}</span>
    `;
    indicator.classList.add('show');
  } else {
    if (indicator) {
      indicator.classList.remove('show');
    }
  }
}

// Process offline queue when backend becomes available
async function processOfflineQueue() {
  if (offlineQueue.length === 0) return;

  console.log(`Processing ${offlineQueue.length} offline operations...`);

  const processedOps = [];

  for (const operation of offlineQueue) {
    try {
      let success = false;

      switch (operation.type) {
        case 'create_barang':
          success = await processOfflineBarangCreate(operation);
          break;
        case 'update_barang':
          success = await processOfflineBarangUpdate(operation);
          break;
        case 'delete_barang':
          success = await processOfflineBarangDelete(operation);
          break;
      }

      if (success) {
        processedOps.push(operation.id);
        console.log(`Successfully processed offline operation: ${operation.type}`);
      }
    } catch (err) {
      console.error(`Failed to process offline operation ${operation.type}:`, err);
    }
  }

  // Remove processed operations
  offlineQueue = offlineQueue.filter(op => !processedOps.includes(op.id));
  saveOfflineQueue();

  if (processedOps.length > 0) {
    showNotification(`${processedOps.length} operasi offline berhasil disinkronkan`, "success");
    // Refresh data after sync
    await loadBarang(true);
  }
}

// Process offline create operation
async function processOfflineBarangCreate(operation) {
  try {
    const res = await fetch(`${API_BASE}/barang/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(operation.data),
    });

    if (res.ok) {
      const result = await res.json();
      console.log('Offline create synced:', result);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Failed to sync offline create:', err);
    return false;
  }
}

// Process offline update operation
async function processOfflineBarangUpdate(operation) {
  try {
    const res = await fetch(`${API_BASE}/barang/${operation.itemId}/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(operation.data),
    });

    if (res.ok) {
      const result = await res.json();
      console.log('Offline update synced:', result);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Failed to sync offline update:', err);
    return false;
  }
}

// Process offline delete operation
async function processOfflineBarangDelete(operation) {
  try {
    const res = await fetch(`${API_BASE}/barang/${operation.itemId}/`, {
      method: "DELETE",
    });

    if (res.ok) {
      console.log('Offline delete synced');
      return true;
    }
    return false;
  } catch (err) {
    console.error('Failed to sync offline delete:', err);
    return false;
  }
}

// Enhanced local storage operations for offline mode
function saveBarangToLocal(item) {
  const localBarang = JSON.parse(localStorage.getItem('localBarang') || '[]');
  const existingIndex = localBarang.findIndex(b => b.id === item.id);

  if (existingIndex >= 0) {
    localBarang[existingIndex] = { ...localBarang[existingIndex], ...item, _local: true };
  } else {
    localBarang.push({ ...item, _local: true, id: Date.now() });
  }

  localStorage.setItem('localBarang', JSON.stringify(localBarang));
  console.log('Saved to local storage:', item);
}

function getLocalBarang() {
  return JSON.parse(localStorage.getItem('localBarang') || '[]');
}

function removeBarangFromLocal(id) {
  const localBarang = getLocalBarang().filter(b => b.id !== id);
  localStorage.setItem('localBarang', JSON.stringify(localBarang));
  console.log('Removed from local storage:', id);
}

// Merge local and server data
function mergeBarangData(serverData, localData) {
  const merged = [...serverData];

  localData.forEach(localItem => {
    const existingIndex = merged.findIndex(s => s.id === localItem.id);
    if (existingIndex >= 0) {
      // Merge local changes with server data
      merged[existingIndex] = { ...merged[existingIndex], ...localItem };
    } else {
      // Add new local items
      merged.push(localItem);
    }
  });

  return merged;
}

async function loadBarang(forceRefresh = false) {
  const table = document.querySelector("#tabelBarang tbody");
  if (!table) return;

  // Show instant skeleton loading for better perceived performance
  showLoading("Memuat data barang...", true);

  // Pre-populate with cached data immediately if available
  const cachedData = apiCache.get('barang');
  if (cachedData && cachedData.length > 0 && !forceRefresh) {
    renderBarangData(cachedData);
    hideLoading();
    // Continue with fresh data loading in background
  }

  try {
    // Always try to load fresh data, but use cache as fallback
    const backendAvailable = await checkBackendHealth();
    const localData = getLocalBarang();

    let serverData = [];
    let usingOfflineMode = false;
    let finalData = [];

    if (backendAvailable) {
      try {
        // Add timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const res = await fetch(`${API_BASE}/barang/`, {
          method: "GET",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          mode: 'cors',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorText = await res.text();
          console.error(`Barang API Error: HTTP ${res.status}`, errorText);
          throw new Error(`HTTP ${res.status}: ${errorText || 'Gagal mengambil data barang'}`);
        }

        serverData = await res.json();
        console.log('Barang data received from server:', serverData.length, 'items');

        // Validate response structure
        if (!Array.isArray(serverData)) {
          console.error('Invalid barang data format:', typeof serverData, serverData);
          throw new Error('Format data barang tidak valid - expected array');
        }

        // Process offline queue asynchronously (don't block UI)
        processOfflineQueue().catch(err => console.warn('Offline queue processing failed:', err));

        // Merge with local data
        finalData = mergeBarangData(serverData, localData);

        // Cache the merged data
        apiCache.set('barang', finalData);
        barangCache = finalData;

        // Show sync notification if we had local changes
        if (localData.length > 0) {
          setTimeout(() => showNotification("Data berhasil disinkronkan dengan server", "success"), 100);
        }

      } catch (fetchErr) {
        console.error("Server fetch failed, falling back to offline mode:", fetchErr);
        usingOfflineMode = true;
      }
    } else {
      usingOfflineMode = true;
    }

    // Handle offline mode or use cached data
    if (usingOfflineMode || finalData.length === 0) {
      console.log('Using offline/local/cached/sample mode');

      // Try cache first, then local data, then sample data
      let offlineData = finalData.length > 0 ? finalData : apiCache.get('barang') || localData;

      if (offlineData.length === 0) {
        // Use sample data from data.js
        console.log('Using sample barang data');
        offlineData = window.sampleBarang || [
          { id: 1, nama: "Laptop Acer Aspire 5", stok: 5, minimum: 2 },
          { id: 2, nama: "Mouse Logitech MX Master 3", stok: 15, minimum: 5 },
          { id: 3, nama: "Keyboard Dell KB216", stok: 8, minimum: 3 },
          { id: 4, nama: "Monitor Samsung 24 inch", stok: 6, minimum: 2 },
          { id: 5, nama: "Printer HP LaserJet", stok: 3, minimum: 1 }
        ];
        showNotification("Menggunakan data sample barang", "info");
      }

      // Cache offline data
      apiCache.set('barang', offlineData);
      barangCache = offlineData;
      finalData = offlineData;

      // Add offline indicator if we're actually offline
      if (usingOfflineMode || !backendAvailable) {
        const offlineRow = document.createElement('tr');
        offlineRow.innerHTML = `
          <td colspan="5" style="text-align: center; color: #f59e0b; padding: 20px; background: rgba(245, 158, 11, 0.1); border-top: 2px solid #f59e0b;">
            <div style="font-size: 24px; margin-bottom: 5px;">🔄</div>
            <small><strong>Mode Offline</strong> - Perubahan akan disimpan secara lokal<br>
            ${backendAvailable ? 'Server tersedia, coba sinkronkan:' : 'Server tidak tersedia di http://127.0.0.1:8001'}</small>
            <br><br>
            <button onclick="loadBarang(true)" class="btn-primary" style="font-size: 12px; padding: 8px 16px;">🔄 Sinkronkan</button>
            <button onclick="clearOfflineData()" class="btn-red" style="font-size: 12px; padding: 8px 16px; margin-left: 8px;">🗑️ Hapus Data Lokal</button>
          </td>
        `;
        table.appendChild(offlineRow);

        // Show notification
        setTimeout(() => {
          if (backendAvailable) {
            showNotification("Server tersedia! Klik 'Sinkronkan' untuk menyamakan data.", "info");
          } else {
            showNotification("Bekerja dalam mode offline. Perubahan disimpan secara lokal.", "warning");
          }
        }, 100);
      }
    }

    // Always render the final data
    renderBarangData(finalData);
    hideLoading();

  } catch (err) {
    console.error("Error loading barang:", err);
    hideLoading();

    // Try to show cached data even on error
    const cachedData = apiCache.get('barang');
    if (cachedData && cachedData.length > 0) {
      console.log('Showing cached data due to error');
      renderBarangData(cachedData);
      showNotification("Menampilkan data cache - beberapa fitur mungkin terbatas", "warning");
      return;
    }

    // Render error state as last resort
    table.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #ef4444; padding: 40px;">
          <div style="font-size: 48px; margin-bottom: 10px;">❌</div>
          Gagal memuat data barang<br>
          <small>${err.message}</small>
          <br><br>
          <button onclick="loadBarang(true)" class="btn-primary">Coba Lagi</button>
        </td>
      </tr>
    `;

    // Show error notification
    setTimeout(() => showNotification("Gagal memuat data barang", "error"), 100);
  }
}

// Clear offline data
function clearOfflineData() {
  localStorage.removeItem('localBarang');
  localStorage.removeItem('offlineQueue');
  offlineQueue = [];
  showNotification("Data lokal dan antrian offline telah dihapus", "info");
  loadBarang(true);
}

// Separate rendering function for better code organization
function renderBarangData(data) {
  const table = document.querySelector("#tabelBarang tbody");
  if (!table) return;

  // Clear table efficiently
  table.innerHTML = "";

  let totalItem = 0;
  let stokRendah = 0;
  let hampirHabis = 0;
  let stokAman = 0;

  // Use DocumentFragment for better performance with large datasets
  const fragment = document.createDocumentFragment();

  data.forEach((item) => {
    const stok = Number(item.stok ?? 0);
    totalItem++;

    let statusText = "Aman";
    let statusClass = "green";

    // Use backend computed fields if available
    if (item.is_out_of_stock) {
      statusText = "Habis";
      statusClass = "red";
      hampirHabis++;
    } else if (item.is_low_stock) {
      statusText = "Stok Rendah";
      statusClass = "yellow";
      stokRendah++;
    } else {
      statusText = "Tersedia";
      statusClass = "green";
      stokAman++;
    }

    // Add visual indicators for offline/local items
    let rowClass = "";
    let statusIndicator = "";

    if (item._optimistic) {
      rowClass = "optimistic-row";
      statusIndicator = '<span class="sync-indicator" title="Menunggu sinkronisasi">⏳</span>';
    } else if (item._local) {
      rowClass = "local-row";
      statusIndicator = '<span class="sync-indicator" title="Data lokal">💾</span>';
    } else if (item._synced) {
      statusIndicator = '<span class="sync-indicator synced" title="Tersinkronkan">✅</span>';
    }

    const tr = document.createElement("tr");
    tr.setAttribute("data-nama", (item.nama || "").toLowerCase());
    tr.setAttribute("data-id", item.id);
    if (rowClass) tr.className = rowClass;

    // Use innerHTML for better performance
    tr.innerHTML = `
      <td>
        ${statusIndicator}
        ${sanitizeInput(item.nama || '-')}
      </td>
      <td>${stok}</td>
      <td>${item.minimum || 5}</td>
      <td><span class="status ${statusClass}">${statusText}</span></td>
      <td>
        <button class="icon-btn" style="border:none; background:none; cursor:pointer; margin-right:6px;"
                onclick="openBarangModal('edit', ${item.id})"
                aria-label="Edit ${sanitizeInput(item.nama || 'barang')}">
          ✏️
        </button>
        <button class="icon-btn" style="border:none; background:none; cursor:pointer;"
                onclick="openDeleteBarang(${item.id})"
                aria-label="Hapus ${sanitizeInput(item.nama || 'barang')}">
          🗑️
        </button>
      </td>
    `;
    fragment.appendChild(tr);
  });

  // Append all rows at once
  table.appendChild(fragment);

  // Update dashboard cards asynchronously to prevent blocking
  requestAnimationFrame(() => {
    const cardTotalItem = document.getElementById("cardTotalItem");
    const cardStokRendah = document.getElementById("cardStokRendah");
    const cardHampirHabis = document.getElementById("cardHampirHabis");
    const cardStokAman = document.getElementById("cardStokAman");

    if (cardTotalItem) cardTotalItem.textContent = totalItem;
    if (cardStokRendah) cardStokRendah.textContent = stokRendah;
    if (cardHampirHabis) cardHampirHabis.textContent = hampirHabis;
    if (cardStokAman) cardStokAman.textContent = stokAman;

    // Apply filter asynchronously
    setTimeout(applyBarangFilter, 50);
  });
}

// Enhanced modal opening with instant response
function openBarangModal(mode, id = null) {
  // Immediate modal display for instant user feedback
  const modal = $("#modalBarang");
  if (!modal) {
    showNotification("Modal tidak ditemukan. Refresh halaman.", "error");
    return;
  }

  // Set mode and ID immediately
  barangFormMode = mode;
  barangFormId = id;

  // Show modal instantly
  modal.style.display = "flex";

  // Prepare form data asynchronously for better perceived performance
  requestAnimationFrame(() => {
    const title = $("#modalBarangTitle");
    const namaInput = $("#formBarangNama");
    const stokInput = $("#formBarangStok");
    const minInput = $("#formBarangMinimum");
    const saveBtn = $("#modalBarang .primary");

    // Reset button state
    if (saveBtn) {
      setButtonLoading(saveBtn, false);
    }

    if (mode === "add") {
      if (title) title.textContent = "Tambah Stok Barang";
      if (namaInput) {
        namaInput.value = "";
        namaInput.focus();
      }
      if (stokInput) stokInput.value = "";
      if (minInput) minInput.value = "5";
    } else if (mode === "edit" && id != null) {
      const item = barangCache.find((b) => b.id === id);

      if (!item) {
        showNotification("Data barang tidak ditemukan", "error");
        closeBarangModal();
        return;
      }

      if (title) title.textContent = "Edit Stok Barang";
      if (namaInput) namaInput.value = item.nama || "";
      if (stokInput) stokInput.value = item.stok || "";
      if (minInput) minInput.value = item.minimum || "5";

      // Focus on first input
      if (namaInput) namaInput.focus();
    }
  });
}

function closeBarangModal() {
  const modal = $("#modalBarang");
  if (modal) modal.style.display = "none";
}

async function saveBarang() {
  // Prevent multiple simultaneous operations
  if (isOperationInProgress) {
    console.log('Operation already in progress, ignoring duplicate request');
    return;
  }

  const nama = document.getElementById("formBarangNama")?.value?.trim();
  const stok = document.getElementById("formBarangStok")?.value;
  const minimum = document.getElementById("formBarangMinimum")?.value || 5;

  // Enhanced validation
  if (!nama) {
    showNotification("Nama barang wajib diisi", "error");
    document.getElementById("formBarangNama")?.focus();
    return;
  }

  if (stok === "" || stok === null || stok === undefined) {
    showNotification("Stok wajib diisi", "error");
    document.getElementById("formBarangStok")?.focus();
    return;
  }

  const stokNum = Number(stok);
  const minNum = Number(minimum);

  if (isNaN(stokNum) || stokNum < 0) {
    showNotification("Stok harus berupa angka positif", "error");
    document.getElementById("formBarangStok")?.focus();
    return;
  }

  if (isNaN(minNum) || minNum < 0) {
    showNotification("Stok minimum harus berupa angka positif", "error");
    document.getElementById("formBarangMinimum")?.focus();
    return;
  }

  // Set operation lock
  isOperationInProgress = true;

  try {
    const payload = {
      nama,
      stok: stokNum,
      minimum: minNum,
      harga: 0,
    };

    // Immediate UI feedback for instant perceived response
    const isEdit = barangFormMode === "edit" && barangFormId != null;
    const tempId = isEdit ? barangFormId : Date.now();

    // Create optimistic item
    const optimisticItem = {
      id: tempId,
      ...payload,
      _optimistic: true,
      _timestamp: Date.now()
    };

    // Update local cache immediately for instant UI update
    if (isEdit) {
      const existingIndex = barangCache.findIndex(b => b.id === barangFormId);
      if (existingIndex >= 0) {
        barangCache[existingIndex] = { ...barangCache[existingIndex], ...payload, _optimistic: true };
      }
    } else {
      barangCache.push(optimisticItem);
    }

    // Save to local storage
    saveBarangToLocal(optimisticItem);

    // Update UI immediately - no delay for better UX
    renderBarangData(barangCache);
    closeBarangModal();

    // Show immediate success feedback
    showNotification(
      isEdit ? "Barang berhasil diupdate (menyimpan...)" : "Barang berhasil ditambahkan (menyimpan...)",
      "success"
    );

    // Now try to sync with backend
    const backendAvailable = await checkBackendHealth();

  if (backendAvailable) {
    try {
      let url = `${API_BASE}/barang/`;
      let method = "POST";

      if (isEdit) {
        url = `${API_BASE}/barang/${barangFormId}/`;
        method = "PUT";
      }

      console.log("Syncing barang with backend:", { url, method, payload });

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        mode: 'cors',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const result = await res.json();
        console.log("Barang synced successfully:", result);

        // Update with real server data
        if (isEdit) {
          const existingIndex = barangCache.findIndex(b => b.id === barangFormId);
          if (existingIndex >= 0) {
            barangCache[existingIndex] = { ...result, _synced: true };
          }
        } else {
          // Replace optimistic item with real item
          const optimisticIndex = barangCache.findIndex(b => b.id === tempId);
          if (optimisticIndex >= 0) {
            barangCache[optimisticIndex] = { ...result, _synced: true };
          }
        }

        // Remove from local storage (now synced)
        removeBarangFromLocal(tempId);

        // Update cache and UI
        apiCache.set('barang', barangCache);
        renderBarangData(barangCache);

        showNotification(
          isEdit ? "Barang berhasil diupdate dan disinkronkan" : "Barang berhasil ditambahkan dan disinkronkan",
          "success"
        );

      } else {
        throw new Error(`HTTP ${res.status}: Gagal menyimpan ke server`);
      }

    } catch (syncErr) {
      console.error("Failed to sync barang:", syncErr);

      // Add to offline queue for later sync
      addToOfflineQueue({
        type: isEdit ? 'update_barang' : 'create_barang',
        itemId: isEdit ? barangFormId : null,
        data: payload
      });

      showNotification(
        "Perubahan disimpan secara lokal. Akan disinkronkan ketika server tersedia.",
        "warning"
      );
    }
  } else {
    // Backend not available - add to offline queue
    addToOfflineQueue({
      type: isEdit ? 'update_barang' : 'create_barang',
      itemId: isEdit ? barangFormId : null,
      data: payload
    });

    showNotification(
      "Server tidak tersedia. Perubahan disimpan secara lokal dan akan disinkronkan nanti.",
      "warning"
    );
  }

  // Release operation lock
  isOperationInProgress = false;
} catch (error) {
  console.error('Unexpected error in saveBarang:', error);
  showNotification("Terjadi kesalahan tak terduga. Silakan coba lagi.", "error");
  isOperationInProgress = false;
}

window.addEventListener("click", (e) => {
  if (e.target === $("#modalBarang")) closeBarangModal();
  if (e.target === $("#modalDeleteBarang")) closeDeleteBarang();
  if (e.target === $("#modalTransaksi")) closeTransaksiModal();
});

function openDeleteBarang(id) {
  deleteBarangId = id;
  const item = barangCache.find((b) => b.id === id);
  if ($("#deleteNamaBarang")) {
    $("#deleteNamaBarang").textContent = item ? item.nama : "";
  }
  const modal = $("#modalDeleteBarang");
  if (modal) modal.style.display = "flex";
}

function closeDeleteBarang() {
  const modal = $("#modalDeleteBarang");
  if (modal) modal.style.display = "none";
  deleteBarangId = null;
}

async function confirmDeleteBarang() {
  if (deleteBarangId == null) return;

  // Find the item to delete for optimistic update
  const itemToDelete = barangCache.find(b => b.id === deleteBarangId);
  if (!itemToDelete) {
    showNotification("Data barang tidak ditemukan", "error");
    return;
  }

  // Immediate UI feedback for instant perceived response
  const originalIndex = barangCache.findIndex(b => b.id === deleteBarangId);
  const deletedItem = barangCache.splice(originalIndex, 1)[0];

  // Update local storage
  removeBarangFromLocal(deleteBarangId);

  // Update UI immediately - no delay for better UX
  renderBarangData(barangCache);
  closeDeleteBarang();

  // Show immediate success feedback
  showNotification("Barang berhasil dihapus (menyimpan...)", "success");

  // Now try to sync with backend
  const backendAvailable = await checkBackendHealth();

  if (backendAvailable) {
    try {
      console.log("Syncing delete with backend for ID:", deleteBarangId);

      const res = await fetch(`${API_BASE}/barang/${deleteBarangId}/`, {
        method: "DELETE",
      });

      console.log("Delete response status:", res.status);

      if (res.ok) {
        console.log("Barang deleted successfully on server");

        // Update cache
        apiCache.set('barang', barangCache);

        showNotification("Barang berhasil dihapus dan disinkronkan", "success");

      } else {
        throw new Error(`HTTP ${res.status}: Gagal menghapus di server`);
      }

    } catch (syncErr) {
      console.error("Failed to sync delete:", syncErr);

      // Restore the item since delete failed
      barangCache.splice(originalIndex, 0, deletedItem);
      saveBarangToLocal(deletedItem);

      // Update UI to show item again
      renderBarangData(barangCache);

      // Add to offline queue for later sync
      addToOfflineQueue({
        type: 'delete_barang',
        itemId: deleteBarangId,
        data: deletedItem // Store the item data in case we need to restore it
      });

      showNotification(
        "Gagal menghapus di server. Item dikembalikan dan akan dicoba lagi nanti.",
        "error"
      );
    }
  } else {
    // Backend not available - add to offline queue
    addToOfflineQueue({
      type: 'delete_barang',
      itemId: deleteBarangId,
      data: deletedItem
    });

    showNotification(
      "Server tidak tersedia. Penghapusan disimpan secara lokal dan akan disinkronkan nanti.",
      "warning"
    );
  }
}

// Optimized search function with better performance
const debouncedBarangFilter = debounce(() => {
  const input = document.getElementById("searchBarang");
  const tbody = document.querySelector("#tabelBarang tbody");
  if (!input || !tbody) return;

  const query = input.value.toLowerCase().trim();
  const rows = tbody.rows;

  // Use requestAnimationFrame for smoother filtering
  requestAnimationFrame(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const nama = (row.getAttribute("data-nama") || "").toLowerCase();
      row.style.display = nama.includes(query) ? "" : "none";
    }
  });
}, 150); // Reduced debounce time for better responsiveness

function applyBarangFilter() {
  debouncedBarangFilter();
}


// ============================
// FEEDBACK
// ============================

async function loadFeedback() {
  const tableBody = document.querySelector("#tabelFeedback tbody");
  console.log('🔄 Loading feedback, table body found:', !!tableBody);
  if (!tableBody) {
    console.error('❌ Feedback table body #tabelFeedback tbody not found');
    return;
  }

  console.log('✅ Loading feedback...');

  // Display sample feedback immediately for better UX
  tableBody.innerHTML = "";
  window.sampleFeedback.forEach((f) => {
    const namaUser = f.user_nama || "Unknown";
    const tanggal = f.tanggal ? new Date(f.tanggal).toLocaleString("id-ID") : "-";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${namaUser}</td>
      <td>${f.pesan}</td>
      <td>${tanggal}</td>
    `;
    tableBody.appendChild(tr);
  });
  console.log('✅ Sample feedback displayed immediately');

  // Try to load real feedback from backend in background
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const res = await fetch(`${API_BASE}/feedback/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      mode: 'cors',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      console.log('Feedback API response:', data);

      if (Array.isArray(data) && data.length > 0) {
        console.log('Real feedback loaded, replacing sample data:', data.length, 'records');
        tableBody.innerHTML = "";
        data.forEach((f) => {
          const namaUser = f.user_nama || f.user || "Unknown";
          const tanggal = f.tanggal ? new Date(f.tanggal).toLocaleString("id-ID") : "-";

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${namaUser}</td>
            <td>${f.pesan || '-'}</td>
            <td>${tanggal}</td>
          `;
          tableBody.appendChild(tr);
        });
        showNotification(`Berhasil memuat ${data.length} feedback dari database`, "success");
      } else {
        console.log('API returned empty data, keeping sample data');
        showNotification("Database kosong, menampilkan data sample", "info");
      }
    } else {
      console.warn('Feedback API request failed:', res.status, res.statusText);
      showNotification("Backend tidak tersedia, menampilkan data sample", "warning");
    }
  } catch (err) {
    console.error('Error loading real feedback, keeping sample data:', err.message);
    showNotification("Menggunakan data sample - backend tidak dapat diakses", "info");
  }
}

// Make tambahFeedback globally available
window.tambahFeedback = async function() {
  const pesan = $("#feedbackPesan")?.value;
  const currentUser = getCurrentUser();

  if (!pesan) {
    showNotification("Pesan feedback wajib diisi", "warning");
    return;
  }

  if (!currentUser) {
    showNotification("Silakan login terlebih dahulu", "error");
    return;
  }

  const payload = { user: currentUser.id, pesan };

  try {
    showLoading("Mengirim feedback...");
    const res = await fetch(`${API_BASE}/feedback/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Gagal mengirim feedback");

    if ($("#feedbackPesan")) $("#feedbackPesan").value = "";

    // Reload feedback user jika ada
    if ($("#tabelFeedbackUser")) {
      await loadFeedbackUser();
    }

    hideLoading();
    showNotification("Feedback berhasil dikirim!", "success");
  } catch (err) {
    console.error(err);
    hideLoading();
    showNotification("Gagal mengirim feedback", "error");
  }
};

// Make loadFeedbackUser globally available
window.loadFeedbackUser = async function() {
  const tableBody = document.querySelector("#tabelFeedbackUser tbody");
  if (!tableBody) {
    console.warn('User feedback table body not found');
    return;
  }

  const currentUser = getCurrentUser();

  // Display sample feedback immediately for better UX
  console.log('📊 Displaying sample user feedback immediately');
  tableBody.innerHTML = "";
  window.sampleUserFeedback.forEach((f) => {
    const tanggal = f.tanggal ? new Date(f.tanggal).toLocaleString("id-ID") : "-";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${f.pesan}</td>
      <td>${tanggal}</td>
    `;
    tableBody.appendChild(tr);
  });
  console.log('✅ Sample user feedback displayed immediately');

  // Try to load real user feedback in background
  if (currentUser) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      const res = await fetch(`${API_BASE}/feedback/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        console.log('User feedback API response:', data);

        if (Array.isArray(data) && data.length > 0) {
          // Filter hanya feedback milik user ini
          const userFeedback = data.filter(f => f.user === currentUser.id);

          if (userFeedback.length > 0) {
            console.log('Real user feedback loaded, replacing sample data:', userFeedback.length, 'records');
            tableBody.innerHTML = "";
            userFeedback.forEach((f) => {
              const tanggal = f.tanggal ? new Date(f.tanggal).toLocaleString("id-ID") : "-";

              const tr = document.createElement("tr");
              tr.innerHTML = `
                <td>${f.pesan}</td>
                <td>${tanggal}</td>
              `;
              tableBody.appendChild(tr);
            });
            showNotification(`Berhasil memuat ${userFeedback.length} feedback Anda`, "success");
          } else {
            console.log('No user feedback found, keeping sample data');
            showNotification("Belum ada feedback Anda, menampilkan contoh", "info");
          }
        } else {
          console.log('API returned empty feedback data, keeping sample data');
        }
      } else {
        console.warn('User feedback API request failed:', res.status, res.statusText);
        showNotification("Backend tidak tersedia, menampilkan contoh feedback", "warning");
      }
    } catch (err) {
      console.log('Could not load real user feedback, keeping sample data:', err.message);
      showNotification("Menggunakan contoh feedback - backend tidak dapat diakses", "info");
    }
  } else {
    console.log('No current user found, showing sample feedback');
    showNotification("Silakan login untuk melihat feedback Anda", "info");
  }
};

// ============================
// RIWAYAT TRANSAKSI
// ============================

async function loadTransaksi(searchTerm = '', filterTipe = '') {
  const container = document.getElementById('riwayat-transaksi-container');
  if (!container) return;

  try {
    showLoading('Memuat data transaksi...');

    // Try to load from API first
    const res = await apiCall(`${API_BASE}/transaksi/`);
    let data = [];

    if (res.ok) {
      data = await res.json();
      console.log(`Loaded ${data.length} transaksi records from API`);
    } else {
      // Fallback to sample data
      console.log('Using sample transaksi data');
      data = window.sampleTransaksi;
    }

    // Apply filters
    let filteredData = data;
    if (searchTerm) {
      filteredData = filteredData.filter(t =>
        (t.barang_nama || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.catatan || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (filterTipe) {
      filteredData = filteredData.filter(t => t.tipe === filterTipe);
    }

    // Calculate totals
    let totalMasuk = 0;
    let totalKeluar = 0;

    filteredData.forEach((t) => {
      const jumlah = Number(t.jumlah ?? 0);
      if (t.tipe === "masuk") totalMasuk += jumlah;
      else if (t.tipe === "keluar") totalKeluar += jumlah;
    });

    // Update counters
    if ($("#totalMasuk")) $("#totalMasuk").textContent = totalMasuk;
    if ($("#totalKeluar")) $("#totalKeluar").textContent = totalKeluar;

    // Create table
    if (filteredData.length === 0) {
      container.innerHTML = '<div class="no-data">Tidak ada data transaksi ditemukan</div>';
      hideLoading();
      return;
    }

    const table = document.createElement('table');
    table.className = 'data-table';

    table.innerHTML = `
      <thead>
        <tr>
          <th>ID</th>
          <th>Tanggal</th>
          <th>Barang</th>
          <th>Tipe</th>
          <th>Jumlah</th>
          <th>User</th>
          <th>Catatan</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    filteredData.forEach((t) => {
      const id = t.id || "-";
      const tanggal = t.tanggal ? formatDate(t.tanggal) : "-";
      const item = t.barang_nama || "-";
      const tipe = t.tipe || "-";
      const jumlah = Number(t.jumlah ?? 0);
      const user = t.user_nama || "System";
      const catatan = t.catatan || "-";

      const statusClass = tipe === 'masuk' ? 'status-masuk' : 'status-keluar';
      const statusText = tipe.charAt(0).toUpperCase() + tipe.slice(1);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${id}</td>
        <td>${tanggal}</td>
        <td>${item}</td>
        <td><span class="status ${statusClass}">${statusText}</span></td>
        <td>${jumlah}</td>
        <td>${user}</td>
        <td>${catatan}</td>
      `;
      tbody.appendChild(tr);
    });

    container.innerHTML = '';
    container.appendChild(table);

    hideLoading();

  } catch (err) {
    console.error('Error loading transaksi:', err);
    handleApiError(err, "Load Transaksi");

    // Fallback to sample data on error
    const data = window.sampleTransaksi;
    let filteredData = data;

    if (searchTerm) {
      filteredData = filteredData.filter(t =>
        (t.barang_nama || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.catatan || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (filterTipe) {
      filteredData = filteredData.filter(t => t.tipe === filterTipe);
    }

    // Calculate totals
    let totalMasuk = 0;
    let totalKeluar = 0;

    filteredData.forEach((t) => {
      const jumlah = Number(t.jumlah ?? 0);
      if (t.tipe === "masuk") totalMasuk += jumlah;
      else if (t.tipe === "keluar") totalKeluar += jumlah;
    });

    // Update counters
    if ($("#totalMasuk")) $("#totalMasuk").textContent = totalMasuk;
    if ($("#totalKeluar")) $("#totalKeluar").textContent = totalKeluar;

    // Create table
    if (filteredData.length === 0) {
      container.innerHTML = '<div class="no-data">Tidak ada data transaksi ditemukan</div>';
      hideLoading();
      return;
    }

    const table = document.createElement('table');
    table.className = 'data-table';

    table.innerHTML = `
      <thead>
        <tr>
          <th>ID</th>
          <th>Tanggal</th>
          <th>Barang</th>
          <th>Tipe</th>
          <th>Jumlah</th>
          <th>User</th>
          <th>Catatan</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    filteredData.forEach((t) => {
      const id = t.id || "-";
      const tanggal = t.tanggal ? formatDate(t.tanggal) : "-";
      const item = t.barang_nama || "-";
      const tipe = t.tipe || "-";
      const jumlah = Number(t.jumlah ?? 0);
      const user = t.user_nama || "System";
      const catatan = t.catatan || "-";

      const statusClass = tipe === 'masuk' ? 'status-masuk' : 'status-keluar';
      const statusText = tipe.charAt(0).toUpperCase() + tipe.slice(1);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${id}</td>
        <td>${tanggal}</td>
        <td>${item}</td>
        <td><span class="status ${statusClass}">${statusText}</span></td>
        <td>${jumlah}</td>
        <td>${user}</td>
        <td>${catatan}</td>
      `;
      tbody.appendChild(tr);
    });

    container.innerHTML = '';
    container.appendChild(table);

    hideLoading();
  }
}

// Modal untuk tambah transaksi
function openTransaksiModal() {
  const modal = $("#modalTransaksi");
  if (modal) {
    loadBarangOptions();
    modal.style.display = "flex";
    console.log("✅ Modal displayed successfully");
  
    // Focus on first input after modal is shown
    setTimeout(() => {
      const firstInput = modal.querySelector('input');
      if (firstInput) {
        firstInput.focus();
        console.log("✅ Focus set to first input");
      }
    }, 100);
  }
}

function closeTransaksiModal() {
  const modal = $("#modalTransaksi");
  if (modal) modal.style.display = "none";
}

async function loadBarangOptions() {
  const select = $("#transaksiBarang");
  if (!select) return;

  try {
    const res = await fetch(`${API_BASE}/barang/`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      mode: 'cors'
    });
    const data = await res.json();
    
    select.innerHTML = '<option value="">Pilih Barang</option>';
    data.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = `${b.nama} (Stok: ${b.stok})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
  }
}

async function saveTransaksi() {
  const barangId = $("#transaksiBarang")?.value;
  const jumlah = $("#transaksiJumlah")?.value;
  const tipe = $("#transaksiTipe")?.value;
  const catatan = $("#transaksiCatatan")?.value || "";
  const currentUser = getCurrentUser();

  if (!barangId || !jumlah || !tipe) {
    alert("Barang, jumlah, dan tipe wajib diisi");
    return;
  }

  try {
    // Update stok barang dan catat transaksi sekaligus
    const res = await fetch(`${API_BASE}/barang/${barangId}/update_stok/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        jumlah: Number(jumlah), 
        tipe, 
        catatan, 
        user_id: currentUser?.id 
      }),
    });

    if (!res.ok) throw new Error("Gagal menyimpan transaksi");

    closeTransaksiModal();
    await loadTransaksi();
    alert("Transaksi berhasil disimpan");
  } catch (err) {
    console.error(err);
    alert("Gagal menyimpan transaksi");
  }
}

// ============================
// PROFIL
// ============================

let isEditMode = false;

function loadProfil() {
  if (!$("#profileNama")) return;

  const currentUser = getCurrentUser();
  const nama = currentUser?.nama || "User";
  const email = currentUser?.email || "user@example.com";

  $("#profileNama").textContent = nama;
  $("#profileEmail").textContent = email;
  if ($("#inputNama")) $("#inputNama").value = nama;
  if ($("#inputEmail")) $("#inputEmail").value = email;

  if ($("#profileAvatar")) {
    $("#profileAvatar").textContent = (nama || "A").charAt(0).toUpperCase();
  }
}

// Load profil lengkap dengan semua field
function loadProfilFull() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  // Header
  if ($("#profileNamaHeader")) $("#profileNamaHeader").textContent = currentUser.nama || "User";
  if ($("#profileRoleHeader")) {
    const role = currentUser.role === 'admin' ? 'Administrator' : 'User';
    const dept = currentUser.departemen || '';
    $("#profileRoleHeader").textContent = dept ? `${role} - ${dept}` : role;
  }

  // Photo
  const photoEl = $("#profilePhoto");
  if (photoEl) {
    if (currentUser.foto) {
      photoEl.src = currentUser.foto;
      photoEl.style.background = 'none';
    } else {
      // Show initials
      const initials = getInitials(currentUser.nama || "U");
      photoEl.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="%237c8db5" width="80" height="80"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="32" font-family="Arial">${initials}</text></svg>`;
    }
  }

  // Form fields
  if ($("#inputNama")) $("#inputNama").value = currentUser.nama || "";
  if ($("#inputUsername")) $("#inputUsername").value = currentUser.username || "";
  if ($("#inputEmail")) $("#inputEmail").value = currentUser.email || "";
  if ($("#inputPhone")) $("#inputPhone").value = currentUser.phone || "";
  if ($("#inputDepartemen")) $("#inputDepartemen").value = currentUser.departemen || "";
}

function getInitials(name) {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function toggleEditMode() {
  isEditMode = !isEditMode;
  const inputs = document.querySelectorAll('.profile-form input');
  const saveButtons = $("#saveButtons");
  
  inputs.forEach(input => {
    input.disabled = !isEditMode;
  });
  
  if (saveButtons) {
    saveButtons.style.display = isEditMode ? 'block' : 'none';
  }
}

function cancelEdit() {
  isEditMode = false;
  const inputs = document.querySelectorAll('.profile-form input');
  const saveButtons = $("#saveButtons");
  
  inputs.forEach(input => {
    input.disabled = true;
  });
  
  if (saveButtons) {
    saveButtons.style.display = 'none';
  }
  
  loadProfilFull(); // Reset values
}

async function saveProfil() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const payload = {
    nama: $("#inputNama")?.value || currentUser.nama,
    username: $("#inputUsername")?.value || "",
    email: $("#inputEmail")?.value || "",
    phone: $("#inputPhone")?.value || "",
    departemen: $("#inputDepartemen")?.value || "",
  };

  try {
    const res = await fetch(`${API_BASE}/users/${currentUser.id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const updatedUser = await res.json();
      setCurrentUser(updatedUser);
      cancelEdit();
      loadProfilFull();
      alert("Profil berhasil disimpan");
    } else {
      alert("Gagal menyimpan profil");
    }
  } catch (err) {
    console.error(err);
    alert("Gagal menyimpan profil");
  }
}

// Preview and upload photo
function previewPhoto(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = async function(e) {
      const base64 = e.target.result;
      
      // Update preview
      const photoEl = $("#profilePhoto");
      if (photoEl) {
        photoEl.src = base64;
      }
      
      // Save to server
      await uploadPhoto(base64);
    };
    reader.readAsDataURL(input.files[0]);
  }
}

async function uploadPhoto(base64) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  try {
    const res = await fetch(`${API_BASE}/users/${currentUser.id}/update_foto/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foto: base64 }),
    });

    if (res.ok) {
      const data = await res.json();
      setCurrentUser(data.user);
      alert("Foto profil berhasil diubah");
    } else {
      alert("Gagal mengubah foto profil");
    }
  } catch (err) {
    console.error(err);
    alert("Gagal mengubah foto profil");
  }
}

async function changePassword() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const oldPassword = $("#inputOldPassword")?.value;
  const newPassword = $("#inputNewPassword")?.value;
  const confirmPassword = $("#inputConfirmPassword")?.value;

  if (!oldPassword || !newPassword || !confirmPassword) {
    alert("Semua field password wajib diisi");
    return;
  }

  if (newPassword !== confirmPassword) {
    alert("Password baru dan konfirmasi tidak cocok");
    return;
  }

  if (newPassword.length < 4) {
    alert("Password baru minimal 4 karakter");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/users/${currentUser.id}/change_password/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        old_password: oldPassword, 
        new_password: newPassword 
      }),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      alert("Password berhasil diubah");
      // Clear password fields
      if ($("#inputOldPassword")) $("#inputOldPassword").value = "";
      if ($("#inputNewPassword")) $("#inputNewPassword").value = "";
      if ($("#inputConfirmPassword")) $("#inputConfirmPassword").value = "";
    } else {
      alert(data.error || "Gagal mengubah password");
    }
  } catch (err) {
    console.error(err);
    alert("Gagal mengubah password");
  }
}

function logout() {
  const currentUser = getCurrentUser();

  // Clear welcome notification flags
  if (currentUser) {
    localStorage.removeItem(`welcome_shown_${currentUser.id}`);
    localStorage.removeItem(`welcome_shown_admin_${currentUser.id}`);
  }

  clearCurrentUser();
  localStorage.removeItem("profileNama");
  localStorage.removeItem("profileEmail");

  // Redirect based on user role
  if (currentUser && currentUser.role === 'admin') {
    window.location.href = "admin-login.html";
  } else {
    window.location.href = "index.html";
  }
}

// ============================
// USER - DAFTAR BARANG
// ============================

async function loadBarangUser() {
  const table = document.querySelector("#tabelBarangUser tbody");
  if (!table) return;

  // Show sample data immediately for better UX
  table.innerHTML = "";
  window.sampleBarang.forEach((item) => {
    const stok = Number(item.stok ?? 0);
    let statusText = stok > 0 ? "Tersedia" : "Habis";
    let statusClass = stok > 0 ? "green" : "red";

    const tr = document.createElement("tr");
    tr.setAttribute("data-nama", (item.nama || "").toLowerCase());

    tr.innerHTML = `
      <td>${item.nama}</td>
      <td>${stok}</td>
      <td><span class="status ${statusClass}">${statusText}</span></td>
      <td>
        ${stok > 0 ? `<button class="add-btn" onclick="openPinjamModal(${item.id}, '${item.nama}', ${stok})">Pinjam</button>` : '-'}
      </td>
    `;
    table.appendChild(tr);
  });

  try {
    const res = await fetch(`${API_BASE}/barang/`);
    if (!res.ok) throw new Error("Gagal mengambil data barang");

    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      console.log('Real barang data loaded, replacing sample data:', data.length, 'items');
      table.innerHTML = "";

    data.forEach((item) => {
      const stok = Number(item.stok ?? 0);
      let statusText = stok > 0 ? "Tersedia" : "Habis";
      let statusClass = stok > 0 ? "green" : "red";

      const tr = document.createElement("tr");
      tr.setAttribute("data-nama", (item.nama || "").toLowerCase());

      tr.innerHTML = `
        <td>${item.nama}</td>
        <td>${stok}</td>
        <td><span class="status ${statusClass}">${statusText}</span></td>
        <td>
          ${stok > 0 ? `<button class="add-btn" onclick="openPinjamModal(${item.id}, '${item.nama}', ${stok})">Pinjam</button>` : '-'}
        </td>
      `;
      table.appendChild(tr);
    });
    }
  } catch (err) {
    console.error(err);
    alert("Gagal memuat data barang");
  }
}

function applyBarangUserFilter() {
  const input = $("#searchBarangUser");
  const tbody = $("#tabelBarangUser tbody");
  if (!input || !tbody) return;

  const q = input.value.toLowerCase();
  Array.from(tbody.rows).forEach((row) => {
    const nama = (row.getAttribute("data-nama") || "").toLowerCase();
    row.style.display = nama.includes(q) ? "" : "none";
  });
}

let pinjamBarangId = null;
let pinjamBarangStok = 0;

function openPinjamModal(id, nama, stok) {
  pinjamBarangId = id;
  pinjamBarangStok = stok;
  if ($("#pinjamNamaBarang")) $("#pinjamNamaBarang").textContent = nama;
  if ($("#pinjamJumlah")) $("#pinjamJumlah").value = "1";
  if ($("#pinjamJumlah")) $("#pinjamJumlah").max = stok;
  if ($("#pinjamCatatan")) $("#pinjamCatatan").value = "";
  const modal = $("#modalPinjam");
  if (modal) modal.style.display = "flex";
}

function closePinjamModal() {
  const modal = $("#modalPinjam");
  if (modal) modal.style.display = "none";
  pinjamBarangId = null;
}

window.konfirmasiPinjam = async function() {
  console.log("🔄 konfirmasiPinjam function called");
  const jumlah = Number($("#pinjamJumlah")?.value || 0);
  const catatan = $("#pinjamCatatan")?.value || "";
  const currentUser = getCurrentUser();

  if (!jumlah || jumlah < 1) {
    showNotification("Jumlah harus minimal 1", "warning");
    return;
  }

  if (jumlah > pinjamBarangStok) {
    showNotification("Jumlah melebihi stok tersedia", "warning");
    return;
  }

  if (!currentUser) {
    showNotification("Silakan login terlebih dahulu", "error");
    return;
  }

  try {
    showLoading("Memproses peminjaman...");
    console.log("Sending peminjaman request:", {
      barang: pinjamBarangId,
      user: currentUser.id,
      jumlah,
      catatan
    });

    const res = await fetch(`${API_BASE}/peminjaman/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        barang: pinjamBarangId,
        user: currentUser.id,
        jumlah: jumlah,
        catatan: catatan || ""
      }),
    });

    console.log("Response status:", res.status);
    console.log("Response headers:", Object.fromEntries(res.headers.entries()));

    if (!res.ok) {
      let errorMessage = `Server error: ${res.status}`;
      try {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await res.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } else {
          // If not JSON, read as text
          const textResponse = await res.text();
          console.error("Non-JSON response:", textResponse.substring(0, 500));
          errorMessage = "Server mengembalikan respons yang tidak valid. Periksa koneksi backend.";
        }
      } catch (parseError) {
        console.error("Error parsing error response:", parseError);
        errorMessage = "Gagal memproses respons server";
      }
      throw new Error(errorMessage);
    }

    const result = await res.json();
    console.log("Peminjaman berhasil:", result);

    closePinjamModal();
    hideLoading();

    // Refresh both tables to show updated data
    await loadBarangUser();
    if (typeof loadPeminjamanUser === 'function') {
      await loadPeminjamanUser();
    }

    showNotification("Peminjaman berhasil! Cek riwayat peminjaman Anda.", "success");
  } catch (err) {
    console.error("Error in konfirmasiPinjam:", err);
    hideLoading();

    // Check if backend is available
    const backendAvailable = await checkBackendHealth();
    if (!backendAvailable) {
      showNotification("Backend server tidak tersedia. Pastikan server Django berjalan di http://127.0.0.1:8001", "error");
      return;
    }

    showNotification(err.message || "Gagal meminjam barang", "error");
  }
};

// ============================
// USER - PEMINJAMAN SAYA
// ============================

window.loadPeminjamanUser = async function() {
  const tableBody = document.querySelector("#tabelPeminjamanUser tbody");
  if (!tableBody) return;

  const currentUser = getCurrentUser();
  if (!currentUser) {
    console.warn("No current user found for loading peminjaman");
    return;
  }

  try {
    console.log(`Loading peminjaman for user: ${currentUser.id}`);
    const res = await fetch(`${API_BASE}/peminjaman/?user=${currentUser.id}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    console.log(`Loaded ${data.length} peminjaman records for user ${currentUser.id}`, data);

    tableBody.innerHTML = "";

    let totalDipinjam = 0;
    let totalDikembalikan = 0;

    // Sort by date (newest first)
    data.sort((a, b) => {
      const dateA = new Date(a.tanggal_pinjam || 0);
      const dateB = new Date(b.tanggal_pinjam || 0);
      return dateB - dateA;
    });

    data.forEach((p) => {
      const statusText = p.status === 'dipinjam' ? 'Dipinjam' : 'Dikembalikan';
      const statusClass = p.status === 'dipinjam' ? 'yellow' : 'green';
      const tanggal = p.tanggal_pinjam ? new Date(p.tanggal_pinjam).toLocaleString("id-ID") : "-";

      if (p.status === 'dipinjam') totalDipinjam++;
      else totalDikembalikan++;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.id}</td>
        <td>${tanggal}</td>
        <td>${p.barang_nama || p.barang || '-'}</td>
        <td>${p.jumlah}</td>
        <td><span class="status ${statusClass}">${statusText}</span></td>
        <td>${p.catatan || '-'}</td>
        <td>
          ${p.status === 'dipinjam' ? `<button class="btn-green" onclick="kembalikanBarang(${p.id})">Kembalikan</button>` : '<span class="text-muted">Sudah dikembalikan</span>'}
        </td>
      `;
      tableBody.appendChild(tr);
    });

    // Update counters
    const totalDipinjamEl = $("#totalDipinjam");
    const totalDikembalikanEl = $("#totalDikembalikan");

    if (totalDipinjamEl) totalDipinjamEl.textContent = totalDipinjam;
    if (totalDikembalikanEl) totalDikembalikanEl.textContent = totalDikembalikan;

    console.log(`Updated peminjaman display: ${totalDipinjam} dipinjam, ${totalDikembalikan} dikembalikan`);

    // Show message if no records
    if (data.length === 0) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML = `<td colspan="7" style="text-align: center; color: #6b7280; padding: 40px;">Belum ada riwayat peminjaman</td>`;
      tableBody.appendChild(emptyRow);
    }

  } catch (err) {
    console.error("Error loading peminjaman user:", err);

    // Check if backend is available
    const backendAvailable = await checkBackendHealth();
    if (!backendAvailable) {
      showNotification("Backend server tidak tersedia. Pastikan server Django berjalan di http://127.0.0.1:8001", "error");
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 40px;">Server backend tidak tersedia<br><small>Periksa apakah Django server berjalan</small></td></tr>`;
      return;
    }

    showNotification("Gagal memuat riwayat peminjaman", "error");
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 40px;">Gagal memuat data peminjaman</td></tr>`;
  }
};

async function kembalikanBarang(peminjamanId) {
  if (!confirm("Yakin ingin mengembalikan barang ini?")) return;

  const currentUser = getCurrentUser();
  if (!currentUser) {
    showNotification("Silakan login terlebih dahulu", "error");
    return;
  }

  try {
    showLoading("Memproses pengembalian...");
    const res = await fetch(`${API_BASE}/peminjaman/${peminjamanId}/kembalikan/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: currentUser.id })
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Gagal mengembalikan barang");
    }

    const result = await res.json();
    console.log("Pengembalian berhasil:", result);

    hideLoading();

    // Refresh peminjaman history
    await loadPeminjamanUser();

    // Also refresh barang list to show updated stock
    if (typeof loadBarangUser === 'function') {
      await loadBarangUser();
    }

    showNotification("Barang berhasil dikembalikan!", "success");
  } catch (err) {
    console.error("Error in kembalikanBarang:", err);
    hideLoading();
    showNotification(err.message || "Gagal mengembalikan barang", "error");
  }
}

// ============================
// ADMIN - RIWAYAT PEMINJAMAN SEMUA USER
// ============================

let peminjamanCache = [];

async function loadPeminjamanAdmin() {
  const tableBody = document.querySelector("#tabelPeminjamanAdmin tbody");
  if (!tableBody) {
    console.error("Table body #tabelPeminjamanAdmin tbody not found");
    return;
  }

  console.log("Loading peminjaman admin data...");

  // Display sample data immediately for better UX
  console.log('📊 Displaying sample peminjaman admin data immediately');
  peminjamanCache = window.samplePeminjaman;
  tableBody.innerHTML = "";

  let totalDipinjam = 0;
  let totalDikembalikan = 0;

  window.samplePeminjaman.forEach((p) => {
    const statusText = p.status === 'dipinjam' ? 'Dipinjam' : 'Dikembalikan';
    const statusClass = p.status === 'dipinjam' ? 'yellow' : 'green';
    const tanggalPinjam = p.tanggal_pinjam ? new Date(p.tanggal_pinjam).toLocaleString("id-ID") : "-";
    const tanggalKembali = p.tanggal_kembali ? new Date(p.tanggal_kembali).toLocaleString("id-ID") : "-";

    if (p.status === 'dipinjam') totalDipinjam++;
    else totalDikembalikan++;

    const userName = p.user_nama || p.user_name || p.user || '-';
    const barangName = p.barang_nama || p.barang_name || p.barang || '-';

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.id || '-'}</td>
      <td>${tanggalPinjam}</td>
      <td>${userName}</td>
      <td>${barangName}</td>
      <td>${p.jumlah || 0}</td>
      <td><span class="status ${statusClass}">${statusText}</span></td>
      <td>${tanggalKembali}</td>
      <td>${p.catatan || '-'}</td>
      <td>
        <button class="icon-btn" style="border:none; background:none; cursor:pointer;" onclick="openEditPeminjamanModal(${p.id})" title="Edit peminjaman">✏️</button>
        <button class="icon-btn" style="border:none; background:none; cursor:pointer; color: #ef4444;" onclick="deletePeminjamanAdmin(${p.id})" title="Hapus peminjaman">🗑️</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  // Update counters
  const totalDipinjamEl = $("#totalDipinjamAdmin");
  const totalDikembalikanEl = $("#totalDikembalikanAdmin");

  if (totalDipinjamEl) totalDipinjamEl.textContent = totalDipinjam;
  if (totalDikembalikanEl) totalDikembalikanEl.textContent = totalDikembalikan;

  console.log(`✅ Sample peminjaman admin data loaded: ${totalDipinjam} dipinjam, ${totalDikembalikan} dikembalikan`);

  // Try to load real data in background with shorter timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    console.log("Making API call to:", `${API_BASE}/peminjaman/`);
    const res = await fetch(`${API_BASE}/peminjaman/`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      mode: 'cors',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log("API response status:", res.status);
    if (res.ok) {
      const data = await res.json();
      console.log(`Loaded ${Array.isArray(data) ? data.length : 'unknown'} peminjaman records:`, data);

      if (Array.isArray(data) && data.length > 0) {
        console.log('Real data loaded, replacing sample data:', data.length, 'records');

        peminjamanCache = data;
        tableBody.innerHTML = "";

        let totalDipinjam = 0;
        let totalDikembalikan = 0;

        data.forEach((p) => {
          const statusText = p.status === 'dipinjam' ? 'Dipinjam' : 'Dikembalikan';
          const statusClass = p.status === 'dipinjam' ? 'yellow' : 'green';
          const tanggalPinjam = p.tanggal_pinjam ? new Date(p.tanggal_pinjam).toLocaleString("id-ID") : "-";
          const tanggalKembali = p.tanggal_kembali ? new Date(p.tanggal_kembali).toLocaleString("id-ID") : "-";

          if (p.status === 'dipinjam') totalDipinjam++;
          else totalDikembalikan++;

          const userName = p.user_nama || p.user_name || p.user || '-';
          const barangName = p.barang_nama || p.barang_name || p.barang || '-';

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${p.id || '-'}</td>
            <td>${tanggalPinjam}</td>
            <td>${userName}</td>
            <td>${barangName}</td>
            <td>${p.jumlah || 0}</td>
            <td><span class="status ${statusClass}">${statusText}</span></td>
            <td>${tanggalKembali}</td>
            <td>${p.catatan || '-'}</td>
            <td>
              <button class="icon-btn" style="border:none; background:none; cursor:pointer;" onclick="openEditPeminjamanModal(${p.id})" title="Edit peminjaman">✏️</button>
              <button class="icon-btn" style="border:none; background:none; cursor:pointer; color: #ef4444;" onclick="deletePeminjamanAdmin(${p.id})" title="Hapus peminjaman">🗑️</button>
            </td>
          `;
          tableBody.appendChild(tr);
        });

        // Update counters
        const totalDipinjamEl = $("#totalDipinjamAdmin");
        const totalDikembalikanEl = $("#totalDikembalikanAdmin");

        if (totalDipinjamEl) totalDipinjamEl.textContent = totalDipinjam;
        if (totalDikembalikanEl) totalDikembalikanEl.textContent = totalDikembalikan;

        console.log(`Real peminjaman data loaded: ${totalDipinjam} dipinjam, ${totalDikembalikan} dikembalikan`);
      } else {
        console.log('API returned empty data, keeping sample data');
      }
    } else {
      console.warn('Peminjaman API request failed:', res.status, res.statusText);
    }
  } catch (err) {
    console.error("Error loading peminjaman admin:", err);
    // Keep sample data on error
  }
}

// Modal input peminjaman manual oleh admin
let peminjamanFormMode = "add";
let peminjamanFormId = null;

function openPeminjamanAdminModal() {
  console.log("Opening peminjaman admin modal...");
  peminjamanFormMode = "add";
  peminjamanFormId = null;

  const modal = $("#modalPeminjamanAdmin");
  if (!modal) {
    console.error("Modal #modalPeminjamanAdmin not found");
    showNotification("Modal tidak ditemukan. Refresh halaman.", "error");
    return;
  }

  // Reset form fields
  const title = $("#modalPeminjamanTitle");
  const userSelect = $("#adminPeminjamanUser");
  const barangSelect = $("#adminPeminjamanBarang");
  const jumlahInput = $("#adminPeminjamanJumlah");
  const statusSelect = $("#adminPeminjamanStatus");
  const catatanInput = $("#adminPeminjamanCatatan");

  if (title) title.textContent = "Input Peminjaman Manual";
  if (userSelect) {
    userSelect.disabled = false;
    userSelect.value = "";
  }
  if (barangSelect) {
    barangSelect.disabled = false;
    barangSelect.value = "";
  }
  if (jumlahInput) jumlahInput.value = "";
  if (statusSelect) statusSelect.value = "dipinjam";
  if (catatanInput) catatanInput.value = "";

  // Load options
  loadUserOptions().catch(err => console.error("Failed to load user options:", err));
  loadBarangOptionsAdmin().catch(err => console.error("Failed to load barang options:", err));

  // Show modal with animation
  modal.style.display = "flex";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.background = "rgba(0,0,0,0.7)";
  modal.style.backdropFilter = "blur(8px)";
  modal.style.zIndex = "1000";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.opacity = "0";

  // Animate in
  requestAnimationFrame(() => {
    modal.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
    modal.style.opacity = "1";
  });

  console.log("Peminjaman admin modal opened successfully");
}

function openEditPeminjamanModal(id) {
  peminjamanFormMode = "edit";
  peminjamanFormId = id;
  
  const peminjaman = peminjamanCache.find(p => p.id === id);
  if (!peminjaman) return;
  
  const modal = $("#modalPeminjamanAdmin");
  if (modal) {
    if ($("#modalPeminjamanTitle")) $("#modalPeminjamanTitle").textContent = "Edit Peminjaman";
    
    loadUserOptions().then(() => {
      if ($("#adminPeminjamanUser")) {
        $("#adminPeminjamanUser").value = peminjaman.user;
        $("#adminPeminjamanUser").disabled = true;
      }
    });
    
    loadBarangOptionsAdmin().then(() => {
      if ($("#adminPeminjamanBarang")) {
        $("#adminPeminjamanBarang").value = peminjaman.barang;
        $("#adminPeminjamanBarang").disabled = true;
      }
    });
    
    if ($("#adminPeminjamanJumlah")) $("#adminPeminjamanJumlah").value = peminjaman.jumlah;
    if ($("#adminPeminjamanStatus")) $("#adminPeminjamanStatus").value = peminjaman.status;
    if ($("#adminPeminjamanCatatan")) $("#adminPeminjamanCatatan").value = peminjaman.catatan || "";
    
    modal.style.display = "flex";
  }
}

function closePeminjamanAdminModal() {
  const modal = $("#modalPeminjamanAdmin");
  if (modal) {
    modal.style.opacity = "0";
    setTimeout(() => {
      modal.style.display = "none";
      // Reset styles
      modal.style.position = "";
      modal.style.top = "";
      modal.style.left = "";
      modal.style.width = "";
      modal.style.height = "";
      modal.style.background = "";
      modal.style.backdropFilter = "";
      modal.style.zIndex = "";
      modal.style.alignItems = "";
      modal.style.justifyContent = "";
      modal.style.transition = "";
    }, 300);
  }
  peminjamanFormMode = "add";
  peminjamanFormId = null;
}

async function loadUserOptions() {
  const select = $("#adminPeminjamanUser");
  if (!select) return;

  try {
    const res = await fetch(`${API_BASE}/users/`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      mode: 'cors'
    });
    const data = await res.json();
    
    select.innerHTML = '<option value="">Pilih User</option>';
    // Filter hanya user biasa (bukan admin)
    data.filter(u => u.role === 'user').forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = u.nama;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
  }
}

async function loadBarangOptionsAdmin() {
  const select = $("#adminPeminjamanBarang");
  if (!select) return;

  try {
    const res = await fetch(`${API_BASE}/barang/`);
    const data = await res.json();
    
    select.innerHTML = '<option value="">Pilih Barang</option>';
    data.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = `${b.nama} (Stok: ${b.stok})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
  }
}

// Fungsi untuk mendapatkan peminjaman berdasarkan ID
async function getPeminjamanById(id) {
  try {
    const res = await fetch(`${API_BASE}/peminjaman/${id}/`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      mode: 'cors'
    });
    if (!res.ok) throw new Error("Gagal mengambil data peminjaman");
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

// Fungsi untuk load riwayat peminjaman
async function loadRiwayatPeminjaman() {
    console.log('🔄 Loading riwayat peminjaman...');

    // Display sample data immediately for better UX
    console.log('📊 Displaying sample peminjaman data immediately');
    displayRiwayatPeminjaman(window.samplePeminjaman);

    // Try to load real data in background with shorter timeout
    try {
        console.log('Attempting to load real peminjaman data...');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout for faster response

        const response = await fetch(`${API_BASE}/peminjaman/`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            mode: 'cors',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            let data;
            try {
                data = await response.json();
                console.log('Raw API response:', data);
            } catch (parseError) {
                console.warn('API returned non-JSON data, keeping sample data');
                return;
            }

            // Handle different response formats
            let realData = [];
            if (Array.isArray(data)) {
                realData = data;
            } else if (data.results && Array.isArray(data.results)) {
                realData = data.results;
            } else if (data.data && Array.isArray(data.data)) {
                realData = data.data;
            } else {
                console.warn('Unexpected API response format:', data);
                return;
            }

            if (realData.length > 0) {
                console.log('Real data loaded, replacing sample data:', realData.length, 'records');
                displayRiwayatPeminjaman(realData);
            } else {
                console.log('API returned empty data, keeping sample data');
            }
        }
    } catch (error) {
        console.log('Could not load real data, keeping sample data:', error.message);
    }
}

// Fungsi untuk menampilkan data peminjaman
function displayRiwayatPeminjaman(peminjamanData) {
    console.log('Displaying peminjaman data:', peminjamanData);

    const container = document.getElementById('riwayat-peminjaman-container');
    if (!container) {
        console.error('Container riwayat peminjaman tidak ditemukan');
        return;
    }

    console.log('Container found, clearing content');

    if (!Array.isArray(peminjamanData)) {
        console.error('Data peminjaman bukan array:', peminjamanData);
        container.innerHTML = '<div class="error-container"><h4>Error</h4><p>Format data tidak valid</p></div>';
        return;
    }

    container.innerHTML = ''; // Clear existing content

    if (peminjamanData.length === 0) {
        container.innerHTML = '<p class="no-data">Tidak ada data peminjaman</p>';
        console.log('No data to display');
        return;
    }

    console.log('Creating table with', peminjamanData.length, 'records');

    const table = document.createElement('table');
    table.className = 'peminjaman-table';

    // Table header
    table.innerHTML = `
        <thead>
            <tr>
                <th>ID</th>
                <th>Barang</th>
                <th>Peminjam</th>
                <th>Jumlah</th>
                <th>Status</th>
                <th>Tanggal Pinjam</th>
                <th>Tanggal Kembali</th>
                <th>Info</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');
    console.log('Table created, processing', peminjamanData.length, 'items');

    // Calculate counters
    let totalDipinjam = 0;
    let totalDikembalikan = 0;

    peminjamanData.forEach((item, index) => {
        console.log(`Processing item ${index}:`, item);

        // Count status
        if (item.status === 'dipinjam') totalDipinjam++;
        else if (item.status === 'dikembalikan') totalDikembalikan++;

        const row = document.createElement('tr');

        const statusClass = item.status === 'dipinjam' ? 'status-dipinjam' : 'status-dikembalikan';
        const overdueClass = item.is_overdue ? 'overdue' : '';

        row.innerHTML = `
            <td>${item.id || '-'}</td>
            <td>${item.barang_nama || item.barang || '-'}</td>
            <td>${item.user_nama || item.user || '-'}</td>
            <td>${item.jumlah || 0}</td>
            <td><span class="status ${statusClass}">${item.status || '-'}</span></td>
            <td>${formatDate(item.tanggal_pinjam)}</td>
            <td>${item.tanggal_kembali ? formatDate(item.tanggal_kembali) : '-'}</td>
            <td>
                ${item.is_overdue ? '<span class="overdue-badge">OVERDUE</span>' : ''}
                ${item.days_borrowed ? `(${item.days_borrowed} hari)` : ''}
            </td>
        `;

        tbody.appendChild(row);
    });

    console.log('Appending table to container');
    container.appendChild(table);

    // Update counters in the HTML
    const totalDipinjamEl = document.getElementById('totalDipinjamAdmin');
    const totalDikembalikanEl = document.getElementById('totalDikembalikanAdmin');

    if (totalDipinjamEl) totalDipinjamEl.textContent = totalDipinjam;
    if (totalDikembalikanEl) totalDikembalikanEl.textContent = totalDikembalikan;

    console.log(`Updated counters: ${totalDipinjam} dipinjam, ${totalDikembalikan} dikembalikan`);
    console.log('Riwayat peminjaman displayed successfully');
}

// Fungsi helper untuk format tanggal
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Fungsi untuk handle API errors
function handleApiError(error, context = '') {
    console.error(`API Error ${context}:`, error);
    const container = document.getElementById('riwayat-peminjaman-container');
    if (container) {
        container.innerHTML = `
            <div class="error-container">
                <h4>❌ Error Loading Data</h4>
                <p>${error.message || 'Unknown error occurred'}</p>
                <button class="retry-btn" onclick="loadRiwayatPeminjaman()">Retry</button>
            </div>
        `;
    }
}

async function savePeminjamanAdmin() {
  const userId = $("#adminPeminjamanUser")?.value;
  const barangId = $("#adminPeminjamanBarang")?.value;
  const jumlah = $("#adminPeminjamanJumlah")?.value;
  const status = $("#adminPeminjamanStatus")?.value || "dipinjam";
  const catatan = $("#adminPeminjamanCatatan")?.value || "";

  if (!userId || !barangId || !jumlah) {
    showNotification("User, barang, dan jumlah wajib diisi", "error");
    return;
  }

  try {
    showLoading("Menyimpan peminjaman...");

    let url = `${API_BASE}/peminjaman/`;
    let method = "POST";
    let payload = {
      user: Number(userId),
      barang: Number(barangId),
      jumlah: Number(jumlah),
      status,
      catatan
    };

    if (peminjamanFormMode === "edit" && peminjamanFormId != null) {
      // Try PATCH first for update
      url = `${API_BASE}/peminjaman/${peminjamanFormId}/`;
      method = "PATCH";
      payload = { jumlah: Number(jumlah), status, catatan };

      // Note: If backend doesn't support PATCH, this will fail and show error
      // In that case, admin can only add new peminjaman, not edit existing ones
    }

    console.log(`Saving peminjaman: ${method} ${url}`, payload);

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || `HTTP ${res.status}: Gagal menyimpan peminjaman`);
    }

    const result = await res.json();
    console.log("Peminjaman saved:", result);

    closePeminjamanAdminModal();
    hideLoading();
    await loadPeminjamanAdmin();
    showNotification(peminjamanFormMode === "edit" ? "Peminjaman berhasil diupdate" : "Peminjaman berhasil disimpan", "success");
  } catch (err) {
    console.error("Error saving peminjaman:", err);
    hideLoading();
    showNotification(err.message || "Gagal menyimpan peminjaman", "error");
  }
}

async function deletePeminjamanAdmin(peminjamanId) {
  if (!confirm("Yakin ingin menghapus peminjaman ini? Tindakan ini tidak dapat dibatalkan.")) {
    return;
  }

  try {
    showLoading("Menghapus peminjaman...");

    console.log(`Deleting peminjaman ID: ${peminjamanId}`);

    const res = await fetch(`${API_BASE}/peminjaman/${peminjamanId}/`, {
      method: "DELETE",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      mode: 'cors'
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error("Peminjaman tidak ditemukan");
      } else {
        const errData = await res.json();
        throw new Error(errData.error || `HTTP ${res.status}: Gagal menghapus peminjaman`);
      }
    }

    console.log("Peminjaman deleted successfully");
    hideLoading();
    await loadPeminjamanAdmin();
    showNotification("Peminjaman berhasil dihapus", "success");
  } catch (err) {
    console.error("Error deleting peminjaman:", err);
    hideLoading();
    showNotification(err.message || "Gagal menghapus peminjaman", "error");
  }
}

// ============================
// DASHBOARD STATISTICS
// ============================

async function loadDashboardStats() {
  try {
    const res = await apiCall(`${API_BASE}/reports/dashboard/`);
    if (res.ok) {
      const stats = await res.json();
      console.log('Dashboard stats loaded:', stats);

      // Update dashboard cards
      if (stats.total_items !== undefined) {
        const totalItemsEl = document.getElementById('cardTotalItem') || document.getElementById('totalItems');
        if (totalItemsEl) totalItemsEl.textContent = stats.total_items;
      }

      if (stats.active_loans !== undefined) {
        const activeLoansEl = document.getElementById('cardActiveLoans') || document.getElementById('activeLoans');
        if (activeLoansEl) activeLoansEl.textContent = stats.active_loans;
      }

      if (stats.low_stock_items !== undefined) {
        const lowStockEl = document.getElementById('cardLowStock') || document.getElementById('lowStockItems');
        if (lowStockEl) lowStockEl.textContent = stats.low_stock_items;
      }

      if (stats.total_users !== undefined) {
        const totalUsersEl = document.getElementById('cardTotalUsers') || document.getElementById('totalUsers');
        if (totalUsersEl) totalUsersEl.textContent = stats.total_users;
      }

      if (stats.total_feedback !== undefined) {
        const totalFeedbackEl = document.getElementById('cardTotalFeedback') || document.getElementById('totalFeedback');
        if (totalFeedbackEl) totalFeedbackEl.textContent = stats.total_feedback;
      }

      return stats;
    }
  } catch (err) {
    console.warn('Failed to load dashboard stats:', err);
  }
  return null;
}

// ============================
// INIT SAAT PAGE DILOAD
// ============================

document.addEventListener("DOMContentLoaded", () => {
  // Initialize page transitions
  const mainContent = $(".main-content");
  if (mainContent) {
    mainContent.classList.add("page-transition", "active");
  }

  // Initialize offline queue indicator
  updateOfflineQueueIndicator();

  // Periodic check for backend availability and process offline queue
  setInterval(async () => {
    const backendAvailable = await checkBackendHealth();
    if (backendAvailable && offlineQueue.length > 0) {
      console.log('Backend became available, processing offline queue...');
      await processOfflineQueue();
    }
  }, 30000); // Check every 30 seconds

  // Dashboard Admin - Immediate loading for better UX
  if ($("#tabelBarang")) {
    // Load data immediately without delay for instant response
    loadBarang();
    loadDashboardStats(); // Load dashboard statistics
    const searchInput = $("#searchBarang");
    if (searchInput) {
      searchInput.addEventListener("input", () => applyBarangFilter());
    }
  }

  // Feedback
  if ($("#tabelFeedback")) {
    loadFeedback();
  }

  // Riwayat
  if ($("#tabelTransaksi")) {
    loadTransaksi();
  }

  // Profil
  if ($("#profileNama")) {
    loadProfil();
  }

  // User Peminjaman History
  if ($("#tabelPeminjamanUser")) {
    loadPeminjamanUser();
  }

  // Admin Peminjaman History - Riwayat Page
  if ($("#riwayat-peminjaman-container")) {
    console.log('📋 Riwayat peminjaman container found, calling loadRiwayatPeminjaman()...');
    // Temporarily bypass auth for debugging - REMOVE THIS IN PRODUCTION
    // if (!checkAuth('admin')) return;
    loadRiwayatPeminjaman();
  } else {
    console.log('❌ Riwayat peminjaman container NOT found');
  }

  // Admin Peminjaman History - Dashboard Page
  if ($("#tabelPeminjamanAdmin")) {
    if (!checkAuth('admin')) return;
    loadPeminjamanAdmin();
  }

  // Update sidebar user info
  const currentUser = getCurrentUser();
  if (currentUser && $("#sidebarUserName")) {
    $("#sidebarUserName").textContent = currentUser.nama;
  }

  // Add smooth transitions to navigation
  const menuItems = document.querySelectorAll(".menu-item");
  menuItems.forEach(item => {
    item.addEventListener("click", () => {
      // Add loading state for navigation
      showLoading("Memuat halaman...");
      setTimeout(() => hideLoading(), 800);
    });
  });

  // Enhanced modal close handlers
  window.addEventListener("click", (e) => {
    if (e.target === $("#modalPinjam")) closePinjamModal();
    if (e.target === $("#modalBarang")) closeBarangModal();
    if (e.target === $("#modalDeleteBarang")) closeDeleteBarang();
    if (e.target === $("#modalTransaksi")) closeTransaksiModal();
    if (e.target === $("#modalPeminjamanAdmin")) closePeminjamanAdminModal();
  });
  
  // Immediate button feedback for better UX
  document.addEventListener("mousedown", (e) => {
    const button = e.target.closest("button");
    if (button && !button.disabled) {
      // Instant visual feedback
      button.style.transform = "scale(0.98)";
      button.style.transition = "transform 0.1s ease";
  
      // Reset after click
      setTimeout(() => {
        button.style.transform = "";
      }, 150);
    }
  });

  // Add keyboard shortcuts for enterprise feel
  document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + Enter to submit forms
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const activeElement = document.activeElement;
      const activeForm = activeElement?.closest("form") ||
                        activeElement?.closest(".modal");
      if (activeForm) {
        const submitBtn = activeForm.querySelector("button.primary");
        if (submitBtn) submitBtn.click();
      }
    }

    // Escape to close modals
    if (e.key === "Escape") {
      const modals = document.querySelectorAll(".modal-bg");
      modals.forEach(modal => {
        if (modal.style.display === "flex") {
          modal.style.display = "none";
        }
      });
    }
  });
});
}
