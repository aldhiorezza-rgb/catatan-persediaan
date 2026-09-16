'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Konfigurasi Nomor PIC & Akun Admin
const NO_WA_PIC = '6281231333097'; // Nomor WhatsApp PIC Gudang
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

interface RequestOrder {
  id: number;
  nama_pemohon: string;
  unit_kerja: string;
  daftar_barang: string;
  detail_items?: { id: number; nama: string; satuan: string; jumlah: number }[];
  created_at: string;
}

interface LogPembelian {
  id: number;
  nama_barang: string;
  satuan: string;
  jumlah_masuk: number;
  tanggal: string;
}

export default function Home() {
  const [categories, setCategories] = useState<KategoriItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [namaPemohon, setNamaPemohon] = useState('');
  const [unitKerja, setUnitKerja] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Tab & Autentikasi Admin
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminTab, setAdminTab] = useState<'stok' | 'baru' | 'rekap_pakai' | 'rekap_beli' | 'kelola'>('stok');

  // Form Input Admin
  const [selectedKategoriId, setSelectedKategoriId] = useState<string>('');
  const [stokMasuk, setStokMasuk] = useState<number>(1);
  const [newKatNama, setNewKatNama] = useState('');
  const [newKatSatuan, setNewKatSatuan] = useState('pcs');
  const [newKatGambar, setNewKatGambar] = useState('');
  const [newKatStokAwal, setNewKatStokAwal] = useState<number>(10);

  // Data Rekap
  const [rekapPenggunaan, setRekapPenggunaan] = useState<RequestOrder[]>([]);
  const [rekapPembelian, setRekapPembelian] = useState<LogPembelian[]>([]);

  const fetchCategories = async () => {
    const { data } = await supabase.from('stok_barang').select('*').order('nama_barang', { ascending: true });
    if (data) setCategories(data);
  };

  const fetchRekapPenggunaan = async () => {
    const { data } = await supabase.from('request_persediaan').select('*').order('id', { ascending: false });
    if (data) setRekapPenggunaan(data);
  };

  const fetchRekapPembelian = async () => {
    const { data } = await supabase.from('riwayat_stok').select('*').order('id', { ascending: false });
    if (data) setRekapPembelian(data);
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
      fetchRekapPenggunaan();
      fetchRekapPembelian();
    } else {
      alert('Username atau Password Admin salah!');
    }
  };

  // Tambah Stok Masuk (Kategori yang sudah ada)
  const handleAddStockExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKategoriId || stokMasuk <= 0) return;

    const target = categories.find((c) => c.id === Number(selectedKategoriId));
    if (!target) return;

    const updatedStok = target.stok + stokMasuk;

    const { error: errUpdate } = await supabase.from('stok_barang').update({ stok: updatedStok }).eq('id', target.id);

    await supabase.from('riwayat_stok').insert([
      {
        kategori_id: target.id,
        nama_barang: target.nama_barang,
        satuan: target.satuan,
        jumlah_masuk: stokMasuk,
      },
    ]);

    if (!errUpdate) {
      alert(`Stok kategori "${target.nama_barang}" berhasil ditambah +${stokMasuk} ${target.satuan}!`);
      setStokMasuk(1);
      setSelectedKategoriId('');
      fetchCategories();
      fetchRekapPembelian();
    }
  };

  // Buat Kategori Baru
  const handleCreateNewCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKatNama) return;

    const { data, error } = await supabase
      .from('stok_barang')
      .insert([
        {
          nama_barang: newKatNama.trim(),
          satuan: newKatSatuan.trim() || 'pcs',
          stok: newKatStokAwal,
          gambar: newKatGambar.trim(),
        },
      ])
      .select();

    if (!error && data && data.length > 0) {
      if (newKatStokAwal > 0) {
        await supabase.from('riwayat_stok').insert([
          {
            kategori_id: data[0].id,
            nama_barang: data[0].nama_barang,
            satuan: data[0].satuan,
            jumlah_masuk: newKatStokAwal,
          },
        ]);
      }

      alert(`Kategori "${newKatNama}" berhasil dibuat!`);
      setNewKatNama('');
      setNewKatSatuan('pcs');
      setNewKatGambar('');
      setNewKatStokAwal(10);
      setAdminTab('stok');
      fetchCategories();
      fetchRekapPembelian();
    }
  };

  // Hapus Kategori Master
  const handleDeleteCategory = async (id: number, nama: string) => {
    if (!window.confirm(`Hapus kategori "${nama}" secara permanen dari katalog?`)) return;
    const { error } = await supabase.from('stok_barang').delete().eq('id', id);
    if (!error) {
      alert(`Kategori "${nama}" berhasil dihapus.`);
      fetchCategories();
    }
  };

  // BATALKAN / HAPUS PERMINTAAN (Rollback Stok Otomatis)
  const handleBatalDanRollback = async (order: RequestOrder) => {
    const konfirmasi = window.confirm(
      `Batalkan permintaan dari "${order.nama_pemohon}"? Stok barang yang tertera akan dikembalikan ke gudang.`
    );
    if (!konfirmasi) return;

    try {
      if (order.detail_items && Array.isArray(order.detail_items)) {
        for (const item of order.detail_items) {
          const target = categories.find((c) => c.id === item.id);
          const currentQty = target ? target.stok : 0;
          await supabase
            .from('stok_barang')
            .update({ stok: currentQty + item.jumlah })
            .eq('id', item.id);
        }
      }

      await supabase.from('request_persediaan').delete().eq('id', order.id);

      alert('Permintaan berhasil dibatalkan dan kuantitas stok telah dikembalikan ke katalog!');
      fetchCategories();
      fetchRekapPenggunaan();
    } catch (err: any) {
      alert('Gagal membatalkan transaksi: ' + err.message);
    }
  };

  // Logika Keranjang
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

  // CHECKOUT: Simpan Detail JSON & Buat Teks WA Lengkap
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
          detail_items: cart.map((c) => ({
            id: c.id,
            nama: c.nama,
            satuan: c.satuan,
            jumlah: c.jumlah,
          })),
        },
      ]);

      let rawText = `*PERMINTAAN PERSEDIAAN DAN ATK KPPN ENDE*\n`;
      rawText += `---------------------------------------\n`;
      rawText += `👤 *Nama Pemohon:* ${namaPemohon}\n`;
      rawText += `🏢 *Seksi / Unit:* ${unitKerja || '-'}\n`;
      rawText += `📅 *Tanggal:* ${new Date().toLocaleDateString('id-ID')}\n\n`;
      rawText += `📦 *Daftar Kategori / Barang yang Diminta:*\n`;

      cart.forEach((c, idx) => {
        rawText += `${idx + 1}. *${c.nama}*: ${c.jumlah} ${c.satuan}\n`;
      });

      rawText += `\nMohon kesediaannya untuk disiapkan ya kak, terima kasih! 🙏`;

      const encodedPesan = encodeURIComponent(rawText);
      window.open(`https://api.whatsapp.com/send?phone=${NO_WA_PIC}&text=${encodedPesan}`, '_blank');

      setCart([]);
      setNamaPemohon('');
      setUnitKerja('');
      fetchCategories();
      fetchRekapPenggunaan();
    } catch (err: any) {
      alert('Terjadi kendala saat checkout: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // EKSPOR EXCEL NATIVE (CSV UTF-8)
  const exportToExcel = (data: any[], fileName: string) => {
    if (data.length === 0) return alert('Tidak ada data untuk diekspor.');
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map((row) =>
      Object.values(row)
        .map((val) => `"${String(val).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${fileName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CETAK / SIMPAN KE PDF NATIVE
  const exportToPDF = (title: string, head: string[], body: any[][]) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Popup diblokir oleh browser. Izinkan popup untuk mencetak laporan.');

    const headHtml = head.map((h) => `<th style="border:1px solid #cbd5e1;padding:8px;background:#f1f5f9;font-size:11px;text-align:left;">${h}</th>`).join('');
    const bodyHtml = body
      .map(
        (row) =>
          `<tr>${row.map((col) => `<td style="border:1px solid #cbd5e1;padding:7px 8px;font-size:11px;">${col}</td>`).join('')}</tr>`
      )
      .join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; }
            h2 { margin-bottom: 4px; font-size: 16px; text-transform: uppercase; font-weight: 700; }
            p { font-size: 12px; color: #64748b; margin-top: 0; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <h2>${title}</h2>
          <p>KPPN Ende • Dicetak pada: ${new Date().toLocaleString('id-ID')}</p>
          <table>
            <thead><tr>${headHtml}</tr></thead>
            <tbody>${bodyHtml}</tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
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
                {showAdminPanel ? 'Tutup Panel Admin' : '⚙️ Panel Admin'}
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

      {/* Modal Login Admin */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Login Admin Persediaan</h3>
            <p className="text-xs text-slate-500 mb-4">Masuk untuk mengelola mutasi dan laporan barang.</p>
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

      {/* Panel Admin Lengkap */}
      {isAdminLoggedIn && showAdminPanel && (
        <div className="bg-blue-50/70 border border-blue-200 p-6 rounded-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between border-b border-blue-200 pb-3 gap-2">
            <div className="flex flex-wrap gap-1.5 bg-blue-100/70 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setAdminTab('stok')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  adminTab === 'stok' ? 'bg-white text-blue-800 shadow-xs' : 'text-blue-700 hover:bg-blue-200/50'
                }`}
              >
                + Stok Masuk
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
                onClick={() => {
                  setAdminTab('rekap_pakai');
                  fetchRekapPenggunaan();
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  adminTab === 'rekap_pakai' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-700 hover:bg-blue-200/50'
                }`}
              >
                📋 Rekap Penggunaan (WA)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdminTab('rekap_beli');
                  fetchRekapPembelian();
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  adminTab === 'rekap_beli' ? 'bg-white text-indigo-800 shadow-xs' : 'text-slate-700 hover:bg-blue-200/50'
                }`}
              >
                📦 Rekap Pembelian Masuk
              </button>
              <button
                type="button"
                onClick={() => setAdminTab('kelola')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  adminTab === 'kelola' ? 'bg-white text-red-700 shadow-xs' : 'text-slate-600 hover:bg-blue-200/50'
                }`}
              >
                🗑️ Hapus Kategori
              </button>
            </div>
            <span className="text-xs text-blue-900 font-semibold">Mode Admin KPPN Ende</span>
          </div>

          {/* TAB 1: TAMBAH STOK */}
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jumlah Unit Masuk (Pengadaan)</label>
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
                  + Tambahkan & Catat Stok
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: BUAT KATEGORI BARU */}
          {adminTab === 'baru' && (
            <form onSubmit={handleCreateNewCategory} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Kategori</label>
                  <input
                    type="text"
                    placeholder="cth: Tisu Paseo, Kertas F4"
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
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg px-6 py-2.5 transition shadow-xs cursor-pointer"
                >
                  Simpan Kategori Baru
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: REKAP PENGGUNAAN (ROLLBACK STOK) */}
          {adminTab === 'rekap_pakai' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600 font-medium">
                  Riwayat pesanan WhatsApp. Membatalkan transaksi otomatis mengembalikan kuantitas stok barang.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const dataExcel = rekapPenggunaan.map((r, i) => ({
                        No: i + 1,
                        Tanggal: new Date(r.created_at).toLocaleString('id-ID'),
                        Pemohon: r.nama_pemohon,
                        Seksi: r.unit_kerja,
                        'Barang Diminta': r.daftar_barang,
                      }));
                      exportToExcel(dataExcel, 'Rekap_Penggunaan_ATK_KPPN_Ende');
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    📊 Download Excel (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const headers = ['No', 'Tanggal', 'Pemohon', 'Seksi/Unit', 'Rincian Barang'];
                      const rows = rekapPenggunaan.map((r, i) => [
                        i + 1,
                        new Date(r.created_at).toLocaleDateString('id-ID'),
                        r.nama_pemohon,
                        r.unit_kerja,
                        r.daftar_barang,
                      ]);
                      exportToPDF('Laporan Pengeluaran Persediaan KPPN Ende', headers, rows);
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    📄 Cetak / Simpan PDF
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b text-slate-600 font-semibold">
                    <tr>
                      <th className="p-3">Waktu</th>
                      <th className="p-3">Pemohon</th>
                      <th className="p-3">Seksi</th>
                      <th className="p-3">Daftar Barang</th>
                      <th className="p-3 text-center">Aksi (Rollback)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rekapPenggunaan.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-400">Belum ada riwayat penggunaan.</td>
                      </tr>
                    ) : (
                      rekapPenggunaan.map((order) => (
                        <tr key={order.id} className="hover:bg-slate-50/70">
                          <td className="p-3 text-slate-500">{new Date(order.created_at).toLocaleString('id-ID')}</td>
                          <td className="p-3 font-semibold text-slate-800">{order.nama_pemohon}</td>
                          <td className="p-3 text-slate-600">{order.unit_kerja}</td>
                          <td className="p-3 text-slate-700">{order.daftar_barang}</td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleBatalDanRollback(order)}
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white font-medium rounded-md transition border border-red-200 cursor-pointer"
                              title="Batalkan penggunaan dan kembalikan stok"
                            >
                              Batalkan & Balikkan Stok
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: REKAP PEMBELIAN MASUK */}
          {adminTab === 'rekap_beli' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600 font-medium">
                  Riwayat penambahan stok persediaan masuk (pengadaan gudang).
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const dataExcel = rekapPembelian.map((r, i) => ({
                        No: i + 1,
                        Waktu: new Date(r.tanggal).toLocaleString('id-ID'),
                        'Nama Barang/Kategori': r.nama_barang,
                        'Jumlah Masuk': r.jumlah_masuk,
                        Satuan: r.satuan,
                      }));
                      exportToExcel(dataExcel, 'Rekap_Pengadaan_Stok_KPPN_Ende');
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    📊 Download Excel (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const headers = ['No', 'Tanggal', 'Kategori Barang', 'Jumlah Masuk', 'Satuan'];
                      const rows = rekapPembelian.map((r, i) => [
                        i + 1,
                        new Date(r.tanggal).toLocaleDateString('id-ID'),
                        r.nama_barang,
                        r.jumlah_masuk,
                        r.satuan,
                      ]);
                      exportToPDF('Laporan Pengadaan Persediaan KPPN Ende', headers, rows);
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    📄 Cetak / Simpan PDF
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b text-slate-600 font-semibold">
                    <tr>
                      <th className="p-3">Tanggal Input</th>
                      <th className="p-3">Kategori Barang</th>
                      <th className="p-3">Jumlah Masuk</th>
                      <th className="p-3">Satuan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rekapPembelian.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-400">Belum ada riwayat pengadaan.</td>
                      </tr>
                    ) : (
                      rekapPembelian.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/70">
                          <td className="p-3 text-slate-500">{new Date(log.tanggal).toLocaleString('id-ID')}</td>
                          <td className="p-3 font-semibold text-slate-800">{log.nama_barang}</td>
                          <td className="p-3 text-emerald-600 font-bold">+{log.jumlah_masuk}</td>
                          <td className="p-3 text-slate-600">{log.satuan}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: HAPUS KATEGORI */}
          {adminTab === 'kelola' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">Pilih kategori yang ingin dihapus permanen dari daftar katalog:</p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {categories.length === 0 ? (
                  <p className="text-xs text-slate-400 p-4 text-center">Belum ada kategori terdaftar.</p>
                ) : (
                  categories.map((c) => (
                    <div key={c.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                          {c.gambar ? <img src={c.gambar} alt={c.nama_barang} className="w-full h-full object-cover" /> : <span>📦</span>}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 capitalize text-sm">{c.nama_barang}</p>
                          <p className="text-slate-400">Stok: {c.stok} {c.satuan}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(c.id, c.nama_barang)}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white font-semibold rounded-lg transition border border-red-200 cursor-pointer"
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

      {/* Pencarian Kategori */}
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
                      <h3 className="font-bold text-slate-900 text-sm capitalize">{item.nama_barang}</h3>
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

        {/* Keranjang Checkout */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 sticky top-6">
          <h2 className="font-bold text-slate-800 text-base flex justify-between items-center">
            <span>🛒 Permintaan Barang</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-semibold">
              {cart.reduce((sum, item) => sum + item.jumlah, 0)} item
            </span>
          </h2>

          {cart.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              Keranjang masih kosong. Klik &ldquo;+ Pilih&rdquo; pada kategori yang diinginkan.
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