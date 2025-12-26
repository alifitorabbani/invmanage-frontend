// ============================
// SAMPLE DATA - CENTRALIZED
// ============================

// Sample Barang Data
const sampleBarang = [
  { id: 1, nama: "Laptop Acer Aspire 5", stok: 5, minimum: 2 },
  { id: 2, nama: "Mouse Logitech MX Master 3", stok: 15, minimum: 5 },
  { id: 3, nama: "Keyboard Dell KB216", stok: 8, minimum: 3 },
  { id: 4, nama: "Monitor Samsung 24 inch", stok: 6, minimum: 2 },
  { id: 5, nama: "Printer HP LaserJet", stok: 3, minimum: 1 },
  { id: 6, nama: "Router TP-Link AC1200", stok: 4, minimum: 2 },
  { id: 7, nama: "Webcam Logitech C920", stok: 7, minimum: 3 },
  { id: 8, nama: "Microphone Blue Yeti", stok: 2, minimum: 1 },
  { id: 9, nama: "Hard Disk External 1TB", stok: 9, minimum: 4 },
  { id: 10, nama: "Speaker Bluetooth JBL", stok: 12, minimum: 5 }
];

// Sample Users Data
const sampleUsers = [
  { id: 1, nama: "John Doe", email: "john@example.com", role: "user" },
  { id: 2, nama: "Jane Smith", email: "jane@example.com", role: "user" },
  { id: 3, nama: "Bob Johnson", email: "bob@example.com", role: "user" },
  { id: 4, nama: "Alice Wilson", email: "alice@example.com", role: "user" },
  { id: 5, nama: "Charlie Brown", email: "charlie@example.com", role: "user" }
];

// Sample Peminjaman Data
const samplePeminjaman = [
  {
    id: 1,
    user: 1,
    user_nama: "John Doe",
    barang: 1,
    barang_nama: "Laptop Acer Aspire 5",
    jumlah: 1,
    status: "dipinjam",
    tanggal_pinjam: new Date(Date.now() - 86400000 * 2).toISOString(),
    catatan: "Untuk project development",
    days_borrowed: 2
  },
  {
    id: 2,
    user: 2,
    user_nama: "Jane Smith",
    barang: 2,
    barang_nama: "Mouse Logitech MX Master 3",
    jumlah: 1,
    status: "dikembalikan",
    tanggal_pinjam: new Date(Date.now() - 86400000 * 5).toISOString(),
    tanggal_kembali: new Date(Date.now() - 86400000 * 1).toISOString(),
    catatan: "Sudah dikembalikan dalam kondisi baik",
    days_borrowed: 4
  },
  {
    id: 3,
    user: 3,
    user_nama: "Bob Johnson",
    barang: 3,
    barang_nama: "Keyboard Dell KB216",
    jumlah: 1,
    status: "dipinjam",
    tanggal_pinjam: new Date(Date.now() - 86400000 * 1).toISOString(),
    catatan: "Dibutuhkan untuk meeting presentasi",
    days_borrowed: 1
  },
  {
    id: 4,
    user: 1,
    user_nama: "John Doe",
    barang: 4,
    barang_nama: "Monitor Samsung 24 inch",
    jumlah: 1,
    status: "dipinjam",
    tanggal_pinjam: new Date(Date.now() - 86400000 * 3).toISOString(),
    catatan: "Untuk design work",
    days_borrowed: 3,
    is_overdue: true
  },
  {
    id: 5,
    user: 4,
    user_nama: "Alice Wilson",
    barang: 5,
    barang_nama: "Printer HP LaserJet",
    jumlah: 1,
    status: "dikembalikan",
    tanggal_pinjam: new Date(Date.now() - 86400000 * 7).toISOString(),
    tanggal_kembali: new Date(Date.now() - 86400000 * 2).toISOString(),
    catatan: "Printer bekerja dengan baik",
    days_borrowed: 5
  },
  {
    id: 6,
    user: 5,
    user_nama: "Charlie Brown",
    barang: 6,
    barang_nama: "Router TP-Link AC1200",
    jumlah: 1,
    status: "dipinjam",
    tanggal_pinjam: new Date(Date.now() - 86400000 * 4).toISOString(),
    catatan: "Untuk setup jaringan kantor",
    days_borrowed: 4
  }
];

