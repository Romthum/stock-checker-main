'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';

export default function ImageUpload({
  value,
  onChange,
}: {
  value?: string;
  onChange: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/uploads/products', {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      onChange(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="w-full space-y-2">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="relative flex aspect-square w-full max-w-xs items-center justify-center overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-center text-sm text-zinc-500 transition hover:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
      >
        {value ? (
          <Image src={value} alt="Product" fill unoptimized className="object-cover" />
        ) : (
          <span>{busy ? 'Uploading...' : 'Upload product image'}</span>
        )}
      </button>
      {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} hidden />
    </div>
  );
}
