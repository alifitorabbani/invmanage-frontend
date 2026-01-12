// ============================
// KONFIGURASI API BACKEND - INVMANAGE
// ============================

console.log('🚀 InvManage Frontend v2.0 - Loaded at:', new Date().toISOString());
const BACKEND_URL = 'http://localhost:8001';
var API_BASE = `${BACKEND_URL}/api`;

// Removed: updateSelectedBarangButtons function - no longer needed

console.log('🔍 Checking sample data availability...');
console.log('window.sampleFeedback:', !!window.sampleFeedback);
console.log('window.sampleFeedback type:', typeof window.sampleFeedback);
if (window.sampleFeedback) {
  console.log('window.sampleFeedback length:', window.sampleFeedback.length);
  console.log('First sample feedback:', window.sampleFeedback[0]);
}

// Configuration for better error handling
var API_CONFIG = {
  timeout: 10000, // 10 seconds
  retries: 3,
  retryDelay: 1000, // 1 second
  timezone: 'Asia/Jakarta' // UTC+7
};

// CSRF Token Management
var csrfToken = null;

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

var $ = (sel) => document.querySelector(sel);

// ============================
// ENTERPRISE UI ENHANCEMENTS
// ============================

// API Response Caching System
function ApiCache(ttl = 300000) { // 5 minutes default
  this.cache = new Map();
  this.ttl = ttl;
}

ApiCache.prototype.set = function(key, data) {
  this.cache.set(key, {
    data: JSON.parse(JSON.stringify(data)), // Deep clone
    timestamp: Date.now()
  });
};

ApiCache.prototype.get = function(key) {
  const item = this.cache.get(key);
  if (item && (Date.now() - item.timestamp) < this.ttl) {
    return JSON.parse(JSON.stringify(item.data)); // Return clone
  }
  this.cache.delete(key);
  return null;
};

ApiCache.prototype.clear = function() {
  this.cache.clear();
};

ApiCache.prototype.size = function() {
  return this.cache.size;
};

// Global cache instance
var apiCache = new ApiCache();

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
        <p class="margin-0 color-var-gray-600 font-weight-500">${message}</p>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.classList.add("modal-show");

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
    overlay.classList.remove("modal-show");
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

// Get authentication token
function getToken() {
  const user = getCurrentUser();
  return user ? (user.token || user.access_token || localStorage.getItem('auth_token')) : null;
}

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

var barangCache = [];
var barangFormMode = "add";
var barangFormId = null;
var deleteBarangId = null;
var isOperationInProgress = false; // Prevent multiple simultaneous operations

// Barang pagination
var barangCurrentPage = 1;
var barangItemsPerPage = 10;
var barangFilteredData = [];

// Feedback pagination
var feedbackCache = [];
var feedbackCurrentPage = 1;
var feedbackItemsPerPage = 10;

// Transaksi pagination
var transaksiCache = [];
var transaksiCurrentPage = 1;
var transaksiItemsPerPage = 10;
var transaksiFilteredData = [];

