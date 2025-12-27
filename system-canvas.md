# 📊 CLASS DIAGRAM - INVMANAGE SYSTEM
## Frontend & Backend Architecture

```mermaid
classDiagram
    %% ==========================================
    %% BACKEND CLASSES (Django Models)
    %% ==========================================

    class User {
        +id: Integer
        +nama: String
        +username: String
        +email: String
        +password: String (hashed)
        +role: String (admin/user)
        +phone: String
        +departemen: String
        +foto: String (base64)
        +created_at: DateTime
        +updated_at: DateTime
        --
        +login(nama, password): User
        +register(nama, password, admin_code): User
        +change_password(old, new): Boolean
        +update_profile(data): User
        +upload_foto(base64): Boolean
    }

    class Barang {
        +id: Integer
        +nama: String
        +stok: Integer
        +minimum: Integer
        +harga: Decimal
        +created_at: DateTime
        +updated_at: DateTime
        --
        +create(nama, stok, minimum): Barang
        +update(id, data): Barang
        +delete(id): Boolean
        +update_stok(id, jumlah, tipe): Boolean
        +get_low_stock(): List[Barang]
    }

    class Peminjaman {
        +id: Integer
        +user_id: Integer (FK)
        +barang_id: Integer (FK)
        +jumlah: Integer
        +status: String (dipinjam/dikembalikan)
        +tanggal_pinjam: DateTime
        +tanggal_kembali: DateTime
        +catatan: String
        +created_at: DateTime
        --
        +create(user, barang, jumlah, catatan): Peminjaman
        +update(id, data): Peminjaman
        +delete(id): Boolean
        +kembalikan(id, user_id): Boolean
        +get_by_user(user_id): List[Peminjaman]
        +get_all(): List[Peminjaman]
    }

    class Feedback {
        +id: Integer
        +user_id: Integer (FK)
        +pesan: String
        +tanggal: DateTime
        +created_at: DateTime
        --
        +create(user, pesan): Feedback
        +get_all(): List[Feedback]
        +get_by_user(user_id): List[Feedback]
    }

    class Transaksi {
        +id: Integer
        +barang_id: Integer (FK)
        +user_id: Integer (FK)
        +tipe: String (masuk/keluar)
        +jumlah: Integer
        +tanggal: DateTime
        +catatan: String
        --
        +create(barang, user, tipe, jumlah, catatan): Transaksi
        +get_all(): List[Transaksi]
        +filter_by_date(start, end): List[Transaksi]
        +filter_by_type(tipe): List[Transaksi]
    }

    %% ==========================================
    %% FRONTEND CLASSES (JavaScript)
    %% ==========================================

    class ApiCache {
        -cache: Map
        -ttl: Integer
        --
        +set(key, data): void
        +get(key): Object
        +clear(): void
        +size(): Integer
    }

    class ApiService {
        -BASE_URL: String
        -CSRF_TOKEN: String
        --
        +apiCall(url, options, retryCount): Promise
        +getCsrfToken(): Promise<String>
        +checkBackendHealth(): Promise<Boolean>
    }

    class AuthService {
        --
        +getCurrentUser(): User
        +setCurrentUser(user): void
        +clearCurrentUser(): void
        +checkAuth(requiredRole): Boolean
        +doLogin(identifier, password): Promise<User>
        +doAdminLogin(nama, password): Promise<User>
        +doRegister(nama, email, password): Promise<User>
        +doAdminRegister(nama, password, admin_code): Promise<User>
        +logout(): void
    }

    class BarangService {
        -barangCache: Array
        -isOperationInProgress: Boolean
        --
        +loadBarang(forceRefresh): Promise<Array>
        +saveBarang(data): Promise<Barang>
        +deleteBarang(id): Promise<Boolean>
        +applyBarangFilter(): void
        +saveBarangToLocal(item): void
        +getLocalBarang(): Array
        +mergeBarangData(server, local): Array
    }

    class PeminjamanService {
        -peminjamanCache: Array
        --
        +loadPeminjamanUser(): Promise<Array>
        +loadPeminjamanAdmin(): Promise<Array>
        +konfirmasiPinjam(data): Promise<Peminjaman>
        +kembalikanBarang(id, user_id): Promise<Boolean>
        +savePeminjamanAdmin(data): Promise<Peminjaman>
        +deletePeminjamanAdmin(id): Promise<Boolean>
    }

    class FeedbackService {
        --
        +loadFeedback(): Promise<Array>
        +loadFeedbackUser(): Promise<Array>
        +tambahFeedback(pesan): Promise<Feedback>
    }

    class TransaksiService {
        --
        +loadTransaksi(search, filter): Promise<Array>
        +saveTransaksi(data): Promise<Transaksi>
    }

    class ProfileService {
        --
        +loadProfil(): void
        +loadProfilFull(): void
        +saveProfil(data): Promise<User>
        +changePassword(old, new): Promise<Boolean>
        +previewPhoto(file): void
        +uploadPhoto(base64): Promise<Boolean>
    }

    class UIService {
        --
        +showLoading(message, skeleton): void
        +hideLoading(): void
        +showNotification(message, type, duration): void
        +setButtonLoading(button, loading, text): void
        +transitionToPage(callback): void
        +handleApiError(error, context): void
    }

    %% ==========================================
    %% RELATIONSHIPS
    %% ==========================================

    User ||--o{ Peminjaman : "makes"
    User ||--o{ Feedback : "gives"
    User ||--o{ Transaksi : "performs"

    Barang ||--o{ Peminjaman : "borrowed in"
    Barang ||--o{ Transaksi : "involved in"

    Peminjaman ||--|| Transaksi : "generates"

    %% Frontend Services use Backend Models
    AuthService ..> User : "manages"
    BarangService ..> Barang : "manages"
    PeminjamanService ..> Peminjaman : "manages"
    FeedbackService ..> Feedback : "manages"
    TransaksiService ..> Transaksi : "manages"
    ProfileService ..> User : "manages"

    %% All Services use ApiService
    AuthService ..> ApiService : "uses"
    BarangService ..> ApiService : "uses"
    PeminjamanService ..> ApiService : "uses"
    FeedbackService ..> ApiService : "uses"
    TransaksiService ..> ApiService : "uses"
    ProfileService ..> ApiService : "uses"

    %% UI Service used by all
    AuthService ..> UIService : "uses"
    BarangService ..> UIService : "uses"
    PeminjamanService ..> UIService : "uses"
    FeedbackService ..> UIService : "uses"
    TransaksiService ..> UIService : "uses"
    ProfileService ..> UIService : "uses"

    %% Caching
    ApiService ..> ApiCache : "uses"
    BarangService ..> ApiCache : "uses"
```

