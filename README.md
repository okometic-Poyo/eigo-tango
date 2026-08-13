# えいごのたんご 🦁

6歳向けの英単語フラッシュカード＆小テストアプリ。
iPhone / Fire HDタブレットのブラウザで動く静的Webアプリです。

## 構成

```
index.html / app.js / style.css   … 学習アプリ本体（子ども用）
admin.html                        … 管理ページ（親用・素材差し替えと単語追加）
content/
  words.json                      … 単語マスタ
  sets.json                       … セット定義（出題順）
  images/<単語ID>.png             … イラスト
  audio/<単語ID>.mp3 か .m4a      … 音源（.mp3 優先で再生）
tools/
  generate_assets.py              … 仮素材の一括生成（開発用・Mac専用）
```

## しくみ

- **出題方式**: ①スペル⇄音声 ②イラスト⇄音声 ③イラスト⇄スペル（双方向で計6パターン）
- **分類**: 名詞・文章 → 6パターン全部 ／ 機能語 → ①の2パターンのみ
- **習得判定**: その単語の全パターンで正解したら「マスター（🏅）」。間違えるとその方式はやり直し
- **セット**: 場面テーマごとに約8語。1回のテストは 新規8問＋前セットの復習2問＝10問
- **解答**: すべて4択タップ。音声が選択肢のときはタップで聞き比べ→「きめた！」で確定
- **進捗**: 端末ごとにブラウザ(localStorage)へ保存。素材を差し替えても消えません
- **予習**: ホームの「ことばリスト」に出題順の全単語（イラスト・スペル・音声・習得マーク）を表示

## 単語データの書式

`content/words.json` の1エントリ:

```json
{ "id": "banana", "text": "banana", "ja": "バナナ", "category": "noun", "level": "eiken-jr-gold" }
```

- `id` … ファイル名にもなるID。小文字英数字とハイフンのみ（文章は `i-like-apples` のように）
- `category` … `noun`（名詞）/ `function-word`（機能語）/ `sentence`（文章）
- `level` … `eiken-jr-gold` / `eiken-5` /（将来 `eiken-4` などを追加可能）

`content/sets.json` の1エントリ（並び順＝出題順・予習ページの表示順）:

```json
{ "id": "set-01", "title": "あさごはん", "emoji": "🍳", "words": ["apple", "milk", "..."] }
```

## 素材の差し替え（いちばん簡単な方法: 管理ページ）

1. ブラウザで `admin.html` を開く（アプリのURL末尾を `/admin.html` に）
2. 単語を選ぶ → 種類（イラスト/音源）を選ぶ → ファイルを選ぶ → ボタンを押す
3. 1分ほどでアプリに反映（アプリをリロード）

- イラストはどんなサイズの画像でもOK（自動で512px正方形PNGに変換されます）
- 音源はmp3ファイルを用意してください
- 新しい単語の追加も同じページからできます（words.json / sets.json の編集は不要）

### 管理ページの初期設定（最初に1回だけ）

1. GitHubにログイン → 右上アイコン → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
2. 設定:
   - **Repository access**: 「Only select repositories」でこのリポジトリだけを選ぶ
   - **Permissions** → Repository permissions → **Contents: Read and write**
   - 有効期限はお好みで（切れたら再発行して貼り直し）
3. 生成されたトークン（`github_pat_...`）をコピー
4. `admin.html` を開き、「ユーザー名/リポジトリ名」とトークンを入力して保存

## 素材の差し替え（手動でやる場合）

- 差し替え: `content/images/` や `content/audio/` の同名ファイルを上書きするだけ（JSONの編集不要）
- 追加: `words.json` に1エントリ追記 ＋ 同IDの画像/音源を配置 ＋ `sets.json` のどれかのセットにIDを追加

## 公開（GitHub Pages）

1. GitHubでリポジトリを作成し、このフォルダ一式をプッシュ
2. リポジトリの **Settings** → **Pages** → Branch: `main` / フォルダ: `/ (root)` → Save
3. 数分で `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます

## ローカルでの動作確認

```sh
python3 -m http.server 8000
# → http://localhost:8000 を開く
```

（`fetch` を使うため、ファイル直接開き（file://）では動きません）

## 仮素材について

現在の音源はmacOSの音声合成（Samantha）、イラストは絵文字ベースの仮画像です。
`tools/generate_assets.py` で再生成できます。正式な素材は管理ページから
同じIDでアップロードすれば上書きされます（mp3をアップすると仮のm4aより優先されます）。
