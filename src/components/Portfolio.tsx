import { useRef, type CSSProperties } from "react";
import { SumiTextCanvas } from "./SumiTextCanvas";

interface PortfolioProps {
  onNavigateHome: () => void;
}

const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

const LINES = ["Software", "Engineer"];

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
  content: {
    flex: 1,
    position: "relative",
    minHeight: isMobile ? "300px" : "500px",
  },
  titleArea: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    position: "absolute",
    inset: 0,
    gap: isMobile ? "0.25em" : "0.35em",
  },
  titleLine: {
    display: "flex",
  },
  titleChar: {
    fontSize: isMobile ? "clamp(2rem, 10vw, 3.5rem)" : "clamp(3rem, 7vw, 7rem)",
    fontFamily: "'Inter', sans-serif",
    fontWeight: 700,
    lineHeight: 1.2,
    color: "#000",
  },
};

export function Portfolio({ onNavigateHome }: PortfolioProps) {
  const textRef = useRef<HTMLDivElement>(null);

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
      <div style={styles.content}>
        {/* HTML text — SumiTextCanvas reads positions from these spans */}
        <div ref={textRef} style={styles.titleArea}>
          {LINES.map((line, li) => (
            <div key={li} style={styles.titleLine}>
              {line.split("").map((ch, ci) => (
                <span
                  key={ci}
                  data-char={ch}
                  data-line={li}
                  data-ci={ci}
                  data-line-len={line.length}
                  style={styles.titleChar}
                >
                  {ch}
                </span>
              ))}
            </div>
          ))}
        </div>
        {/* Canvas overlay — draws sumi ink synced to text positions */}
        <SumiTextCanvas textRef={textRef} />
      </div>
    </div>
  );
}
