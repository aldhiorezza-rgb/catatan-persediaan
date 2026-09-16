'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function Home() {
  const [items, setItems] = useState<any[]>([]);
  const [nama, setNama] = useState('');
  const [jumlah, setJumlah] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [loading, setLoading] = useState(false);

  // Ambil data dari tabel persediaan Supabase
  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from('persediaan')
        .select('*')
        .order('id', { ascending: false });

      if (error) {
        console.error('Fetch error:', error);
        alert('Gagal mengambil data dari database: ' + error.message);
      } else if (data) {
        setItems(data);
      }
    } catch (err: any) {
      console.error('Unexpected fetch error:', err);
      alert('Terjadi kesalahan koneksi: ' + err.message);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Simpan data barang baru
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama || !jumlah) return;
    setLoading(true);

    try {
      const { error } = await supabase.from('persediaan').insert([
        {
          jenis_barang: nama,
          jumlah_barang: jumlah,
          tanggal: tanggal || new Date().toISOString().split('T')[0],
          catat: true,
        },
      ]);

      if (error) {
        console.error('Insert error:', error);
        alert('Gagal menambah barang: ' + error.message);
      } else {
        setNama('');
        setJumlah('');
        setTanggal('');
        fetchData();
      }
    } catch (err: any) {
      console.error('Unexpected insert error:', err);
      alert('Terjadi kesalahan saat menyimpan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-4xl mx-auto py-10 px-4 space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
          Catatan Pengeluaran Persediaan
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Pencatatan mutasi logistik & pengeluaran barang persediaan kantor
        </p>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-base font-semibold text-slate-700 mb-4">
          Tambah Pengeluaran Baru
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Tanggal</label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nama Barang</label>
            <input
              type="text"
              placeholder="cth: Pembersih Lantai"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Kuantitas / Satuan</label>
            <input
              type="text"
              placeholder="cth: 2 botol"
              value={jumlah}
              onChange={(e) => setJumlah(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              required
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Menyimpan...' : 'Tambah Barang'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-700">Daftar Pengeluaran</h2>
          <span className="text-xs bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full font-medium">
            Total: {items.length} transaksi
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4 w-36">Tanggal</th>
                <th className="py-3 px-4">Jenis Barang</th>
                <th className="py-3 px-4 w-40">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-slate-400">
                    Belum ada data barang dicatat.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-slate-500">{row.tanggal}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{row.jenis_barang}</td>
                    <td className="py-3 px-4">
                      <span className="inline-block bg-slate-100 text-slate-800 text-xs px-2.5 py-1 rounded-md font-medium">
                        {row.jumlah_barang}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}