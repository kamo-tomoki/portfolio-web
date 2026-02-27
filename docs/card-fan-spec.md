# Works カードファンUI 設計仕様書

## 概要

Worksページの作品一覧を、カードゲームの手札のように扇形（ファン状）に配置するUIコンポーネント。Three.jsの`CSS3DRenderer`を使い、HTML+CSSで定義したカード要素を3D空間上に配置する。

## 技術選定: CSS3DRenderer

### 選定理由

| 候補 | 概要 | 採否 |
|------|------|------|
| **CSS3DRenderer** | DOM要素にCSS3D transformを適用し3D配置 | **採用** |
| @react-three/drei Html | R3Fの3D空間にHTMLを埋め込む | 不採用（R3F未使用プロジェクト） |
| Canvas Texture | HTMLをCanvasに描画しテクスチャ化 | 不採用（インタラクティブ性喪失） |
| Pure CSS transforms | CSSのみで3D風配置 | 不採用（Three.jsのシーン制御・カメラ制御が使えない） |

### CSS3DRendererの仕組み

```
Three.js Scene
  └─ CSS3DObject (= DOM要素をラップ)
       ├─ position, rotation をThree.jsで制御
       └─ レンダー時にCSS transform: matrix3d(...)に変換

CSS3DRenderer
  └─ PerspectiveCameraのmatrixからCSS perspectiveを計算
  └─ 各CSS3DObjectのworld matrixをCSS transformに変換
  └─ 結果: DOM要素が3D配置される（WebGLキャンバスではない）
```

**メリット:**
- カードはリアルなDOM要素 → CSS hover, click, テキスト選択すべて動作
- 既存の`three@0.183.1`に同梱（追加依存なし）
- プロジェクトのimperativeなThree.jsパターンと整合

**制限事項:**
- ブラウザズーム100%以外でtransformがずれる可能性あり
- WebGLのマテリアル・ライティングは使用不可（DOM要素のため）

## アーキテクチャ

```
src/
  utils/
    CardFan.ts          ← 新規: CSS3DRendererベースのファン配置クラス
  components/
    Works.tsx            ← 変更: グリッド → CardFanコンテナに変更
```

### クラス設計: `CardFan`

```typescript
// src/utils/CardFan.ts

export interface CardData {
  title: string;
  description: string;
  tech: string[];
  year: string;
}

export class CardFan {
  constructor(container: HTMLElement, cards: CardData[])

  // 公開API
  selectCard(index: number): void    // カードを前面に持ち上げ（トグル）
  resize(): void                     // ウィンドウリサイズ対応
  dispose(): void                    // リソース解放

  // コールバック
  onCardClick?: (index: number, data: CardData) => void
  onCardHover?: (index: number | null) => void
}
```

**プロジェクト内の参考パターン:**
- `FluidSimulation.ts`: constructor → animate loop → dispose のライフサイクル
- `ShodoCanvas.tsx`: useEffect内でのimperativeクラス統合

### React統合: `Works.tsx`

```typescript
// src/components/Works.tsx（概要）

export function Works({ onNavigateHome }: WorksProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fanRef = useRef<CardFan | null>(null);

  useEffect(() => {
    const fan = new CardFan(containerRef.current!, WORKS);
    fanRef.current = fan;

    fan.onCardClick = (index, data) => { /* 将来の詳細遷移用 */ };

    const handleResize = () => fan.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      fan.dispose();
    };
  }, []);

  return (
    <div>
      <header>← back / Works</header>
      <div ref={containerRef} style={{ flex: 1, minHeight: "500px" }} />
    </div>
  );
}
```

## ファン配置の数学

### 座標系

```
          Y ↑
            |
            |    カードはXY平面上の円弧に配置
  ──────────┼──────────→ X
            |
            |
        pivot point（円弧の中心、画面下方）
```

### パラメータ

| 定数 | 値 | 説明 |
|------|----|------|
| `CARD_WIDTH` | 280px | カード幅 |
| `CARD_HEIGHT` | 380px | カード高さ |
| `FAN_RADIUS` | 1200 | 円弧の半径（pivot→カード中心の距離） |
| `FAN_ARC_DEGREES` | 40 | 扇の広がり角度（カード数に応じて動的調整） |
| `CARD_TILT_X` | -5deg | 奥方向への微傾き |
| `CAMERA_Z` | 2000 | カメラ距離 |
| `CAMERA_Y` | -200 | カメラのY位置（やや下から見上げる） |
| `SELECTED_LIFT_Y` | 120 | 選択時のY方向持ち上げ量 |
| `SELECTED_LIFT_Z` | 400 | 選択時のZ方向（手前に）持ち上げ量 |
| `HOVER_LIFT_Y` | 40 | ホバー時のY方向持ち上げ量 |

### 配置計算

