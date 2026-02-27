import { useEffect, useRef, type CSSProperties } from "react";
import { CardFan, type CardData } from "../utils/CardFan";

interface WorksProps {
  onNavigateHome: () => void;
}

const WORKS: CardData[] = [
  {
    title: "Fluid Calligraphy",
    description:
      "WebGL2による流体シミュレーションを用いたインタラクティブ書道表現",
    tech: ["WebGL2", "TypeScript", "React"],
    year: "2025",
  },
  {
    title: "Liquid Transitions",
    description: "GLSLシェーダーによるページ間の有機的なトランジション効果",
    tech: ["Three.js", "GLSL", "Vite"],
    year: "2024",
  },
  {
    title: "Generative Typography",
    description:
      "フォントデータを解析しストロークアニメーションを生成する実験的タイポグラフィ",
    tech: ["opentype.js", "Canvas API", "TypeScript"],
    year: "2024",
  },
];

const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#ffffff",
    padding: isMobile ? "40px 20px 0" : "80px 62px 0",
    fontFamily: "'Inter', sans-serif",
    color: "#000000",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: isMobile ? "16px" : "32px",
    marginBottom: isMobile ? "16px" : "32px",
  },
  backLink: {
    background: "none",
    border: "none",
    fontSize: isMobile ? "15px" : "18px",
    fontFamily: "'Inter', sans-serif",
    fontWeight: 500,
    color: "#000000",
    cursor: "pointer",
    padding: 0,
    textDecoration: "none",
  },
  title: {
    fontSize: isMobile ? "36px" : "64px",
    fontWeight: 700,
    margin: 0,
    lineHeight: "normal",
  },
  fanContainer: {
    flex: 1,
    position: "relative",
    minHeight: isMobile ? "350px" : "500px",
  },
};

export function Works({ onNavigateHome }: WorksProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fanRef = useRef<CardFan | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fan = new CardFan(container, WORKS);
    fanRef.current = fan;

    fan.onCardClick = (_index, data) => {
      console.log("Card clicked:", data.title);
    };

    const handleResize = () => fan.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      fan.dispose();
      fanRef.current = null;
    };
  }, []);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <a
          href="/"
          style={styles.backLink}
          onClick={(e) => {
            e.preventDefault();
            onNavigateHome();
          }}
        >
          ← back
        </a>
        <h1 style={styles.title}>Works</h1>
      </header>
      <div ref={containerRef} style={styles.fanContainer} />
    </div>
  );
}
