'use client';

import Link from 'next/link';
import { useI18n, type Language } from '@/lib/i18n';

const languages: Array<{ value: Language; labelKey: 'thai' | 'english'; note: string }> = [
  { value: 'th', labelKey: 'thai', note: 'ค่าเริ่มต้น' },
  { value: 'en', labelKey: 'english', note: 'English interface' },
];

export default function SettingsPage() {
  const { language, largeUi, setLanguage, setLargeUi, t } = useI18n();
  const isThai = language === 'th';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
          {t('backToHome')}
        </Link>
        <h1 className="text-lg font-semibold">{t('settings')}</h1>
      </div>

      <div className="card space-y-4 p-4">
        <div>
          <div className="text-base font-semibold">{t('language')}</div>
          <div className="mt-1 text-sm text-zinc-500">{t('languageDescription')}</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {languages.map((item) => {
            const active = language === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setLanguage(item.value)}
                className={`rounded-lg border p-4 text-left transition ${
                  active
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-zinc-300 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800'
                }`}
              >
                <div className="text-lg font-semibold">{t(item.labelKey)}</div>
                <div className={`mt-1 text-sm ${active ? 'text-blue-100' : 'text-zinc-500'}`}>
                  {item.note}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card space-y-4 p-4">
        <div>
          <div className="text-base font-semibold">
            {isThai ? 'โหมดใช้ง่ายสำหรับผู้สูงอายุ' : 'Elder-friendly mode'}
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            {isThai
              ? 'เพิ่มขนาดตัวอักษร ปุ่ม และช่องกรอก เพื่อให้กดง่ายขึ้นบนมือถือและ iPad'
              : 'Increase text, buttons, and inputs for easier use on phones and iPad.'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setLargeUi(!largeUi)}
          className={`flex w-full items-center justify-between rounded-lg border p-4 text-left transition ${
            largeUi
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-zinc-300 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800'
          }`}
        >
          <span>
            <span className="block text-lg font-semibold">
              {largeUi ? (isThai ? 'เปิดใช้งานอยู่' : 'Enabled') : isThai ? 'ปิดอยู่' : 'Disabled'}
            </span>
            <span className={`mt-1 block text-sm ${largeUi ? 'text-emerald-100' : 'text-zinc-500'}`}>
              {isThai ? 'บันทึกเฉพาะเครื่องนี้' : 'Saved on this device only'}
            </span>
          </span>
          <span className="rounded-full bg-black/10 px-3 py-1 text-sm font-semibold">
            {largeUi ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>
    </div>
  );
}
