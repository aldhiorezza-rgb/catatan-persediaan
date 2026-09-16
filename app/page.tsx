'use client';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Konfigurasi WhatsApp PIC & Kredensial Admin
const NO_WA_PIC = '6281231333097'; // Ganti dengan nomor PIC Gudang asli (awali 62)
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123'; // Ganti password admin sesuai kebutuhan

interface Barang {
  id: number;
  nama_barang: string;
  kategori: string;
  satuan: string;
  stok: number;
  gambar?: string;
}

interface CartItem {
  id: number;
  nama_barang: string;
  kategori: string;
  satuan: string;
  jumlah: number;
  maxStok: number;
}

export default function Home() {
  const [items, setItems] = useState<Barang[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [namaPemohon, setNamaPemohon] = useState('');
  const [unitKerja, setUnitKerja] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKategori, setSelectedKategori] = useState('Semua');

  // State Login Admin
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Form Input Barang & Kategori Baru
  const [adminNama, setAdminNama] = useState('');
  const [adminKategori, setAdminKategori] = useState('');
  const [adminKategoriBaru, setAdminKategoriBaru] = useState('');
  const [adminSatuan, setAdminSatuan] = useState('pcs');
  const [adminStok, setAdminStok] = useState<number>(1);
  const [adminGambar, setAdminGambar] = useState('');

  // Ambil data stok barang
  const fetchBarang = async () => {
    const { data, error } = await supabase
      .from('stok_barang')
      .select('*')
      .order('id', { ascending: false });
    if (!error && data) setItems(data);
  };

  useEffect(() => {
    fetchBarang();
  }, []);

  // Daftar Kategori Unik yang Tersedia
  const categories = useMemo(() => {
    const list = Array.from(new Set(items.map((i) => i.kategori || 'Umum')));
    return ['Semua', ...list];
  }, [items]);

  // Handle Login Admin
  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameInput === ADMIN_USER && passwordInput === ADMIN_PASS) {
      setIsAdminLoggedIn(true);
      setShowLoginModal(false);
      setShowAdminPanel(true);
      setUsernameInput('');
      setPasswordInput('');
    } else {
      alert('Username atau Password Admin salah!');
    }
  };

  // Tambah Master Barang / Kategori Baru
  const handleAddMasterBarang = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminNama || adminStok <= 0) return;

    // Prioritaskan kategori baru jika diisi, jika tidak gunakan yang dipilih di dropdown
    const finalKategori = (adminKategoriBaru.trim() || adminKategori || 'Umum').trim();

    const { error } = await supabase.from('stok_barang').insert([
      {
        nama_barang: adminNama,
        kategori: finalKategori,
        satuan: adminSatuan,
        stok: adminStok,
        gambar: adminGambar || '',
      },
    ]);

    if (!error) {
      setAdminNama('');
      setAdminKategoriBaru('');
      setAdminStok(1);
      setAdminGambar('');
      fetchBarang();
      alert(`Barang "${adminNama}" di kategori "${finalKategori}" berhasil disimpan!`);
    } else {
      alert('Gagal menambah barang: ' + error.message);
    }
  };

  // Keranjang Belanja
  const addToCart = (barang: Barang) => {
    if (barang.stok <= 0) return;
    setCart((prev) => {
      const exist = prev.find((item) => item.id === barang.id);
      if (exist) {
        if (exist.jumlah < barang.stok) {
          return prev.map((item) =>
            item.id === barang.id ? { ...item, jumlah: item.jumlah + 1 } : item
          );
        }
        return prev;
      }
      return [
        ...prev,
        {
          id: barang.id,
          nama_barang: barang.nama_barang,
          kategori: barang.kategori,
          satuan: barang.satuan,
          jumlah: 1,
          maxStok: barang.stok,
        },
      ];
    });
  };

  const removeFromCart = (id: number) => {
    setCart((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, jumlah: item.jumlah - 1 } : item))
        .filter((item) => item.jumlah > 0)
    );
  };

  // Checkout & Kirim ke WhatsApp PIC
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || !namaPemohon) return;
    setLoading(true);

    try {
      // 1. Potong Stok
      for (const item of cart) {
        const currentItem = items.find((i) => i.id === item.id);
        const newStok = (currentItem?.stok || item.maxStok) - item.jumlah;
        await supabase
          .from('stok_barang')
          .update({ stok: Math.max(0, newStok) })
          .eq('id', item.id);
      }

      // 2. Simpan Rekap Permintaan
      const ringkasan = cart.map((c) => `${c.nama_barang} (${c.jumlah} ${c.satuan})`).join(', ');
      await supabase.from('request_persediaan').insert([
        {
          nama_pemohon: namaPemohon,
          unit_kerja: unitKerja || '-',
          daftar_barang: ringkasan,
        },
      ]);

      // 3. Format Pesan WhatsApp
      let pesanWA = `*PERMINTAAN BARANG PERSEDIAAN GUDANG*%0A`;
      pesanWA += `---------------------------------------%0A`;
      pesanWA += `👤 *Nama Pemohon:* ${encodeURIComponent(namaPemohon)}%0A`;
      pesanWA += `🏢 *Seksi / Unit:* ${encodeURIComponent(unitKerja || '-')}%0A`;
      pesanWA += `📅 *Tanggal:* ${new Date().toLocaleDateString('id-ID')}%0A%0A`;
      pesanWA += `📦 *Daftar Barang yang Diminta:*%0A`;
      cart.forEach((c, idx) => {
        pesanWA += `${idx + 1}. [${encodeURIComponent(c.kategori || 'Umum')}] ${encodeURIComponent(c.nama_barang)}: *${c.jumlah} ${encodeURIComponent(c.satuan)}*%0A`;
      });
      pesanWA += `%0AMohon bantuannya untuk disiapkan, terima kasih! 🙏`;

      window.open(`https://wa.me/${NO_WA_PIC}?text=${pesanWA}`, '_blank');

      setCart([]);
      setNamaPemohon('');
      setUnitKerja('');
      fetchBarang();
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter Search & Kategori
  const filteredItems = items.filter((item) => {
    const matchSearch = item.nama_barang.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = selectedKategori === 'Semua' || (item.kategori || 'Umum') === selectedKategori;
    return matchSearch && matchCat;
  });

  return (
    <main className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Katalog Permintaan Persediaan Kantor
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Pilih kebutuhan persediaan kantor seperti berbelanja, pesanan langsung terkirim ke WhatsApp PIC Gudang.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdminLoggedIn ? (
            <>
              <button
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
              >
                {showAdminPanel ? 'Tutup Panel Admin' : '⚙️ Kelola Stok'}
              </button>
              <button
                onClick={() => {
                  setIsAdminLoggedIn(false);
                  setShowAdminPanel(false);
                }}
                className="px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition"
              >
                Keluar Admin
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition flex items-center gap-1.5"
            >
              🔒 <span>Kelola Stok (Admin)</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal Dialog Login Admin */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Login Admin Gudang</h3>
            <p className="text-xs text-slate-500 mb-4">Masukkan otentikasi untuk mengelola stok persediaan.</p>
            <form onSubmit={handleAdminAuth} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Username</label>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="admin"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="w-1/2 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm"
                >
                  Masuk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Panel Kelola Stok (Khusus Admin) */}
      {isAdminLoggedIn && showAdminPanel && (
        <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl space-y-4">
          <div className="border-b border-blue-200 pb-2 flex justify-between items-center">
            <h2 className="text-sm font-bold text-blue-950 uppercase tracking-wider">
              Input Barang & Tambah Kategori Baru
            </h2>
            <span className="text-xs text-blue-700 font-medium">Mode Admin Aktif</span>
          </div>

          <form onSubmit={handleAddMasterBarang} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Nama Barang */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Barang / Merk</label>
                <input
                  type="text"
                  placeholder="cth: Tisu Wajah Paseo"
                  value={adminNama}
                  onChange={(e) => setAdminNama(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Kategori yang sudah ada */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih Kategori</label>
                <select
                  value={adminKategori}
                  onChange={(e) => setAdminKategori(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Pilih Kategori --</option>
                  {categories
                    .filter((c) => c !== 'Semua')
                    .map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                </select>
              </div>

              {/* Input Kategori Baru Jika Belum Ada */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Atau Buat Kategori Baru
                </label>
                <input
                  type="text"
                  placeholder="cth: Tisu, Alat Tulis, Kebersihan"
                  value={adminKategoriBaru}
                  onChange={(e) => setAdminKategoriBaru(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Satuan */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Satuan</label>
                <input
                  type="text"
                  placeholder="cth: kotak, botol, pak, roll, pcs"
                  value={adminSatuan}
                  onChange={(e) => setAdminSatuan(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Jumlah Stok Masuk */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jumlah Stok Masuk</label>
                <input
                  type="number"
                  placeholder="10"
                  min="1"
                  value={adminStok}
                  onChange={(e) => setAdminStok(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* URL Gambar */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Link / URL Gambar Produk</label>
                <input
                  type="url"
                  placeholder="https://images.tokopedia.net/... / bebas"
                  value={adminGambar}
                  onChange={(e) => setAdminGambar(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg px-6 py-2.5 transition shadow-sm"
            >
              + Simpan Barang ke Database
            </button>
          </form>
        </div>
      )}

      {/* Bar Filter Kategori & Pencarian */}
      <div className="space-y-3">
        {/* Search Bar */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center gap-2 shadow-xs">
          <span className="text-slate-400">🔍</span>
          <input
            type="text"
            placeholder="Cari barang persediaan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-sm outline-none bg-transparent text-slate-800"
          />
        </div>

        {/* Tab Pills Kategori */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedKategori(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                selectedKategori === cat
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Katalog & Keranjang Belanja */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Kolom Katalog Barang */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredItems.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border border-dashed">
                Tidak ada barang di kategori &ldquo;{selectedKategori}&rdquo;.
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition"
                >
                  {/* Foto Produk */}
                  <div className="w-full h-36 bg-slate-100 flex items-center justify-center overflow-hidden relative">
                    {item.gambar ? (
                      <img
                        src={item.gambar}
                        alt={item.nama_barang}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-300">
                        <span className="text-3xl">📦</span>
                        <span className="text-[10px] mt-1 text-slate-400">Tidak ada foto</span>
                      </div>
                    )}
                    <span className="absolute top-2 left-2 bg-slate-900/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-xs">
                      {item.kategori || 'Umum'}
                    </span>
                  </div>

                  {/* Detail Produk */}
                  <div className="p-4 flex flex-col justify-between flex-1 space-y-3">
                    <div>
                      <h3 className="font-semibold text-slate-800 text-sm line-clamp-2">
                        {item.nama_barang}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Sisa Stok: <span className="font-bold text-slate-800">{item.stok} {item.satuan}</span>
                      </p>
                    </div>

                    <button
                      onClick={() => addToCart(item)}
                      disabled={item.stok <= 0}
                      className="w-full py-2 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white font-medium text-xs rounded-lg transition disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                    >
                      {item.stok > 0 ? '+ Pilih Barang' : 'Stok Habis'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Kolom Keranjang Permintaan (Sticky Checkout) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 sticky top-6">
          <h2 className="font-bold text-slate-800 text-base flex justify-between items-center">
            <span>🛒 Keranjang Permintaan</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
              {cart.reduce((sum, item) => sum + item.jumlah, 0)} item
            </span>
          </h2>

          {cart.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              Keranjang masih kosong. Klik tombol &ldquo;+ Pilih Barang&rdquo; pada katalog.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto space-y-2 pr-1">
              {cart.map((c) => (
                <div key={c.id} className="pt-2 flex justify-between items-center text-xs">
                  <div>
                    <p className="font-semibold text-slate-800">{c.nama_barang}</p>
                    <p className="text-[10px] text-slate-400">
                      [{c.kategori || 'Umum'}] • {c.jumlah} {c.satuan}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => removeFromCart(c.id)}
                      className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                    >
                      -
                    </button>
                    <span className="w-5 text-center font-bold text-slate-700">{c.jumlah}</span>
                    <button
                      onClick={() =>
                        addToCart({
                          id: c.id,
                          nama_barang: c.nama_barang,
                          kategori: c.kategori,
                          satuan: c.satuan,
                          stok: c.maxStok,
                        })
                      }
                      className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleCheckout} className="space-y-3 pt-3 border-t border-slate-100">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nama Pemohon</label>
              <input
                type="text"
                placeholder="Nama Anda"
                value={namaPemohon}
                onChange={(e) => setNamaPemohon(e.target.value)}
                className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Unit / Seksi</label>
              <input
                type="text"
                placeholder="cth: Umum / Keuangan / Verifikasi"
                value={unitKerja}
                onChange={(e) => setUnitKerja(e.target.value)}
                className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading || cart.length === 0}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>📲</span>
              <span>{loading ? 'Memproses...' : 'Kirim Permintaan ke WhatsApp PIC'}</span>
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}