// Offline queue for operations when backend is unavailable
var offlineQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');

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
    const res = await apiCall(`${API_BASE}/barang/${operation.itemId}/`, {
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
          <td colspan="6" style="text-align: center; color: #f59e0b; padding: 20px; background: rgba(245, 158, 11, 0.1); border-top: 2px solid #f59e0b;">
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

    // Set filtered data and render with pagination
    barangFilteredData = finalData;
    renderBarangDataWithPagination();

    // No button states to initialize

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
        <td colspan="6" style="text-align: center; color: #ef4444; padding: 40px;">
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

// Enhanced search and filter function with multiple criteria
function applyBarangFilter() {
    const searchTerm = document.getElementById('searchBarang')?.value?.toLowerCase().trim() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const kategoriFilter = document.getElementById('kategoriFilter')?.value || '';

    // Filter the cached data with multiple criteria
    barangFilteredData = barangCache.filter(item => {
        // Search term filter
        const nama = (item.nama || '').toLowerCase();
        const searchMatch = !searchTerm || nama.includes(searchTerm);

        // Status filter
        let statusMatch = true;
        if (statusFilter) {
            const stok = Number(item.stok ?? 0);
            const minimum = Number(item.minimum ?? 5);
            if (statusFilter === 'Tersedia') {
                statusMatch = stok > minimum;
            } else if (statusFilter === 'Stok Rendah') {
                statusMatch = stok > 0 && stok <= minimum;
            } else if (statusFilter === 'Habis') {
                statusMatch = stok <= 0;
            }
        }

        // Kategori filter
        const kategoriMatch = !kategoriFilter || (item.kategori || '') === kategoriFilter;

        return searchMatch && statusMatch && kategoriMatch;
    });

    // Reset to first page when filtering
    barangCurrentPage = 1;

    // Update filter indicators
    updateFilterIndicators();

    // Re-render with pagination
    renderBarangDataWithPagination();
}

// Debounced search function for better performance
var debouncedBarangFilter = debounce(applyBarangFilter, 300);

// Update filter indicators to show active filters
function updateFilterIndicators() {
    const searchInput = document.getElementById('searchBarang');
    const statusFilter = document.getElementById('statusFilter');
    const kategoriFilter = document.getElementById('kategoriFilter');
    const clearSearchBtn = document.getElementById('clearSearch');

    // Show/hide clear search button
    if (clearSearchBtn) {
        clearSearchBtn.style.display = (searchInput?.value?.trim()) ? 'block' : 'none';
    }

    // Add visual indicators for active filters
    [statusFilter, kategoriFilter].forEach(filter => {
        if (filter && filter.value) {
            filter.classList.add('filter-active');
        } else {
            filter.classList.remove('filter-active');
        }
    });
}

// Clear search function
function clearBarangSearch() {
    const searchInput = document.getElementById('searchBarang');
    const statusFilter = document.getElementById('statusFilter');
    const kategoriFilter = document.getElementById('kategoriFilter');

    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = '';
    if (kategoriFilter) kategoriFilter.value = '';

    applyBarangFilter();
}

// Export table data functionality
function exportTableData() {
    try {
        // Get current filtered data
        const dataToExport = barangFilteredData.length > 0 ? barangFilteredData : barangCache;

        if (dataToExport.length === 0) {
            showNotification("Tidak ada data untuk diekspor", "warning");
            return;
        }

        // Create CSV content
        const headers = ["Nama Barang", "Stok", "Minimum", "Status", "Kategori", "Terakhir Update"];
        const csvContent = [
            headers.join(","),
            ...dataToExport.map(item => {
                const stok = Number(item.stok ?? 0);
                const minimum = Number(item.minimum ?? 5);
                let status = "Habis";
                if (stok > minimum) status = "Tersedia";
                else if (stok > 0) status = "Stok Rendah";

                return [
                    `"${(item.nama || '').replace(/"/g, '""')}"`,
                    stok,
                    minimum,
                    `"${status}"`,
                    `"${item.kategori || ''}"`,
                    `"${item.updated_at ? new Date(item.updated_at).toLocaleString('id-ID') : ''}"`
                ].join(",");
            })
        ].join("\n");

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `inventaris-barang-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showNotification(`Berhasil mengekspor ${dataToExport.length} data barang`, "success");
    } catch (error) {
        console.error('Export error:', error);
        showNotification("Gagal mengekspor data", "error");
    }
}

// Removed: editSelectedBarang function - replaced with openSelectItemModal

// Open bulk edit modal for multiple items
function openBulkEditModal() {
  const checkboxes = document.querySelectorAll('#tabelBarang .barang-checkbox:checked');
  const selectedItems = Array.from(checkboxes).map(cb => {
    const itemId = parseInt(cb.dataset.id);
    const item = barangCache.find(b => b.id === itemId);
    return item;
  });

  // Create bulk edit modal
  let modal = document.getElementById('modalBulkEditBarang');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalBulkEditBarang';
    modal.className = 'modal-bg';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Edit Massal Barang</h3>
          <button class="modal-close" onclick="closeBulkEditModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="bulk-edit-info">
            <p><strong>${selectedItems.length} barang dipilih untuk diedit:</strong></p>
            <div class="selected-items-list">
              ${selectedItems.map(item => `<span class="item-tag">${item.nama}</span>`).join('')}
            </div>
          </div>

          <div class="bulk-edit-options">
            <div class="edit-option">
              <label>
                <input type="checkbox" id="bulkEditCategory" onchange="toggleBulkField('category')">
                Update Kategori
              </label>
              <select id="bulkCategorySelect" disabled style="margin-top: 5px;">
                <option value="">Pilih Kategori Baru</option>
                <option value="elektronik">Elektronik</option>
                <option value="peralatan">Peralatan</option>
                <option value="aksesoris">Aksesoris</option>
                <option value="lainnya">Lainnya</option>
              </select>
            </div>

            <div class="edit-option">
              <label>
                <input type="checkbox" id="bulkEditMinimum" onchange="toggleBulkField('minimum')">
                Update Stok Minimum
              </label>
              <input type="number" id="bulkMinimumInput" disabled placeholder="Stok minimum baru" min="0" style="margin-top: 5px;">
            </div>

            <div class="edit-option">
              <label>
                <input type="checkbox" id="bulkEditStock" onchange="toggleBulkField('stock')">
                Update Stok (Tambah/Kurangi)
              </label>
              <div style="margin-top: 5px;">
                <input type="number" id="bulkStockInput" disabled placeholder="Jumlah perubahan" style="width: 120px;">
                <select id="bulkStockOperation" disabled style="width: 100px; margin-left: 5px;">
                  <option value="add">Tambah (+)</option>
                  <option value="subtract">Kurangi (-)</option>
                  <option value="set">Set ke (=)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeBulkEditModal()">Batal</button>
          <button class="btn-primary" onclick="applyBulkEdit()" id="applyBulkEditBtn">Terapkan Perubahan</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Update selected items list
  const itemsList = modal.querySelector('.selected-items-list');
  if (itemsList) {
    itemsList.innerHTML = selectedItems.map(item => `<span class="item-tag">${item.nama}</span>`).join('');
  }

  // Reset form
  modal.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  modal.querySelectorAll('input[type="number"], select').forEach(el => {
    el.disabled = true;
    el.value = '';
  });

  modal.classList.add("modal-show");
}

function closeBulkEditModal() {
  const modal = document.getElementById('modalBulkEditBarang');
  if (modal) modal.classList.remove('modal-show');
}

function toggleBulkField(field) {
  const checkbox = document.getElementById(`bulkEdit${field.charAt(0).toUpperCase() + field.slice(1)}`);
  const input = document.getElementById(`bulk${field.charAt(0).toUpperCase() + field.slice(1)}${field === 'stock' ? 'Input' : field === 'minimum' ? 'Input' : 'Select'}`);

  if (field === 'stock') {
    const operation = document.getElementById('bulkStockOperation');
    input.disabled = !checkbox.checked;
    operation.disabled = !checkbox.checked;
  } else {
    input.disabled = !checkbox.checked;
  }
}

async function applyBulkEdit() {
  const checkboxes = document.querySelectorAll('#tabelBarang .barang-checkbox:checked');
  const selectedItems = Array.from(checkboxes).map(cb => {
    const itemId = parseInt(cb.dataset.id);
    return barangCache.find(b => b.id === itemId);
  });

  if (selectedItems.length === 0) {
    showNotification("Tidak ada barang yang dipilih", "warning");
    return;
  }

  // Collect changes
  const changes = {};

  if (document.getElementById('bulkEditCategory').checked) {
    const category = document.getElementById('bulkCategorySelect').value;
    if (category) changes.kategori = category;
  }

  if (document.getElementById('bulkEditMinimum').checked) {
    const minimum = parseInt(document.getElementById('bulkMinimumInput').value);
    if (!isNaN(minimum) && minimum >= 0) changes.minimum = minimum;
  }

  if (document.getElementById('bulkEditStock').checked) {
    const amount = parseInt(document.getElementById('bulkStockInput').value);
    const operation = document.getElementById('bulkStockOperation').value;
    if (!isNaN(amount)) {
      changes.stockChange = { amount, operation };
    }
  }

  if (Object.keys(changes).length === 0) {
    showNotification("Pilih setidaknya satu perubahan untuk diterapkan", "warning");
    return;
  }

  // Confirm changes
  let confirmMessage = `Apakah Anda yakin ingin menerapkan perubahan berikut ke ${selectedItems.length} barang?\n\n`;
  if (changes.kategori) confirmMessage += `• Kategori: ${changes.kategori}\n`;
  if (changes.minimum !== undefined) confirmMessage += `• Stok Minimum: ${changes.minimum}\n`;
  if (changes.stockChange) {
    const { amount, operation } = changes.stockChange;
    const opText = operation === 'add' ? 'Tambah' : operation === 'subtract' ? 'Kurangi' : 'Set ke';
    confirmMessage += `• Stok: ${opText} ${amount}\n`;
  }

  if (!confirm(confirmMessage)) return;

  showLoading(`Menerapkan perubahan ke ${selectedItems.length} barang...`);

  let successCount = 0;
  let failCount = 0;

  for (const item of selectedItems) {
    try {
      // Prepare update data
      const updateData = { ...item };

      if (changes.kategori) updateData.kategori = changes.kategori;
      if (changes.minimum !== undefined) updateData.minimum = changes.minimum;

      if (changes.stockChange) {
        const { amount, operation } = changes.stockChange;
        const currentStock = Number(item.stok ?? 0);

        if (operation === 'add') {
          updateData.stok = currentStock + amount;
        } else if (operation === 'subtract') {
          updateData.stok = Math.max(0, currentStock - amount);
        } else if (operation === 'set') {
          updateData.stok = Math.max(0, amount);
        }
      }

      // Update local cache immediately
      const existingIndex = barangCache.findIndex(b => b.id === item.id);
      if (existingIndex >= 0) {
        barangCache[existingIndex] = { ...barangCache[existingIndex], ...updateData, _optimistic: true };
      }

      // Try to sync with backend
      const backendAvailable = await checkBackendHealth();

      if (backendAvailable) {
        const payload = {
          nama: updateData.nama,
          stok: updateData.stok,
          minimum: updateData.minimum,
          kategori: updateData.kategori,
          harga: 0
        };

        const res = await fetch(`${API_BASE}/barang/${item.id}/`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const result = await res.json();
          // Update with real server data
          if (existingIndex >= 0) {
            barangCache[existingIndex] = { ...result, _synced: true };
          }
          successCount++;
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } else {
        // Add to offline queue
        addToOfflineQueue({
          type: 'update_barang',
          itemId: item.id,
          data: updateData
        });
        successCount++;
      }

    } catch (error) {
      console.error(`Failed to update item ${item.id}:`, error);
      failCount++;
    }
  }

  hideLoading();
  closeBulkEditModal();

  // Update UI
  renderBarangData(barangCache);
  updateSelectedBarangButtons();

  if (successCount > 0) {
    showNotification(`${successCount} barang berhasil diupdate${failCount > 0 ? `, ${failCount} gagal` : ''}`, failCount > 0 ? "warning" : "success");
  } else {
    showNotification("Gagal mengupdate semua barang yang dipilih", "error");
  }
}

// Removed: deleteSelectedBarang function - replaced with performDeleteWithQuantity

// Separate rendering function for better code organization
function renderBarangData(data, startNumber = 1) {
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

  data.forEach((item, index) => {
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

    const rowNumber = startNumber + index;

    const tr = document.createElement("tr");
    tr.setAttribute("data-nama", (item.nama || "").toLowerCase());
    tr.setAttribute("data-id", item.id);
    if (rowClass) tr.className = rowClass;

    // Use innerHTML for better performance
    tr.innerHTML = `
      <td>${rowNumber}</td>
      <td>
        ${statusIndicator}
        ${sanitizeInput(item.nama || '-')}
      </td>
      <td>${stok}</td>
      <td>${item.minimum || 5}</td>
      <td><span class="status ${statusClass}">${statusText}</span></td>
      <td>${item.updated_at ? new Date(item.updated_at).toLocaleString('id-ID') : '-'}</td>
    `;
    fragment.appendChild(tr);
  });

  // Append all rows at once
  table.appendChild(fragment);

  // No checkboxes to handle

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

// Render barang data with pagination
function renderBarangDataWithPagination() {
  const table = document.querySelector("#tabelBarang tbody");
  if (!table) return;

  // Calculate pagination
  const totalItems = barangFilteredData.length;
  const totalPages = Math.ceil(totalItems / barangItemsPerPage);
  const startIndex = (barangCurrentPage - 1) * barangItemsPerPage;
  const endIndex = startIndex + barangItemsPerPage;
  const pageData = barangFilteredData.slice(startIndex, endIndex);

  // Calculate start number for row numbering
  const startNumber = (barangCurrentPage - 1) * barangItemsPerPage + 1;

  // Render current page data
  renderBarangData(pageData, startNumber);

  // Update pagination controls
  updateBarangPagination(totalPages, totalItems);

  // No button states to update
}

// Update barang pagination controls with event delegation
function updateBarangPagination(totalPages, totalItems) {
  const prevBtn = document.getElementById("prevPage");
  const nextBtn = document.getElementById("nextPage");
  const firstBtn = document.getElementById("firstPage");
  const lastBtn = document.getElementById("lastPage");
  const pageNumbers = document.getElementById("pageNumbers");
  const tableStats = document.getElementById("tableStats");
  const itemsPerPageSelect = document.getElementById("itemsPerPage");

  // Update items per page selector
  if (itemsPerPageSelect) {
    itemsPerPageSelect.value = barangItemsPerPage;
    itemsPerPageSelect.onchange = (e) => {
      barangItemsPerPage = parseInt(e.target.value);
      barangCurrentPage = 1; // Reset to first page
      renderBarangDataWithPagination();
    };
  }

  // Update button states
  if (firstBtn) firstBtn.disabled = barangCurrentPage <= 1;
  if (prevBtn) prevBtn.disabled = barangCurrentPage <= 1;
  if (nextBtn) nextBtn.disabled = barangCurrentPage >= totalPages;
  if (lastBtn) lastBtn.disabled = barangCurrentPage >= totalPages;

  // Generate page number buttons
  if (pageNumbers) {
    pageNumbers.innerHTML = '';
    const maxVisiblePages = 5;
    let startPage = Math.max(1, barangCurrentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    // Adjust start page if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // Add page number buttons
    for (let i = startPage; i <= endPage; i++) {
      const pageBtn = document.createElement('button');
      pageBtn.className = `page-number ${i === barangCurrentPage ? 'active' : ''}`;
      pageBtn.textContent = i;
      pageBtn.dataset.page = i; // Store page number
      pageBtn.onclick = () => {
        barangCurrentPage = i;
        renderBarangDataWithPagination();
        scrollToTop();
      };
      pageNumbers.appendChild(pageBtn);
    }
  }

  // Update table stats
  if (tableStats) {
    const startItem = (barangCurrentPage - 1) * barangItemsPerPage + 1;
    const endItem = Math.min(barangCurrentPage * barangItemsPerPage, totalItems);
    tableStats.textContent = `Menampilkan ${startItem}-${endItem} dari ${totalItems} barang`;
  }
}

// Event delegation for pagination buttons
function setupBarangPaginationEvents() {
  const tableFooter = document.querySelector('.table-footer');
  if (!tableFooter) return;

  tableFooter.addEventListener('click', (e) => {
    const target = e.target;

    if (target.id === 'firstPage' && !target.disabled) {
      barangCurrentPage = 1;
      renderBarangDataWithPagination();
      scrollToTop();
    } else if (target.id === 'prevPage' && !target.disabled) {
      if (barangCurrentPage > 1) {
        barangCurrentPage--;
        renderBarangDataWithPagination();
        scrollToTop();
      }
    } else if (target.id === 'nextPage' && !target.disabled) {
      const totalPages = Math.ceil(barangFilteredData.length / barangItemsPerPage);
      if (barangCurrentPage < totalPages) {
        barangCurrentPage++;
        renderBarangDataWithPagination();
        scrollToTop();
      }
    } else if (target.id === 'lastPage' && !target.disabled) {
      const totalPages = Math.ceil(barangFilteredData.length / barangItemsPerPage);
      barangCurrentPage = totalPages;
      renderBarangDataWithPagination();
      scrollToTop();
    } else if (target.classList.contains('page-number')) {
      const page = parseInt(target.dataset.page);
      if (page && !isNaN(page)) {
        barangCurrentPage = page;
        renderBarangDataWithPagination();
        scrollToTop();
      }
    }
  });
}

// Helper function to scroll to top of table
function scrollToTop() {
  const tableSection = document.querySelector('.table-section');
  if (tableSection) {
    tableSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
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
  modal.classList.add("modal-show");

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
  if (modal) modal.classList.remove("modal-show");
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
  if (modal) modal.classList.add("modal-show");
}

function closeDeleteBarang() {
  const modal = $("#modalDeleteBarang");
  if (modal) modal.classList.remove("modal-show");
  deleteBarangId = null;
}

// Select Item Modal functions
let selectItemMode = 'edit'; // 'edit' or 'delete'

function openSelectItemModal(mode) {
  selectItemMode = mode;
  const modal = $("#modalSelectItem");
  const title = $("#selectItemTitle");
  const quantityGroup = $("#quantityGroup");
  const quantityLabel = $("#quantityLabel");
  const confirmBtn = $("#confirmItemBtn");

  if (title) {
    title.textContent = mode === 'edit' ? 'Pilih Barang untuk Edit' : 'Pilih Barang untuk Hapus';
  }

  if (quantityGroup) {
    if (mode === 'delete') {
      quantityGroup.classList.remove("display-none");
    } else {
      quantityGroup.classList.add("display-none");
    }
  }

  if (quantityLabel) {
    quantityLabel.textContent = mode === 'delete' ? 'Jumlah yang akan dihapus' : 'Jumlah';
  }

  if (confirmBtn) {
    confirmBtn.textContent = mode === 'edit' ? 'Edit Barang' : 'Hapus Barang';
  }

  // Load barang options
  loadBarangOptionsForSelection();

  if (modal) modal.classList.add("modal-show");
}

function closeSelectItemModal() {
  const modal = $("#modalSelectItem");
  if (modal) modal.classList.remove("modal-show");
  const select = $("#selectItemBarang");
  const quantity = $("#selectItemQuantity");
  if (select) select.value = "";
  if (quantity) quantity.value = "";
  const quantityGroup = $("#quantityGroup");
  if (quantityGroup) quantityGroup.classList.add("display-none");
}

function loadBarangOptionsForSelection() {
  const select = $("#selectItemBarang");
  if (!select) return;

  select.innerHTML = '<option value="">Pilih Barang</option>';

  // Use current filtered data or all data
  const dataToUse = barangFilteredData.length > 0 ? barangFilteredData : barangCache;

  dataToUse.forEach(item => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.nama} (Stok: ${item.stok})`;
    select.appendChild(option);
  });
}

function onItemSelected() {
  const select = $("#selectItemBarang");
  const quantityGroup = $("#quantityGroup");

  if (select && select.value && selectItemMode === 'delete' && quantityGroup) {
    quantityGroup.classList.remove("display-none");
  }
}

function confirmItemSelection() {
  const select = $("#selectItemBarang");
  const quantity = $("#selectItemQuantity");

  if (!select || !select.value) {
    showNotification("Pilih barang terlebih dahulu", "warning");
    return;
  }

  const itemId = parseInt(select.value);
  const item = barangCache.find(b => b.id === itemId);

  if (!item) {
    showNotification("Barang tidak ditemukan", "error");
    return;
  }

  if (selectItemMode === 'edit') {
    // Open edit modal for selected item
    openBarangModal('edit', itemId);
    closeSelectItemModal();
  } else if (selectItemMode === 'delete') {
    // Handle delete with quantity
    const qty = quantity && quantity.value ? parseInt(quantity.value) : null;

    if (qty !== null && qty <= 0) {
      showNotification("Jumlah harus lebih dari 0", "warning");
      return;
    }

    if (qty !== null && qty > item.stok) {
      showNotification("Jumlah yang akan dihapus melebihi stok tersedia", "warning");
      return;
    }

    // Confirm delete
    const message = qty === null
      ? `Apakah Anda yakin ingin menghapus semua ${item.nama} (${item.stok} unit)?`
      : `Apakah Anda yakin ingin menghapus ${qty} unit dari ${item.nama}?`;

    if (confirm(message)) {
      performDeleteWithQuantity(itemId, qty);
    }
}
}

async function performDeleteWithQuantity(itemId, quantity) {
  const item = barangCache.find(b => b.id === itemId);
  if (!item) return;

  showLoading(`Menghapus ${quantity === null ? 'semua' : quantity + ' unit'} ${item.nama}...`);

  try {
    const backendAvailable = await checkBackendHealth();

    if (backendAvailable) {
      // If quantity is specified and not all stock, we need to update stock instead of delete
      if (quantity !== null && quantity < item.stok) {
        const newStock = item.stok - quantity;
        const res = await fetch(`${API_BASE}/barang/${itemId}/`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nama: item.nama,
            stok: newStock,
            minimum: item.minimum,
            kategori: item.kategori,
            harga: 0
          }),
        });

        if (res.ok) {
          const result = await res.json();
          // Update cache
          const existingIndex = barangCache.findIndex(b => b.id === itemId);
          if (existingIndex >= 0) {
            barangCache[existingIndex] = { ...result, _synced: true };
          }
          apiCache.set('barang', barangCache);
          renderBarangData(barangCache);
          showNotification(`${quantity} unit ${item.nama} berhasil dihapus`, "success");
        } else {
          throw new Error("Gagal mengupdate stok");
        }
      } else {
        // Delete entire item
        const res = await fetch(`${API_BASE}/barang/${itemId}/`, {
          method: "DELETE",
        });

        if (res.ok) {
          // Remove from cache
          const originalIndex = barangCache.findIndex(b => b.id === itemId);
          barangCache.splice(originalIndex, 1);
          apiCache.set('barang', barangCache);
          renderBarangData(barangCache);
          showNotification(`${item.nama} berhasil dihapus seluruhnya`, "success");
        } else {
          throw new Error("Gagal menghapus barang");
        }
      }
    } else {
      // Offline mode - add to queue
      if (quantity !== null && quantity < item.stok) {
        // Partial delete - update stock
        const newStock = item.stok - quantity;
        addToOfflineQueue({
          type: 'update_barang',
          itemId: itemId,
          data: { ...item, stok: newStock }
        });
      } else {
        // Full delete
        addToOfflineQueue({
          type: 'delete_barang',
          itemId: itemId,
          data: item
        });
      }

      // Update local cache immediately
      if (quantity !== null && quantity < item.stok) {
        const existingIndex = barangCache.findIndex(b => b.id === itemId);
        if (existingIndex >= 0) {
          barangCache[existingIndex] = { ...barangCache[existingIndex], stok: item.stok - quantity, _optimistic: true };
        }
        removeBarangFromLocal(itemId);
        saveBarangToLocal(barangCache[existingIndex]);
      } else {
        const originalIndex = barangCache.findIndex(b => b.id === itemId);
        barangCache.splice(originalIndex, 1);
        removeBarangFromLocal(itemId);
      }

      renderBarangData(barangCache);
      showNotification("Perubahan disimpan secara lokal dan akan disinkronkan nanti", "warning");
    }

    closeSelectItemModal();
  } catch (error) {
    console.error("Error deleting item:", error);
    showNotification(error.message || "Gagal menghapus barang", "error");
  } finally {
    hideLoading();
  }
}

