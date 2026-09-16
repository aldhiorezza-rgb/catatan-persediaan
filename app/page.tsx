'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Konfigurasi WhatsApp PIC & Kredensial Admin
const NO_WA_PIC = '6281231333097'; // Ganti dengan nomor WhatsApp PIC Gudang aktif
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

interface KategoriItem {
  id: number;
  nama_barang: string;
  satuan: string;
  stok: number;
  gambar?: string;
}

interface CartItem {
  id: number;
  nama: string;
  satuan: string;
  jumlah: number;
  maxStok: number;
}

export default function Home() {
  const [categories, setCategories] = useState<KategoriItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [namaPemohon, setNamaPemohon] = useState('');
  const [unitKerja, setUnitKerja] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // State Admin
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Form Mode Admin
  const [adminTab, setAdminTab] = useState<'stok' | 'baru' | 'kelola'>('stok');
  const [selectedKategoriId, setSelectedKategoriId] = useState<string>('');
  const [stokMasuk, setStokMasuk] = useState<number>(1);

  // Form Kategori Baru
  const [newKatNama, setNewKatNama] = useState('');
  const [newKatSatuan, setNewKatSatuan] = useState('pcs');
  const [newKatGambar, setNewKatGambar] = useState('');
  const [newKatStokAwal, setNewKatStokAwal] = useState<number>(10);

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('stok_barang')
      .select('*')
      .order('nama_barang', { ascending: true });
    if (!error && data) {
      setCategories(data);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

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

  // Tambah Stok Masuk
  const handleAddStockExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKategoriId || stokMasuk <= 0) return;

    const target = categories.find((c) => c.id === Number(selectedKategoriId));
    if (!target) return;

    const updatedStok = target.stok + stokMasuk;

    const { error } = await supabase
      .from('stok_barang')
      .update({ stok: updatedStok })
      .eq('id', target.id);

    if (!error) {
      alert(`Stok kategori "${target.nama_barang}" berhasil ditambahkan +${stokMasuk} ${target.satuan}!`);
      setStokMasuk(1);
      setSelectedKategoriId('');
      fetchCategories();
    } else {
      alert('Gagal memperbarui stok: ' + error.message);
    }
  };

  // Buat Kategori Baru
  const handleCreateNewCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKatNama || newKatStokAwal < 0) return;

    const { error } = await supabase.from('stok_barang').insert([
      {
        nama_barang: newKatNama.trim(),
        satuan: newKatSatuan.trim() || 'pcs',
        stok: newKatStokAwal,
        gambar: newKatGambar.trim(),
      },
    ]);

    if (!error) {
      alert(`Kategori "${newKatNama}" berhasil ditambahkan!`);
      setNewKatNama('');
      setNewKatSatuan('pcs');
      setNewKatGambar('');
      setNewKatStokAwal(10);
      setAdminTab('stok');
      fetchCategories();
    } else {
      alert('Gagal membuat kategori: ' + error.message);
    }
  };

  // Hapus Kategori
  const handleDeleteCategory = async (id: number, nama: string) => {
    const confirmDelete = window.confirm(
      `Yakin ingin menghapus kategori "${nama}" dari katalog persediaan? Data yang dihapus tidak dapat dikembalikan.`
    );
    if (!confirmDelete) return;

    const { error } = await supabase.from('stok_barang').delete().eq('id', id);

    if (!error) {
      alert(`Kategori "${nama}" berhasil dihapus.`);
      setCart((prev) => prev.filter((c) => c.id !== id));
      fetchCategories();
    } else {
      alert('Gagal menghapus kategori: ' + error.message);
    }
  };

  // Keranjang Belanja
  const addToCart = (item: KategoriItem) => {
    if (item.stok <= 0) return;
    setCart((prev) => {
      const exist = prev.find((c) => c.id === item.id);
      if (exist) {
        if (exist.jumlah < item.stok) {
          return prev.map((c) => (c.id === item.id ? { ...c, jumlah: c.jumlah + 1 } : c));
        }
        return prev;
      }
      return [
        ...prev,
        {
          id: item.id,
          nama: item.nama_barang,
          satuan: item.satuan,
          jumlah: 1,
          maxStok: item.stok,
        },
      ];
    });
  };

  const removeFromCart = (id: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.id === id ? { ...c, jumlah: c.jumlah - 1 } : c))
        .filter((c) => c.jumlah > 0)
    );
  };

  // Checkout WhatsApp PIC
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || !namaPemohon) return;
    setLoading(true);

    try {
      for (const item of cart) {
        const currentItem = categories.find((c) => c.id === item.id);
        const newStok = (currentItem?.stok || item.maxStok) - item.jumlah;
        await supabase
          .from('stok_barang')
          .update({ stok: Math.max(0, newStok) })
          .eq('id', item.id);
      }

      const ringkasan = cart.map((c) => `${c.nama} (${c.jumlah} ${c.satuan})`).join(', ');
      await supabase.from('request_persediaan').insert([
        {
          nama_pemohon: namaPemohon,
          unit_kerja: unitKerja || '-',
          daftar_barang: ringkasan,
        },
      ]);

      let pesanWA = `*PERMINTAAN PERSEDIAAN & ATK KPPN ENDE*%0A`;
      pesanWA += `---------------------------------------%0A`;
      pesanWA += `👤 *Nama Pemohon:* ${encodeURIComponent(namaPemohon)}%0A`;
      pesanWA += `🏢 *Seksi / Unit:* ${encodeURIComponent(unitKerja || '-')}%0A`;
      pesanWA += `📅 *Tanggal:* ${new Date().toLocaleDateString('id-ID')}%0A%0A`;
      pesanWA += `📦 *Daftar Kategori / Barang yang Diminta:*%0A`;
      cart.forEach((c, idx) => {
        pesanWA += `${idx + 1}. *${encodeURIComponent(c.nama)}*: ${c.jumlah} ${encodeURIComponent(c.satuan)}%0A`;
      });
      pesanWA += `%0AMohon kesediaannya untuk disiapkan, terima kasih! 🙏`;

      window.open(`https://wa.me/${NO_WA_PIC}?text=${pesanWA}`, '_blank');

      setCart([]);
      setNamaPemohon('');
      setUnitKerja('');
      fetchCategories();
    } catch (err: any) {
      alert('Terjadi kendala: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredCategories = categories.filter((c) =>
    c.nama_barang.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Katalog Persediaan & ATK Kantor KPPN Ende
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Lebih Mudah Menemukan, Lebih Tertib Mengelola
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdminLoggedIn ? (
            <>
              <button
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition shadow-xs cursor-pointer"
              >
                {showAdminPanel ? 'Tutup Kelola Stok' : '⚙️ Kelola Stok'}
              </button>
              <button
                onClick={() => {
                  setIsAdminLoggedIn(false);
                  setShowAdminPanel(false);
                }}
                className="px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-xl transition cursor-pointer"
              >
                Keluar
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition flex items-center gap-1.5 cursor-pointer"
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
            <h3 className="text-lg font-bold text-slate-900 mb-1">Login Pengelola Persediaan</h3>
            <p className="text-xs text-slate-500 mb-4">Masuk untuk menambah atau mengelola stok.</p>
            <form onSubmit={handleAdminAuth} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Username</label>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
                  className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="w-1/2 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs cursor-pointer"
                >
                  Masuk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Panel Admin */}
      {isAdminLoggedIn && showAdminPanel && (
        <div className="bg-blue-50/70 border border-blue-200 p-6 rounded-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between border-b border-blue-200 pb-3 gap-2">
            <div className="flex gap-1.5 bg-blue-100/70 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setAdminTab('stok')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  adminTab === 'stok' ? 'bg-white text-blue-800 shadow-xs' : 'text-blue-700 hover:bg-blue-200/50'
                }`}
              >
                Tambah Stok Masuk
              </button>
              <button
                type="button"
                onClick={() => setAdminTab('baru')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  adminTab === 'baru' ? 'bg-white text-blue-800 shadow-xs' : 'text-blue-700 hover:bg-blue-200/50'
                }`}
              >
                + Kategori Baru
              </button>
              <button
                type="button"
                onClick={() => setAdminTab('kelola')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  adminTab === 'kelola' ? 'bg-white text-red-700 shadow-xs' : 'text-slate-600 hover:bg-blue-200/50'
                }`}
              >
                🗑️ Kelola / Hapus Kategori
              </button>
            </div>
            <span className="text-xs text-blue-800 font-medium">Mode Admin Aktif</span>
          </div>

          {/* Tab 1: Tambah Stok Kategori Ada */}
          {adminTab === 'stok' && (
            <form onSubmit={handleAddStockExisting} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih Kategori</label>
                <select
                  value={selectedKategoriId}
                  onChange={(e) => setSelectedKategoriId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Pilih Kategori --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nama_barang} (Stok: {c.stok} {c.satuan})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jumlah Stok Tambahan</label>
                <input
                  type="number"
                  placeholder="Jumlah masuk"
                  min="1"
                  value={stokMasuk}
                  onChange={(e) => setStokMasuk(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <button
                  type="submit"
                  className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg transition shadow-xs cursor-pointer"
                >
                  + Tambahkan Stok
                </button>
              </div>
            </form>
          )}

          {/* Tab 2: Tambah Kategori Baru */}
          {adminTab === 'baru' && (
            <form onSubmit={handleCreateNewCategory} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Kategori</label>
                  <input
                    type="text"
                    placeholder="cth: Tisu, Spidol, Pulpen"
                    value={newKatNama}
                    onChange={(e) => setNewKatNama(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Satuan</label>
                  <input
                    type="text"
                    placeholder="cth: roll, pcs, pak, box"
                    value={newKatSatuan}
                    onChange={(e) => setNewKatSatuan(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stok Awal</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="10"
                    value={newKatStokAwal}
                    onChange={(e) => setNewKatStokAwal(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Link URL Foto</label>
                  <input
                    type="url"
                    placeholder="https://... (link gambar)"
                    value={newKatGambar}
                    onChange={(e) => setNewKatGambar(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg px-6 py-2.5 transition shadow-xs cursor-pointer"
                >
                  Simpan Kategori Baru
                </button>
              </div>
            </form>
          )}

          {/* Tab 3: Kelola / Hapus Kategori */}
          {adminTab === 'kelola' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Pilih kategori yang ingin dihapus secara permanen dari katalog:
              </p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {categories.length === 0 ? (
                  <p className="text-xs text-slate-400 p-4 text-center">Belum ada kategori yang terdaftar.</p>
                ) : (
                  categories.map((c) => (
                    <div key={c.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                          {c.gambar ? (
                            <img src={c.gambar} alt={c.nama_barang} className="w-full h-full object-cover" />
                          ) : (
                            <span>📦</span>
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 capitalize text-sm">{c.nama_barang}</p>
                          <p className="text-slate-400">
                            Stok: {c.stok} {c.satuan}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(c.id, c.nama_barang)}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white font-semibold rounded-lg transition border border-red-200 hover:border-transparent cursor-pointer"
                      >
                        Hapus Kategori
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pencarian Kategori Langsung */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex items-center gap-2 shadow-xs">
        <span className="text-slate-400">🔍</span>
        <input
          type="text"
          placeholder="Cari kategori persediaan (Tisu, Pulpen, Spidol, Kertas)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full text-sm outline-none bg-transparent text-slate-800"
        />
      </div>

      {/* Grid Katalog & Keranjang */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {filteredCategories.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border border-dashed">
                Belum ada kategori persediaan terdaftar.
              </div>
            ) : (
              filteredCategories.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between hover:shadow-md transition group"
                >
                  <div className="w-full h-40 bg-slate-100 flex items-center justify-center overflow-hidden relative">
                    {item.gambar ? (
                      <img
                        src={item.gambar}
                        alt={item.nama_barang}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-300">
                        <span className="text-3xl">📦</span>
                        <span className="text-[10px] mt-1 text-slate-400">Foto Kategori</span>
                      </div>
                    )}
                    <span className="absolute top-2 right-2 bg-slate-900/70 text-white text-[10px] font-medium px-2 py-0.5 rounded-md backdrop-blur-xs">
                      Satuan: {item.satuan}
                    </span>
                  </div>

                  <div className="p-4 flex flex-col justify-between flex-1 space-y-3">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm capitalize">
                        {item.nama_barang}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Tersedia: <span className="font-bold text-slate-800">{item.stok} {item.satuan}</span>
                      </p>
                    </div>

                    <button
                      onClick={() => addToCart(item)}
                      disabled={item.stok <= 0}
                      className="w-full py-2 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white font-semibold text-xs rounded-xl transition disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {item.stok > 0 ? '+ Pilih' : 'Stok Habis'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Keranjang Permintaan */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 sticky top-6">
          <h2 className="font-bold text-slate-800 text-base flex justify-between items-center">
            <span>🛒 Permintaan Barang</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-semibold">
              {cart.reduce((sum, item) => sum + item.jumlah, 0)} item
            </span>
          </h2>

          {cart.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              Keranjang masih kosong. Klik &ldquo;+ Pilih&rdquo; pada kategori yang ingin diajukan.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto space-y-2 pr-1">
              {cart.map((c) => (
                <div key={c.id} className="pt-2 flex justify-between items-center text-xs">
                  <div>
                    <p className="font-bold text-slate-800">{c.nama}</p>
                    <p className="text-[11px] text-slate-400">
                      {c.jumlah} {c.satuan}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => removeFromCart(c.id)}
                      className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                    >
                      -
                    </button>
                    <span className="w-5 text-center font-bold text-slate-700">{c.jumlah}</span>
                    <button
                      onClick={() =>
                        addToCart({
                          id: c.id,
                          nama_barang: c.nama,
                          satuan: c.satuan,
                          stok: c.maxStok,
                        })
                      }
                      className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
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
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nama Pemohon</label>
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
              <label className="block text-xs font-semibold text-slate-600 mb-1">Seksi / Subbagian</label>
              <input
                type="text"
                placeholder="cth: Subbag Umum / Seksi Bank / Seksi MSKI"
                value={unitKerja}
                onChange={(e) => setUnitKerja(e.target.value)}
                className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading || cart.length === 0}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>📲</span>
              <span>{loading ? 'Mengirim...' : 'Kirim Permintaan ke WhatsApp PIC'}</span>
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}