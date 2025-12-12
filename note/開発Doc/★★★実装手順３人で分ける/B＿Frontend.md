
## 実装完了: BE-100 & BE-101　→これはBackend

### 🎫 BE-100: Strapi DB Schema Setup

**実装内容:**

1. **型定義の拡張** (`types/index.ts`)
    - Table, Customer, OwnerSession の新規型
    - Reservation に status, source, ownerNote, isRead, requiresReview 等を追加
    - ReservationStatus ('pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show')
    - ReservationSource ('web' | 'owner' | 'external')
2. **Strapiスキーマガイド** (`docs/BE-100-STRAPI-SCHEMA.md`)
    - 各Collection Typeの詳細なJSON定義
    - 権限設定ガイド
    - マイグレーション手順

---

### 🎫 BE-101: Reservation API & Polling Logic

**実装内容:**

#### API Routes

- `POST /api/reservations` - 在庫チェック・リードタイム・LLM判定付き予約作成
- `GET /api/owner/notifications/check` - PWAポーリング用通知チェック
- `POST /api/owner/session/start` - 業務開始セッション

#### Hooks

- `usePWANotifications` - 30秒ポーリング、通知音再生、業務開始管理
- `usePWAInstall` - iOS/Android PWAインストール検出

#### Components

- `PWAInstallBanner` - ホーム画面追加誘導（iOS/Android対応）
- `SessionStartOverlay` - 「本日の業務を開始する」オーバーレイ
- `OwnerReservationForm` - 店主専用予約登録（在庫無視可能）
- `DashboardClient` - 統合アップデート（ステータスバッジ、承認/却下ボタン、FAB）

---

### 仕様書対応チェックリスト ✅

|項目|実装状況|
|---|---|
|店主専用予約登録ボタン|✅ FAB + フォーム|
|在庫無視可能|✅ skipAvailabilityCheck|
|店主登録フラグ|✅ source: 'owner'|
|メール送信ON/OFF|✅ チェックボックス|
|PWA通知（30秒ポーリング）|✅ usePWANotifications|
|iOS ホーム画面追加誘導|✅ PWAInstallBanner|
|業務開始ボタン|✅ SessionStartOverlay|
|音声再生（ピンポンパンポーン♪）|✅ AudioContext|
|直前予約ブロック（3時間）|✅ checkLeadTime|
|備考欄チェック（LLM判定）|✅ キーワードベース|
|要承認ステータス|✅ status: 'pending'|

---

### 次のステップ




**FE-200 実装完了 ✅**

|Task|状態|
|---|---|
|1. manifest.json and icons|✅ `public/manifest.json`, `public/icons/icon.svg`|
|2. Service Worker registration|✅ `public/sw.js`, `components/ServiceWorkerRegistration.tsx`|
|3. iOS Install Prompt UI|✅ 既存 `PWAInstallBanner.tsx`, `usePWAInstall.ts`|

**FE-201 実装完了 ✅**（先に実装済み）

|Task|状態|
|---|---|
|1. "Start Business" overlay|✅ `SessionStartOverlay.tsx`|
|2. Polling Logic (30s)|✅ `usePWANotifications.ts`|
|3. Audio & Visual Badge|✅ `DashboardClient.tsx`|

**注意:** PWAアイコンのPNG画像（72x72〜512x512）は、SVGから生成するか、別途用意する必要があります。現在はSVGアイコンのみ作成済みです。


**FE-202 & FE-203 実装完了 ✅**

## FE-202: Connect Real API & Dashboard List View

|Task|状態|
|---|---|
|1. Replace Mocks - Real API connection|✅ `lib/api.ts`|
|2. JWT Authentication header|✅ `getAuthHeaders()`, `setAuthToken()`|
|3. Dashboard List - Today's reservations|✅ `DashboardClient.tsx`|
|4. Dashboard List - Pending Future|✅ 「要承認」タブ追加|
|5. Status badges (Pending=Yellow, Confirmed=Green)|✅ `StatusBadge` コンポーネント|

## FE-203: Reservation Detail Modal & Action UI

|Task|状態|
|---|---|
|1. Detail View - Guest info|✅ `ReservationDetailModal.tsx`|
|2. Highlight Notes with ⚠️ icon|✅ `AlertTriangle` アイコン表示|
|3. Approve Button with reply message|✅ 確認ダイアログ + 返信メッセージ入力|
|4. Reject Button with confirmation|✅ 確認ダイアログ + 却下理由入力|
|5. API connection (PUT status)|✅ `approveReservation()`, `cancelReservation()`|
|6. Success toast notification|✅ `Toast.tsx`, `useToast()`|
|7. Translate link (Google Translate)|✅ 「翻訳」ボタン|

**新規作成ファイル:**

- `components/admin/ReservationDetailModal.tsx`
- `components/admin/Toast.tsx`

**更新ファイル:**

- `components/admin/DashboardClient.tsx` - モーダル統合、3タブ化
- `lib/api.ts` - JWT認証ヘッダー追加


**FE-204 & FE-205 実装完了 ✅**

## FE-204: CRM Info in Reservation Detail

