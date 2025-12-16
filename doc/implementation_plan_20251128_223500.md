# 郵便番号による住所自動入力機能の実装

## 目標
店舗設定画面（基本情報タブ）において、郵便番号を入力してボタンを押すことで、住所を自動入力できる機能を実装します。

## 提案される変更

### バックエンド
#### [MODIFY] [schema.json](file:///e:/15.app_sumaho_uketsuke/backend/src/api/store/content-types/store/schema.json)
`Store` コンテンツタイプに `postalCode` (string) フィールドを追加します。必須ではありません。

### フロントエンド
#### [MODIFY] [index.ts](file:///e:/15.app_sumaho_uketsuke/frontend/types/index.ts)
`Store` インターフェースに `postalCode?: string;` を追加します。

#### [MODIFY] [page.tsx](file:///e:/15.app_sumaho_uketsuke/frontend/app/admin/settings/page.tsx)
- **UI**: 基本情報タブに「郵便番号」入力欄と「住所検索」ボタンを追加します。
- **Logic**:
  - `zipcloud` API (`https://zipcloud.ibsnet.co.jp/api/search?zipcode=...`) を使用して住所を取得します。
  - CORSエラーを回避するため、クライアントサイドでのFetchで問題ないか確認し、必要であればNext.jsのAPI Routeを作成します（今回はシンプルにクライアントFetchで試行し、JSONPが使えないため、Next.jsのAPI Route `pages/api/address.ts` または `app/api/address/route.ts` をプロキシとして作成することを推奨します）。
  - 取得した住所（都道府県+市区町村+町域）を住所入力欄にセットします。

#### [NEW] [route.ts](file:///e:/15.app_sumaho_uketsuke/frontend/app/api/address/route.ts)
CORS回避のためのプロキシAPIエンドポイントを作成します。

## 実装ステップ
1. バックエンド: `postalCode` フィールドの追加と再起動。
2. フロントエンド: 型定義の更新。
3. フロントエンド: プロキシAPI (`/api/address`) の作成。
4. フロントエンド: 設定画面へのUIとロジックの実装。
5. 検証: 郵便番号検索の動作確認。
