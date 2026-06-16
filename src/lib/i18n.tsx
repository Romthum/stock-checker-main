'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Language = 'th' | 'en';

type TranslationKey =
  | 'actions'
  | 'activate'
  | 'active'
  | 'addProduct'
  | 'adjusted'
  | 'all'
  | 'backToHome'
  | 'barcodeUnsupported'
  | 'cameraFailed'
  | 'category'
  | 'change'
  | 'clear'
  | 'close'
  | 'columns'
  | 'cost'
  | 'createAccount'
  | 'csvColumns'
  | 'csvImportExport'
  | 'custom'
  | 'deactivate'
  | 'deactivateConfirm'
  | 'delete'
  | 'deleteConfirm'
  | 'displayName'
  | 'downloadCsv'
  | 'edit'
  | 'editProduct'
  | 'email'
  | 'emailOrUsername'
  | 'enterBarcode'
  | 'existingCategories'
  | 'exportCsv'
  | 'exportDescription'
  | 'importCsv'
  | 'importing'
  | 'importRows'
  | 'importedProducts'
  | 'inactive'
  | 'initialStock'
  | 'imageUrl'
  | 'language'
  | 'languageDescription'
  | 'loadMore'
  | 'loading'
  | 'loginRequired'
  | 'manualBarcode'
  | 'movements'
  | 'name'
  | 'net'
  | 'noMatchingCategory'
  | 'noMovements'
  | 'noProducts'
  | 'none'
  | 'password'
  | 'passwordHelp'
  | 'price'
  | 'product'
  | 'productDetails'
  | 'products'
  | 'productsAll'
  | 'productsSubtitle'
  | 'qtyLow'
  | 'readOnly'
  | 'reason'
  | 'refresh'
  | 'reset'
  | 'restocked'
  | 'role'
  | 'rows'
  | 'salePrice'
  | 'save'
  | 'saveProduct'
  | 'savedUser'
  | 'saving'
  | 'scan'
  | 'scanBarcode'
  | 'searchProduct'
  | 'settings'
  | 'settingsSubtitle'
  | 'signIn'
  | 'signInSubtitle'
  | 'signingIn'
  | 'sku'
  | 'sold'
  | 'status'
  | 'stock'
  | 'stockMovements'
  | 'tempPassword'
  | 'thai'
  | 'time'
  | 'today'
  | 'typeNewCategory'
  | 'uncategorized'
  | 'use'
  | 'user'
  | 'users'
  | 'usersSubtitle'
  | 'viewHistory'
  | 'viewHistorySubtitle'
  | 'youCannotImport'
  | 'youCannotManageProducts'
  | 'youCannotViewUsers'
  | 'english'
  | 'logout'
  | 'logoutSubtitle'
  | 'addProductSubtitle'
  | 'importSubtitle'
  | 'uploadProductImage'
  | 'uploading';

