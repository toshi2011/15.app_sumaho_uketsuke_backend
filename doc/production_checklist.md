# 本番環境デプロイチェックリスト

## INF-303: Production Environment Setup

### 1. AWS SES 設定

#### サンドボックス解除
- [ ] AWS Console → SES → Account dashboard → Request production access
- [ ] ビジネス利用目的を説明
- [ ] 承認まで24-48時間

#### ドメイン検証
- [ ] SES → Identities → Create identity (Domain)
- [ ] DNS に DKIM レコードを追加（3つのCNAME）
- [ ] DNS に SPF レコードを追加
  ```
  v=spf1 include:amazonses.com ~all
  ```
- [ ] DNS に DMARC レコードを追加
  ```
  _dmarc.yourdomain.com TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"
  ```
- [ ] SES ダッシュボードで全て "Verified" を確認

#### SMTP認証情報
- [ ] SES → SMTP settings → Create SMTP credentials
- [ ] 生成された IAM ユーザー情報を `.env.production` に設定

---

### 2. セキュリティ設定

#### SSL/TLS
- [ ] Let's Encrypt または AWS ACM で証明書発行
- [ ] HTTPS のみアクセス許可

#### CORS
- [ ] `CORS_ORIGINS` に本番フロントエンドドメインを設定
- [ ] ワイルドカード (*) は使用禁止

#### ファイアウォール
- [ ] Strapi ポート (1337) は内部のみアクセス可能
- [ ] リバースプロキシ (nginx/CloudFront) 経由でアクセス

---

### 3. エラー監視

#### Webhook設定
- [ ] Slack App 作成 → Incoming Webhooks 有効化
- [ ] Webhook URL を `ERROR_WEBHOOK_URL` に設定

#### ログ監視
- [ ] CloudWatch Logs / Datadog / Sentry 等を設定
- [ ] 重大エラー時のアラート設定

---

### 4. データベース

#### PostgreSQL (推奨)
- [ ] RDS PostgreSQL インスタンス作成
- [ ] マルチAZ 有効化（本番環境）
- [ ] 自動バックアップ設定

#### マイグレーション
- [ ] 開発DBからスキーマをエクスポート
- [ ] 本番DBにインポート

---

### 5. デプロイコマンド

```bash
# ビルド
NODE_ENV=production npm run build

# 起動
NODE_ENV=production npm run start

# PM2 使用時
pm2 start npm --name "strapi" -- run start
pm2 save
```

---

### 6. 動作確認

- [ ] 予約作成 API テスト
- [ ] メール送信テスト（確定、拒否）
- [ ] CORS エラーがないか確認
- [ ] エラー監視 Webhook テスト