// Function to confirm delete with detailed notification
function confirmDeleteBarang(itemId) {
  // Find the item to delete
  const item = barangCache.find(b => b.id === itemId);
  if (!item) {
    showNotification("Data barang tidak ditemukan", "error");
    return;
  }

  // Show confirmation dialog with item details
  const message = `Apakah Anda yakin ingin menghapus barang berikut?\n\n` +
                  `Nama Barang: ${item.nama}\n` +
                  `Jumlah Stok: ${item.stok} unit\n` +
                  `Status: ${item.stok > (item.minimum || 5) ? 'Tersedia' : item.stok > 0 ? 'Stok Rendah' : 'Habis'}\n\n` +
                  `Tindakan ini tidak dapat dibatalkan.`;

  if (confirm(message)) {
    // Proceed with deletion
    performDeleteBarang(itemId);
  }
}

async function performDeleteBarang(itemId) {
  // Find the item to delete for optimistic update
  const itemToDelete = barangCache.find(b => b.id === itemId);
  if (!itemToDelete) {
    showNotification("Data barang tidak ditemukan", "error");
    return;
  }

  // Immediate UI feedback for instant perceived response
  const originalIndex = barangCache.findIndex(b => b.id === itemId);
  const deletedItem = barangCache.splice(originalIndex, 1)[0];

  // Update local storage
  removeBarangFromLocal(itemId);

  // Update UI immediately - no delay for better UX
  renderBarangData(barangCache);

  // Show immediate success feedback
  showNotification(`Barang "${deletedItem.nama}" berhasil dihapus (menyimpan...)`, "success");

  // Now try to sync with backend
  const backendAvailable = await checkBackendHealth();

  if (backendAvailable) {
    try {
      console.log("Syncing delete with backend for ID:", itemId);

      const res = await apiCall(`${API_BASE}/barang/${itemId}/`, {
        method: "DELETE",
      });

      console.log("Delete response status:", res.status);

      if (res.ok) {
        console.log("Barang deleted successfully on server");

        // Update cache
        apiCache.set('barang', barangCache);

        showNotification(`Barang "${deletedItem.nama}" berhasil dihapus dan disinkronkan`, "success");

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
        itemId: itemId,
        data: deletedItem // Store the item data in case we need to restore it
      });

      showNotification(
        `Gagal menghapus "${deletedItem.nama}" di server. Item dikembalikan dan akan dicoba lagi nanti.`,
        "error"
      );
    }
  } else {
    // Backend not available - add to offline queue
    addToOfflineQueue({
      type: 'delete_barang',
      itemId: itemId,
      data: deletedItem
    });

    showNotification(
      `Server tidak tersedia. Penghapusan "${deletedItem.nama}" disimpan secara lokal dan akan disinkronkan nanti.`,
      "warning"
    );
  }
}

