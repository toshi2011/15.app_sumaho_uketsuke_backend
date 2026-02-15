# 実装計画: 予約コントローラーの型エラー修正とスキーマクリーンアップ

予約オブジェクトに存在しない `name` プロパティを参照している箇所を `guestName` に修正し、併せてスキーマファイルに残っているコンフリクトマーカー（Gitマージミス）を除去します。

## ユーザーレビューが必要な項目
- 特になし。明らかな型ミスの修正と、壊れているJSONファイルの復旧です。

## 提案される変更

### Backend

#### [MODIFY] [owner-reservation.ts](file:///g:/15.app_sumaho_uketsuke/backend/src/api/owner-reservation/controllers/owner-reservation.ts)
- `res.name` または `r.name` を、Reservationスキーマの正しい属性名である `guestName` に書き換えます。
- 修正箇所:
    - `update` メソッド内（コンフリクト応答時）
    - `fixCounters` メソッド内（ログ出力時）
    - `recalcLanes` メソッド内（ログ出力時）

#### [MODIFY] [reservation/schema.json](file:///g:/15.app_sumaho_uketsuke/backend/src/api/reservation/content-types/reservation/schema.json)
- `<<<<<<< HEAD` 等のコンフリクトマーカーを削除し、HEAD（最新の追加フィールド）と master（既存の安定フィールド）を正しくマージします。
- 重複している属性（`duration`, `status` 等）を整理します。

#### [MODIFY] [customer/schema.json](file:///g:/15.app_sumaho_uketsuke/backend/src/api/customer/content-types/customer/schema.json)
- コンフリクトマーカーを削除し、`birthday` などの追加フィールドを維持した状態でマージします。

## 検証プラン

### 自動テスト
- `npm run build` を（バックエンドディレクトリで）実行し、TypeScriptのビルドエラーが解消されていることを確認します。

### 手動確認
- Strapiの管理画面およびフロントエンドから、予約情報の表示・更新が正常に行えることを確認します（特にカウンターの修正機能など）。