## 📋 METHOD DETAILS PER CLASS

### 🔐 **User (Backend Model)**
**Authentication Methods:**
- `login(nama, password)` → Returns User object or error
- `register(nama, password, admin_code)` → Creates new admin user
- `change_password(old_password, new_password)` → Updates password
- `logout()` → Clears session

**Profile Methods:**
- `update_profile(data)` → Updates user information
- `upload_foto(base64)` → Updates profile picture

### 📦 **Barang (Backend Model)**
**CRUD Methods:**
- `create(nama, stok, minimum)` → Creates new inventory item
- `update(id, data)` → Updates existing item
- `delete(id)` → Removes item from inventory

**Business Logic:**
- `update_stok(id, jumlah, tipe)` → Updates stock (masuk/keluar)
- `get_low_stock()` → Returns items below minimum stock

### 📋 **Peminjaman (Backend Model)**
**Core Methods:**
- `create(user, barang, jumlah, catatan)` → Creates borrowing record
- `update(id, data)` → Updates borrowing details
- `delete(id)` → Removes borrowing record
- `kembalikan(id, user_id)` → Marks item as returned

**Query Methods:**
- `get_by_user(user_id)` → Gets user's borrowing history
- `get_all()` → Gets all borrowing records (admin)

### 💬 **Feedback (Backend Model)**
**Methods:**
- `create(user, pesan)` → Creates new feedback
- `get_all()` → Gets all feedback (admin)
- `get_by_user(user_id)` → Gets user's feedback

### 🔄 **Transaksi (Backend Model)**
**Methods:**
- `create(barang, user, tipe, jumlah, catatan)` → Records stock transaction
- `get_all()` → Gets all transactions
- `filter_by_date(start, end)` → Filters by date range
- `filter_by_type(tipe)` → Filters by transaction type

### 🌐 **ApiService (Frontend)**
**Core Methods:**
- `apiCall(url, options, retryCount)` → Makes HTTP requests with retry logic
- `getCsrfToken()` → Gets CSRF token for Django
- `checkBackendHealth()` → Checks if backend is available

### 🔑 **AuthService (Frontend)**
**Methods:**
- `getCurrentUser()` → Gets current user from localStorage
- `setCurrentUser(user)` → Saves user to localStorage
- `checkAuth(requiredRole)` → Validates user permissions
- `doLogin(identifier, password)` → User login
- `doAdminLogin(nama, password)` → Admin login (username only)
- `doRegister(nama, email, password)` → User registration
- `doAdminRegister(nama, password, admin_code)` → Admin registration

### 📦 **BarangService (Frontend)**
**Methods:**
- `loadBarang(forceRefresh)` → Loads inventory with caching
- `saveBarang(data)` → Creates/updates inventory item
- `deleteBarang(id)` → Deletes inventory item
- `applyBarangFilter()` → Filters inventory table
- `mergeBarangData(server, local)` → Merges online/offline data

