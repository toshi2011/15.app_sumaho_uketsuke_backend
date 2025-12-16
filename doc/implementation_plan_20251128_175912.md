# タブ式店舗設定画面の完全実装

## 目標
現在の店舗設定画面を5つのタブに分割し、SNSリンク、外観設定（ロゴ・カバー画像・テーマカラー）、リアルタイムプレビューを追加します。

## ユーザーレビューが必要な事項

> [!IMPORTANT]
> **画像アップロード機能について**
> Windows環境でのStrapi画像最適化の問題（EPERM エラー）により、ローカル環境では画像アップロードが動作しない可能性があります。本番環境（Linux/macOS）では正常に動作する見込みです。

## 提案される変更

### バックエンド

#### [MODIFY] [schema.json](file:///e:/15.app_sumaho_uketsuke/backend/src/api/store/content-types/store/schema.json)
`Store`スキーマに以下のフィールドを追加：

**SNSリンク**
- `socialLinks`: JSON型
  - 構造: `{ "instagram": "url", "twitter": "url", "officialHp": "url", "line": "url" }`

**外観設定**
- `branding`: JSON型
  - 構造: `{ "themeColor": "#f97316", "useCoverImage": boolean }`
- `logoImage`: Media型（単一画像）
- `coverImage`: Media型（単一画像）

**既存フィールドの整理**
- `businessHours`: 既存のJSON構造を維持
- 既存のSNSリンクフィールド（`snsLink1Label`等）は削除せず、移行のため残す

---

### フロントエンド

#### [MODIFY] [page.tsx](file:///e:/15.app_sumaho_uketsuke/frontend/app/admin/settings/page.tsx)
設定画面を5つのタブで構成：

**タブ構造**
1. **基本情報**: 店舗名、電話番号、住所、Googleマップリンク
2. **営業時間**: ランチ/ディナー時間、定休日
3. **SNS・リンク**: 公式HP、Instagram、X、LINE
4. **デザイン・外観**: ロゴ、カバー画像、テーマカラー、プレビュー
5. **在庫管理**: 総席数、組数、滞在時間

**新機能**
- タブ切り替えUI
- Googleマップリンクプレビュー
- 画像アップロード（ロゴ・カバー）
- カラーピッカー
- リアルタイムプレビュー

#### [MODIFY] [index.ts](file:///e:/15.app_sumaho_uketsuke/frontend/types/index.ts)
`Store`型に新しいフィールドを追加

#### [MODIFY] [api.ts](file:///e:/15.app_sumaho_uketsuke/frontend/lib/api.ts)
- 画像アップロード関数を追加（既存の`uploadFile`を活用）
- `updateStore`関数を拡張

---

## 検証計画

### 手動検証
1. 各タブが正しく切り替わるか
2. 各フィールドの入力・保存が正常に動作するか
3. 画像アップロードが動作するか（本番環境で確認）
4. リアルタイムプレビューが正しく表示されるか
5. 保存した設定が店舗ページに反映されるか