async function confirmDeleteBarang() {
  if (deleteBarangId == null) return;

  // Use the new function
  confirmDeleteBarang(deleteBarangId);
  closeDeleteBarang();
}



// ============================
// FEEDBACK
// ============================

// Helper function to wait for sample data
function waitForSampleData(maxWait = 5000) {
  return new Promise((resolve) => {
    const checkData = () => {
      if (window.sampleFeedback && Array.isArray(window.sampleFeedback)) {
        resolve(true);
      } else if (maxWait <= 0) {
        console.warn('Timeout waiting for sample data');
        resolve(false);
      } else {
        maxWait -= 100;
        setTimeout(checkData, 100);
      }
    };
    checkData();
  });
}

// Make loadFeedback globally available
window.loadFeedback = async function() {
  console.log('🔄 loadFeedback function called');

  const tableBody = document.querySelector("#tabelFeedback tbody");
  console.log('🔄 Loading feedback, table body found:', !!tableBody);
  if (!tableBody) {
    console.error('❌ Feedback table body #tabelFeedback tbody not found');
    console.log('Available elements:', document.querySelectorAll('[id*="Feedback"]'));
    return;
  }

  console.log('✅ Loading feedback...');

  // Wait for sample data to be available
  console.log('⏳ Waiting for sample feedback data...');
  const sampleDataAvailable = await waitForSampleData();
  console.log('Sample data available:', sampleDataAvailable);

  // Display feedback data
  tableBody.innerHTML = "";
  console.log('Sample feedback data available:', !!window.sampleFeedback);
  console.log('Sample feedback is array:', Array.isArray(window.sampleFeedback));
  console.log('Sample feedback length:', window.sampleFeedback?.length);

  // Always try to display sample data first, even if empty
  const feedbackData = window.sampleFeedback && Array.isArray(window.sampleFeedback) ? window.sampleFeedback : [];
  console.log('Using feedback data:', feedbackData.length, 'items');

  if (feedbackData.length > 0) {
    feedbackData.forEach((f, index) => {
      console.log(`Processing feedback ${index}:`, f);
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
  } else {
    console.warn('⚠️ No sample feedback data available, showing empty state');
    tableBody.innerHTML = '<tr><td colspan="3" style="color: #6b7280; text-align: center; padding: 40px;">Belum ada feedback dari pengguna</td></tr>';
  }

  // Try to load real feedback from backend in background
  try {
    console.log('🔄 Attempting to load real feedback from API...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Increased timeout

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
    console.log('API response status:', res.status);

    if (res.ok) {
      const data = await res.json();
      console.log('Feedback API response data:', data);

      if (Array.isArray(data)) {
        if (data.length > 0) {
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
          console.log('API returned empty array, keeping sample data');
          showNotification("Database kosong, menampilkan data sample", "info");
        }
      } else {
        console.warn('API returned non-array data:', typeof data, data);
        showNotification("Format data feedback tidak valid", "warning");
      }
    } else {
      console.warn('Feedback API request failed:', res.status, res.statusText);
      showNotification("Backend tidak tersedia, menampilkan data sample", "warning");
    }
  } catch (err) {
    console.error('Error loading real feedback:', err.message);
    if (err.name === 'AbortError') {
      console.log('API request timed out');
    }
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

    // Apply filters - exclude pending items from history (they belong in verification page)
    let filteredData = data.filter(t => t.status !== 'pending');
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

    // Store filtered data for pagination
    transaksiFilteredData = filteredData;
    transaksiCache = filteredData;

    // Create table with pagination
    renderTransaksiDataWithPagination();

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

// Render transaksi data with pagination
function renderTransaksiDataWithPagination() {
  const container = document.getElementById('riwayat-transaksi-container');
  if (!container) return;

  const filteredData = transaksiFilteredData;

  // Calculate pagination
  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / transaksiItemsPerPage);
  const startIndex = (transaksiCurrentPage - 1) * transaksiItemsPerPage;
  const endIndex = startIndex + transaksiItemsPerPage;
  const pageData = filteredData.slice(startIndex, endIndex);

  // Calculate totals for current page
  let totalMasuk = 0;
  let totalKeluar = 0;

  pageData.forEach((t) => {
    const jumlah = Number(t.jumlah ?? 0);
    if (t.tipe === "masuk") totalMasuk += jumlah;
    else if (t.tipe === "keluar") totalKeluar += jumlah;
  });

  // Update counters
  if ($("#totalMasuk")) $("#totalMasuk").textContent = totalMasuk;
  if ($("#totalKeluar")) $("#totalKeluar").textContent = totalKeluar;

  // Create table
  if (pageData.length === 0) {
    container.innerHTML = '<div class="no-data">Tidak ada data transaksi ditemukan</div>';
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

  pageData.forEach((t) => {
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

  // Add pagination controls
  if (totalPages > 1) {
    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination-controls';
    paginationDiv.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 20px; padding: 10px;';

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '‹ Previous';
    prevBtn.disabled = transaksiCurrentPage === 1;
    prevBtn.onclick = () => {
      if (transaksiCurrentPage > 1) {
        transaksiCurrentPage--;
        renderTransaksiDataWithPagination();
      }
    };
    prevBtn.style.cssText = 'padding: 8px 16px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px;';
    if (prevBtn.disabled) prevBtn.style.opacity = '0.5';

    // Page info
    const pageInfo = document.createElement('span');
    pageInfo.textContent = `Halaman ${transaksiCurrentPage} dari ${totalPages}`;
    pageInfo.style.cssText = 'margin: 0 10px;';

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next ›';
    nextBtn.disabled = transaksiCurrentPage === totalPages;
    nextBtn.onclick = () => {
      if (transaksiCurrentPage < totalPages) {
        transaksiCurrentPage++;
        renderTransaksiDataWithPagination();
      }
    };
    nextBtn.style.cssText = 'padding: 8px 16px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px;';
    if (nextBtn.disabled) nextBtn.style.opacity = '0.5';

    paginationDiv.appendChild(prevBtn);
    paginationDiv.appendChild(pageInfo);
    paginationDiv.appendChild(nextBtn);

    container.appendChild(paginationDiv);
  }
}

// ============================
// PROFIL
// ============================

var isEditMode = false;

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

// Make functions globally available
window.loadProfilFull = function() {
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

// Make profile functions globally available
window.toggleEditMode = function() {
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

// Make cancelEdit globally available
window.cancelEdit = function() {
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

// Make saveProfil globally available
window.saveProfil = async function() {
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

// Make previewPhoto globally available
window.previewPhoto = function(input) {
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

// Make changePassword globally available
window.changePassword = async function() {
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

// Make adminLogout function globally available
window.adminLogout = async function() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/logout/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const data = await response.json();

    if (data.success) {
      // Clear admin session
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_data');
      sessionStorage.clear();

      // Clear welcome notification flags
      const currentUser = getCurrentUser();
      if (currentUser) {
        localStorage.removeItem(`welcome_shown_${currentUser.id}`);
        localStorage.removeItem(`welcome_shown_admin_${currentUser.id}`);
      }

      clearCurrentUser();

      // Redirect to login
      window.location.href = 'admin-login.html';
    } else {
      alert('Logout failed: ' + data.message);
    }
  } catch (error) {
    console.error('Logout error:', error);
    alert('Network error during logout');
  }
}

// Make logout function globally available
window.logout = function() {
  const currentUser = getCurrentUser();

  // Clear welcome notification flags
  if (currentUser) {
    localStorage.removeItem(`welcome_shown_${currentUser.id}`);
    localStorage.removeItem(`welcome_shown_admin_${currentUser.id}`);
  }

  clearCurrentUser();
  localStorage.removeItem("profileNama");
  localStorage.removeItem("profileEmail");

  // Redirect to index.html for all users
  window.location.replace("index.html");
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

var pinjamBarangId = null;
var pinjamBarangStok = 0;

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
        catatan: catatan || "",
        alasan_peminjaman: catatan || "",
        status: "pending" // Request admin approval
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

    showNotification("Permintaan peminjaman telah diajukan. Menunggu persetujuan admin.", "success");
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

    // Sort by date (newest first)
    data.sort((a, b) => {
      const dateA = new Date(a.tanggal_pinjam || 0);
      const dateB = new Date(b.tanggal_pinjam || 0);
      return dateB - dateA;
    });

    // Store filtered data for pagination
    peminjamanUserFilteredData = data;

    // Render with pagination
    renderPeminjamanUserWithPagination();

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

// Render peminjaman user data with pagination
function renderPeminjamanUserWithPagination() {
  const tableBody = document.querySelector("#tabelPeminjamanUser tbody");
  if (!tableBody) return;

  // Calculate pagination
  const totalItems = peminjamanUserFilteredData.length;
  const totalPages = Math.ceil(totalItems / peminjamanUserItemsPerPage);
  const startIndex = (peminjamanUserCurrentPage - 1) * peminjamanUserItemsPerPage;
  const endIndex = startIndex + peminjamanUserItemsPerPage;
  const pageData = peminjamanUserFilteredData.slice(startIndex, endIndex);

  tableBody.innerHTML = "";

  let totalPending = 0;
  let totalApproved = 0;
  let totalDipinjam = 0;
  let totalDikembalikan = 0;
  let totalRejected = 0;

  pageData.forEach((p) => {
    let statusText = '';
    let statusClass = '';
    let actionButton = '';

    if (p.status === 'pending_approval') {
      statusText = 'Menunggu Persetujuan';
      statusClass = 'blue';
      actionButton = '<span class="text-muted">Menunggu approval admin</span>';
      totalPending++;
    } else if (p.status === 'dipinjam') {
      statusText = 'Dipinjam';
      statusClass = 'yellow';
      actionButton = `<button class="btn-green" onclick="kembalikanBarang(${p.id})">Kembalikan</button>`;
      totalDipinjam++;
    } else if (p.status === 'dikembalikan') {
      statusText = 'Dikembalikan';
      statusClass = 'green';
      actionButton = '<span class="text-muted">Sudah dikembalikan</span>';
      totalDikembalikan++;
    } else if (p.status === 'cancelled') {
      statusText = 'Dibatalkan';
      statusClass = 'red';
      actionButton = '<span class="text-muted">Permintaan ditolak</span>';
      totalRejected++;
    }

    const tanggal = p.tanggal_pinjam ? new Date(p.tanggal_pinjam).toLocaleString("id-ID") : "-";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${tanggal}</td>
      <td>${p.barang_nama || p.barang || '-'}</td>
      <td>${p.jumlah}</td>
      <td><span class="status ${statusClass}">${statusText}</span></td>
      <td>${p.catatan || '-'}</td>
      <td>${actionButton}</td>
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
  if (peminjamanUserFilteredData.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `<td colspan="7" style="text-align: center; color: #6b7280; padding: 40px;">Belum ada riwayat peminjaman</td>`;
    tableBody.appendChild(emptyRow);
  }

  // Add pagination controls if needed
  updatePeminjamanUserPagination(totalPages, totalItems);
}

// Update peminjaman user pagination controls
function updatePeminjamanUserPagination(totalPages, totalItems) {
  // Remove existing pagination
  const existingPagination = document.querySelector('.peminjaman-user-pagination');
  if (existingPagination) existingPagination.remove();

  if (totalPages <= 1) return;

  const tableContainer = document.querySelector("#tabelPeminjamanUser").parentElement;
  if (!tableContainer) return;

  const paginationDiv = document.createElement('div');
  paginationDiv.className = 'peminjaman-user-pagination';
  paginationDiv.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 20px; padding: 10px;';

  // Previous button
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '‹ Previous';
  prevBtn.disabled = peminjamanUserCurrentPage === 1;
  prevBtn.onclick = () => {
    if (peminjamanUserCurrentPage > 1) {
      peminjamanUserCurrentPage--;
      renderPeminjamanUserWithPagination();
    }
  };
  prevBtn.style.cssText = 'padding: 8px 16px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px;';
  if (prevBtn.disabled) prevBtn.style.opacity = '0.5';

  // Page info
  const pageInfo = document.createElement('span');
  pageInfo.textContent = `Halaman ${peminjamanUserCurrentPage} dari ${totalPages}`;
  pageInfo.style.cssText = 'margin: 0 10px;';

  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next ›';
  nextBtn.disabled = peminjamanUserCurrentPage === totalPages;
  nextBtn.onclick = () => {
    if (peminjamanUserCurrentPage < totalPages) {
      peminjamanUserCurrentPage++;
      renderPeminjamanUserWithPagination();
    }
  };
  nextBtn.style.cssText = 'padding: 8px 16px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px;';
  if (nextBtn.disabled) nextBtn.style.opacity = '0.5';

  paginationDiv.appendChild(prevBtn);
  paginationDiv.appendChild(pageInfo);
  paginationDiv.appendChild(nextBtn);

  tableContainer.appendChild(paginationDiv);
}

async function ambilBarang(peminjamanId) {
  if (!confirm("Konfirmasi pengambilan barang? Status akan berubah menjadi 'Dipinjam'.")) return;

  const currentUser = getCurrentUser();
  if (!currentUser) {
    showNotification("Silakan login terlebih dahulu", "error");
    return;
  }

  try {
    showLoading("Memproses pengambilan barang...");

    // First check if the peminjaman is approved
    const checkRes = await fetch(`${API_BASE}/peminjaman/${peminjamanId}/`);
    if (!checkRes.ok) {
      throw new Error("Gagal memeriksa status peminjaman");
    }

    const peminjamanData = await checkRes.json();
    if (peminjamanData.status !== 'approved') {
      throw new Error("Peminjaman belum disetujui admin. Silakan tunggu approval terlebih dahulu.");
    }

    const res = await fetch(`${API_BASE}/peminjaman/${peminjamanId}/ambil/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: currentUser.id })
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Gagal mengambil barang");
    }

    const result = await res.json();
    console.log("Pengambilan berhasil:", result);

    hideLoading();

    // Refresh peminjaman history
    await loadPeminjamanUser();

    // Also refresh barang list to show updated stock
    if (typeof loadBarangUser === 'function') {
      await loadBarangUser();
    }

    showNotification("Barang berhasil diambil!", "success");
  } catch (err) {
    console.error("Error in ambilBarang:", err);
    hideLoading();
    showNotification(err.message || "Gagal mengambil barang", "error");
  }
}

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

// Peminjaman admin pagination
var peminjamanAdminCurrentPage = 1;
var peminjamanAdminItemsPerPage = 10;
var peminjamanAdminFilteredData = [];

// Peminjaman user pagination
var peminjamanUserCurrentPage = 1;
var peminjamanUserItemsPerPage = 10;
var peminjamanUserFilteredData = [];

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
        peminjamanAdminFilteredData = data;
        renderPeminjamanAdminWithPagination();
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

// Render peminjaman admin data with pagination
function renderPeminjamanAdminWithPagination() {
  const tableBody = document.querySelector("#tabelPeminjamanAdmin tbody");
  if (!tableBody) return;

  // Calculate pagination
  const totalItems = peminjamanAdminFilteredData.length;
  const totalPages = Math.ceil(totalItems / peminjamanAdminItemsPerPage);
  const startIndex = (peminjamanAdminCurrentPage - 1) * peminjamanAdminItemsPerPage;
  const endIndex = startIndex + peminjamanAdminItemsPerPage;
  const pageData = peminjamanAdminFilteredData.slice(startIndex, endIndex);

  tableBody.innerHTML = "";

  let totalDipinjam = 0;
  let totalDikembalikan = 0;

  pageData.forEach((p) => {
    let statusText = '';
    let statusClass = '';
    let actionButtons = '';

    if (p.status === 'pending_approval') {
      statusText = 'Menunggu Persetujuan';
      statusClass = 'blue';
      actionButtons = `
        <button class="btn-green" onclick="approvePeminjaman(${p.id})" title="Setujui peminjaman">✅ Setujui</button>
        <button class="btn-red" onclick="rejectPeminjaman(${p.id})" title="Tolak peminjaman">❌ Tolak</button>
      `;
    } else if (p.status === 'dipinjam') {
      statusText = 'Dipinjam';
      statusClass = 'yellow';
      actionButtons = `
        <button class="icon-btn" style="border:none; background:none; cursor:pointer;" onclick="openEditPeminjamanModal(${p.id})" title="Edit peminjaman">✏️</button>
        <button class="icon-btn" style="border:none; background:none; cursor:pointer; color: #ef4444;" onclick="deletePeminjamanAdmin(${p.id})" title="Hapus peminjaman">🗑️</button>
      `;
      totalDipinjam++;
    } else if (p.status === 'dikembalikan') {
      statusText = 'Dikembalikan';
      statusClass = 'green';
      actionButtons = `
        <button class="icon-btn" style="border:none; background:none; cursor:pointer;" onclick="openEditPeminjamanModal(${p.id})" title="Edit peminjaman">✏️</button>
        <button class="icon-btn" style="border:none; background:none; cursor:pointer; color: #ef4444;" onclick="deletePeminjamanAdmin(${p.id})" title="Hapus peminjaman">🗑️</button>
      `;
      totalDikembalikan++;
    } else if (p.status === 'cancelled') {
      statusText = 'Dibatalkan';
      statusClass = 'red';
      actionButtons = `
        <button class="icon-btn" style="border:none; background:none; cursor:pointer; color: #ef4444;" onclick="deletePeminjamanAdmin(${p.id})" title="Hapus peminjaman">🗑️</button>
      `;
    }

    const tanggalPinjam = p.tanggal_pinjam ? new Date(p.tanggal_pinjam).toLocaleString("id-ID") : "-";
    const tanggalKembali = p.tanggal_kembali ? new Date(p.tanggal_kembali).toLocaleString("id-ID") : "-";

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
      <td>${actionButtons}</td>
    `;
    tableBody.appendChild(tr);
  });

  // Update counters
  const totalDipinjamEl = $("#totalDipinjamAdmin");
  const totalDikembalikanEl = $("#totalDikembalikanAdmin");

  if (totalDipinjamEl) totalDipinjamEl.textContent = totalDipinjam;
  if (totalDikembalikanEl) totalDikembalikanEl.textContent = totalDikembalikan;

  // Add pagination controls if needed
  updatePeminjamanAdminPagination(totalPages, totalItems);
}

// Update peminjaman admin pagination controls
function updatePeminjamanAdminPagination(totalPages, totalItems) {
  // Remove existing pagination
  const existingPagination = document.querySelector('.peminjaman-admin-pagination');
  if (existingPagination) existingPagination.remove();

  if (totalPages <= 1) return;

  const tableContainer = document.querySelector("#tabelPeminjamanAdmin").parentElement;
  if (!tableContainer) return;

  const paginationDiv = document.createElement('div');
  paginationDiv.className = 'peminjaman-admin-pagination';
  paginationDiv.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 20px; padding: 10px;';

  // Previous button
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '‹ Previous';
  prevBtn.disabled = peminjamanAdminCurrentPage === 1;
  prevBtn.onclick = () => {
    if (peminjamanAdminCurrentPage > 1) {
      peminjamanAdminCurrentPage--;
      renderPeminjamanAdminWithPagination();
    }
  };
  prevBtn.style.cssText = 'padding: 8px 16px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px;';
  if (prevBtn.disabled) prevBtn.style.opacity = '0.5';

  // Page info
  const pageInfo = document.createElement('span');
  pageInfo.textContent = `Halaman ${peminjamanAdminCurrentPage} dari ${totalPages}`;
  pageInfo.style.cssText = 'margin: 0 10px;';

  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next ›';
  nextBtn.disabled = peminjamanAdminCurrentPage === totalPages;
  nextBtn.onclick = () => {
    if (peminjamanAdminCurrentPage < totalPages) {
      peminjamanAdminCurrentPage++;
      renderPeminjamanAdminWithPagination();
    }
  };
  nextBtn.style.cssText = 'padding: 8px 16px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px;';
  if (nextBtn.disabled) nextBtn.style.opacity = '0.5';

  paginationDiv.appendChild(prevBtn);
  paginationDiv.appendChild(pageInfo);
  paginationDiv.appendChild(nextBtn);

  tableContainer.appendChild(paginationDiv);
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

// Fungsi untuk menampilkan data peminjaman dalam section (10 data per section)
function displayRiwayatPeminjaman(peminjamanData) {
    console.log('Displaying peminjaman data in sections:', peminjamanData);

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

    console.log('Creating sections with', peminjamanData.length, 'records');

    // Calculate counters
    let totalDipinjam = 0;
    let totalDikembalikan = 0;

    // Group data into sections of 10 items each
    const itemsPerSection = 10;
    const totalSections = Math.ceil(peminjamanData.length / itemsPerSection);

    for (let sectionIndex = 0; sectionIndex < totalSections; sectionIndex++) {
        const startIndex = sectionIndex * itemsPerSection;
        const endIndex = Math.min(startIndex + itemsPerSection, peminjamanData.length);
        const sectionData = peminjamanData.slice(startIndex, endIndex);

        // Create section container
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'peminjaman-section';
        sectionDiv.innerHTML = `
            <div class="section-header">
                <h3>Section ${sectionIndex + 1} (${startIndex + 1}-${endIndex} dari ${peminjamanData.length})</h3>
            </div>
        `;

        // Create table for this section
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

        // Process items in this section
        sectionData.forEach((item, index) => {
            console.log(`Processing item ${startIndex + index}:`, item);

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

        sectionDiv.appendChild(table);
        container.appendChild(sectionDiv);
    }

    // Update counters in the HTML
    const totalDipinjamEl = document.getElementById('totalDipinjamAdmin');
    const totalDikembalikanEl = document.getElementById('totalDikembalikanAdmin');

    if (totalDipinjamEl) totalDipinjamEl.textContent = totalDipinjam;
    if (totalDikembalikanEl) totalDikembalikanEl.textContent = totalDikembalikan;

    console.log(`Updated counters: ${totalDipinjam} dipinjam, ${totalDikembalikan} dikembalikan`);
    console.log('Riwayat peminjaman displayed in sections successfully');
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

async function approvePeminjaman(peminjamanId) {
  if (!confirm("Setujui permintaan peminjaman ini? Barang akan langsung masuk ke daftar peminjaman.")) {
    return;
  }

  try {
    showLoading("Menyetujui peminjaman...");

    console.log(`Approving peminjaman ID: ${peminjamanId}`);

    const res = await fetch(`${API_BASE}/peminjaman/${peminjamanId}/`, {
      method: "PATCH",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      mode: 'cors',
      body: JSON.stringify({ status: 'dipinjam' }) // Set directly to dipinjam (borrowed)
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || `HTTP ${res.status}: Gagal menyetujui peminjaman`);
    }

    console.log("Peminjaman approved and marked as borrowed successfully");
    hideLoading();
    await loadPeminjamanAdmin();
    showNotification("Peminjaman berhasil disetujui. User dapat mengambil barang.", "success");
  } catch (err) {
    console.error("Error approving peminjaman:", err);
    hideLoading();
    showNotification(err.message || "Gagal menyetujui peminjaman", "error");
  }
}

async function rejectPeminjaman(peminjamanId) {
  const reason = prompt('Masukkan alasan penolakan:');
  if (reason === null) return; // Cancelled
  if (!reason.trim()) {
    showNotification('Alasan penolakan harus diisi', 'warning');
    return;
  }

  try {
    showLoading("Menolak peminjaman...");

    console.log(`Rejecting peminjaman ID: ${peminjamanId}`);

    const res = await fetch(`${API_BASE}/peminjaman/${peminjamanId}/`, {
      method: "PATCH",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      mode: 'cors',
      body: JSON.stringify({
        status: 'cancelled', // Set to cancelled status
        alasan_reject: reason
      })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || `HTTP ${res.status}: Gagal menolak peminjaman`);
    }

    console.log("Peminjaman cancelled successfully");
    hideLoading();
    await loadPeminjamanAdmin();
    showNotification("Peminjaman berhasil ditolak", "success");
  } catch (err) {
    console.error("Error rejecting peminjaman:", err);
    hideLoading();
    showNotification(err.message || "Gagal membatalkan peminjaman", "error");
  }
}

async function deletePeminjamanAdmin(peminjamanId) {
  if (!confirm("Yakin ingin menghapus peminjaman ini? Tindakan ini tidak dapat dibatalkan.")) {
    return;
  }

  try {
    showLoading("Menghapus peminjaman...");

    console.log(`Deleting peminjaman ID: ${peminjamanId}`);

    const res = await apiCall(`${API_BASE}/peminjaman/${peminjamanId}/`, {
      method: "DELETE",
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
// REAL-TIME NOTIFICATIONS
// ============================

// Admin real-time updates
function startAdminRealTimeUpdates() {
  // Polling setiap 30 detik untuk pending requests
  setInterval(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/notifications/pending_requests/`);
      const data = await response.json();

      updatePendingRequests(data.notifications);
      updatePendingCount(data.count);
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    }
  }, 30000); // 30 seconds
}

function updatePendingRequests(notifications) {
  const container = document.getElementById('pendingRequestsContainer');
  if (!container) return;

  container.innerHTML = notifications.map(item => `
    <div class="pending-item">
      <h5>${item.title}</h5>
      <p>${item.message}</p>
      <p><strong>Alasan:</strong> ${item.alasan}</p>
      <button onclick="approveRequest(${item.id})" class="btn btn-success">Approve</button>
      <button onclick="rejectRequest(${item.id})" class="btn btn-danger">Reject</button>
    </div>
  `).join('');
}

// User real-time updates
function startUserRealTimeUpdates() {
  // Polling setiap 15 detik untuk status updates
  setInterval(async () => {
    const userId = getCurrentUser()?.id;
    if (!userId) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/notifications/user_updates/?user_id=${userId}`);
      const data = await response.json();

      if (data.count > 0) {
        showNotifications(data.notifications);
        refreshLoanHistory(); // Refresh daftar peminjaman
      }
    } catch (error) {
      console.error('Error fetching user updates:', error);
    }
  }, 15000); // 15 seconds
}

function showNotifications(notifications) {
  notifications.forEach(notification => {
    showNotification(notification.message, notification.type || 'info');
  });
}

function refreshLoanHistory() {
  // Refresh peminjaman history if functions exist
  if (typeof loadPeminjamanUser === 'function') {
    loadPeminjamanUser();
  }
  if (typeof loadBarangUser === 'function') {
    loadBarangUser();
  }
}

// ============================
// ADMIN VERIFICATION ACTIONS
// ============================

async function approveRequest(loanId) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/peminjaman/${loanId}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'approved'
      })
    });

    const data = await response.json();
    if (response.ok) {
      alert('Peminjaman disetujui!');
      // Refresh pending list
      if (typeof loadPendingRequests === 'function') {
        loadPendingRequests();
      }
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Approval error:', error);
    alert('Network error');
  }
}

async function rejectRequest(loanId) {
  const reason = prompt('Alasan penolakan:');
  if (!reason) return;

  try {
    const response = await fetch(`${BACKEND_URL}/api/peminjaman/${loanId}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'cancelled',
        alasan_reject: reason
      })
    });

    const data = await response.json();
    if (response.ok) {
      alert('Peminjaman ditolak!');
      // Refresh pending list
      if (typeof loadPendingRequests === 'function') {
        loadPendingRequests();
      }
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Rejection error:', error);
    alert('Network error');
  }
}

// ============================
// STATUS BADGES
// ============================

function getStatusBadge(status) {
  const badges = {
    'pending': '<span class="badge badge-warning">Menunggu Approval</span>',
    'approved': '<span class="badge badge-info">Disetujui - Siap Diambil</span>',
    'rejected': '<span class="badge badge-danger">Ditolak</span>',
    'dipinjam': '<span class="badge badge-primary">Dipinjam</span>',
    'dikembalikan': '<span class="badge badge-success">Dikembalikan</span>',
    'pending_approval': '<span class="badge badge-warning">Menunggu Approval</span>',
    'cancelled': '<span class="badge badge-danger">Dibatalkan</span>'
  };
  return badges[status] || '<span class="badge badge-secondary">Unknown</span>';
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
    setupBarangPaginationEvents(); // Setup pagination event delegation
    const searchInput = $("#searchBarang");
    if (searchInput) {
      searchInput.addEventListener("input", () => applyBarangFilter());
    }
  }

  // Feedback - handled by feedback.html initialization
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

  // Set active menu item based on current page
  const currentPath = window.location.pathname;
  const currentPage = currentPath.split('/').pop() || 'index.html';
  const menuItems = document.querySelectorAll('.menu-item');

  menuItems.forEach(item => {
    item.classList.remove('active');
    const href = item.getAttribute('href');
    if (href === currentPage) {
      item.classList.add('active');
    }
  });

  // Add smooth transitions to navigation
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
    if (e.target === $("#modalBulkEditBarang")) closeBulkEditModal();
    if (e.target === $("#modalSelectItem")) closeSelectItemModal();
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

  // Initialize real-time notifications for admin dashboard
  if (window.location.pathname.includes('admin-verification') || window.location.pathname.includes('dashboard')) {
    startAdminRealTimeUpdates();
  }

  // Initialize real-time notifications for user dashboard
  if (window.location.pathname.includes('user-dashboard') || window.location.pathname.includes('user-peminjaman')) {
    startUserRealTimeUpdates();
  }
});
}
