# 店舗プレビューモーダルの実装

## 目標
店舗設定画面（`/admin/settings`）に、現在の入力内容（未保存含む）を反映した店舗ポータル画面をプレビューできる全画面モーダルを追加します。

## 提案される変更

### フロントエンド

#### [NEW] [StorePortalUI.tsx](file:///e:/15.app_sumaho_uketsuke/frontend/components/store/StorePortalUI.tsx)
現在の `frontend/app/store/[storeId]/page.tsx` のUIロジックを抽出したプレゼンテーションコンポーネントを作成します。
- Props: `{ store: Store }`
- 新しい `socialLinks` フィールド（Instagram, X, LINE, HP）の表示に対応します。
- `branding` フィールド（テーマカラー、カバー画像）の反映に対応します。

#### [MODIFY] [page.tsx](file:///e:/15.app_sumaho_uketsuke/frontend/app/store/[storeId]/page.tsx)
`StorePortalUI` を使用するようにリファクタリングします。

#### [MODIFY] [page.tsx](file:///e:/15.app_sumaho_uketsuke/frontend/app/admin/settings/page.tsx)
- ヘッダーに「プレビュー」ボタン（目のアイコン）を追加。
- 全画面モーダルを実装。
- モーダル内に `StorePortalUI` を配置し、現在のフォーム入力値から構築した一時的な `Store` オブジェクトを渡します。
- 画像（ロゴ、カバー）については、アップロード前の `File` オブジェクトがある場合は `URL.createObjectURL` で生成したプレビュー用URLを使用するロジックを組み込みます。

## 実装ステップ
1. `StorePortalUI` コンポーネントの作成
2. 店舗詳細ページのリファクタリング
3. 設定画面へのプレビュー機能追加
4. 動作確認（プレビュー表示、閉じる動作、データ反映）
