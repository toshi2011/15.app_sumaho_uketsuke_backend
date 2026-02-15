# 店舗データ一括インポートスクリプトの実装

## 目標
CSVファイルから店舗データを読み込み、Strapiに一括インポートする堅牢なスクリプトを実装します。トランザクション管理、リジューム機能（重複スキップ）、エラーログ出力を備えます。

## 提案される変更

### バックエンド
#### [NEW] [bulk-import-stores.ts](file:///e:/15.app_sumaho_uketsuke/backend/scripts/bulk-import-stores.ts)
- Strapiインスタンスを初期化してDB操作を行います。
- `csv-parse` を使用してCSVをパースします。
- 各行ごとにトランザクションを開始し、ユーザー作成 -> 画像アップロード -> 店舗作成 をアトミックに実行します。
- エラー時はロールバックし、エラー内容をCSVに出力します。

#### [MODIFY] [package.json](file:///e:/15.app_sumaho_uketsuke/backend/package.json)
- 依存関係の追加: `csv-parse`, `mime-types`
- 開発依存関係の追加: `ts-node`, `@types/mime-types`
- スクリプトの追加: `"seed:stores": "ts-node scripts/bulk-import-stores.ts"`

## 実装ステップ
1. 依存パッケージのインストール (`csv-parse`, `mime-types`, `ts-node`)。
2. `backend/scripts/bulk-import-stores.ts` の作成。
3. `package.json` へのスクリプト追加。
4. テスト用CSVデータの作成 (`backend/data/stores.csv`)。
5. スクリプトの実行と検証。

## CSVフォーマット (予定)
`name,description,phoneNumber,postalCode,address,email,password,image_path`
