# {{date}} のデイリーノート

## 📌 今日やること（ToDo）
- [ ] 

## ✅ 今日やったこと（Done）
- 

## 🧪 技術メモ
- 

## 🐞 バグメモ
- 

## 💡 アイディア
- 

## 📊 進捗（% または作業バー）
進捗: 0%

## 🔁 昨日の Done（自動読込）
```dataview
LIST FROM "Daily"
WHERE file.day = date({{date:YYYY-MM-DD}}) - dur(1 day)
FLATTEN split(regexreplace(section("今日やったこと（Done）」), "\n##.*$", ""), "\n") AS yesterdayDone
WHERE yesterdayDone != ""
