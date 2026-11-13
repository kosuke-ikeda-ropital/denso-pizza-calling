# 🌐 クラウド（Render）への無料公開手順

Render（レンダー）を使うと、**クレジットカード不要・完全無料**で固定の公開URL（例: `https://gakusai-pizza.onrender.com`）を取得できます。
これにより、**前日までに固定URLでQRコード番号札を印刷**でき、学祭当日もノートPC・スマホ両方から安定して使えます。

---

## 5分で完了する公開ステップ

### ステップ1: GitHubにコードをアップロード
1. [GitHub](https://github.com/) にログイン（アカウントがなければ無料作成）。
2. 右上の「+」→ **「New repository」** をクリック。
3. リポジトリ名（例: `pizza-call`）を入力し、**Public**（またはPrivate）で作成。
4. 本システムのフォルダ内のファイルをすべてコミット＆プッシュします。
   ```bash
   cd pizza-call-system
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<あなたのユーザー名>/pizza-call.git
   git push -u origin main
   ```
   *(※Gitコマンドが苦手な場合は、GitHub画面の「Upload files」からフォルダ内の中身をドラッグ＆ドロップでもアップロードできます)*

---

### ステップ2: RenderでWebサービスを作成
1. [Render.com](https://render.com/) にアクセスし、**「Sign in with GitHub」** でログイン。
2. ダッシュボード右上の **「New +」** → **「Web Service」** を選択。
3. 先ほど作った `pizza-call` リポジトリの横にある **「Connect」** をクリック。
4. 設定画面で以下を入力・確認します：
   - **Name**: 好きな名前（例: `gakusai-pizza-2026`）
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: **Free** を選択
5. **「Environment Variables」**（環境変数）に以下を追加（任意）：
   - Key: `STAFF_PIN` / Value: `7788` （スタッフ専用の4桁暗証番号）
6. 画面下の **「Create Web Service」** をクリック！

数分待つと、画面上部に **`https://gakusai-pizza-2026.onrender.com`** というURLが発行されます。

---

## 🖨️ 発行されたURLで番号札を印刷する手順

1. ブラウザで `https://<あなたのURL>/cards` を開きます。
2. 画面上の「QRコードのURL基点」に、Renderで発行されたURL（`https://<あなたのURL>`）が入っていることを確認します。
3. **「印刷する (A4)」** を押せば、その公開URLが入ったQRコード付き番号札が印刷されます！
4. ラミネートや厚紙で補強すれば、当日の準備は完了です。

---

## 🔒 セキュリティ・PINコードについて
- お客さんが管理画面（トップページ）を開こうとしても、**「スタッフ専用PINコード（初期値: 7788）」**の入力画面でブロックされます。
- お客さんのスマホは、番号札のQRコードから直接呼び出し専用画面（`/call?num=05`）が開くため、PINの入力は不要でスムーズに利用できます。
