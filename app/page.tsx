'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Nomor WhatsApp PIC Gudang / Barang (Awali dengan 62)
const NO_WA_PIC = '6281231333097'; 

interface Barang {
  id: number;
  nama_barang: string;
  satuan: string;
  stok: number;
}

interface CartItem {
  id: number;
  nama_barang: string;
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

  // Form Tambah Barang (Admin Mode toggle)
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminNama, setAdminNama] = useState('');
  const [adminStok, setAdminStok] = useState<number>(1);
  const [adminSatuan, setAdminSatuan] = useState('pcs');

  // Ambil data stok barang
  const fetchBarang = async () => {
    const { data, error } = await supabase
      .from('stok_barang')
      .select('*')
      .order('nama_barang', { ascending: true });
    if (!error && data) setItems(data);
  };

  useEffect(() => {
    fetchBarang();
  }, []);

  // Tambah ke keranjang belanja
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
          satuan: barang.satuan,
          jumlah: 1,
          maxStok: barang.stok,
        },
      ];
    });
  };

  // Kurangi / hapus dari keranjang
  const removeFromCart = (id: number) => {
    setCart((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, jumlah: item.jumlah - 1 } : item))
        .filter((item) => item.jumlah > 0)
    );
  };

  // Admin: Tambah Stok / Barang Baru
  const handleAddMasterBarang = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminNama || adminStok <= 0) return;

    const { error } = await supabase.from('stok_barang').insert([
      {
        nama_barang: adminNama,
        satuan: adminSatuan,
        stok: adminStok,
      },
    ]);

    if (!error) {
      setAdminNama('');
      setAdminStok(1);
      fetchBarang();
      alert('Stok barang berhasil ditambahkan!');
    } else {
      alert('Gagal menambah barang: ' + error.message);
    }
  };

  // Proses Order & Kirim WhatsApp
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || !namaPemohon) return;
    setLoading(true);

    try {
      // 1. Kurangi stok di database
      for (const item of cart) {
        const currentItem = items.find((i) => i.id === item.id);
        const newStok = (currentItem?.stok || item.maxStok) - item.jumlah;
        await supabase
          .from('stok_barang')
          .update({ stok: Math.max(0, newStok) })
          .eq('id', item.id);
      }

      // 2. Simpan catatan riwayat pesanan
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
        pesanWA += `${idx + 1}. ${encodeURIComponent(c.nama_barang)}: *${c.jumlah} ${encodeURIComponent(c.satuan)}*%0A`;
      });
      pesanWA += `%0AMohon untuk disiapkan ya kak, terima kasih! 🙏`;

      // Buka tautan WhatsApp PIC
      window.open(`https://wa.me/${NO_WA_PIC}?text=${pesanWA}`, '_blank');

      // Reset Keranjang
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

  const filteredItems = items.filter((item) =>
    item.nama_barang.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Katalog Permintaan Persediaan Kantor
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Pilih barang yang dibutuhkan layaknya belanja, order akan otomatis diteruskan ke WhatsApp PIC.
          </p>
        </div>
        <button
          onClick={() => setShowAdmin(!showAdmin)}
          className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition"
        >
          {showAdmin ? 'Tutup Kelola Stok' : '⚙️ Kelola Stok (Admin)'}
        </button>
      </div>

      {/* Form Tambah Master Barang (Admin Panel) */}
      {showAdmin && (
        <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl space-y-3">
          <h2 className="text-sm font-bold text-blue-900">Input / Tambah Stok Barang Baru</h2>
          <form onSubmit={handleAddMasterBarang} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              placeholder="Nama Barang (cth: Lem Povinal)"
              value={adminNama}
              onChange={(e) => setAdminNama(e.target.value)}
              className="px-3 py-2 text-sm bg-white border rounded-lg focus:outline-none"
              required
            />
            <input
              type="text"
              placeholder="Satuan (cth: botol, pak, pcs)"
              value={adminSatuan}
              onChange={(e) => setAdminSatuan(e.target.value)}
              className="px-3 py-2 text-sm bg-white border rounded-lg focus:outline-none"
              required
            />
            <input
              type="number"
              placeholder="Stok Masuk"
              min="1"
              value={adminStok}
              onChange={(e) => setAdminStok(Number(e.target.value))}
              className="px-3 py-2 text-sm bg-white border rounded-lg focus:outline-none"
              required
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg px-4 py-2 transition"
            >
              + Masukkan ke Gudang
            </button>
          </form>
        </div>
      )}

      {/* Grid Utama: Katalog & Keranjang */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Kolom 1 & 2: Katalog Barang */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-2">
            🔍
            <input
              type="text"
              placeholder="Cari barang (cth: Tisu, Kertas, Pembersih)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-sm outline-none bg-transparent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredItems.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-xl border">
                Belum ada barang di katalog atau barang tidak ditemukan.
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3 hover:border-blue-400 transition"
                >
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm">{item.nama_barang}</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Tersedia: <span className="font-bold text-slate-700">{item.stok} {item.satuan}</span>
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
              ))
            )}
          </div>
        </div>

        {/* Kolom 3: Keranjang Permintaan (Checkout) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 sticky top-6">
          <h2 className="font-bold text-slate-800 text-base flex justify-between items-center">
            <span>🛒 Daftar Permintaan</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
              {cart.reduce((sum, item) => sum + item.jumlah, 0)} item
            </span>
          </h2>

          {cart.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              Keranjang masih kosong. Klik tombol &ldquo;+ Pilih Barang&rdquo; pada barang yang diinginkan.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto space-y-2 pr-1">
              {cart.map((c) => (
                <div key={c.id} className="pt-2 flex justify-between items-center text-xs">
                  <div>
                    <p className="font-semibold text-slate-800">{c.nama_barang}</p>
                    <p className="text-slate-400">{c.jumlah} {c.satuan}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => removeFromCart(c.id)}
                      className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="w-5 text-center font-bold text-slate-700">{c.jumlah}</span>
                    <button
                      onClick={() => addToCart({ id: c.id, nama_barang: c.nama_barang, satuan: c.satuan, stok: c.maxStok })}
                      className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center"
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
                placeholder="cth: Keuangan / Umum"
                value={unitKerja}
                onChange={(e) => setUnitKerja(e.target.value)}
                className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading || cart.length === 0}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
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