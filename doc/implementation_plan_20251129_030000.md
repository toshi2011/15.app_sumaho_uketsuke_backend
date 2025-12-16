# Sales Dashboard Excel風テーブル実装計画

## 目的
Sales Dashboardに100店舗以上の営業状況を効率的に管理するための高機能テーブルを実装する。Excel風の高密度レイアウト、フィルタリング、ヒートマップ、ポップオーバー編集、クイックアクションを統合。

## 変更内容

### バックエンド (Strapi)
#### [MODIFY] [store schema](file:///e:/15.app_sumaho_uketsuke/backend/src/api/store/content-types/store/schema.json)
- `status` (Enumeration) フィールドを追加: `LEAD`, `CONTACTED`, `TRIAL`, `REJECTED`, `DORMANT`, `ACTIVE`

### フロントエンド (Next.js)
#### [MODIFY] [types/index.ts](file:///e:/15.app_sumaho_uketsuke/frontend/types/index.ts)
- `Store` インターフェースに `status` フィールドを追加

#### [MODIFY] [Sales Dashboard](file:///e:/15.app_sumaho_uketsuke/frontend/app/super-admin/sales/page.tsx)
- **完全リファクタリング**: カード型レイアウトを廃止し、Excel風の高密度テーブルに変更
- **フィルターバー**:
  - Pipeline Tabs: 進行中 (Active), 除外 (Archived), 全て (All)
  - デフォルト: 進行中 (`LEAD`, `CONTACTED`, `TRIAL`)
  - Optimistic UI: ステータス変更時に即座にリストから削除
- **テーブル列**:
  1. 店名（名前 + リンク）
  2. ステータス（Badge表示）
  3. 充実度（ヒートマップ: ロゴ、メニュー、営業時間、マップ）
  4. 店主属性（ポップオーバー編集 + AI相談ボタン）
  5. 利用媒体（アイコン表示 + ポップオーバー編集）
  6. アクション（クイックアクションアイコン + ドロップダウン）
- **ヒートマップロジック**:
  - データあり: ✅ (CheckCircle)
  - データなし: ⚠️ (AlertCircle)
- **ポップオーバー機能**:
  - 店主属性: 性別・年代入力 + 🤖 AI相談ボタン
  - 利用媒体: チェックボックスで編集
- **クイックアクション**:
  - [📩] SNS/郵送DM記録
  - [📞] 電話記録
  - [...] その他（訪問、詳細編集、🙅お断り）

## 検証計画
### 手動検証
1. `/super-admin/sales` にアクセス
2. フィルターバーで「進行中」「除外」「全て」を切り替え
3. テーブルが正しく表示されることを確認
4. ヒートマップアイコンの表示を確認
5. 店主属性ポップオーバーとAI相談ボタンを確認
6. 利用媒体ポップオーバーを確認
7. クイックアクションアイコンとドロップダウンを確認
8. 「お断り」アクションでステータスが変更され、リストから消えることを確認
