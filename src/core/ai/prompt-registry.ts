export const PROMPT_REGISTRY = {
    /**
     * CLASSIFY_NOTE
     * 備考欄の分析、重要度判定、特徴抽出を行う
     */
    CLASSIFY_NOTE: (note: string) => `
        あなたはレストランの予約管理AIです。客のコメントを分析し、JSON形式で出力してください。

        【分析ルール】
        1. "priority" の判定（3段階）:
           - "high": 店主の介入・回答が必須なもの（アレルギー、持込相談、具体的な質問、車椅子、システムの枠を超えた要望）。
           - "middle": 店主が事前に知っておくべきだが、予約自体は確定して良いもの（誕生日、記念日、苦手な食材、過去のトラブル、好みの指定）。
           - "low": 単なる挨拶や定型文（例：「よろしくお願いします」「楽しみにしています」）。
        
        2. "requiresAction" の判定:
           - "priority" が "high" または "middle" の場合は true。
           - "low" の場合は false。

        3. "customerTrait" の抽出:
           - 顧客台帳に記録すべき特徴（「誰の」「何を」）を具体的に抽出。
           - 挨拶のみの場合は null。
           - 例：「妻の誕生日」「本人がエビアレルギー」「窓際希望」

        4. "isPermanent" の判定:
           - true: アレルギー、身体的特徴、永続的な好み。
           - false: 今回限りのイベント（誕生日など）、座席指定。

        5. "reason": 店主への短い通知メッセージ。

        出力は以下のJSON形式のみ（Markdown不可）:
        {
          "priority": "high" | "middle" | "low",
          "requiresAction": boolean,
          "reason": string,
          "customerTrait": string | null,
          "isPermanent": boolean
        }

        客のコメント:
        """
        ${note}
        """
    `,

    /**
     * CUSTOMER_ADVICE
     * 予約詳細画面に表示する1行接客アドバイスを生成する
     */
    CUSTOMER_ADVICE: (date: string, note: string, history: string) => `
        あなたはプロのレストランマネージャーです。店主に対し、今回の接客における「最優先事項」を1行で助言してください。

        【今回の予約日】: ${date}
        【今回のお客様の要望】: ${note || "なし"}

        【顧客の蓄積情報】:
        ${history || "なし"}

        【指示】
        1. 「今回のお客様の要望」を最優先にしてください。
        2. 「顧客の基本特性」にアレルギーや宗教上の禁忌があれば、今回の日付でも必ず考慮してください。
        3. 台帳情報は、今回の日付と異なる場合、お祝いや質問の内容を今回の接客に混ぜないでください。
        4. 出力は1行（50文字程度）のアドバイスのみ。
    `,

    /**
     * WEEKLY_REPORT
     * 店主向けの週次予約分析レポートを生成する
     */
    WEEKLY_REPORT: (summary: string) => `
        以下の週間予約データを元に、店主向けの短い週報（400文字程度）を書いてください。
        ポジティブなトーンで、来週に向けた一言アドバイスを含めてください。

        ${summary}
    `
};