// Sample Feedback Data
const sampleFeedback = [
  {
    user_nama: "John Doe",
    pesan: "Sistem inventory management sangat membantu dalam melacak barang-barang di kantor. Interface yang user-friendly membuatnya mudah digunakan.",
    tanggal: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    user_nama: "Jane Smith",
    pesan: "Fitur peminjaman barang sangat berguna. Prosesnya cepat dan tidak ribet. Terima kasih tim development!",
    tanggal: new Date(Date.now() - 86400000 * 1).toISOString()
  },
  {
    user_nama: "Bob Johnson",
    pesan: "Saran: Tambahkan fitur notifikasi ketika barang yang dipinjam sudah mendekati batas waktu pengembalian.",
    tanggal: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    user_nama: "Alice Wilson",
    pesan: "Dashboard admin sangat informatif. Bisa melihat semua aktivitas peminjaman dengan jelas. Good job!",
    tanggal: new Date(Date.now() - 86400000 * 4).toISOString()
  },
  {
    user_nama: "Charlie Brown",
    pesan: "Aplikasi berjalan lancar di mobile. Responsive design-nya bagus. Tingkatkan lagi!",
    tanggal: new Date(Date.now() - 86400000 * 5).toISOString()
  }
];

// Sample User Feedback (for user-feedback.html)
const sampleUserFeedback = [
  {
    pesan: "Sistem inventory management sangat membantu dalam melacak barang-barang di kantor. Interface yang user-friendly membuatnya mudah digunakan.",
    tanggal: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    pesan: "Fitur peminjaman barang sangat berguna. Prosesnya cepat dan tidak ribet. Terima kasih tim development!",
    tanggal: new Date(Date.now() - 86400000 * 1).toISOString()
  },
  {
    pesan: "Saran: Tambahkan fitur notifikasi ketika barang yang dipinjam sudah mendekati batas waktu pengembalian.",
    tanggal: new Date(Date.now() - 86400000 * 3).toISOString()
  }
];

// Sample Transaksi Data
const sampleTransaksi = [
  {
    id: 1,
    tanggal: new Date(Date.now() - 86400000 * 1).toISOString(),
    barang_nama: "Laptop Acer Aspire 5",
    tipe: "keluar",
    jumlah: 1,
    user_nama: "John Doe",
    catatan: "Peminjaman untuk development"
  },
  {
    id: 2,
    tanggal: new Date(Date.now() - 86400000 * 2).toISOString(),
    barang_nama: "Mouse Logitech MX Master 3",
    tipe: "masuk",
    jumlah: 1,
    user_nama: "Jane Smith",
    catatan: "Pengembalian barang"
  },
  {
    id: 3,
    tanggal: new Date(Date.now() - 86400000 * 3).toISOString(),
    barang_nama: "Keyboard Dell KB216",
    tipe: "keluar",
    jumlah: 1,
    user_nama: "Bob Johnson",
    catatan: "Peminjaman untuk meeting"
  }
];

// Export for use in other files
window.sampleData = {
  barang: sampleBarang,
  users: sampleUsers,
  peminjaman: samplePeminjaman,
  feedback: sampleFeedback,
  userFeedback: sampleUserFeedback,
  transaksi: sampleTransaksi
};

// Make data available globally
window.sampleBarang = sampleBarang;
window.sampleUsers = sampleUsers;
window.samplePeminjaman = samplePeminjaman;
window.sampleFeedback = sampleFeedback;
window.sampleUserFeedback = sampleUserFeedback;
window.sampleTransaksi = sampleTransaksi;