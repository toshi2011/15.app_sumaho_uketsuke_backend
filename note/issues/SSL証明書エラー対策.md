### SSL証明書エラー対策

開発環境で発生する「self-signed certificate」エラーを回避:

```typescript
tls: {
    rejectUnauthorized: false,
}
```

**※ 本番環境では削除を検討**