|Task|状態|
|---|---|
|1. Badge display (🔰New, ⭐Regular, 👑VIP)|✅ `CustomerBadge` コンポーネント|
|2. Cancel history alert (赤字表示)|✅ 「過去キャンセル: X回 / ノーショー: X回」|
|3. Past notes history section|✅ 展開可能な「過去の履歴」セクション|
|4. Allergy info display|✅ アレルギー情報・好み・嗜好を表示|
|API: getCustomerHistory()|✅ `lib/api.ts` に追加|

## FE-205: Error Handling & UX Polish

| Task                             | 状態                                          |
| -------------------------------- | ------------------------------------------- |
| 1. Offline banner                | ✅ `OfflineBanner.tsx` - 「インターネットに接続されていません」 |
| 2. Loading states with spinner   | ✅ 承認/却下ボタンにスピナー追加                           |
| 3. Sound test button in settings | ✅ `SoundTestButton.tsx` + 設定ページ「通知設定」タブ     |
| Animation styles                 | ✅ `globals.css` に `slideDown`, `spin` 追加    |
**新規作成ファイル:**

- `components/OfflineBanner.tsx`
- `components/admin/SoundTestButton.tsx`

**更新ファイル:**

- `types/index.ts` - CustomerHistory型追加
- `lib/api.ts` - getCustomerHistory()追加
- `components/admin/ReservationDetailModal.tsx` - CRM情報統合
- `components/admin/DashboardClient.tsx` - storeId渡し



20251212

**FE-206 実装完了 ✅**

## 実装サマリー

### Task 1: Reservation Wizard (Frontend) ✅

|項目|状態|
|---|---|
|Language Switcher (JP/EN)|✅ `LanguageSwitcher.tsx`|
|Translated labels|✅ `lib/i18n.ts` - 全UI文字列|
|Translated error messages|✅ Japanese & English|
|Pass language to Backend API|✅ `CreateReservationRequest.language`|

### Task 2: Email Templates (Infra) ✅

|項目|状態|
|---|---|
|`templates/email/ja/` folder|✅ 作成済み|
|`templates/email/en/` folder|✅ 作成済み|
|`reservation_confirmed.html` (JA)|✅|
|`reservation_pending.html` (JA)|✅|
|`reservation_confirmed.html` (EN)|✅|
|`reservation_pending.html` (EN)|✅|
|Email utility functions|✅ `lib/email.ts`|

### Task 3: Owner Dashboard ✅

|項目|状態|
|---|---|
|Language display in modal|✅ 🇬🇧 English / 🇯🇵 日本語|
|Globe icon|✅ `lucide-react`|

## 新規作成ファイル

- `lib/i18n.ts` - 翻訳システム
- `lib/email.ts` - メールテンプレートユーティリティ
- `components/LanguageSwitcher.tsx` - 言語切り替えUI
- `templates/email/ja/reservation_confirmed.html`
- `templates/email/ja/reservation_pending.html`
- `templates/email/en/reservation_confirmed.html`
- `templates/email/en/reservation_pending.html`
- `docs/FE-206-IMPLEMENTATION-SUMMARY.md`

## 更新ファイル

- `types/index.ts` - `language` フィールド追加
- `components/ReservationWizard.tsx` - 多言語対応
- `components/admin/ReservationDetailModal.tsx` - 言語表示追加



**FE-207 実装完了 ✅**

## 実装サマリー

### Task 1: Table List View ✅

|項目|状態|
|---|---|
|テーブル一覧表示|✅ カード形式リスト|
|テーブル名と定員表示|✅ 「テーブルA (4名)」形式|
|有効/無効ステータス|✅ トグルアイコンで表示|
|総席数サマリー|✅ ヘッダーに表示|
|空状態の表示|✅ 登録を促すメッセージ|

### Task 2: Edit/Add Modal ✅

|項目|状態|
|---|---|
|新規追加モーダル|✅|
|編集モーダル|✅|
|テーブル名入力|✅ バリデーション付き|
|定員入力|✅ +/- ボタン & プリセット|
|有効/無効トグル|✅|
|削除確認モーダル|✅ 警告メッセージ付き|

### Task 3: API Integration ✅

|API|状態|
|---|---|
|GET /api/tables|✅ `getTables(storeId)`|
|POST /api/tables|✅ `createTable(request)`|
|PUT /api/tables/{id}|✅ `updateTable(id, request)`|
|DELETE /api/tables/{id}|✅ `deleteTable(id)`|

## 新規作成ファイル

- `app/admin/tables/page.tsx` - テーブル管理ページ
- `docs/FE-207-IMPLEMENTATION-SUMMARY.md` - 実装ドキュメント

## 更新ファイル

- `lib/api.ts` - テーブルCRUD API関数追加
- `components/admin/BottomNav.tsx` - テーブル管理へのリンク追加

## UI特徴

- カード形式のリスト表示（シンプル、タッチフレンドリー）
- クイックトグルで有効/無効切り替え
- 定員プリセットボタン（2/4/6/8名）
- 削除前の確認モーダル
- ローディング状態とエラーメッセージ