### 📋 **PeminjamanService (Frontend)**
**Methods:**
- `loadPeminjamanUser()` → Loads user's borrowing history
- `loadPeminjamanAdmin()` → Loads all borrowing records (admin)
- `konfirmasiPinjam(data)` → Processes borrowing request
- `kembalikanBarang(id, user_id)` → Returns borrowed item
- `savePeminjamanAdmin(data)` → Admin creates borrowing record
- `deletePeminjamanAdmin(id)` → Admin deletes borrowing record

### 🎨 **UIService (Frontend)**
**UI Methods:**
- `showLoading(message, skeleton)` → Shows loading overlay
- `hideLoading()` → Hides loading overlay
- `showNotification(message, type, duration)` → Shows toast notifications
- `setButtonLoading(button, loading, text)` → Updates button states
- `handleApiError(error, context)` → Handles API errors gracefully

### 💾 **ApiCache (Frontend)**
**Caching Methods:**
- `set(key, data)` → Stores data with TTL
- `get(key)` → Retrieves cached data if not expired
- `clear()` → Clears all cached data
- `size()` → Returns cache size

## 🔄 **SYSTEM FLOW**

```
User Request → Frontend Service → ApiService → Backend API → Database
                      ↓                    ↓              ↓
                UI Updates        Caching/Retry    Business Logic
                      ↓                    ↓              ↓
              Local Storage     Error Handling    Response
                      ↓                    ↓              ↓
                User Feedback    Retry Logic     Data Validation
```

## 📊 **KEY RELATIONSHIPS**

1. **User ↔ Peminjaman**: One-to-Many (User can have multiple borrowings)
2. **Barang ↔ Peminjaman**: One-to-Many (Item can be borrowed multiple times)
3. **User ↔ Feedback**: One-to-Many (User can give multiple feedback)
4. **Barang ↔ Transaksi**: One-to-Many (Item can have multiple transactions)
5. **Peminjaman → Transaksi**: One-to-One (Each borrowing creates a transaction)

## 🏗️ **ARCHITECTURE PATTERNS**

- **MVC Pattern**: Models (Backend) ↔ Views (HTML) ↔ Controllers (JavaScript Services)
- **Service Layer**: Frontend services abstract API calls
- **Repository Pattern**: Data access through service methods
- **Observer Pattern**: UI updates based on data changes
- **Cache-Aside Pattern**: API responses cached for performance
- **Offline-First**: Local storage for offline functionality</content>
</xai:function_call">## ✅ **CLASS DIAGRAM BERHASIL DIBUAT!**

### 📊 **Class Diagram Lengkap - InvManage System**

Saya telah membuat class diagram komprehensif berdasarkan analisis kode frontend dan backend. Diagram ini mencakup:

#### 🏗️ **Backend Classes (Django Models):**
- **`User`** - Manajemen pengguna dan autentikasi
- **`Barang`** - Manajemen inventory dan stok
- **`Peminjaman`** - Sistem peminjaman barang
- **`Feedback`** - Sistem feedback pengguna
- **`Transaksi`** - Riwayat transaksi stok

#### 🌐 **Frontend Classes (JavaScript):**
- **`ApiService`** - HTTP client dengan retry logic
- **`AuthService`** - Manajemen login/register
- **`BarangService`** - CRUD operations untuk inventory
- **`PeminjamanService`** - Manajemen peminjaman
- **`FeedbackService`** - Operasi feedback
- **`TransaksiService`** - Riwayat transaksi
- **`ProfileService`** - Manajemen profil user
- **`UIService`** - UI/UX utilities
- **`ApiCache`** - Sistem caching

#### 🔗 **Key Relationships:**
```
User 1:N Peminjaman
User 1:N Feedback  
User 1:N Transaksi
Barang 1:N Peminjaman
Barang 1:N Transaksi
Peminjaman 1:1 Transaksi
```

#### 📋 **Method Details:**
Setiap class memiliki detail lengkap methods dan fungsinya, termasuk:
- Parameter types
- Return types  
- Business logic descriptions
- Error handling approaches

#### 🎨 **Architecture Patterns:**
- **MVC Pattern** untuk struktur aplikasi
- **Service Layer** untuk abstraksi API
- **Repository Pattern** untuk data access
- **Cache-Aside Pattern** untuk performance
- **Offline-First** untuk reliability

### 📁 **File Location:**
Class diagram telah disimpan di: `system-canvas.md`

Diagram ini dapat digunakan untuk:
- 📚 Dokumentasi sistem
- 🏗️ Perencanaan development
- 👥 Komunikasi dengan tim
- 🔧 Maintenance dan debugging

**🎯 Class diagram siap digunakan untuk memahami arsitektur InvManage system!**