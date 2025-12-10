# {{date}} のウィークリーレビュー

## 📈 今週の進捗まとめ
- 

## 🔁 今週の Done（自動集約）
```dataview
TASK
FROM "Daily"
WHERE file.day >= date("{{date:YYYY-MM-DD}}") - dur(6 days)
AND file.day <= date("{{date:YYYY-MM-DD}}")
AND completed = true
```

## 📝 やり残し
- [ ] 

## 💡 アイディア整理
- 

## 🔮 来週やること
- [ ] 
