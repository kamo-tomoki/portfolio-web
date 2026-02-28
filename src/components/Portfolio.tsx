import type { CSSProperties } from "react";
import { SumiTextCanvas } from "./SumiTextCanvas";

interface PortfolioProps {
  onNavigateHome: () => void;
}

const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#ffffff",
    fontFamily: "'Inter', sans-serif",
    color: "#000000",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: isMobile ? "16px" : "32px",
    padding: isMobile ? "40px 20px 0" : "80px 62px 0",
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
  sumiCanvas: {
    flex: 1,
    minHeight: isMobile ? "300px" : "500px",
  },
};

export function Portfolio({ onNavigateHome }: PortfolioProps) {
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
      </header>
      <div style={styles.sumiCanvas}>
        <SumiTextCanvas />
      </div>
    </div>
  );
}