const translations: Record<Language, Record<TranslationKey, string>> = {
  th: {
    actions: 'การทำงาน',
    activate: 'เปิดใช้งาน',
    active: 'ใช้งานอยู่',
    addProduct: 'เพิ่มสินค้า',
    adjusted: 'ปรับสต็อก',
    all: 'ทั้งหมด',
    backToHome: 'หน้าหลัก',
    barcodeUnsupported: 'เบราว์เซอร์นี้ไม่รองรับการสแกนบาร์โค้ด กรุณากรอกเลขบาร์โค้ดเอง',
    cameraFailed: 'เปิดกล้องไม่สำเร็จ',
    category: 'หมวดหมู่',
    change: 'เปลี่ยนแปลง',
    clear: 'ล้าง',
    close: 'ปิด',
    columns: 'จำนวนหลัก',
    cost: 'ต้นทุน',
    createAccount: 'สร้างบัญชีพนักงาน',
    csvColumns: 'รองรับคอลัมน์: name, sku, category, cost_price, sale_price, image_url',
    csvImportExport: 'นำเข้า / ส่งออก',
    custom: 'กำหนดเอง',
    deactivate: 'ปิดใช้งาน',
    deactivateConfirm: 'ปิดใช้งานผู้ใช้นี้หรือไม่?',
    delete: 'ลบ',
    deleteConfirm: 'ลบสินค้านี้หรือไม่?',
    displayName: 'ชื่อที่แสดง',
    downloadCsv: 'ดาวน์โหลด CSV',
    edit: 'แก้ไข',
    editProduct: 'แก้ไขสินค้า',
    email: 'อีเมล',
    emailOrUsername: 'อีเมลหรือชื่อผู้ใช้',
    enterBarcode: 'กรอกบาร์โค้ด',
    existingCategories: 'หมวดหมู่ที่มีอยู่',
    exportCsv: 'ส่งออกสินค้าเป็น CSV',
    exportDescription: 'ดาวน์โหลดสินค้าทั้งหมดที่ยังใช้งานอยู่จากฐานข้อมูลในเครื่อง',
    importCsv: 'นำเข้าสินค้าจาก CSV',
    importing: 'กำลังนำเข้า...',
    importRows: 'นำเข้า {count} แถว',
    importedProducts: 'นำเข้าสินค้าแล้ว {count} รายการ',
    inactive: 'ปิดใช้งาน',
    initialStock: 'สต็อกเริ่มต้น',
    imageUrl: 'URL รูปภาพ',
    language: 'ภาษา',
    languageDescription: 'เลือกภาษาที่ต้องการใช้ในหน้าจอของเครื่องนี้',
    loadMore: 'โหลดเพิ่ม',
    loading: 'กำลังโหลด...',
    loginRequired: 'กรุณาเข้าสู่ระบบก่อนใช้งานหน้านี้',
    manualBarcode: 'กรอกบาร์โค้ดเอง',
    movements: 'ประวัติ',
    name: 'ชื่อ',
    net: 'สุทธิ',
    noMatchingCategory: 'ไม่พบหมวดหมู่ที่ตรงกัน พิมพ์หมวดหมู่ใหม่ได้เลย',
    noMovements: 'ไม่พบประวัติ',
    noProducts: 'ไม่พบสินค้า',
    none: 'ไม่ใช้',
    password: 'รหัสผ่าน',
    passwordHelp: 'รหัสผ่านอย่างน้อย 8 ตัวอักษร',
    price: 'ราคา',
    product: 'สินค้า',
    productDetails: 'รายละเอียดสินค้า',
    products: 'สินค้า',
    productsAll: 'สินค้าทั้งหมด',
    productsSubtitle: 'ขายและเช็กสต็อก',
    qtyLow: 'สต็อกต่ำ',
    readOnly: 'ดูอย่างเดียว',
    reason: 'เหตุผล',
    refresh: 'รีเฟรช',
    reset: 'รีเซ็ต',
    restocked: 'เติมสต็อก',
    role: 'ตำแหน่ง',
    rows: 'รายการ',
    salePrice: 'ราคาขาย',
    save: 'บันทึก',
    saveProduct: 'บันทึกสินค้า',
    savedUser: 'บันทึกผู้ใช้แล้ว สามารถเข้าสู่ระบบด้วยรหัสที่ตั้งไว้ได้เลย',
    saving: 'กำลังบันทึก...',
    scan: 'สแกน',
    scanBarcode: 'สแกนบาร์โค้ด',
    searchProduct: 'ค้นหาชื่อสินค้าหรือบาร์โค้ด',
    settings: 'ตั้งค่า',
    settingsSubtitle: 'ภาษาและระบบ',
    signIn: 'เข้าสู่ระบบ',
    signInSubtitle: 'เข้าสู่ระบบเพื่อขายสินค้าและจัดการสต็อก',
    signingIn: 'กำลังเข้าสู่ระบบ...',
    sku: 'SKU / บาร์โค้ด',
    sold: 'ขายแล้ว',
    status: 'สถานะ',
    stock: 'สต็อก',
    stockMovements: 'ประวัติสต็อก',
    tempPassword: 'รหัสผ่านชั่วคราว',
    thai: 'ไทย',
    time: 'เวลา',
    today: 'วันนี้',
    typeNewCategory: 'พิมพ์หมวดหมู่ใหม่ได้เลย',
    uncategorized: 'ไม่มีหมวดหมู่',
    use: 'ใช้',
    user: 'ผู้ใช้',
    users: 'ผู้ใช้',
    usersSubtitle: 'เพิ่มพนักงาน',
    viewHistory: 'ประวัติ',
    viewHistorySubtitle: 'ดูรายการเข้าออก',
    youCannotImport: 'คุณไม่มีสิทธิ์นำเข้าสินค้า',
    youCannotManageProducts: 'คุณไม่มีสิทธิ์จัดการสินค้า',
    youCannotViewUsers: 'เฉพาะเจ้าของร้านและผู้จัดการเท่านั้นที่ดูผู้ใช้ได้',
    english: 'English',
    logout: 'ออก',
    logoutSubtitle: 'ออกจากระบบ',
    addProductSubtitle: 'บันทึกสินค้าใหม่',
    importSubtitle: 'จัดการ CSV',
    uploadProductImage: 'อัปโหลดรูปสินค้า',
    uploading: 'กำลังอัปโหลด...',
  },
  en: {
    actions: 'Actions',
    activate: 'Activate',
    active: 'Active',
    addProduct: 'Add product',
    adjusted: 'Adjusted',
    all: 'All',
    backToHome: 'Home',
    barcodeUnsupported: 'Barcode scanning is not supported in this browser. Enter the code manually.',
    cameraFailed: 'Camera failed',
    category: 'Category',
    change: 'Change',
    clear: 'Clear',
    close: 'Close',
    columns: 'Columns',
    cost: 'Cost',
    createAccount: 'Create staff account',
    csvColumns: 'Supported columns: name, sku, category, cost_price, sale_price, image_url',
    csvImportExport: 'Import / Export',
    custom: 'Custom',
    deactivate: 'Deactivate',
    deactivateConfirm: 'Deactivate this user?',
    delete: 'Delete',
    deleteConfirm: 'Delete this product?',
    displayName: 'Display name',
    downloadCsv: 'Download CSV',
    edit: 'Edit',
    editProduct: 'Edit product',
    email: 'Email',
    emailOrUsername: 'Email or username',
    enterBarcode: 'Enter barcode',
    existingCategories: 'Existing categories',
    exportCsv: 'Export product CSV',
    exportDescription: 'Downloads all active products from the local database.',
    importCsv: 'Import product CSV',
    importing: 'Importing...',
    importRows: 'Import {count} rows',
    importedProducts: 'Imported {count} products',
    inactive: 'Inactive',
    initialStock: 'Initial stock',
    imageUrl: 'Image URL',
    language: 'Language',
    languageDescription: 'Choose the language for this device.',
    loadMore: 'Load more',
    loading: 'Loading...',
    loginRequired: 'Please sign in before using this page.',
    manualBarcode: 'Manual barcode entry',
    movements: 'Movements',
    name: 'Name',
    net: 'Net',
    noMatchingCategory: 'No matching category. Type a new one.',
    noMovements: 'No movements found',
    noProducts: 'No products found',
    none: 'None',
    password: 'Password',
    passwordHelp: 'Password, at least 8 characters',
    price: 'Price',
    product: 'Product',
    productDetails: 'Product details',
    products: 'Products',
    productsAll: 'All products',
    productsSubtitle: 'Sell and check stock',
    qtyLow: 'Low stock',
    readOnly: 'Read only',
    reason: 'Reason',
    refresh: 'Refresh',
    reset: 'Reset',
    restocked: 'Restocked',
    role: 'Role',
    rows: 'Rows',
    salePrice: 'Sale price',
    save: 'Save',
    saveProduct: 'Save product',
    savedUser: 'User saved. They can sign in with the password you set.',
    saving: 'Saving...',
    scan: 'Scan',
    scanBarcode: 'Scan barcode',
    searchProduct: 'Search name or barcode',
    settings: 'Settings',
    settingsSubtitle: 'Language and system',
    signIn: 'Sign in',
    signInSubtitle: 'Sign in to manage sales and inventory.',
    signingIn: 'Signing in...',
    sku: 'SKU / Barcode',
    sold: 'Sold',
    status: 'Status',
    stock: 'Stock',
    stockMovements: 'Stock movements',
    tempPassword: 'Temporary password',
    thai: 'ไทย',
    time: 'Time',
    today: 'Today',
    typeNewCategory: 'Type a new category.',
    uncategorized: 'Uncategorized',
    use: 'Use',
    user: 'User',
    users: 'Users',
    usersSubtitle: 'Add staff',
    viewHistory: 'History',
    viewHistorySubtitle: 'View stock movements',
    youCannotImport: 'You do not have permission to import products.',
    youCannotManageProducts: 'You do not have permission to manage products.',
    youCannotViewUsers: 'Only managers and owners can view users.',
    english: 'English',
    logout: 'Logout',
    logoutSubtitle: 'Sign out',
    addProductSubtitle: 'Create a new product',
    importSubtitle: 'Manage CSV',
    uploadProductImage: 'Upload product image',
    uploading: 'Uploading...',
  },
};

