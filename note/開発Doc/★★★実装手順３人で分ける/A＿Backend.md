

| DSGN-001 | スキーマ定義 & 実装 |
| -------- | ----------- |










**DSGN-002 API実装完了しました！** 🎉

### 作成したAPI

| エンドポイント                                          | メソッド | 説明                 |
| ------------------------------------------------ | ---- | ------------------ |
| ```<br>/api/owner/notifications/check<br>```     | GET  | 新規予約チェック（ポーリング用）   |
| ```<br>/api/owner/notifications/mark-read<br>``` | POST | 予約を既読にする           |
| ```<br>/api/owner/session/start<br>```           | POST | セッション開始（サウンド再生可能化） |
| ```<br>/api/owner/session/end<br>```             | POST | セッション終了            |

**BE-102** については情報がありません。これまで実装完了したチケットは以下の通りです：

### 完了済みチケット

| チケット     | 内容                      | ステータス |
| -------- | ----------------------- | ----- |
| DSGN-001 | スキーマ定義 & 実装             | ✅ 完了  |
| DSGN-002 | PWA Polling API 仕様 & 実装 | ✅ 完了  |
| INF-300  | AWS SES 設定基盤            | ✅ 完了  |
| INF-301  | メールテンプレート作成             | ✅ 完了  |

**BE-102: Owner Action APIs 実装完了！** 🎉

### 実装したAPI

|エンドポイント|メソッド|説明|
|---|---|---|
|```<br>/api/owner/reservations<br>```|GET|予約一覧（日付・ステータスフィルタ対応）|
|```<br>/api/owner/reservations/:id<br>```|GET|予約詳細取得|
|```<br>/api/owner/reservations/:id/status<br>```|PUT|ステータス更新 + メール自動送信|

### ステータス更新API 詳細

**リクエスト例:**

json

PUT /api/owner/reservations/abc123/status

Headers: X-Store-ID: store-documentId

{

  "status": "confirmed",

  "ownerReply": "ご予約ありがとうございます。当日お待ちしております。",

  "assignedTables": ["table-id-1", "table-id-2"]

}

**動作:**

- ```
    confirmed
    ```
    
     → 確定メール送信（
    
    ```
    ownerReply
    ```
    
     をテンプレートに注入）
- ```
    rejected
    ```
    
     → 拒否メール送信
- ```
    cancelled
    ```
    
     → キャンセルメール送信

### 一覧API フィルタ

GET /api/owner/reservations?status=pending&date=2025-12-25

GET /api/owner/reservations?startDate=2025-12-01&endDate=2025-12-31

GET /api/owner/reservations?status=pending,confirmed&page=1&pageSize=20

Strapiは 

```
http://localhost:1338
```

 で起動中です。



## BE-103: 予約リードタイム制限

### 変更点

- Store スキーマに 
    
    ```
    minBookingLeadTime
    ```
    
     追加（デフォルト: 180分）

### 新規API

|エンドポイント|メソッド|説明|
|---|---|---|
|```<br>/api/public/reservations<br>```|POST|公開予約作成（リードタイム検証あり）|
|```<br>/api/public/reservations/:reservationNumber<br>```|GET|予約番号で検索|

### 動作

- 予約時刻が 
    
    ```
    now + minBookingLeadTime
    ```
    
     より前 → **400エラー**
    
    > "当日の直前予約はお電話にて承ります。"
    
- ```
    isOwnerEntry: true
    ```
    
     → 制限なし

---

## BE-104: 顧客履歴集約API

### レスポンス追加

```
GET /api/owner/reservations
```

 に 

```
customerStats
```

 追加:

json

{

  "customerStats": {

    "visitCount": 5,

    "lastVisit": "2024-11-01",

    "cancelCount": 0,

    "noShowCount": 1,

    "notesHistory": ["辛いもの苦手", "窓際希望"],

    "isFirstTime": false

  }

}

### 作成ファイル

- ```
    customer/services/customer-stats.ts
    ```
    
     - 電話番号ベース履歴集約
- ```
    public-reservation/
    ```
    
     - 公開予約API

Strapiを再起動して動作を確認してください。



20251213
## コミット＆プッシュ完了！

|リポジトリ|ブランチ|コミットメッセージ|
|---|---|---|
|frontend|```<br>feature/dsgn-001-schema<br>```|PWA通知機能の改善: ポーリングロジック修正、iOS AudioContext対応、カウント正確化、UI文言変更|
|backend|```<br>feature/dsgn-001-schema<br>```|予約スキーマにisReadフィールドを追加（PWA通知用）|

## ✅ コミット＆プッシュ完了！

### コミット内容

|リポジトリ|ブランチ|コミットメッセージ|
|---|---|---|
|frontend|```<br>feature/dsgn-001-schema<br>```|PWA通知機能改善: 承認後の即時バッジ更新、refreshNotifications追加、UI文言変更|
|backend|```<br>feature/dsgn-001-schema<br>```|メール送信機能実装: ライフサイクルフック、SSL証明書対応、起動スクリプト追加|

### 作成ドキュメント

- ```
    doc/walkthrough_20251213_222700.md
    ```
    
     - 実装レポート（今後の改善案含む）

## 今後の改善案

### 優先度: 高

#### Web Push通知の実装

本番環境（HTTPS）で実装することで以下が可能に:

- バックグラウンドでも通知受信
- 画面ロック中でも通知
- iOS 16.4以降でサポート

**必要な作業:**

1. VAPID鍵の生成
2. Service Workerでのプッシュ受信処理
3. バックエンドからのプッシュ送信

### 優先度: 中

#### ドメイン認証（SPF/DKIM）

本番環境で設定することで迷惑メール判定を回避:

1. AWS SESでドメイン認証
2. DNSレコード設定（SPF、DKIM、DMARC）

### 優先度: 低

#### リアルタイム同期（WebSocket）

複数デバイス間の即時同期が必要な場合:

1. Socket.io等の導入
2. 予約変更時にブロードキャスト🎉