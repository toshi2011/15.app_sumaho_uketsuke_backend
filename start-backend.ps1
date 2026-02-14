# backend起動スクリプト（DB自動バックアップ付き）
# 実行方法: .\start-backend.ps1

$dbPath = "C:\strapi-data\uketsuke-backend\data.db"
$backupDir = "C:\strapi-data\uketsuke-backend\backups"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = "$backupDir\data_$timestamp.db"

# バックアップフォルダを作成
if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

# データベースのバックアップ
if (Test-Path $dbPath) {
    Copy-Item -Path $dbPath -Destination $backupPath -Force
    Write-Host "[OK] Database backed up to: $backupPath" -ForegroundColor Green
    
    # 古いバックアップを削除（10個以上は古いものから削除）
    $backups = Get-ChildItem $backupDir -Filter "data_*.db" | Sort-Object LastWriteTime -Descending
    if ($backups.Count -gt 10) {
        $backups | Select-Object -Skip 10 | Remove-Item -Force
        Write-Host "[CLEANUP] Old backups removed, keeping 10 most recent" -ForegroundColor Yellow
    }
} else {
    Write-Host "[WARN] Database file not found: $dbPath" -ForegroundColor Yellow
}

# distフォルダを削除
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Write-Host "[OK] dist folder deleted" -ForegroundColor Green

# Strapi起動
Write-Host "[START] Starting Strapi..." -ForegroundColor Cyan
npm run develop
