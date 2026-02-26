import type { CSSProperties } from "react";

interface WorksProps {
  onNavigateHome: () => void;
}

interface WorkItem {
  title: string;
  description: string;
  tech: string[];
  year: string;
}

const WORKS: WorkItem[] = [
  {
    title: "Fluid Calligraphy",
    description: "WebGL2による流体シミュレーションを用いたインタラクティブ書道表現",
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
    description: "フォントデータを解析しストロークアニメーションを生成する実験的タイポグラフィ",
    tech: ["opentype.js", "Canvas API", "TypeScript"],
    year: "2024",
  },
];

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#ffffff",
    padding: "80px 62px",
    fontFamily: "'Inter', sans-serif",
    color: "#000000",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "32px",
    marginBottom: "64px",
  },
  backLink: {
    background: "none",
    border: "none",
    fontSize: "18px",
    fontFamily: "'Inter', sans-serif",
    fontWeight: 500,
    color: "#000000",
    cursor: "pointer",
    padding: 0,
    textDecoration: "none",
  },
  title: {
    fontSize: "64px",
    fontWeight: 700,
    margin: 0,
    lineHeight: "normal",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
    gap: "40px",
  },
  card: {
    border: "1px solid #e0e0e0",
    padding: "32px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  year: {
    fontSize: "14px",
    fontWeight: 400,
    color: "#888888",
  },
  cardTitle: {
    fontSize: "24px",
    fontWeight: 700,
    margin: 0,
    lineHeight: "normal",
  },
  cardDesc: {
    fontSize: "15px",
    fontWeight: 400,
    color: "#444444",
    margin: 0,
    lineHeight: 1.6,
  },
  techRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  techTag: {
    fontSize: "12px",
    fontWeight: 500,
    color: "#666666",
    border: "1px solid #cccccc",
    padding: "4px 10px",
    borderRadius: "2px",
  },
};

export function Works({ onNavigateHome }: WorksProps) {
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
      <div style={styles.grid}>
        {WORKS.map((work, i) => (
          <article key={i} style={styles.card}>
            <span style={styles.year}>{work.year}</span>
            <h2 style={styles.cardTitle}>{work.title}</h2>
            <p style={styles.cardDesc}>{work.description}</p>
            <div style={styles.techRow}>
              {work.tech.map((t) => (
                <span key={t} style={styles.techTag}>
                  {t}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