type I18nContextValue = {
  language: Language;
  largeUi: boolean;
  setLanguage: (language: Language) => void;
  setLargeUi: (enabled: boolean) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('th');
  const [largeUi, setLargeUiState] = useState<boolean>(false);

  const value = useMemo<I18nContextValue>(() => {
    function setLanguage(nextLanguage: Language) {
      setLanguageState(nextLanguage);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('pos_language', nextLanguage);
        document.documentElement.lang = nextLanguage;
      }
    }

    function setLargeUi(enabled: boolean) {
      setLargeUiState(enabled);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('pos_large_ui', String(enabled));
        document.documentElement.classList.toggle('large-ui', enabled);
      }
    }

    function t(key: TranslationKey, vars?: Record<string, string | number>) {
      let text = translations[language][key] ?? translations.th[key] ?? key;
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          text = text.replaceAll(`{${name}}`, String(replacement));
        }
      }
      return text;
    }

    return { language, largeUi, setLanguage, setLargeUi, t };
  }, [language, largeUi]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedLanguage = window.localStorage.getItem('pos_language');
      if (savedLanguage === 'th' || savedLanguage === 'en') {
        setLanguageState(savedLanguage);
      }
      setLargeUiState(window.localStorage.getItem('pos_large_ui') === 'true');
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.classList.toggle('large-ui', largeUi);
  }, [language, largeUi]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
