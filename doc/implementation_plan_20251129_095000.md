# Bulk Store Import Script Implementation Plan

## 目的
店舗データCSVを読み込み、Strapiに一括登録するNode.jsスクリプトを作成する。トランザクション管理、重複チェック、画像アップロード、ユーザー作成を含む。

## 変更内容

### バックエンド (Strapi)
#### [MODIFY] [store schema](file:///e:/15.app_sumaho_uketsuke/backend/src/api/store/content-types/store/schema.json)
- `adminToken` (string) フィールドを追加: マジックリンク用UUID保存

#### [NEW] [import-stores.js](file:///e:/15.app_sumaho_uketsuke/backend/scripts/import-stores.js)
- スタンドアロンスクリプトとして実装
- `csv-parser`, `uuid` を使用
- トランザクション処理: `strapi.db.transaction()`
- 重複チェック: email/phoneNumber
- ユーザー作成: `plugin::users-permissions.user`
- 画像アップロード: `backend/seed-images/` からアップロード
- 店舗作成: `api::store.store`
- エラーハンドリング: `import-errors.csv` 出力

### 依存関係
- `npm install csv-parser uuid` (backendディレクトリ)

## 検証計画
1. `backend/seed-images/` にダミー画像を配置
2. `backend/stores.csv` (ダミーデータ) を作成
3. `node scripts/import-stores.js` を実行
4. コンソール出力とStrapi管理画面で登録結果を確認
5. `import-errors.csv` の生成を確認（重複データなどでテスト）
