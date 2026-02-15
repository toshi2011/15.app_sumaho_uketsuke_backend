# Super Admin Layout Refactor 実装計画

## 目的
開発者用ダッシュボードを「営業フェーズ（Sales）」と「運用フェーズ（Operations）」の2つの画面に分離し、モード切り替え可能なSuper Adminレイアウトを構築する。

## 変更内容

### フロントエンド (Next.js)

#### [NEW] [super-admin layout](file:///e:/15.app_sumaho_uketsuke/frontend/app/super-admin/layout.tsx)
- 共通レイアウトコンポーネントを作成
- ヘッダー: "Super Admin Console"
- ナビゲーション: TabsまたはSidebarで2つのモードを切り替え
  - 🎯 Sales (営業): `/super-admin/sales`
  - 🚜 Operations (運用): `/super-admin/operations`
- 現在のURLに基づいてアクティブなタブを強調表示

#### [MOVE] [Developer Dashboard → Sales Dashboard](file:///e:/15.app_sumaho_uketsuke/frontend/app/super-admin/sales/page.tsx)
- 既存の `/app/developer/page.tsx` を `/app/super-admin/sales/page.tsx` に移動
- コンポーネント名を `DeveloperDashboard` から `SalesDashboard` に変更

#### [NEW] [Operations Dashboard](file:///e:/15.app_sumaho_uketsuke/frontend/app/super-admin/operations/page.tsx)
- プレースホルダーページを作成
- タイトル: "Operations Dashboard (Active Stores)"
- 内容: "Coming Soon" メッセージ

#### [NEW] [super-admin root redirect](file:///e:/15.app_sumaho_uketsuke/frontend/app/super-admin/page.tsx)
- `/super-admin` にアクセスした際、`/super-admin/sales` にリダイレクト

## 検証計画
### 手動検証
1. `/super-admin` にアクセスし、`/super-admin/sales` にリダイレクトされることを確認
2. Sales Dashboardが正常に表示されることを確認
3. ナビゲーションで "Operations" タブをクリックし、`/super-admin/operations` に遷移することを確認
4. Operations Dashboardのプレースホルダーが表示されることを確認
5. アクティブなタブが正しく強調表示されることを確認