```
N枚のカードを配置する場合:

arcDeg = min(FAN_ARC_DEGREES, N * 10)   // カード数に応じた弧角
arcRad = arcDeg * π / 180

i番目のカード (0-indexed):
  t = (i / (N-1)) - 0.5                  // -0.5 〜 0.5 に正規化
  θ = t * arcRad                          // 弧上の角度

  x = sin(θ) * FAN_RADIUS                // 左右位置
  y = cos(θ) * FAN_RADIUS + offset       // 上下位置（弧に沿う）
  z = -|t| * 60                           // 端カードは少し奥に

  rotZ = -θ                               // 弧の接線方向に傾く
  rotX = CARD_TILT_X (rad)                // 奥方向の微傾き
```

### ビジュアルイメージ

```
通常状態:

     ╱Card╲  ╱Card╲  ╱Card╲
   ╱Card╲                ╱Card╲

           ＼  pivot  ／

選択状態（中央カードをクリック）:

            ┌──────┐    ← 持ち上がり、正面を向く
            │ Card │
            │      │
            └──────┘
     ╱Card╲          ╱Card╲
   ╱Card╲                ╱Card╲
```

## インタラクション

### ホバー

- カードが`HOVER_LIFT_Y`(40px相当)浮き上がる
- ボーダーが`#e0e0e0` → `#000000`に変化
- `box-shadow: 0 4px 20px rgba(0,0,0,0.08)`を追加
- CSS transitionで滑らかに変化

### クリック（選択）

- カードが扇から飛び出し正面に大きく表示
  - Y方向: +120（上に持ち上げ）
  - Z方向: +400（手前に引き出し）
  - rotZ: 0に矯正（傾きなし、正面向き）
  - rotX: 0に矯正
- 再クリックで元の扇位置に戻る（トグル）
- ボーダー`#000000`、`box-shadow: 0 8px 32px rgba(0,0,0,0.12)`

### 入場アニメーション

ページ表示時にカードが下からスタガーして扇状に展開:

```
フレーム0:    全カードが画面下(y - 600 - i*80)にあり、rotZ = 0

フレーム1~N:  lerpで目標位置に向かって移動
              カードiはi*80分だけ遠い位置から始まるため
              到着タイミングがずれ、カスケード効果になる

完了:         全カードが扇位置に収まる
```

## アニメーション実装

### Lerpベースの補間

`requestAnimationFrame`ループ内でlerp（線形補間）を使用:

```typescript
const LERP_FACTOR = 0.08;  // 1フレームあたりの補間率

// 毎フレーム:
current.x += (target.x - current.x) * LERP_FACTOR;
current.y += (target.y - current.y) * LERP_FACTOR;
current.z += (target.z - current.z) * LERP_FACTOR;
// rotation同様
```

### 収束判定（省電力）

全カードが目標位置に到達（差分 < ε）したらレンダリングを一時停止:

```typescript
private isSettled(): boolean {
  const EPSILON = 0.1;
  return this.cards.every(card =>
    Math.abs(card.current.x - card.target.x) < EPSILON &&
    Math.abs(card.current.y - card.target.y) < EPSILON &&
    Math.abs(card.current.z - card.target.z) < EPSILON
  );
}
```

ホバーやクリックで再開。

## カードHTML/CSS設計

各カードはDOM要素としてCardFanクラス内で生成。既存Works.tsxのスタイルと同じデザイン言語を維持:

```
┌─────────────────────────┐
│ 2025                    │  ← 年（#888888, 14px）
│                         │
│ Fluid Calligraphy       │  ← タイトル（#000, 22px, bold）
│                         │
│ WebGL2による流体シミュ    │  ← 説明（#444, 14px）
│ レーションを用いた...     │
│                         │
│ ┌──────┐ ┌──────┐      │  ← 技術タグ（border, 11px）
│ │WebGL2│ │TS    │      │
│ └──────┘ └──────┘      │
└─────────────────────────┘
 280px × 380px
 padding: 32px
 border: 1px solid #e0e0e0
 background: #ffffff
```

## 既存コンポーネントとの関係

### DOM階層とz-index

```
HandwritingApp
  ├─ .page-content (z-index: 1)
  │    └─ Works
  │         ├─ header（React描画）
  │         └─ fanContainer
  │              └─ CSS3DRenderer.domElement（CardFanが生成）
  │                   └─ 各カードDOM要素
  ├─ InkCursor (z-index: 9999, pointer-events: none)
  └─ InkTransitionOverlay (z-index: 20)
```

- CardFanのDOM要素は`.page-content`内に収まるため、InkCursor/TransitionOverlayの下に自然配置
- ページ遷移時の`opacity`アニメーションはDOM階層で自動継承

### ページ遷移互換性

- `usePageTransition`のfadeOut/fadeIn時、CardFanのDOM要素は親の`opacity`変化に従う
- 特別な対応不要（初期実装時）

## 検証手順

1. `npm run dev` → ローカルサーバー起動
2. Worksページに遷移 → カードが下からスタガーして扇状に展開されることを確認
3. カードホバー → 浮き上がり＋ボーダー変化を確認
4. カードクリック → 前面に持ち上がり正面向きになることを確認
5. 同カード再クリック → 扇位置に戻ることを確認
6. ブラウザリサイズ → カードが再配置されることを確認
7. ← back → インク遷移エフェクトが正常に動作することを確認
8. 複数回ページ遷移 → メモリリークなし（disposeが正常に動作）を確認
