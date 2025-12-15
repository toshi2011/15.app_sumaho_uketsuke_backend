
迷惑メール化防止のため：本番環境
## 環境設定メモ

### SMTP設定（.env）

```
SMTP_HOST=email-smtp.ap-northeast-1.amazonaws.com
SMTP_PORT=587
AWS_SES_SMTP_USER=（AWS SES SMTP認証情報）
AWS_SES_SMTP_PASS=（AWS SES SMTP認証情報）
EMAIL_FROM=goodayhappy00@gmail.com
```

#### ドメイン認証（SPF/DKIM）

本番環境で設定することで迷惑メール判定を回避:

1. AWS SESでドメイン認証
2. DNSレコード設定（SPF、DKIM、DMARC）