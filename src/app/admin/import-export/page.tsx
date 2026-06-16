'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRole } from '@/lib/useRole';
import { useI18n } from '@/lib/i18n';

type CSVRow = Record<string, string>;

export default function ImportExportPage() {
  const { canManage, loading } = useRole();
  const { t } = useI18n();
  const [rows, setRows] = useState<CSVRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapName, setMapName] = useState('name');
  const [mapSku, setMapSku] = useState('sku');
  const [mapCategory, setMapCategory] = useState('category');
  const [mapCost, setMapCost] = useState('cost_price');
  const [mapSale, setMapSale] = useState('sale_price');
  const [mapImage, setMapImage] = useState('image_url');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const preview = useMemo(() => rows.slice(0, 10), [rows]);

  async function parseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage('');
    const PapaMod = await import('papaparse');
    const Papa = PapaMod.default ?? PapaMod;
    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        const data = (result.data ?? []).filter(Boolean);
        const cols = new Set<string>();
        data.forEach((row) => Object.keys(row).forEach((key) => cols.add(key)));
        const headerList = Array.from(cols);
        setRows(data);
        setHeaders(headerList);
        for (const key of headerList) {
          const lower = key.toLowerCase();
          if (lower === 'name') setMapName(key);
          if (lower === 'sku' || lower === 'barcode') setMapSku(key);
          if (lower === 'category') setMapCategory(key);
          if (lower === 'cost' || lower === 'cost_price') setMapCost(key);
          if (lower === 'price' || lower === 'sale_price') setMapSale(key);
          if (lower === 'image' || lower === 'image_url') setMapImage(key);
        }
      },
      error: (error) => setMessage(error.message),
    });
  }

  function val(row: CSVRow, key: string) {
    return (row[key] ?? '').trim();
  }

  function num(text: string) {
    const parsed = Number(text.replace(/[, ]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async function importRows() {
    setBusy(true);
    setMessage('');
    try {
      const payload = rows
        .map((row) => ({
          name: val(row, mapName),
          sku: val(row, mapSku) || null,
          category: val(row, mapCategory) || null,
          cost_price: num(val(row, mapCost)),
          sale_price: num(val(row, mapSale)),
          image_url: val(row, mapImage) || null,
        }))
        .filter((row) => row.name);

      const res = await fetch('/api/admin/import-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');
      setMessage(t('importedProducts', { count: json.imported }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="py-12 text-center text-zinc-500">{t('loading')}</div>;
  if (!canManage) {
    return (
      <div className="space-y-4">
        <Link href="/" className="rounded-lg border px-3 py-2 text-sm">
          {t('backToHome')}
        </Link>
        <div className="card p-5">{t('youCannotImport')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
          {t('backToHome')}
        </Link>
        <h1 className="text-lg font-semibold">{t('csvImportExport')}</h1>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="font-medium">{t('exportCsv')}</div>
          <div className="text-sm text-zinc-500">{t('exportDescription')}</div>
        </div>
        <a
          href="/api/admin/export-products"
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500"
        >
          {t('downloadCsv')}
        </a>
      </div>

      <div className="card space-y-4 p-4">
        <div>
          <div className="font-medium">{t('importCsv')}</div>
          <div className="text-sm text-zinc-500">
            {t('csvColumns')}
          </div>
        </div>

        <input type="file" accept=".csv,text/csv" onChange={parseFile} className="block w-full text-sm" />

        {headers.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [t('name'), mapName, setMapName],
              ['SKU', mapSku, setMapSku],
              [t('category'), mapCategory, setMapCategory],
              [t('cost'), mapCost, setMapCost],
              [t('salePrice'), mapSale, setMapSale],
              [t('imageUrl'), mapImage, setMapImage],
            ].map(([label, value, setter]) => (
              <label key={label as string} className="block">
                <span className="mb-1 block text-xs text-zinc-500">{label as string}</span>
                <select
                  value={value as string}
                  onChange={(e) => (setter as (value: string) => void)(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="">{t('none')}</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : null}

        {preview.length ? (
          <div className="overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 dark:bg-zinc-900">
                <tr>
                  {headers.map((header) => (
                    <th key={header} className="px-3 py-2 text-left">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={index} className="border-t border-zinc-200 dark:border-zinc-800">
                    {headers.map((header) => (
                      <td key={header} className="px-3 py-2">
                        {row[header]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {message ? <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</div> : null}

        <div className="flex justify-end">
          <button
            disabled={busy || !rows.length}
            onClick={importRows}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {busy ? t('importing') : t('importRows', { count: rows.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
